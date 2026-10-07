/**
 * C-18 chunk `a3d_prd06_skinning_common` (PRD-06 §8.1) — bone-texture skinning.
 * Replaces the legacy `u_jointPaletteMode`/`u_jointMatrices[96]` dual mode; the
 * palette lives in an RGBA32F texture, four texels per mat4, persistent per
 * skin via `SkinningPaletteTextureCache`. Registered from `lanes/prd06.ts`.
 */
export const A3D_PRD06_SKINNING_COMMON_GLSL = /* glsl */ `
#ifdef A3D_SKINNING
uniform highp sampler2D u_boneTexture;        // RGBA32F, 4 texels per mat4, persistent per skin
uniform int u_boneTextureWidth;               // multiple of 4
#ifdef A3D_VELOCITY
uniform highp sampler2D u_prevBoneTexture;
#endif
// Existing attribute names/locations kept (ShaderLibrary.ts skinned-unlit + 8-influence fork).
layout(location = 5) in vec4 a_joints;        // float today; uvec4 once WebGL2Device supports vertexAttribIPointer
layout(location = 6) in vec4 a_weights;
#if A3D_SKINNING == 8
layout(location = 8) in vec4 a_joints1;       // existing JOINTS_1 location
layout(location = 9) in vec4 a_weights1;      // existing WEIGHTS_1 location
#endif
mat4 a3dBone(highp sampler2D tex, float jf) {
  int i = int(jf + 0.5) * 4; int y = i / u_boneTextureWidth; int x = i - y * u_boneTextureWidth;
  return mat4(texelFetch(tex, ivec2(x, y), 0), texelFetch(tex, ivec2(x + 1, y), 0),
              texelFetch(tex, ivec2(x + 2, y), 0), texelFetch(tex, ivec2(x + 3, y), 0));
}
mat4 a3dSkin(highp sampler2D tex) {
  mat4 m = a3dBone(tex, a_joints.x) * a_weights.x + a3dBone(tex, a_joints.y) * a_weights.y
         + a3dBone(tex, a_joints.z) * a_weights.z + a3dBone(tex, a_joints.w) * a_weights.w;
#if A3D_SKINNING == 8
  m += a3dBone(tex, a_joints1.x) * a_weights1.x + a3dBone(tex, a_joints1.y) * a_weights1.y
     + a3dBone(tex, a_joints1.z) * a_weights1.z + a3dBone(tex, a_joints1.w) * a_weights1.w;
#endif
  return m;
}
#endif
`;
