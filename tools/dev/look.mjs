// Quick in-game look: node tools/dev/look.mjs <out-dir> "x,z,yaw[,pitch[,name]]" ...  (surface; yaw in degrees)
import { launch } from '../playtest/common.mjs';
const [out, ...views] = process.argv.slice(2);
const T = await launch({ query: 'play&region=surface', out });
await T.page.waitForTimeout(1500);
for (const v of views) {
  const [x, z, yaw, pitch = 0, name = `look_${x}_${z}`] = v.split(',');
  await T.ev(([x, z, y, p]) => { const V = window.vaelmoor; V.player.teleport(+x, +z, (+y * Math.PI) / 180, (+p * Math.PI) / 180); }, [x, z, yaw, pitch]);
  await T.page.waitForTimeout(1200);
  await T.shot(name);
}
console.log(await T.ev(() => window.vaelmoor.world.interactables.list.filter((i) => /maren|cass|aldric|bram|wren|hale|torvin|bell|notice|stash|clapper/.test(i.id)).map((i) => `${i.id} ${i.pos.x.toFixed(1)},${i.pos.y.toFixed(1)},${i.pos.z.toFixed(1)}`)));
await T.finish();
