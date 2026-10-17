import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, Noise2D } from '../engine/noise.js';
import { stylize } from '../render/materials.js';

// Procedural characters on a small hierarchical rig. Proportions are
// realistic-tall (PS2-era fantasy), not chibi. Every builder returns
// { object, colliders, lights, update } like the other props.

const DEG = Math.PI / 180;

// ------------------------------------------------------------ materials

const matCache = new Map();
function cached(key, make) {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
}

export function robeMaterial(assets, color, sheen = '#ffffff', rim = 1.4) {
  return cached(`robe:${color}:${sheen}:${rim}`, () => {
    const t = assets.pbr('velour_velvet', [3, 3], { color: false, rough: false });
    const m = new THREE.MeshPhysicalMaterial({
      normalMap: t.normalMap, color, roughness: 0.78,
      sheen: 0.45, sheenRoughness: 0.4, sheenColor: new THREE.Color(sheen),
      normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 0.6, side: THREE.DoubleSide,
    });
    return stylize(m, { rim, rimPower: 2.6 });
  });
}

export function armorMaterial(assets, color = 0xb4aed0, dull = false) {
  if (dull) {
    return cached(`armorDull:${color}`, () => {
      const t = assets.pbr('metal_plate', [2, 2], { color: false });
      return stylize(new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.45, roughnessMap: t.roughnessMap, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 0.45 }), { rim: 0.35, rimPower: 3 });
    });
  }
  return cached(`armor:${color}`, () => {
    const t = assets.pbr('metal_plate', [2, 2], { color: false });
    const m = new THREE.MeshPhysicalMaterial({
      color, metalness: 0.55, roughness: 0.32, roughnessMap: t.roughnessMap, normalMap: t.normalMap,
      normalScale: new THREE.Vector2(0.25, 0.25), clearcoat: 0.3, clearcoatRoughness: 0.2, envMapIntensity: 0.55,
    });
    return stylize(m, { rim: 0.55, rimPower: 3.0 });
  });
}

const skinMat = () => cached('skin', () => stylize(new THREE.MeshPhysicalMaterial({
  color: 0xe8b8a0, roughness: 0.6, sheen: 0.5, sheenColor: new THREE.Color(0xffc0b0),
}), { rim: 1.0, rimPower: 2.5 }));
const hairMat = (color = 0xf2f0ff) => cached(`hair:${color}`, () => stylize(new THREE.MeshPhysicalMaterial({
  color, roughness: 0.55, sheen: 1, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.3,
}), { rim: 1.6, rimPower: 2.0 }));
const darkMat = () => cached('dark', () => new THREE.MeshStandardMaterial({ color: 0x050308, roughness: 0.9 }));
const leatherMat = (color = 0x3a2418) => cached(`leather:${color}`, () => stylize(new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 }), { rim: 0.8 }));
const woodMat = () => cached('staffwood', () => stylize(new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.7 }), { rim: 0.9 }));
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

// ------------------------------------------------------------ geometry helpers

/** Lathe from [radius, y] pairs with optional angular fold displacement. */
function lathe(profile, segs = 24, folds = null) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  let g = new THREE.LatheGeometry(pts, segs);
  if (folds) {
    const p = g.attributes.position;
    const ymin = profile[0][1], ymax = profile[profile.length - 1][1];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const t = 1 - (y - ymin) / (ymax - ymin || 1);
      const k = 1 + folds(a, t, y);
      p.setX(i, x * k);
      p.setZ(i, z * k);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** Tube along points (array of [x,y,z]) with radius function. */
function tube(points, radius, segs = 16, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  // scale radius along length
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const center = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, center);
    const r = typeof radius === 'function' ? radius(t) : radius;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.setXYZ(k, center.x + n.getX(k) * r, center.y + n.getY(k) * r, center.z + n.getZ(k) * r);
    }
  }
  return g;
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

// ------------------------------------------------------------ rig

/**
 * Minimal humanoid rig. Joint groups are nested so poses are just rotations.
 * Lengths in metres for a ~1.85 m figure (scaled by `height / 1.85`).
 */
function makeRig() {
  const J = (name, parent, x, y, z) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const root = new THREE.Group();
  const r = { root };
  r.pelvis = J('pelvis', root, 0, 0.98, 0);
  r.spine = J('spine', r.pelvis, 0, 0.12, 0);
  r.chest = J('chest', r.spine, 0, 0.26, 0);
  r.neck = J('neck', r.chest, 0, 0.2, 0);
  r.head = J('head', r.neck, 0, 0.1, 0);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    r[`shoulder${s}`] = J(`shoulder${s}`, r.chest, sx * 0.2, 0.12, 0);
    r[`elbow${s}`] = J(`elbow${s}`, r[`shoulder${s}`], 0, -0.3, 0);
    r[`hand${s}`] = J(`hand${s}`, r[`elbow${s}`], 0, -0.27, 0);
    r[`hip${s}`] = J(`hip${s}`, r.pelvis, sx * 0.1, -0.04, 0);
    r[`knee${s}`] = J(`knee${s}`, r[`hip${s}`], 0, -0.45, 0);
    r[`foot${s}`] = J(`foot${s}`, r[`knee${s}`], 0, -0.44, 0);
  }
  return r;
}

const POSES = {
  stand: {},
  staff: { shoulderR: [-28, 0, -8], elbowR: [-62, 0, 0], shoulderL: [6, 0, 10], elbowL: [-12, 0, 0], head: [6, 0, 0] },
  staffTall: { shoulderR: [-38, 0, -10], elbowR: [-50, 0, 10], shoulderL: [4, 0, 8], elbowL: [-20, 0, 0], head: [-4, 0, 0] },
  gesture: { shoulderR: [-60, 0, -25], elbowR: [-40, 0, 0], shoulderL: [-20, 0, 15], elbowL: [-70, 0, 0], head: [-8, 12, 0] },
  armsFolded: { shoulderR: [-18, 0, -14], elbowR: [-100, 0, 30], shoulderL: [-18, 0, 14], elbowL: [-100, 0, -30], head: [8, 0, 0] },
  sit: { // on a rock / bench, hands on knees
    pelvis: [0, 0, 0], hipL: [-88, 0, 6], hipR: [-88, 0, -6], kneeL: [92, 0, 0], kneeR: [86, 0, 0],
    spine: [8, 0, 0], chest: [6, 0, 0], head: [10, 0, 0],
    shoulderL: [-38, 0, 10], elbowL: [-40, 0, 0], shoulderR: [-38, 0, -10], elbowR: [-40, 0, 0],
  },
  sitSword: { // sitting, sword planted between the knees
    hipL: [-86, 0, 14], hipR: [-86, 0, -14], kneeL: [88, 0, 0], kneeR: [84, 0, 0],
    spine: [10, 0, 0], chest: [6, 0, 0], head: [16, 0, 0],
    shoulderL: [-52, 0, -12], elbowL: [-34, 0, 0], shoulderR: [-52, 0, 12], elbowR: [-34, 0, 0],
  },
  rest: { // sitting on the ground against a trunk, legs out, head bowed
    hipL: [-82, 0, 4], hipR: [-78, 0, -3], kneeL: [10, 0, 0], kneeR: [30, 0, 0],
    spine: [-12, 0, 0], chest: [4, 0, 0], head: [24, 10, 0],
    shoulderL: [-18, 0, 16], elbowL: [-50, 0, 0], shoulderR: [-10, 0, -22], elbowR: [-24, 0, 0],
  },
  walk: { hipL: [-14, 0, 0], kneeL: [8, 0, 0], hipR: [12, 0, 0], kneeR: [18, 0, 0], shoulderL: [10, 0, 6], shoulderR: [-12, 0, -6], head: [8, 0, 0], spine: [4, 0, 0] },
  bowed: { spine: [14, 0, 0], chest: [8, 0, 0], head: [26, 0, 0], shoulderL: [-30, 0, 18], elbowL: [-60, 0, -20], shoulderR: [-30, 0, -18], elbowR: [-60, 0, 20] },
  torch: { shoulderR: [-70, 0, -8], elbowR: [-60, 0, 10], shoulderL: [-12, 0, 10], elbowL: [-40, 0, 0], head: [6, -10, 0] },
  kneel: { hipL: [-95, 0, 6], kneeL: [100, 0, 0], hipR: [-10, 0, -6], kneeR: [95, 0, 0], spine: [16, 0, 0], head: [20, 0, 0],
    shoulderL: [-30, 0, 12], elbowL: [-60, 0, 0], shoulderR: [-30, 0, -12], elbowR: [-60, 0, 0] },
  reach: { shoulderR: [-70, 0, -10], elbowR: [-10, 0, 0], shoulderL: [-10, 0, 10], elbowL: [-30, 0, 0], head: [-10, 0, 0], spine: [6, 0, 0] },
};

function applyPose(rig, name) {
  const pose = POSES[name] || {};
  for (const [joint, rot] of Object.entries(pose)) {
    const j = rig[joint];
    if (j) j.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
  }
  // sitting poses drop the pelvis to seat height
  if (name === 'sit' || name === 'sitSword') rig.pelvis.position.y = 0.5;
  if (name === 'rest') rig.pelvis.position.y = 0.12;
  if (name === 'kneel') rig.pelvis.position.y = 0.55;
}

// ------------------------------------------------------------ parts

function attach(joint, obj, x = 0, y = 0, z = 0) {
  obj.position.set(x, y, z);
  joint.add(obj);
  return obj;
}

function head(rig, { skin = skinMat(), beard = null, beardLen = 0.45, hair = null, eyes = true }) {
  const h = new THREE.Group();
  const skull = new THREE.SphereGeometry(0.105, 20, 16);
  skull.scale(0.92, 1.08, 1.0);
  h.add(mesh(skull, skin));
  const nose = new THREE.ConeGeometry(0.022, 0.07, 6);
  nose.rotateX(Math.PI / 2 + 0.3);
  h.add(mesh(nose, skin).translateZ(0.11).translateY(-0.005));
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.025, 8, 6), skin);
    ear.scale.set(0.4, 1, 0.8);
    ear.position.set(sx * 0.098, 0, -0.005);
    h.add(ear);
    if (eyes) {
      const eye = mesh(new THREE.SphereGeometry(0.012, 8, 6), darkMat(), false);
      eye.position.set(sx * 0.036, 0.022, 0.093);
      h.add(eye);
    }
    if (hair) {
      const brow = mesh(new THREE.BoxGeometry(0.05, 0.014, 0.025), hairMat(hair), false);
      brow.position.set(sx * 0.038, 0.048, 0.095);
      brow.rotation.z = sx * -0.25;
      h.add(brow);
    }
  }
  if (beard) {
    // long tapered beard flowing down the chest
    const prof = [[0.0, -beardLen], [0.025, -beardLen + 0.04], [0.06, -beardLen * 0.6], [0.085, -beardLen * 0.25], [0.095, -0.06], [0.085, 0.0], [0.0, 0.02]];
    const N = new Noise2D(5);
    const bg = lathe(prof, 18, (a, t, y) => 0.12 * N.noise(a * 3, y * 20) + (Math.sin(a) < 0 ? -0.35 : 0));
    bg.scale(1, 1, 0.65);
    bg.translate(0, -0.04, 0.05);
    h.add(mesh(bg, hairMat(beard)));
    // moustache
    const m = new THREE.TorusGeometry(0.04, 0.014, 6, 12, Math.PI);
    const mm = mesh(m, hairMat(beard));
    mm.position.set(0, -0.045, 0.1);
    mm.rotation.z = Math.PI;
    h.add(mm);
    // side hair
    const side = new THREE.SphereGeometry(0.11, 14, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.4);
    const sm = mesh(side, hairMat(beard));
    sm.scale.set(1.02, 1.05, 1.0);
    sm.position.z = -0.01;
    h.add(sm);
  }
  attach(rig.head, h, 0, 0.09, 0);
  return h;
}

/** Pointed wizard hat with brim and a crooked, drooping tip. */
function wizardHat(rig, mat, { height = 0.62, brim = 0.3, bend = 0.22 } = {}) {
  const g = new THREE.Group();
  const b = new THREE.CylinderGeometry(brim, brim * 1.02, 0.02, 28);
  const bp = b.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), z = bp.getZ(i);
    const r = Math.hypot(x, z);
    bp.setY(i, bp.getY(i) - Math.max(0, r - 0.14) * 0.25 * (1 + 0.5 * Math.sin(Math.atan2(z, x) * 2)));
  }
  b.computeVertexNormals();
  g.add(mesh(b, mat));
  const cone = new THREE.ConeGeometry(0.135, height, 18, 12, true);
  cone.translate(0, height / 2, 0);
  const p = cone.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / height;
    p.setZ(i, p.getZ(i) - bend * y * y * y);
    p.setY(i, p.getY(i) - bend * 0.35 * y * y * y);
    p.setX(i, p.getX(i) * (1 + 0.08 * Math.sin(y * 9)));
  }
  cone.computeVertexNormals();
  g.add(mesh(cone, mat));
  const band = new THREE.CylinderGeometry(0.138, 0.14, 0.04, 18, 1, true);
  g.add(mesh(band, leatherMat(0x2a1a30)).translateY(0.03));
  attach(rig.head, g, 0, 0.17, -0.01);
  g.rotation.x = -0.12;
  return g;
}

/** Long robe: torso + skirt to the ground with folds; sleeves on the arms. */
function robe(rig, mat, { hemR = 0.44, length = 1.0, tattered = false, seed = 1, sitting = false } = {}) {
  const rand = mulberry32(seed);
  const N = new Noise2D(seed);
  // torso piece (chest joint space)
  const torso = lathe([[0.15, -0.42], [0.19, -0.3], [0.21, -0.1], [0.215, 0.05], [0.2, 0.14], [0.12, 0.2], [0.06, 0.22]], 22,
    (a) => 0.03 * Math.sin(a * 7));
  torso.scale(1, 1, 0.78);
  attach(rig.chest, mesh(torso, mat), 0, 0, 0);
  // collar
  const collar = new THREE.TorusGeometry(0.075, 0.025, 6, 16);
  collar.rotateX(Math.PI / 2);
  attach(rig.chest, mesh(collar, mat), 0, 0.2, 0);

  if (!sitting) {
    const L = length;
    const prof = [[0.17, 0.08], [0.2, -0.06], [0.26, -L * 0.3], [hemR * 0.85, -L * 0.75], [hemR, -L + 0.02], [hemR * 1.02, -L]];
    const skirt = lathe(prof, 32, (a, t, y) => {
      const f = 0.06 * Math.sin(a * 9 + N.noise(a, 0) * 2) * t + 0.03 * N.noise(a * 4, y * 3) * t;
      return f;
    });
    skirt.scale(1, 1, 0.82);
    if (tattered) {
      const p = skirt.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) < -L + 0.05) p.setY(i, p.getY(i) + rand() * 0.16);
      }
      skirt.computeVertexNormals();
    }
    attach(rig.pelvis, mesh(skirt, mat), 0, 0.02, 0);
  } else {
    // seated: cloth over the thighs and a drape from the knees
    for (const s of ['L', 'R']) {
      const th = new THREE.CylinderGeometry(0.11, 0.13, 0.48, 14, 1, true);
      attach(rig[`hip${s}`], mesh(th, mat), 0, -0.22, 0);
      const drape = lathe([[0.14, 0.02], [0.16, -0.2], [0.2, -0.42], [0.21, -0.44]], 16, (a, t) => 0.05 * Math.sin(a * 6) * t);
      attach(rig[`knee${s}`], mesh(drape, mat), 0, 0, 0);
    }
    const seat = lathe([[0.17, 0.08], [0.21, -0.04], [0.23, -0.12], [0.0, -0.13]], 20);
    attach(rig.pelvis, mesh(seat, mat), 0, 0, 0);
  }

  // bell sleeves on upper + lower arm
  for (const s of ['L', 'R']) {
    const up = new THREE.CylinderGeometry(0.07, 0.085, 0.32, 12, 1, true);
    attach(rig[`shoulder${s}`], mesh(up, mat), 0, -0.15, 0);
    const bell = lathe([[0.075, 0.02], [0.09, -0.1], [0.13, -0.24], [0.135, -0.26]], 14, (a, t) => 0.06 * Math.sin(a * 5) * t);
    attach(rig[`elbow${s}`], mesh(bell, mat), 0, 0, 0);
  }
}

function hands(rig, mat, { bony = false } = {}) {
  for (const s of ['L', 'R']) {
    const g = new THREE.Group();
    if (bony) {
      const palm = new THREE.BoxGeometry(0.06, 0.07, 0.02);
      g.add(mesh(palm, mat).translateY(-0.04));
      for (let f = 0; f < 4; f++) {
        const fin = new THREE.CylinderGeometry(0.006, 0.005, 0.09, 4);
        const fm = mesh(fin, mat);
        fm.position.set(-0.022 + f * 0.015, -0.11, 0.008);
        fm.rotation.x = 0.35;
        g.add(fm);
      }
    } else {
      const hnd = new THREE.SphereGeometry(0.045, 10, 8);
      hnd.scale(0.8, 1.15, 0.55);
      g.add(mesh(hnd, mat).translateY(-0.05));
    }
    attach(rig[`hand${s}`], g, 0, 0, 0);
  }
}

/** Crooked wooden staff, optionally with a glowing stone. */
function staff(rig, { length = 1.9, crook = true, glow = null, seed = 3 } = {}) {
  const rand = mulberry32(seed);
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push([(rand() - 0.5) * 0.06, -length * 0.55 + t * length, (rand() - 0.5) * 0.06]);
  }
  if (crook) { // gnarled hook at the top
    const top = pts[pts.length - 1];
    pts.push([top[0] + 0.08, top[1] + 0.12, top[2]], [top[0] + 0.2, top[1] + 0.1, top[2]], [top[0] + 0.22, top[1] - 0.02, top[2]]);
  }
  const g = new THREE.Group();
  g.add(mesh(tube(pts, (t) => 0.024 - t * 0.008 + 0.006 * Math.sin(t * 40), 40, 6), woodMat()));
  if (glow) {
    const top = pts[pts.length - (crook ? 4 : 1)];
    const orb = mesh(new THREE.IcosahedronGeometry(0.045, 1), glowMat(glow, 3.5), false);
    orb.position.set(top[0], top[1] + 0.05, top[2]);
    g.add(orb);
  }
  const hand = rig.handR;
  g.position.set(0, -0.06, 0.02);
  hand.add(g);
  // counter-rotate so the staff stays near-vertical whatever the arm pose
  rig.root.updateMatrixWorld(true);
  const hq = hand.getWorldQuaternion(new THREE.Quaternion());
  const rq = rig.root.getWorldQuaternion(new THREE.Quaternion());
  g.quaternion.copy(hq.invert().multiply(rq)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, -0.1)));
  return g;
}

// ------------------------------------------------------------ characters

/**
 * Bake the posed rig (scale included) into one mesh per material: a figure
 * is ~40 primitives, which would otherwise be ~40 draw calls (x2 for shadows).
 */
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

function finish(rig, { scale = 1, colliderR = 0.45, lights = [], update = null } = {}) {
  rig.root.scale.setScalar(scale);
  return { object: bake(rig.root), colliders: [{ x: 0, z: 0, r: colliderR * scale }], lights, update };
}

/** Tall robed wizard with a long white beard, pointed hat and crooked staff. */
export function wizard(ctx, o = {}) {
  const rig = makeRig();
  const robeCol = o.robe ?? '#5a3a9a';
  const sheen = o.sheen ?? '#' + new THREE.Color(robeCol).lerp(new THREE.Color('#ffffff'), 0.35).getHexString();
  const mat = robeMaterial(ctx.assets, robeCol, sheen, o.rim ?? 0.6);
  const hatMat = robeMaterial(ctx.assets, o.hat ?? robeCol, sheen, o.rim ?? 0.6);
  robe(rig, mat, { hemR: o.hemR ?? 0.46, length: 0.98, seed: o.seed ?? 1 });
  head(rig, { beard: o.beard ?? '#eeeaff', beardLen: o.beardLen ?? 0.55, hair: o.beard ?? '#eeeaff' });
  if (o.hat !== false) wizardHat(rig, hatMat, { height: o.hatHeight ?? 0.62, bend: o.hatBend ?? 0.24 });
  hands(rig, skinMat());
  const belt = new THREE.TorusGeometry(0.19, 0.022, 6, 20);
  belt.rotateX(Math.PI / 2);
  belt.scale(1, 1, 0.8);
  attach(rig.spine, mesh(belt, leatherMat(o.belt ?? 0x3a2418)), 0, -0.02, 0);
  applyPose(rig, o.pose ?? 'staff');
  if (o.staff !== false) staff(rig, { length: o.staffLength ?? 1.95, glow: o.staffGlow ?? null, seed: o.seed ?? 3 });
  const lights = o.staffGlow ? [{ x: 0.3, y: 2.0, z: 0.3, color: o.staffGlow, intensity: 2.5, distance: 7 }] : [];
  return finish(rig, { scale: o.height ? o.height / 1.85 : 1.08, lights });
}

/** Small round gnome wizard (sits on a bench). */
export function gnome(ctx, o = {}) {
  const rig = makeRig();
  const mat = robeMaterial(ctx.assets, o.robe ?? '#2a5ad0', o.sheen ?? '#a0c8ff', 0.6);
  robe(rig, mat, { sitting: (o.pose ?? 'sit') === 'sit', seed: 9, hemR: 0.4 });
  head(rig, { beard: '#f4f2ff', beardLen: 0.38, hair: '#f4f2ff' });
  rig.head.scale.setScalar(1.35); // gnome: big head, short body
  wizardHat(rig, robeMaterial(ctx.assets, o.hat ?? '#1e44b0', '#a0c8ff', 0.6), { height: o.hatHeight ?? 0.5, brim: 0.26, bend: 0.3 });
  hands(rig, skinMat());
  applyPose(rig, o.pose ?? 'sit');
  if (o.pipe !== false) {
    const pipe = tube([[0, 0, 0], [0, -0.02, 0.08], [0.01, 0.0, 0.14]], 0.008, 8, 5);
    attach(rig.head, mesh(pipe, woodMat()), 0.03, -0.05, 0.1);
    const bowl = mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.03, 8), woodMat());
    attach(rig.head, bowl, 0.04, -0.03, 0.24);
    const ember = mesh(new THREE.SphereGeometry(0.01, 6, 4), glowMat('#ff8a30', 8), false);
    attach(rig.head, ember, 0.04, -0.015, 0.24);
  }
  rig.pelvis.scale.set(1.25, 1, 1.2);
  return finish(rig, { scale: o.scale ?? 0.62, colliderR: 0.35 });
}

/** Knight in full, very shiny plate armour with a cape. */
export function knight(ctx, o = {}) {
  const rig = makeRig();
  const A = armorMaterial(ctx.assets, o.armor ? new THREE.Color(o.armor).getHex() : 0xb4aed0, !!o.dull);
  const under = leatherMat(0x1c1420);
  // dark chainmail between the plates (what makes a knight read as a knight)
  const mail = cached('mail', () => { const t = ctx.assets.pbr('metal_plate', [8, 8], { color: false }); return stylize(new THREE.MeshStandardMaterial({ color: 0x24222a, metalness: 0.8, roughness: 0.55, normalMap: t.normalMap, normalScale: new THREE.Vector2(1.5, 1.5), envMapIntensity: 0.6 }), { rim: 0.3 }); });
  // breastplate + backplate
  const breast = lathe([[0.16, -0.36], [0.2, -0.28], [0.24, -0.1], [0.26, 0.04], [0.245, 0.14], [0.15, 0.21], [0.07, 0.25]], 26,
    (a) => (Math.sin(a) > 0 ? 0.06 * Math.pow(Math.sin(a), 6) : 0)); // ridge down the front
  breast.scale(1, 1, 0.8);
  attach(rig.chest, mesh(breast, A));
  // gorget
  attach(rig.chest, mesh(lathe([[0.1, 0.18], [0.09, 0.24], [0.07, 0.3]], 16), A));
  // faulds + tassets (stacked lames)
  for (let i = 0; i < 3; i++) {
    const r0 = 0.2 + i * 0.026, y = -0.02 - i * 0.07;
    const lame = lathe([[r0, y], [r0 + 0.03, y - 0.08]], 22);
    lame.scale(1, 1, 0.82);
    attach(rig.pelvis, mesh(lame, A), 0, 0.1, 0);
  }
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    // pauldrons: layered domes
    for (let i = 0; i < 3; i++) {
      const d = new THREE.SphereGeometry(0.155 - i * 0.014, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45);
      const dm = mesh(d, A);
      dm.position.set(sx * 0.02, 0.02 - i * 0.055, 0);
      dm.rotation.z = sx * -0.5;
      dm.scale.set(1.0, 0.85, 1.05);
      rig[`shoulder${s}`].add(dm);
    }
    // arms
    attach(rig[`shoulder${s}`], mesh(new THREE.CylinderGeometry(0.07, 0.064, 0.28, 12), mail), 0, -0.16, 0);
    const couter = mesh(new THREE.SphereGeometry(0.08, 12, 8), A);
    attach(rig[`elbow${s}`], couter);
    const fan = mesh(new THREE.CircleGeometry(0.075, 10), A);
    fan.position.set(sx * 0.05, 0, -0.02);
    fan.rotation.y = sx * Math.PI / 2;
    rig[`elbow${s}`].add(fan);
    attach(rig[`elbow${s}`], mesh(new THREE.CylinderGeometry(0.07, 0.058, 0.24, 12), A), 0, -0.13, 0);
    // gauntlet
    const gaunt = new THREE.Group();
    const cuff = mesh(lathe([[0.05, 0.02], [0.065, -0.05], [0.07, -0.06]], 12), A);
    gaunt.add(cuff);
    const hand = new THREE.BoxGeometry(0.075, 0.1, 0.045);
    gaunt.add(mesh(hand, A).translateY(-0.1));
    attach(rig[`hand${s}`], gaunt);
    // legs
    attach(rig[`hip${s}`], mesh(new THREE.CylinderGeometry(0.1, 0.082, 0.42, 14), mail), 0, -0.22, 0);
    const cuisse = mesh(new THREE.CylinderGeometry(0.108, 0.09, 0.3, 14, 1, true, -1.2, 2.4), A);
    cuisse.rotation.y = Math.PI / 2 - 1.57;
    attach(rig[`hip${s}`], cuisse, 0, -0.18, 0.01);
    const poleyn = mesh(new THREE.SphereGeometry(0.085, 12, 8), A);
    poleyn.scale.set(1, 1.1, 1.2);
    attach(rig[`knee${s}`], poleyn, 0, 0, 0.02);
    const greave = lathe([[0.075, 0.0], [0.085, -0.12], [0.068, -0.32], [0.058, -0.4]], 14);
    attach(rig[`knee${s}`], mesh(greave, A));
    const sab = new THREE.BoxGeometry(0.1, 0.07, 0.24, 2, 1, 4);
    const sp = sab.attributes.position;
    for (let i = 0; i < sp.count; i++) if (sp.getZ(i) > 0.05) { sp.setY(i, sp.getY(i) * 0.6); sp.setX(i, sp.getX(i) * 0.75); }
    sab.computeVertexNormals();
    attach(rig[`foot${s}`], mesh(sab, A), 0, -0.02, 0.06);
  }
  // helmet: rounded bascinet with a pointed visor and eye slit
  const helm = new THREE.Group();
  const dome = new THREE.SphereGeometry(0.135, 22, 16);
  dome.scale(0.95, 1.12, 1.05);
  helm.add(mesh(dome, A));
  const visor = new THREE.ConeGeometry(0.11, 0.17, 14, 1, true);
  visor.rotateX(Math.PI / 2);
  visor.scale(1.05, 0.9, 1);
  const vm = mesh(visor, A);
  vm.position.set(0, -0.03, 0.12);
  helm.add(vm);
  const slit = mesh(new THREE.BoxGeometry(0.15, 0.012, 0.02), darkMat(), false);
  slit.position.set(0, 0.02, 0.135);
  helm.add(slit);
  const crest = new THREE.TorusGeometry(0.14, 0.012, 4, 20, Math.PI);
  const cm = mesh(crest, A);
  cm.rotation.y = Math.PI / 2;
  cm.position.y = 0.02;
  helm.add(cm);
  if (o.plume) {
    const pl = tube([[0, 0.14, -0.02], [0, 0.24, -0.1], [0, 0.22, -0.26], [0, 0.1, -0.34]], (t) => 0.035 * (1 - t * 0.6), 16, 8);
    helm.add(mesh(pl, robeMaterial(ctx.assets, o.plume, '#ffd0e0')));
  }
  attach(rig.head, helm, 0, 0.09, 0);
  // cape
  if (o.cape && (o.pose ?? 'stand') === 'stand') {
    const cmat = robeMaterial(ctx.assets, o.cape, '#ff9ab0', 1.0);
    const sitting = (o.pose ?? 'stand') !== 'stand';
    const L = sitting ? 0.7 : 1.25;
    const cape = new THREE.PlaneGeometry(0.62, L, 10, 12);
    const cp = cape.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i), y = cp.getY(i);
      const t = (L / 2 - y) / L;
      cp.setZ(i, -0.16 - t * (sitting ? 0.25 : 0.1) - 0.05 * Math.cos(x * 14) * t - Math.abs(x) * 0.25);
      cp.setX(i, x * (1 + t * 0.5));
    }
    cape.translate(0, -L / 2 + 0.2, 0);
    cape.computeVertexNormals();
    attach(rig.chest, mesh(cape, cmat));
  }
  // sword (planted or at the hip)
  if (o.sword !== false) {
    const sw = new THREE.Group();
    const blade = new THREE.BoxGeometry(0.05, 0.9, 0.012);
    blade.translate(0, -0.5, 0);
    sw.add(mesh(blade, A));
    sw.add(mesh(new THREE.BoxGeometry(0.22, 0.03, 0.04), A).translateY(-0.04));
    sw.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 6), leatherMat(0x40202a)).translateY(0.05));
    sw.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), A).translateY(0.14));
    if (o.pose === 'sitSword') {
      sw.position.set(0, 0.62, 0.32);
      rig.root.add(sw);
    } else {
      sw.rotation.z = 0.25;
      attach(rig.hipL, sw, 0.1, 0.05, 0.02);
    }
  }
  // underlayer: dark mail at the joints
  attach(rig.spine, mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.2, 14), under), 0, -0.02, 0);
  applyPose(rig, o.pose ?? 'stand');
  return finish(rig, { scale: o.height ? o.height / 1.85 : 1.0 });
}

/** Hooded skeleton in a black robe; bones glow faintly green. */
export function skeleton(ctx, o = {}) {
  const rig = makeRig();
  const glow = o.glow ?? '#4dff8a';
  const bone = boneMaterial(glow, o.glowStrength ?? 0.12);
  const mat = robeMaterial(ctx.assets, o.robe ?? '#0c0a12', o.sheen ?? '#5a7a8a', 1.6);
  robe(rig, mat, { hemR: 0.42, length: 0.92, tattered: true, seed: 13 });
  // skull inside a deep hood
  const sk = skullGroup(bone, { socketGlow: glow });
  sk.position.set(0, 0.07, 0.03);
  rig.head.add(sk);
  // cowl: a sphere shell with a wide opening at the front (+Z)
  const hood = new THREE.SphereGeometry(0.165, 22, 16, Math.PI * 0.5 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.86);
  hood.scale(1.05, 1.3, 1.2);
  const hm = mesh(hood, mat);
  hm.position.set(0, 0.1, -0.035);
  // pointed peak
  const peak = new THREE.ConeGeometry(0.1, 0.16, 12, 1, true);
  peak.rotateX(-0.6);
  const pk = mesh(peak, mat);
  pk.position.set(0, 0.3, -0.07);
  rig.head.add(pk);
  rig.head.add(hm);
  // hood drape onto shoulders
  const drape = lathe([[0.12, 0.05], [0.2, -0.05], [0.26, -0.14]], 20);
  attach(rig.neck, mesh(drape, mat), 0, 0, 0);
  // bony hands + forearm bones poking from the sleeves
  hands(rig, bone, { bony: true });
  for (const s of ['L', 'R']) {
    const ra = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 5);
    attach(rig[`elbow${s}`], mesh(ra, bone), 0.012, -0.14, 0);
    attach(rig[`elbow${s}`], mesh(ra.clone(), bone), -0.012, -0.14, 0);
  }
  // ribs visible in the open chest of the robe
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.TorusGeometry(0.09 - i * 0.008, 0.008, 4, 12, Math.PI * 0.9);
    const rm = mesh(rib, bone);
    rm.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI * 0.05);
    rm.position.set(0, 0.08 - i * 0.05, 0.1);
    rig.chest.add(rm);
  }
  applyPose(rig, o.pose ?? 'reach');
  // scythe
  if (o.scythe !== false) {
    const g = new THREE.Group();
    g.add(mesh(tube([[0, -1.0, 0], [0.02, 0, 0.01], [-0.01, 0.9, 0]], 0.02, 10, 6), woodMat()));
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, 0);
    bladeShape.quadraticCurveTo(0.5, 0.15, 0.85, -0.25);
    bladeShape.quadraticCurveTo(0.45, -0.02, 0, -0.08);
    const bl = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.01, bevelEnabled: false });
    const bm = mesh(bl, armorMaterial(ctx.assets, 0xa0a8c0));
    bm.position.set(0, 0.88, 0);
    g.add(bm);
    g.position.set(0, -0.05, 0.02);
    rig.handR.add(g);
    rig.root.updateMatrixWorld(true);
    const hq = rig.handR.getWorldQuaternion(new THREE.Quaternion()).invert();
    g.quaternion.copy(hq).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.6, 0.15)));
  }
  const lights = [{ x: 0, y: 1.7, z: 0.5, color: glow, intensity: 2.5, distance: 6 }];
  return finish(rig, { scale: o.height ? o.height / 1.85 : 1.1, lights });
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

/**
 * Hooded figure (surface): long robe, deep peaked hood with a black void for a
 * face. Matte cloth for the painted world; colour sets the mood (black, red, magenta).
 */
export function hooded(ctx, o = {}) {
  const rig = makeRig();
  const color = o.robe ?? '#14121a';
  const mat = cached(`hoodcloth:${color}`, () => stylize(new THREE.MeshStandardMaterial({
    normalMap: ctx.assets.pbr('velour_velvet', [3, 3], { color: false, rough: false }).normalMap,
    normalScale: new THREE.Vector2(0.5, 0.5), color, roughness: 1, side: THREE.DoubleSide,
  }), { rim: o.rim ?? 0.35, rimPower: 3 }));
  const pose = o.pose ?? 'walk';
  robe(rig, mat, { hemR: o.hemR ?? 0.5, length: 1.02, tattered: o.tattered ?? true, seed: o.seed ?? 17, sitting: false });
  // hood: shell open at the front, pointed peak, black void inside
  const hood = new THREE.SphereGeometry(0.17, 22, 16, Math.PI * 0.5 + 0.8, Math.PI * 2 - 1.6, 0, Math.PI * 0.9);
  hood.scale(1.08, 1.32, 1.22);
  const hm = mesh(hood, mat);
  hm.position.set(0, 0.1, -0.02);
  rig.head.add(hm);
  const peak = new THREE.ConeGeometry(0.11, 0.2, 12, 1, true);
  peak.rotateX(-0.75);
  const pk = mesh(peak, mat);
  pk.position.set(0, 0.32, -0.1);
  rig.head.add(pk);
  const voidm = mesh(new THREE.SphereGeometry(0.13, 12, 10), darkMat(), false);
  voidm.scale.set(0.9, 1.1, 0.7);
  voidm.position.set(0, 0.08, 0.04);
  rig.head.add(voidm);
  // cape over the shoulders
  const cape = lathe([[0.12, 0.06], [0.24, -0.06], [0.3, -0.2], [0.31, -0.24]], 20, (a, t) => 0.05 * Math.sin(a * 5) * t);
  attach(rig.neck, mesh(cape, mat), 0, 0, 0);
  hands(rig, cached('hoodhand', () => new THREE.MeshStandardMaterial({ color: 0x2a2228, roughness: 1 })));
  applyPose(rig, pose);
  const lights = [];
  if (o.staff) staff(rig, { length: 1.9, seed: o.seed ?? 5 });
  if (o.torch) {
    const t = new THREE.Group();
    t.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 6), woodMat()).translateY(0.15));
    const flame = mesh(new THREE.ConeGeometry(0.06, 0.22, 8), glowMat(o.torch, 3), false);
    flame.position.y = 0.6;
    t.add(flame);
    t.position.set(0, -0.06, 0.03);
    rig.handR.add(t);
    rig.root.updateMatrixWorld(true);
    t.quaternion.copy(rig.handR.getWorldQuaternion(new THREE.Quaternion()).invert());
    lights.push({ x: 0.25, y: 2.3, z: 0.3, color: o.torch, intensity: o.torchLight ?? 5, distance: 9, flicker: 0.25 });
  }
  return finish(rig, { scale: o.height ? o.height / 1.85 : 1.0, lights });
}
