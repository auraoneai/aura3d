/**
 * Native-GPU temporal resolve. Inputs may use render resolution while history
 * and output use display resolution. `jitter_uv` uses WebGPU texture (top-left)
 * coordinates. See taa.glsl.ts for the identical motion/depth contract.
 */
export const TAA_RESOLVE_WGSL = /* wgsl */ `struct TaaResolveParams {
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
@group(0) @binding(1) var u_current_tex: texture_2d<f32>;
@group(0) @binding(2) var u_history_tex: texture_2d<f32>;
@group(0) @binding(3) var u_velocity_dilate_tex: texture_2d<f32>;
@group(0) @binding(4) var u_lin_z_prev_tex: texture_2d<f32>;
@group(0) @binding(6) var u_reactive_tex: texture_2d<f32>;
@group(0) @binding(7) var u_reactive_smp: sampler;

fn cubic_weights(f: f32) -> vec4<f32> {
  let f2 = f * f;
  let f3 = f2 * f;
  return vec4<f32>(-0.5 * f + f2 - 0.5 * f3, 1.0 - 2.5 * f2 + 1.5 * f3,
                   0.5 * f + 2.0 * f2 - 1.5 * f3, -0.5 * f2 + 0.5 * f3);
}

fn history_at(uv: vec2<f32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(u_history_tex));
  let position = uv * vec2<f32>(size) - vec2<f32>(0.5);
  let base = vec2<i32>(floor(position));
  let wx = cubic_weights(fract(position.x));
  let wy = cubic_weights(fract(position.y));
  var result = vec4<f32>(0.0);
  for (var y = 0; y < 4; y = y + 1) {
    for (var x = 0; x < 4; x = x + 1) {
      result = result + textureLoad(u_history_tex,
        clamp(base + vec2<i32>(x - 1, y - 1), vec2<i32>(0), size - vec2<i32>(1)), 0) * wx[x] * wy[y];
    }
  }
  return result;
}

fn current_at(uv: vec2<f32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(u_current_tex));
  let p = uv * vec2<f32>(size) - vec2<f32>(0.5);
  let base = vec2<i32>(floor(p));
  let f = fract(p);
  let a = textureLoad(u_current_tex, clamp(base, vec2<i32>(0), size - vec2<i32>(1)), 0);
  let b = textureLoad(u_current_tex, clamp(base + vec2<i32>(1, 0), vec2<i32>(0), size - vec2<i32>(1)), 0);
  let c = textureLoad(u_current_tex, clamp(base + vec2<i32>(0, 1), vec2<i32>(0), size - vec2<i32>(1)), 0);
  let d = textureLoad(u_current_tex, clamp(base + vec2<i32>(1, 1), vec2<i32>(0), size - vec2<i32>(1)), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

fn rgb_to_ycocg(c: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(c.r * 0.25 + c.g * 0.5 + c.b * 0.25,
                   c.r * 0.5 - c.b * 0.5,
                   -c.r * 0.25 + c.g * 0.5 - c.b * 0.25);
}
fn ycocg_to_rgb(c: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z);
}
fn taa_luma(c: vec3<f32>) -> f32 { return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722)); }
fn valid_depth(z: f32) -> bool { return z >= u_params.depth_near && z < 3.0e38; }

@fragment
fn fs_taa_resolve(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
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
  let current = current_at(current_uv);
  if (u_params.has_history == 0 || any(velocity != velocity) || any(abs(velocity) > vec2<f32>(2.0))) { return current; }

  var mu = vec3<f32>(0.0);
  var m2 = vec3<f32>(0.0);
  var wsum = 0.0;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let tap = textureLoad(u_current_tex,
        clamp(current_pixel + vec2<i32>(x, y), vec2<i32>(0), current_size - vec2<i32>(1)), 0).rgb;
      let w = 1.0 / (1.0 + max(taa_luma(tap), 0.0));
      let yc = rgb_to_ycocg(tap);
      mu = mu + yc * w;
      m2 = m2 + yc * yc * w;
      wsum = wsum + w;
    }
  }
  mu = mu / wsum;
  let sigma = sqrt(max(m2 / wsum - mu * mu, vec3<f32>(0.0)));
  let motion_px = length(velocity * vec2<f32>(output_size));
  var history = history_at(uv_prev);
  if (motion_px < 1e-3) {
    history = textureLoad(u_history_tex, clamp(pixel, vec2<i32>(0), output_size - vec2<i32>(1)), 0);
  }
  let motion_factor = clamp(motion_px / 2.0, 0.0, 1.0);
  let gamma = mix(0.5, max(u_params.variance_gamma, 0.0), (1.0 - motion_factor) * (1.0 - motion_factor));
  let history_rgb = ycocg_to_rgb(clamp(rgb_to_ycocg(history.rgb), mu - gamma * sigma, mu + gamma * sigma));

  let out_of_bounds = any(uv_prev < vec2<f32>(0.0)) || any(uv_prev >= vec2<f32>(1.0));
  let expected_z = select(vel_tex.b, vel_tex.a, u_params.has_expected_depth != 0);
  let z_size = vec2<i32>(textureDimensions(u_lin_z_prev_tex));
  let previous_depth_uv = uv_prev + u_params.previous_jitter_uv;
  let depth_out_of_bounds = any(previous_depth_uv < vec2<f32>(0.0)) || any(previous_depth_uv >= vec2<f32>(1.0));
  let prev_pixel = vec2<i32>(floor(previous_depth_uv * vec2<f32>(z_size)));
  // Linear depth is loaded without filtering; rgba32float may be unfilterable.
  var nearest_error = 3.0e38;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let z = textureLoad(u_lin_z_prev_tex,
        clamp(prev_pixel + vec2<i32>(x, y), vec2<i32>(0), z_size - vec2<i32>(1)), 0).r;
      if (valid_depth(z)) { nearest_error = min(nearest_error, abs(z - expected_z)); }
    }
  }
  let disoccluded = depth_out_of_bounds || !valid_depth(expected_z) || nearest_error > max(0.001, 0.1 * max(expected_z - u_params.depth_near, 0.0));
  let reactive_size = vec2<i32>(textureDimensions(u_reactive_tex));
  let reactive_pixel = clamp(vec2<i32>(floor(current_uv * vec2<f32>(reactive_size))), vec2<i32>(0), reactive_size - vec2<i32>(1));
  var reactive = textureSampleLevel(u_reactive_tex, u_reactive_smp,
    (vec2<f32>(reactive_pixel) + vec2<f32>(0.5)) / vec2<f32>(reactive_size), 0.0).r;
  if (u_params.has_reactive == 0) {
    reactive = select(0.0, 1.0, abs(taa_luma(current.rgb) - taa_luma(history.rgb)) > 0.5);
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

export const TAA_UPSCALE_WGSL = /* wgsl */ `struct TaaUpscaleParams {
  render_size: vec2<f32>,   // render resolution (input texel space)
  output_size: vec2<f32>,   // display resolution (draw target size)
};

@group(0) @binding(0) var<uniform> u_params: TaaUpscaleParams;
@group(0) @binding(1) var u_resolved_tex: texture_2d<f32>; // render-res TAA output (this frame)

fn blackman_harris(x: f32) -> f32 {
  // N=9 window kernel, |x| ∈ [0, 1.5] inside the 3×3 footprint.
  let ax = abs(x) / 1.5;
  if (ax >= 1.0) { return 0.0; }
  return 0.35875 + 0.48829 * cos(3.14159265 * ax)
    + 0.14128 * cos(2.0 * 3.14159265 * ax)
    + 0.01168 * cos(3.0 * 3.14159265 * ax);
}

@fragment
fn fs_taa_upscale(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  // Output pixel → render-res source position.
  let src_pos = (frag_coord.xy / u_params.output_size) * u_params.render_size - vec2<f32>(0.5);
  let base = vec2<i32>(floor(src_pos));
  let f = src_pos - vec2<f32>(base);
  var sum = vec4<f32>(0.0);
  var wsum = 0.0;
  let r_size = vec2<i32>(u_params.render_size);
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let w = blackman_harris(f32(x) - f.x) * blackman_harris(f32(y) - f.y);
      sum = sum + textureLoad(u_resolved_tex,
        clamp(base + vec2<i32>(x, y), vec2<i32>(0), r_size - vec2<i32>(1)), 0) * w;
      wsum = wsum + w;
    }
  }
  return sum / max(wsum, 1e-6);
}
`;
