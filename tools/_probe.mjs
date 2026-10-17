// Dev probe: load the game, run JS in the page, optionally screenshot.
//   node tools/_probe.mjs "<js expression>" [out.png]
import http from 'http'; import fs from 'fs'; import path from 'path'; import { chromium } from 'playwright';
const root = process.cwd();
const MIME = { '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => { let u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise(r => server.listen(0, r));
const b = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://localhost:${server.address().port}/?nohud&capture&shot=${process.argv[4] ?? 2}`);
await p.waitForFunction(() => window.vaelmoor?.ready, null, { timeout: 60000 }).catch(() => console.log('not ready', errs));
await p.waitForTimeout(1500);
console.log(await p.evaluate(process.argv[2]));
await p.waitForTimeout(800);
if (process.argv[3]) await p.screenshot({ path: process.argv[3] });
if (errs.length) console.log('errors:', errs);
await b.close(); server.close();
