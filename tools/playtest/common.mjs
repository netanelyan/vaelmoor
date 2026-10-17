// Shared harness for the scripted playtests (tools/playtest/stepN.mjs):
// serves the repo, opens the game headless on the GPU, collects console
// errors, and offers helpers to stand in front of things and press keys.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

export async function launch({ query = 'play', out, size = [1280, 720] }) {
  const root = process.cwd();
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
  const errors = [];
  page.on('console', (m) => { if (m.text().includes('X4122')) return; if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  fs.mkdirSync(out, { recursive: true });
  await page.goto(`http://localhost:${server.address().port}/?${query}&quality=1`);
  await page.waitForFunction(() => window.vaelmoor?.ready, null, { timeout: 90000 });
  await page.evaluate(() => {
    const v = window.vaelmoor;
    v.input.locked = true; // headless has no pointer lock: pretend we hold it
    v.input.requestLock = () => {};
    // test helpers in the page
    window.T = {
      target(id) { return v.world.interactables.list.find((i) => i.id === id); },
      /** stand `dist` m from a target (or [x, y, z]) and look at it */
      face(id, dist = 1.8, side = 0) {
        const t = Array.isArray(id) ? { pos: { x: id[0], y: id[1], z: id[2] } } : this.target(id);
        if (!t) throw new Error(`no target ${id}`);
        const p = t.pos;
        const a = Math.atan2(v.player.pos.x - p.x, v.player.pos.z - p.z) + side;
        const x = p.x + Math.sin(a) * dist, z = p.z + Math.cos(a) * dist;
        const yaw = Math.atan2(-(p.x - x), -(p.z - z));
        v.player.teleport(x, z, yaw, 0);
        const eye = v.player.pos.y + 1.7;
        v.player.pitch = Math.atan2(p.y - eye, dist);
        v.player.applyCamera(0);
        v.camera.updateMatrixWorld();
        v.ui.target = v.world.interactables.target(v.camera);
      },
      state() { return v.ui.state; },
    };
  });
  const shot = async (name) => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 85 }); };
  const press = async (key, wait = 120) => { await page.keyboard.press(key); await page.waitForTimeout(wait); };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const fps = async (seconds = 4) => ev(async (s) => {
    const out = [];
    for (let i = 0; i < s * 2; i++) { await new Promise((r) => setTimeout(r, 500)); out.push(window.vaelmoor.fps); }
    return { avg: +(out.reduce((a, b) => a + b, 0) / out.length).toFixed(1), min: Math.round(Math.min(...out)) };
  }, seconds);
  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
  const finish = async () => {
    const uniq = [...new Set(errors)];
    console.log(uniq.length ? `\nconsole: ${uniq.length} messages\n  ${uniq.slice(0, 20).join('\n  ')}` : '\nconsole: clean');
    const failed = results.filter((r) => !r.ok).length;
    console.log(`${results.length - failed}/${results.length} checks passed`);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, console: uniq }, null, 2));
    await browser.close();
    server.close();
    return { failed, errors: uniq };
  };
  return { page, shot, press, ev, fps, check, finish, errors };
}
