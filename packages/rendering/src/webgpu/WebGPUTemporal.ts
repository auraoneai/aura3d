import { getRenderAttachmentIdentity, validateRenderAttachmentAccess, type RenderTarget } from "../RenderDevice";
import type { TemporalV2Frame } from "../TemporalHistory";
import { temporalAccumulationWeight, temporalCanAccumulate } from "../TemporalMath";
export { temporalAccumulationWeight } from "../TemporalMath";

/** GPU-only temporal contract. All targets use the native top-left UV convention. */
export interface WebGPUTemporalInputs {
  readonly velocity: RenderTarget;
  readonly history: RenderTarget;
  readonly historyOutput: RenderTarget;
  readonly historyValid: boolean;
  readonly historyFrames?: number;
  readonly blend?: number;
  readonly depthThreshold?: number;
  /** Explicit v2 inputs, supplied by the view-scoped TemporalHistory owner. */
  readonly v2?: TemporalV2Frame;
  readonly feedbackMin?: number;
  readonly feedbackMax?: number;
  readonly varianceGamma?: number;
  /** True only when velocity.a contains expected previous linear depth. */
  readonly hasExpectedDepth?: boolean;
}

/** Validate the v2 resolve before binding resources or allocating its output. */
export function validateWebGPUTemporalInputs(source: RenderTarget, options: WebGPUTemporalInputs): void {
  const v2 = options.v2;
  if (!v2) throw new RangeError("WebGPU v2 temporal inputs are required");
  const targets = [source, options.velocity, options.history, options.historyOutput, v2.linZ, v2.linZOutput, ...(v2.reactive ? [v2.reactive] : [])];
  if (targets.some(target => !target || target.disposed)) throw new RangeError("WebGPU temporal inputs must be live");
  if (new Set(targets).size !== targets.length) throw new RangeError("WebGPU temporal inputs must not alias");
  validateRenderAttachmentAccess(
    [source, options.velocity, options.history, v2.linZ, ...(v2.reactive ? [v2.reactive] : [])].map(target => getRenderAttachmentIdentity(target)),
    [options.historyOutput, v2.linZOutput].map(target => getRenderAttachmentIdentity(target))
  );
  if ([options.velocity, v2.linZOutput, ...(v2.reactive ? [v2.reactive] : [])].some(target => target.width !== source.width || target.height !== source.height)) {
    throw new RangeError("WebGPU temporal motion, current depth and reactive inputs must match render size");
  }
  if (options.history.width !== options.historyOutput.width || options.history.height !== options.historyOutput.height) {
    throw new RangeError("WebGPU temporal history and output dimensions must match");
  }
  if (v2.reconstruction === "spatial" && (options.history.width !== source.width || options.history.height !== source.height)) {
    throw new RangeError("WebGPU spatial temporal history must match render size");
  }
  if (v2.reconstruction === "temporal" && (!v2.reactive || v2.motionSource !== "object")) {
    throw new RangeError("WebGPU temporal reconstruction requires real velocity and reactive inputs");
  }
}

/** 48-byte WGSL uniform layout; jitter converts from clip space to top-left texture UV. */
export function webgpuTaaResolveUniforms(options: WebGPUTemporalInputs): Float32Array {
  const v2 = options.v2;
  if (!v2) throw new RangeError("WebGPU v2 temporal inputs are required");
  const min = options.feedbackMin ?? 0.88, max = options.feedbackMax ?? 0.97, gamma = options.varianceGamma ?? 1;
  if (![min, max, gamma, v2.depthNear, ...v2.jitterClip, ...v2.previousJitterClip].every(Number.isFinite) || min < 0 || max > 1 || min > max || gamma < 0) {
    throw new RangeError("Invalid WebGPU temporal feedback, gamma or jitter");
  }
  const bytes = new ArrayBuffer(48);
  const data = new DataView(bytes);
  data.setInt32(0, v2.reactive ? 1 : 0, true);
  data.setInt32(4, temporalCanAccumulate(options.historyValid, v2.unsupportedMotion) ? 1 : 0, true);
  data.setFloat32(8, min, true);
  data.setFloat32(12, max, true);
  data.setFloat32(16, gamma, true);
  data.setInt32(20, options.hasExpectedDepth ? 1 : 0, true);
  data.setFloat32(24, v2.jitterClip[0] * 0.5, true);
  data.setFloat32(28, v2.jitterClip[1] * -0.5, true);
  data.setFloat32(32, v2.previousJitterClip[0] * 0.5, true);
  data.setFloat32(36, v2.previousJitterClip[1] * -0.5, true);
  data.setFloat32(40, v2.depthNear, true);
  return new Float32Array(bytes);
}

export function normalizeWebGPUTemporalOptions(options: Pick<WebGPUTemporalInputs, "blend" | "depthThreshold" | "historyFrames">): readonly [number, number] {
  const blend = options.blend ?? 0.9;
  const depthThreshold = options.depthThreshold ?? 0.01;
  if (!Number.isFinite(blend) || blend < 0 || blend >= 1) throw new RangeError("TAA blend must be finite in [0, 1)");
  if (!Number.isFinite(depthThreshold) || depthThreshold <= 0 || depthThreshold > 1) throw new RangeError("TAA depthThreshold must be finite in (0, 1]");
  return [temporalAccumulationWeight(blend, options.historyFrames), depthThreshold];
}

export const WEBGPU_TAA_FRAGMENT = `
struct TemporalUniforms { texel: vec2<f32>, blend: f32, valid: f32, depthThreshold: f32, _pad0: f32, _pad1: f32, _pad2: f32 };
@group(0) @binding(0) var<uniform> temporal: TemporalUniforms;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var source: texture_2d<f32>;
@group(0) @binding(3) var velocity: texture_2d<f32>;
@group(0) @binding(4) var history: texture_2d<f32>;
@fragment fn fs_taa(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let current = textureSampleLevel(source, linearSampler, uv, 0.0);
  let dimensions = vec2<i32>(textureDimensions(velocity));
  let coord = clamp(vec2<i32>(uv * vec2<f32>(dimensions)), vec2<i32>(0), dimensions - vec2<i32>(1));
  let motion = textureLoad(velocity, coord, 0);
  let previousUV = uv - motion.rg;
  let previous = textureSampleLevel(history, linearSampler, previousUV, 0.0);
  var lo = current.rgb;
  var hi = current.rgb;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let neighbor = textureSampleLevel(source, linearSampler, uv + vec2<f32>(f32(x), f32(y)) * temporal.texel, 0.0).rgb;
      lo = min(lo, neighbor); hi = max(hi, neighbor);
    }
  }
  let inBounds = all(previousUV >= vec2<f32>(0.0)) && all(previousUV < vec2<f32>(1.0));
  // Filtered history alpha mixes categorical foreground/background depths.
  // Validate the actual contributing surfaces instead of a nonexistent
  // interpolated surface; filtered RGB remains neighborhood-clipped below.
  let previousBase = vec2<i32>(floor(previousUV * vec2<f32>(dimensions) - vec2<f32>(0.5)));
  var depthError = 1.0;
  for (var y = 0; y < 2; y = y + 1) {
    for (var x = 0; x < 2; x = x + 1) {
      let tap = clamp(previousBase + vec2<i32>(x, y), vec2<i32>(0), dimensions - vec2<i32>(1));
      depthError = min(depthError, abs(textureLoad(history, tap, 0).a - motion.a));
    }
  }
  let depthMatches = depthError <= temporal.depthThreshold;
  let accept = temporal.valid > 0.5 && inBounds && depthMatches;
  let weight = select(0.0, temporal.blend * 0.90, accept);
  return vec4<f32>(mix(current.rgb, clamp(previous.rgb, lo, hi), weight), motion.b);
}`;

/** Separate output restores scene alpha: history alpha contains depth. */
export const WEBGPU_TAA_OUTPUT_FRAGMENT = `
struct OutputUniforms { texel: vec2<f32>, _pad: vec2<f32> };
@group(0) @binding(0) var<uniform> output: OutputUniforms;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var resolved: texture_2d<f32>;
@group(0) @binding(3) var source: texture_2d<f32>;
@fragment fn fs_taa_output(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let p = clamp(uv, output.texel * 0.5, vec2<f32>(1.0) - output.texel * 0.5);
  let current = textureSample(source, linearSampler, p);
  let accumulated = textureSample(resolved, linearSampler, p);
  return vec4<f32>(accumulated.rgb, current.a);
}`;

/**
 * Native WebGPU v2 HDR/LDR temporal resolve (`TAA_RESOLVE_WGSL` adapted to
 * `runWebGPUFullscreenPass` with `textureLoadBindings: true` so `rgba32f` /
 * `r32f` linear depth and HDR targets work without `float32-filterable`).
 * Bindings: 0 = 48-byte `TaaResolveParams`, 2 = current, 3 = history,
 * 4 = velocity, 5 = previous linear depth, 6 = reactive mask (or dummy).
 */
export const WEBGPU_TAA_V2_RESOLVE_FRAGMENT = /* wgsl */ `struct TaaResolveParams {
  has_reactive: i32,
  has_history: i32,
  feedback_min: f32,
  feedback_max: f32,
  variance_gamma: f32,
  has_expected_depth: i32,
  jitter_uv: vec2<f32>,
  previous_jitter_uv: vec2<f32>,
  depth_near: f32,
  _pad: f32,
};

@group(0) @binding(0) var<uniform> u_params: TaaResolveParams;
@group(0) @binding(2) var u_current_tex: texture_2d<f32>;
@group(0) @binding(3) var u_history_tex: texture_2d<f32>;
@group(0) @binding(4) var u_velocity_dilate_tex: texture_2d<f32>;
@group(0) @binding(5) var u_lin_z_prev_tex: texture_2d<f32>;
@group(0) @binding(6) var u_reactive_tex: texture_2d<f32>;

fn a3d_taa_sanitize_rgb(c: vec3<f32>) -> vec3<f32> {
  let bits = bitcast<vec3<u32>>(c);
  let finite_mask = (bits & vec3<u32>(0x7f800000u)) != vec3<u32>(0x7f800000u);
  return clamp(select(vec3<f32>(0.0), c, finite_mask), vec3<f32>(0.0), vec3<f32>(65504.0));
}

fn a3d_cubic_weights(f: f32) -> vec4<f32> {
  let f2 = f * f;
  let f3 = f2 * f;
  return vec4<f32>(-0.5 * f + f2 - 0.5 * f3, 1.0 - 2.5 * f2 + 1.5 * f3,
                   0.5 * f + 2.0 * f2 - 1.5 * f3, -0.5 * f2 + 0.5 * f3);
}

fn a3d_history_at(uv: vec2<f32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(u_history_tex));
  let position = uv * vec2<f32>(size) - vec2<f32>(0.5);
  let base = vec2<i32>(floor(position));
  let wx = a3d_cubic_weights(fract(position.x));
  let wy = a3d_cubic_weights(fract(position.y));
  var result = vec4<f32>(0.0);
  for (var y = 0; y < 4; y = y + 1) {
    for (var x = 0; x < 4; x = x + 1) {
      let sample_val = textureLoad(u_history_tex,
        clamp(base + vec2<i32>(x - 1, y - 1), vec2<i32>(0), size - vec2<i32>(1)), 0);
      result = result + vec4<f32>(a3d_taa_sanitize_rgb(sample_val.rgb), sample_val.a) * wx[x] * wy[y];
    }
  }
  return result;
}

fn a3d_current_at(uv: vec2<f32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(u_current_tex));
  let p = uv * vec2<f32>(size) - vec2<f32>(0.5);
  let base = vec2<i32>(floor(p));
  let f = fract(p);
  let a = textureLoad(u_current_tex, clamp(base, vec2<i32>(0), size - vec2<i32>(1)), 0);
  let b = textureLoad(u_current_tex, clamp(base + vec2<i32>(1, 0), vec2<i32>(0), size - vec2<i32>(1)), 0);
  let c = textureLoad(u_current_tex, clamp(base + vec2<i32>(0, 1), vec2<i32>(0), size - vec2<i32>(1)), 0);
  let d = textureLoad(u_current_tex, clamp(base + vec2<i32>(1, 1), vec2<i32>(0), size - vec2<i32>(1)), 0);
  let blended = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  return vec4<f32>(a3d_taa_sanitize_rgb(blended.rgb), blended.a);
}

fn a3d_rgb_to_ycocg(c: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(c.r * 0.25 + c.g * 0.5 + c.b * 0.25,
                   c.r * 0.5 - c.b * 0.5,
                   -c.r * 0.25 + c.g * 0.5 - c.b * 0.25);
}
fn a3d_ycocg_to_rgb(c: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z);
}
fn a3d_taa_luma(c: vec3<f32>) -> f32 { return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722)); }
fn a3d_valid_depth(z: f32) -> bool { return z >= u_params.depth_near && z < 3.0e38; }

@fragment
fn fs_taa_v2_resolve(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(frag_coord.xy);
  let output_size = vec2<i32>(textureDimensions(u_history_tex));
  let current_size = vec2<i32>(textureDimensions(u_current_tex));
  let uv = (vec2<f32>(pixel) + vec2<f32>(0.5)) / vec2<f32>(output_size);
  let current_uv = uv + u_params.jitter_uv;
  let current_pixel = clamp(vec2<i32>(floor(current_uv * vec2<f32>(current_size))), vec2<i32>(0), current_size - vec2<i32>(1));
  let velocity_size = vec2<i32>(textureDimensions(u_velocity_dilate_tex));
  let velocity_pixel = clamp(vec2<i32>(floor(current_uv * vec2<f32>(velocity_size))), vec2<i32>(0), velocity_size - vec2<i32>(1));
  let vel_tex = textureLoad(u_velocity_dilate_tex, velocity_pixel, 0);
  let velocity = vel_tex.rg;
  let uv_prev = uv - velocity;
  let current = a3d_current_at(current_uv);
  let reactive_size = vec2<i32>(textureDimensions(u_reactive_tex));
  let reactive_pixel = clamp(vec2<i32>(floor(current_uv * vec2<f32>(reactive_size))), vec2<i32>(0), reactive_size - vec2<i32>(1));
  let reactive_raw = textureLoad(u_reactive_tex, reactive_pixel, 0).r;
  let z_size = vec2<i32>(textureDimensions(u_lin_z_prev_tex));
  let z_touch = textureLoad(u_lin_z_prev_tex, vec2<i32>(0), 0).r;
  if (u_params.has_history == 0 || any(velocity != velocity) || any(abs(velocity) > vec2<f32>(2.0))) {
    return vec4<f32>(current.rgb + vec3<f32>(0.0 * (reactive_raw + z_touch)), current.a);
  }

  var mu = vec3<f32>(0.0);
  var m2 = vec3<f32>(0.0);
  var wsum = 0.0;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let tap = a3d_taa_sanitize_rgb(textureLoad(u_current_tex,
        clamp(current_pixel + vec2<i32>(x, y), vec2<i32>(0), current_size - vec2<i32>(1)), 0).rgb);
      let w = 1.0 / (1.0 + max(a3d_taa_luma(tap), 0.0));
      let yc = a3d_rgb_to_ycocg(tap);
      mu = mu + yc * w;
      m2 = m2 + yc * yc * w;
      wsum = wsum + w;
    }
  }
  mu = mu / wsum;
  let sigma = sqrt(max(m2 / wsum - mu * mu, vec3<f32>(0.0)));
  let motion_px = length(velocity * vec2<f32>(output_size));
  var history = a3d_history_at(uv_prev);
  if (motion_px < 1e-3) {
    let exact_h = textureLoad(u_history_tex, clamp(pixel, vec2<i32>(0), output_size - vec2<i32>(1)), 0);
    history = vec4<f32>(a3d_taa_sanitize_rgb(exact_h.rgb), exact_h.a);
  }
  let motion_factor = clamp(motion_px / 2.0, 0.0, 1.0);
  let gamma = mix(0.5, max(u_params.variance_gamma, 0.0), (1.0 - motion_factor) * (1.0 - motion_factor));
  let history_rgb = max(a3d_ycocg_to_rgb(clamp(a3d_rgb_to_ycocg(history.rgb), mu - gamma * sigma, mu + gamma * sigma)), vec3<f32>(0.0));

  let out_of_bounds = any(uv_prev < vec2<f32>(0.0)) || any(uv_prev >= vec2<f32>(1.0));
  let expected_z = select(vel_tex.b, vel_tex.a, u_params.has_expected_depth != 0);
  let previous_depth_uv = uv_prev + u_params.previous_jitter_uv;
  let depth_out_of_bounds = any(previous_depth_uv < vec2<f32>(0.0)) || any(previous_depth_uv >= vec2<f32>(1.0));
  let prev_pixel = vec2<i32>(floor(previous_depth_uv * vec2<f32>(z_size)));
  var nearest_error = 3.0e38;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let z = textureLoad(u_lin_z_prev_tex,
        clamp(prev_pixel + vec2<i32>(x, y), vec2<i32>(0), z_size - vec2<i32>(1)), 0).r;
      if (a3d_valid_depth(z)) { nearest_error = min(nearest_error, abs(z - expected_z)); }
    }
  }
  let disoccluded = depth_out_of_bounds || !a3d_valid_depth(expected_z) || nearest_error > max(0.001, 0.1 * max(expected_z - u_params.depth_near, 0.0));
  var reactive = reactive_raw;
  if (u_params.has_reactive == 0) {
    reactive = select(0.0, 1.0, abs(a3d_taa_luma(current.rgb) - a3d_taa_luma(history.rgb)) > 0.5);
  }
  let current_tagged = current.a > 1.0;
  let history_tagged = history.a > 1.0;
  var coverage_change = clamp(abs(current.a - history.a) * 4.0, 0.0, 1.0);
  if (current_tagged && history_tagged) { coverage_change = 0.0; }
  if (current_tagged != history_tagged) { coverage_change = 1.0; }
  reactive = max(clamp(reactive, 0.0, 1.0), coverage_change);
  var feedback = mix(u_params.feedback_min, u_params.feedback_max, 1.0 - motion_factor) * (1.0 - reactive);
  if (out_of_bounds || disoccluded) { feedback = 0.0; }
  return vec4<f32>(mix(current.rgb, history_rgb, clamp(feedback, 0.0, 1.0)), current.a);
}
`;

export const WEBGPU_TAA_V2_UPSCALE_FRAGMENT = /* wgsl */ `@group(0) @binding(0) var<uniform> u_params: vec4<f32>;
@group(0) @binding(2) var u_resolved_tex: texture_2d<f32>;

fn a3d_blackman_harris(x: f32) -> f32 {
  let ax = abs(x) / 1.5;
  if (ax >= 1.0) { return 0.0; }
  return 0.35875 + 0.48829 * cos(3.14159265 * ax)
    + 0.14128 * cos(2.0 * 3.14159265 * ax)
    + 0.01168 * cos(3.0 * 3.14159265 * ax);
}

@fragment
fn fs_taa_v2_upscale(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let render_size = u_params.xy;
  let output_size = u_params.zw;
  let src_pos = (frag_coord.xy / output_size) * render_size - vec2<f32>(0.5);
  let base = vec2<i32>(floor(src_pos));
  let f = src_pos - vec2<f32>(base);
  var sum = vec4<f32>(0.0);
  var wsum = 0.0;
  let r_size = vec2<i32>(render_size);
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let w = a3d_blackman_harris(f32(x) - f.x) * a3d_blackman_harris(f32(y) - f.y);
      sum = sum + textureLoad(u_resolved_tex,
        clamp(base + vec2<i32>(x, y), vec2<i32>(0), r_size - vec2<i32>(1)), 0) * w;
      wsum = wsum + w;
    }
  }
  return sum / max(wsum, 1e-6);
}
`;
