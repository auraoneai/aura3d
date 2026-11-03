/**
 * Physical-lighting calls for the staged packed member loop. The ordinary
 * library still owns the material and BRDF primitives. A member's color is
 * applied to the already-derived diffuse and blended F0 terms, matching the
 * generated material hook; applying it to baseColor before deriving those
 * terms would leave the dielectric F0 untinted and change clamping order.
 *
 * The caller must reject physical extension lobes until their post-hook
 * ordering is represented here. This source alone does not enable batching.
 */
export const PACKED_LOOP_PHYSICAL_WGSL = /* wgsl */ `
fn a3dPackedPhysicalDirect(
  n: vec3f, v: vec3f, l: vec3f, radiance: vec3f, material: AuraPhysicalMaterial,
  viewDfg: vec2f, lightDfg: vec2f, memberColor: vec3f
) -> AuraPhysicalLightResult {
  let nl = clamp(dot(n, l), 0.0, 1.0);
  let nv = clamp(dot(n, v), 0.0, 1.0);
  var result: AuraPhysicalLightResult;
  result.diffuse = vec3f(0.0);
  result.specular = vec3f(0.0);
  if (nl <= 0.0 || nv <= 0.0) { return result; }
  let halfSum = l + v;
  var h = n;
  if (dot(halfSum, halfSum) > 1e-6) { h = normalize(halfSum); }
  let metalness = clamp(material.metalness, 0.0, 1.0);
  let ior = max(material.ior, 0.0001);
  let reflectance = (ior - 1.0) / (ior + 1.0);
  let dielectric = clamp(reflectance * reflectance * max(material.specularColorFactor, vec3f(0.0)), vec3f(0.0), vec3f(1.0)) * clamp(material.specularIntensity, 0.0, 1.0);
  let base = min(max(material.baseColor, vec3f(0.0)), vec3f(1.0));
  let diffuse = base * (1.0 - metalness) * memberColor;
  let f0 = mix(dielectric, base, metalness) * memberColor;
  let f90 = mix(clamp(material.specularIntensity, 0.0, 1.0), 1.0, metalness);
  let available = vec3f(1.0) - clamp(max(a3dPhysicalFresnel(f0, f90, nv), a3dPhysicalFresnel(f0, f90, nl)), vec3f(0.0), vec3f(1.0));
  let rough = clamp(material.roughness, 0.0525, 1.0);
  let alpha = rough * rough;
  let single = a3dPhysicalFresnel(f0, f90, dot(v, h)) * a3dPhysicalDggx(alpha, dot(n, h)) * a3dPhysicalVisibility(alpha, nl, nv);
  let missingV = 1.0 - clamp(viewDfg.x + viewDfg.y, 0.0, 1.0);
  let missingL = 1.0 - clamp(lightDfg.x + lightDfg.y, 0.0, 1.0);
  let meanFresnel = clamp(f0 + (vec3f(f90) - f0) / 21.0, vec3f(0.0), vec3f(1.0));
  let incident = max(radiance, vec3f(0.0)) * nl;
  result.diffuse = incident * diffuse * available * (a3dPhysicalRoughDiffuse(n, v, l, material.diffuseRoughness, material.retroreflection) / A3D_PHYSICAL_PI);
  result.specular = incident * (single + meanFresnel * (missingV * missingL / A3D_PHYSICAL_PI));
  return result;
}

fn a3dPackedPhysicalIndirect(
  nDotV: f32, radiance: vec3f, irradiance: vec3f, material: AuraPhysicalMaterial,
  dfg: vec2f, memberColor: vec3f
) -> AuraPhysicalLightResult {
  // The diffuse availability uses the original dielectric F0. Only the
  // diffuse contribution and blended specular F0 are member-colored.
  var result = a3dPhysicalIndirect(nDotV, radiance, irradiance, material, dfg);
  result.diffuse *= memberColor;
  let metalness = clamp(material.metalness, 0.0, 1.0);
  let ior = max(material.ior, 0.0001);
  let reflectance = (ior - 1.0) / (ior + 1.0);
  let dielectric = clamp(reflectance * reflectance * max(material.specularColorFactor, vec3f(0.0)), vec3f(0.0), vec3f(1.0)) * clamp(material.specularIntensity, 0.0, 1.0);
  let base = clamp(material.baseColor, vec3f(0.0), vec3f(1.0));
  let f0 = mix(dielectric, base, metalness) * memberColor;
  let f90 = mix(clamp(material.specularIntensity, 0.0, 1.0), 1.0, metalness);
  let lut = clamp(dfg, vec2f(0.0), vec2f(1.0));
  let missing = 1.0 - clamp(lut.x + lut.y, 0.0, 1.0);
  let single = clamp(f0 * lut.x + vec3f(f90 * lut.y), vec3f(0.0), vec3f(1.0));
  let average = clamp(f0 + (vec3f(f90) - f0) / 21.0, vec3f(0.0), vec3f(1.0));
  let multiple = min(vec3f(1.0) - single, missing * average);
  result.specular = max(radiance, vec3f(0.0)) * single + max(irradiance, vec3f(0.0)) * (multiple / A3D_PHYSICAL_PI);
  return result;
}
`;
