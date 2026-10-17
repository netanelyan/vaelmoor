import { mulberry32, hashString } from '../engine/noise.js';

// Loot tables (data/loot.json) and the state of every container in the world:
// chests, barrels, sacks, coffins and bodies. Contents are rolled
// deterministically from the container id the first time it is opened, and
// saved from then on. Merchants are containers with prices and a purse.

export function rollLoot(tables, tableId, seed) {
  const rand = mulberry32(hashString(String(seed)) >>> 0);
  const stacks = new Map();
  let gold = 0;
  const addItem = (id, n) => stacks.set(id, (stacks.get(id) || 0) + n);
  const roll = (tid, depth = 0) => {
    const t = tables[tid];
    if (!t || depth > 3) return;
    if (t.gold) gold += Math.floor(t.gold[0] + rand() * (t.gold[1] - t.gold[0] + 1));
    for (const r of t.rolls || []) {
      if (rand() > (r.chance ?? 1)) continue;
      if (r.table) { roll(r.table, depth + 1); continue; }
      const [a, b] = r.count ?? [1, 1];
      addItem(r.item, Math.floor(a + rand() * (b - a + 1)));
    }
    const pool = t.pick || [];
    for (let k = 0; k < (t.pickCount ?? 0) && pool.length; k++) {
      const total = pool.reduce((s, p) => s + (p.w ?? 1), 0);
      let x = rand() * total;
      for (const p of pool) { x -= p.w ?? 1; if (x <= 0) { addItem(p.item, 1); break; } }
    }
  };
  roll(tableId);
  return { stacks, gold };
}

export class Containers {
  constructor(lootData) {
    this.tables = lootData.tables;
    this.merchantDefs = lootData.merchants;
    this.state = new Map(); // id -> { stacks: Map, gold, locked, opened }
  }

  /** Register a world container (called by the world builder). */
  define(id, { table = null, locked = null, owner = null, name = 'Chest', fixed = null } = {}) {
    if (!this.state.has(id)) this.state.set(id, { id, table, locked, lock0: locked, owner, name, fixed, stacks: null, gold: 0, opened: false });
    const c = this.state.get(id);
    if (c.placeholder) Object.assign(c, { table, name, owner, fixed, placeholder: false });
    return c;
  }

  get(id) { return this.state.get(id); }

  /** Contents, rolled on first access. */
  open(id) {
    const c = this.state.get(id);
    if (!c.stacks) {
      if (c.fixed) { c.stacks = new Map(Object.entries(c.fixed.items || {})); c.gold = c.fixed.gold || 0; }
      else { const r = rollLoot(this.tables, c.table, id); c.stacks = r.stacks; c.gold = r.gold; }
    }
    c.opened = true;
    return c;
  }

  /** A merchant's stock as a container (restocked by `restock`). */
  merchant(id) {
    const key = `merchant:${id}`;
    let c = this.state.get(key);
    if (!c) {
      const d = this.merchantDefs[id];
      c = { id: key, name: id, merchant: id, stacks: new Map(d.stock.map((s) => [s.item, s.count])), gold: d.gold, buys: d.buys, opened: true };
      this.state.set(key, c);
    }
    return c;
  }

  restock(id) { this.state.delete(`merchant:${id}`); }

  toJSON() {
    const out = {};
    for (const [id, c] of this.state) if (c.stacks || c.unlocked) out[id] = { stacks: c.stacks ? [...c.stacks] : null, gold: c.gold, locked: c.locked, opened: c.opened };
    return out;
  }
  loadState(s) {
    // back to the world as built, then apply the save
    for (const [id, c] of [...this.state]) {
      if (c.merchant) this.state.delete(id);
      else Object.assign(c, { stacks: null, gold: 0, opened: false, locked: c.lock0, unlocked: false });
    }
    for (const [id, v] of Object.entries(s || {})) {
      let c = this.state.get(id) ?? (id.startsWith('merchant:') ? this.merchant(id.slice(9)) : null);
      if (!c && id.startsWith('enemy:')) { c = this.define(id, {}); c.placeholder = true; } // a body from an earlier session
      if (!c) continue;
      c.stacks = v.stacks ? new Map(v.stacks) : null;
      c.gold = v.gold; c.locked = v.locked; c.opened = v.opened; c.unlocked = v.locked == null;
    }
  }
}

/**
 * Barter prices. Speech 15 buys at ~1.9x value and sells at ~0.5x; perfect
 * speech and both Haggling perks bring that to ~1.0x / ~0.95x.
 */
export function prices(ch) {
  const sp = Math.min(100, ch.skill('speech'));
  const mult = 2.0 - 0.8 * (sp / 100);
  const haggle = ch.mod('speech.prices');
  return {
    buy: (v) => Math.max(1, Math.round(v * mult * (1 - haggle))),
    sell: (v) => Math.max(v > 0 ? 1 : 0, Math.round((v / mult) * (1 + haggle))),
  };
}
