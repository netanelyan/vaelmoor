// Step 3 playtest: Hollowford (the lane, the town, its people and quests).
//   node tools/playtest/step3.mjs   -> docs/playtest/step3/*.jpg + results.json
import { launch } from './common.mjs';

const T = await launch({ query: 'play', out: 'docs/playtest/step3' });
const { page, shot, press, ev, fps, check, finish } = T;
await page.waitForTimeout(1500);

const st = () => ev(() => window.T.state());
const V = (fn, a) => ev(fn, a);
const flags = () => V(() => window.vaelmoor.game.flags);
const quest = (id) => V((id) => { const q = window.vaelmoor.quests.get(id); return { status: q.status, done: q.objectives.map((o) => o.done) }; }, id);
const line = () => V(() => window.vaelmoor.ui.dialogue.subtitle.textContent);
const options = () => V(() => window.vaelmoor.ui.dialogue.list.items.map((i) => i.label));
/** pick the dialogue option whose label contains `text` */
const choose = async (text, wait = 450) => {
  const i = await V((t) => window.vaelmoor.ui.dialogue.list.items.findIndex((x) => x.label.includes(t)), text);
  if (i < 0) throw new Error(`no option "${text}" in ${JSON.stringify(await options())}`);
  await V((i) => window.vaelmoor.ui.dialogue.list.select(i), i);
  await press('Enter', wait);
};
const talk = async (id, dist = 1.8) => {
  await V((id) => window.T.face(id, 1.8), id);
  await page.waitForTimeout(350);
  await press('e', 500);
  return (await st()) === 'dialogue';
};
const close = () => press('Escape', 350);
const inv = () => V(() => { const g = window.vaelmoor.game; return { gold: g.inventory.gold, stacks: Object.fromEntries(g.inventory.stacks) }; });

// --- the lane and the town
const lane = await V(() => { const r = window.vaelmoor.world.road; return { segs: r.segs.length, n: r.n }; });
check('Hollowford Lane branches off the road', lane.segs === 2, JSON.stringify(lane));
check('the forgetting starts hidden', (await quest('forgetting')).status === 'hidden');
const journal0 = await V(() => window.vaelmoor.quests.ordered().map((q) => q.id));
check('hidden quests stay out of the journal', !journal0.includes('forgetting') && !journal0.includes('bram'), journal0.join(','));
// walk in from the south gate: discovery
await V(() => window.vaelmoor.player.teleport(24.5, -48, 0, 0));
await page.waitForTimeout(400);
for (let i = 0; i < 40 && !(await V(() => window.vaelmoor.quests.discovered.has('hollowford'))); i++) {
  await page.keyboard.down('KeyW'); await page.waitForTimeout(250); await page.keyboard.up('KeyW');
}
check('Hollowford is discovered on the way in', await V(() => window.vaelmoor.quests.discovered.has('hollowford')));
await page.waitForTimeout(600);
await shot('01_arrival');

// --- the notice board starts the quest
await V(() => window.T.face('notice_board', 1.6));
await page.waitForTimeout(300);
check('notice board prompt', await V(() => window.vaelmoor.ui.target?.id === 'notice_board' && window.vaelmoor.ui.target.action === 'Read'));
await press('e', 600);
check('reading the notice opens it', (await st()) === 'book');
await shot('02_notice');
await press('Escape', 400);
check('the notice starts The Forgetting', (await quest('forgetting')).status === 'active');
check('...and tracks it', await V(() => window.vaelmoor.quests.trackedQuest()?.id === 'forgetting'));

// --- Maren: barter and a bed
check('talk to Maren', await talk('maren'));
await shot('03_maren');
await choose("What's for sale?");
check('Maren sells food and drink', (await st()) === 'transfer' && (await V(() => window.vaelmoor.ui.transfer.L.list.items.some((r) => r.id === 'mead'))));
// buy a mead (for Bram)
await V(() => { const tr = window.vaelmoor.ui.transfer; tr.focus('left'); tr.L.list.select(tr.L.list.items.findIndex((r) => r.id === 'mead')); });
await press('e', 300);
check('buy a mead', (await inv()).stacks.mead >= 1);
await close();
await V(() => { const c = window.vaelmoor.game.character; c.cur.health = 20; c.cur.stamina = 10; });
await talk('maren');
await choose('I need a bed');
await page.waitForTimeout(800);
await shot('04_rest');
await page.waitForTimeout(2600);
const rested = await V(() => { const c = window.vaelmoor.game.character; return { h: c.cur.health, H: c.max('health'), s: c.cur.stamina }; });
check('a bed restores health and stamina', rested.h === rested.H && rested.s > 90 && (await st()) === 'play', JSON.stringify(rested));

// --- Brother Cass
await talk('cass');
check("Cass's objective is current", (await quest('forgetting')).done[0], JSON.stringify(await quest('forgetting')));
await choose('Why has the town');
await shot('05_cass');
check('Cass explains the bell', /clapper/.test(await line()));
await close();
// the rope does nothing without a clapper
await V(() => window.T.face('bell_rope', 1.4));
await page.waitForTimeout(300);
check('bell rope prompt', await V(() => window.vaelmoor.ui.target?.id === 'bell_rope'));
await press('e', 300);
check('no clapper, no bell', !(await flags()).bell_rung && !(await quest('forgetting')).done[3]);

// --- the clapper at the barrow door
await V(() => { for (const e of window.vaelmoor.enemies.list('surface')) if (/hollow_door/.test(e.id)) e.state = 'idle'; });
await V(() => window.T.face('surface:bell_clapper', 1.3));
await page.waitForTimeout(400);
await shot('06_clapper');
check('clapper prompt at the barrow door', await V(() => window.vaelmoor.ui.target?.id === 'surface:bell_clapper'));
check('the quest marker points at the clapper', await V(() => { const ui = window.vaelmoor.ui, q = window.vaelmoor.quests; const p = ui.objectivePos(q.current(q.get('forgetting'))); return !!p && Math.hypot(p[0] - 22.4, p[1] + 144.4) < 1; }));
await press('e', 300);
check('take the clapper', (await inv()).stacks.bell_clapper === 1 && (await quest('forgetting')).done[1]);
const sold = await V(() => { const g = window.vaelmoor.game; g.drop('bell_clapper'); return g.inventory.has('bell_clapper'); });
check('the clapper is a quest item (cannot be dropped)', sold);

// --- back to Cass, ring the bell
await V(() => { const c = window.vaelmoor.game.character; c.cur.health = c.max('health'); });
await talk('cass');
check('Cass takes the clapper', !(await inv()).stacks.bell_clapper && (await flags()).clapper_fixed && (await quest('forgetting')).done[2]);
await close();
await V(() => window.T.face('bell_rope', 1.4));
await page.waitForTimeout(300);
await press('e', 600);
check('ring the bell', (await flags()).bell_rung && (await quest('forgetting')).done[3]);
await page.waitForTimeout(500);
const swing = await V(() => { let r = 0; window.vaelmoor.scene.traverse((o) => { if (o.parent?.name === 'chapel' && o.isGroup && Math.abs(o.rotation.x) > 0.01) r = o.rotation.x; }); return r; });
check('the bell swings', Math.abs(swing) > 0.01, swing.toFixed(3));
// a look up at the belfry
await V(() => { const it = window.T.target('bell_rope'); window.vaelmoor.player.teleport(it.pos.x + 6.5, it.pos.z + 0.9, Math.PI / 2 + 0.1, 0.9); });
await page.waitForTimeout(600);
await shot('07_bell');

// --- Sir Aldric remembers
await talk('aldric');
check('talking to Aldric completes The Forgetting', (await quest('forgetting')).status === 'complete');
check('Aldric remembers', /Elsbeth/.test(await line()));
await choose('The lake you dreamed of');
check("Aldric gives his blade", (await inv()).stacks.aldric_blade === 1);
await shot('08_aldric');
await close();
await talk('wren');
check('Wren remembers too', /Tilde/.test(await line()));
await close();

// --- Bram's stash
await talk('bram');
await choose('(Give him a mead)');
check("Bram's Stash starts", (await quest('bram')).status === 'active' && (await inv()).stacks.note_bram === 1);
await shot('09_bram');
await close();
await V(() => { window.vaelmoor.game.containers.get('surface:bram_stash').locked = null; }); // (lockpicking is step 1's playtest)
await V(() => window.T.face('surface:bram_stash', 1.5));
await page.waitForTimeout(300);
await press('e', 500);
check('open the stash', (await st()) === 'transfer' && (await quest('bram')).done[0]);
await shot('10_stash');
await press('r', 300);
await close();
await talk('bram');
await choose('It was there.');
check("Bram's Stash completes", (await quest('bram')).status === 'complete');
await close();

// --- Torvin trains, Hale tips
await V(() => { window.vaelmoor.game.inventory.gold += 100; });
await talk('torvin');
await shot('11_torvin');
const sm0 = await V(() => window.vaelmoor.game.character.skill('smithing'));
const g0 = (await inv()).gold;
await choose('Teach me some smithing');
const sm1 = await V(() => window.vaelmoor.game.character.skill('smithing'));
check('Torvin trains Smithing for 40 gold', sm1 === sm0 + 1 && (await inv()).gold === g0 - 40, `${sm0} -> ${sm1}, gold ${g0} -> ${(await inv()).gold}`);
await close();
check('talk to Hale at the north gate', await talk('hale'));
await close();

// --- townsfolk move about
const w0 = await V(() => { const t = window.T.target('wren'); return [t.pos.x, t.pos.z]; });
await V(() => window.vaelmoor.player.teleport(18, -70, 0.8, 0));
await page.waitForTimeout(4000);
const w1 = await V(() => { const t = window.T.target('wren'); return [t.pos.x, t.pos.z]; });
check('Wren walks her loop', Math.hypot(w1[0] - w0[0], w1[1] - w0[1]) > 0.5, `${w0.map((v) => v.toFixed(1))} -> ${w1.map((v) => v.toFixed(1))}`);

// --- save / load keeps the town's state
await V(() => window.vaelmoor.ui.saveGame('save1'));
await V(() => { window.vaelmoor.game.flags = {}; window.vaelmoor.quests.get('forgetting').status = 'hidden'; });
await V(() => window.vaelmoor.ui.loadGame('save1'));
check('save / load keeps quests and flags', (await quest('forgetting')).status === 'complete' && (await flags()).bell_rung);

// --- the lake knight in the Gloaming hears the news
await V(() => window.vaelmoor.setRealm('gloaming'));
await page.waitForTimeout(1500);
const lk = await V(() => !!window.vaelmoor.world.interactables.list.find((i) => i.id === 'lake_knight'));
if (lk) {
  await talk('lake_knight', 2.4);
  check('Ser Aldric of the Glass hears from Hollowford', (await options()).some((o) => o.includes('Hollowford')));
  await choose('Sir Aldric of Hollowford');
  check('...and the water clears', /clear/.test(await line()));
  await close();
} else check('lake knight present in the Gloaming', false);
await V(() => window.vaelmoor.setRealm('surface'));
await page.waitForTimeout(800);
await page.waitForTimeout(4500); // let the Gloaming detour's discovery popup fade

// --- perf in the square
await V(() => window.vaelmoor.player.teleport(28, -66, -0.5, 0));
await page.waitForTimeout(1500);
await shot('12_square');
const f = await fps(4);
check('fps in Hollowford', f.avg >= 50, `avg ${f.avg}, min ${f.min}`);

const { failed } = await finish();
process.exit(failed ? 1 : 0);
