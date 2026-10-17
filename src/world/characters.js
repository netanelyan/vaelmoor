import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stylize } from '../render/materials.js';

// Procedural skulls (the keeper's head, the golden skull item, the horned
// skull on the surface). The people themselves are rigged models: humans.js.

const matCache = new Map();
function cached(key, make) {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
}

const darkMat = () => cached('dark', () => new THREE.MeshStandardMaterial({ color: 0x050308, roughness: 0.9 }));
export function boneMaterial(glow = '#4dff8a', strength = 0.35) {
  return cached(`bone:${glow}:${strength}`, () => {
    const m = new THREE.MeshStandardMaterial({ color: 0xc8d8b8, roughness: 0.55, emissive: new THREE.Color(glow), emissiveIntensity: strength });
    return stylize(m, { rim: 1.2, rimPower: 2.0 });
  });
}
export function goldMaterial() {
  return cached('gold', () => stylize(new THREE.MeshPhysicalMaterial({
    color: 0xffc23a, metalness: 1, roughness: 0.22, clearcoat: 0.5, envMapIntensity: 2.2,
    emissive: new THREE.Color(0xff9a20), emissiveIntensity: 0.25,
  }), { rim: 1.6, rimPower: 2.0 }));
}
function glowMat(hex, intensity) {
  return cached(`glow:${hex}:${intensity}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity) }));
}

function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/** Skull: cranium + face + jaw + sockets (dark) + teeth. ~0.22 m tall, faces +Z. */
export function skullGroup(boneMat, { socketGlow = null, scale = 1 } = {}) {
  const g = new THREE.Group();
  let cr = new THREE.SphereGeometry(0.1, 24, 18);
  const p = cr.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    z *= 1.18; // long cranium
    if (z > 0.02 && y < 0.02) { z -= (0.02 - y) * 0.4; x *= 0.92; } // flatter face
    if (y < -0.03) { x *= 0.85 + (y + 0.1) * 1.5; } // narrower toward the cheeks
    p.setXYZ(i, x, y, z);
  }
  cr.computeVertexNormals();
  g.add(mesh(cr, boneMat));
  // cheekbones / maxilla
  const max = new THREE.BoxGeometry(0.11, 0.05, 0.06, 2, 2, 2);
  g.add(mesh(max, boneMat).translateY(-0.075).translateZ(0.07));
  // jaw
  const jaw = new THREE.CylinderGeometry(0.055, 0.05, 0.035, 12, 1, false, -Math.PI * 0.75, Math.PI * 1.5);
  const jm = mesh(jaw, boneMat);
  jm.position.set(0, -0.115, 0.045);
  jm.rotation.y = Math.PI;
  g.add(jm);
  // sockets
  const sockMat = socketGlow ? glowMat(socketGlow, 2.2) : darkMat();
  for (const sx of [-1, 1]) {
    const s = mesh(new THREE.SphereGeometry(0.027, 12, 8), sockMat, false);
    s.scale.set(1, 0.9, 0.6);
    s.position.set(sx * 0.037, -0.02, 0.098);
    g.add(s);
  }
  const nose = mesh(new THREE.ConeGeometry(0.014, 0.03, 3), darkMat(), false);
  nose.position.set(0, -0.058, 0.108);
  nose.rotation.x = Math.PI;
  g.add(nose);
  // teeth
  const tooth = new THREE.BoxGeometry(0.009, 0.016, 0.008);
  const teeth = [];
  for (let i = -4; i <= 4; i++) {
    const a = i * 0.16;
    teeth.push(tooth.clone().translate(Math.sin(a) * 0.045, -0.098, 0.062 + Math.cos(a) * 0.03));
  }
  g.add(mesh(mergeGeometries(teeth), boneMat));
  g.scale.setScalar(scale);
  return g;
}

function bake(root) {
  root.updateMatrixWorld(true);
  const byMat = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (g.index) g = g.toNonIndexed();
    const entry = byMat.get(o.material) || { geos: [], shadow: false };
    entry.geos.push(g);
    entry.shadow ||= o.castShadow;
    byMat.set(o.material, entry);
  });
  const out = new THREE.Group();
  for (const [mat, { geos, shadow }] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    out.add(m);
  }
  return out;
}

/** Golden skull lying on the ground. */
export function goldenSkull(ctx, o = {}) {
  const g = new THREE.Group();
  const s = skullGroup(goldMaterial(), { scale: o.size ?? 2.2 });
  s.position.y = 0.2 * (o.size ?? 2.2) * 0.55;
  s.rotation.set(-0.15, 0, 0.12);
  g.add(s);
  return { object: bake(g), colliders: [{ x: 0, z: 0, r: 0.3 }], lights: [{ x: 0, y: 0.8, z: 0.6, color: '#ffb040', intensity: 3, distance: 6 }] };
}
