// Gameplay content for the surface region (containers, loot, merchants,
// townsfolk). Kept apart from surface.cjs, which frames the reference shots.
// Called by surface.cjs before it writes data/regions/surface.json.

module.exports = function addGameplay(region) {
  const areaById = (id) => region.areas.find((a) => a.id === id);

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
  );
};
