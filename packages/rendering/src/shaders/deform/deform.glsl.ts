/**
 * C-18 chunk `a3d_prd06_deform` (PRD-06 §8.3/§8.5) — the shared deformation
 * entry spliced at hook `vertex:deform` by feature `prd06.deform`. Ordering is
 * morph → skin → model (glTF/three.js). `A3D_DEPTH_ONLY` skips normal/tangent
 * work for depth and distance passes; `A3D_HAS_TANGENT` guards the tangent
 * attribute; `A3D_VELOCITY` exposes `a3dDeformPrevious` for C-14.
 *
 * Depends on `a3d_prd06_skinning_common` and `a3d_prd06_morph_texture` being
 * spliced ahead of it (both are `#ifdef`-guarded no-ops when inactive).
 *
 * `a_normal` is only declared when the program defines `A3D_NEED_NORMAL`
 * (unlit forward variants do not), so the deform read guards on it as well;
 * `a_tangent` (legacy location 3) is declared here under `A3D_HAS_TANGENT`
 * since the generated attribute block does not carry it.
 */
export const A3D_PRD06_DEFORM_GLSL = /* glsl */ `
#ifdef A3D_HAS_TANGENT
layout(location = 3) in vec4 a_tangent;
#endif
void a3dDeform(out vec4 localPos, out vec3 localNormal, out vec4 localTangent) {
#ifdef A3D_DEPTH_ONLY
  vec3 p = a_position;
  vec3 n = vec3(0.0); vec4 tg = vec4(0.0, 0.0, 0.0, 1.0);
#else
  vec3 p = a_position;
#ifdef A3D_NEED_NORMAL
  vec3 n = a_normal;
#else
  vec3 n = vec3(0.0, 0.0, 1.0);
#endif
#ifdef A3D_HAS_TANGENT
  vec4 tg = a_tangent;
#else
  vec4 tg = vec4(0.0, 0.0, 0.0, 1.0);
#endif
#endif
#ifdef A3D_MORPH
  a3dApplyMorph(p, n, tg);
#endif
#ifdef A3D_SKINNING
  // Zero-weight guard (legacy ShaderLibrary skinned-unlit semantics): an
  // unweighted vertex on a skinned mesh keeps its raw position instead of
  // collapsing to the origin.
  float a3d_wsum = a_weights.x + a_weights.y + a_weights.z + a_weights.w;
#if A3D_SKINNING == 8
  a3d_wsum += a_weights1.x + a_weights1.y + a_weights1.z + a_weights1.w;
#endif
  if (a3d_wsum > 1e-4) {
    mat4 s = a3dSkin(u_boneTexture);
    // Affine output (three.js transformed parity): the skinned point is the
    // blend's xyz with w pinned to 1. Some palette producers pack per-joint
    // data in the matrix bottom row; letting it into gl_Position would
    // projectively warp the rasterized silhouette away from the positions
    // a CPU skinning reference computes.
    vec4 a3d_skinned = s * vec4(p, 1.0);
    localPos = vec4(a3d_skinned.xyz, 1.0);
    localNormal = mat3(s) * n;
    localTangent = vec4(mat3(s) * tg.xyz, tg.w);
  } else {
    localPos = vec4(p, 1.0); localNormal = n; localTangent = tg;
  }
#else
  localPos = vec4(p, 1.0); localNormal = n; localTangent = tg;
#endif
}
#ifdef A3D_VELOCITY
void a3dDeformPrevious(out vec4 pos) {
  vec3 p = a_position; vec3 n = vec3(0.0); vec4 tg = vec4(0.0, 0.0, 0.0, 1.0);
#ifdef A3D_MORPH
  for (int k = 0; k < A3D_MORPH_MAX_ACTIVE; ++k) {
    if (k >= int(u_morphActiveCount)) break;
    int tgt = a3dMorphTargetIndex(k); float w = u_morphPrevWeight4[k >> 2][k & 3];
    p += a3dMorphFetch(tgt, 0).xyz * w;
  }
#endif
#ifdef A3D_SKINNING
  float a3d_wsum = a_weights.x + a_weights.y + a_weights.z + a_weights.w;
#if A3D_SKINNING == 8
  a3d_wsum += a_weights1.x + a_weights1.y + a_weights1.z + a_weights1.w;
#endif
  if (a3d_wsum > 1e-4) {
    vec4 a3d_prev = a3dSkin(u_prevBoneTexture) * vec4(p, 1.0);
    pos = vec4(a3d_prev.xyz, 1.0);
  } else {
    pos = vec4(p, 1.0);
  }
#else
  pos = vec4(p, 1.0);
#endif
}
#endif
`;
