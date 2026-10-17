// Deterministic RNG + 2D gradient noise for world generation.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class Noise2D {
  constructor(seed = 1) {
    const rand = mulberry32(seed);
    this.perm = new Uint8Array(512);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.gx = new Float32Array(256);
    this.gy = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const a = rand() * Math.PI * 2;
      this.gx[i] = Math.cos(a);
      this.gy[i] = Math.sin(a);
    }
  }

  /** Gradient noise, roughly in [-1, 1]. */
  noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const P = this.perm;
    const g = (ix, iy, dx, dy) => {
      const h = P[(P[ix & 255] + iy) & 511];
      return this.gx[h] * dx + this.gy[h] * dy;
    };
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = g(xi, yi, xf, yf);
    const b = g(xi + 1, yi, xf - 1, yf);
    const c = g(xi, yi + 1, xf, yf - 1);
    const d = g(xi + 1, yi + 1, xf - 1, yf - 1);
    return 1.4 * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
  }

  /** fbm in roughly [-1, 1]. */
  fbm(x, y, octaves = 4) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      s += amp * this.noise(x * f + i * 17.3, y * f - i * 9.1);
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return s / norm;
  }
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
