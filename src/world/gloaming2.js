import * as THREE from 'three';
import { mulberry32, Noise2D } from '../engine/noise.js';
import { stylize } from '../render/materials.js';
import { kingH, trollH, hoodedH } from './humans.js';
import { Builder, boxUV, cylUV, gableRoofGeometry, glowMaterial, stoneMaterial, baseMaterials, archGeometry, roundTower, roundCrenels, towerWindows } from './architecture.js';

// Builders for the second set of Gloaming references (ref_11..ref_17):
// slightly crude early-2000s CG shapes, saturated, high local contrast.

const mat = (color, o = {}) => stylize(new THREE.MeshStandardMaterial({ color, roughness: o.roughness ?? 0.6, metalness: o.metalness ?? 0, ...o.extra }), { rim: o.rim ?? 0.5 });
const glow = (hex, k) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }); m.userData.emissive = true; return m; };
function mesh(g, m, cast = true) { const x = new THREE.Mesh(g, m); x.castShadow = cast; x.receiveShadow = true; return x; }
function lathe(profile, segs = 20, fold = null) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  if (fold) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const k = 1 + fold(a, p.getY(i));
      p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
    }
    g.computeVertexNormals();
  }
  return g;
}

// ------------------------------------------------------------ ref_12 gnome camp

/** Cone tent: orange canvas over a green skirt band, open flap. */
export function tent(ctx, o = {}) {
  const r = o.radius ?? 1.6, h = o.height ?? 2.4;
  const g = new THREE.Group();
  const top = mesh(new THREE.ConeGeometry(r, h, 18, 1, true), mat(o.color ?? '#ff4a14', { roughness: 0.7, rim: 0.6, extra: { side: THREE.DoubleSide } }));
  top.position.y = h / 2 + 0.25;
  g.add(top);
  const skirt = mesh(new THREE.CylinderGeometry(r * 0.98, r * 1.04, 0.5, 18, 1, true), mat(o.band ?? '#1a8a2a', { roughness: 0.7, extra: { side: THREE.DoubleSide } }));
  skirt.position.y = 0.25;
  g.add(skirt);
  const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), mat('#4a2a14'));
  pole.position.y = h + 0.4;
  g.add(pole);
  const door = mesh(new THREE.PlaneGeometry(0.7, 1.1), glow('#1a0c06', 1), false);
  door.position.set(0, 0.6, r * 0.82);
  door.rotation.x = -0.45;
  g.add(door);
  return { object: g, colliders: [{ x: 0, z: 0, r: r * 0.9 }] };
}

// ------------------------------------------------------------ ref_17 troll ferryman

/** Green mossy troll with pointed ears and one glowing yellow eye, sitting in a wooden boat. */
export async function trollBoat(ctx, o = {}) {
  const g = new THREE.Group();
  const wood = stoneMaterial(ctx.assets, 'dark_wooden_planks', 0x4a6a3a, { rim: 0.12, roughness: 0.7 });
  // boat: half a stretched lathe hull, open on top
  const hull = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  hull.scale(0.8, 0.45, 2.4);
  const boat = mesh(hull, wood); boat.position.y = 0.35; g.add(boat);
  const rim = mesh(new THREE.TorusGeometry(1, 0.06, 6, 30), wood); rim.rotation.x = Math.PI / 2; rim.scale.set(0.8, 2.4, 1); rim.position.y = 0.35; g.add(rim);
  const pole = mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.6, 6), wood); pole.position.set(0.7, 1.4, 0.7); pole.rotation.set(0.3, 0, -0.25); g.add(pole);
  const troll = await trollH(ctx);
  troll.object.position.z = 0.15;
  g.add(troll.object);
  return {
    object: g,
    update: troll.update,
    colliders: [{ x: 0, z: 0, r: 1.2 }],
    lights: [{ x: 0, y: 2.4, z: 1.8, color: '#7aff6a', intensity: 0.8, distance: 6 }],
  };
}

// ------------------------------------------------------------ ref_13 cabin on a pillar

/** Log cabin on a round stone platform; `pillar` puts it atop a tall moss-streaked rock column. */
export async function pillarCabin(ctx, o = {}) {
  const b = new Builder();
  const H = o.pillar ?? 34, R = o.radius ?? 5.5;
  // the pillar: a tapering, lumpy column
  const N = new Noise2D(5);
  const col = new THREE.CylinderGeometry(R * 0.85, R * 1.25, H, 20, 16);
  const p = col.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const k = 1 + 0.18 * N.noise(a * 3, y * 0.15) + 0.06 * N.noise(a * 9, y * 0.6);
    p.setXYZ(i, x * k, y, z * k);
  }
  col.computeVertexNormals();
  b.add('pillar', cylUV(col, 4), b.m(0, H / 2, 0));
  // platform disc
  b.add('stone', cylUV(new THREE.CylinderGeometry(R * 1.35, R * 1.1, 0.8, 24)), b.m(0, H + 0.4, 0));
  // cabin of logs
  const W = o.cabinW ?? 5, D = o.cabinD ?? 4, CH = o.cabinH ?? 2.6;
  for (let i = 0; i < 9; i++) {
    const y = H + 0.8 + i * (CH / 9) + 0.14;
    for (const [w, d, x, z, ry] of [[W, 0.3, 0, D / 2, 0], [W, 0.3, 0, -D / 2, 0], [D, 0.3, W / 2, 0, Math.PI / 2], [D, 0.3, -W / 2, 0, Math.PI / 2]]) {
      const log = new THREE.CylinderGeometry(0.15, 0.15, w + 0.4, 7);
      log.rotateZ(Math.PI / 2);
      b.add('log', boxUV(log.applyMatrix4(b.m(x, y, z, ry)), 1.2));
    }
  }
  b.add('log', boxUV(gableRoofGeometry(W, D, 1.8, 0).applyMatrix4(b.m(0, H + 0.8 + CH, 0)), 1.5));
  b.add('roof', boxUV(gableRoofGeometry(W + 0.8, D + 1, 2.0, 0.4).applyMatrix4(b.m(0, H + 0.7 + CH, 0)), 1.5));
  b.add('glowWarm', archGeometry(0.8, 0.9, false), b.m(1.2, H + 1.8, D / 2 + 0.16));
  const mats = {
    ...baseMaterials(ctx.assets),
    pillar: stoneMaterial(ctx.assets, 'mossy_rock', o.pillarColor ?? 0x5aa070, { rim: 0.5, normalScale: 2.4, roughness: 0.75 }),
    stone: stoneMaterial(ctx.assets, 'rock_wall_10', 0x5a5a64, { rim: 0.4 }),
    log: stoneMaterial(ctx.assets, 'dark_wooden_planks', 0x6a4a34, { rim: 0.6, roughness: 0.6 }),
    roof: stoneMaterial(ctx.assets, 'dark_wooden_planks', 0x3a2a20, { rim: 0.5 }),
    glowWarm: glowMaterial('#ffb050', 2.5, 'panes'),
  };
  const g = b.build(mats);
  // two dark figures standing on the roof
  for (const [x, z, s] of [[-0.6, -0.4, 1.0], [0.9, 0.3, 0.9]]) {
    const w = await hoodedH(ctx, { robe: '#08080c', pose: 'stand', height: 1.8 * s, seed: Math.round(x * 10) });
    w.object.position.set(x, H + 0.8 + CH + 1.6 - Math.abs(x) * 0.5, z);
    g.add(w.object);
  }
  return { object: g, colliders: [{ x: 0, z: 0, r: R * 1.2 }] };
}

// ------------------------------------------------------------ ref_15 tree houses

/** A giant trunk with a storybook house wrapped around it: cone thatch roofs, round amber windows, a balcony. */
export function treeHouse(ctx, o = {}) {
  const rand = mulberry32(o.seed ?? 3);
  const b = new Builder();
  const N = new Noise2D(o.seed ?? 3);
  const TR = o.trunk ?? 2.6, TH = o.height ?? 26;
  const trunk = new THREE.CylinderGeometry(TR * 0.8, TR * 1.3, TH, 18, 12);
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const flare = 1 + Math.max(0, -y / TH - 0.35) * 1.6 * (0.6 + 0.4 * Math.sin(a * 5));
    const k = flare * (1 + 0.1 * N.noise(a * 4, y * 0.2));
    p.setXYZ(i, x * k, y, z * k);
  }
  trunk.computeVertexNormals();
  b.add('bark', cylUV(trunk, 3), b.m(0, TH / 2, 0));
  // pods: round rooms clinging to the trunk, each with a cone roof
  const pods = o.pods ?? 3;
  for (let i = 0; i < pods; i++) {
    const a = (o.face ?? 0) + (i - (pods - 1) / 2) * 1.0 + (rand() - 0.5) * 0.3;
    const y = 2 + i * 4.2 + rand();
    const r = 1.8 + rand() * 0.6;
    const cx = Math.sin(a) * (TR + r * 0.55), cz = Math.cos(a) * (TR + r * 0.55);
    b.add('wall', cylUV(new THREE.CylinderGeometry(r, r * 1.05, 2.6, 14)), b.m(cx, y + 1.3, cz));
    b.add('roof', cylUV(new THREE.ConeGeometry(r * 1.35, 2.8 + rand() * 1.5, 14, 1, true), 1.5), b.m(cx, y + 2.6 + 1.4, cz, 0, 1, 1, 1, 0.12 * (rand() - 0.5), 0.12 * (rand() - 0.5)));
    for (const da of [-0.5, 0.4]) {
      const wa = a + da;
      b.add('glowWarm', new THREE.CircleGeometry(0.42, 14), b.m(cx + Math.sin(wa) * (r + 0.04), y + 1.4, cz + Math.cos(wa) * (r + 0.04), wa));
    }
    if (i === 1) {
      const deck = new THREE.CylinderGeometry(r + 0.8, r + 0.8, 0.2, 16, 1, false, a - 1.2, 2.4);
      b.add('wood', cylUV(deck), b.m(cx, y - 0.1, cz));
      b.add('wood', cylUV(new THREE.CylinderGeometry(r + 0.8, r + 0.8, 0.7, 16, 1, true, a - 1.2, 2.4)), b.m(cx, y + 0.35, cz));
    }
  }
  b.add('door', archGeometry(1.2, 2.2), b.m(Math.sin(o.face ?? 0) * (TR * 1.45), 0, Math.cos(o.face ?? 0) * (TR * 1.45), o.face ?? 0));
  const mats = {
    ...baseMaterials(ctx.assets),
    bark: stoneMaterial(ctx.assets, 'bark_brown_02', 0x6a5a4a, { rim: 0.6, normalScale: 2.0 }),
    wall: stoneMaterial(ctx.assets, 'plastered_wall_02', 0x8a6a4a, { rim: 0.4, roughness: 0.8 }),
    roof: stoneMaterial(ctx.assets, 'thatch_roof_angled', o.roof ?? 0x8a5a2a, { rim: 0.5 }),
    wood: stoneMaterial(ctx.assets, 'dark_wooden_planks', 0x6a4a2a, { rim: 0.5 }),
    glowWarm: glowMaterial('#ffc040', 3.0, 'panes'),
    door: glowMaterial('#ff9a30', 1.6, 'panes'),
  };
  const lights = [];
  for (let i = 0; i < pods; i++) lights.push({ x: Math.sin(o.face ?? 0) * (TR + 3), y: 3 + i * 4.2, z: Math.cos(o.face ?? 0) * (TR + 3), color: '#ffa040', intensity: 8, distance: 10, flicker: 0.08 });
  return { object: b.build(mats), colliders: [{ x: 0, z: 0, r: TR * 1.5 }], lights };
}

// ------------------------------------------------------------ ref_16 king on the throne

/** Robed king on a stone throne: spiked crown, green-lit face, one hand raised. */
export async function throneKing(ctx, o = {}) {
  const b = new Builder();
  b.add('stone', boxUV(new THREE.BoxGeometry(2.4, 0.6, 2.0).applyMatrix4(b.m(0, 0.3, 0))));
  b.add('stone', boxUV(new THREE.BoxGeometry(1.8, 0.7, 1.4).applyMatrix4(b.m(0, 0.95, -0.1))));
  b.add('stone', boxUV(new THREE.BoxGeometry(1.9, 3.4, 0.45).applyMatrix4(b.m(0, 2.0, -0.75))));
  for (const sx of [-1, 1]) b.add('stone', boxUV(new THREE.BoxGeometry(0.35, 0.8, 1.3).applyMatrix4(b.m(sx * 0.85, 1.6, -0.1))));
  const g = b.build({ ...baseMaterials(ctx.assets), stone: stoneMaterial(ctx.assets, 'castle_wall_slates', 0x6a6a70, { rim: 0.4, normalScale: 2 }) });
  const k = await kingH(ctx);
  k.object.position.set(0, 0, 0.05);
  g.add(k.object);
  return { object: g, update: k.update, colliders: [{ x: 0, z: 0, r: 1.3 }], lights: [{ x: 0, y: 2.7, z: 0.8, color: '#6aff4a', intensity: 5, distance: 6 }] };
}

/** Glowing green vines climbing a wall (strands of tubes with leaf cards). */
export function glowVines(ctx, o = {}) {
  const rand = mulberry32(o.seed ?? 4);
  const g = new THREE.Group();
  const m = glow(o.color ?? '#3aff6a', o.intensity ?? 1.2);
  for (let s = 0; s < (o.strands ?? 14); s++) {
    const pts = [];
    let x = (rand() - 0.5) * (o.width ?? 4), y = 0, z = 0;
    for (let i = 0; i < 8; i++) { pts.push(new THREE.Vector3(x, y, z)); x += (rand() - 0.5) * 0.6; y += 0.4 + rand() * 0.6; z = rand() * 0.2; }
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.025, 4, false), m, false));
    for (let i = 0; i < 10; i++) {
      const p = pts[Math.floor(rand() * pts.length)];
      const leaf = mesh(new THREE.CircleGeometry(0.12 + rand() * 0.08, 5), m, false);
      leaf.position.set(p.x + (rand() - 0.5) * 0.3, p.y + (rand() - 0.5) * 0.3, p.z + 0.05);
      leaf.rotation.set(rand(), rand(), rand());
      g.add(leaf);
    }
  }
  return { object: g, lights: [{ x: 0, y: 2.5, z: 0.6, color: o.color ?? '#3aff6a', intensity: 6, distance: 8 }] };
}

/** Plain round tower (no spire) for ref_11. */
export function stoneTower(ctx, o = {}) {
  const b = new Builder();
  const r = o.radius ?? 3, h = o.height ?? 24;
  const top = roundTower(b, { r, h, segs: 20, taper: 0.98 });
  roundCrenels(b, { y: top, r: r * 0.98, count: 12, mh: 0.9 });
  b.add('stone', cylUV(new THREE.CylinderGeometry(r * 1.5, r * 1.6, 1.2, 24)), b.m(0, 0.6, 0));
  towerWindows(b, { y0: h * 0.6, r: r * 0.98, rows: 1, perRow: 3, w: 0.6, h: 1.4, key: 'glow', lit: 0.5, rand: mulberry32(2) });
  const mats = { ...baseMaterials(ctx.assets), stone: stoneMaterial(ctx.assets, 'castle_wall_slates', o.stone ?? 0x3a4a3a, { rim: 0.5, normalScale: 2 }), glow: glowMaterial('#aaff6a', 2, 'mullion') };
  return { object: b.build(mats), colliders: [{ x: 0, z: 0, r: r * 1.5 }] };
}

/** Curved stone walkway: an arc of slab-paved path with a low curb. */
export function walkway(ctx, o = {}) {
  const R = o.radius ?? 8, w = o.width ?? 2.4, a0 = o.from ?? -1.2, a1 = o.to ?? 1.2;
  const t = ctx.assets.pbr(o.texture ?? 'grey_stone_path', [1, 1]);
  const mk = (inner, outer, y0, y1, key) => {
    const g = new THREE.RingGeometry(inner, outer, 40, 1, a0, a1 - a0);
    g.rotateX(-Math.PI / 2);
    g.translate(0, y1, 0);
    return g;
  };
  const top = mk(R - w / 2, R + w / 2, 0, 0.35);
  const p = top.attributes.position, uv = top.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2.2, p.getZ(i) / 2.2);
  const m = stylize(new THREE.MeshStandardMaterial({ ...t, color: o.color ?? '#d8b878', roughness: 0.55 }), { rim: 0.3 });
  const g = new THREE.Group();
  g.add(mesh(top, m));
  const side = new THREE.CylinderGeometry(R + w / 2, R + w / 2, 0.4, 40, 1, true, Math.PI / 2 - a1, a1 - a0);
  g.add(mesh(side, m).translateY(0.17));
  const inner = new THREE.CylinderGeometry(R - w / 2, R - w / 2, 0.4, 40, 1, true, Math.PI / 2 - a1, a1 - a0);
  g.add(mesh(inner, m).translateY(0.17));
  return { object: g };
}

