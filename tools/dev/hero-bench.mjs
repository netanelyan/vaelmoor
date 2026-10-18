// Hero-model bench: node tools/dev/hero-bench.mjs out.jpg <model> [model...] (renders them side by side on tools/dev/chars.html)
import http from 'http'; import fs from 'fs'; import path from 'path'; import { chromium } from 'playwright';
const root = process.cwd(); const out = process.argv[2]; const names = process.argv.slice(3);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => { const f = path.join(root, decodeURIComponent(req.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r));
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1600, height: 700 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(`http://localhost:${server.address().port}/tools/dev/chars.html`);
await p.waitForFunction(() => window.ready);
await p.evaluate((n) => window.spawnHero(n, { gap: 2.0, dist: 16 }), names);
await p.waitForTimeout(500); await p.screenshot({ path: out });
await b.close(); server.close();
