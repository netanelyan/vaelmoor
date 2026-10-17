import { show } from './kit.js';
import { HUD } from './hud.js';
import { DialogueScreen } from './dialogue.js';
import { PauseMenu, SettingsScreen, PhotoMenu } from './menus.js';
import { JournalScreen } from './journal.js';
import { TitleScreen, driftCamera } from './title.js';
import { InventoryScreen } from './inventory.js';
import { TransferScreen } from './transfer.js';
import { SkillsScreen } from './skills.js';
import { FavoritesScreen, TabMenu, BookScreen } from './panels.js';
import { LockpickScreen, LOCK_LEVELS } from './lockpick.js';
import { settings } from '../game/settings.js';
import { load, save } from '../game/store.js';

// Game flow + UI: title -> play <-> pause / journal / settings / dialogue /
// inventory / magic / skills / favorites / transfer / lockpick / book.
// Owns input routing for the screens and pointer lock; the render loop asks
// `simulating` whether to advance the world.

const MENU_STATES = ['inventory', 'magic', 'skills', 'favorites', 'tabmenu', 'transfer', 'lockpick', 'book'];

export class GameUI {
  constructor(ctx) {
    Object.assign(this, ctx); // input, canvas, camera, player, realm, quests, game, dialogues, photo, realms
    this.game.ui = this;
    const root = document.getElementById('ui');
    this.hud = new HUD(root);
    this.title = new TitleScreen(root);
    this.dialogue = new DialogueScreen(root, {
      onEffect: (fx) => this.effect(fx),
      onClose: () => { if (this.state === 'dialogue') this.setState('play'); },
      check: (o) => this.game.speechCheck?.(o) ?? true,
    });
    this.pause = new PauseMenu(root, { onChoose: (v) => this.pauseChoice(v) });
    this.settingsScreen = new SettingsScreen(root, { onBack: () => this.setState('pause') });
    this.journal = new JournalScreen(root, {
      quests: this.quests,
      onClose: () => this.setState(this.journalFrom || 'play'),
      onTrack: (id) => { this.quests.tracked = id; },
    });
    this.photoMenu = new PhotoMenu(root, { onChoose: (id) => this.onPhoto?.(id), onBack: () => this.setState('play') });
    const back = () => this.setState('play');
    this.inventory = new InventoryScreen(root, { game: this.game, onClose: back });
    this.transfer = new TransferScreen(root, { game: this.game, onClose: back });
    this.skills = new SkillsScreen(root, { game: this.game, onClose: back });
    this.favorites = new FavoritesScreen(root, { game: this.game, onClose: back });
    this.tabmenu = new TabMenu(root, { onChoose: (k) => this.setState(k === 'items' ? 'inventory' : k), onClose: back, enabled: (k) => k !== 'map' || !!this.mapScreen });
    this.lockpick = new LockpickScreen(root, { game: this.game, input: this.input, onDone: (ok) => this.lockDone(ok) });
    this.book = new BookScreen(root, { onClose: () => this.setState(this.bookFrom || 'play') });
    this.state = 'loading';
    this.titleTime = 0;
    this.target = null;
    this.ignoreUnlock = false;

    this.quests.onChange((e) => this.onQuestEvent(e));
    this.game.on((e) => this.onGameEvent(e));
    this.game.inventory.on((e) => {
      if (e.type === 'add' && this.state !== 'loading') {
        const d = this.game.items.get(e.id);
        this.hud.logLine(e.n > 1 ? `${d.name} (${e.n}) added` : `${d.name} added`);
      }
    });
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

  get world() { return this.realm.world; }
  get region() { return this.realm.region; }
  setRealm(r) { this.realm = r; }

  // ------------------------------------------------------------ states
  get simulating() { return ['play', 'dialogue', 'title', 'photo'].includes(this.state); }
  get playerControl() { return this.state === 'play'; }

  setState(s) {
    const prev = this.state;
    this.state = s;
    this.title[s === 'title' ? 'show' : 'hide']();
    if (s !== 'pause') this.pause.hide();
    if (s !== 'settings') this.settingsScreen.hide();
    if (s !== 'journal') this.journal.hide();
    if (s !== 'photomenu') this.photoMenu.hide();
    if (s !== 'inventory' && s !== 'magic') this.inventory.hide();
    if (s !== 'transfer') this.transfer.hide();
    if (s !== 'skills') this.skills.hide();
    if (s !== 'favorites') this.favorites.hide();
    if (s !== 'tabmenu') this.tabmenu.hide();
    if (s !== 'lockpick') this.lockpick.hide();
    if (s !== 'book') this.book.hide();
    if (s !== 'map') this.mapScreen?.hide();
    if (s === 'photomenu') this.photoMenu.show(this.photo.list());
    this.hud.setVisible(s === 'play' || s === 'dialogue' || s === 'favorites');
    show(this.hud.crosshair, s === 'play');
    show(this.hud.compass, s === 'play');
    if (s === 'play') { this.lock(); this.camera.fov = settings.get('fov'); this.camera.updateProjectionMatrix(); }
    else if (prev === 'play' && s !== 'photo') this.unlock();
    if (s === 'pause') this.pause.show(!!load('save1'));
    if (s === 'settings') this.settingsScreen.show();
    if (s === 'journal') this.journal.show();
    if (s === 'inventory') this.inventory.show('items');
    if (s === 'magic') this.inventory.show('magic');
    if (s === 'skills') this.skills.show();
    if (s === 'favorites') this.favorites.show();
    if (s === 'tabmenu') this.tabmenu.show();
    if (s === 'map') this.mapScreen?.show();
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
      if (!this.loaded) this.game.newGame();
      const q = this.quests.trackedQuest();
      if (q) setTimeout(() => this.hud.questNote('QUEST STARTED', q.title), 600);
    }
  }

  // ------------------------------------------------------------ input
  onKey(e) {
    if (e.code === 'F3') { settings.set('showFps', !settings.get('showFps')); e.preventDefault?.(); return; }
    if (e.code === 'F2' && ['play', 'photo'].includes(this.state)) { e.preventDefault?.(); this.setState('photomenu'); return; }
    if (e.code === 'Tab') e.preventDefault?.();
    switch (this.state) {
      case 'title':
        if (!/^Digit|^F\d/.test(e.code)) this.startGame();
        return;
      case 'play': {
        const open = { Escape: 'pause', KeyJ: 'journal', KeyI: 'inventory', KeyP: 'magic', KeyK: 'skills', KeyQ: 'favorites', Tab: 'tabmenu', KeyM: 'map' }[e.code];
        if (open === 'journal') this.journalFrom = 'play';
        if (open === 'map' && !this.mapScreen) return;
        if (open) { this.setState(open); return; }
        if (e.code === 'KeyE' && this.target) this.use(this.target);
        else if (e.code === 'KeyR') this.combat?.toggleDraw();
        else this.combat?.key(e);
        return;
      }
      case 'pause':
        if (e.code === 'Escape' || e.code === 'Tab') this.setState('play');
        else this.pause.key(e);
        return;
      case 'settings': this.settingsScreen.key(e); return;
      case 'photomenu': this.photoMenu.key(e); return;
      case 'journal': e.preventDefault?.(); this.journal.key(e); return;
      case 'dialogue': e.preventDefault?.(); this.dialogue.key(e); return;
      case 'inventory': case 'magic': this.inventory.key(e); return;
      case 'transfer': this.transfer.key(e); return;
      case 'skills': this.skills.key(e); return;
      case 'favorites': this.favorites.key(e); return;
      case 'tabmenu': this.tabmenu.key(e); return;
      case 'lockpick': this.lockpick.key(e); return;
      case 'book': this.book.key(e); return;
      case 'map': this.mapScreen?.key(e); return;
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
  /** What the prompt says for a target. */
  describe(t) {
    if (t.kind === 'container') {
      const c = this.game.containers.get(t.container);
      const steal = this.game.isOwnedByOther(c);
      if (c.locked) return { name: t.name, action: steal ? 'Unlock (crime)' : 'Unlock', sub: `${LOCK_LEVELS[c.locked]?.name ?? 'Locked'} lock`, steal };
      return { name: t.name, action: steal ? 'Steal from' : 'Search', steal };
    }
    if (t.kind === 'pickup' && t.owner && !this.game.flags[`owns:${t.id}`]) return { name: t.name, action: 'Steal', steal: true };
    return t;
  }

  use(t) {
    const g = this.game;
    if (t.kind === 'npc') {
      const d = this.dialogues[t.id];
      if (!d) return;
      this.quests.notify('talk', t.id);
      this.talkingTo = t;
      this.setState('dialogue');
      this.dialogue.start(d, (item) => this.quests.has(item) || g.inventory.has(item), (flag) => !!g.flags[flag]);
    } else if (t.kind === 'container') {
      const c = g.containers.get(t.container);
      if (c.locked) {
        if (!g.inventory.has('lockpick')) { this.hud.toast('You have no lockpicks'); return; }
        this.lockTarget = t;
        this.setState('lockpick');
        this.lockpick.show(c);
        return;
      }
      g.containers.open(t.container);
      g.audio?.play('open');
      this.setState('transfer');
      this.transfer.show(c);
    } else if (t.kind === 'pickup') {
      g.takePickup(t);
      this.quests.notify('take', t.item);
      if (t.owner) g.notify({ type: 'theft', item: t.item, owner: t.owner });
    } else if (t.kind === 'item') {
      t.enabled = false;
      if (t.object) t.object.visible = false;
      this.quests.notify('take', t.id);
      this.hud.toast(`${t.name} added`);
    } else if (t.kind === 'door') {
      this.hud.toast('The door is barred from within');
    } else if (t.onUse) t.onUse(this);
  }

  lockDone(ok) {
    if (ok && this.lockTarget) { this.setState('play'); this.use(this.lockTarget); }
    else this.setState('play');
    this.lockTarget = null;
  }

  openBook(def) {
    this.bookFrom = this.state === 'play' ? 'play' : this.state;
    this.setState('book');
    this.book.show(def);
  }

  /** Dialogue / script effects: "objective:q.o", "track:q", "barter:ysolde", "gold:+20", "give:item", "flag:name"... */
  effect(fx) {
    const [kind, arg] = fx.split(/:(.*)/s);
    const g = this.game;
    switch (kind) {
      case 'barter':
        this.dialogue.close();
        this.setState('transfer');
        this.transfer.show(g.containers.merchant(arg), { barter: true, title: this.talkingTo?.name ?? arg });
        return;
      case 'gold': g.inventory.gold = Math.max(0, g.inventory.gold + parseInt(arg, 10)); g.audio?.play('coins'); return;
      case 'give': { const [id, n] = arg.split('*'); g.inventory.add(id, +(n ?? 1)); return; }
      case 'take': { const [id, n] = arg.split('*'); g.inventory.remove(id, +(n ?? 1)); return; }
      case 'flag': g.flags[arg] = true; return;
      case 'unflag': delete g.flags[arg]; return;
      default: this.quests.apply(fx);
    }
  }

  onGameEvent(e) {
    if (e.type === 'skill-up') this.hud.skillUp(e.name, e.level, this.game.character.progress(e.skill));
    else if (e.type === 'level-up') setTimeout(() => this.hud.levelUp(e.level), 1200);
    else if (e.type === 'log') this.hud.logLine(e.text);
  }

  onQuestEvent(e) {
    if (e.type === 'objective' && e.quest.status === 'active') {
      const next = this.quests.current(e.quest);
      if (next) this.hud.questNote(e.quest.title.toUpperCase(), next.text);
    } else if (e.type === 'quest-complete') {
      this.hud.questNote('QUEST COMPLETED', e.quest.title);
    }
  }

  /** Every frame, simulating or not: menus with their own motion. */
  menus(dt) {
    this.inventory.update(dt);
    this.transfer.update(dt);
    this.lockpick.update(dt);
    this.mapScreen?.update?.(dt);
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
    this.hud.setPrompt(this.target ? this.describe(this.target) : null);
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
    for (const m of this.extraMarkers?.() ?? []) markers.push(m);
    this.hud.updateCompass(heading, p.x, p.z, markers);
    this.hud.updateVitals(this.game.character, dt);
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
  saveGame(slot = 'save1') {
    const pl = this.player;
    save(slot, {
      v: 2, realm: this.realm.id, pos: [pl.pos.x, pl.pos.z], yaw: pl.yaw, pitch: pl.pitch,
      quests: this.quests.toJSON(), game: this.game.toJSON(), extra: this.saveExtra?.() ?? null,
      taken: Object.values(this.realms).flatMap((r) => r.world.interactables.list.filter((x) => x.kind === 'item' && !x.enabled).map((x) => x.id)),
    });
  }

  loadGame(slot = 'save1') {
    const s = load(slot);
    if (!s) return false;
    if (s.realm && s.realm !== this.realm.id) this.switchRealm?.(s.realm);
    this.player.teleport(s.pos[0], s.pos[1], s.yaw, s.pitch);
    this.quests.restore(s.quests);
    if (s.game) this.game.loadState(s.game, this.realms);
    else this.game.newGame();
    for (const r of Object.values(this.realms)) {
      for (const it of r.world.interactables.list) {
        if (it.kind !== 'item') continue;
        it.enabled = !s.taken.includes(it.id);
        if (it.object) it.object.visible = it.enabled;
      }
    }
    this.loadExtra?.(s.extra);
    this.started = true;
    this.loaded = true;
    return true;
  }
}
