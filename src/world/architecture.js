import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture, stylize } from '../render/materials.js';

// Modular building kit: every building collects its pieces into a few
// "buckets" (one per material) and merges them, so a whole castle is a
// handful of draw calls.

/** Box-projected UVs in world units (dominant normal axis per vertex). */
export function boxUV(geo, scale = 3) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  // per-triangle dominant axis so faces don't smear
  for (let t = 0; t < p.count; t += 3) {
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < 3; k++) { nx += Math.abs(n.getX(t + k)); ny += Math.abs(n.getY(t + k)); nz += Math.abs(n.getZ(t + k)); }
    for (let k = 0; k < 3; k++) {
      const i = t + k;
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let u, v;
      if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z; v = y; } else { u = x; v = y; }
      uv[i * 2] = u / scale; uv[i * 2 + 1] = v / scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Cylindrical UVs in world units (for towers and spires). */
export function cylUV(geo, scale = 3) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let t = 0; t < p.count; t += 3) {
    // keep the seam from wrapping across a triangle
    const a = [0, 1, 2].map((k) => Math.atan2(p.getX(t + k), p.getZ(t + k)));
    const ref = a[0];
    for (let k = 0; k < 3; k++) {
      let ang = a[k];
      if (ang - ref > Math.PI) ang -= Math.PI * 2;
      if (ref - ang > Math.PI) ang += Math.PI * 2;
      const i = t + k;
      const r = Math.hypot(p.getX(i), p.getZ(i));
      uv[i * 2] = (ang * Math.max(r, 2)) / scale;
      uv[i * 2 + 1] = p.getY(i) / scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Glowing window textures (canvas): plain arched glass with mullions, or stained glass. */
const windowTexCache = new Map();
export function windowTexture(style = 'mullion') {
  if (windowTexCache.has(style)) return windowTexCache.get(style);
  const t = canvasTexture(64, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h * 0.6, 4, w / 2, h * 0.6, h * 0.65);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(1, '#8a8a8a');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    if (style === 'stained') {
      const cols = ['#ff4fa8', '#ffd040', '#45e0ff', '#7dff6a', '#b06cff', '#ff8040'];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
        g.fillStyle = cols[(x * 3 + y * 5) % cols.length];
        g.globalAlpha = 0.85;
        g.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
      }
      g.globalAlpha = 1;
      g.strokeStyle = '#1a1020';
      g.lineWidth = 3;
      for (let x = 0; x <= 4; x++) { g.beginPath(); g.moveTo(x * 16, 0); g.lineTo(x * 16, h); g.stroke(); }
      for (let y = 0; y <= 8; y++) { g.beginPath(); g.moveTo(0, y * 16); g.lineTo(w, y * 16); g.stroke(); }
    } else if (style === 'mullion') {
      g.fillStyle = '#141018';
      g.fillRect(w / 2 - 3, 0, 6, h);
      g.fillRect(0, h * 0.55, w, 6);
    } else if (style === 'panes') {
      g.fillStyle = '#20140c';
      g.fillRect(w / 2 - 3, 0, 6, h);
      g.fillRect(0, h * 0.33, w, 5);
      g.fillRect(0, h * 0.66, w, 5);
    }
    // frame
    g.strokeStyle = '#100c14';
    g.lineWidth = 6;
    g.strokeRect(0, 0, w, h);
  });
  windowTexCache.set(style, t);
  return t;
}

/** Arched window shape geometry, facing +Z, bottom-centre at origin. */
const archCache = new Map();
export function archGeometry(w, h, arch = true) {
  const key = `${w}:${h}:${arch}`;
  if (archCache.has(key)) return archCache.get(key);
  let g;
  if (arch) {
    const s = new THREE.Shape();
    const r = w / 2;
    s.moveTo(-r, 0);
    s.lineTo(r, 0);
    s.lineTo(r, h - r);
    s.absarc(0, h - r, r, 0, Math.PI, false);
    s.lineTo(-r, 0);
    g = new THREE.ShapeGeometry(s, 6);
  } else {
    g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
  }
  // UVs 0..1 over the bounding box
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / w + 0.5; uv[i * 2 + 1] = p.getY(i) / h; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  archCache.set(key, g);
  return g;
}

/**
 * Collects geometry per material key and merges them at the end.
 * `add(key, geometry, matrix)`; `build(materials)` returns a Group.
 */
export class Builder {
  constructor() { this.buckets = new Map(); this.tmp = new THREE.Matrix4(); }

  add(key, geo, matrix) {
    const g = geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = []));
    b.push(g.index ? g.toNonIndexed() : g);
  }

  /** Helper: compose a matrix from position / rotationY / scale. */
  m(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
      new THREE.Vector3(sx, sy, sz),
    );
  }

  build(materials, { castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    for (const [key, geos] of this.buckets) {
      const mat = materials[key];
      if (!mat) { console.warn('no material for', key); continue; }
      const merged = mergeGeometries(geos);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = key;
      const emissive = mat.userData?.emissive;
      mesh.castShadow = castShadow && !emissive;
      mesh.receiveShadow = receiveShadow && !emissive;
      group.add(mesh);
    }
    return group;
  }
}

// ---------------------------------------------------------------- pieces

/** Round tower (open-ended cylinder walls + top cap). Returns top Y. */
export function roundTower(b, { x = 0, z = 0, y = 0, r = 4, h = 20, segs = 18, stone = 'stone', taper = 0.96 }) {
  const g = cylUV(new THREE.CylinderGeometry(r * taper, r, h, segs, 4, false));
  b.add(stone, g, b.m(x, y + h / 2, z));
  return y + h;
}

/** Ring of merlons on top of a round tower. */
export function roundCrenels(b, { x = 0, z = 0, y = 0, r = 4, count = 14, mh = 1.2, mw = null, stone = 'stone', corbel = true }) {
  const ring = cylUV(new THREE.CylinderGeometry(r * 1.08, r * 1.0, 1.0, 24, 1));
  b.add(stone, ring, b.m(x, y + 0.5, z));
  if (corbel) {
    const c = cylUV(new THREE.CylinderGeometry(r * 1.0, r * 0.92, 1.4, 24, 1, true));
    b.add(stone, c, b.m(x, y - 0.7, z));
  }
  const w = mw ?? (2 * Math.PI * r * 1.08) / count * 0.55;
  const mer = boxUV(new THREE.BoxGeometry(w, mh, 0.7));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    b.add(stone, mer, b.m(x + Math.sin(a) * r * 1.04, y + 1.0 + mh / 2, z + Math.cos(a) * r * 1.04, a));
  }
}

/** Conical spire with a small finial. */
export function spire(b, { x = 0, z = 0, y = 0, r = 4, h = 14, segs = 12, roof = 'roof', eave = 1.12, finial = true }) {
  const g = cylUV(new THREE.ConeGeometry(r * eave, h, segs, 6, true), 2.2);
  b.add(roof, g, b.m(x, y + h / 2, z));
  if (finial) {
    const f = new THREE.CylinderGeometry(0.06, 0.12, h * 0.18, 5);
    b.add('trim', f, b.m(x, y + h + h * 0.08, z));
    const ball = new THREE.SphereGeometry(r * 0.06 + 0.12, 8, 6);
    b.add('trim', ball, b.m(x, y + h + 0.05, z));
  }
}

/** Straight wall from (x0,z0) to (x1,z1), optionally crenellated. */
export function wall(b, { x0, z0, x1, z1, y = 0, h = 10, t = 2.2, crenels = true, stone = 'stone', mh = 1.2 }) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ang = Math.atan2(x1 - x0, z1 - z0);
  const g = boxUV(new THREE.BoxGeometry(t, h, len));
  // Box UVs must be in world units after placement, so bake transform first.
  const mx = b.m((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2, ang);
  b.add(stone, boxUV(g.applyMatrix4(mx)));
  if (crenels) {
    const n = Math.max(2, Math.floor(len / 2.4));
    const mer = new THREE.BoxGeometry(t * 1.05, mh, len / n * 0.55);
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      const mm = b.m(x0 + (x1 - x0) * f, y + h + mh / 2, z0 + (z1 - z0) * f, ang);
      b.add(stone, boxUV(mer.clone().applyMatrix4(mm), 2));
    }
  }
}

/** Gabled roof prism along local X, ridge height rh, placed at y on a w x d footprint. */
export function gableRoofGeometry(w, d, rh, overhang = 0.6) {
  const W = w / 2 + overhang, D = d / 2 + overhang;
  const s = new THREE.Shape();
  s.moveTo(-D, 0);
  s.lineTo(D, 0);
  s.lineTo(0, rh);
  s.lineTo(-D, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: W * 2, bevelEnabled: false });
  g.translate(0, 0, -W);
  g.rotateY(Math.PI / 2);
  return g;
}

/** Places arched windows around a round tower. */
export function towerWindows(b, { x = 0, z = 0, y0, r, rows = 2, perRow = 4, spacing = 5, w = 1.0, h = 2.4, key = 'glowGreen', lit = 0.8, rand = Math.random, phase = 0 }) {
  const geo = archGeometry(w, h);
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < perRow; i++) {
      const a = phase + (i / perRow) * Math.PI * 2 + (row % 2) * (Math.PI / perRow);
      const k = rand() < lit ? key : 'darkGlass';
      b.add(k, geo, b.m(x + Math.sin(a) * (r + 0.06), y0 + row * spacing, z + Math.cos(a) * (r + 0.06), a));
    }
  }
}

/** Places windows on a flat face. Face normal given by ry (0 = +Z). */
export function faceWindows(b, { cx, cz, ry, y0, cols, rows, dx, dy, w, h, key, lit = 0.8, rand = Math.random, arch = true, offset = 0.06 }) {
  const geo = archGeometry(w, h, arch);
  const sx = Math.cos(ry), sz = -Math.sin(ry); // local +X in world
  const nx = Math.sin(ry), nz = Math.cos(ry);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const o = (c - (cols - 1) / 2) * dx;
      const k = rand() < lit ? key : 'darkGlass';
      b.add(k, geo, b.m(cx + sx * o + nx * offset, y0 + r * dy, cz + sz * o + nz * offset, ry));
    }
  }
}

// ---------------------------------------------------------------- materials

export function glowMaterial(hex, intensity, style = 'mullion') {
  const c = new THREE.Color(hex).multiplyScalar(intensity);
  const m = new THREE.MeshBasicMaterial({ color: c, map: windowTexture(style), side: THREE.DoubleSide });
  m.userData.emissive = true;
  return m;
}

export function stoneMaterial(assets, tex, color, { roughness = 0.85, rim = 0.35, envMapIntensity = 0.6, normalScale = 1.2 } = {}) {
  const t = assets.pbr(tex, [1, 1]);
  const m = new THREE.MeshStandardMaterial({ ...t, color, roughness, envMapIntensity, normalScale: new THREE.Vector2(normalScale, normalScale) });
  return stylize(m, { rim });
}

export function baseMaterials(assets, o = {}) {
  const darkGlass = new THREE.MeshStandardMaterial({ color: 0x0a0814, roughness: 0.2, metalness: 0.4, side: THREE.DoubleSide });
  darkGlass.userData.emissive = true;
  return {
    darkGlass,
    trim: stylize(new THREE.MeshStandardMaterial({ color: o.trim ?? 0x3a3048, roughness: 0.35, metalness: 0.7 }), { rim: 0.6 }),
  };
}
