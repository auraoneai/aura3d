/**
 * PRD-03 §8.6 Phase 7 — S5 TAA resolve WGSL twins: closest-depth-3×3
 * reprojection, 5-tap Catmull-Rom history fetch, YCoCg `μ ± γσ` clip
 * (γ motion-dependent), 0.1·z disocclusion test, motion/reactive feedback,
 * Karis-weighted HDR resolve. `TAA_UPSCALE_WGSL` is the §8.6 TAAU 9-tap
 * Blackman-Harris reconstruct.
 */

export const TAA_RESOLVE_WGSL = /* wgsl */ `struct TaaResolveParams {
  has_reactive: i32,
  has_history: i32,
  feedback_min: f32,
  feedback_max: f32,
  variance_gamma: f32,
  _pad: vec3<f32>,
};

@group(0) @binding(0) var<uniform> u_params: TaaResolveParams;
@group(0) @binding(1) var u_current_tex: texture_2d<f32>;         // jittered HDR current frame
@group(0) @binding(2) var u_history_tex: texture_2d<f32>;         // last resolved frame
@group(0) @binding(3) var u_velocity_dilate_tex: texture_2d<f32>; // vec4(vx, vy, linZCurr, _)
@group(0) @binding(4) var u_lin_z_prev_tex: texture_2d<f32>;      // last frame's linear depth (.r)
@group(0) @binding(5) var u_lin_z_prev_smp: sampler;
@group(0) @binding(6) var u_reactive_tex: texture_2d<f32>;        // C-14 reactive mask (or 1×1 zero)
@group(0) @binding(7) var u_reactive_smp: sampler;

fn cubic_weights(f: f32) -> vec4<f32> {
  let f2 = f * f;
  let f3 = f2 * f;
  return vec4<f32>(-0.5 * f + f2 - 0.5 * f3, 1.0 - 2.5 * f2 + 1.5 * f3,
                   0.5 * f + 2.0 * f2 - 1.5 * f3, -0.5 * f2 + 0.5 * f3);
}

// §8.6: Catmull-Rom history fetch (ported from the legacy accumulation path).
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

fn rgb_to_ycocg(c: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(c.r * 0.25 + c.g * 0.5 + c.b * 0.25,
                   c.r * 0.5 - c.b * 0.5,
                   -c.r * 0.25 + c.g * 0.5 - c.b * 0.25);
}
fn ycocg_to_rgb(c: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z);
}
fn taa_luma(c: vec3<f32>) -> f32 { return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722)); }

@fragment
fn fs_taa_resolve(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(frag_coord.xy);
  let size = vec2<i32>(textureDimensions(u_current_tex));
  let uv = (vec2<f32>(pixel) + vec2<f32>(0.5)) / vec2<f32>(size);

  let vel_tex = textureLoad(u_velocity_dilate_tex, pixel, 0);
  let velocity = vel_tex.rg;
  let uv_prev = uv - velocity;

  // Current pixel + Karis-weighted 3×3 neighborhood stats in YCoCg.
  let current = textureLoad(u_current_tex, pixel, 0).rgb;
  var mu = vec3<f32>(0.0);
  var m2 = vec3<f32>(0.0);
  var wsum = 0.0;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let tap = textureLoad(u_current_tex,
        clamp(pixel + vec2<i32>(x, y), vec2<i32>(0), size - vec2<i32>(1)), 0).rgb;
      // Karis weight tames HDR fireflies inside the clip box.
      let w = 1.0 / (1.0 + taa_luma(tap));
      let yc = rgb_to_ycocg(tap);
      mu = mu + yc * w;
      m2 = m2 + yc * yc * w;
      wsum = wsum + w;
    }
  }
  mu = mu / wsum;
  let sigma = sqrt(max(m2 / wsum - mu * mu, vec3<f32>(0.0)));

  if (u_params.has_history == 0) {
    return vec4<f32>(current, 1.0);
  }

  let history = history_at(uv_prev).rgb;
  var history_yc = rgb_to_ycocg(history);

  // Motion-scaled variance: fast pixels trust the box more (γ→0.5).
  let motion_px = length(velocity * vec2<f32>(size));
  let motion_factor = clamp(motion_px / 2.0, 0.0, 1.0);
  let gamma = mix(0.5, u_params.variance_gamma, (1.0 - motion_factor) * (1.0 - motion_factor));
  let lo = mu - gamma * sigma;
  let hi = mu + gamma * sigma;
  history_yc = clamp(history_yc, lo, hi);
  let history_rgb = ycocg_to_rgb(history_yc);

  // Disocclusion: |prevLinZ − expectedZ| > 0.1·z → drop history.
  let out_of_bounds = any(uv_prev < vec2<f32>(0.0)) || any(uv_prev >= vec2<f32>(1.0));
  let z_curr = vel_tex.b;
  let z_prev = textureSampleLevel(u_lin_z_prev_tex, u_lin_z_prev_smp,
    clamp(uv_prev, vec2<f32>(0.0), vec2<f32>(1.0)), 0.0).r;
  let disoccluded = abs(z_prev - z_curr) > 0.1 * z_curr;

  // Reactive mask (C-14) overrides accumulation; absent the attachment, a
  // luminance delta between current and reprojected history is the proxy.
  var reactive = textureSampleLevel(u_reactive_tex, u_reactive_smp, uv, 0.0).r;
  if (u_params.has_reactive == 0) {
    reactive = select(0.0, 1.0, abs(taa_luma(current) - taa_luma(history_rgb)) > 0.5);
  }

  var feedback = mix(u_params.feedback_min, u_params.feedback_max, 1.0 - clamp(motion_px / 2.0, 0.0, 1.0));
  feedback = mix(feedback, 0.5, clamp(reactive, 0.0, 1.0));
  if (out_of_bounds || disoccluded) { feedback = 0.0; }

  let resolved = mix(current, history_rgb, feedback);
  return vec4<f32>(max(resolved, vec3<f32>(0.0)), 1.0);
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
  var sum = vec3<f32>(0.0);
  var wsum = 0.0;
  let r_size = vec2<i32>(u_params.render_size);
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let w = blackman_harris(f32(x) - f.x) * blackman_harris(f32(y) - f.y);
      sum = sum + textureLoad(u_resolved_tex,
        clamp(base + vec2<i32>(x, y), vec2<i32>(0), r_size - vec2<i32>(1)), 0).rgb * w;
      wsum = wsum + w;
    }
  }
  return vec4<f32>(sum / max(wsum, 1e-6), 1.0);
}
`;
