/**
 * Aura implementation of the specular ior material operation.
 * Its WGSL companion is tracked separately in physical-wgsl/.
 */
import type { ShaderChunk } from "../../contracts/program";
import WGSL from "../physical-wgsl/specular_ior.wgsl.js";

const glsl = /* glsl */ `
vec3 a3dPrd04IorToF0(vec3 transmitted, float incident) {
  vec3 ratio = (transmitted - incident) / max(transmitted + incident, vec3(1e-6));
  return ratio * ratio;
}
float a3dPrd04IorToF0f(float transmitted, float incident) {
  float ratio = (transmitted - incident) / max(transmitted + incident, 1e-6);
  return ratio * ratio;
}
vec3 a3dPrd04F0ToIor(vec3 f0) {
  vec3 root = sqrt(clamp(f0, 0.0, 0.9999));
  return (vec3(1.0) + root) / (vec3(1.0) - root);
}
vec3 a3dPrd04SpecIorFactors(vec3 colorFactor, float strengthFactor,
  vec3 colorTexel, float strengthTexel, out float outSpecIntensity) {
  outSpecIntensity = clamp(strengthFactor * strengthTexel, 0.0, 1.0);
  return clamp(colorFactor * colorTexel, 0.0, 1.0);
}
vec3 a3dPrd04SpecIorSpecularColor(float ior, vec3 colorFactor, float intensity) {
  return clamp(a3dPrd04IorToF0(vec3(max(ior, 1e-4)), 1.0) * colorFactor, 0.0, 1.0)
    * clamp(intensity, 0.0, 1.0);
}
float a3dPrd04SpecIorSpecularF90(float intensity, float metallic) {
  return mix(clamp(intensity, 0.0, 1.0), 1.0, clamp(metallic, 0.0, 1.0));
}
vec3 a3dPrd04SpecIorSpecularColorBlended(vec3 specular, vec3 base, float metallic) {
  return mix(specular, base, clamp(metallic, 0.0, 1.0));
}
`;

export const A3D_PRD04_SPECULAR_IOR: ShaderChunk = {
  name: "a3d_prd04_specular_ior", owner: "prd04", glsl, wgsl: WGSL,
  stage: "fragment", requires: ["brdf", "a3d_prd04_bsdf_lobes_common"]
};
