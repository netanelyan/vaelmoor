import * as THREE from 'three';

// Analytic exponential height fog. Patches three's fog chunks globally so
// every built-in material (and Water/Points/Sprites) gets it for free.
//
// three only refreshes fogColor/fogNear/fogFar (linear Fog) or fogDensity
// (FogExp2) per frame, and clones any other uniforms at program creation.
// So HeightFog is a linear Fog that carries density in `near` and the
// height falloff in `far`; the base height is a compile-time constant.

const FOG_BASE_HEIGHT = '0.0';

export class HeightFog extends THREE.Fog {
  constructor(color, density = 0.012, falloff = 0.05) {
    super(color, density, falloff);
  }
  get density() { return this.near; }
  set density(v) { this.near = v; }
  get falloff() { return this.far; }
  set falloff(v) { this.far = v; }
}

THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying vec3 vFogWorldPos;
#endif
`;

THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
  // world position from view-space position: R^T * (mv - t)
  vFogWorldPos = (mvPosition.xyz - viewMatrix[3].xyz) * mat3(viewMatrix);
#endif
`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogNear; // density
  uniform float fogFar;  // height falloff
  varying vec3 vFogWorldPos;
#endif
`;

THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  vec3 fogRay = vFogWorldPos - cameraPosition;
  float fogDist = length(fogRay);
  float fogK = max(fogFar, 1e-4);
  float fogDy = fogRay.y;
  float fogCamTerm = exp(-fogK * (cameraPosition.y - ${FOG_BASE_HEIGHT}));
  float fogLine = abs(fogK * fogDy) > 1e-3 ? (1.0 - exp(-fogK * fogDy)) / (fogK * fogDy) : 1.0;
  // keep a floor so high ground and the far distance still haze out
  float fogHeightTerm = max(fogCamTerm * fogLine, 0.18);
  float fogFactor = 1.0 - exp(-fogNear * fogDist * fogHeightTerm);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(fogFactor, 0.0, 1.0));
#endif
`;
