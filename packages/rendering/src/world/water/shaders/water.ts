/**
 * `a3d_prd10_water` — PRD-10 §8.6 water fragment chunk: dual-scroll normal
 * detail, Schlick Fresnel (IOR 1.33), scene-depth refraction with foreground
 * rejection, Beer-Lambert absorption, shore + crest foam.
 * IBL specular, sun GGX specular, shadow factor and fog come from shared C-09 /
 * C-11 / C-13 / C-21 chunks at link time (`a3dWorldEnvSpecular`,
 * `a3dDirectSpecularGGX`, `a3dSunShadowAt`, `a3dApplyFog`, `a3dSunIrradiance`,
 * `a3dSkyIrradiance`); Path S binds `a3d_prd10_world_light_fallback`.
 */
import type { ShaderChunk } from "../../../contracts/program.js";

const glsl = /* glsl */ `
uniform sampler2D u_normal0;
uniform sampler2D u_normal1;
uniform vec2 u_flow0;
uniform vec2 u_flow1;
uniform float u_normalScale;
uniform highp sampler2D u_sceneDepth;    // aura.scene.depth (C-01)
uniform sampler2D u_sceneColor;          // aura.scene.color.copy (C-01)
uniform highp sampler2D u_planarReflection;
uniform vec2 u_viewport;
uniform float u_near;
uniform float u_far;
uniform vec3 u_absorption;               // Beer-Lambert per channel
uniform vec3 u_scatterColor;
uniform vec3 u_deepColor;                // Low path: no SceneColorCopy
uniform vec3 u_shallowColor;
uniform float u_refractionStrength;
uniform int u_reflectionMode;            // 0: env specular, 1: C-13 SSR, 2: planar
uniform float u_reflectionDistort;
uniform float u_time;
uniform sampler2D u_foam;
uniform float u_foamShoreDepth;
uniform float u_foamCrest;

float a3dWaterLinearDepth(float z) {
  return (2.0 * u_near * u_far) / (u_far + u_near - (z * 2.0 - 1.0) * (u_far - u_near));
}

// UDN blend of the wave normal with two scrolling normal-map samples.
vec3 a3dWaterNormal(vec3 waveNormal, vec2 xz, float time) {
  vec3 n0 = texture(u_normal0, xz / 6.0 + time * u_flow0).xyz * 2.0 - 1.0;
  vec3 n1 = texture(u_normal1, xz / 17.0 + time * u_flow1).xyz * 2.0 - 1.0;
  vec3 detail = normalize(vec3(n0.xy + n1.xy, n0.z * n1.z));
  vec3 t = normalize(cross(vec3(0.0, 0.0, 1.0), waveNormal));
  vec3 b = cross(waveNormal, t);
  return normalize(t * detail.x + b * detail.y + waveNormal * (detail.z * u_normalScale));
}

// Schlick Fresnel for water IOR 1.33.
float a3dWaterFresnel(vec3 n, vec3 V) {
  return 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
}

// Depth-based refraction: offset scene UV, reject foreground leaks, Beer-Lambert.
vec3 a3dWaterRefracted(vec2 suv, float waterZ, vec3 n, out float outThickness) {
  float sceneZ = a3dWaterLinearDepth(texture(u_sceneDepth, suv).r);
  float thickness = max(sceneZ - waterZ, 0.0);
  vec2 ruv = suv + n.xz * u_refractionStrength * clamp(thickness, 0.0, 1.0);
  if (a3dWaterLinearDepth(texture(u_sceneDepth, ruv).r) < waterZ) ruv = suv;
  vec3 refracted = texture(u_sceneColor, ruv).rgb;
  vec3 T = exp(-u_absorption * thickness);
  outThickness = thickness;
  return refracted * T;
}

// Shore + crest foam term (foam atlas R: shore pattern, G: crest pattern).
float a3dWaterFoam(vec2 xz, float thickness, float crest) {
  float shoreFoam = (1.0 - smoothstep(0.0, u_foamShoreDepth, thickness)) * texture(u_foam, xz / 3.0 + u_time * 0.02).r;
  float crestFoam = smoothstep(u_foamCrest, u_foamCrest - 0.15, crest) * texture(u_foam, xz / 5.0).g;
  return clamp(shoreFoam + crestFoam, 0.0, 1.0);
}

// Planar reflection sample; env specular and SSR are link-time substitutions.
vec3 a3dWaterPlanarReflection(vec2 suv, vec3 n) {
  return texture(u_planarReflection, suv + n.xz * u_reflectionDistort).rgb;
}
`;

const wgsl = /* wgsl */ `
@group(0) @binding(0) var u_normal0 : texture_2d<f32>;
@group(0) @binding(1) var u_normal1 : texture_2d<f32>;
@group(0) @binding(2) var u_sceneDepth : texture_2d<f32>;
@group(0) @binding(3) var u_sceneColor : texture_2d<f32>;
@group(0) @binding(4) var u_planarReflection : texture_2d<f32>;
@group(0) @binding(5) var u_foam : texture_2d<f32>;
@group(0) @binding(6) var u_samp : sampler;
struct A3dWaterUniforms {
  flow0 : vec2f,
  flow1 : vec2f,
  normalScale : f32,
  viewport : vec2f,
  near : f32,
  far : f32,
  absorption : vec3f,
  scatterColor : vec3f,
  deepColor : vec3f,
  shallowColor : vec3f,
  refractionStrength : f32,
  reflectionMode : i32,
  reflectionDistort : f32,
  time : f32,
  foamShoreDepth : f32,
  foamCrest : f32,
  pad : f32,
};
@group(0) @binding(7) var<uniform> u_water : A3dWaterUniforms;

fn a3dWaterLinearDepth(z : f32) -> f32 {
  return (2.0 * u_water.near * u_water.far) / (u_water.far + u_water.near - (z * 2.0 - 1.0) * (u_water.far - u_water.near));
}

fn a3dWaterFresnel(n : vec3f, V : vec3f) -> f32 {
  return 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
}
`;

export const a3d_prd10_water: ShaderChunk = {
  name: "a3d_prd10_water",
  owner: "prd10",
  stage: "fragment",
  glsl,
  wgsl
};
