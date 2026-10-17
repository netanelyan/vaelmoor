import * as THREE from 'three';
import { deepMerge } from './atmosphere.js';

// Render profiles: the look of a whole world layer.
//   dream   - the Gloaming: glossy, bloom-heavy, harsh local contrast
//   painted - the surface: 80s oil painting, matte, grainy, blue/black + red
// A region JSON names its profile and may override any field:
//   "renderProfile": { "kind": "painted", "painterly": { "grain": 0.12 } }
// The renderer crossfades between two blended profiles during transitions.

export const PROFILES = {
  dream: {
    sharpen: { large: 0.55, small: 0.35 },
    painterly: {
      amount: 0, radius: 5, canvas: 0.12, posterize: 10, posterizeAmount: 0.35, grain: 0.09, vignette: 0.75,
      crush: 0.5, redKeep: 1, desat: 0.35, edge: 0.35, contrast: 1.1, saturation: 1.1, shadowTint: '#0a0c2a', highlightTint: '#c8d4ff',
    },
  },
  painted: {
    sharpen: { large: 0, small: 0 },
    painterly: {
      amount: 1, radius: 5, canvas: 0.14, posterize: 9, posterizeAmount: 0.25, grain: 0.11, vignette: 0.85,
      crush: 0.55, redKeep: 1, desat: 0.05, edge: 0.3, contrast: 1.18, saturation: 1.25, shadowTint: '#070a26', highlightTint: '#dce4ff',
    },
  },
};

function parse(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string' && v.startsWith('#')) out[k] = new THREE.Color(v);
    else if (v && typeof v === 'object') out[k] = parse(v);
    else out[k] = v;
  }
  return out;
}

export function resolveProfile(def) {
  const kind = def?.kind ?? 'dream';
  return { kind, ...parse(deepMerge(PROFILES[kind], def || {})) };
}

/** out = a * (1 - w) + b * w (numbers and Colors, recursively). */
export function blendProfiles(a, b, w, out = {}) {
  for (const k of Object.keys(a)) {
    const x = a[k], y = b[k] ?? x;
    if (x instanceof THREE.Color) (out[k] ||= new THREE.Color()).copy(x).lerp(y, w);
    else if (typeof x === 'number') out[k] = x + (y - x) * w;
    else if (x && typeof x === 'object') out[k] = blendProfiles(x, y, w, out[k] || {});
    else out[k] = w < 0.5 ? x : y;
  }
  return out;
}
