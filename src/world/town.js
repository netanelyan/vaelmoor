import * as THREE from 'three';
import { mulberry32 } from '../engine/noise.js';
import { stylize } from '../render/materials.js';
import { Builder, boxUV, cylUV, gableRoofGeometry, glowMaterial, stoneMaterial, baseMaterials, archGeometry } from './architecture.js';

// Hollowford (surface, step 3): the chapel and its bell, the smithy, the well,
// market stalls, fences, the notice board, yard tables and the town gate.
// Same contract as the other builders: local space, front = +Z, returns
// { object, colliders, lights, glows, chimney?, animate? }. Matte like the
// rest of the painted surface.

const block = (b, key, w, h, d, x, y, z, ry = 0, uv = 3) =>
  b.add(key, boxUV(new THREE.BoxGeometry(w, h, d).applyMatrix4(b.m(x, y + h / 2, z, ry)), uv));

const matte = (ctx, tex, color, { rim = 0.15, normalScale = 1.2, rough = 1 } = {}) =>
  stoneMaterial(ctx.assets, tex, color, { rim, roughness: rough, envMapIntensity: 0.15, normalScale });

const mats = new Map();
/** Shared town materials (one of each per colour). */
function M(ctx, key, color) {
  const k = `${key}:${color}`;
  if (!mats.has(k)) {
    const make = {
      stone: () => matte(ctx, 'rock_wall_10', color ?? 0xa8a8b4, { normalScale: 2.2 }),
      rubble: () => matte(ctx, 'rustic_stone_wall', color ?? 0x9a98a4, { normalScale: 1.8 }),
      slate: () => matte(ctx, 'roof_slates_02', color ?? 0x5a5e70, { rim: 0.2 }),
      thatch: () => matte(ctx, 'thatch_roof_angled', color ?? 0x7a6a4a, { rim: 0.25 }),
      wood: () => matte(ctx, 'dark_wooden_planks', color ?? 0x6a4a34, { rim: 0.2, normalScale: 1 }),
      beam: () => matte(ctx, 'dark_wooden_planks', color ?? 0x3a2a20, { rim: 0.15, normalScale: 1 }),
      plaster: () => matte(ctx, 'plastered_wall_02', color ?? 0xc8bca8, { rim: 0.2, normalScale: 0.6 }),
      cloth: () => stylize(new THREE.MeshStandardMaterial({ color: color ?? 0x8a2a2a, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.1 }), { rim: 0.3 }),
      iron: () => stylize(new THREE.MeshStandardMaterial({ color: color ?? 0x3a3a40, roughness: 0.5, metalness: 0.8, envMapIntensity: 0.5 }), { rim: 0.25 }),
      bronze: () => stylize(new THREE.MeshStandardMaterial({ color: color ?? 0x8a6a3a, roughness: 0.35, metalness: 0.9, envMapIntensity: 0.8 }), { rim: 0.4 }),
      paper: () => stylize(new THREE.MeshStandardMaterial({ color: color ?? 0xd8ccb0, roughness: 1, side: THREE.DoubleSide }), { rim: 0.1 }),
      water: () => new THREE.MeshStandardMaterial({ color: color ?? 0x0a1028, roughness: 0.05, metalness: 0.3, envMapIntensity: 1.2 }),
      coal: () => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color ?? '#ff5a1a').multiplyScalar(3) }); m.userData.emissive = true; return m; },
    }[key];
    mats.set(k, make());
  }
  return mats.get(k);
}

/** Two-sided slab roof (lean-to or flat-ish), tilt about local X. */
function slab(b, key, w, d, x, y, z, tilt, ry = 0, t = 0.18) {
  b.add(key, boxUV(new THREE.BoxGeometry(w, t, d).applyMatrix4(b.m(x, y, z, ry, 1, 1, 1, tilt)), 2));
}

// ---------------------------------------------------------------- chapel

/**
 * Stone chapel: long nave (along Z, door at +Z), steep slate roof, a square
 * bell tower over the door with an open belfry and a bronze bell, lit
 * lancet windows. `animate()` swings the bell (rung from the quest).
 */
export function chapel(ctx, o = {}) {
  const b = new Builder();
  const W = o.w ?? 7, D = o.d ?? 12, H = o.h ?? 4.6, RH = 4.4;
  const warm = o.windowColor ?? '#ffcf7a';
  block(b, 'stone', W, H, D, 0, 0, 0, 0, 2);
  b.add('stone', boxUV(gableRoofGeometry(D, W, RH, 0).applyMatrix4(b.m(0, H, 0, Math.PI / 2)), 2));
  b.add('roof', boxUV(gableRoofGeometry(D + 0.6, W + 0.4, RH + 0.3, 0.4).applyMatrix4(b.m(0, H - 0.2, 0, Math.PI / 2)), 1.8));
  // buttresses
  for (const z of [-D / 2 + 1, -D / 6, D / 6]) for (const s of [-1, 1]) block(b, 'stone', 0.7, H * 0.8, 1.0, s * (W / 2 + 0.3), 0, z, 0, 1.5);
  // tower over the door
  const TW = 3.2, TH = 9.5, tz = D / 2 - TW / 2 + 0.6;
  block(b, 'stone', TW, TH, TW, 0, 0, tz, 0, 2);
  // belfry: four corner piers and a cap, open between
  const BY = TH, BH = 2.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(b, 'stone', 0.55, BH, 0.55, sx * (TW / 2 - 0.27), BY, tz + sz * (TW / 2 - 0.27), 0, 1.2);
  block(b, 'stone', TW + 0.3, 0.35, TW + 0.3, 0, BY + BH, tz, 0, 1.5);
  block(b, 'stone', TW + 0.2, 0.3, TW + 0.2, 0, BY - 0.3, tz, 0, 1.5);
  // pyramid spire
  const sp = new THREE.ConeGeometry((TW + 0.5) * 0.72, 4.6, 4, 1);
  sp.rotateY(Math.PI / 4);
  b.add('roof', cylUV(sp), b.m(0, BY + BH + 0.35 + 2.3, tz));
  b.add('iron', new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), b.m(0, BY + BH + 5.1, tz));
  b.add('iron', new THREE.BoxGeometry(0.5, 0.05, 0.05), b.m(0, BY + BH + 5.35, tz));
  // door + windows
  b.add('door', archGeometry(1.5, 2.7), b.m(0, 0, tz + TW / 2 + 0.03));
  for (const sx of [-1, 1]) block(b, 'stone', 0.35, 2.4, 0.3, sx * 0.95, 0, tz + TW / 2 + 0.1, 0, 1);
  b.add('glow', archGeometry(0.7, 1.6), b.m(0, 5.4, tz + TW / 2 + 0.03));
  for (const z of [-D / 2 + 2.6, -D / 6 + 1.6, D / 6 - 1]) for (const s of [-1, 1]) {
    b.add('glow', archGeometry(0.8, 2.0), b.m(s * (W / 2 + 0.03), 1.4, z, s * Math.PI / 2));
  }
  b.add('glow', new THREE.CircleGeometry(0.9, 16).translate(0, 0.9, 0), b.m(0, H + 0.6, -D / 2 - 0.03, Math.PI));
  const object = b.build({
    ...baseMaterials(ctx.assets),
    stone: M(ctx, 'stone', o.stone ?? 0xb0b0bc),
    roof: M(ctx, 'slate', o.roof ?? 0x4a4e60),
    iron: M(ctx, 'iron'),
    door: M(ctx, 'beam', 0x2a1c14),
    glow: glowMaterial(warm, 2.6, 'stained'),
  });
  // the bell: a lathe profile hung from a beam, swinging about X
  const bellPivot = new THREE.Group();
  bellPivot.position.set(0, BY + BH - 0.25, tz);
  const prof = [[0, 0.02], [0.22, 0.02], [0.3, -0.25], [0.36, -0.6], [0.5, -0.86], [0.52, -0.92], [0.44, -0.9], [0.32, -0.62], [0.24, -0.25], [0.0, -0.18]].map(([r, y]) => new THREE.Vector2(r, y));
  const bell = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), M(ctx, 'bronze'));
  bell.castShadow = true;
  bellPivot.add(bell);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(TW - 0.4, 0.18, 0.18), M(ctx, 'beam'));
  beam.position.copy(bellPivot.position);
  object.add(beam, bellPivot);
  let swing = 0;
  const update = (dt, t) => {
    if (swing <= 0) return;
    swing = Math.max(0, swing - dt);
    bellPivot.rotation.x = Math.sin((6 - swing) * 3.2) * 0.55 * (swing / 6);
  };
  return {
    object,
    update,
    animate: () => { swing = 6; },
    usePos: [0.9, 1.2, tz + TW / 2 + 0.3], // the bell rope hangs by the door
    colliders: [{ x: 0, z: -D / 4, r: W * 0.55 }, { x: 0, z: D / 6, r: W * 0.55 }, { x: 0, z: tz, r: TW * 0.62 }],
    lights: [{ x: 0, y: 2.2, z: tz + TW / 2 + 2, color: warm, intensity: 6, distance: 10, flicker: 0.1 }],
    glows: [{ x: 0, z: tz + TW / 2 + 2, radius: 3, color: warm, intensity: 0.45 }],
  };
}

// ---------------------------------------------------------------- smithy

/** Open-fronted smithy: stone back wall and forge, timber posts, thatched lean-to, anvil, trough. */
export function smithy(ctx, o = {}) {
  const b = new Builder();
  const W = o.w ?? 7, D = o.d ?? 4.6;
  block(b, 'stone', W, 3.4, 0.6, 0, 0, -D / 2, 0, 2);          // back wall
  block(b, 'stone', 0.5, 3.0, D, -W / 2, 0, 0, 0, 2);           // side wall
  for (const x of [W / 2 - 0.2, 0.2]) block(b, 'beam', 0.28, 3.0, 0.28, x, 0, D / 2 - 0.2, 0, 1);
  block(b, 'beam', W, 0.25, 0.3, 0, 3.0, D / 2 - 0.2, 0, 1);
  slab(b, 'roof', W + 0.8, D + 1.4, 0, 3.55, 0, -0.32);
  // forge: stone hearth with glowing coals, hood and chimney
  const fx = -W / 2 + 1.5, fz = -D / 2 + 1.2;
  block(b, 'stone', 1.9, 0.95, 1.6, fx, 0, fz, 0, 1.2);
  b.add('coal', new THREE.BoxGeometry(1.3, 0.06, 1.0), b.m(fx, 0.97, fz + 0.05));
  block(b, 'stone', 1.9, 1.0, 1.4, fx, 2.2, fz - 0.1, 0, 1.2);
  block(b, 'stone', 0.9, 4.2, 0.9, fx, 3.2, fz - 0.3, 0, 1.2);
  // anvil on a stump
  b.add('wood', cylUV(new THREE.CylinderGeometry(0.32, 0.36, 0.55, 10)), b.m(0.6, 0.27, 0.3));
  block(b, 'iron', 0.75, 0.22, 0.3, 0.6, 0.55, 0.3, 0.2, 1);
  block(b, 'iron', 0.35, 0.12, 0.22, 0.6, 0.77, 0.3, 0.2, 1);
  b.add('iron', new THREE.ConeGeometry(0.12, 0.34, 6).rotateZ(Math.PI / 2), b.m(1.1, 0.86, 0.12, 0.2));
  // quench trough
  block(b, 'wood', 1.6, 0.55, 0.6, 2.2, 0, -D / 2 + 0.7, 0, 1);
  b.add('water', new THREE.PlaneGeometry(1.45, 0.48).rotateX(-Math.PI / 2), b.m(2.2, 0.5, -D / 2 + 0.7));
  // tools on the wall
  for (let i = 0; i < 4; i++) block(b, 'iron', 0.06, 0.7, 0.05, 0.6 + i * 0.35, 1.6, -D / 2 + 0.33, 0, 1);
  const object = b.build({
    stone: M(ctx, 'rubble', 0x9a96a0), beam: M(ctx, 'beam'), wood: M(ctx, 'wood'), roof: M(ctx, 'thatch', o.roof ?? 0x6a5a40),
    iron: M(ctx, 'iron'), coal: M(ctx, 'coal'), water: M(ctx, 'water'),
  });
  return {
    object,
    colliders: [{ x: -W / 2 + 1.5, z: -D / 2 + 1.2, r: 1.1 }, { x: 0, z: -D / 2, r: 0.5 }, { x: 2, z: -D / 2, r: 0.5 }, { x: -2, z: -D / 2, r: 0.5 }, { x: 0.6, z: 0.3, r: 0.45 }, { x: 2.2, z: -D / 2 + 0.7, r: 0.6 }],
    lights: [{ x: fx, y: 1.4, z: fz + 0.6, color: '#ff6a2a', intensity: 9, distance: 9, flicker: 0.35 }],
    glows: [{ x: fx + 0.4, z: fz + 1.4, radius: 2.6, color: '#ff5a1a', intensity: 0.4 }],
    chimney: [fx, 7.6, fz - 0.3],
  };
}

// ---------------------------------------------------------------- well

/** Round stone well with a little shingled roof, a crank and a bucket. */
export function well(ctx, o = {}) {
  const b = new Builder();
  const R = 0.95;
  const ring = new THREE.CylinderGeometry(R, R + 0.05, 0.85, 20, 1, true);
  b.add('stone', cylUV(ring, 1.5), b.m(0, 0.42, 0));
  b.add('stone', cylUV(new THREE.CylinderGeometry(R - 0.25, R - 0.2, 0.85, 20, 1, true), 1.5), b.m(0, 0.42, 0));
  b.add('stone', new THREE.RingGeometry(R - 0.25, R + 0.06, 20).rotateX(-Math.PI / 2), b.m(0, 0.86, 0));
  b.add('water', new THREE.CircleGeometry(R - 0.25, 20).rotateX(-Math.PI / 2), b.m(0, 0.25, 0));
  for (const s of [-1, 1]) block(b, 'beam', 0.16, 2.2, 0.16, s * (R + 0.05), 0, 0, 0, 1);
  b.add('roof', boxUV(gableRoofGeometry(2.6, 1.8, 0.9, 0.15).applyMatrix4(b.m(0, 2.15, 0, Math.PI / 2)), 1.5));
  b.add('beam', new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8).rotateZ(Math.PI / 2), b.m(0, 1.75, 0));
  b.add('beam', new THREE.BoxGeometry(0.05, 0.4, 0.05), b.m(R + 0.2, 1.6, 0));
  b.add('wood', cylUV(new THREE.CylinderGeometry(0.17, 0.13, 0.3, 10)), b.m(0.2, 1.2, 0));
  b.add('iron', new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), b.m(0.2, 1.5, 0));
  return {
    object: b.build({ stone: M(ctx, 'stone', o.stone ?? 0x9a9aa8), beam: M(ctx, 'beam'), wood: M(ctx, 'wood'), roof: M(ctx, 'slate', 0x4a4a58), water: M(ctx, 'water'), iron: M(ctx, 'iron') }),
    colliders: [{ x: 0, z: 0, r: R + 0.15 }],
  };
}

// ---------------------------------------------------------------- market stall

/** Trestle stall under a striped cloth awning, with crates and wares. */
export function stall(ctx, o = {}) {
  const b = new Builder();
  const rand = mulberry32(o.seed ?? 5);
  const W = o.w ?? 2.8, D = 1.4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(b, 'beam', 0.1, sz > 0 ? 2.1 : 2.5, 0.1, sx * W / 2, 0, sz * D / 2, 0, 1);
  block(b, 'wood', W, 0.08, D * 0.8, 0, 0.85, 0.1, 0, 1);
  block(b, 'wood', W, 0.6, 0.05, 0, 0.25, D * 0.45, 0, 1);
  // striped awning, sloping to the front
  for (let i = 0; i < 6; i++) slab(b, i % 2 ? 'clothB' : 'clothA', W / 6, D + 0.6, -W / 2 + W / 12 + (i * W) / 6, 2.32, 0.1, 0.28, 0, 0.03);
  // wares
  for (let i = 0; i < 5; i++) b.add(rand() < 0.5 ? 'goodsA' : 'goodsB', new THREE.SphereGeometry(0.09 + rand() * 0.05, 8, 6), b.m(-W / 2 + 0.4 + i * 0.5, 0.97, 0.05 + rand() * 0.2));
  block(b, 'wood', 0.6, 0.45, 0.5, W / 2 + 0.45, 0, -0.1, 0.3, 1);
  block(b, 'wood', 0.5, 0.4, 0.45, W / 2 + 0.4, 0.45, -0.1, 0.1, 1);
  return {
    object: b.build({
      beam: M(ctx, 'beam'), wood: M(ctx, 'wood', 0x7a5a40),
      clothA: M(ctx, 'cloth', o.cloth ?? 0x8a2424), clothB: M(ctx, 'cloth', 0xc8bca0),
      goodsA: M(ctx, 'cloth', o.goods ?? 0x9a3a2a), goodsB: M(ctx, 'cloth', 0x8a8a3a),
    }),
    colliders: [{ x: -W / 4, z: 0, r: 0.75 }, { x: W / 4, z: 0, r: 0.75 }],
  };
}

// ---------------------------------------------------------------- fence, board, tables, gate

/** Post-and-rail fence `length` m along local X (centred). */
export function fence(ctx, o = {}) {
  const b = new Builder();
  const L = o.length ?? 8, n = Math.max(1, Math.round(L / 2.2));
  const rand = mulberry32(o.seed ?? 3);
  for (let i = 0; i <= n; i++) block(b, 'beam', 0.13, 1.15 + rand() * 0.1, 0.13, -L / 2 + (L * i) / n, 0, 0, (rand() - 0.5) * 0.2, 1);
  for (const y of [0.45, 0.9]) b.add('wood', boxUV(new THREE.BoxGeometry(L, 0.09, 0.05).applyMatrix4(b.m(0, y, 0.07, 0, 1, 1, 1, 0, (rand() - 0.5) * 0.04)), 1));
  const colliders = [];
  for (let x = -L / 2; x <= L / 2 + 0.01; x += 0.8) colliders.push({ x, z: 0, r: 0.35 });
  return { object: b.build({ beam: M(ctx, 'beam'), wood: M(ctx, 'wood', 0x6a5a48) }), colliders };
}

/** Notice board on two posts under a little roof, papers pinned to it. */
export function noticeBoard(ctx, o = {}) {
  const b = new Builder();
  const rand = mulberry32(o.seed ?? 9);
  for (const s of [-1, 1]) block(b, 'beam', 0.14, 2.3, 0.14, s * 0.9, 0, 0, 0, 1);
  block(b, 'wood', 1.9, 1.1, 0.08, 0, 1.0, 0, 0, 1);
  slab(b, 'roof', 2.3, 0.7, 0, 2.35, 0.05, -0.35);
  for (let i = 0; i < 5; i++) b.add('paper', new THREE.PlaneGeometry(0.28 + rand() * 0.1, 0.34 + rand() * 0.1), b.m(-0.65 + i * 0.32, 1.3 + rand() * 0.5, 0.05, 0, 1, 1, 1, 0, (rand() - 0.5) * 0.2));
  return { object: b.build({ beam: M(ctx, 'beam'), wood: M(ctx, 'wood', 0x5a4434), roof: M(ctx, 'slate', 0x4a4a58), paper: M(ctx, 'paper') }), colliders: [{ x: 0, z: 0, r: 0.6 }] };
}

/** Trestle table with a bench either side, a jug and cups. */
export function yardTable(ctx, o = {}) {
  const b = new Builder();
  block(b, 'wood', 2.0, 0.08, 0.8, 0, 0.74, 0, 0, 1);
  for (const s of [-1, 1]) {
    block(b, 'beam', 0.08, 0.74, 0.6, s * 0.8, 0, 0, 0, 1);
    block(b, 'wood', 1.9, 0.06, 0.3, 0, 0.42, s * 0.7, 0, 1);
    for (const x of [-0.75, 0.75]) block(b, 'beam', 0.07, 0.42, 0.25, x, 0, s * 0.7, 0, 1);
  }
  b.add('clay', cylUV(new THREE.CylinderGeometry(0.08, 0.1, 0.24, 10)), b.m(-0.3, 0.9, 0.05));
  for (const x of [0.2, 0.5]) b.add('clay', cylUV(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 8)), b.m(x, 0.83, (x - 0.35) * 0.6));
  return { object: b.build({ wood: M(ctx, 'wood', 0x6a4c36), beam: M(ctx, 'beam'), clay: M(ctx, 'cloth', 0x7a5a44) }), colliders: [{ x: -0.6, z: 0, r: 0.75 }, { x: 0.6, z: 0, r: 0.75 }] };
}

/** Town gate: two stout posts, a roofed lintel and a hanging sign. */
export function townGate(ctx, o = {}) {
  const b = new Builder();
  const S = o.span ?? 5.2;
  for (const s of [-1, 1]) {
    block(b, 'stone', 0.9, 0.7, 0.9, s * S / 2, 0, 0, 0, 1);
    block(b, 'beam', 0.32, 4.4, 0.32, s * S / 2, 0.6, 0, 0, 1);
  }
  block(b, 'beam', S + 1.2, 0.32, 0.36, 0, 4.6, 0, 0, 1);
  b.add('roof', boxUV(gableRoofGeometry(S + 1.6, 1.0, 0.7, 0.1).applyMatrix4(b.m(0, 4.9, 0)), 1.5));
  for (const s of [-1, 1]) b.add('beam', boxUV(new THREE.BoxGeometry(0.14, 1.4, 0.14).applyMatrix4(b.m(s * (S / 2 - 0.5), 4.2, 0, 0, 1, 1, 1, 0, s * 0.7)), 1));
  block(b, 'iron', 0.03, 0.4, 0.03, -0.5, 4.2, 0, 0, 1);
  block(b, 'iron', 0.03, 0.4, 0.03, 0.5, 4.2, 0, 0, 1);
  block(b, 'wood', 1.6, 0.55, 0.06, 0, 3.7, 0, 0, 1);
  return {
    object: b.build({ stone: M(ctx, 'rubble'), beam: M(ctx, 'beam'), roof: M(ctx, 'slate', 0x4a4a58), iron: M(ctx, 'iron'), wood: M(ctx, 'wood', 0x7a5a3a) }),
    colliders: [{ x: -S / 2, z: 0, r: 0.6 }, { x: S / 2, z: 0, r: 0.6 }],
  };
}

/** Hanging inn sign on a bracket post (the board faces ±X). */
export function innSign(ctx, o = {}) {
  const b = new Builder();
  block(b, 'beam', 0.18, 3.4, 0.18, 0, 0, 0, 0, 1);
  block(b, 'beam', 1.3, 0.14, 0.14, 0.6, 3.1, 0, 0, 1);
  block(b, 'iron', 0.02, 0.3, 0.02, 0.35, 2.8, 0, 0, 1);
  block(b, 'iron', 0.02, 0.3, 0.02, 0.95, 2.8, 0, 0, 1);
  block(b, 'wood', 0.9, 0.65, 0.06, 0.65, 2.15, 0, 0, 1);
  // a pale moon over a dark mound, painted on both faces
  for (const s of [-1, 1]) {
    b.add('moon', new THREE.CircleGeometry(0.13, 14), b.m(0.65, 2.6, s * 0.035, s < 0 ? Math.PI : 0));
    b.add('mound', new THREE.CircleGeometry(0.32, 14, 0, Math.PI), b.m(0.65, 2.2, s * 0.036, s < 0 ? Math.PI : 0));
  }
  return { object: b.build({ beam: M(ctx, 'beam'), iron: M(ctx, 'iron'), wood: M(ctx, 'wood', 0x3a2a20), moon: M(ctx, 'paper', 0xe8e4d0), mound: M(ctx, 'cloth', 0x1a1a22) }), colliders: [{ x: 0, z: 0, r: 0.25 }] };
}

/** Stacked firewood against nothing in particular. */
export function woodpile(ctx, o = {}) {
  const b = new Builder();
  const rand = mulberry32(o.seed ?? 11);
  const L = o.length ?? 2.2;
  for (let row = 0; row < 5; row++) for (let i = 0; i < Math.round(L / 0.22) - row; i++) {
    b.add('log', cylUV(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 7).rotateX(Math.PI / 2)), b.m(-L / 2 + 0.11 + i * 0.22 + row * 0.11, 0.1 + row * 0.18, (rand() - 0.5) * 0.08));
  }
  return { object: b.build({ log: M(ctx, 'wood', 0x7a5a3a) }), colliders: [{ x: 0, z: 0, r: L * 0.4 }] };
}

export const TOWN_BUILDERS = {
  chapel, smithy, well, stall, fence, notice_board: noticeBoard, yard_table: yardTable, town_gate: townGate, inn_sign: innSign, woodpile,
};
