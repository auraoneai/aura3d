/**
 * PRD-03 §8.14 Phase 7 — SMAA 1x WGSL twins (three passes, verbatim port of
 * the GLSL twins, themselves three r185 `SMAAShader.js` — MIT; WebGL port of
 * SMAA v2.8 by the three.js authors, algorithm by Jorge Jimenez et al.).
 *
 * three's vertex-computed `vOffset`/`vPixcoord` varyings are pure functions
 * of uv + texel size — computed fragment-side, identical math.
 * `SMAASampleLevelZeroOffset` = `textureLevel(tex, uv + offset·texel, 0)`.
 * `u_resolution` is the texel size `vec2(1/w, 1/h)` (same value as the GL
 * twin's `u_resolution`; three names it `resolution`).
 * AreaTex/SearchTex arrive from the `post/smaa/` lazy chunk — areaTex needs
 * a linear sampler, searchTex point (declared as separate samplers).
 */

/** Pass 1 — `SMAAColorEdgeDetectionPS` (colour edges, threshold 0.1). */
export const SMAA_EDGES_WGSL = /* wgsl */ `const SMAA_THRESHOLD: f32 = 0.1;

struct SmaaEdgesParams {
  resolution: vec2<f32>,   // texel size 1/w, 1/h
  _pad: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_params: SmaaEdgesParams;
@group(0) @binding(1) var u_color_tex: texture_2d<f32>;
@group(0) @binding(2) var u_color_smp: sampler;

fn smaa_color_edge_detection(texcoord: vec2<f32>, offset: array<vec4<f32>, 3>, color_tex: texture_2d<f32>, color_smp: sampler) -> vec4<f32> {
  let threshold = vec2<f32>(SMAA_THRESHOLD, SMAA_THRESHOLD);

  // Calculate color deltas:
  var delta: vec4<f32>;
  let c = textureSampleLevel(color_tex, color_smp, texcoord, 0.0).rgb;

  let c_left = textureSampleLevel(color_tex, color_smp, offset[0].xy, 0.0).rgb;
  var t = abs(c - c_left);
  delta.x = max(max(t.r, t.g), t.b);

  let c_top = textureSampleLevel(color_tex, color_smp, offset[0].zw, 0.0).rgb;
  t = abs(c - c_top);
  delta.y = max(max(t.r, t.g), t.b);

  // We do the usual threshold:
  var edges = step(threshold, delta.xy);

  // Then discard if there is no edge:
  if (dot(edges, vec2<f32>(1.0, 1.0)) == 0.0) {
    discard;
  }

  // Calculate right and bottom deltas:
  let c_right = textureSampleLevel(color_tex, color_smp, offset[1].xy, 0.0).rgb;
  t = abs(c - c_right);
  delta.z = max(max(t.r, t.g), t.b);

  let c_bottom = textureSampleLevel(color_tex, color_smp, offset[1].zw, 0.0).rgb;
  t = abs(c - c_bottom);
  delta.w = max(max(t.r, t.g), t.b);

  // Calculate the maximum delta in the direct neighborhood:
  var max_delta = max(max(max(delta.x, delta.y), delta.z), delta.w);

  // Calculate left-left and top-top deltas:
  let c_left_left = textureSampleLevel(color_tex, color_smp, offset[2].xy, 0.0).rgb;
  t = abs(c - c_left_left);
  delta.z = max(max(t.r, t.g), t.b);

  let c_top_top = textureSampleLevel(color_tex, color_smp, offset[2].zw, 0.0).rgb;
  t = abs(c - c_top_top);
  delta.w = max(max(t.r, t.g), t.b);

  // Calculate the final maximum delta:
  max_delta = max(max(max_delta, delta.z), delta.w);

  // Local contrast adaptation in action:
  edges = edges * step(vec2<f32>(0.5 * max_delta), delta.xy);

  return vec4<f32>(edges, 0.0, 0.0);
}

@fragment
fn fs_smaa_edges(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  // three's SMAAEdgeDetectionVS offsets, computed fragment-side (identical
  // values — the offsets are a pure function of texcoord + resolution).
  let v_offset0 = uv.xyxy + u_params.resolution.xyxy * vec4<f32>(-1.0, 0.0, 0.0, 1.0);
  let v_offset1 = uv.xyxy + u_params.resolution.xyxy * vec4<f32>(1.0, 0.0, 0.0, -1.0);
  let v_offset2 = uv.xyxy + u_params.resolution.xyxy * vec4<f32>(-2.0, 0.0, 0.0, 2.0);
  let v_offset = array<vec4<f32>, 3>(v_offset0, v_offset1, v_offset2);
  return smaa_color_edge_detection(uv, v_offset, u_color_tex, u_color_smp);
}
`;

/** Pass 2 — `SMAABlendingWeightCalculationPS` (max search 8, no diagonal). */
export const SMAA_WEIGHTS_WGSL = /* wgsl */ `const SMAA_MAX_SEARCH_STEPS: i32 = 8;
const SMAA_AREATEX_MAX_DISTANCE: f32 = 16.0;
const SMAA_AREATEX_PIXEL_SIZE: vec2<f32> = vec2<f32>(1.0 / 160.0, 1.0 / 560.0);
const SMAA_AREATEX_SUBTEX_SIZE: f32 = 1.0 / 7.0;

struct SmaaWeightsParams {
  resolution: vec2<f32>,   // texel size 1/w, 1/h
  _pad: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_params: SmaaWeightsParams;
@group(0) @binding(1) var u_edges_tex: texture_2d<f32>;   // the pass-1 edges surface (three tDiffuse)
@group(0) @binding(2) var u_edges_smp: sampler;
@group(0) @binding(3) var u_area_tex: texture_2d<f32>;
@group(0) @binding(4) var u_area_smp: sampler;            // linear
@group(0) @binding(5) var u_search_tex: texture_2d<f32>;
@group(0) @binding(6) var u_search_smp: sampler;          // point/nearest

fn smaa_sample_level_zero_offset(tex: texture_2d<f32>, smp: sampler, coord: vec2<f32>, offset: vec2<i32>) -> vec4<f32> {
  return textureSampleLevel(tex, smp, coord + vec2<f32>(offset) * u_params.resolution, 0.0);
}

fn smaa_search_length(search_tex: texture_2d<f32>, search_smp: sampler, e: vec2<f32>, bias: f32, scale: f32) -> f32 {
  // Not required if searchTex accesses are set to point:
  // float2 SEARCH_TEX_PIXEL_SIZE = 1.0 / float2(66.0, 33.0);
  // e = float2(bias, 0.0) + 0.5 * SEARCH_TEX_PIXEL_SIZE +
  //     e * float2(scale, 1.0) * float2(64.0, 32.0) * SEARCH_TEX_PIXEL_SIZE;
  var e2 = e;
  e2.r = bias + e.r * scale;
  return 255.0 * textureSampleLevel(search_tex, search_smp, e2, 0.0).r;
}

fn smaa_search_x_left(edges_tex: texture_2d<f32>, edges_smp: sampler, search_tex: texture_2d<f32>, search_smp: sampler, texcoord_in: vec2<f32>, end_coord: f32) -> f32 {
  /**
   * @PSEUDO_GATHER4
   * This texcoord has been offset by (-0.25, -0.125) in the vertex shader to
   * sample between edge, thus fetching four edges in a row.
   * Sampling with different offsets in each direction allows to disambiguate
   * which edges are active from the four fetched ones.
   */
  var e = vec2<f32>(0.0, 1.0);
  var texcoord = texcoord_in;

  for (var i = 0; i < SMAA_MAX_SEARCH_STEPS; i = i + 1) { // WebGL port note: Changed while to for
    e = textureSampleLevel(edges_tex, edges_smp, texcoord, 0.0).rg;
    texcoord = texcoord - vec2<f32>(2.0, 0.0) * u_params.resolution;
    if (!(texcoord.x > end_coord && e.g > 0.8281 && e.r == 0.0)) { break; }
  }

  // We correct the previous (-0.25, -0.125) offset we applied:
  texcoord.x = texcoord.x + 0.25 * u_params.resolution.x;

  // The searches are bias by 1, so adjust the coords accordingly:
  texcoord.x = texcoord.x + u_params.resolution.x;

  // Disambiguate the length added by the last step:
  texcoord.x = texcoord.x + 2.0 * u_params.resolution.x; // Undo last step
  texcoord.x = texcoord.x - u_params.resolution.x * smaa_search_length(search_tex, search_smp, e, 0.0, 0.5);

  return texcoord.x;
}

fn smaa_search_x_right(edges_tex: texture_2d<f32>, edges_smp: sampler, search_tex: texture_2d<f32>, search_smp: sampler, texcoord_in: vec2<f32>, end_coord: f32) -> f32 {
  var e = vec2<f32>(0.0, 1.0);
  var texcoord = texcoord_in;

  for (var i = 0; i < SMAA_MAX_SEARCH_STEPS; i = i + 1) {
    e = textureSampleLevel(edges_tex, edges_smp, texcoord, 0.0).rg;
    texcoord = texcoord + vec2<f32>(2.0, 0.0) * u_params.resolution;
    if (!(texcoord.x < end_coord && e.g > 0.8281 && e.r == 0.0)) { break; }
  }

  texcoord.x = texcoord.x - 0.25 * u_params.resolution.x;
  texcoord.x = texcoord.x - u_params.resolution.x;
  texcoord.x = texcoord.x - 2.0 * u_params.resolution.x;
  texcoord.x = texcoord.x + u_params.resolution.x * smaa_search_length(search_tex, search_smp, e, 0.5, 0.5);

  return texcoord.x;
}

fn smaa_search_y_up(edges_tex: texture_2d<f32>, edges_smp: sampler, search_tex: texture_2d<f32>, search_smp: sampler, texcoord_in: vec2<f32>, end_coord: f32) -> f32 {
  var e = vec2<f32>(1.0, 0.0);
  var texcoord = texcoord_in;

  for (var i = 0; i < SMAA_MAX_SEARCH_STEPS; i = i + 1) {
    e = textureSampleLevel(edges_tex, edges_smp, texcoord, 0.0).rg;
    texcoord = texcoord + vec2<f32>(0.0, 2.0) * u_params.resolution; // WebGL port note: Changed sign
    if (!(texcoord.y > end_coord && e.r > 0.8281 && e.g == 0.0)) { break; }
  }

  texcoord.y = texcoord.y - 0.25 * u_params.resolution.y; // WebGL port note: Changed sign
  texcoord.y = texcoord.y - u_params.resolution.y; // WebGL port note: Changed sign
  texcoord.y = texcoord.y - 2.0 * u_params.resolution.y; // WebGL port note: Changed sign
  texcoord.y = texcoord.y + u_params.resolution.y * smaa_search_length(search_tex, search_smp, vec2<f32>(e.g, e.r), 0.0, 0.5); // WebGL port note: Changed sign

  return texcoord.y;
}

fn smaa_search_y_down(edges_tex: texture_2d<f32>, edges_smp: sampler, search_tex: texture_2d<f32>, search_smp: sampler, texcoord_in: vec2<f32>, end_coord: f32) -> f32 {
  var e = vec2<f32>(1.0, 0.0);
  var texcoord = texcoord_in;

  for (var i = 0; i < SMAA_MAX_SEARCH_STEPS; i = i + 1) {
    e = textureSampleLevel(edges_tex, edges_smp, texcoord, 0.0).rg;
    texcoord = texcoord - vec2<f32>(0.0, 2.0) * u_params.resolution; // WebGL port note: Changed sign
    if (!(texcoord.y < end_coord && e.r > 0.8281 && e.g == 0.0)) { break; }
  }

  texcoord.y = texcoord.y + 0.25 * u_params.resolution.y; // WebGL port note: Changed sign
  texcoord.y = texcoord.y + u_params.resolution.y; // WebGL port note: Changed sign
  texcoord.y = texcoord.y + 2.0 * u_params.resolution.y; // WebGL port note: Changed sign
  texcoord.y = texcoord.y - u_params.resolution.y * smaa_search_length(search_tex, search_smp, vec2<f32>(e.g, e.r), 0.5, 0.5); // WebGL port note: Changed sign

  return texcoord.y;
}

fn smaa_area(area_tex: texture_2d<f32>, area_smp: sampler, dist: vec2<f32>, e1: f32, e2: f32, offset: f32) -> vec2<f32> {
  // Rounding prevents precision errors of bilinear filtering:
  var texcoord = SMAA_AREATEX_MAX_DISTANCE * round(4.0 * vec2<f32>(e1, e2)) + dist;

  // We do a scale and bias for mapping to texel space:
  texcoord = SMAA_AREATEX_PIXEL_SIZE * texcoord + (0.5 * SMAA_AREATEX_PIXEL_SIZE);

  // Move to proper place, according to the subpixel offset:
  texcoord.y = texcoord.y + SMAA_AREATEX_SUBTEX_SIZE * offset;

  return textureSampleLevel(area_tex, area_smp, texcoord, 0.0).rg;
}

fn smaa_blending_weight_calculation(texcoord: vec2<f32>, pixcoord: vec2<f32>, offset: array<vec4<f32>, 3>, edges_tex: texture_2d<f32>, edges_smp: sampler, area_tex: texture_2d<f32>, area_smp: sampler, search_tex: texture_2d<f32>, search_smp: sampler, subsample_indices: vec4<i32>) -> vec4<f32> {
  var weights = vec4<f32>(0.0, 0.0, 0.0, 0.0);

  let e = textureSampleLevel(edges_tex, edges_smp, texcoord, 0.0).rg;

  if (e.g > 0.0) { // Edge at north
    var d: vec2<f32>;

    // Find the distance to the left:
    var coords: vec2<f32>;
    coords.x = smaa_search_x_left(edges_tex, edges_smp, search_tex, search_smp, offset[0].xy, offset[2].x);
    coords.y = offset[1].y; // offset[1].y = texcoord.y - 0.25 * resolution.y (@CROSSING_OFFSET)
    d.x = coords.x;

    // Now fetch the left crossing edges, two at a time using bilinear
    // filtering. Sampling at -0.25 (see @CROSSING_OFFSET) enables to
    // discern what value each edge has:
    let e1 = textureSampleLevel(edges_tex, edges_smp, coords, 0.0).r;

    // Find the distance to the right:
    coords.x = smaa_search_x_right(edges_tex, edges_smp, search_tex, search_smp, offset[0].zw, offset[2].y);
    d.y = coords.x;

    // We want the distances to be in pixel units (doing this here allow to
    // better interleave arithmetic and memory accesses):
    d = d / u_params.resolution.x - vec2<f32>(pixcoord.x);

    // smaa_area below needs a sqrt, as the areas texture is compressed
    // quadratically:
    let sqrt_d = sqrt(abs(d));

    // Fetch the right crossing edges:
    coords.y = coords.y - 1.0 * u_params.resolution.y; // WebGL port note: Added
    let e2 = smaa_sample_level_zero_offset(edges_tex, edges_smp, coords, vec2<i32>(1, 0)).r;

    // Ok, we know how this pattern looks like, now it is time for getting
    // the actual area:
    let area = smaa_area(area_tex, area_smp, sqrt_d, e1, e2, f32(subsample_indices.y));
    weights.x = area.x;
    weights.y = area.y;
  }

  if (e.r > 0.0) { // Edge at west
    var d: vec2<f32>;

    // Find the distance to the top:
    var coords: vec2<f32>;

    coords.y = smaa_search_y_up(edges_tex, edges_smp, search_tex, search_smp, offset[1].xy, offset[2].z);
    coords.x = offset[0].x; // offset[1].x = texcoord.x - 0.25 * resolution.x;
    d.x = coords.y;

    // Fetch the top crossing edges:
    let e1 = textureSampleLevel(edges_tex, edges_smp, coords, 0.0).g;

    // Find the distance to the bottom:
    coords.y = smaa_search_y_down(edges_tex, edges_smp, search_tex, search_smp, offset[1].zw, offset[2].w);
    d.y = coords.y;

    // We want the distances to be in pixel units:
    d = d / u_params.resolution.y - vec2<f32>(pixcoord.y);

    // smaa_area below needs a sqrt, as the areas texture is compressed
    // quadratically:
    let sqrt_d = sqrt(abs(d));

    // Fetch the bottom crossing edges:
    coords.y = coords.y - 1.0 * u_params.resolution.y; // WebGL port note: Added
    let e2 = smaa_sample_level_zero_offset(edges_tex, edges_smp, coords, vec2<i32>(0, 1)).g;

    // Get the area for this direction:
    let area = smaa_area(area_tex, area_smp, sqrt_d, e1, e2, f32(subsample_indices.x));
    weights.z = area.x;
    weights.w = area.y;
  }

  return weights;
}

@fragment
fn fs_smaa_weights(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  // three's SMAABlendingWeightCalculationVS varyings, computed fragment-side.
  let v_pixcoord = uv / u_params.resolution;
  let v_offset0 = uv.xyxy + u_params.resolution.xyxy * vec4<f32>(-0.25, 0.125, 1.25, 0.125);
  let v_offset1 = uv.xyxy + u_params.resolution.xyxy * vec4<f32>(-0.125, 0.25, -0.125, -1.25);
  let v_offset2 = vec4<f32>(v_offset0.xz, v_offset1.yw) + vec4<f32>(-2.0, 2.0, -2.0, 2.0) * u_params.resolution.xxyy * f32(SMAA_MAX_SEARCH_STEPS);
  let v_offset = array<vec4<f32>, 3>(v_offset0, v_offset1, v_offset2);
  return smaa_blending_weight_calculation(uv, v_pixcoord, v_offset, u_edges_tex, u_edges_smp, u_area_tex, u_area_smp, u_search_tex, u_search_smp, vec4<i32>(0));
}
`;

/** Pass 3 — `SMAANeighborhoodBlendingPS` (`u_weights` = three `tDiffuse`, `u_color` = three `tColor`). */
export const SMAA_BLEND_WGSL = /* wgsl */ `struct SmaaBlendParams {
  resolution: vec2<f32>,   // texel size 1/w, 1/h
  _pad: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_params: SmaaBlendParams;
@group(0) @binding(1) var u_weights_tex: texture_2d<f32>;  // three tDiffuse — the blend-weights surface
@group(0) @binding(2) var u_weights_smp: sampler;
@group(0) @binding(3) var u_color_tex: texture_2d<f32>;    // three tColor — the colour surface
@group(0) @binding(4) var u_color_smp: sampler;

fn smaa_neighborhood_blending(texcoord_in: vec2<f32>, offset: array<vec4<f32>, 2>, color_tex: texture_2d<f32>, color_smp: sampler, blend_tex: texture_2d<f32>, blend_smp: sampler) -> vec4<f32> {
  // Fetch the blending weights for current pixel:
  var a: vec4<f32>;
  let axz = textureSampleLevel(blend_tex, blend_smp, texcoord_in, 0.0).xz;
  a.x = axz.x;
  a.z = axz.y;
  a.y = textureSampleLevel(blend_tex, blend_smp, offset[1].zw, 0.0).g;
  a.w = textureSampleLevel(blend_tex, blend_smp, offset[1].xy, 0.0).a;

  // Is there any blending weight with a value greater than 0.0?
  if (dot(a, vec4<f32>(1.0, 1.0, 1.0, 1.0)) < 1e-5) {
    return textureSampleLevel(color_tex, color_smp, texcoord_in, 0.0);
  } else {
    // Up to 4 lines can be crossing a pixel (one through each edge). We
    // favor blending by choosing the line with the maximum weight for each
    // direction:
    var offset: vec2<f32>;
    offset.x = select(-a.b, a.a, a.a > a.b); // left vs. right
    offset.y = select(a.r, -a.g, a.g > a.r); // top vs. bottom // WebGL port note: Changed signs

    // Then we go in the direction that has the maximum weight:
    if (abs(offset.x) > abs(offset.y)) { // horizontal vs. vertical
      offset.y = 0.0;
    } else {
      offset.x = 0.0;
    }

    // Fetch the opposite color and lerp by hand:
    var texcoord = texcoord_in;
    var c = textureSampleLevel(color_tex, color_smp, texcoord, 0.0);
    texcoord = texcoord + sign(offset) * u_params.resolution;
    let c_op = textureSampleLevel(color_tex, color_smp, texcoord, 0.0);
    let s = select(abs(offset.y), abs(offset.x), abs(offset.x) > abs(offset.y));

    // WebGL port note: Added gamma correction
    c = vec4<f32>(pow(c.xyz, vec3<f32>(2.2)), c.w);
    let c_op_gamma = pow(c_op.xyz, vec3<f32>(2.2));
    var mixed = mix(c, vec4<f32>(c_op_gamma, c_op.w), s);
    mixed = vec4<f32>(pow(mixed.xyz, vec3<f32>(1.0 / 2.2)), mixed.w);

    return mixed;
  }
}

@fragment
fn fs_smaa_blend(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  // three's SMAANeighborhoodBlendingVS varyings, computed fragment-side.
  let v_offset0 = uv.xyxy + u_params.resolution.xyxy * vec4<f32>(-1.0, 0.0, 0.0, 1.0);
  let v_offset1 = uv.xyxy + u_params.resolution.xyxy * vec4<f32>(1.0, 0.0, 0.0, -1.0);
  let v_offset = array<vec4<f32>, 2>(v_offset0, v_offset1);
  return smaa_neighborhood_blending(uv, v_offset, u_color_tex, u_color_smp, u_weights_tex, u_weights_smp);
}
`;
