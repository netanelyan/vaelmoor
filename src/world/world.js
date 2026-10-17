import * as THREE from 'three';
import { Road } from './road.js';
import { Terrain } from './terrain.js';
import { Colliders } from './colliders.js';
import { makePineScatter, makeRockScatter, makeCragScatter } from './vegetation.js';
import { fireflies, smoke, mist, groundGlow } from './particles.js';
import { PROP_BUILDERS } from './props.js';
import { buildGrass } from './grass.js';
import { Interactables } from '../game/interact.js';
import { mulberry32, hashString, smoothstep } from '../engine/noise.js';

const DEG = Math.PI / 180;

// Builds the whole region from its JSON description. Positions inside an area
// ([x, z] pairs) are relative to the area's centre; heights snap to the
// ground unless an explicit `y` offset is given.

export async function buildWorld({ scene, assets, region, lightPool }) {
  const T = region.terrain;
  const bounds = { minX: T.center[0] - T.size / 2, minZ: T.center[1] - T.size / 2, size: T.size };
  const road = new Road(region.road, bounds);
  const terrain = new Terrain(T, road, region.areas);
  const colliders = new Colliders();
  const interactables = new Interactables();
  const updaters = [];
  const waters = [];
  const containerDefs = []; // [{ id, def }] registered with the game's Containers
  const pickupDefs = [];    // [{ uid, item, count, at, rot }] placed by the game

  // --- ground & road tinting blended from area palettes
  const tintSources = region.areas.map((a) => ({
    x: a.center[0], z: a.center[1], reach: (a.reach ?? 70) * 0.9,
    ground: new THREE.Color(a.ground?.tint ?? T.groundTint ?? '#4a5a3a'),
    road: new THREE.Color(a.ground?.road ?? region.road.tint ?? '#ffffff'),
  }));
  const blendTint = (key, fallback) => (x, z, out) => {
    let tw = 0; out.setRGB(0, 0, 0);
    for (const s of tintSources) {
      const d = Math.hypot(x - s.x, z - s.z) / s.reach;
      const w = Math.exp(-d * d * 1.4);
      out.r += s[key].r * w; out.g += s[key].g * w; out.b += s[key].b * w; tw += w;
    }
    const f = new THREE.Color(fallback);
    const base = 0.03;
    out.r = (out.r + f.r * base) / (tw + base);
    out.g = (out.g + f.g * base) / (tw + base);
    out.b = (out.b + f.b * base) / (tw + base);
    return out;
  };
  scene.add(terrain.buildMesh(assets, blendTint('ground', T.groundTint ?? '#3a4a30')));
  scene.add(road.buildMesh(assets, blendTint('road', region.road.tint ?? '#ffffff')));

  /** Walkable ground height (road surface where on the road). */
  const groundAt = (x, z) => {
    const h = terrain.heightAt(x, z);
    if (road.coarseDistance(x, z) > road.half + 6) return h;
    const n = road.nearest(x, z);
    if (n.i >= 0 && n.dist < road.half) {
      const a = n.dist / road.half;
      return Math.max(h, road.y[n.i] + 0.02 + 0.1 * (1 - a * a));
    }
    return h;
  };

  const waterLevelAt = (x, z) => terrain.waterLevel(x, z);

  const ctx = { scene, assets, terrain, road, groundAt, region, colliders, lightPool, updaters, waters };
  const VIEW_DIST = { castle_dark: 2000, castle_sandstone: 2000, lake: 2000, manor: 600, great_tree: 600, timber_house: 400, cottage: 320, dead_tree: 320, crag: 450, boulder: 260, kenney: 150, lantern: 180 };
  const culled = [];

  // --- per-area content
  const pines = makePineScatter(assets);
  const rocks = makeRockScatter(assets);
  const crags = makeCragScatter(assets);
  ctx.crags = crags;
  const clearings = [];
  ctx.pines = pines;
  ctx.rocks = rocks;

  // pass 1: every clearing (cameras, characters, explicit) before anything is scattered
  const CHARACTER_CLEAR = { wizard: 6, gnome: 5, knight: 6, skeleton: 6, golden_skull: 4 };
  for (const area of region.areas) {
    const [ax, az] = area.center;
    const local = (p) => [ax + p[0], az + p[1]];
    // keep photo-mode cameras and characters out of the trees
    if (area.shot) {
      const [x, z] = local(area.shot.at);
      clearings.push({ x, z, r: area.shot.clear ?? 13 });
    }
    for (const c of area.clearings || []) {
      const [x, z] = local(c);
      clearings.push({ x, z, r: c[2] });
    }

    for (const prop of area.props || []) {
      const r = prop.clear ?? CHARACTER_CLEAR[prop.type];
      if (r && prop.at) { const [x, z] = local(prop.at); clearings.push({ x, z, r }); }
    }
  }

  for (const area of region.areas) {
    const [ax, az] = area.center;
    const local = (p) => [ax + p[0], az + p[1]];
    for (const prop of area.props || []) {
      let [x, z] = local(prop.at ?? [0, 0]);
      const builder = PROP_BUILDERS[prop.type];
      if (!builder) { console.warn('unknown prop type', prop.type); continue; }
      const res = await builder(ctx, prop, { x, z, area });
      if (!res) continue;
      const propId = `${region.id}:${prop.id ?? `${prop.type}@${Math.round(x)},${Math.round(z)}`}`;
      if (res.pickup) {
        const py = prop.absY ?? groundAt(x, z) + (prop.y ?? 0);
        pickupDefs.push({ uid: propId, ...res.pickup, at: [x, py, z], rot: (prop.rot ?? 0) * DEG });
        continue;
      }
      if (res.position) [x, z] = res.position;
      const yAtPos = prop.yAt ? local(prop.yAt) : null;
      const y = res.absY ?? prop.absY
        ?? (yAtPos ? groundAt(yAtPos[0], yAtPos[1]) + (prop.y ?? 0) : null)
        ?? (prop.aboveWater !== undefined ? terrain.waterLevel(x, z) + prop.aboveWater : groundAt(x, z) + (prop.y ?? 0));
      const rot = (prop.rot ?? 0) * DEG;
      const s = prop.scale ?? 1;
      if (res.object) {
        res.object.position.set(x, y, z);
        res.object.rotation.y = rot;
        res.object.scale.setScalar(s);
        res.object.name ||= prop.type;
        scene.add(res.object);
        culled.push({ obj: res.object, x, z, d: prop.viewDist ?? VIEW_DIST[prop.type] ?? 170 });
      }
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const toWorld = (lx, lz) => [x + (lx * cos + lz * sin) * s, z + (-lx * sin + lz * cos) * s];
      for (const c of res.colliders || []) {
        const [wx, wz] = toWorld(c.x, c.z);
        colliders.add(wx, wz, c.r * s);
      }
      for (const l of res.lights || []) {
        const [wx, wz] = toWorld(l.x, l.z);
        lightPool.add({ ...l, x: wx, y: y + l.y * s, z: wz });
      }
      for (const g of res.glows || []) {
        const [wx, wz] = toWorld(g.x, g.z);
        scene.add(groundGlow({ ...g, x: wx, z: wz, groundAt, rotY: rot + (g.rotY ?? 0) }));
      }
      // things the player can use
      if (res.container) {
        const [cx, cz] = toWorld(0, res.targetZ ?? 0);
        containerDefs.push({ id: propId, def: res.container });
        const ci = interactables.add({ id: propId, name: res.container.name, action: 'Search', kind: 'container', radius: 0.55,
          pos: new THREE.Vector3(cx, y + (res.targetY ?? 0.5) * s, cz), object: res.object });
        ci.container = propId;
      }
      if (prop.npc) {
        interactables.add({ id: prop.npc, name: prop.name ?? prop.npc, action: 'Talk', kind: 'npc', radius: 0.6,
          pos: new THREE.Vector3(x, y + (prop.talkY ?? 1.5) * s, z) });
      }
      if (prop.item) {
        interactables.add({ id: prop.item, name: prop.name ?? prop.item, action: 'Take', kind: 'item', radius: 0.45,
          pos: new THREE.Vector3(x, y + 0.35 * s, z), object: res.object });
      }
      if (res.door && prop.door !== false) {
        const [dx, dz] = toWorld(res.door.x, res.door.z);
        interactables.add({ id: `${prop.type}@${Math.round(x)},${Math.round(z)}`, name: prop.doorName ?? res.door.name ?? 'Door', action: 'Open', kind: 'door', radius: 0.8,
          pos: new THREE.Vector3(dx, y + res.door.y * s, dz) });
      }
      if (res.update) updaters.push(res.update);
      if (res.chimney && prop.smoke !== false) {
        const [cx, cz] = toWorld(res.chimney[0], res.chimney[2]);
        scene.add(smoke({ at: [cx, y + res.chimney[1] * s, cz], ...(prop.smoke || {}), seed: Math.floor(cx * 13 + cz) }));
      }
    }

    for (const l of area.lights || []) {
      const [x, z] = local(l.at);
      lightPool.add({ ...l, x, z, y: groundAt(x, z) + (l.y ?? 2) });
    }
    for (const g of area.glows || []) {
      const [x, z] = local(g.at);
      scene.add(groundGlow({ ...g, x, z, groundAt, rotY: (g.rot ?? 0) * DEG }));
    }
    for (const f of area.fireflies || []) scene.add(fireflies({ ...f, center: local(f.at), groundAt, seed: hashString(area.id) }));
    for (const m of area.mist || []) scene.add(mist({ ...m, center: local(m.at), groundAt, seed: hashString(area.id + 'mist') }));
    for (const sm of area.smoke || []) {
      const [x, z] = local(sm.at);
      scene.add(smoke({ ...sm, at: [x, sm.absY ?? groundAt(x, z) + (sm.y ?? 0), z] }));
    }

    // explicit trees / rocks
    for (const t of area.trees || []) {
      const [x, z] = local(t.at);
      addTree(ctx, t.kind ?? 'pine', x, z, t.scale ?? 14, t.seed ?? x * 7 + z);
    }
    // scatter rules
    for (const s of area.scatter || []) {
      const rand = mulberry32(hashString(area.id + s.kind + (s.seed ?? '')));
      const [cx, cz] = local(s.at ?? [0, 0]);
      let placed = 0, tries = 0;
      while (placed < s.count && tries++ < s.count * 30) {
        const a = rand() * Math.PI * 2, r = (s.minR ?? 0) + Math.sqrt(rand()) * (s.radius - (s.minR ?? 0));
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        const rdist = road.distance(x, z);
        if (rdist < (s.minRoad ?? 6) || rdist > (s.maxRoad ?? Infinity)) continue;
        if (clearings.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) continue;
        if (waterLevelAt(x, z) > terrain.heightAt(x, z) - 0.3 && s.kind !== 'rock') continue;
        const sc = s.scale[0] + rand() * (s.scale[1] - s.scale[0]);
        addTree(ctx, s.kind, x, z, sc, rand() * 1000);
        placed++;
      }
    }
  }

  // --- background forest fill
  const F = region.forest;
  if (F) {
    const rand = mulberry32(F.seed ?? 99);
    const N = terrain.noise;
    for (let x = bounds.minX + 4; x < bounds.minX + bounds.size - 4; x += F.spacing) {
      for (let z = bounds.minZ + 4; z < bounds.minZ + bounds.size - 4; z += F.spacing) {
        const px = x + (rand() - 0.5) * F.spacing * 0.9, pz = z + (rand() - 0.5) * F.spacing * 0.9;
        const dens = 0.5 + 0.5 * N.fbm(px * 0.012, pz * 0.012, 2);
        const rd = road.distance(px, pz);
        const nearRoad = smoothstep(F.clearRoad, F.clearRoad + 12, rd);
        if (rand() > dens * F.density * nearRoad) continue;
        if (clearings.some((c) => Math.hypot(px - c.x, pz - c.z) < c.r)) continue;
        if (waterLevelAt(px, pz) > terrain.heightAt(px, pz) - 0.5) continue;
        if (terrain.normalAt(px, pz).y < 0.72) continue;
        addTree(ctx, 'pine', px, pz, F.scale[0] + rand() * (F.scale[1] - F.scale[0]), rand() * 1000);
      }
    }
  }
  scene.add(pines.build());
  scene.add(rocks.build());
  scene.add(crags.build());
  updaters.push((dt, t, cam) => {
    pines.update(cam); rocks.update(cam); crags.update(cam);
    for (const c of culled) c.obj.visible = Math.hypot(cam.x - c.x, cam.z - c.z) < c.d;
  });

  const world = {
    interactables, terrain, road, groundAt, colliders, waters, waterLevelAt, containerDefs, pickupDefs,
    update(dt, t, cam) { for (const u of updaters) u(dt, t, cam); },
  };
  scene.add(buildGrass(world, region));
  return world;
}

function addTree(ctx, kind, x, z, scale, seed) {
  const rand = mulberry32(Math.floor(seed * 1000) >>> 0);
  const y = ctx.terrain.heightAt(x, z);
  if (kind === 'pine') {
    ctx.pines.add(x, y - 0.3, z, scale, rand() * Math.PI * 2, (rand() - 0.5) * 0.06, 0.85 + rand() * 0.3);
    ctx.colliders.add(x, z, Math.max(0.35, scale * 0.025));
  } else if (kind === 'crag') {
    ctx.crags.add(x, y - scale * 0.15, z, scale, rand() * Math.PI * 2, (rand() - 0.5) * 0.12, 0.7 + rand() * 0.6);
    ctx.colliders.add(x, z, scale * 0.42);
  } else if (kind === 'rock') {
    ctx.rocks.add(x, y - scale * 0.12, z, scale, rand() * Math.PI * 2, (rand() - 0.5) * 0.3, 0.8 + rand() * 0.5);
    if (scale > 1.2) ctx.colliders.add(x, z, scale * 0.45);
  }
}
