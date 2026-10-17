import * as THREE from 'three';
import { itemMesh, frame } from '../render/itemMesh.js';

// Slowly turning 3D view of the selected item for the inventory and barter
// screens. Its own small renderer, drawn only while a menu is open.

export class ItemPreview {
  constructor(parent) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    parent.appendChild(this.canvas);
    this.renderer = null;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    this.scene.add(new THREE.HemisphereLight(0xc8ccd8, 0x2a2420, 1.3));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.6);
    key.position.set(2, 3, 2.5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8a9ad8, 1.6);
    rim.position.set(-2.5, 1, -2);
    this.scene.add(rim);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.current = null;
    this.angle = 0;
  }

  ensure() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
  }

  /** Show an item definition (null clears). */
  show(def) {
    if (this.current) { this.pivot.remove(this.current); this.current = null; }
    if (!def?.mesh) return;
    const obj = itemMesh(def);
    const f = frame(obj);
    obj.position.sub(f.center);
    const holder = new THREE.Group();
    holder.add(obj);
    // long things lie diagonally, the way Skyrim shows weapons
    const k = def.mesh.kind;
    if (['sword', 'dagger', 'axe', 'mace', 'arrow'].includes(k)) holder.rotation.z = -Math.PI / 4;
    if (k === 'bow') holder.rotation.z = -0.25;
    if (k === 'book' || k === 'leather') holder.rotation.x = 0.9;
    holder.scale.setScalar(1.25 / Math.max(0.05, f.radius));
    this.current = holder;
    this.pivot.add(holder);
    this.angle = 0.6;
  }

  render(dt) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.ensure();
    const r = this.renderer;
    if (r.domElement.width !== Math.floor(w * r.getPixelRatio()) || r.domElement.height !== Math.floor(h * r.getPixelRatio())) {
      r.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.angle += dt * 0.6;
    this.pivot.rotation.y = this.angle;
    this.camera.position.set(0, 0.3, 3.6);
    this.camera.lookAt(0, 0, 0);
    r.render(this.scene, this.camera);
  }
}
