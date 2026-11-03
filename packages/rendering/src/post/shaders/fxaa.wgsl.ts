/**
 * WGSL counterpart of Aura3D's contrast-adaptive spatial antialiasing.
 * Consumers provide `fxaa_sample` and the `FXAA_LUMA_ALPHA` override, allowing
 * the same filter to operate on straight-alpha colour or fused grade+luma.
 * Export names remain stable for existing post-chain callers.
 */

import { POST_COMMON_WGSL } from "./common.wgsl.js";

export const FXAA_185_FNS_WGSL = /* wgsl */ `
fn aura_fxaa_luma(color: vec4<f32>) -> f32 {
  if (FXAA_LUMA_ALPHA == 1) { return color.a; }
  return dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn aura_fxaa_fetch(tex: texture_2d<f32>, smp: sampler, uv: vec2<f32>, texel: vec2<f32>) -> vec4<f32> {
  let half_texel = texel * 0.5;
  return fxaa_sample(tex, smp, clamp(uv, half_texel, vec2<f32>(1.0) - half_texel));
}

fn apply_fxaa(tex: texture_2d<f32>, smp: sampler, texel: vec2<f32>, uv: vec2<f32>) -> vec4<f32> {
  let center = aura_fxaa_fetch(tex, smp, uv, texel);
  let west = aura_fxaa_fetch(tex, smp, uv - vec2<f32>(texel.x, 0.0), texel);
  let east = aura_fxaa_fetch(tex, smp, uv + vec2<f32>(texel.x, 0.0), texel);
  let south = aura_fxaa_fetch(tex, smp, uv - vec2<f32>(0.0, texel.y), texel);
  let north = aura_fxaa_fetch(tex, smp, uv + vec2<f32>(0.0, texel.y), texel);
  let lc = aura_fxaa_luma(center);
  let lw = aura_fxaa_luma(west); let le = aura_fxaa_luma(east);
  let ls = aura_fxaa_luma(south); let ln = aura_fxaa_luma(north);
  let lo = min(lc, min(min(lw, le), min(ls, ln)));
  let hi = max(lc, max(max(lw, le), max(ls, ln)));
  let range = hi - lo;
  if (range <= max(0.0312, hi * 0.063)) { return center; }

  let gx = abs(le - lw) + abs(le + lw - 2.0 * lc);
  let gy = abs(ln - ls) + abs(ln + ls - 2.0 * lc);
  let a = select(south, west, gx >= gy);
  let b = select(north, east, gx >= gy);
  let pair_luma = 0.5 * (aura_fxaa_luma(a) + aura_fxaa_luma(b));
  let amount = 0.5 * clamp(abs(pair_luma - lc) / max(range, 1e-6), 0.0, 1.0);
  if (FXAA_LUMA_ALPHA == 1) { return mix(center, 0.5 * (a + b), amount); }
  let alpha = mix(center.a, 0.5 * (a.a + b.a), amount);
  let premul = mix(center.rgb * center.a, 0.5 * (a.rgb * a.a + b.rgb * b.a), amount);
  if (alpha <= 1e-6) { return vec4<f32>(0.0, 0.0, 0.0, alpha); }
  return vec4<f32>(premul / alpha, alpha);
}
`;

/** Native device's intermediate-pass binding order; no output dither is applied. */
export const FXAA_NATIVE_INTERMEDIATE_WGSL = /* wgsl */ `override FXAA_LUMA_ALPHA: i32 = 0;

struct NativeFxaaParams {
  texel_size: vec2<f32>,
  _pad: vec2<f32>,
};
@group(0) @binding(0) var<uniform> u_params: NativeFxaaParams;
@group(0) @binding(1) var u_source_smp: sampler;
@group(0) @binding(2) var u_source_tex: texture_2d<f32>;

fn fxaa_sample(tex: texture_2d<f32>, smp: sampler, uv: vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(tex, smp, uv, 0.0);
}

${FXAA_185_FNS_WGSL}

@fragment
fn fs_fxaa(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return apply_fxaa(u_source_tex, u_source_smp, u_params.texel_size, uv);
}
`;

export const FXAA_185_FRAGMENT_WGSL = /* wgsl */ `override FXAA_NO_DITHER: bool = false;
override FXAA_LUMA_ALPHA: i32 = 0;

struct FxaaParams {
  texel_size: vec2<f32>,
  output_texel: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_params: FxaaParams;
@group(0) @binding(1) var u_source_tex: texture_2d<f32>;
@group(0) @binding(2) var u_source_smp: sampler;

fn fxaa_sample(tex: texture_2d<f32>, smp: sampler, uv: vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(tex, smp, uv, 0.0);
}

${FXAA_185_FNS_WGSL}

${POST_COMMON_WGSL}

@fragment
fn fs_fxaa(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = frag_coord.xy * u_params.output_texel;
  let color = apply_fxaa(u_source_tex, u_source_smp, u_params.texel_size, uv);
  var rgb = color.rgb;
  if (!FXAA_NO_DITHER) { rgb = rgb + vec3<f32>(triangular_dither(frag_coord.xy, 0.0)); }
  return vec4<f32>(rgb, color.a);
}
`;
