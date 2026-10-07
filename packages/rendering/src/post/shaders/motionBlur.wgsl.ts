/**
 * PRD-03 §8.8 Phase 7 — S7 motion blur WGSL twins, McGuire 2012 tile
 * reconstruction: per-tile max velocity → 3×3 tile-neighborhood max →
 * per-pixel taps along the neighbor-max direction with a soft depth
 * compare (0.05 m) and IGN jitter. All inputs texelFetch-only.
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
  samples: i32,            // 8 | 12 | 16
  tile_size: i32,
  frame_index: i32,
  _pad: vec3<f32>,
};

@group(0) @binding(0) var<uniform> u_params: MbReconstructParams;
@group(0) @binding(1) var u_color_tex: texture_2d<f32>;
@group(0) @binding(2) var u_velocity_tex: texture_2d<f32>;     // dilated velocity (.rg)
@group(0) @binding(3) var u_neighbor_tex: texture_2d<f32>;     // 3x3 tile max
@group(0) @binding(4) var u_linear_depth_tex: texture_2d<f32>; // .r = viewZ metres

fn mb_ign(pixel: vec2<f32>, frame_index: i32) -> f32 {
  // Interleaved gradient noise — per-pixel tap phase.
  return fract(52.9829189 * fract(dot(pixel, vec2<f32>(0.06711056, 0.00583715)) + f32(frame_index) * 0.618034));
}

@fragment
fn fs_mb_reconstruct(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(frag_coord.xy);
  let size = vec2<i32>(textureDimensions(u_color_tex));
  let uv = (vec2<f32>(pixel) + vec2<f32>(0.5)) / vec2<f32>(size);
  let src = textureLoad(u_color_tex, pixel, 0).rgb;
  let z_self = textureLoad(u_linear_depth_tex, pixel, 0).r;

  // Shutter·frame-time scale and pixel clamp happen once, on the tile vector.
  var tile_v = textureLoad(u_neighbor_tex, pixel / u_params.tile_size, 0).rg * u_params.shutter;
  let max_len = u_params.max_blur_px / f32(size.y);
  if (length(tile_v) > max_len) { tile_v = tile_v * (max_len / length(tile_v)); }

  let jitter = mb_ign(vec2<f32>(pixel), u_params.frame_index);
  var sum = src;
  var wsum = 1.0;
  for (var i = 0; i < 16; i = i + 1) {
    if (i >= u_params.samples) { break; }
    let t = (f32(i) + jitter) / f32(u_params.samples - 1) - 0.5;
    let offset = tile_v * t;
    let tap_px = clamp(vec2<i32>(floor((uv + offset) * vec2<f32>(size))), vec2<i32>(0), size - vec2<i32>(1));
    let c = textureLoad(u_color_tex, tap_px, 0).rgb;
    let z_tap = textureLoad(u_linear_depth_tex, tap_px, 0).r;
    // Soft depth compare (0.05 m): taps on a different surface don't smear.
    let depth_w = clamp(1.0 - abs(z_tap - z_self) / 0.05, 0.0, 1.0);
    // Coverage weight: a tap counts while the tile vector reaches it.
    let reach = length(tile_v) * abs(t);
    let w = depth_w * clamp(1.0 + length(tile_v) * 0.5 - reach, 0.0, 1.0);
    sum = sum + c * w;
    wsum = wsum + w;
  }
  return vec4<f32>(sum / wsum, 1.0);
}
`;
