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
 *                               unrelated foreground vector.
 *
 * Velocity enters in UV units per frame; the driver scales it by
 * `shutter · (targetFrameTime / actualFrameTime)` (C-23 timeScale goes into
 * the authored shutter before it reaches this pass) and clamps to
 * `maxBlurPx`.
 */

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
uniform int u_samples;                  // bounded to [1, 16]
uniform int u_tileSize;
uniform int u_frameIndex;               // reserved for binding compatibility
out vec4 o_color;

void main() {
  ivec2 size = textureSize(u_color, 0);
  ivec2 pixel = clamp(ivec2(gl_FragCoord.xy), ivec2(0), size - 1);
  vec4 src = texelFetch(u_color, pixel, 0);
  int samples = clamp(u_samples, 1, 16);
  // Avoid a zero denominator, extra reads, and any change to a one-tap image.
  if (samples == 1) { o_color = src; return; }

  ivec2 depthSize = textureSize(u_linearDepth, 0);
  ivec2 depthMax = depthSize - 1;
  ivec2 depthPixel = clamp(ivec2((vec2(pixel) + 0.5) * vec2(depthSize) / vec2(size)), ivec2(0), depthMax);
  float zSelf = texelFetch(u_linearDepth, depthPixel, 0).r;
  ivec2 neighborMax = textureSize(u_neighbor, 0) - 1;
  ivec2 tile = clamp(depthPixel / max(u_tileSize, 1), ivec2(0), neighborMax);
  // Velocity is UV/frame; clamp its magnitude in actual pixels, so the cap
  // also holds on non-square targets. Scale via the largest component to avoid
  // overflow while normalizing very large, finite velocities.
  vec2 velocity = clamp(texelFetch(u_neighbor, tile, 0).rg, vec2(-1e10), vec2(1e10));
  vec2 velocityPx = velocity * clamp(u_shutter, -1e10, 1e10) * vec2(size);
  float component = max(abs(velocityPx.x), abs(velocityPx.y));
  if (component == 0.0) { o_color = src; return; }
  vec2 direction = velocityPx / component;
  float maxLen = clamp(u_maxBlurPx, 0.0, 2.0 * length(vec2(size)));
  velocityPx = direction * min(component, maxLen / length(direction));

  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 16; i += 1) {
    if (i >= samples) break;
    // Midpoints form symmetric pairs around zero for odd and even counts.
    float t = (float(i) + 0.5) / float(samples) - 0.5;
    // Manually bilinear-sample with per-texel depth rejection: unlike rounding
    // to a nearest texel, this keeps paired samples centered at half pixels.
    vec2 pos = clamp(vec2(pixel) + velocityPx * t, vec2(0.0), vec2(size - 1));
    ivec2 base = ivec2(floor(pos));
    vec2 fraction = fract(pos);
    for (int y = 0; y < 2; y += 1) for (int x = 0; x < 2; x += 1) {
      float coverage = (x == 0 ? 1.0 - fraction.x : fraction.x)
                     * (y == 0 ? 1.0 - fraction.y : fraction.y);
      if (coverage <= 0.0) continue;
      ivec2 tapPx = clamp(base + ivec2(x, y), ivec2(0), size - 1);
      ivec2 depthTap = clamp(ivec2((vec2(tapPx) + 0.5) * vec2(depthSize) / vec2(size)), ivec2(0), depthMax);
      float zTap = texelFetch(u_linearDepth, depthTap, 0).r;
      // Soft depth compare (0.05 m): different surfaces do not smear.
      float w = coverage * clamp(1.0 - abs(zTap - zSelf) / 0.05, 0.0, 1.0);
      vec4 sampleColor = texelFetch(u_color, tapPx, 0);
      if (src.a <= 1.0) sampleColor.a = clamp(sampleColor.a, 0.0, 1.0);
      sum += sampleColor * w;
      wsum += w;
    }
  }
  // Values above one carry the renderer's indirect-light tag, not opacity.
  // Keep that tag at the center while filtering ordinary premultiplied alpha.
  vec4 filtered = wsum > 0.0 ? sum / wsum : src;
  o_color = src.a > 1.0 ? vec4(filtered.rgb, src.a) : filtered;
}
`;
