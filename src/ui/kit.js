// Vaelmoor UI kit: tiny DOM helpers and the shared building blocks
// (rule with diamond, key badge, selectable list). Every screen uses these so
// the look stays consistent. Styling lives in kit.css / screens.css.

export function el(tag, cls = '', text = null, parent = null) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** Thin bone rule fading at both ends; `diamond` adds the centre ornament. */
export function rule({ diamond = true, ink = false, width = null } = {}, parent = null) {
  const r = el('div', `ui-rule${diamond ? ' diamond' : ''}${ink ? ' ink' : ''}`, null, parent);
  if (width) r.style.width = typeof width === 'number' ? `${width}px` : width;
  return r;
}

export function keyBadge(key, parent = null) {
  return el('span', 'ui-key', key, parent);
}

export function show(e, on = true) {
  e.classList.toggle('ui-off', !on);
}

/**
 * Vertical selectable list. Items: { label, value?, disabled?, render?(row, item) }.
 * Keyboard: W/S or arrows move, E/Enter/Space choose. Mouse: hover selects, click chooses.
 * Left/right are forwarded to `onAdjust` (settings sliders and toggles).
 */
export class List {
  constructor(parent, { cls = '', marker = true, onChoose = null, onAdjust = null, onSelect = null } = {}) {
    this.root = el('div', `ui-list ${cls}`, null, parent);
    Object.assign(this, { marker, onChoose, onAdjust, onSelect });
    this.items = [];
    this.rows = [];
    this.index = 0;
  }

  set(items, index = 0) {
    this.items = items;
    this.root.textContent = '';
    this.rows = items.map((it, i) => {
      const row = el('div', `ui-item${this.marker ? ' marker' : ''}${it.disabled ? ' disabled' : ''}`, null, this.root);
      if (it.render) it.render(row, it); else row.textContent = it.label;
      row.addEventListener('mouseenter', () => this.select(i));
      row.addEventListener('click', () => { this.select(i); this.choose(); });
      return row;
    });
    this.select(Math.min(index, items.length - 1), true);
  }

  select(i, silent = false) {
    if (!this.items.length) return;
    const n = this.items.length;
    let k = ((i % n) + n) % n;
    // skip disabled entries in the direction of travel
    for (let tries = 0; tries < n && this.items[k].disabled; tries++) k = (k + (i < this.index ? -1 : 1) + n) % n;
    this.index = k;
    this.rows.forEach((r, j) => r.classList.toggle('selected', j === k));
    if (!silent) this.onSelect?.(this.items[k], k);
  }

  choose() {
    const it = this.items[this.index];
    if (it && !it.disabled) this.onChoose?.(it, this.index);
  }

  /** Returns true if the key was handled. */
  key(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.select(this.index - 1); return true;
      case 'KeyS': case 'ArrowDown': this.select(this.index + 1); return true;
      case 'KeyA': case 'ArrowLeft': this.onAdjust?.(this.items[this.index], -1); return !!this.onAdjust;
      case 'KeyD': case 'ArrowRight': this.onAdjust?.(this.items[this.index], 1); return !!this.onAdjust;
      case 'KeyE': case 'Enter': case 'Space': this.choose(); return true;
      default: return false;
    }
  }
}

/** Show an element for `ms`, fading in and out. Restarts if called again. */
export function flash(e, ms) {
  clearTimeout(e._flashTimer);
  show(e, true);
  e._flashTimer = setTimeout(() => show(e, false), ms);
}
