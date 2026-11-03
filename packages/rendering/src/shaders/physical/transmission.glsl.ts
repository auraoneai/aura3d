/**
 * Aura screen-space transmission. A caller-provided opaque-color mip chain is
 * sampled at the refracted exit point; out-of-frame samples use sampler wrap.
 * The separately maintained WGSL companion has its own provenance.
 */
import type { ShaderChunk } from "../../contracts/program";
import WGSL from "../physical-wgsl/transmission.wgsl.js";

const glsl = /* glsl */ `
#ifdef A3D_TRANSMISSION
uniform sampler2D a3d_prd04_transmissionSampler;
uniform vec2 a3d_prd04_transmissionSamplerSize;
uniform mat4 a3d_prd04_modelMatrix;
#ifdef A3D_GENERATED_PROGRAM
#define a3d_prd04_projectionMatrix u_projection
#define a3d_prd04_viewMatrix u_view
#else
uniform mat4 a3d_prd04_projectionMatrix;
uniform mat4 a3d_prd04_viewMatrix;
#endif

#ifdef A3D_TRANSMISSION_BICUBIC
// Catmull–Rom reconstruction, sampled explicitly at one mip level.
float a3dPrd04CubicWeight(float x) {
  x = abs(x);
  if (x < 1.0) return 1.5*x*x*x - 2.5*x*x + 1.0;
  if (x < 2.0) return -0.5*x*x*x + 2.5*x*x - 4.0*x + 2.0;
  return 0.0;
}
vec4 a3dPrd04SampleCubicLevel(vec2 uv, float level) {
  vec2 size = vec2(textureSize(a3d_prd04_transmissionSampler, int(level)));
  vec2 pixel = uv * size - 0.5;
  vec2 origin = floor(pixel);
  vec2 fraction = pixel - origin;
  vec4 result = vec4(0.0);
  for (int y = -1; y <= 2; y++) {
    for (int x = -1; x <= 2; x++) {
      vec2 sampleUv = (origin + vec2(float(x), float(y)) + 0.5) / size;
      float weight = a3dPrd04CubicWeight(float(x) - fraction.x)
                   * a3dPrd04CubicWeight(float(y) - fraction.y);
      result += textureLod(a3d_prd04_transmissionSampler, sampleUv, level) * weight;
    }
  }
  return result;
}
#endif

vec3 a3dVolumeTransmissionRay(vec3 n, vec3 v, float thickness, float ior, mat4 modelMatrix) {
  vec3 direction = refract(-v, normalize(n), 1.0 / max(ior, 1e-4));
  float magnitude = length(direction);
  if (magnitude <= 1e-6 || thickness <= 0.0) return vec3(0.0);
  direction /= magnitude;
  mat3 model = mat3(modelMatrix);
  float determinantModel = determinant(model);
  if (abs(determinantModel) <= 1e-8) return vec3(0.0);
  // Convert a unit world ray to local space to account for nonuniform scale.
  float localLength = length(inverse(model) * direction);
  return direction * (thickness / max(localLength, 1e-6));
}
float a3dApplyIorToRoughness(float roughness, float ior) {
  return saturate(roughness) * saturate((ior - 1.0) * 2.0);
}
vec4 a3dTransmissionSample(vec2 uv, float roughness, float ior) {
  float maxLevel = max(log2(max(max(a3d_prd04_transmissionSamplerSize.x,
    a3d_prd04_transmissionSamplerSize.y), 1.0)), 0.0);
  float level = maxLevel * a3dApplyIorToRoughness(roughness, ior);
#ifdef A3D_TRANSMISSION_BICUBIC
  float low = floor(level), high = min(low + 1.0, floor(maxLevel));
  return mix(a3dPrd04SampleCubicLevel(uv, low), a3dPrd04SampleCubicLevel(uv, high), fract(level));
#else
  return textureLod(a3d_prd04_transmissionSampler, uv, level);
#endif
}
vec2 a3dTransmissionCoords(vec3 exitPosition, mat4 viewMatrix, mat4 projectionMatrix) {
  vec4 clip = projectionMatrix * viewMatrix * vec4(exitPosition, 1.0);
  float w = abs(clip.w) > 1e-6 ? clip.w : (clip.w < 0.0 ? -1e-6 : 1e-6);
  return clip.xy / w * 0.5 + 0.5;
}
vec4 a3dGetIBLVolumeRefraction(vec3 n, vec3 v, float roughness, vec3 diffuseColor,
  vec3 specularColor, float specularF90, vec3 position, mat4 modelMatrix,
  float ior, float thickness, vec3 attenuationColor, float attenuationDistance) {
  vec3 ray = a3dVolumeTransmissionRay(n, v, thickness, ior, modelMatrix);
  vec2 uv = a3dTransmissionCoords(position + ray, a3d_prd04_viewMatrix, a3d_prd04_projectionMatrix);
  vec4 scene = a3dTransmissionSample(uv, roughness, ior);
  vec3 transmittance = clamp(diffuseColor, 0.0, 1.0)
    * a3dVolumeAttenuation(length(ray), attenuationColor, attenuationDistance);
  vec3 reflectance = a3dPrd04EnvironmentBRDF(n, v, specularColor, specularF90, roughness);
  float opacity = 1.0 - (1.0 - clamp(scene.a, 0.0, 1.0))
    * dot(transmittance, vec3(1.0 / 3.0));
  return vec4((vec3(1.0) - reflectance) * transmittance * scene.rgb, opacity);
}
#endif
`;

export const A3D_PRD04_TRANSMISSION: ShaderChunk = {
  name: "a3d_prd04_transmission", owner: "prd04", glsl, wgsl: WGSL,
  stage: "fragment", requires: ["brdf", "a3d_prd04_bsdf_lobes_common", "a3d_prd04_volume"]
};
