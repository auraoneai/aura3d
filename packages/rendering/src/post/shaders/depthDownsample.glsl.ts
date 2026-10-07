/**
 * PRD-03 §8.3 — S1 depth prep for the v2 post chain (WebGL2).
 *
 * Three small programs, all `texelFetch`-based (no filtering on depth):
 *
 *   Pass A `DEPTH_LINEARIZE_GLSL` — full-res R32F view-space metres via the
 *   §6.11 shared `linearizeDepth` (perspective; ortho handled by `u_ortho`).
 *   Pass B `DEPTH_MINMAX_HALF_GLSL` — half-res RG32F = (min, max) of the 2×2
 *   linearized quad. GTAO (S2), DOF (S6), SSR (S3) and god rays (S4) sample
 *   this; `.r` (nearer) is the conservative occluder choice.
 *   Pass C `CAMERA_VELOCITY_GLSL` — only when TAA or motion blur is active
 *   and no C-14 MRT velocity attachment exists: camera-only velocity
 *   `v = (ndcCurr − ndcPrev) · 0.5` in RG16F, same units and sign as C-14
 *   (Phase 4 wires it; the shader ships with the depth prep because it reads
 *   the same linear depth).
 */

import { POST_COMMON_GLSL } from "./common.glsl.js";

const HEADER = `#version 300 es
precision highp float;
`;

export const DEPTH_LINEARIZE_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_depth;
uniform float u_near;
uniform float u_far;
uniform bool u_ortho;
out vec4 o_color;

${POST_COMMON_GLSL}

void main() {
  float d = texelFetch(u_depth, ivec2(gl_FragCoord.xy), 0).r;
  o_color = vec4(linearizeDepth(d, u_near, u_far, u_ortho), 0.0, 0.0, 1.0);
}
`;

export const DEPTH_MINMAX_HALF_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_linearDepth;   // R32F output of pass A
out vec4 o_color;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 2;
  float d00 = texelFetch(u_linearDepth, p, 0).r;
  float d10 = texelFetch(u_linearDepth, p + ivec2(1, 0), 0).r;
  float d01 = texelFetch(u_linearDepth, p + ivec2(0, 1), 0).r;
  float d11 = texelFetch(u_linearDepth, p + ivec2(1, 1), 0).r;
  o_color = vec4(min(min(d00, d10), min(d01, d11)),
                 max(max(d00, d10), max(d01, d11)), 0.0, 1.0);
}
`;

export const CAMERA_VELOCITY_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_depth;
uniform float u_near;
uniform float u_far;
uniform bool u_ortho;
uniform mat4 u_prevViewProjection;
uniform mat4 u_invUnjitteredViewProjection;
out vec4 o_color;

${POST_COMMON_GLSL}

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(u_depth, 0));
  float d = texelFetch(u_depth, ivec2(gl_FragCoord.xy), 0).r;
  float linZ = linearizeDepth(d, u_near, u_far, u_ortho);
  vec2 ndcCurr = uv * 2.0 - 1.0;
  // Reconstruct the unjittered world/view position of this pixel, then
  // reproject it through last frame's camera.
  vec4 viewPrevH = u_invUnjitteredViewProjection * vec4(ndcCurr, d * 2.0 - 1.0, 1.0);
  vec4 clipPrev = u_prevViewProjection * vec4(viewPrevH.xyz / viewPrevH.w, 1.0);
  vec2 ndcPrev = clipPrev.xy / clipPrev.w;
  // Same units and sign convention as the C-14 velocity MRT: UV-space
  // half-magnitude per frame.
  vec2 v = (ndcCurr - ndcPrev) * 0.5;
  // Sky/static far plane writes zero motion.
  v = linZ >= u_far * 0.999 ? vec2(0.0) : v;
  o_color = vec4(v, 0.0, 1.0);
}
`;
