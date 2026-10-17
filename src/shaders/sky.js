import * as THREE from 'three';
import { NOISE_GLSL } from './noise.glsl.js';

// Painterly night sky: gradient + horizon glow, domain-warped fbm clouds with
// brush-stroke streaks, two star layers, a moon (full or crescent) with halo,
// optional aurora curtains and a hazy mountain silhouette on the horizon.
// Everything is driven by uniforms so areas can blend palettes smoothly.

export const SKY_UNIFORM_KEYS = {
  colors: ['zenith', 'mid', 'horizon', 'glow', 'cloudDark', 'cloudLight', 'cloudRim',
    'moonColor', 'auroraA', 'auroraB', 'mountain', 'fogColor', 'planetAColor', 'planetBColor', 'nebulaA', 'nebulaB'],
  floats: ['glowStrength', 'cloudCover', 'cloudScale', 'cloudSharp', 'cloudBright', 'cloudHeight', 'stars',
    'moonSize', 'moonPhase', 'moonGlow', 'moonBright', 'aurora', 'mountainHeight', 'swirl', 'planetASize', 'planetBSize', 'nebula', 'sparkle'],
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
uniform vec3 planetAColor, planetBColor, nebulaA, nebulaB, planetADir, planetBDir;
uniform float planetASize, planetBSize, nebula, sparkle;
uniform float time;
varying vec3 vDir;

${NOISE_GLSL}

float ridge(float phi, float seed) {
  vec2 c = vec2(cos(phi), sin(phi));
  float n = 0.6 * fbm3(c * 2.2 + seed) + 0.4 * fbm3(c * 7.0 + seed * 2.0);
  return n;
}

// a small shaded planet (lit from the upper left, banded)
vec3 planet(vec3 dir, vec3 col, vec3 pdir, float size, vec3 pcol) {
  if (size <= 0.0) return col;
  vec3 pd = normalize(pdir);
  float f = dot(dir, pd);
  if (f <= 0.0) return col;
  vec3 r = normalize(cross(pd, vec3(0.0, 1.0, 0.0)));
  vec3 u = cross(r, pd);
  vec2 q = vec2(dot(dir, r), dot(dir, u)) / size;
  float d = length(q);
  float rim = exp(-max(d - 1.0, 0.0) * 9.0) * 0.35;
  if (d > 1.0) return col + pcol * rim * 0.4;
  vec3 n = vec3(q, sqrt(1.0 - d * d));
  float shade = 0.18 + 0.82 * clamp(dot(n, normalize(vec3(-0.55, 0.45, 0.7))), 0.0, 1.0);
  float bands = 0.8 + 0.3 * fbm3(vec2(q.y * 5.0, q.x * 1.5) + 4.0);
  float disc = 1.0 - smoothstep(0.96, 1.0, d);
  return mix(col, pcol * shade * bands, disc);
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
  // angular distance from the moon's edge (radians), so big and small moons
  // get halos of the same angular size instead of flooding the sky
  float litFrac = 1.0 - 0.6 * moonPhase;
  float moonAng = acos(clamp(facing, -1.0, 1.0));
  float edgeAng = max(moonAng - atan(moonSize), 0.0);
  float nearMoon = exp(-edgeAng * 9.0);
  float halo = moonGlow * litFrac * (0.8 * exp(-edgeAng * 30.0) + 0.1 * exp(-edgeAng * 7.0)) * smoothstep(0.97, 1.06, mdist);
  col += moonColor * halo;

  // --- nebula: coloured dust bands across the sky
  if (nebula > 0.001 && h > -0.05) {
    vec2 np = vec2(phi * 1.3, h * 3.0);
    float band = exp(-pow((h - 0.3 - 0.18 * sin(phi * 1.4 + 1.0)) * 2.6, 2.0));
    float n1 = fbm(np * 1.6 + 3.0), n2 = fbm(np * 3.4 + 7.0);
    col += nebula * band * (nebulaA * smoothstep(0.42, 0.85, n1) + nebulaB * smoothstep(0.55, 0.9, n2) * 0.9);
  }

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
  // big four-point sparkle stars (painted skies)
  if (sparkle > 0.001) {
    vec3 sp = dir * 60.0;
    vec3 cell = floor(sp);
    vec3 rnd = hash33(cell + 91.0);
    if (rnd.x < 0.05 * sparkle) {
      vec3 ctr = cell + 0.5 + 0.3 * (rnd - 0.5);
      vec3 dl = sp - ctr;
      vec3 t1 = normalize(cross(dir, vec3(0.0, 1.0, 0.0)));
      vec3 t2 = cross(dir, t1);
      float a = dot(dl, t1), b = dot(dl, t2);
      float s = exp(-abs(a) * 26.0) * exp(-abs(b) * 4.0) + exp(-abs(b) * 26.0) * exp(-abs(a) * 4.0) + exp(-(a * a + b * b) * 90.0) * 2.0;
      col += mix(vec3(1.0, 0.95, 0.85), vec3(0.8, 0.85, 1.0), rnd.y) * s * (0.6 + rnd.z) * starMask * 1.5;
    }
  }
  col = planet(dir, col, planetADir, planetASize, planetAColor);
  col = planet(dir, col, planetBDir, planetBSize, planetBColor);

  // --- aurora curtains
  if (aurora > 0.001 && h > -0.02) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float e = 0.46 + fi * 0.14 + 0.10 * sin(phi * (2.0 + fi) + time * 0.05 + fi * 2.0)
              + 0.09 * (fbm3(vec2(phi * 3.0 + fi * 7.0, time * 0.03)) - 0.5);
      float v = (e - h) / (0.34 + 0.08 * fi);
      float curtain = v > 0.0 ? exp(-v * 2.6) : exp(v * 22.0);
      float rays = 0.45 + 0.55 * fbm3(vec2(phi * 38.0 + fi * 13.0, time * 0.25 + v * 0.6));
      rays *= 0.6 + 0.4 * sin(phi * 9.0 + time * 0.2 + fi);
      vec3 c = mix(auroraA, auroraB, clamp(-v * 2.5 + 0.35, 0.0, 1.0));
      acc += c * curtain * rays * (1.0 - 0.35 * fi);
    }
    col += acc * aurora * smoothstep(-0.02, 0.08, h);
  }

  float cloudDens = 0.0;

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
    cc += cloudRim * edge * (0.3 + 1.6 * nearMoon);
    cc += moonColor * nearMoon * 0.18 * moonGlow * lit;
    cc *= cloudBright;
    cc = mix(cc, horizon * 1.05, exp(-hp * 8.0) * 0.6);
    // let the moon glow through thinner cloud
    cloudDens = dens;
    col = mix(col, cc, dens * 0.96);
  }

  // --- moon disc, composited over the clouds with a light veil so the
  // crescent always reads; the dark side occludes the sky behind it.
  if (mdist < 1.05) {
    float disc = 1.0 - smoothstep(0.965, 1.0, mdist);
    vec2 off = vec2(0.62, 0.22) * moonPhase * 1.25;
    float shadow = moonPhase > 0.01 ? 1.0 - smoothstep(0.93, 1.02, length(muv - off)) : 0.0;
    float maria = fbm3(muv * 2.2 + 3.0);
    float surface = 0.82 - 0.32 * smoothstep(0.42, 0.7, maria) - 0.14 * smoothstep(0.5, 0.8, fbm3(muv * 5.0 + 9.0)) + 0.08 * fbm3(muv * 14.0);
    float limb = 0.85 + 0.15 * sqrt(max(0.0, 1.0 - mdist * mdist));
    float lit = disc * (1.0 - shadow);
    vec3 mcol = moonColor * moonBright * surface * limb;
    vec3 darkSide = col * 0.45 + moonColor * 0.03;
    vec3 m = mix(darkSide, mcol, 1.0 - shadow);
    col = mix(col, m, disc * (1.0 - cloudDens * 0.45));
  }

  // --- distant mountains
  if (mountainHeight > 0.0) {
    float rg = mountainHeight * (0.25 + 0.75 * ridge(phi, 3.1));
    float rg2 = mountainHeight * 0.55 * (0.2 + 0.8 * ridge(phi + 1.3, 9.7));
    if (h < rg2) col = mix(col, mix(mountain, fogColor, 0.35), 1.0);
    else if (h < rg) col = mix(col, mix(mountain, fogColor, 0.62), 1.0);
  }

  // below the horizon: fog colour
  col = mix(col, fogColor, (1.0 - smoothstep(-0.06, 0.0, h)));
  gl_FragColor = vec4(col, 1.0);
}
`;

function makeUniforms() {
  const u = { time: { value: 0 }, moonDir: { value: new THREE.Vector3(0, 0.4, -1).normalize() }, planetADir: { value: new THREE.Vector3(0, 1, 0) }, planetBDir: { value: new THREE.Vector3(0, 1, 0) } };
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
    if (sky.planetADir) u.planetADir.value.copy(sky.planetADir);
    if (sky.planetBDir) u.planetBDir.value.copy(sky.planetBDir);
  }
}
