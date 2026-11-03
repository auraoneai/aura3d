/**
 * GPU-only auto-exposure. Each metering pixel samples at most 4×4 source
 * pixels. Each block averages RGB before computing log-luminance, matching the
 * WebGL meter. Strides cap metering at 256×256 pixels for large render
 * targets. Partial edge blocks use their actual sample count and center.
 * The reduction carries a weighted log-luminance sum and a weight.
 *
 * Every pass uses binding 0 for its uniform and bindings 2/3 for unfilterable
 * float textures. No sampler or optional float32-filterable feature is needed.
 */
export const EXPOSURE_LUMA_LOG_WGSL = /* wgsl */ `struct ExposureLumaParams {
  source_size: vec2<u32>,
  stride: vec2<u32>,
  center_weighted: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
};
@group(0) @binding(0) var<uniform> u_params: ExposureLumaParams;
@group(0) @binding(2) var u_hdr_tex: texture_2d<f32>;

@fragment
fn fs_exposure_luma_log(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let block = vec2<u32>(position.xy) * 4u;
  var sum_color = vec3<f32>(0.0);
  var sample_count = 0.0;
  for (var y = 0u; y < 4u; y = y + 1u) {
    for (var x = 0u; x < 4u; x = x + 1u) {
      let base = (block + vec2<u32>(x, y)) * u_params.stride;
      if (all(base < u_params.source_size)) {
        let coord = min(base + u_params.stride / 2u, u_params.source_size - vec2<u32>(1u));
        sum_color = sum_color + textureLoad(u_hdr_tex, vec2<i32>(coord), 0).rgb;
        sample_count = sample_count + 1.0;
      }
    }
  }
  var luma = dot(sum_color / max(sample_count, 1.0), vec3<f32>(0.2126, 0.7152, 0.0722));
  // Comparisons with NaN are false; do not poison all later frames.
  if (!(luma >= 0.0)) { luma = 1e-5; }
  luma = clamp(luma, 1e-5, 1e30);
  let block_origin = block * u_params.stride;
  let block_limit = min((block + vec2<u32>(4u)) * u_params.stride, u_params.source_size);
  let centered = (vec2<f32>(block_origin) + vec2<f32>(block_limit)) * 0.5 / vec2<f32>(u_params.source_size) - vec2<f32>(0.5);
  let meter_mask = select(1.0, max(0.0, 1.0 - 4.0 * dot(centered, centered)), u_params.center_weighted == 1u);
  let weight = meter_mask * sample_count / 16.0;
  return vec4<f32>(log2(luma) * weight, weight, 0.0, 1.0);
}`;

export const EXPOSURE_REDUCE_WGSL = /* wgsl */ `struct ExposureReduceParams {
  source_size: vec2<u32>,
  _pad: vec2<u32>,
};
@group(0) @binding(0) var<uniform> u_params: ExposureReduceParams;
@group(0) @binding(2) var u_source_tex: texture_2d<f32>;

@fragment
fn fs_exposure_reduce(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let base = vec2<u32>(position.xy) * 2u;
  var sum = vec2<f32>(0.0);
  for (var y = 0u; y < 2u; y = y + 1u) {
    for (var x = 0u; x < 2u; x = x + 1u) {
      let coord = base + vec2<u32>(x, y);
      if (all(coord < u_params.source_size)) {
        sum = sum + textureLoad(u_source_tex, vec2<i32>(coord), 0).rg;
      }
    }
  }
  return vec4<f32>(sum * 0.25, 0.0, 1.0);
}`;

export const EXPOSURE_ADAPT_WGSL = /* wgsl */ `struct ExposureAdaptParams {
  dt: f32,
  speed_up: f32,
  speed_down: f32,
  min_ev: f32,
  max_ev: f32,
  compensation_ev: f32,
  has_prev: u32,
  _pad: u32,
};
@group(0) @binding(0) var<uniform> u_params: ExposureAdaptParams;
@group(0) @binding(2) var u_prev_tex: texture_2d<f32>;
@group(0) @binding(3) var u_avg_tex: texture_2d<f32>;

@fragment
fn fs_exposure_adapt() -> @location(0) vec4<f32> {
  let avg = textureLoad(u_avg_tex, vec2<i32>(0), 0).rg;
  let avg_log2 = avg.x / max(avg.y, 1e-8);
  let target_ev = clamp(log2(0.18) - avg_log2 + u_params.compensation_ev, u_params.min_ev, u_params.max_ev);
  let prev = textureLoad(u_prev_tex, vec2<i32>(0), 0).r;
  let speed = select(u_params.speed_down, u_params.speed_up, target_ev > prev);
  let ev = select(target_ev, mix(prev, target_ev, 1.0 - exp(-u_params.dt * speed)), u_params.has_prev == 1u);
  return vec4<f32>(ev, 0.0, 0.0, 1.0);
}`;

export const EXPOSURE_MUL_WGSL = /* wgsl */ `struct ExposureMulParams {
  source_size: vec2<u32>,
  _pad: vec2<u32>,
};
@group(0) @binding(0) var<uniform> u_params: ExposureMulParams;
@group(0) @binding(2) var u_hdr_tex: texture_2d<f32>;
@group(0) @binding(3) var u_ev_tex: texture_2d<f32>;

@fragment
fn fs_exposure_mul(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let coord = min(vec2<u32>(position.xy), u_params.source_size - vec2<u32>(1u));
  let color = textureLoad(u_hdr_tex, vec2<i32>(coord), 0);
  let ev = textureLoad(u_ev_tex, vec2<i32>(0), 0).r;
  return vec4<f32>(color.rgb * exp2(ev), color.a);
}`;
