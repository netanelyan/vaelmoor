// Builds assets/textures/oak_leaf_clump.png from ambientCG LeafSet016 (CC0):
// many real oak leaves, rotated and scaled, packed into one round clump card.
//   node tools/make-leaf-clump.mjs <path to LeafSet016_1K-PNG folder>
import fs from 'fs';
import sharp from 'sharp';
sharp.cache(false);
const dir = process.argv[2];
const color = fs.readFileSync(`${dir}/LeafSet016_1K-PNG_Color.png`);
const alpha = fs.readFileSync(`${dir}/LeafSet016_1K-PNG_Opacity.png`);
// build RGBA explicitly from raw pixels (colour RGB + opacity map as alpha)
const c = await sharp(color).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const a = await sharp(alpha).extractChannel(0).raw().toBuffer();
const px = Buffer.alloc(c.info.width * c.info.height * 4);
for (let i = 0; i < c.info.width * c.info.height; i++) { px[i * 4] = c.data[i * 3]; px[i * 4 + 1] = c.data[i * 3 + 1]; px[i * 4 + 2] = c.data[i * 3 + 2]; px[i * 4 + 3] = a[i]; }
const rgba = await sharp(px, { raw: { width: c.info.width, height: c.info.height, channels: 4 } }).png().toBuffer();
// the atlas is a 3x2 grid of leaves
const meta = await sharp(rgba).metadata();
const cw = Math.floor(meta.width / 3), ch = Math.floor(meta.height / 2);
const leaves = [];
for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) leaves.push(await sharp(rgba).extract({ left: c * cw, top: r * ch, width: cw, height: ch }).png().toBuffer());
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const S = 512, comps = [];
for (let i = 0; i < 46; i++) {
  const rr = Math.sqrt(rand()) * S * 0.36, a = rand() * Math.PI * 2;
  const size = Math.round(S * (0.16 + rand() * 0.1));
  
  const leaf = await sharp(leaves[Math.floor(rand() * 6)])
    .resize(size, size, { fit: 'inside' })
    .rotate(Math.round(rand() * 360), { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  const m = await sharp(leaf).metadata();
  comps.push({ input: leaf, left: Math.round(S / 2 + Math.cos(a) * rr - m.width / 2), top: Math.round(S / 2 + Math.sin(a) * rr - m.height / 2) });
}
const valid = comps.filter((c) => c.left >= 0 && c.top >= 0);
await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(valid).png({ compressionLevel: 9 }).toFile('assets/textures/oak_leaf_clump.png');
console.log(`clump: ${valid.length} leaves`);
