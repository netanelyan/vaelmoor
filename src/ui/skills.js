import { el, rule, keyBadge, show, List } from './kit.js';
import { mulberry32 } from '../engine/noise.js';

// Skills (K): every skill's perks drawn as a constellation in a night sky.
// The skills run along the bottom (A/D), the selected skill's stars above
// (W/S picks a perk, E takes it). A pending level-up asks for +10 health,
// magicka or stamina before anything else.

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

export class SkillsScreen {
  constructor(root, { game, onClose }) {
    this.root = el('div', 'ui rpg-screen ui-fade ui-off', null, root);
    this.root.id = 'skills';
    Object.assign(this, { game, onClose });
    // fixed background stars
    const stars = svg('svg', { class: 'stars', viewBox: '0 0 1000 1000', preserveAspectRatio: 'none' }, this.root);
    const rand = mulberry32(42);
    for (let i = 0; i < 260; i++) svg('circle', { cx: rand() * 1000, cy: rand() * 820, r: 0.6 + rand() * 1.4, fill: `rgba(232,228,218,${0.08 + rand() * 0.32})` }, stars);
    const top = el('div', 'top', null, this.root);
    this.lvl = el('div', 'lvl', '', top);
    const xp = el('div', 'xp', null, top);
    this.xpFill = el('i', '', null, xp);
    this.pts = el('div', 'pts', '', top);
    this.sky = svg('svg', { class: 'sky', viewBox: '0 0 600 400' }, this.root);
    this.cname = el('div', 'cname', '', this.root);
    const perk = el('div', 'perk', null, this.root);
    this.pn = el('div', 'pn', '', perk);
    this.pd = el('div', 'pd', '', perk);
    this.pr = el('div', 'pr', '', perk);
    this.strip = el('div', 'strip', null, this.root);
    this.hint = el('div', 'rpg-hint', null, this.root);
    for (const [k, t] of [['A/D', 'Skill'], ['W/S', 'Perk'], ['E', 'Take perk'], ['ESC', 'Close']]) { keyBadge(k, this.hint); el('span', '', t, this.hint); }
    // level-up chooser
    this.lu = el('div', 'levelup interactive ui-off', null, this.root);
    el('div', 'lh', 'LEVEL UP', this.lu);
    this.luLevel = el('div', 'll', '', this.lu);
    rule({ diamond: true }, this.lu);
    el('div', 'lh', 'CHOOSE WHAT TO INCREASE', this.lu);
    this.luList = new List(this.lu, { marker: false, onChoose: (it) => this.chooseStat(it.value) });
    this.skill = 0;
    this.perkIdx = 0;
    this.open = false;
  }

  show() {
    this.open = true;
    this.build();
    show(this.root, true);
    this.levelUp();
  }
  hide() { this.open = false; show(this.root, false); }

  levelUp() {
    const ch = this.game.character;
    const on = ch.pendingLevelUps > 0;
    show(this.lu, on);
    this.root.classList.toggle('choosing', on);
    if (!on) return;
    this.luLevel.textContent = `Level ${ch.level - ch.pendingLevelUps + 1}`;
    this.luList.set([
      { label: `HEALTH  ${ch.max('health')}`, value: 'health' },
      { label: `MAGICKA  ${ch.max('magicka')}`, value: 'magicka' },
      { label: `STAMINA  ${ch.max('stamina')}`, value: 'stamina' },
    ]);
  }

  chooseStat(stat) {
    this.game.character.chooseLevelStat(stat);
    this.levelUp();
    this.build();
  }

  build() {
    const ch = this.game.character;
    this.lvl.textContent = `LEVEL ${ch.level}`;
    this.xpFill.style.width = `${Math.min(100, (ch.xp / ch.xpNeeded()) * 100)}%`;
    this.pts.textContent = `PERKS TO SPEND: ${ch.perkPoints}`;
    // skill strip
    this.strip.textContent = '';
    this.stripEls = ch.defs.map((s, i) => {
      const e = el('div', 'sk interactive', null, this.strip);
      el('div', 'sn', s.name, e);
      el('div', 'sl', String(ch.skills[s.id].level), e);
      const b = el('div', 'sb', null, e);
      el('i', '', null, b).style.width = `${ch.progress(s.id) * 100}%`;
      e.addEventListener('click', () => this.selectSkill(i));
      return e;
    });
    this.selectSkill(this.skill, true);
  }

  selectSkill(i, keepPerk = false) {
    const n = this.game.character.defs.length;
    this.skill = ((i % n) + n) % n;
    if (!keepPerk) this.perkIdx = 0;
    this.stripEls.forEach((e, j) => {
      let d = j - this.skill;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      e.style.left = `calc(50% + ${d * 190}px)`;
      e.classList.toggle('sel', d === 0);
    });
    this.drawSky();
  }

  drawSky() {
    const ch = this.game.character;
    const s = ch.defs[this.skill];
    this.cname.textContent = s.constellation;
    const S = this.sky;
    S.textContent = '';
    const pos = (p) => [40 + p.at[0] * 520, 20 + p.at[1] * 360];
    // lines first
    for (const p of s.perks) {
      for (const n of p.needs || []) {
        const q = s.perks.find((x) => x.id === n);
        const [x1, y1] = pos(p), [x2, y2] = pos(q);
        const lit = ch.hasPerk(p.id) && ch.hasPerk(n);
        svg('line', { x1, y1, x2, y2, stroke: lit ? 'rgba(232,228,218,0.85)' : 'rgba(232,228,218,0.28)', 'stroke-width': lit ? 1.4 : 1 }, S);
      }
    }
    s.perks.forEach((p, i) => {
      const [x, y] = pos(p);
      const st = ch.perkState(p.id).state;
      const g = svg('g', { transform: `translate(${x} ${y}) rotate(45)`, style: 'cursor:default' }, S);
      const r = st === 'taken' ? 6 : 4.5;
      svg('rect', { x: -r, y: -r, width: r * 2, height: r * 2,
        fill: st === 'taken' ? '#e8e4da' : '#06070c',
        stroke: st === 'locked' ? 'rgba(232,228,218,0.35)' : '#e8e4da', 'stroke-width': 1.2 }, g);
      if (i === this.perkIdx) svg('rect', { x: -11, y: -11, width: 22, height: 22, fill: 'none', stroke: '#b9a982', 'stroke-width': 1 }, g);
      g.addEventListener('mouseenter', () => { this.perkIdx = i; this.drawSky(); });
      g.addEventListener('click', () => this.take());
    });
    // the skill's description when no perk is in focus is replaced by the perk card
    const p = s.perks[this.perkIdx];
    const st = ch.perkState(p.id);
    this.pn.textContent = p.name;
    this.pd.textContent = p.desc;
    this.pr.textContent = st.state === 'taken' ? 'Learned' : st.state === 'available' ? (ch.perkPoints > 0 ? 'Available · E to learn' : 'Available · no perk points') : st.why.join(' · ');
    this.pr.classList.toggle('ok', st.state !== 'locked');
  }

  take() {
    const ch = this.game.character;
    const p = ch.defs[this.skill].perks[this.perkIdx];
    if (ch.takePerk(p.id)) this.build();
  }

  key(e) {
    const c = e.code;
    if (this.game.character.pendingLevelUps > 0) {
      if (c === 'Escape') { this.onClose(); return true; }
      return this.luList.key(e);
    }
    if (c === 'Escape' || c === 'Tab' || c === 'KeyK') { this.onClose(); return true; }
    if (c === 'KeyA' || c === 'ArrowLeft') { this.selectSkill(this.skill - 1); return true; }
    if (c === 'KeyD' || c === 'ArrowRight') { this.selectSkill(this.skill + 1); return true; }
    const n = this.game.character.defs[this.skill].perks.length;
    if (c === 'KeyW' || c === 'ArrowUp') { this.perkIdx = (this.perkIdx + 1) % n; this.drawSky(); return true; }
    if (c === 'KeyS' || c === 'ArrowDown') { this.perkIdx = (this.perkIdx - 1 + n) % n; this.drawSky(); return true; }
    if (c === 'KeyE' || c === 'Enter') { this.take(); return true; }
    return false;
  }
}
