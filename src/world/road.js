import * as THREE from 'three';
import { smoothstep } from '../engine/noise.js';
import { stylize } from '../render/materials.js';

// The cobblestone road that links every area: a centripetal Catmull-Rom
// spline sampled every metre, with a smoothed height profile, a coarse
// distance field for terrain shaping and a crowned ribbon mesh.
// `branches` (lists of points) are lanes off the main road: their samples
// follow the main road's in the same arrays, `segs` marks where each starts.

const STEP = 1.0;

/** Strength of the stylized wet sheen; areas can tint it via atmosphere.road.sheen. */
export const roadSheen = { value: 1.2 };

export class Road {
  constructor(def, bounds) {
    this.def = def;
    this.width = def.width ?? 6;
    this.half = this.width / 2;
    const lines = [def.points, ...(def.branches || []).map((b) => b.points ?? b)];
    const curves = lines.map((l) => new THREE.CatmullRomCurve3(l.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal'));
    this.curve = curves[0];
    this.length = this.curve.getLength();
    const counts = curves.map((c) => Math.max(2, Math.ceil(c.getLength() / STEP)) + 1);
    this.n = counts.reduce((a, b) => a + b, 0);
    this.x = new Float32Array(this.n);
    this.z = new Float32Array(this.n);
    this.tx = new Float32Array(this.n);
    this.tz = new Float32Array(this.n);
    this.y = new Float32Array(this.n);
    this.seg = new Uint8Array(this.n); // which line each sample belongs to (0 = the main road)
    this.segs = [];
    let i = 0;
    curves.forEach((curve, si) => {
      const n = counts[si] - 1;
      this.segs.push({ start: i, end: i + n });
      for (let k = 0; k <= n; k++, i++) {
        const u = k / n;
        const p = curve.getPointAt(u);
        const t = curve.getTangentAt(u);
        this.x[i] = p.x; this.z[i] = p.z;
        const l = Math.hypot(t.x, t.z) || 1;
        this.tx[i] = t.x / l; this.tz[i] = t.z / l;
        this.seg[i] = si;
      }
    });
    this.buildHash();
    this.buildDistanceField(bounds);
  }

  buildHash() {
    this.cell = 8;
    this.hash = new Map();
    for (let i = 0; i < this.n; i++) {
      const k = `${Math.floor(this.x[i] / this.cell)},${Math.floor(this.z[i] / this.cell)}`;
      let a = this.hash.get(k);
      if (!a) this.hash.set(k, (a = []));
      a.push(i);
    }
  }

  /** Exact nearest sample within ~3 cells; falls back to the distance field. */
  nearest(x, z) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = -1, bd = Infinity;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const a = this.hash.get(`${cx + dx},${cz + dz}`);
        if (!a) continue;
        for (const i of a) {
          const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
      }
    }
    if (best < 0) return { i: -1, dist: this.coarseDistance(x, z), side: 0 };
    const side = (x - this.x[best]) * -this.tz[best] + (z - this.z[best]) * this.tx[best];
    return { i: best, dist: Math.sqrt(bd), side };
  }

  buildDistanceField({ minX, minZ, size }) {
    const res = 4;
    const n = Math.ceil(size / res) + 1;
    this.df = { minX, minZ, res, n, d: new Float32Array(n * n) };
    const sub = 4; // every 4th sample is plenty for a coarse field
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = minX + i * res, z = minZ + j * res;
        let bd = Infinity;
        for (let s = 0; s < this.n; s += sub) {
          const d = (this.x[s] - x) ** 2 + (this.z[s] - z) ** 2;
          if (d < bd) bd = d;
        }
        this.df.d[j * n + i] = Math.sqrt(bd);
      }
    }
  }

  coarseDistance(x, z) {
    const { minX, minZ, res, n, d } = this.df;
    const fx = Math.min(n - 1.001, Math.max(0, (x - minX) / res));
    const fz = Math.min(n - 1.001, Math.max(0, (z - minZ) / res));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = d[j * n + i], b = d[j * n + i + 1], c = d[(j + 1) * n + i], e = d[(j + 1) * n + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v;
  }

  distance(x, z) {
    const c = this.coarseDistance(x, z);
    return c < 26 ? this.nearest(x, z).dist : c;
  }

  /** Height profile: terrain sampled along the road, then smoothed. */
  setHeights(heightFn) {
    const raw = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) raw[i] = heightFn(this.x[i], this.z[i]);
    const R = 18;
    for (const { start, end } of this.segs) {
      for (let i = start; i <= end; i++) {
        let s = 0, w = 0;
        for (let k = -R; k <= R; k++) {
          const j = Math.min(end, Math.max(start, i + k));
          const wk = 1 - Math.abs(k) / (R + 1);
          s += raw[j] * wk; w += wk;
        }
        this.y[i] = s / w;
      }
    }
    // a lane that starts or ends on another line eases onto that line's height
    const BLEND = 16;
    for (let si = 1; si < this.segs.length; si++) {
      const { start, end } = this.segs[si];
      for (const [i0, dir] of [[start, 1], [end, -1]]) {
        let best = -1, bd = 16; // within 4 m
        for (let j = 0; j < this.n; j++) {
          if (this.seg[j] === si) continue;
          const d = (this.x[j] - this.x[i0]) ** 2 + (this.z[j] - this.z[i0]) ** 2;
          if (d < bd) { bd = d; best = j; }
        }
        if (best < 0) continue;
        const yj = this.y[best];
        for (let k = 0; k < BLEND; k++) {
          const i = i0 + k * dir;
          if (i < start || i > end) break;
          this.y[i] = yj + (this.y[i] - yj) * smoothstep(0, BLEND, k);
        }
      }
    }
  }

  buildMesh(assets, tintAt) {
    const across = [-1.08, -1, -0.6, -0.2, 0.2, 0.6, 1, 1.08];
    const rows = this.n, cols = across.length;
    const pos = new Float32Array(rows * cols * 3);
    const uv = new Float32Array(rows * cols * 2);
    const col = new Float32Array(rows * cols * 3);
    const idx = [];
    const tmp = new THREE.Color();
    for (let r = 0; r < rows; r++) {
      const nx = -this.tz[r], nz = this.tx[r];
      tintAt(this.x[r], this.z[r], tmp);
      for (let c = 0; c < cols; c++) {
        const a = across[c];
        const k = r * cols + c;
        const off = a * this.half;
        const edge = Math.abs(a) > 1.01;
        const crown = 0.1 * (1 - Math.min(1, a * a));
        pos[k * 3] = this.x[r] + nx * off;
        pos[k * 3 + 1] = this.y[r] + (edge ? -0.04 : crown + 0.02) - (this.seg[r] ? 0.025 : 0); // lanes tuck under the road at a junction
        pos[k * 3 + 2] = this.z[r] + nz * off;
        const us = this.def.material?.uvScale ?? 3.2;
        uv[k * 2] = (off + this.half) / us;
        uv[k * 2 + 1] = (r * STEP) / us;
        const e = smoothstep(0.75, 1.05, Math.abs(a)); // darker, mossier edges
        col[k * 3] = tmp.r * (1 - 0.18 * e);
        col[k * 3 + 1] = tmp.g * (1 - 0.12 * e);
        col[k * 3 + 2] = tmp.b * (1 - 0.16 * e);
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      if (this.seg[r] !== this.seg[r + 1]) continue;
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const M = this.def.material || {};
    const tex = assets.pbr(M.texture || 'cobblestone_floor_01', [1, 1]);
    if (M.matte) {
      // painted surface: plain matte dirt, no sheen at all
      const mat = new THREE.MeshStandardMaterial({ ...tex, vertexColors: true, color: M.color ?? 0x9a8a80, roughness: 1, envMapIntensity: 0.25 });
      // same albedo lift as the terrain's ground layer so path and grass sit in one value range
      const boost = (M.boost ?? 2.4).toFixed(2);
      mat.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb *= ${boost};`);
      };
      stylize(mat, { rim: 0.05 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.name = 'road';
      return (this.mesh = mesh);
    }
    const mat = new THREE.MeshPhysicalMaterial({
      ...tex,
      vertexColors: true,
      color: 0x6a6280,
      roughness: 0.36,
      metalness: 0.1,
      normalScale: new THREE.Vector2(1.6, 1.6),
      clearcoat: 0.55,
      clearcoatRoughness: 0.12,
      clearcoatNormalMap: tex.normalMap,
      clearcoatNormalScale: new THREE.Vector2(1.2, 1.2),
      iridescence: 1.0,
      iridescenceIOR: 1.45,
      iridescenceThicknessMap: tex.map,
      iridescenceThicknessRange: [120, 950],
      envMapIntensity: 0.38,
    });
    // Stylized thin-film sheen: each stone top shimmers through an
    // orange -> pink -> teal palette with view angle (the ref's oil-slick wet look).
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.sheenAmount = roadSheen;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float sheenAmount;')
        .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
          {
            vec3 stone = texture2D(map, vMapUv).rgb;
            float top = smoothstep(0.32, 0.5, dot(stone, vec3(0.333)));
            float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
            float fr = pow(1.0 - ndv, 1.6);
            vec2 cell = floor(vMapUv * vec2(8.0, 8.0));
            float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
            vec2 q = vMapUv * 0.35;
            float broad = sin(q.x * 3.1 + sin(q.y * 1.7)) * 0.5 + sin(q.y * 2.3 + q.x * 0.7) * 0.5;
            float phase = fr * 0.9 + h * 0.55 + broad * 0.45 + stone.r * 0.8;
            vec3 film = 0.5 + 0.5 * cos(6.2831 * (phase + vec3(0.0, 0.34, 0.62)));
            film = film * film * 1.6;
            totalEmissiveRadiance += film * top * fr * sheenAmount;
          }`);
    };
    stylize(mat, { rim: 0.1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'road';
    this.mesh = mesh;
    return mesh;
  }
}
