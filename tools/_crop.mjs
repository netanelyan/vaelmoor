// node tools/_crop.mjs in.png out.png left top width height [scale]
import sharp from 'sharp';
const [i, o, l, t, w, h, s = 2] = process.argv.slice(2);
await sharp(i).extract({ left: +l, top: +t, width: +w, height: +h }).resize(Math.round(w * s)).toFile(o);
