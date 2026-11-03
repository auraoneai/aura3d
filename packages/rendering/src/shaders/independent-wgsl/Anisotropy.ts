/**
 * Independently authored anisotropic microfacet candidate. Its initializer and
 * direct BRDF are used only by the opt-in generated WebGPU source preview;
 * this is not evidence of WGSL compilation, GPU execution, or visual behavior.
 *
 * Sources and deliberate assumptions:
 * - Khronos, KHR_materials_anisotropy, “Anisotropy”, normative definition:
 *   https://github.com/KhronosGroup/glTF/blob/59ecbdba704206bb656965ab4e202881806066f1/extensions/2.0/Khronos/KHR_materials_anisotropy/README.md#anisotropy
 *   The normal distribution and alphaT = alphaB*(1-s*s)+s*s follow that
 *   definition. We interpret the API's vector as strength times the rotation
 *   direction; texture RG supplies an additional direction and B a multiplier.
 *   That API mapping is an assumption, not established compatibility.
 * - Heitz, “Understanding the Masking-Shadowing Function in Microfacet-Based
 *   BRDFs”, JCGT 3(2), 2014, equations 29, 80, 85, 86 and 99:
 *   https://jcgt.org/published/0003/02/03/paper.pdf
 *   We use the height-correlated Smith model, with V = G2/(4*NdotL*NdotV),
 *   and return the BRDF itself from Direct, without an NdotL light factor.
 * - glTF 2.0, Appendix B, “Fresnel”, displayed Schlick equation (informative):
 *   https://github.com/KhronosGroup/glTF/blob/59ecbdba704206bb656965ab4e202881806066f1/specification/2.0/Specification.adoc#fresnel
 *   Its fifth-power form has unit grazing reflectance; interpolating to this
 *   API's arbitrary f90 is a candidate assumption. The bent-normal construction
 *   is an environment-light heuristic, not an exact anisotropic integral.
 *
 * Directions are expected to be finite and in the same coordinate frame.
 * The tangent frame is expected to lie in the surface tangent plane. Inputs
 * outside physical ranges are bounded; non-finite inputs are not promised a
 * result under WGSL floating-point rules. A minimum alpha of 1e-4 regularizes
 * the otherwise singular zero-roughness distribution. Visibility is capped
 * near the horizon by a 2e-6 denominator, matching the active physical
 * visibility's equivalent 0.5/max(sum, 1e-6) regularization when isotropic;
 * the distribution's metric is also floored for inconsistent/degenerate dot
 * products. These cutoffs and the zero response at/below the horizon are
 * conventions, not GPU parity or visual-compatibility claims.
 *
 * External WGSL dependency: the separately declared A3DPrd04Lobes struct,
 * specifically its anisotropy, anisotropyT, anisotropyB and alphaT fields.
 */
export const A3D_PRD04_ANISOTROPY_WGSL = /* wgsl */ `
fn a3dPrd04AnisotropyUnitOr(value: vec3f, fallback: vec3f) -> vec3f {
  let scale = max(abs(value.x), max(abs(value.y), abs(value.z)));
  if (scale <= 0.000001) {
    return fallback;
  }
  let scaled = vec3f(value.x / scale, value.y / scale, value.z / scale);
  let factor = inverseSqrt(dot(scaled, scaled));
  return vec3f(scaled.x * factor, scaled.y * factor, scaled.z * factor);
}

fn a3dPrd04VGGXAnisotropic(alphaT: f32, alphaB: f32, dotTV: f32, dotBV: f32, dotTL: f32, dotBL: f32, dotNV: f32, dotNL: f32) -> f32 {
  let nv = clamp(dotNV, 0.0, 1.0);
  let nl = clamp(dotNL, 0.0, 1.0);
  if (nv <= 0.0 || nl <= 0.0) {
    return 0.0;
  }
  let at = clamp(alphaT, 0.0001, 1.0);
  let ab = clamp(alphaB, 0.0001, 1.0);
  let tv = at * clamp(dotTV, -1.0, 1.0);
  let bv = ab * clamp(dotBV, -1.0, 1.0);
  let tl = at * clamp(dotTL, -1.0, 1.0);
  let bl = ab * clamp(dotBL, -1.0, 1.0);
  let viewLength = sqrt(tv * tv + bv * bv + nv * nv);
  let lightLength = sqrt(tl * tl + bl * bl + nl * nl);
  let denominator = 2.0 * (nl * viewLength + nv * lightLength);
  return 1.0 / max(denominator, 0.000002);
}

fn a3dPrd04DGGXAnisotropic(alphaT: f32, alphaB: f32, dotNH: f32, dotTH: f32, dotBH: f32) -> f32 {
  if (dotNH <= 0.0) {
    return 0.0;
  }
  let at = clamp(alphaT, 0.0001, 1.0);
  let ab = clamp(alphaB, 0.0001, 1.0);
  let nh = clamp(dotNH, 0.0, 1.0);
  let th = clamp(dotTH, -1.0, 1.0) / at;
  let bh = clamp(dotBH, -1.0, 1.0) / ab;
  let metric = max(th * th + bh * bh + nh * nh, 0.00000001);
  return 1.0 / (3.141592653589793 * at * ab * metric * metric);
}

fn a3dPrd04AnisotropyInit(lobes: ptr<function, A3DPrd04Lobes>, anisotropyVector: vec2f, anisoTex: vec4f, useAnisoTex: bool, tangent: vec3f, bitangent: vec3f, roughness: f32) {
  let factorX = clamp(anisotropyVector.x, -1.0, 1.0);
  let factorY = clamp(anisotropyVector.y, -1.0, 1.0);
  let factorLength = sqrt(factorX * factorX + factorY * factorY);
  var directionX = 1.0;
  var directionY = 0.0;
  var strength = min(factorLength, 1.0);
  if (factorLength > 0.000001) {
    directionX = factorX / factorLength;
    directionY = factorY / factorLength;
  }
  if (useAnisoTex) {
    let texX = 2.0 * clamp(anisoTex.x, 0.0, 1.0) - 1.0;
    let texY = 2.0 * clamp(anisoTex.y, 0.0, 1.0) - 1.0;
    let texLength = sqrt(texX * texX + texY * texY);
    if (texLength > 0.000001) {
      let texDirectionX = texX / texLength;
      let texDirectionY = texY / texLength;
      let rotatedX = directionX * texDirectionX - directionY * texDirectionY;
      let rotatedY = directionX * texDirectionY + directionY * texDirectionX;
      directionX = rotatedX;
      directionY = rotatedY;
    }
    strength = strength * clamp(anisoTex.z, 0.0, 1.0);
  }
  let frameT = a3dPrd04AnisotropyUnitOr(tangent, vec3f(1.0, 0.0, 0.0));
  let initialB = a3dPrd04AnisotropyUnitOr(bitangent, vec3f(0.0));
  let alongT = dot(initialB, frameT);
  let perpendicularB = vec3f(initialB.x - alongT * frameT.x, initialB.y - alongT * frameT.y, initialB.z - alongT * frameT.z);
  var fallbackB = vec3f(-frameT.y, frameT.x, 0.0);
  if (abs(frameT.z) > 0.9) {
    fallbackB = vec3f(frameT.z, 0.0, -frameT.x);
  }
  fallbackB = a3dPrd04AnisotropyUnitOr(fallbackB, vec3f(0.0, 1.0, 0.0));
  let frameB = a3dPrd04AnisotropyUnitOr(perpendicularB, fallbackB);
  (*lobes).anisotropy = strength;
  (*lobes).anisotropyT = vec3f(frameT.x * directionX + frameB.x * directionY, frameT.y * directionX + frameB.y * directionY, frameT.z * directionX + frameB.z * directionY);
  (*lobes).anisotropyB = vec3f(frameB.x * directionX - frameT.x * directionY, frameB.y * directionX - frameT.y * directionY, frameB.z * directionX - frameT.z * directionY);
  let r = clamp(roughness, 0.0, 1.0);
  let alphaB = r * r;
  (*lobes).alphaT = alphaB * (1.0 - strength * strength) + strength * strength;
}

fn a3dPrd04AnisotropyDirect(lightDir: vec3f, viewDir: vec3f, normal: vec3f, f0: vec3f, f90: f32, roughness: f32, lobes: A3DPrd04Lobes) -> vec3f {
  let n = a3dPrd04AnisotropyUnitOr(normal, vec3f(0.0));
  let v = a3dPrd04AnisotropyUnitOr(viewDir, vec3f(0.0));
  let l = a3dPrd04AnisotropyUnitOr(lightDir, vec3f(0.0));
  let nv = dot(n, v);
  let nl = dot(n, l);
  if (nv <= 0.0 || nl <= 0.0) {
    return vec3f(0.0);
  }
  let h = a3dPrd04AnisotropyUnitOr(vec3f(v.x + l.x, v.y + l.y, v.z + l.z), vec3f(0.0));
  if (dot(h, h) < 0.5) {
    return vec3f(0.0);
  }
  let r = clamp(roughness, 0.0, 1.0);
  let d = a3dPrd04DGGXAnisotropic(lobes.alphaT, r * r, dot(n, h), dot(lobes.anisotropyT, h), dot(lobes.anisotropyB, h));
  let visibility = a3dPrd04VGGXAnisotropic(lobes.alphaT, r * r, dot(lobes.anisotropyT, v), dot(lobes.anisotropyB, v), dot(lobes.anisotropyT, l), dot(lobes.anisotropyB, l), nv, nl);
  let oneMinusVH = 1.0 - clamp(dot(v, h), 0.0, 1.0);
  let fifthPower = oneMinusVH * oneMinusVH * oneMinusVH * oneMinusVH * oneMinusVH;
  let end = clamp(f90, 0.0, 1.0);
  let red = clamp(f0.x, 0.0, 1.0);
  let green = clamp(f0.y, 0.0, 1.0);
  let blue = clamp(f0.z, 0.0, 1.0);
  let scale = d * visibility;
  return vec3f((red + (end - red) * fifthPower) * scale, (green + (end - green) * fifthPower) * scale, (blue + (end - blue) * fifthPower) * scale);
}

fn a3dPrd04AnisotropyBentNormal(viewDir: vec3f, normal: vec3f, roughness: f32, bitangent: vec3f, anisotropy: f32) -> vec3f {
  let n = a3dPrd04AnisotropyUnitOr(normal, vec3f(0.0));
  let v = a3dPrd04AnisotropyUnitOr(viewDir, vec3f(0.0));
  if (dot(n, n) < 0.5 || dot(n, v) <= 0.0) {
    return n;
  }
  let rawB = a3dPrd04AnisotropyUnitOr(bitangent, vec3f(0.0));
  let bNormal = dot(rawB, n);
  let b = a3dPrd04AnisotropyUnitOr(vec3f(rawB.x - bNormal * n.x, rawB.y - bNormal * n.y, rawB.z - bNormal * n.z), vec3f(0.0));
  if (dot(b, b) < 0.5) {
    return n;
  }
  let alongB = dot(v, b);
  let projectedV = a3dPrd04AnisotropyUnitOr(vec3f(v.x - alongB * b.x, v.y - alongB * b.y, v.z - alongB * b.z), n);
  let weight = clamp(anisotropy, 0.0, 1.0) * (1.0 - clamp(roughness, 0.0, 1.0));
  return a3dPrd04AnisotropyUnitOr(vec3f(n.x + weight * (projectedV.x - n.x), n.y + weight * (projectedV.y - n.y), n.z + weight * (projectedV.z - n.z)), n);
}
`;

export default A3D_PRD04_ANISOTROPY_WGSL;
