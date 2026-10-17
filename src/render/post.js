import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SharpenPass } from './sharpen.js';
import { PainterlyPass } from './painterly.js';

// Display-referred grade, applied after ACES + sRGB output:
// hard saturation/vibrance, S-curve contrast, blacks crushed into a tinted
// deep blue/purple, split-toned highlights, vignette, fine film grain.
const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    saturation: { value: 1.45 },
    vibrance: { value: 0.35 },
    contrast: { value: 1.18 },
    shadowTint: { value: new THREE.Color(0x1a0a3a) },
    highlightTint: { value: new THREE.Color(0xfff0e0) },
    blackCrush: { value: 0.6 },
    vignette: { value: 0.42 },
    grain: { value: 0.045 },
    fringe: { value: 0.006 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time, saturation, vibrance, contrast, blackCrush, vignette, grain, fringe;
    uniform vec3 shadowTint, highlightTint;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      // subtle lens fringe toward the edges
      vec2 off = d * r2 * fringe;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - off).b;

      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // vibrance: push the least saturated colours more
      float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
      float sat = mx - mn;
      c = mix(vec3(l), c, saturation + vibrance * (1.0 - sat));
      // S-curve contrast around mid grey
      c = clamp(c, 0.0, 1.0);
      vec3 s = c * c * (3.0 - 2.0 * c);
      c = mix(c, s, clamp((contrast - 1.0) * 2.5, 0.0, 1.0));
      // blacks sink into a deep tinted colour instead of grey
      float l2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float sh = pow(1.0 - smoothstep(0.0, 0.42, l2), 2.0);
      c = mix(c, c * 0.55 + shadowTint, sh * blackCrush);
      // warm/cool split toning in the highlights
      float hi = smoothstep(0.5, 1.0, l2);
      c *= mix(vec3(1.0), highlightTint, hi);
      // vignette
      c *= 1.0 - vignette * smoothstep(0.12, 0.62, r2 * 1.6);
      // grain (luminance-weighted, animated)
      float g = hash(vUv * resolution + fract(time * 7.13) * 91.7) - 0.5;
      c += g * grain * (0.35 + 0.65 * (1.0 - l2));
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.9, 0.7, 0.6);
    // tight falloff: glow hugs the light source instead of washing whole facades
    this.bloom.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.55, 0.22, 0.07, 0.02];
    this.output = new OutputPass();
    this.grade = new ShaderPass(GradeShader);
    this.sharpen = new SharpenPass();
    this.painterly = new PainterlyPass();
    // HDR: render -> dream sharpen -> bloom ; display: ACES -> grade -> painterly
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.sharpen);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.painterly);
  }

  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.grade.uniforms.resolution.value.set(s.x, s.y);
  }

  /** Apply blended post settings from the atmosphere. */
  apply(p) {
    const u = this.grade.uniforms;
    this.bloom.strength = p.bloom;
    this.bloom.radius = p.bloomRadius;
    this.bloom.threshold = p.bloomThreshold;
    u.saturation.value = p.saturation;
    u.vibrance.value = p.vibrance;
    u.contrast.value = p.contrast;
    u.blackCrush.value = p.blackCrush;
    u.vignette.value = p.vignette;
    u.shadowTint.value.copy(p.shadowTint);
    u.highlightTint.value.copy(p.highlightTint);
    this.renderer.toneMappingExposure = p.exposure;
  }

  /** Apply a blended render profile (see world/profiles.js). */
  applyProfile(pr) {
    this.sharpen.amountLarge = pr.sharpen.large;
    this.sharpen.amountSmall = pr.sharpen.small;
    this.sharpen.enabled = pr.sharpen.large + pr.sharpen.small > 0.01;
    const P = pr.painterly;
    this.painterly.mix = P.amount;
    this.painterly.enabled = P.amount > 0.001;
    this.painterly.kuwaharaMat.uniforms.radius.value = Math.min(P.radius, this.maxPaintRadius ?? 8);
    const u = this.painterly.uniforms;
    for (const k of ['contrast', 'saturation', 'canvas', 'posterize', 'posterizeAmount', 'grain', 'vignette', 'crush', 'redKeep', 'desat', 'edge']) u[k].value = P[k];
    u.shadowTint.value.copy(P.shadowTint);
    u.highlightTint.value.copy(P.highlightTint);
    // the dream grain/vignette in the grade pass fade out as paint takes over
    this.grade.uniforms.grain.value = 0.045 * (1 - P.amount);
  }

  /** Set the active scene (realms) without rebuilding the chain. */
  setScene(scene) { this.renderPass.scene = scene; }

  render(dt, time) {
    this.grade.uniforms.time.value = time;
    this.painterly.uniforms.time.value = time;
    this.composer.render(dt);
  }
}
