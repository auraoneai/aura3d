/**
 * Native-GPU counterpart to Aura3D's three-stage morphological antialiaser.
 * It uses the same edge/run/triangle-coverage rules and generated lookup
 * textures as the WebGL2 implementation, with the existing binding layout.
 */

export const SMAA_EDGES_WGSL = /* wgsl */ `struct SmaaEdgesParams {
  resolution: vec2<f32>,
  _pad: vec2<f32>,
};
@group(0) @binding(0) var<uniform> u_params: SmaaEdgesParams;
@group(0) @binding(1) var u_color_tex: texture_2d<f32>;
@group(0) @binding(2) var u_color_smp: sampler;

fn a3d_color_difference(a: vec4<f32>, b: vec4<f32>) -> f32 {
  let d = abs(a - b);
  return max(max(d.r, d.g), max(d.b, d.a));
}

@fragment
fn fs_smaa_edges(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let center = textureSampleLevel(u_color_tex, u_color_smp, uv, 0.0);
  let dx = vec2<f32>(u_params.resolution.x, 0.0);
  let dy = vec2<f32>(0.0, u_params.resolution.y);
  let left = a3d_color_difference(center, textureSampleLevel(u_color_tex, u_color_smp, uv - dx, 0.0));
  let right = a3d_color_difference(center, textureSampleLevel(u_color_tex, u_color_smp, uv + dx, 0.0));
  let down = a3d_color_difference(center, textureSampleLevel(u_color_tex, u_color_smp, uv - dy, 0.0));
  let up = a3d_color_difference(center, textureSampleLevel(u_color_tex, u_color_smp, uv + dy, 0.0));
  let local_max = max(max(left, right), max(down, up));
  let contrast = vec2<f32>(left, down);
  let strength = smoothstep(vec2<f32>(0.04), vec2<f32>(0.10), contrast)
    * step(vec2<f32>(local_max * 0.35), contrast);
  return vec4<f32>(strength, 0.0, 1.0);
}
`;

export const SMAA_WEIGHTS_WGSL = /* wgsl */ `struct SmaaWeightsParams {
  resolution: vec2<f32>,
  _pad: vec2<f32>,
};
@group(0) @binding(0) var<uniform> u_params: SmaaWeightsParams;
@group(0) @binding(1) var u_edges_tex: texture_2d<f32>;
@group(0) @binding(2) var u_edges_smp: sampler;
@group(0) @binding(3) var u_area_tex: texture_2d<f32>;
@group(0) @binding(4) var u_area_smp: sampler;
@group(0) @binding(5) var u_search_tex: texture_2d<f32>;
@group(0) @binding(6) var u_search_smp: sampler;

const A3D_MAX_EDGE_RUN: i32 = 8;
fn a3d_edge(uv: vec2<f32>, vertical: bool) -> f32 {
  if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0))) { return 0.0; }
  let edge = textureSampleLevel(u_edges_tex, u_edges_smp, uv, 0.0).rg;
  return select(edge.g, edge.r, vertical);
}

fn a3d_edge_weight(uv: vec2<f32>, vertical: bool) -> f32 {
  let strength = a3d_edge(uv, vertical);
  if (strength <= 0.0) { return 0.0; }
  let tangent = select(vec2<f32>(u_params.resolution.x, 0.0),
                       vec2<f32>(0.0, u_params.resolution.y), vertical);
  var negative: i32 = 0;
  var positive: i32 = 0;
  for (var i: i32 = 1; i <= A3D_MAX_EDGE_RUN; i = i + 1) {
    if (a3d_edge(uv - tangent * f32(i), vertical) <= 0.0) { break; }
    negative = i;
  }
  for (var i: i32 = 1; i <= A3D_MAX_EDGE_RUN; i = i + 1) {
    if (a3d_edge(uv + tangent * f32(i), vertical) <= 0.0) { break; }
    positive = i;
  }
  if (negative == A3D_MAX_EDGE_RUN && positive == A3D_MAX_EDGE_RUN) { return 0.0; }
  let index = f32(negative + (A3D_MAX_EDGE_RUN + 1) * positive);
  let area = textureSampleLevel(u_area_tex, u_area_smp, vec2<f32>((index + 0.5) / 81.0, 0.5), 0.0).r;
  let response = textureSampleLevel(u_search_tex, u_search_smp, vec2<f32>((strength * 255.0 + 0.5) / 256.0, 0.5), 0.0).r;
  return 0.25 * area * response;
}

@fragment
fn fs_smaa_weights(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(a3d_edge_weight(uv, true), a3d_edge_weight(uv, false), 0.0, 0.0);
}
`;

export const SMAA_BLEND_WGSL = /* wgsl */ `struct SmaaBlendParams {
  resolution: vec2<f32>,
  _pad: vec2<f32>,
};
@group(0) @binding(0) var<uniform> u_params: SmaaBlendParams;
@group(0) @binding(1) var u_weights_tex: texture_2d<f32>;
@group(0) @binding(2) var u_weights_smp: sampler;
@group(0) @binding(3) var u_color_tex: texture_2d<f32>;
@group(0) @binding(4) var u_color_smp: sampler;

fn a3d_to_linear(c: vec3<f32>) -> vec3<f32> {
  return mix(c / 12.92, pow((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4)),
             step(vec3<f32>(0.04045), c));
}
fn a3d_to_display(input: vec3<f32>) -> vec3<f32> {
  let c = max(input, vec3<f32>(0.0));
  return mix(12.92 * c, 1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055),
             step(vec3<f32>(0.0031308), c));
}

@fragment
fn fs_smaa_blend(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let center = textureSampleLevel(u_color_tex, u_color_smp, uv, 0.0);
  let here = textureSampleLevel(u_weights_tex, u_weights_smp, uv, 0.0).rg;
  let right = textureSampleLevel(u_weights_tex, u_weights_smp, uv + vec2<f32>(u_params.resolution.x, 0.0), 0.0).r;
  let up = textureSampleLevel(u_weights_tex, u_weights_smp, uv + vec2<f32>(0.0, u_params.resolution.y), 0.0).g;
  var weight = here.r;
  var offset = vec2<f32>(-u_params.resolution.x, 0.0);
  if (right > weight) { weight = right; offset = vec2<f32>(u_params.resolution.x, 0.0); }
  if (here.g > weight) { weight = here.g; offset = vec2<f32>(0.0, -u_params.resolution.y); }
  if (up > weight) { weight = up; offset = vec2<f32>(0.0, u_params.resolution.y); }
  if (weight <= 0.0) { return center; }
  let other = textureSampleLevel(u_color_tex, u_color_smp, uv + offset, 0.0);
  let alpha = mix(center.a, other.a, weight);
  if (alpha <= 1e-8) { return vec4<f32>(0.0); }
  let premultiplied = mix(a3d_to_linear(center.rgb) * center.a,
                          a3d_to_linear(other.rgb) * other.a, weight);
  return vec4<f32>(a3d_to_display(premultiplied / alpha), alpha);
}
`;
