import * as THREE from 'three';

// Things the player can use: NPCs (Talk), items (Take), doors (Open).
// Targeting is cheap: the candidate nearest the crosshair, within reach.

const REACH = 3.2;
const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();

export class Interactables {
  constructor() { this.list = []; }

  add({ id, name, action, pos, radius = 0.5, kind = 'object', object = null }) {
    const it = { id, name, action, pos: pos.clone(), radius, kind, object, enabled: true };
    this.list.push(it);
    return it;
  }

  /** Best target for a camera, or null. */
  target(camera) {
    camera.getWorldDirection(_fwd);
    let best = null, bestScore = Infinity;
    for (const it of this.list) {
      if (!it.enabled) continue;
      _to.copy(it.pos).sub(camera.position);
      const d = _to.length();
      if (d > REACH + it.radius) continue;
      const along = _to.dot(_fwd);
      if (along <= 0) continue;
      // angular miss, forgiving by the object's radius
      const miss = Math.sqrt(Math.max(0, d * d - along * along)) - it.radius;
      if (miss > 0.45) continue;
      const score = miss + d * 0.05;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    return best;
  }
}
