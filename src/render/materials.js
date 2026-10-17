import * as THREE from 'three';

// Shared, live uniforms injected into built-in materials via onBeforeCompile.
// Uniform objects are passed by reference, so updating `.value` here updates
// every material that uses them without recompiling.
export const shared = {
  rimColor: { value: new THREE.Color(0x9d7bff) },
  rimStrength: { value: 1.0 },
  time: { value: 0 },
  wind: { value: 1.0 },
};

/**
 * Adds a view-dependent fresnel rim (the "strong rim light" look) and optional
 * wind sway to a MeshStandard/Physical material.
 *  rim: multiplier on the shared rim strength (0 = none)
 *  sway: metres of sway at height `swayHeight` (vegetation only)
 */
export function stylize(material, { rim = 1, rimPower = 3.0, sway = 0, swayHeight = 10, emissiveBoost = 0 } = {}) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.uniforms.rimColor = shared.rimColor;
    shader.uniforms.rimStrength = shared.rimStrength;
    shader.uniforms.uTime = shared.time;
    shader.uniforms.uWind = shared.wind;
    shader.uniforms.rimLocal = { value: rim };
    shader.uniforms.rimPower = { value: rimPower };

    if (sway > 0) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uWind;`)
        .replace('#include <begin_vertex>', /* glsl */`
          #include <begin_vertex>
          {
            vec4 swayBase = vec4(0.0, 0.0, 0.0, 1.0);
            #ifdef USE_INSTANCING
              swayBase = instanceMatrix * swayBase;
            #endif
            swayBase = modelMatrix * swayBase;
            float hgt = clamp(position.y / ${swayHeight.toFixed(2)}, 0.0, 1.5);
            float ph = swayBase.x * 0.13 + swayBase.z * 0.17;
            float s = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25;
            transformed.x += s * ${sway.toFixed(3)} * hgt * hgt * uWind;
            transformed.z += cos(uTime * 1.1 + ph) * ${(sway * 0.6).toFixed(3)} * hgt * hgt * uWind;
          }
        `);
    }

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
        uniform vec3 rimColor;
        uniform float rimStrength;
        uniform float rimLocal;
        uniform float rimPower;`)
      .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
        {
          float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
          float rimF = pow(1.0 - ndv, rimPower);
          totalEmissiveRadiance += rimColor * rimF * rimStrength * rimLocal;
          ${emissiveBoost ? `totalEmissiveRadiance *= ${(1 + emissiveBoost).toFixed(2)};` : ''}
        }`);
  };
  const key = `stylize:${rim}:${rimPower}:${sway}:${swayHeight}:${emissiveBoost}`;
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + key;
  return material;
}

/**
 * World-space triplanar mapping for map / normalMap / roughnessMap, so big
 * rocks and cliffs never show stretched UVs. `scale` = texture repeats per metre.
 */
export function triplanar(material, scale = 0.12, sharpness = 4) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriN;')
      .replace('#include <worldpos_vertex>', /* glsl */`#include <worldpos_vertex>
        {
          mat4 triM = modelMatrix;
          #ifdef USE_INSTANCING
            triM = modelMatrix * instanceMatrix;
          #endif
          vTriPos = (triM * vec4(transformed, 1.0)).xyz;
          vTriN = normalize(mat3(triM) * objectNormal);
        }`);
    const T = /* glsl */`
      varying vec3 vTriPos;
      varying vec3 vTriN;
      vec3 triW() { vec3 w = pow(abs(normalize(vTriN)), vec3(${sharpness.toFixed(1)})); return w / (w.x + w.y + w.z); }
      vec4 triSample(sampler2D t) {
        vec3 w = triW(); vec3 p = vTriPos * ${scale.toFixed(4)};
        return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z;
      }`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + T)
      .replace('#include <map_fragment>', /* glsl */`
        #ifdef USE_MAP
          diffuseColor *= triSample(map);
        #endif`)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          roughnessFactor *= triSample(roughnessMap).g;
        #endif`)
      .replace('#include <normal_fragment_maps>', /* glsl */`
        #ifdef USE_NORMALMAP_TANGENTSPACE
        {
          vec3 w = triW(); vec3 p = vTriPos * ${scale.toFixed(4)};
          vec3 n = normalize(vTriN);
          vec3 tx = texture2D(normalMap, p.zy).xyz * 2.0 - 1.0;
          vec3 ty = texture2D(normalMap, p.xz).xyz * 2.0 - 1.0;
          vec3 tz = texture2D(normalMap, p.xy).xyz * 2.0 - 1.0;
          tx.xy *= normalScale; ty.xy *= normalScale; tz.xy *= normalScale;
          // whiteout blend into world space
          tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
          ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
          tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
          vec3 wn = normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
          #ifdef DOUBLE_SIDED
            normal *= faceDirection;
          #endif
        }
        #endif`);
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + `tri:${scale}:${sharpness}`;
  return material;
}

/** Canvas helper for small procedural textures. */
export function canvasTexture(w, h, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Soft radial sprite (glows, smoke, fireflies). */
let _radial;
export function radialTexture() {
  return (_radial ||= canvasTexture(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }, { srgb: false }));
}
