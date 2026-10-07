/**
 * PRD-03 §6.6 / §8.10 — v2 bloom shaders (linear HDR, additive pyramid).
 *
 * Three programs:
 * - `BLOOM_PREFILTER_GLSL`: Karis-averaged 13-tap (five overlapping 2x2 boxes,
 *   centre box 0.5, corners 0.125 each, each box Karis-weighted 1/(1+luma)),
 *   firefly clamp, soft-knee threshold weight, tint. Output is half-res.
 * - `BLOOM_DOWNSAMPLE_GLSL`: the same 13-tap pattern without Karis for
 *   N-1 further mips.
 * - `BLOOM_UPSAMPLE_GLSL`: progressive 9-tap tent with `radiusTexels =
 *   scatter`, accumulated as `up_i = down_i + tent(up_{i+1})`.
 *
 * The composite applies `u_bloomNorm = bloomNormalization(N, scatter)` — the
 * analytic factor in `postprocess/NativeBloomPyramid.ts` — so a constant
 * above-threshold input of excess E produces bloom = E. There is no other
 * gain (§6.6).
 */

export const BLOOM_PREFILTER_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_hdr;
uniform vec2 u_texelSize;
uniform float u_threshold;
uniform float u_knee;          // kneeRatio * threshold
uniform vec3 u_tint;
uniform float u_clampLuminance;
in vec2 v_uv;
out vec4 outColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// One 2x2 box sample averaged at bilinear footprint centre.
vec3 box4(vec2 uv, vec2 halfTexel) {
  vec3 s = texture(u_hdr, uv + vec2(-halfTexel.x, -halfTexel.y)).rgb;
  s += texture(u_hdr, uv + vec2(halfTexel.x, -halfTexel.y)).rgb;
  s += texture(u_hdr, uv + vec2(-halfTexel.x, halfTexel.y)).rgb;
  s += texture(u_hdr, uv + vec2(halfTexel.x, halfTexel.y)).rgb;
  return s * 0.25;
}

void main() {
  // Jimenez 2014 13-tap as five overlapping boxes; Karis weight per box.
  vec2 halfTexel = u_texelSize * 0.5;
  vec3 centre = box4(v_uv, halfTexel);
  vec3 c = centre * (0.5 / (1.0 + luma(centre)));
  vec2 corner = u_texelSize + halfTexel;
  vec3 b;
  b = box4(v_uv + vec2(-corner.x, -corner.y) * 0.5, halfTexel);
  c += b * (0.125 / (1.0 + luma(b)));
  b = box4(v_uv + vec2(corner.x, -corner.y) * 0.5, halfTexel);
  c += b * (0.125 / (1.0 + luma(b)));
  b = box4(v_uv + vec2(-corner.x, corner.y) * 0.5, halfTexel);
  c += b * (0.125 / (1.0 + luma(b)));
  b = box4(v_uv + vec2(corner.x, corner.y) * 0.5, halfTexel);
  c += b * (0.125 / (1.0 + luma(b)));

  c = min(c, vec3(u_clampLuminance));           // firefly clamp
  float br = max(c.r, max(c.g, c.b));           // max channel (Unity/UE)
  float knee = u_threshold * u_knee;
  float soft = clamp(br - u_threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-5);
  float w = max(soft, br - u_threshold) / max(br, 1e-5);
  outColor = vec4(c * w * u_tint, 1.0);
}
`;

export const BLOOM_DOWNSAMPLE_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_texelSize;
in vec2 v_uv;
out vec4 outColor;

vec3 box4(vec2 uv, vec2 halfTexel) {
  vec3 s = texture(u_src, uv + vec2(-halfTexel.x, -halfTexel.y)).rgb;
  s += texture(u_src, uv + vec2(halfTexel.x, -halfTexel.y)).rgb;
  s += texture(u_src, uv + vec2(-halfTexel.x, halfTexel.y)).rgb;
  s += texture(u_src, uv + vec2(halfTexel.x, halfTexel.y)).rgb;
  return s * 0.25;
}

void main() {
  vec2 halfTexel = u_texelSize * 0.5;
  vec3 c = box4(v_uv, halfTexel) * 0.5;
  vec2 corner = u_texelSize + halfTexel;
  c += box4(v_uv + vec2(-corner.x, -corner.y) * 0.5, halfTexel) * 0.125;
  c += box4(v_uv + vec2(corner.x, -corner.y) * 0.5, halfTexel) * 0.125;
  c += box4(v_uv + vec2(-corner.x, corner.y) * 0.5, halfTexel) * 0.125;
  c += box4(v_uv + vec2(corner.x, corner.y) * 0.5, halfTexel) * 0.125;
  outColor = vec4(c, 1.0);
}
`;

export const BLOOM_UPSAMPLE_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_lower;      // up_{i+1}
uniform sampler2D u_current;    // down_i
uniform vec2 u_lowerTexel;
uniform float u_scatter;        // radiusTexels
in vec2 v_uv;
out vec4 outColor;

// 9-tap tent (3x3 tent kernel, weights 1-2-1 separable).
vec3 tent9(sampler2D tex, vec2 uv, vec2 radiusTexels) {
  vec2 r = radiusTexels;
  vec3 s = texture(tex, uv + vec2(-r.x, -r.y)).rgb * 1.0;
  s += texture(tex, uv + vec2(0.0, -r.y)).rgb * 2.0;
  s += texture(tex, uv + vec2(r.x, -r.y)).rgb * 1.0;
  s += texture(tex, uv + vec2(-r.x, 0.0)).rgb * 2.0;
  s += texture(tex, uv).rgb * 4.0;
  s += texture(tex, uv + vec2(r.x, 0.0)).rgb * 2.0;
  s += texture(tex, uv + vec2(-r.x, r.y)).rgb * 1.0;
  s += texture(tex, uv + vec2(0.0, r.y)).rgb * 2.0;
  s += texture(tex, uv + vec2(r.x, r.y)).rgb * 1.0;
  return s / 16.0;
}

void main() {
  // up_i = down_i + tent(up_{i+1})
  outColor = vec4(texture(u_current, v_uv).rgb + tent9(u_lower, v_uv, u_lowerTexel * u_scatter), 1.0);
}
`;
