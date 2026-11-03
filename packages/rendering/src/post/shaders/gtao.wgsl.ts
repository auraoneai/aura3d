/** WGSL counterpart of Aura3D's linear-depth, normal-facing horizon estimate. */

export const GTAO_WGSL = /* wgsl */ `override AURA_GTAO_DIRECTIONS: i32 = 4;
override AURA_GTAO_STEPS: i32 = 4;

struct GtaoParams {
  proj_matrix: mat4x4<f32>,
  inv_proj_matrix: mat4x4<f32>,
  near: f32,
  far: f32,
  radius: f32,
  intensity: f32,
  falloff: f32,
  distance_exponent: f32,
  thickness: f32,
  frame_index: i32,
  ortho: i32,
  _pad: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_params: GtaoParams;
@group(0) @binding(1) var u_linear_depth_half_tex: texture_2d<f32>;
@group(0) @binding(2) var u_linear_depth_half_smp: sampler;

const AURA_PI: f32 = 3.141592653589793;

fn aura_rotation(pixel: vec2<i32>, frame: i32) -> f32 {
  var bits = u32(pixel.x) * 1103515245u ^ u32(pixel.y) * 2654435761u ^ u32(frame) * 2246822519u;
  bits = bits ^ (bits >> 15u);
  bits = bits * 3266489917u;
  bits = bits ^ (bits >> 16u);
  return f32(bits & 0x00ffffffu) / 16777216.0;
}

fn aura_depth(pixel: vec2<i32>) -> f32 {
  let last = vec2<i32>(textureDimensions(u_linear_depth_half_tex)) - vec2<i32>(1);
  return textureLoad(u_linear_depth_half_tex, clamp(pixel, vec2<i32>(0), last), 0).r;
}

fn aura_view_position(uv: vec2<f32>, depth: f32) -> vec3<f32> {
  // Texture coordinates are y-down; clip coordinates are y-up.
  let ndc = vec2<f32>(uv.x, 1.0 - uv.y) * 2.0 - vec2<f32>(1.0);
  let h = u_params.inv_proj_matrix * vec4<f32>(ndc, 0.0, 1.0);
  if (u_params.ortho != 0) { return vec3<f32>(h.xy / h.w, -depth); }
  return vec3<f32>(h.xy * (depth / max(-h.z, 1e-6)), -depth);
}

fn aura_depth_normal(pixel: vec2<i32>, texel: vec2<f32>, center: vec3<f32>, depth: f32) -> vec3<f32> {
  var l = aura_depth(pixel + vec2<i32>(-1, 0));
  var r = aura_depth(pixel + vec2<i32>( 1, 0));
  var b = aura_depth(pixel + vec2<i32>(0, -1));
  var t = aura_depth(pixel + vec2<i32>(0,  1));
  if (l >= 2.9e38 || (u_params.ortho == 0 && l <= 0.0)) { l = depth; }
  if (r >= 2.9e38 || (u_params.ortho == 0 && r <= 0.0)) { r = depth; }
  if (b >= 2.9e38 || (u_params.ortho == 0 && b <= 0.0)) { b = depth; }
  if (t >= 2.9e38 || (u_params.ortho == 0 && t <= 0.0)) { t = depth; }
  let uv = (vec2<f32>(pixel) + vec2<f32>(0.5)) * texel;
  var dx = aura_view_position(uv + vec2<f32>(texel.x, 0.0), r) - center;
  var dy = aura_view_position(uv + vec2<f32>(0.0, texel.y), t) - center;
  if (abs(l - depth) < abs(r - depth)) { dx = center - aura_view_position(uv - vec2<f32>(texel.x, 0.0), l); }
  if (abs(b - depth) < abs(t - depth)) { dy = center - aura_view_position(uv - vec2<f32>(0.0, texel.y), b); }
  var n = cross(dx, dy);
  let magnitude = length(n);
  if (magnitude < 1e-12) { return vec3<f32>(0.0, 0.0, 1.0); }
  n = n / magnitude;
  let toward_camera = select(-center, vec3<f32>(0.0, 0.0, 1.0), u_params.ortho != 0);
  if (dot(n, toward_camera) < 0.0) { return -n; }
  return n;
}

fn aura_occluder(sample_uv: vec2<f32>, size: vec2<f32>, center: vec3<f32>, normal: vec3<f32>) -> f32 {
  if (any(sample_uv < vec2<f32>(0.0)) || any(sample_uv >= vec2<f32>(1.0))) { return 0.0; }
  let sample_pixel = vec2<i32>(sample_uv * size);
  // Sample the texel center, keeping the existing sampled-texture binding.
  let sample_center = (vec2<f32>(sample_pixel) + vec2<f32>(0.5)) / size;
  let sample_depth = textureSampleLevel(u_linear_depth_half_tex, u_linear_depth_half_smp, sample_center, 0.0).r;
  if (sample_depth >= 2.9e38 || (u_params.ortho == 0 && sample_depth <= 0.0)) { return 0.0; }
  let delta = aura_view_position(sample_center, sample_depth) - center;
  let distance_to_sample = length(delta);
  if (distance_to_sample < 1e-6 || distance_to_sample >= u_params.radius || abs(delta.z) > u_params.thickness) { return 0.0; }
  let facing = max(dot(normal, delta / distance_to_sample) - 0.02, 0.0);
  let attenuation = pow(clamp(1.0 - distance_to_sample / u_params.radius, 0.0, 1.0), max(u_params.falloff, 0.0001));
  return facing * attenuation;
}

@fragment
fn fs_gtao(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(frag_coord.xy);
  let size = vec2<f32>(textureDimensions(u_linear_depth_half_tex));
  let texel = vec2<f32>(1.0) / size;
  let depth = aura_depth(pixel);
  if (depth >= 2.9e38 || (u_params.ortho == 0 && depth <= 0.0) || u_params.radius <= 0.0 || u_params.intensity <= 0.0) {
    return vec4<f32>(1.0);
  }
  let uv = frag_coord.xy * texel;
  let center = aura_view_position(uv, depth);
  let normal = aura_depth_normal(pixel, texel, center, depth);
  let projected_radius = u_params.radius * abs(u_params.proj_matrix[1][1]) * size.y * 0.5;
  let divisor = select(max(depth, 1e-6), 1.0, u_params.ortho != 0);
  let radius_px = min(projected_radius / divisor, 96.0);
  let rotation = aura_rotation(pixel, u_params.frame_index);
  var sum = 0.0;
  for (var direction = 0; direction < AURA_GTAO_DIRECTIONS; direction = direction + 1) {
    let angle = AURA_PI * (f32(direction) + rotation) / f32(AURA_GTAO_DIRECTIONS);
    let axis = vec2<f32>(cos(angle), sin(angle));
    var positive = 0.0;
    var negative = 0.0;
    for (var step_index = 0; step_index < AURA_GTAO_STEPS; step_index = step_index + 1) {
      let progress = pow(f32(step_index + 1) / f32(AURA_GTAO_STEPS), max(u_params.distance_exponent, 0.0001));
      let offset = axis * radius_px * progress * texel;
      positive = max(positive, aura_occluder(uv + offset, size, center, normal));
      negative = max(negative, aura_occluder(uv - offset, size, center, normal));
    }
    sum = sum + positive + negative;
  }
  let occlusion = sum / f32(2 * AURA_GTAO_DIRECTIONS);
  let visibility = 1.0 - clamp(u_params.intensity, 0.0, 1.0) * clamp(occlusion, 0.0, 1.0);
  return vec4<f32>(visibility, 0.0, 0.0, 1.0);
}
`;

/** Native fullscreen helper expects the shared sampler before sampled textures. */
export const GTAO_NATIVE_INTERMEDIATE_WGSL = GTAO_WGSL
  .replace("@binding(1) var u_linear_depth_half_tex", "@binding(2) var u_linear_depth_half_tex")
  .replace("@binding(2) var u_linear_depth_half_smp", "@binding(1) var u_linear_depth_half_smp");

/** Full-resolution AO apply for the native target-to-target post chain. */
export const GTAO_NATIVE_APPLY_WGSL = /* wgsl */ `
struct GtaoNativeApplyParams {
  strength: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};
@group(0) @binding(0) var<uniform> u_params: GtaoNativeApplyParams;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_color: texture_2d<f32>;
@group(0) @binding(3) var u_visibility: texture_2d<f32>;

@fragment
fn fs_gtao_apply(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let color = textureSampleLevel(u_color, u_sampler, uv, 0.0);
  let visibility = textureSampleLevel(u_visibility, u_sampler, uv, 0.0).r;
  let indirect = select(clamp(u_params.strength, 0.0, 1.0), clamp(color.a - 2.0, 0.0, 1.0), color.a >= 1.5);
  return vec4<f32>(color.rgb * mix(1.0, visibility, indirect), min(color.a, 1.0));
}
`;
