/**
 * WGSL companion of Aura's `a3d_prd04_anisotropy` chunk
 * (shaders/physical/anisotropy.glsl.ts), kept operation-for-operation equal to
 * it and written from the published model:
 *
 * - KHR_materials_anisotropy (Khronos glTF 2.0 extension): strength s and a
 *   tangent-space direction; texture RG holds a direction in [-1, 1] that is
 *   rotated by the factor direction, B scales the strength; the tangent alpha
 *   is alphaT = mix(alphaB, 1, s^2) with alphaB = roughness^2.
 * - Anisotropic GGX distribution in slope form
 *   D = 1 / (pi aT aB (hT^2 / aT^2 + hB^2 / aB^2 + hN^2)^2)
 *   (Heitz, "Understanding the Masking-Shadowing Function in Microfacet-Based
 *   BRDFs", JCGT 3(2) 2014, eq. 85; Burley 2012, Appendix B.2).
 * - Height-correlated anisotropic Smith visibility
 *   V = 0.5 / (N.L |(aT v.T, aB v.B, N.V)| + N.V |(aT l.T, aB l.B, N.L)|)
 *   (Heitz 2014, eq. 99 with the anisotropic Lambda of eq. 86).
 * - Environment lookups bend the normal toward the view vector projected into
 *   the plane orthogonal to the bitangent, by (1 - s (1 - roughness))^4 (an
 *   Aura heuristic for stretched reflections, not an exact integral).
 *
 * Requires `brdf` (PI, pow2, F_Schlick) and `a3d_prd04_bsdf_lobes_common`.
 */
const wgsl = /* wgsl */ `
fn a3dPrd04VGGXAnisotropic(alphaT: f32, alphaB: f32, tv: f32, bv: f32,
  tl: f32, bl: f32, nv: f32, nl: f32) -> f32 {
  let projectedView = vec3f(alphaT * tv, alphaB * bv, nv);
  let projectedLight = vec3f(alphaT * tl, alphaB * bl, nl);
  return 0.5 / max(nl * length(projectedView) + nv * length(projectedLight), 1e-6);
}

fn a3dPrd04DGGXAnisotropic(alphaT: f32, alphaB: f32, nh: f32, th: f32, bh: f32) -> f32 {
  let at = max(alphaT, 1e-4);
  let ab = max(alphaB, 1e-4);
  let slope = pow2(th / at) + pow2(bh / ab) + nh * nh;
  return 1.0 / max(PI * at * ab * slope * slope, 1e-12);
}

fn a3dPrd04AnisotropyInit(lobes: ptr<function, A3DPrd04Lobes>, factor: vec2f, texel: vec4f,
  useTexture: bool, tangent: vec3f, bitangent: vec3f, roughness: f32) {
  var direction = factor;
  if (useTexture) {
    var mapped = texel.rg * 2.0 - 1.0;
    let magnitude = length(mapped);
    mapped = select(vec2f(1.0, 0.0), mapped / max(magnitude, 1e-6), magnitude > 1e-6);
    direction = vec2f(factor.x * mapped.x - factor.y * mapped.y,
                      factor.y * mapped.x + factor.x * mapped.y) * texel.b;
  }
  let strength = length(direction);
  let axis = select(vec2f(1.0, 0.0), direction / max(strength, 1e-6), strength > 1e-6);
  (*lobes).anisotropy = saturate(strength);
  (*lobes).alphaT = mix(pow2(clamp(roughness, 0.0, 1.0)), 1.0, pow2((*lobes).anisotropy));
  (*lobes).anisotropyT = tangent * axis.x + bitangent * axis.y;
  (*lobes).anisotropyB = bitangent * axis.x - tangent * axis.y;
}

fn a3dPrd04AnisotropyDirect(lightDir: vec3f, viewDir: vec3f, normal: vec3f, f0: vec3f,
  f90: f32, roughness: f32, lobes: A3DPrd04Lobes) -> vec3f {
  let nl = saturate(dot(normal, lightDir));
  let nv = saturate(dot(normal, viewDir));
  if (nl <= 0.0 || nv <= 0.0) {
    return vec3f(0.0);
  }
  let h = a3dPrd04HalfVector(lightDir, viewDir, normal);
  let alphaB = max(roughness * roughness, 1e-4);
  let d = a3dPrd04DGGXAnisotropic(lobes.alphaT, alphaB, saturate(dot(normal, h)),
    dot(lobes.anisotropyT, h), dot(lobes.anisotropyB, h));
  let vis = a3dPrd04VGGXAnisotropic(lobes.alphaT, alphaB, dot(lobes.anisotropyT, viewDir),
    dot(lobes.anisotropyB, viewDir), dot(lobes.anisotropyT, lightDir),
    dot(lobes.anisotropyB, lightDir), nv, nl);
  return F_Schlick(f0, f90, dot(viewDir, h)) * (d * vis);
}

fn a3dPrd04AnisotropyBentNormal(viewDir: vec3f, normal: vec3f, roughness: f32, bitangent: vec3f, anisotropy: f32) -> vec3f {
  let projected = viewDir - bitangent * dot(viewDir, bitangent);
  let lengthSquared = dot(projected, projected);
  let bent = select(normal, projected * inverseSqrt(max(lengthSquared, 1e-8)), lengthSquared > 1e-8);
  let blend = pow(1.0 - saturate(anisotropy) * (1.0 - saturate(roughness)), 4.0);
  let result = mix(bent, normal, blend);
  let resultLength = dot(result, result);
  return select(normal, result * inverseSqrt(max(resultLength, 1e-8)), resultLength > 1e-8);
}
`;

export const A3D_PRD04_ANISOTROPY_WGSL = wgsl;
export default wgsl;
