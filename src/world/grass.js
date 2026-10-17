import * as THREE from 'three';
import { mulberry32, smoothstep } from '../engine/noise.js';
import { shared } from '../render/materials.js';

// One-draw-call grass field that travels with the camera: clumps live in a
// tile that wraps around the viewer in the vertex shader; terrain height,
// grass density and tint come from textures baked from the terrain grid.

const TILE = 60;       // metres covered around the camera
const SPACING = 0.42;  // clump spacing

function clumpGeometry() {
  // 4 curved, tapered blades, each 3 segments tall
  const pos = [], nrm = [], hgt = [];
  const rand = mulberry32(17);
  for (let b = 0; b < 6; b++) {
    const a = rand() * Math.PI;
    const ox = (rand() - 0.5) * 0.25, oz = (rand() - 0.5) * 0.25;
    const h = 0.22 + rand() * 0.32, w = 0.02 + rand() * 0.016, lean = (rand() - 0.5) * 0.5;
    const ca = Math.cos(a), sa = Math.sin(a);
    const pts = [];
    for (let s = 0; s <= 2; s++) {
      const t = s / 2;
      const ww = w * (1 - t * 0.9);
      const y = h * t;
      const bend = lean * t * t;
      pts.push([ox - ca * ww + bend * sa, y, oz - sa * ww + bend * ca, t]);
      pts.push([ox + ca * ww + bend * sa, y, oz + sa * ww + bend * ca, t]);
    }
    for (let s = 0; s < 2; s++) {
      const q = [pts[s * 2], pts[s * 2 + 1], pts[s * 2 + 2], pts[s * 2 + 3]];
      for (const k of [0, 1, 2, 1, 3, 2]) {
        pos.push(q[k][0], q[k][1], q[k][2]);
        // normals point mostly up so grass shades like the ground under it
        nrm.push(sa * 0.3, 0.9, -ca * 0.3);
        hgt.push(q[k][3]);
      }
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('bladeT', new THREE.Float32BufferAttribute(hgt, 1));
  return g;
}

export function buildGrass(world, region) {
  const { terrain, road } = world;
  const n = terrain.n;
  // --- baked height (half float) and density/tint (rgba8) maps
  const height = new Uint16Array(n * n);
  for (let i = 0; i < n * n; i++) height[i] = THREE.DataUtils.toHalfFloat(terrain.heights[i]);
  const heightTex = new THREE.DataTexture(height, n, n, THREE.RedFormat, THREE.HalfFloatType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;

  const dens = new Uint8Array(n * n * 4);
  const areas = region.areas.map((a) => ({
    x: a.center[0], z: a.center[1], reach: (a.reach ?? 70) * 0.9,
    grass: a.ground?.grass ?? region.grass?.density ?? 0.6,
    tint: new THREE.Color(a.ground?.grassTint ?? a.ground?.tint ?? '#2c3a2c'),
  }));
  const c = new THREE.Color();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = terrain.minX + i * terrain.cellSize, z = terrain.minZ + j * terrain.cellSize;
      let tw = 0, g = 0;
      c.setRGB(0, 0, 0);
      for (const a of areas) {
        const d = Math.hypot(x - a.x, z - a.z) / a.reach;
        const w = Math.exp(-d * d * 1.4) + 1e-4;
        g += a.grass * w;
        c.r += a.tint.r * w; c.g += a.tint.g * w; c.b += a.tint.b * w;
        tw += w;
      }
      g /= tw; c.r /= tw; c.g /= tw; c.b /= tw;
      const rd = road.distance(x, z);
      g *= smoothstep(road.half + 0.2, road.half + 2.2, rd);
      g *= 1 - smoothstep(0.2, 0.55, terrain.rock[j * n + i]);
      if (terrain.waterLevel(x, z) > terrain.heights[j * n + i] - 0.2) g = 0;
      const k = (j * n + i) * 4;
      dens[k] = Math.round(Math.min(1, g) * 255);
      // tint stored in sRGB-ish gamma for precision in the darks
      dens[k + 1] = Math.round(Math.sqrt(Math.min(1, c.r)) * 255);
      dens[k + 2] = Math.round(Math.sqrt(Math.min(1, c.g)) * 255);
      dens[k + 3] = Math.round(Math.sqrt(Math.min(1, c.b)) * 255);
    }
  }
  const densTex = new THREE.DataTexture(dens, n, n, THREE.RGBAFormat);
  densTex.magFilter = densTex.minFilter = THREE.LinearFilter;
  densTex.needsUpdate = true;

  // --- instances: jittered grid over one tile
  const geo = clumpGeometry();
  const count = Math.floor(TILE / SPACING) ** 2;
  const off = new Float32Array(count * 4);
  const rand = mulberry32(23);
  let k = 0;
  const side = Math.floor(TILE / SPACING);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      off[k++] = (i + rand()) * SPACING;
      off[k++] = (j + rand()) * SPACING;
      off[k++] = rand();                 // keep threshold
      off[k++] = rand() * Math.PI * 2;   // rotation
    }
  }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  geo.instanceCount = count;

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, side: THREE.DoubleSide, envMapIntensity: 0.0 });
  const T = (terrain.n - 1) * terrain.cellSize;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      heightTex: { value: heightTex }, densTex: { value: densTex },
      terrainMin: { value: new THREE.Vector2(terrain.minX, terrain.minZ) },
      terrainSize: { value: T }, uTime: shared.time, rimColor: shared.rimColor, rimStrength: shared.rimStrength,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */`#include <common>
        attribute vec4 aOff;
        attribute float bladeT;
        uniform sampler2D heightTex;
        uniform sampler2D densTex;
        uniform vec2 terrainMin;
        uniform float terrainSize;
        uniform float uTime;
        varying vec3 vGrassTint;
        varying float vBladeT;`)
      .replace('#include <begin_vertex>', /* glsl */`
        vec2 camXZ = cameraPosition.xz;
        vec2 wp = camXZ + mod(aOff.xy - camXZ + ${(TILE / 2).toFixed(1)}, ${TILE.toFixed(1)}) - ${(TILE / 2).toFixed(1)};
        vec2 huv = (wp - terrainMin) / terrainSize;
        huv = (huv * ${(terrain.n - 1).toFixed(1)} + 0.5) / ${terrain.n.toFixed(1)};
        float gy = texture2D(heightTex, huv).r;
        vec4 dn = texture2D(densTex, huv);
        float keep = step(aOff.z, dn.r * 1.05 - 0.03);
        float dist = length(wp - camXZ);
        float fade = 1.0 - smoothstep(${(TILE * 0.3).toFixed(1)}, ${(TILE * 0.49).toFixed(1)}, dist);
        float s = keep * fade * (0.75 + 0.5 * fract(aOff.z * 13.7)) * (0.55 + 0.6 * dn.r);
        float cr = cos(aOff.w), sr = sin(aOff.w);
        vec3 transformed = vec3(position.x * cr - position.z * sr, position.y, position.x * sr + position.z * cr) * s;
        float sway = sin(uTime * 1.7 + wp.x * 0.35 + wp.y * 0.21) * 0.6 + sin(uTime * 3.1 + wp.x * 0.9) * 0.2;
        transformed.x += sway * 0.12 * bladeT * bladeT * s;
        transformed.z += cos(uTime * 1.3 + wp.y * 0.3) * 0.06 * bladeT * bladeT * s;
        transformed += vec3(wp.x, gy - 0.03, wp.y);
        vGrassTint = dn.gba * dn.gba;
        vBladeT = bladeT;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(normal.x * cos(aOff.w) - normal.z * sin(aOff.w), normal.y, normal.x * sin(aOff.w) + normal.z * cos(aOff.w));');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrassTint;\nvarying float vBladeT;\nuniform vec3 rimColor;\nuniform float rimStrength;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vGrassTint * mix(0.35, 1.6, vBladeT);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += rimColor * rimStrength * 0.07 * vBladeT * vBladeT;');
  };
  mat.customProgramCacheKey = () => 'grass-field';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.name = 'grass';
  return mesh;
}
