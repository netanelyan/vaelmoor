import * as THREE from 'three';
import { stylize } from '../render/materials.js';

// Hero models (assets/hero/*.glb, made with Meshy AI): single static meshes
// with meshopt geometry and WebP textures, each normalised to ~2 units.
// data/hero.json gives every model its real-world size (fit by height,
// length or largest side), facing and idle style; a prop can override any of
// it ({ "hero": "wizard_purple", "heroHeight": 2.1, "tint": "#8a8a96" }).
// Characters stand on their feet (bounding-box bottom on the ground). Until
// they are rigged they breathe and sway, and turn to whoever talks to them.

let defsP = null;
const cache = new Map();

export function heroDefs() {
  defsP ||= fetch('data/hero.json').then((r) => r.json()).then((j) => j.models).catch(() => ({}));
  return defsP;
}

function template(assets, name) {
  if (!cache.has(name)) {
    cache.set(name, assets.gltfLoader.loadAsync(`assets/hero/${name}.glb`).then((g) => {
      const scene = g.scene;
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene);
      return { scene, box, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()) };
    }));
  }
  return cache.get(name);
}

/** Material pass: no plastic sheen, a little rim so they sit in both render profiles. */
function finishMaterial(src, spec, tint, dye = null) {
  const m = src.clone();
  if (dye && m.map) {
    // re-dye: keep the texture's light/dark detail, take the hue from `dye.color`
    m.color = new THREE.Color(dye.color);
    const g = (dye.gain ?? 3).toFixed(2), lift = (dye.lift ?? 0.04).toFixed(3);
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
        vec4 sampledDiffuseColor = texture2D(map, vMapUv);
        float lum = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb *= clamp(pow(lum + ${lift}, 0.7) * ${g}, 0.0, 1.5);`);
    };
    m.customProgramCacheKey = () => `herodye${g}${lift}`;
  }
  if (spec.metal != null) m.metalness = spec.metal;
  else m.metalness = Math.min(m.metalness, 0.6) * (m.metalnessMap ? 0.75 : 1);
  m.roughness = Math.max(m.roughness ?? 1, spec.rough ?? 0.55);
  m.envMapIntensity = spec.env ?? 0.55;
  if (tint && !dye) m.color = new THREE.Color(tint);
  if (spec.emissive) { m.emissive = new THREE.Color(spec.emissive); m.emissiveIntensity = spec.emissiveIntensity ?? 1; }
  return stylize(m, { rim: spec.rim ?? 0.25, rimPower: 3 });
}

const matCache = new Map();

/**
 * Build a placed hero model. o: { hero, heroHeight / heroLength / heroSize, tint, idle, rot... }
 * Returns a prop result: { object, colliders, update, hero: { face(x, z) }, height }.
 */
export async function heroProp(ctx, o, spec) {
  const name = typeof o.hero === 'string' ? o.hero : o.hero.model;
  const t = await template(ctx.assets, name);
  const fit = o.heroHeight != null ? ['height', o.heroHeight] : o.heroLength != null ? ['length', o.heroLength] : o.heroSize != null ? ['size', o.heroSize] : [spec.fit, spec.value];
  const S = t.size;
  const ref = fit[0] === 'height' ? S.y : fit[0] === 'length' ? Math.max(S.x, S.z) : Math.max(S.x, S.y, S.z);
  const k = fit[1] / Math.max(1e-4, ref);
  const model = t.scene.clone(true);
  const tint = o.tint ?? null;
  const dye = o.dye ?? null;
  model.traverse((m) => {
    if (!m.isMesh) return;
    const key = `${name}|${tint}|${JSON.stringify(dye)}|${m.material.uuid}`;
    if (!matCache.has(key)) matCache.set(key, finishMaterial(m.material, spec, tint, dye));
    m.material = matCache.get(key);
    m.castShadow = spec.shadow !== false;
    m.receiveShadow = true;
  });
  // feet on the ground, centred on the prop's position, real-world size, facing
  const inner = new THREE.Group();
  model.position.set(-t.center.x, -t.box.min.y, -t.center.z);
  inner.add(model);
  inner.scale.setScalar(k);
  inner.rotation.y = ((spec.rotY ?? 0) * Math.PI) / 180;
  const body = new THREE.Group();   // idle motion lives here
  body.add(inner);
  const g = new THREE.Group();
  g.add(body);
  const height = S.y * k;
  const foot = Math.max(S.x, S.z) * k;
  const idle = o.idle ?? spec.idle ?? 'static';
  const phase = Math.random() * 10;
  let faceYaw = null, busy = false;
  const update = idle === 'static' ? null : (dt, time) => {
    if (!g.visible) return;
    // breathe (~1%) and sway; a talked-to NPC turns toward the speaker
    body.scale.y = 1 + 0.01 * Math.sin(time * 1.7 + phase);
    body.rotation.z = 0.012 * Math.sin(time * 0.6 + phase);
    body.rotation.x = 0.008 * Math.sin(time * 0.45 + phase * 1.3);
    if (faceYaw != null) {
      const base = g.rotation.y;
      let d = faceYaw - (base + body.rotation.y);
      d = Math.atan2(Math.sin(d), Math.cos(d));
      body.rotation.y += d * Math.min(1, dt * 4);
    } else body.rotation.y *= 1 - Math.min(1, dt * 3); // ease back to the placed (or walking) facing
  };
  const radius = o.collide ?? spec.collide ?? (idle === 'static' ? foot * 0.4 : 0.4);
  return {
    object: g,
    colliders: radius > 0 ? [{ x: 0, z: 0, r: radius }] : [],
    update,
    height,
    hero: {
      body,
      /** turn (the body, not the placement) toward a world point */
      face(x, z) { const p = g.getWorldPosition(new THREE.Vector3()); faceYaw = Math.atan2(x - p.x, z - p.z); busy = true; },
      release() { faceYaw = null; busy = false; },
      get busy() { return busy; },
    },
  };
}

/**
 * Many copies of one static hero model as a single InstancedMesh (rock spires,
 * repeated props). items: [{ x, y, z, rot (rad), height? , size? }]. Returns
 * { object, colliders: [{ x, z, r }] } in world space.
 */
export async function heroInstanced(ctx, name, spec, items) {
  const t = await template(ctx.assets, name);
  let mesh = null;
  t.scene.traverse((m) => { if (!mesh && m.isMesh) mesh = m; });
  const mat = finishMaterial(mesh.material, spec, null);
  const im = new THREE.InstancedMesh(mesh.geometry, mat, items.length);
  im.castShadow = spec.shadow !== false;
  im.receiveShadow = true;
  const S = t.size;
  const local = new THREE.Matrix4().makeTranslation(-t.center.x, -t.box.min.y, -t.center.z).multiply(mesh.matrixWorld);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const colliders = [];
  items.forEach((it, i) => {
    const k = (it.height ?? spec.value) / (spec.fit === 'height' || it.height ? S.y : Math.max(S.x, S.y, S.z));
    q.setFromAxisAngle(up, it.rot ?? 0);
    m4.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(k, k * (it.stretch ?? 1), k)).multiply(local);
    im.setMatrixAt(i, m4);
    colliders.push({ x: it.x, z: it.z, r: Math.max(S.x, S.z) * k * 0.35 });
  });
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.name = `hero:${name}`;
  return { object: im, colliders };
}
