/**
 * C-18 chunk `a3d_prd06_skinning_common` (PRD-06 §8.1) — bone-texture skinning.
 * Replaces the legacy `u_jointPaletteMode`/`u_jointMatrices[96]` dual mode; the
 * palette lives in an RGBA32F texture, four texels per mat4, persistent per
 * skin via `SkinningPaletteTextureCache`. Registered from `lanes/prd06.ts`.
 */
export const A3D_PRD06_SKINNING_COMMON_GLSL = /* glsl */ `
#ifdef A3D_SKINNING
uniform highp sampler2D u_boneTexture;        // RGBA32F, 4 texels per mat4, persistent per skin
uniform float u_boneTextureWidth;             // multiple of 4 — §8.1 int, bound as float (no integer uniform uploads yet)
#ifdef A3D_VELOCITY
uniform highp sampler2D u_prevBoneTexture;
#endif
// Keep the geometry's existing names/locations and match its actual shader
// input type. Integer joint streams must be bound with vertexAttribIPointer.
#if defined(A3D_JOINT0_UINT)
layout(location = 5) in uvec4 a_joints;
#elif defined(A3D_JOINT0_SINT)
layout(location = 5) in ivec4 a_joints;
#else
layout(location = 5) in vec4 a_joints;
#endif
layout(location = 6) in vec4 a_weights;
#if A3D_SKINNING == 8
#if defined(A3D_JOINT1_UINT)
layout(location = 8) in uvec4 a_joints1;
#elif defined(A3D_JOINT1_SINT)
layout(location = 8) in ivec4 a_joints1;
#else
layout(location = 8) in vec4 a_joints1;
#endif
layout(location = 9) in vec4 a_weights1;      // existing WEIGHTS_1 location
#endif
mat4 a3dBone(highp sampler2D tex, float jf) {
  int i = int(jf + 0.5) * 4; int w = int(u_boneTextureWidth + 0.5); int y = i / w; int x = i - y * w;
  return mat4(texelFetch(tex, ivec2(x, y), 0), texelFetch(tex, ivec2(x + 1, y), 0),
              texelFetch(tex, ivec2(x + 2, y), 0), texelFetch(tex, ivec2(x + 3, y), 0));
}
mat4 a3dSkin(highp sampler2D tex) {
  vec4 joints0 = vec4(a_joints);
  mat4 m = a3dBone(tex, joints0.x) * a_weights.x + a3dBone(tex, joints0.y) * a_weights.y
         + a3dBone(tex, joints0.z) * a_weights.z + a3dBone(tex, joints0.w) * a_weights.w;
#if A3D_SKINNING == 8
  vec4 joints1 = vec4(a_joints1);
  m += a3dBone(tex, joints1.x) * a_weights1.x + a3dBone(tex, joints1.y) * a_weights1.y
     + a3dBone(tex, joints1.z) * a_weights1.z + a3dBone(tex, joints1.w) * a_weights1.w;
#endif
  return m;
}
#endif
`;
