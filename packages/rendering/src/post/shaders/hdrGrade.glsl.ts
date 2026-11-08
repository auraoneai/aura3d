/**
 * GU47 E-C (WP-3) — the linear-HDR grade writer (PRD-03 §6.7 S10 linear grade).
 *
 * `composite.glsl.ts` declared `u_whiteBalance`, `u_lift`, `u_gamma`, `u_gain`,
 * `u_shadows`, `u_midtones` and `u_highlights`, but no program ran it and no
 * code set the uniforms, so `effects.colorGrade({ temperature, tint, lift,
 * gamma, gain, shadows, midtones, highlights })` never reached a pixel. This
 * module is the one fullscreen draw that applies them on the v2 chain:
 *
 *   c  = texture(u_hdr) [· exp2(ev) when S8 auto-exposure is active — the grade
 *        folds into the S8 multiply draw, so AE + grade is still one draw]
 *   c *= u_whiteBalance                    (CAT02/LMS balance folded to RGB on CPU)
 *   c  = pow(max(c · gain + lift, 0), 1 / gamma)          (ASC-CDL style)
 *   c *= shadows·(1−s)² + midtones·2s(1−s) + highlights·s²,
 *        s = saturate(log2(luma / 0.18) / 8 + 0.5)
 *
 * The same math as `COMPOSITE_GLSL`'s grade block. Alpha passes through (the
 * §6.3 indirect-fraction / post material tag lives there). An identity grade
 * resolves to `null` so the stage driver skips the draw and scenes that do not
 * author a grade stay byte-identical.
 */

export const HDR_GRADE_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_hdr;
uniform sampler2D u_ev;           // 1×1 EV target (S8); bound to a blank texel when u_hasEv == 0
uniform int u_hasEv;
uniform int u_hasGrade;
uniform vec3 u_whiteBalance;      // CAT02-cone LMS balance, resolved per temperature/tint on CPU
uniform vec3 u_lift;
uniform vec3 u_gamma;
uniform vec3 u_gain;
uniform vec3 u_shadows;
uniform vec3 u_midtones;
uniform vec3 u_highlights;
in vec2 v_uv;
out vec4 outColor;

float gradeLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec4 src = texture(u_hdr, v_uv);
  vec3 c = src.rgb;
  if (u_hasEv != 0) {
    c *= exp2(texelFetch(u_ev, ivec2(0), 0).r);
  }
  if (u_hasGrade != 0) {
    c *= u_whiteBalance;
    vec3 safeGamma = max(u_gamma, vec3(1e-3));
    c = pow(max(c * u_gain + u_lift, vec3(0.0)), vec3(1.0) / safeGamma);
    float s = clamp(log2(max(gradeLuma(c), 1e-6) / 0.18) / 8.0 + 0.5, 0.0, 1.0);
    c *= u_shadows * (1.0 - s) * (1.0 - s)
       + u_midtones * 2.0 * s * (1.0 - s)
       + u_highlights * s * s;
  }
  outColor = vec4(c, src.a);
}
`;

export * from "../../renderer/hdrGradeUniforms.js";
