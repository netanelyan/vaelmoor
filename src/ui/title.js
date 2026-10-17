import { el, rule, show } from './kit.js';

// Title screen: the wide-spaced serif logo over a slow camera drift through
// the world, "PRESS ANY KEY" small and plain beneath it.

export class TitleScreen {
  constructor(root) {
    this.root = el('div', 'ui ui-fade-slow ui-off', null, root);
    this.root.id = 'title';
    el('div', 'shade', null, this.root);
    el('div', 'logo', 'VAELMOOR', this.root);
    const wrap = el('div', 'rule-wrap', null, this.root);
    rule({ diamond: true }, wrap);
    el('div', 'press', 'PRESS ANY KEY', this.root);
    this.open = false;
  }

  show() { this.open = true; show(this.root, true); }
  hide() { this.open = false; show(this.root, false); }
}

/**
 * Slow camera drift along keyframes [{ pos: [x, y, z], target: [x, y, z] }],
 * looping with smooth easing. `t` in seconds.
 */
export function driftCamera(camera, keys, t, secondsPerKey = 14) {
  const n = keys.length;
  const f = (t / secondsPerKey) % n;
  const i = Math.floor(f), u = f - i;
  const a = keys[i], b = keys[(i + 1) % n];
  const s = u * u * (3 - 2 * u);
  const lerp = (p, q) => p.map((v, k) => v + (q[k] - v) * s);
  const p = lerp(a.pos, b.pos), q = lerp(a.target, b.target);
  camera.position.set(p[0], p[1], p[2]);
  camera.lookAt(q[0], q[1], q[2]);
}
