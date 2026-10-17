import * as THREE from 'three';
import { NOISE_GLSL } from './noise.glsl.js';

// Painterly night sky: gradient + horizon glow, domain-warped fbm clouds with
// brush-stroke streaks, two star layers, a moon (full or crescent) with halo,
// optional aurora curtains and a hazy mountain silhouette on the horizon.
// Everything is driven by uniforms so areas can blend palettes smoothly.

export const SKY_UNIFORM_KEYS = {
  colors: ['zenith', 'mid', 'horizon', 'glow', 'cloudDark', 'cloudLight', 'cloudRim',
    'moonColor', 'auroraA', 'auroraB', 'mountain', 'fogColor'],
  floats: ['glowStrength', 'cloudCover', 'cloudScale', 'cloudSharp', 'cloudBright', 'cloudHeight', 'stars',
    'moonSize', 'moonPhase', 'moonGlow', 'moonBright', 'aurora', 'mountainHeight', 'swirl'],
};

const vertexShader = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // pin to the far plane
}
`;

const fragmentShader = /* glsl */`
uniform vec3 zenith, mid, horizon, glow, cloudDark, cloudLight, cloudRim, moonColor, auroraA, auroraB, mountain, fogColor;
uniform float glowStrength, cloudCover, cloudScale, cloudSharp, cloudBright, cloudHeight, stars;
uniform float moonSize, moonPhase, moonGlow, moonBright, aurora, mountainHeight, swirl;
uniform vec3 moonDir;
uniform float time;
varying vec3 vDir;

${NOISE_GLSL}

float ridge(float phi, float seed) {
  vec2 c = vec2(cos(phi), sin(phi));
  float n = 0.6 * fbm3(c * 2.2 + seed) + 0.4 * fbm3(c * 7.0 + seed * 2.0);
  return n;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  float phi = atan(dir.z, dir.x);

  // --- gradient
  vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.28, h));
  col = mix(col, zenith, smoothstep(0.22, 0.95, h));
  col += glow * glowStrength * exp(-abs(h - 0.005) * 11.0);

  // --- moon frame
  vec3 md = normalize(moonDir);
  vec3 mr = normalize(cross(md, vec3(0.0, 1.0, 0.0)));
  vec3 mu = cross(mr, md);
  float facing = dot(dir, md);
  vec2 muv = vec2(dot(dir, mr), dot(dir, mu)) / moonSize;
  float mdist = facing > 0.0 ? length(muv) : 1e3;

  // moon halo on the sky (wide atmospheric glow + tight corona)
  float litFrac = 1.0 - 0.6 * moonPhase;
  float halo = 0.0;
  if (facing > 0.0) {
    float a = max(mdist - 1.0, 0.0);
    halo = moonGlow * litFrac * (1.0 * exp(-a * 1.8) + 0.16 * exp(-a * 0.35));
  }
  col += moonColor * halo;

  // --- stars
  float starMask = smoothstep(0.02, 0.25, h);
  vec3 starCol = vec3(0.0);
  for (int l = 0; l < 2; l++) {
    float k = l == 0 ? 160.0 : 380.0;
    vec3 sp = dir * k;
    vec3 cell = floor(sp);
    vec3 rnd = hash33(cell + float(l) * 31.0);
    vec3 ctr = cell + 0.5 + 0.35 * (rnd - 0.5);
    float d = length(sp - ctr);
    float on = step(rnd.x, (l == 0 ? 0.11 : 0.18) * stars);
    float size = l == 0 ? 0.12 : 0.08;
    float tw = 0.65 + 0.35 * sin(time * (1.5 + rnd.y * 3.0) + rnd.z * 40.0);
    float b = on * smoothstep(size, 0.0, d) * tw * (l == 0 ? 3.2 : 1.6) * (0.4 + rnd.y);
    vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.8, 0.95), rnd.z);
    starCol += tint * b;
  }
  col += starCol * starMask;

  // --- aurora curtains
  if (aurora > 0.001 && h > -0.02) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float e = 0.30 + fi * 0.13 + 0.10 * sin(phi * (2.0 + fi) + time * 0.05 + fi * 2.0)
              + 0.09 * (fbm3(vec2(phi * 3.0 + fi * 7.0, time * 0.03)) - 0.5);
      float v = (e - h) / (0.26 + 0.08 * fi);
      float curtain = v > 0.0 ? exp(-v * 2.6) : exp(v * 22.0);
      float rays = 0.45 + 0.55 * fbm3(vec2(phi * 38.0 + fi * 13.0, time * 0.25 + v * 0.6));
      rays *= 0.6 + 0.4 * sin(phi * 9.0 + time * 0.2 + fi);
      vec3 c = mix(auroraA, auroraB, clamp(-v * 2.5 + 0.35, 0.0, 1.0));
      acc += c * curtain * rays * (1.0 - 0.35 * fi);
    }
    col += acc * aurora * smoothstep(-0.02, 0.08, h);
  }

  // --- moon disc (drawn under clouds)
  if (mdist < 1.05) {
    float disc = 1.0 - smoothstep(0.965, 1.0, mdist);
    vec2 off = vec2(0.62, 0.22) * moonPhase * 1.25;
    float shadow = moonPhase > 0.01 ? 1.0 - smoothstep(0.93, 1.02, length(muv - off)) : 0.0;
    float maria = fbm3(muv * 2.2 + 3.0);
    float surface = 0.78 + 0.35 * smoothstep(0.35, 0.75, maria) - 0.18 * smoothstep(0.55, 0.8, fbm3(muv * 6.0));
    float limb = 0.85 + 0.15 * sqrt(max(0.0, 1.0 - mdist * mdist));
    float lit = disc * (1.0 - shadow);
    vec3 mcol = moonColor * moonBright * surface * limb;
    col = mix(col, mcol, lit);
    col += moonColor * 0.04 * disc * shadow; // earthshine
  }

  // --- painterly clouds: big soft masses, low-frequency swirl, self-shadowed
  // toward the moon, with faint brush strokes running along the flow.
  if (h > -0.08) {
    float hp = max(h, 0.0);
    float proj = cloudScale / (hp * 0.85 + cloudHeight);
    vec2 p = dir.xz * proj;
    float t = time * 0.01;
    p += vec2(t, t * 0.35);
    vec2 w = vec2(fbm3(p * 0.45 + 3.1), fbm3(p * 0.45 + vec2(7.7, 1.9))) - 0.5;
    vec2 pw = p + w * swirl;
    float n = fbm(pw);
    float thr = 1.0 - cloudCover;
    float dens = smoothstep(thr - cloudSharp, thr + cloudSharp * 1.4, n);
    dens *= smoothstep(-0.08, 0.06, h);

    // light direction in the projected plane: toward the moon's projection
    vec2 moonP = md.xz * (cloudScale / (max(md.y, 0.05) * 0.85 + cloudHeight)) + vec2(t, t * 0.35);
    vec2 ld = normalize(moonP - p + 1e-4) * 0.11;
    float nl = fbm(pw + ld);
    float lit = clamp((n - nl) * 7.0 + 0.45, 0.0, 1.0);
    float body = smoothstep(thr, thr + 0.35, n); // thicker = darker core

    vec3 cc = mix(cloudDark, cloudLight, lit);
    cc = mix(cc, cloudDark * 0.8, body * 0.35 * (1.0 - lit));
    // brush strokes
    float ang = atan(w.y, w.x);
    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    float strokes = gnoise(rot * pw * vec2(2.0, 16.0));
    cc *= 0.93 + 0.12 * strokes;
    // silver lining on thin edges, strongest near the moon
    float edge = clamp(1.0 - abs(dens - 0.4) * 2.2, 0.0, 1.0) * lit;
    float nearMoon = facing > 0.0 ? exp(-max(mdist - 1.0, 0.0) * 0.1) : 0.0;
    cc += cloudRim * edge * (0.3 + 1.6 * nearMoon);
    cc += moonColor * nearMoon * 0.3 * moonGlow * lit;
    cc *= cloudBright;
    cc = mix(cc, horizon * 1.05, exp(-hp * 8.0) * 0.6);
    // let the moon glow through thinner cloud
    float veil = mdist < 1.4 ? 0.5 * (1.0 - smoothstep(0.9, 1.4, mdist)) : 0.0;
    col = mix(col, cc, dens * 0.96 * (1.0 - veil));
  }

  // --- distant mountains
  if (mountainHeight > 0.0) {
    float rg = mountainHeight * (0.25 + 0.75 * ridge(phi, 3.1));
    float rg2 = mountainHeight * 0.55 * (0.2 + 0.8 * ridge(phi + 1.3, 9.7));
    if (h < rg2) col = mix(col, mix(mountain, fogColor, 0.35), 1.0);
    else if (h < rg) col = mix(col, mix(mountain, fogColor, 0.62), 1.0);
  }

  // below the horizon: fog colour
  col = mix(col, fogColor, smoothstep(0.0, -0.06, h));
  gl_FragColor = vec4(col, 1.0);
}
`;

function makeUniforms() {
  const u = { time: { value: 0 }, moonDir: { value: new THREE.Vector3(0, 0.4, -1).normalize() } };
  for (const k of SKY_UNIFORM_KEYS.colors) u[k] = { value: new THREE.Color() };
  for (const k of SKY_UNIFORM_KEYS.floats) u[k] = { value: 0 };
  return u;
}

export class SkyDome extends THREE.Mesh {
  constructor(radius = 900) {
    const geo = new THREE.SphereGeometry(radius, 64, 32);
    const mat = new THREE.ShaderMaterial({
      uniforms: makeUniforms(),
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    super(geo, mat);
    this.frustumCulled = false;
    this.renderOrder = -10;
    this.name = 'sky';
  }

  get uniforms() { return this.material.uniforms; }

  /** Apply a blended, already-parsed sky palette (see Atmosphere). */
  apply(sky) {
    const u = this.material.uniforms;
    for (const k of SKY_UNIFORM_KEYS.colors) if (sky[k]) u[k].value.copy(sky[k]);
    for (const k of SKY_UNIFORM_KEYS.floats) if (sky[k] !== undefined) u[k].value = sky[k];
    if (sky.moonDir) u.moonDir.value.copy(sky.moonDir);
  }
}
