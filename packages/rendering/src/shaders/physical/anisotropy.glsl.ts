/**
 * Aura anisotropic GGX lobe and KHR_materials_anisotropy map interpretation.
 * Its WGSL companion (physical-wgsl/anisotropy.wgsl.ts) mirrors it.
 * Equations: KHR_materials_anisotropy; Heitz, JCGT 2014, eqs. 85-86, 99 (PRD-04 §8.12).
 */
import type { ShaderChunk } from "../../contracts/program";
import WGSL from "../physical-wgsl/anisotropy.wgsl.js";

const glsl = /* glsl */ `
float a3dPrd04VGGXAnisotropic(float alphaT, float alphaB, float tv, float bv,
  float tl, float bl, float nv, float nl) {
  vec3 projectedView = vec3(alphaT * tv, alphaB * bv, nv);
  vec3 projectedLight = vec3(alphaT * tl, alphaB * bl, nl);
  return 0.5 / max(nl * length(projectedView) + nv * length(projectedLight), 1e-6);
}
float a3dPrd04DGGXAnisotropic(float alphaT, float alphaB, float nh, float th, float bh) {
  float at = max(alphaT, 1e-4), ab = max(alphaB, 1e-4);
  float slope = pow2(th / at) + pow2(bh / ab) + nh * nh;
  return 1.0 / max(PI * at * ab * slope * slope, 1e-12);
}
void a3dPrd04AnisotropyInit(inout A3DPrd04Lobes lobes, vec2 factor, vec4 texel,
  bool useTexture, vec3 tangent, vec3 bitangent, float roughness) {
  vec2 direction = factor;
  if (useTexture) {
    vec2 mapped = texel.rg * 2.0 - 1.0;
    float magnitude = length(mapped);
    mapped = magnitude > 1e-6 ? mapped / magnitude : vec2(1.0, 0.0);
    direction = vec2(factor.x * mapped.x - factor.y * mapped.y,
                     factor.y * mapped.x + factor.x * mapped.y) * texel.b;
  }
  float strength = length(direction);
  vec2 axis = strength > 1e-6 ? direction / strength : vec2(1.0, 0.0);
  lobes.anisotropy = saturate(strength);
  lobes.alphaT = mix(pow2(clamp(roughness, 0.0, 1.0)), 1.0, pow2(lobes.anisotropy));
  lobes.anisotropyT = tangent * axis.x + bitangent * axis.y;
  lobes.anisotropyB = bitangent * axis.x - tangent * axis.y;
}
vec3 a3dPrd04AnisotropyDirect(vec3 lightDir, vec3 viewDir, vec3 normal, vec3 f0,
  float f90, float roughness, A3DPrd04Lobes lobes) {
  float nl = saturate(dot(normal, lightDir)), nv = saturate(dot(normal, viewDir));
  if (nl <= 0.0 || nv <= 0.0) return vec3(0.0);
  vec3 h = a3dHalfVector(lightDir, viewDir, normal);
  float alphaB = max(roughness * roughness, 1e-4);
  float d = a3dPrd04DGGXAnisotropic(lobes.alphaT, alphaB, saturate(dot(normal, h)),
    dot(lobes.anisotropyT, h), dot(lobes.anisotropyB, h));
  float vis = a3dPrd04VGGXAnisotropic(lobes.alphaT, alphaB, dot(lobes.anisotropyT, viewDir),
    dot(lobes.anisotropyB, viewDir), dot(lobes.anisotropyT, lightDir),
    dot(lobes.anisotropyB, lightDir), nv, nl);
  return F_Schlick(f0, f90, dot(viewDir, h)) * (d * vis);
}
vec3 a3dPrd04AnisotropyBentNormal(vec3 viewDir, vec3 normal, float roughness, vec3 bitangent, float anisotropy) {
  vec3 projected = viewDir - bitangent * dot(viewDir, bitangent);
  float lengthSquared = dot(projected, projected);
  vec3 bent = lengthSquared > 1e-8 ? projected * inversesqrt(lengthSquared) : normal;
  float blend = pow(1.0 - saturate(anisotropy) * (1.0 - saturate(roughness)), 4.0);
  vec3 result = mix(bent, normal, blend);
  float resultLength = dot(result, result);
  return resultLength > 1e-8 ? result * inversesqrt(resultLength) : normal;
}
`;

export const A3D_PRD04_ANISOTROPY: ShaderChunk = {
  name: "a3d_prd04_anisotropy", owner: "prd04", glsl, wgsl: WGSL,
  stage: "fragment", requires: ["brdf", "a3d_prd04_bsdf_lobes_common"]
};
