/**
 * PRD-03 §8.8 — S7 motion blur, McGuire 2012 tile reconstruction (WebGL2).
 *
 *   Pass 1 MB_TILE_MAX_GLSL   — per MB_TILE_SIZE tile: the velocity with the
 *                               largest magnitude (direction preserved).
 *   Pass 2 MB_NEIGHBOR_GLSL   — max of the 3×3 tile neighborhood so a fast
 *                               object bleeds onto still pixels beside it.
 *   Pass 3 MB_RECONSTRUCT_GLSL — per pixel: taps along the neighbor-max
 *                               direction, soft depth compare (0.05 m) to
 *                               keep background from being smeared by an
 *                               unrelated foreground vector, IGN jitter.
 *
 * Velocity enters in UV units per frame; the driver scales it by
 * `shutter · (targetFrameTime / actualFrameTime)` (C-23 timeScale goes into
 * the authored shutter before it reaches this pass) and clamps to
 * `maxBlurPx`.
 */

import { POST_COMMON_GLSL } from "./common.glsl.js";

const HEADER = `#version 300 es
precision highp float;
`;

export const MB_TILE_MAX_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_velocity; // dilated velocity (.rg), render res
out vec4 o_color;

void main() {
  ivec2 tile = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(u_velocity, 0);
  vec2 best = vec2(0.0);
  float mag = 0.0;
  for (int y = 0; y < MB_TILE_SIZE; y += 1) for (int x = 0; x < MB_TILE_SIZE; x += 1) {
    ivec2 p = tile * MB_TILE_SIZE + ivec2(x, y);
    if (p.x >= size.x || p.y >= size.y) continue;
    vec2 v = texelFetch(u_velocity, p, 0).rg;
    float m = dot(v, v);
    if (m > mag) { mag = m; best = v; }
  }
  o_color = vec4(best, 0.0, 1.0);
}
`;

export const MB_NEIGHBOR_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_tileMax;
out vec4 o_color;

void main() {
  ivec2 tile = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(u_tileMax, 0);
  vec2 best = vec2(0.0);
  float mag = 0.0;
  for (int y = -1; y <= 1; y += 1) for (int x = -1; x <= 1; x += 1) {
    vec2 v = texelFetch(u_tileMax, clamp(tile + ivec2(x, y), ivec2(0), size - 1), 0).rg;
    float m = dot(v, v);
    if (m > mag) { mag = m; best = v; }
  }
  o_color = vec4(best, 0.0, 1.0);
}
`;

export const MB_RECONSTRUCT_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_color;
uniform highp sampler2D u_velocity;     // dilated velocity (.rg)
uniform highp sampler2D u_neighbor;     // 3x3 tile max
uniform highp sampler2D u_linearDepth;  // .r = viewZ metres
uniform float u_shutter;                // authored shutter · frameTime scale
uniform float u_maxBlurPx;
uniform int u_samples;                  // 8 | 12 | 16
uniform int u_tileSize;
uniform int u_frameIndex;
out vec4 o_color;

${POST_COMMON_GLSL}

float ign(vec2 pixel) {
  // Interleaved gradient noise — per-pixel tap phase.
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715)) + float(u_frameIndex) * 0.618034));
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(u_color, 0);
  vec2 uv = (vec2(pixel) + 0.5) / vec2(size);
  vec3 src = texelFetch(u_color, pixel, 0).rgb;
  float zSelf = texelFetch(u_linearDepth, pixel, 0).r;

  // Shutter·frame-time scale and pixel clamp happen once, on the tile vector.
  vec2 tileV = texelFetch(u_neighbor, pixel / u_tileSize, 0).rg * u_shutter;
  float maxLen = u_maxBlurPx / float(size.y);
  if (length(tileV) > maxLen) tileV *= maxLen / length(tileV);

  float jitter = ign(vec2(pixel));
  vec3 sum = src;
  float wsum = 1.0;
  for (int i = 0; i < 16; i += 1) {
    if (i >= u_samples) break;
    float t = (float(i) + jitter) / float(u_samples - 1) - 0.5;
    vec2 offset = tileV * t;
    ivec2 tapPx = clamp(ivec2(floor((uv + offset) * vec2(size))), ivec2(0), size - 1);
    vec3 c = texelFetch(u_color, tapPx, 0).rgb;
    float zTap = texelFetch(u_linearDepth, tapPx, 0).r;
    // Soft depth compare (0.05 m): taps on a different surface don't smear.
    float depthW = clamp(1.0 - abs(zTap - zSelf) / 0.05, 0.0, 1.0);
    // Coverage weight: a tap counts while the tile vector reaches it.
    float reach = length(tileV) * abs(t);
    float w = depthW * clamp(1.0 + length(tileV) * 0.5 - reach, 0.0, 1.0);
    sum += c * w;
    wsum += w;
  }
  o_color = vec4(sum / wsum, 1.0);
}
`;
