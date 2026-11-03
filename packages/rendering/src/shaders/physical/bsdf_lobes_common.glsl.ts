/**
 * Common state and bounded helpers for Aura's layered material operations.
 * The companion in physical-wgsl/ retains its prior attribution.
 */
import type { ShaderChunk } from "../../contracts/program";
import WGSL from "../physical-wgsl/bsdf_lobes_common.wgsl.js";

const glsl = /* glsl */ `
struct A3DPrd04Lobes {
  float ior;
  float clearcoat;
  float clearcoatRoughness;
  vec3 clearcoatNormal;
  vec3 sheenColor;
  float sheenRoughness;
  float iridescence;
  float iridescenceIOR;
  float iridescenceThickness;
  vec3 iridescenceFresnel;
  vec3 iridescenceF0;
  float anisotropy;
  vec3 anisotropyT;
  vec3 anisotropyB;
  float alphaT;
  float transmission;
  float thickness;
  float attenuationDistance;
  vec3 attenuationColor;
  float dispersion;
};

float a3dPrd04GeometryRoughness(vec3 geometricNormal) {
  vec3 dx = dFdx(geometricNormal), dy = dFdy(geometricNormal);
  return min(sqrt(max(dot(dx, dx), dot(dy, dy))), 1.0);
}
float a3dPrd04ResolveRoughness(float factor, float geometricRoughness) {
  return clamp(max(factor, 0.0525) + max(geometricRoughness, 0.0), 0.0525, 1.0);
}
// Rougher reflections sample a wider visible region than a narrow specular lobe.
float a3dPrd04SpecularOcclusion(float nDotV, float ao, float roughness) {
  float occlusion = saturate(ao);
  float widening = pow2(saturate(roughness)) * (1.0 - saturate(nDotV));
  return saturate(occlusion + (1.0 - occlusion) * widening);
}
vec3 a3dPrd04EnvironmentBRDF(vec3 normal, vec3 viewDir, vec3 f0, float f90, float roughness) {
  vec2 coefficients = a3dDFG(roughness, saturate(dot(normal, viewDir)));
  return saturate(f0 * coefficients.x + vec3(f90 * coefficients.y));
}
void a3dPrd04ComputeMultiscattering(vec3 normal, vec3 viewDir, vec3 f0, float f90,
  float roughness, inout vec3 singleScatter, inout vec3 multiScatter) {
  a3dMultiscatter(normal, viewDir, f0, f90, roughness, singleScatter, multiScatter);
}
`;

export const A3D_PRD04_BSDF_LOBES_COMMON: ShaderChunk = {
  name: "a3d_prd04_bsdf_lobes_common",
  owner: "prd04",
  glsl,
  wgsl: WGSL,
  stage: "fragment",
  requires: ["brdf"]
};
