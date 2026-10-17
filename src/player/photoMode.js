import * as THREE from 'three';

// Dev "photo mode": number keys jump the camera to the framing that matches
// each reference shot (defined per area in the region JSON as `shot`).
// Moving (WASD/Space) drops back into normal play from that spot; 0 exits.

const DEG = Math.PI / 180;

export class PhotoMode {
  constructor({ camera, player, world, region }) {
    Object.assign(this, { camera, player, world });
    this.shots = new Map();
    for (const a of region.areas) {
      if (!a.shot) continue;
      const s = a.shot;
      const [x, z] = [a.center[0] + s.at[0], a.center[1] + s.at[1]];
      const y = world.groundAt(x, z) + (s.height ?? 1.7);
      const [tx, tz] = [a.center[0] + s.target[0], a.center[1] + s.target[1]];
      const ty = (s.targetAbsY ?? world.groundAt(tx, tz)) + (s.target[2] ?? 0);
      this.shots.set(String(s.key), {
        key: s.key, area: a.id, name: a.name, ref: a.ref,
        pos: new THREE.Vector3(x, y, z), target: new THREE.Vector3(tx, ty, tz), fov: s.fov ?? 60, roll: (s.roll ?? 0) * DEG,
      });
    }
    this.active = null;
    this.defaultFov = camera.fov;
  }

  enter(key) {
    const s = this.shots.get(String(key));
    if (!s) return false;
    this.active = s;
    const c = this.camera;
    c.position.copy(s.pos);
    c.up.set(0, 1, 0);
    c.lookAt(s.target);
    c.rotateZ(s.roll);
    c.fov = s.fov;
    c.updateProjectionMatrix();
    // keep the player's look in sync so leaving photo mode is seamless
    const e = new THREE.Euler().setFromQuaternion(c.quaternion, 'YXZ');
    this.player.yaw = e.y;
    this.player.pitch = e.x;
    return true;
  }

  exit() {
    if (!this.active) return;
    const c = this.camera;
    this.player.teleport(c.position.x, c.position.z, this.player.yaw, this.player.pitch);
    c.fov = this.defaultFov;
    c.updateProjectionMatrix();
    this.active = null;
  }
}
