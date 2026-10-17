import * as THREE from 'three';
import { HeightFog } from '../render/heightFog.js';
import { SkyDome } from '../shaders/sky.js';
import { LightPool } from '../render/lightPool.js';
import { shared } from '../render/materials.js';
import { Atmosphere } from './atmosphere.js';
import { buildWorld } from './world.js';
import { roadSheen } from './road.js';
import { waterState } from './water.js';
import { resolveProfile } from './profiles.js';

// A realm is one world layer (one region JSON): its own scene, sky,
// lights, fog, world and atmosphere. Only the active realm is simulated and
// rendered; shared material uniforms are re-applied from it every frame.

const SHADOW_SPAN = 75;

export class Realm {
  static async create(renderer, assets, region) {
    const r = new Realm(renderer, region);
    await r.build(assets);
    return r;
  }

  constructor(renderer, region) {
    this.renderer = renderer;
    this.region = region;
    this.id = region.id;
    this.profile = resolveProfile(region.renderProfile);
    const scene = (this.scene = new THREE.Scene());

    this.sky = new SkyDome();
    scene.add(this.sky);
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(this.sky.geometry, this.sky.material));
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.envTimer = 0;
    this.envDirty = true;

    this.hemi = new THREE.HemisphereLight(0x6050a0, 0x101020, 0.6);
    const moon = (this.moon = new THREE.DirectionalLight(0xb0a0ff, 1.2));
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const S = SHADOW_SPAN;
    Object.assign(moon.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 500 });
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.05;
    // soft fill from over the viewer's shoulder so backlit figures keep their form
    this.fill = new THREE.DirectionalLight(0x8090ff, 0.3);
    scene.add(this.hemi, moon, moon.target, this.fill, this.fill.target);
    this.lightPool = new LightPool(scene, 8);
    scene.fog = new HeightFog(0x302050, 0.01, 0.05);
  }

  async build(assets) {
    this.world = await buildWorld({ scene: this.scene, assets, region: this.region, lightPool: this.lightPool });
    this.atmosphere = new Atmosphere(this.region);
  }

  /** Compile every material up front (incl. distance-culled props) so areas never hitch on first sight. */
  async warmUp(camera) {
    const hidden = [];
    this.scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { await this.renderer.compileAsync(this.scene, camera); } catch { this.renderer.compile(this.scene, camera); }
    for (const o of hidden) o.visible = false;
  }

  setShadowSize(size) {
    const m = this.moon;
    m.castShadow = size > 0;
    if (size && m.shadow.mapSize.x !== size) {
      m.shadow.mapSize.set(size, size);
      m.shadow.map?.dispose();
      m.shadow.map = null;
    }
  }

  refreshEnv() {
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
    this.scene.environment = rt.texture;
    this.envRT?.dispose();
    this.envRT = rt;
  }

  /** Push the blended atmosphere into sky, fog, lights and shared uniforms. */
  applyAtmosphere(a, post) {
    const s = this.scene;
    this.sky.apply({ ...a.sky, fogColor: a.fog.color });
    s.fog.color.copy(a.fog.color);
    s.fog.density = a.fog.density;
    s.fog.falloff = a.fog.falloff;
    this.hemi.color.copy(a.ambient.sky);
    this.hemi.groundColor.copy(a.ambient.ground);
    this.hemi.intensity = a.ambient.intensity;
    this.moon.color.copy(a.moonLight.color);
    this.moon.intensity = a.moonLight.intensity;
    this.moonDir = a.moonLight.dir || a.sky.moonDir;
    this.fill.color.copy(a.fill.color);
    this.fill.intensity = a.fill.intensity;
    shared.rimColor.value.copy(a.rim.color);
    shared.rimStrength.value = a.rim.strength;
    s.environmentIntensity = a.env?.intensity ?? 1;
    roadSheen.value = a.road?.sheen ?? 0.8;
    if (a.water) {
      waterState.color.copy(a.water.color);
      waterState.glint.copy(a.water.glint);
      waterState.distortion = a.water.distortion;
      waterState.tint.copy(a.water.tint);
    }
    waterState.dir.copy(a.sky.moonDir);
    post.apply(a.post);
  }

  /** Per-frame work for the active realm. `pinArea` pins the palette (photo mode). */
  update(dt, time, camera, post, pinArea = null) {
    this.sky.uniforms.time.value = time;
    const p = camera.position;
    const a = this.atmosphere.update(p.x, p.z, pinArea);
    this.applyAtmosphere(a, post);

    // moon light + shadow camera follow the viewer (snapped to shadow texels)
    const m = this.moon;
    const texel = (2 * SHADOW_SPAN) / m.shadow.mapSize.x;
    const fx = Math.round(p.x / texel) * texel, fz = Math.round(p.z / texel) * texel;
    m.target.position.set(fx, this.world.groundAt(fx, fz), fz);
    m.position.copy(m.target.position).addScaledVector(this.moonDir, 200);

    this.sky.position.copy(p);
    this.fill.target.position.copy(p);
    this.fill.position.set(-2, 3, 4).applyQuaternion(camera.quaternion).add(p);
    this.world.update(dt, time, p);
    this.lightPool.update(p, time);

    this.envTimer -= dt;
    if (this.envDirty || this.envTimer <= 0) { this.refreshEnv(); this.envDirty = false; this.envTimer = 2.0; }
  }
}
