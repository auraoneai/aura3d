/**
 * PRD-03 §6.1 S10 / §8.12 Phase 7 — linear-HDR composite WGSL twins.
 * `c = hdr * exposure * autoExposure` + radial chromatic aberration + bloom
 * + linear grade (Bradford white balance → lift/gamma/gain →
 * shadows/midtones/highlights weights). CA_PASS is the transitional
 * standalone §8.12 radial 3-tap.
 */

export const COMPOSITE_WGSL = /* wgsl */ `struct CompositeParams {
  exposure: f32,
  auto_exposure: f32,
  bloom_intensity: f32,
  ca_intensity: f32,
  white_balance: vec3<f32>,  // Bradford-cone LMS gain, resolved per temperature/tint
  has_bloom: i32,
  lift: vec3<f32>,
  _pad0: f32,
  gamma: vec3<f32>,
  _pad1: f32,
  gain: vec3<f32>,
  _pad2: f32,
  shadows: vec3<f32>,
  _pad3: f32,
  midtones: vec3<f32>,
  _pad4: f32,
  highlights: vec3<f32>,
  _pad5: f32,
};

@group(0) @binding(0) var<uniform> u_params: CompositeParams;
@group(0) @binding(1) var u_hdr_tex: texture_2d<f32>;
@group(0) @binding(2) var u_hdr_smp: sampler;
@group(0) @binding(3) var u_bloom_tex: texture_2d<f32>;
@group(0) @binding(4) var u_bloom_smp: sampler;

fn composite_luma(c: vec3<f32>) -> f32 { return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722)); }

@fragment
fn fs_composite(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let centre = uv - vec2<f32>(0.5);
  let dir = centre * dot(centre, centre) * u_params.ca_intensity;
  var c: vec3<f32>;
  if (u_params.ca_intensity != 0.0) {
    c = vec3<f32>(
      textureSampleLevel(u_hdr_tex, u_hdr_smp, uv - dir, 0.0).r,
      textureSampleLevel(u_hdr_tex, u_hdr_smp, uv, 0.0).g,
      textureSampleLevel(u_hdr_tex, u_hdr_smp, uv + dir, 0.0).b);
  } else {
    c = textureSampleLevel(u_hdr_tex, u_hdr_smp, uv, 0.0).rgb;
  }
  c = c * u_params.exposure * u_params.auto_exposure;
  if (u_params.has_bloom != 0) {
    c = c + textureSampleLevel(u_bloom_tex, u_bloom_smp, uv, 0.0).rgb * u_params.bloom_intensity;
  }

  // Linear grade — Bradford CAT already folded into u_whiteBalance on CPU.
  c = c * u_params.white_balance;
  // lift / gamma / gain (ASC-CDL style), per channel.
  let safe_gamma = max(u_params.gamma, vec3<f32>(1e-3));
  c = pow(max(c * u_params.gain + u_params.lift, vec3<f32>(0.0)), vec3<f32>(1.0) / safe_gamma);
  // Shadows/midtones/highlights from the luma pivot at 0.18.
  let s = clamp(log2(max(composite_luma(c), 1e-6) / 0.18) / 8.0 + 0.5, 0.0, 1.0);
  c = c * (u_params.shadows * (1.0 - s) * (1.0 - s)
    + u_params.midtones * 2.0 * s * (1.0 - s)
    + u_params.highlights * s * s);

  return vec4<f32>(c, textureSampleLevel(u_hdr_tex, u_hdr_smp, uv, 0.0).a);
}
`;

export const CA_PASS_WGSL = /* wgsl */ `struct CaPassParams {
  ca_intensity: f32,
  _pad: vec3<f32>,
};

@group(0) @binding(0) var<uniform> u_params: CaPassParams;
@group(0) @binding(1) var u_hdr_tex: texture_2d<f32>;
@group(0) @binding(2) var u_hdr_smp: sampler;

@fragment
fn fs_ca_pass(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let centre = uv - vec2<f32>(0.5);
  let dir = centre * dot(centre, centre) * u_params.ca_intensity;
  if (u_params.ca_intensity != 0.0) {
    return vec4<f32>(
      textureSampleLevel(u_hdr_tex, u_hdr_smp, uv - dir, 0.0).r,
      textureSampleLevel(u_hdr_tex, u_hdr_smp, uv, 0.0).g,
      textureSampleLevel(u_hdr_tex, u_hdr_smp, uv + dir, 0.0).b,
      textureSampleLevel(u_hdr_tex, u_hdr_smp, uv, 0.0).a);
  }
  return textureSampleLevel(u_hdr_tex, u_hdr_smp, uv, 0.0);
}
`;
