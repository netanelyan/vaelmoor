import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../engine/noise.js';
import { stylize } from '../render/materials.js';

// Raised flagstone causeway (ref_02): big glossy irregular flagstones whose
// tops shimmer orange / pink / teal, chunky stone curbs along both edges and
// dark water channels outside them. Built straight along local +Z and draped
// over the ground (heights sampled in world space).

export function causeway(ctx, p, at) {
  const L = p.length ?? 100, W = p.width ?? 6.5, rise = p.rise ?? 0.35;
  const chan = p.channel ?? 2.6;
  const rot = ((p.rot ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const base = ctx.groundAt(at.x, at.z);
  const gy = (lx, lz) => ctx.terrain.heightAt(at.x + lx * cos + lz * sin, at.z - lx * sin + lz * cos) - base;
  // ground along the centre line, smoothed so the causeway is a calm ramp
  const N = Math.ceil(L) + 1;
  const ys = new Float32Array(N);
  for (let i = 0; i < N; i++) ys[i] = Math.max(gy(-W / 2, i - L / 2), gy(0, i - L / 2), gy(W / 2, i - L / 2));
  const sm = ys.map((_, i) => { let s = 0, n = 0; for (let k = -4; k <= 4; k++) { const j = Math.min(N - 1, Math.max(0, i + k)); s += ys[j]; n++; } return s / n; });
  const yAt = (z) => { const f = Math.min(N - 1.001, Math.max(0, z + L / 2)); const i = Math.floor(f); return sm[i] + (sm[i + 1] - sm[i]) * (f - i); };

  const strip = (x0, x1, yOff, uvScale, hAt = yAt) => {
    const g = new THREE.PlaneGeometry(x1 - x0, L, 1, N - 1);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (x0 + x1) / 2, z = pos.getZ(i);
      pos.setXYZ(i, x, hAt(z) + yOff, z);
      uv.setXY(i, x / uvScale, z / uvScale);
    }
    g.computeVertexNormals();
    return g;
  };

  const group = new THREE.Group();
  // --- flagstone top
  const t = ctx.assets.pbr(p.texture ?? 'grey_stone_path', [1, 1]);
  const top = new THREE.MeshPhysicalMaterial({
    ...t, color: p.color ?? '#e8b494', roughness: p.roughness ?? 0.42, envMapIntensity: p.env ?? 0.7, normalScale: new THREE.Vector2(1.8, 1.8),
    clearcoat: p.clearcoat ?? 0.7, clearcoatRoughness: 0.2, clearcoatNormalMap: t.normalMap, clearcoatNormalScale: new THREE.Vector2(0.8, 0.8),
    iridescence: p.iridescence ?? 0.35, iridescenceIOR: 1.4, iridescenceThicknessRange: [150, 800],
  });
  // per-stone hue drift + thin-film shimmer toward grazing angles
  top.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
        {
          vec2 q = vMapUv * 1.7;
          float n = sin(q.x * 2.1 + sin(q.y * 1.3) * 2.0) * 0.5 + sin(q.y * 1.7 - q.x * 0.9) * 0.5;
          vec3 warm = mix(vec3(1.15, 0.72, 0.5), vec3(1.05, 0.6, 0.8), smoothstep(-0.6, 0.6, n));
          vec3 cool = vec3(0.55, 0.85, 0.95);
          diffuseColor.rgb *= mix(warm, cool, smoothstep(0.6, 0.95, n) * 0.3);
          // dark grout lines: each flagstone reads as its own slab
          float lumS = dot(texture2D(map, vMapUv).rgb, vec3(0.333));
          // the texture is dark (linear mean ~0.09): normalise it, keep some detail, darken grout
          diffuseColor.rgb *= pow(0.09 / max(lumS, 0.02), 0.65) * mix(0.15, 1.0, smoothstep(0.03, 0.075, lumS)) * ${(p.boost ?? 1).toFixed(2)};
        }`)
      .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
        {
          vec3 stone = texture2D(map, vMapUv).rgb;
          float topw = smoothstep(0.05, 0.1, dot(stone, vec3(0.333)));
          float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
          float fr = pow(1.0 - ndv, 2.2);
          float ph = fr * 1.1 + stone.r * 1.6 + vMapUv.x * 0.2;
          vec3 film = 0.5 + 0.5 * cos(6.2831 * (ph + vec3(0.0, 0.33, 0.67)));
          totalEmissiveRadiance += film * film * topw * fr * ${(p.film ?? 0.55).toFixed(2)};
        }`);
  };
  stylize(top, { rim: 0.1 });
  const topMesh = new THREE.Mesh(strip(-W / 2, W / 2, rise, p.tile ?? 4.2), top);
  topMesh.receiveShadow = true;
  group.add(topMesh);

  // --- curb blocks (irregular, chunky)
  const rand = mulberry32(p.seed ?? 7);
  const curbGeos = [];
  for (const side of [-1, 1]) {
    let z = -L / 2;
    while (z < L / 2) {
      const len = 2.4 + rand() * 0.8, h = 0.8 + rand() * 0.04, w = 0.95;
      const zc = Math.min(L / 2, z + len / 2);
      const b = new THREE.BoxGeometry(w, h, len - 0.08, 2, 1, 2);
      // chip the corners a little
      const bp = b.attributes.position;
      for (let i = 0; i < bp.count; i++) if (bp.getY(i) > 0 && Math.abs(bp.getX(i)) > 0.3) bp.setY(i, bp.getY(i) - 0.06); // bevelled top edges
      b.rotateY((rand() - 0.5) * 0.03);
      b.translate(side * (W / 2 + w / 2 - 0.1), yAt(zc) + h / 2 - 0.2, zc);
      curbGeos.push(b.toNonIndexed());
      z += len;
    }
  }
  const cg = mergeGeometries(curbGeos);
  // box-projected world UVs
  const cp = cg.attributes.position, cn = cg.attributes.normal;
  const cuv = new Float32Array(cp.count * 2);
  for (let i = 0; i < cp.count; i++) {
    const ax = Math.abs(cn.getX(i)), ay = Math.abs(cn.getY(i));
    const [u, v] = ay > 0.6 ? [cp.getX(i), cp.getZ(i)] : ax > 0.6 ? [cp.getZ(i), cp.getY(i)] : [cp.getX(i), cp.getY(i)];
    cuv[i * 2] = u / 1.6; cuv[i * 2 + 1] = v / 1.6;
  }
  cg.setAttribute('uv', new THREE.BufferAttribute(cuv, 2));
  const ct = ctx.assets.pbr('rock_wall_10', [1, 1]);
  const curbMat = stylize(new THREE.MeshPhysicalMaterial({ normalMap: ct.normalMap, normalScale: new THREE.Vector2(0.35, 0.35), color: p.curbColor ?? '#9a8cb8', roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.4, envMapIntensity: 0.7 }), { rim: 0.3 });
  const curbs = new THREE.Mesh(cg, curbMat);
  curbs.castShadow = curbs.receiveShadow = true;
  group.add(curbs);

  // --- dark glossy water channels outside the curbs
  const wn = ctx.assets.texture('assets/textures/waternormals.jpg').clone();
  wn.repeat.set(1, 1);
  const water = new THREE.MeshPhysicalMaterial({
    color: p.water ?? '#0c1a60', roughness: 0.08, metalness: 0.0, normalMap: wn, normalScale: new THREE.Vector2(0.5, 0.5),
    clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.7,
  });
  stylize(water, { rim: 0.4 });
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -W / 2 - 0.8 - chan : W / 2 + 0.8, x1 = x0 + chan;
    // the channel's own ground (highest point across it), smoothed, so the water never dips under the terrain
    const hs = new Float32Array(N);
    for (let i = 0; i < N; i++) { let m = -Infinity; for (let k = 0; k <= 4; k++) m = Math.max(m, gy(x0 + (x1 - x0) * k / 4, i - L / 2)); hs[i] = m; }
    const hsm = hs.map((_, i) => { let s = -Infinity; for (let k = -2; k <= 2; k++) s = Math.max(s, hs[Math.min(N - 1, Math.max(0, i + k))]); return s; });
    const hAt = (z) => { const f = Math.min(N - 1.001, Math.max(0, z + L / 2)); const i = Math.floor(f); return hsm[i] + (hsm[i + 1] - hsm[i]) * (f - i); };
    const m = new THREE.Mesh(strip(x0, x1, p.waterY ?? 0.06, 6, hAt), water);
    m.receiveShadow = true;
    group.add(m);
  }
  // the object is placed by world.js with rot applied; heights were sampled with it
  const update = (dt, time) => { wn.offset.set(time * 0.01, time * 0.02); };
  const colliders = [];
  for (let z = -L / 2; z < L / 2; z += 2) for (const side of [-1, 1]) colliders.push({ x: side * (W / 2 + 0.4), z, r: 0.45 });
  // a gap in the curbs is not needed: the causeway is walked lengthwise
  return { object: group, colliders, update };
}
