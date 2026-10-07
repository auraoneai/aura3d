/**
 * PRD-03 §6.5 Phase 7 — FXAA WGSL twins (three r185 FXAAShader, Catlike
 * Coding / Dave Hoskins port — NOT the NVIDIA FXAA 3.11 preset).
 *
 * `FXAA_185_FNS_WGSL` is the shared function set. GLSL's two macro hooks map
 * to consumer-provided WGSL items (each including module must define them):
 *   - `AURA_FXAA_SAMPLE(tex, uv)` → the consumer defines
 *     `fn fxaa_sample(tex: texture_2d<f32>, smp: sampler, uv: vec2<f32>) -> vec4<f32>`
 *   - `AURA_LUMA_ALPHA` → the consumer declares
 *     `override FXAA_LUMA_ALPHA: i32 = 0 | 1`
 * Standalone (`FXAA_185_FRAGMENT_WGSL`) uses `textureSampleLevel` and
 * `FXAA_LUMA_ALPHA = 0`; the §6.1 fused finalize declares 1 (luma rides in
 * `.a`, written by S10b) and injects the display-grade sample.
 */

export const FXAA_185_FNS_WGSL = /* wgsl */ `const EDGE_STEP_COUNT: i32 = 6;
const EDGE_GUESS: f32 = 8.0;
const EDGE_STEPS = array<f32, 6>(1.0, 1.5, 2.0, 2.0, 2.0, 4.0);

const CONTRAST_THRESHOLD: f32 = 0.0312;
const RELATIVE_THRESHOLD: f32 = 0.063;
const SUBPIXEL_BLENDING: f32 = 1.0;

fn fxaa_sample_color(tex: texture_2d<f32>, smp: sampler, uv: vec2<f32>) -> vec4<f32> {
  return fxaa_sample(tex, smp, uv);
}

fn fxaa_sample_luminance(tex: texture_2d<f32>, smp: sampler, uv: vec2<f32>) -> f32 {
  if (FXAA_LUMA_ALPHA == 1) {
    return fxaa_sample(tex, smp, uv).a;
  }
  return dot(fxaa_sample_color(tex, smp, uv).rgb, vec3<f32>(0.3, 0.59, 0.11));
}

fn fxaa_sample_luminance_offset(tex: texture_2d<f32>, smp: sampler, tex_size: vec2<f32>, uv: vec2<f32>, u_offset: f32, v_offset: f32) -> f32 {
  return fxaa_sample_luminance(tex, smp, uv + tex_size * vec2<f32>(u_offset, v_offset));
}

struct LuminanceData {
  m: f32,
  n: f32,
  e: f32,
  s: f32,
  w: f32,
  ne: f32,
  nw: f32,
  se: f32,
  sw: f32,
  highest: f32,
  lowest: f32,
  contrast: f32,
};

fn sample_luminance_neighborhood(tex: texture_2d<f32>, smp: sampler, tex_size: vec2<f32>, uv: vec2<f32>) -> LuminanceData {
  var l: LuminanceData;
  l.m = fxaa_sample_luminance(tex, smp, uv);
  l.n = fxaa_sample_luminance_offset(tex, smp, tex_size, uv, 0.0, 1.0);
  l.e = fxaa_sample_luminance_offset(tex, smp, tex_size, uv, 1.0, 0.0);
  l.s = fxaa_sample_luminance_offset(tex, smp, tex_size, uv, 0.0, -1.0);
  l.w = fxaa_sample_luminance_offset(tex, smp, tex_size, uv, -1.0, 0.0);

  l.ne = fxaa_sample_luminance_offset(tex, smp, tex_size, uv, 1.0, 1.0);
  l.nw = fxaa_sample_luminance_offset(tex, smp, tex_size, uv, -1.0, 1.0);
  l.se = fxaa_sample_luminance_offset(tex, smp, tex_size, uv, 1.0, -1.0);
  l.sw = fxaa_sample_luminance_offset(tex, smp, tex_size, uv, -1.0, -1.0);

  l.highest = max(max(max(max(l.n, l.e), l.s), l.w), l.m);
  l.lowest = min(min(min(min(l.n, l.e), l.s), l.w), l.m);
  l.contrast = l.highest - l.lowest;
  return l;
}

fn should_skip_pixel(l: LuminanceData) -> bool {
  let threshold = max(CONTRAST_THRESHOLD, RELATIVE_THRESHOLD * l.highest);
  return l.contrast < threshold;
}

fn determine_pixel_blend_factor(l: LuminanceData) -> f32 {
  var f = 2.0 * (l.n + l.e + l.s + l.w);
  f = f + l.ne + l.nw + l.se + l.sw;
  f = f * (1.0 / 12.0);
  f = abs(f - l.m);
  f = clamp(f / l.contrast, 0.0, 1.0);

  let blend_factor = smoothstep(0.0, 1.0, f);
  return blend_factor * blend_factor * SUBPIXEL_BLENDING;
}

struct EdgeData {
  is_horizontal: bool,
  pixel_step: f32,
  opposite_luminance: f32,
  gradient: f32,
};

fn determine_edge(tex_size: vec2<f32>, l: LuminanceData) -> EdgeData {
  var e: EdgeData;
  let horizontal =
    abs(l.n + l.s - 2.0 * l.m) * 2.0 +
    abs(l.ne + l.se - 2.0 * l.e) +
    abs(l.nw + l.sw - 2.0 * l.w);
  let vertical =
    abs(l.e + l.w - 2.0 * l.m) * 2.0 +
    abs(l.ne + l.nw - 2.0 * l.n) +
    abs(l.se + l.sw - 2.0 * l.s);
  e.is_horizontal = horizontal >= vertical;

  let p_luminance = select(l.e, l.n, e.is_horizontal);
  let n_luminance = select(l.w, l.s, e.is_horizontal);
  let p_gradient = abs(p_luminance - l.m);
  let n_gradient = abs(n_luminance - l.m);

  e.pixel_step = select(tex_size.x, tex_size.y, e.is_horizontal);

  if (p_gradient < n_gradient) {
    e.pixel_step = -e.pixel_step;
    e.opposite_luminance = n_luminance;
    e.gradient = n_gradient;
  } else {
    e.opposite_luminance = p_luminance;
    e.gradient = p_gradient;
  }

  return e;
}

fn determine_edge_blend_factor(tex: texture_2d<f32>, smp: sampler, tex_size: vec2<f32>, l: LuminanceData, e: EdgeData, uv: vec2<f32>) -> f32 {
  var uv_edge = uv;
  var edge_step: vec2<f32>;
  if (e.is_horizontal) {
    uv_edge.y = uv_edge.y + e.pixel_step * 0.5;
    edge_step = vec2<f32>(tex_size.x, 0.0);
  } else {
    uv_edge.x = uv_edge.x + e.pixel_step * 0.5;
    edge_step = vec2<f32>(0.0, tex_size.y);
  }

  let edge_luminance = (l.m + e.opposite_luminance) * 0.5;
  let gradient_threshold = e.gradient * 0.25;

  var puv = uv_edge + edge_step * EDGE_STEPS[0];
  var p_luminance_delta = fxaa_sample_luminance(tex, smp, puv) - edge_luminance;
  var p_at_end = abs(p_luminance_delta) >= gradient_threshold;

  for (var i = 1; i < EDGE_STEP_COUNT && !p_at_end; i = i + 1) {
    puv = puv + edge_step * EDGE_STEPS[i];
    p_luminance_delta = fxaa_sample_luminance(tex, smp, puv) - edge_luminance;
    p_at_end = abs(p_luminance_delta) >= gradient_threshold;
  }

  if (!p_at_end) {
    puv = puv + edge_step * EDGE_GUESS;
  }

  var nuv = uv_edge - edge_step * EDGE_STEPS[0];
  var n_luminance_delta = fxaa_sample_luminance(tex, smp, nuv) - edge_luminance;
  var n_at_end = abs(n_luminance_delta) >= gradient_threshold;

  for (var i = 1; i < EDGE_STEP_COUNT && !n_at_end; i = i + 1) {
    nuv = nuv - edge_step * EDGE_STEPS[i];
    n_luminance_delta = fxaa_sample_luminance(tex, smp, nuv) - edge_luminance;
    n_at_end = abs(n_luminance_delta) >= gradient_threshold;
  }

  if (!n_at_end) {
    nuv = nuv - edge_step * EDGE_GUESS;
  }

  var p_distance: f32;
  var n_distance: f32;
  if (e.is_horizontal) {
    p_distance = puv.x - uv.x;
    n_distance = uv.x - nuv.x;
  } else {
    p_distance = puv.y - uv.y;
    n_distance = uv.y - nuv.y;
  }

  var shortest_distance: f32;
  var delta_sign: bool;
  if (p_distance <= n_distance) {
    shortest_distance = p_distance;
    delta_sign = p_luminance_delta >= 0.0;
  } else {
    shortest_distance = n_distance;
    delta_sign = n_luminance_delta >= 0.0;
  }

  if (delta_sign == (l.m - edge_luminance >= 0.0)) {
    return 0.0;
  }

  return 0.5 - shortest_distance / (p_distance + n_distance);
}

fn apply_fxaa(tex: texture_2d<f32>, smp: sampler, tex_size: vec2<f32>, uv_in: vec2<f32>) -> vec4<f32> {
  let luminance = sample_luminance_neighborhood(tex, smp, tex_size, uv_in);
  if (should_skip_pixel(luminance)) {
    return fxaa_sample_color(tex, smp, uv_in);
  }

  let pixel_blend = determine_pixel_blend_factor(luminance);
  let edge = determine_edge(tex_size, luminance);
  let edge_blend = determine_edge_blend_factor(tex, smp, tex_size, luminance, edge, uv_in);
  let final_blend = max(pixel_blend, edge_blend);

  var uv = uv_in;
  if (edge.is_horizontal) {
    uv.y = uv.y + edge.pixel_step * final_blend;
  } else {
    uv.x = uv.x + edge.pixel_step * final_blend;
  }

  return fxaa_sample_color(tex, smp, uv);
}
`;

export const FXAA_185_FRAGMENT_WGSL = /* wgsl */ `// FXAA_NO_DITHER — pipeline-overridable: the v2 unfused tail compiles with
// true so S12 finalize's single triangular dither isn't doubled.
override FXAA_NO_DITHER: bool = false;
override FXAA_LUMA_ALPHA: i32 = 0;

struct FxaaParams {
  texel_size: vec2<f32>,   // 1 / source dims (the FXAA tap step)
  output_texel: vec2<f32>, // 1 / output dims (base uv)
};

@group(0) @binding(0) var<uniform> u_params: FxaaParams;
@group(0) @binding(1) var u_source_tex: texture_2d<f32>;
@group(0) @binding(2) var u_source_smp: sampler;

// AURA_FXAA_SAMPLE for the standalone pass: a plain LOD-0 filtered fetch.
fn fxaa_sample(tex: texture_2d<f32>, smp: sampler, uv: vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(tex, smp, uv, 0.0);
}

${FXAA_185_FNS_WGSL}

fn pcg2d(v_in: vec2<u32>) -> vec2<u32> {
  var v = v_in * vec2<u32>(1664525u) + vec2<u32>(1013904223u);
  v.x = v.x + v.y * 1664525u;
  v.y = v.y + v.x * 1664525u;
  v = v ^ (v >> vec2<u32>(16u));
  v.x = v.x + v.y * 1664525u;
  v.y = v.y + v.x * 1664525u;
  v = v ^ (v >> vec2<u32>(16u));
  return v;
}

fn triangular_dither(frag_coord: vec2<f32>, frame: f32) -> f32 {
  let seed = vec2<u32>(frag_coord) + vec2<u32>(u32(frame) * 747796405u);
  let rand = vec2<f32>(pcg2d(seed)) / 4294967296.0;
  return (rand.x + rand.y - 1.0) / 255.0;
}

@fragment
fn fs_fxaa(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = frag_coord.xy * u_params.output_texel;
  let color = apply_fxaa(u_source_tex, u_source_smp, u_params.texel_size, uv);
  // S12: the triangular-PDF dither belongs to the last write to the 8-bit
  // output — on the legacy present this program IS the last write; on the v2
  // unfused tail S12-finalize follows, so it compiles with FXAA_NO_DITHER.
  var rgb = color.rgb;
  if (!FXAA_NO_DITHER) {
    rgb = rgb + vec3<f32>(triangular_dither(frag_coord.xy, 0.0));
  }
  return vec4<f32>(rgb, color.a);
}
`;
