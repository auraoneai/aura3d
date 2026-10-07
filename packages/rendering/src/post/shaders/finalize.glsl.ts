/**
 * PRD-03 §6.1 S12 / §8.15 — the finalize pass.
 *
 * Writes the default framebuffer: film grain (display space, luma-gated by
 * `luminanceResponse`), then FSR1 RCAS sharpening when TAA sharpness > 0 or
 * renderScale < 1 (limit 0.25), then the triangular-PDF dither — the last
 * write to the 8-bit output.
 *
 * `FINALIZE_FXAA_FUSED_GLSL` is the §6.1 fuse: when post-AA is FXAA, S10b
 * (display LUT + vignette), S11 (r185 FXAA) and S12 collapse into one draw.
 * The fused program reads luma from `.a` (S10b writes `luma(disp)` there) so
 * the FXAA taps never re-run the grade — the fix for today's per-tap
 * `finalColorAt` re-evaluation (`WebGL2Device.ts:3611-3631`).
 */

import { POST_COMMON_GLSL } from "./common.glsl.js";
import { FXAA_185_FNS_GLSL } from "./fxaa.glsl.js";

const FINALIZE_FNS_GLSL = /* glsl */ `
float luma709(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 rcas(sampler2D tex, vec2 uv, vec2 texel, float sharpness) {
  // FSR1 RCAS: single-pass adaptive sharpen over the 4-ring neighbourhood.
  vec3 e = texture(tex, uv).rgb;
  vec3 cross = (
    texture(tex, uv + vec2(0.0, -texel.y)).rgb +
    texture(tex, uv + vec2(0.0, texel.y)).rgb +
    texture(tex, uv + vec2(-texel.x, 0.0)).rgb +
    texture(tex, uv + vec2(texel.x, 0.0)).rgb
  ) * 0.25;
  float sharp = min(sharpness, 0.25);
  return clamp(e + (e - cross) * sharp, 0.0, 1.0);
}

float filmGrain(vec2 fragCoord, float frame, float intensity, float size, float luminanceResponse, float lumaValue) {
  uvec2 seed = uvec2(fragCoord * size) + uvec2(uint(frame) * 747796405u);
  vec2 rnd = vec2(pcg2d(seed)) / 4294967296.0;
  return (rnd.x - 0.5) * intensity * mix(1.0, 1.0 - lumaValue, luminanceResponse);
}
`;

export const FINALIZE_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform float u_frame;
uniform float u_grainIntensity;
uniform float u_grainSize;
uniform float u_grainLuminanceResponse;
uniform float u_rcasSharpness;    // 0 disables; FSR1 limit 0.25
in vec2 v_uv;
out vec4 outColor;

${POST_COMMON_GLSL}
${FINALIZE_FNS_GLSL}

void main() {
  vec3 disp = u_rcasSharpness > 0.0
    ? rcas(u_source, v_uv, u_texelSize, u_rcasSharpness)
    : texture(u_source, v_uv).rgb;
  disp += filmGrain(gl_FragCoord.xy, u_frame, u_grainIntensity, u_grainSize, u_grainLuminanceResponse, luma709(disp));
  disp += triangularDither(gl_FragCoord.xy, u_frame);
  outColor = vec4(clamp(disp, 0.0, 1.0), 1.0);
}
`;

export const FINALIZE_FXAA_FUSED_GLSL = /* glsl */ `#version 300 es
precision highp float;
#define AURA_LUMA_ALPHA 1
uniform sampler2D u_source;
uniform sampler3D u_lut3d;
uniform int u_hasLut;
uniform vec2 u_texelSize;
uniform vec2 u_outputTexel;
uniform float u_frame;
uniform float u_grainIntensity;
uniform float u_grainSize;
uniform float u_grainLuminanceResponse;
uniform float u_vignetteIntensity;
uniform float u_vignetteSmoothness;
uniform float u_vignetteRoundness;
uniform vec3 u_vignetteColor;
uniform vec2 u_resolution;
in vec2 v_uv;
out vec4 outColor;

// S10b inline: the FXAA taps sample the display-graded source — each tap is
// one LUT fetch + vignette, not a re-run of the analytic grade. Forward
// declaration so the AURA_FXAA_SAMPLE hook (inside FXAA_185_FNS_GLSL) resolves.
vec4 sampleGraded(sampler2D tex, vec2 uv);
#define AURA_FXAA_SAMPLE(tex, uvSample) sampleGraded(tex, uvSample)

${FXAA_185_FNS_GLSL}

${POST_COMMON_GLSL}
${FINALIZE_FNS_GLSL}

vec4 sampleGraded(sampler2D tex, vec2 uv) {
  vec4 c = texture(tex, uv);
  vec3 disp = c.rgb;
  if (u_hasLut != 0) {
    disp = texture(u_lut3d, clamp(disp, 0.0, 1.0)).rgb;
  }
  if (u_vignetteIntensity > 0.0) {
    vec2 p = (uv - 0.5) * 2.0;
    p.x *= (u_resolution.x / u_resolution.y) * u_vignetteRoundness;
    float len = length(p) * u_vignetteIntensity;
    disp *= mix(vec3(1.0), u_vignetteColor, pow(clamp(len, 0.0, 1.0), u_vignetteSmoothness));
  }
  return vec4(disp, luma709(disp));
}

void main() {
  vec2 uv = gl_FragCoord.xy * u_outputTexel;
  vec4 color = ApplyFXAA(u_source, u_texelSize, uv);
  vec3 disp = color.rgb;
  disp += filmGrain(gl_FragCoord.xy, u_frame, u_grainIntensity, u_grainSize, u_grainLuminanceResponse, luma709(disp));
  disp += triangularDither(gl_FragCoord.xy, u_frame);
  outColor = vec4(clamp(disp, 0.0, 1.0), 1.0);
}
`;
