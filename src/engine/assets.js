import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Central asset loading: textures (PBR sets from assets/textures/<id>_{diff,nor,rough}.jpg)
// and glTF models. One LoadingManager drives the loading bar.

export class Assets {
  constructor(renderer) {
    this.manager = new THREE.LoadingManager();
    this.textureLoader = new THREE.TextureLoader(this.manager);
    this.gltfLoader = new GLTFLoader(this.manager);
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.textures = new Map();
    this.models = new Map();
    this.pending = [];
    this.onProgress = null;
    this.manager.onProgress = (_url, loaded, total) => this.onProgress?.(loaded / total);
  }

  texture(path, { srgb = false } = {}) {
    let t = this.textures.get(path);
    if (!t) {
      t = this.textureLoader.load(path);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = this.anisotropy;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(path, t);
    }
    return t;
  }

  /**
   * A PBR texture set with its own repeat. Clones share the GPU upload
   * (same Source), so per-use repeats are cheap.
   */
  pbr(id, repeat = [1, 1], { color = true, normal = true, rough = true } = {}) {
    const base = `assets/textures/${id}`;
    const withRepeat = (t) => {
      const c = t.clone();
      c.repeat.set(repeat[0], repeat[1]);
      return c;
    };
    const set = {};
    if (color) set.map = withRepeat(this.texture(`${base}_diff.jpg`, { srgb: true }));
    if (normal) set.normalMap = withRepeat(this.texture(`${base}_nor.jpg`));
    if (rough) set.roughnessMap = withRepeat(this.texture(`${base}_rough.jpg`));
    return set;
  }

  /** Load a glTF scene once; callers get clones. */
  model(path) {
    let p = this.models.get(path);
    if (!p) {
      p = this.gltfLoader.loadAsync(path).then((g) => g.scene);
      this.models.set(path, p);
      this.pending.push(p);
    }
    return p.then((s) => s.clone(true));
  }

  /** Resolve once everything requested so far has loaded. */
  ready() {
    const textures = [...this.textures.values()];
    const texDone = Promise.all(textures.map((t) => new Promise((res) => {
      if (t.image) return res();
      const check = () => (t.image ? res() : setTimeout(check, 30));
      check();
    })));
    return Promise.all([texDone, ...this.pending]);
  }
}
