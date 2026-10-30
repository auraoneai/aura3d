/**
 * GU47 E-D (PRD §3.1) `#include <a3d_ibl>`: scene image-based light for `material.custom` fragment shaders.
 *
 *   - `vec3 a3dEnvDiffuse(N)`: the diffuse light a white Lambertian surface facing `N` reflects (multiply by albedo).
 *   - `vec3 a3dEnvSpecular(R, roughness)`: the environment radiance seen along the reflection vector `R` (multiply by a
 *     Fresnel / specular colour). Rougher surfaces read a blurrier mip.
 *
 * Same sources and conventions as the built-in lit programs (`program/chunks/indirect_default.glsl.ts`):
 *   - ambient `u_a3dEnvAmbient` (environment colour * intensity, an irradiance: diffuse / pi), with the hemisphere pair
 *     evaluated per normal in place of its flat mean (the ambient already carries that mean);
 *   - the scene's equirect environment map `u_a3dEnvMap` (v = 0 at +Y, `u_a3dEnvMapRotation` turns on u, decode 0 srgb /
 *     1 rgbe / 2 linear, roughness * 8 remapped onto the real mip range; diffuse reads the roughest mip);
 *   - else the probe's SH9 irradiance `u_a3dEnvSh` (same basis as `evaluateSH9Irradiance`), else the procedural sky
 *     (`u_a3dEnvSky` / `u_a3dEnvHorizon` / `u_a3dEnvGround`, premultiplied by its intensity; specular blurs toward its mean
 *     with roughness).
 * A prefiltered cube environment (no equirect map, no probe) falls back to the ambient + procedural terms. The forward pass
 * binds every uniform here only when the program declares it (`applyCustomShaderLightingUniforms`).
 */
export const A3D_IBL_GLSL = /* glsl */ `
#include <a3d_scene>
uniform vec3 u_a3dEnvAmbient;
uniform vec3 u_a3dEnvSh[9];
uniform float u_a3dEnvShEnabled;
uniform vec3 u_a3dEnvSky;
uniform vec3 u_a3dEnvHorizon;
uniform vec3 u_a3dEnvGround;
uniform sampler2D u_a3dEnvMap;
uniform float u_a3dEnvMapEnabled;
uniform float u_a3dEnvMapIntensity;
uniform float u_a3dEnvMapRotation;
uniform float u_a3dEnvMapMaxLod;
uniform float u_a3dEnvMapEncoding;

vec3 a3dEnvShIrradiance(vec3 n) {
  vec3 d = n / max(length(n), 1e-4);
  vec3 e = 0.886227 * u_a3dEnvSh[0]
    - 1.023328 * d.y * u_a3dEnvSh[1]
    + 1.023328 * d.z * u_a3dEnvSh[2]
    - 1.023328 * d.x * u_a3dEnvSh[3]
    + 0.858086 * d.x * d.y * u_a3dEnvSh[4]
    + 0.858086 * d.y * d.z * u_a3dEnvSh[5]
    + 0.247708 * (3.0 * d.z * d.z - 1.0) * u_a3dEnvSh[6]
    + 0.858086 * d.x * d.z * u_a3dEnvSh[7]
    + 0.429043 * (d.x * d.x - d.y * d.y) * u_a3dEnvSh[8];
  return max(e, vec3(0.0));
}

vec3 a3dEnvProcedural(vec3 n) {
  vec3 d = n / max(length(n), 1e-4);
  vec3 c = mix(u_a3dEnvGround, u_a3dEnvSky, clamp(d.y * 0.5 + 0.5, 0.0, 1.0));
  return mix(c, u_a3dEnvHorizon, clamp(1.0 - abs(d.y), 0.0, 1.0) * 0.55);
}

vec3 a3dEnvMapSample(vec3 direction, float lod) {
  vec3 d = direction / max(length(direction), 1e-4);
  float u = atan(d.z, d.x) * 0.15915494 + 0.5 + u_a3dEnvMapRotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) * 0.31830989;
  vec4 texel = textureLod(u_a3dEnvMap, vec2(fract(u), clamp(v, 0.0, 1.0)), clamp(lod, 0.0, 8.0) * (u_a3dEnvMapMaxLod / 8.0));
  vec3 rgb = max(texel.rgb, vec3(0.0));
  if (u_a3dEnvMapEncoding > 0.5 && u_a3dEnvMapEncoding < 1.5) {
    float exponent = texel.a * 255.0;
    rgb = exponent <= 0.0 ? vec3(0.0) : max(texel.rgb * exp2(exponent - 128.0) * (255.0 / 256.0), vec3(0.0));
  }
  return rgb * u_a3dEnvMapIntensity;
}

vec3 a3dEnvDiffuse(vec3 N) {
  vec3 hemiMean = 0.5 * (u_a3dHemiSky + u_a3dHemiGround);
  vec3 ambient = max(u_a3dEnvAmbient - hemiMean, vec3(0.0)) + a3dHemiLight(N);
  vec3 diffuse = ambient * 0.31830989;
  if (u_a3dEnvMapEnabled > 0.5) return diffuse + a3dEnvMapSample(N, 8.0);
  if (u_a3dEnvShEnabled > 0.5) return diffuse + a3dEnvShIrradiance(N) * 0.31830989;
  return diffuse + a3dEnvProcedural(N);
}

vec3 a3dEnvSpecular(vec3 R, float roughness) {
  float rough = clamp(roughness, 0.0, 1.0);
  if (u_a3dEnvMapEnabled > 0.5) return a3dEnvMapSample(R, rough * 8.0);
  if (u_a3dEnvShEnabled > 0.5) return a3dEnvShIrradiance(R) * 0.31830989;
  vec3 mean = (u_a3dEnvSky + u_a3dEnvHorizon + u_a3dEnvGround) / 3.0;
  return mix(a3dEnvProcedural(R), mean, rough * rough);
}
`;
