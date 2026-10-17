// Screenshot harness: serves the repo, opens the game headless in Chromium
// (real GPU via ANGLE/D3D11, or SwiftShader with --swiftshader), jumps to
// each photo-mode shot and saves docs/compare/shot_<key>.jpg.
// Prints console errors and a perf readout per shot.
//
//   node tools/shoot.mjs            all shots
//   node tools/shoot.mjs 2 5        only shots 2 and 5
//   node tools/shoot.mjs --swiftshader --size=1920x1080 --out=some/dir
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}`));
  if (!a) return def;
  return a.includes('=') ? a.split('=')[1] : true;
};
const keys = args.filter((a) => /^\d$/.test(a));
const [W, H] = String(flag('size', '720x960')).split('x').map(Number);
const outDir = flag('out', 'docs/compare');
const settle = Number(flag('settle', 2500));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml' };
const root = process.cwd();
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const gpuArgs = flag('swiftshader', false)
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
const browser = await chromium.launch({ headless: true, args: gpuArgs });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('console', (m) => { if (m.text().includes('X4122')) return; // harmless D3D compiler precision note
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

fs.mkdirSync(outDir, { recursive: true });
const base = `http://localhost:${port}/`;
await page.goto(`${base}?nohud&capture&quality=1&shot=${keys[0] ?? 1}`);
try {
  await page.waitForFunction(() => window.vaelmoor?.ready, null, { timeout: 30000 });
} catch (e) {
  console.log(`game never became ready:\n  ${errors.join('\n  ')}`);
  await browser.close(); server.close(); process.exit(1);
}
const shots = keys.length ? keys : await page.evaluate(() => [...window.vaelmoor.photo.shots.keys()].sort());

for (const k of shots) {
  await page.evaluate((key) => window.vaelmoor.shot(key), k);
  await page.waitForTimeout(settle);
  const info = await page.evaluate(() => ({ fps: Math.round(window.vaelmoor.fps || 0), ...window.vaelmoor.info() }));
  const file = path.join(outDir, `shot_${k}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 92 });
  console.log(`shot ${k} -> ${file}  fps=${info.fps} calls=${info.calls} tris=${info.triangles} programs=${info.programs}`);
}

if (errors.length) {
  console.log(`\n${errors.length} console messages:`);
  for (const e of [...new Set(errors)].slice(0, 40)) console.log('  ' + e);
} else console.log('\nconsole: clean');
await browser.close();
server.close();
