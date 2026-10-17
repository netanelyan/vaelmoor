// Step 1 playtest: core RPG systems.
//   node tools/playtest/step1.mjs   -> docs/playtest/step1/*.png + results.json
import { launch } from './common.mjs';

const T = await launch({ query: 'play', out: 'docs/playtest/step1' });
const { page, shot, press, ev, fps, check, finish } = T;
await page.waitForTimeout(1500);

const st = () => ev(() => window.T.state());
const inv = () => ev(() => { const g = window.vaelmoor.game; return { gold: g.inventory.gold, stacks: Object.fromEntries(g.inventory.stacks), eq: g.inventory.equipped }; });

// --- new game
let s = await inv();
check('new game: starting gear', s.stacks.iron_dagger === 1 && s.eq.right === 'iron_dagger' && s.eq.body === 'wanderer_tunic', JSON.stringify(s.eq));

// --- merchant: talk, barter, buy and sell (Speech)
await ev(() => window.T.face('ysolde', 1.9));
await page.waitForTimeout(400);
check('prompt on Ysolde', await ev(() => window.vaelmoor.ui.target?.id === 'ysolde'));
await shot('01_ysolde_prompt');
await press('e', 500);
check('dialogue opens', (await st()) === 'dialogue');
await shot('02_dialogue');
await press('Enter', 500); // "Show me what you have."
check('barter opens', (await st()) === 'transfer');
const sp0 = await ev(() => window.vaelmoor.game.character.skills.speech.progress);
// buy a lockpick: select it on the merchant side
const buy = await ev(() => {
  const ui = window.vaelmoor.ui, tr = ui.transfer;
  tr.focus('left');
  const i = tr.L.list.items.findIndex((r) => r.id === 'lockpick');
  tr.L.list.select(i);
  return { price: tr.L.list.items[i].price };
});
const g0 = (await inv()).gold;
await press('e', 300);
let after = await inv();
check('buy a lockpick', after.gold === g0 - buy.price && after.stacks.lockpick === 5, `price ${buy.price}, gold ${g0} -> ${after.gold}`);
await shot('03_barter');
// sell the bread
await ev(() => { const tr = window.vaelmoor.ui.transfer; tr.focus('right'); tr.R.list.select(tr.R.list.items.findIndex((r) => r.id === 'bread')); });
const g1 = (await inv()).gold;
await press('e', 300);
after = await inv();
check('sell bread', after.gold > g1 && after.stacks.bread === 1, `gold ${g1} -> ${after.gold}`);
const sp1 = await ev(() => window.vaelmoor.game.character.skills.speech.progress);
check('trading trains Speech', sp1 > sp0, `progress ${sp0.toFixed(2)} -> ${sp1.toFixed(2)}`);
await press('Escape', 400);
check('barter closes to play', (await st()) === 'play');

// --- speech check (persuade, Speech 15 vs 20: fails at first)
await press('e', 500);
const opts = await ev(() => window.vaelmoor.ui.dialogue.list.items.map((i) => i.label));
check('returning greeting differs', opts.some((o) => o.includes('strongbox')), opts.join(' | '));
await ev(() => { const l = window.vaelmoor.ui.dialogue.list; l.select(l.items.findIndex((i) => i.label.includes('strongbox'))); });
await press('Enter', 400);
const persuadeLabel = await ev(() => window.vaelmoor.ui.dialogue.list.items[0].label);
check('persuade option labelled', persuadeLabel.startsWith('(Persuade)'), persuadeLabel);
await shot('04_persuade');
await press('Enter', 400);
check('persuade fails at Speech 15', (await ev(() => window.vaelmoor.ui.dialogue.subtitle.textContent)).startsWith('Nice try'));
await press('Escape', 400);

// --- lockpicking the old chest behind the cottage (novice)
await ev(() => window.T.face('surface:cottage_chest', 1.6));
await page.waitForTimeout(300);
const prompt = await ev(() => { const ui = window.vaelmoor.ui; return ui.target && ui.describe(ui.target); });
check('locked chest prompt', prompt?.action === 'Unlock' && /Novice/.test(prompt.sub), JSON.stringify(prompt));
await press('e', 400);
check('lockpick screen', (await st()) === 'lockpick');
const lp0 = await ev(() => window.vaelmoor.game.character.skills.lockpicking.progress);
// move the pick to the sweet spot with the mouse over the lock, then hold E
const sweet = await ev(() => window.vaelmoor.ui.lockpick.sweet);
const box = await ev(() => { const r = document.querySelector('#lockpick svg').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
await page.mouse.move(box.x + (sweet / 110 + 1) / 2 * box.w, box.y + box.h * 0.3, { steps: 8 });
await page.waitForTimeout(200);
await shot('05_lockpick');
await page.keyboard.down('e');
await page.waitForTimeout(1200);
await page.keyboard.up('e');
await page.waitForTimeout(800);
check('lock opened, chest shows its contents', (await st()) === 'transfer', `state ${await st()}`);
const lp1 = await ev(() => window.vaelmoor.game.character.skills.lockpicking);
check('picking trains Lockpicking', lp1.progress > lp0 || lp1.level > 15, JSON.stringify(lp1));
await shot('06_chest');
const n0 = Object.keys((await inv()).stacks).length;
await press('r', 300); // take all
after = await inv();
check('take all from the chest', Object.keys(after.stacks).length > n0 && (await ev(() => window.vaelmoor.ui.transfer.L.list.items.length)) === 0);
await press('Escape', 300);

// --- the robbed traveller: search the body, take the sword from the ground
await ev(() => window.T.face('surface:road_body', 1.7));
await page.waitForTimeout(400);
await shot('07_body_prompt');
await press('e', 500);
check('search a body', (await st()) === 'transfer' && (await ev(() => window.vaelmoor.ui.transfer.L.name.textContent)) === 'DEAD TRAVELLER');
await shot('08_body');
// take one entry (E)
const taken = await ev(() => window.vaelmoor.ui.transfer.L.list.items[0]?.name);
await press('e', 300);
check('take one from a body', !(await ev((n) => window.vaelmoor.ui.transfer.L.list.items.some((i) => i.name === n && !i.gold), taken)) || taken === 'Gold', taken);
await press('Escape', 300);
await ev(() => window.T.face('surface:road_sword', 1.4));
await page.waitForTimeout(300);
check('ground loot prompt', await ev(() => window.vaelmoor.ui.target?.id === 'surface:road_sword'));
await press('e', 300);
check('take the sword', (await inv()).stacks.iron_sword === 1);

// --- inventory: categories, preview, equip, favorite
await press('i', 500);
check('inventory opens', (await st()) === 'inventory');
await ev(() => {
  const s = window.vaelmoor.ui.inventory;
  s.cats.select(s.cats.items.findIndex((c) => c.cat === 'weapons'));
  s.focus(1);
  s.list.select(s.list.items.findIndex((i) => i.id === 'iron_sword'));
});
await page.waitForTimeout(900);
await shot('09_inventory_sword');
await press('e', 300);
check('equip the iron sword (right hand)', (await inv()).eq.right === 'iron_sword');
await press('f', 200);
check('favorite it', await ev(() => window.vaelmoor.game.inventory.favorites.has('iron_sword')));
await ev(() => { const s = window.vaelmoor.ui.inventory; s.cats.select(s.cats.items.findIndex((c) => c.cat === 'apparel')); s.focus(1); });
await page.waitForTimeout(700);
await shot('10_inventory_apparel');
const w = await ev(() => document.querySelector('#inventory .rpg-bar').textContent);
check('armor / weight / gold bar', /ARMOR/.test(w) && /WEIGHT/.test(w) && /GOLD/.test(w), w);
// drink the potion
await ev(() => { const s = window.vaelmoor.ui.inventory; s.cats.select(s.cats.items.findIndex((c) => c.cat === 'potions')); s.focus(1); s.list.select(s.list.items.findIndex((i) => i.id === 'potion_health')); });
await ev(() => { window.vaelmoor.game.character.cur.health = 40; });
await press('e', 300);
check('potion heals', (await ev(() => window.vaelmoor.game.character.cur.health)) >= 64);
// read the book picked up behind the cottage? (it's on the ground there) - read Of Barrows if bought; here: the history book
await press('Escape', 300);
await ev(() => window.T.face('surface:cottage_book', 1.3));
await page.waitForTimeout(200);
await press('e', 300);
await press('i', 300);
await ev(() => { const s = window.vaelmoor.ui.inventory; s.cats.select(s.cats.items.findIndex((c) => c.cat === 'books')); s.focus(1); s.list.select(0); });
await press('e', 500);
check('read a book', (await st()) === 'book');
await shot('11_book');
await press('Escape', 300);
await press('Escape', 300);

// --- magic menu: spells into either hand
await press('p', 500);
check('magic menu lists spells', (await ev(() => window.vaelmoor.ui.inventory.list.items.map((i) => i.name).join(','))) === 'Flames,Healing');
await press('r', 300);
check('Flames in the left hand', (await inv()).eq.left === 'spell:flames');
await shot('12_magic');
await press('Escape', 300);

// --- favorites (Q): switch the right hand back to the dagger
await press('q', 400);
check('favorites open', (await st()) === 'favorites');
await ev(() => { const f = window.vaelmoor.ui.favorites; f.list.select(f.list.items.findIndex((i) => i.id === 'iron_dagger')); });
await shot('13_favorites');
await press('e', 300);
check('favorites equip the dagger', (await inv()).eq.right === 'iron_dagger');
await press('q', 300);
await ev(() => { window.vaelmoor.viewmodel.drawn = true; });
await page.waitForTimeout(700);
await shot('14_hands');

// --- levelling: skills rise by use; level-up -> stat choice + perk
const lvl = await ev(() => {
  const c = window.vaelmoor.game.character;
  for (let i = 0; i < 40; i++) c.useSkill('one_handed', 1); // forty sword swings' worth (combat arrives in step 2)
  for (let i = 0; i < 12; i++) c.useSkill('lockpicking', 2);
  return { level: c.level, oneHanded: c.skills.one_handed.level, pending: c.pendingLevelUps, perks: c.perkPoints };
});
check('skills level by use, character levels up', lvl.level >= 2 && lvl.oneHanded > 15, JSON.stringify(lvl));
await page.waitForTimeout(1600);
await shot('15_levelup_notice');
await press('k', 600);
check('skills screen opens with level-up choice', (await st()) === 'skills' && (await ev(() => !document.querySelector('#skills .levelup').classList.contains('ui-off'))));
await shot('16_levelup_choice');
const hp0 = await ev(() => window.vaelmoor.game.character.max('health'));
await press('Enter', 300);
check('+10 health from the level-up', (await ev(() => window.vaelmoor.game.character.max('health'))) === hp0 + 10);
for (let i = 0; i < 6; i++) if ((await ev(() => window.vaelmoor.game.character.pendingLevelUps)) > 0) await press('Enter', 200);
await page.waitForTimeout(500);
await shot('17_constellation');
const took = await ev(() => { const c = window.vaelmoor.game.character; return c.perkPoints > 0; });
await press('e', 300); // take Armsman (first perk of One-Handed, available at any level)
check('take a perk', took && (await ev(() => window.vaelmoor.game.character.hasPerk('oh_armsman'))));
await ev(() => window.vaelmoor.ui.skills.selectSkill(6)); // Lockpicking
await page.waitForTimeout(300);
await shot('18_constellation_lockpicking');
await press('Escape', 300);

// --- Tab menu
await press('Tab', 400);
check('tab menu', (await st()) === 'tabmenu');
await shot('19_tabmenu');
await press('Tab', 300);

// --- save / load round trip
await ev(() => window.vaelmoor.ui.saveGame('playtest'));
const before = await inv();
await ev(() => { const g = window.vaelmoor.game; g.inventory.gold += 999; g.inventory.remove('iron_sword', 1); });
await ev(() => window.vaelmoor.ui.loadGame('playtest'));
const restored = await inv();
check('save/load restores inventory and gold', restored.gold === before.gold && restored.stacks.iron_sword === before.stacks.iron_sword, `${before.gold} / ${restored.gold}`);
check('save/load keeps the chest looted', await ev(() => window.vaelmoor.game.containers.get('surface:cottage_chest').stacks?.size === 0));

// --- performance where all this lives
await ev(() => window.T.face('ysolde', 6));
const f = await fps(5);
check('fps 58+ at the peddler camp', f.avg >= 58, `avg ${f.avg}, min ${f.min}`);
const r = await finish();
process.exit(r.failed || r.errors.length ? 1 : 0);
