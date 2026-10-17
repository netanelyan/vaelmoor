import * as THREE from 'three';
import { darkCastle } from './buildings.js';
import { manor, timberHouse, cottage, sandstoneCastle } from './houses.js';
import { deadTree, greatTree } from './trees.js';
import { wizard, gnome, knight, skeleton, goldenSkull } from './characters.js';
import { cragGeometry, rockMaterial, rockGeometry } from './vegetation.js';
import { stylize } from '../render/materials.js';
import { mulberry32 } from '../engine/noise.js';
import { lakeWater } from './water.js';

// type -> async (ctx, propJson, {x, z, area}) => { object, colliders, lights, glows, update }
// Builders work in local space; world.js places, rotates and scales them.

let crag;
const cragMaterial = (assets) => (crag ||= rockMaterial(assets, 0x9a88aa, 0.09));

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
  manor: (ctx, p) => manor(ctx, p),
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
    const m = new THREE.Mesh(rockGeometry(p.seed ?? 2, 4), cragMaterial(ctx.assets));
    const [sx, sy, sz] = p.size ?? [3, 1.5, 2.5];
    m.scale.set(sx, sy, sz);
    m.castShadow = m.receiveShadow = true;
    const g = new THREE.Group();
    g.add(m);
    return { object: g, colliders: [{ x: 0, z: 0, r: Math.min(sx, sz) * 0.45 }] };
  },

  castle_dark: (ctx, p) => darkCastle(ctx, p),
  wizard: (ctx, p) => wizard(ctx, p),
  gnome: (ctx, p) => gnome(ctx, p),
  knight: (ctx, p) => knight(ctx, p),
  skeleton: (ctx, p) => skeleton(ctx, p),
  golden_skull: (ctx, p) => goldenSkull(ctx, p),

  /** Big craggy rock: a stretched displaced blob. */
  crag: (ctx, p) => {
    const rand = mulberry32(p.seed ?? 1);
    const geo = cragGeometry(p.seed ?? 1, 3);
    const m = new THREE.Mesh(geo, cragMaterial(ctx.assets));
    const [sx, sy, sz] = p.size ?? [10, 12, 10];
    m.scale.set(sx, sy, sz);
    m.rotation.set((rand() - 0.5) * 0.3, rand() * 6.28, (rand() - 0.5) * 0.3);
    m.castShadow = m.receiveShadow = true;
    const g = new THREE.Group();
    g.add(m);
    return { object: g, colliders: [{ x: 0, z: 0, r: Math.min(sx, sz) * 0.42 }] };
  },
};
