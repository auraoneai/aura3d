/**
 * `a3d_prd10_grass` — PRD-10 §8.5 grass chunk (vertex stage).
 * Per-chunk uniform placement with a stratified-jitter hash per
 * `gl_InstanceID`, quadratic-Bézier blade shape and density falloff.
 * The fragment side (two-sided translucency + root->tip AO) lands with the
 * `prd10.grass` feature wiring; Low tier draws alpha-tested cards instead.
 */
import type { ShaderChunk } from "../../../contracts/program.js";

const glsl = /* glsl */ `
uniform vec4 u_grassChunk;   // chunkOriginXZ, chunkSize, seed
uniform int u_grassBladeCount;
uniform float u_grassRadius; // density falloff radius from the camera
uniform float u_grassBladeHeight;
uniform float u_grassBladeWidth;

// Stratified jitter hash per (seed, instance): position, yaw, height, bend.
vec4 a3dGrassHash(float seed, int instance) {
  uint h = uint(seed * 1664525.0) ^ uint(instance * 1013904223.0) ^ uint(instance * 2654435761.0);
  h ^= h >> 16u; h *= 2246822519u; h ^= h >> 13u;
  uvec4 v = uvec4(h, h * 3266489917u + 1u, h ^ 668265263u, h * 374761393u);
  return fract(vec4(v) * (1.0 / 4294967296.0));
}

// Quadratic Bézier blade vertex. t in [0,1] from root to tip; side in {-1,1}.
vec3 a3dGrassBladeVertex(vec3 root, float yaw, float height, float bend, float t, float side) {
  vec2 facing = vec2(cos(yaw), sin(yaw));
  vec2 rightV = vec2(-facing.y, facing.x);
  float width = mix(1.0, 0.05, t * t);            // taper to the tip
  vec2 lean = facing * bend * t * t;              // quadratic lean forward
  vec3 p = vec3(root.x + lean.x * height, root.y + t * height, root.z + lean.y * height);
  p.xz += rightV * (u_grassBladeWidth * width * side);
  return p;
}

// Per-instance placement inside the chunk (returns zero-height for culled blades).
vec3 a3dGrassBladeRoot(int instance, out float yaw, out float height, out float bend, out float phase) {
  vec4 h = a3dGrassHash(u_grassChunk.w, instance);
  vec2 cell = vec2(instance % 32, instance / 32) / 32.0;
  vec2 jitter = (h.xy * 0.9 + 0.05) / 32.0;
  vec2 xz = u_grassChunk.xy + (cell + jitter) * u_grassChunk.z;
  yaw = h.z * 6.2831853;
  height = u_grassBladeHeight * (0.6 + 0.8 * h.w);
  bend = 0.15 + 0.35 * h.y;
  phase = h.x * 6.2831853;
  // Density falloff: blades beyond radius*(0.5+0.5*h.w) collapse (zero height).
  float d = distance(u_cameraPosition, vec3(xz.x, 0.0, xz.y));
  float falloff = u_grassRadius * (0.5 + 0.5 * h.w);
  if (d > falloff) height = 0.0;
  return vec3(xz.x, 0.0, xz.y); // y filled by terrain heightBilinear at draw
}
`;

const wgsl = /* wgsl */ `
struct A3dGrassChunk {
  chunk : vec4f,      // chunkOriginXZ, chunkSize, seed
  bladeCount : i32,
  radius : f32,
  bladeHeight : f32,
  bladeWidth : f32,
};
@group(0) @binding(0) var<uniform> u_grass : A3dGrassChunk;
@group(0) @binding(1) var<uniform> u_camera : vec3f;

fn a3dGrassHash(seed : f32, instance : i32) -> vec4f {
  var h = u32(seed * 1664525.0) ^ u32(f32(instance) * 1013904223.0) ^ u32(f32(instance) * 2654435761.0);
  h = h ^ (h >> 16u); h = h * 2246822519u; h = h ^ (h >> 13u);
  let v = vec4u(h, h * 3266489917u + 1u, h ^ 668265263u, h * 374761393u);
  return fract(vec4f(v) * (1.0 / 4294967296.0));
}

fn a3dGrassBladeVertex(root : vec3f, yaw : f32, height : f32, bend : f32, t : f32, side : f32, bladeWidth : f32) -> vec3f {
  let facing = vec2f(cos(yaw), sin(yaw));
  let rightV = vec2f(-facing.y, facing.x);
  let width = mix(1.0, 0.05, t * t);
  let lean = facing * bend * t * t;
  var p = vec3f(root.x + lean.x * height, root.y + t * height, root.z + lean.y * height);
  p = vec3f(p.x + rightV.x * (bladeWidth * width * side), p.y, p.z + rightV.y * (bladeWidth * width * side));
  return p;
}
`;

export const a3d_prd10_grass: ShaderChunk = {
  name: "a3d_prd10_grass",
  owner: "prd10",
  stage: "vertex",
  glsl,
  wgsl
};
