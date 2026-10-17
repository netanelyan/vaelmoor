import * as THREE from 'three';
import { mulberry32 } from '../engine/noise.js';
import { stylize } from '../render/materials.js';
import {
  Builder, boxUV, cylUV, roundTower, roundCrenels, wall, gableRoofGeometry,
  towerWindows, faceWindows, glowMaterial, stoneMaterial, baseMaterials, archGeometry,
} from './architecture.js';

// Manor (ref_01), timber house (ref_04/05), storybook cottages (ref_09) and
// the sandstone castle (ref_06). Same contract as buildings.js:
// { object, colliders, lights, glows, chimney? } in local space, front = +Z.

function woodMaterial(ctx, color, rim = 0.3) {
  return stoneMaterial(ctx.assets, 'dark_wooden_planks', color, { rim, roughness: 0.75, normalScale: 1.0 });
}

function roofMaterial(ctx, tex, color, { roughness = 0.6, rim = 0.4 } = {}) {
  return stylize(new THREE.MeshStandardMaterial({ ...ctx.assets.pbr(tex, [1, 1]), color, roughness, envMapIntensity: 0.9 }), { rim });
}

/** Box with world-scale UVs, baked at its final transform (y = base height). */
function block(b, key, w, h, d, x, y, z, ry = 0, uvScale = 3) {
  b.add(key, boxUV(new THREE.BoxGeometry(w, h, d).applyMatrix4(b.m(x, y + h / 2, z, ry)), uvScale));
}

/** Timber beam strips on a wall face (face normal = ry), for half-timbered walls. */
function timberFrame(b, { cx, cz, ry, y0, w, h, key = 'beam', diag = true, posts = 4 }) {
  const sx = Math.cos(ry), sz = -Math.sin(ry);
  const nx = Math.sin(ry) * 0.06, nz = Math.cos(ry) * 0.06;
  const beam = (x0, ya, x1, yb) => {
    const len = Math.hypot(x1 - x0, yb - ya);
    const ang = Math.atan2(yb - ya, x1 - x0);
    const mx = (x0 + x1) / 2, my = (ya + yb) / 2;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(cx + sx * mx + nx, my, cz + sz * mx + nz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, ang, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    );
    b.add(key, boxUV(new THREE.BoxGeometry(len, 0.22, 0.12).applyMatrix4(m), 1.5));
  };
  beam(-w / 2, y0, w / 2, y0);
  beam(-w / 2, y0 + h, w / 2, y0 + h);
  for (let i = 0; i <= posts; i++) {
    const x = -w / 2 + (w * i) / posts;
    beam(x, y0, x, y0 + h);
    if (diag && i < posts && i % 2 === 0) beam(x, y0, x + w / posts, y0 + h * 0.6);
  }
}

// ---------------------------------------------------------------- ref_01 manor

/** Dark haunted manor: tall gabled block, corner tower, porch, tall green windows. */
export function manor(ctx, o = {}) {
  const rand = mulberry32(o.seed ?? 31);
  const b = new Builder();
  const G = 'glowGreen';
  const green = o.windowColor ?? '#4dff7a';
  block(b, 'wall', 20, 15, 12, 0, 0, 0, 0, 2.5);
  b.add('roof', boxUV(gableRoofGeometry(20, 12, 9, 0.9).applyMatrix4(b.m(0, 15, 0)), 2.5));
  // front cross-gable
  block(b, 'wall', 8, 17, 4, 0, 0, 7, 0, 2.5);
  b.add('roof', boxUV(gableRoofGeometry(4, 8, 6, 0.6).applyMatrix4(b.m(0, 17, 7, Math.PI / 2)), 2.5));
  // side wing
  block(b, 'wall', 10, 10, 10, -14, 0, 1, 0, 2.5);
  b.add('roof', boxUV(gableRoofGeometry(10, 10, 6, 0.7).applyMatrix4(b.m(-14, 10, 1)), 2.5));
  // corner tower with a steep pyramid spire
  const tx = 11, tz = 5;
  block(b, 'wall', 5.5, 22, 5.5, tx, 0, tz, 0, 2.5);
  const pyr = new THREE.ConeGeometry(4.6, 11, 4, 1, true);
  pyr.rotateY(Math.PI / 4);
  b.add('roof', boxUV(pyr.applyMatrix4(b.m(tx, 22 + 5.5, tz)), 2));
  b.add('trim', new THREE.CylinderGeometry(0.05, 0.08, 2.5, 5), b.m(tx, 34, tz));
  // chimneys
  for (const [x, z, h] of [[-6, -2, 9], [5, -3, 10], [-16, 2, 7]]) block(b, 'brick', 1.4, h, 1.4, x, 13, z, 0, 1.5);
  // porch with columns and a little roof
  block(b, 'wall', 7, 0.6, 3.5, 0, 0, 10.6, 0, 2);
  for (const x of [-3, 3]) b.add('trim', new THREE.CylinderGeometry(0.18, 0.2, 3.6, 8), b.m(x, 2.4, 12));
  b.add('roof', boxUV(gableRoofGeometry(8, 3.5, 1.4, 0.3).applyMatrix4(b.m(0, 4.2, 11, Math.PI / 2)), 2));
  b.add('glowGreenDim', archGeometry(1.8, 3.2), b.m(0, 0.6, 9.06));
  // windows: tall, narrow, arched, mostly lit green
  faceWindows(b, { cx: 0, cz: 6, ry: 0, y0: 1.5, cols: 4, rows: 3, dx: 4.4, dy: 4.6, w: 1.1, h: 3.0, key: G, lit: 0.85, rand });
  faceWindows(b, { cx: 0, cz: 9.02, ry: 0, y0: 5.5, cols: 2, rows: 2, dx: 3.0, dy: 5, w: 1.0, h: 3.2, key: G, lit: 1, rand });
  b.add(G, archGeometry(1.6, 1.6), b.m(0, 15.4, 9.04));
  faceWindows(b, { cx: -14, cz: 6.02, ry: 0, y0: 2, cols: 2, rows: 2, dx: 4, dy: 4.2, w: 1.0, h: 2.6, key: G, lit: 0.8, rand });
  faceWindows(b, { cx: tx, cz: tz + 2.77, ry: 0, y0: 3, cols: 1, rows: 4, dx: 0, dy: 4.6, w: 1.0, h: 2.8, key: G, lit: 0.9, rand });
  faceWindows(b, { cx: tx + 2.77, cz: tz, ry: Math.PI / 2, y0: 3, cols: 1, rows: 4, dx: 0, dy: 4.6, w: 1.0, h: 2.8, key: G, lit: 0.7, rand });
  faceWindows(b, { cx: 10, cz: 0, ry: Math.PI / 2, y0: 2, cols: 2, rows: 3, dx: 4, dy: 4.6, w: 1.0, h: 2.8, key: G, lit: 0.6, rand });
  // dormers on the main roof
  for (const x of [-6, 6]) {
    block(b, 'wall', 2.2, 2.4, 2.5, x, 16.5, 4.2, 0, 2);
    b.add('roof', boxUV(gableRoofGeometry(2.5, 2.2, 1.6, 0.25).applyMatrix4(b.m(x, 18.9, 4.2, Math.PI / 2)), 2));
    b.add(G, archGeometry(0.9, 1.6), b.m(x, 17, 5.47));
  }
  const mats = {
    ...baseMaterials(ctx.assets),
    wall: woodMaterial(ctx, o.wallColor ?? 0x3a3044, 0.35),
    brick: stoneMaterial(ctx.assets, 'castle_wall_slates', 0x4a3a44, { rim: 0.3 }),
    roof: roofMaterial(ctx, 'roof_slates_02', o.roofColor ?? 0x2a2230, { roughness: 0.45, rim: 0.5 }),
    glowGreen: glowMaterial(green, 1.7, 'panes'),
    glowGreenDim: glowMaterial(green, 1.2, 'panes'),
  };
  const L = (x, y, z, i, d = 22) => ({ x, y, z, color: green, intensity: i, distance: d });
  return {
    object: b.build(mats),
    colliders: [{ x: 0, z: 0, r: 10.5 }, { x: -9, z: 0, r: 5 }, { x: -16, z: 1, r: 5 }, { x: 11, z: 5, r: 3.6 }, { x: 0, z: 8, r: 4 }],
    lights: [L(0, 0.5, 13.5, 9, 11), L(-7, 0.5, 9.5, 4, 8), L(7, 0.5, 9.5, 4, 8)],
    glows: [
      { x: 0, z: 16, radius: 9, color: green, intensity: 0.8, stretch: 1.6 },
      { x: -9, z: 11, radius: 6, color: green, intensity: 0.45 },
      { x: 10, z: 11, radius: 6, color: green, intensity: 0.45 },
    ],
  };
}

// ---------------------------------------------------------------- ref_04/05 timber house

/** Two-storey half-timbered house: stone ground floor, jettied plaster upper floor, steep roof. */
export function timberHouse(ctx, o = {}) {
  const rand = mulberry32(o.seed ?? 41);
  const b = new Builder();
  const W = o.w ?? 11, D = o.d ?? 8;
  const W2 = 'glowWarm';
  const warm = o.windowColor ?? '#ffc45a';
  block(b, 'stone', W, 3.4, D, 0, 0, 0, 0, 2.5);
  block(b, 'plaster', W + 1.0, 3.4, D + 1.0, 0, 3.4, 0, 0, 3); // jettied upper floor
  timberFrame(b, { cx: 0, cz: (D + 1) / 2, ry: 0, y0: 3.4, w: W + 1, h: 3.3, posts: 6 });
  timberFrame(b, { cx: 0, cz: -(D + 1) / 2, ry: Math.PI, y0: 3.4, w: W + 1, h: 3.3, posts: 6 });
  timberFrame(b, { cx: (W + 1) / 2, cz: 0, ry: Math.PI / 2, y0: 3.4, w: D + 1, h: 3.3, posts: 4 });
  timberFrame(b, { cx: -(W + 1) / 2, cz: 0, ry: -Math.PI / 2, y0: 3.4, w: D + 1, h: 3.3, posts: 4 });
  // gable-end infill + roof
  b.add('plaster', boxUV(gableRoofGeometry(W + 0.6, D + 0.6, 5.4, 0).applyMatrix4(b.m(0, 6.8, 0)), 3));
  b.add('roof', boxUV(gableRoofGeometry(W + 1.4, D + 1.2, 6.0, 0.9).applyMatrix4(b.m(0, 6.75, 0)), 2.2));
  // a front dormer
  block(b, 'plaster', 3.2, 2.6, 3, 1.5, 6.6, (D + 1) / 2 - 1.2, 0, 3);
  b.add('roof', boxUV(gableRoofGeometry(3, 3.4, 2.2, 0.4).applyMatrix4(b.m(1.5, 9.2, (D + 1) / 2 - 1.2, Math.PI / 2)), 2.2));
  b.add(W2, archGeometry(1.4, 1.5, false), b.m(1.5, 7.2, (D + 1) / 2 + 0.33));
  // stone chimney through the roof
  block(b, 'stone', 1.5, 9.5, 1.5, -W / 2 + 1.6, 4, -1.2, 0, 1.5);
  block(b, 'stone', 1.9, 0.5, 1.9, -W / 2 + 1.6, 13.5, -1.2, 0, 1.5);
  // door + windows
  block(b, 'beam', 1.7, 2.6, 0.2, W / 2 - 2.4, 0, D / 2 + 0.05, 0, 1.5);
  b.add(W2, archGeometry(1.3, 2.3), b.m(W / 2 - 2.4, 0, D / 2 + 0.17));
  faceWindows(b, { cx: -1.5, cz: D / 2, ry: 0, y0: 0.9, cols: 2, rows: 1, dx: 3.2, dy: 0, w: 1.3, h: 1.5, key: W2, lit: 1, rand, arch: false });
  faceWindows(b, { cx: 0, cz: (D + 1) / 2 + 0.04, ry: 0, y0: 4.2, cols: 4, rows: 1, dx: 2.8, dy: 0, w: 1.2, h: 1.6, key: W2, lit: 0.9, rand, arch: false });
  faceWindows(b, { cx: (W + 1) / 2 + 0.04, cz: 0, ry: Math.PI / 2, y0: 4.2, cols: 2, rows: 1, dx: 3.4, dy: 0, w: 1.2, h: 1.6, key: W2, lit: 1, rand, arch: false });
  faceWindows(b, { cx: W / 2, cz: 0, ry: Math.PI / 2, y0: 0.9, cols: 2, rows: 1, dx: 3.4, dy: 0, w: 1.2, h: 1.4, key: W2, lit: 1, rand, arch: false });
  const mats = {
    ...baseMaterials(ctx.assets),
    stone: stoneMaterial(ctx.assets, 'rock_wall_10', 0x8a7a80, { rim: 0.3 }),
    plaster: stoneMaterial(ctx.assets, 'plastered_wall_02', o.plaster ?? 0xd8c8b0, { rim: 0.25, roughness: 0.9, normalScale: 0.6 }),
    beam: woodMaterial(ctx, 0x2a1a14, 0.25),
    roof: roofMaterial(ctx, o.thatch ? 'thatch_roof_angled' : 'roof_slates_02', o.roofColor ?? 0x4a3a50, { roughness: 0.7, rim: 0.45 }),
    glowWarm: glowMaterial(warm, 2.4, 'panes'),
  };
  const L = (x, y, z, i, d = 16) => ({ x, y, z, color: warm, intensity: i, distance: d, flicker: 0.08 });
  return {
    object: b.build(mats),
    colliders: [{ x: -2.5, z: 0, r: 5.2 }, { x: 2.5, z: 0, r: 5.2 }],
    lights: [L(0, 1.5, D / 2 + 2.5, 12), L(W / 2 + 2, 1.5, 0, 7)],
    glows: [
      { x: -1.5, z: D / 2 + 3, radius: 5, color: warm, intensity: 0.55, stretch: 1.8 },
      { x: W / 2 - 2.4, z: D / 2 + 2.2, radius: 3.5, color: warm, intensity: 0.6 },
      { x: W / 2 + 2.5, z: 0, radius: 4, color: warm, intensity: 0.35, rotY: Math.PI / 2, stretch: 1.6 },
    ],
    chimney: [-W / 2 + 1.6, 14.2, -1.2],
  };
}

// ---------------------------------------------------------------- ref_09 storybook cottage

const PLASTERS = [0x9a8a7a, 0x8a7488, 0x7a8498, 0x9a8c6a];
const THATCHES = [0x6a4a6a, 0x5a3a5a, 0x7a5a4a, 0x4a3a6a];

/** Small crooked storybook cottage with a sagging steep roof and stained glass. */
export function cottage(ctx, o = {}) {
  const rand = mulberry32(o.seed ?? 51);
  const b = new Builder();
  const W = o.w ?? 6 + rand() * 2, D = o.d ?? 5 + rand() * 1.5, H = o.h ?? 3.2 + rand() * 1.2;
  const warm = o.windowColor ?? '#ffb44a';
  block(b, 'plaster', W, H, D, 0, 0, 0, 0, 2.5);
  timberFrame(b, { cx: 0, cz: D / 2, ry: 0, y0: 0.2, w: W, h: H - 0.3, posts: 3, diag: rand() < 0.6 });
  timberFrame(b, { cx: W / 2, cz: 0, ry: Math.PI / 2, y0: 0.2, w: D, h: H - 0.3, posts: 2, diag: false });
  // gable-end infill + steep overhanging roof
  const rh = 3.8 + rand() * 1.6;
  b.add('plaster', boxUV(gableRoofGeometry(W, D, rh, 0).applyMatrix4(b.m(0, H, 0)), 2.5));
  b.add('roof', boxUV(gableRoofGeometry(W + 0.8, D + 0.8, rh + 0.4, 0.8).applyMatrix4(b.m(0, H - 0.25, 0)), 2));
  // door, windows, round stained-glass window in the gable
  b.add('door', archGeometry(1.2, 2.2), b.m(-W * 0.22, 0, D / 2 + 0.04));
  b.add('glowWarm', archGeometry(1.0, 1.0, false), b.m(W * 0.2, 1.1, D / 2 + 0.05));
  b.add('stained', new THREE.CircleGeometry(0.75, 16).translate(0, 0.75, 0), b.m(0, H + 0.5, D / 2 + 0.05));
  b.add('glowWarm', archGeometry(0.9, 1.1, false), b.m(W / 2 + 0.05, 1.2, 0, Math.PI / 2));
  if (rand() < 0.5) b.add('stained', archGeometry(0.8, 1.4), b.m(-W / 2 - 0.05, 1.0, 0, -Math.PI / 2));
  // crooked chimney
  block(b, 'stone', 0.9, rh + 1.6, 0.9, W * 0.28, H - 0.6, -D * 0.15, 0.15, 1.2);
  const lean = (rand() < 0.5 ? -1 : 1) * (0.06 + rand() * 0.07), twist = (rand() - 0.5) * 0.16, sag = 0.35 + rand() * 0.3;
  const deform = (v) => {
    const t = Math.max(0, v.y) / (H + rh);
    v.x += lean * v.y * 0.6;
    const a = twist * t * 3;
    const c = Math.cos(a), s = Math.sin(a);
    const x = v.x * c - v.z * s;
    v.z = v.x * s + v.z * c;
    v.x = x;
    if (v.y > H) v.y -= (sag * Math.cos((v.x / (W + 2)) * Math.PI) * (v.y - H)) / rh; // sagging ridge
  };
  const mats = {
    ...baseMaterials(ctx.assets),
    plaster: stoneMaterial(ctx.assets, 'plastered_wall_02', o.plaster ?? PLASTERS[Math.floor(rand() * 4)], { rim: 0.3, roughness: 0.9, normalScale: 0.6 }),
    beam: woodMaterial(ctx, 0x2a1a14, 0.25),
    stone: stoneMaterial(ctx.assets, 'rock_wall_10', 0x8a7a80, { rim: 0.3 }),
    roof: roofMaterial(ctx, 'thatch_roof_angled', o.roofColor ?? THATCHES[Math.floor(rand() * 4)], { roughness: 0.85, rim: 0.45 }),
    door: glowMaterial(warm, 2.0, 'panes'),
    glowWarm: glowMaterial(warm, 4.2, 'panes'),
    stained: glowMaterial('#ffffff', 3.4, 'stained'),
  };
  return {
    object: b.build(mats, { deform }),
    colliders: [{ x: 0, z: 0, r: Math.max(W, D) * 0.55 }],
    lights: [{ x: 0, y: 1.6, z: D / 2 + 1.5, color: warm, intensity: 6, distance: 10, flicker: 0.1 }],
    glows: [{ x: W * 0.1, z: D / 2 + 2, radius: 3.5, color: warm, intensity: 0.5, stretch: 1.4 }],
    chimney: [W * 0.28 + lean * (H + rh) * 0.6, H + rh + 1.0, -D * 0.15],
  };
}

// ---------------------------------------------------------------- ref_06 sandstone castle

/** Warm sandstone castle: round crenellated towers, curtain walls, gatehouse, square keep. */
export function sandstoneCastle(ctx, o = {}) {
  const rand = mulberry32(o.seed ?? 61);
  const b = new Builder();
  const Y = 'glowWarm';
  const warm = o.windowColor ?? '#ffcf6a';
  const R = 22; // half-size of the curtain wall square
  const towers = [[-R, R], [R, R], [R, -R], [-R, -R]];
  towers.forEach(([x, z], i) => {
    const r = 5.2;
    const top = roundTower(b, { x, z, r, h: 21 + (i % 2) * 3, segs: 22, taper: 0.95 });
    roundCrenels(b, { x, z, y: top, r: r * 0.95, count: 14, mh: 1.5 });
    towerWindows(b, { x, z, y0: 9, r: r * 0.97, rows: 2, perRow: 4, spacing: 6, w: 0.8, h: 2.2, key: Y, lit: 0.6, rand, phase: 0.3 });
  });
  // curtain walls (front wall split by the gatehouse)
  wall(b, { x0: -R + 4, z0: R, x1: -6, z1: R, h: 13, t: 3, mh: 1.5 });
  wall(b, { x0: 6, z0: R, x1: R - 4, z1: R, h: 13, t: 3, mh: 1.5 });
  wall(b, { x0: R, z0: R - 4, x1: R, z1: -R + 4, h: 13, t: 3, mh: 1.5 });
  wall(b, { x0: R - 4, z0: -R, x1: -R + 4, z1: -R, h: 13, t: 3, mh: 1.5 });
  wall(b, { x0: -R, z0: -R + 4, x1: -R, z1: R - 4, h: 13, t: 3, mh: 1.5 });
  // gatehouse: two drum towers and an arch
  for (const sx of [-1, 1]) {
    const x = sx * 6.5, z = R + 1.5;
    const top = roundTower(b, { x, z, r: 3.8, h: 17, segs: 18 });
    roundCrenels(b, { x, z, y: top, r: 3.7, count: 11, mh: 1.4 });
    towerWindows(b, { x, z, y0: 8, r: 3.75, rows: 2, perRow: 3, spacing: 4.5, w: 0.7, h: 1.8, key: Y, lit: 0.9, rand, phase: -0.2 });
  }
  block(b, 'stone', 9, 15, 6, 0, 0, R, 0, 3);
  wall(b, { x0: -4.5, z0: R + 2.9, x1: 4.5, z1: R + 2.9, y: 15, h: 0.01, t: 1, mh: 1.4 });
  b.add('gate', archGeometry(4.2, 6.5), b.m(0, 0, R + 3.04));
  faceWindows(b, { cx: 0, cz: R + 3.02, ry: 0, y0: 9, cols: 2, rows: 1, dx: 2.6, dy: 0, w: 0.8, h: 2.0, key: Y, lit: 1, rand });
  // keep: tall square tower with corbelled corner turrets
  const K = { w: 16, h: 30, z: -4 };
  const hw = K.w / 2;
  block(b, 'stone', K.w, K.h, K.w, 0, 0, K.z, 0, 3);
  for (const [x0, z0, x1, z1] of [[-hw, hw, hw, hw], [-hw, -hw, hw, -hw], [-hw, -hw, -hw, hw], [hw, -hw, hw, hw]]) {
    wall(b, { x0, z0: K.z + z0, x1, z1: K.z + z1, y: K.h, h: 0.01, t: 1.2, mh: 1.6 });
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = sx * hw, z = K.z + sz * hw;
    const top = roundTower(b, { x, z, y: K.h - 6, r: 2.0, h: 9, segs: 14 });
    roundCrenels(b, { x, z, y: top, r: 1.95, count: 8, mh: 1.0, corbel: false });
    b.add('stone', cylUV(new THREE.CylinderGeometry(2.0, 0.6, 3, 14)), b.m(x, K.h - 7.5, z));
  }
  faceWindows(b, { cx: 0, cz: K.z + hw, ry: 0, y0: 14, cols: 3, rows: 2, dx: 4, dy: 6.5, w: 1.2, h: 2.8, key: Y, lit: 0.85, rand });
  for (const sx of [-1, 1]) faceWindows(b, { cx: sx * hw, cz: K.z, ry: sx * Math.PI / 2, y0: 16, cols: 2, rows: 2, dx: 5, dy: 6, w: 1.1, h: 2.6, key: Y, lit: 0.7, rand });
  for (const sx of [-1, 1]) b.add('banner', new THREE.PlaneGeometry(1.6, 5).translate(0, -2.5, 0), b.m(sx * 3.5, K.h - 1, K.z + hw + 0.1));

  const mats = {
    ...baseMaterials(ctx.assets, { trim: 0x6a5040 }),
    stone: stoneMaterial(ctx.assets, 'large_sandstone_blocks', o.stoneColor ?? 0xf0c890, { rim: 0.45, roughness: 0.85 }),
    glowWarm: glowMaterial(warm, 4.0, 'mullion'),
    gate: glowMaterial(warm, 1.6, 'panes'),
    banner: stylize(new THREE.MeshStandardMaterial({ color: o.banner ?? 0x7a1a4a, roughness: 0.7, side: THREE.DoubleSide }), { rim: 0.6 }),
  };
  const L = (x, y, z, i, d = 24) => ({ x, y, z, color: warm, intensity: i, distance: d, flicker: 0.05 });
  return {
    object: b.build(mats),
    colliders: [
      { x: 0, z: R + 1.5, r: 6 }, { x: -6.5, z: R + 1.5, r: 4 }, { x: 6.5, z: R + 1.5, r: 4 },
      ...towers.map(([x, z]) => ({ x, z, r: 5.6 })), { x: 0, z: -4, r: 13 },
      { x: -R, z: 0, r: 8 }, { x: R, z: 0, r: 8 }, { x: 0, z: -R, r: 8 },
      { x: -14, z: R, r: 3 }, { x: 14, z: R, r: 3 },
    ],
    lights: [L(0, 3, R + 6, 30), L(-6.5, 10, R + 6, 12), L(6.5, 10, R + 6, 12)],
    glows: [{ x: 0, z: R + 6, radius: 7, color: warm, intensity: 0.6, stretch: 1.3 }],
  };
}
