/**
 * PRD-03 §8.8 Phase 7 — S7 motion blur WGSL twins, McGuire 2012 tile
 * reconstruction: per-tile max velocity → 3×3 tile-neighborhood max →
 * per-pixel taps along the neighbor-max direction with a soft depth
 * compare (0.05 m). All inputs texelFetch-only.
 */

export const MB_TILE_MAX_WGSL = /* wgsl */ `// MB_TILE_SIZE — pipeline-overridable (authored motionBlur.tileSize, 16 default).
override MB_TILE_SIZE: i32 = 16;

@group(0) @binding(1) var u_velocity_tex: texture_2d<f32>; // dilated velocity (.rg), render res

@fragment
fn fs_mb_tile_max(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let tile = vec2<i32>(frag_coord.xy);
  let size = vec2<i32>(textureDimensions(u_velocity_tex));
  var best = vec2<f32>(0.0);
  var mag = 0.0;
  for (var y = 0; y < MB_TILE_SIZE; y = y + 1) {
    for (var x = 0; x < MB_TILE_SIZE; x = x + 1) {
      let p = tile * MB_TILE_SIZE + vec2<i32>(x, y);
      if (p.x >= size.x || p.y >= size.y) { continue; }
      let v = textureLoad(u_velocity_tex, p, 0).rg;
      let m = dot(v, v);
      if (m > mag) { mag = m; best = v; }
    }
  }
  return vec4<f32>(best, 0.0, 1.0);
}
`;

export const MB_NEIGHBOR_WGSL = /* wgsl */ `@group(0) @binding(1) var u_tile_max_tex: texture_2d<f32>;

@fragment
fn fs_mb_neighbor(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let tile = vec2<i32>(frag_coord.xy);
  let size = vec2<i32>(textureDimensions(u_tile_max_tex));
  var best = vec2<f32>(0.0);
  var mag = 0.0;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let v = textureLoad(u_tile_max_tex, clamp(tile + vec2<i32>(x, y), vec2<i32>(0), size - vec2<i32>(1)), 0).rg;
      let m = dot(v, v);
      if (m > mag) { mag = m; best = v; }
    }
  }
  return vec4<f32>(best, 0.0, 1.0);
}
`;

export const MB_RECONSTRUCT_WGSL = /* wgsl */ `struct MbReconstructParams {
  shutter: f32,            // authored shutter · frameTime scale
  max_blur_px: f32,
  samples: i32,            // bounded to [1, 16]
  tile_size: i32,
  frame_index: i32,
  _pad: vec3<f32>,
};

@group(0) @binding(0) var<uniform> u_params: MbReconstructParams;
@group(0) @binding(1) var u_color_tex: texture_2d<f32>;
@group(0) @binding(2) var u_velocity_tex: texture_2d<f32>;     // dilated velocity (.rg)
@group(0) @binding(3) var u_neighbor_tex: texture_2d<f32>;     // 3x3 tile max
@group(0) @binding(4) var u_linear_depth_tex: texture_2d<f32>; // .r = viewZ metres

@fragment
fn fs_mb_reconstruct(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let size = vec2<i32>(textureDimensions(u_color_tex));
  let pixel = clamp(vec2<i32>(frag_coord.xy), vec2<i32>(0), size - vec2<i32>(1));
  let src = textureLoad(u_color_tex, pixel, 0);
  let samples = clamp(u_params.samples, 1, 16);
  if (samples == 1) { return src; }

  let depth_size = vec2<i32>(textureDimensions(u_linear_depth_tex));
  let depth_max = depth_size - vec2<i32>(1);
  let depth_pixel = clamp(vec2<i32>((vec2<f32>(pixel) + vec2<f32>(0.5)) * vec2<f32>(depth_size) / vec2<f32>(size)), vec2<i32>(0), depth_max);
  let z_self = textureLoad(u_linear_depth_tex, depth_pixel, 0).r;
  let neighbor_max = vec2<i32>(textureDimensions(u_neighbor_tex)) - vec2<i32>(1);
  let tile = clamp(depth_pixel / max(u_params.tile_size, 1), vec2<i32>(0), neighbor_max);
  let velocity = clamp(textureLoad(u_neighbor_tex, tile, 0).rg, vec2<f32>(-1e10), vec2<f32>(1e10));
  var velocity_px = velocity * clamp(u_params.shutter, -1e10, 1e10) * vec2<f32>(size);
  let component = max(abs(velocity_px.x), abs(velocity_px.y));
  if (component == 0.0) { return src; }
  let direction = velocity_px / component;
  let max_len = clamp(u_params.max_blur_px, 0.0, 2.0 * length(vec2<f32>(size)));
  velocity_px = direction * min(component, max_len / length(direction));

  var sum = vec4<f32>(0.0);
  var wsum = 0.0;
  for (var i = 0; i < 16; i = i + 1) {
    if (i >= samples) { break; }
    let t = (f32(i) + 0.5) / f32(samples) - 0.5;
    let pos = clamp(vec2<f32>(pixel) + velocity_px * t, vec2<f32>(0.0), vec2<f32>(size - vec2<i32>(1)));
    let base = vec2<i32>(floor(pos));
    let fraction = fract(pos);
    for (var y = 0; y < 2; y = y + 1) {
      for (var x = 0; x < 2; x = x + 1) {
        let coverage = select(fraction.x, 1.0 - fraction.x, x == 0)
                     * select(fraction.y, 1.0 - fraction.y, y == 0);
        if (coverage <= 0.0) { continue; }
        let tap_px = clamp(base + vec2<i32>(x, y), vec2<i32>(0), size - vec2<i32>(1));
        let depth_tap = clamp(vec2<i32>((vec2<f32>(tap_px) + vec2<f32>(0.5)) * vec2<f32>(depth_size) / vec2<f32>(size)), vec2<i32>(0), depth_max);
        let z_tap = textureLoad(u_linear_depth_tex, depth_tap, 0).r;
        let w = coverage * clamp(1.0 - abs(z_tap - z_self) / 0.05, 0.0, 1.0);
        var sample_color = textureLoad(u_color_tex, tap_px, 0);
        if (src.a <= 1.0) { sample_color.a = clamp(sample_color.a, 0.0, 1.0); }
        sum = sum + sample_color * w;
        wsum = wsum + w;
      }
    }
  }
  if (wsum == 0.0) { return src; }
  let filtered = sum / wsum;
  // Tagged HDR alpha carries indirect-light metadata rather than opacity.
  if (src.a > 1.0) { return vec4<f32>(filtered.rgb, src.a); }
  return filtered;
}
`;
