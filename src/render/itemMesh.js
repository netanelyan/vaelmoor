import * as THREE from 'three';

// Procedural models for every item kind in data/items.json (`mesh.kind`).
// Weapons hold their grip at the origin with the business end along +Y, so
// the same model serves the inventory preview, the first-person hands and
// loot on the ground.

const mats = new Map();
function mat(color, { metal = 0, rough = 0.7, emissive = null, transparent = false, opacity = 1, side = THREE.FrontSide } = {}) {
  const key = `${color}|${metal}|${rough}|${emissive}|${opacity}|${side}`;
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({
      color, metalness: metal, roughness: rough, transparent, opacity, side,
      emissive: emissive ? new THREE.Color(emissive) : new THREE.Color(0), emissiveIntensity: emissive ? 1.2 : 0,
    }));
  }
  return mats.get(key);
}
const metalMat = (c) => mat(c ?? '#8a8c92', { metal: 0.85, rough: 0.35 });
const woodMat = (c) => mat(c ?? '#4a3220', { rough: 0.8 });
const leatherMat = (c) => mat(c ?? '#3a2416', { rough: 0.9 });

function m(geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, material);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.castShadow = true;
  return o;
}

/** Tapered, diamond-section blade along +Y. */
function blade(len, width, thick, curve = 0) {
  const g = new THREE.CylinderGeometry(0.0005, width / 2, len, 4, 6);
  g.rotateY(Math.PI / 4);
  g.scale(1, 1, thick / width);
  g.translate(0, len / 2, 0);
  if (curve) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = p.getY(i) / len; p.setX(i, p.getX(i) + curve * t * t * len); }
    g.computeVertexNormals();
  }
  return g;
}

const BUILD = {
  sword(s) {
    const g = new THREE.Group();
    const L = s.length ?? 0.85;
    g.add(m(blade(L, 0.05, 0.012, s.curve ?? 0), metalMat(s.metal), 0, 0.1, 0));
    g.add(m(new THREE.BoxGeometry(0.2, 0.022, 0.04), metalMat(s.guard ?? s.metal), 0, 0.1, 0));
    g.add(m(new THREE.CylinderGeometry(0.016, 0.018, 0.16, 8), leatherMat(s.grip), 0, 0.01, 0));
    g.add(m(new THREE.SphereGeometry(0.026, 10, 8), metalMat(s.guard ?? s.metal), 0, -0.08, 0));
    return g;
  },
  dagger(s) {
    const g = new THREE.Group();
    g.add(m(blade(0.32, 0.04, 0.01), metalMat(s.metal), 0, 0.07, 0));
    g.add(m(new THREE.BoxGeometry(0.11, 0.018, 0.03), metalMat(s.metal), 0, 0.07, 0));
    g.add(m(new THREE.CylinderGeometry(0.014, 0.016, 0.11, 8), leatherMat(s.grip), 0, 0.01, 0));
    return g;
  },
  axe(s) {
    const g = new THREE.Group();
    g.add(m(new THREE.CylinderGeometry(0.018, 0.022, 0.62, 8), woodMat(s.grip), 0, 0.22, 0));
    const head = new THREE.Shape();
    head.moveTo(0, 0.05); head.quadraticCurveTo(0.1, 0.06, 0.15, 0.13); head.lineTo(0.16, -0.1); head.quadraticCurveTo(0.1, -0.05, 0, -0.04); head.lineTo(0, 0.05);
    const hg = new THREE.ExtrudeGeometry(head, { depth: 0.014, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 });
    hg.translate(0.01, 0, -0.007);
    g.add(m(hg, metalMat(s.metal), 0, 0.46, 0));
    g.add(m(new THREE.BoxGeometry(0.05, 0.1, 0.04), metalMat(s.metal), 0, 0.46, 0));
    return g;
  },
  mace(s) {
    const g = new THREE.Group();
    g.add(m(new THREE.CylinderGeometry(0.018, 0.02, 0.56, 8), metalMat('#3a3a3e'), 0, 0.2, 0));
    g.add(m(new THREE.IcosahedronGeometry(0.075, 0), metalMat(s.metal), 0, 0.5, 0));
    for (let i = 0; i < 6; i++) g.add(m(new THREE.BoxGeometry(0.012, 0.09, 0.1), metalMat(s.metal), 0, 0.5, 0, 0, (i * Math.PI) / 6, 0));
    return g;
  },
  bow(s) {
    const g = new THREE.Group();
    const L = (s.length ?? 1.3) / 2;
    const pts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16 * 2 - 1; pts.push(new THREE.Vector3(-0.14 * (1 - t * t) + 0.03 * t * t * t * t, t * L, 0)); }
    g.add(m(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.016, 6), woodMat(s.wood)));
    g.add(m(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 8), leatherMat(), -0.14, 0, 0));
    const str = new THREE.BufferGeometry().setFromPoints([pts[0], pts[16]]);
    g.add(new THREE.Line(str, new THREE.LineBasicMaterial({ color: 0xd8d0c0 })));
    return g;
  },
  arrow(s) {
    const g = new THREE.Group();
    g.add(m(new THREE.CylinderGeometry(0.005, 0.005, 0.75, 5), woodMat('#8a6a40'), 0, 0.37, 0));
    g.add(m(new THREE.ConeGeometry(0.012, 0.05, 4), metalMat(s.metal), 0, 0.77, 0));
    for (let i = 0; i < 3; i++) g.add(m(new THREE.BoxGeometry(0.001, 0.08, 0.02), mat('#d8d0c0'), Math.cos(i * 2.1) * 0.01, 0.05, Math.sin(i * 2.1) * 0.01, 0, i * 2.1, 0));
    return g;
  },
  helmet(s) {
    const g = new THREE.Group();
    const c = s.metal ? metalMat(s.color) : leatherMat(s.color);
    g.add(m(new THREE.SphereGeometry(0.13, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), c));
    if (s.metal) {
      g.add(m(new THREE.BoxGeometry(0.02, 0.12, 0.04), c, 0, -0.03, 0.12));
      g.add(m(new THREE.TorusGeometry(0.13, 0.01, 6, 24), c, 0, 0.0, 0, Math.PI / 2));
    } else {
      g.add(m(new THREE.TorusGeometry(0.13, 0.014, 6, 24), leatherMat(s.trim), 0, 0.0, 0, Math.PI / 2));
      for (const sx of [-1, 1]) g.add(m(new THREE.ConeGeometry(0.02, 0.12, 6), mat('#d8d0b8', { rough: 0.6 }), sx * 0.1, 0.1, 0, 0, 0, -sx * 0.6));
    }
    return g;
  },
  hood(s) {
    const g = new THREE.Group();
    g.add(m(new THREE.SphereGeometry(0.14, 20, 14, Math.PI * 0.65, Math.PI * 1.7, 0, Math.PI * 0.75), mat(s.color, { rough: 1, side: THREE.DoubleSide })));
    return g;
  },
  cuirass(s) {
    const g = new THREE.Group();
    const c = s.metal ? metalMat(s.color) : s.cloth ? mat(s.color, { rough: 1 }) : leatherMat(s.color);
    const body = new THREE.LatheGeometry([[0.15, -0.3], [0.19, -0.2], [0.21, 0], [0.22, 0.12], [0.16, 0.2], [0.08, 0.24]].map(([r, y]) => new THREE.Vector2(r, y)), 22);
    body.scale(1, 1, 0.72);
    g.add(m(body, c));
    for (const sx of [-1, 1]) g.add(m(new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), c, sx * 0.2, 0.17, 0, 0, 0, -sx * 0.4));
    if (!s.metal) g.add(m(new THREE.TorusGeometry(0.18, 0.014, 6, 22), leatherMat(s.trim), 0, -0.22, 0, Math.PI / 2));
    return g;
  },
  gloves(s) {
    const g = new THREE.Group();
    const c = s.metal ? metalMat(s.color) : leatherMat(s.color);
    for (const sx of [-1, 1]) {
      g.add(m(new THREE.CylinderGeometry(0.04, 0.045, 0.16, 10), c, sx * 0.09, 0, 0));
      g.add(m(new THREE.BoxGeometry(0.075, 0.08, 0.04), c, sx * 0.09, -0.11, 0));
    }
    return g;
  },
  boots(s) {
    const g = new THREE.Group();
    const c = s.metal ? metalMat(s.color) : leatherMat(s.color);
    for (const sx of [-1, 1]) {
      g.add(m(new THREE.CylinderGeometry(0.05, 0.055, 0.2, 10), c, sx * 0.08, 0.1, 0));
      g.add(m(new THREE.BoxGeometry(0.09, 0.06, 0.2), c, sx * 0.08, 0.0, 0.05));
    }
    return g;
  },
  shield(s) {
    const g = new THREE.Group();
    if (s.round) {
      g.add(m(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 28), metalMat(s.color), 0, 0, 0, Math.PI / 2));
      g.add(m(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), metalMat(s.metal), 0, 0, 0.015, Math.PI / 2));
    } else {
      const sh = new THREE.Shape();
      sh.moveTo(-0.26, 0.3); sh.lineTo(0.26, 0.3); sh.lineTo(0.26, -0.05); sh.quadraticCurveTo(0.24, -0.3, 0, -0.42); sh.quadraticCurveTo(-0.24, -0.3, -0.26, -0.05); sh.lineTo(-0.26, 0.3);
      g.add(m(new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }), woodMat(s.color), 0, 0, -0.015));
      for (const y of [0.18, -0.12]) g.add(m(new THREE.BoxGeometry(0.54, 0.035, 0.04), metalMat(s.metal), 0, y, 0.005));
    }
    return g;
  },
  potion(s) {
    const g = new THREE.Group();
    const k = s.big ? 1.3 : 1;
    g.add(m(new THREE.SphereGeometry(0.055 * k, 16, 12), mat(s.color, { rough: 0.15, metal: 0.1, transparent: true, opacity: 0.88, emissive: s.color }), 0, 0.055 * k, 0));
    g.add(m(new THREE.CylinderGeometry(0.018 * k, 0.024 * k, 0.06 * k, 10), mat('#c8d8e0', { rough: 0.1, transparent: true, opacity: 0.6 }), 0, 0.12 * k, 0));
    g.add(m(new THREE.CylinderGeometry(0.02 * k, 0.018 * k, 0.025 * k, 8), woodMat('#6a4a2a'), 0, 0.16 * k, 0));
    return g;
  },
  bottle(s) {
    const g = new THREE.Group();
    g.add(m(new THREE.CylinderGeometry(0.04, 0.045, 0.16, 12), mat(s.color, { rough: 0.2, transparent: true, opacity: 0.9 }), 0, 0.08, 0));
    g.add(m(new THREE.CylinderGeometry(0.014, 0.03, 0.08, 10), mat(s.color, { rough: 0.2 }), 0, 0.2, 0));
    return g;
  },
  bread() {
    const g = new THREE.Group();
    const b = new THREE.SphereGeometry(0.09, 16, 10); b.scale(1.4, 0.6, 0.9);
    g.add(m(b, mat('#b07a3a', { rough: 0.9 }), 0, 0.05, 0));
    return g;
  },
  apple(s) {
    const g = new THREE.Group();
    g.add(m(new THREE.SphereGeometry(0.045, 14, 10), mat(s.color, { rough: 0.4 }), 0, 0.045, 0));
    g.add(m(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 4), woodMat(), 0, 0.1, 0));
    return g;
  },
  herb(s) {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) g.add(m(new THREE.ConeGeometry(0.012, 0.16, 4), mat(s.color, { rough: 0.9, side: THREE.DoubleSide }), Math.cos(i) * 0.02, 0.08, Math.sin(i) * 0.02, Math.cos(i * 1.7) * 0.4, 0, Math.sin(i * 1.7) * 0.4));
    return g;
  },
  mushroom(s) {
    const g = new THREE.Group();
    g.add(m(new THREE.CylinderGeometry(0.012, 0.016, 0.08, 8), mat('#e0d8c8'), 0, 0.04, 0));
    g.add(m(new THREE.SphereGeometry(0.045, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(s.color, { rough: 0.6 }), 0, 0.075, 0));
    return g;
  },
  berries(s) {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) g.add(m(new THREE.SphereGeometry(0.016, 8, 6), mat(s.color, { rough: 0.3 }), Math.cos(i * 2.4) * 0.03 * Math.sqrt(i / 9), 0.02 + (i % 3) * 0.012, Math.sin(i * 2.4) * 0.03 * Math.sqrt(i / 9)));
    return g;
  },
  flower(s) {
    const g = new THREE.Group();
    g.add(m(new THREE.CylinderGeometry(0.003, 0.004, 0.16, 4), mat('#3a6a3a'), 0, 0.08, 0));
    for (let i = 0; i < 6; i++) {
      const p = new THREE.SphereGeometry(0.03, 8, 6); p.scale(0.5, 0.15, 1);
      g.add(m(p, mat(s.color, { rough: 0.5, side: THREE.DoubleSide }), Math.sin(i) * 0.025, 0.16, Math.cos(i) * 0.025, 0.3, i, 0));
    }
    return g;
  },
  wing(s) {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) { const w = new THREE.CircleGeometry(0.06, 12); w.scale(1, 0.6, 1); g.add(m(w, mat(s.color, { rough: 0.5, side: THREE.DoubleSide, emissive: s.color }), sx * 0.05, 0.04, 0, -1.2, 0, sx * 0.3)); }
    return g;
  },
  salt(s) {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) g.add(m(new THREE.IcosahedronGeometry(0.02, 0), mat(s.color, { rough: 0.7 }), Math.cos(i) * 0.025, 0.015, Math.sin(i) * 0.025, i, i * 2, 0));
    return g;
  },
  fang() {
    const g = new THREE.Group();
    const f = new THREE.ConeGeometry(0.012, 0.06, 6); f.translate(0, 0.03, 0);
    g.add(m(f, mat('#e8e0c8', { rough: 0.4 }), 0, 0, 0, 0, 0, 0.3));
    return g;
  },
  book(s) {
    const g = new THREE.Group();
    g.add(m(new THREE.BoxGeometry(0.17, 0.04, 0.23), leatherMat(s.color), 0, 0.02, 0));
    g.add(m(new THREE.BoxGeometry(0.16, 0.034, 0.22), mat('#e0d4b8', { rough: 0.9 }), 0.006, 0.02, 0));
    return g;
  },
  lockpick() {
    const g = new THREE.Group();
    g.add(m(new THREE.BoxGeometry(0.006, 0.12, 0.003), metalMat('#a0a0a8'), 0, 0.06, 0));
    g.add(m(new THREE.BoxGeometry(0.02, 0.006, 0.003), metalMat('#a0a0a8'), 0.007, 0.12, 0));
    return g;
  },
  ingot(s) {
    const g = new THREE.Group();
    const b = new THREE.CylinderGeometry(0.03, 0.045, 0.16, 4, 1); b.rotateY(Math.PI / 4); b.rotateZ(Math.PI / 2); b.scale(1, 0.6, 1);
    g.add(m(b, metalMat(s.color), 0, 0.02, 0));
    return g;
  },
  leather(s) {
    const g = new THREE.Group();
    const p = new THREE.PlaneGeometry(0.3, 0.22, 6, 4); const pa = p.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.sin(pa.getX(i) * 20) * 0.01);
    p.rotateX(-Math.PI / 2); p.computeVertexNormals();
    g.add(m(p, mat(s.color, { rough: 1, side: THREE.DoubleSide }), 0, 0.01, 0));
    return g;
  },
  strips(s) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) g.add(m(new THREE.TorusGeometry(0.04 + i * 0.006, 0.004, 4, 16), leatherMat(s.color), 0, 0.01 + i * 0.004, 0, Math.PI / 2));
    return g;
  },
  gem(s) {
    const g = new THREE.Group();
    g.add(m(new THREE.OctahedronGeometry(0.03, 0), mat(s.color, { metal: 0.2, rough: 0.05, emissive: s.color }), 0, 0.03, 0));
    return g;
  },
  ring(s) {
    const g = new THREE.Group();
    g.add(m(new THREE.TorusGeometry(0.022, 0.005, 8, 20), metalMat(s.color), 0, 0.022, 0));
    return g;
  },
  candle() {
    const g = new THREE.Group();
    g.add(m(new THREE.CylinderGeometry(0.02, 0.022, 0.12, 10), mat('#e8dcc0', { rough: 0.8 }), 0, 0.06, 0));
    g.add(m(new THREE.ConeGeometry(0.008, 0.03, 6), mat('#ffb050', { emissive: '#ff9030' }), 0, 0.14, 0));
    return g;
  },
  tankard() {
    const g = new THREE.Group();
    g.add(m(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 14), metalMat('#9a9a98'), 0, 0.06, 0));
    g.add(m(new THREE.TorusGeometry(0.035, 0.008, 6, 12, Math.PI), metalMat('#9a9a98'), 0.05, 0.06, 0, 0, 0, -Math.PI / 2));
    return g;
  },
};

/** A fresh model for an item definition (or a spell glow for "spell:<id>"). */
export function itemMesh(def) {
  const spec = def.mesh ?? { kind: 'misc' };
  const g = (BUILD[spec.kind] ?? BUILD.gem)(spec);
  g.userData.kind = spec.kind;
  return g;
}

/** Fit a model into a unit-ish box for previews; returns { size, center }. */
export function frame(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  return { size, center, radius: Math.max(size.x, size.y, size.z) / 2 };
}
