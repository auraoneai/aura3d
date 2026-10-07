/**
 * `a3d_prd10_space_bake` — PRD-10 §8.8 space bake fragment chunk.
 * Runs once per face into an RGBA16F cube (the `space-bake` C-09 environment
 * source): Gaussian stars on a magnitude-banded hash grid, domain-warped fbm
 * nebula through two colour ramps, subtracted dust lanes.
 */
import type { ShaderChunk } from "../../../contracts/program.js";

const glsl = /* glsl */ `
uniform float u_spaceSeed;
uniform vec3 u_nebulaColorA;    // ramp start
uniform vec3 u_nebulaColorB;    // ramp end
uniform float u_nebulaIntensity; // 0.05..0.3 so stars stay dominant
uniform float u_starPeak;        // mag0 reference luminance

float a3dHash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 a3dHash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// fbm over domain-warped direction, 6 octaves.
float a3dFbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++) {
    vec3 q = p + vec3(a3dHash13(p + float(i) * 0.31), a3dHash13(p.yzx + float(i) * 0.17), a3dHash13(p.zxy + float(i) * 0.23)) - 0.5;
    sum += amp * (a3dHash13(q) * 2.0 - 1.0);
    p *= 2.03;
    amp *= 0.5;
  }
  return sum * 0.5 + 0.5;
}

// Blackbody-ish colour from a 0..1 temperature index.
vec3 a3dStarColor(float t) {
  return mix(vec3(0.6, 0.72, 1.0), vec3(1.0, 0.95, 0.85), smoothstep(0.0, 0.5, t))
       + vec3(0.35, 0.1, -0.05) * smoothstep(0.5, 1.0, t);
}

// Star field: hash grid per magnitude band, Gaussian sigma 0.6 texel,
// peak luminance pow(10, -0.4*(mag - mag0)).
vec3 a3dSpaceStars(vec3 dir) {
  vec3 col = vec3(0.0);
  for (int band = 0; band < 3; band++) {
    float cells = 24.0 + float(band) * 24.0;
    vec3 p = dir * cells;
    vec3 cell = floor(p);
    vec3 f = fract(p) - 0.5;
    vec3 h = a3dHash33(cell + u_spaceSeed + float(band) * 7.13);
    float mag = float(band) * 1.6;
    float peak = pow(10.0, -0.4 * (mag - 2.0)) * u_starPeak;
    float present = step(0.96 - float(band) * 0.02, h.z); // sparser in dim bands
    vec3 starPos = cell + 0.5 + (h - 0.5) * 0.6;
    float d = length(p - starPos) * cells / 24.0;
    float g = exp(-d * d / (2.0 * 0.6 * 0.6));
    col += a3dStarColor(h.y) * g * peak * present;
  }
  return col;
}

// Nebula + dust lanes at nebula intensity so stars stay dominant.
vec3 a3dSpaceNebula(vec3 dir) {
  float n = a3dFbm(dir * 2.3 + u_spaceSeed * 0.1);
  float dust = a3dFbm(dir * 1.1 - u_spaceSeed * 0.2);
  vec3 nebula = mix(u_nebulaColorA, u_nebulaColorB, n) * u_nebulaIntensity;
  return max(nebula - dust * 0.4 * u_nebulaIntensity, vec3(0.0));
}

vec3 a3dSpaceBakeFace(vec3 dir) {
  return a3dSpaceStars(normalize(dir)) + a3dSpaceNebula(normalize(dir));
}
`;

const wgsl = /* wgsl */ `
struct A3dSpaceBake {
  seed : f32,
  nebulaColorA : vec3f,
  nebulaColorB : vec3f,
  nebulaIntensity : f32,
  starPeak : f32,
  pad0 : f32,
  pad1 : f32,
};
@group(0) @binding(0) var<uniform> u_space : A3dSpaceBake;

fn a3dHash13(p : vec3f) -> f32 {
  var q = fract(p * 0.1031);
  q = q + vec3f(dot(q, q.zyx + vec3f(31.32)));
  return fract((q.x + q.y) * q.z);
}

fn a3dStarColor(t : f32) -> vec3f {
  return mix(vec3f(0.6, 0.72, 1.0), vec3f(1.0, 0.95, 0.85), smoothstep(0.0, 0.5, t))
       + vec3f(0.35, 0.1, -0.05) * smoothstep(0.5, 1.0, t);
}
`;

export const a3d_prd10_space_bake: ShaderChunk = {
  name: "a3d_prd10_space_bake",
  owner: "prd10",
  stage: "fragment",
  glsl,
  wgsl
};
