/**
 * Aura implementation of the volume material operation.
 * Its WGSL companion is tracked separately in physical-wgsl/.
 * Equations: KHR_materials_volume Beer-Lambert attenuation (PRD-04 §8).
 */
import type { ShaderChunk } from "../../contracts/program";
import WGSL from "../physical-wgsl/volume.wgsl.js";

const glsl = /* glsl */ `
#ifdef A3D_TRANSMISSION
// Beer–Lambert: attenuationColor is the transmittance after one
// attenuationDistance. A zero path length or infinite distance is transparent.
vec3 a3dVolumeAttenuation(float pathLength, vec3 attenuationColor, float attenuationDistance) {
  if (pathLength <= 0.0 || isinf(attenuationDistance)) return vec3(1.0);
  if (attenuationDistance <= 0.0) return vec3(0.0);
  vec3 color = clamp(attenuationColor, 0.0, 1.0);
  vec3 transmitted = pow(max(color, vec3(1e-8)), vec3(pathLength / attenuationDistance));
  return mix(transmitted, vec3(0.0), lessThanEqual(color, vec3(0.0)));
}
void a3dPrd04VolumeInit(inout A3DPrd04Lobes lobes, float transmissionFactor,
  float thicknessFactor, float attenuationDistanceFactor, vec3 attenuationColorFactor,
  vec4 transmissionTex, vec4 thicknessTex) {
  lobes.transmission = saturate(transmissionFactor * transmissionTex.r);
  lobes.thickness = max(thicknessFactor * thicknessTex.g, 0.0);
  lobes.attenuationDistance = attenuationDistanceFactor;
  lobes.attenuationColor = clamp(attenuationColorFactor, 0.0, 1.0);
}
#endif
`;

export const A3D_PRD04_VOLUME: ShaderChunk = {
  name: "a3d_prd04_volume", owner: "prd04", glsl, wgsl: WGSL,
  stage: "fragment", requires: ["brdf", "a3d_prd04_bsdf_lobes_common"]
};
