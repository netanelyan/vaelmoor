import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// "Painted" render profile: 80s dark-fantasy oil painting.
// Half-res chain: structure tensor -> separable tensor blur -> anisotropic
// Kuwahara (polynomial sector weights, after Kyprianidis et al.), then a
// full-res composite: canvas weave, soft posterize, oil-paint grade (shadows
// to indigo, highlights to cold moonlight, reds kept saturated), heavy grain,
// strong vignette, crushed blacks. `mix` crossfades the whole effect.

const vert = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const tensorShader = {
  uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2() } },
  vertexShader: vert,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 texel; varying vec2 vUv;
    vec3 s(float x, float y) { return texture2D(tDiffuse, vUv + vec2(x, y) * texel).rgb; }
    void main() {
      vec3 gx = (-1.0 * s(-1.,-1.) - 2.0 * s(-1.,0.) - 1.0 * s(-1.,1.) + 1.0 * s(1.,-1.) + 2.0 * s(1.,0.) + 1.0 * s(1.,1.)) / 4.0;
      vec3 gy = (-1.0 * s(-1.,-1.) - 2.0 * s(0.,-1.) - 1.0 * s(1.,-1.) + 1.0 * s(-1.,1.) + 2.0 * s(0.,1.) + 1.0 * s(1.,1.)) / 4.0;
      gl_FragColor = vec4(dot(gx, gx), dot(gx, gy), dot(gy, gy), 1.0);
    }`,
};

const tensorBlurShader = {
  uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } },
  vertexShader: vert,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
      c += (texture2D(tDiffuse, vUv + dir * 1.3846153846) + texture2D(tDiffuse, vUv - dir * 1.3846153846)) * 0.3162162162;
      c += (texture2D(tDiffuse, vUv + dir * 3.2307692308) + texture2D(tDiffuse, vUv - dir * 3.2307692308)) * 0.0702702703;
      gl_FragColor = c;
    }`,
};

const kuwaharaShader = {
  defines: { MAX_R: 8 },
  uniforms: {
    tDiffuse: { value: null }, tTensor: { value: null }, texel: { value: new THREE.Vector2() },
    radius: { value: 5 }, sharpness: { value: 8 }, hardness: { value: 8 }, alpha: { value: 1 }, zeroCrossing: { value: 0.58 },
  },
  vertexShader: vert,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tTensor; uniform vec2 texel;
    uniform float radius, sharpness, hardness, alpha, zeroCrossing;
    varying vec2 vUv;
    void main() {
      vec3 t = texture2D(tTensor, vUv).xyz; // E F G
      float lambda1 = 0.5 * (t.x + t.z + sqrt((t.x - t.z) * (t.x - t.z) + 4.0 * t.y * t.y));
      float lambda2 = 0.5 * (t.x + t.z - sqrt((t.x - t.z) * (t.x - t.z) + 4.0 * t.y * t.y));
      vec2 v = vec2(lambda1 - t.x, -t.y);
      vec2 dirv = length(v) > 0.0 ? normalize(v) : vec2(0.0, 1.0);
      float phi = -atan(dirv.y, dirv.x);
      float A = (lambda1 + lambda2 > 0.0) ? (lambda1 - lambda2) / (lambda1 + lambda2) : 0.0;

      float a = radius * clamp((alpha + A) / alpha, 0.1, 2.0);
      float b = radius * clamp(alpha / (alpha + A), 0.1, 2.0);
      float cp = cos(phi), sp = sin(phi);
      mat2 R = mat2(cp, sp, -sp, cp);
      mat2 S = mat2(0.5 / a, 0.0, 0.0, 0.5 / b);
      mat2 SR = S * R;
      float maxX = sqrt(a * a * cp * cp + b * b * sp * sp);
      float maxY = sqrt(a * a * sp * sp + b * b * cp * cp);

      float zeta = 2.0 / (2.0 * radius);
      float sinZ = sin(zeroCrossing);
      float eta = (zeta + cos(zeroCrossing)) / (sinZ * sinZ);

      vec4 m[8]; vec3 s[8];
      for (int k = 0; k < 8; k++) { m[k] = vec4(0.0); s[k] = vec3(0.0); }

      for (int y = -MAX_R; y <= MAX_R; y++) {
        if (abs(float(y)) > maxY) continue;
        for (int x = -MAX_R; x <= MAX_R; x++) {
          if (abs(float(x)) > maxX) continue;
          vec2 vv = SR * vec2(float(x), float(y));
          if (dot(vv, vv) > 0.25) continue;
          vec3 c = clamp(texture2D(tDiffuse, vUv + vec2(float(x), float(y)) * texel).rgb, 0.0, 1.0);
          float w[8]; float sum = 0.0; float z, vxx, vyy;
          vxx = zeta - eta * vv.x * vv.x; vyy = zeta - eta * vv.y * vv.y;
          z = max(0.0, vv.y + vxx); w[0] = z * z;
          z = max(0.0, -vv.x + vyy); w[2] = z * z;
          z = max(0.0, -vv.y + vxx); w[4] = z * z;
          z = max(0.0, vv.x + vyy); w[6] = z * z;
          vec2 u2 = 0.70710678 * vec2(vv.x - vv.y, vv.x + vv.y);
          vxx = zeta - eta * u2.x * u2.x; vyy = zeta - eta * u2.y * u2.y;
          z = max(0.0, u2.y + vxx); w[1] = z * z;
          z = max(0.0, -u2.x + vyy); w[3] = z * z;
          z = max(0.0, -u2.y + vxx); w[5] = z * z;
          z = max(0.0, u2.x + vyy); w[7] = z * z;
          for (int k = 0; k < 8; k++) sum += w[k];
          float g = exp(-3.125 * dot(vv, vv)) / max(sum, 1e-5);
          for (int k = 0; k < 8; k++) {
            float wk = w[k] * g;
            m[k] += vec4(c * wk, wk);
            s[k] += c * c * wk;
          }
        }
      }
      vec4 outc = vec4(0.0);
      for (int k = 0; k < 8; k++) {
        if (m[k].w <= 0.0) continue;
        vec3 mean = m[k].rgb / m[k].w;
        vec3 var = abs(s[k] / m[k].w - mean * mean);
        float sigma2 = var.r + var.g + var.b;
        float wk = 1.0 / (1.0 + pow(hardness * 1000.0 * sigma2, 0.5 * sharpness));
        outc += vec4(mean * wk, wk);
      }
      gl_FragColor = vec4(outc.w > 0.0 ? outc.rgb / outc.w : texture2D(tDiffuse, vUv).rgb, 1.0);
    }`,
};

const compositeShader = {
  uniforms: {
    tDiffuse: { value: null }, tPaint: { value: null }, resolution: { value: new THREE.Vector2() },
    time: { value: 0 }, amount: { value: 0 },
    canvas: { value: 0.12 }, posterize: { value: 10 }, posterizeAmount: { value: 0.35 },
    grain: { value: 0.09 }, vignette: { value: 0.75 }, crush: { value: 0.5 },
    shadowTint: { value: new THREE.Color('#0a0c2a') }, highlightTint: { value: new THREE.Color('#c8d4ff') },
    redKeep: { value: 1.0 }, desat: { value: 0.35 }, edge: { value: 0.35 }, contrast: { value: 1.1 }, saturation: { value: 1.1 },
  },
  vertexShader: vert,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tPaint; uniform vec2 resolution;
    uniform float time, amount, canvas, posterize, posterizeAmount, grain, vignette, crush, redKeep, desat, edge, contrast, saturation;
    uniform vec3 shadowTint, highlightTint;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    // canvas weave height
    float weave(vec2 p) {
      vec2 q = p * 0.42;
      float wx = sin(q.x * 3.14159) * 0.5 + 0.5, wy = sin(q.y * 3.14159) * 0.5 + 0.5;
      float checker = step(0.5, fract(floor(q.x) * 0.5 + floor(q.y) * 0.5));
      float h = mix(wx, wy, checker);
      return h * 0.6 + vnoise(p * 0.7) * 0.4;
    }
    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      if (amount <= 0.001) { gl_FragColor = vec4(base, 1.0); return; }
      vec3 c = texture2D(tPaint, vUv).rgb;
      vec2 px = vUv * resolution;
      vec2 tx = 1.0 / resolution;
      // crisp up the upscaled half-res paint
      vec3 nb = texture2D(tPaint, vUv + vec2(tx.x * 2.0, 0.0)).rgb + texture2D(tPaint, vUv - vec2(tx.x * 2.0, 0.0)).rgb
              + texture2D(tPaint, vUv + vec2(0.0, tx.y * 2.0)).rgb + texture2D(tPaint, vUv - vec2(0.0, tx.y * 2.0)).rgb;
      c = max(c + (c - nb * 0.25) * 0.8, 0.0);
      // a little of the original fine texture shows through the paint
      c += (base - texture2D(tPaint, vUv).rgb) * 0.12;
      // dark contour where the painted regions meet (brush edge)
      vec3 cx = texture2D(tPaint, vUv + vec2(tx.x * 1.5, 0.0)).rgb, cy = texture2D(tPaint, vUv + vec2(0.0, tx.y * 1.5)).rgb;
      float e = length(c - cx) + length(c - cy);
      c *= 1.0 - edge * smoothstep(0.08, 0.35, e);
      // soft posterize
      vec3 q = floor(c * posterize + 0.5) / posterize;
      c = mix(c, q, posterizeAmount);
      // grade: reds stay saturated, everything else slightly desaturated
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float red = smoothstep(0.12, 0.34, c.r - max(c.g, c.b)) * smoothstep(0.1, 0.3, c.r);
      c = mix(vec3(l), c, mix(1.0 - desat, 1.0 + 0.35 * redKeep, red));
      // shadows sink to indigo, highlights go to cold moonlight
      float sh = 1.0 - smoothstep(0.0, 0.2, l);
      c = mix(c, c * 0.7 + shadowTint, sh * crush);
      c = mix(c, c * highlightTint * 1.15, smoothstep(0.45, 1.0, l) * (1.0 - red) * 0.6);
      // painting contrast + saturation
      c = (c - 0.45) * contrast + 0.45;
      float l2 = dot(max(c, 0.0), vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l2), c, saturation);
      // canvas: emboss the weave against a fixed light
      float h0 = weave(px), hx = weave(px + vec2(1.0, 0.0)), hy = weave(px + vec2(0.0, 1.0));
      float lit = (h0 - hx) * 0.8 + (h0 - hy) * 0.6;
      c *= 1.0 + canvas * (lit * 2.0 + (h0 - 0.5) * 0.6);
      // vignette + heavy grain
      vec2 d = vUv - 0.5;
      c *= 1.0 - vignette * smoothstep(0.25, 0.95, dot(d, d) * 2.0);
      float g = hash(px + fract(time * 13.37) * 117.0) + hash(px * 0.5 + 7.0 + fract(time * 7.1) * 51.0) - 1.0;
      c += g * grain * (0.5 + 0.5 * (1.0 - l));
      gl_FragColor = vec4(mix(base, max(c, 0.0), amount), 1.0);
    }`,
};

export class PainterlyPass extends Pass {
  constructor() {
    super();
    const half = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rtTensor = new THREE.WebGLRenderTarget(1, 1, half);
    this.rtTensor2 = new THREE.WebGLRenderTarget(1, 1, half);
    this.rtPaint = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.rtSmall = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.tensorMat = new THREE.ShaderMaterial(tensorShader);
    this.blurMat = new THREE.ShaderMaterial(tensorBlurShader);
    this.kuwaharaMat = new THREE.ShaderMaterial(kuwaharaShader);
    this.compMat = new THREE.ShaderMaterial(compositeShader);
    this.copyMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } }, vertexShader: vert,
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }',
    });
    this.quad = new FullScreenQuad(null);
    this.scale = 0.5;
    this.mix = 0;
  }

  get uniforms() { return this.compMat.uniforms; }

  setSize(w, h) {
    this.fullW = w; this.fullH = h;
    const sw = Math.max(1, Math.round(w * this.scale)), sh = Math.max(1, Math.round(h * this.scale));
    for (const rt of [this.rtTensor, this.rtTensor2, this.rtPaint, this.rtSmall]) rt.setSize(sw, sh);
    const tx = new THREE.Vector2(1 / sw, 1 / sh);
    this.tensorMat.uniforms.texel.value.copy(tx);
    this.kuwaharaMat.uniforms.texel.value.copy(tx);
    this.smallTexel = tx;
    this.compMat.uniforms.resolution.value.set(w, h);
  }

  setScale(s) {
    if (s === this.scale) return;
    this.scale = s;
    if (this.fullW) this.setSize(this.fullW, this.fullH);
  }

  render(renderer, writeBuffer, readBuffer) {
    const q = this.quad;
    if (this.mix > 0.001) {
      // downsample the frame
      this.copyMat.uniforms.tDiffuse.value = readBuffer.texture;
      q.material = this.copyMat;
      renderer.setRenderTarget(this.rtSmall); q.render(renderer);
      // structure tensor + smoothing
      this.tensorMat.uniforms.tDiffuse.value = this.rtSmall.texture;
      q.material = this.tensorMat;
      renderer.setRenderTarget(this.rtTensor); q.render(renderer);
      const bu = this.blurMat.uniforms;
      q.material = this.blurMat;
      bu.tDiffuse.value = this.rtTensor.texture; bu.dir.value.set(this.smallTexel.x * 1.2, 0);
      renderer.setRenderTarget(this.rtTensor2); q.render(renderer);
      bu.tDiffuse.value = this.rtTensor2.texture; bu.dir.value.set(0, this.smallTexel.y * 1.2);
      renderer.setRenderTarget(this.rtTensor); q.render(renderer);
      // anisotropic kuwahara
      const ku = this.kuwaharaMat.uniforms;
      ku.tDiffuse.value = this.rtSmall.texture;
      ku.tTensor.value = this.rtTensor.texture;
      q.material = this.kuwaharaMat;
      renderer.setRenderTarget(this.rtPaint); q.render(renderer);
    }
    const c = this.compMat.uniforms;
    c.tDiffuse.value = readBuffer.texture;
    c.tPaint.value = this.rtPaint.texture;
    c.amount.value = this.mix;
    q.material = this.compMat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    q.render(renderer);
  }

  dispose() {
    for (const rt of [this.rtTensor, this.rtTensor2, this.rtPaint, this.rtSmall]) rt.dispose();
    for (const m of [this.tensorMat, this.blurMat, this.kuwaharaMat, this.compMat, this.copyMat]) m.dispose();
    this.quad.dispose();
  }
}
