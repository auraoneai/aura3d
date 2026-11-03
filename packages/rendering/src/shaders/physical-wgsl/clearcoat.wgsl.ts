/**
 * WGSL companion of Aura's `a3d_prd04_clearcoat` chunk
 * (shaders/physical/clearcoat.glsl.ts), kept operation-for-operation equal to
 * it and written from the published model:
 *
 * - KHR_materials_clearcoat (Khronos glTF 2.0 extension): coat factor from the
 *   R channel, coat roughness from the G channel, a fixed 1.5 index of
 *   refraction (F0 = ((1.5 - 1) / (1.5 + 1))^2 = 0.04) and the layering
 *   f = f_base * (1 - coat * F_coat(N_c . V)) + coat * f_coat.
 * - Coat lobe: GGX distribution D (Walter et al., "Microfacet Models for
 *   Refraction through Rough Surfaces", EGSR 2007, eq. 33), height-correlated
 *   Smith visibility V = G2 / (4 N.L N.V) (Heitz, JCGT 3(2) 2014, eq. 99) and
 *   Schlick's Fresnel with F90 = 1 (Schlick 1994), i.e. f = F * D * V.
 * - Indirect coat: the split-sum environment response at F0 0.04 / F90 1.
 *
 * Requires `brdf` (F_Schlick, D_GGX, V_GGX_SmithCorrelated) and
 * `a3d_prd04_bsdf_lobes_common` (struct, roughness, half vector, split sum).
 */
const wgsl = /* wgsl */ `
fn a3dPrd04ClearcoatInit(lobes: ptr<function, A3DPrd04Lobes>, factor: f32, roughness: f32,
  factorTex: vec4f, roughnessTex: vec4f, normal: vec3f, geometryRoughness: f32) {
  (*lobes).clearcoat = clamp(factor * factorTex.r, 0.0, 1.0);
  (*lobes).clearcoatRoughness = a3dPrd04ResolveRoughness(roughness * roughnessTex.g, geometryRoughness);
  (*lobes).clearcoatNormal = normal;
}

fn a3dPrd04ClearcoatDirect(lightDir: vec3f, viewDir: vec3f, normal: vec3f, roughness: f32) -> vec3f {
  let nl = saturate(dot(normal, lightDir));
  let nv = saturate(dot(normal, viewDir));
  if (nl <= 0.0 || nv <= 0.0) {
    return vec3f(0.0);
  }
  let h = a3dPrd04HalfVector(lightDir, viewDir, normal);
  let alpha = max(roughness * roughness, 1e-4);
  return F_Schlick(vec3f(0.04), 1.0, dot(viewDir, h))
    * D_GGX(alpha, dot(normal, h)) * V_GGX_SmithCorrelated(alpha, nl, nv);
}

fn a3dPrd04ClearcoatIndirect(normal: vec3f, viewDir: vec3f, roughness: f32, radiance: vec3f) -> vec3f {
  return radiance * a3dPrd04EnvironmentBRDF(normal, viewDir, vec3f(0.04), 1.0, roughness);
}

fn a3dPrd04ComposeClearcoat(outgoing: vec3f, coat: f32, normal: vec3f, viewDir: vec3f,
  direct: vec3f, indirect: vec3f) -> vec3f {
  let weight = saturate(coat);
  let reflected = F_Schlick(vec3f(0.04), 1.0, dot(normal, viewDir));
  return outgoing * (vec3f(1.0) - weight * reflected) + (direct + indirect) * weight;
}
`;

export const A3D_PRD04_CLEARCOAT_WGSL = wgsl;
export default wgsl;
