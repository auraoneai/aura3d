/**
 * Aura implementation of the emissive strength material operation.
 * Its WGSL companion (physical-wgsl/emissive_strength.wgsl.ts) mirrors it.
 * Equations: glTF 2.0 emission x KHR_materials_emissive_strength (PRD-04 §8).
 */
import type { ShaderChunk } from "../../contracts/program";
import WGSL from "../physical-wgsl/emissive_strength.wgsl.js";

const glsl = /* glsl */ `
// Inputs are linear-light; the loader decodes the color map before this point.
vec3 a3dPrd04EmissiveRadiance(vec3 factor, vec4 texel, float strength) {
  return max(factor, vec3(0.0)) * max(texel.rgb, vec3(0.0)) * max(strength, 0.0);
}
`;

export const A3D_PRD04_EMISSIVE_STRENGTH: ShaderChunk = {
  name: "a3d_prd04_emissive_strength", owner: "prd04", glsl, wgsl: WGSL,
  stage: "fragment", requires: ["brdf"]
};
