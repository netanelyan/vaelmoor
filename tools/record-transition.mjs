// Records walking down through the barrow door from the painted surface into
// the Gloaming -> docs/transition/barrow.webm, plus a few stills.
//   node tools/record-transition.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const OUT = 'docs/transition';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
const root = process.cwd();
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(root, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const size = { width: 960, height: 540 };
const context = await browser.newContext({ viewport: size, recordVideo: { dir: OUT, size } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${server.address().port}/?play&quality=1&region=surface`);
await page.waitForFunction(() => window.vaelmoor?.ready, null, { timeout: 60000 });

// stand on the slope above the barrow, facing the door
await page.evaluate(() => {
  const v = window.vaelmoor;
  v.player.teleport(20, -134, 0, -0.08);
  v.vitals.stamina = 1;
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/1_surface.jpg`, type: 'jpeg', quality: 88 });
await page.keyboard.down('KeyW');
let crossed = false;
for (let t = 0; t < 120 && !crossed; t++) {
  await page.waitForTimeout(100);
  crossed = await page.evaluate(() => window.vaelmoor.realm.id === 'gloaming');
}
await page.keyboard.up('KeyW');
await page.screenshot({ path: `${OUT}/2_crossing.jpg`, type: 'jpeg', quality: 88 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/3_waking.jpg`, type: 'jpeg', quality: 88 });
await page.keyboard.down('KeyW');
await page.waitForTimeout(2800);
await page.keyboard.up('KeyW');
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/4_gloaming.jpg`, type: 'jpeg', quality: 88 });

const video = page.video();
await context.close();
const tmp = await video.path();
fs.renameSync(tmp, `${OUT}/barrow.webm`);
console.log(crossed ? 'crossed into the Gloaming' : 'did NOT reach the portal');
console.log(errors.length ? `errors:\n  ${errors.join('\n  ')}` : 'console: clean');
await browser.close();
server.close();
