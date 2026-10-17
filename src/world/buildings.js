import * as THREE from 'three';
import { mulberry32 } from '../engine/noise.js';
import { stylize } from '../render/materials.js';
import {
  Builder, boxUV, cylUV, roundTower, roundCrenels, spire, wall, gableRoofGeometry,
  towerWindows, faceWindows, glowMaterial, stoneMaterial, baseMaterials, archGeometry,
} from './architecture.js';

// Each builder returns { object, colliders: [{x, z, r}], lights: [{x, y, z, color, intensity, distance}] }
// in local space (front faces +Z). The world builder places them from JSON.

/** ref_02: dark spired castle at the end of the road. */
export function darkCastle(ctx, o = {}) {
  const rand = mulberry32(o.seed ?? 21);
  const b = new Builder();
  const glowKey = 'glowGreen';

  // gatehouse with flanking round towers
  const gh = { w: 16, h: 19, d: 10 };
  const ghGeo = new THREE.BoxGeometry(gh.w, gh.h, gh.d);
  b.add('stone', boxUV(ghGeo.applyMatrix4(b.m(0, gh.h / 2, -gh.d / 2))));
  wall(b, { x0: -gh.w / 2, z0: -0.2, x1: gh.w / 2, z1: -0.2, y: gh.h, h: 0.01, t: 1.2, crenels: true });
  // gate arch: glowing interior + dark portcullis bars
  const gateW = 6.5, gateH = 10;
  b.add('gateGlow', archGeometry(gateW, gateH), b.m(0, 0, 0.05));
  const bar = new THREE.BoxGeometry(0.22, gateH, 0.22);
  for (let i = -3; i <= 3; i++) b.add('trim', bar, b.m(i * 0.9, gateH / 2 - 0.4, 0.3));
  for (let j = 1; j <= 4; j++) b.add('trim', new THREE.BoxGeometry(gateW, 0.2, 0.2), b.m(0, j * 2.2, 0.3));
  // arch surround
  const surround = new THREE.TorusGeometry(gateW / 2 + 0.5, 0.55, 6, 16, Math.PI);
  b.add('stone', cylUV(surround), b.m(0, gateH - gateW / 2, 0.3));
  faceWindows(b, { cx: 0, cz: 0, ry: 0, y0: 13, cols: 3, rows: 1, dx: 3.2, dy: 0, w: 1.0, h: 2.6, key: glowKey, lit: 1, rand });

  for (const sx of [-1, 1]) {
    const fr = o.flankR ?? 4.6, fh = o.flankH ?? 26;
    const x = sx * (6 + fr), z = -2;
    const top = roundTower(b, { x, z, r: fr, h: fh });
    roundCrenels(b, { x, z, y: top, r: fr * 0.96, count: Math.round(fr * 3) });
    if (o.flankSpire !== false) spire(b, { x, z, y: top + 2.2, r: fr * 0.87, h: 15 });
    if (o.windowRing) towerWindows(b, { x, z, y0: fh - 4.5, r: fr * 0.98, rows: 1, perRow: 12, spacing: 1, w: 0.55, h: 1.9, key: glowKey, lit: 1, rand });
    towerWindows(b, { x, z, y0: 8, r: fr * 0.98, rows: o.flankRows ?? 3, perRow: o.flankPerRow ?? 4, spacing: 5.5, w: o.flankWinW ?? 1.0, h: o.flankWinH ?? 2.4, key: glowKey, lit: 0.8, rand, phase: 0.2 });
  }

  // curtain walls to corner towers
  for (const sx of [-1, 1]) {
    wall(b, { x0: sx * 14, z0: -3, x1: sx * 33, z1: -14, h: 14, t: 3 });
    const x = sx * 35, z = -16;
    const top = roundTower(b, { x, z, r: 5.2, h: 24 });
    roundCrenels(b, { x, z, y: top, r: 5.2 * 0.96 });
    spire(b, { x, z, y: top + 2.2, r: 4.6, h: 13 });
    towerWindows(b, { x, z, y0: 10, r: 5.1, rows: 2, perRow: 5, spacing: 6, key: glowKey, lit: 0.7, rand });
    wall(b, { x0: sx * 36, z0: -20, x1: sx * 30, z1: -52, h: 15, t: 3 });
  }

  // keep: tall block with steep roof
  const kp = { w: 30, h: 36, d: 22, z: -32 };
  b.add('stone', boxUV(new THREE.BoxGeometry(kp.w, kp.h, kp.d).applyMatrix4(b.m(0, kp.h / 2, kp.z))));
  const roof = gableRoofGeometry(kp.w, kp.d, 15, 1.2);
  b.add('roof', boxUV(roof.applyMatrix4(b.m(0, kp.h, kp.z)), 2.5));
  faceWindows(b, { cx: 0, cz: kp.z + kp.d / 2, ry: 0, y0: 6, cols: 5, rows: 4, dx: 5.4, dy: 7.5, w: 1.5, h: 4.2, key: glowKey, lit: 0.72, rand });
  for (const sx of [-1, 1]) {
    faceWindows(b, { cx: sx * kp.w / 2, cz: kp.z, ry: sx * Math.PI / 2, y0: 8, cols: 3, rows: 3, dx: 6, dy: 8, w: 1.3, h: 3.6, key: glowKey, lit: 0.6, rand });
  }
  // dormer turrets on the keep roof
  for (const sx of [-1, 0, 1]) {
    const x = sx * 9, z = kp.z + 6, y = kp.h + 2;
    roundTower(b, { x, z, y, r: 1.4, h: 5, segs: 10 });
    spire(b, { x, z, y: y + 5, r: 1.5, h: 6, segs: 8 });
    towerWindows(b, { x, z, y0: y + 1.2, r: 1.45, rows: 1, perRow: 3, w: 0.6, h: 1.6, key: glowKey, lit: 0.9, rand, phase: -0.3 });
  }

  // corner towers of the keep
  for (const [x, z, r, h, sh] of [[-15, -21, 3.6, 46, 18], [15, -21, 3.6, 46, 18], [-14, -44, 4.0, 52, 20], [14, -44, 4.0, 52, 20]]) {
    const top = roundTower(b, { x, z, r, h, segs: 14 });
    // corbelled lip + spire
    const lip = cylUV(new THREE.CylinderGeometry(r * 1.18, r * 0.98, 1.6, 14));
    b.add('stone', lip, b.m(x, top + 0.8, z));
    spire(b, { x, z, y: top + 1.6, r: r * 1.12, h: sh, segs: 12 });
    towerWindows(b, { x, z, y0: 18, r: r * 0.99, rows: 4, perRow: 3, spacing: 6.5, w: 0.9, h: 2.4, key: glowKey, lit: 0.75, rand });
  }

  // great central tower with a needle spire
  {
    const x = 0, z = -40, r = 6.2;
    const top = roundTower(b, { x, z, r, h: 64, segs: 20, taper: 0.9 });
    roundCrenels(b, { x, z, y: top, r: r * 0.9, count: 16 });
    // belfry stage
    const bx = cylUV(new THREE.CylinderGeometry(r * 0.62, r * 0.7, 8, 12));
    b.add('stone', bx, b.m(x, top + 5.5, z));
    towerWindows(b, { x, z, y0: top + 2.4, r: r * 0.66, rows: 1, perRow: 6, w: 1.2, h: 3.8, key: glowKey, lit: 1, rand });
    spire(b, { x, z, y: top + 9.5, r: r * 0.7, h: 30, segs: 12 });
    towerWindows(b, { x, z, y0: 24, r: r * 0.95, rows: 5, perRow: 4, spacing: 7, w: 1.2, h: 3.2, key: glowKey, lit: 0.8, rand, phase: 0.4 });
  }

  // slender turrets for a busy spire silhouette
  for (const [x, z, h] of [[-24, -30, 34], [24, -30, 34], [-7, -52, 58], [8, -54, 40], [-20, -52, 30], [21, -50, 36]]) {
    const top = roundTower(b, { x, z, r: 2.2, h, segs: 10 });
    spire(b, { x, z, y: top, r: 2.6, h: 11 + rand() * 6, segs: 10 });
    towerWindows(b, { x, z, y0: h - 7, r: 2.25, rows: 1, perRow: 2, w: 0.7, h: 1.9, key: glowKey, lit: 0.8, rand });
  }

  const S = o.stoneColor ?? 0x5a4f72;
  const mats = {
    ...baseMaterials(ctx.assets),
    stone: stoneMaterial(ctx.assets, 'castle_wall_slates', S, { rim: 0.4, roughness: 0.8 }),
    roof: stylize(new THREE.MeshStandardMaterial({
      ...ctx.assets.pbr('roof_slates_02', [1, 1]), color: o.roofColor ?? 0x37305a, roughness: 0.38, metalness: 0.15, envMapIntensity: 1.2,
    }), { rim: 0.6 }),
    glowGreen: glowMaterial(o.windowColor ?? '#5dff8a', o.windowIntensity ?? 5.5, 'mullion'),
    gateGlow: glowMaterial(o.windowColor ?? '#5dff8a', o.gateIntensity ?? 3.2, 'none'),
  };
  const object = b.build(mats);
  const colliders = [
    { x: 0, z: -5, r: 9 }, { x: -10.5, z: -2, r: 5 }, { x: 10.5, z: -2, r: 5 },
    { x: -35, z: -16, r: 5.6 }, { x: 35, z: -16, r: 5.6 }, { x: 0, z: -32, r: 18 },
    { x: -23, z: -9, r: 3 }, { x: 23, z: -9, r: 3 },
  ];
  const lights = [
    { x: 0, y: 4, z: 5, color: '#4dff86', intensity: o.lightScale != null ? 60 * o.lightScale : 60, distance: 40 },
    { x: -10, y: 12, z: 6, color: '#4dff86', intensity: o.lightScale != null ? 25 * o.lightScale : 25, distance: 26 },
    { x: 10, y: 12, z: 6, color: '#4dff86', intensity: o.lightScale != null ? 25 * o.lightScale : 25, distance: 26 },
  ];
  return { object, colliders, lights };
}
