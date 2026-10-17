import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, Noise2D } from '../engine/noise.js';
import { stylize, canvasTexture, triplanar } from '../render/materials.js';

// Procedural pines and rocks, scattered into chunked InstancedMeshes with
// two levels of detail. Chunks switch LOD / hide by camera distance.

function colorize(geo, fn) {
  const p = geo.attributes.position;
  const c = new Float32Array(p.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), col);
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

/** A pine: trunk + stacked jagged, drooping skirts. Height ~1 unit (scaled per instance). */
export function pineGeometry({ tiers = 7, segs = 11, seed = 3, lod = 0 } = {}) {
  const rand = mulberry32(seed);
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.012, 0.03, 0.32, lod ? 4 : 6, 1);
  trunk.translate(0, 0.16, 0);
  colorize(trunk, (x, y, z, c) => c.setRGB(0.09, 0.06, 0.06));
  parts.push(trunk.toNonIndexed());
  const T = lod ? 3 : tiers;
  const S = lod ? 6 : segs;
  for (let t = 0; t < T; t++) {
    const f = t / (T - 1);
    const top = 0.28 + f * 0.72 + (lod ? 0.02 : 0);
    const radius = (1 - f * 0.85) * 0.26 + 0.02;
    const len = 0.3 - f * 0.12;
    const pos = [];
    const apex = [0, top, 0];
    for (let s = 0; s < S; s++) {
      const a0 = (s / S) * Math.PI * 2 + rand() * 0.2;
      const a1 = ((s + 1) / S) * Math.PI * 2;
      const r0 = radius * (0.82 + rand() * 0.35);
      const r1 = radius * (0.82 + rand() * 0.35);
      const droop0 = top - len * (0.9 + rand() * 0.25);
      const droop1 = top - len * (0.9 + rand() * 0.25);
      // a jagged tip between the two rim points
      const am = (a0 + a1) / 2;
      const rm = radius * (0.55 + rand() * 0.15);
      const ym = top - len * 0.7;
      const p0 = [Math.cos(a0) * r0, droop0, Math.sin(a0) * r0];
      const p1 = [Math.cos(a1) * r1, droop1, Math.sin(a1) * r1];
      const pm = [Math.cos(am) * rm, ym, Math.sin(am) * rm];
      pos.push(...apex, ...p1, ...pm, ...apex, ...pm, ...p0);
      // underside so the skirt has some thickness from below
      const inner = [0, top - len * 0.75, 0];
      pos.push(...inner, ...p0, ...pm, ...inner, ...pm, ...p1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    // bend normals outward/up for soft, rounded shading
    const p = g.attributes.position, nrm = g.attributes.normal;
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), (p.getY(i) - top) * 0.6 + 0.4, p.getZ(i)).normalize();
      n.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).lerp(v, 0.65).normalize();
      nrm.setXYZ(i, n.x, n.y, n.z);
    }
    const uvs = [];
    for (let i = 0; i < p.count; i++) {
      uvs.push(Math.atan2(p.getZ(i), p.getX(i)) / Math.PI * 1.5, (top - p.getY(i)) / len);
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    colorize(g, (x, y, z, c) => {
      const rr = Math.hypot(x, z) / radius;
      const tip = Math.min(1, rr);
      c.setRGB(0.05 + 0.07 * tip, 0.12 + 0.12 * tip + 0.05 * f, 0.1 + 0.07 * tip);
    });
    parts.push(g);
  }
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  if (!merged.attributes.uv) merged.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(merged.attributes.position.count * 2), 2));
  return merged;
}

/**
 * Card pine (near LOD): a dark core cone per tier for density, plus rings of
 * drooping crossed fir-bough cards (alpha-tested CC0 needle texture) so the
 * silhouette is ragged and needly instead of faceted. Height ~1 unit.
 * Vertex colour: shade (rgb). The 'aCard' attribute is 1 on cards, 0 on core/trunk.
 */
export function cardPineGeometry({ tiers = 7, seed = 3 } = {}) {
  const rand = mulberry32(seed);
  const parts = [];
  const tag = (g, card, shade) => {
    const n = g.attributes.position.count;
    g.setAttribute('aCard', new THREE.Float32BufferAttribute(new Float32Array(n).fill(card), 1));
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = shade[0]; col[i * 3 + 1] = shade[1]; col[i * 3 + 2] = shade[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    return g.index ? g.toNonIndexed() : g;
  };
  const trunk = new THREE.CylinderGeometry(0.012, 0.03, 0.4, 6, 1);
  trunk.translate(0, 0.2, 0);
  parts.push(tag(trunk, 0, [0.12, 0.08, 0.07]));
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const top = 0.26 + f * 0.74;
    const radius = (1 - f * 0.86) * 0.27 + 0.03;
    const len = 0.28 - f * 0.12;
    // dark core: fills the gaps between boughs
    const core = new THREE.ConeGeometry(radius * 0.62, len * 1.05, 8, 1, true);
    core.translate(0, top - len * 0.52, 0);
    parts.push(tag(core, 0, [0.05, 0.1, 0.08]));
    const n = Math.max(4, Math.round(10 - f * 6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.5;
      const L = radius * (1.0 + rand() * 0.25), Wd = L * 0.36;
      const droop = 0.35 + rand() * 0.2;
      for (const cross of [0, 1]) {
        const q = new THREE.PlaneGeometry(L, Wd, 2, 1);
        q.translate(L / 2, 0, 0); // base at the trunk
        if (cross) q.rotateX(Math.PI / 2);
        // droop: bend along its length
        const p = q.attributes.position;
        for (let k = 0; k < p.count; k++) {
          const x = p.getX(k);
          p.setY(k, p.getY(k) - droop * x * x / L);
        }
        q.rotateY(-a);
        q.translate(0, top - len * 0.25 - rand() * len * 0.15, 0);
        const sh = 0.75 + rand() * 0.4;
        parts.push(tag(q, 1, [sh, sh, sh]));
      }
    }
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  // normals point out from the tree axis: soft, rounded shading for cards
  const p = g.attributes.position, nrm = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), 0.35, p.getZ(i)).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/** Lumpy rock: displaced icosahedron, ~1 unit wide. */
export function rockGeometry(seed = 1, detail = 2) {
  const rand = mulberry32(seed);
  let g = new THREE.IcosahedronGeometry(0.5, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const freq = [1 + rand() * 2, 1 + rand() * 2, 1 + rand() * 2];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = 1 + 0.18 * Math.sin(v.x * 6 * freq[0] + seed) * Math.cos(v.z * 5 * freq[1]) + 0.1 * Math.sin(v.y * 9 * freq[2]);
    v.multiplyScalar(d);
    v.y *= 0.62;
    if (v.y < -0.12) v.y = -0.12 + (v.y + 0.12) * 0.3; // flattish bottom
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) + p.getZ(i) * 0.7) * 1.2;
    uv[i * 2 + 1] = p.getY(i) * 1.2 + p.getZ(i) * 0.3;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Jagged crag: ridged multi-axis noise displacement, vertical stretch and
 * stepped strata ledges; faceted (flat normals) for a chiselled look.
 * ~1 unit wide, ~1.6 tall, base at y=0.
 */
export function cragGeometry(seed = 1, detail = 3) {
  const N = new Noise2D(seed * 13 + 1);
  let g = new THREE.IcosahedronGeometry(0.5, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n3 = (a, b, c) => (N.noise(a, b) + N.noise(b + 11.3, c) + N.noise(c - 7.1, a)) / 3;
    const ridged = 1 - Math.abs(n3(v.x * 3, v.y * 3, v.z * 3));
    const d = 0.75 + 0.35 * ridged + 0.18 * n3(v.x * 7, v.y * 7, v.z * 7);
    v.multiplyScalar(d);
    // taper toward the top, flare at the base
    const t = v.y + 0.5;
    const taper = 1.05 - 0.45 * Math.max(0, t - 0.2);
    v.x *= taper; v.z *= taper;
    v.y = t * 1.6;
    // strata ledges
    const step = 0.16;
    const q = Math.floor(v.y / step) * step;
    v.y = q + (v.y - q) * 0.45 + step * 0.27;
    if (v.y < 0.05) v.y = -0.1;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g = g.toNonIndexed();
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

let _needles;
function needleTexture() {
  return (_needles ||= canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#9a9a9a';
    g.fillRect(0, 0, w, h);
    const r = mulberry32(5);
    for (let i = 0; i < 900; i++) {
      const x = r() * w, y = r() * h, l = 6 + r() * 14;
      const b = 110 + r() * 145;
      g.strokeStyle = `rgb(${b},${b},${b})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 4, y + l);
      g.stroke();
    }
  }, { repeat: true }));
}

/**
 * Collects instances of a kind, then bakes them into spatial chunks with
 * near/far InstancedMeshes.
 */
export class InstancedScatter {
  constructor({ name, near, far = null, material, farMaterial = null, chunk = 64, nearDist = 110, farDist = 420, castShadow = true }) {
    Object.assign(this, { name, near, far, material, farMaterial: farMaterial || material, chunk, nearDist, farDist, castShadow });
    this.items = [];
    this.chunks = [];
    this.group = new THREE.Group();
    this.group.name = name;
  }

  add(x, y, z, scale, rotY = 0, tilt = 0, sx = 1) {
    this.items.push({ x, y, z, scale, rotY, tilt, sx });
  }

  build() {
    const byChunk = new Map();
    for (const it of this.items) {
      const k = `${Math.floor(it.x / this.chunk)},${Math.floor(it.z / this.chunk)}`;
      let a = byChunk.get(k);
      if (!a) byChunk.set(k, (a = []));
      a.push(it);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (const items of byChunk.values()) {
      const make = (geo, mat, shadow) => {
        const im = new THREE.InstancedMesh(geo, mat, items.length);
        items.forEach((it, i) => {
          e.set(it.tilt, it.rotY, it.tilt * 0.5);
          q.setFromEuler(e);
          s.set(it.scale * it.sx, it.scale, it.scale * it.sx);
          p.set(it.x, it.y, it.z);
          m.compose(p, q, s);
          im.setMatrixAt(i, m);
        });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.castShadow = shadow;
        if (mat.userData.depthMaterial) im.customDepthMaterial = mat.userData.depthMaterial;
        im.receiveShadow = true;
        this.group.add(im);
        return im;
      };
      const nearMesh = make(this.near, this.material, this.castShadow);
      const farMesh = this.far ? make(this.far, this.farMaterial, false) : null;
      const center = nearMesh.boundingSphere.center.clone();
      this.chunks.push({ center, radius: nearMesh.boundingSphere.radius, nearMesh, farMesh });
    }
    return this.group;
  }

  update(cam) {
    for (const c of this.chunks) {
      const d = Math.max(0, Math.hypot(cam.x - c.center.x, cam.z - c.center.z) - c.radius * 0.5);
      const isNear = d < this.nearDist || !c.farMesh;
      c.nearMesh.visible = isNear && d < this.farDist;
      if (c.farMesh) c.farMesh.visible = !isNear && d < this.farDist;
    }
  }
}

export function makePineScatter(assets) {
  const bough = assets.texture('assets/textures/fir_branch.png', { srgb: true });
  bough.wrapS = bough.wrapT = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: bough, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.2 });
  // core/trunk parts ignore the bough texture (aCard = 0)
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCard;\nvarying float vCard;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCard = aCard;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCard;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
        vec4 mc = texture2D(map, vMapUv);
        if (vCard > 0.5) diffuseColor *= mc; else diffuseColor.rgb *= vec3(0.32, 0.45, 0.34);
      #endif`);
  };
  stylize(mat, { rim: 0.12, rimPower: 4.0, sway: 0.012, swayHeight: 1 });
  // alpha-tested shadows: the depth pass must respect the bough cut-outs
  mat.userData.depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: bough, alphaTest: 0.42, side: THREE.DoubleSide });
  const farMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x9a9a9a, roughness: 0.95, envMapIntensity: 0.2 });
  stylize(farMat, { rim: 0.12, rimPower: 4.0 });
  return new InstancedScatter({
    name: 'pines',
    near: cardPineGeometry({ seed: 11 }),
    far: pineGeometry({ seed: 11, lod: 1 }),
    material: mat,
    farMaterial: farMat,
    nearDist: 80,
  });
}

export function rockMaterial(assets, color = 0x8a7f9a, scale = 0.25) {
  const tex = assets.pbr('rock_face', [1, 1]);
  const mat = new THREE.MeshStandardMaterial({ ...tex, color, roughness: 0.85, envMapIntensity: 0.7, normalScale: new THREE.Vector2(1.6, 1.6) });
  triplanar(mat, scale);
  return stylize(mat, { rim: 0.15, rimPower: 3.5 });
}

export function makeCragScatter(assets) {
  return new InstancedScatter({
    name: 'crags', near: cragGeometry(3, 3), far: cragGeometry(3, 2),
    material: rockMaterial(assets, 0x9a88aa, 0.09), nearDist: 160, farDist: 600,
  });
}

export function makeRockScatter(assets) {
  const mat = rockMaterial(assets);
  return new InstancedScatter({ name: 'rocks', near: rockGeometry(4, 3), far: rockGeometry(4, 1), material: mat, nearDist: 90 });
}
