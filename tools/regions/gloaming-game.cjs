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

// ---- hero models (assets/hero, Meshy AI) in place of the procedural figures
const set = (areaId, type, fields, filter = () => true) => {
  for (const p of region.areas.find((a) => a.id === areaId).props) if (p.type === type && filter(p)) Object.assign(p, typeof fields === 'function' ? fields(p) : fields);
};
set('castle_road', 'castle_dark', { hero: 'castle', heroHeight: 60 });
set('lake', 'knight', { hero: 'knight_sitting', aboveWater: 0.55 });
// the conclave: three wizards (one in grey) and Pipwick on his bench
const wiz = region.areas.find((a) => a.id === 'wizards');
// keep the three nearest the ref_04 camera; the archmage's lines move to the front one
const arch = wiz.props.find((p) => p.type === 'wizard' && p.seed === 30);
const front = wiz.props.find((p) => p.type === 'wizard' && p.seed === 34);
if (arch && front) Object.assign(front, { npc: arch.npc, name: arch.name });
wiz.props = wiz.props.filter((p) => !(p.type === 'wizard' && [30, 31].includes(p.seed)));
set('wizards', 'wizard', (p) => ({ hero: 'wizard_purple', ...(p.seed === 33 ? { dye: { color: '#a8a8b8', gain: 2.6 } } : {}) }));
set('wizards', 'gnome', { hero: 'gnome', y: 0.62 });
set('whitewizard', 'wizard', { hero: 'wizard_white' });
set('aurora', 'skeleton', { hero: 'skeleton_keeper' });
set('lady_pool', 'lady', { hero: 'lady_isolde' });
set('gnome_camp', 'camp_gnome', { hero: 'gnome' });
set('throne', 'throne_king', { hero: 'green_king', heroHeight: 2.7 });
set('swamp', 'troll_boat', { hero: 'troll', aboveWater: -0.35 }); // the hull sits in the water
set('treehouses', 'tree_house', (p) => ({ hero: 'tree_house', heroHeight: p.height ? 16 : 12 }));

fs.writeFileSync(file, JSON.stringify(region, null, 2) + '\n');
console.log('gloaming.json: gameplay content added');
