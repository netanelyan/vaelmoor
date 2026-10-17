import * as THREE from 'three';
import { Noise2D, smoothstep, lerp } from '../engine/noise.js';
import { stylize } from '../render/materials.js';

// Heightfield terrain built from region JSON:
//  - rolling fbm hills, rising away from the road so the road runs in valleys
//  - features: flatten / hill / lake / cliffs / mound (see data/regions/*.json)
//  - the road corridor is flattened onto the road's smoothed height profile
// Vertex colours carry the per-area ground tint; an attribute carries the
// rock amount (slope + cliff features) blended in the fragment shader.

export class Terrain {
  constructor(def, road, areas) {
    this.def = def;
    this.size = def.size;
    this.cellSize = def.cell;
    this.minX = def.center[0] - this.size / 2;
    this.minZ = def.center[1] - this.size / 2;
    this.noise = new Noise2D(def.seed ?? 7);
    this.road = road;
    this.areas = areas;
    this.features = (def.features || []).map((f) => ({ ...f }));
    for (const f of this.features) {
      if (f.type === 'lake' || f.type === 'flatten') {
        f.cosR = Math.cos(((f.rotation || 0) * Math.PI) / 180);
        f.sinR = Math.sin(((f.rotation || 0) * Math.PI) / 180);
      }
    }
    // flatten/mound without an absolute height: natural ground there + raise
    for (const f of this.features) {
      if ((f.type === 'flatten' || f.type === 'mound') && f.height === undefined) {
        f.height = this.baseHeight(f.at[0], f.at[1]) + (f.raise ?? 0);
      }
      if (f.type === 'lake' && f.level === undefined) f.level = this.baseHeight(f.at[0], f.at[1]) - (f.drop ?? 2.5);
    }
    // Road heights come from the terrain without the road flattening.
    road.setHeights((x, z) => this.naturalHeight(x, z, true));
    this.buildGrid();
  }

  /** Rolling hills + valleys around the road, before any feature. */
  baseHeight(x, z, rd = this.road.distance(x, z)) {
    const N = this.noise;
    const d = this.def;
    let h = N.fbm(x * 0.0045, z * 0.0045, 4) * d.baseAmp + N.fbm(x * 0.03, z * 0.03, 3) * d.detailAmp;
    const rise = smoothstep(d.valleyWidth, d.valleyWidth + d.valleyRise, rd);
    h += rise * d.ridgeAmp * (0.55 + 0.45 * (N.fbm(x * 0.01 + 40, z * 0.01, 3) * 0.5 + 0.5));
    return h;
  }

  /** Terrain before road flattening. `forRoad` skips lakes so the road never dips into one. */
  naturalHeight(x, z, forRoad = false) {
    const N = this.noise;
    const rd = this.road.distance(x, z);
    let h = this.baseHeight(x, z, rd);
    let rockBoost = 0;

    for (const f of this.features) {
      const dx = f.at ? x - f.at[0] : 0, dz = f.at ? z - f.at[1] : 0;
      switch (f.type) {
        case 'flatten': {
          const r = Math.hypot(dx, dz);
          const w = 1 - smoothstep(f.radius, f.radius + (f.blend ?? 20), r);
          h = lerp(h, f.height, w);
          break;
        }
        case 'hill': {
          const r = Math.hypot(dx, dz) / f.radius;
          h += f.height * Math.exp(-r * r * 2.2);
          break;
        }
        case 'lake': {
          if (forRoad) break;
          const lx = (dx * f.cosR + dz * f.sinR) / f.radii[0];
          const lz = (-dx * f.sinR + dz * f.cosR) / f.radii[1];
          const wob = 1 + 0.12 * N.noise(x * 0.04, z * 0.04);
          const r = Math.hypot(lx, lz) / wob;
          const shore = 1 - smoothstep(0.85, 1.25, r);
          const bed = f.level - f.depth * (1 - smoothstep(0.0, 1.0, r));
          h = lerp(h, Math.min(h, bed), shore);
          if (r < 1.0) h = Math.min(h, f.level - 0.4 - f.depth * 0.5 * (1 - r));
          break;
        }
        case 'cliffs': {
          // walls rising either side of a stretch of road
          const r = Math.hypot(dx, dz);
          if (r > f.radius + 40) break;
          const inside = 1 - smoothstep(f.radius, f.radius + 40, r);
          const jag = 0.6 + 0.4 * (N.fbm(x * 0.06, z * 0.06, 3) * 0.5 + 0.5);
          const wall = smoothstep(f.gap, f.gap + f.steep, rd);
          h += wall * f.height * jag * inside;
          rockBoost = Math.max(rockBoost, wall * inside);
          break;
        }
        case 'trench': {
          // ramp cut into the ground from 'from' (surface) down to 'to' (depth)
          const [ax, az] = f.from, [bx, bz] = f.to;
          const sx = bx - ax, sz = bz - az, L2 = sx * sx + sz * sz;
          const t = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / L2));
          const d = Math.hypot(x - (ax + sx * t), z - (az + sz * t));
          const inside = 1 - smoothstep(f.width / 2, f.width / 2 + 0.6, d);
          const extend = ((x - ax) * sx + (z - az) * sz) / L2;
          if (extend < -0.05 || extend > 1.15) break;
          h -= f.depth * Math.min(1, Math.max(0, extend)) * inside;
          break;
        }
        case 'mound': {
          const r = Math.hypot(dx, dz);
          const w = 1 - smoothstep(f.radius * 0.6, f.radius, r);
          h = lerp(h, Math.max(h, f.height), w);
          break;
        }
      }
    }
    this._rock = rockBoost;
    return h;
  }

  /** Lake surface height at (x, z), or -Infinity outside every lake. */
  waterLevel(x, z) {
    for (const f of this.features) {
      if (f.type !== 'lake') continue;
      const dx = f.at ? x - f.at[0] : 0, dz = f.at ? z - f.at[1] : 0;
      const lx = (dx * f.cosR + dz * f.sinR) / f.radii[0];
      const lz = (-dx * f.sinR + dz * f.cosR) / f.radii[1];
      if (Math.hypot(lx, lz) < 1.3) return f.level;
    }
    return -Infinity;
  }

  height(x, z) {
    let h = this.naturalHeight(x, z);
    const near = this.road.distance(x, z);
    if (near < this.road.half + 14) {
      const { i } = this.road.nearest(x, z);
      if (i >= 0) {
        const w = 1 - smoothstep(this.road.half + 0.6, this.road.half + 9, near);
        h = lerp(h, this.road.y[i] - 0.1, w);
      }
    }
    return h;
  }

  buildGrid() {
    const n = Math.round(this.size / this.cellSize) + 1;
    this.n = n;
    this.heights = new Float32Array(n * n);
    this.rock = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = this.minX + i * this.cellSize, z = this.minZ + j * this.cellSize;
        this.heights[j * n + i] = this.height(x, z);
        this.rock[j * n + i] = this._rock;
      }
    }
  }

  /** Bilinear height lookup from the grid (matches the rendered mesh closely). */
  heightAt(x, z) {
    const n = this.n;
    const fx = Math.min(n - 1.0001, Math.max(0, (x - this.minX) / this.cellSize));
    const fz = Math.min(n - 1.0001, Math.max(0, (z - this.minZ) / this.cellSize));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const H = this.heights;
    const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = this.cellSize;
    return out.set(this.heightAt(x - e, z) - this.heightAt(x + e, z), 2 * e, this.heightAt(x, z - e) - this.heightAt(x, z + e)).normalize();
  }

  buildMesh(assets, tintAt) {
    const n = this.n;
    const geo = new THREE.PlaneGeometry(this.size, this.size, n - 1, n - 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(this.minX + this.size / 2, 0, this.minZ + this.size / 2);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const colors = new Float32Array(pos.count * 3);
    const rockAttr = new Float32Array(pos.count);
    const tmp = new THREE.Color();
    // PlaneGeometry rows run along +Z after rotation, matching our grid order.
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const i = Math.round((x - this.minX) / this.cellSize);
      const j = Math.round((z - this.minZ) / this.cellSize);
      pos.setY(k, this.heights[j * n + i]);
      uv.setXY(k, x / 4, z / 4);
      tintAt(x, z, tmp);
      const v = 0.85 + 0.3 * (this.noise.fbm(x * 0.05, z * 0.05, 2) * 0.5 + 0.5);
      colors[k * 3] = tmp.r * v; colors[k * 3 + 1] = tmp.g * v; colors[k * 3 + 2] = tmp.b * v;
      rockAttr[k] = this.rock[j * n + i];
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    for (let k = 0; k < pos.count; k++) {
      const slope = 1 - nrm.getY(k);
      rockAttr[k] = Math.min(1, Math.max(rockAttr[k], smoothstep(0.2, 0.42, slope)));
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aRock', new THREE.BufferAttribute(rockAttr, 1));
    // snow cover from 'snow' features (rock faces stay mostly bare)
    const snowAttr = new Float32Array(pos.count);
    const snows = this.features.filter((f) => f.type === 'snow');
    if (snows.length) {
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k), z = pos.getZ(k);
        let w = 0;
        for (const f of snows) w = Math.max(w, 1 - smoothstep(f.radius, f.radius + (f.blend ?? 25), Math.hypot(x - f.at[0], z - f.at[1])));
        w *= 0.85 + 0.15 * this.noise.fbm(x * 0.08, z * 0.08, 2);
        snowAttr[k] = w * (1 - 0.55 * rockAttr[k]);
      }
    }
    geo.setAttribute('aSnow', new THREE.BufferAttribute(snowAttr, 1));

    const grass = assets.pbr(this.def.groundTexture || 'leafy_grass', [1, 1]);
    const rock = assets.pbr(this.def.rockTexture || 'rock_face', [1, 1]);
    const snow = snows.length ? assets.pbr('snow_02', [1, 1], { rough: false }) : null;
    const snowTint = new THREE.Color(this.def.snowTint ?? '#c8d0ff');
    const mat = new THREE.MeshStandardMaterial({
      ...grass,
      vertexColors: true,
      roughness: 0.95,
      envMapIntensity: 0.5,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.rockMap = { value: rock.map };
      shader.uniforms.rockNormal = { value: rock.normalMap };
      shader.uniforms.snowMap = { value: snow?.map ?? rock.map };
      shader.uniforms.snowNormal = { value: snow?.normalMap ?? rock.normalMap };
      shader.uniforms.snowTint = { value: snowTint };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aRock;
          attribute float aSnow;
          varying float vSnow;
          varying float vRock;
          varying vec2 vWUv;
          varying vec3 vTP;
          varying vec3 vTN;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vRock = aRock;
          vSnow = aSnow;
          vWUv = uv;
          vTP = position;
          vTN = normal;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D rockMap;
          uniform sampler2D rockNormal;
          uniform sampler2D snowMap;
          uniform sampler2D snowNormal;
          uniform vec3 snowTint;
          varying float vRock;
          varying float vSnow;
          varying vec2 vWUv;
          varying vec3 vTP;
          varying vec3 vTN;
          vec3 triW(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }`)
        .replace('#include <map_fragment>', /* glsl */`
          vec4 gTex = texture2D(map, vWUv);
          vec4 gTex2 = texture2D(map, vWUv * 0.23 + 0.37);
          gTex.rgb = mix(gTex.rgb, gTex2.rgb, 0.4);
          vec3 tw = triW(normalize(vTN));
          vec3 tp = vTP * 0.085;
          vec3 rTex = texture2D(rockMap, tp.zy).rgb * tw.x + texture2D(rockMap, tp.xz).rgb * tw.y + texture2D(rockMap, tp.xy).rgb * tw.z;
          float rockW = smoothstep(0.25, 0.75, vRock + (gTex2.g - 0.3) * 0.4);
          vec3 groundCol = gTex.rgb * vColor.rgb * 2.2;
          vec3 rockCol = rTex * mix(vColor.rgb * 1.6, vec3(0.42, 0.36, 0.5), 0.55);
          diffuseColor.rgb = mix(groundCol, rockCol, rockW);
          float snowW = vSnow > 0.001 ? smoothstep(0.15, 0.65, vSnow + (gTex2.g - 0.35) * 0.5) : 0.0;
          diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(snowMap, vWUv * 0.6).rgb * snowTint, snowW);
        `)
        .replace('#include <color_fragment>', '')
        .replace('#include <normal_fragment_maps>', /* glsl */`
          {
            vec3 nA = texture2D(normalMap, vWUv).xyz * 2.0 - 1.0;
            nA.xy *= normalScale;
            vec3 groundN = normalize(tbn * nA);
            // triplanar rock normal (whiteout blend, world space -> view space)
            vec3 n = normalize(vTN), w = triW(n), p = vTP * 0.085;
            vec3 tx = texture2D(rockNormal, p.zy).xyz * 2.0 - 1.0;
            vec3 ty = texture2D(rockNormal, p.xz).xyz * 2.0 - 1.0;
            vec3 tz = texture2D(rockNormal, p.xy).xyz * 2.0 - 1.0;
            tx.xy *= 1.8; ty.xy *= 1.8; tz.xy *= 1.8;
            tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
            ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
            tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
            vec3 rockN = normalize((viewMatrix * vec4(normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z), 0.0)).xyz);
            normal = normalize(mix(groundN, rockN, smoothstep(0.25, 0.75, vRock)));
            if (vSnow > 0.01) {
              vec3 nS = texture2D(snowNormal, vWUv * 0.6).xyz * 2.0 - 1.0;
              nS.xy *= normalScale * 1.4;
              normal = normalize(mix(normal, normalize(tbn * nS), smoothstep(0.15, 0.65, vSnow)));
            }
          }
        `);
    };
    stylize(mat, { rim: 0.12 });
    // normal maps need tangents frame; three computes tbn from derivatives when no tangent attribute.
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.mesh = mesh;
    return mesh;
  }
}
