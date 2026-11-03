/**
 * Aura3D's contrast-adaptive spatial antialiasing pass.
 *
 * The exported names are kept for existing consumers. The filter measures the
 * centre and four adjacent pixels in display space, then blends across the
 * stronger local gradient. Flat areas remain unchanged. Input texels are
 * clamped at image edges; the non-fused path blends premultiplied colour and
 * alpha so transparent texels do not introduce coloured fringes.
 *
 * `AURA_FXAA_SAMPLE` and `AURA_LUMA_ALPHA` are also used by the fused display
 * grade: the latter indicates that the sample's alpha is luminance, not
 * coverage. The filtered result stays in the same colour space as its input.
 */

import { POST_COMMON_GLSL } from "./common.glsl.js";

export const FXAA_185_FNS_GLSL = /* glsl */ `
#ifndef AURA_FXAA_SAMPLE
#define AURA_FXAA_SAMPLE(tex, uv) texture(tex, uv)
#endif

float auraFxaaLuma(vec4 color) {
#if AURA_LUMA_ALPHA
  return color.a;
#else
  return dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
#endif
}

vec4 auraFxaaFetch(sampler2D tex, vec2 uv, vec2 texel) {
  vec2 halfTexel = texel * 0.5;
  return AURA_FXAA_SAMPLE(tex, clamp(uv, halfTexel, vec2(1.0) - halfTexel));
}

vec4 ApplyFXAA(sampler2D tex, vec2 texel, vec2 uv) {
  vec4 center = auraFxaaFetch(tex, uv, texel);
  vec4 west = auraFxaaFetch(tex, uv - vec2(texel.x, 0.0), texel);
  vec4 east = auraFxaaFetch(tex, uv + vec2(texel.x, 0.0), texel);
  vec4 south = auraFxaaFetch(tex, uv - vec2(0.0, texel.y), texel);
  vec4 north = auraFxaaFetch(tex, uv + vec2(0.0, texel.y), texel);
  float lc = auraFxaaLuma(center);
  float lw = auraFxaaLuma(west), le = auraFxaaLuma(east);
  float ls = auraFxaaLuma(south), ln = auraFxaaLuma(north);
  float lo = min(lc, min(min(lw, le), min(ls, ln)));
  float hi = max(lc, max(max(lw, le), max(ls, ln)));
  float range = hi - lo;
  if (range <= max(0.0312, hi * 0.063)) return center;

  // The pair across the larger gradient straddles the detected edge. The
  // weight grows with contrast but remains bounded to preserve image detail.
  float gx = abs(le - lw) + abs(le + lw - 2.0 * lc);
  float gy = abs(ln - ls) + abs(ln + ls - 2.0 * lc);
  vec4 a = gx >= gy ? west : south;
  vec4 b = gx >= gy ? east : north;
  float pairLuma = 0.5 * (auraFxaaLuma(a) + auraFxaaLuma(b));
  float amount = 0.5 * clamp(abs(pairLuma - lc) / max(range, 1e-6), 0.0, 1.0);
#if AURA_LUMA_ALPHA
  return mix(center, 0.5 * (a + b), amount);
#else
  float alpha = mix(center.a, 0.5 * (a.a + b.a), amount);
  vec3 premul = mix(center.rgb * center.a,
    0.5 * (a.rgb * a.a + b.rgb * b.a), amount);
  return vec4(alpha > 1e-6 ? premul / alpha : vec3(0.0), alpha);
#endif
}
`;

export const FXAA_185_FRAGMENT_GLSL = /* glsl */ `#version 300 es
precision highp float;
#define AURA_LUMA_ALPHA 0
uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform vec2 u_outputTexel;
out vec4 outColor;

${FXAA_185_FNS_GLSL}
${POST_COMMON_GLSL}

void main() {
  vec2 uv = gl_FragCoord.xy * u_outputTexel;
  vec4 color = ApplyFXAA(u_source, u_texelSize, uv);
  outColor = vec4(color.rgb
#if !defined(AURA_FXAA_NO_DITHER)
    + triangularDither(gl_FragCoord.xy, 0.0)
#endif
    , color.a);
}
`;
