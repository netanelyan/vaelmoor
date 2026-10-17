// Walks the player along the whole road (every N metres, facing along it)
// and reports fps / draw calls / triangles, worst spots first.
//   node tools/perf.mjs [--step=25] [--size=1280x720]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1] || d;
const STEP = Number(arg('step', 25));
const [W, H] = arg('size', '1280x720').split('x').map(Number);
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
const DPR = Number(arg('dpr', 1));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const REGION = arg('region', 'surface');
await page.goto(`http://localhost:${server.address().port}/?nohud&play&region=${REGION}`);
await page.waitForFunction(() => window.vaelmoor?.ready, null, { timeout: 60000 });
await page.waitForTimeout(2000);

const n = await page.evaluate(() => window.vaelmoor.world.road.n);
const rows = [];
for (let i = 0; i < n; i += STEP) {
  await page.evaluate((k) => {
    const v = window.vaelmoor, r = v.world.road;
    v.player.teleport(r.x[k], r.z[k], Math.atan2(-r.tx[k], -r.tz[k]), 0);
  }, i);
  await page.waitForTimeout(700);
  rows.push({ at: i, ...(await page.evaluate(() => ({ fps: Math.round(window.vaelmoor.fps), area: window.vaelmoor.atmosphere.dominant, ...window.vaelmoor.info() }))) });
}
rows.sort((a, b) => a.fps - b.fps);
const valid = rows.filter((r) => Number.isFinite(r.fps));
rows.length = 0; rows.push(...valid);
const avg = rows.reduce((s, r) => s + r.fps, 0) / rows.length;
console.log(`road ${n} m, ${rows.length} samples, avg ${avg.toFixed(1)} fps, min ${rows[0].fps} fps`);
for (const r of rows.slice(0, 8)) console.log(`  ${String(r.fps).padStart(3)} fps  @${r.at}m  ${r.area.padEnd(12)} ratio=${r.ratio.toFixed(2)} calls=${r.calls} tris=${(r.triangles / 1e6).toFixed(2)}M`);
if (errors.length) console.log('errors:', errors);
await browser.close();
server.close();
