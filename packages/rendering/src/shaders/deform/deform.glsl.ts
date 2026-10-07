/**
 * C-18 chunk `a3d_prd06_deform` (PRD-06 §8.3/§8.5) — the shared deformation
 * entry spliced at hook `vertex:deform` by feature `prd06.deform`. Ordering is
 * morph → skin → model (glTF/three.js). `A3D_DEPTH_ONLY` skips normal/tangent
 * work for depth and distance passes; `A3D_HAS_TANGENT` guards the tangent
 * attribute; `A3D_VELOCITY` exposes `a3dDeformPrevious` for C-14.
 *
 * Depends on `a3d_prd06_skinning_common` and `a3d_prd06_morph_texture` being
 * spliced ahead of it (both are `#ifdef`-guarded no-ops when inactive).
 */
export const A3D_PRD06_DEFORM_GLSL = /* glsl */ `
void a3dDeform(out vec4 localPos, out vec3 localNormal, out vec4 localTangent) {
#ifdef A3D_DEPTH_ONLY
  vec3 p = a_position;
  vec3 n = vec3(0.0); vec4 tg = vec4(0.0, 0.0, 0.0, 1.0);
#else
  vec3 p = a_position; vec3 n = a_normal;
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
    localPos = s * vec4(p, 1.0);
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
    if (k >= u_morphActiveCount) break;
    int tgt = u_morphActiveIndex4[k >> 2][k & 3]; float w = u_morphPrevWeight4[k >> 2][k & 3];
    p += a3dMorphFetch(tgt, 0).xyz * w;
  }
#endif
#ifdef A3D_SKINNING
  float a3d_wsum = a_weights.x + a_weights.y + a_weights.z + a_weights.w;
#if A3D_SKINNING == 8
  a3d_wsum += a_weights1.x + a_weights1.y + a_weights1.z + a_weights1.w;
#endif
  if (a3d_wsum > 1e-4) {
    pos = a3dSkin(u_prevBoneTexture) * vec4(p, 1.0);
  } else {
    pos = vec4(p, 1.0);
  }
#else
  pos = vec4(p, 1.0);
#endif
}
#endif
`;
