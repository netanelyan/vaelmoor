import * as THREE from 'three';

// Many light "anchors" (every glowing window, lantern, gate) but only a fixed
// number of real PointLights, re-assigned each frame to the anchors that
// matter most to the camera. Fixed count = no shader recompiles.

export class LightPool {
  constructor(scene, count = 8) {
    this.anchors = [];
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.score = [];
  }

  add({ x, y, z, color = '#ffffff', intensity = 10, distance = 20, flicker = 0 }) {
    this.anchors.push({ pos: new THREE.Vector3(x, y, z), color: new THREE.Color(color), intensity, distance, flicker, seed: Math.random() * 100 });
  }

  update(camPos, time) {
    const s = this.score;
    s.length = 0;
    for (const a of this.anchors) {
      const d = a.pos.distanceTo(camPos);
      if (d > a.distance + 60) continue;
      s.push([a.intensity / (1 + Math.max(0, d - a.distance * 0.5) ** 2 * 0.02), a]);
    }
    s.sort((p, q) => q[0] - p[0]);
    this.lights.forEach((l, i) => {
      const a = s[i]?.[1];
      if (!a) { l.intensity = 0; return; }
      l.position.copy(a.pos);
      l.color.copy(a.color);
      l.distance = a.distance;
      const fl = a.flicker ? 1 - a.flicker * (0.5 + 0.5 * Math.sin(time * 9 + a.seed) * Math.sin(time * 5.3 + a.seed * 2)) : 1;
      // fade in/out with distance so re-assignment never pops
      const d = a.pos.distanceTo(camPos);
      const fade = 1 - THREE.MathUtils.smoothstep(d, a.distance + 20, a.distance + 60);
      l.intensity = a.intensity * fl * fade;
    });
  }
}
