import * as THREE from 'three';
import { mulberry32, Noise2D } from '../engine/noise.js';
import { stylize } from '../render/materials.js';
import { skullGroup } from './characters.js';
import {
  Builder, boxUV, cylUV, wall, gableRoofGeometry,
  faceWindows, glowMaterial, stoneMaterial, baseMaterials, archGeometry,
} from './architecture.js';

// Buildings and props of the painted surface (Vaelmoor). Everything is matte:
// the oil-paint look comes from the post pass, not from shine.

const block = (b, key, w, h, d, x, y, z, ry = 0, uv = 3) =>
  b.add(key, boxUV(new THREE.BoxGeometry(w, h, d).applyMatrix4(b.m(x, y + h / 2, z, ry)), uv));

function matte(ctx, tex, color, { rim = 0.15, normalScale = 1.4 } = {}) {
  return stoneMaterial(ctx.assets, tex, color, { rim, roughness: 1, envMapIntensity: 0.15, normalScale });
}

function darkGlass() {
  const m = new THREE.MeshBasicMaterial({ color: 0x050407, side: THREE.DoubleSide });
  m.userData.emissive = true;
  return m;
}

/** Jagged the top ring of an open cylinder (broken masonry). */
function breakTop(geo, h, rand, depth) {
  const p = geo.attributes.position;
  const top = h / 2;
  const cuts = new Map();
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < top - 1e-3) continue;
    const a = Math.round(Math.atan2(p.getZ(i), p.getX(i)) * 100);
    if (!cuts.has(a)) cuts.set(a, rand() < 0.35 ? rand() * depth : rand() * depth * 0.25);
    p.setY(i, top - cuts.get(a));
  }
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------ dark_01 cottage

/** Squat stone cottage: steep slate roof, tall chimney, deep arched doorway. */
export function stoneCottage(ctx, o = {}) {
  const b = new Builder();
  const W = o.w ?? 8, D = o.d ?? 5.5, H = o.h ?? 3.2, RH = o.roofH ?? 3.6, CH = o.chimney ?? 6.4;
  block(b, 'stone', W, H, D, 0, 0, 0, 0, 1.8);
  b.add('stone', boxUV(gableRoofGeometry(W, D, RH, 0).applyMatrix4(b.m(0, H, 0)), 1.8));
  b.add('roof', boxUV(gableRoofGeometry(W + 0.6, D + 0.8, RH + 0.5, 0.35).applyMatrix4(b.m(0, H - 0.25, 0)), 1.6));
  // gabled porch with the arched door on the right end
  block(b, 'stone', 3.4, H + 0.8, 3.2, W / 2 + 1.2, 0, 0.6, 0, 2);
  b.add('stone', boxUV(gableRoofGeometry(3.2, 3.4, 2.4, 0).applyMatrix4(b.m(W / 2 + 1.2, H + 0.8, 0.6, Math.PI / 2)), 2));
  b.add('roof', boxUV(gableRoofGeometry(3.6, 3.8, 2.7, 0.2).applyMatrix4(b.m(W / 2 + 1.2, H + 0.6, 0.6, Math.PI / 2)), 1.6));
  b.add('void', archGeometry(1.5, 2.6), b.m(W / 2 + 1.2, 0, 2.23));
  const ring = new THREE.TorusGeometry(0.95, 0.24, 6, 14, Math.PI);
  b.add('stone', cylUV(ring), b.m(W / 2 + 1.2, 1.85, 2.25));
  for (const sx of [-1, 1]) block(b, 'stone', 0.5, 1.9, 0.5, W / 2 + 1.2 + sx * 0.95, 0, 2.25, 0, 1.2);
  // tall chimney on the left gable
  block(b, 'stone', 1.6, H + CH, 1.6, -W / 2 - 0.2, 0, -0.3, 0, 1.6);
  block(b, 'stone', 1.9, 0.5, 1.9, -W / 2 - 0.2, H + CH, -0.3, 0, 1.6);
  // a small dark window
  b.add('void', archGeometry(0.7, 0.9, false), b.m(-1.2, 1.3, D / 2 + 0.03));
  const mats = {
    ...baseMaterials(ctx.assets),
    stone: matte(ctx, 'rock_wall_10', o.stone ?? 0xd0d4e0, { normalScale: 2.6 }),
    roof: matte(ctx, 'roof_slates_02', o.roof ?? 0x6a6e80, { rim: 0.2 }),
    void: darkGlass(),
  };
  return { object: b.build(mats), colliders: [{ x: 0, z: 0, r: 4.6 }, { x: W / 2 + 1.2, z: 0.6, r: 2.2 }, { x: -W / 2 - 0.2, z: -0.3, r: 1.2 }] };
}

// ------------------------------------------------------------ ruins

/** Broken round tower with a jagged top and a dark doorway (dark_06). */
export function ruinedTower(ctx, o = {}) {
  const rand = mulberry32(o.seed ?? 3);
  const b = new Builder();
  const r = o.radius ?? 4.5, h = o.height ?? 26;
  const g = breakTop(new THREE.CylinderGeometry(r * 0.88, r, h, 20, 10, true), h, rand, o.broken ?? 6);
  b.add('stone', cylUV(g), b.m(0, h / 2, 0));
  const inner = breakTop(new THREE.CylinderGeometry(r * 0.75, r * 0.86, h - 0.4, 20, 10, true), h - 0.4, rand, o.broken ?? 6);
  inner.scale(-1, 1, 1); // inward-facing inner wall
  b.add('stone', cylUV(inner), b.m(0, (h - 0.4) / 2, 0));
  b.add('void', archGeometry(1.6, 3.2), b.m(0, 0, r + 0.05));
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2, y = 6 + rand() * (h - 12);
    b.add('void', archGeometry(0.5, 1.4), b.m(Math.sin(a) * (r * 0.95 - (y / h) * r * 0.12 + 0.05), y, Math.cos(a) * (r * 0.95 - (y / h) * r * 0.12 + 0.05), a));
  }
  const mats = { ...baseMaterials(ctx.assets), stone: matte(ctx, o.texture ?? 'rustic_stone_wall', o.stone ?? 0x6a6470), void: darkGlass() };
  return { object: b.build(mats), colliders: [{ x: 0, z: 0, r: r + 0.3 }] };
}

/** Black stepped monolith tower, tapering in tiers (dark_04). */
export function monolithTower(ctx, o = {}) {
  const rand = mulberry32(o.seed ?? 9);
  const b = new Builder();
  let w = o.width ?? 12, y = 0;
  const tiers = o.tiers ?? 6;
  for (let i = 0; i < tiers; i++) {
    const h = (o.height ?? 60) / tiers * (1.1 - i * 0.05);
    block(b, 'stone', w, h, w * 0.85, (rand() - 0.5) * 0.6, y, (rand() - 0.5) * 0.6, 0, 3);
    // buttress ribs
    for (const sx of [-1, 1]) block(b, 'stone', 0.8, h * 0.9, 0.9, sx * w * 0.42, y, w * 0.43, 0, 2);
    if (i < tiers - 1) faceWindows(b, { cx: 0, cz: w * 0.425 + 0.02, ry: 0, y0: y + h * 0.3, cols: 2, rows: 1, dx: w * 0.3, dy: 0, w: 0.5, h: 1.8, key: 'void', lit: 1, rand });
    y += h;
    w *= 0.82;
  }
  const cap = new THREE.ConeGeometry(w * 0.6, 6, 4);
  cap.rotateY(Math.PI / 4);
  b.add('stone', boxUV(cap.applyMatrix4(b.m(0, y + 3, 0)), 2));
  const mats = { ...baseMaterials(ctx.assets), stone: matte(ctx, 'castle_wall_slates', o.stone ?? 0x2a2630, { rim: 0.1 }), void: darkGlass() };
  return { object: b.build(mats), colliders: [{ x: 0, z: 0, r: (o.width ?? 12) * 0.6 }] };
}

/** Ruined stone arch; `broken` knocks the top off one side. */
export function ruinedArch(ctx, o = {}) {
  const b = new Builder();
  const span = o.span ?? 4, h = o.height ?? 5, t = o.thick ?? 1.4, pw = o.pillar ?? 1.2;
  for (const sx of [-1, 1]) {
    const ph = sx > 0 && o.broken ? h * 0.75 : h;
    block(b, 'stone', pw, ph, t, sx * (span / 2 + pw / 2), 0, 0, 0, 1.6);
  }
  const arcLen = o.broken ? Math.PI * 0.62 : Math.PI;
  const arch = new THREE.TorusGeometry(span / 2 + pw / 2, pw / 2, 6, 14, arcLen);
  arch.scale(1, 1, t / pw);
  if (o.broken) arch.rotateZ(Math.PI - arcLen);
  b.add('stone', cylUV(arch, 1.6), b.m(0, h, 0));
  block(b, 'stone', span + pw * 2 + 0.6, 0.5, t + 0.4, 0, -0.2, 0, 0, 1.6);
  const mats = { ...baseMaterials(ctx.assets), stone: matte(ctx, o.texture ?? 'rustic_stone_wall', o.stone ?? 0x4a4650) };
  return { object: b.build(mats), colliders: [{ x: -(span / 2 + pw / 2), z: 0, r: pw * 0.7 }, { x: span / 2 + pw / 2, z: 0, r: pw * 0.7 }] };
}

/** Square crenellated keep on a curtain wall (dark_08). */
export function darkKeep(ctx, o = {}) {
  const rand = mulberry32(o.seed ?? 11);
  const b = new Builder();
  const K = 10, KH = o.height ?? 28;
  block(b, 'stone', K, KH, K, 0, 0, 0, 0, 3);
  const hw = K / 2;
  for (const [x0, z0, x1, z1] of [[-hw, hw, hw, hw], [-hw, -hw, hw, -hw], [-hw, -hw, -hw, hw], [hw, -hw, hw, hw]]) {
    wall(b, { x0, z0, x1, z1, y: KH, h: 0.01, t: 1, mh: 1.4 });
  }
  faceWindows(b, { cx: 0, cz: hw + 0.02, ry: 0, y0: KH * 0.45, cols: 2, rows: 2, dx: 3.4, dy: 6, w: 0.7, h: 1.8, key: o.lit ? 'glow' : 'void', lit: 0.5, rand });
  wall(b, { x0: hw, z0: 2, x1: hw + 22, z1: 4, h: 11, t: 2.5, mh: 1.3 });
  wall(b, { x0: -hw, z0: 2, x1: -hw - 16, z1: 5, h: 10, t: 2.5, mh: 1.3 });
  for (const [x, z, h] of [[hw + 23, 4, 16], [-hw - 17, 5, 14]]) {
    block(b, 'stone', 5, h, 5, x, 0, z, 0, 3);
    for (const [a0, b0, a1, b1] of [[-2.5, 2.5, 2.5, 2.5], [-2.5, -2.5, 2.5, -2.5], [-2.5, -2.5, -2.5, 2.5], [2.5, -2.5, 2.5, 2.5]]) {
      wall(b, { x0: x + a0, z0: z + b0, x1: x + a1, z1: z + b1, y: h, h: 0.01, t: 0.8, mh: 1.1 });
    }
  }
  const mats = {
    ...baseMaterials(ctx.assets),
    stone: matte(ctx, 'castle_wall_slates', o.stone ?? 0x5a5260),
    void: darkGlass(),
    glow: glowMaterial(o.windowColor ?? '#ff7a3a', 2.2, 'none'),
  };
  return { object: b.build(mats), colliders: [{ x: 0, z: 0, r: K * 0.75 }] };
}

/** Twin-spired gothic cathedral on a plinth (dark_10). */
export function cathedral(ctx, o = {}) {
  const rand = mulberry32(o.seed ?? 23);
  const b = new Builder();
  const nave = { w: 14, h: 26, d: 34 };
  block(b, 'stone', nave.w, nave.h, nave.d, 0, 0, -nave.d / 2, 0, 3);
  b.add('roof', boxUV(gableRoofGeometry(nave.d, nave.w, 10, 0.4).applyMatrix4(b.m(0, nave.h, -nave.d / 2, Math.PI / 2)), 2.5));
  // west front: two tall square towers with octagonal spires and pinnacles
  for (const sx of [-1, 1]) {
    const x = sx * 9.5, th = 54;
    block(b, 'stone', 7, th, 7, x, 0, 0, 0, 3);
    for (const k of [0.25, 0.5, 0.75]) block(b, 'stone', 7.6, 0.8, 7.6, x, th * k, 0, 0, 2); // string courses
    faceWindows(b, { cx: x, cz: 3.52, ry: 0, y0: 10, cols: 1, rows: 4, dx: 0, dy: 10, w: 1.4, h: 6.5, key: 'void', lit: 1, rand });
    const sp = new THREE.ConeGeometry(4.2, 26, 8, 1, true);
    b.add('stone', cylUV(sp, 2), b.m(x, th + 13, 0));
    for (const [px, pz] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) {
      block(b, 'stone', 1, 4, 1, x + px, th, pz, 0, 1);
      b.add('stone', new THREE.ConeGeometry(0.7, 4, 4), b.m(x + px, th + 6, pz));
    }
    b.add('trim', new THREE.CylinderGeometry(0.08, 0.15, 4, 5), b.m(x, th + 27, 0));
  }
  // facade between the towers: rose window above a deep portal
  block(b, 'stone', 12, 34, 3, 0, 0, 1.2, 0, 3);
  b.add('stone', boxUV(gableRoofGeometry(3, 12, 7, 0).applyMatrix4(b.m(0, 34, 1.2, Math.PI / 2)), 3));
  b.add(o.lit ? 'rose' : 'void', new THREE.CircleGeometry(3.2, 24).translate(0, 3.2, 0), b.m(0, 20, 2.74));
  b.add('void', archGeometry(4, 9), b.m(0, 0, 2.74));
  // flying buttresses along the nave
  for (let i = 0; i < 5; i++) {
    const z = -5 - i * 6.5;
    for (const sx of [-1, 1]) {
      block(b, 'stone', 1.4, 18, 1.4, sx * 11.5, 0, z, 0, 2);
      b.add('stone', new THREE.ConeGeometry(0.9, 4, 4), b.m(sx * 11.5, 20, z));
      const fly = new THREE.BoxGeometry(4.5, 0.8, 1);
      b.add('stone', boxUV(fly.applyMatrix4(b.m(sx * 9.3, 19.5, z, 0, 1, 1, 1, 0, sx * 0.55)), 2));
    }
    faceWindows(b, { cx: 7.02, cz: z - 3.2, ry: Math.PI / 2, y0: 9, cols: 1, rows: 1, dx: 0, dy: 0, w: 2, h: 9, key: 'void', lit: 1, rand });
    faceWindows(b, { cx: -7.02, cz: z - 3.2, ry: -Math.PI / 2, y0: 9, cols: 1, rows: 1, dx: 0, dy: 0, w: 2, h: 9, key: 'void', lit: 1, rand });
  }
  // crossing tower
  block(b, 'stone', 9, 14, 9, 0, nave.h, -nave.d * 0.62, 0, 3);
  b.add('stone', cylUV(new THREE.ConeGeometry(6, 22, 8, 1, true), 2), b.m(0, nave.h + 25, -nave.d * 0.62));
  const mats = {
    ...baseMaterials(ctx.assets),
    stone: matte(ctx, 'castle_wall_slates', o.stone ?? 0x6a5a58),
    roof: matte(ctx, 'roof_slates_02', o.roof ?? 0x3a3440),
    void: darkGlass(),
    rose: glowMaterial(o.windowColor ?? '#ff5a3a', 1.6, 'stained'),
  };
  return { object: b.build(mats), colliders: [{ x: 0, z: -nave.d / 2, r: 12 }, { x: -9.5, z: 0, r: 5 }, { x: 9.5, z: 0, r: 5 }, { x: 0, z: 1, r: 6 }] };
}

/** One side of a narrow alley: a row of tall stone houses (dark_02/12). Runs along -Z, faces +X. */
export function alleyRow(ctx, o = {}) {
  const rand = mulberry32(o.seed ?? 31);
  const b = new Builder();
  const len = o.length ?? 40;
  let z = 0;
  while (z < len) {
    const d = 5 + rand() * 4, h = 9 + rand() * 9, w = 6;
    block(b, 'stone', w, h, d, -w / 2, 0, -z - d / 2, 0, 2);
    // overhanging upper storey
    if (rand() < 0.6) block(b, 'stone', w + 0.8, 3, d, -w / 2 + 0.4, h * 0.55, -z - d / 2, 0, 2);
    b.add('roof', boxUV(gableRoofGeometry(d, w, 3 + rand() * 2, 0.3).applyMatrix4(b.m(-w / 2, h, -z - d / 2, Math.PI / 2)), 2));
    faceWindows(b, { cx: 0.02, cz: -z - d / 2, ry: Math.PI / 2, y0: 3 + rand() * 2, cols: 1 + Math.floor(rand() * 2), rows: 2, dx: 2.2, dy: 3.5, w: 0.7, h: 1.2, key: 'void', lit: 1, rand, arch: false });
    z += d + 0.05;
  }
  const mats = {
    ...baseMaterials(ctx.assets),
    stone: matte(ctx, 'rustic_stone_wall', o.stone ?? 0x6a5a70),
    roof: matte(ctx, 'roof_slates_02', o.roof ?? 0x3a3048),
    void: darkGlass(),
  };
  const colliders = [];
  for (let k = 0; k < len; k += 4) colliders.push({ x: -3, z: -k - 2, r: 3 });
  return { object: b.build(mats), colliders };
}

// ------------------------------------------------------------ props

/** Campfire: stone ring, logs, layered flame cones, ember sparks, flickering light. */
export function campfire(ctx, o = {}) {
  const g = new THREE.Group();
  const color = new THREE.Color(o.color ?? '#ff3a1a');
  const stone = matte(ctx, 'rock_face', 0x5a5054);
  const rand = mulberry32(7);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + rand() * 0.06, 0), stone);
    s.position.set(Math.cos(a) * 0.6, 0.08, Math.sin(a) * 0.6);
    s.castShadow = true;
    g.add(s);
  }
  const wood = stylize(new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 1 }), { rim: 0.1 });
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.9, 6), wood);
    l.rotation.set(1.1, (i / 4) * Math.PI * 2, 0);
    l.position.y = 0.25;
    g.add(l);
  }
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.7 + i * 0.35), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.2 - i * 0.05, 0.6 - i * 0.12, 7, 1, true), m);
    f.position.y = 0.45;
    g.add(f);
    flames.push(f);
  }
  return {
    object: g,
    colliders: [{ x: 0, z: 0, r: 0.7 }],
    lights: [{ x: 0, y: 0.9, z: 0, color: o.color ?? '#ff3a1a', intensity: o.light ?? 7, distance: 9, flicker: 0.3 }],
    glows: [{ x: 0, z: 0, radius: 2.2, color: o.color ?? '#ff3a1a', intensity: 0.12 }],
    update: (dt, t) => {
      flames.forEach((f, i) => {
        const k = 1 + 0.18 * Math.sin(t * (9 + i * 3) + i) + 0.1 * Math.sin(t * 23 + i * 2);
        f.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k));
        f.rotation.y = t * (0.5 + i * 0.3);
      });
    },
  };
}

/** Giant horned (ram) skull half sunk in the snow (dark_08). */
export function hornedSkull(ctx, o = {}) {
  const bone = stylize(new THREE.MeshStandardMaterial({ color: o.color ?? 0x8a90a8, roughness: 1, normalMap: ctx.assets.pbr('rock_face', [1, 1], { color: false, rough: false }).normalMap, normalScale: new THREE.Vector2(0.6, 0.6) }), { rim: 0.25 });
  const g = new THREE.Group();
  const sk = skullGroup(bone, { scale: 1 });
  sk.scale.set(9, 7, 12); // long animal skull
  sk.position.y = 0.6;
  sk.rotation.x = 0.35;
  g.add(sk);
  // spiral ram horns
  for (const sx of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = t * Math.PI * 1.7;
      const r = 0.25 + t * 0.9;
      pts.push(new THREE.Vector3(sx * (0.45 + t * 0.6 + Math.sin(a) * 0.15), 1.5 + Math.cos(a) * r - 0.4, -0.3 - Math.sin(a) * r * 1.1));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 60, 1, 10, false);
    const p = tube.attributes.position, n = tube.attributes.normal;
    const c = new THREE.Vector3();
    for (let i = 0; i <= 60; i++) {
      curve.getPointAt(i / 60, c);
      const r = 0.32 * (1 - (i / 60) * 0.85) * (1 + 0.08 * Math.sin(i * 1.7));
      for (let j = 0; j <= 10; j++) {
        const k = i * 11 + j;
        p.setXYZ(k, c.x + n.getX(k) * r, c.y + n.getY(k) * r, c.z + n.getZ(k) * r);
      }
    }
    tube.computeVertexNormals();
    const h = new THREE.Mesh(tube, bone);
    h.castShadow = true;
    g.add(h);
  }
  g.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = true; } });
  return { object: g, colliders: [{ x: 0, z: 0, r: 1.2 }] };
}

/** Barrow mound with a stone door frame and stairs going down (the way into the Gloaming). */
export function barrow(ctx, o = {}) {
  const b = new Builder();
  const N = new Noise2D(o.seed ?? 4);
  // turf mound: a squashed, lumpy hemisphere with a cut for the entrance
  const mound = new THREE.SphereGeometry(7, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = mound.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.08 * N.noise(x * 0.4, z * 0.4);
    p.setXYZ(i, x * k * 1.1, y * 0.5 * k, z * k);
  }
  mound.computeVertexNormals();
  b.add('turf', mound, b.m(0, -0.2, -2));
  // dolmen door frame: two uprights and a capstone, a dark mouth behind
  block(b, 'stone', 0.9, 3, 1.2, -1.6, 0, 4.6, 0, 1.2);
  block(b, 'stone', 0.9, 3, 1.2, 1.6, 0, 4.6, 0, 1.2);
  block(b, 'stone', 4.4, 0.8, 1.5, 0, 3, 4.6, 0, 1.2);
  // the stairwell (a terrain trench) is lined with stone walls and roofed; a black mouth at the bottom
  block(b, 'stone', 0.5, 4.6, 8, -1.45, -3.6, 0.8, 0, 1.2);
  block(b, 'stone', 0.5, 4.6, 8, 1.45, -3.6, 0.8, 0, 1.2);
  block(b, 'stone', 3.4, 0.5, 8, 0, 0.6, 0.8, 0, 1.2);
  b.add('void', new THREE.PlaneGeometry(2.6, 4).translate(0, -2.2, 0), b.m(0, 0, -3));
  const mats = {
    ...baseMaterials(ctx.assets),
    stone: matte(ctx, o.texture ?? 'mossy_rock', o.stone ?? 0x6a7078),
    turf: matte(ctx, 'leafy_grass', o.turf ?? 0x3a5a3a, { rim: 0.1 }),
    void: darkGlass(),
  };
  return {
    object: b.build(mats),
    colliders: [{ x: 0, z: -3, r: 5.5 }, { x: -3.2, z: 2.5, r: 2.2 }, { x: 3.2, z: 2.5, r: 2.2 }, { x: -1.6, z: 4.6, r: 0.6 }, { x: 1.6, z: 4.6, r: 0.6 }],
    door: { x: 0, y: 1.4, z: 5.2, name: 'Barrow' },
  };
}

