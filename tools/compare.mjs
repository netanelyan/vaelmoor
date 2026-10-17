// Builds the comparison sheet in docs/compare/: index.html and sheet.jpg.
// Each row pairs a reference with the matching photo-mode screenshot
// (docs/compare/shot_<key>.jpg, made by tools/shoot.mjs). If refs/ref_XX.*
// exists the image is used; otherwise the written brief for that shot is shown.
//   node tools/compare.mjs
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

sharp.cache(false);
const OUT = 'docs/compare';
const region = JSON.parse(fs.readFileSync('data/regions/gloaming.json', 'utf8'));
const shots = region.areas.filter((a) => a.shot).sort((a, b) => a.shot.key - b.shot.key);
const refFiles = fs.existsSync('refs') ? fs.readdirSync('refs') : [];
const findRef = (ref) => {
  const ids = ref.match(/ref_\d+/g) || [];
  for (const id of ids) {
    const f = refFiles.find((x) => x.toLowerCase().startsWith(id) && /\.(png|jpe?g|webp)$/i.test(x));
    if (f) return path.join('refs', f);
  }
  return null;
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------- PNG sheet
const W = 640, H = 360, PAD = 24, LABEL = 54;
const rowH = H + LABEL + PAD;
const sheetW = PAD * 3 + W * 2, sheetH = PAD + shots.length * rowH + 60;

function wrap(text, max) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) { lines.push(line.trim()); line = w; } else line += ' ' + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function briefCard(a) {
  const lines = wrap(a.description, 46);
  const tspans = lines.map((l, i) => `<tspan x="40" y="${118 + i * 30}">${esc(l)}</tspan>`).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1040"/><stop offset="1" stop-color="#0a0618"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="12" y="12" width="${W - 24}" height="${H - 24}" fill="none" stroke="#5a3a9a" stroke-dasharray="6 6"/>
    <text x="40" y="66" font-family="Georgia, serif" font-size="22" fill="#d8c8ff">${esc(a.ref)} · written brief (no image in refs/)</text>
    <text font-family="Georgia, serif" font-size="21" fill="#f2ecff">${tspans}</text>
  </svg>`);
}

const composites = [];
const title = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="50"><text x="${PAD}" y="36" font-family="Georgia, serif" font-size="28" fill="#f4eaff">Vaelmoor · the Gloaming — reference vs photo mode</text></svg>`);
composites.push({ input: title, left: 0, top: 8 });
for (const [i, a] of shots.entries()) {
  const top = 60 + i * rowH;
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${LABEL}">
    <text x="${PAD}" y="34" font-family="Georgia, serif" font-size="22" fill="#ffffff">${a.shot.key} · ${esc(a.name)}</text>
    <text x="${PAD * 2 + W}" y="34" font-family="Georgia, serif" font-size="18" fill="#b9a8e0">${esc(a.ref)} · photo mode key ${a.shot.key}</text>
  </svg>`);
  composites.push({ input: label, left: 0, top });
  const ref = findRef(a.ref);
  const left = ref ? await sharp(fs.readFileSync(ref)).resize(W, H, { fit: 'cover' }).toBuffer() : await sharp(briefCard(a)).png().toBuffer();
  composites.push({ input: left, left: PAD, top: top + LABEL });
  const shotFile = path.join(OUT, `shot_${a.shot.key}.jpg`);
  if (fs.existsSync(shotFile)) composites.push({ input: await sharp(fs.readFileSync(shotFile)).resize(W, H, { fit: 'cover' }).toBuffer(), left: PAD * 2 + W, top: top + LABEL });
}
await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#07040f' } })
  .composite(composites).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(OUT, 'sheet.jpg'));

// ---------------------------------------------------------------- HTML page
const rows = shots.map((a) => {
  const ref = findRef(a.ref);
  const left = ref
    ? `<img src="../../${ref.replace(/\\/g, '/')}" alt="${esc(a.ref)}">`
    : `<div class="brief"><span>${esc(a.ref)} · written brief</span><p>${esc(a.description)}</p></div>`;
  return `<section>
    <h2><b>${a.shot.key}</b> ${esc(a.name)} <small>${esc(a.ref)}</small></h2>
    <div class="pair">${left}<img src="shot_${a.shot.key}.jpg" alt="photo mode ${a.shot.key}"></div>
  </section>`;
}).join('\n');
fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vaelmoor compare sheet</title>
<style>
  body { margin: 0; background: #07040f; color: #efe6ff; font-family: Georgia, serif; }
  main { max-width: 1320px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-weight: normal; letter-spacing: .08em; }
  p.note { color: #b9a8e0; max-width: 70ch; }
  h2 { font-weight: normal; margin: 36px 0 10px; } h2 b { color: #9b6cff; } h2 small { color: #8a7ab0; font-size: .6em; margin-left: .6em; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .pair img, .brief { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 4px; display: block; }
  .brief { box-sizing: border-box; padding: 6% 7%; background: linear-gradient(#1c1040, #0a0618); border: 1px dashed #5a3a9a; font-size: clamp(14px, 1.6vw, 20px); line-height: 1.5; }
  .brief span { color: #b9a8e0; font-size: .8em; }
  @media (max-width: 760px) { .pair { grid-template-columns: 1fr; } }
</style></head>
<body><main>
<h1>Vaelmoor · the Gloaming</h1>
<p class="note">Left: the reference (the written brief where no image exists in <code>refs/</code>). Right: the matching photo-mode camera, captured headless by <code>tools/shoot.mjs</code>. Regenerate with <code>npm run shots &amp;&amp; node tools/compare.mjs</code>.</p>
${rows}
</main></body></html>
`);
console.log(`wrote ${OUT}/sheet.jpg (${sheetW}x${sheetH}) and ${OUT}/index.html with ${shots.length} rows`);
