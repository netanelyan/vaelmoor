import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

// Glassy lake surface (three's planar-reflection Water shader). Colours and
// glint follow the blended atmosphere via `waterState` (set in main.js).

export const waterState = {
  color: new THREE.Color('#0a3a44'),
  tint: new THREE.Color('#80ffe8'),
  glint: new THREE.Color('#d0c0ff'),
  dir: new THREE.Vector3(0, 0.4, -1).normalize(),
  distortion: 0.8,
};

// Each lake's mirror re-renders the whole scene. Only the nearest lake in view
// does that every frame; others refresh at 10 Hz within 60 m and 3 Hz beyond,
// so a view with several lakes doesn't pay for several scenes.
const mirrors = [];
let now = 0;
const nearestCache = new Map(); // scene -> { at, entry }
const _p = new THREE.Vector3();
function mirrorDue(entry, scene, camera) {
  let c = nearestCache.get(scene);
  if (!c || c.at !== now) {
    let best = Infinity, near = null;
    for (const m of mirrors) {
      if (m.scene !== scene) continue;
      m.d = Math.max(0, m.water.getWorldPosition(_p).distanceTo(camera.position) - m.r);
      if (m.d < best) { best = m.d; near = m; }
    }
    nearestCache.set(scene, (c = { at: now, entry: near }));
  }
  if (entry === c.entry || entry.last < 0) return true;
  return now - entry.last >= (entry.d < 60 ? 0.1 : 0.33);
}

export function lakeWater(ctx, prop, lake) {
  const normals = ctx.assets.texture('assets/textures/waternormals.jpg');
  const [rx, rz] = lake.radii;
  const geo = new THREE.PlaneGeometry(rx * 2.6, rz * 2.6);
  const water = new Water(geo, {
    textureWidth: 768,
    textureHeight: 768,
    waterNormals: normals,
    sunDirection: waterState.dir.clone(),
    sunColor: waterState.glint.clone(),
    waterColor: waterState.color.clone(),
    distortionScale: 0.8,
    fog: true,
    alpha: 1.0,
  });
  // tint the mirrored sky so the lake keeps its own colour at grazing angles
  water.material.uniforms.reflectTint = { value: waterState.tint.clone() };
  water.material.fragmentShader = water.material.fragmentShader
    .replace('uniform vec3 waterColor;', 'uniform vec3 waterColor;\nuniform vec3 reflectTint;')
    .replace('reflectionSample + specularLight, reflectance', 'reflectionSample * reflectTint + specularLight, reflectance');
  water.rotation.x = -Math.PI / 2;
  const entry = { water, scene: ctx.scene, r: Math.max(rx, rz) * 1.3, d: 0, last: -1 };
  mirrors.push(entry);
  const reflect = water.onBeforeRender;
  water.onBeforeRender = function (renderer, scene, camera) {
    if (!mirrorDue(entry, scene, camera)) return;
    entry.last = now;
    // the main pass already refreshed the shadow maps this frame; don't redo them for the mirror
    const auto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    reflect.call(this, renderer, scene, camera);
    renderer.shadowMap.autoUpdate = auto;
  };
  water.material.uniforms.size.value = prop.ripple ?? 2.2;
  const inner = new THREE.Group();
  inner.add(water);
  inner.rotation.y = -((lake.rotation || 0) * Math.PI) / 180;
  const g = new THREE.Group();
  g.add(inner);
  water.receiveShadow = false;
  const u = water.material.uniforms;
  return {
    object: g,
    absY: lake.level,
    update: (dt, t) => {
      now = t;
      u.time.value = t * 0.35;
      u.waterColor.value.copy(waterState.color);
      u.reflectTint.value.copy(waterState.tint);
      u.sunColor.value.copy(waterState.glint);
      u.sunDirection.value.copy(waterState.dir);
      u.distortionScale.value = waterState.distortion;
    },
  };
}
