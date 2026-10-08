/**
 * PRD-03 §8.6 Phase 7 — closest-depth velocity dilation WGSL twin.
 * 3×3 window: the velocity of the closest-depth texel wins (foreground
 * surface); the pixel's own linear Z goes to .b for the S5 disocclusion
 * test. Both inputs are texelFetch-only → no samplers.
 */

export const VELOCITY_DILATE_WGSL = /* wgsl */ `@group(0) @binding(1) var u_velocity_tex: texture_2d<f32>;
@group(0) @binding(2) var u_linear_depth_tex: texture_2d<f32>;

@fragment
fn fs_velocity_dilate(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(frag_coord.xy);
  let size = vec2<i32>(textureDimensions(u_velocity_tex));
  let z_self = textureLoad(u_linear_depth_tex, clamp(pixel, vec2<i32>(0), size - vec2<i32>(1)), 0).r;
  var v = textureLoad(u_velocity_tex, pixel, 0).rg;
  var z_best = z_self;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let tap = clamp(pixel + vec2<i32>(x, y), vec2<i32>(0), size - vec2<i32>(1));
      let z = textureLoad(u_linear_depth_tex, tap, 0).r;
      if (z < z_best) {
        z_best = z;
        v = textureLoad(u_velocity_tex, tap, 0).rg;
      }
    }
  }
  return vec4<f32>(v, z_self, 0.0);
}
`;
