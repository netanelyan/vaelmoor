import { el, rule, keyBadge, show, flash } from './kit.js';

// In-game HUD: compass, vitals, crosshair, interaction prompt, discovery
// popup, quest notes, toast and the F3 FPS readout. Quiet by default: bars
// and prompts only appear when they have something to say.

const SPAN = 180; // degrees of heading visible across the compass
const CARDINALS = [['N', 0], ['NE', 45, 1], ['E', 90], ['SE', 135, 1], ['S', 180], ['SW', 225, 1], ['W', 270], ['NW', 315, 1]];

const wrapDeg = (d) => ((d + 540) % 360) - 180;

export class HUD {
  constructor(root) {
    this.root = el('div', 'hud-root ui', null, root);
    this.root.id = 'hud';

    // compass
    this.compass = el('div', 'compass', null, this.root);
    el('div', 'band', null, this.compass);
    el('div', 'line top', null, this.compass);
    el('div', 'line', null, this.compass);
    this.cardinals = CARDINALS.map(([t, deg, minor]) => ({ deg, e: el('div', `cardinal${minor ? ' minor' : ''}`, t, this.compass) }));
    this.ticks = [];
    for (let d = 0; d < 360; d += 15) if (d % 45) this.ticks.push({ deg: d, e: el('div', 'tick', null, this.compass) });
    this.markers = new Map();

    this.crosshair = el('div', 'crosshair', null, this.root);

    // interaction prompt
    this.prompt = el('div', 'prompt ui-fade ui-off', null, this.root);
    this.promptName = el('div', 'name ui-caps', '', this.prompt);
    const act = el('div', 'action', null, this.prompt);
    this.promptKey = keyBadge('E', act);
    this.promptAction = el('span', '', '', act);

    // vitals: magicka left, health centre, stamina right
    this.vitals = el('div', 'vitals', null, this.root);
    this.bars = {};
    for (const k of ['magicka', 'health', 'stamina']) {
      const b = el('div', `bar ${k} ui-fade-slow ui-off`, null, this.vitals);
      el('div', 'frame', null, b);
      const fill = el('div', 'fill', null, b);
      this.bars[k] = { b, fill, shownFor: 0 };
    }

    // discovery popup
    this.discovered = el('div', 'discovered ui-fade-slow ui-off', null, this.root);
    el('div', 'label', 'DISCOVERED', this.discovered);
    rule({ diamond: true }, this.discovered);
    this.discoveredName = el('div', 'place', '', this.discovered);

    this.note = el('div', 'objective-note ui-fade-slow ui-off', null, this.root);
    this.noteLabel = el('div', 'label', '', this.note);
    this.noteText = el('div', 'text', '', this.note);

    this.toastEl = el('div', 'toast ui-fade ui-off', '', this.root);
    this.fps = el('div', 'fps ui ui-off', '', root);
    this.photo = el('div', 'photo-label ui', '', root);
  }

  setVisible(on) { show(this.root, on); }

  /** markers: [{ id, x, z, kind: 'place' | 'known' | 'quest' }] */
  updateCompass(heading, px, pz, markers) {
    const w = this.compass.clientWidth;
    const place = (e, deg) => {
      const d = wrapDeg(deg - heading);
      const vis = Math.abs(d) < SPAN / 2;
      e.style.display = vis ? '' : 'none';
      if (vis) e.style.left = `${(0.5 + d / SPAN) * w}px`;
    };
    for (const c of this.cardinals) place(c.e, c.deg);
    for (const t of this.ticks) place(t.e, t.deg);
    const seen = new Set();
    for (const m of markers) {
      seen.add(m.id);
      let e = this.markers.get(m.id);
      if (!e) { e = el('div', 'mark', null, this.compass); this.markers.set(m.id, e); }
      e.className = `mark ${m.kind}`;
      const bearing = (Math.atan2(m.x - px, -(m.z - pz)) * 180) / Math.PI;
      place(e, bearing);
    }
    for (const [id, e] of this.markers) if (!seen.has(id)) { e.remove(); this.markers.delete(id); }
  }

  updateVitals(v, dt) {
    for (const k of ['health', 'magicka', 'stamina']) {
      const bar = this.bars[k];
      const val = v[k];
      bar.fill.style.width = `${(val * 100).toFixed(1)}%`;
      // visible while not full or in combat, then linger briefly and fade
      if (val < 0.999 || v.combat) bar.shownFor = 1.5;
      else bar.shownFor -= dt;
      show(bar.b, bar.shownFor > 0);
    }
  }

  setPrompt(target) {
    if (!target) { show(this.prompt, false); return; }
    this.promptName.textContent = target.name;
    this.promptAction.textContent = target.action;
    show(this.prompt, true);
  }

  discover(name) {
    this.discoveredName.textContent = name;
    flash(this.discovered, 4200);
  }

  questNote(label, text) {
    this.noteLabel.textContent = label;
    this.noteText.textContent = text;
    flash(this.note, 5000);
  }

  toast(text, ms = 2200) {
    this.toastEl.textContent = text;
    flash(this.toastEl, ms);
  }

  setFps(on, text = '') {
    show(this.fps, on);
    if (on) this.fps.textContent = text;
  }
}
