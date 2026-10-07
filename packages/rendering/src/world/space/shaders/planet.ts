/**
 * `a3d_prd10_planet` — PRD-10 §8.8 planet fragment chunk: terminator wrap
 * lighting with day/night transition, cloud self-shadow and the additive
 * 1.025x atmosphere rim term.
 */
import type { ShaderChunk } from "../../../contracts/program.js";

const glsl = /* glsl */ `
uniform sampler2D u_planetAlbedo;
uniform sampler2D u_planetNight;
uniform sampler2D u_planetClouds;
uniform vec3 u_atmosphereColor;

// Terminator wrap: wrap = saturate((dot(n,L) + 0.2) / 1.2).
float a3dPlanetTerminator(vec3 n, vec3 L) {
  return clamp((dot(n, L) + 0.2) / 1.2, 0.0, 1.0);
}

// Day side albedo; night map blends in where dot(n,L) < 0 with a 0.1 ramp.
vec3 a3dPlanetSurface(vec2 uv, vec3 n, vec3 L) {
  vec3 day = texture(u_planetAlbedo, uv).rgb * a3dPlanetTerminator(n, L);
  float night = 1.0 - smoothstep(-0.1, 0.0, dot(n, L));
  vec3 city = texture(u_planetNight, uv).rgb * night;
  // Cloud shadow: sample the cloud map offset toward the sun.
  float cloud = texture(u_planetClouds, uv + L.xz * 0.01).r;
  day *= 1.0 - cloud * 0.4;
  return day + city;
}

// Additive atmosphere shell (second sphere at 1.025x):
// rim = pow(1 - saturate(dot(n,V)), 3.5) * saturate(dot(n,L) + 0.35) * color.
vec3 a3dPlanetAtmosphere(vec3 n, vec3 V, vec3 L) {
  float rim = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.5);
  float day = clamp(dot(n, L) + 0.35, 0.0, 1.0);
  return u_atmosphereColor * rim * day;
}
`;

const wgsl = /* wgsl */ `
@group(0) @binding(0) var u_planetAlbedo : texture_2d<f32>;
@group(0) @binding(1) var u_planetNight : texture_2d<f32>;
@group(0) @binding(2) var u_planetClouds : texture_2d<f32>;
@group(0) @binding(3) var u_samp : sampler;
@group(0) @binding(4) var<uniform> u_atmosphereColor : vec3f;

fn a3dPlanetTerminator(n : vec3f, L : vec3f) -> f32 {
  return clamp((dot(n, L) + 0.2) / 1.2, 0.0, 1.0);
}

fn a3dPlanetAtmosphere(n : vec3f, V : vec3f, L : vec3f) -> vec3f {
  let rim = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.5);
  let day = clamp(dot(n, L) + 0.35, 0.0, 1.0);
  return u_atmosphereColor * rim * day;
}
`;

export const a3d_prd10_planet: ShaderChunk = {
  name: "a3d_prd10_planet",
  owner: "prd10",
  stage: "fragment",
  glsl,
  wgsl
};
