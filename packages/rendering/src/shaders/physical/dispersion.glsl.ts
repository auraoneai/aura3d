/**
 * Aura three-band screen-space dispersion. The KHR dispersion coefficient
 * determines the band indices around the material IOR. The separately
 * maintained WGSL companion has its own provenance.
 */
import type { ShaderChunk } from "../../contracts/program";
import WGSL from "../physical-wgsl/dispersion.wgsl.js";

const glsl = /* glsl */ `
#if defined(A3D_TRANSMISSION) && (defined(A3D_DISPERSION) || defined(A3D_LOBE_DISPERSION))
vec3 a3dPrd04DispersionIors(float ior, float dispersion) {
  float center = max(ior, 1e-4);
  float spread = max(center - 1.0, 0.0) * 0.025 * max(dispersion, 0.0);
  return max(vec3(center - spread, center, center + spread), vec3(1e-4));
}
vec4 a3dGetIBLVolumeRefractionDispersion(vec3 n, vec3 v, float roughness, vec3 diffuseColor,
  vec3 specularColor, float specularF90, vec3 position, mat4 modelMatrix,
  float dispersion, float ior, float thickness, vec3 attenuationColor, float attenuationDistance) {
  vec3 iors = a3dPrd04DispersionIors(ior, dispersion);
  vec3 transmitted = vec3(0.0);
  vec3 transmittance = vec3(0.0);
  float alpha = 0.0;
  for (int band = 0; band < 3; band++) {
    vec3 ray = a3dVolumeTransmissionRay(n, v, thickness, iors[band], modelMatrix);
    vec2 uv = a3dTransmissionCoords(position + ray, a3d_prd04_viewMatrix, a3d_prd04_projectionMatrix);
    vec4 sampleColor = a3dTransmissionSample(uv, roughness, iors[band]);
    vec3 attenuated = clamp(diffuseColor, 0.0, 1.0)
      * a3dVolumeAttenuation(length(ray), attenuationColor, attenuationDistance);
    transmitted[band] = sampleColor[band];
    transmittance[band] = attenuated[band];
    alpha += clamp(sampleColor.a, 0.0, 1.0) / 3.0;
  }
  vec3 reflectance = a3dPrd04EnvironmentBRDF(n, v, specularColor, specularF90, roughness);
  float opacity = 1.0 - (1.0 - alpha) * dot(transmittance, vec3(1.0 / 3.0));
  return vec4((vec3(1.0) - reflectance) * transmittance * transmitted, opacity);
}
#endif
`;

export const A3D_PRD04_DISPERSION: ShaderChunk = {
  name: "a3d_prd04_dispersion", owner: "prd04", glsl, wgsl: WGSL,
  stage: "fragment", requires: ["brdf", "a3d_prd04_bsdf_lobes_common", "a3d_prd04_volume", "a3d_prd04_transmission"]
};
