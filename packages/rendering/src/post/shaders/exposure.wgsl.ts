/**
 * PRD-03 §8.9 Phase 7 — S8 auto-exposure WGSL twins (GPU only, zero
 * readbacks). Same chain as the GLSL twins: quarter-res log2-luma
 * (centre-weighted or average mask) → box-reduce to 1×1 → EV ping-pong
 * adapt (`has_prev` boots to target; speed = speedUp when brightening,
 * speedDown when darkening) → `hdr * exp2(ev)`.
 */

/** S8 pass 1: log2 luma at 1/4 res; `center_weighted` masks. */
export const EXPOSURE_LUMA_LOG_WGSL = /* wgsl */ `struct ExposureLumaParams {
  texel_size: vec2<f32>,   // 1 / HDR size
  center_weighted: i32,    // 1 = centre-weighted metering, 0 = average
  _pad: f32,
};

@group(0) @binding(0) var<uniform> u_params: ExposureLumaParams;
@group(0) @binding(1) var u_hdr_tex: texture_2d<f32>;
@group(0) @binding(2) var u_hdr_smp: sampler;

@fragment
fn fs_exposure_luma_log(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  // One output texel covers a 4×4 block of source texels; average the block.
  var acc = vec4<f32>(0.0);
  for (var y = 0; y < 4; y = y + 1) {
    for (var x = 0; x < 4; x = x + 1) {
      let tap_uv = uv + (vec2<f32>(f32(x), f32(y)) - vec2<f32>(1.5)) * u_params.texel_size;
      acc = vec4<f32>(acc.rgb + textureSampleLevel(u_hdr_tex, u_hdr_smp, tap_uv, 0.0).rgb, acc.a + 1.0);
    }
  }
  let c = acc.rgb / max(acc.a, 1.0);
  let luma = max(dot(c, vec3<f32>(0.2126, 0.7152, 0.0722)), 1e-5);
  // Centre-weighted: w = 1 - (d²), clamped — an 18% gray card reads weight 1
  // at frame centre and falls to 0 at the corners.
  let centered = uv - vec2<f32>(0.5);
  let w = select(1.0, max(0.0, 1.0 - dot(centered, centered) * 4.0), u_params.center_weighted == 1);
  return vec4<f32>(log2(luma) * w, w, 0.0, 1.0);
}
`;

/** S8 reduce: 4-tap box average of the previous mip (weighted sum in .rg). */
export const EXPOSURE_REDUCE_WGSL = /* wgsl */ `struct ExposureReduceParams {
  texel_size: vec2<f32>,   // 1 / source size
  _pad0: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_params: ExposureReduceParams;
@group(0) @binding(1) var u_source_tex: texture_2d<f32>;
@group(0) @binding(2) var u_source_smp: sampler;

@fragment
fn fs_exposure_reduce(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let sum = textureSampleLevel(u_source_tex, u_source_smp, uv + vec2<f32>(-0.5, -0.5) * u_params.texel_size, 0.0)
    + textureSampleLevel(u_source_tex, u_source_smp, uv + vec2<f32>(0.5, -0.5) * u_params.texel_size, 0.0)
    + textureSampleLevel(u_source_tex, u_source_smp, uv + vec2<f32>(-0.5, 0.5) * u_params.texel_size, 0.0)
    + textureSampleLevel(u_source_tex, u_source_smp, uv + vec2<f32>(0.5, 0.5) * u_params.texel_size, 0.0);
  return sum * 0.25;
}
`;

/** S8 adapt: 1×1 ping-pong; `has_prev == 1` integrates, else boots to target. */
export const EXPOSURE_ADAPT_WGSL = /* wgsl */ `struct ExposureAdaptParams {
  dt: f32,
  speed_up: f32,
  speed_down: f32,
  min_ev: f32,
  max_ev: f32,
  compensation_ev: f32,
  has_prev: i32,
  _pad: f32,
};

@group(0) @binding(0) var<uniform> u_params: ExposureAdaptParams;
@group(0) @binding(1) var u_prev_tex: texture_2d<f32>;
@group(0) @binding(2) var u_avg_tex: texture_2d<f32>;

@fragment
fn fs_exposure_adapt(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let avg = textureLoad(u_avg_tex, vec2<i32>(0), 0);
  let avg_log2 = avg.r / max(avg.g, 1e-4);   // Σ(l·w)/Σw — weighted mean
  // WGSL-reserved keyword: the GLSL twin's "target" is "target_ev" here.
  let target_ev = clamp(-avg_log2 + log2(0.18) + u_params.compensation_ev, u_params.min_ev, u_params.max_ev);
  let prev = textureLoad(u_prev_tex, vec2<i32>(0), 0).r;
  let speed = select(u_params.speed_down, u_params.speed_up, target_ev > prev);
  let ev = select(target_ev, mix(prev, target_ev, 1.0 - exp(-u_params.dt * speed)), u_params.has_prev == 1);
  return vec4<f32>(ev, 0.0, 0.0, 1.0);
}
`;

/** S8 apply: `out = hdr * exp2(ev)` — the composite's autoExp factor. */
export const EXPOSURE_MUL_WGSL = /* wgsl */ `@group(0) @binding(1) var u_hdr_tex: texture_2d<f32>;
@group(0) @binding(2) var u_hdr_smp: sampler;
@group(0) @binding(3) var u_ev_tex: texture_2d<f32>;

@fragment
fn fs_exposure_mul(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let ev = textureLoad(u_ev_tex, vec2<i32>(0), 0).r;
  let c = textureSampleLevel(u_hdr_tex, u_hdr_smp, uv, 0.0);
  return vec4<f32>(c.rgb * exp2(ev), c.a);
}
`;
