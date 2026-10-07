/**
 * PRD-03 §8.7 Phase 7 — S6 depth of field WGSL twins. Thin-lens CoC in px
 * (`A · f · (z − zf) / (z · (zf − f)) · heightPx/sensorMm`, all mm); half-res
 * prefilter → 8px near-field tile max → Vogel-disc gather (`DOF_RINGS`
 * pipeline-overridable, default 3) → full-res smoothstep composite.
 */

export const DOF_PREFILTER_WGSL = /* wgsl */ `struct DofPrefilterParams {
  focus_distance: f32,     // metres
  focal_length_mm: f32,
  f_stop: f32,
  sensor_height_mm: f32,
  frame_height_px: f32,    // full-res height
  max_blur_px: f32,
  _pad: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_params: DofPrefilterParams;
@group(0) @binding(1) var u_color_tex: texture_2d<f32>;
@group(0) @binding(2) var u_linear_depth_tex: texture_2d<f32>;

@fragment
fn fs_dof_prefilter(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(frag_coord.xy);
  let color = textureLoad(u_color_tex, pixel, 0).rgb;
  let z = textureLoad(u_linear_depth_tex,
    clamp(pixel * 2, vec2<i32>(0), vec2<i32>(textureDimensions(u_linear_depth_tex)) - vec2<i32>(1)), 0).r;
  let f = u_params.focal_length_mm;
  let aperture = f / max(u_params.f_stop, 0.01);
  let z_mm = max(z * 1000.0, 1.0);
  let zf_mm = u_params.focus_distance * 1000.0;
  let coc_mm = aperture * f * (z_mm - zf_mm) / (z_mm * max(zf_mm - f, 1.0));
  var coc_px = clamp(coc_mm * (u_params.frame_height_px / u_params.sensor_height_mm), -u_params.max_blur_px, u_params.max_blur_px);
  // Sky (linear Z at far) never blurs.
  coc_px = select(coc_px, 0.0, z_mm >= 9.9e5);
  return vec4<f32>(color, coc_px);
}
`;

export const DOF_NEAR_TILE_WGSL = /* wgsl */ `@group(0) @binding(1) var u_prefilter_tex: texture_2d<f32>; // half-res, .a = signed cocPx

@fragment
fn fs_dof_near_tile(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let tile = vec2<i32>(frag_coord.xy);
  let size = vec2<i32>(textureDimensions(u_prefilter_tex));
  var near_coc = 0.0;
  for (var y = 0; y < 8; y = y + 1) {
    for (var x = 0; x < 8; x = x + 1) {
      let p = tile * 8 + vec2<i32>(x, y);
      if (p.x >= size.x || p.y >= size.y) { continue; }
      let coc = textureLoad(u_prefilter_tex, p, 0).a;
      near_coc = max(near_coc, -coc); // near field is the negative-CoC side
    }
  }
  return vec4<f32>(near_coc, 0.0, 0.0, 1.0);
}
`;

export const DOF_GATHER_WGSL = /* wgsl */ `// DOF_RINGS — pipeline-overridable gather rings (3 = High, 2 = Medium).
override DOF_RINGS: i32 = 3;

struct DofGatherParams {
  max_blur_px: f32,        // full-res px; radius here is half that
  _pad: vec3<f32>,
};

@group(0) @binding(0) var<uniform> u_params: DofGatherParams;
@group(0) @binding(1) var u_prefilter_tex: texture_2d<f32>; // half-res color + signed coc
@group(0) @binding(2) var u_near_tile_tex: texture_2d<f32>;  // 8px tiles, .r = near |coc|

@fragment
fn fs_dof_gather(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(frag_coord.xy);
  let size = vec2<i32>(textureDimensions(u_prefilter_tex));
  let center = textureLoad(u_prefilter_tex, pixel, 0);
  let center_coc = center.a;
  let center_near = textureLoad(u_near_tile_tex, pixel / 8, 0).r;
  let radius = max(abs(center_coc), center_near) * 0.5;
  var sum = center.rgb;
  var wsum = 1.0;
  for (var ring = 1; ring <= DOF_RINGS; ring = ring + 1) {
    for (var s = 0; s < 8; s = s + 1) {
      let angle = 2.39996323 * f32(ring * 8 + s); // golden-angle Vogel disc
      let dir = vec2<f32>(cos(angle), sin(angle));
      let tap = clamp(pixel + vec2<i32>(dir * radius * (f32(ring) / f32(DOF_RINGS)) + vec2<f32>(0.5)),
        vec2<i32>(0), size - vec2<i32>(1));
      let t = textureLoad(u_prefilter_tex, tap, 0);
      let tap_near = textureLoad(u_near_tile_tex, tap / 8, 0).r;
      // A tap contributes when its own blur reaches this pixel, or when the
      // tile's near field does (foreground bleeds over sharp background).
      let reach = max(abs(t.a), tap_near) * 0.5;
      let w = clamp((reach + 0.5) / max(length(vec2<f32>(tap - pixel)), 0.5), 0.0, 1.0);
      sum = sum + t.rgb * w;
      wsum = wsum + w;
    }
  }
  return vec4<f32>(sum / wsum, center_coc);
}
`;

export const DOF_COMPOSITE_WGSL = /* wgsl */ `@group(0) @binding(1) var u_color_tex: texture_2d<f32>;   // full-res HDR
@group(0) @binding(2) var u_blurred_tex: texture_2d<f32>;  // half-res gather (.a = signed cocPx)
@group(0) @binding(3) var u_blurred_smp: sampler;

@fragment
fn fs_dof_composite(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(frag_coord.xy);
  let src = textureLoad(u_color_tex, pixel, 0);
  let blur = textureSampleLevel(u_blurred_tex, u_blurred_smp,
    (vec2<f32>(pixel) + vec2<f32>(0.5)) / vec2<f32>(textureDimensions(u_color_tex)), 0.0);
  return vec4<f32>(mix(src.rgb, blur.rgb, smoothstep(1.0, 2.0, abs(blur.a))), src.a);
}
`;
