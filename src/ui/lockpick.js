import { el, keyBadge, show } from './kit.js';

// Lockpicking. Move the pick around the top of the lock (A/D or the mouse)
// and hold E (or W) to turn the cylinder. Near the sweet spot it turns all
// the way; elsewhere it stops early and the pick strains, then snaps. The
// sweet spot widens with the Lockpicking skill and perks.

export const LOCK_LEVELS = {
  novice: { name: 'Novice', width: 26, xp: 2 },
  apprentice: { name: 'Apprentice', width: 16, xp: 3 },
  adept: { name: 'Adept', width: 9, xp: 5 },
  expert: { name: 'Expert', width: 5, xp: 7 },
};

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

export class LockpickScreen {
  constructor(root, { game, input, onDone }) {
    this.root = el('div', 'ui rpg-screen ui-fade ui-off', null, root);
    this.root.id = 'lockpick';
    Object.assign(this, { game, input, onDone });
    const info = el('div', 'info', null, this.root);
    this.lv = el('div', 'lv', '', info);
    this.ct = el('div', 'ct', '', info);
    const s = svg('svg', { viewBox: '-120 -120 240 240' }, this.root);
    svg('circle', { r: 100, fill: 'rgba(0,0,0,0.35)', stroke: 'rgba(232,228,218,0.45)', 'stroke-width': 1 }, s);
    svg('circle', { r: 92, fill: 'none', stroke: 'rgba(232,228,218,0.15)', 'stroke-width': 1 }, s);
    this.cyl = svg('g', {}, s);
    svg('circle', { r: 46, fill: 'rgba(20,18,16,0.85)', stroke: 'rgba(232,228,218,0.6)', 'stroke-width': 1 }, this.cyl);
    svg('path', { d: 'M -7 -14 A 9 9 0 1 1 7 -14 L 4 18 L -4 18 Z', fill: '#050404', stroke: 'rgba(232,228,218,0.5)', 'stroke-width': 0.8 }, this.cyl);
    // tension wrench at the bottom, turning with the cylinder
    svg('path', { d: 'M 0 16 L 0 60 L 22 60', fill: 'none', stroke: 'rgba(200,196,188,0.9)', 'stroke-width': 3, 'stroke-linecap': 'round' }, this.cyl);
    this.pick = svg('g', {}, s);
    svg('line', { x1: 0, y1: -6, x2: 0, y2: -116, stroke: '#d8d4cc', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, this.pick);
    svg('line', { x1: 0, y1: -6, x2: -6, y2: 2, stroke: '#d8d4cc', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, this.pick);
    s.addEventListener('mousemove', (e) => {
      const r = s.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * 2 - 1;
      this.angle = Math.max(-90, Math.min(90, x * 110));
    });
    s.addEventListener('mousedown', () => { this.mouseTurn = true; });
    addEventListener('mouseup', () => { this.mouseTurn = false; });
    const hint = el('div', 'rpg-hint', null, this.root);
    for (const [k, t] of [['A/D', 'Move pick'], ['E', 'Hold to turn'], ['ESC', 'Stop']]) { keyBadge(k, hint); el('span', '', t, hint); }
    this.open = false;
  }

  /** container: state with .locked level. */
  show(container) {
    this.c = container;
    this.level = LOCK_LEVELS[container.locked] ?? LOCK_LEVELS.novice;
    const g = this.game, ch = g.character;
    let w = this.level.width * (1 + Math.min(100, ch.skill('lockpicking')) / 100 * 0.8);
    if (['novice', 'apprentice'].includes(container.locked)) w *= 1 + ch.mod('lock.easy');
    this.width = w;
    this.sweet = (Math.random() * 2 - 1) * 75;
    this.angle = 0;
    this.turn = 0;
    this.strain = 0;
    this.pickHealth = 1;
    this.open = true;
    this.result = null;
    this.lv.textContent = `${this.level.name.toUpperCase()} LOCK`;
    this.counter();
    show(this.root, true);
    this.draw();
  }

  hide() { this.open = false; show(this.root, false); }
  counter() { this.ct.textContent = `LOCKPICKS: ${this.game.inventory.count('lockpick')}`; }

  update(dt) {
    if (!this.open || this.result) return;
    const inp = this.input;
    if (inp.down('KeyA', 'ArrowLeft')) this.angle = Math.max(-90, this.angle - dt * 70);
    if (inp.down('KeyD', 'ArrowRight')) this.angle = Math.min(90, this.angle + dt * 70);
    const turning = inp.down('KeyE', 'KeyW', 'ArrowUp') || this.mouseTurn;
    const d = Math.abs(this.angle - this.sweet);
    const allowed = d <= this.width ? 1 : Math.max(0, 1 - (d - this.width) / (this.width * 2.5 + 22));
    if (turning) {
      this.turn = Math.min(allowed, this.turn + dt * 1.8);
      if (this.turn >= 1) { this.succeed(); return; }
      if (this.turn >= allowed - 1e-3) {
        // straining against the pins
        this.strain += dt;
        this.pickHealth -= dt * (this.game.character.mod('lock.durability') ? 0.55 : 1.1);
        if (this.pickHealth <= 0) this.breakPick();
      }
    } else {
      this.turn = Math.max(0, this.turn - dt * 3);
      this.strain = 0;
    }
    this.draw();
  }

  draw() {
    const shake = this.strain > 0 ? (Math.random() - 0.5) * 3 : 0;
    this.cyl.setAttribute('transform', `rotate(${this.turn * 90})`);
    this.pick.setAttribute('transform', `rotate(${this.angle + shake + this.turn * 90 * 0.2})`);
  }

  succeed() {
    const g = this.game;
    this.result = 'open';
    g.character.useSkill('lockpicking', this.level.xp);
    this.c.locked = null;
    this.c.unlocked = true;
    g.audio?.play('unlock');
    setTimeout(() => this.onDone(true), 350);
  }

  breakPick() {
    const g = this.game;
    g.inventory.remove('lockpick', 1);
    g.character.useSkill('lockpicking', 0.25);
    g.audio?.play('pickbreak');
    g.ui?.hud.toast('The lockpick snapped');
    this.counter();
    this.pickHealth = 1;
    this.turn = 0;
    this.strain = 0;
    if (!g.inventory.has('lockpick')) { this.result = 'out'; setTimeout(() => this.onDone(false), 600); }
  }

  key(e) {
    if (e.code === 'Escape' || e.code === 'Tab') { this.onDone(false); return true; }
    return true; // everything else is read from held keys in update()
  }
}
