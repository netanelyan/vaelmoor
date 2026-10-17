// Item definitions (data/items.json) plus items made at runtime (brewed
// potions), and the text the menus show for each.

export const CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'favorites', name: 'Favorites' },
  { id: 'weapons', name: 'Weapons' },
  { id: 'apparel', name: 'Apparel' },
  { id: 'potions', name: 'Potions' },
  { id: 'ingredients', name: 'Ingredients' },
  { id: 'books', name: 'Books' },
  { id: 'misc', name: 'Misc' },
];

export const EFFECT_NAMES = {
  restore_health: 'Restore Health', restore_magicka: 'Restore Magicka', restore_stamina: 'Restore Stamina',
  regen_magicka: 'Regenerate Magicka', resist_fire: 'Resist Fire', fortify_sneak: 'Fortify Sneak',
  fortify_one_handed: 'Fortify One-Handed', damage_health: 'Damage Health',
};
export const HARMFUL = new Set(['damage_health']);

export class Items {
  constructor(data) {
    this.defs = new Map(Object.entries(data.items).map(([id, d]) => [id, { id, ...d }]));
    this.custom = {}; // runtime items (brews), saved with the game
  }

  get(id) { return this.defs.get(id); }
  has(id) { return this.defs.has(id); }

  /** Register a runtime item (a brewed potion). Same effects -> same id. */
  register(id, def) {
    if (!this.defs.has(id)) { this.defs.set(id, { id, ...def }); this.custom[id] = def; }
    return this.defs.get(id);
  }
  loadCustom(c) { for (const [id, d] of Object.entries(c || {})) this.register(id, d); }

  /** Lines for the item card: [[label, value], ...] for the given character. */
  stats(def, ch) {
    const out = [];
    if (def.cat === 'weapons' && def.hand !== 'ammo') out.push(['DAMAGE', Math.round(this.damage(def, ch))]);
    if (def.hand === 'ammo') out.push(['DAMAGE', def.damage]);
    if (def.cat === 'apparel' && def.armor) out.push(['ARMOR', def.armor]);
    out.push(['WEIGHT', +(+def.weight).toFixed(1)], ['VALUE', def.value]);
    return out;
  }

  damage(def, ch) {
    if (!def.damage) return 0;
    if (def.skill === 'one_handed') return def.damage * (1 + ch.skill('one_handed') / 200) * (1 + ch.mod('one_handed.damage'));
    if (def.skill === 'archery') return def.damage * (1 + ch.skill('archery') / 200) * (1 + ch.mod('archery.damage'));
    return def.damage;
  }

  /** The descriptive line under the stats (effects, what a book teaches...). */
  describe(def, known = null) {
    if (def.effects) return def.effects.map(([e, m, s]) => `${EFFECT_NAMES[e] ?? e} ${m}${s ? ` for ${s}s` : ''}`).join(' · ');
    if (def.alchemy) return def.alchemy.map((e, i) => (known?.(def.id, i) ? EFFECT_NAMES[e] : '?')).join(' · ');
    if (def.teaches) return 'Reading this teaches you something.';
    if (def.hand === 'bow') return 'Hold to draw, release to loose an arrow.';
    return '';
  }
}
