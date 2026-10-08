/**
 * PRD-03 §6.7 S10b Phase 7 — display-grade WGSL twins.
 * DISPLAY_GRADE: trilinear 33³ LUT + vignette on display-referred rgba8;
 * alpha carries `luma(disp)` so S11 FXAA reads luminance from `.a`.
 * LUT_BAKE: per-slice grade bake into the TEXTURE_3D.
 */

export const DISPLAY_GRADE_WGSL = /* wgsl */ `struct DisplayGradeParams {
  has_lut: i32,
  vignette_intensity: f32,
  vignette_smoothness: f32,
  vignette_roundness: f32,
  vignette_color: vec3<f32>,
  _pad0: f32,
  resolution: vec2<f32>,
  _pad1: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_params: DisplayGradeParams;
@group(0) @binding(1) var u_source_tex: texture_2d<f32>;
@group(0) @binding(2) var u_source_smp: sampler;
@group(0) @binding(3) var u_lut3d_tex: texture_3d<f32>;
@group(0) @binding(4) var u_lut3d_smp: sampler;

fn display_luma(c: vec3<f32>) -> f32 { return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722)); }

@fragment
fn fs_display_grade(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var disp = textureSampleLevel(u_source_tex, u_source_smp, uv, 0.0).rgb;
  if (u_params.has_lut != 0) {
    disp = textureSampleLevel(u_lut3d_tex, u_lut3d_smp, clamp(disp, vec3<f32>(0.0), vec3<f32>(1.0)), 0.0).rgb;
  }
  if (u_params.vignette_intensity > 0.0) {
    // §8.12: roundness-aspect corrected len, mix toward vignetteColor.
    var p = (uv - vec2<f32>(0.5)) * 2.0;
    p.x = p.x * (u_params.resolution.x / u_params.resolution.y) * u_params.vignette_roundness;
    let len = length(p) * u_params.vignette_intensity;
    disp = disp * mix(vec3<f32>(1.0), u_params.vignette_color, pow(clamp(len, 0.0, 1.0), u_params.vignette_smoothness));
  }
  return vec4<f32>(disp, display_luma(disp));
}
`;

export const LUT_BAKE_WGSL = /* wgsl */ `struct LutBakeParams {
  has_user_lut: i32,
  lut_intensity: f32,
  contrast: f32,
  saturation: f32,
  vibrance: f32,
  slice: f32,              // b texel, [0,1]
  _pad: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_params: LutBakeParams;
@group(0) @binding(1) var u_user_lut_tex: texture_3d<f32>;
@group(0) @binding(2) var u_user_lut_smp: sampler;

fn display_luma(c: vec3<f32>) -> f32 { return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722)); }

@fragment
fn fs_lut_bake(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let disp = vec3<f32>(uv, u_params.slice);
  // Contrast, pivot 0.5 — same shape as the legacy present grade.
  var graded = clamp(disp * u_params.contrast + vec3<f32>(0.5 - 0.5 * u_params.contrast), vec3<f32>(0.0), vec3<f32>(1.0));
  // Vibrance: boost scales with distance from luma, folded into saturation
  // (verbatim from the legacy present grade).
  let l = display_luma(graded);
  let distance_from_luma = min(1.0, abs(graded.r - l) + abs(graded.g - l) + abs(graded.b - l));
  let sat = u_params.saturation + select(u_params.vibrance * (1.0 - distance_from_luma), 0.0, u_params.vibrance == 0.0);
  graded = clamp(vec3<f32>(l) + (graded - vec3<f32>(l)) * sat, vec3<f32>(0.0), vec3<f32>(1.0));
  if (u_params.has_user_lut != 0) {
    graded = mix(graded, textureSampleLevel(u_user_lut_tex, u_user_lut_smp, graded, 0.0).rgb, clamp(u_params.lut_intensity, 0.0, 1.0));
  }
  return vec4<f32>(graded, 1.0);
}
`;
