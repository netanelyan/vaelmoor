import { show } from './kit.js';
import { HUD } from './hud.js';
import { DialogueScreen } from './dialogue.js';
import { PauseMenu, SettingsScreen } from './menus.js';
import { JournalScreen } from './journal.js';
import { TitleScreen, driftCamera } from './title.js';
import { settings } from '../game/settings.js';
import { load, save } from '../game/store.js';

// Game flow + UI: title -> play <-> pause / journal / settings / dialogue.
// Owns input routing for the screens and pointer lock; the render loop asks
// `simulating` whether to advance the world.

export class GameUI {
  constructor(ctx) {
    Object.assign(this, ctx); // input, canvas, camera, player, world, region, quests, vitals, dialogues, photo
    const root = document.getElementById('ui');
    this.hud = new HUD(root);
    this.title = new TitleScreen(root);
    this.dialogue = new DialogueScreen(root, {
      onEffect: (fx) => this.quests.apply(fx),
      onClose: () => this.setState('play'),
    });
    this.pause = new PauseMenu(root, { onChoose: (v) => this.pauseChoice(v) });
    this.settingsScreen = new SettingsScreen(root, { onBack: () => this.setState('pause') });
    this.journal = new JournalScreen(root, {
      quests: this.quests,
      onClose: () => this.setState(this.journalFrom || 'play'),
      onTrack: (id) => { this.quests.tracked = id; },
    });
    this.state = 'loading';
    this.titleTime = 0;
    this.target = null;
    this.ignoreUnlock = false;

    this.quests.onChange((e) => this.onQuestEvent(e));
    this.input.on('keydown', (e) => this.onKey(e));
    this.input.on('lock', (locked) => {
      // Esc releases pointer lock in the browser: treat that as "pause"
      if (!locked && this.state === 'play' && !this.ignoreUnlock) this.setState('pause');
      this.ignoreUnlock = false;
    });
    this.canvas.addEventListener('click', () => {
      if (this.state === 'title') this.startGame();
      else if (this.state === 'play' && !this.input.locked) this.lock();
    });
    settings.onChange((k, v) => { if (k === 'showFps') this.hud.setFps(v); });
  }

  // ------------------------------------------------------------ states
  get simulating() { return this.state === 'play' || this.state === 'dialogue' || this.state === 'title' || this.state === 'photo'; }
  get playerControl() { return this.state === 'play'; }

  setState(s) {
    const prev = this.state;
    this.state = s;
    this.title[s === 'title' ? 'show' : 'hide']();
    if (s !== 'pause') this.pause.hide();
    if (s !== 'settings') this.settingsScreen.hide();
    if (s !== 'journal') this.journal.hide();
    this.hud.setVisible(s === 'play' || s === 'dialogue');
    show(this.hud.crosshair, s === 'play');
    show(this.hud.compass, s === 'play');
    if (s === 'play') { this.lock(); this.camera.fov = settings.get('fov'); this.camera.updateProjectionMatrix(); }
    else if (prev === 'play' && s !== 'photo') this.unlock();
    if (s === 'pause') this.pause.show(!!load('save1'));
    if (s === 'settings') this.settingsScreen.show();
    if (s === 'journal') this.journal.show();
    if (s === 'title') this.unlock();
  }

  lock() { if (!this.input.locked) this.input.requestLock(); }
  unlock() {
    if (document.pointerLockElement) { this.ignoreUnlock = true; document.exitPointerLock(); }
  }

  showTitle() { this.titleTime = 0; this.setState('title'); }

  startGame() {
    this.setState('play');
    this.hud.setFps(settings.get('showFps'));
    if (!this.started) {
      this.started = true;
      const q = this.quests.trackedQuest();
      if (q) setTimeout(() => this.hud.questNote('QUEST STARTED', q.title), 600);
    }
  }

  // ------------------------------------------------------------ input
  onKey(e) {
    if (e.code === 'F3') { settings.set('showFps', !settings.get('showFps')); e.preventDefault?.(); return; }
    switch (this.state) {
      case 'title':
        if (!/^Digit|^F\d/.test(e.code)) this.startGame();
        return;
      case 'play':
        if (e.code === 'Escape') this.setState('pause');
        else if (e.code === 'KeyJ' || e.code === 'Tab') { e.preventDefault?.(); this.journalFrom = 'play'; this.setState('journal'); }
        else if (e.code === 'KeyE' && this.target) this.use(this.target);
        return;
      case 'pause':
        if (e.code === 'Escape' || e.code === 'Tab') this.setState('play');
        else this.pause.key(e);
        return;
      case 'settings': this.settingsScreen.key(e); return;
      case 'journal': e.preventDefault?.(); this.journal.key(e); return;
      case 'dialogue': e.preventDefault?.(); this.dialogue.key(e); return;
      default:
    }
  }

  pauseChoice(v) {
    if (v === 'resume') this.setState('play');
    else if (v === 'journal') { this.journalFrom = 'pause'; this.setState('journal'); }
    else if (v === 'settings') this.setState('settings');
    else if (v === 'save') { this.saveGame(); this.setState('play'); this.hud.toast('Game saved'); }
    else if (v === 'load') { if (this.loadGame()) { this.setState('play'); this.hud.toast('Game loaded'); } }
    else if (v === 'quit') this.showTitle();
  }

  // ------------------------------------------------------------ world interaction
  use(t) {
    if (t.kind === 'npc') {
      const d = this.dialogues[t.id];
      if (!d) return;
      this.quests.notify('talk', t.id);
      this.setState('dialogue');
      this.dialogue.start(d, (item) => this.quests.has(item));
    } else if (t.kind === 'item') {
      t.enabled = false;
      if (t.object) t.object.visible = false;
      this.quests.notify('take', t.id);
      this.hud.toast(`${t.name} added`);
    } else if (t.kind === 'door') {
      this.hud.toast('The door is barred from within');
    }
  }

  onQuestEvent(e) {
    if (e.type === 'objective' && e.quest.status === 'active') {
      const next = this.quests.current(e.quest);
      if (next) this.hud.questNote(e.quest.title.toUpperCase(), next.text);
    } else if (e.type === 'quest-complete') {
      this.hud.questNote('QUEST COMPLETED', e.quest.title);
    }
  }

  /** Per-frame HUD work while playing. */
  update(dt, t) {
    if (this.state === 'title') {
      this.titleTime += dt;
      const T = this.region.title;
      if (T) driftCamera(this.camera, T.keys, this.titleTime, T.secondsPerKey);
      return;
    }
    if (this.state !== 'play' && this.state !== 'dialogue') return;
    const p = this.player.pos;
    // discovery
    for (const a of this.region.areas) {
      if (this.quests.discovered.has(a.id)) continue;
      const d = Math.hypot(p.x - a.center[0], p.z - a.center[1]);
      if (d < (a.discoverRadius ?? (a.reach ?? 60) * 0.6)) {
        this.quests.notify('discover', a.id);
        this.hud.discover(a.name);
      }
    }
    // interaction target
    this.target = this.state === 'play' ? this.world.interactables.target(this.camera) : null;
    this.hud.setPrompt(this.target);
    // compass
    const heading = (-this.player.yaw * 180) / Math.PI;
    const markers = [];
    for (const a of this.region.areas) {
      const d = Math.hypot(p.x - a.center[0], p.z - a.center[1]);
      if (d < 260) markers.push({ id: `area:${a.id}`, x: a.center[0], z: a.center[1], kind: this.quests.discovered.has(a.id) ? 'known' : 'place' });
    }
    const q = this.quests.trackedQuest();
    const o = q && this.quests.current(q);
    const tp = o && this.objectivePos(o);
    if (tp) {
      // the quest arrow replaces any place marker in the same direction
      const qb = Math.atan2(tp[0] - p.x, -(tp[1] - p.z));
      for (let i = markers.length - 1; i >= 0; i--) {
        const m = markers[i];
        const d = Math.abs(((Math.atan2(m.x - p.x, -(m.z - p.z)) - qb + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (d < 0.06) markers.splice(i, 1);
      }
      markers.push({ id: 'quest', x: tp[0], z: tp[1], kind: 'quest' });
    }
    this.hud.updateCompass(heading, p.x, p.z, markers);
    this.hud.updateVitals(this.vitals, dt);
  }

  objectivePos(o) {
    if (o.type === 'discover') return this.region.areas.find((a) => a.id === o.target)?.center;
    const it = this.world.interactables.list.find((x) => x.id === o.target && x.enabled);
    if (it) return [it.pos.x, it.pos.z];
    if (o.type === 'talk') { // the item was handed over elsewhere: point at the npc
      const n = this.world.interactables.list.find((x) => x.id === o.target);
      return n ? [n.pos.x, n.pos.z] : null;
    }
    return null;
  }

  // ------------------------------------------------------------ save / load
  saveGame() {
    const pl = this.player;
    save('save1', { pos: [pl.pos.x, pl.pos.z], yaw: pl.yaw, pitch: pl.pitch, quests: this.quests.toJSON(), vitals: this.vitals.toJSON(), taken: this.world.interactables.list.filter((x) => x.kind === 'item' && !x.enabled).map((x) => x.id) });
  }

  loadGame() {
    const s = load('save1');
    if (!s) return false;
    this.player.teleport(s.pos[0], s.pos[1], s.yaw, s.pitch);
    this.quests.restore(s.quests);
    this.vitals.restore(s.vitals);
    for (const it of this.world.interactables.list) {
      if (it.kind !== 'item') continue;
      it.enabled = !s.taken.includes(it.id);
      if (it.object) it.object.visible = it.enabled;
    }
    this.started = true;
    return true;
  }
}

