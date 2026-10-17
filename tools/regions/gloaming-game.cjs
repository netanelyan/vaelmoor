// Gameplay content for the Gloaming (enemies, loot). Patches
// data/regions/gloaming.json in place and can be re-run safely: props tagged
// `game: true` are removed and re-added.   node tools/regions/gloaming-game.cjs
const fs = require('fs');
const file = 'data/regions/gloaming.json';
const region = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const a of region.areas) a.props = (a.props || []).filter((p) => !p.game);
const add = (areaId, ...props) => region.areas.find((a) => a.id === areaId).props.push(...props.map((p) => ({ ...p, game: true })));

// shades drift between the wizards' field and the great tree
add('wizards',
  { type: 'enemy', id: 'shade_1', kind: 'shade', at: [38, -52], rot: 40, patrol: 6 },
  { type: 'enemy', id: 'shade_2', kind: 'shade', at: [46, -58], rot: 200, patrol: 6 },
  { type: 'enemy', id: 'shade_3', kind: 'shade', at: [30, -64], rot: 120, patrol: 8 },
);

fs.writeFileSync(file, JSON.stringify(region, null, 2) + '\n');
console.log('gloaming.json: gameplay content added');
