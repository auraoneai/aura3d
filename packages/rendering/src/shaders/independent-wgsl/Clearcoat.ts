/**
 * Independent clearcoat experiment. Its direct BRDF is used only by the
 * opt-in generated WebGPU source preview; its initializer, indirect model,
 * and composition helper are not used there. This is not GPU evidence.
 *
 * Sources for the equations, not source code:
 * - Walter et al., Microfacet Models for Refraction through Rough Surfaces
 *   (2007), sections 4–5, especially the reflection, GGX and Smith equations:
 *   https://www.cs.cornell.edu/~srm/publications/EGSR07-btdf.pdf
 * - Heitz, Understanding the Masking-Shadowing Function in Microfacet-Based
 *   BRDFs (2014), sections 5–6, for separable Smith masking/shadowing:
 *   https://jcgt.org/published/0003/02/03/paper.pdf
 * - Schlick, An Inexpensive BRDF Model for Physically-based Rendering (1994):
 *   https://doi.org/10.1111/1467-8659.1330233
 * - Khronos, KHR_materials_clearcoat, intensity and roughness texture
 *   channels: https://github.com/KhronosGroup/glTF/blob/59ecbdba704206bb656965ab4e202881806066f1/extensions/2.0/Khronos/KHR_materials_clearcoat/README.md
 *
 * Interface/dependency: the host must declare A3DPrd04Lobes with mutable
 * clearcoat: f32, clearcoatRoughness: f32, and clearcoatNormal: vec3f fields,
 * as in the neutral independent-shader API declaration. No bindings or other
 * chunks are supplied here. Names/typing alone do not establish compatibility.
 *
 * Explicit modeling choices awaiting an integration contract:
 * - The factor texture uses red (.x), and the roughness texture uses green
 *   (.y), matching KHR_materials_clearcoat. Other channels are ignored. Inputs
 *   are linear, and white is the neutral texture. Factors/channels are
 *   individually restricted to [0, 1].
 * - The normal and directions are in a common space; no normal-map decoding or
 *   tangent-frame conversion occurs here. Invalid/zero directions contribute
 *   no coat, preserving the base at composition.
 * - Perceptual roughness r maps to GGX alpha = r², with r floored to 0.04
 *   during evaluation. Initialization adds geometry roughness in quadrature;
 *   that combination and floor are numerical/art-direction heuristics.
 * - A colorless air-to-1.5-IOR dielectric has F0 = ((1.5-1)/(1.5+1))² = .04.
 *   Direct returns BRDF × N·L for a unit-radiance directional light, without
 *   incident light color. It uses separable Smith, not correlated masking.
 * - Indirect is an intentionally crude F(N·V) × SmithG1(N·V, alpha) weighting
 *   of the supplied radiance; this is not an integrated environment BRDF or a
 *   roughness-dependent environment lookup. Composition attenuates the base by
 *   one view-side Fresnel factor and weights the coat by coverage. It does not
 *   model refraction, absorption, inter-layer multiple scattering, or exact
 *   energy conservation for arbitrary radiance distributions.
 * - Finite normals/directions of ordinary magnitudes and finite, bounded
 *   linear radiance are expected; hardware subnormal flushing, NaNs, infinities,
 *   over-range HDR math, WGSL compilation, and visual/parity behavior remain
 *   unverified. These source tests are not GPU execution evidence.
 */
export const A3D_PRD04_CLEARCOAT_WGSL = /* wgsl */ `
fn a3dPrd04CoatUnit(v: vec3f) -> vec3f {
  let m = max(max(abs(v.x), abs(v.y)), abs(v.z));
  if (!(m > 0.0 && m <= 3.0e38)) {
    return vec3f(0.0);
  }
  let x = v.x / m;
  let y = v.y / m;
  let z = v.z / m;
  let inverseLength = 1.0 / sqrt(x * x + y * y + z * z);
  return vec3f(x * inverseLength, y * inverseLength, z * inverseLength);
}

fn a3dPrd04CoatDot(a: vec3f, b: vec3f) -> f32 {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

fn a3dPrd04CoatFresnel(cosine: f32) -> f32 {
  let oneMinusCosine = 1.0 - clamp(cosine, 0.0, 1.0);
  let squared = oneMinusCosine * oneMinusCosine;
  return 0.04 + 0.96 * squared * squared * oneMinusCosine;
}

fn a3dPrd04CoatAlpha(roughness: f32) -> f32 {
  let r = clamp(roughness, 0.04, 1.0);
  return r * r;
}

fn a3dPrd04CoatMask(cosine: f32, alpha: f32) -> f32 {
  let c = clamp(cosine, 0.0, 1.0);
  let a2 = alpha * alpha;
  return 2.0 * c / (c + sqrt(a2 + (1.0 - a2) * c * c));
}

fn a3dPrd04ClearcoatInit(
  lobes: ptr<function, A3DPrd04Lobes>,
  clearcoatFactor: f32,
  clearcoatRoughnessFactor: f32,
  clearcoatTex: vec4f,
  roughnessTex: vec4f,
  clearcoatNormal: vec3f,
  geometryRoughness: f32
) {
  let factor = clamp(clearcoatFactor, 0.0, 1.0) * clamp(clearcoatTex.x, 0.0, 1.0);
  let roughness = clamp(clearcoatRoughnessFactor, 0.0, 1.0) * clamp(roughnessTex.y, 0.0, 1.0);
  let geometry = clamp(geometryRoughness, 0.0, 1.0);
  (*lobes).clearcoat = factor;
  (*lobes).clearcoatRoughness = min(sqrt(roughness * roughness + geometry * geometry), 1.0);
  (*lobes).clearcoatNormal = a3dPrd04CoatUnit(clearcoatNormal);
}

fn a3dPrd04ClearcoatDirect(
  lightDir: vec3f,
  viewDir: vec3f,
  normal: vec3f,
  clearcoatRoughness: f32
) -> vec3f {
  let n = a3dPrd04CoatUnit(normal);
  let l = a3dPrd04CoatUnit(lightDir);
  let v = a3dPrd04CoatUnit(viewDir);
  let noL = clamp(a3dPrd04CoatDot(n, l), 0.0, 1.0);
  let noV = clamp(a3dPrd04CoatDot(n, v), 0.0, 1.0);
  if (!(noL > 0.0 && noV > 0.0)) {
    return vec3f(0.0);
  }
  let h = a3dPrd04CoatUnit(vec3f(l.x + v.x, l.y + v.y, l.z + v.z));
  let noH = clamp(a3dPrd04CoatDot(n, h), 0.0, 1.0);
  let voH = clamp(a3dPrd04CoatDot(v, h), 0.0, 1.0);
  let alpha = a3dPrd04CoatAlpha(clearcoatRoughness);
  let a2 = alpha * alpha;
  let noH2 = noH * noH;
  let denominator = 1.0 - noH2 + a2 * noH2;
  let distribution = a2 / (3.141592653589793 * denominator * denominator);
  // G1(N·V)/(4 N·V) is rearranged to avoid a grazing-angle division by N·V.
  let viewRoot = sqrt(a2 + (1.0 - a2) * noV * noV);
  let visibility = 0.5 * a3dPrd04CoatMask(noL, alpha) / (noV + viewRoot);
  let reflected = a3dPrd04CoatFresnel(voH) * distribution * visibility;
  return vec3f(reflected);
}

fn a3dPrd04ClearcoatIndirect(
  normal: vec3f,
  viewDir: vec3f,
  clearcoatRoughness: f32,
  clearcoatRadiance: vec3f
) -> vec3f {
  let n = a3dPrd04CoatUnit(normal);
  let v = a3dPrd04CoatUnit(viewDir);
  let noV = clamp(a3dPrd04CoatDot(n, v), 0.0, 1.0);
  if (!(noV > 0.0)) {
    return vec3f(0.0);
  }
  let weight = a3dPrd04CoatFresnel(noV) * a3dPrd04CoatMask(noV, a3dPrd04CoatAlpha(clearcoatRoughness));
  return vec3f(clearcoatRadiance.x * weight, clearcoatRadiance.y * weight, clearcoatRadiance.z * weight);
}

fn a3dPrd04ComposeClearcoat(
  outgoing: vec3f,
  clearcoat: f32,
  clearcoatNormal: vec3f,
  viewDir: vec3f,
  clearcoatDirect: vec3f,
  clearcoatIndirect: vec3f
) -> vec3f {
  let coverage = clamp(clearcoat, 0.0, 1.0);
  let n = a3dPrd04CoatUnit(clearcoatNormal);
  let v = a3dPrd04CoatUnit(viewDir);
  if (!(coverage > 0.0) || !(a3dPrd04CoatDot(n, n) > 0.0) || !(a3dPrd04CoatDot(v, v) > 0.0) || a3dPrd04CoatDot(n, v) < 0.0) {
    return outgoing;
  }
  let baseWeight = 1.0 - coverage * a3dPrd04CoatFresnel(a3dPrd04CoatDot(n, v));
  return vec3f(
    outgoing.x * baseWeight + coverage * (clearcoatDirect.x + clearcoatIndirect.x),
    outgoing.y * baseWeight + coverage * (clearcoatDirect.y + clearcoatIndirect.y),
    outgoing.z * baseWeight + coverage * (clearcoatDirect.z + clearcoatIndirect.z)
  );
}
`;

export default A3D_PRD04_CLEARCOAT_WGSL;
