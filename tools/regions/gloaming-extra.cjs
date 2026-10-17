// Adds the ref_11..ref_17 areas to data/regions/gloaming.json (idempotent:
// re-running replaces them).   node tools/regions/gloaming-extra.cjs
const fs = require('fs');
const F = 'data/regions/gloaming.json';
const j = JSON.parse(fs.readFileSync(F, 'utf8'));
const r1 = (v) => Math.round(v * 10) / 10;
const face = (x, z, tx, tz) => r1((Math.atan2(tx - x, tz - z) * 180) / Math.PI);
const az = (fx, fz, tx, tz) => r1((Math.atan2(tx - fx, -(tz - fz)) * 180) / Math.PI); // sky azimuth from a to b

const IDS = ['lady_pool', 'gnome_camp', 'pillar', 'memory_sun', 'treehouses', 'throne', 'swamp'];
j.areas = j.areas.filter((a) => !IDS.includes(a.id));
const LAKES = ['pool', 'gnomesea', 'sunlake', 'stream', 'swamp'];
j.terrain.features = j.terrain.features.filter((f) => !(f.id && LAKES.includes(f.id)) && !f.extra);
const add = (a) => { j.areas.push(a); if (!a.noFlatten) j.terrain.features.unshift({ type: 'flatten', at: a.center, radius: a.flatR ?? 34, blend: 22, extra: true }); };
const lake = (id, at, radii, o = {}) => j.terrain.features.push({ type: 'lake', id, at, radii, rotation: o.rot ?? 0, depth: o.depth ?? 4, drop: o.drop ?? 2.5 });
const feat = (f) => j.terrain.features.push({ ...f, extra: true });

// ---------------------------------------------------------------- ref_11 lady by the glowing pool
{
  const c = [-250, 300];
  lake('pool', [c[0] + 5, c[1] - 4], [9, 6], { depth: 2, drop: 1.4 });
  add({
    id: 'lady_pool', name: 'The Butterfly Pool', ref: 'ref_11',
    description: 'A woman in a long red embroidered gown with long blond hair, a blue butterfly on her hand, on a curved stone walkway by a glowing turquoise pool. A dark round tower and a huge pale green planet in an olive-green sky.',
    center: c, reach: 45,
    ground: { tint: '#3a4a20', grass: 0.2, grassTint: '#4a6a2a' },
    atmosphere: {
      sky: {
        zenith: '#0e1608', mid: '#2a3a14', horizon: '#5a6a2a', glow: '#8aa04a', glowStrength: 0.3,
        cloudDark: '#1a240e', cloudLight: '#5a6a30', cloudRim: '#a0b060', cloudCover: 0.45, stars: 0.4,
        moonDir: [az(-6, 7, 2, -6), 60], moonSize: 0.0001, moonGlow: 0,
        planetADir: [az(-6, 7, 6, -10), 40], planetASize: 0.32, planetAColor: '#b8d0a0',
      },
      fog: { color: '#2a3418', density: 0.006, falloff: 0.04 },
      ambient: { sky: '#7a8a4a', ground: '#1a1a10', intensity: 1.1 },
      moonLight: { color: '#d0e0b0', intensity: 2.2 },
      rim: { color: '#c0e080', strength: 0.6 },
      water: { color: '#10b0a0', glint: '#c0ffe0', distortion: 0.4, tint: '#40ffd8' },
      post: { exposure: 1.25 },
    },
    props: [
      { type: 'lake', lake: 'pool' },
      { type: 'stone_tower', at: [15, -9], radius: 3, height: 26, stone: '#2a3428', viewDist: 600 },
      { type: 'walkway', at: [5, -4], radius: 9.6, width: 2.6, from: 1.6, to: 4.1, color: '#d8b070', y: 0.05 },
      { type: 'lady', at: [-3.2, 0.6], rot: face(-3.2, 0.6, 3, -4) + 20, npc: 'lady', name: 'Lady Isolde', talkY: 1.5 },
      { type: 'great_tree', at: [-12, -6], size: 0.55, seed: 201, leaves: '#3a6a2a' },
    ],
    lights: [{ at: [5, -4], y: 0.8, color: '#30ffd0', intensity: 6, distance: 12 }],
    glows: [{ at: [5, -4], radius: 9, color: '#30ffd0', intensity: 0.35 }],
    clearings: [[0, -4, 18]],
    shot: { key: 10, at: [-5.6, 3.6], height: 1.75, target: [1, -6, 3.2], fov: 58 },
  });
}

// ---------------------------------------------------------------- ref_12 gnome camp by the sea
{
  const c = [260, -205];
  lake('gnomesea', [c[0] + 45, c[1] - 45], [70, 55], { rot: 30, depth: 10, drop: 3 });
  const cam = [-8, 6], tgt = [30, -32];
  const dir = (a, s) => { const vx = tgt[0] - cam[0], vz = tgt[1] - cam[1], l = Math.hypot(vx, vz); return [r1(cam[0] + (vx / l) * a - (vz / l) * s), r1(cam[1] + (vz / l) * a + (vx / l) * s)]; };
  const g1 = dir(6, 1.2), g2 = dir(9, 2.6);
  add({
    id: 'gnome_camp', name: 'Gnome Strand', ref: 'ref_12',
    description: 'A gnome camp on a dirt path by a deep blue sea at night: orange-and-green cone tents, small gnomes with tall green hats and blue backpacks walking away, jagged black spires rising from the water, a blinding white moon in swirling blue clouds, weeping trees.',
    center: c, reach: 55,
    ground: { tint: '#5a4428', grass: 0.15, grassTint: '#3a4a20' },
    atmosphere: {
      sky: {
        zenith: '#020420', mid: '#0a1a7a', horizon: '#3a5ac0', glow: '#8aa0ff', glowStrength: 0.3,
        cloudDark: '#060a40', cloudLight: '#5a6ad8', cloudRim: '#d0d8ff', cloudCover: 0.62, swirl: 2.4, stars: 0.3,
        moonDir: [az(cam[0], cam[1], tgt[0], tgt[1]) - 4, 16], moonColor: '#ffffff', moonSize: 0.06, moonGlow: 0.9, moonBright: 3.2,
      },
      fog: { color: '#0a1450', density: 0.005, falloff: 0.04 },
      ambient: { sky: '#3a4aa0', ground: '#2a1a10', intensity: 0.9 },
      moonLight: { color: '#c0d0ff', intensity: 1.1, dir: [az(cam[0], cam[1], tgt[0], tgt[1]) + 60, 30] },
      fill: { color: '#ffb080', intensity: 0.6 },
      rim: { color: '#c0d0ff', strength: 1.0 },
      water: { color: '#030a5a', glint: '#ffffff', distortion: 2.2, tint: '#4a6aff' },
      post: { exposure: 1.2 },
    },
    props: [
      { type: 'lake', lake: 'gnomesea' },
      { type: 'tent', at: dir(5, -2.6), radius: 1.5, height: 2.3 },
      { type: 'tent', at: dir(9, -3.4), radius: 1.3, height: 2.0 },
      { type: 'camp_gnome', at: g1, rot: face(g1[0], g1[1], tgt[0], tgt[1]) },
      { type: 'camp_gnome', at: g2, rot: face(g2[0], g2[1], tgt[0], tgt[1]) + 10, hat: '#238a23' },
      ...[[34, -40, 3, 28], [44, -36, 2.5, 22], [52, -48, 3.5, 34], [40, -54, 2.2, 18], [60, -40, 2, 14]].map(([x, z, w, h], i) => ({ type: 'crag', at: [x, z], size: [w, h / 1.6, w], seed: 300 + i, color: '#0c0c14', viewDist: 1500, aboveWater: -2 })),
      { type: 'crag', at: [-26, -20], size: [18, 30, 22], seed: 310, color: '#3a2a24', viewDist: 1000 },
      { type: 'great_tree', at: [-14, -2], size: 0.6, seed: 311, leaves: '#2a4a2a' },
      { type: 'dead_tree', at: [-6, -12], height: 8, radius: 0.4, seed: 312, color: '#3a3020' },
    ],
    clearings: [[4, -6, 16]],
    shot: { key: 11, at: cam, height: 1.3, target: [...tgt, 1.5], fov: 62 },
  });
}

// ---------------------------------------------------------------- ref_13 cabin on the pillar
{
  const c = [310, 60];
  add({
    id: 'pillar', name: 'The Hermit Stack', ref: 'ref_13',
    description: 'A log cabin on a flat stone platform on top of a tall green moss-streaked rock pillar, two dark silhouettes standing on the roof, a big blue full moon, starry cloudy night.',
    center: c, reach: 50, flatR: 45,
    ground: { tint: '#1a3020', grass: 0.2, grassTint: '#1a3a24' },
    atmosphere: {
      sky: {
        zenith: '#01030c', mid: '#06102a', horizon: '#1a2a4a', glow: '#3a5a8a', glowStrength: 0.2,
        cloudDark: '#040a1a', cloudLight: '#3a4a6a', cloudRim: '#a0b8e0', cloudCover: 0.5, swirl: 2, stars: 2.2,
        moonDir: [-18, 36], moonColor: '#9ac8ff', moonSize: 0.1, moonGlow: 0.8, moonBright: 2.6,
      },
      fog: { color: '#0a1424', density: 0.006, falloff: 0.03 },
      ambient: { sky: '#3a5a7a', ground: '#0a1410', intensity: 1.0 },
      moonLight: { color: '#a0c8ff', intensity: 2.6, dir: [150, 40] },
      rim: { color: '#80c0ff', strength: 1.0 },
      post: { exposure: 1.25 },
    },
    props: [
      { type: 'pillar_cabin', at: [0, -24], pillar: 24, radius: 6.5, cabinW: 7, cabinD: 5.5, cabinH: 3.4, rot: 20, viewDist: 1500 },
      ...[[-30, -45, 16, 30], [28, -50, 18, 34], [-14, -70, 22, 26], [20, -80, 20, 30]].map(([x, z, w, h], i) => ({ type: 'crag', at: [x, z], size: [w, h / 1.6, w], seed: 320 + i, color: '#2a5a4a', viewDist: 1500 })),
    ],
    clearings: [[0, -10, 26], [0, 18, 24], [0, 42, 20]],
    shot: { key: 12, at: [0, 30], height: 14, target: [0, -24, 24], fov: 58 },
  });
}

// ---------------------------------------------------------------- ref_14 the memory of the sun (daylight)
{
  const c = [-250, -225];
  lake('sunlake', [c[0], c[1] - 50], [55, 32], { depth: 8, drop: 4 });
  feat({ type: 'hill', at: [c[0], c[1] + 16], radius: 30, height: 16 });
  for (const [x, z, r, h] of [[-80, -140, 50, 100], [-30, -165, 45, 135], [30, -160, 42, 120], [85, -140, 50, 95], [-120, -80, 45, 70], [120, -80, 45, 70], [0, -190, 40, 90]]) { feat({ type: 'peak', at: [c[0] + x, c[1] + z], radius: r, height: h }); feat({ type: 'snow', at: [c[0] + x, c[1] + z - 6], radius: r * 0.35, blend: r * 0.25 }); }
  add({
    id: 'memory_sun', name: 'The Memory of the Sun', ref: 'ref_14',
    description: 'The only daylight place in the Gloaming: a turquoise mountain lake in a valley of jagged dark peaks with a glacier, a blazing white sun in a deep blue sky with white clouds, pines on a rocky shore.',
    center: c, reach: 60, noFlatten: true,
    ground: { tint: '#8a8070', grass: 0.15, grassTint: '#6a7a40' },
    atmosphere: {
      sky: {
        zenith: '#06208a', mid: '#1a4ad0', horizon: '#7aa8f0', glow: '#ffffff', glowStrength: 0.2,
        cloudDark: '#9aa8d8', cloudLight: '#ffffff', cloudRim: '#ffffff', cloudCover: 0.46, cloudSharp: 0.1, swirl: 1.4, cloudBright: 1.3, stars: 0,
        moonDir: [6, 34], moonColor: '#ffffff', moonSize: 0.05, moonGlow: 2.2, moonBright: 7, moonPhase: 0,
        mountain: '#1a1e30', mountainHeight: 0.0,
      },
      fog: { color: '#8aa8e0', density: 0.004, falloff: 0.03 },
      ambient: { sky: '#a8c4ff', ground: '#4a4a3a', intensity: 1.6 },
      moonLight: { color: '#fff8e8', intensity: 4.2, dir: [6, 46] },
      fill: { color: '#a0b8ff', intensity: 0.5 },
      rim: { color: '#ffffff', strength: 0.5 },
      water: { color: '#08a0a8', glint: '#ffffff', distortion: 1.4, tint: '#60f0ff' },
      post: { exposure: 0.95, bloom: 0.4, shadowTint: '#0a1030' },
    },
    props: [
      { type: 'lake', lake: 'sunlake' },
      { type: 'crag', at: [34, -60], size: [16, 4, 10], seed: 341, color: '#a09a88', viewDist: 1500 },
    ],
    trees: [{ kind: 'pine', at: [-9, 6], scale: 15 }, { kind: 'pine', at: [13, 4], scale: 13 }, { kind: 'pine', at: [24, -20], scale: 11 }, { kind: 'pine', at: [-26, -16], scale: 12 }],
    clearings: [[0, -40, 60]],
    shot: { key: 13, at: [0, 14], height: 2.5, target: [0, -120, 18], fov: 70 },
  });
}

// ---------------------------------------------------------------- ref_15 tree-house village
{
  const c = [-60, 330];
  lake('stream', [c[0] - 12, c[1]], [5, 34], { rot: 10, depth: 2, drop: 1.6 });
  add({
    id: 'treehouses', name: 'Rootwhistle', ref: 'ref_15',
    description: 'A storybook tree-house village built into giant trunks: thatched cone roofs, round glowing amber windows, balconies, a curving orange flagstone path with a wooden rail beside a dark blue stream.',
    center: c, reach: 50,
    ground: { tint: '#2a3418', grass: 0.3, grassTint: '#3a5a20' },
    atmosphere: {
      sky: {
        zenith: '#02041a', mid: '#0a1050', horizon: '#2a2a80', cloudDark: '#08104a', cloudLight: '#4a50b0', cloudRim: '#a0a8ff', cloudCover: 0.5, stars: 1,
        moonDir: [-30, 40], moonColor: '#d0d8ff', moonSize: 0.05, moonGlow: 0.6,
      },
      fog: { color: '#0a1040', density: 0.008, falloff: 0.04 },
      ambient: { sky: '#3a4090', ground: '#2a1a0a', intensity: 0.9 },
      rim: { color: '#ffb060', strength: 0.6 },
      water: { color: '#04104a', glint: '#a0b0ff', distortion: 1.6, tint: '#3a4aff' },
      post: { exposure: 1.25 },
    },
    props: [
      { type: 'lake', lake: 'stream' },
      { type: 'tree_house', at: [4, -10], rot: face(4, -10, -3.5, 10) - 25, seed: 51, pods: 3, trunk: 1.8, face: 0, viewDist: 600 },
      { type: 'tree_house', at: [-4, -24], rot: face(-4, -24, -3.5, 10) + 20, seed: 52, pods: 2, trunk: 2.2, height: 30, face: 0, roof: 0x6a4a2a, viewDist: 600 },
      { type: 'great_tree', at: [12, 4], size: 0.9, seed: 53, leaves: '#1a2a3a' },
      { type: 'walkway', at: [-14, -4], radius: 12, width: 2.6, from: -0.9, to: 0.7, color: '#ff9a40', texture: 'grey_stone_path', y: 0.05 },
      { type: 'kenney', model: 'kenney-graveyard/iron-fence', at: [-4.5, 0], rot: 80, scale: 1.4, tint: '#6a4a2a', metalness: 0.1, roughness: 0.7 },
      { type: 'kenney', model: 'kenney-graveyard/iron-fence', at: [-4.2, -4], rot: 95, scale: 1.4, tint: '#6a4a2a', metalness: 0.1, roughness: 0.7 },
    ],
    fireflies: [{ at: [0, -8], radius: 10, count: 30, color: '#ffc060', intensity: 4, height: [1, 6], size: 0.07 }],
    clearings: [[0, -10, 18]],
    shot: { key: 14, at: [-3.5, 10], height: 1.6, target: [3, -10, 6], fov: 64 },
  });
}

// ---------------------------------------------------------------- ref_16 the green king
{
  const c = [120, 330];
  feat({ type: 'flatten', at: c, radius: 20, blend: 10 });
  add({
    id: 'throne', name: 'Court of the Green King', ref: 'ref_16',
    description: 'A courtyard of dark stone towers at night: a robed king figure with a spiked crown and green-lit face on a stone throne, one hand raised, glowing green vines on the right.',
    center: c, reach: 45,
    ground: { tint: '#2a2a2a', grass: 0.0, grassTint: '#2a2a2a' },
    atmosphere: {
      sky: {
        zenith: '#020210', mid: '#0a0a40', horizon: '#1a1a5a', cloudDark: '#04041a', cloudLight: '#3a3aa0', cloudRim: '#8a8aff', cloudCover: 0.62, swirl: 2.6, stars: 0.4,
        moonDir: [0, 70], moonSize: 0.0001, moonGlow: 0,
      },
      fog: { color: '#06061a', density: 0.008, falloff: 0.04 },
      ambient: { sky: '#3a3a70', ground: '#0a0a0a', intensity: 0.8 },
      moonLight: { color: '#8080c0', intensity: 1.4, dir: [200, 40] },
      rim: { color: '#80ff80', strength: 0.4 },
      post: { exposure: 1.3 },
    },
    props: [
      { type: 'paving', at: [0, -4], size: [18, 22], texture: 'rock_tile_floor', color: '#8a8a90', tile: 3 },
      { type: 'throne_king', at: [0, -5], rot: 0, npc: 'green_king', name: 'The Green King', talkY: 2.6 },
      { type: 'stone_tower', at: [-7, -12], radius: 3.2, height: 18, stone: '#4a4a50', viewDist: 600 },
      { type: 'stone_tower', at: [6, -15], radius: 3.6, height: 22, stone: '#3a3a42', viewDist: 600 },
      { type: 'ruined_arch', at: [-6, -9], rot: 20, span: 3, height: 5, thick: 1.6, pillar: 1.4, stone: '#4a4a52', texture: 'castle_wall_slates' },
      { type: 'glow_vines', at: [5.5, -8], rot: -30, width: 4, strands: 16 },
    ],
    clearings: [[0, -6, 20]],
    shot: { key: 15, at: [-1.2, 4], height: 1.5, target: [0.4, -5, 2.3], fov: 56 },
  });
}

// ---------------------------------------------------------------- ref_17 troll ferryman in the swamp
{
  const c = [90, -262];
  lake('swamp', [c[0], c[1] - 9], [14, 8], { depth: 2, drop: 1.4 });
  add({
    id: 'swamp', name: 'Grumblereed Fen', ref: 'ref_17',
    description: 'A green, mossy troll with one glowing yellow eye and pointed ears, sitting in a wooden boat on dark swamp water under a pale tree.',
    center: c, reach: 40,
    ground: { tint: '#1a2a1a', grass: 0.4, grassTint: '#2a4a2a' },
    atmosphere: {
      sky: {
        zenith: '#010604', mid: '#04140e', horizon: '#0e2a20', cloudDark: '#020a08', cloudLight: '#1a3a2a', cloudRim: '#4a8a6a', cloudCover: 0.5, stars: 0.2,
        moonDir: [0, 60], moonSize: 0.0001, moonGlow: 0,
      },
      fog: { color: '#041810', density: 0.012, falloff: 0.05 },
      ambient: { sky: '#2a5a40', ground: '#04080a', intensity: 0.8 },
      moonLight: { color: '#8ab0ff', intensity: 1.6, dir: [160, 50] },
      rim: { color: '#80ff90', strength: 0.35 },
      water: { color: '#020a20', glint: '#d0e0ff', distortion: 2.4, tint: '#5a7aff' },
      post: { exposure: 1.3 },
    },
    props: [
      { type: 'lake', lake: 'swamp' },
      { type: 'troll_boat', at: [0, -5.5], rot: face(0, -5.5, -3.6, 3.2) + 15, aboveWater: 0.05, npc: 'ferryman', name: 'Grumm the Ferryman', talkY: 1.6, scale: 1.1 },
      { type: 'dead_tree', at: [5, -9], height: 10, radius: 0.7, seed: 401, color: '#9aaa98', rim: 0.35 },
    ],
    clearings: [[0, -4, 12]],
    shot: { key: 16, at: [-3.2, 1.2], height: 1.5, target: [0, -5.5, 1.5], fov: 58 },
  });
}

fs.writeFileSync(F, JSON.stringify(j, null, 2));
console.log(`gloaming.json: ${j.areas.length} areas`);
