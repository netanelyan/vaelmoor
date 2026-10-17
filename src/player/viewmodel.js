import * as THREE from 'three';
import { itemMesh } from '../render/itemMesh.js';
import { radialTexture } from '../render/materials.js';

// First-person hands: forearms (sleeves match the body armor, gloves the hand
// slot) holding whatever is equipped in each hand: weapons, a shield, a bow,
// or a spell burning in an open palm. Attached to the camera. Combat drives
// the procedural poses through `pose` (swing, power, block, draw, cast, hit).

const SKIN = '#c8987a';

function armMesh(sleeve, glove, metal) {
  const g = new THREE.Group();
  const sleeveMat = new THREE.MeshStandardMaterial({ color: sleeve, roughness: 0.9 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: glove, roughness: metal ? 0.4 : 0.8, metalness: metal ? 0.8 : 0 });
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.42, 10), sleeveMat);
  fore.rotation.x = Math.PI / 2;
  fore.position.z = 0.21;
  g.add(fore);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.06, 10), gloveMat);
  wrist.rotation.x = Math.PI / 2;
  wrist.position.z = 0.0;
  g.add(wrist);
  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.07, 0.1), gloveMat);
  fist.position.set(0, 0, -0.06);
  g.add(fist);
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.06), gloveMat);
  thumb.position.set(-0.045, 0.02, -0.06);
  g.add(thumb);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
  return g;
}

function spellFlame(color) {
  const g = new THREE.Group();
  const mat = new THREE.SpriteMaterial({ map: radialTexture(), color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(0.08 + i * 0.012);
    g.add(s);
  }
  g.userData.flame = true;
  return g;
}

export class Viewmodel {
  constructor(camera, game) {
    this.camera = camera;
    this.game = game;
    this.root = new THREE.Group();
    this.root.renderOrder = 10;
    camera.add(this.root);
    this.right = new THREE.Group();
    this.left = new THREE.Group();
    this.root.add(this.right, this.left);
    this.drawn = false;
    this.lower = 1; // 1 = lowered out of view, 0 = ready
    this.t = 0;
    this.pose = { right: null, left: null }; // { name, t, dur }
    this.rebuild();
    game.inventory.on((e) => { if (e.type === 'equip' || e.type === 'remove') this.rebuild(); });
  }

  /** Materials and held items from the current equipment. */
  rebuild() {
    const g = this.game, inv = g.inventory, E = inv.equipped;
    const bodyDef = E.body && g.items.get(E.body);
    const handDef = E.hands && g.items.get(E.hands);
    const sleeve = bodyDef?.mesh?.color ?? '#4a4a5a';
    const glove = handDef?.hands ?? SKIN;
    const metal = !!handDef?.metal;
    for (const side of ['right', 'left']) {
      const grp = this[side];
      grp.clear();
      const arm = armMesh(sleeve, glove, metal);
      grp.add(arm);
      grp.userData.arm = arm;
      const id = E[side];
      grp.userData.kind = null;
      if (!id) { grp.userData.kind = 'fist'; continue; }
      if (id.startsWith('spell:')) {
        const sp = g.spells.spells[id.slice(6)];
        const f = spellFlame(sp.color);
        f.position.set(0, 0.05, -0.12);
        grp.add(f);
        grp.userData.kind = 'spell';
        grp.userData.flame = f;
        continue;
      }
      const def = g.items.get(id);
      const obj = itemMesh(def);
      obj.traverse((m) => { if (m.isMesh) { m.castShadow = false; } });
      const holder = new THREE.Group();
      holder.add(obj);
      const k = def.mesh?.kind;
      if (k === 'shield') {
        holder.position.set(0.02, 0.02, -0.05);
        holder.rotation.set(0, Math.PI / 2 - 0.25, 0);
        grp.userData.kind = 'shield';
      } else if (k === 'bow') {
        holder.position.set(0, 0, -0.05);
        holder.rotation.set(0, Math.PI / 2, 0.15);
        grp.userData.kind = 'bow';
      } else {
        // blade forward and up out of the fist
        holder.position.set(0, 0, -0.06);
        holder.rotation.set(-Math.PI / 2 + 0.55, 0, 0);
        grp.userData.kind = 'weapon';
      }
      grp.add(holder);
      grp.userData.item = holder;
    }
    // a bow sits in the left hand, the right hand draws the string
    if (inv.isBow(E.right)) {
      const bowHolder = this.right.userData.item;
      this.right.remove(bowHolder);
      this.left.add(bowHolder);
      this.left.userData.kind = 'bow';
      this.right.userData.kind = 'string';
    }
  }

  /** Start a procedural animation on a hand ('swing', 'power', 'block', 'cast', 'draw', 'recoil', 'hit'). */
  play(side, name, dur) { this.pose[side] = { name, t: 0, dur }; }
  hold(side, name) { this.pose[side] = { name, t: 0, dur: Infinity, hold: true }; }
  release(side) { if (this.pose[side]?.hold) this.pose[side] = null; }

  update(dt, { moving = 0, sprinting = false } = {}) {
    this.t += dt;
    const target = this.drawn ? 0 : 1;
    this.lower += (target - this.lower) * Math.min(1, dt * 9);
    this.root.visible = this.lower < 0.98;
    const bob = Math.sin(this.t * (sprinting ? 11 : 7)) * 0.012 * moving;
    const bobX = Math.cos(this.t * (sprinting ? 5.5 : 3.5)) * 0.01 * moving;
    for (const side of ['right', 'left']) {
      const g = this[side];
      const sx = side === 'right' ? 1 : -1;
      // rest pose: forearms coming in from the lower corners
      let px = sx * 0.24 + bobX, py = -0.26 + bob - this.lower * 0.45, pz = -0.42;
      let rx = 0.15, ry = sx * 0.18, rz = sx * 0.1;
      const kind = g.userData.kind;
      if (kind === 'shield') { px = -0.3; py = -0.28 + bob - this.lower * 0.45; pz = -0.5; ry = -0.3; }
      if (kind === 'bow') { px = -0.12; py = -0.12 + bob - this.lower * 0.45; pz = -0.62; rx = 0.05; ry = -0.12; rz = -0.12; }
      if (kind === 'string') { px = 0.04; py = -0.16 + bob - this.lower * 0.45; pz = -0.42; rx = 0.1; ry = -0.25; }
      if (kind === 'spell') { py += 0.03; rx = 0.35; }
      const P = this.pose[side];
      if (P) {
        P.t += dt;
        const u = Math.min(1, P.t / P.dur);
        const arc = Math.sin(u * Math.PI);
        switch (P.name) {
          case 'swing': // a diagonal cut across the view
            rx += -1.1 * arc + (u < 0.35 ? -0.6 * (u / 0.35) : 0);
            rz += sx * (u < 0.4 ? 0.8 * (u / 0.4) : 0.8 - 1.9 * ((u - 0.4) / 0.6));
            px += -sx * 0.22 * Math.max(0, (u - 0.35) / 0.65);
            py += 0.12 * arc;
            break;
          case 'power': // wind up high, then a heavy overhead blow
            if (u < 0.45) { rx += 0.9 * (u / 0.45); py += 0.18 * (u / 0.45); }
            else { const k = (u - 0.45) / 0.55; rx += 0.9 - 2.4 * Math.sin(k * Math.PI * 0.5); py += 0.18 - 0.28 * k; pz -= 0.12 * Math.sin(k * Math.PI); }
            break;
          case 'windup': rx += 0.7 * Math.min(1, P.t / 0.3); py += 0.12 * Math.min(1, P.t / 0.3); break;
          case 'block':
            if (kind === 'shield') { px = -0.12; py = -0.12; pz = -0.42; ry = 0.15; }
            else { px = sx * 0.05; py = -0.1; pz = -0.45; rz = sx * 1.3; rx = 0.4; }
            break;
          case 'bash': px = -0.05; py = -0.1; pz = -0.62 + 0.25 * (1 - arc); break;
          case 'draw': pz += 0.18 * Math.min(1, P.t / 0.6); px += 0.04; break; // string hand pulled back
          case 'cast': pz -= 0.06; py += 0.02 * Math.sin(this.t * 30); rx = 0.5; break;
          case 'recoil': rx -= 0.5 * arc; pz += 0.08 * arc; break;
          case 'hit': rx += 0.25 * arc; py -= 0.05 * arc; break;
          default:
        }
        if (u >= 1 && !P.hold) this.pose[side] = null;
      }
      g.position.set(px, py, pz);
      g.rotation.set(rx, ry, rz);
      const flame = g.userData.flame;
      if (flame) flame.children.forEach((s, i) => {
        s.position.set(Math.sin(this.t * 9 + i * 1.7) * 0.012, 0.015 * i + Math.sin(this.t * 13 + i) * 0.01, Math.cos(this.t * 7 + i) * 0.01);
        s.material.opacity = 0.55 + 0.25 * Math.sin(this.t * 17 + i);
      });
    }
  }
}
