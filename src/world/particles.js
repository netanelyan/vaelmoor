import * as THREE from 'three';
import { mulberry32 } from '../engine/noise.js';
import { shared, canvasTexture } from '../render/materials.js';
import { NOISE_GLSL } from '../shaders/noise.glsl.js';

// GPU-animated particle systems: everything moves in the vertex shader from
// a shared time uniform, so there is no per-frame CPU work.

let _puff;
function puffTexture() {
  return (_puff ||= canvasTexture(128, 128, (g, w, h) => {
    const r = mulberry32(9);
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = w / 2 + (r() - 0.5) * w * 0.4, y = h / 2 + (r() - 0.5) * h * 0.4, rad = w * (0.16 + r() * 0.2);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.22)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
  }, { srgb: false }));
}

/** Fireflies / magic motes: wandering HDR points that pulse. */
export function fireflies({ center, radius = 20, height = [0.5, 4], count = 80, color = '#b8ff6a', intensity = 6, size = 0.18, seed = 1, groundAt }) {
  const rand = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius;
    const x = center[0] + Math.cos(a) * r, z = center[1] + Math.sin(a) * r;
    const y = (groundAt ? groundAt(x, z) : 0) + height[0] + rand() * (height[1] - height[0]);
    pos.set([x, y, z], i * 3);
    phase[i] = rand() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const c = new THREE.Color(color).multiplyScalar(intensity);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uColor: { value: c }, uSize: { value: size } },
    vertexShader: /* glsl */`
      uniform float uTime, uSize;
      attribute float phase;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime * 0.35 + phase;
        p += vec3(sin(t * 1.3) * 1.6 + sin(t * 0.37) * 2.5, sin(t * 1.7 + 1.0) * 0.7, cos(t * 1.1) * 1.6 + cos(t * 0.29) * 2.5);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = pow(0.5 + 0.5 * sin(uTime * 2.2 + phase * 7.0), 2.0);
        gl_PointSize = uSize * 900.0 / -mv.z * (0.6 + 0.6 * vA);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 5.0) * (0.25 + 0.75 * vA);
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.name = 'fireflies';
  return pts;
}

/** Rising, curling smoke column (chimneys). */
export function smoke({ at, count = 30, height = 14, spread = 2.2, color = '#6a5f88', opacity = 0.35, size = 3.2, seed = 2, drift = [1.5, 0.4] }) {
  const rand = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const life = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos.set(at, i * 3); life[i] = rand(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('life', new THREE.BufferAttribute(life, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.time, uMap: { value: puffTexture() }, uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity }, uHeight: { value: height }, uSpread: { value: spread }, uSize: { value: size },
      uDrift: { value: new THREE.Vector2(...drift) },
      fogColor: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */`
      uniform float uTime, uHeight, uSpread, uSize;
      uniform vec2 uDrift;
      attribute float life;
      varying float vA;
      varying float vRot;
      void main() {
        float t = fract(life + uTime * 0.045);
        vec3 p = position;
        p.y += t * uHeight;
        p.x += uDrift.x * t * t * uHeight * 0.4 + sin(t * 9.0 + life * 30.0) * uSpread * t;
        p.z += uDrift.y * t * t * uHeight * 0.4 + cos(t * 7.0 + life * 20.0) * uSpread * t * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.45, 1.0, t));
        vRot = life * 6.28 + t * 1.5;
        gl_PointSize = uSize * (0.35 + t * 1.4) * 600.0 / -mv.z;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vA;
      varying float vRot;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float s = sin(vRot), co = cos(vRot);
        c = mat2(co, -s, s, co) * c + 0.5;
        float a = texture2D(uMap, c).a * vA * uOpacity * 0.9;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.name = 'smoke';
  return pts;
}

/** Low drifting mist: big soft sprites hugging the ground. */
export function mist({ center, radius = 40, count = 40, color = '#8f7ac8', opacity = 0.18, size = 18, seed = 3, groundAt, lift = 1.2 }) {
  const rand = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const ph = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius;
    const x = center[0] + Math.cos(a) * r, z = center[1] + Math.sin(a) * r;
    pos.set([x, (groundAt ? groundAt(x, z) : 0) + lift + rand() * 1.2, z], i * 3);
    ph[i] = rand() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uMap: { value: puffTexture() }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uSize: { value: size } },
    vertexShader: /* glsl */`
      uniform float uTime, uSize;
      attribute float phase;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.05 + phase) * 4.0;
        p.z += cos(uTime * 0.04 + phase * 1.3) * 4.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        vA = smoothstep(2.0, 12.0, d) * (1.0 - smoothstep(120.0, 220.0, d));
        gl_PointSize = min(uSize * 700.0 / d, 900.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vA;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a * vA * uOpacity * 0.8;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 2;
  pts.name = 'mist';
  return pts;
}

/** Soft additive light pool on the ground (window/lantern light spilling onto it). */
export function groundGlow({ x, z, radius = 6, color = '#5dff8a', intensity = 1.2, groundAt, stretch = 1, rotY = 0 }) {
  const seg = 10;
  const geo = new THREE.PlaneGeometry(radius * 2 * stretch, radius * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.rotateY(rotY);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const wx = x + p.getX(i), wz = z + p.getZ(i);
    p.setY(i, (groundAt ? groundAt(wx, wz) : 0) + 0.07);
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(intensity) } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        vec2 c = vUv - 0.5;
        float d = length(c) * 2.0;
        float a = pow(max(0.0, 1.0 - d), 2.2);
        a *= 0.8 + 0.4 * fbm3(vUv * 6.0);
        gl_FragColor = vec4(uColor * a, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, 0, z);
  m.renderOrder = 1;
  m.name = 'groundGlow';
  return m;
}

/**
 * A sea of mist seen from above (dark_05): a large soft plane whose tops are
 * lit and troughs sink into shadow, slowly churning, fading at the edges.
 */
export function cloudSea({ size = [260, 260], top = '#ff5a9a', mid = '#5a4aa0', low = '#2a0a3a', opacity = 0.95, noiseScale = 0.05, seed = 1 }) {
  const geo = new THREE.PlaneGeometry(size[0], size[1], 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uTop: { value: new THREE.Color(top) }, uMid: { value: new THREE.Color(mid) }, uLow: { value: new THREE.Color(low) }, uOpacity: { value: opacity }, uScale: { value: noiseScale }, uSeed: { value: seed * 13.1 } },
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec2 vUv;
      void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uMid, uLow; uniform float uTime, uOpacity, uScale, uSeed;
      varying vec3 vW; varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        vec2 p = vW.xz * uScale + uSeed;
        vec2 w = vec2(fbm3(p * 0.7 + uTime * 0.01), fbm3(p * 0.7 + 5.2 - uTime * 0.012));
        float n = fbm(p + w * 1.8 + uTime * 0.008);
        // billows: bright rounded tops, dark creases between them
        float bill = smoothstep(0.35, 0.8, n);
        float crease = smoothstep(0.0, 0.08, abs(fbm3(p * 2.3 + w) - 0.5));
        vec3 c = mix(mix(uLow, uMid, smoothstep(0.0, 0.55, bill)), uTop, smoothstep(0.55, 1.0, bill)) * (0.55 + 0.45 * crease);
        float edge = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x)) * smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
        gl_FragColor = vec4(c, uOpacity * edge * (0.75 + 0.25 * bill));
      }`,
    transparent: true,
    depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 1;
  m.name = 'cloudSea';
  return m;
}
