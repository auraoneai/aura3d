/**
 * `a3d_prd10_wind` — PRD-10 §8.2 wind chunk (frozen C-26 `WIND_CHUNK`).
 * Shared by foliage, grass and the depth pass (`prd10.wind` feature, hook
 * `vertex:deform`). Length-preserving offset, quadratic-in-height bend.
 */
import type { ShaderChunk } from "../../../contracts/program.js";

const glsl = /* glsl */ `
layout(std140) uniform A3DWind {
  vec4 u_windDirStrength;   // dir.xz, strength, time
  vec4 u_windGust;          // gustStrength, 1/gustScale, -, -
};
uniform sampler2D u_windNoise; // 64² RG8, repeat

vec3 a3dWindOffset(vec3 localPos, vec3 instanceOrigin, vec4 weights /* vertex colour */, float assetHeight) {
  vec2 dir = u_windDirStrength.xy; float strength = u_windDirStrength.z; float t = u_windDirStrength.w;
  vec2 gustUv = instanceOrigin.xz * u_windGust.y - dir * t * 0.08;
  float gust = texture(u_windNoise, gustUv).r * u_windGust.x;
  float h = clamp(localPos.y / max(assetHeight, 0.01), 0.0, 1.0);
  float bend = (strength + gust) * h * h * weights.r;                  // trunk/branch bend, quadratic in height
  float sway = sin(t * (1.1 + weights.b) + dot(instanceOrigin.xz, vec2(0.37, 0.71))) * 0.25 * strength * weights.r;
  vec3 offset = vec3(dir.x, 0.0, dir.y) * (bend + sway) * 0.35 * assetHeight;
  float flutter = sin(t * 7.3 + weights.b * 6.2831 + dot(localPos, vec3(2.1, 1.7, 2.9))) * 0.035 * (strength + gust) * weights.g;
  offset += vec3(flutter, flutter * 0.4, -flutter);
  // length preservation: keep the vertex on a sphere around the root to avoid stretching
  vec3 bent = localPos + offset;
  return normalize(bent) * length(localPos) - localPos;                // length-preserving offset
}
`;

const wgsl = /* wgsl */ `
struct A3DWind {
  dirStrength : vec4f,   // dir.xz, strength, time
  gust : vec4f,          // gustStrength, 1/gustScale, -, -
};
@group(0) @binding(0) var<uniform> u_wind : A3DWind;
@group(0) @binding(1) var u_windNoise : texture_2d<f32>;
@group(0) @binding(2) var u_windNoiseSampler : sampler;

fn a3dWindOffset(localPos : vec3f, instanceOrigin : vec3f, weights : vec4f, assetHeight : f32) -> vec3f {
  let dir = u_wind.dirStrength.xy;
  let strength = u_wind.dirStrength.z;
  let t = u_wind.dirStrength.w;
  let gustUv = instanceOrigin.xz * u_wind.gust.y - dir * t * 0.08;
  let gust = textureSample(u_windNoise, u_windNoiseSampler, gustUv).r * u_wind.gust.x;
  let h = clamp(localPos.y / max(assetHeight, 0.01), 0.0, 1.0);
  let bend = (strength + gust) * h * h * weights.r;
  let sway = sin(t * (1.1 + weights.b) + dot(instanceOrigin.xz, vec2f(0.37, 0.71))) * 0.25 * strength * weights.r;
  var offset = vec3f(dir.x, 0.0, dir.y) * (bend + sway) * 0.35 * assetHeight;
  let flutter = sin(t * 7.3 + weights.b * 6.2831 + dot(localPos, vec3f(2.1, 1.7, 2.9))) * 0.035 * (strength + gust) * weights.g;
  offset = offset + vec3f(flutter, flutter * 0.4, -flutter);
  let bent = localPos + offset;
  return normalize(bent) * length(localPos) - localPos;
}
`;

export const a3d_prd10_wind: ShaderChunk = {
  name: "a3d_prd10_wind",
  owner: "prd10",
  stage: "vertex",
  glsl,
  wgsl
};
