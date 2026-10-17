import { el, rule, keyBadge, show, List } from './kit.js';
import { ItemPreview } from './preview.js';
import { prices } from '../game/loot.js';

// Two-sided transfer: a container (chest, barrel, sack, body) or a merchant
// on the left, the player on the right. Loot: E takes the selected stack, R
// takes everything, on the player's side E stores. Barter: E buys or sells
// one at a time (shift: the whole stack) at Speech-adjusted prices.

export class TransferScreen {
  constructor(root, { game, onClose }) {
    this.root = el('div', 'ui rpg-screen ui-fade ui-off', null, root);
    this.root.id = 'transfer';
    Object.assign(this, { game, onClose });
    const side = (cls) => {
      const s = el('div', `side ${cls}`, null, this.root);
      const head = el('div', 'head', null, s);
      const name = el('span', '', '', head);
      const gold = el('span', 'g', '', head);
      rule({ diamond: true }, s);
      const col = el('div', 'rpg-col interactive', null, s);
      const empty = el('div', 'empty', 'Empty', s);
      return { s, name, gold, col, empty };
    };
    this.L = side('left');
    this.R = side('right');
    this.L.list = new List(this.L.col, { onSelect: (it) => this.card(it), onChoose: (it) => this.move(it, 'left') });
    this.R.list = new List(this.R.col, { onSelect: (it) => this.card(it), onChoose: (it) => this.move(it, 'right') });
    this.L.col.addEventListener('mouseenter', () => this.focus('left'));
    this.R.col.addEventListener('mouseenter', () => this.focus('right'));
    const pv = el('div', 'preview', null, this.root);
    this.preview = new ItemPreview(pv);
    this.cardEl = el('div', 'rpg-card', null, this.root);
    this.hint = el('div', 'rpg-hint', null, this.root);
    this.open = false;
  }

  /** other: a container state from game.containers ({ stacks, gold, name, owner?, merchant? }). */
  show(other, { barter = false, title = null } = {}) {
    this.other = other;
    this.barter = barter;
    this.open = true;
    this.L.name.textContent = (title ?? other.name).toUpperCase();
    this.R.name.textContent = 'YOU';
    this.focus(other.stacks.size || other.gold ? 'left' : 'right');
    this.refresh();
    this.hints();
    show(this.root, true);
  }

  hide() { this.open = false; show(this.root, false); this.preview.show(null); }

  hints() {
    this.hint.textContent = '';
    const k = (key, t) => { keyBadge(key, this.hint); el('span', '', t, this.hint); };
    if (this.barter) { k('E', this.side === 'left' ? 'Buy' : 'Sell'); k('SHIFT+E', 'Whole stack'); k('A/D', 'Switch'); k('ESC', 'Done'); }
    else { k('E', this.side === 'left' ? (this.stealing() ? 'Steal' : 'Take') : 'Store'); k('R', 'Take all'); k('A/D', 'Switch'); k('ESC', 'Close'); }
  }

  stealing() { return !this.barter && this.game.isOwnedByOther(this.other); }

  focus(side) {
    this.side = side;
    this.L.col.classList.toggle('blur', side !== 'left');
    this.R.col.classList.toggle('blur', side !== 'right');
    const l = (side === 'left' ? this.L : this.R).list;
    this.card(l.items[l.index]);
    this.hints();
  }

  rows(stacks, gold, side) {
    const g = this.game, P = prices(g.character);
    const out = [];
    if (!this.barter && gold > 0) out.push({ gold: true, name: 'Gold', count: gold });
    for (const [id, n] of stacks) {
      const def = g.items.get(id);
      if (!def) continue;
      if (this.barter && side === 'right' && !this.other.buys?.includes(def.cat)) continue;
      if (this.barter && side === 'right' && g.inventory.isEquipped(id) && n <= 1) continue;
      const price = this.barter ? (side === 'left' ? P.buy(def.value) : P.sell(def.value)) : null;
      out.push({ id, def, name: def.name, count: n, price });
    }
    out.sort((a, b) => (b.gold ? 1 : 0) - (a.gold ? 1 : 0) || a.name.localeCompare(b.name));
    return out.map((r) => ({
      ...r,
      render: (row) => {
        if (side === 'left' && this.stealing()) row.classList.add('stolen');
        el('span', 'n', r.count > 1 && !r.gold ? `${r.name} (${r.count})` : r.name, row);
        el('span', 'c', r.gold ? String(r.count) : r.price != null ? `${r.price} g` : `${+(r.def.weight).toFixed(1)}`, row);
      },
    }));
  }

  refresh() {
    const g = this.game, inv = g.inventory;
    const keepL = this.L.list.index, keepR = this.R.list.index;
    this.L.list.set(this.rows(this.other.stacks, this.other.gold, 'left'), keepL);
    this.R.list.set(this.rows(inv.stacks, 0, 'right'), keepR);
    show(this.L.empty, !this.L.list.items.length);
    show(this.R.empty, !this.R.list.items.length);
    this.L.gold.textContent = this.barter ? `${this.other.gold} GOLD` : '';
    this.R.gold.textContent = `${inv.gold} GOLD · ${Math.round(inv.weight())}/${Math.round(inv.maxWeight())}`;
    const l = (this.side === 'left' ? this.L : this.R).list;
    if (!l.items.length && this.side === 'left' && this.R.list.items.length) this.focus('right');
    else this.card(l.items[l.index]);
  }

  card(it) {
    const c = this.cardEl;
    c.textContent = '';
    if (!it) { this.preview.show(null); return; }
    el('div', 'name', it.name, c);
    rule({ diamond: true }, c);
    const stats = el('div', 'stats', null, c);
    if (it.gold) { const s = el('div', '', 'GOLD', stats); el('b', '', String(it.count), s); this.preview.show(null); return; }
    for (const [l, v] of this.game.items.stats(it.def, this.game.character)) { const s = el('div', '', l, stats); el('b', '', String(v), s); }
    if (it.price != null) { const s = el('div', '', this.side === 'left' ? 'PRICE' : 'OFFER', stats); el('b', '', `${it.price}`, s); }
    const d = this.game.items.describe(it.def, (id, i) => this.game.inventory.knows(id, i));
    if (d) el('div', 'desc', d, c);
    this.preview.show(it.def);
  }

  move(it, side, all = false) {
    if (!it) return;
    const g = this.game;
    if (this.barter) {
      const n = all ? it.count : 1;
      const ok = side === 'left' ? g.buy(this.other, it.id, n) : g.sell(this.other, it.id, n);
      if (!ok) g.ui?.hud.toast(side === 'left' ? 'You cannot afford that' : `${this.other.name} cannot afford that`);
    } else if (side === 'left') {
      g.takeFrom(this.other, it.gold ? 'gold' : it.id, it.count);
    } else {
      g.storeIn(this.other, it.id, it.count);
    }
    this.refresh();
  }

  takeAll() {
    if (this.barter) return;
    this.game.takeAll(this.other);
    this.refresh();
  }

  update(dt) { if (this.open) this.preview.render(dt); }

  key(e) {
    const c = e.code;
    if (c === 'Escape' || c === 'Tab') { this.onClose(); return true; }
    if (c === 'KeyA' || c === 'ArrowLeft') { this.focus('left'); return true; }
    if (c === 'KeyD' || c === 'ArrowRight') { this.focus('right'); return true; }
    const S = this.side === 'left' ? this.L : this.R;
    if (c === 'KeyR') { this.takeAll(); return true; }
    if (c === 'KeyE' || c === 'Enter' || c === 'Space') { this.move(S.list.items[S.list.index], this.side, e.shiftKey); return true; }
    return S.list.key(e);
  }
}
