// Copies the parts of three.js we use from node_modules into vendor/three,
// so the game runs with no build step and no CDN (GitHub Pages friendly).
// Follows relative imports so every copied module's dependencies come along.
import fs from 'fs';
import path from 'path';

const SRC = 'node_modules/three';
const DST = 'vendor/three';
const entries = [
  'build/three.module.js',
  'build/three.core.js',
  'examples/jsm/postprocessing/EffectComposer.js',
  'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js',
  'examples/jsm/postprocessing/ShaderPass.js',
  'examples/jsm/postprocessing/OutputPass.js',
  'examples/jsm/objects/Water.js',
  'examples/jsm/loaders/GLTFLoader.js',
  'examples/jsm/utils/BufferGeometryUtils.js',
  'examples/jsm/controls/PointerLockControls.js',
  'examples/jsm/math/SimplexNoise.js',
];

const seen = new Set();
function copy(rel) {
  if (seen.has(rel)) return;
  seen.add(rel);
  const src = path.join(SRC, rel);
  const code = fs.readFileSync(src, 'utf8');
  fs.mkdirSync(path.dirname(path.join(DST, rel)), { recursive: true });
  fs.writeFileSync(path.join(DST, rel), code);
  for (const m of code.matchAll(/(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    copy(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
  }
}
fs.rmSync(DST, { recursive: true, force: true });
entries.forEach(copy);
fs.copyFileSync(path.join(SRC, 'LICENSE'), path.join(DST, 'LICENSE'));
console.log(`vendored ${seen.size} files into ${DST}`);
