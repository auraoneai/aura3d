/**
 * PRD-03 §8.3 Phase 7 — S1 depth prep WGSL twins (WebGPU).
 *
 * `linearizeDepth` note: the GLSL twin receives `u_ortho` as a bool uniform;
 * WGSL uniform blocks cannot hold bools (not host-shareable), so the twin
 * carries `ortho: i32` and the probe is `ortho != 0` — the driver writes 0/1.
 *
 * `CAMERA_VELOCITY_WGSL` — the one semantic difference from GLSL:
 * `gl_FragCoord`-derived `uv` is y-UP in GL (origin bottom-left) but
 * `frag_coord`/`textureDimensions` space is y-DOWN (row 0 = top). Sampling
 * stays self-consistent, but the `uv * 2 - 1` → NDC conversion needs a y
 * flip so `ndcCurr` still lines up with clip space (y-up NDC).
 */

const COMMON = /* wgsl */ `
fn linearize_depth(d: f32, n: f32, f: f32, ortho: bool) -> f32 {
  let z = d * 2.0 - 1.0;
  return select((2.0 * n * f) / (f + n - z * (f - n)), mix(n, f, d), ortho);
}
`;

export const DEPTH_LINEARIZE_WGSL = /* wgsl */ `struct DepthLinearizeParams {
  near: f32,
  far: f32,
  ortho: i32,
  _pad: f32,
};

@group(0) @binding(0) var<uniform> u_params: DepthLinearizeParams;
@group(0) @binding(1) var u_depth_tex: texture_2d<f32>;

${COMMON}

@fragment
fn fs_depth_linearize(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let d = textureLoad(u_depth_tex, vec2<i32>(frag_coord.xy), 0).r;
  return vec4<f32>(linearize_depth(d, u_params.near, u_params.far, u_params.ortho != 0), 0.0, 0.0, 1.0);
}
`;

export const DEPTH_MINMAX_HALF_WGSL = /* wgsl */ `@group(0) @binding(1) var u_linear_depth_tex: texture_2d<f32>;

@fragment
fn fs_depth_minmax_half(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let p = vec2<i32>(frag_coord.xy) * 2;
  let d00 = textureLoad(u_linear_depth_tex, p, 0).r;
  let d10 = textureLoad(u_linear_depth_tex, p + vec2<i32>(1, 0), 0).r;
  let d01 = textureLoad(u_linear_depth_tex, p + vec2<i32>(0, 1), 0).r;
  let d11 = textureLoad(u_linear_depth_tex, p + vec2<i32>(1, 1), 0).r;
  return vec4<f32>(min(min(d00, d10), min(d01, d11)),
                   max(max(d00, d10), max(d01, d11)), 0.0, 1.0);
}
`;

export const CAMERA_VELOCITY_WGSL = /* wgsl */ `struct CameraVelocityParams {
  near: f32,
  far: f32,
  ortho: i32,
  _pad: f32,
  prev_view_projection: mat4x4<f32>,
  inv_unjittered_view_projection: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> u_params: CameraVelocityParams;
@group(0) @binding(1) var u_depth_tex: texture_2d<f32>;

${COMMON}

@fragment
fn fs_camera_velocity(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let size = vec2<f32>(textureDimensions(u_depth_tex));
  let uv = frag_coord.xy / size;
  let d = textureLoad(u_depth_tex, vec2<i32>(frag_coord.xy), 0).r;
  let lin_z = linearize_depth(d, u_params.near, u_params.far, u_params.ortho != 0);
  // frag_coord space is y-down (row 0 = top) but clip space is y-up — flip
  // before mapping to NDC so the reprojection math matches the GLSL twin.
  let ndc_curr = vec2<f32>(uv.x, 1.0 - uv.y) * 2.0 - vec2<f32>(1.0);
  // Reconstruct the unjittered world/view position of this pixel, then
  // reproject it through last frame's camera.
  let view_prev_h = u_params.inv_unjittered_view_projection * vec4<f32>(ndc_curr, d * 2.0 - 1.0, 1.0);
  let clip_prev = u_params.prev_view_projection * vec4<f32>(view_prev_h.xyz / view_prev_h.w, 1.0);
  let ndc_prev = clip_prev.xy / clip_prev.w;
  // Same units and sign convention as the C-14 velocity MRT: UV-space
  // half-magnitude per frame.
  var v = (ndc_curr - ndc_prev) * 0.5;
  // Sky/static far plane writes zero motion.
  v = select(v, vec2<f32>(0.0), lin_z >= u_params.far * 0.999);
  return vec4<f32>(v, 0.0, 1.0);
}
`;
