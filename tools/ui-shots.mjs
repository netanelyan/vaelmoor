// Screenshots every UI screen over a live game scene -> docs/ui/<screen>.jpg
//   node tools/ui-shots.mjs [--region=gloaming] [--size=1280x720]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1] || d;
const REGION = arg('region', 'gloaming');
const [W, H] = arg('size', '1280x720').split('x').map(Number);
const OUT = 'docs/ui';
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
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (!m.text().includes('X4122') && (m.type() === 'error' || m.type() === 'warning')) errors.push(`[${m.type()}] ${m.text()}`); });
fs.mkdirSync(OUT, { recursive: true });

const base = `http://localhost:${server.address().port}/?region=${REGION}&quality=1`;
const snap = async (name, wait = 600) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: path.join(OUT, `${REGION}-${name}.jpg`), type: 'jpeg', quality: 90 });
  console.log(`  ${REGION}-${name}`);
};

await page.goto(base);
await page.waitForFunction(() => window.vaelmoor?.ready, null, { timeout: 60000 });
await snap('title', 3500);

// HUD: stand by the first NPC with a prompt, low stamina, a discovery popup
await page.keyboard.press('KeyX'); // any key -> play
await page.evaluate(() => {
  const v = window.vaelmoor;
  const npc = v.world.interactables.list.find((i) => i.kind === 'npc');
  const dx = 2.4, ang = 0.6;
  const x = npc.pos.x + Math.sin(ang) * dx, z = npc.pos.z + Math.cos(ang) * dx;
  v.player.teleport(x, z, Math.atan2(x - npc.pos.x, z - npc.pos.z), 0);
  const dy = npc.pos.y - v.camera.position.y;
  v.player.pitch = Math.atan2(dy, dx);
  v.vitals.stamina = 0.45;
  v.vitals.health = 0.8;
  v.ui.hud.discover(v.region.areas.find((a) => a.id === v.atmosphere.dominant)?.name ?? 'The Gloaming');
});
await snap('hud', 1800);

await page.keyboard.press('KeyE');
await snap('dialogue', 700);
await page.keyboard.press('KeyS');
await snap('dialogue-option', 400);
await page.keyboard.press('Escape');

await page.evaluate(() => window.vaelmoor.ui.setState('pause'));
await snap('pause', 500);
await page.keyboard.press('KeyS');
await page.keyboard.press('KeyE'); // JOURNAL
await snap('journal', 600);
await page.keyboard.press('KeyS');
await snap('journal-quest2', 400);
await page.keyboard.press('Escape');
await page.evaluate(() => window.vaelmoor.ui.setState('settings'));
await page.keyboard.press('KeyS');
await page.keyboard.press('KeyS');
await snap('settings', 500);

console.log(errors.length ? `console:\n  ${[...new Set(errors)].join('\n  ')}` : 'console: clean');
await browser.close();
server.close();
