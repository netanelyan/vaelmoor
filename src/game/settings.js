import { load, save } from './store.js';

// Player settings, persisted. Listeners are told whenever a value changes.
export const QUALITY = ['low', 'medium', 'high'];

const DEFAULTS = {
  quality: 'high',
  showFps: false,
  sensitivity: 1.0, // 0.3 .. 2.0
  fov: 62,          // 50 .. 90
  headBob: true,
  invertY: false,
};

class Settings {
  constructor() {
    this.values = { ...DEFAULTS, ...load('settings', {}) };
    this.listeners = [];
  }
  get(k) { return this.values[k]; }
  set(k, v) {
    if (this.values[k] === v) return;
    this.values[k] = v;
    save('settings', this.values);
    for (const fn of this.listeners) fn(k, v);
  }
  onChange(fn) { this.listeners.push(fn); }
}

export const settings = new Settings();
