// Builds the comparison sheet in docs/compare/ for both world layers:
//   index.html   every reference next to its photo-mode screenshot, with rating and notes
//   sheet.jpg    contact sheet (two pairs per row)
//   pair_<realm>_<key>.jpg  full-size pair per shot
// References: refs/ref_XX.* (Gloaming) and refs/dark/dark_XX.* (surface), letterbox trimmed.
// Screenshots: docs/compare/shot_<realm>_<key>.jpg from tools/shoot.mjs.
// Ratings + notes: docs/compare/ratings.json  { "<realm>_<key>": { score, notes } }
//   node tools/compare.mjs
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

sharp.cache(false);
const OUT = 'docs/compare';
const ratingsFile = path.join(OUT, 'ratings.json');
const ratings = fs.existsSync(ratingsFile) ? JSON.parse(fs.readFileSync(ratingsFile, 'utf8')) : {};

const shots = [];
for (const rid of ['surface', 'gloaming']) {
  const region = JSON.parse(fs.readFileSync(`data/regions/${rid}.json`, 'utf8'));
  for (const a of region.areas.filter((x) => x.shot && x.ref).sort((p, q) => p.shot.key - q.shot.key)) {
    const id = `${rid}_${a.shot.key}`;
    shots.push({ ...a, id, realm: rid, rating: ratings[id] });
  }
}

const refDirs = ['refs', 'refs/dark'].filter((d) => fs.existsSync(d));
const findRefs = (ref) => (ref.match(/(ref|dark)_\d+/g) || []).map((id) => {
  for (const d of refDirs) {
    const f = fs.readdirSync(d).find((x) => x.toLowerCase().startsWith(id) && /\.(png|jpe?g|webp)$/i.test(x));
    if (f) return path.join(d, f);
  }
  return null;
}).filter(Boolean);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const layer = (a) => (a.realm === 'surface' ? 'Vaelmoor' : 'Gloaming');
const key = (a) => (a.realm === 'surface' ? `Shift+${a.shot.key}` : String(a.shot.key));
const label = (a) => `${layer(a).toUpperCase()} · ${a.name} (${a.ref})${a.rating ? ` · ${a.rating.score}/10` : ''}`;

/** Load a reference with its black letterbox rows removed. */
async function loadRef(file) {
  const img = sharp(fs.readFileSync(file));
  const { data, info } = await img.clone().raw().toBuffer({ resolveWithObject: true });
  const rowMean = (y) => {
    let s = 0;
    for (let x = 0; x < info.width; x++) for (let c = 0; c < 3; c++) s += data[(y * info.width + x) * info.channels + c];
    return s / (info.width * 3);
  };
  let top = 0, bottom = info.height - 1;
  while (top < info.height / 4 && rowMean(top) < 14) top++;
  while (bottom > info.height * 0.75 && rowMean(bottom) < 14) bottom--;
  return img.extract({ left: 0, top, width: info.width, height: bottom - top + 1 }).toBuffer();
}

const panel = (buf, w, h) => sharp(buf).resize(w, h, { fit: 'cover' }).toBuffer();
const text = (w, h, s, size = 20, color = '#ffffff') => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="4" y="${h - 10}" font-family="Georgia, serif" font-size="${size}" fill="${color}">${esc(s)}</text></svg>`);

// ---------------------------------------------------------------- full-size pairs
const PW = 540, PH = 720, GAP = 12;
for (const a of shots) {
  const refs = findRefs(a.ref);
  const shotFile = path.join(OUT, `shot_${a.id}.jpg`);
  if (!fs.existsSync(shotFile)) continue;
  const n = refs.length + 1;
  const W = n * (PW + GAP) - GAP;
  const comps = [{ input: text(W, 36, `${label(a)} · reference left, photo mode right`, 20), left: 0, top: 0 }];
  for (const [i, r] of refs.entries()) comps.push({ input: await panel(await loadRef(r), PW, PH), left: i * (PW + GAP), top: 36 });
  comps.push({ input: await panel(fs.readFileSync(shotFile), PW, PH), left: refs.length * (PW + GAP), top: 36 });
  await sharp({ create: { width: W, height: PH + 36, channels: 3, background: '#07040f' } })
    .composite(comps).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(OUT, `pair_${a.id}.jpg`));
}

// ---------------------------------------------------------------- contact sheet
const W = 260, H = 347, PAD = 16, LABEL = 34, cols = 3;
const pairW = W * 2 + 6;
const rowH = H + LABEL + PAD;
const sheetW = PAD + cols * (pairW + PAD), sheetH = 70 + Math.ceil(shots.length / cols) * rowH;
const composites = [{ input: text(sheetW - PAD, 56, 'Vaelmoor — reference (left) vs photo mode (right), surface then the Gloaming', 24, '#f4eaff'), left: PAD, top: 6 }];
for (const [i, a] of shots.entries()) {
  const x = PAD + (i % cols) * (pairW + PAD), y = 70 + Math.floor(i / cols) * rowH;
  composites.push({ input: text(pairW, LABEL, label(a), 13), left: x, top: y });
  const refs = findRefs(a.ref);
  if (refs.length) composites.push({ input: await panel(await loadRef(refs[0]), W, H), left: x, top: y + LABEL });
  const shotFile = path.join(OUT, `shot_${a.id}.jpg`);
  if (fs.existsSync(shotFile)) composites.push({ input: await panel(fs.readFileSync(shotFile), W, H), left: x + W + 6, top: y + LABEL });
}
await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#07040f' } })
  .composite(composites).jpeg({ quality: 85, mozjpeg: true }).toFile(path.join(OUT, 'sheet.jpg'));

// ---------------------------------------------------------------- HTML page
const avg = (realm) => {
  const r = shots.filter((s) => s.realm === realm && s.rating);
  return r.length ? (r.reduce((t, s) => t + s.rating.score, 0) / r.length).toFixed(1) : '–';
};
const rows = shots.map((a) => {
  const refs = findRefs(a.ref).map((r) => `<img src="../../${r.replace(/\\/g, '/')}" alt="${esc(path.basename(r))}">`).join('');
  return `<section>
    <h2><b>${layer(a)}</b> ${esc(a.name)} <small>${esc(a.ref)} · photo mode ${key(a)}</small>${a.rating ? ` <span class="score">${a.rating.score}/10</span>` : ''}</h2>
    ${a.rating ? `<p class="diff">${esc(a.rating.notes)}</p>` : ''}
    <div class="pair">${refs}<img src="shot_${a.id}.jpg" alt="photo mode ${esc(a.id)}"></div>
  </section>`;
}).join('\n');
fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vaelmoor compare sheet</title>
<style>
  body { margin: 0; background: #07040f; color: #efe6ff; font-family: Georgia, serif; }
  main { max-width: 1200px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-weight: normal; letter-spacing: .08em; }
  p.note { color: #b9a8e0; max-width: 75ch; }
  h2 { font-weight: normal; margin: 40px 0 6px; } h2 b { color: #9b6cff; font-weight: normal; } h2 small { color: #8a7ab0; font-size: .6em; margin-left: .6em; }
  .score { font-size: .7em; color: #e8e4da; border: 1px solid #6a5a8a; padding: 0 6px; margin-left: .5em; }
  p.diff { color: #b9a8e0; margin: 0 0 10px; max-width: 95ch; line-height: 1.45; }
  .pair { display: flex; gap: 12px; }
  .pair img { flex: 1; min-width: 0; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 4px; display: block; }
  @media (max-width: 640px) { .pair { flex-direction: column; } }
</style></head>
<body><main>
<h1>Vaelmoor · reference vs photo mode</h1>
<p class="note">Left: the reference (refs/dark for the painted surface, refs for the Gloaming). Right: the matching photo-mode camera, captured headless by <code>tools/shoot.mjs</code> at the references' portrait aspect. Scores are 1–10 closeness to the reference; the note says what still differs. Average: surface ${avg('surface')}, Gloaming ${avg('gloaming')}. Regenerate with <code>npm run shots</code>.</p>
${rows}
</main></body></html>
`);
console.log(`wrote ${OUT}/sheet.jpg, ${OUT}/index.html and ${shots.length} pair images`);
