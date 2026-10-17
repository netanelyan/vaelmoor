import { el, rule, keyBadge, show, List } from './kit.js';

// Small screens: favorites (Q), the Tab menu (Skills / Items / Magic / Map)
// and the book reader.

/** Favorites: a short list over the game. E puts the entry in the right hand, R in the left. */
export class FavoritesScreen {
  constructor(root, { game, onClose }) {
    this.root = el('div', 'ui rpg-screen ui-fade ui-off', null, root);
    this.root.id = 'favorites';
    Object.assign(this, { game, onClose });
    const panel = el('div', 'panel rpg-col interactive', null, this.root);
    el('div', 'rpg-head', 'FAVORITES', panel);
    rule({ diamond: true }, panel);
    this.list = new List(panel, { onChoose: (it) => this.use(it, 'right') });
    this.empty = el('div', 'empty', 'Mark items and spells with F in the Items or Magic menu to keep them here.', panel);
    panel.addEventListener('contextmenu', (e) => { e.preventDefault(); this.use(this.list.items[this.list.index], 'left'); });
    this.hint = el('div', 'rpg-hint', null, this.root);
    for (const [k, t] of [['E', 'Right hand'], ['R', 'Left hand'], ['Q', 'Close']]) { keyBadge(k, this.hint); el('span', '', t, this.hint); }
    this.open = false;
  }

  show() {
    this.open = true;
    this.fill(0);
    show(this.root, true);
  }
  hide() { this.open = false; show(this.root, false); }

  fill(index = this.list.index) {
    const g = this.game, inv = g.inventory;
    const rows = [];
    for (const id of inv.favorites) {
      const spell = id.startsWith('spell:') ? g.spells.spells[id.slice(6)] : null;
      const def = spell ? null : g.items.get(id);
      if (!spell && !inv.has(id)) continue;
      rows.push({
        id, spell, def,
        render: (row) => {
          const slots = inv.slotsOf(id);
          if (slots.length) row.classList.add('eq');
          if (slots.includes('left') && !def?.slot) row.classList.add('eq-l');
          if (slots.includes('right')) row.classList.add('eq-r');
          el('span', 'n', spell ? spell.name : def.name, row);
          el('span', 'c', spell ? '' : inv.count(id) > 1 ? String(inv.count(id)) : '', row);
        },
      });
    }
    this.list.set(rows, Math.min(index, Math.max(0, rows.length - 1)));
    show(this.empty, !rows.length);
  }

  use(it, hand) {
    if (!it) return;
    if (it.spell) this.game.inventory.equip(it.id, hand);
    else this.game.useItem(it.id, hand);
    this.fill();
  }

  key(e) {
    if (e.code === 'KeyQ' || e.code === 'Escape' || e.code === 'Tab') { this.onClose(); return true; }
    if (e.code === 'KeyR') { this.use(this.list.items[this.list.index], 'left'); return true; }
    return this.list.key(e);
  }
}

/** Tab: four ways out, in the manner of a compass rose. */
export class TabMenu {
  constructor(root, { onChoose, onClose, enabled = () => true }) {
    this.root = el('div', 'ui rpg-screen ui-fade ui-off', null, root);
    this.root.id = 'tabmenu';
    Object.assign(this, { onChoose, onClose, enabled });
    el('div', 'center', null, this.root);
    this.opts = {
      skills: el('div', 'opt n interactive', 'SKILLS', this.root),
      items: el('div', 'opt w interactive', 'ITEMS', this.root),
      magic: el('div', 'opt e interactive', 'MAGIC', this.root),
      map: el('div', 'opt s interactive', 'MAP', this.root),
    };
    for (const [k, e] of Object.entries(this.opts)) {
      e.addEventListener('mouseenter', () => this.select(k));
      e.addEventListener('click', () => this.choose(k));
    }
    this.sel = 'items';
    this.open = false;
  }
  show() {
    this.open = true;
    for (const [k, e] of Object.entries(this.opts)) e.classList.toggle('off', !this.enabled(k));
    this.select(this.sel);
    show(this.root, true);
  }
  hide() { this.open = false; show(this.root, false); }
  select(k) { this.sel = k; for (const [j, e] of Object.entries(this.opts)) e.classList.toggle('sel', j === k); }
  choose(k = this.sel) { if (this.enabled(k)) this.onChoose(k); }
  key(e) {
    const dir = { KeyW: 'skills', ArrowUp: 'skills', KeyS: 'map', ArrowDown: 'map', KeyA: 'items', ArrowLeft: 'items', KeyD: 'magic', ArrowRight: 'magic' }[e.code];
    if (dir) { this.select(dir); return true; }
    if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') { this.choose(); return true; }
    if (e.code === 'Tab' || e.code === 'Escape') { this.onClose(); return true; }
    return false;
  }
}

/** A book or letter on parchment. */
export class BookScreen {
  constructor(root, { onClose }) {
    this.root = el('div', 'ui ui-vignette ui-fade ui-off', null, root);
    this.root.id = 'book';
    const page = el('div', 'page interactive', null, this.root);
    this.title = el('div', 'bt', '', page);
    rule({ diamond: true, ink: true }, page);
    this.body = el('div', '', null, page);
    const hint = el('div', 'rpg-hint', null, page);
    keyBadge('ESC', hint); el('span', '', 'Close', hint);
    this.onClose = onClose;
    this.open = false;
  }
  show(def) {
    this.open = true;
    this.title.textContent = def.name;
    this.body.textContent = '';
    for (const p of def.text || []) el('p', '', p, this.body);
    show(this.root, true);
  }
  hide() { this.open = false; show(this.root, false); }
  key(e) { if (['Escape', 'Tab', 'KeyE', 'Enter'].includes(e.code)) { this.onClose(); return true; } return false; }
}
