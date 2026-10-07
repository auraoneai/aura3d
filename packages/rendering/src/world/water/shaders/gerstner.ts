/**
 * `a3d_prd10_gerstner` — PRD-10 §8.6 Gerstner wave vertex chunk.
 * `GerstnerWaves.ts` holds the same constants and formula on the CPU (wave
 * steepness sum clamped to <= 1 there to prevent loops). The Jacobian proxy
 * `1 - Σ steepness·sin(f)` reaches the fragment as `v_crest` for crest foam.
 */
import type { ShaderChunk } from "../../../contracts/program.js";

const glsl = /* glsl */ `
uniform vec4 u_waves[8];      // dir.x, dir.y, steepness, wavelength
uniform float u_waveSpeed[8];
uniform int u_waveCount;
uniform float u_time;

// Displaced surface point + analytic normal via tangent/binormal accumulation.
vec3 a3dGerstner(vec2 xz, out vec3 normal) {
  vec3 p = vec3(xz.x, 0.0, xz.y);
  vec3 tangent = vec3(1.0, 0.0, 0.0), binormal = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < 8; i++) {
    if (i >= u_waveCount) break;
    vec2 d = u_waves[i].xy;
    float k = 6.2831853 / u_waves[i].w;
    float c = sqrt(9.81 / k) * u_waveSpeed[i];
    float f = k * (dot(d, xz) - c * u_time);
    float a = u_waves[i].z / k;
    p.x += d.x * a * cos(f);
    p.y += a * sin(f);
    p.z += d.y * a * cos(f);
    tangent  += vec3(-d.x * d.x * u_waves[i].z * sin(f),  d.x * u_waves[i].z * cos(f), -d.x * d.y * u_waves[i].z * sin(f));
    binormal += vec3(-d.x * d.y * u_waves[i].z * sin(f),  d.y * u_waves[i].z * cos(f), -d.y * d.y * u_waves[i].z * sin(f));
  }
  normal = normalize(cross(binormal, tangent));
  return p;
}

// Jacobian proxy for crest foam: 1 - Σ steepness·sin(f) over active waves.
float a3dGerstnerCrest(vec2 xz) {
  float j = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= u_waveCount) break;
    vec2 d = u_waves[i].xy;
    float k = 6.2831853 / u_waves[i].w;
    float c = sqrt(9.81 / k) * u_waveSpeed[i];
    float f = k * (dot(d, xz) - c * u_time);
    j += u_waves[i].z * sin(f);
  }
  return 1.0 - j;
}
`;

const wgsl = /* wgsl */ `
struct A3dWaves {
  waves : array<vec4f, 8>,   // dir.x, dir.y, steepness, wavelength
  speed : array<f32, 8>,
  count : i32,
  time : f32,
  pad0 : f32,
  pad1 : f32,
};
@group(0) @binding(0) var<uniform> u_waves : A3dWaves;

struct A3dGerstnerResult {
  position : vec3f,
  normal : vec3f,
};

fn a3dGerstner(xz : vec2f) -> A3dGerstnerResult {
  var p = vec3f(xz.x, 0.0, xz.y);
  var tangent = vec3f(1.0, 0.0, 0.0);
  var binormal = vec3f(0.0, 0.0, 1.0);
  for (var i = 0; i < 8; i = i + 1) {
    if (i >= u_waves.count) { break; }
    let d = u_waves.waves[i].xy;
    let k = 6.2831853 / u_waves.waves[i].w;
    let c = sqrt(9.81 / k) * u_waves.speed[i];
    let f = k * (dot(d, xz) - c * u_waves.time);
    let a = u_waves.waves[i].z / k;
    p = vec3f(p.x + d.x * a * cos(f), p.y + a * sin(f), p.z + d.y * a * cos(f));
    let s = u_waves.waves[i].z;
    tangent = tangent + vec3f(-d.x * d.x * s * sin(f), d.x * s * cos(f), -d.x * d.y * s * sin(f));
    binormal = binormal + vec3f(-d.x * d.y * s * sin(f), d.y * s * cos(f), -d.y * d.y * s * sin(f));
  }
  var r : A3dGerstnerResult;
  r.position = p;
  r.normal = normalize(cross(binormal, tangent));
  return r;
}

fn a3dGerstnerCrest(xz : vec2f) -> f32 {
  var j = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    if (i >= u_waves.count) { break; }
    let d = u_waves.waves[i].xy;
    let k = 6.2831853 / u_waves.waves[i].w;
    let c = sqrt(9.81 / k) * u_waves.speed[i];
    let f = k * (dot(d, xz) - c * u_waves.time);
    j = j + u_waves.waves[i].z * sin(f);
  }
  return 1.0 - j;
}
`;

export const a3d_prd10_gerstner: ShaderChunk = {
  name: "a3d_prd10_gerstner",
  owner: "prd10",
  stage: "vertex",
  glsl,
  wgsl
};
