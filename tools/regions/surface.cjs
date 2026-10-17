// Generates data/regions/surface.json:  node tools/regions/surface.cjs
// (kept as a script so camera framings and positions can be
// derived from each other while iterating; the JSON is the shipped artifact).
const fs = require('fs');
const r1 = (v) => Math.round(v * 10) / 10;
const face = (x, z, tx, tz) => r1((Math.atan2(tx - x, tz - z) * 180) / Math.PI);

const region = {
  id: 'surface',
  name: 'Vaelmoor',
  renderProfile: { kind: 'painted' },
  spawn: { at: [14, 28], yaw: 200 },
  terrain: {
    center: [50, -40], size: 760, cell: 2.5, seed: 31,
    baseAmp: 10, detailAmp: 1.6, valleyWidth: 16, valleyRise: 80, ridgeAmp: 22,
    groundTexture: 'leafy_grass', rockTexture: 'rock_face', groundTint: '#3a4a3a', snowTint: '#9aa8e0',
    features: [{ type: 'hill', at: [-4, -10], radius: 30, height: 6 }],
  },
  road: {
    width: 1.9,
    tint: '#e8c4a0',
    material: { texture: 'stony_dirt_path', matte: true, color: 0xc8b090, uvScale: 2.2, boost: 4.6 },
    points: [
      [1, 0], [3, 8], [6, 16], [4, 24], [8, 34], [-30, 40], [-80, 20], [-120, -40], [-170, -110], [-192, -160], [-182, -200], [-150, -215], [-90, -230],
      [-30, -190], [20, -150], [70, -200], [130, -250], [190, -230], [240, -170], [290, -100], [300, -40],
      [270, 30], [220, 80], [170, 140], [120, 180], [40, 200], [-60, 170], [-130, 150], [-180, 110], [-150, 60], [-70, 40],
    ],
  },
  forest: { spacing: 7.5, density: 0.8, clearRoad: 6, scale: [12, 22], seed: 7 },
  atmosphereDefaults: {
    sky: {
      zenith: '#04061a', mid: '#0c1650', horizon: '#26307a', glow: '#3a4aa0', glowStrength: 0.25,
      cloudDark: '#060a28', cloudLight: '#3a4c9a', cloudRim: '#8a9ad8', cloudCover: 0.55, cloudScale: 0.9, cloudSharp: 0.14,
      cloudBright: 1.0, cloudHeight: 0.18, swirl: 1.6, stars: 1.2,
      moonDir: [40, 40], moonColor: '#d8e4ff', moonSize: 0.09, moonPhase: 0, moonGlow: 1.1, moonBright: 2.4,
      aurora: 0, auroraA: '#30ff9a', auroraB: '#40c0ff', mountain: '#0a0c20', mountainHeight: 0.03,
      planetAColor: '#c08060',planetBColor: '#6080c0',nebulaA: '#ff3a8a',nebulaB: '#6a4aff',planetADir: [30,60],planetBDir: [60,50],planetASize: 0,planetBSize: 0,nebula: 0,sparkle: 0,
    },
    fog: { color: '#141c48', density: 0.012, falloff: 0.06 },
    ambient: { sky: '#4a5ab8', ground: '#141a24', intensity: 1.4 },
    moonLight: { color: '#b8c8ff', intensity: 3.2 },
    fill: { color: '#6a7ad0', intensity: 0.25 },
    rim: { color: '#8a9ae0', strength: 0.25 },
    env: { intensity: 0.4 },
    road: { sheen: 0 },
    water: { color: '#06102a', glint: '#a0b0ff', distortion: 1.4, tint: '#6070c0' },
    post: {
      bloom: 0.12, bloomRadius: 0.2, bloomThreshold: 0.95,
      saturation: 1.3, vibrance: 0.15, contrast: 1.12, blackCrush: 0.5, vignette: 0.2,
      shadowTint: '#05061a', highlightTint: '#e0e8ff', exposure: 1.35,
    },
  },
  areas: [],
};

const area = (o) => { region.areas.push(o); return o; };

// ---------------------------------------------------------------- dark_01 cottage
{
  const c = [0, 0];
  // camera low on the path, looking up it; cottage small in the upper third
  const cam = [8.2, 23.5];
  const cot = [-2, -6];
  const az = (Math.atan2(cot[0] - cam[0], -(cot[1] - cam[1])) * 180) / Math.PI;
  area({
    id: 'cottage', name: 'Hollin Cottage', ref: 'dark_01', center: c, reach: 55,
    description: 'Stone cottage on a grassy path, pale blue moon.',
    ground: { tint: '#5e7040', grass: 0.34, grassTint: '#6e8a44', road: '#c8beb0' },
    atmosphere: {
      moonLight: { color: '#c8d6ff', intensity: 3.6, dir: [az + 160, 38] },
      fill: { color: '#7a8ad0', intensity: 0.6 },
      ambient: { sky: '#5a6ac0', ground: '#1a2018', intensity: 1.8 },
      post: { exposure: 1.85 },
      fog: { color: '#2a3a78', density: 0.014, falloff: 0.05 },
      sky: { moonDir: [az + 12, 33], moonSize: 0.065, moonGlow: 0.22, moonBright: 2.2, cloudCover: 0.48,
        zenith: '#060e2e', mid: '#1a2c6a', horizon: '#4a5a9a', cloudDark: '#101a48', cloudLight: '#6070b8', cloudRim: '#c0c8ff' },
    },
    props: [
      { type: 'stone_cottage', at: cot, rot: face(cot[0], cot[1], cam[0], cam[1]) + 12, stone: 0x9ea2b4, roof: 0x3a3e52, w: 6.5, d: 5.5, h: 3.4, roofH: 5.2, chimney: 7.5, clear: 9 },
      { type: 'hooded', at: [2.6, 1.0], rot: face(2.6, 1.0, cot[0], cot[1]) + 180, pose: 'walk', robe: '#0c0a10', height: 1.9, npc: 'wanderer', name: 'Hooded Wanderer' },
      { type: 'great_tree', at: [-8.5, 19], size: 0.75, seed: 85, leaves: '#2a4434', clear: 3 },
      { type: 'great_tree', at: [12, 8], size: 0.7, seed: 86, leaves: '#2a4434', clear: 5 },
      { type: 'great_tree', at: [-13, -10], size: 0.6, seed: 87, leaves: '#1c3024', clear: 6 },
      { type: 'great_tree', at: [9, -16], size: 0.55, seed: 88, leaves: '#1c3024', clear: 6 },
      ...[[8.9, 20.4, 1.5], [3.4, 19.2, 1.1], [10.2, 18, 1.0], [2.4, 21, 0.9], [2.8, 15, 0.6], [7.8, 14, 0.8], [1.2, 10, 0.5], [5.2, 8, 0.6], [3.4, 26, 1.1], [6.8, 27, 0.8]].map(([x, z, w], i) => ({ type: 'crag', at: [x, z], size: [w * 1.4, w * 0.45, w * 1.1], seed: 3 + i, color: '#8a90a8', matte: true })),
    ],
    scatter: [
      { kind: 'rock', count: 50, at: [5, 16], radius: 14, minRoad: 1.3, maxRoad: 5, scale: [0.25, 0.7], seed: 'cf' },
      { kind: 'pine', count: 30, radius: 70, minR: 32, minRoad: 8, scale: [12, 20], seed: 'cp' },
    ],
    clearings: [[0, 0, 26]],
    shot: { key: 1, at: cam, height: 1.15, target: [cot[0] + 1, cot[1], 3.4], fov: 58 },
  });
}

// ---------------------------------------------------------------- scene framing helper
// Every scene sits on the outward side of the road loop: the camera stands a
// few metres off the road looking away from the loop's centre, so the road is
// behind it. P(along, across) gives LOCAL coords (relative to the area centre).
const LOOP = [40, -30];
function frame(center, { offset = 8, turn = 0 } = {}) {
  let vx = center[0] - LOOP[0], vz = center[1] - LOOP[1];
  const l = Math.hypot(vx, vz);
  vx /= l; vz /= l;
  const t = (turn * Math.PI) / 180;
  [vx, vz] = [vx * Math.cos(t) - vz * Math.sin(t), vx * Math.sin(t) + vz * Math.cos(t)];
  const sx = -vz, sz = vx; // across, to the right of the view
  const P = (a, s = 0) => [r1(vx * (offset + a) + sx * s), r1(vz * (offset + a) + sz * s)];
  const cam = P(0, 0);
  const faceCam = (p) => face(p[0], p[1], cam[0], cam[1]);
  const faceAway = (p) => face(p[0], p[1], p[0] + vx, p[1] + vz);
  const viewAz = (Math.atan2(vx, -vz) * 180) / Math.PI;
  const dir = (off, el) => [r1(viewAz + off), el];
  return { P, cam, faceCam, faceAway, dir, v: [vx, vz] };
}
const clear = (p, r) => [p[0], p[1], r];

// ---------------------------------------------------------------- dark_03 campfire
{
  const c = [-120, -40];
  const F = frame(c, { offset: 9 });
  const fire = F.P(5.5, 0);
  const kA = F.P(6.6, -0.75), kB = F.P(6.8, 0.75);
  area({
    id: 'campfire', name: 'The Ember Watch', ref: 'dark_03', center: c, reach: 50,
    ground: { tint: '#2a201c', grass: 0.15, grassTint: '#2a3020' },
    atmosphere: {
      sky: {
        zenith: '#010604', mid: '#06201c', horizon: '#14443a', glow: '#2a6a5a', glowStrength: 0.3,
        cloudDark: '#031210', cloudLight: '#2a6a58', cloudRim: '#5aa090', cloudCover: 0.55, stars: 0.6,
        moonDir: F.dir(12, 26), moonColor: '#c8e8d8', moonSize: 0.045, moonGlow: 0.5, moonBright: 1.4,
      },
      fog: { color: '#0a1e1a', density: 0.016, falloff: 0.05 },
      ambient: { sky: '#2a4a44', ground: '#140a08', intensity: 0.9 },
      moonLight: { color: '#90b8b0', intensity: 1.4, dir: F.dir(150, 35) },
      fill: { color: '#c8b8b0', intensity: 1.3 },
      rim: { color: '#ff4020', strength: 0.25 },
      post: { exposure: 1.4 },
    },
    props: [
      { type: 'campfire', at: F.P(5.6, 0), color: '#ff3a18', light: 1.4, scale: 0.7 },
      { type: 'crag', at: kA, size: [0.9, 0.3, 0.8], seed: 21, color: '#3a3438', matte: true },
      { type: 'crag', at: kB, size: [0.9, 0.3, 0.8], seed: 22, color: '#3a3438', matte: true },
      { type: 'knight', at: kA, rot: F.faceCam(kA) + 12, pose: 'sitSword', dull: true, armor: '#7a7680', cape: '#5a0a0c', y: 0.02 },
      { type: 'knight', at: kB, rot: F.faceCam(kB) - 10, pose: 'sit', dull: true, armor: '#7a7680', cape: '#6a0c10', y: 0.02 },
      { type: 'great_tree', at: F.P(10, -6), size: 0.8, seed: 90, leaves: '#14261c' },
      { type: 'great_tree', at: F.P(9, 6.5), size: 0.75, seed: 91, leaves: '#16281e' },
      { type: 'great_tree', at: F.P(2, -4.5), size: 0.55, seed: 92, leaves: '#10201a' },
      { type: 'monolith_tower', at: F.P(90, 4), width: 9, height: 70, tiers: 5, stone: '#141c1a', viewDist: 2000 },
    ],
    clearings: [clear(fire, 5), clear(F.cam, 3)],
    scatter: [
      { kind: 'pine', count: 50, at: F.P(20, 0), radius: 30, minR: 8, minRoad: 6, scale: [14, 22], seed: 'cfp' },
      { kind: 'rock', count: 16, at: fire, radius: 6, minR: 2.2, minRoad: 3, scale: [0.4, 0.9], seed: 'cfr' },
    ],
    fireflies: [{ at: fire, radius: 3, count: 30, color: '#ff4a1a', intensity: 8, height: [0.4, 3], size: 0.06 }],
    shot: { key: 2, at: F.P(3.0, 0), height: 1.1, target: [...F.P(7, 0), 1.0], fov: 56 },
  });
}

// ---------------------------------------------------------------- dark_09 ruins
{
  const c = [-200, -170];
  const F = frame(c, { offset: 9 });
  const gate = F.P(20, 2);
  const hoods = [F.P(5, -3.2), F.P(7.5, 1.8), F.P(10, -1.6), F.P(9, 4.2)];
  area({
    id: 'ruins', name: 'Shrine of the Red Hoods', ref: 'dark_09', center: c, reach: 50,
    ground: { tint: '#3a6a30', grass: 0.5, grassTint: '#3e7a30' },
    atmosphere: {
      sky: {
        zenith: '#0a0e18', mid: '#283044', horizon: '#4a5268', glow: '#8090a8', glowStrength: 0.2,
        cloudDark: '#141824', cloudLight: '#6a7288', cloudRim: '#b0b8d0', cloudCover: 0.7, stars: 0.3,
        moonDir: F.dir(-8, 30), moonColor: '#e0e4ea', moonSize: 0.06, moonGlow: 0.45, moonBright: 1.3,
      },
      fog: { color: '#3a4458', density: 0.01, falloff: 0.05 },
      ambient: { sky: '#6a7490', ground: '#1a2414', intensity: 1.5 },
      moonLight: { color: '#c8d0e0', intensity: 3.2, dir: F.dir(160, 40) },
      rim: { color: '#c0c8e0', strength: 0.2 },
      post: { exposure: 1.4 },
    },
    props: [
      { type: 'ruined_arch', at: gate, rot: F.faceCam(gate), span: 3.2, height: 6.5, thick: 1.6, pillar: 1.4, texture: 'mossy_rock', stone: '#6a7064', clear: 5 },
      { type: 'ruined_tower', at: F.P(24, -9), radius: 3.6, height: 18, broken: 7, texture: 'mossy_rock', stone: '#5a6058' },
      { type: 'ruined_arch', at: F.P(16, -10), rot: F.faceCam(F.P(16, -10)) + 30, span: 2.5, height: 4, broken: true, texture: 'mossy_rock', stone: '#5a6058' },
      ...hoods.map((h, i) => ({ type: 'hooded', at: h, rot: F.faceCam(h) + 180 + (i % 2 ? 30 : -25), pose: i === 0 ? 'kneel' : i === 3 ? 'bowed' : 'walk', robe: '#4a0608', rim: 0.2, seed: 40 + i })),
      { type: 'great_tree', at: F.P(15, 9), size: 0.75, seed: 93, leaves: '#1e4024' },
      { type: 'great_tree', at: F.P(4, -9), size: 0.65, seed: 94, leaves: '#1e4024' },
      { type: 'dead_tree', at: F.P(26, 6), height: 9, radius: 0.5, seed: 77 },
      { type: 'paving', at: F.P(12, 0), rot: F.faceAway(F.P(12, 0)), size: [3.4, 16], texture: 'grey_stone_path', color: '#9aa890', tile: 2.5 },
    ],
    lights: [{ at: gate, y: 1.6, color: '#ff1010', intensity: 30, distance: 12 }],
    glows: [{ at: gate, radius: 4, color: '#ff1a10', intensity: 0.7 }],
    fireflies: [{ at: F.P(8, 0), radius: 7, count: 22, color: '#ffd060', intensity: 6, height: [0.8, 2.4], size: 0.08 }],
    clearings: [clear(F.P(10, 0), 10), clear(gate, 6)],
    scatter: [{ kind: 'rock', count: 20, at: F.P(10, 0), radius: 12, minR: 3, minRoad: 4, scale: [0.4, 1.2], seed: 'rr' }],
    shot: { key: 3, at: F.P(-3, 0), height: 3.2, target: [...F.P(16, 1), 2.6], fov: 62 },
  });
}

// ---------------------------------------------------------------- dark_11 knight under the tree
{
  const c = [-90, -230];
  const F = frame(c, { offset: 9 });
  const tree = F.P(4.8, 3.4);
  const kn = F.P(3.0, 0.9);
  area({
    id: 'oak', name: 'The Old Warden', ref: 'dark_11', center: c, reach: 45,
    ground: { tint: '#2a3a24', grass: 0.35, grassTint: '#3a4a2c' },
    atmosphere: {
      sky: {
        zenith: '#020818', mid: '#0a2050', horizon: '#1a3a70', glow: '#3a5aa0', glowStrength: 0.2,
        cloudDark: '#061030', cloudLight: '#2a4a8a', cloudRim: '#8aa0d0', cloudCover: 0.35, stars: 2.2, sparkle: 0.6,
        moonDir: F.dir(-22, 30), moonColor: '#f4e8c8', moonSize: 0.07, moonGlow: 0.5, moonBright: 1.5, moonPhase: 0,
      },
      fog: { color: '#0a1a3a', density: 0.012, falloff: 0.05 },
      ambient: { sky: '#3a5490', ground: '#141a14', intensity: 1.1 },
      moonLight: { color: '#d8e0ff', intensity: 2.6, dir: F.dir(-40, 32) },
      fill: { color: '#8a9ad0', intensity: 0.7 },
      rim: { color: '#a0b4ff', strength: 0.3 },
      post: { exposure: 1.4 },
    },
    props: [
      { type: 'great_tree', at: tree, size: 1.0, seed: 81, leaves: '#1a301c', clear: 3 },
      { type: 'knight', at: kn, rot: F.faceCam(kn) - 35, pose: 'rest', dull: true, armor: '#8a90a0', y: 0.05, npc: 'oak_knight', name: 'Ser Hollis', talkY: 0.6 },
    ],
    clearings: [clear(F.P(2, 0), 9), clear(F.P(16, -12), 22)],
    shot: { key: 10, at: F.P(-0.6, -1.6), height: 1.5, target: [...F.P(4, 0.2), 2.6], fov: 70 },
  });
}

// ---------------------------------------------------------------- the barrow (way down into the Gloaming)
{
  const c = [20, -150];
  area({
    id: 'barrow', name: 'The Barrow Door', ref: '', center: c, reach: 40,
    ground: { tint: '#34442e', grass: 0.5, grassTint: '#3a5030' },
    atmosphere: { sky: { moonDir: [180, 30], moonSize: 0.08 } },
    props: [
      // entrance faces +Z; the trench (terrain feature) runs from z=+9 down to z=-3
      { type: 'barrow', at: [0, -10], rot: 0, yAt: [0, 10], y: -0.3, clear: 9 },
      ...[[-7, 1], [6, 3], [-9, -6], [9, -8], [-4, 6]].map(([x, z], i) => ({ type: 'crag', at: [x, z], size: [1.0, 1.5, 0.8], seed: 60 + i, color: '#6a7080', matte: true })),
    ],
    clearings: [[0, -6, 14]],
    lights: [{ at: [0, -5], y: -0.5, color: '#7a5aff', intensity: 10, distance: 8 }],
    glows: [{ at: [0, -3], radius: 3, color: '#7a5aff', intensity: 0.5 }],
  });
  region.terrain.features.push({ type: 'trench', from: [20, -146], to: [20, -158], width: 2.6, depth: 3.6 });
  region.portals = [{ id: 'barrow', at: [20, -156.6], radius: 1.3, to: 'gloaming:barrow', exit: [20, -138], exitYaw: 180 }];
  region.areas[region.areas.length - 1].shot = { key: 12, at: [0, 14], height: 1.7, target: [0, -4, 0.5], fov: 60 };
}

// ---------------------------------------------------------------- dark_02 / dark_12 alley (corrupted)
{
  const c = [130, -250];
  const F = frame(c, { offset: 6 });
  const along = F.faceAway(F.P(0, 0));
  area({
    id: 'alley', name: 'Ashgate Alley', ref: 'dark_02 / dark_12', center: c, reach: 45,
    ground: { tint: '#2a1a34', grass: 0.0, grassTint: '#201828', road: '#9a7ab0' },
    atmosphere: {
      sky: {
        zenith: '#0c0420', mid: '#3a1070', horizon: '#c02a7a', glow: '#ff3a8a', glowStrength: 0.6,
        cloudDark: '#1a0838', cloudLight: '#6a2aa0', cloudRim: '#c06ad0', cloudCover: 0.3, stars: 0.3,
        moonDir: [180, 40], moonSize: 0.0001, moonGlow: 0,
      },
      fog: { color: '#5a2a9a', density: 0.012, falloff: 0.02 },
      ambient: { sky: '#6a40b0', ground: '#2a1430', intensity: 1.6 },
      moonLight: { color: '#b080ff', intensity: 1.8, dir: F.dir(30, 50) },
      rim: { color: '#c080ff', strength: 0.35 },
      post: { exposure: 1.35 },
    },
    props: [
      { type: 'alley_row', at: F.P(2, -3.2), rot: along + 180, length: 46, seed: 31, stone: '#6a4a7a' },
      { type: 'alley_row', at: F.P(48, 3.2), rot: along, length: 46, seed: 32, stone: '#5a4070' },
      { type: 'paving', at: F.P(20, 0), rot: along, size: [6.4, 48], texture: 'cobblestone_floor_08', color: '#a080c0', tile: 2.2 },
      { type: 'hooded', at: F.P(6.5, -0.9), rot: along, pose: 'walk', robe: '#120a1a', height: 1.95, seed: 51 },
      { type: 'hooded', at: F.P(8.0, 1.0), rot: along, pose: 'walk', robe: '#120a1a', height: 1.9, seed: 52 },
      { type: 'hooded', at: F.P(16, 0.2), rot: along, pose: 'walk', robe: '#1a0e26', height: 1.85, seed: 53 },
      { type: 'castle_dark', at: F.P(150, 0), rot: along + 180, viewDist: 3000, windowColor: '#8a50ff', windowIntensity: 0.4, stoneColor: '#3a2a60', roofColor: '#2a1a50' },
    ],
    clearings: [clear(F.P(20, 0), 26), clear(F.P(150, 0), 70)],
    mist: [{ at: F.P(24, 0), radius: 14, count: 26, color: '#7a40c0', opacity: 0.2, size: 12, lift: 0.6 }],
    shot: { key: 4, at: F.P(3, 0), height: 1.5, target: [...F.P(40, 0), 9], fov: 60 },
  });
  const flat = F.P(20, 0);
  region.terrain.features.push({ type: 'flatten', at: [c[0] + flat[0], c[1] + flat[1]], radius: 24, blend: 12 });
}

// ---------------------------------------------------------------- dark_06 rose-moon canyon (corrupted)
{
  const c = [240, -170];
  const F = frame(c, { offset: 9 });
  const tower = F.P(52, 12);
  const fig = F.P(5, -1.2);
  area({
    id: 'canyon', name: 'The Rose Moon Gorge', ref: 'dark_06', center: c, reach: 55,
    ground: { tint: '#3a3440', grass: 0.0, grassTint: '#2a2830' },
    atmosphere: {
      sky: {
        zenith: '#04122a', mid: '#0e4a6a', horizon: '#3a8098', glow: '#6aa0c0', glowStrength: 0.3,
        cloudDark: '#062038', cloudLight: '#3a7aa0', cloudRim: '#a0d0f0', cloudCover: 0.32, stars: 1.6, sparkle: 1,
        moonDir: F.dir(-6, 36), moonColor: '#e83a7a', moonSize: 0.15, moonGlow: 0.18, moonBright: 1.0, moonPhase: 0,
      },
      fog: { color: '#1a3a5a', density: 0.012, falloff: 0.04 },
      ambient: { sky: '#3a6a90', ground: '#1a1418', intensity: 1.2 },
      moonLight: { color: '#ffa0c8', intensity: 2.2, dir: F.dir(150, 30) },
      rim: { color: '#ff70b0', strength: 0.35 },
      post: { exposure: 1.35 },
    },
    props: [
      { type: 'ruined_tower', at: tower, radius: 4.2, height: 32, broken: 6, stone: '#6a6470', viewDist: 1500 },
      { type: 'hooded', at: fig, rot: face(fig[0], fig[1], tower[0], tower[1]), pose: 'staff', staff: true, robe: '#8a1a5a', rim: 0.4, height: 1.9, seed: 61 },
      ...[[16, -15, 8, 20], [26, -20, 10, 28], [18, 16, 7, 16], [40, -12, 9, 24], [44, 20, 10, 26], [6, -9, 3, 5], [8, 9, 3, 4]].map(([a, s, w, h], i) => {
        const p = F.P(a, s);
        return { type: 'crag', at: p, size: [w, h / 1.6, w * 0.8], seed: 70 + i, color: '#6a6874', matte: true, viewDist: 1500 };
      }),
    ],
    clearings: [clear(F.P(15, 0), 22)],
    scatter: [{ kind: 'rock', count: 40, at: F.P(10, 0), radius: 14, minR: 2, minRoad: 3, scale: [0.4, 1.4], seed: 'cnr' }],
    shot: { key: 5, at: F.cam, height: 1.7, target: [...F.P(30, 2), 16], fov: 64 },
  });
}

// ---------------------------------------------------------------- dark_05 crimson mist sea (corrupted)
{
  const c = [300, -40];
  const F = frame(c, { offset: 6 });
  const fig = F.P(20, 0.6);
  area({
    id: 'mistsea', name: 'The Crimson Shallows', ref: 'dark_05', center: c, reach: 60,
    ground: { tint: '#2a1420', grass: 0.0, grassTint: '#201018' },
    atmosphere: {
      sky: {
        zenith: '#06020a', mid: '#2a0414', horizon: '#c81a1a', glow: '#ff3010', glowStrength: 0.6,
        cloudDark: '#0c0208', cloudLight: '#5a0a18', cloudRim: '#e03a30', cloudCover: 0.62, cloudScale: 1.4, swirl: 1.2, stars: 0.1,
        moonDir: [0, 40], moonSize: 0.0001, moonGlow: 0, mountainHeight: 0.0,
      },
      fog: { color: '#5a1a3a', density: 0.006, falloff: 0.05 },
      ambient: { sky: '#6a2a70', ground: '#1a0a20', intensity: 1.0 },
      moonLight: { color: '#ff6040', intensity: 1.2, dir: F.dir(0, 22) },
      rim: { color: '#ff3020', strength: 0.4 },
      post: { exposure: 1.3 },
    },
    props: [
      { type: 'cloud_sea', at: F.P(110, 0), yAt: F.P(-4, 0), y: -2.5, size: [360, 300], top: '#d85a98', mid: '#4e46a8', low: '#161040', noiseScale: 0.15, viewDist: 3000 },
      { type: 'hooded', at: fig, rot: F.faceAway(fig), pose: 'walk', robe: '#0a0608', height: 1.9, seed: 71, yAt: F.P(-4, 0), y: -2.7 },
      { type: 'castle_dark', at: F.P(240, 10), rot: F.faceCam(F.P(240, 10)), viewDist: 3000, windowColor: '#ff3a10', windowIntensity: 0.2, stoneColor: '#1a0c10', roofColor: '#140a0c', scale: 0.8 },
      ...[[16, -9, 3, 9], [22, 7, 2.5, 7], [34, -16, 4, 12], [46, 10, 3, 8], [60, -3, 3.5, 10], [80, 20, 4, 9], [28, 24, 3, 6], [100, -20, 5, 12]].map(([a, s, w, h], i) => {
        const p = F.P(a, s);
        return { type: 'crag', at: p, size: [w, (h + 8) / 1.6, w * 0.7], seed: 80 + i, color: '#141016', matte: true, viewDist: 2000 };
      }),
    ],
    mist: [{ at: F.P(30, 0), radius: 20, count: 14, color: '#7a3a8a', opacity: 0.12, size: 12, lift: 2 }],
    clearings: [clear(F.P(70, 0), 75)],
    shot: { key: 6, at: F.P(12, 0), yAt: F.P(-4, 0), height: 0.9, target: [...F.P(70, 2), 2], targetAbsY: null, fov: 62 },
  });
  const sea = F.P(110, 0);
  region.terrain.features.push({ type: 'flatten', at: [c[0] + sea[0], c[1] + sea[1]], radius: 90, blend: 18, raise: -28 });
}

// ---------------------------------------------------------------- dark_07 green needles (corrupted)
{
  const c = [220, 80];
  const F = frame(c, { offset: 8 });
  const a = F.P(4.2, -0.9), b = F.P(4.6, 0.9);
  area({
    id: 'spires', name: 'The Green Needles', ref: 'dark_07', center: c, reach: 50,
    ground: { tint: '#1a2a24', grass: 0.0, grassTint: '#1a2a20' },
    atmosphere: {
      sky: {
        zenith: '#08141c', mid: '#1e3a44', horizon: '#3a6a68', glow: '#5a9a90', glowStrength: 0.3,
        cloudDark: '#0a1a1c', cloudLight: '#3a6a6a', cloudRim: '#80b0a0', cloudCover: 0.35, stars: 0.5,
        moonDir: F.dir(4, 44), moonColor: '#ff9a3a', moonSize: 0.07, moonGlow: 0.6, moonBright: 1.2,
        planetADir: F.dir(-12, 40), planetASize: 0.06, planetAColor: '#3a6aa0',
      },
      fog: { color: '#3a5a5c', density: 0.014, falloff: 0.03 },
      ambient: { sky: '#4a6a6a', ground: '#101818', intensity: 1.2 },
      post: { exposure: 1.35, saturation: 0.95 },
      moonLight: { color: '#80d0a0', intensity: 1.2 },
      rim: { color: '#60ffa0', strength: 0.35 },
      post: { exposure: 1.35 },
    },
    props: [
      { type: 'hooded', at: a, rot: face(a[0], a[1], b[0], b[1]) - 20, pose: 'walk', robe: '#4a0a0c', height: 1.95, seed: 91 },
      { type: 'hooded', at: b, rot: face(b[0], b[1], a[0], a[1]) + 20, pose: 'torch', torch: '#ff7a20', torchLight: 18, robe: '#5a0c10', height: 1.9, seed: 92 },
      ...[[14, -7, 5, 40], [20, 6, 6, 52], [32, -2, 7, 64], [26, -15, 5, 44], [40, 12, 7, 58], [10, 9, 4, 26], [8, -10, 4, 22]].map(([a2, s, w, h], i) => {
        const p = F.P(a2, s);
        return { type: 'crag', at: p, size: [w, h / 1.6, w * 0.8], seed: 100 + i, color: '#8aa898', matte: true, viewDist: 1500 };
      }),
    ],
    lights: [{ at: F.P(22, 0), y: 6, color: '#40ff90', intensity: 12, distance: 40 }],
    mist: [{ at: F.P(16, 0), radius: 18, count: 30, color: '#4a9a7a', opacity: 0.25, size: 14, lift: 1.5 }],
    clearings: [clear(F.P(10, 0), 12)],
    shot: { key: 7, at: F.cam, height: 1.6, target: [...F.P(10, 0), 3.4], fov: 64 },
  });
}

// ---------------------------------------------------------------- dark_10 cathedral under a cosmic sky (corrupted)
{
  const c = [120, 180];
  const F = frame(c, { offset: 8 });
  const cath = F.P(120, 10);
  area({
    id: 'cathedral', name: 'Cathedral of the Far Stars', ref: 'dark_10', center: c, reach: 60,
    ground: { tint: '#3a2a24', grass: 0.0, grassTint: '#2a2018' },
    atmosphere: {
      sky: {
        zenith: '#010004', mid: '#0a0418', horizon: '#3a0a3a', glow: '#ff3a8a', glowStrength: 0.3,
        cloudCover: 0.0, stars: 3.0, sparkle: 1.5, nebula: 0.3, nebulaA: '#c0206a', nebulaB: '#4a2ab0',
        moonDir: F.dir(-6, 50), moonColor: '#ffb070', moonSize: 0.02, moonGlow: 0.35, moonBright: 1.2,
        planetADir: F.dir(-18, 36), planetASize: 0.05, planetAColor: '#8a8aa0', planetBDir: F.dir(16, 46), planetBSize: 0.02, planetBColor: '#c06a4a',
        mountainHeight: 0.0,
      },
      fog: { color: '#1a0a24', density: 0.006, falloff: 0.04 },
      ambient: { sky: '#6a3a6a', ground: '#1a100c', intensity: 1.1 },
      moonLight: { color: '#e0c0b0', intensity: 3.0, dir: F.dir(165, 35) },
      rim: { color: '#ff80c0', strength: 0.3 },
      post: { exposure: 1.35 },
    },
    props: [
      { type: 'crag', at: F.P(118, 10), size: [40, 12, 34], seed: 111, color: '#5a4a44', matte: true, viewDist: 3000 },
      { type: 'cathedral', at: cath, rot: F.faceCam(cath), y: 12, viewDist: 3000, stone: '#7a6050' },
      ...[[30, -18, 10, 28], [40, 22, 12, 34], [22, -10, 6, 14], [26, 14, 7, 16], [50, -26, 10, 40]].map(([a, s, w, h], i) => {
        const p = F.P(a, s);
        return { type: 'crag', at: p, size: [w, h / 1.6, w * 0.8], seed: 120 + i, color: '#4a3c38', matte: true, viewDist: 2000 };
      }),
      ...[[6, -1], [7, 1.2], [8.5, -0.4]].map(([a, s], i) => {
        const p = F.P(a, s);
        return { type: 'hooded', at: p, rot: F.faceAway(p) + (i - 1) * 30, pose: i === 2 ? 'kneel' : 'bowed', robe: '#6a0a10', height: 1.8, seed: 130 + i };
      }),
    ],
    clearings: [clear(F.P(40, 0), 50)],
    shot: { key: 8, at: F.cam, height: 2.6, target: [...F.P(120, 10), 34], fov: 64 },
  });
}

// ---------------------------------------------------------------- dark_04 the black tooth (snow, red moon)
{
  const c = [-60, 170];
  const F = frame(c, { offset: 8 });
  area({
    id: 'monolith', name: 'The Black Tooth', ref: 'dark_04', center: c, reach: 60,
    ground: { tint: '#2a3050', grass: 0.0, grassTint: '#20283a' },
    atmosphere: {
      sky: {
        zenith: '#06040e', mid: '#2a0a2a', horizon: '#a01818', glow: '#ff2a1a', glowStrength: 0.5,
        cloudDark: '#1a0618', cloudLight: '#5a1430', cloudRim: '#b03a3a', cloudCover: 0.38, stars: 0.3,
        moonDir: F.dir(-16, 36), moonColor: '#ff3a1a', moonSize: 0.11, moonGlow: 0.7, moonBright: 1.3,
      },
      fog: { color: '#2a1a4a', density: 0.014, falloff: 0.05 },
      ambient: { sky: '#5a4aa0', ground: '#1a1a3a', intensity: 1.2 },
      moonLight: { color: '#c0b0ff', intensity: 2.0, dir: F.dir(150, 30) },
      rim: { color: '#ff4030', strength: 0.3 },
      post: { exposure: 1.3 },
    },
    props: [
      { type: 'monolith_tower', at: F.P(40, 14), width: 12, height: 64, tiers: 6, stone: '#141018', viewDist: 3000 },
      { type: 'ruined_arch', at: F.P(20, 6), rot: F.faceCam(F.P(20, 6)) - 20, span: 2.6, height: 4.2, thick: 1.4, pillar: 1.3, stone: '#2a2630' },
      ...[[70, -18, 8, 50], [90, -8, 7, 42], [60, -30, 5, 30], [110, 4, 6, 36], [100, -26, 4, 24]].map(([a, s, w, h], i) => {
        const p = F.P(a, s);
        return { type: 'crag', at: p, size: [w, h / 1.6, w * 0.8], seed: 140 + i, color: '#1a1820', matte: true, viewDist: 3000 };
      }),
      ...[[5, -2.5, 2.2, 1.6], [9, 3, 1.8, 1.2], [14, -6, 2.6, 2]].map(([a, s, w, h], i) => {
        const p = F.P(a, s);
        return { type: 'crag', at: p, size: [w, h / 1.6, w * 0.8], seed: 150 + i, color: '#2a2834', matte: true };
      }),
    ],
    mist: [{ at: F.P(50, -10), radius: 40, count: 30, color: '#4a3a7a', opacity: 0.18, size: 20, lift: 1 }],
    scatter: [{ kind: 'rock', count: 30, at: F.P(14, 0), radius: 16, minR: 3, minRoad: 4, scale: [0.5, 1.6], seed: 'mnr' }],
    clearings: [clear(F.P(30, 0), 40)],
    shot: { key: 9, at: F.cam, height: 1.6, target: [...F.P(40, 0), 14], fov: 64 },
  });
  const snow = F.P(30, 0);
  region.terrain.features.push({ type: 'snow', at: [c[0] + snow[0], c[1] + snow[1]], radius: 70, blend: 30 });
}

// ---------------------------------------------------------------- dark_08 the broken gate (snow, crescent)
{
  const c = [-180, 110];
  const F = frame(c, { offset: 7 });
  const gate = F.P(3, 0);
  const skull = F.P(4.5, 1.6);
  area({
    id: 'arch', name: 'The Broken Gate', ref: 'dark_08', center: c, reach: 55,
    ground: { tint: '#2a3060', grass: 0.0, grassTint: '#20284a' },
    atmosphere: {
      sky: {
        zenith: '#020418', mid: '#0a1a7a', horizon: '#5a2a8a', glow: '#ff3a3a', glowStrength: 0.7,
        cloudCover: 0.12, stars: 0.6,
        moonDir: F.dir(4, 26), moonColor: '#e0e8ff', moonSize: 0.05, moonPhase: 0.72, moonGlow: 0.2, moonBright: 1.6,
        mountain: '#3a1a40', mountainHeight: 0.05,
      },
      fog: { color: '#3a1a5a', density: 0.012, falloff: 0.05 },
      ambient: { sky: '#4a5ac0', ground: '#2a2a5a', intensity: 1.2 },
      moonLight: { color: '#ff7060', intensity: 2.0, dir: F.dir(-70, 12) },
      fill: { color: '#8090ff', intensity: 0.5 },
      rim: { color: '#ff5050', strength: 0.3 },
      post: { exposure: 1.35 },
    },
    props: [
      { type: 'ruined_arch', at: gate, rot: F.faceCam(gate), span: 4.4, height: 6.5, thick: 2.4, pillar: 2.2, stone: '#2a2028', clear: 3 },
      { type: 'horned_skull', at: skull, rot: F.faceCam(skull) - 40, color: '#5a6080', y: -0.25 },
      { type: 'hooded', at: F.P(10, -0.8), rot: F.faceAway(F.P(10, -0.8)) + 15, pose: 'staff', staff: true, robe: '#0a0810', height: 1.9, seed: 161 },
      { type: 'dark_keep', at: F.P(110, 4), rot: F.faceCam(F.P(110, 4)) + 25, height: 30, stone: '#8a5048', viewDist: 3000, y: 4 },
    ],
    clearings: [clear(F.P(30, 0), 40)],
    shot: { key: 11, at: F.P(-1.5, 0), height: 1.5, target: [...F.P(20, 0), 5], fov: 66 },
  });
  const snow = F.P(30, 0);
  region.terrain.features.push({ type: 'snow', at: [c[0] + snow[0], c[1] + snow[1]], radius: 75, blend: 30 });
  region.terrain.features.push({ type: 'hill', at: [c[0] + F.P(110, 4)[0], c[1] + F.P(110, 4)[1]], radius: 45, height: 12 });
}

region.title = {
  secondsPerKey: 16,
  keys: [
    { pos: [20, 4, 46], target: [-2, 6, -6] },
    { pos: [-10, 5, 38], target: [-4, 4, -6] },
    { pos: [26, 6, 18], target: [-2, 5, -6] },
  ],
};

fs.writeFileSync('data/regions/surface.json', JSON.stringify(region, null, 2));
console.log(`surface.json: ${region.areas.length} areas`);
