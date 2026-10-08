/**
 * PRD-06 T2.7 — WGSL twin of `a3d_prd06_deform`
 * (`shaders/deform/deform.glsl.ts`). The GLSL `#ifdef` matrix
 * (A3D_DEPTH_ONLY / A3D_NEED_NORMAL / A3D_HAS_TANGENT / A3D_MORPH /
 * A3D_SKINNING==4|8 / A3D_VELOCITY) has no preprocessor equivalent in WGSL:
 * the twin takes the caller's pre-selected inputs plus `applyMorph`,
 * `applySkin`, and `secondInfluences` selectors, and the generated entry
 * point passes exactly the define-selected set. `a3dDeformPrevious` is the
 * §8.5 velocity variant — same index list, previous-frame weights and
 * palette.
 *
 * Return type replaces the GLSL `out` parameters with a struct.
 */

export const A3D_PRD06_DEFORM_WGSL = /* wgsl */ `
struct A3dDeformOut {
  localPos: vec4<f32>,
  localNormal: vec3<f32>,
  localTangent: vec4<f32>,
};

fn a3dSkinWeightSum(weights: vec4<f32>, weights1: vec4<f32>, secondInfluences: bool) -> f32 {
  var wsum = weights.x + weights.y + weights.z + weights.w;
  if (secondInfluences) {
    wsum = wsum + weights1.x + weights1.y + weights1.z + weights1.w;
  }
  return wsum;
}

fn a3dSkinSelect(joints: vec4<u32>, weights: vec4<f32>, joints1: vec4<u32>, weights1: vec4<f32>, secondInfluences: bool) -> mat4x4<f32> {
  if (secondInfluences) {
    return a3dSkin8(joints, weights, joints1, weights1);
  }
  return a3dSkin4(joints, weights);
}
fn a3dSkinPrevSelect(joints: vec4<u32>, weights: vec4<f32>, joints1: vec4<u32>, weights1: vec4<f32>, secondInfluences: bool) -> mat4x4<f32> {
  if (secondInfluences) {
    return a3dSkinPrev8(joints, weights, joints1, weights1);
  }
  return a3dSkinPrev4(joints, weights);
}

fn a3dDeform(position: vec3<f32>, normal: vec3<f32>, tangent: vec4<f32>,
             joints: vec4<u32>, weights: vec4<f32>,
             joints1: vec4<u32>, weights1: vec4<f32>,
             secondInfluences: bool, vertexIndex: u32,
             applyMorph: bool, applySkin: bool) -> A3dDeformOut {
  var p = position;
  var n = normal;
  var tg = tangent;
  var result: A3dDeformOut;
  if (applyMorph) {
    a3dApplyMorph(vertexIndex, &p, &n, &tg);
  }
  // Zero-weight guard (legacy skinned-unlit semantics): an unweighted vertex
  // on a skinned mesh keeps its raw position instead of collapsing to origin.
  if (applySkin && a3dSkinWeightSum(weights, weights1, secondInfluences) > 1e-4) {
    let s = a3dSkinSelect(joints, weights, joints1, weights1, secondInfluences);
    let s3 = mat3x3<f32>(s[0].xyz, s[1].xyz, s[2].xyz);
    result.localPos = s * vec4<f32>(p, 1.0);
    result.localNormal = s3 * n;
    result.localTangent = vec4<f32>(s3 * tg.xyz, tg.w);
  } else {
    result.localPos = vec4<f32>(p, 1.0);
    result.localNormal = n;
    result.localTangent = tg;
  }
  return result;
}

fn a3dDeformPrevious(position: vec3<f32>,
                     joints: vec4<u32>, weights: vec4<f32>,
                     joints1: vec4<u32>, weights1: vec4<f32>,
                     secondInfluences: bool, vertexIndex: u32,
                     applyMorph: bool, applySkin: bool) -> vec4<f32> {
  var p = position;
  if (applyMorph) {
    for (var k: u32 = 0u; k < A3D_MORPH_MAX_ACTIVE; k = k + 1u) {
      if (k >= a3dMorphActiveCount()) { break; }
      let tgt = a3dMorphTargetIndex(k);
      p = p + a3dMorphFetch(vertexIndex, tgt, 0u).xyz * a3dMorphPrevWeight(k);
    }
  }
  if (applySkin && a3dSkinWeightSum(weights, weights1, secondInfluences) > 1e-4) {
    return a3dSkinPrevSelect(joints, weights, joints1, weights1, secondInfluences) * vec4<f32>(p, 1.0);
  }
  return vec4<f32>(p, 1.0);
}
`;
