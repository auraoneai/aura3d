/**
 * PRD-03 §6.1 S10 / §8.12 — the linear-HDR composite.
 *
 * One pass over the exposed HDR frame before C-05 `OutputPass`:
 *   c = texture(u_hdr, uv) * u_exposure * u_autoExposure
 *   + chromatic aberration (3-tap, radial `|uv-0.5|²` profile)
 *   + bloom · u_bloomIntensity
 *   + linear grade: Bradford white balance → lift/gamma/gain →
 *     shadows/midtones/highlights weights (1−s)², 2s(1−s), s² with
 *     s = saturate(log2(luma/0.18)/8 + 0.5)
 *
 * Output stays RGBA16F; the single tone-map + sRGB encode happens in the
 * OutputPass boundary (`createLegacyOutputPass`), which receives
 * `exposure: 1` because exposure is already applied here.
 */

export const COMPOSITE_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_hdr;
uniform sampler2D u_bloom;
uniform float u_exposure;
uniform float u_autoExposure;
uniform float u_bloomIntensity;
uniform float u_caIntensity;
uniform vec3 u_whiteBalance;      // Bradford-cone LMS gain, resolved per temperature/tint
uniform vec3 u_lift;
uniform vec3 u_gamma;
uniform vec3 u_gain;
uniform vec3 u_shadows;
uniform vec3 u_midtones;
uniform vec3 u_highlights;
uniform int u_hasBloom;
in vec2 v_uv;
out vec4 outColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec2 centre = v_uv - 0.5;
  vec2 dir = centre * dot(centre, centre) * u_caIntensity;
  vec3 c;
  if (u_caIntensity != 0.0) {
    c = vec3(
      texture(u_hdr, v_uv - dir).r,
      texture(u_hdr, v_uv).g,
      texture(u_hdr, v_uv + dir).b);
  } else {
    c = texture(u_hdr, v_uv).rgb;
  }
  c *= u_exposure * u_autoExposure;
  if (u_hasBloom != 0) {
    c += texture(u_bloom, v_uv).rgb * u_bloomIntensity;
  }

  // Linear grade — Bradford CAT already folded into u_whiteBalance on CPU.
  c *= u_whiteBalance;
  // lift / gamma / gain (ASC-CDL style), per channel.
  vec3 safeGamma = max(u_gamma, vec3(1e-3));
  c = pow(max(c * u_gain + u_lift, vec3(0.0)), vec3(1.0) / safeGamma);
  // Shadows/midtones/highlights from the luma pivot at 0.18.
  float s = clamp(log2(max(luma(c), 1e-6) / 0.18) / 8.0 + 0.5, 0.0, 1.0);
  c *= u_shadows * (1.0 - s) * (1.0 - s)
     + u_midtones * 2.0 * s * (1.0 - s)
     + u_highlights * s * s;

  outColor = vec4(c, texture(u_hdr, v_uv).a);
}
`;

/**
 * Transitional standalone CA pass (Phase 3): the §8.12 radial 3-tap,
 * `uv ± dir·intensity` with `dir = centre·|centre|²·u_caIntensity`, executed
 * on the HDR target while S10 composite keeps its own copy for the final
 * chain. Same formula — when S10 runs real, this program goes away and the
 * composite's `u_caIntensity` carries it.
 */
export const CA_PASS_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_hdr;
uniform float u_caIntensity;
in vec2 v_uv;
out vec4 outColor;

void main() {
  vec2 centre = v_uv - 0.5;
  vec2 dir = centre * dot(centre, centre) * u_caIntensity;
  if (u_caIntensity != 0.0) {
    outColor = vec4(
      texture(u_hdr, v_uv - dir).r,
      texture(u_hdr, v_uv).g,
      texture(u_hdr, v_uv + dir).b,
      texture(u_hdr, v_uv).a);
  } else {
    outColor = texture(u_hdr, v_uv);
  }
}
`;
