/**
 * GU47 RH47-07/08: Saltwind Highway's one custom post pass per route (PRD acceptance: <= 1 shaderPass). It carries the
 * Redline heat shimmer (`heatPass.ts`) and the speed streaks (`speedPass.ts`) in one fullscreen draw before tonemapping,
 * reading colour and linear depth on WebGL2 and running its paired WGSL stage natively on WebGPU. Per frame the game sets
 * `u_streak` from speed and nitro (0 on reduced motion) and `u_heatTime`; the route's heat amount is fixed per scene.
 *
 * The rest of the per-route post (bloom, AO, SSR, god rays, contact shadows, grain on Redline, sun flare, Halo's
 * auto-exposure) is authored from the look row in `world.ts` / `main.ts`.
 */
import { effects, type AuraAutoExposureOptions, type AuraCustomPostPass, type AuraPostPassInput } from "@aura3d/engine";
import type { SaltwindLookRow } from "./look";
import { HEAT_SHIMMER_GLSL } from "./heatPass";
import { SPEED_STREAK_GLSL } from "./speedPass";

export const ROAD_PASS_NAME = "saltwind-road-pass";

export const ROAD_PASS_GLSL = /* glsl */ `
uniform float u_heatAmount;
uniform float u_heatStart;
uniform float u_heatTime;
uniform float u_streak;
${HEAT_SHIMMER_GLSL}
${SPEED_STREAK_GLSL}
void main() {
  vec2 uv = clamp(v_uv + rhHeatOffset(v_uv), vec2(0.0), vec2(1.0));
  vec4 c = texture(u_color, uv);
  outColor = vec4(rhSpeedStreak(uv, c.rgb), c.a);
}
`;

/**
 * Paired WebGPU fullscreen fragment stage (`executeWebGPUCustomPass` packs `[1/w, 1/h, time, 0]` followed by each declared
 * uniform padded to `vec4<f32>` in declaration order at `@binding(0)`, linear sampler at `@binding(1)`, `u_color` at `@binding(2)`).
 * Note: WebGPU texture UV has `y = 0` at the top of the frame (`1 - v_uv.y` relative to WebGL2).
 */
export const ROAD_PASS_WGSL = /* wgsl */ `
/* @aura3d-bindings */
struct RoadPassUniforms {
  header: vec4<f32>,
  heatAmount: vec4<f32>,
  heatStart: vec4<f32>,
  heatTime: vec4<f32>,
  streak: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u_road: RoadPassUniforms;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_color: texture_2d<f32>;

fn rhHeatNoise(q: vec2<f32>) -> f32 {
  let i = floor(q);
  var f = fract(q);
  f = f * f * (vec2<f32>(3.0) - 2.0 * f);
  let a = fract(sin(dot(i, vec2<f32>(127.1, 311.7))) * 43758.5453);
  let b = fract(sin(dot(i + vec2<f32>(1.0, 0.0), vec2<f32>(127.1, 311.7))) * 43758.5453);
  let c = fract(sin(dot(i + vec2<f32>(0.0, 1.0), vec2<f32>(127.1, 311.7))) * 43758.5453);
  let d = fract(sin(dot(i + vec2<f32>(1.0, 1.0), vec2<f32>(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

fn rhHeatOffset(uv: vec2<f32>) -> vec2<f32> {
  let amt = u_road.heatAmount.x;
  if (amt <= 0.0) { return vec2<f32>(0.0); }
  let glUvY = 1.0 - uv.y;
  let horizonMask = smoothstep(0.26, 0.48, glUvY) * (1.0 - smoothstep(0.54, 0.74, glUvY));
  let q = vec2<f32>(uv.x * 38.0, glUvY * 90.0 - u_road.heatTime.x * 1.6);
  let n = rhHeatNoise(q) * 0.65 + rhHeatNoise(q * 2.3 + vec2<f32>(7.0)) * 0.35 - 0.5;
  let startAtten = clamp(40.0 / max(u_road.heatStart.x, 1.0), 0.25, 1.5);
  return vec2<f32>(n * 0.0018, -n * 0.0032) * horizonMask * amt * startAtten;
}

fn rhSpeedStreak(uv: vec2<f32>, base: vec3<f32>) -> vec3<f32> {
  let streak = u_road.streak.x;
  if (streak <= 0.0) { return base; }
  let centre = vec2<f32>(0.5, 0.54);
  let dir = uv - centre;
  let r = length(dir * vec2<f32>(1.6, 1.0));
  let edge = smoothstep(0.34, 0.86, r);
  // Protect the hero car crop around lower-centre when linear depth is not bound on WebGPU custom passes
  let carDist = length((uv - vec2<f32>(0.5, 0.68)) * vec2<f32>(2.4, 2.8));
  let keep = smoothstep(0.28, 0.58, carDist);
  let w = edge * keep * streak;
  if (w <= 0.001) { return base; }
  var sum = base;
  for (var i = 1; i <= 6; i = i + 1) {
    let t = f32(i) / 6.0;
    let tapUv = clamp(uv - dir * t * 0.045 * w, vec2<f32>(0.0), vec2<f32>(1.0));
    sum = sum + textureSampleLevel(u_color, u_sampler, tapUv, 0.0).rgb;
  }
  return mix(base, sum / 7.0, clamp(w * 1.2, 0.0, 1.0));
}

@fragment fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let sampleUv = clamp(uv + rhHeatOffset(uv), vec2<f32>(0.0), vec2<f32>(1.0));
  let c = textureSampleLevel(u_color, u_sampler, sampleUv, 0.0);
  return vec4<f32>(rhSpeedStreak(sampleUv, c.rgb), c.a);
}
`;

/** The route's custom pass (one per scene). Defaults to `["color", "depth"]`; WebGPU passes `["color"]` at runtime. */
export function roadPass(row: SaltwindLookRow, inputs: readonly AuraPostPassInput[] = ["color", "depth"]): AuraCustomPostPass {
  return effects.shaderPass({
    name: ROAD_PASS_NAME,
    glsl: ROAD_PASS_GLSL,
    wgsl: ROAD_PASS_WGSL,
    order: "before-tonemap",
    inputs,
    uniforms: { u_heatAmount: row.post.heat.amount, u_heatStart: row.post.heat.startMetres, u_heatTime: 0, u_streak: 0 }
  });
}

/** Speed streak strength: 0 below 30 m/s, 1 at 74 m/s, +35% on nitro, capped at 1; 0 under reduced motion (PRD §6.3). */
export function streakFor(speed: number, nitro: boolean, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const base = Math.max(0, Math.min(1, (speed - 30) / 44));
  return Math.min(1, base * (nitro ? 1.35 : 1) * 0.85);
}

/** Halo's auto-exposure (S8 runs on Medium and up); the coast routes keep a fixed exposure. */
export function autoExposureFor(row: SaltwindLookRow | null): false | AuraAutoExposureOptions {
  return row?.post.autoExposure ? { minEv: -0.5, maxEv: 1.5, speedUp: 1.5, speedDown: 0.8, meteringMask: "center-weighted", compensationEv: -0.25 } : false;
}
