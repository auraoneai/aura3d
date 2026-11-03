/**
 * PRD-03 §8.6 — S5 pre-pass: closest-depth velocity dilation (WebGL2).
 *
 * At an object edge the foreground pixel moves but its background neighbor
 * does not; a naive per-pixel velocity read smears the silhouette's history
 * with the still background's zero motion. For each pixel we pick the
 * velocity of the closest-depth texel in a 3×3 window — the foreground
 * surface wins — and store the pixel's own linear Z in .b for the S5
 * disocclusion test.
 *
 *   in:  u_velocity  (S1-C camera velocity / future C-14 MRT, .rg)
 *        u_linearDepth (this frame's S1-A output, .r = viewZ metres)
 *   out: vec4(vx, vy, linZ, expectedPreviousZ). Alpha is used only when
 *        the caller explicitly supplies previous depth in velocity alpha.
 */

import { POST_COMMON_GLSL } from "./common.glsl.js";

const HEADER = `#version 300 es
precision highp float;
`;

export const VELOCITY_DILATE_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_velocity;
uniform highp sampler2D u_linearDepth;
uniform bool u_hasExpectedDepth;
uniform float u_depthNear;
out vec4 o_color;

${POST_COMMON_GLSL}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(u_velocity, 0);
  float zSelf = texelFetch(u_linearDepth, clamp(pixel, ivec2(0), size - 1), 0).r;
  vec4 selfVelocity = texelFetch(u_velocity, pixel, 0);
  vec4 nearestVelocity = selfVelocity;
  float zBest = zSelf;
  for (int y = -1; y <= 1; y += 1) {
    for (int x = -1; x <= 1; x += 1) {
      ivec2 tap = clamp(pixel + ivec2(x, y), ivec2(0), size - 1);
      float z = texelFetch(u_linearDepth, tap, 0).r;
      if (z < zBest) {
        zBest = z;
        nearestVelocity = texelFetch(u_velocity, tap, 0);
      }
    }
  }
  // A newly exposed current pixel must not acquire history from its neighbor.
  // Keep the selected velocity and depth paired, but only when both samples
  // have a valid previous surface; 3e38 is the shared invalid-depth sentinel.
  bool selfHasPrevious = selfVelocity.a >= u_depthNear && selfVelocity.a < 3.0e38;
  bool nearestHasPrevious = nearestVelocity.a >= u_depthNear && nearestVelocity.a < 3.0e38;
  float expectedPrevious = u_hasExpectedDepth
    ? (selfHasPrevious && nearestHasPrevious ? nearestVelocity.a : 3.0e38)
    : 0.0;
  o_color = vec4(nearestVelocity.rg, zSelf, expectedPrevious);
}
`;
