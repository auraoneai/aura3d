/**
 * C-18 chunk `a3d_prd06_morph_texture` (PRD-06 §8.2) — `sampler2DArray` morph
 * deltas packed by `resources/MorphTargetTexture.ts` (texel j = vertexId*stride
 * + attr, z = target). Only the top-K active targets upload per frame; the
 * packed index/weight vectors cost `A3D_MORPH_MAX_ACTIVE/4` vec4 slots each.
 */
export const A3D_PRD06_MORPH_TEXTURE_GLSL = /* glsl */ `
#ifdef A3D_MORPH
uniform highp sampler2DArray u_morphTexture;   // layer = target, texel = vertexId * stride + attr
uniform int   u_morphStride;                   // 1 (pos) | 2 (pos,normal) | 3 (pos,normal,tangent)
uniform int   u_morphTexWidth;
uniform int   u_morphActiveCount;              // <= A3D_MORPH_MAX_ACTIVE (8 Low, 16 Med, 32 High, 64 Ultra); multiple of 4
// Packed 4 per vec4: a scalar uniform array costs one vec4 slot PER ELEMENT under GLSL ES 3.00 packing,
// so three 64-element scalar arrays would cost 192 of the 256 guaranteed vertex vectors. Packed: 48 at Ultra.
uniform ivec4 u_morphActiveIndex4[A3D_MORPH_MAX_ACTIVE / 4];
uniform vec4  u_morphActiveWeight4[A3D_MORPH_MAX_ACTIVE / 4];
#ifdef A3D_VELOCITY
uniform vec4  u_morphPrevWeight4[A3D_MORPH_MAX_ACTIVE / 4]; // same index list, previous-frame weights (0 if newly active)
#endif
vec4 a3dMorphFetch(int target, int attr) {
  int t = gl_VertexID * u_morphStride + attr; int y = t / u_morphTexWidth;
  return texelFetch(u_morphTexture, ivec3(t - y * u_morphTexWidth, y, target), 0);
}
void a3dApplyMorph(inout vec3 p, inout vec3 n, inout vec4 tg) {
  for (int k = 0; k < A3D_MORPH_MAX_ACTIVE; ++k) {
    if (k >= u_morphActiveCount) break;
    int tgt = u_morphActiveIndex4[k >> 2][k & 3]; float w = u_morphActiveWeight4[k >> 2][k & 3];
    p += a3dMorphFetch(tgt, 0).xyz * w;
    if (u_morphStride > 1) n += a3dMorphFetch(tgt, 1).xyz * w;
    if (u_morphStride > 2) tg.xyz += a3dMorphFetch(tgt, 2).xyz * w;
  }
}
#endif
`;
