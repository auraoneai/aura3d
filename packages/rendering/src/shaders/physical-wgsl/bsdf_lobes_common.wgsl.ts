/**
 * WGSL companion of Aura's `a3d_prd04_bsdf_lobes_common` chunk
 * (shaders/physical/bsdf_lobes_common.glsl.ts): the shared lobe state and the
 * bounded helpers every physical lobe uses, written for Aura from the
 * equations below and kept operation-for-operation equal to the GLSL chunk.
 *
 * - Roughness: perceptual roughness r, microfacet alpha = r^2 (Burley,
 *   "Physically Based Shading at Disney", SIGGRAPH 2012 course, §5.4). The
 *   0.0525 floor and the additive screen-space normal-variance widening are
 *   Aura conventions shared with the `brdf` chunk.
 * - Split-sum environment response: E = F0 * A + F90 * B with (A, B) read from
 *   Aura's independently integrated DFG table (Karis, "Real Shading in Unreal
 *   Engine 4", SIGGRAPH 2013 course, eq. 4-5).
 * - Multiple scattering: the energy missing from the first bounce, 1 - (A + B)
 *   (Kulla & Conty, "Revisiting Physically Based Shading at Imageworks",
 *   SIGGRAPH 2017 course, §2.2), is returned with the cosine-weighted average
 *   Fresnel F_avg = F0 + (F90 - F0) / 21 (the hemispherical average of
 *   Schlick's (1 - mu)^5 weight: integral_0^1 2 mu (1 - mu)^5 dmu = 1/21) and
 *   capped so single + multiple never exceeds one.
 * - Specular occlusion: a bounded widening of the diffuse occlusion toward one
 *   for rough or grazing lobes (an Aura heuristic, not a visibility integral).
 *
 * Requires the `brdf` helpers `pow2` and `a3dDFG`. WGSL has no overloading, so
 * the shared half-vector and multiscatter helpers carry `a3dPrd04` names here.
 */
const wgsl = /* wgsl */ `
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

// Unit bisector of two unit directions; the fallback covers opposed vectors.
fn a3dPrd04HalfVector(a: vec3f, b: vec3f, fallback: vec3f) -> vec3f {
  let sum = a + b;
  let lengthSquared = dot(sum, sum);
  if (lengthSquared > 1e-6) {
    return sum * inverseSqrt(lengthSquared);
  }
  return fallback;
}

// Largest screen-space change of the geometric normal, bounded to [0, 1].
fn a3dPrd04GeometryRoughness(geometricNormal: vec3f) -> f32 {
  let dx = dpdx(geometricNormal);
  let dy = dpdy(geometricNormal);
  return min(sqrt(max(dot(dx, dx), dot(dy, dy))), 1.0);
}

fn a3dPrd04ResolveRoughness(factor: f32, geometricRoughness: f32) -> f32 {
  return clamp(max(factor, 0.0525) + max(geometricRoughness, 0.0), 0.0525, 1.0);
}

// Rougher reflections sample a wider visible region than a narrow specular lobe.
fn a3dPrd04SpecularOcclusion(nDotV: f32, ao: f32, roughness: f32) -> f32 {
  let occlusion = saturate(ao);
  let widening = pow2(saturate(roughness)) * (1.0 - saturate(nDotV));
  return saturate(occlusion + (1.0 - occlusion) * widening);
}

fn a3dPrd04EnvironmentBRDF(normal: vec3f, viewDir: vec3f, f0: vec3f, f90: f32, roughness: f32) -> vec3f {
  let coefficients = a3dDFG(roughness, saturate(dot(normal, viewDir)));
  return saturate(f0 * coefficients.x + vec3f(f90 * coefficients.y));
}

fn a3dPrd04Multiscatter(normal: vec3f, viewDir: vec3f, f0: vec3f, f90: f32, roughness: f32,
  singleScatter: ptr<function, vec3f>, multiScatter: ptr<function, vec3f>) {
  let coefficients = a3dDFG(roughness, saturate(dot(normal, viewDir)));
  let single = saturate(f0 * coefficients.x + vec3f(f90 * coefficients.y));
  let missing = 1.0 - saturate(coefficients.x + coefficients.y);
  let average = saturate(f0 + (vec3f(f90) - f0) / 21.0);
  // The broad lobe receives at most the energy absent from the first bounce.
  let multiple = min(vec3f(1.0) - single, missing * average);
  *singleScatter = *singleScatter + single;
  *multiScatter = *multiScatter + multiple;
}

fn a3dPrd04ComputeMultiscattering(normal: vec3f, viewDir: vec3f, f0: vec3f, f90: f32,
  roughness: f32, singleScatter: ptr<function, vec3f>, multiScatter: ptr<function, vec3f>) {
  a3dPrd04Multiscatter(normal, viewDir, f0, f90, roughness, singleScatter, multiScatter);
}
`;

export const A3D_PRD04_BSDF_LOBES_COMMON_WGSL = wgsl;
export default wgsl;
