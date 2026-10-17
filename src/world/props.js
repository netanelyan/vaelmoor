import * as THREE from 'three';
import { darkCastle } from './buildings.js';
import { cragGeometry, rockMaterial } from './vegetation.js';
import { stylize } from '../render/materials.js';
import { mulberry32 } from '../engine/noise.js';

// type -> async (ctx, propJson, {x, z, area}) => { object, colliders, lights, glows, update }
// Builders work in local space; world.js places, rotates and scales them.

let crag;
const cragMaterial = (assets) => (crag ||= rockMaterial(assets, 0x9a88aa, 0.09));

export const PROP_BUILDERS = {
  castle_dark: (ctx, p) => darkCastle(ctx, p),

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
