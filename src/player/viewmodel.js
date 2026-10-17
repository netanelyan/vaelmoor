import * as THREE from 'three';
import { itemMesh } from '../render/itemMesh.js';
import { radialTexture } from '../render/materials.js';
import { human } from '../world/humans.js';

// First-person arms: the player's own rigged Quaternius arms (sleeves dyed
// from the body armor, hands from the gloves), parented to the camera and
// posed every frame with two-bone IK toward procedural hand targets. Fingers
// come from real clips (a fist from Sword_Idle, an open palm from the spell
// idle). Held things (weapons, shield, bow, a spell flame) sit in the palm.
// Combat drives the poses: swing, power, windup, block, bash, draw, cast,
// recoil, hit.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _a = V(0, 0, 0), _b = V(0, 0, 0), _c = V(0, 0, 0), _d = V(0, 0, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const HOLD = new THREE.Euler(-Math.PI / 2 + 0.55, 0, 0); // weapon blade forward-up out of the fist

function spellFlame(color) {
  const g = new THREE.Group();
  const mat = new THREE.SpriteMaterial({ map: radialTexture(), color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 5; i++) { const s = new THREE.Sprite(mat); s.scale.setScalar(0.07 + i * 0.012); g.add(s); }
  return g;
}

/** Point `bone` so its child lies along the direction to `target` (world). */
function aim(bone, child, target) {
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  _c.subVectors(_b, _a).normalize();
  _d.subVectors(target, _a).normalize();
  _q.setFromUnitVectors(_c, _d);
  bone.getWorldQuaternion(_q2);
  _q2.premultiply(_q);
  setWorldQuat(bone, _q2);
}

function setWorldQuat(bone, wq) {
  const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(pq.invert().multiply(wq));
  bone.updateMatrixWorld(true);
}

function basis(f, t) {
  const x = f.clone().normalize();
  const y = t.clone().sub(x.clone().multiplyScalar(t.dot(x))).normalize();
  const z = x.clone().cross(y);
  return new THREE.Matrix4().makeBasis(x, y, z);
}

export class Viewmodel {
  constructor(camera, game) {
    this.camera = camera;
    this.game = game;
    this.root = new THREE.Group();          // rig holder, camera space
    this.items = new THREE.Group();         // held things, camera space
    camera.add(this.root, this.items);
    this.drawn = false;
    this.lower = 1;
    this.t = 0;
    this.pose = { right: null, left: null };
    this.kind = { right: 'fist', left: 'fist' };
    this.held = { right: null, left: null };
    this.rig = null;
    this.version = 0;
    this.rebuild();
    game.inventory.on((e) => { if (e.type === 'equip' || e.type === 'remove') this.rebuild(); });
  }

  /** Sleeves/gloves from the equipment (async rig), and held items (sync). */
  rebuild() {
    const g = this.game, inv = g.inventory, E = inv.equipped;
    const bodyDef = E.body && g.items.get(E.body);
    const handDef = E.hands && g.items.get(E.hands);
    const look = `${bodyDef?.mesh?.color ?? '#4a4a5a'}|${handDef?.hands ?? ''}|${!!handDef?.metal}`;
    if (look !== this.look) { this.look = look; this.buildRig(bodyDef, handDef); }
    this.items.clear();
    this.held = { right: null, left: null };
    for (const side of ['right', 'left']) {
      const id = E[side];
      this.kind[side] = 'fist';
      if (!id) continue;
      if (id.startsWith('spell:')) {
        const f = spellFlame(g.spells.spells[id.slice(6)].color);
        this.items.add(f);
        this.held[side] = f;
        this.kind[side] = 'spell';
        continue;
      }
      const def = g.items.get(id);
      const holder = new THREE.Group();
      const obj = itemMesh(def);
      obj.traverse((m) => { if (m.isMesh) m.castShadow = false; });
      holder.add(obj);
      this.items.add(holder);
      this.held[side] = holder;
      const k = def.mesh?.kind;
      this.kind[side] = k === 'shield' ? 'shield' : k === 'bow' ? 'bow' : 'weapon';
    }
    // a bow sits in the left hand; the right hand draws the string
    if (inv.isBow(E.right)) {
      this.held.left = this.held.right;
      this.held.right = null;
      this.kind.left = 'bow';
      this.kind.right = 'string';
    }
  }

  async buildRig(bodyDef, handDef) {
    const v = ++this.version;
    const o = { outfit: 'Male_Ranger', anim: 'Sword_Idle', at: 0.3, freeze: true, seed: 1, cloth: bodyDef?.mesh?.color ?? '#4a4a5a' };
    if (handDef?.metal) o.armour = handDef.hands ?? '#8a8c92';
    else if (handDef) o.skin = handDef.hands;
    const res = await human({ assets: this.game.assets }, o);
    if (v !== this.version) return;
    const root = res.root;
    root.traverse((m) => {
      if (!m.isMesh) return;
      m.visible = /Arms|Bracer/.test(m.name) && !/Pauldron/.test(m.name);
      m.castShadow = false;
      m.receiveShadow = false;
    });
    root.scale.setScalar(1);
    root.position.set(0, 0, 0);
    root.rotation.set(0, Math.PI, 0); // the rig faces +Z; the camera looks down -Z
    // finger poses from real clips: a fist and an open palm
    const fingers = (clipName, frac) => {
      const mx = new THREE.AnimationMixer(root);
      const clip = res.clips.get(clipName);
      const a = mx.clipAction(clip);
      a.play();
      mx.setTime(clip.duration * frac);
      const out = {};
      root.traverse((b) => { if (b.isBone && /(thumb|index|middle|ring|pinky)_0\d_[lr]$/.test(b.name)) out[b.name] = b.quaternion.clone(); });
      a.stop();
      return out;
    };
    // [bone, quaternion] pairs per hand, resolved once
    const pairs = (set, suf) => Object.entries(set).filter(([n]) => n.endsWith(suf)).map(([n, q]) => [root.getObjectByName(n), q]);
    const f0 = fingers('Sword_Idle', 0.3), o0 = fingers('Spell_Simple_Idle_Loop', 0.3);
    const fist = { _r: pairs(f0, '_r'), _l: pairs(f0, '_l') };
    const open = { _r: pairs(o0, '_r'), _l: pairs(o0, '_l') };
    const B = (n) => root.getObjectByName(n);
    const arm = (s) => ({ up: B(`upperarm_${s}`), low: B(`lowerarm_${s}`), hand: B(`hand_${s}`), mid: B(`middle_01_${s}`), thumb: B(`thumb_01_${s}`) });
    const L = arm('l'), R = arm('r');
    // local finger / thumb axes of each hand (from the bind pose)
    for (const A of [L, R]) {
      A.fLocal = A.mid.position.clone().normalize();
      A.tLocal = A.thumb.position.clone().normalize();
      A.restLocal = basis(A.fLocal, A.tLocal);
      A.q0 = [A.up.quaternion.clone(), A.low.quaternion.clone(), A.hand.quaternion.clone()];
    }
    // put the shoulders where a first-person camera would have them
    this.root.clear();
    this.root.add(res.object);
    res.object.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    const mid = L.up.getWorldPosition(V(0, 0, 0)).add(R.up.getWorldPosition(V(0, 0, 0))).multiplyScalar(0.5);
    const midCam = this.camera.worldToLocal(mid.clone());
    res.object.position.sub(midCam).add(V(0, -0.24, 0.1));
    this.rig = { res, root, L, R, fist, open };
  }

  play(side, name, dur) { this.pose[side] = { name, t: 0, dur }; }
  hold(side, name) { this.pose[side] = { name, t: 0, dur: Infinity, hold: true }; }
  release(side) { if (this.pose[side]?.hold) this.pose[side] = null; }

  /** Hand target (camera space), held-item rotation and finger set for a side. */
  poseFor(side, dt, bob, bobX) {
    const sx = side === 'right' ? 1 : -1;
    const kind = this.kind[side];
    let px = sx * 0.19 + bobX, py = -0.175 + bob - this.lower * 0.5, pz = -0.42;
    let rx = 0.15, ry = sx * 0.18, rz = sx * 0.1;
    let hand = 'fist';
    if (kind === 'shield') { px = -0.4; py = -0.33 + bob - this.lower * 0.5; pz = -0.5; ry = -0.75; }
    if (kind === 'bow') { px = -0.1; py = -0.14 + bob - this.lower * 0.5; pz = -0.55; rx = 0.05; ry = -0.12; rz = -0.12; }
    if (kind === 'string') { px = 0.05; py = -0.17 + bob - this.lower * 0.5; pz = -0.45; rx = 0.1; ry = -0.25; }
    if (kind === 'spell') { py -= 0.02; rx = 0.35; hand = 'open'; }
    if (kind === 'fist' && !this.held[side]) { hand = 'fist'; }
    const P = this.pose[side];
    if (P) {
      P.t += dt;
      const u = Math.min(1, P.t / P.dur);
      const arc = Math.sin(u * Math.PI);
      switch (P.name) {
        case 'swing':
          rx += -1.1 * arc + (u < 0.35 ? -0.6 * (u / 0.35) : 0);
          rz += sx * (u < 0.4 ? 0.8 * (u / 0.4) : 0.8 - 1.9 * ((u - 0.4) / 0.6));
          px += -sx * 0.24 * Math.max(0, (u - 0.35) / 0.65);
          py += 0.12 * arc;
          pz -= 0.08 * arc;
          break;
        case 'power':
          if (u < 0.45) { rx += 0.9 * (u / 0.45); py += 0.16 * (u / 0.45); pz += 0.05 * (u / 0.45); }
          else { const k = (u - 0.45) / 0.55; rx += 0.9 - 2.4 * Math.sin(k * Math.PI * 0.5); py += 0.16 - 0.26 * k; pz -= 0.14 * Math.sin(k * Math.PI); px -= sx * 0.08 * k; }
          break;
        case 'windup': { const k = Math.min(1, P.t / 0.3); rx += 0.7 * k; py += 0.12 * k; pz += 0.05 * k; break; }
        case 'block':
          if (kind === 'shield') { px = -0.12; py = -0.2; pz = -0.5; ry = 0.15; }
          else { px = sx * 0.04; py = -0.12; pz = -0.42; rz = sx * 1.3; rx = 0.4; }
          break;
        case 'bash': px = -0.05; py = -0.12; pz = -0.6 + 0.22 * (1 - arc); break;
        case 'draw': pz += 0.2 * Math.min(1, P.t / 0.6); px += 0.03; break;
        case 'cast': pz -= 0.1; py += 0.02 * Math.sin(this.t * 30); rx = 0.5; hand = 'open'; break;
        case 'recoil': rx -= 0.5 * arc; pz += 0.08 * arc; break;
        case 'hit': rx += 0.25 * arc; py -= 0.05 * arc; break;
        default:
      }
      if (u >= 1 && !P.hold) this.pose[side] = null;
    }
    return { target: V(px, py, pz), rot: new THREE.Euler(rx, ry, rz), hand, sx, kind };
  }

  update(dt, { moving = 0, sprinting = false } = {}) {
    this.t += dt;
    const target = this.drawn ? 0 : 1;
    this.lower += (target - this.lower) * Math.min(1, dt * 9);
    const visible = this.lower < 0.98;
    this.root.visible = this.items.visible = visible && !!this.rig;
    if (!visible || !this.rig) return;
    const bob = Math.sin(this.t * (sprinting ? 11 : 7)) * 0.012 * moving;
    const bobX = Math.cos(this.t * (sprinting ? 5.5 : 3.5)) * 0.01 * moving;
    const cam = this.camera;
    cam.updateMatrixWorld(true);
    this.rig.res.object.updateMatrixWorld(true);
    for (const side of ['right', 'left']) {
      const A = side === 'right' ? this.rig.R : this.rig.L;
      const p = this.poseFor(side, dt, bob, bobX);
      // fingers
      const set = p.hand === 'open' ? this.rig.open : this.rig.fist;
      const suf = side === 'right' ? '_r' : '_l';
      for (const [b, q] of set[suf]) b.quaternion.copy(q);
      // two-bone IK from the base pose each frame (no accumulated twist)
      A.up.quaternion.copy(A.q0[0]); A.low.quaternion.copy(A.q0[1]); A.hand.quaternion.copy(A.q0[2]);
      A.up.updateMatrixWorld(true);
      const S = A.up.getWorldPosition(V(0, 0, 0));
      const a = S.distanceTo(A.low.getWorldPosition(V(0, 0, 0)));
      const b = A.low.getWorldPosition(V(0, 0, 0)).distanceTo(A.hand.getWorldPosition(V(0, 0, 0)));
      const T = cam.localToWorld(p.target.clone());
      const pole = cam.localToWorld(V(p.sx * 0.6, -0.9, 0.2));
      const dir = T.clone().sub(S);
      const d = Math.min(dir.length(), (a + b) * 0.999);
      dir.normalize();
      const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
      const perp = pole.clone().sub(S);
      perp.sub(dir.clone().multiplyScalar(perp.dot(dir))).normalize();
      const E = S.clone().addScaledVector(dir, a * cosA).addScaledVector(perp, a * Math.sqrt(1 - cosA * cosA));
      aim(A.up, A.low, E);
      aim(A.low, A.hand, S.clone().addScaledVector(dir, d));
      // hand orientation: thumb along the grip, fingers wrapped across it
      const camQ = cam.getWorldQuaternion(new THREE.Quaternion());
      const itemQ = new THREE.Quaternion().setFromEuler(p.rot).multiply(new THREE.Quaternion().setFromEuler(HOLD));
      let fW, tW;
      if (p.hand === 'open') {
        fW = V(0, 0.35, -1).applyQuaternion(camQ);
        tW = V(-p.sx * 0.7, 0.7, 0).applyQuaternion(camQ);
      } else {
        const G = V(0, 1, 0).applyQuaternion(itemQ); // grip axis, camera space
        const across = V(-p.sx, -0.35, 0);
        across.sub(G.clone().multiplyScalar(across.dot(G))).normalize();
        fW = across.applyQuaternion(camQ);
        tW = G.applyQuaternion(camQ);
      }
      _m.copy(basis(fW, tW)).multiply(_m2.copy(A.restLocal).transpose());
      setWorldQuat(A.hand, new THREE.Quaternion().setFromRotationMatrix(_m));
      // the held thing sits in the palm
      const held = this.held[side];
      if (held) {
        const palm = A.hand.getWorldPosition(V(0, 0, 0)).lerp(A.mid.getWorldPosition(V(0, 0, 0)), 0.55);
        held.position.copy(cam.worldToLocal(palm));
        if (p.kind === 'spell') {
          held.position.add(V(0, 0.05, -0.06));
          held.children.forEach((s, i) => {
            s.position.set(Math.sin(this.t * 9 + i * 1.7) * 0.012, 0.015 * i + Math.sin(this.t * 13 + i) * 0.01, Math.cos(this.t * 7 + i) * 0.01);
            s.material.opacity = 0.55 + 0.25 * Math.sin(this.t * 17 + i);
          });
        } else if (p.kind === 'shield') {
          held.quaternion.setFromEuler(new THREE.Euler(p.rot.x * 0.3, p.rot.y, 0));
          held.position.add(V(0.03, 0.02, -0.03));
          held.scale.setScalar(0.85);
        } else if (p.kind === 'bow') {
          held.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0.15 + p.rot.z));
        } else {
          held.quaternion.copy(itemQ);
        }
      }
    }
  }
}
