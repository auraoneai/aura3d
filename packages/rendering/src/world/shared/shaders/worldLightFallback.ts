/**
 * `a3d_prd10_world_light_fallback` — PRD-10 §8.0 Path S lighting fallback.
 * While `generateProgram` throws `PROGRAM_GENERATOR_PENDING` (C-02 stub),
 * `WorldFramePasses` links complete PRD-10 programs itself and these functions
 * stand in for the shared chunks: Lambert + GGX sun from the first directional
 * light, SH sky irradiance (C-09 stub), sky-horizon env specular, linear fog
 * (C-21 stub), and `a3dSunShadowAt` = 1.0 (C-11 stub). Every Path S frame is
 * evidence of geometry and textures only.
 */
import type { ShaderChunk } from "../../../contracts/program.js";

const glsl = /* glsl */ `
uniform vec3 u_sunDirection;       // first directional light, world space
uniform vec3 u_sunColor;
uniform vec3 u_skyHorizonColor;    // C-21 sky horizon at the view azimuth
uniform vec3 u_shIrradiance[9];    // C-09 SH9 stub coefficients
uniform vec3 u_fogColor;           // C-21 linear fog (stub)
uniform vec2 u_fogNearFar;
uniform vec3 u_ambientSH;          // flat ambient override (debug only; biomes use IBL)

// Lambert + GGX-ish specular from the first directional light.
vec3 a3dLambertSun(vec3 albedo, vec3 n) {
  return albedo * max(dot(n, u_sunDirection), 0.0) * u_sunColor;
}

vec3 a3dDirectSpecularGGX(vec3 n, vec3 V, vec3 L, float roughness) {
  vec3 H = normalize(V + L);
  float ndh = max(dot(n, H), 0.0);
  float a = max(roughness * roughness, 0.02);
  float a2 = a * a;
  float d = ndh * ndh * (a2 - 1.0) + 1.0;
  return u_sunColor * (a2 / max(3.14159265 * d * d, 1e-4)) * 0.25;
}

// C-09 SH9 stub irradiance (constant-term approximation on Path S).
vec3 a3dSampleIrradianceSH(vec3 n) {
  return u_shIrradiance[0] + u_shIrradiance[1] * n.y + u_shIrradiance[2] * n.z + u_shIrradiance[3] * n.x;
}

// Environment specular stand-in: C-21 sky horizon colour modulated by fresnel.
vec3 a3dWorldEnvSpecular(vec3 R, float roughness) {
  float f = pow(1.0 - clamp(R.y, 0.0, 1.0), 3.0);
  return u_skyHorizonColor * (0.04 + 0.96 * f) * (1.0 - roughness * 0.8);
}

vec3 a3dSunIrradiance() {
  return u_sunColor;
}

vec3 a3dSkyIrradiance() {
  return u_skyHorizonColor;
}

// C-11 stub: no shadow maps until PRD 02 is real.
float a3dSunShadowAt(vec3 worldPos) {
  return 1.0;
}

// C-21 stub fog: linear in [near, far].
vec3 a3dApplyFog(vec3 color, vec3 worldPos) {
  float d = distance(u_cameraPosition, worldPos);
  float f = clamp((d - u_fogNearFar.x) / max(u_fogNearFar.y - u_fogNearFar.x, 1e-4), 0.0, 1.0);
  return mix(color, u_fogColor, f);
}
`;

const wgsl = /* wgsl */ `
struct A3dWorldLight {
  sunDirection : vec3f,
  sunColor : vec3f,
  skyHorizonColor : vec3f,
  fogColor : vec3f,
  fogNearFar : vec2f,
  ambientSH : vec3f,
};
@group(0) @binding(0) var<uniform> u_light : A3dWorldLight;
@group(0) @binding(1) var<uniform> u_shIrradiance : array<vec3f, 9>;

fn a3dLambertSun(albedo : vec3f, n : vec3f) -> vec3f {
  return albedo * max(dot(n, u_light.sunDirection), 0.0) * u_light.sunColor;
}

fn a3dSunShadowAt(worldPos : vec3f) -> f32 {
  return 1.0;
}
`;

export const a3d_prd10_world_light_fallback: ShaderChunk = {
  name: "a3d_prd10_world_light_fallback",
  owner: "prd10",
  stage: "fragment",
  glsl,
  wgsl
};
