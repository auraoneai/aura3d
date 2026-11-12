/**
 * Aura implementation of the clearcoat material operation.
 * Its WGSL companion (physical-wgsl/clearcoat.wgsl.ts) mirrors it.
 * Equations: KHR_materials_clearcoat; Walter et al. 2007 GGX; Heitz 2014 Smith (PRD-04 §8).
 */
import type { ShaderChunk } from "../../contracts/program";
import WGSL from "../physical-wgsl/clearcoat.wgsl.js";

const glsl = /* glsl */ `
void a3dPrd04ClearcoatInit(inout A3DPrd04Lobes lobes, float factor, float roughness,
  vec4 factorTex, vec4 roughnessTex, vec3 normal, float geometryRoughness) {
  lobes.clearcoat = clamp(factor * factorTex.r, 0.0, 1.0);
  lobes.clearcoatRoughness = a3dPrd04ResolveRoughness(roughness * roughnessTex.g, geometryRoughness);
  lobes.clearcoatNormal = normal;
}
vec3 a3dPrd04ClearcoatDirect(vec3 lightDir, vec3 viewDir, vec3 normal, float roughness) {
  float nl = saturate(dot(normal, lightDir)), nv = saturate(dot(normal, viewDir));
  if (nl <= 0.0 || nv <= 0.0) return vec3(0.0);
  vec3 h = a3dHalfVector(lightDir, viewDir, normal);
  float alpha = max(roughness * roughness, 0.002);
  float spec = min(D_GGX(alpha, saturate(dot(normal, h))) * V_GGX_SmithCorrelated(alpha, nl, nv), 65504.0);
  return clamp(F_Schlick(vec3(0.04), 1.0, saturate(dot(viewDir, h))) * spec, vec3(0.0), vec3(65504.0));
}
vec3 a3dPrd04ClearcoatIndirect(vec3 normal, vec3 viewDir, float roughness, vec3 radiance) {
  return radiance * a3dPrd04EnvironmentBRDF(normal, viewDir, vec3(0.04), 1.0, roughness);
}
vec3 a3dPrd04ComposeClearcoat(vec3 outgoing, float coat, vec3 normal, vec3 viewDir,
  vec3 direct, vec3 indirect) {
  float weight = saturate(coat);
  vec3 reflected = F_Schlick(vec3(0.04), 1.0, dot(normal, viewDir));
  return outgoing * (vec3(1.0) - weight * reflected) + (direct + indirect) * weight;
}
`;

export const A3D_PRD04_CLEARCOAT: ShaderChunk = {
  name: "a3d_prd04_clearcoat", owner: "prd04", glsl, wgsl: WGSL,
  stage: "fragment", requires: ["brdf", "a3d_prd04_bsdf_lobes_common"]
};
