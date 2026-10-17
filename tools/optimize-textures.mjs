// Recompresses downloaded CC0 textures in place: roughness maps to 512px,
// colour/normal maps stay 1024px. Keeps the GitHub Pages payload small.
import fs from 'fs';
import sharp from 'sharp';
sharp.cache(false);
const dir = 'assets/textures';
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.jpg'))) {
  const p = `${dir}/${f}`;
  const size = f.includes('_rough') ? 512 : 1024;
  const q = f.includes('_nor') ? 88 : 80;
  const buf = await sharp(fs.readFileSync(p)).resize(size, size, { fit: 'inside' }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
  if (buf.length < fs.statSync(p).size) fs.writeFileSync(p, buf);
}
console.log('done');
