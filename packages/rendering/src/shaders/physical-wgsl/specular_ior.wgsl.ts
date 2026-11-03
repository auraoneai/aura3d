/**
 * WGSL companion of Aura's `a3d_prd04_specular_ior` chunk
 * (shaders/physical/specular_ior.glsl.ts), kept operation-for-operation equal
 * to it and written from the published definitions:
 *
 * - Normal-incidence Fresnel reflectance between media of index n_t and n_i,
 *   F0 = ((n_t - n_i) / (n_t + n_i))^2, and its inverse for n_i = 1,
 *   n = (1 + sqrt(F0)) / (1 - sqrt(F0)) (Fresnel equations at normal
 *   incidence; KHR_materials_ior).
 * - KHR_materials_specular: specular color factor x texture RGB and specular
 *   factor x texture A, dielectric F0 = min(F0(ior) * specularColor, 1) * s,
 *   F90 = s, both blended toward the metal response by metalness.
 *
 * Requires `brdf` and `a3d_prd04_bsdf_lobes_common` like the GLSL chunk.
 */
const wgsl = /* wgsl */ `
fn a3dPrd04IorToF0(transmitted: vec3f, incident: f32) -> vec3f {
  let ratio = (transmitted - vec3f(incident)) / max(transmitted + vec3f(incident), vec3f(1e-6));
  return ratio * ratio;
}

fn a3dPrd04IorToF0f(transmitted: f32, incident: f32) -> f32 {
  let ratio = (transmitted - incident) / max(transmitted + incident, 1e-6);
  return ratio * ratio;
}

fn a3dPrd04F0ToIor(f0: vec3f) -> vec3f {
  let root = sqrt(clamp(f0, vec3f(0.0), vec3f(0.9999)));
  return (vec3f(1.0) + root) / (vec3f(1.0) - root);
}

fn a3dPrd04SpecIorFactors(colorFactor: vec3f, strengthFactor: f32,
  colorTexel: vec3f, strengthTexel: f32, outSpecIntensity: ptr<function, f32>) -> vec3f {
  *outSpecIntensity = clamp(strengthFactor * strengthTexel, 0.0, 1.0);
  return clamp(colorFactor * colorTexel, vec3f(0.0), vec3f(1.0));
}

fn a3dPrd04SpecIorSpecularColor(ior: f32, colorFactor: vec3f, intensity: f32) -> vec3f {
  return clamp(a3dPrd04IorToF0(vec3f(max(ior, 1e-4)), 1.0) * colorFactor, vec3f(0.0), vec3f(1.0))
    * clamp(intensity, 0.0, 1.0);
}

fn a3dPrd04SpecIorSpecularF90(intensity: f32, metallic: f32) -> f32 {
  return mix(clamp(intensity, 0.0, 1.0), 1.0, clamp(metallic, 0.0, 1.0));
}

fn a3dPrd04SpecIorSpecularColorBlended(specular: vec3f, base: vec3f, metallic: f32) -> vec3f {
  return mix(specular, base, clamp(metallic, 0.0, 1.0));
}
`;

export const A3D_PRD04_SPECULAR_IOR_WGSL = wgsl;
export default wgsl;
