/**
 * PRD-03 §6.7 S10b — the display-grade fetch, fused into S11/S12.
 *
 * Runs after the OutputPass boundary on display-referred RGBA8: one
 * trilinear `texture(u_lut3d, disp)` fetch applies contrast / saturation /
 * vibrance / the user `.cube`, then vignette (roundness-aspect corrected).
 * Output alpha carries `luma(disp)` so the S11 FXAA pass reads luminance
 * from `.a` instead of recomputing it per tap.
 */

export const DISPLAY_GRADE_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform sampler3D u_lut3d;
uniform int u_hasLut;
uniform float u_vignetteIntensity;
uniform float u_vignetteSmoothness;
uniform float u_vignetteRoundness;
uniform vec3 u_vignetteColor;
uniform vec2 u_resolution;
in vec2 v_uv;
out vec4 outColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec3 disp = texture(u_source, v_uv).rgb;
  if (u_hasLut != 0) {
    disp = texture(u_lut3d, clamp(disp, 0.0, 1.0)).rgb;
  }
  if (u_vignetteIntensity > 0.0) {
    // §8.12: roundness-aspect corrected len, mix toward vignetteColor.
    vec2 p = (v_uv - 0.5) * 2.0;
    p.x *= (u_resolution.x / u_resolution.y) * u_vignetteRoundness;
    float len = length(p) * u_vignetteIntensity;
    disp *= mix(vec3(1.0), u_vignetteColor, pow(clamp(len, 0.0, 1.0), u_vignetteSmoothness));
  }
  outColor = vec4(disp, luma(disp));
}
`;

/**
 * Display-grade bake: one draw per slice into the 33³ RGBA8 TEXTURE_3D with
 * `framebufferTextureLayer`. Applies contrast (pivot 0.5), saturation,
 * vibrance and the optional user `.cube` sample, in the display domain —
 * the same math the analytic grade would apply per pixel.
 */
export const LUT_BAKE_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler3D u_userLut;
uniform int u_hasUserLut;
uniform float u_lutIntensity;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_vibrance;
uniform float u_slice;          // b texel, [0,1]
in vec2 v_uv;
out vec4 outColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec3 disp = vec3(v_uv, u_slice);
  // Contrast, pivot 0.5 — same shape as the legacy present grade.
  vec3 graded = clamp(disp * u_contrast + vec3(0.5 - 0.5 * u_contrast), 0.0, 1.0);
  // Vibrance: boost scales with distance from luma, folded into saturation
  // (verbatim from the legacy present grade).
  float l = luma(graded);
  float distanceFromLuma = min(1.0, abs(graded.r - l) + abs(graded.g - l) + abs(graded.b - l));
  float sat = u_saturation + (u_vibrance == 0.0 ? 0.0 : u_vibrance * (1.0 - distanceFromLuma));
  graded = clamp(vec3(l) + (graded - vec3(l)) * sat, 0.0, 1.0);
  if (u_hasUserLut != 0) {
    graded = mix(graded, texture(u_userLut, graded).rgb, clamp(u_lutIntensity, 0.0, 1.0));
  }
  outColor = vec4(graded, 1.0);
}
`;
