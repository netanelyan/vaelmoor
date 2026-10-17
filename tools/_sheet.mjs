// node tools/_sheet.mjs out.jpg h file...   (contact sheet, each scaled to height h)
import sharp from 'sharp';
const [out, h, ...files] = process.argv.slice(2);
const imgs = [];
let x = 0;
for (const f of files) {
  const b = await sharp(f).resize({ height: +h }).toBuffer({ resolveWithObject: true });
  imgs.push({ input: b.data, left: x, top: 0 });
  x += b.info.width + 6;
}
await sharp({ create: { width: x, height: +h, channels: 3, background: '#000' } }).composite(imgs).jpeg({ quality: 85 }).toFile(out);
