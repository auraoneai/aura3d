/**
 * PRD-03 §6.6 / §8.10 Phase 7 — v2 bloom WGSL twins (linear HDR, additive
 * pyramid): Karis-averaged 13-tap prefilter with soft-knee threshold,
 * 13-tap downsample, progressive 9-tap tent upsample. Same math as the
 * GLSL twins; §6.6 `bloomNormalization` stays in the composite.
 */

const BLOOM_FNS = /* wgsl */ `
fn bloom_luma(c: vec3<f32>) -> f32 { return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722)); }
`;

export const BLOOM_PREFILTER_WGSL = /* wgsl */ `struct BloomPrefilterParams {
  texel_size: vec2<f32>,
  threshold: f32,
  knee: f32,               // kneeRatio * threshold
  tint: vec3<f32>,
  clamp_luminance: f32,
};

@group(0) @binding(0) var<uniform> u_params: BloomPrefilterParams;
@group(0) @binding(1) var u_hdr_tex: texture_2d<f32>;
@group(0) @binding(2) var u_hdr_smp: sampler;

${BLOOM_FNS}

// One 2x2 box sample averaged at bilinear footprint centre.
fn bloom_box4(uv: vec2<f32>, half_texel: vec2<f32>) -> vec3<f32> {
  var s = textureSampleLevel(u_hdr_tex, u_hdr_smp, uv + vec2<f32>(-half_texel.x, -half_texel.y), 0.0).rgb;
  s = s + textureSampleLevel(u_hdr_tex, u_hdr_smp, uv + vec2<f32>(half_texel.x, -half_texel.y), 0.0).rgb;
  s = s + textureSampleLevel(u_hdr_tex, u_hdr_smp, uv + vec2<f32>(-half_texel.x, half_texel.y), 0.0).rgb;
  s = s + textureSampleLevel(u_hdr_tex, u_hdr_smp, uv + vec2<f32>(half_texel.x, half_texel.y), 0.0).rgb;
  return s * 0.25;
}

@fragment
fn fs_bloom_prefilter(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  // Jimenez 2014 13-tap as five overlapping boxes; Karis weight per box.
  let half_texel = u_params.texel_size * 0.5;
  let centre = bloom_box4(uv, half_texel);
  var c = centre * (0.5 / (1.0 + bloom_luma(centre)));
  let corner = u_params.texel_size + half_texel;
  var b = bloom_box4(uv + vec2<f32>(-corner.x, -corner.y) * 0.5, half_texel);
  c = c + b * (0.125 / (1.0 + bloom_luma(b)));
  b = bloom_box4(uv + vec2<f32>(corner.x, -corner.y) * 0.5, half_texel);
  c = c + b * (0.125 / (1.0 + bloom_luma(b)));
  b = bloom_box4(uv + vec2<f32>(-corner.x, corner.y) * 0.5, half_texel);
  c = c + b * (0.125 / (1.0 + bloom_luma(b)));
  b = bloom_box4(uv + vec2<f32>(corner.x, corner.y) * 0.5, half_texel);
  c = c + b * (0.125 / (1.0 + bloom_luma(b)));

  c = min(c, vec3<f32>(u_params.clamp_luminance));           // firefly clamp
  let br = max(c.r, max(c.g, c.b));                           // max channel (Unity/UE)
  let knee = u_params.threshold * u_params.knee;
  var soft = clamp(br - u_params.threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-5);
  let w = max(soft, br - u_params.threshold) / max(br, 1e-5);
  return vec4<f32>(c * w * u_params.tint, 1.0);
}
`;

export const BLOOM_DOWNSAMPLE_WGSL = /* wgsl */ `struct BloomDownsampleParams {
  texel_size: vec2<f32>,
  _pad: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_params: BloomDownsampleParams;
@group(0) @binding(1) var u_src_tex: texture_2d<f32>;
@group(0) @binding(2) var u_src_smp: sampler;

fn bloom_box4(uv: vec2<f32>, half_texel: vec2<f32>) -> vec3<f32> {
  var s = textureSampleLevel(u_src_tex, u_src_smp, uv + vec2<f32>(-half_texel.x, -half_texel.y), 0.0).rgb;
  s = s + textureSampleLevel(u_src_tex, u_src_smp, uv + vec2<f32>(half_texel.x, -half_texel.y), 0.0).rgb;
  s = s + textureSampleLevel(u_src_tex, u_src_smp, uv + vec2<f32>(-half_texel.x, half_texel.y), 0.0).rgb;
  s = s + textureSampleLevel(u_src_tex, u_src_smp, uv + vec2<f32>(half_texel.x, half_texel.y), 0.0).rgb;
  return s * 0.25;
}

@fragment
fn fs_bloom_downsample(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let half_texel = u_params.texel_size * 0.5;
  var c = bloom_box4(uv, half_texel) * 0.5;
  let corner = u_params.texel_size + half_texel;
  c = c + bloom_box4(uv + vec2<f32>(-corner.x, -corner.y) * 0.5, half_texel) * 0.125;
  c = c + bloom_box4(uv + vec2<f32>(corner.x, -corner.y) * 0.5, half_texel) * 0.125;
  c = c + bloom_box4(uv + vec2<f32>(-corner.x, corner.y) * 0.5, half_texel) * 0.125;
  c = c + bloom_box4(uv + vec2<f32>(corner.x, corner.y) * 0.5, half_texel) * 0.125;
  return vec4<f32>(c, 1.0);
}
`;

export const BLOOM_UPSAMPLE_WGSL = /* wgsl */ `struct BloomUpsampleParams {
  lower_texel: vec2<f32>,
  scatter: f32,            // radiusTexels
  _pad: f32,
};

@group(0) @binding(0) var<uniform> u_params: BloomUpsampleParams;
@group(0) @binding(1) var u_lower_tex: texture_2d<f32>;   // up_{i+1}
@group(0) @binding(2) var u_lower_smp: sampler;
@group(0) @binding(3) var u_current_tex: texture_2d<f32>; // down_i
@group(0) @binding(4) var u_current_smp: sampler;

// 9-tap tent (3x3 tent kernel, weights 1-2-1 separable).
fn tent9(tex: texture_2d<f32>, smp: sampler, uv: vec2<f32>, radius_texels: vec2<f32>) -> vec3<f32> {
  let r = radius_texels;
  var s = textureSampleLevel(tex, smp, uv + vec2<f32>(-r.x, -r.y), 0.0).rgb * 1.0;
  s = s + textureSampleLevel(tex, smp, uv + vec2<f32>(0.0, -r.y), 0.0).rgb * 2.0;
  s = s + textureSampleLevel(tex, smp, uv + vec2<f32>(r.x, -r.y), 0.0).rgb * 1.0;
  s = s + textureSampleLevel(tex, smp, uv + vec2<f32>(-r.x, 0.0), 0.0).rgb * 2.0;
  s = s + textureSampleLevel(tex, smp, uv, 0.0).rgb * 4.0;
  s = s + textureSampleLevel(tex, smp, uv + vec2<f32>(r.x, 0.0), 0.0).rgb * 2.0;
  s = s + textureSampleLevel(tex, smp, uv + vec2<f32>(-r.x, r.y), 0.0).rgb * 1.0;
  s = s + textureSampleLevel(tex, smp, uv + vec2<f32>(0.0, r.y), 0.0).rgb * 2.0;
  s = s + textureSampleLevel(tex, smp, uv + vec2<f32>(r.x, r.y), 0.0).rgb * 1.0;
  return s / 16.0;
}

@fragment
fn fs_bloom_upsample(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  // up_i = down_i + tent(up_{i+1})
  return vec4<f32>(textureSampleLevel(u_current_tex, u_current_smp, uv, 0.0).rgb
    + tent9(u_lower_tex, u_lower_smp, uv, u_params.lower_texel * u_params.scatter), 1.0);
}
`;
