import { el, rule, keyBadge, show, List } from './kit.js';
import { settings, QUALITY } from '../game/settings.js';

// Pause menu (vertical caps list over a dark vignette) and the settings list.

export class PauseMenu {
  constructor(root, { onChoose }) {
    this.root = el('div', 'ui ui-vignette ui-fade ui-off', null, root);
    this.root.id = 'pause';
    const menu = el('div', 'menu interactive', null, this.root);
    el('div', 'head', 'PAUSED', menu);
    rule({ diamond: true }, menu);
    this.list = new List(menu, { marker: false, onChoose: (it) => onChoose(it.value) });
    const hint = el('div', 'hint', null, this.root);
    keyBadge('E', hint); el('span', '', 'Select', hint);
    keyBadge('ESC', hint); el('span', '', 'Resume', hint);
    this.open = false;
  }

  show(canLoad) {
    this.list.set([
      { label: 'RESUME', value: 'resume' },
      { label: 'JOURNAL', value: 'journal' },
      { label: 'SAVE', value: 'save' },
      { label: 'LOAD', value: 'load', disabled: !canLoad },
      { label: 'SETTINGS', value: 'settings' },
      { label: 'QUIT', value: 'quit' },
    ], this.open ? this.list.index : 0);
    this.open = true;
    show(this.root, true);
  }

  hide() { this.open = false; show(this.root, false); }
  key(e) { return this.list.key(e); }
}

const RANGES = { sensitivity: [0.3, 2.0, 0.05], fov: [50, 90, 1] };

export class SettingsScreen {
  constructor(root, { onBack }) {
    this.root = el('div', 'ui ui-vignette ui-fade ui-off', null, root);
    this.root.id = 'settings';
    const panel = el('div', 'panel interactive', null, this.root);
    el('div', 'head', 'SETTINGS', panel);
    rule({ diamond: true }, panel);
    this.list = new List(panel, {
      onChoose: (it) => (it.key === 'back' ? onBack() : this.adjust(it, 1)),
      onAdjust: (it, d) => this.adjust(it, d),
    });
    this.onBack = onBack;
    this.open = false;
  }

  items() {
    const toggle = (key, label) => ({ key, label, render: (row) => this.row(row, label, settings.get(key) ? 'ON' : 'OFF', true) });
    const slider = (key, label) => ({ key, label, render: (row) => this.sliderRow(row, label, key) });
    return [
      { key: 'quality', label: 'Quality', render: (row) => this.row(row, 'Quality', settings.get('quality').toUpperCase(), true) },
      toggle('showFps', 'Show FPS'),
      slider('sensitivity', 'Mouse sensitivity'),
      slider('fov', 'Field of view'),
      toggle('headBob', 'Head bob'),
      toggle('invertY', 'Invert look'),
      { key: 'back', label: 'Back', render: (row) => this.row(row, 'Back', '', false) },
    ];
  }

  row(row, label, value, arrows) {
    el('span', '', label, row);
    const v = el('span', 'value', null, row);
    if (arrows) { el('span', 'arrow', '<', v); el('span', '', value, v); el('span', 'arrow', '>', v); } else v.textContent = value;
  }

  sliderRow(row, label, key) {
    el('span', '', label, row);
    const [min, max] = RANGES[key];
    const s = el('div', 'slider', null, row);
    el('div', 'track', null, s);
    const knob = el('div', 'knob', null, s);
    knob.style.left = `${((settings.get(key) - min) / (max - min)) * 100}%`;
    const drag = (ev) => {
      const r = s.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      this.setValue(key, min + f * (max - min));
    };
    s.addEventListener('mousedown', (ev) => {
      drag(ev);
      const move = (m) => drag(m);
      addEventListener('mousemove', move);
      addEventListener('mouseup', () => removeEventListener('mousemove', move), { once: true });
    });
  }

  setValue(key, v) {
    const [min, max, step] = RANGES[key];
    settings.set(key, Math.round(Math.min(max, Math.max(min, v)) / step) * step);
    this.refresh();
  }

  adjust(it, d) {
    if (!it || it.key === 'back') return;
    if (it.key === 'quality') {
      const i = QUALITY.indexOf(settings.get('quality'));
      settings.set('quality', QUALITY[(i + d + QUALITY.length) % QUALITY.length]);
    } else if (RANGES[it.key]) {
      this.setValue(it.key, settings.get(it.key) + d * RANGES[it.key][2] * 2);
      return;
    } else settings.set(it.key, !settings.get(it.key));
    this.refresh();
  }

  refresh() { this.list.set(this.items(), this.list.index); }

  show() {
    this.open = true;
    this.list.set(this.items(), 0);
    show(this.root, true);
  }

  hide() { this.open = false; show(this.root, false); }

  key(e) {
    if (e.code === 'Escape' || e.code === 'Tab') { this.onBack(); return true; }
    return this.list.key(e);
  }
}
