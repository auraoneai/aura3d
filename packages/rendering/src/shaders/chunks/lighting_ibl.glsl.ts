/**
 * a3d_prd02_lighting_ibl — split-sum IBL sampling (PRD-02 §8).
 * Specular: textureLod on the prefiltered cube at lod = (N−1)·r·(2−r)
 * (same curve as workers/cpuPrefilter.ts) times the DFG LUT.
 * Diffuse: the probe's SH9 texture via a3d_sh9Irradiance (sh9 chunk).
 */
export const LIGHTING_IBL_CHUNK_GLSL = /* glsl */ `
uniform samplerCube u_prd02EnvSpecular;
uniform sampler2D u_prd02DfgLut;
uniform int u_prd02EnvMipCount;
uniform vec3 u_prd02EnvRotation[4]; // basis columns 0..2 + intensity in .w of [3]

// (N-1)·r·(2-r) — identical to cpuPrefilter's roughnessToLod.
float a3d_roughnessToLod(float roughness, int mipCount) {
  float r = clamp(roughness, 0.0, 1.0);
  return float(mipCount - 1) * r * (2.0 - r);
}

vec3 a3d_envRotate(vec3 d) {
  return u_prd02EnvRotation[0] * d.x + u_prd02EnvRotation[1] * d.y + u_prd02EnvRotation[2] * d.z;
}

// DFG LUT (Karis): texelFetch at (ndv, roughness) → (scale, bias) on F0.
vec2 a3d_dfg(float ndv, float roughness) {
  return texture(u_prd02DfgLut, vec2(clamp(ndv, 0.0, 1.0), clamp(roughness, 0.0, 1.0))).rg;
}

vec3 a3d_iblSpecular(vec3 n, vec3 v, float roughness, vec3 f0) {
  vec3 r = reflect(-v, n);
  float lod = a3d_roughnessToLod(roughness, u_prd02EnvMipCount);
  vec3 prefiltered = textureLod(u_prd02EnvSpecular, a3d_envRotate(r), lod).rgb;
  vec2 dfg = a3d_dfg(max(dot(n, v), 0.0), roughness);
  return prefiltered * (f0 * dfg.x + dfg.y) * u_prd02EnvRotation[3].x;
}

// Fresnel for the diffuse lobe (roughness-aware Schlick).
vec3 a3d_iblDiffuseFresnel(vec3 f0, float roughness, float ndv) {
  vec3 fr = max(vec3(1.0 - roughness), f0) - f0;
  return f0 + fr * pow(1.0 - ndv, 5.0);
}
`;
