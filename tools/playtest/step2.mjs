// Step 2 playtest: combat. Drives real mouse/keyboard input.
//   node tools/playtest/step2.mjs   -> docs/playtest/step2/*.jpg + results.json
import { launch } from './common.mjs';

const T = await launch({ query: 'play', out: 'docs/playtest/step2' });
const { page, shot, press, ev, fps, check, finish } = T;
await page.waitForTimeout(2500);
await page.mouse.move(640, 360);

// helpers in the page
await ev(() => {
  const v = window.vaelmoor;
  Object.assign(window.T, {
    enemies: () => v.enemies.list(v.realm.id),
    enemy: (id) => v.enemies.list(v.realm.id).find((e) => e.id === id),
    /** turn to look at an enemy's chest (no teleport) */
    look(e, lift = 0) {
      const p = v.player.pos;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z;
      v.player.yaw = Math.atan2(-dx, -dz);
      const h = Math.hypot(dx, dz);
      v.player.pitch = Math.atan2(e.pos.y + e.def.height * 0.55 + lift - (p.y + v.player.eye), h);
    },
    nearestAlive() {
      let b = null, bd = 1e9;
      for (const e of v.enemies.list(v.realm.id)) { if (e.dead) continue; const d = Math.hypot(e.pos.x - v.player.pos.x, e.pos.z - v.player.pos.z); if (d < bd) { bd = d; b = e; } }
      return b && { id: b.id, d: bd };
    },
    stand(x, z, faceId) { v.player.teleport(x, z, 0, 0); if (faceId) this.look(this.enemy(faceId)); },
  });
});
const diag = async (label) => { if (!process.env.DIAG) return; const f = await fps(2); const m = await ev(() => { const r = window.vaelmoor.renderer; return { geo: r.info.memory.geometries, tex: r.info.memory.textures, prog: r.info.programs.length, heap: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6), arrows: window.vaelmoor.game.inventory.count('iron_arrow'), ammo: window.vaelmoor.game.inventory.equipped.ammo }; }); console.log('  fps@' + label, f.avg, JSON.stringify(m)); };
/** walk (sprinting when far) toward an enemy until within `dist`; hop closer if terrain blocks the way */
const approach = async (id, dist, sprintFrom = 8) => {
  let last = 1e9, stuck = 0;
  for (let i = 0; i < 120; i++) {
    const d = await ev((id) => { const e = window.T.enemy(id); window.T.look(e); return Math.hypot(e.pos.x - window.vaelmoor.player.pos.x, e.pos.z - window.vaelmoor.player.pos.z); }, id);
    if (d <= dist) return d;
    stuck = d > last - 0.2 ? stuck + 1 : 0;
    last = d;
    if (stuck > 6) { await ev(([id, dist]) => { const e = window.T.enemy(id), p = window.vaelmoor.player.pos; const k = (dist + 0.5) / Math.hypot(p.x - e.pos.x, p.z - e.pos.z); window.vaelmoor.player.teleport(e.pos.x + (p.x - e.pos.x) * k, e.pos.z + (p.z - e.pos.z) * k); window.T.look(e); }, [id, dist]); stuck = 0; continue; }
    if (d > sprintFrom) await page.keyboard.down('Shift');
    await page.keyboard.down('w'); await page.waitForTimeout(160); await page.keyboard.up('w');
    await page.keyboard.up('Shift');
  }
  return last;
};
const clickAttack = async (hold = 60) => { await page.mouse.down({ button: 'left' }); await page.waitForTimeout(hold); await page.mouse.up({ button: 'left' }); };

// --- gear: sword and shield; bow, arrows and potions for later
await ev(() => {
  const g = window.vaelmoor.game, inv = g.inventory;
  for (const [id, n] of [['iron_sword', 1], ['wooden_shield', 1], ['hunting_bow', 1], ['iron_arrow', 20], ['hide_armor', 1], ['potion_health', 3]]) inv.add(id, n);
  inv.equip('iron_sword', 'right'); inv.equip('wooden_shield'); inv.equip('hide_armor');
});
await page.waitForTimeout(1500);
await diag('start');

// --- wolves: walk up to the pack and let them notice
await ev(() => window.T.stand(-38, 32, 'surface:wolf_1'));
await press('r', 500); // draw
// walk toward the pack until they notice
for (let k = 12; k >= 3; k -= 3) {
  if (await ev(() => window.T.enemies().some((e) => e.id.includes('wolf') && e.aware))) break;
  await approach('surface:wolf_1', k, 99);
  await page.waitForTimeout(700);
}
const alerted = await ev(() => window.T.enemies().filter((e) => e.id.includes('wolf') && e.aware).length);
check('wolves notice the player', alerted >= 1, `${alerted} aware`);
await shot('01_wolves_charge');

// block: hold right mouse while a wolf bites; a well-timed block staggers it
const hp0 = await ev(() => window.vaelmoor.game.character.cur.health);
const bl0 = await ev(() => window.vaelmoor.game.character.skills.block.progress);
let blocked = false;
for (let i = 0; i < 40 && !blocked; i++) {
  await ev(() => { const n = window.T.nearestAlive(); if (n) window.T.look(window.T.enemy(n.id)); });
  const attacking = await ev(() => window.T.enemies().some((e) => e.attack && !e.attack.landed && e.attack.t > 0.05));
  if (attacking) {
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(700);
    await shot('02_block');
    await page.mouse.up({ button: 'right' });
    blocked = (await ev(() => window.vaelmoor.game.character.skills.block.progress)) > bl0;
  } else await page.waitForTimeout(100);
}
check('blocking a bite trains Block', blocked);

// fight: face the nearest wolf, swing when in reach; one power attack
let power = false, fled = false, kills = 0;
const st0 = await ev(() => window.vaelmoor.game.character.cur.stamina);
const oh0 = await ev(() => window.vaelmoor.game.character.skills.one_handed.progress + window.vaelmoor.game.character.skills.one_handed.level * 100);
for (let i = 0; i < 320; i++) {
  const n = await ev(() => { const n = window.T.nearestAlive(); if (n && n.id.includes('wolf')) window.T.look(window.T.enemy(n.id)); return n; });
  if (!n || !n.id.includes('wolf')) break;
  if (n.d < 2.6) {
    if (!power) { await clickAttack(700); power = true; await page.waitForTimeout(400); await shot('03_power_attack'); }
    else await clickAttack(60);
    await page.waitForTimeout(380);
  } else {
    // step in (the bot doesn't chase a runner across the map)
    await ev((id) => { const e = window.T.enemy(id), p = window.vaelmoor.player.pos; const k = 1.9 / Math.max(0.1, Math.hypot(p.x - e.pos.x, p.z - e.pos.z)); window.vaelmoor.player.teleport(e.pos.x + (p.x - e.pos.x) * k, e.pos.z + (p.z - e.pos.z) * k); window.T.look(e); }, n.id);
  }
  fled ||= await ev(() => window.T.enemies().some((e) => e.state === "flee"));
  if (i === 30) await shot('04_melee');
  await ev(() => { const c = window.vaelmoor.game.character; if (c.cur.health < 35) { c.cur.health = 80; } }); // a quick potion
}
kills = await ev(() => window.T.enemies().filter((e) => e.id.includes('wolf') && e.dead).length);
check('kill the wolf pack with the sword', kills === 3, `${kills}/3 dead`);
check('power attack costs stamina', power && (await ev(() => window.vaelmoor.game.character.cur.stamina)) < st0 + 50, `stamina ${st0}`);
const oh1 = await ev(() => window.vaelmoor.game.character.skills.one_handed.progress + window.vaelmoor.game.character.skills.one_handed.level * 100);
check('sword hits train One-Handed', oh1 > oh0);
check('a wounded wolf flees', fled);
await shot('05_after_fight');
await diag('after wolves');

// loot a wolf (the first one that fell)
const deadWolf = await ev(() => window.T.enemies().find((e) => e.id.includes('wolf') && e.dead)?.id ?? 'surface:wolf_1');
await ev((id) => window.T.face(`enemy:${id}`, 1.6), deadWolf);
await page.waitForTimeout(300);
check('dead wolf is searchable', await ev((id) => window.vaelmoor.ui.target?.id === `enemy:${id}`, deadWolf));
await press('e', 500);
check('wolf carries a pelt', await ev(() => window.vaelmoor.ui.transfer.L.list.items.some((i) => i.id === 'wolf_pelt')));
await shot('06_wolf_loot');
await press('r', 300);
await press('Escape', 300);

// --- bow: a sneak shot at an unaware Hollow One from 22 m
await ev(() => {
  const v = window.vaelmoor, g = v.game;
  g.inventory.equip('hunting_bow', 'right');
  const e = window.T.enemy('surface:hollow_door_1');
  v.player.sneaking = true;
  v.ui.hud.setSneak(true);
  const a = 0.6;
  window.T.stand(e.pos.x + Math.sin(a) * 22, e.pos.z + Math.cos(a) * 22, e.id);
});
await page.waitForTimeout(1500);
const unaware = await ev(() => !window.T.enemy('surface:hollow_door_1').aware);
check('sneaking at 22 m: the Hollow One has not noticed', unaware);
await shot('07_sneak_eye');
const ar0 = await ev(() => window.vaelmoor.game.character.skills.archery.progress);
const hh0 = await ev(() => window.T.enemy('surface:hollow_door_1').health);
// aim above the chest by the drop over the flight (full draw ~60 m/s); up to three shots
let hh1 = hh0, shots = 0;
while (hh1 >= hh0 && shots < 3) {
  shots++;
  await ev(() => { const e = window.T.enemy('surface:hollow_door_1'); const p = window.vaelmoor.player.pos; const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z); const t = d / 60; window.T.look(e, 0.5 * 9.8 * t * t); });
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(1300);
  if (shots === 1) await shot('08_bow_drawn');
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(900);
  hh1 = await ev(() => window.T.enemy('surface:hollow_door_1').health);
}
check('arrow hits the Hollow One', hh1 < hh0, `health ${hh0} -> ${hh1.toFixed(1)} in ${shots} shot(s)`);
await diag('after bow');
check('sneak shot bonus + Archery trained', (await ev(() => window.vaelmoor.game.character.skills.archery.progress)) > ar0);

// --- flames on the (now angry) Hollow One
await ev(() => { const v = window.vaelmoor; v.player.sneaking = false; v.ui.hud.setSneak(false); v.game.inventory.equip('spell:flames', 'right'); v.game.inventory.equip('spell:healing', 'left'); });
const de0 = await ev(() => window.vaelmoor.game.character.skills.destruction.progress);
await approach('surface:hollow_door_1', 4);
await page.mouse.down({ button: 'left' });
for (let i = 0; i < 12; i++) { await ev(() => window.T.look(window.T.enemy('surface:hollow_door_1'))); await page.waitForTimeout(150); if (i === 5) await shot('09_flames'); }
await page.mouse.up({ button: 'left' });
const hh2 = await ev(() => window.T.enemy('surface:hollow_door_1').health);
check('Flames burn the Hollow One', hh2 < hh1, `health ${hh1.toFixed(1)} -> ${hh2.toFixed(1)}`);
await diag('after flames');
check('Flames train Destruction', (await ev(() => window.vaelmoor.game.character.skills.destruction.progress)) > de0);

// --- healing in the left hand
await ev(() => { const c = window.vaelmoor.game.character; c.cur.health = 40; c.cur.magicka = c.max('magicka'); const e = window.T.enemy('surface:hollow_door_1'); if (!e.dead) e.stagger = 3; });
const re0 = await ev(() => window.vaelmoor.game.character.skills.restoration.progress);
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(1500);
await shot('10_healing');
await page.mouse.up({ button: 'right' });
check('Healing restores health', (await ev(() => window.vaelmoor.game.character.cur.health)) > 45);
await diag('after healing');
check('Healing trains Restoration', (await ev(() => window.vaelmoor.game.character.skills.restoration.progress)) > re0);

// --- sneak attack with the sword on the second, unaware Hollow One (from behind)
await ev(() => {
  const v = window.vaelmoor;
  const e1 = window.T.enemy('surface:hollow_door_1'); e1.hit(999); // finish the first
  v.game.inventory.equip('iron_sword', 'right');
  v.player.sneaking = true;
  const e = window.T.enemy('surface:hollow_door_2');
  e.state = 'idle'; e.detect = 0; e.wander = null; e.timer = 99;
  window.T.stand(e.pos.x - Math.sin(e.yaw) * 1.6, e.pos.z - Math.cos(e.yaw) * 1.6, e.id);
});
await page.waitForTimeout(300);
const s0 = await ev(() => window.T.enemy('surface:hollow_door_2').health);
let s1 = s0;
for (let k = 0; k < 2 && s1 >= s0; k++) {
  await ev(() => window.T.look(window.T.enemy('surface:hollow_door_2')));
  await clickAttack(60);
  await page.waitForTimeout(650);
  s1 = await ev(() => window.T.enemy('surface:hollow_door_2').health);
}
const log = await ev(() => [...document.querySelectorAll('.pickup-log div')].map((d) => d.textContent).join(' | '));
check('sneak attack: 3x damage', s0 - s1 > 20 && /Sneak attack/.test(log), `${s0} -> ${s1.toFixed(1)}; ${log}`);
await shot('11_sneak_attack');

// --- fps in a fight
await ev(() => { window.vaelmoor.player.sneaking = false; window.vaelmoor.game.character.cur.health = 400; });
await diag('before fps check');
await page.waitForTimeout(1500);
let cdp = null;
if (process.env.PROFILE) { cdp = await page.context().newCDPSession(page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
const f = await fps(8);
if (cdp) {
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n])); let total = 0;
  profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (profile.timeDeltas[i] || 0)); total += profile.timeDeltas[i] || 0; });
  console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `   ${(v / total * 100).toFixed(1)}%  ${k}`).join(String.fromCharCode(10)));
}
console.log('  diag', await ev(() => { const v = window.vaelmoor; const i = v.info(); let n = 0; v.scene.traverse(() => n++); return JSON.stringify({ ...i, objects: n, arrows: v.combat.arrows.length, flames: v.combat.flames?.g.children.filter((s) => s.visible).length, enemies: v.enemies.list('surface').map((e) => e.state), pos: [v.player.pos.x.toFixed(0), v.player.pos.z.toFixed(0)] }); }));
check('fps 58+ in a fight', f.avg >= 58, `avg ${f.avg}, min ${f.min}`);

// --- death: fade to black, back at the last save
await ev(() => { const c = window.vaelmoor.game.character; c.base.health = 100; c.cur.health = 100; window.vaelmoor.ui.saveGame('save1'); });
const saved = await ev(() => window.vaelmoor.game.inventory.count('iron_arrow'));
await ev(() => { const v = window.vaelmoor; v.game.inventory.remove('iron_arrow', 5); v.game.character.cur.health = 3; v.game.character.base.health = 100; });
// a Hollow One's blow lands on a nearly dead hero (through the real hit path: armor, block, HUD)
await ev(() => { const e = window.T.enemy('surface:hollow_door_2'); window.vaelmoor.combat.onStrike(e, 40); });
await page.waitForTimeout(300);
check('death fades to black', (await ev(() => window.T.state())) === 'dead');
await page.waitForTimeout(1600);
await shot('12_death');
await page.waitForTimeout(3200);
const after = await ev(() => ({ st: window.T.state(), arrows: window.vaelmoor.game.inventory.count('iron_arrow'), hp: window.vaelmoor.game.character.cur.health }));
check('reloads the last save', after.st === 'play' && after.arrows === saved && after.hp > 50, JSON.stringify({ ...after, saved }));

const r = await finish();

// --- a fresh session: fps while actually fighting (swinging at a Hollow One that hits back)
console.log('');
console.log('fresh session fight:');
const F = await launch({ query: 'play', out: 'docs/playtest/step2/fresh' });
await F.page.waitForTimeout(2500);
await F.page.mouse.move(640, 360);
await F.ev(() => {
  const v = window.vaelmoor, g = v.game;
  g.inventory.add('iron_sword'); g.inventory.equip('iron_sword', 'right');
  g.character.base.health = 1e5; g.character.cur.health = 1e5;
  const e = v.enemies.list('surface').find((x) => x.id === 'surface:hollow_door_1');
  e.def = { ...e.def, health: 1e5 }; e.health = 1e5; e.hit(1);
  v.player.teleport(e.pos.x + 2, e.pos.z + 1.2, 0, 0);
  v.viewmodel.drawn = true;
  window.__fight = setInterval(() => { const p = v.player.pos; v.player.yaw = Math.atan2(-(e.pos.x - p.x), -(e.pos.z - p.z)); }, 50);
});
const swinging = (async () => { for (let i = 0; i < 24; i++) { await F.page.mouse.down({ button: 'left' }); await F.page.waitForTimeout(60); await F.page.mouse.up({ button: 'left' }); await F.page.waitForTimeout(380); } })();
await F.page.waitForTimeout(1500);
const ff = await F.fps(8);
await swinging;
await F.shot('fight');
F.check('fps 58+ while fighting (fresh session)', ff.avg >= 58, `avg ${ff.avg}, min ${ff.min}`);
const r2 = await F.finish();
process.exit(r.failed || r.errors.length || r2.failed || r2.errors.length ? 1 : 0);
