/**
 * PRD-03 §6.1 S12 / §8.15 Phase 7 — finalize WGSL twins.
 *
 * `FINALIZE_WGSL`: film grain (luma-gated), FSR1 RCAS sharpen (limit 0.25),
 * triangular-PDF dither — the last write to the 8-bit output.
 * `FINALIZE_FXAA_FUSED_WGSL`: the §6.1 fuse — S10b (LUT + vignette) + S11
 * r185 FXAA + S12 in one draw; the FXAA taps sample the display-graded
 * source through the consumer-side `fxaa_sample` hook with
 * `FXAA_LUMA_ALPHA = 1` (luma rides in `.a`, never re-runs the grade).
 */

import { FXAA_185_FNS_WGSL } from "./fxaa.wgsl.js";
import { POST_COMMON_WGSL } from "./common.wgsl.js";

const FINALIZE_FNS_WGSL = /* wgsl */ `
fn luma709(c: vec3<f32>) -> f32 { return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722)); }

fn rcas(tex: texture_2d<f32>, smp: sampler, uv: vec2<f32>, texel: vec2<f32>, sharpness: f32) -> vec3<f32> {
  // FSR1 RCAS: single-pass adaptive sharpen over the 4-ring neighbourhood.
  let e = textureSampleLevel(tex, smp, uv, 0.0).rgb;
  let cross = (
    textureSampleLevel(tex, smp, uv + vec2<f32>(0.0, -texel.y), 0.0).rgb +
    textureSampleLevel(tex, smp, uv + vec2<f32>(0.0, texel.y), 0.0).rgb +
    textureSampleLevel(tex, smp, uv + vec2<f32>(-texel.x, 0.0), 0.0).rgb +
    textureSampleLevel(tex, smp, uv + vec2<f32>(texel.x, 0.0), 0.0).rgb
  ) * 0.25;
  let sharp = min(sharpness, 0.25);
  return clamp(e + (e - cross) * sharp, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn film_grain(frag_coord: vec2<f32>, frame: f32, intensity: f32, size: f32, luminance_response: f32, luma_value: f32) -> f32 {
  let seed = vec2<u32>(frag_coord * size) + vec2<u32>(u32(frame) * 747796405u);
  let rnd = vec2<f32>(pcg2d(seed)) / 4294967296.0;
  return (rnd.x - 0.5) * intensity * mix(1.0, 1.0 - luma_value, luminance_response);
}
`;

export const FINALIZE_WGSL = /* wgsl */ `struct FinalizeParams {
  texel_size: vec2<f32>,
  frame: f32,
  grain_intensity: f32,
  grain_size: f32,
  grain_luminance_response: f32,
  rcas_sharpness: f32,     // 0 disables; FSR1 limit 0.25
  _pad: vec3<f32>,
};

@group(0) @binding(0) var<uniform> u_params: FinalizeParams;
@group(0) @binding(1) var u_source_tex: texture_2d<f32>;
@group(0) @binding(2) var u_source_smp: sampler;

${POST_COMMON_WGSL}
${FINALIZE_FNS_WGSL}

@fragment
fn fs_finalize(@location(0) uv: vec2<f32>, @builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  var disp = select(textureSampleLevel(u_source_tex, u_source_smp, uv, 0.0).rgb,
                    rcas(u_source_tex, u_source_smp, uv, u_params.texel_size, u_params.rcas_sharpness),
                    u_params.rcas_sharpness > 0.0);
  disp = disp + vec3<f32>(film_grain(frag_coord.xy, u_params.frame, u_params.grain_intensity,
    u_params.grain_size, u_params.grain_luminance_response, luma709(disp)));
  disp = disp + vec3<f32>(triangular_dither(frag_coord.xy, u_params.frame));
  return vec4<f32>(clamp(disp, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

export const FINALIZE_FXAA_FUSED_WGSL = /* wgsl */ `// FXAA_LUMA_ALPHA = 1: the FXAA taps read luma from the alpha channel
// (the S10b grade writes luma(disp) there) — the fix for the legacy per-tap
// finalColorAt re-evaluation (WebGL2Device.ts:3611-3631).
override FXAA_LUMA_ALPHA: i32 = 1;

struct FinalizeFusedParams {
  texel_size: vec2<f32>,
  output_texel: vec2<f32>,
  has_lut: i32,
  frame: f32,
  grain_intensity: f32,
  grain_size: f32,
  grain_luminance_response: f32,
  vignette_intensity: f32,
  vignette_smoothness: f32,
  vignette_roundness: f32,
  vignette_color: vec3<f32>,
  _pad0: f32,
  resolution: vec2<f32>,
  _pad1: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_params: FinalizeFusedParams;
@group(0) @binding(1) var u_source_tex: texture_2d<f32>;
@group(0) @binding(2) var u_source_smp: sampler;
@group(0) @binding(3) var u_lut3d_tex: texture_3d<f32>;
@group(0) @binding(4) var u_lut3d_smp: sampler;

${POST_COMMON_WGSL}
${FINALIZE_FNS_WGSL}
${FXAA_185_FNS_WGSL}

// S10b inline: the FXAA taps sample the display-graded source — each tap is
// one LUT fetch + vignette, not a re-run of the analytic grade. This is the
// consumer-side fxaa_sample hook the shared FXAA set resolves against.
fn fxaa_sample(tex: texture_2d<f32>, smp: sampler, uv: vec2<f32>) -> vec4<f32> {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  var disp = c.rgb;
  if (u_params.has_lut != 0) {
    disp = textureSampleLevel(u_lut3d_tex, u_lut3d_smp, clamp(disp, vec3<f32>(0.0), vec3<f32>(1.0)), 0.0).rgb;
  }
  if (u_params.vignette_intensity > 0.0) {
    var p = (uv - vec2<f32>(0.5)) * 2.0;
    p.x = p.x * (u_params.resolution.x / u_params.resolution.y) * u_params.vignette_roundness;
    let len = length(p) * u_params.vignette_intensity;
    disp = disp * mix(vec3<f32>(1.0), u_params.vignette_color, pow(clamp(len, 0.0, 1.0), u_params.vignette_smoothness));
  }
  return vec4<f32>(disp, luma709(disp));
}

@fragment
fn fs_finalize_fxaa_fused(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = frag_coord.xy * u_params.output_texel;
  let color = apply_fxaa(u_source_tex, u_source_smp, u_params.texel_size, uv);
  var disp = color.rgb;
  disp = disp + vec3<f32>(film_grain(frag_coord.xy, u_params.frame, u_params.grain_intensity,
    u_params.grain_size, u_params.grain_luminance_response, luma709(disp)));
  disp = disp + vec3<f32>(triangular_dither(frag_coord.xy, u_params.frame));
  return vec4<f32>(clamp(disp, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
