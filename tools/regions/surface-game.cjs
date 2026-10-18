// Gameplay content for the surface region (containers, loot, merchants,
// townsfolk). Kept apart from surface.cjs, which frames the reference shots.
// Called by surface.cjs before it writes data/regions/surface.json.

module.exports = function addGameplay(region) {
  const areaById = (id) => region.areas.find((a) => a.id === id);
  /** give every prop of `type` in an area (or all areas) a hero model; `fields` may be a function of the prop */
  const heroize = (areaId, type, fields, filter = () => true) => {
    for (const a of region.areas) {
      if (areaId && a.id !== areaId) continue;
      for (const p of a.props || []) if (p.type === type && filter(p)) Object.assign(p, typeof fields === 'function' ? fields(p) : fields);
    }
  };

  // ---- Hollin Cottage: Ysolde's peddler camp by the road, a robbed traveller
  const cottage = areaById('cottage');
  cottage.props.push(
    { type: 'kenney', model: 'kenney-town/cart', at: [17.5, 37.5], rot: -110, scale: 1.5, tint: '#8a6a4a', collide: 1.4 },
    { type: 'person', id: 'ysolde', at: [15.2, 35.2], rot: -150, outfit: 'Female_Ranger', cloth: '#5a3a5a', hood: false, hair: 'long', hairColor: '#3a2418', pale: true, pose: 'stand', seed: 14,
      npc: 'ysolde', name: 'Ysolde', talkY: 1.55 },
    { type: 'chest', id: 'ysolde_chest', at: [19.4, 35.6], rot: -120, loot: 'chest_locked', locked: 'apprentice', owner: 'ysolde', name: "Ysolde's Strongbox" },
    { type: 'barrel', id: 'ysolde_barrel', at: [18.8, 39.6], loot: 'barrel_food', owner: 'ysolde' },
    { type: 'sack', id: 'ysolde_sack', at: [16.4, 39.8], loot: 'sack_herbs', owner: 'ysolde' },
    { type: 'body', id: 'road_body', at: [-13, 46], rot: 40, loot: 'body_traveller', name: 'Dead Traveller', cloth: '#4a4238' },
    { type: 'loot', id: 'road_sword', item: 'iron_sword', at: [-11.6, 47.2], rot: 1.2 },
    { type: 'sack', id: 'road_sack', at: [-14.6, 44.2], loot: 'sack_herbs', name: "Traveller's Pack" },
    { type: 'chest', id: 'cottage_chest', at: [1.4, -11.2], rot: 0, loot: 'chest_common', locked: 'novice', name: 'Old Chest' },
    { type: 'loot', id: 'cottage_book', item: 'book_hollowford', at: [3.6, -10.4], rot: 0.4 },
    { type: 'loot', id: 'cottage_potion', item: 'potion_health', at: [3.9, -10.1] },
    // a wolf pack on the road west
    { type: 'enemy', id: 'wolf_1', kind: 'wolf', at: [-56, 30], rot: 90, patrol: 8 },
    { type: 'enemy', id: 'wolf_2', kind: 'wolf', at: [-60, 35], rot: 60, patrol: 8 },
    { type: 'enemy', id: 'wolf_3', kind: 'wolf', at: [-52, 37], rot: 120, patrol: 8 },
  );

  // ---- hero models (assets/hero, Meshy AI) in place of the procedural versions
  heroize('cottage', 'stone_cottage', { hero: 'cottage' });
  heroize('campfire', 'campfire', { hero: 'campfire', fireScale: 0.9 });
  heroize('campfire', 'knight', { hero: 'knight_campfire' });
  const RED = /^#(4a06|5a0c|6a0a|4a0a)/i;
  heroize(null, 'hooded', (p) => ({
    hero: 'hooded_figure',
    ...(RED.test(p.robe ?? '') ? { dye: { color: '#9a2420', gain: 2.2 } } : /^#8a1a5a/i.test(p.robe ?? '') ? { dye: { color: '#8a2a64', gain: 2.2 } } : {}),
  }));
  heroize('arch', 'horned_skull', { hero: 'skull_horned', heroSize: 3.4, y: -0.1 });
  heroize('ruins', 'ruined_tower', { hero: 'ruined_tower', heroHeight: 16 });
  heroize('canyon', 'ruined_tower', { hero: 'ruined_tower', heroHeight: 14 });
  // jagged monoliths: one instanced rock-spire mesh per region
  heroize(null, 'monolith_tower', (p) => ({ hero: 'rock_spire', instance: true, heroHeight: p.height }));
  heroize('monolith', 'crag', (p) => ({ hero: 'rock_spire', instance: true, heroHeight: p.size[1] * 1.3 }), (p) => p.size[1] > 8);
  heroize('mistsea', 'crag', (p) => ({ hero: 'rock_spire', instance: true, heroHeight: p.size[1] * 1.5, rot: (p.seed * 47) % 360 }));
  heroize('barrow', 'barrow', { hero: 'barrow_entrance', heroSize: 9 });
  heroize('cottage', 'person', { hero: 'ysolde_merchant' }, (p) => p.id === 'ysolde');

  // ---- the barrow door: Hollow Ones keep watch (and the chapel's bell clapper)
  const barrow = areaById('barrow');
  barrow.props.push(
    { type: 'enemy', id: 'hollow_door_1', kind: 'hollow', at: [-4, 6], rot: 180, patrol: 4 },
    { type: 'enemy', id: 'hollow_door_2', kind: 'hollow', at: [5, 5], rot: 200, patrol: 4 },
    { type: 'loot', id: 'bell_clapper', item: 'bell_clapper', at: [2.4, 5.6], rot: 0.7 },
  );

  addHollowford(region);
};

// ---------------------------------------------------------------- Hollowford (step 3)
// The town on the lane between Hollin Cottage and the barrow door. Its inn,
// the Barrow's Back, has its back to the barrow; the chapel bell used to call
// the sleeping back each night. Local coords: +x east, -z north (toward the
// barrow); the lane runs north-south through x ~ 0, the square is west of it.
function addHollowford(region) {
  const C = [25, -80];
  // the lane: off the cottage road, north through the town to the barrow door
  region.road.branches = [{ name: 'Hollowford Lane', points: [[6, 16], [16, 10], [23, -6], [26, -26], [25.7, -46], [25, -80], [24.3, -114], [21, -130]] }];
  region.terrain.features.push({ type: 'flatten', at: [C[0] - 4, C[1]], radius: 34, blend: 18 });

  const house = (at, rot, seed, o = {}) => ({ type: 'cottage', at, rot, seed, clear: 6, ...o });
  const lantern = (at) => ({ type: 'lantern', at, light: 7, intensity: 6 });
  region.areas.push({
    id: 'hollowford', name: 'Hollowford', ref: '', center: C, reach: 45, discoverRadius: 30,
    description: 'A ford town under the stopped moon: inn, chapel, smithy, the well.',
    ground: { tint: '#56663e', grass: 0.28, grassTint: '#647e42', road: '#c4b8a8' },
    atmosphere: {
      moonLight: { color: '#c8d6ff', intensity: 3.4, dir: [200, 40] },
      fill: { color: '#7a8ad0', intensity: 0.55 },
      ambient: { sky: '#5a6ac0', ground: '#1e2218', intensity: 1.7 },
      fog: { color: '#2a3a78', density: 0.012, falloff: 0.05 },
      post: { exposure: 1.75 },
      sky: { moonDir: [195, 34], moonSize: 0.07, moonGlow: 0.3, moonBright: 2.2, cloudCover: 0.45,
        zenith: '#060e2e', mid: '#1a2c6a', horizon: '#4a5a9a', cloudDark: '#101a48', cloudLight: '#6070b8', cloudRim: '#c0c8ff' },
    },
    props: [
      // ---- the square: cobbles, the well, a stall, the notice board
      { type: 'paving', at: [-8.5, 0], size: [11, 15], texture: 'cobblestone_floor_08', color: '#b4aca4', tile: 2.2 },
      { type: 'well', at: [-8.5, 0.5], rot: 20 },
      { type: 'stall', at: [-6, 6.8], rot: 180, cloth: '#8a2424', seed: 4 },
      { type: 'notice_board', at: [-2.9, 3.4], rot: 90, clear: 2,
        use: { id: 'notice_board', name: 'Notice Board', action: 'Read', y: 1.5, effects: ['read:notice_forgetting', 'start:forgetting'] } },
      { type: 'kenney', model: 'kenney-town/cart', at: [-15.4, 9.2], rot: 30, scale: 1.5, tint: '#8a6a4a', collide: 1.4 },

      // ---- the Barrow's Back (back to the barrow), its yard and Maren
      { type: 'timber_house', at: [-8, -15], rot: 0, w: 12, d: 8, seed: 71, door: false, plaster: 0xc8b8a0, roofColor: 0x4a4450, windowColor: '#ffb85a', clear: 9 },
      { type: 'inn_sign', at: [-1.4, -10.6], rot: 90 },
      { type: 'yard_table', at: [-11.8, -6.2], rot: 0 },
      { type: 'person', hero: 'maren_innkeeper', id: 'maren', at: [-4.4, -8.4], rot: 0, npc: 'maren', name: 'Maren', talkY: 1.5 },
      { type: 'person', hero: 'old_drunk', id: 'bram', at: [-11.4, -4.7], rot: 180, npc: 'bram', name: 'Old Bram', talkY: 1.5 },
      { type: 'barrel', id: 'inn_barrel_1', at: [-2.6, -9.4], loot: 'barrel_food', owner: 'maren', name: "Maren's Barrel" },
      { type: 'barrel', id: 'inn_barrel_2', at: [-6.3, -9.5], loot: 'barrel_food', owner: 'maren', name: "Maren's Barrel" },
      { type: 'sack', id: 'inn_sack', at: [-7.3, -9.6], loot: 'sack_herbs', owner: 'maren', name: "Maren's Sack" },

      // ---- the chapel of the bell, Brother Cass, the alms box; Bram's box behind
      { type: 'chapel', at: [-24, -1], rot: 90, clear: 9,
        use: { id: 'bell_rope', name: 'Bell Rope', action: 'Ring', flag: 'clapper_fixed', locked: 'The bell has no clapper. The rope only creaks.', sound: 'bell',
          effects: ['flag:bell_rung', "toast:The bell's voice rolls down the valley"] } },
      { type: 'person', hero: 'brother_cass', id: 'cass', at: [-15.4, 2.4], rot: 95, npc: 'cass', name: 'Brother Cass', talkY: 1.55 },
      { type: 'chest', id: 'chapel_alms', at: [-17.6, -4.2], rot: 90, loot: 'chapel_alms', owner: 'cass', name: 'Alms Box' },
      { type: 'woodpile', at: [-32.6, 1.4], rot: 90, length: 2.4, seed: 7 },
      { type: 'chest', id: 'bram_stash', at: [-32.2, 3.6], rot: 90, loot: 'bram_stash', locked: 'adept', name: 'Old Box', color: '#5a4a3a' },

      // ---- Torvin's smithy across the lane
      { type: 'smithy', at: [8.5, 6], rot: -90, clear: 6 },
      { type: 'person', id: 'torvin', at: [6.9, 7.6], rot: -90, outfit: 'Male_Peasant', cloth: '#4a3a30', hair: 'none', beard: '#3a2a20', beardLen: 0.3, pose: 'stand', seed: 23,
        npc: 'torvin', name: 'Torvin the Smith', talkY: 1.6 },
      { type: 'chest', id: 'smith_chest', at: [10.6, 9.4], rot: -90, loot: 'smith_chest', locked: 'apprentice', owner: 'torvin', name: "Torvin's Chest" },
      { type: 'woodpile', at: [9.2, 11.8], rot: 0, length: 2, seed: 8 },

      // ---- townsfolk: Sir Aldric at the well, Wren running about, Hale at the north gate
      { type: 'person', hero: 'sir_aldric', id: 'aldric', at: [-9.7, 2.5], rot: 150, npc: 'aldric', name: 'Sir Aldric', talkY: 1.6 },
      { type: 'person', hero: 'village_child', id: 'wren', at: [-12.5, 2.6], rot: 90, npc: 'wren', name: 'Wren', talkY: 1.0, collide: 0,
        path: [[-12.5, 2.6], [-5.2, 4.2], [-4.6, -3.0], [-12.2, -2.4]], speed: 1.1, pause: 2.5 },
      { type: 'person', hero: 'town_guard', id: 'hale', at: [3.4, -31], rot: 0, npc: 'hale', name: 'Hale', talkY: 1.6, collide: 0,
        path: [[3.4, -31], [3.4, -23.5]], speed: 0.7, pause: 5 },
      { type: 'person', hero: 'town_guard', id: 'guard_south', at: [-3.4, 32.5], rot: 180, tint: '#b8b0a8' },

      // ---- gates on the lane
      { type: 'town_gate', at: [0.7, -34], rot: 0, clear: 4 },
      { type: 'town_gate', at: [-0.7, 34], rot: 180, clear: 4 },

      // ---- houses (Aldric's has the green door)
      house([13.6, -14], -90, 61),
      house([13.2, -25.5], -95, 62),
      { type: 'stone_cottage', hero: 'cottage', heroSize: 7.5, at: [-14, -28], rot: 90, clear: 7 },
      house([-25.5, -16], 45, 63),
      { type: 'timber_house', at: [16.5, 21], rot: -90, w: 9, d: 7, seed: 72, doorName: 'A Green Door', plaster: 0xb8b0a0, roofColor: 0x3a4a3a, windowColor: '#ffc46a', clear: 8 },
      house([-22.5, 15.5], 120, 64),
      house([-9.5, 21.5], 180, 65),
      { type: 'stone_cottage', hero: 'cottage', heroSize: 7, at: [12.5, 32], rot: -110, clear: 7 },

      // ---- fences, trees, lanterns
      { type: 'fence', at: [20.5, 12.5], rot: 0, length: 8, seed: 1 },
      { type: 'fence', at: [-18, 25], rot: 90, length: 8, seed: 2 },
      { type: 'fence', at: [-30, -9], rot: 0, length: 6, seed: 3 },
      { type: 'fence', at: [19, -20], rot: 90, length: 9, seed: 4 },
      { type: 'great_tree', at: [-19.5, -9.5], size: 0.6, seed: 95, leaves: '#2a4434', clear: 3 },
      { type: 'great_tree', at: [21, -3], size: 0.55, seed: 96, leaves: '#24402e', clear: 3 },
      lantern([2.4, -19]), lantern([-2.5, -3.5]), lantern([2.4, 13]), lantern([-2.6, 27]), lantern([-1.6, -30.5]),
    ],
    clearings: [[-5, 0, 40]],
    scatter: [{ kind: 'rock', count: 18, at: [0, 0], radius: 44, minR: 34, minRoad: 3, scale: [0.4, 1.1], seed: 'hfr' }],
    shot: { key: 13, at: [3.2, 11], height: 1.7, target: [-8, -10, 3.2], fov: 62 },
  });
}
