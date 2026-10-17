import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../engine/noise.js';
import { stylize, canvasTexture } from '../render/materials.js';

// Hero trees built from a recursive branching generator: the twisted black
// dead tree (ref_01) and the huge sentinel oak with leaf-card canopy (ref_10).

/**
 * Grow branches. Returns { geos: BufferGeometry[], tips: [{pos, dir, radius}] }.
 * opts: depth, length, radius, twist, spread, children, lenFalloff, radFalloff, up, gnarl
 */
function grow(rand, o) {
  const geos = [], tips = [];
  const v = new THREE.Vector3();
  const branch = (start, dir, len, rad, depth) => {
    const pts = [start.clone()];
    const d = dir.clone();
    const segs = 6;
    let p = start.clone();
    for (let i = 1; i <= segs; i++) {
      // wander + twist + a pull toward up (or droop)
      d.x += (rand() - 0.5) * o.gnarl;
      d.z += (rand() - 0.5) * o.gnarl;
      d.y += (rand() - 0.5) * o.gnarl * 0.5 + o.up;
      d.applyAxisAngle(v.set(0, 1, 0), o.twist * (rand() - 0.3));
      d.normalize();
      p = p.clone().addScaledVector(d, len / segs);
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeSegs = Math.max(4, Math.round(len * 1.2));
    const radial = depth === 0 ? 10 : depth < 3 ? 7 : 5;
    const g = new THREE.TubeGeometry(curve, tubeSegs, 1, radial, false);
    // taper the radius along the branch
    const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
    const c = new THREE.Vector3();
    for (let i = 0; i <= tubeSegs; i++) {
      const t = i / tubeSegs;
      curve.getPointAt(t, c);
      const r = rad * (1 - t * (1 - o.radFalloff)) * (depth === 0 ? 1 + 0.6 * Math.pow(1 - t, 6) : 1);
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        const bump = 1 + 0.12 * Math.sin(j * 2.3 + i * 1.7);
        pos.setXYZ(k, c.x + nrm.getX(k) * r * bump, c.y + nrm.getY(k) * r * bump, c.z + nrm.getZ(k) * r * bump);
        uv.setXY(k, uv.getX(k) * len / 1.2, uv.getY(k) * Math.max(1, Math.round(rad * 6)));
      }
    }
    g.computeVertexNormals();
    geos.push(g);
    const end = pts[pts.length - 1];
    if (depth >= o.depth) {
      tips.push({ pos: end.clone(), dir: d.clone(), radius: rad });
      return;
    }
    const n = o.children[Math.min(depth, o.children.length - 1)];
    for (let i = 0; i < n; i++) {
      // children sprout near the end, fanned around the parent axis
      const at = Math.min(1, 0.55 + 0.45 * ((i + 1) / n) + (rand() - 0.5) * 0.1);
      const sp = curve.getPointAt(at);
      const side = new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize();
      const cd = d.clone().multiplyScalar(1 - o.spread).addScaledVector(side, o.spread).normalize();
      cd.y += o.up * 3;
      cd.normalize();
      branch(sp, cd, len * o.lenFalloff * (0.8 + rand() * 0.4), rad * o.radFalloff * (0.85 + rand() * 0.3), depth + 1);
    }
  };
  branch(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, 1, 0), o.length, o.radius, 0);
  return { geos, tips };
}

function barkMaterial(assets, color, rim) {
  const t = assets.pbr('bark_brown_02', [1, 1]);
  const m = new THREE.MeshStandardMaterial({ ...t, color, roughness: 0.85, envMapIntensity: 0.4, normalScale: new THREE.Vector2(1.4, 1.4) });
  return stylize(m, { rim, rimPower: 2.6 });
}

/** ref_01: twisted, black, dead tree with spiky reaching branches. */
export function deadTree(ctx, o = {}) {
  const rand = mulberry32(o.seed ?? 71);
  const { geos } = grow(rand, {
    depth: 4, length: o.height ?? 7, radius: o.radius ?? 0.55, twist: 0.5, spread: 0.65,
    children: [3, 3, 2, 2], lenFalloff: 0.72, radFalloff: 0.5, up: 0.03, gnarl: 0.55,
  });
  // root flares
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rand();
    const pts = [new THREE.Vector3(0, 0.9, 0), new THREE.Vector3(Math.cos(a) * 1.0, 0.1, Math.sin(a) * 1.0), new THREE.Vector3(Math.cos(a) * 2.2, -0.35, Math.sin(a) * 2.2)];
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.25 * (o.radius ?? 0.55) / 0.55, 5, false));
  }
  const geo = mergeGeometries(geos.map((g) => g.toNonIndexed()));
  const mesh = new THREE.Mesh(geo, barkMaterial(ctx.assets, o.color ?? 0x1a1018, o.rim ?? 0.9));
  mesh.castShadow = mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return { object: g, colliders: [{ x: 0, z: 0, r: (o.radius ?? 0.55) * 1.6 }] };
}

let _leafTex;
function leafTexture() {
  return (_leafTex ||= canvasTexture(256, 256, (g, w, h) => {
    const r = mulberry32(8);
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const rr = Math.sqrt(r()) * (w * 0.44), ang = r() * Math.PI * 2;
      const x = w / 2 + Math.cos(ang) * rr, y = h / 2 + Math.sin(ang) * rr, s = 7 + r() * 11, a = r() * Math.PI * 2;
      const l = 140 + r() * 115;
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = `rgb(${l * 0.9},${l},${l * 0.85})`;
      g.beginPath();
      g.ellipse(0, 0, s * 0.45, s, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(40,40,40,0.5)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, -s); g.lineTo(0, s); g.stroke();
      g.restore();
    }
  }));
}

/** ref_10: huge broad oak — thick trunk, spreading limbs, leaf-card canopy. */
export function greatTree(ctx, o = {}) {
  const rand = mulberry32(o.seed ?? 81);
  const S = o.size ?? 1;
  const { geos, tips } = grow(rand, {
    depth: 4, length: 6.5 * S, radius: 1.5 * S, twist: 0.25, spread: 0.8,
    children: [5, 3, 3, 2], lenFalloff: 0.66, radFalloff: 0.55, up: 0.025, gnarl: 0.35,
  });
  // big root flares
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand() * 0.4;
    const pts = [new THREE.Vector3(0, 1.8 * S, 0), new THREE.Vector3(Math.cos(a) * 1.6 * S, 0.3, Math.sin(a) * 1.6 * S), new THREE.Vector3(Math.cos(a) * 3.6 * S, -0.4, Math.sin(a) * 3.6 * S)];
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.5 * S, 6, false));
  }
  const wood = new THREE.Mesh(mergeGeometries(geos.map((g) => g.toNonIndexed())), barkMaterial(ctx.assets, o.bark ?? 0x4a3a40, 0.6));
  wood.castShadow = wood.receiveShadow = true;

  // canopy: per tip, a dark inner blob plus a shell of leaf cards
  const blobs = [], cards = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), m = new THREE.Matrix4(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const card = new THREE.PlaneGeometry(1, 1);
  for (const t of tips) {
    const cr = (2.2 + rand() * 1.6) * S;
    const c = t.pos.clone().addScaledVector(t.dir, cr * 0.4);
    c.y += cr * 0.15;
    let blob = new THREE.IcosahedronGeometry(cr * 0.85, 2);
    blob.deleteAttribute('uv');
    blob.deleteAttribute('normal');
    blob = mergeVertices(blob);
    const bp = blob.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      p.fromBufferAttribute(bp, i);
      p.multiplyScalar(0.85 + rand() * 0.3);
      p.y *= 0.7;
      bp.setXYZ(i, p.x + c.x, p.y + c.y, p.z + c.z);
    }
    blob.computeVertexNormals();
    blob.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bp.count * 2), 2));
    blobs.push(blob);
    const n = Math.round(260 * (cr / (3 * S)) ** 2);
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1, a = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      p.set(r * Math.cos(a), u * 0.7, r * Math.sin(a)).multiplyScalar(cr * (0.75 + rand() * 0.35)).add(c);
      e.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      q.setFromEuler(e);
      const s = (0.55 + rand() * 0.5) * S;
      m.compose(p, q, sc.set(s, s, s));
      const g = card.clone().applyMatrix4(m);
      // normals point away from the cluster centre for soft, rounded shading
      const nn = g.attributes.normal;
      const pp = g.attributes.position;
      for (let k = 0; k < nn.count; k++) {
        p.fromBufferAttribute(pp, k).sub(c).normalize();
        nn.setXYZ(k, p.x, p.y, p.z);
      }
      const shade = 0.55 + rand() * 0.6, hue = rand();
      const col = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < col.length; k += 3) { col[k] = shade * (0.8 + 0.3 * hue); col[k + 1] = shade; col[k + 2] = shade * (0.85 + 0.35 * (1 - hue)); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      cards.push(g);
    }
  }
  const leafCol = new THREE.Color(o.leaves ?? '#2a5a3a');
  const blobMat = stylize(new THREE.MeshStandardMaterial({ color: leafCol.clone().multiplyScalar(0.8), roughness: 0.95 }), { rim: 0.25, sway: 0.03, swayHeight: 20 });
  const cardMat = stylize(new THREE.MeshStandardMaterial({
    color: leafCol, map: leafTexture(), vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, envMapIntensity: 0.3,
  }), { rim: 0.18, rimPower: 3.2, sway: 0.05, swayHeight: 20 });
  const blobMesh = new THREE.Mesh(mergeGeometries(blobs.map((g) => g.toNonIndexed())), blobMat);
  const cardMesh = new THREE.Mesh(mergeGeometries(cards), cardMat);
  blobMesh.castShadow = cardMesh.castShadow = true;
  blobMesh.receiveShadow = cardMesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(wood, blobMesh, cardMesh);
  return { object: g, colliders: [{ x: 0, z: 0, r: 1.9 * S }] };
}

