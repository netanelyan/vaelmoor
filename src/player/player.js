import * as THREE from 'three';
import { settings } from '../game/settings.js';

// First-person walker: WASD + mouse look (pointer lock), Shift sprint,
// Space jump, C sneak (crouched: lower and slower), gravity, ground
// following, circle collisions, head bob and hit shake.

const EYE = 1.7;
const RADIUS = 0.4;
const WALK = 5.0;
const SPRINT = 9.0;
const GRAVITY = 22;
const JUMP = 7.2;

export class Player {
  constructor(camera, input, world) {
    this.camera = camera;
    this.input = input;
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.bobPhase = 0;
    this.bobAmt = 0;
    this.sensitivity = 0.0022;
    this.vitals = null; // set by the game: gates sprint/jump on stamina
    this.events = { sprinting: false, jumped: false, landingSpeed: 0 };
    this.sneaking = false;
    this.eye = EYE;
    this.shake = 0;          // seconds of camera shake left (set when hit)
    this.speedMul = 1;       // overweight, drawing a bow...
    this.zoomFov = null;
  }

  /** Place at (x, z) on the ground, looking along yaw/pitch (radians). */
  teleport(x, z, yaw = this.yaw, pitch = 0) {
    this.pos.set(x, this.world.groundAt(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = pitch;
    this.applyCamera(0);
  }

  isMoving() {
    return this.input.down('KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space');
  }

  update(dt) {
    const inp = this.input;
    const [mx, my] = inp.consumeMouse();
    const sens = this.sensitivity * settings.get('sensitivity');
    this.yaw -= mx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - my * sens * (settings.get('invertY') ? -1 : 1), -1.45, 1.45);
    const ev = this.events;
    ev.sprinting = false; ev.jumped = false; ev.landingSpeed = 0;

    const f = (inp.down('KeyW', 'ArrowUp') ? 1 : 0) - (inp.down('KeyS', 'ArrowDown') ? 1 : 0);
    const s = (inp.down('KeyD', 'ArrowRight') ? 1 : 0) - (inp.down('KeyA', 'ArrowLeft') ? 1 : 0);
    const sprint = !this.sneaking && this.speedMul >= 1 && inp.down('ShiftLeft', 'ShiftRight') && (f !== 0 || s !== 0) && (!this.vitals || this.vitals.canSprint());
    ev.sprinting = sprint && this.onGround;
    const speed = (sprint ? SPRINT : WALK) * (this.sneaking ? 0.5 : 1) * this.speedMul;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let wx = fx * f + rx * s, wz = fz * f + rz * s;
    const l = Math.hypot(wx, wz);
    if (l > 0) { wx /= l; wz /= l; }

    // smooth acceleration (less on air)
    const accel = this.onGround ? 12 : 3;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (wx * speed - this.vel.x) * k;
    this.vel.z += (wz * speed - this.vel.z) * k;

    if (this.onGround && !this.sneaking && inp.down('Space') && (!this.vitals || this.vitals.canJump())) {
      this.vel.y = JUMP;
      this.onGround = false;
      ev.jumped = true;
    }
    this.vel.y -= GRAVITY * dt;

    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    [nx, nz] = this.world.colliders.resolve(nx, nz, RADIUS);

    // keep out of deep water and off sheer slopes / the world edge
    const W = this.world;
    const g1 = W.groundAt(nx, nz);
    const water = W.waterLevelAt(nx, nz);
    const tooDeep = water > g1 + 1.1;
    const tooSteep = g1 - this.pos.y > 1.2 && this.onGround;
    const t = W.terrain;
    const inBounds = nx > t.minX + 10 && nz > t.minZ + 10 && nx < t.minX + t.size - 10 && nz < t.minZ + t.size - 10;
    if (!tooDeep && !tooSteep && inBounds) { this.pos.x = nx; this.pos.z = nz; }
    else { this.vel.x *= 0.2; this.vel.z *= 0.2; }

    this.pos.y += this.vel.y * dt;
    const ground = W.groundAt(this.pos.x, this.pos.z);
    if (this.pos.y <= ground) {
      if (!this.onGround) ev.landingSpeed = -this.vel.y;
      this.pos.y = ground;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.pos.y - ground > 0.3) {
      this.onGround = false;
    } else if (this.vel.y <= 0) {
      this.pos.y = ground; // stick to the ground walking downhill
      this.onGround = true;
    }

    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    const moving = this.onGround && hspeed > 0.5 && settings.get('headBob');
    this.bobAmt += ((moving ? Math.min(1, hspeed / WALK) : 0) - this.bobAmt) * Math.min(1, dt * 8);
    this.bobPhase += dt * hspeed * 1.9;
    this.eye += ((this.sneaking ? 1.12 : EYE) - this.eye) * Math.min(1, dt * 10);
    this.applyCamera(dt);
  }

  applyCamera(dt = 0) {
    const bobY = Math.sin(this.bobPhase * 2) * 0.045 * this.bobAmt;
    const bobX = Math.cos(this.bobPhase) * 0.03 * this.bobAmt;
    const c = this.camera;
    let sx = 0, sy = 0, sr = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const k = this.shake * 0.12;
      sx = (Math.random() - 0.5) * k; sy = (Math.random() - 0.5) * k; sr = (Math.random() - 0.5) * k * 0.5;
    }
    c.position.set(this.pos.x, this.pos.y + this.eye + bobY, this.pos.z);
    c.rotation.set(this.pitch + sy, this.yaw + sx, Math.sin(this.bobPhase) * 0.004 * this.bobAmt + sr, 'YXZ');
    c.translateX(bobX);
  }
}
