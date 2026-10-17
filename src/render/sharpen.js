import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// "Dream sharpen": the harsh local-contrast look of an early-2000s render run
// through an HDR / unsharp-mask filter. Works on linear HDR colour before
// bloom. Large radius comes from a quarter-res separable gaussian (cheap);
// small radius is a 3x3 cross in the composite.

const blurShader = {
  uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
      c += (texture2D(tDiffuse, vUv + dir * 1.3846153846).rgb + texture2D(tDiffuse, vUv - dir * 1.3846153846).rgb) * 0.3162162162;
      c += (texture2D(tDiffuse, vUv + dir * 3.2307692308).rgb + texture2D(tDiffuse, vUv - dir * 3.2307692308).rgb) * 0.0702702703;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

const compositeShader = {
  uniforms: {
    tDiffuse: { value: null }, tBlur: { value: null }, texel: { value: new THREE.Vector2() },
    amountLarge: { value: 0 }, amountSmall: { value: 0 }, clampDetail: { value: 0.6 },
  },
  vertexShader: blurShader.vertexShader,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tBlur; uniform vec2 texel;
    uniform float amountLarge, amountSmall, clampDetail;
    varying vec2 vUv;
    float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb
             + texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb;
      vec3 b = texture2D(tBlur, vUv).rgb;
      // detail in log-luminance so darks and brights are boosted alike, then
      // applied as a ratio to keep hue
      float l = lum(c) + 1e-4;
      float dSmall = log2(l) - log2(lum(n * 0.25) + 1e-4);
      float dLarge = log2(l) - log2(lum(b) + 1e-4);
      float d = clamp(dSmall * amountSmall + dLarge * amountLarge, -clampDetail * 4.0, clampDetail * 4.0);
      gl_FragColor = vec4(c * exp2(d), 1.0);
    }`,
};

export class SharpenPass extends Pass {
  constructor() {
    super();
    const opts = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(1, 1, opts);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, opts);
    this.blurMat = new THREE.ShaderMaterial(blurShader);
    this.compMat = new THREE.ShaderMaterial(compositeShader);
    this.quad = new FullScreenQuad(null);
    this.amountLarge = 0;
    this.amountSmall = 0;
  }

  setSize(w, h) {
    const qw = Math.max(1, Math.round(w / 4)), qh = Math.max(1, Math.round(h / 4));
    this.rtA.setSize(qw, qh);
    this.rtB.setSize(qw, qh);
    this.compMat.uniforms.texel.value.set(1 / w, 1 / h);
    this.qtexel = new THREE.Vector2(1 / qw, 1 / qh);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.blurMat.uniforms;
    this.quad.material = this.blurMat;
    // downsample + blur H, then blur V (radius ~ 3.2 quarter-res texels ~ 13 px)
    u.tDiffuse.value = readBuffer.texture;
    u.dir.value.set(this.qtexel.x * 1.5, 0);
    renderer.setRenderTarget(this.rtA); this.quad.render(renderer);
    u.tDiffuse.value = this.rtA.texture;
    u.dir.value.set(0, this.qtexel.y * 1.5);
    renderer.setRenderTarget(this.rtB); this.quad.render(renderer);
    // second iteration widens the large radius
    u.tDiffuse.value = this.rtB.texture;
    u.dir.value.set(this.qtexel.x * 2.5, 0);
    renderer.setRenderTarget(this.rtA); this.quad.render(renderer);
    u.tDiffuse.value = this.rtA.texture;
    u.dir.value.set(0, this.qtexel.y * 2.5);
    renderer.setRenderTarget(this.rtB); this.quad.render(renderer);

    const c = this.compMat.uniforms;
    c.tDiffuse.value = readBuffer.texture;
    c.tBlur.value = this.rtB.texture;
    c.amountLarge.value = this.amountLarge;
    c.amountSmall.value = this.amountSmall;
    this.quad.material = this.compMat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() { this.rtA.dispose(); this.rtB.dispose(); this.blurMat.dispose(); this.compMat.dispose(); this.quad.dispose(); }
}
