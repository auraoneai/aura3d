/**
 * Independent candidate for the declared common lobe interface. The opt-in
 * generated WebGPU preview includes its struct to support other candidates;
 * the preview does not use its roughness, occlusion, or scattering helpers.
 *
 * Provenance: the fifth-power Fresnel interpolation is from Christophe
 * Schlick, "An Inexpensive BRDF Model for Physically-based Rendering" (1994),
 * https://doi.org/10.1111/1467-8659.1330233. The 1/21 angular average below
 * follows directly from integrating (1 - cos(theta))^5 over a cosine-weighted
 * hemisphere: integral_0^1 2 * mu * (1 - mu)^5 dmu = 1/21. WGSL derivative
 * and pointer semantics are specified by https://www.w3.org/TR/WGSL/.
 * No source implementation or lookup table is used here.
 *
 * Assumptions and approximations, not specified by the interface:
 * - Normals and view directions are unit length; roughness, occlusion, and
 *   reflectances are physically meaningful on [0, 1] and are clamped there.
 * - Geometry roughness is the larger screen-space normal-gradient length.
 *   It is a fragment-stage estimate, requiring derivatives in uniform control
 *   flow. It does not model the normal distribution inside a pixel exactly.
 * - Material and geometry roughness are combined as independent deviations in
 *   quadrature. No positive roughness floor is imposed by this candidate.
 * - Specular occlusion is a bounded directional heuristic. A diffuse ambient
 *   occlusion scalar alone cannot determine the specular visibility function.
 * - Fresnel blends the smooth view term toward its cosine-weighted average by
 *   roughness squared. The single-bounce escape fraction 1 - roughness^2 / 2
 *   is a deliberately simple heuristic, not a measured microfacet integral.
 * - Remaining energy is modeled as a geometric series of further encounters
 *   with average Fresnel reflectance. Starting with zero accumulators, the
 *   single plus multiple contribution stays in [0, 1] per channel; arbitrary
 *   pre-existing accumulator values are the caller's responsibility.
 *
 * The preview does not establish WGSL/GPU compatibility.
 */
export const A3D_PRD04_BSDF_LOBES_COMMON_WGSL = /* wgsl */ `
struct A3DPrd04Lobes {
  ior: f32,
  clearcoat: f32,
  clearcoatRoughness: f32,
  clearcoatNormal: vec3f,
  sheenColor: vec3f,
  sheenRoughness: f32,
  iridescence: f32,
  iridescenceIOR: f32,
  iridescenceThickness: f32,
  iridescenceFresnel: vec3f,
  iridescenceF0: vec3f,
  anisotropy: f32,
  anisotropyT: vec3f,
  anisotropyB: vec3f,
  alphaT: f32,
  transmission: f32,
  thickness: f32,
  attenuationDistance: f32,
  attenuationColor: vec3f,
  dispersion: f32,
}

fn a3dPrd04GeometryRoughness(nonPerturbedNormal: vec3f) -> f32 {
  let dx = dpdx(nonPerturbedNormal);
  let dy = dpdy(nonPerturbedNormal);
  return clamp(sqrt(max(dot(dx, dx), dot(dy, dy))), 0.0, 1.0);
}

fn a3dPrd04ResolveRoughness(roughnessFactor: f32, geometryRoughness: f32) -> f32 {
  let material = clamp(roughnessFactor, 0.0, 1.0);
  let geometry = clamp(geometryRoughness, 0.0, 1.0);
  return min(sqrt(material * material + geometry * geometry), 1.0);
}

fn a3dPrd04SpecularOcclusion(dotNV: f32, ambientOcclusion: f32, roughness: f32) -> f32 {
  let viewCosine = clamp(dotNV, 0.0, 1.0);
  let visibility = clamp(ambientOcclusion, 0.0, 1.0);
  let surfaceRoughness = clamp(roughness, 0.0, 1.0);
  let exponent = 1.0 + (1.0 - surfaceRoughness) * (1.0 - viewCosine);
  return pow(visibility, exponent);
}

fn a3dPrd04EnvironmentBRDF(normal: vec3f, viewDir: vec3f, specularColor: vec3f, specularF90: f32, roughness: f32) -> vec3f {
  let viewCosine = clamp(dot(normal, viewDir), 0.0, 1.0);
  let surfaceRoughness = clamp(roughness, 0.0, 1.0);
  let roughnessSquared = surfaceRoughness * surfaceRoughness;
  let oneMinusView = 1.0 - viewCosine;
  let square = oneMinusView * oneMinusView;
  let grazingWeight = square * square * oneMinusView;
  let angularWeight = (1.0 - roughnessSquared) * grazingWeight + roughnessSquared / 21.0;
  let f0 = clamp(specularColor, vec3f(0.0), vec3f(1.0));
  let f90 = clamp(specularF90, 0.0, 1.0);
  let fresnel = f0 + (vec3f(f90) - f0) * angularWeight;
  let escape = 1.0 - 0.5 * roughnessSquared;
  return fresnel * escape;
}

fn a3dPrd04ComputeMultiscattering(normal: vec3f, viewDir: vec3f, specularColor: vec3f, specularF90: f32, roughness: f32, singleScatter: ptr<function, vec3f>, multiScatter: ptr<function, vec3f>) {
  let single = a3dPrd04EnvironmentBRDF(normal, viewDir, specularColor, specularF90, roughness);
  let surfaceRoughness = clamp(roughness, 0.0, 1.0);
  let trappedFraction = 0.5 * surfaceRoughness * surfaceRoughness;
  let f0 = clamp(specularColor, vec3f(0.0), vec3f(1.0));
  let f90 = clamp(specularF90, 0.0, 1.0);
  let averageFresnel = f0 + (vec3f(f90) - f0) / 21.0;
  let repeatFraction = averageFresnel * trappedFraction;
  let multiple = single * repeatFraction / (vec3f(1.0) - repeatFraction);
  *singleScatter = *singleScatter + single;
  *multiScatter = *multiScatter + multiple;
}
`;

export default A3D_PRD04_BSDF_LOBES_COMMON_WGSL;
