/**
 * PRD-03 §8.4 — S2 GTAO denoise + joint-bilateral upsample/apply (WebGL2).
 *
 * `GTAO_DENOISE_GLSL` runs twice (H then V, `u_dir`): a 5-tap bilateral over
 * the half-res R8 AO, `w_i = gauss_i · exp(−|Δz| / (0.05·z))` on the paired
 * linear-depth texture.
 *
 * `GTAO_APPLY_GLSL` is the fused joint-bilateral upsample + apply: it reads
 * the denoised half-res AO (2×2 taps depth-weighted against the full-res
 * linear depth) and multiplies the full-res HDR per §6.3:
 *   `hdr.rgb *= mix(1.0, aoMB, w)`
 *   `aoMB = max(ao, ((ao·a + b)·ao + c)·ao)`   Jimenez 2016 multi-bounce,
 *        a = 2.0404ρ−0.3324, b = −4.7951ρ+0.6417, c = 2.7552ρ+0.6903, ρ = 0.5
 *   `w = hdr.a` when feature `prd03.indirectFraction` is active
 *        (`AURA_AO_INDIRECT_FRACTION`), else
 *   `w = u_aoFallbackStrength · (1 − sky) · step(luma(hdr), 4.0)`
 *        with `sky = linZ ≥ far·0.999`.
 */

const HEADER = `#version 300 es
precision highp float;
`;

const BILATERAL_WEIGHTS = /* glsl */ `
// 5-tap gaussian (sigma 1.0) × exponential depth term exp(-|dz|/(0.05*z)).
float aoWeight(float dz, float z, float g) {
  return g * exp(-abs(dz) / max(0.05 * z, 1e-4));
}
const float GAUSS_5[5] = float[5](0.06136, 0.24477, 0.38774, 0.24477, 0.06136);
`;

export const GTAO_DENOISE_GLSL = /* glsl */ `${HEADER}
uniform sampler2D u_ao;              // half-res R8
uniform highp sampler2D u_depthHalf; // half-res linear depth (.r)
uniform vec2 u_dir;                  // (texel.x, 0) then (0, texel.y)
out vec4 o_color;

${BILATERAL_WEIGHTS}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 texel = vec2(textureSize(u_ao, 0));
  float centerAo = texelFetch(u_ao, p, 0).r;
  float centerZ = texelFetch(u_depthHalf, p, 0).r;
  float total = GAUSS_5[2];
  float sum = centerAo * GAUSS_5[2];
  for (int i = -2; i <= 2; ++i) {
    if (i == 0) continue;
    ivec2 s = p + ivec2(u_dir * texel * float(i));
    s = clamp(s, ivec2(0), ivec2(texel) - 1);
    float z = texelFetch(u_depthHalf, s, 0).r;
    float w = aoWeight(z - centerZ, centerZ, GAUSS_5[i + 2]);
    sum += texelFetch(u_ao, s, 0).r * w;
    total += w;
  }
  o_color = vec4(sum / total, 0.0, 0.0, 1.0);
}
`;

export const GTAO_APPLY_GLSL = /* glsl */ `${HEADER}
uniform sampler2D u_hdr;             // full-res HDR (linear)
uniform sampler2D u_ao;              // denoised half-res R8
uniform highp sampler2D u_depthFull; // full-res linear depth
uniform highp sampler2D u_depthHalf;
uniform float u_far;
uniform float u_aoFallbackStrength;
uniform bool u_aoMultiBounce;
out vec4 o_color;

// Jimenez 2016 multi-bounce polynomial, albedoProxy ρ = 0.5.
float aoMultiBounce(float ao) {
  float a = 2.0404 * 0.5 - 0.3324;
  float b = -4.7951 * 0.5 + 0.6417;
  float c = 2.7552 * 0.5 + 0.6903;
  return max(ao, ((ao * a + b) * ao + c) * ao);
}

// Joint-bilateral upsample: the four half-res taps around the bilinear
// coordinate, weighted by depth similarity to the full-res texel.
float upsampleAo(vec2 uvHalf, float fullZ, vec2 halfSize) {
  vec2 p = uvHalf * halfSize - 0.5;
  ivec2 p0 = ivec2(floor(p));
  vec2 f = p - vec2(p0);
  float sum = 0.0;
  float total = 0.0;
  for (int y = 0; y < 2; ++y) {
    for (int x = 0; x < 2; ++x) {
      ivec2 s = clamp(p0 + ivec2(x, y), ivec2(0), ivec2(halfSize) - 1);
      float z = texelFetch(u_depthHalf, s, 0).r;
      float w = aoWeight(z - fullZ, fullZ,
                         (x == 0 ? 1.0 - f.x : f.x) * (y == 0 ? 1.0 - f.y : f.y));
      sum += texelFetch(u_ao, s, 0).r * w;
      total += w;
    }
  }
  return total > 0.0 ? sum / total : 1.0;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 hdr = texelFetch(u_hdr, p, 0);
  float fullZ = texelFetch(u_depthFull, p, 0).r;
  vec2 halfSize = vec2(textureSize(u_ao, 0));
  vec2 uvHalf = gl_FragCoord.xy / vec2(textureSize(u_hdr, 0));
  float ao = upsampleAo(uvHalf, fullZ, halfSize);
  float aoMB = u_aoMultiBounce ? aoMultiBounce(ao) : ao;

#ifdef AURA_AO_INDIRECT_FRACTION
  float w = hdr.a;
#else
  float sky = step(u_far * 0.999, fullZ);
  float luma = dot(hdr.rgb, vec3(0.2126, 0.7152, 0.0722));
  float w = u_aoFallbackStrength * (1.0 - sky) * step(luma, 4.0);
#endif
  hdr.rgb *= mix(1.0, aoMB, w);
  o_color = hdr;
}
`;
