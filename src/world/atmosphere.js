import * as THREE from 'three';

// Per-area "atmosphere" palettes (sky, fog, ambient, moonlight, rim, post grade),
// parsed from JSON and blended by distance so walking between areas smoothly
// shifts the whole mood.

const DEG = Math.PI / 180;

export function dirFromAzEl(az, el) {
  // azimuth 0 = -Z (north, "into the screen"), increasing clockwise toward +X
  const a = az * DEG, e = el * DEG;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

function isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

export function deepMerge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = isPlainObject(v) && isPlainObject(base?.[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

/** Convert JSON values into blendable objects: '#hex' -> Color, moon [az, el] -> Vector3. */
function parse(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.startsWith('#')) out[k] = new THREE.Color(v);
    else if (k === 'moonDir' || k === 'dir') out[k] = dirFromAzEl(v[0], v[1]);
    else if (isPlainObject(v)) out[k] = parse(v);
    else out[k] = v;
  }
  return out;
}

function blendInto(target, sources, weights) {
  const first = sources[0];
  for (const k of Object.keys(first)) {
    const v = first[k];
    if (v instanceof THREE.Color) {
      const c = (target[k] ||= new THREE.Color()).setRGB(0, 0, 0);
      sources.forEach((s, i) => { if (s[k]) { c.r += s[k].r * weights[i]; c.g += s[k].g * weights[i]; c.b += s[k].b * weights[i]; } });
    } else if (v instanceof THREE.Vector3) {
      const d = (target[k] ||= new THREE.Vector3()).set(0, 0, 0);
      sources.forEach((s, i) => s[k] && d.addScaledVector(s[k], weights[i]));
      if (k === 'moonDir' || k === 'dir') d.normalize();
    } else if (typeof v === 'number') {
      let n = 0;
      sources.forEach((s, i) => { n += (s[k] ?? v) * weights[i]; });
      target[k] = n;
    } else if (isPlainObject(v)) {
      target[k] = blendInto(target[k] || {}, sources.map((s) => s[k] || v), weights);
    }
  }
  return target;
}

export class Atmosphere {
  constructor(region) {
    const defaults = region.atmosphereDefaults || {};
    this.areas = region.areas.map((a) => ({
      id: a.id,
      center: new THREE.Vector2(a.center[0], a.center[1]),
      reach: a.reach ?? 70,
      palette: parse(deepMerge(defaults, a.atmosphere || {})),
    }));
    this.current = blendInto({}, this.areas.map((a) => a.palette), this.areas.map((_, i) => (i === 0 ? 1 : 0)));
    this.weights = this.areas.map(() => 0);
    this.dominant = this.areas[0].id;
  }

  /** Blend palettes for a world position (x, z); `forceArea` pins one area (photo mode). */
  update(x, z, forceArea = null) {
    let total = 0;
    this.areas.forEach((a, i) => {
      let w;
      if (forceArea) w = a.id === forceArea ? 1 : 0;
      else {
        const d = Math.hypot(x - a.center.x, z - a.center.y) / a.reach;
        w = Math.exp(-d * d);
      }
      this.weights[i] = w;
      total += w;
    });
    if (total < 1e-6) {
      // far from everything: use the nearest area
      let best = 0, bd = Infinity;
      this.areas.forEach((a, i) => { const d = Math.hypot(x - a.center.x, z - a.center.y); if (d < bd) { bd = d; best = i; } });
      this.weights.fill(0);
      this.weights[best] = 1;
      total = 1;
    }
    let maxW = -1;
    this.areas.forEach((a, i) => {
      this.weights[i] /= total;
      if (this.weights[i] > maxW) { maxW = this.weights[i]; this.dominant = a.id; }
    });
    // only blend areas that matter (keeps the work small)
    const idx = this.weights.map((w, i) => [w, i]).filter(([w]) => w > 0.002).map(([, i]) => i);
    const sum = idx.reduce((s, i) => s + this.weights[i], 0);
    blendInto(this.current, idx.map((i) => this.areas[i].palette), idx.map((i) => this.weights[i] / sum));
    return this.current;
  }
}
