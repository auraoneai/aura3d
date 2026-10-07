/**
 * a3d_prd02_shadow_lookup — receiver-side shadow sampling (PRD-02 §8).
 * Compare-texture path (sampler2DShadow) with three kernels selected by
 * A3D_SHADOW_FILTER: 1 = HW single tap (pcf2 tiers), 2 = Castaño 5×5
 * tent-weighted (pcf3), 3 = Vogel disk 16-tap (pcf5). PCSS is opted-in via
 * A3D_SHADOW_PCSS + the raw depth sampler (u_prd02ShadowRaw).
 *
 * Samplers are individually named (u_prd02CascadeCompare0..3) because sampler
 * arrays need constant-index access in ES 3.00 and the device binds one
 * texture unit per named uniform.
 */
export const SHADOW_RECEIVE_CHUNK_GLSL = /* glsl */ `
#ifndef A3D_SHADOW_FILTER
#define A3D_SHADOW_FILTER 1
#endif
#ifndef A3D_CASCADE_COUNT
#define A3D_CASCADE_COUNT 1
#endif

uniform highp sampler2DShadow u_prd02CascadeCompare0;
uniform highp sampler2DShadow u_prd02CascadeCompare1;
uniform highp sampler2DShadow u_prd02CascadeCompare2;
uniform highp sampler2DShadow u_prd02CascadeCompare3;
uniform highp sampler2DShadow u_prd02LocalCompare;  // local-light atlas (compare)
uniform highp sampler2D u_prd02ShadowRaw;           // atlas raw depth (PCSS source)
uniform mat4 u_prd02CascadeMatrix[4];
uniform vec4 u_prd02CascadeSplits;                  // far split distance per cascade
uniform vec4 u_prd02CascadeTexelWorld;              // world-space texel per cascade
uniform float u_prd02ShadowMapSize;
uniform float u_prd02NormalBias;                    // normal bias in texel units
uniform float u_prd02ShadowStrength;                // 0..1 receive strength
uniform vec4 u_prd02ShadowAtlasRect[6];             // local tile rect (normalized u0,v0,du,dv)
uniform mat4 u_prd02LocalShadowMatrix[6];
uniform vec4 u_prd02LocalShadowIndex[6];            // (lightIndex, tileSlot) packed vec4

// Vogel disk 16-tap offsets (unit disk, golden angle spiral).
const vec2 A3D_VOGEL_16[16] = vec2[16](
  vec2( 0.0000,  0.0000), vec2( 0.2955, -0.1907), vec2(-0.3635,  0.5008),
  vec2( 0.1674, -0.7286), vec2( 0.2355,  0.7716), vec2(-0.6167, -0.6063),
  vec2( 0.8144,  0.2760), vec2(-0.7660,  0.1240), vec2( 0.4848, -0.4589),
  vec2(-0.0575,  0.6503), vec2(-0.3834, -0.6652), vec2( 0.6893,  0.4934),
  vec2(-0.8225, -0.1722), vec2( 0.7588, -0.2061), vec2(-0.5091,  0.5230),
  vec2( 0.1339, -0.6999)
);

float a3d_shadowTap(highp sampler2DShadow tex, vec3 proj) {
  return texture(tex, proj);
}

float a3d_shadowFiltered(highp sampler2DShadow tex, vec3 proj, float texel) {
#if A3D_SHADOW_FILTER == 1
  return a3d_shadowTap(tex, proj);
#elif A3D_SHADOW_FILTER == 2
  // Castaño 5×5 tent filter.
  vec2 offset = fract(proj.xy / texel - 0.5) * 0.5;
  vec2 base = proj.xy - offset * texel;
  vec2 uw = vec2(3.0 - 2.0 * offset.x, 1.0 + 2.0 * offset.x);
  vec2 vw = vec2(3.0 - 2.0 * offset.y, 1.0 + 2.0 * offset.y);
  float sum = 0.0;
  sum += uw.x * vw.x * a3d_shadowTap(tex, vec3(base + vec2(-1.5, -1.5) * texel, proj.z));
  sum += uw.y * vw.x * a3d_shadowTap(tex, vec3(base + vec2( 0.5, -1.5) * texel, proj.z));
  sum += uw.x * vw.y * a3d_shadowTap(tex, vec3(base + vec2(-1.5,  0.5) * texel, proj.z));
  sum += uw.y * vw.y * a3d_shadowTap(tex, vec3(base + vec2( 0.5,  0.5) * texel, proj.z));
  return sum / ((uw.x + uw.y) * (vw.x + vw.y));
#else
  // Vogel 16-tap disk.
  float radius = texel * 1.5;
  float sum = 0.0;
  for (int i = 0; i < 16; i += 1) {
    sum += a3d_shadowTap(tex, vec3(proj.xy + A3D_VOGEL_16[i] * radius, proj.z));
  }
  return sum / 16.0;
#endif
}

// Which cascade covers this view-space depth (linear distance).
int a3d_selectCascade(float viewDepth) {
  int c = A3D_CASCADE_COUNT - 1;
  if (viewDepth < u_prd02CascadeSplits.x) c = 0;
#if A3D_CASCADE_COUNT >= 2
  else if (viewDepth < u_prd02CascadeSplits.y) c = 1;
#endif
#if A3D_CASCADE_COUNT >= 3
  else if (viewDepth < u_prd02CascadeSplits.z) c = 2;
#endif
#if A3D_CASCADE_COUNT >= 4
  else if (viewDepth < u_prd02CascadeSplits.w) c = 3;
#endif
  return c;
}

float a3d_cascadeTap0(vec3 proj) { return a3d_shadowFiltered(u_prd02CascadeCompare0, proj, 1.0 / u_prd02ShadowMapSize); }
float a3d_cascadeTap1(vec3 proj) { return a3d_shadowFiltered(u_prd02CascadeCompare1, proj, 1.0 / u_prd02ShadowMapSize); }
float a3d_cascadeTap2(vec3 proj) { return a3d_shadowFiltered(u_prd02CascadeCompare2, proj, 1.0 / u_prd02ShadowMapSize); }
float a3d_cascadeTap3(vec3 proj) { return a3d_shadowFiltered(u_prd02CascadeCompare3, proj, 1.0 / u_prd02ShadowMapSize); }

float a3d_sunShadow(vec3 worldPos, vec3 worldNormal, float viewDepth) {
  int c = a3d_selectCascade(viewDepth);
  // Normal bias in world units: N × texelWorld(c) × configured texel count.
  vec3 biased = worldPos + worldNormal * (u_prd02CascadeTexelWorld[c] * u_prd02NormalBias);
  vec4 p = u_prd02CascadeMatrix[c] * vec4(biased, 1.0);
  vec3 proj = p.xyz / max(p.w, 1e-6);
  if (proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0) return 1.0;
  float lit;
  if (c == 0) lit = a3d_cascadeTap0(proj);
#if A3D_CASCADE_COUNT >= 2
  else if (c == 1) lit = a3d_cascadeTap1(proj);
#endif
#if A3D_CASCADE_COUNT >= 3
  else if (c == 2) lit = a3d_cascadeTap2(proj);
#endif
#if A3D_CASCADE_COUNT >= 4
  else lit = a3d_cascadeTap3(proj);
#endif
#if A3D_CASCADE_COUNT < 4
  else lit = a3d_cascadeTap0(proj);
#endif
  return mix(1.0, lit, u_prd02ShadowStrength);
}

// Local (point/spot) tile lookup in the atlas — compare path.
// shadowIndex indexes the packed u_prd02ShadowAtlasRect/u_prd02LocalShadowMatrix
// slot for this light (from u_prd02LocalShadowIndex / perLightShadowIndex).
float a3d_localShadow(int shadowIndex, vec3 worldPos, vec3 worldNormal) {
  if (shadowIndex < 0 || shadowIndex >= 6) return 1.0;
  vec3 biased = worldPos + worldNormal * (u_prd02NormalBias / max(u_prd02ShadowMapSize, 1.0));
  vec4 p = u_prd02LocalShadowMatrix[shadowIndex] * vec4(biased, 1.0);
  vec3 proj = p.xyz / max(p.w, 1e-6);
  if (proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0) return 1.0;
  vec4 rect = u_prd02ShadowAtlasRect[shadowIndex];
  vec2 uv = rect.xy + proj.xy * rect.zw;
  float lit = a3d_shadowFiltered(u_prd02LocalCompare, vec3(uv, proj.z), 1.0 / u_prd02ShadowMapSize);
  return mix(1.0, lit, u_prd02ShadowStrength);
}
`;
