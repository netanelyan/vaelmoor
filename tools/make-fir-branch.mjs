// Builds assets/textures/fir_branch.png from ambientCG LeafSet019 (CC0):
// one fir bough, RGBA, base at the left (u=0) and tip at the right (u=1).
//   node tools/make-fir-branch.mjs <path to LeafSet019_1K-PNG folder>
import fs from 'fs';
import sharp from 'sharp';
sharp.cache(false);
const dir = process.argv[2];
const c = await sharp(fs.readFileSync(`${dir}/LeafSet019_1K-PNG_Color.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const a = await sharp(fs.readFileSync(`${dir}/LeafSet019_1K-PNG_Opacity.png`)).extractChannel(0).raw().toBuffer();
const { width: W, height: H } = c.info;
const px = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) { px[i * 4] = c.data[i * 3]; px[i * 4 + 1] = c.data[i * 3 + 1]; px[i * 4 + 2] = c.data[i * 3 + 2]; px[i * 4 + 3] = a[i]; }
// the largest bough is in the bottom third; in the atlas its base points right
await sharp(px, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left: 0, top: Math.round(H * 0.64), width: W, height: Math.round(H * 0.34) })
  .flop()
  .resize(512, 176, { fit: 'fill' })
  .png({ compressionLevel: 9 })
  .toFile('assets/textures/fir_branch.png');
console.log('ok');
