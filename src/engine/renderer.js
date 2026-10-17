import * as THREE from 'three';

export const MAX_PIXEL_RATIO = 1.5;

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // the composer renders off-screen; MSAA lives on its target
    powerPreference: 'high-performance',
    preserveDrawingBuffer: new URLSearchParams(location.search).has('capture'),
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false; // reset once per frame (the composer renders many passes)
  return renderer;
}
