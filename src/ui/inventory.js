import { el, rule, keyBadge, show, List } from './kit.js';
import { CATEGORIES } from '../game/items.js';
import { ItemPreview } from './preview.js';

// Inventory (I) and Magic (P): categories on the left, the items or spells
// in them, a turning 3D preview and the item card on the right, and armor /
// weight / gold along the bottom. E equips to the right hand (or uses), R to
// the left hand, F marks a favorite (for the Q menu), X drops.

export class InventoryScreen {
  constructor(root, { game, onClose }) {
    this.root = el('div', 'ui rpg-screen ui-fade ui-off', null, root);
    this.root.id = 'inventory';
    Object.assign(this, { game, onClose });
    const title = el('div', 'title', null, this.root);
    this.titleText = el('div', 'rpg-head', 'ITEMS', title);
    this.catsEl = el('div', 'cats rpg-col interactive', null, this.root);
    el('div', 'divider', null, this.root);
    this.itemsEl = el('div', 'items rpg-col interactive', null, this.root);
    this.cats = new List(this.catsEl, { onSelect: () => this.fillItems(0), onChoose: () => this.focus(1) });
    this.list = new List(this.itemsEl, { onSelect: (it) => this.card(it), onChoose: (it) => this.act(it, 'right') });
    const pv = el('div', 'preview', null, this.root);
    this.preview = new ItemPreview(pv);
    this.cardEl = el('div', 'rpg-card', null, this.root);
    this.bar = el('div', 'rpg-bar', null, this.root);
    this.hint = el('div', 'rpg-hint', null, this.root);
    this.itemsEl.addEventListener('contextmenu', (e) => { e.preventDefault(); this.act(this.list.items[this.list.index], 'left'); });
    this.col = 0;
    this.open = false;
    this.mode = 'items';
  }

  show(mode = 'items') {
    this.mode = mode;
    this.open = true;
    this.titleText.textContent = mode === 'magic' ? 'MAGIC' : 'ITEMS';
    const cats = mode === 'magic'
      ? [{ id: 'all', name: 'All' }, { id: 'destruction', name: 'Destruction' }, { id: 'restoration', name: 'Restoration' }, { id: 'remembrance', name: 'Remembrances' }]
      : CATEGORIES;
    this.cats.set(cats.map((c) => ({ label: c.name, cat: c.id })), 0);
    this.fillItems(0);
    this.focus(1);
    this.hints();
    show(this.root, true);
  }

  hide() { this.open = false; show(this.root, false); this.preview.show(null); }

  hints() {
    this.hint.textContent = '';
    const k = (key, t) => { keyBadge(key, this.hint); el('span', '', t, this.hint); };
    if (this.mode === 'magic') { k('E', 'Right hand'); k('R', 'Left hand'); k('F', 'Favorite'); k('ESC', 'Close'); return; }
    k('E', 'Equip / Use'); k('R', 'Left hand'); k('F', 'Favorite'); k('X', 'Drop'); k('ESC', 'Close');
  }

  focus(c) {
    this.col = c;
    this.catsEl.classList.toggle('blur', c !== 0);
    this.itemsEl.classList.toggle('blur', c !== 1);
  }

  entries() {
    const g = this.game, cat = this.cats.items[this.cats.index]?.cat ?? 'all';
    if (this.mode === 'magic') {
      const out = [];
      for (const id of g.character.spells) {
        const s = g.spells.spells[id];
        if (cat === 'all' || cat === s.school) out.push({ id: `spell:${id}`, spell: s, name: s.name, count: '' });
      }
      for (const id of g.character.remembrances) {
        const r = g.spells.remembrances[id];
        if (cat === 'all' || cat === 'remembrance') out.push({ id: `rem:${id}`, rem: r, name: r.name, count: r.word });
      }
      return out;
    }
    return g.inventory.list(cat).map((e) => ({ id: e.id, def: e.def, name: e.def.name, count: e.count > 1 ? e.count : '' }));
  }

  fillItems(index = this.list.index) {
    const inv = this.game.inventory;
    const rows = this.entries().map((e) => ({
      ...e,
      render: (row) => {
        const slots = e.rem ? (this.game.remembrance === e.id.slice(4) ? ['rem'] : []) : inv.slotsOf(e.id);
        if (slots.length) row.classList.add('eq');
        if (slots.includes('left') && !e.def?.slot) row.classList.add('eq-l');
        if (slots.includes('right')) row.classList.add('eq-r');
        if (inv.favorites.has(e.id)) row.classList.add('fav');
        el('span', 'n', e.name, row);
        el('span', 'c', String(e.count), row);
      },
    }));
    this.list.set(rows, Math.min(index, Math.max(0, rows.length - 1)));
    if (!rows.length) { this.card(null); }
    this.footer();
  }

  card(it) {
    const c = this.cardEl;
    c.textContent = '';
    if (!it) { this.preview.show(null); return; }
    const g = this.game;
    el('div', 'name', it.name, c);
    rule({ diamond: true }, c);
    const stats = el('div', 'stats', null, c);
    const stat = (label, v) => { const s = el('div', '', label, stats); el('b', '', String(v), s); };
    if (it.spell) {
      const cost = g.spellCost(it.spell);
      stat('MAGICKA', `${Math.round(cost)}/s`);
      stat('SCHOOL', it.spell.school.toUpperCase());
      el('div', 'desc', it.spell.desc.replace(/\{(\w+)\}/g, (_, k) => (k === 'cost' ? Math.round(cost) : it.spell[k])), c);
      this.preview.show(null);
    } else if (it.rem) {
      stat('WORD', it.rem.word);
      stat('COOLDOWN', `${it.rem.cooldown}s`);
      el('div', 'desc', it.rem.desc, c);
      this.preview.show(null);
    } else {
      for (const [l, v] of g.items.stats(it.def, g.character)) stat(l, v);
      const d = g.items.describe(it.def, (id, i) => g.inventory.knows(id, i));
      if (d) el('div', 'desc', d, c);
      this.preview.show(it.def);
    }
  }

  footer() {
    const g = this.game, inv = g.inventory;
    this.bar.textContent = '';
    const item = (label, v, cls = '') => { const s = el('span', cls, label, this.bar); el('b', '', String(v), s); };
    item('ARMOR', Math.round(g.armorRating()));
    const w = inv.weight(), mw = inv.maxWeight();
    item('WEIGHT', `${Math.round(w)}/${Math.round(mw)}`, w > mw ? 'over' : '');
    item('GOLD', inv.gold);
  }

  act(it, hand) {
    if (!it) return;
    const g = this.game;
    if (it.rem) g.setRemembrance(it.id.slice(4));
    else if (it.spell) g.inventory.equip(it.id, hand);
    else g.useItem(it.id, hand);
    this.refresh();
  }

  refresh() {
    if (!this.open) return;
    const cur = this.list.items[this.list.index]?.id;
    this.fillItems();
    const i = this.list.items.findIndex((x) => x.id === cur);
    if (i >= 0) this.list.select(i, true);
    this.card(this.list.items[this.list.index]);
  }

  update(dt) { if (this.open) this.preview.render(dt); }

  key(e) {
    const c = e.code;
    if (c === 'Escape' || c === 'Tab' || (c === 'KeyI' && this.mode === 'items') || (c === 'KeyP' && this.mode === 'magic')) { this.onClose(); return true; }
    if (c === 'KeyA' || c === 'ArrowLeft') { this.focus(0); return true; }
    if (c === 'KeyD' || c === 'ArrowRight') { if (this.list.items.length) this.focus(1); return true; }
    if (this.col === 0) return this.cats.key(e);
    const it = this.list.items[this.list.index];
    if (c === 'KeyR') { this.act(it, 'left'); return true; }
    if (c === 'KeyF' && it) { this.game.inventory.toggleFavorite(it.id); this.refresh(); return true; }
    if (c === 'KeyX' && it?.def) { this.game.drop(it.id); this.refresh(); return true; }
    return this.list.key(e);
  }
}
