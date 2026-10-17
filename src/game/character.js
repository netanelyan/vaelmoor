// The player character: health / magicka / stamina, ten skills that rise by
// use, character level from skill gains, perk points and a perk tree per skill
// (all defined in data/skills.json). Timed effects (potions, heal-over-time)
// and regeneration live here too. Values are absolute (100 = a fresh hero);
// `frac(stat)` gives the HUD its 0..1.

export const STATS = ['health', 'magicka', 'stamina'];

export class Character {
  constructor(skillData) {
    this.L = skillData.levelling;
    this.defs = skillData.skills;
    this.perkDefs = new Map();
    for (const s of this.defs) for (const p of s.perks) this.perkDefs.set(p.id, { ...p, skill: s.id });
    this.level = 1;
    this.xp = 0;
    this.perkPoints = 0;
    this.pendingLevelUps = 0;
    this.base = { health: 100, magicka: 100, stamina: 100 };
    this.cur = { health: 100, magicka: 100, stamina: 100 };
    this.skills = {};
    for (const s of this.defs) this.skills[s.id] = { level: s.start, progress: 0 };
    this.perks = new Set();
    this.spells = new Set(['flames', 'healing']);
    this.remembrances = new Set();
    this.effects = []; // { stat, perSec, left } (restore over time) or { fortify, amount, left }
    this.combat = false;
    this.staminaDelay = 0;
    this.magickaDelay = 0;
    this.listeners = [];
    this._mods = null;
  }

  on(fn) { this.listeners.push(fn); }
  emit(e) { for (const fn of this.listeners) fn(e); }

  // ------------------------------------------------------------ stats
  max(stat) { return this.base[stat]; }
  frac(stat) { return this.cur[stat] / this.max(stat); }
  get dead() { return this.cur.health <= 0; }

  /** Spend stamina or magicka (returns false and spends nothing if short, unless `partial`). */
  spend(stat, amount, { partial = false } = {}) {
    if (this.cur[stat] < amount && !partial) return false;
    this.cur[stat] = Math.max(0, this.cur[stat] - amount);
    if (stat === 'stamina') this.staminaDelay = 1.4;
    if (stat === 'magicka') this.magickaDelay = 1.6;
    return true;
  }

  restore(stat, amount) { this.cur[stat] = Math.min(this.max(stat), this.cur[stat] + amount); }

  damage(amount) {
    this.cur.health = Math.max(0, this.cur.health - amount);
    return this.cur.health <= 0;
  }

  /** Hooks used by the walker (sprint and jump cost stamina). */
  canSprint() { return this.cur.stamina > 1; }
  canJump() { return this.cur.stamina > 5; }

  update(dt, ev = {}) {
    if (ev.sprinting) this.spend('stamina', dt * 16 * (1 + this.mod('stamina.sprint')), { partial: true });
    if (ev.jumped) this.spend('stamina', 8, { partial: true });
    if (ev.landingSpeed > 13) this.damage((ev.landingSpeed - 13) * 4);
    this.staminaDelay -= dt;
    this.magickaDelay -= dt;
    const m = this.base;
    if (this.staminaDelay <= 0) this.restore('stamina', dt * m.stamina * (this.combat ? 0.035 : 0.07));
    if (this.magickaDelay <= 0) this.restore('magicka', dt * m.magicka * 0.03 * (1 + this.mod('magicka.regen')) * (this.combat ? 0.5 : 1));
    if (!this.dead) this.restore('health', dt * m.health * (this.combat ? 0.002 : 0.007));
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      const step = Math.min(dt, e.left);
      if (e.stat) this.restore(e.stat, e.perSec * step);
      e.left -= dt;
      if (e.left <= 0) this.effects.splice(i, 1);
    }
  }

  /** Apply an alchemy/potion effect: [name, magnitude, seconds]. */
  applyEffect([name, mag, secs = 0]) {
    const restore = /^restore_(health|magicka|stamina)$/.exec(name);
    if (restore) {
      if (secs > 0) this.effects.push({ stat: restore[1], perSec: mag / secs, left: secs });
      else this.restore(restore[1], mag);
      return;
    }
    if (name === 'regen_magicka') { this.effects.push({ stat: 'magicka', perSec: mag / Math.max(1, secs || 10), left: secs || 10 }); return; }
    if (name === 'damage_health') { this.damage(mag); return; }
    // fortify_* / resist_*: timed modifiers read through mod()
    this.effects.push({ fortify: name, amount: mag, left: secs || 60 });
    this._mods = null;
  }

  fortified(name) { return this.effects.filter((e) => e.fortify === name).reduce((s, e) => s + e.amount, 0); }

  // ------------------------------------------------------------ skills + levels
  skill(id) {
    const fort = { one_handed: 'fortify_one_handed', sneak: 'fortify_sneak' }[id];
    return this.skills[id].level + (fort ? this.fortified(fort) : 0);
  }
  def(id) { return this.defs.find((s) => s.id === id); }
  need(level) { return this.L.base + level * this.L.perLevel; }
  progress(id) { const s = this.skills[id]; return s.level >= this.L.maxSkill ? 1 : s.progress / this.need(s.level); }
  xpNeeded() { return (this.level + 2) * this.L.levelStep; }

  /** Use a skill: `points` of use (one hit, one lock, 100 gold of trade...). */
  useSkill(id, points = 1) {
    const s = this.skills[id];
    if (!s || s.level >= this.L.maxSkill) return;
    s.progress += points;
    while (s.level < this.L.maxSkill && s.progress >= this.need(s.level)) {
      s.progress -= this.need(s.level);
      this.raiseSkill(id);
    }
  }

  /** One skill level (from use, a book or a trainer). */
  raiseSkill(id) {
    const s = this.skills[id];
    if (s.level >= this.L.maxSkill) return;
    s.level++;
    this.emit({ type: 'skill-up', skill: id, name: this.def(id).name, level: s.level });
    this.xp += s.level;
    while (this.xp >= this.xpNeeded()) {
      this.xp -= this.xpNeeded();
      this.level++;
      this.perkPoints++;
      this.pendingLevelUps++;
      this.emit({ type: 'level-up', level: this.level });
    }
  }

  /** Spend a pending level-up on +10 health, magicka or stamina. */
  chooseLevelStat(stat) {
    if (this.pendingLevelUps <= 0 || !STATS.includes(stat)) return false;
    this.pendingLevelUps--;
    this.base[stat] += this.L.statGain;
    this.cur[stat] = this.base[stat];
    this.emit({ type: 'stat-up', stat });
    return true;
  }

  // ------------------------------------------------------------ perks
  perk(id) { return this.perkDefs.get(id); }
  hasPerk(id) { return this.perks.has(id); }
  /** 'taken' | 'available' | 'locked' (with why). */
  perkState(id) {
    const p = this.perk(id);
    if (this.perks.has(id)) return { state: 'taken' };
    const why = [];
    if (this.skills[p.skill].level < p.req) why.push(`Requires ${this.def(p.skill).name} ${p.req}`);
    if (p.needs?.length && !p.needs.some((n) => this.perks.has(n))) why.push(`Requires ${p.needs.map((n) => this.perk(n).name).join(' or ')}`);
    return { state: why.length ? 'locked' : 'available', why };
  }
  takePerk(id) {
    if (this.perkPoints <= 0 || this.perkState(id).state !== 'available') return false;
    this.perks.add(id);
    this.perkPoints--;
    this._mods = null;
    this.emit({ type: 'perk', perk: this.perk(id) });
    return true;
  }

  /** Sum of every taken perk's (and active effect's) modifier `key`. */
  mod(key) {
    if (!this._mods) {
      this._mods = {};
      for (const id of this.perks) for (const [k, v] of Object.entries(this.perk(id).mods || {})) this._mods[k] = (this._mods[k] || 0) + v;
    }
    let v = this._mods[key] || 0;
    if (key === 'fire.resist') v += this.fortified('resist_fire') / 100;
    return v;
  }

  // ------------------------------------------------------------ save
  toJSON() {
    return { level: this.level, xp: this.xp, perkPoints: this.perkPoints, pendingLevelUps: this.pendingLevelUps, base: this.base, cur: this.cur,
      skills: this.skills, perks: [...this.perks], spells: [...this.spells], remembrances: [...this.remembrances] };
  }
  loadState(s) {
    if (!s) return;
    Object.assign(this, { level: s.level, xp: s.xp, perkPoints: s.perkPoints, pendingLevelUps: s.pendingLevelUps });
    this.base = { ...s.base }; this.cur = { ...s.cur };
    for (const [k, v] of Object.entries(s.skills)) if (this.skills[k]) this.skills[k] = { ...v };
    this.perks = new Set(s.perks); this.spells = new Set(s.spells); this.remembrances = new Set(s.remembrances || []);
    this.effects = []; this._mods = null;
    this.emit({ type: 'restore' });
  }
}
