// Carried items (stacks by id), gold, equipment slots, favorites and the
// weight limit. Hands hold weapons, shields or spells ("spell:<id>"); a bow
// takes both hands.

export const SLOTS = ['head', 'body', 'hands', 'feet', 'left', 'right'];

export class Inventory {
  constructor(items, character) {
    this.items = items;
    this.ch = character;
    this.stacks = new Map();
    this.gold = 0;
    this.equipped = { head: null, body: null, hands: null, feet: null, left: null, right: null, ammo: null };
    this.favorites = new Set();
    this.known = {}; // ingredient id -> [bool x4] effects discovered
    this.listeners = [];
  }

  on(fn) { this.listeners.push(fn); }
  emit(e) { for (const fn of this.listeners) fn(e); }

  count(id) { return this.stacks.get(id) || 0; }
  has(id, n = 1) { return this.count(id) >= n; }

  add(id, n = 1, { silent = false } = {}) {
    if (n <= 0 || !this.items.has(id)) return;
    this.stacks.set(id, this.count(id) + n);
    if (!silent) this.emit({ type: 'add', id, n });
  }

  remove(id, n = 1) {
    const c = this.count(id);
    if (c <= 0) return 0;
    const k = Math.min(c, n);
    if (c - k <= 0) {
      this.stacks.delete(id);
      for (const s of [...SLOTS, 'ammo']) if (this.equipped[s] === id) this.equipped[s] = null;
      this.favorites.delete(id);
    } else this.stacks.set(id, c - k);
    this.emit({ type: 'remove', id, n: k });
    return k;
  }

  weight() {
    let w = 0;
    for (const [id, n] of this.stacks) w += (this.items.get(id).weight || 0) * n;
    return w;
  }
  maxWeight() { return 200 + (this.ch.max('stamina') - 100) * 0.5; }
  overweight() { return this.weight() > this.maxWeight(); }

  /** Entries for a menu category (incl. 'all' and 'favorites'), sorted by name. */
  list(cat) {
    const out = [];
    for (const [id, count] of this.stacks) {
      const def = this.items.get(id);
      if (cat === 'favorites' ? !this.favorites.has(id) : cat !== 'all' && def.cat !== cat) continue;
      out.push({ id, def, count, equipped: this.isEquipped(id) });
    }
    return out.sort((a, b) => (b.equipped - a.equipped) || a.def.name.localeCompare(b.def.name));
  }

  isEquipped(id) { return Object.values(this.equipped).includes(id); }
  slotsOf(id) { return Object.entries(this.equipped).filter(([, v]) => v === id).map(([k]) => k); }

  /**
   * Equip an item or spell ("spell:flames"). `hand` picks left/right for
   * weapons and spells. Equipping something already equipped there unequips it.
   */
  equip(id, hand = 'right') {
    const isSpell = id.startsWith('spell:');
    const def = isSpell ? null : this.items.get(id);
    const E = this.equipped;
    if (def?.hand === 'ammo') { E.ammo = E.ammo === id ? null : id; this.emit({ type: 'equip' }); return; }
    if (!isSpell && def.cat === 'apparel') {
      const slot = def.slot;
      if (E[slot] === id) E[slot] = null;
      else {
        if (slot === 'left' && this.isBow(E.right)) E.right = null;
        E[slot] = id;
      }
      this.emit({ type: 'equip' });
      return;
    }
    if (!isSpell && def.hand === 'bow') {
      if (E.right === id) { E.right = null; } else { E.right = id; E.left = null; if (!E.ammo) E.ammo = this.firstAmmo(); }
      this.emit({ type: 'equip' });
      return;
    }
    if (isSpell || def.hand === 'one') {
      if (E[hand] === id) { E[hand] = null; this.emit({ type: 'equip' }); return; }
      // a single weapon can't be in both hands unless we carry two
      const other = hand === 'left' ? 'right' : 'left';
      if (!isSpell && E[other] === id && this.count(id) < 2) E[other] = null;
      if (this.isBow(E.right)) E.right = null;
      E[hand] = id;
      this.emit({ type: 'equip' });
    }
  }

  unequip(slot) { this.equipped[slot] = null; this.emit({ type: 'equip' }); }
  isBow(id) { return !!id && !id.startsWith('spell:') && this.items.get(id)?.hand === 'bow'; }
  firstAmmo() { for (const [id] of this.stacks) if (this.items.get(id).hand === 'ammo') return id; return null; }

  armorRating() {
    let a = 0;
    for (const s of ['head', 'body', 'hands', 'feet', 'left']) {
      const id = this.equipped[s];
      if (id && !id.startsWith('spell:')) a += this.items.get(id)?.armor || 0;
    }
    return a;
  }

  toggleFavorite(id) { if (this.favorites.has(id)) this.favorites.delete(id); else this.favorites.add(id); }

  /** Alchemy knowledge: which of an ingredient's four effects you've seen. */
  knows(id, i) { return !!this.known[id]?.[i]; }
  learn(id, i) { (this.known[id] ||= [false, false, false, false])[i] = true; }

  toJSON() {
    return { stacks: [...this.stacks], gold: this.gold, equipped: this.equipped, favorites: [...this.favorites], known: this.known };
  }
  loadState(s) {
    if (!s) return;
    this.stacks = new Map(s.stacks.filter(([id]) => this.items.has(id)));
    this.gold = s.gold;
    this.equipped = { ...this.equipped, ...s.equipped };
    this.favorites = new Set(s.favorites);
    this.known = s.known || {};
    this.emit({ type: 'equip' });
  }
}
