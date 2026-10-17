import * as THREE from 'three';
import { stylize } from '../render/materials.js';
import { human } from './humans.js';

// Searchable props: chests, barrels, sacks, urns and bodies. Each returns
// the usual prop result plus `container` ({ table, locked, owner, name }),
// which the world registers as a "Search" target.

let woodTex = null;
function wood(assets, color = '#7a5a3a') {
  woodTex ||= assets.pbr('dark_wooden_planks', [1, 1]);
  return stylize(new THREE.MeshStandardMaterial({ ...woodTex, color, roughness: 0.85 }), { rim: 0.25 });
}
const iron = () => stylize(new THREE.MeshStandardMaterial({ color: '#4a4a50', metalness: 0.8, roughness: 0.45 }), { rim: 0.2 });
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };

function chest(ctx, p) {
  const g = new THREE.Group();
  const W = 0.95, D = 0.58, H = 0.5;
  const w = wood(ctx.assets, p.color ?? '#7a5a3a'), m = iron();
  g.add(mesh(new THREE.BoxGeometry(W, H, D), w, 0, H / 2, 0));
  const lid = new THREE.CylinderGeometry(D / 2, D / 2, W, 16, 1, false, 0, Math.PI);
  lid.rotateZ(Math.PI / 2);
  lid.rotateX(-Math.PI / 2);
  g.add(mesh(lid, w, 0, H, 0));
  for (const x of [-W * 0.36, W * 0.36]) {
    g.add(mesh(new THREE.BoxGeometry(0.06, H + 0.01, D + 0.02), m, x, H / 2, 0));
    const band = new THREE.CylinderGeometry(D / 2 + 0.012, D / 2 + 0.012, 0.06, 16, 1, true, 0, Math.PI);
    band.rotateZ(Math.PI / 2); band.rotateX(-Math.PI / 2);
    g.add(mesh(band, m, x, H, 0));
  }
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.14, 0.03), m, 0, H - 0.02, D / 2 + 0.012));
  return { object: g, colliders: [{ x: 0, z: 0, r: 0.55 }], container: { table: p.loot ?? 'chest_common', locked: p.locked ?? null, owner: p.owner ?? null, name: p.name ?? 'Chest' }, targetY: 0.6 };
}

function barrel(ctx, p) {
  const g = new THREE.Group();
  const prof = [[0.3, 0], [0.36, 0.25], [0.38, 0.45], [0.36, 0.65], [0.3, 0.9]].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(mesh(new THREE.LatheGeometry(prof, 20), wood(ctx.assets, p.color ?? '#6a4a2c')));
  g.add(mesh(new THREE.CircleGeometry(0.3, 20).rotateX(-Math.PI / 2), wood(ctx.assets, '#5a3a22'), 0, 0.89, 0));
  for (const y of [0.12, 0.78]) g.add(mesh(new THREE.TorusGeometry(0.335, 0.012, 4, 24).rotateX(Math.PI / 2), iron(), 0, y, 0));
  return { object: g, colliders: [{ x: 0, z: 0, r: 0.42 }], container: { table: p.loot ?? 'barrel_food', locked: null, owner: p.owner ?? null, name: p.name ?? 'Barrel' }, targetY: 0.8 };
}

function sack(ctx, p) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.3, 16, 12);
  const a = geo.attributes.position;
  for (let i = 0; i < a.count; i++) {
    const y = a.getY(i);
    const k = 1 + 0.08 * Math.sin(a.getX(i) * 20) * Math.cos(a.getZ(i) * 17);
    a.setXYZ(i, a.getX(i) * k * (y > 0.1 ? 0.8 : 1.1), y < 0 ? y * 0.6 : y * 1.3, a.getZ(i) * k * (y > 0.1 ? 0.8 : 1.05));
  }
  geo.computeVertexNormals();
  const burlap = stylize(new THREE.MeshStandardMaterial({ color: p.color ?? '#8a7a5a', roughness: 1 }), { rim: 0.2 });
  g.add(mesh(geo, burlap, 0, 0.2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.12, 10), burlap, 0, 0.6, 0));
  return { object: g, colliders: [{ x: 0, z: 0, r: 0.35 }], container: { table: p.loot ?? 'sack_herbs', locked: null, owner: p.owner ?? null, name: p.name ?? 'Sack' }, targetY: 0.45 };
}

function urn(ctx, p) {
  const g = new THREE.Group();
  const prof = [[0.12, 0], [0.24, 0.12], [0.28, 0.32], [0.2, 0.5], [0.12, 0.58], [0.15, 0.66]].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(mesh(new THREE.LatheGeometry(prof, 18), stylize(new THREE.MeshStandardMaterial({ color: p.color ?? '#6a5a4a', roughness: 0.9 }), { rim: 0.2 })));
  return { object: g, colliders: [{ x: 0, z: 0, r: 0.3 }], container: { table: p.loot ?? 'coffin', locked: null, owner: null, name: p.name ?? 'Burial Urn' }, targetY: 0.5 };
}

/** A body lying where it fell (a rigged figure held at the last frame of its death). */
async function body(ctx, p) {
  const res = await human(ctx, {
    outfit: p.outfit ?? 'Male_Ranger', anim: 'Death01', at: 1, freeze: true, seed: p.seed ?? 3,
    cloth: p.cloth ?? '#4a4038', hood: p.hood ?? false, pale: true,
  });
  res.colliders = [];
  res.update = null;
  res.container = { table: p.loot ?? 'body_traveller', locked: null, owner: null, name: p.name ?? 'Dead Traveller' };
  res.targetY = 0.3;
  res.targetZ = -0.6;
  return res;
}

export const CONTAINER_BUILDERS = { chest, barrel, sack, urn, body };
