/**
 * PRD-03 §6.7 S10b — the display-grade fetch, fused into S11/S12.
 *
 * Runs after the OutputPass boundary on display-referred RGBA8: one
 * trilinear `texture(u_lut3d, disp)` fetch applies contrast / saturation /
 * vibrance / the user `.cube`, then vignette (roundness-aspect corrected).
 * Output alpha remains the input opacity. Antialiasing obtains its luminance
 * from RGB, so grading must not overwrite coverage with temporary data.
 */

/**
 * GU47 E-C (EC-2): the S10b LUT fetch shared by `DISPLAY_GRADE_GLSL` and the
 * fused FXAA finalize. Declares `u_lutLattice` / `u_lutBypass` and
 * `a3dDisplayLut(disp)`; the caller declares `u_lut3d` and `u_hasLut`.
 *
 * - `u_lutLattice = 1` for a user `.cube` uploaded as-is: its rows are lattice
 *   samples at i/(N−1), so the coordinate gets the half-texel remap
 *   `c·(N−1)/N + 0.5/N`. `0` (default) keeps the texel-centre convention of
 *   the analytic bake (`LUT_BAKE_GLSL` writes texel i at (i+0.5)/N).
 * - `u_lutBypass` is the fraction of the ungraded colour kept, i.e.
 *   `1 − lutIntensity`; the default 0 applies the LUT fully, so callers that
 *   predate it render exactly as before.
 */
export const DISPLAY_LUT_FETCH_GLSL = /* glsl */ `uniform int u_lutLattice;
uniform float u_lutBypass;
// 1 when the source holds encoded Display-P3 values: a user .cube is authored on sRGB-encoded display values, so the
// fetch runs on the sRGB re-encoding of the colour (out-of-sRGB colours clip to the LUT domain) and re-encodes to P3.
// 0 (the default; an unset uniform) leaves the sRGB path untouched.
uniform int u_lutP3;
vec3 a3dLutDecode(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
vec3 a3dLutEncode(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
vec3 a3dLutP3ToSrgb(vec3 p3) {
  vec3 l = a3dLutDecode(clamp(p3, 0.0, 1.0));
  return a3dLutEncode(clamp(vec3(
    dot(vec3(1.2249401762805596, -0.2249401762805601, 0.0), l),
    dot(vec3(-0.0420569547096882, 1.042056954709688, 0.0), l),
    dot(vec3(-0.0196375545903344, -0.0786360455506318, 1.0982736001409663), l)), 0.0, 1.0));
}
vec3 a3dLutSrgbToP3(vec3 srgb) {
  vec3 l = a3dLutDecode(clamp(srgb, 0.0, 1.0));
  return a3dLutEncode(clamp(vec3(
    dot(vec3(0.8224619687143624, 0.17753803128563794, 0.0), l),
    dot(vec3(0.03319419885096169, 0.9668058011490385, 0.0), l),
    dot(vec3(0.01708263072112004, 0.07239744066396342, 0.9105199286149166), l)), 0.0, 1.0));
}
vec3 a3dDisplayLutSrgb(vec3 disp) {
  vec3 lutCoord = clamp(disp, 0.0, 1.0);
  if (u_lutLattice != 0) {
    vec3 lutSize = vec3(textureSize(u_lut3d, 0));
    lutCoord = lutCoord * ((lutSize - 1.0) / lutSize) + 0.5 / lutSize;
  }
  return mix(texture(u_lut3d, lutCoord).rgb, disp, u_lutBypass);
}
vec3 a3dDisplayLut(vec3 disp) {
  if (u_lutP3 != 0) return a3dLutSrgbToP3(a3dDisplayLutSrgb(a3dLutP3ToSrgb(disp)));
  return a3dDisplayLutSrgb(disp);
}
`;

export const DISPLAY_GRADE_GLSL = /* glsl */ `#version 300 es
precision highp float;
// GLSL ES 3.00 has no default precision for sampler3D (CI: "'sampler3D' : No precision specified").
precision highp sampler3D;
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

${DISPLAY_LUT_FETCH_GLSL}
void main() {
  vec4 source = texture(u_source, v_uv);
  vec3 disp = source.rgb;
  if (u_hasLut != 0) {
    disp = a3dDisplayLut(disp);
  }
  if (u_vignetteIntensity > 0.0) {
    // §8.12: roundness-aspect corrected len, mix toward vignetteColor.
    vec2 p = (v_uv - 0.5) * 2.0;
    p.x *= (u_resolution.x / u_resolution.y) * u_vignetteRoundness;
    float len = length(p) * u_vignetteIntensity;
    disp *= mix(vec3(1.0), u_vignetteColor, pow(clamp(len, 0.0, 1.0), u_vignetteSmoothness));
  }
  outColor = vec4(disp, source.a);
}
`;

/**
 * Display-grade bake: one draw per slice into the 65³ RGBA8 TEXTURE_3D with
 * `framebufferTextureLayer`. Applies contrast (pivot 0.5), saturation,
 * vibrance and the optional user `.cube` sample, in the display domain —
 * the same math the analytic grade would apply per pixel.
 */
export const LUT_BAKE_GLSL = /* glsl */ `#version 300 es
precision highp float;
// GLSL ES 3.00 has no default precision for sampler3D (CI: "'sampler3D' : No precision specified").
precision highp sampler3D;
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
