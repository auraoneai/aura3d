/**
 * a3d_prd02_lighting_ibl — environment terms (PRD-02 §8.1).
 * Uniform names follow §8.1 verbatim (they live in the A3DEnvironment
 * std140 block; bound by environment/EnvUniforms.ts):
 *   u_envSpecular (RGBA16F mip-mapped cube), u_envMipCount, u_envRotation,
 *   u_envDiffuseIntensity, u_envSpecularIntensity, u_envSH[7]
 *   (27 irradiance coefficients, cosine constants folded at upload),
 *   u_ambientIrradiance, u_hemiSky/u_hemiGround (pre-multiplied),
 *   u_hemiDirection. Plus u_envDfgLut for the split-sum DFG lookup.
 */
export const LIGHTING_IBL_CHUNK_GLSL = /* glsl */ `
uniform samplerCube u_envSpecular;
uniform sampler2D u_envDfgLut;
uniform float u_envMipCount;
uniform float u_envRotation;
uniform float u_envDiffuseIntensity;
uniform float u_envSpecularIntensity;
uniform vec4 u_envSH[7];
uniform vec3 u_ambientIrradiance;
uniform vec3 u_hemiSky;
uniform vec3 u_hemiGround;
uniform vec3 u_hemiDirection;

vec3 a3dRotateY(vec3 d, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
}

// (N-1)·r·(2-r) — identical to workers/cpuPrefilter.ts roughnessToLod.
float a3dRoughnessToLod(float r) {
  r = clamp(r, 0.0, 1.0);
  return (u_envMipCount - 1.0) * r * (2.0 - r);
}

// Unpack 27 folded coefficients from u_envSH[7] and evaluate
// Ramamoorthi–Hanrahan irradiance at n (constants folded at upload).
vec3 a3dSH9Irradiance(vec3 n) {
  n = normalize(n);
  float x = n.x, y = n.y, z = n.z;
  vec3 c0 = u_envSH[0].xyz;
  vec3 c1 = vec3(u_envSH[0].w, u_envSH[1].x, u_envSH[1].y);
  vec3 c2 = vec3(u_envSH[1].z, u_envSH[1].w, u_envSH[2].x);
  vec3 c3 = u_envSH[2].yzw;
  vec3 c4 = u_envSH[3].xyz;
  vec3 c5 = vec3(u_envSH[3].w, u_envSH[4].x, u_envSH[4].y);
  vec3 c6 = vec3(u_envSH[4].z, u_envSH[4].w, u_envSH[5].x);
  vec3 c7 = u_envSH[5].yzw;
  vec3 c8 = u_envSH[6].xyz;
  vec3 E = c0 * 0.886227;
  E += c1 * (-1.023328 * y) + c2 * (1.023328 * z) + c3 * (-1.023328 * x);
  E += c4 * (0.858086 * x * y) + c5 * (0.858086 * y * z);
  E += c6 * (0.247708 * (3.0 * z * z - 1.0));
  E += c7 * (0.858086 * x * z) + c8 * (0.429043 * (x * x - y * y));
  return max(E, vec3(0.0));
}

vec3 a3dIndirectDiffuseIrradiance(vec3 n) {
  vec3 E = a3dSH9Irradiance(a3dRotateY(n, u_envRotation)) * u_envDiffuseIntensity;
  E += u_ambientIrradiance;
  E += mix(u_hemiGround, u_hemiSky, dot(n, u_hemiDirection) * 0.5 + 0.5);
  return E; // caller multiplies by kd*albedo/PI and ao
}

vec3 a3dEnvSpecularRadiance(vec3 n, vec3 v, float r) {
  vec3 R = reflect(-v, n);
  R = normalize(mix(R, n, r * r * r * r)); // three getIBLRadiance bend
  return textureLod(u_envSpecular, a3dRotateY(R, u_envRotation), a3dRoughnessToLod(r)).rgb * u_envSpecularIntensity;
}

// Lagarde 2014 specular occlusion.
float a3dSpecularOcclusion(float NoV, float ao, float r) {
  return clamp(pow(NoV + ao, exp2(-16.0 * r - 1.0)) - 1.0 + ao, 0.0, 1.0);
}

float a3dHorizonOcclusion(vec3 R, vec3 Ng) {
  float h = min(1.0 + dot(R, Ng), 1.0);
  return h * h;
}

// DFG LUT (Karis): texelFetch at (ndv, roughness) → (scale, bias) on F0.
vec2 a3d_dfg(float ndv, float roughness) {
  return texture(u_envDfgLut, vec2(clamp(ndv, 0.0, 1.0), clamp(roughness, 0.0, 1.0))).rg;
}

vec3 a3d_iblSpecular(vec3 n, vec3 v, float roughness, vec3 f0) {
  vec2 dfg = a3d_dfg(max(dot(n, v), 0.0), roughness);
  return a3dEnvSpecularRadiance(n, v, roughness) * (f0 * dfg.x + dfg.y);
}

// Fresnel for the diffuse lobe (roughness-aware Schlick).
vec3 a3d_iblDiffuseFresnel(vec3 f0, float roughness, float ndv) {
  vec3 fr = max(vec3(1.0 - roughness), f0) - f0;
  return f0 + fr * pow(1.0 - ndv, 5.0);
}
`;
