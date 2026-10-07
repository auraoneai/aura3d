/**
 * PRD-03 §8.4 / §6.3 Phase 7 — S2 GTAO WGSL twin (half-res R8).
 *
 * Verbatim math of the GLSL twin (three r185 GTAOShader port): per-slice
 * tangent frame, horizon cosine search, cosine-weighted arc integral,
 * 4×4 IGN slice rotation + frame index, screen-space march
 * `radiusPx = radius · projScale / viewZ` clamped 4..96, distance falloff,
 * 5-tap smallest-discontinuity normal. The `#define`d tier constants become
 * pipeline-overridable `override`s (defaults: DIRECTIONS 4, STEPS 4).
 * Output: R8 visibility (1 = unoccluded).
 */

export const GTAO_WGSL = /* wgsl */ `// AURA_GTAO_DIRECTIONS ∈ {2, 4} / AURA_GTAO_STEPS ∈ {4, 6} — pipeline-overridable.
override AURA_GTAO_DIRECTIONS: i32 = 4;
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
  _pad: vec3<f32>,
};

@group(0) @binding(0) var<uniform> u_params: GtaoParams;
@group(0) @binding(1) var u_linear_depth_half_tex: texture_2d<f32>; // S1 RG32F, .r = min viewZ
@group(0) @binding(2) var u_linear_depth_half_smp: sampler;

const PI: f32 = 3.141592653589793;
const GOLDEN_ANGLE: f32 = 2.39996322972865332;

// 4×4 interleaved-gradient noise (same generator as IGN, tiled).
fn ign4(frag_coord: vec2<f32>) -> f32 {
  let p = frag_coord - 4.0 * floor(frag_coord / 4.0);
  return fract(52.9829189 * fract(dot(p, vec2<f32>(0.06711056, 0.00583715))));
}

fn fetch_view_z(p: vec2<i32>) -> f32 {
  return textureLoad(u_linear_depth_half_tex,
    clamp(p, vec2<i32>(0), vec2<i32>(textureDimensions(u_linear_depth_half_tex)) - vec2<i32>(1)), 0).r;
}

fn get_view_position(uv: vec2<f32>, view_z: f32) -> vec3<f32> {
  // Linear viewZ reconstruction: shoot the ndc.xy ray to the far plane,
  // normalize to unit view-depth, scale by viewZ.
  let view = u_params.inv_proj_matrix * vec4<f32>(uv * 2.0 - vec2<f32>(1.0), 1.0, 1.0);
  let ray = view.xyz / view.w;
  return ray * (view_z / -ray.z);
}

// 5-tap smallest-discontinuity normal (three r185 computeNormalFromDepth,
// operating on linear viewZ directly).
fn compute_normal_from_depth(p: vec2<i32>, texel: vec2<f32>) -> vec3<f32> {
  let c0 = fetch_view_z(p);
  let l2 = fetch_view_z(p - vec2<i32>(2, 0));
  let l1 = fetch_view_z(p - vec2<i32>(1, 0));
  let r1 = fetch_view_z(p + vec2<i32>(1, 0));
  let r2 = fetch_view_z(p + vec2<i32>(2, 0));
  let b2 = fetch_view_z(p - vec2<i32>(0, 2));
  let b1 = fetch_view_z(p - vec2<i32>(0, 1));
  let t1 = fetch_view_z(p + vec2<i32>(0, 1));
  let t2 = fetch_view_z(p + vec2<i32>(0, 2));
  let dl = abs((2.0 * l1 - l2) - c0);
  let dr = abs((2.0 * r1 - r2) - c0);
  let db = abs((2.0 * b1 - b2) - c0);
  let dt = abs((2.0 * t1 - t2) - c0);
  let uv = vec2<f32>(p) * texel;
  let ce = get_view_position(uv, c0);
  let dpdx = select(-ce + get_view_position(uv + vec2<f32>(texel.x, 0.0), r1),
                    ce - get_view_position(uv - vec2<f32>(texel.x, 0.0), l1), dl < dr);
  let dpdy = select(-ce + get_view_position(uv + vec2<f32>(0.0, texel.y), t1),
                    ce - get_view_position(uv - vec2<f32>(0.0, texel.y), b1), db < dt);
  return normalize(cross(dpdx, dpdy));
}

@fragment
fn fs_gtao(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let p = vec2<i32>(frag_coord.xy);
  let size = vec2<f32>(textureDimensions(u_linear_depth_half_tex));
  let texel = vec2<f32>(1.0) / size;
  let view_z = fetch_view_z(p);
  if (view_z >= u_params.far * 0.999) { return vec4<f32>(1.0); }

  let uv = frag_coord.xy * texel;
  let view_pos = get_view_position(uv, view_z);
  let view_normal = compute_normal_from_depth(p, texel);
  let view_dir = normalize(-view_pos);

  // radius metres → pixels at this depth, clamped to the march budget.
  let proj_scale = u_params.proj_matrix[1][1] * size.y * 0.5;
  let radius_px = clamp(u_params.radius * proj_scale / view_z, 4.0, 96.0);

  let jitter = ign4(frag_coord.xy) + f32(u_params.frame_index) * GOLDEN_ANGLE;
  var ao = 0.0;

  for (var i = 0; i < AURA_GTAO_DIRECTIONS; i = i + 1) {
    let angle = (f32(i) + jitter) / f32(AURA_GTAO_DIRECTIONS) * PI;
    let dir = vec2<f32>(cos(angle), sin(angle));

    // Per-slice tangent frame (r185): screen-space dir → view-space slice,
    // unprojecting the 2D direction by the projection focal scales.
    let slice_dir_view = normalize(vec3<f32>(dir.x / u_params.proj_matrix[0][0],
                                             dir.y / u_params.proj_matrix[1][1], 0.0));
    let slice_bitangent = normalize(cross(slice_dir_view, view_dir));
    let slice_tangent = cross(slice_bitangent, view_dir);
    let normal_in_slice = normalize(view_normal - slice_bitangent * dot(view_normal, slice_bitangent));
    let tangent_to_normal_in_slice = cross(normal_in_slice, slice_bitangent);
    var cos_horizons = vec2<f32>(dot(view_dir, tangent_to_normal_in_slice),
                                 dot(view_dir, -tangent_to_normal_in_slice));

    for (var j = 0; j < AURA_GTAO_STEPS; j = j + 1) {
      let t = pow(f32(j + 1) / f32(AURA_GTAO_STEPS), u_params.distance_exponent);
      let sample_offset = dir * radius_px * t * texel;

      let sample_uv_pos = uv + sample_offset;
      let sample_z = textureSampleLevel(u_linear_depth_half_tex, u_linear_depth_half_smp, sample_uv_pos, 0.0).r;
      let view_delta = get_view_position(sample_uv_pos, sample_z) - view_pos;
      let d = length(view_delta);
      if (d < u_params.radius && abs(view_delta.z) < u_params.thickness) {
        let sample_cos_horizon = dot(view_dir, normalize(view_delta));
        cos_horizons.x = max(cos_horizons.x,
          sample_cos_horizon * clamp((u_params.radius - d) / (u_params.falloff * u_params.radius), 0.0, 1.0));
      }

      let sample_uv_neg = uv - sample_offset;
      let sample_z2 = textureSampleLevel(u_linear_depth_half_tex, u_linear_depth_half_smp, sample_uv_neg, 0.0).r;
      let view_delta2 = get_view_position(sample_uv_neg, sample_z2) - view_pos;
      let d2 = length(view_delta2);
      if (d2 < u_params.radius && abs(view_delta2.z) < u_params.thickness) {
        let sample_cos_horizon2 = dot(view_dir, normalize(view_delta2));
        cos_horizons.y = max(cos_horizons.y,
          sample_cos_horizon2 * clamp((u_params.radius - d2) / (u_params.falloff * u_params.radius), 0.0, 1.0));
      }
    }

    let sin_horizons = sqrt(vec2<f32>(1.0) - cos_horizons * cos_horizons);
    let nx = dot(normal_in_slice, slice_tangent);
    let ny = dot(normal_in_slice, view_dir);
    let nxb = 0.5 * (acos(cos_horizons.y) - acos(cos_horizons.x)
                     + sin_horizons.x * cos_horizons.x - sin_horizons.y * cos_horizons.y);
    let nyb = 0.5 * (2.0 - cos_horizons.x * cos_horizons.x - cos_horizons.y * cos_horizons.y);
    ao = ao + nx * nxb + ny * nyb;
  }

  ao = clamp(ao / f32(AURA_GTAO_DIRECTIONS), 0.0, 1.0);
  // visibility → occlusion strength (u_intensity 1 = full AO).
  ao = mix(1.0, ao, clamp(u_params.intensity, 0.0, 1.0));
  return vec4<f32>(ao, 0.0, 0.0, 1.0);
}
`;
