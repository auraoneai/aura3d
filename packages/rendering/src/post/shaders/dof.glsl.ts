/**
 * PRD-03 §8.7 — S6 depth of field (WebGL2).
 *
 * Circle of confusion in pixels (thin-lens, all lengths in mm):
 *
 *   cocPx = A · f · (z − zf) / (z · (zf − f)) · (heightPx / sensorMm)
 *
 * with A = f / N (aperture diameter). Worked anchor (PRD): f=50 mm, N=2.8,
 * zf=3 m, z=30 m on a 1080 px frame → |coc| ≈ 12.3 px.
 *
 * Passes:
 *   DOF_PREFILTER_GLSL — half-res: rgb = 2×2 box of the HDR color, a = signed cocPx
 *     (positive = far field, negative = near field), clamped to maxBlurPx.
 *   DOF_NEAR_TILE_GLSL — 8 px tiles of the half-res map: maximum near-field
 *     magnitude (−min(coc)) so the gather can dilate foreground bokeh.
 *   DOF_GATHER_GLSL   — half-res Vogel-disc gather, DOF_RINGS rings ×8 taps;
 *     background taps scatter by their own CoC, near-field taps by the
 *     tile-dilated near CoC.
 *   DOF_COMPOSITE_GLSL — full-res `smoothstep(|coc|, 1, 2)` blend.
 *
 * GU47 E-C (EC-8) tilt-shift band mode (`u_tiltShift.w = 1`): the CoC comes
 * from the screen position instead of depth. `t` is the distance across the
 * band (frame-height units, 0 = top edge, 1 = bottom edge, rotated by
 * `angle` about the frame centre); pixels within `bandWidth / 2` of
 * `bandCenter` stay sharp and the blur ramps linearly to `maxBlurPx` over
 * `max(0.05, (1 − bandWidth) / 2)`. Band-mode CoC is far-field (positive)
 * on both sides, so no near-field dilation bleeds over the sharp band, and
 * the sky blurs like everything else. `u_tiltShift.w = 0` is the thin-lens
 * path above, unchanged.
 */

import { POST_COMMON_GLSL } from "./common.glsl.js";

const HEADER = `#version 300 es
precision highp float;
`;

export const DOF_PREFILTER_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_color;
uniform highp sampler2D u_linearDepth;
uniform float u_focusDistance;  // metres
uniform float u_focalLengthMm;
uniform float u_fStop;
uniform float u_sensorHeightMm;
uniform float u_frameHeightPx;  // full-res height
uniform float u_maxBlurPx;
uniform vec4 u_tiltShift;       // GU47: x band centre (0 top, 1 bottom), y band width, z angle (rad), w 1 = band mode
out vec4 o_color;

${POST_COMMON_GLSL}

float tiltShiftCocPx(ivec2 base, ivec2 fullSize) {
  vec2 uv = (vec2(base) + 1.0) / vec2(fullSize);
  float aspect = float(fullSize.x) / float(max(fullSize.y, 1));
  vec2 p = vec2((uv.x - 0.5) * aspect, (1.0 - uv.y) - 0.5);
  float t = dot(p, vec2(-sin(u_tiltShift.z), cos(u_tiltShift.z))) + 0.5;
  float halfBand = 0.5 * clamp(u_tiltShift.y, 0.0, 1.0);
  float ramp = max(0.05, 0.5 - halfBand);
  return clamp((abs(t - u_tiltShift.x) - halfBand) / ramp, 0.0, 1.0) * u_maxBlurPx;
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  // u_color is the FULL-res HDR target: box-average its 2×2 block (03-S15 —
  // a texelFetch at the half-res index read only the lower-left quadrant).
  ivec2 fullMax = textureSize(u_color, 0) - 1;
  ivec2 base = pixel * 2;
  vec3 color = 0.25 * (
    texelFetch(u_color, clamp(base, ivec2(0), fullMax), 0).rgb +
    texelFetch(u_color, clamp(base + ivec2(1, 0), ivec2(0), fullMax), 0).rgb +
    texelFetch(u_color, clamp(base + ivec2(0, 1), ivec2(0), fullMax), 0).rgb +
    texelFetch(u_color, clamp(base + ivec2(1, 1), ivec2(0), fullMax), 0).rgb);
  float z = texelFetch(u_linearDepth, clamp(base, ivec2(0), textureSize(u_linearDepth, 0) - 1), 0).r;
  float f = u_focalLengthMm;
  float aperture = f / max(u_fStop, 0.01);
  float zMm = max(z * 1000.0, 1.0);
  float zfMm = u_focusDistance * 1000.0;
  float cocMm = aperture * f * (zMm - zfMm) / (zMm * max(zfMm - f, 1.0));
  float cocPx = clamp(cocMm * (u_frameHeightPx / u_sensorHeightMm), -u_maxBlurPx, u_maxBlurPx);
  // Sky (linear Z at far) never blurs.
  cocPx = zMm >= 9.9e5 ? 0.0 : cocPx;
  if (u_tiltShift.w > 0.5) cocPx = tiltShiftCocPx(base, fullMax + 1);
  o_color = vec4(color, cocPx);
}
`;

export const DOF_NEAR_TILE_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_prefilter; // half-res, .a = signed cocPx
out vec4 o_color;

void main() {
  ivec2 tile = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(u_prefilter, 0);
  float near_ = 0.0;
  for (int y = 0; y < 8; y += 1) for (int x = 0; x < 8; x += 1) {
    ivec2 p = tile * 8 + ivec2(x, y);
    if (p.x >= size.x || p.y >= size.y) continue;
    float coc = texelFetch(u_prefilter, p, 0).a;
    near_ = max(near_, -coc); // near field is the negative-CoC side
  }
  o_color = vec4(near_, 0.0, 0.0, 1.0);
}
`;

export const DOF_GATHER_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_prefilter; // half-res color + signed coc
uniform highp sampler2D u_nearTile;  // 8px tiles, .r = near |coc|
uniform float u_maxBlurPx;           // full-res px (CoC diameter)
out vec4 o_color;

const float DOF_HALF_RES_RADIUS = 0.25;

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(u_prefilter, 0);
  vec4 center = texelFetch(u_prefilter, pixel, 0);
  float centerCoc = center.a;
  float centerNear = texelFetch(u_nearTile, pixel / 8, 0).r;
  // .a is the full-res CoC *diameter* in px: the half-res disc radius is
  // diameter / 2 (radius) / 2 (half res) = 0.25 · |coc| (03-S15 — 0.5 drew a
  // bokeh twice the thin-lens diameter).
  float radius = max(abs(centerCoc), centerNear) * DOF_HALF_RES_RADIUS;
  vec3 sum = center.rgb;
  float wsum = 1.0;
  const int RINGS = DOF_RINGS;
  for (int ring = 1; ring <= RINGS; ring += 1) {
    for (int s = 0; s < 8; s += 1) {
      float angle = 2.39996323 * float(ring * 8 + s); // golden-angle Vogel disc
      vec2 dir = vec2(cos(angle), sin(angle));
      ivec2 tap = clamp(pixel + ivec2(dir * radius * (float(ring) / float(RINGS)) + vec2(0.5)), ivec2(0), size - 1);
      vec4 t = texelFetch(u_prefilter, tap, 0);
      float tapNear = texelFetch(u_nearTile, tap / 8, 0).r;
      // A tap contributes when its own blur reaches this pixel, or when the
      // tile's near field does (foreground bleeds over sharp background).
      float reach = max(abs(t.a), tapNear) * DOF_HALF_RES_RADIUS;
      float w = clamp((reach + 0.5) / max(length(vec2(tap - pixel)), 0.5), 0.0, 1.0);
      sum += t.rgb * w;
      wsum += w;
    }
  }
  o_color = vec4(sum / wsum, centerCoc);
}
`;

export const DOF_COMPOSITE_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_color;   // full-res HDR
uniform highp sampler2D u_blurred; // half-res gather (.a = signed cocPx)
out vec4 o_color;

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  vec4 src = texelFetch(u_color, pixel, 0);
  vec4 blur = texture(u_blurred, (vec2(pixel) + 0.5) / vec2(textureSize(u_color, 0)));
  o_color = vec4(mix(src.rgb, blur.rgb, smoothstep(1.0, 2.0, abs(blur.a))), src.a);
}
`;
