import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { stylize } from '../render/materials.js';
import { skullGroup, boneMaterial } from './characters.js';

// Realistic rigged humans built from Quaternius's CC0 packs: Universal Base
// Characters (heads, hair), Modular Character Outfits - Fantasy (clothes) and
// the Universal Animation Library (clips). All share one 65-bone skeleton, so
// a character is an outfit + a grafted head/hair/beard + procedural extras
// skinned or parented to the same bones (robe skirts, hoods, hats, helmets,
// plate, staffs, swords, torches) + a looping clip.

const DIR = 'assets/models/humans/';
const cache = new Map();
function load(assets, name) {
  if (!cache.has(name)) cache.set(name, assets.gltfLoader.loadAsync(`${DIR}${name}.glb`));
  return cache.get(name);
}

// clips without scale tracks, so bones can be rescaled (gnome heads)
let clipsP;
function clips(assets) {
  return (clipsP ||= load(assets, 'UAL1').then((g) => {
    const m = new Map();
    for (const c of g.animations) {
      const k = c.clone();
      k.tracks = k.tracks.filter((t) => !t.name.endsWith('.scale'));
      m.set(c.name, k);
    }
    return m;
  }));
}

/** Re-bind skinned meshes of `src` onto the bones of `target` (by name). */
function graft(src, target, test = () => true) {
  const bones = new Map();
  target.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
  const out = [];
  const skeletons = new Map();
  src.traverse((m) => {
    if (!m.isSkinnedMesh || !test(m)) return;
    let sk = skeletons.get(m.skeleton);
    if (!sk) {
      const b = m.skeleton.bones.map((x) => bones.get(x.name));
      if (b.some((x) => !x)) return;
      skeletons.set(m.skeleton, (sk = new THREE.Skeleton(b, m.skeleton.boneInverses)));
    }
    const mesh = new THREE.SkinnedMesh(m.geometry, m.material);
    mesh.name = m.name;
    mesh.bind(sk, m.bindMatrix);
    out.push(mesh);
  });
  return out;
}

/** Triangles of a skinned body mesh that belong to the head and neck (by skin weight). */
const headCache = new WeakMap();
function headOnly(mesh) {
  if (headCache.has(mesh.geometry)) return headCache.get(mesh.geometry);
  const g = mesh.geometry;
  const keep = new Set(mesh.skeleton.bones.map((b, i) => (/^(Head|neck_0d)$/.test(b.name) ? i : -1)).filter((i) => i >= 0));
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const headW = (v) => { let w = 0; for (let k = 0; k < 4; k++) if (keep.has(si.getComponent(v, k))) w += sw.getComponent(v, k); return w; };
  const src = g.index.array, idx = [];
  for (let t = 0; t < src.length; t += 3) {
    if (headW(src[t]) > 0.5 && headW(src[t + 1]) > 0.5 && headW(src[t + 2]) > 0.5) idx.push(src[t], src[t + 1], src[t + 2]);
  }
  const out = g.clone();
  out.setIndex(idx);
  headCache.set(g, out);
  return out;
}

// ------------------------------------------------------------ materials

/**
 * Recolour a textured material. `mode: 'luma'` keeps only the texture's
 * light/dark detail and takes the hue from `color` (re-dyeing cloth, greying
 * hair); otherwise the colour multiplies the texture.
 */
function dye(src, { color = null, mode = 'mul', gain = 2.0, metal = null, rough = null, env = 0.5, rim = 0.3, side = null } = {}) {
  const m = src.clone();
  if (color) m.color = new THREE.Color(color);
  if (metal != null) m.metalness = metal;
  if (rough != null) m.roughness = rough;
  if (metal != null && m.metalnessMap) m.metalnessMap = null;
  if (side != null) m.side = side;
  m.envMapIntensity = env;
  if (mode === 'luma' && m.map) {
    const g = gain.toFixed(2);
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', /* glsl */`
        vec4 sampledDiffuseColor = texture2D(map, vMapUv);
        float lum = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb *= clamp(pow(lum, 0.8) * ${g}, 0.0, 1.6);`);
    };
    m.customProgramCacheKey = () => `dye${g}`;
  }
  return stylize(m, { rim, rimPower: 2.8 });
}

const paleCache = {};
function paleSkin(assets, female) {
  const k = female ? 'female' : 'male';
  if (!paleCache[k]) {
    const t = assets.texture(`${DIR}skin_${k}_light.jpg`, { srgb: true });
    t.flipY = false; // glTF UV convention
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    paleCache[k] = t;
  }
  return paleCache[k];
}

const clothCache = new Map();
function clothMaterial(assets, color, o = {}) {
  const key = `${color}|${o.rim ?? 0.3}|${o.rough ?? 0.95}`;
  if (!clothCache.has(key)) {
    clothCache.set(key, stylize(new THREE.MeshStandardMaterial({
      color, roughness: o.rough ?? 0.95,
      side: THREE.DoubleSide, envMapIntensity: 0.35,
    }), { rim: o.rim ?? 0.3, rimPower: 3 }));
  }
  return clothCache.get(key);
}

function steelMaterial(color, dull) {
  return stylize(new THREE.MeshPhysicalMaterial({
    color, metalness: dull ? 0.75 : 0.8, roughness: dull ? 0.5 : 0.44, envMapIntensity: dull ? 0.55 : 0.7,
  }), { rim: 0.35, rimPower: 2.5 });
}

// ------------------------------------------------------------ skeleton helpers

/** Bones + rest (bind) world matrices, from the outfit's main skinned mesh. */
function restInfo(root) {
  let sk = null;
  root.traverse((m) => { if (!sk && m.isSkinnedMesh && /Body/.test(m.name)) sk = m.skeleton; });
  root.traverse((m) => { if (!sk && m.isSkinnedMesh) sk = m.skeleton; });
  const idx = new Map(sk.bones.map((b, i) => [b.name, i]));
  const rest = (name) => new THREE.Matrix4().copy(sk.boneInverses[idx.get(name)]).invert();
  const pos = (name) => new THREE.Vector3().setFromMatrixPosition(rest(name));
  return { skeleton: sk, idx, rest, pos };
}

/** Parent `obj` to a bone so that, in the rest pose, it sits at `worldPos` with world rotation `euler`. */
function attachRest(root, R, bone, obj, worldPos, euler = new THREE.Euler()) {
  const b = root.getObjectByName(bone);
  const want = new THREE.Matrix4().compose(worldPos, new THREE.Quaternion().setFromEuler(euler), new THREE.Vector3(1, 1, 1));
  new THREE.Matrix4().copy(R.rest(bone)).invert().multiply(want).decompose(obj.position, obj.quaternion, obj.scale);
  b.add(obj);
}

/**
 * Put an item in the right hand for the current (already applied) pose: the
 * grip runs along world `up` (or `dir`) through the palm, so a staff stands
 * upright and a sword points up/forward, then it stays rigid in the hand.
 */
function attachToHand(root, obj, { dir = new THREE.Vector3(0, 1, 0), side = 'r', exact = false } = {}) {
  root.updateMatrixWorld(true);
  const hand = root.getObjectByName(`hand_${side}`);
  const fing = root.getObjectByName(`middle_01_${side}`) ?? root.getObjectByName(`index_01_${side}`);
  const hp = hand.getWorldPosition(new THREE.Vector3());
  const fp = fing ? fing.getWorldPosition(new THREE.Vector3()) : hp;
  const palm = hp.clone().lerp(fp, 0.55);
  const along = fp.clone().sub(hp).normalize();
  const d = exact ? dir.clone().normalize() : dir.clone().addScaledVector(along, -dir.dot(along)).normalize(); // perpendicular to the fingers
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  const want = new THREE.Matrix4().compose(palm, q, new THREE.Vector3(1, 1, 1));
  new THREE.Matrix4().copy(hand.matrixWorld).invert().multiply(want).decompose(obj.position, obj.quaternion, obj.scale);
  hand.add(obj);
}

/**
 * A long robe / dress skirt as a SkinnedMesh on the character's skeleton.
 * Upper rings follow the pelvis; lower rings blend toward the thighs and
 * calves on their side, so walking and kneeling drag the cloth with the legs.
 */
function skirt(R, mat, { top = 0.04, hem = 0.04, topR = 0.19, hemR = 0.42, depth = 0.85, folds = 0.07, nFolds = 9, tatter = 0, seed = 1, cloak = false } = {}) {
  const pel = R.pos('pelvis');
  const sp = R.pos('spine_01');
  const tl = R.pos('thigh_l');
  const leftSign = Math.sign(tl.x - pel.x) || 1;
  const neck = R.pos('neck_01'), s3 = R.pos('spine_03'), s2 = R.pos('spine_02');
  const y0 = cloak ? neck.y + 0.01 : sp.y + top, y1 = hem;
  const S = 72, RINGS = cloak ? 26 : 18;
  const waistT = cloak ? (y0 - sp.y) / (y0 - y1) : 0; // ring parameter where the skirt part begins
  // cloak profile above the waist: neck -> shoulders -> chest -> waist (radius, depth)
  const upper = (y) => {
    const k = [[neck.y + 0.01, 0.1, 0.9], [s3.y + 0.07, 0.28, 0.64], [s2.y, 0.265, 0.7], [sp.y, 0.255, 0.76]];
    for (let q = 0; q < k.length - 1; q++) {
      if (y <= k[q][0] && y >= k[q + 1][0]) { const u = (k[q][0] - y) / (k[q][0] - k[q + 1][0]); return [k[q][1] + (k[q + 1][1] - k[q][1]) * u, k[q][2] + (k[q + 1][2] - k[q][2]) * u]; }
    }
    return [k[3][1], k[3][2]];
  };
  const pos = [], uv = [], si = [], sw = [], idx = [];
  const I = (n) => R.idx.get(n);
  const rnd = (i) => { const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453; return x - Math.floor(x); };
  for (let j = 0; j <= RINGS; j++) {
    const tt = j / RINGS;
    const y = y0 + (y1 - y0) * tt;
    const t = cloak ? Math.max(0, (tt - waistT) / (1 - waistT)) : tt; // 0 at the waist
    const up = cloak && tt < waistT ? upper(y) : null;
    const r0 = up ? up[0] : (cloak ? 0.255 : topR) + (hemR - (cloak ? 0.255 : topR)) * (0.55 * Math.pow(t, 0.6) + 0.45 * t * t);
    const dep = up ? up[1] : (cloak ? 0.75 + (depth - 0.75) * t : depth);
    for (let i = 0; i <= S; i++) {
      const a = (i / S) * Math.PI * 2;
      const fold = 1 + folds * Math.pow(t, 1.1) * (Math.sin(a * nFolds + rnd(Math.floor(i / 6) % (S / 6)) * 2.0) * 0.7 + Math.sin(a * (nFolds + 4) + 1.3) * 0.3);
      const r = r0 * fold;
      let yy = y;
      if (tatter && j === RINGS) yy += tatter * (rnd(i % S) - 0.2);
      const x = pel.x + Math.sin(a) * r;
      const z = (up ? s3.z : pel.z) * (up ? 1 : 1) + Math.cos(a) * r * dep - (up ? 0.02 : 0);
      pos.push(x, yy, z);
      uv.push(i / S * 3, t * 2);
      // weights
      const side = Math.round(Math.sin(a) * leftSign * 1e6) / 1e6; // +1 left, -1 right (rounded: seam columns must match)
      const sL = THREE.MathUtils.smoothstep(side, -0.55, 0.55);
      // centre front/back stay with the pelvis (blending two legs there creases the cloth)
      const legAmt = 0.8 * (0.15 + 0.85 * THREE.MathUtils.smoothstep(Math.abs(side), 0.12, 0.75));
      const pelW = 1 - legAmt * THREE.MathUtils.smoothstep(t, 0.05, 0.45);
      const leg = 1 - pelW;
      const calf = leg * 0.55 * THREE.MathUtils.smoothstep(t, 0.45, 1.0);
      const thigh = leg - calf;
      if (up) { // above the waist: follow the spine, shoulders on the clavicles
        const h = (y - sp.y) / (neck.y - sp.y);
        const sideAbs = Math.abs(side);
        const cl = 0.5 * THREE.MathUtils.smoothstep(h, 0.55, 0.9) * THREE.MathUtils.smoothstep(sideAbs, 0.4, 0.9);
        const wu = [[I('spine_03'), (1 - cl) * THREE.MathUtils.smoothstep(h, 0.35, 0.8)], [I('spine_01'), (1 - cl) * (1 - THREE.MathUtils.smoothstep(h, 0.0, 0.5))],
          [I('spine_02'), 0], [side > 0 ? I('clavicle_l') : I('clavicle_r'), cl]];
        wu[2][1] = Math.max(0, 1 - cl - wu[0][1] - wu[1][1]);
        const su = wu.reduce((q, e) => q + e[1], 0);
        for (let k = 0; k < 4; k++) { si.push(wu[k][0]); sw.push(wu[k][1] / su); }
        continue;
      }
      const w = [
        [I('pelvis'), pelW],
        [I('thigh_l'), thigh * sL], [I('thigh_r'), thigh * (1 - sL)],
        [I('calf_l'), calf * sL], [I('calf_r'), calf * (1 - sL)],
      ].filter((e) => e[1] > 1e-4).sort((p, q) => (q[1] - p[1]) || (p[0] - q[0])).slice(0, 4);
      const sum = w.reduce((s, e) => s + e[1], 0);
      for (let k = 0; k < 4; k++) { si.push(w[k] ? w[k][0] : 0); sw.push(w[k] ? w[k][1] / sum : 0); }
    }
  }
  for (let j = 0; j < RINGS; j++) {
    for (let i = 0; i < S; i++) {
      const a = j * (S + 1) + i, b = a + 1, c = a + S + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  weld(g, RINGS, S);
  const m = new THREE.SkinnedMesh(g, mat);
  m.name = 'Skirt';
  m.bind(R.skeleton, new THREE.Matrix4());
  return m;
}

/** Average the normals of a ring mesh's duplicated seam column (no shading line down the front). */
function weld(g, rings, segs) {
  const n = g.attributes.normal;
  for (let j = 0; j <= rings; j++) {
    const a = j * (segs + 1), b = a + segs;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
}

/** Shoulder cape / mantle skinned to the upper spine + clavicles. */
function mantle(R, mat, { len = 0.32, r = 0.27, back = 0, seed = 2 } = {}) {
  const nk = R.pos('neck_01');
  const S = 32, RINGS = 6;
  const pos = [], si = [], sw = [], idx = [];
  const I = (n) => R.idx.get(n);
  const leftSign = Math.sign(R.pos('clavicle_l').x - nk.x) || 1;
  for (let j = 0; j <= RINGS; j++) {
    const t = j / RINGS;
    for (let i = 0; i <= S; i++) {
      const a = (i / S) * Math.PI * 2;
      const rr = 0.09 + (r - 0.09) * Math.pow(t, 0.6) * (1 + 0.06 * t * Math.sin(a * 7 + seed));
      const longer = back * Math.max(0, -Math.cos(a)) * t; // cape trailing down the back
      pos.push(nk.x + Math.sin(a) * rr, nk.y + 0.02 - t * len - longer, nk.z + Math.cos(a) * rr * 0.8 - 0.02);
      const side = Math.sin(a) * leftSign;
      const sL = THREE.MathUtils.smoothstep(side, 0.2, 0.9), sR = THREE.MathUtils.smoothstep(-side, 0.2, 0.9);
      const cl = 0.55 * t;
      const w = [[I('spine_03'), 1 - cl], [I('clavicle_l'), cl * sL], [I('clavicle_r'), cl * sR], [I('neck_01'), (1 - t) * 0.3]]
        .filter((e) => e[1] > 1e-4);
      const sum = w.reduce((s, e) => s + e[1], 0);
      for (let k = 0; k < 4; k++) { si.push(w[k] ? w[k][0] : 0); sw.push(w[k] ? w[k][1] / sum : 0); }
    }
  }
  for (let j = 0; j < RINGS; j++) for (let i = 0; i < S; i++) {
    const a = j * (S + 1) + i, b = a + 1, c = a + S + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  weld(g, RINGS, S);
  const m = new THREE.SkinnedMesh(g, mat);
  m.name = 'Mantle';
  m.bind(R.skeleton, new THREE.Matrix4());
  return m;
}

// ------------------------------------------------------------ rigid accessories

function wizardHat(mat, { height = 0.62, brim = 0.3, bend = 0.24 } = {}) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(brim, brim * 1.02, 0.014, 32), mat);
  g.add(b);
  const cone = new THREE.ConeGeometry(0.125, height, 24, 12, true);
  cone.translate(0, height / 2, 0);
  const p = cone.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / height; p.setZ(i, p.getZ(i) - bend * y * y * y); }
  cone.computeVertexNormals();
  g.add(new THREE.Mesh(cone, mat));
  g.traverse((m) => { m.castShadow = true; });
  return g;
}

function helmet(steel) {
  const g = new THREE.Group();
  const dome = new THREE.SphereGeometry(0.14, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.62);
  dome.scale(0.95, 1.12, 1.08);
  g.add(new THREE.Mesh(dome, steel));
  // bevor + visor (a pointed snout) over the face
  const visor = new THREE.SphereGeometry(0.142, 24, 12, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.38, Math.PI * 0.42);
  visor.scale(0.98, 1.05, 1.22);
  g.add(new THREE.Mesh(visor, steel));
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.013, 0.03), new THREE.MeshBasicMaterial({ color: 0x040306 }));
  slit.position.set(0, 0.0, 0.15);
  g.add(slit);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.12, 22, 1, true), steel);
  neck.position.y = -0.17;
  g.add(neck);
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.26), steel);
  crest.position.set(0, 0.15, -0.01);
  g.add(crest);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

/** Breastplate + pauldrons as rigid shells on the chest / upper arms. */
function plate(root, R, steel) {
  const sp = R.pos('spine_03');
  const lathe = (pts, segs = 26, z = 0.8) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs); g.scale(1, 1, z); return g; };
  const breast = new THREE.Mesh(lathe([[0.13, -0.3], [0.155, -0.22], [0.178, -0.08], [0.188, 0.03], [0.172, 0.12], [0.11, 0.18], [0.07, 0.2]], 26, 0.72), steel);
  attachRest(root, R, 'spine_03', breast, sp.clone().add(new THREE.Vector3(0, 0.02, 0.0)));
  const fauld = new THREE.Mesh(lathe([[0.16, 0.0], [0.19, -0.09], [0.22, -0.19]], 24, 0.8), steel);
  attachRest(root, R, 'pelvis', fauld, R.pos('pelvis').add(new THREE.Vector3(0, 0.08, 0)));
  for (const s of ['l', 'r']) {
    const ua = R.pos(`upperarm_${s}`);
    const pd = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), steel);
    pd.scale.set(1.15, 0.85, 1.05);
    const grp = new THREE.Group();
    grp.add(pd);
    attachRest(root, R, `upperarm_${s}`, grp, ua.clone().add(new THREE.Vector3(0, 0.03, 0)));
  }
  for (const m of [breast, fauld]) m.castShadow = true;
}

function staffMesh(below = 1.0, above = 0.6, glow = null) {
  const g = new THREE.Group();
  const wood = stylize(new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.8 }), { rim: 0.4 });
  const L = (below + above) / 1.0;
  const pts = [[0, -below, 0], [0.012, -below * 0.5, 0.008], [-0.008, 0, 0], [0.01, above * 0.75, 0], [0.07, above, 0.0], [0.12, above * 0.94, 0], [0.11, above * 0.84, 0]];
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 40, 0.02, 7), wood));
  if (glow) {
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(glow).multiplyScalar(3) }));
    orb.position.set(0.055, above * 0.9, 0);
    g.add(orb);
    g.userData.tip = orb;
  }
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

function swordMesh(steel, length = 0.95) {
  const g = new THREE.Group();
  const blade = new THREE.CylinderGeometry(0.004, 0.028, length, 4, 1);
  blade.scale(1, 1, 0.25);
  blade.translate(0, length / 2 + 0.07, 0);
  g.add(new THREE.Mesh(blade, steel));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.035).translate(0, 0.065, 0), steel));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 8).translate(0, -0.02, 0), new THREE.MeshStandardMaterial({ color: 0x2a1610, roughness: 0.9 })));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8).translate(0, -0.11, 0), steel));
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

function torchMesh(color) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.62, 7).translate(0, 0.12, 0), new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.9 })));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.09, 8).translate(0, 0.44, 0), new THREE.MeshStandardMaterial({ color: 0x241810, roughness: 1 })));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5) }));
  flame.position.y = 0.58;
  g.add(flame);
  g.userData.tip = flame;
  return g;
}

// ------------------------------------------------------------ builder

const POSE_CLIP = {
  stand: 'Idle_Loop', staff: 'Idle_Torch_Loop', staffTall: 'Idle_Torch_Loop', gesture: 'Idle_Talking_Loop',
  armsFolded: 'Idle_Loop', talk: 'Idle_Talking_Loop', sit: 'Sitting_Idle_Loop', sitSword: 'Sitting_Idle_Loop',
  rest: 'Sitting_Idle_Loop', walk: 'Walk_Formal_Loop', bowed: 'Crouch_Idle_Loop', torch: 'Idle_Torch_Loop',
  kneel: 'Fixing_Kneeling', reach: 'Spell_Simple_Idle_Loop', guard: 'Sword_Idle',
};

/**
 * o: {
 *   outfit: 'Male_Ranger' | 'Female_Ranger' | 'Male_Peasant' | 'Female_Peasant',
 *   pose (see POSE_CLIP) | anim (raw clip name), height (m), seed,
 *   cloth: '#hex' (dye the outfit), skin, hair ('long'|'none'), hairColor, beard: '#hex'|false, beardLen,
 *   robe: '#hex' (adds a long skirt), robeLen, hemR, tatter, mantle: '#hex', cape,
 *   hood: bool, faceless: bool, hat: '#hex', helmet: bool, armour: '#hex', dull,
 *   staff: true|'#glow', sword, torch: '#hex', skull: '#glow', headScale,
 *   patrol: metres (walk back and forth), rim
 * }
 * Returns a prop result { object, colliders, lights, update }.
 */
export async function human(ctx, o = {}) {
  const outfit = o.outfit ?? 'Male_Ranger';
  const female = outfit.startsWith('Female');
  const want = ['UAL1', outfit, female ? 'Superhero_Female_FullBody' : 'Superhero_Male_FullBody'];
  if (o.hair === 'long') want.push('Hair_Long');
  if (o.beard) want.push('Hair_Beard');
  const [lib, clothes, base, ...extra] = await Promise.all([clips(ctx.assets), ...want.slice(1).map((n) => load(ctx.assets, n))]);
  const hairG = o.hair === 'long' ? extra.shift() : null;
  const beardG = o.beard ? extra.shift() : null;

  const root = SkeletonUtils.clone(clothes.scene);
  let holder = null;
  root.traverse((m) => { if (!holder && m.isSkinnedMesh) holder = m.parent; });
  const R = restInfo(root);
  const rim = o.rim ?? 0.3;

  // ---- head, brows, hair, beard (grafted from the base-character pack)
  const showFace = !o.faceless && !o.skull && !o.helmet;
  if (showFace) {
    for (const m of graft(base.scene, root)) {
      if (/Eyebrows/.test(m.name)) m.name = 'Brows';
      else if (!/Eyes/.test(m.name)) { m.geometry = headOnly(m); m.name = 'Face'; }
      holder.add(m);
    }
  }
  if (hairG && !o.helmet) for (const m of graft(hairG.scene, root)) {
    m.name = 'Hair';
    if (o.hairLen) { // let the back of the hair fall further down (waist-length)
      const g = m.geometry.clone();
      const p = g.attributes.position;
      let top = -Infinity, bot = Infinity;
      for (let i = 0; i < p.count; i++) { top = Math.max(top, p.getY(i)); bot = Math.min(bot, p.getY(i)); }
      const cut = bot + (top - bot) * 0.5;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y < cut && p.getZ(i) < 0.02) {
          const k = (cut - y) / (cut - bot);
          p.setY(i, cut - (cut - y) * (1 + o.hairLen * 3));
          p.setZ(i, p.getZ(i) - k * 0.04);
        }
      }
      g.computeVertexNormals();
      m.geometry = g;
    }
    holder.add(m);
  }
  if (beardG && showFace) {
    for (const m of graft(beardG.scene, root)) {
      m.name = 'Beard';
      if (o.beardLen) { // stretch the beard below the chin into a long wizard's beard
        const g = m.geometry.clone();
        const p = g.attributes.position;
        let top = -Infinity, bot = Infinity;
        for (let i = 0; i < p.count; i++) { top = Math.max(top, p.getY(i)); bot = Math.min(bot, p.getY(i)); }
        const chin = bot + (top - bot) * 0.45;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i);
          if (y < chin) {
            const k = (chin - y) / (chin - bot);
            p.setY(i, chin - (chin - y) * (1 + o.beardLen * 4));
            p.setZ(i, p.getZ(i) + k * o.beardLen * 0.15);
            p.setX(i, p.getX(i) * (1 - 0.35 * k));
          }
        }
        g.computeVertexNormals();
        m.geometry = g;
      }
      holder.add(m);
    }
  }

  // ---- materials
  const steel = o.armour ? steelMaterial(o.armour, o.dull) : null;
  const hairCol = o.hairColor ?? o.beard ?? null;
  const restyled = new Map();
  const restyle = (mat, mesh) => {
    const n = `${mesh.name}|${mat.name}`;
    if (restyled.has(n)) return restyled.get(n);
    let out;
    const isSkin = /Regular|Superhero/.test(mat.name) && !/Eye/.test(mat.name);
    if (/Eye/.test(mat.name)) out = mat;
    else if (/Hair|Brows|Beard/.test(mesh.name) || /Hair/.test(mat.name)) out = hairCol ? dye(mat, { color: hairCol, mode: 'luma', gain: 1.9, rim: 0.5 }) : dye(mat, { rim: 0.5 });
    else if (steel && /Arms/.test(mesh.name)) out = steel; // gauntlets
    else if (isSkin) {
      out = dye(mat, { color: o.skin ?? null, mode: o.skinLuma ? 'luma' : 'mul', gain: 2.2, rim: o.skinLuma ? 0.6 : 0.25, env: 0.3 });
      if (o.pale && /Superhero/.test(mat.name)) out.map = paleSkin(ctx.assets, female);
    }
    else if (steel && /Body|Arms|Legs|Feet|Boots|Bracer|Pauldron/.test(mesh.name) && !/Belt/.test(mesh.name)) { out = steel.clone(); out.normalMap = mat.normalMap ?? null; out.normalScale = new THREE.Vector2(1.4, 1.4); out.onBeforeCompile = steel.onBeforeCompile; out.customProgramCacheKey = steel.customProgramCacheKey; }
    else if (o.cloth && /Body|Arms|Legs|Hood|Pauldron/.test(mesh.name) && !/Belt|Bracer/.test(mesh.name)) out = dye(mat, { color: o.cloth, mode: 'luma', gain: o.clothGain ?? 2.6, rim, rough: 0.95, env: 0.35 });
    else out = dye(mat, { rim, env: 0.4 });
    restyled.set(n, out);
    return out;
  };

  root.traverse((m) => {
    if (!m.isMesh) return;
    const n = m.name;
    if (/Hood/.test(n) && !o.hood) m.visible = false;
    if (/Pauldron/.test(n) && (o.pauldron === false || o.robe || (steel && o.plate !== false))) m.visible = false;
    if (/Bracer/.test(n) && o.robe) m.visible = false;
    if (/Legs|Feet|Boots/.test(n) && o.robe && (o.robeLen ?? 1) > 0.8) m.visible = false; // knees/boot tops would poke through the cloth
    if (/Belt_2|Belt_1.001|Belt_1_1/.test(n) && o.robe) m.visible = false;
    if (/Belt/.test(n) && o.belt === false) m.visible = false;
    if (Array.isArray(m.material)) m.material = m.material.map((x) => restyle(x, m));
    else m.material = restyle(m.material, m);
  });

  // ---- procedural cloth
  if (o.robe) {
    const mat = clothMaterial(ctx.assets, o.robe, { rim });
    holder.add(skirt(R, mat, { hem: o.robeLen != null ? 1 - o.robeLen : 0.03, hemR: o.hemR ?? 0.42, topR: female ? 0.17 : 0.19, tatter: o.tatter ?? 0, seed: o.seed ?? 1, cloak: !!o.cloak }));
  }
  if (o.mantle) holder.add(mantle(R, clothMaterial(ctx.assets, o.mantle, { rim }), { len: o.mantleLen ?? 0.3, back: o.cape ?? 0, seed: o.seed ?? 2 }));

  // ---- rigid accessories (placed in the rest pose)
  const head = R.pos('Head');
  if (o.hat) attachRest(root, R, 'Head', wizardHat(clothMaterial(ctx.assets, o.hat, { rim }), { height: o.hatHeight ?? 0.6, brim: o.hatBrim ?? 0.29, bend: o.hatBend ?? 0.24 }), head.clone().add(new THREE.Vector3(0, o.hatY ?? 0.17, -0.01)), new THREE.Euler(-0.12, 0, 0));
  if (o.helmet) attachRest(root, R, 'Head', helmet(steel ?? steelMaterial('#9a9cb0', true)), head.clone().add(new THREE.Vector3(0, 0.1, 0.015)));
  if (steel && o.plate !== false) plate(root, R, steel);
  if (o.faceless) { // a black void inside the hood
    const v = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshBasicMaterial({ color: 0x030204 }));
    v.scale.set(0.95, 1.15, 0.8);
    attachRest(root, R, 'Head', v, head.clone().add(new THREE.Vector3(0, 0.09, 0.02)));
  }
  if (o.skull) {
    const sk = skullGroup(boneMaterial(o.skull, o.glowStrength ?? 0.12), { socketGlow: o.skull });
    sk.scale.setScalar(1.25);
    attachRest(root, R, 'Head', sk, head.clone().add(new THREE.Vector3(0, 0.1, 0.03)));
  }
  if (o.ears) for (const sx of [-1, 1]) { // long pointed troll ears
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.24, 8), dye(new THREE.MeshStandardMaterial({ color: o.ears, roughness: 0.7 }), { rim: 0.6 }));
    ear.castShadow = true;
    attachRest(root, R, 'Head', ear, head.clone().add(new THREE.Vector3(sx * 0.12, 0.1, -0.01)), new THREE.Euler(0, 0, -sx * 1.15));
  }
  if (o.glowEyes) for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(o.glowEyes).multiplyScalar(3) }));
    attachRest(root, R, 'Head', e, head.clone().add(new THREE.Vector3(sx * 0.032, 0.085, 0.1)));
  }
  if (o.crown) {
    const crown = new THREE.Group();
    const cm = stylize(new THREE.MeshStandardMaterial({ color: o.crown, metalness: 0.6, roughness: 0.4 }), { rim: 1 });
    crown.add(new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.105, 0.06, 12, 1, true), cm));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.16 + (i % 2) * 0.08, 4), cm);
      sp.position.set(Math.sin(a) * 0.105, 0.1, Math.cos(a) * 0.105);
      sp.rotation.set(Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25);
      crown.add(sp);
    }
    attachRest(root, R, 'Head', crown, head.clone().add(new THREE.Vector3(0, 0.2, 0.0)));
  }
  if (o.headScale) root.getObjectByName('Head').scale.setScalar(o.headScale);

  // ---- animation
  // pose tweaks layered over the clip: straight legs (sitting on the ground, legs out), slumped head
  const restQ = new Map();
  for (const n of ['calf_l', 'calf_r', 'foot_l', 'foot_r']) restQ.set(n, root.getObjectByName(n).quaternion.clone());
  const slumpQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), o.slump ?? 0);
  const hunchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (o.hunch ?? 0) / 2);
  const tweak = () => {
    if (o.legsOut) for (const [n, q] of restQ) root.getObjectByName(n).quaternion.copy(q);
    if (o.slump) root.getObjectByName('Head').quaternion.multiply(slumpQ);
    if (o.hunch) for (const n of ['spine_02', 'spine_03']) root.getObjectByName(n).quaternion.multiply(hunchQ);
  };
  const mixer = new THREE.AnimationMixer(root);
  // a 'walk' figure only walks when it has somewhere to go (patrol); otherwise it stands
  const poseClip = o.pose === 'walk' && !o.patrol ? 'Idle_Loop' : POSE_CLIP[o.pose ?? 'stand'];
  const clip = lib.get(o.anim ?? poseClip ?? 'Idle_Loop') ?? lib.get('Idle_Loop');
  const action = mixer.clipAction(clip);
  action.play();
  const seed = o.seed ?? Math.floor(Math.random() * 1000);
  action.timeScale = 0.85 + ((seed * 37) % 30) / 100;
  mixer.update(((seed * 0.731) % 1) * clip.duration);
  tweak();
  if (o.freeze) action.paused = true;
  let groundShift = 0;
  if (o.legsOut) { // sit on the ground: drop the pelvis to just above it
    root.updateMatrixWorld(true);
    groundShift = (o.seatY ?? 0.13) - root.getObjectByName('pelvis').getWorldPosition(new THREE.Vector3()).y;
  }

  // hand items need the pose applied first
  let staffObj = null, torchObj = null;
  if (o.staff) {
    const side = /staff/.test(o.pose ?? '') ? 'l' : 'r';
    root.updateMatrixWorld(true);
    const py = root.getObjectByName(`hand_${side}`).getWorldPosition(new THREE.Vector3()).y;
    attachToHand(root, (staffObj = staffMesh(py + 0.02, Math.max(0.35, (o.staffLength ?? 2.0) - py), typeof o.staff === 'string' ? o.staff : null)), { exact: true, side });
  }
  if (o.sword && o.pose === 'sitSword') { // planted point-down between the knees, as in dark_03
    const sw = swordMesh(steel ?? steelMaterial('#a8aab4', false));
    root.updateMatrixWorld(true);
    const pel = root.getObjectByName('pelvis').getWorldPosition(new THREE.Vector3());
    sw.rotation.set(Math.PI - 0.12, 0, 0);
    sw.position.set(pel.x, 1.02, pel.z + 0.5);
    root.add(sw);
  } else if (o.sword) attachToHand(root, swordMesh(steel ?? steelMaterial('#a8aab4', false)), { dir: new THREE.Vector3(0, 1, 0.25) });
  if (o.torch) attachToHand(root, (torchObj = torchMesh(o.torch)), { side: 'l', exact: true });

  root.updateMatrixWorld(true);
  root.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = m.visible && !/Eyes|Brows|Beard|Belt|Bracer|Face/.test(m.name);
    m.receiveShadow = true;
    if (m.isSkinnedMesh) { // bounds from the posed mesh, padded for the animation's reach
      m.computeBoundingSphere();
      m.boundingSphere.radius += 0.45;
    }
  });

  // ---- scale to height (eye-to-crown ~0.12 m above the head bone)
  const g = new THREE.Group();
  const s = (o.height ?? (female ? 1.72 : 1.82)) / (head.y + 0.13);
  root.scale.set(s * (o.bulk?.[0] ?? 1), s, s * (o.bulk?.[1] ?? 1));
  root.position.y = groundShift * s;
  if (o.seatAbs != null) { // seated on something at this height (throne, boat bench)
    root.updateMatrixWorld(true);
    root.position.y = 0;
    root.updateMatrixWorld(true);
    root.position.y = o.seatAbs - root.getObjectByName('pelvis').getWorldPosition(new THREE.Vector3()).y;
  }
  g.add(root);

  const lights = [];
  g.updateMatrixWorld(true);
  const tip = (obj) => obj.userData.tip.getWorldPosition(new THREE.Vector3());
  if (torchObj) { const p = tip(torchObj); lights.push({ x: p.x, y: p.y + 0.15, z: p.z + 0.1, color: o.torch, intensity: o.torchLight ?? 5, distance: 9, flicker: 0.25 }); }
  if (staffObj?.userData.tip) { const p = tip(staffObj); lights.push({ x: p.x, y: p.y, z: p.z + 0.15, color: o.staff, intensity: o.staffLight ?? 2.5, distance: 7 }); }
  if (o.skull && o.light !== 0) lights.push({ x: 0, y: 1.2, z: 0.8, color: o.skull, intensity: o.light ?? 2.5, distance: 5 });

  // ---- walking figures pace back and forth instead of walking on the spot
  const patrol = o.patrol ?? 0;
  const wp = new THREE.Vector3();
  let phase = (seed % 100) / 100, turning = 0, dirSign = 1, base0 = null;
  const speed = 0.55 * action.timeScale; // Walk_Formal_Loop stride
  const idle = patrol ? mixer.clipAction(lib.get('Idle_Loop')) : null;
  const update = (dt, t, camPos) => {
    if (!g.parent || !g.visible) return;
    g.getWorldPosition(wp);
    if (camPos && wp.distanceToSquared(camPos) > 55 * 55) return; // far figures hold their pose
    if (patrol) {
      if (base0 == null) base0 = ctx.groundAt(wp.x, wp.z);
      if (turning > 0) {
        turning -= dt;
        const target = dirSign > 0 ? 0 : Math.PI;
        const d = target - root.rotation.y;
        root.rotation.y += Math.sign(d) * Math.min(Math.abs(d), dt * 2.5);
        if (turning <= 0) { idle.fadeOut(0.4); action.reset().fadeIn(0.4).play(); }
      } else {
        phase += dirSign * dt * speed / (2 * patrol);
        if (phase > 1 || phase < 0) {
          phase = THREE.MathUtils.clamp(phase, 0, 1);
          dirSign = -dirSign;
          turning = 1.6;
          action.fadeOut(0.4);
          idle.reset().fadeIn(0.4).play();
        }
      }
      root.position.z = (phase - 0.5) * 2 * patrol / g.scale.x;
      root.updateMatrixWorld();
      const p = root.getWorldPosition(new THREE.Vector3());
      root.position.y = (ctx.groundAt(p.x, p.z) - base0) / g.scale.x;
    }
    mixer.update(dt);
    tweak();
  };
  if (patrol) root.position.z = (phase - 0.5) * 2 * patrol;

  return { object: g, colliders: [{ x: 0, z: 0, r: patrol ? 0.3 : 0.42 }], lights, update };
}

// ------------------------------------------------------------ prop presets (same options as the old procedural figures)

/** Robed wizard: long beard, pointed hat, staff. */
export function wizardH(ctx, o = {}) {
  const beard = o.beard ?? '#e8e6f0';
  return human(ctx, {
    outfit: 'Male_Ranger', pose: o.pose ?? 'staff', seed: o.seed, height: o.height ?? 1.95,
    robe: o.robe ?? '#5a3a9a', cloth: o.robe ?? '#5a3a9a', cloak: true, mantle: o.mantle ?? null, hood: o.hat === false,
    hat: o.hat === false ? null : (o.hat ?? o.robe ?? '#5a3a9a'), hatHeight: o.hatHeight ?? 0.6,
    beard, beardLen: o.beardLen ?? 0.45, hair: 'long', hairColor: beard, pale: true,
    staff: o.staff === false ? false : (o.staffGlow ?? true), rim: o.rim ?? 0.35,
  });
}

/** Knight in plate with a closed helm; optional cape. */
export function knightH(ctx, o = {}) {
  return human(ctx, {
    outfit: 'Male_Ranger', pose: o.pose ?? 'stand', seed: o.seed, height: o.height ?? 1.88,
    armour: o.armor ?? '#9aa0b0', dull: !!o.dull, helmet: true,
    sword: o.sword ?? o.pose === 'sitSword', mantle: o.cape ?? null, cape: o.cape ? 0.55 : 0, mantleLen: 0.28,
    legsOut: o.pose === 'rest', slump: o.pose === 'rest' ? 0.35 : 0, seatY: o.seatY,
  });
}

/** Hooded robed figure with a black void for a face (surface cultists, wanderers). */
export function hoodedH(ctx, o = {}) {
  const c = o.robe ?? '#14121a';
  return human(ctx, {
    outfit: 'Male_Ranger', pose: o.pose ?? 'walk', seed: o.seed, height: o.height ?? 1.88,
    robe: c, cloth: c, clothGain: 2.2, hood: true, faceless: true, cloak: true, mantle: c, mantleLen: 0.22,
    tatter: o.tattered === false ? 0 : 0.05, staff: o.staff ? true : false, torch: o.torch ?? null, torchLight: o.torchLight,
    rim: o.rim ?? 0.3, hemR: o.hemR ?? 0.4, patrol: o.patrol,
  });
}

/** The Hollow Keeper: a hooded skeleton reaching out. */
export function skeletonH(ctx, o = {}) {
  const c = o.robe ?? '#0c0a12';
  return human(ctx, {
    outfit: 'Male_Ranger', anim: 'Idle_Torch_Loop', seed: o.seed ?? 6, height: o.height ?? 2.0,
    robe: c, cloth: c, hood: true, skull: o.glow ?? '#4dff8a', glowStrength: o.glowStrength ?? 0.12, light: o.light,
    cloak: true, mantle: c, tatter: 0.12, rim: 0.5,
  });
}

/** Lady Isolde: red gown, long fair hair, one hand raised to a glowing butterfly. */
export async function ladyH(ctx, o = {}) {
  const res = await human(ctx, {
    outfit: 'Female_Peasant', pose: 'reach', seed: o.seed ?? 4, height: o.height ?? 1.74,
    robe: o.gown ?? '#b0141a', cloth: o.gown ?? '#b0141a', clothGain: 2.0, hair: 'long', hairLen: 0.9, hairColor: o.hair ?? '#f0d070', pale: true, rim: 0.5, hemR: 0.46,
  });
  // butterfly at the raised hand
  const root = res.object.children[0];
  res.object.updateMatrixWorld(true);
  const hand = root.getObjectByName('hand_l').getWorldPosition(new THREE.Vector3()); // the clip raises the left hand
  const wingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.butterfly ?? '#3a7aff').multiplyScalar(1.3), side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), wingMat);
    w.scale.set(1, 1.3, 1);
    w.position.set(hand.x + sx * 0.05, hand.y + 0.14, hand.z + 0.04);
    w.rotation.set(0, sx * 0.6, sx * 0.3);
    res.object.add(w);
  }
  res.lights.push({ x: hand.x, y: hand.y + 0.15, z: hand.z, color: '#4a8aff', intensity: 0.8, distance: 3 });
  return res;
}

/** Gnome: small, big-headed, white beard, tall hat. */
export function gnomeH(ctx, o = {}) {
  return human(ctx, {
    outfit: 'Male_Peasant', pose: o.pose ?? 'sit', seed: o.seed ?? 9, height: o.height ?? 1.05,
    robe: o.robe ?? '#2a5ad0', cloth: o.robe ?? '#2a5ad0', robeLen: 0.62, hemR: 0.36,
    beard: '#f4f2ff', beardLen: o.beardLen ?? 0.35, hairColor: '#f4f2ff', pale: true, headScale: 1.3,
    hat: o.hat ?? '#1e44b0', hatHeight: o.hatHeight ?? 0.5, hatBend: 0.3, rim: 0.5, patrol: o.patrol,
  });
}

/** Camp gnome: walking gnome with a backpack. */
export async function campGnomeH(ctx, o = {}) {
  const res = await gnomeH(ctx, { robe: o.robe ?? '#c83a28', hat: o.hat ?? '#2aa02a', hatHeight: 0.75, pose: 'walk', seed: o.seed, patrol: o.patrol ?? 0.9 });
  const root = res.object.children[0];
  const R = restInfo(root);
  const pack = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), stylize(new THREE.MeshStandardMaterial({ color: '#1a3ad0', roughness: 0.45 }), { rim: 0.6 }));
  pack.scale.set(1, 1.15, 0.7);
  pack.castShadow = true;
  attachRest(root, R, 'spine_03', pack, R.pos('spine_03').add(new THREE.Vector3(0, -0.02, -0.2)));
  return res;
}

/** The Green King: a cloaked, crowned figure with burning green eyes, seated. */
export function kingH(ctx, o = {}) {
  return human(ctx, {
    outfit: 'Male_Ranger', anim: 'Sitting_Talking_Loop', seed: 11, height: o.height ?? 2.3, seatAbs: o.seatAbs ?? 1.38,
    robe: '#141a14', cloth: '#141a14', cloak: true, hood: true, faceless: true, glowEyes: '#6aff4a', crown: '#2a3a2a',
    mantle: '#141a14', rim: 0.8, hemR: 0.5,
  });
}

/** Grumm the ferryman: a hulking green troll sitting in his punt. */
export function trollH(ctx, o = {}) {
  return human(ctx, {
    outfit: 'Male_Peasant', anim: 'Sitting_Idle_Loop', seed: 12, height: 2.4, seatAbs: o.seatAbs ?? 0.5,
    bulk: [1.75, 1.5], headScale: 1.45, hunch: 0.6, slump: -0.35, skin: '#7ac060', skinLuma: true, cloth: '#5a4a2e', ears: '#5a9a4a',
    beard: '#2a3a20', rim: 0.25,
  });
}
