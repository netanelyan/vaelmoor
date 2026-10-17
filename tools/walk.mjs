// Walkability check: at points along the road, face along it, hold W (and
// sprint) for 1.5 s and confirm the player really moved. Flags anything that
// blocks the road (stray colliders, steep steps, water).
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const root = process.cwd();
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(root, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const REGION = (process.argv.find((a) => a.startsWith('--region=')) || '--region=surface').split('=')[1];
await page.goto(`http://localhost:${server.address().port}/?nohud&play&quality=0.75&region=${REGION}`);
await page.waitForFunction(() => window.vaelmoor?.ready, null, { timeout: 60000 });
await page.waitForTimeout(1500);

const n = await page.evaluate(() => window.vaelmoor.world.road.n);
const stuck = [];
let checked = 0;
for (let i = 5; i < n - 15; i += 20) {
  const start = await page.evaluate((k) => {
    const v = window.vaelmoor, r = v.world.road;
    v.player.teleport(r.x[k], r.z[k], Math.atan2(-r.tx[k], -r.tz[k]), 0);
    v.vitals.stamina = 1; // the check is about the road, not the player's lungs
    return [v.player.pos.x, v.player.pos.z];
  }, i);
  await page.waitForTimeout(600); // let the post-teleport frame (new chunks, shadow map) settle
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  const end = await page.evaluate(() => [window.vaelmoor.player.pos.x, window.vaelmoor.player.pos.z]);
  const moved = Math.hypot(end[0] - start[0], end[1] - start[1]);
  checked++;
  if (moved < 6) stuck.push({ at: i, moved: moved.toFixed(1), pos: start.map((v) => v.toFixed(1)) });
}
console.log(`walk check: ${checked} spots along ${n} m of road, ${stuck.length} blocked`);
for (const s of stuck) console.log(`  blocked @${s.at}m (${s.pos}) moved only ${s.moved} m`);
if (errors.length) console.log('errors:', errors);
await browser.close();
server.close();
