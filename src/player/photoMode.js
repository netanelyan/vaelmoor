import * as THREE from 'three';

// Dev "photo mode": jumps the camera to the framing that matches a reference
// shot (each area's `shot` in the region JSON). Shots are addressed as
// "<realm>:<key>", e.g. "gloaming:2" or "surface:1". Moving drops back into
// normal play from that spot.

const DEG = Math.PI / 180;

export class PhotoMode {
  constructor({ camera, player, realms, onRealm }) {
    Object.assign(this, { camera, player, onRealm });
    this.shots = new Map();
    for (const realm of realms) {
      const { world, region } = realm;
      for (const a of region.areas) {
        if (!a.shot) continue;
        const s = a.shot;
        const [x, z] = [a.center[0] + s.at[0], a.center[1] + s.at[1]];
        const yAt = s.yAt ? [a.center[0] + s.yAt[0], a.center[1] + s.yAt[1]] : [x, z];
        const y = (s.absY ?? (s.aboveWater ? world.waterLevelAt(x, z) : world.groundAt(yAt[0], yAt[1]))) + (s.height ?? 1.7);
        const [tx, tz] = [a.center[0] + s.target[0], a.center[1] + s.target[1]];
        const ty = (s.targetAbsY ?? (s.aboveWater ? world.waterLevelAt(tx, tz) : world.groundAt(tx, tz))) + (s.target[2] ?? 0);
        const id = `${realm.id}:${s.key}`;
        this.shots.set(id, {
          id, key: s.key, realm, area: a.id, name: a.name, ref: a.ref,
          pos: new THREE.Vector3(x, y, z), target: new THREE.Vector3(tx, ty, tz), fov: s.fov ?? 60, roll: (s.roll ?? 0) * DEG,
        });
      }
    }
    this.active = null;
  }

  /** All shots, grouped by realm then key (for menus and tools). */
  list() {
    return [...this.shots.values()].sort((a, b) => (a.realm.id === b.realm.id ? a.key - b.key : a.realm.id < b.realm.id ? -1 : 1));
  }

  enter(id) {
    const s = this.shots.get(id);
    if (!s) return false;
    this.onRealm(s.realm);
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

  exit(fov) {
    if (!this.active) return;
    const c = this.camera;
    this.player.teleport(c.position.x, c.position.z, this.player.yaw, this.player.pitch);
    c.fov = fov;
    c.updateProjectionMatrix();
    this.active = null;
  }
}
