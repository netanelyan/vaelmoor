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

  // ---- the barrow door: Hollow Ones keep watch
  const barrow = areaById('barrow');
  barrow.props.push(
    { type: 'enemy', id: 'hollow_door_1', kind: 'hollow', at: [-4, 6], rot: 180, patrol: 4 },
    { type: 'enemy', id: 'hollow_door_2', kind: 'hollow', at: [5, 5], rot: 200, patrol: 4 },
  );
};
