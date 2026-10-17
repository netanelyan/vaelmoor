import * as THREE from 'three';
import { darkCastle } from './buildings.js';
import { manor, timberHouse, cottage, sandstoneCastle } from './houses.js';
import { deadTree, greatTree } from './trees.js';
import { goldenSkull } from './characters.js';
import { wizardH, gnomeH, knightH, skeletonH, hoodedH, ladyH, campGnomeH, human } from './humans.js';
import { CONTAINER_BUILDERS } from './containers.js';
import { stoneCottage, ruinedTower, monolithTower, ruinedArch, darkKeep, cathedral, alleyRow, campfire, hornedSkull, barrow } from './surface.js';
import { cragGeometry, rockMaterial, rockGeometry } from './vegetation.js';
import { stylize } from '../render/materials.js';
import { mulberry32 } from '../engine/noise.js';
import { lakeWater } from './water.js';
import { cloudSea } from './particles.js';
import { causeway } from './causeway.js';
import { tent, trollBoat, pillarCabin, treeHouse, throneKing, glowVines, stoneTower, walkway } from './gloaming2.js';

// type -> async (ctx, propJson, {x, z, area}) => { object, colliders, lights, glows, update }
// Builders work in local space; world.js places, rotates and scales them.

let crag;
const cragMaterial = (assets) => (crag ||= rockMaterial(assets, 0x9a88aa, 0.09));
const cragColors = new Map();
/** Crag material in a given colour; 'matte' for the painted surface. */
function coloredCrag(assets, color, matteish) {
  const key = color + (matteish ? ':m' : '');
  if (!cragColors.has(key)) {
    const m = rockMaterial(assets, new THREE.Color(color).getHex(), 0.09);
    if (matteish) { m.roughness = 1; m.envMapIntensity = 0.15; }
    cragColors.set(key, m);
  }
  return cragColors.get(key);
}

const kenneyMats = new Map();
/** Load a Kenney CC0 model and restyle it: keep its palette texture, swap in our PBR + rim. */
async function kenney(ctx, path, { tint = '#ffffff', roughness = 0.6, metalness = 0.2, rim = 0.5 } = {}) {
  const scene = await ctx.assets.model(`assets/models/${path}.glb`);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const key = `${path}:${tint}:${roughness}:${metalness}:${rim}`;
    let m = kenneyMats.get(key);
    if (!m) {
      m = stylize(new THREE.MeshStandardMaterial({ map: o.material.map, color: tint, roughness, metalness, envMapIntensity: 0.8 }), { rim });
      kenneyMats.set(key, m);
    }
    o.material = m;
    o.castShadow = o.receiveShadow = true;
  });
  return scene;
}

const glowOrb = (hex, intensity, r) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity) }));
  m.userData.emissive = true;
  return m;
};

export const PROP_BUILDERS = {
  causeway: (ctx, p, at) => causeway(ctx, p, at),
  lady: (ctx, p) => ladyH(ctx, p),
  camp_gnome: (ctx, p) => campGnomeH(ctx, p),
  tent: (ctx, p) => tent(ctx, p),
  troll_boat: (ctx, p) => trollBoat(ctx, p),
  pillar_cabin: (ctx, p) => pillarCabin(ctx, p),
  tree_house: (ctx, p) => treeHouse(ctx, p),
  throne_king: (ctx, p) => throneKing(ctx, p),
  glow_vines: (ctx, p) => glowVines(ctx, p),
  stone_tower: (ctx, p) => stoneTower(ctx, p),
  walkway: (ctx, p) => walkway(ctx, p),
  cloud_sea: (ctx, p) => { const g = new THREE.Group(); g.add(cloudSea(p)); return { object: g }; },
  /** Flat paved rectangle (w x l metres, long axis along local Z). */
  paving: (ctx, p) => {
    const [w, l] = p.size ?? [4, 20];
    const t = ctx.assets.pbr(p.texture ?? 'cobblestone_floor_08', [w / (p.tile ?? 3), l / (p.tile ?? 3)]);
    const mat = stylize(new THREE.MeshStandardMaterial({ ...t, color: p.color ?? '#ffffff', roughness: p.roughness ?? 1, envMapIntensity: 0.3 }), { rim: 0.05 });
    const geo = new THREE.PlaneGeometry(w, l, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.position.y = 0.04;
    const g = new THREE.Group();
    g.add(m);
    return { object: g };
  },

  manor: (ctx, p) => manor(ctx, p),
  hooded: (ctx, p) => hoodedH(ctx, p),
  stone_cottage: (ctx, p) => stoneCottage(ctx, p),
  ruined_tower: (ctx, p) => ruinedTower(ctx, p),
  monolith_tower: (ctx, p) => monolithTower(ctx, p),
  ruined_arch: (ctx, p) => ruinedArch(ctx, p),
  dark_keep: (ctx, p) => darkKeep(ctx, p),
  cathedral: (ctx, p) => cathedral(ctx, p),
  alley_row: (ctx, p) => alleyRow(ctx, p),
  campfire: (ctx, p) => campfire(ctx, p),
  horned_skull: (ctx, p) => hornedSkull(ctx, p),
  barrow: (ctx, p) => barrow(ctx, p),
  timber_house: (ctx, p) => timberHouse(ctx, p),
  cottage: (ctx, p) => cottage(ctx, p),
  castle_sandstone: (ctx, p) => sandstoneCastle(ctx, p),
  dead_tree: (ctx, p) => deadTree(ctx, p),
  great_tree: (ctx, p) => greatTree(ctx, p),

  /** Any Kenney model, restyled. */
  kenney: async (ctx, p) => {
    const obj = await kenney(ctx, p.model, p);
    const g = new THREE.Group();
    g.add(obj);
    return { object: g, colliders: p.collide ? [{ x: 0, z: 0, r: p.collide }] : [] };
  },

  /** Street lantern (Kenney CC0 post) with a warm HDR flame, light and ground pool. */
  lantern: async (ctx, p) => {
    const color = p.color ?? '#ffb04a';
    const post = await kenney(ctx, 'kenney-town/lantern', { tint: '#6a6070', roughness: 0.45, metalness: 0.6, rim: 0.6 });
    post.scale.setScalar(1.9);
    const g = new THREE.Group();
    g.add(post);
    const orb = glowOrb(color, p.intensity ?? 7, 0.16);
    orb.position.y = p.lampY ?? 2.55;
    g.add(orb);
    return {
      object: g,
      colliders: [{ x: 0, z: 0, r: 0.3 }],
      lights: [{ x: 0, y: p.lampY ?? 2.55, z: 0, color, intensity: p.light ?? 9, distance: 11, flicker: 0.12 }],
      glows: [{ x: 0, z: 0, radius: 3.6, color, intensity: 0.5 }],
    };
  },
  /** Water surface for a terrain `lake` feature (matched by id). */
  lake: (ctx, p) => {
    const f = ctx.terrain.features.find((t) => t.type === 'lake' && t.id === p.lake);
    const res = lakeWater(ctx, p, f);
    res.position = f.at;
    res.absY = f.level;
    return res;
  },

  /** Rounded boulder (e.g. the knight's rock in the lake). */
  boulder: (ctx, p) => {
    const m = new THREE.Mesh(rockGeometry(p.seed ?? 2, 4), p.color ? coloredCrag(ctx.assets, p.color) : cragMaterial(ctx.assets));
    const [sx, sy, sz] = p.size ?? [3, 1.5, 2.5];
    m.scale.set(sx, sy, sz);
    m.castShadow = m.receiveShadow = true;
    const g = new THREE.Group();
    g.add(m);
    return { object: g, colliders: [{ x: 0, z: 0, r: Math.min(sx, sz) * 0.45 }] };
  },

  castle_dark: (ctx, p) => darkCastle(ctx, p),
  ...CONTAINER_BUILDERS,
  /** An item lying in the world (placed by the game, see Game.placePickup). */
  loot: (ctx, p) => ({ pickup: { item: p.item, count: p.count ?? 1 } }),
  /** A hostile creature (data/enemies.json kind), spawned and run by the game. */
  enemy: (ctx, p) => ({ enemy: { kind: p.kind, patrol: p.patrol } }),
  /** A plain rigged person (merchants, townsfolk): options as in humans.js. */
  person: (ctx, p) => human(ctx, p),
  wizard: (ctx, p) => wizardH(ctx, p),
  gnome: (ctx, p) => gnomeH(ctx, p),
  knight: (ctx, p) => knightH(ctx, p),
  skeleton: (ctx, p) => skeletonH(ctx, p),
  golden_skull: (ctx, p) => goldenSkull(ctx, p),

  /** Big craggy rock: a stretched displaced blob. */
  crag: (ctx, p) => {
    const rand = mulberry32(p.seed ?? 1);
    const geo = cragGeometry(p.seed ?? 1, 3);
    const mat = p.color ? coloredCrag(ctx.assets, p.color, p.matte) : cragMaterial(ctx.assets);
    const m = new THREE.Mesh(geo, mat);
    const [sx, sy, sz] = p.size ?? [10, 12, 10];
    m.scale.set(sx, sy, sz);
    m.rotation.set((rand() - 0.5) * 0.3, rand() * 6.28, (rand() - 0.5) * 0.3);
    m.castShadow = m.receiveShadow = true;
    const g = new THREE.Group();
    g.add(m);
    return { object: g, colliders: [{ x: 0, z: 0, r: Math.min(sx, sz) * 0.42 }] };
  },
};
