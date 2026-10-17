// Builds the comparison sheet in docs/compare/: index.html, sheet.jpg and a
// full-size pair_<key>.jpg per shot (reference(s) left, screenshot right).
// References come from refs/ref_XX.* with their black letterbox bars trimmed;
// screenshots are docs/compare/shot_<key>.jpg from tools/shoot.mjs.
//   node tools/compare.mjs
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

sharp.cache(false);
const OUT = 'docs/compare';
const region = JSON.parse(fs.readFileSync('data/regions/gloaming.json', 'utf8'));
const shots = region.areas.filter((a) => a.shot).sort((a, b) => a.shot.key - b.shot.key);
const refFiles = fs.existsSync('refs') ? fs.readdirSync('refs') : [];
const findRefs = (ref) => (ref.match(/ref_\d+/g) || [])
  .map((id) => refFiles.find((x) => x.toLowerCase().startsWith(id) && /\.(png|jpe?g|webp)$/i.test(x)))
  .filter(Boolean)
  .map((f) => path.join('refs', f));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

// ---------------------------------------------------------------- per-shot pairs (full size)
const PW = 540, PH = 720, GAP = 12;
for (const a of shots) {
  const refs = findRefs(a.ref);
  const shotFile = path.join(OUT, `shot_${a.shot.key}.jpg`);
  if (!fs.existsSync(shotFile)) continue;
  const n = refs.length + 1;
  const comps = [];
  for (const [i, r] of refs.entries()) comps.push({ input: await panel(await loadRef(r), PW, PH), left: i * (PW + GAP), top: 36 });
  comps.push({ input: await panel(fs.readFileSync(shotFile), PW, PH), left: refs.length * (PW + GAP), top: 36 });
  comps.push({ input: text(n * (PW + GAP) - GAP, 36, `${a.shot.key} · ${a.name} — ${a.ref} (left) vs photo mode (right)`, 20), left: 0, top: 0 });
  await sharp({ create: { width: n * (PW + GAP) - GAP, height: PH + 36, channels: 3, background: '#07040f' } })
    .composite(comps).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(OUT, `pair_${a.shot.key}.jpg`));
}

// ---------------------------------------------------------------- sheet: two pairs per row
const W = 300, H = 400, PAD = 16, LABEL = 40;
const pairW = W * 2 + 8;
const cols = 2;
const rowH = H + LABEL + PAD;
const sheetW = PAD + cols * (pairW + PAD), sheetH = 70 + Math.ceil(shots.length / cols) * rowH;
const composites = [{ input: text(sheetW, 56, 'Vaelmoor · the Gloaming — reference (left) vs photo mode (right)', 26, '#f4eaff'), left: PAD, top: 6 }];
for (const [i, a] of shots.entries()) {
  const x = PAD + (i % cols) * (pairW + PAD), y = 70 + Math.floor(i / cols) * rowH;
  composites.push({ input: text(pairW, LABEL, `${a.shot.key} · ${a.name} (${a.ref})`, 18), left: x, top: y });
  const refs = findRefs(a.ref);
  if (refs.length) composites.push({ input: await panel(await loadRef(refs[0]), W, H), left: x, top: y + LABEL });
  const shotFile = path.join(OUT, `shot_${a.shot.key}.jpg`);
  if (fs.existsSync(shotFile)) composites.push({ input: await panel(fs.readFileSync(shotFile), W, H), left: x + W + 8, top: y + LABEL });
}
await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#07040f' } })
  .composite(composites).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(OUT, 'sheet.jpg'));

// ---------------------------------------------------------------- HTML page
const rows = shots.map((a) => {
  const refs = findRefs(a.ref).map((r) => `<img src="../../${r.replace(/\\/g, '/')}" alt="${esc(path.basename(r))}">`).join('');
  return `<section>
    <h2><b>${a.shot.key}</b> ${esc(a.name)} <small>${esc(a.ref)}</small></h2>
    <div class="pair">${refs}<img src="shot_${a.shot.key}.jpg" alt="photo mode ${a.shot.key}"></div>
  </section>`;
}).join('\n');
fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vaelmoor compare sheet</title>
<style>
  body { margin: 0; background: #07040f; color: #efe6ff; font-family: Georgia, serif; }
  main { max-width: 1200px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-weight: normal; letter-spacing: .08em; }
  p.note { color: #b9a8e0; max-width: 70ch; }
  h2 { font-weight: normal; margin: 36px 0 10px; } h2 b { color: #9b6cff; } h2 small { color: #8a7ab0; font-size: .6em; margin-left: .6em; }
  .pair { display: flex; gap: 12px; }
  .pair img { flex: 1; min-width: 0; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 4px; display: block; }
  @media (max-width: 640px) { .pair { flex-direction: column; } }
</style></head>
<body><main>
<h1>Vaelmoor · the Gloaming</h1>
<p class="note">Left: the reference from <code>refs/</code> (letterboxing included here, trimmed in sheet.jpg). Right: the matching photo-mode camera, captured headless by <code>tools/shoot.mjs</code> at the references' portrait aspect. Regenerate with <code>npm run shots</code>.</p>
${rows}
</main></body></html>
`);
console.log(`wrote ${OUT}/sheet.jpg, ${OUT}/index.html and ${shots.length} pair images`);
