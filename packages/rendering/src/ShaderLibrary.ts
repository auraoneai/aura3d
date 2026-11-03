import { SHADER_CHUNKS, validateShaderChunks } from "./ShaderChunks";
import { ZERO_TO_ONE_PROJECTION_WGSL, rasterClipDepthWgsl } from "./webgpu/ProjectionClip";
import { registerAnimationToonShader } from "./animation/AnimationToonMaterial.js";
import { recordDefaultShaderLibrary } from "./renderer/TrustedShaderLibrary";
import {
  ShaderLibrary,
  registerLeanUnlitShader,
  registerLeanPbrShader,
  LEGACY_PBR_SURFACE_DETAIL_GLSL,
  registerLeanDepthShader,
  registerLeanEnvironmentBackgroundShader,
  DEFAULT_DEPTH_SHADER_MARKER,
  DEFAULT_DEPTH_SHADER_NAME,
  DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_MARKER,
  DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_NAME,
  DEFAULT_INSTANCED_PBR_SHADER_MARKER,
  DEFAULT_INSTANCED_PBR_SHADER_NAME,
  DEFAULT_INSTANCED_UNLIT_SHADER_MARKER,
  DEFAULT_INSTANCED_UNLIT_SHADER_NAME,
  DEFAULT_MORPH_UNLIT_SHADER_MARKER,
  DEFAULT_MORPH_UNLIT_SHADER_NAME,
  DEFAULT_NORMAL_MAPPED_PBR_SHADER_MARKER,
  DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME,
  DEFAULT_PBR_SHADER_MARKER,
  DEFAULT_PBR_SHADER_NAME,
  DEFAULT_SCREEN_SPACE_LINE_SHADER_MARKER,
  DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME,
  DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_MARKER,
  DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_NAME,
  DEFAULT_SKINNED_LIT_SHADER_MARKER,
  DEFAULT_SKINNED_LIT_SHADER_NAME,
  DEFAULT_SKINNED_UNLIT_EIGHT_INFLUENCE_SHADER_MARKER,
  DEFAULT_SKINNED_UNLIT_EIGHT_INFLUENCE_SHADER_NAME,
  DEFAULT_SKINNED_UNLIT_SHADER_MARKER,
  DEFAULT_SKINNED_UNLIT_SHADER_NAME,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_SHEEN_ANISOTROPY_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_IRIDESCENCE_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_EXTENSION_ATLAS_VARIANT,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_SPECULAR_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_SHADER_MARKER,
  DEFAULT_TEXTURED_PBR_SHADER_NAME,
  DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_UNLIT_SHADER_MARKER,
  DEFAULT_TEXTURED_UNLIT_SHADER_NAME,
  DEFAULT_UNLIT_SHADER_MARKER,
  DEFAULT_UNLIT_SHADER_NAME,
} from "./ShaderLibraryCore";
export * from "./ShaderLibraryCore";

export function createDefaultShaderLibrary(): ShaderLibrary {
  const library = new ShaderLibrary();
  validateShaderChunks();
  for (const chunk of SHADER_CHUNKS) {
    library.registerChunk(chunk.name, chunk.source);
  }
  registerLeanUnlitShader(library);
  library.register({
    name: DEFAULT_INSTANCED_UNLIT_SHADER_NAME,
    marker: DEFAULT_INSTANCED_UNLIT_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_INSTANCED_UNLIT_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 4) in vec4 a_color;
uniform mat4 u_modelViewProjection;
uniform mat4 u_instanceMatrices[64];
uniform float u_instanceCount;
uniform float u_instanceAttributeMode;
layout(location = 8) in vec4 a_instanceMatrix0;
layout(location = 9) in vec4 a_instanceMatrix1;
layout(location = 10) in vec4 a_instanceMatrix2;
layout(location = 11) in vec4 a_instanceMatrix3;
layout(location = 12) in vec4 a_instanceColor;
out vec4 v_vertexColor;
void main() {
  int instanceIndex = clamp(gl_InstanceID, 0, max(int(u_instanceCount) - 1, 0));
  mat4 attributeMatrix = mat4(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  mat4 instanceMatrix = u_instanceAttributeMode > 0.5 ? attributeMatrix : u_instanceMatrices[instanceIndex];
  v_vertexColor = a_color * a_instanceColor;
  gl_Position = u_modelViewProjection * instanceMatrix * vec4(a_position, 1.0);
}
`,
    fragment: `#version 300 es
// ${DEFAULT_INSTANCED_UNLIT_SHADER_MARKER}
precision highp float;
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
in vec4 v_vertexColor;
out vec4 outColor;
void main() {
  vec4 base = u_baseColor * v_vertexColor;
  if (base.a < u_alphaCutoff) discard;
  outColor = base;
}
`
  });
  registerLeanPbrShader(library);
  library.register({
    name: DEFAULT_INSTANCED_PBR_SHADER_NAME,
    marker: DEFAULT_INSTANCED_PBR_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_INSTANCED_PBR_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_uv;
layout(location = 7) in vec2 a_uv1;
uniform mat4 u_modelViewProjection;
uniform mat4 u_modelMatrix;
uniform mat4 u_normalMatrix;
uniform mat4 u_instanceMatrices[64];
uniform float u_instanceCount;
uniform float u_instanceAttributeMode;
layout(location = 8) in vec4 a_instanceMatrix0;
layout(location = 9) in vec4 a_instanceMatrix1;
layout(location = 10) in vec4 a_instanceMatrix2;
layout(location = 11) in vec4 a_instanceMatrix3;
layout(location = 12) in vec4 a_instanceColor;
out vec3 v_normal;
out vec3 v_worldPosition;
out vec2 v_a3dDetailUv0;
out vec2 v_a3dDetailUv1;
out vec4 v_instanceColor;
void main() {
  v_a3dDetailUv0 = a_uv;
  v_a3dDetailUv1 = a_uv1;
  int instanceIndex = clamp(gl_InstanceID, 0, max(int(u_instanceCount) - 1, 0));
  mat4 attributeMatrix = mat4(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  mat4 instanceMatrix = u_instanceAttributeMode > 0.5 ? attributeMatrix : u_instanceMatrices[instanceIndex];
  vec4 worldPosition = u_modelMatrix * instanceMatrix * vec4(a_position, 1.0);
  v_normal = mat3(u_normalMatrix) * transpose(inverse(mat3(instanceMatrix))) * a_normal;
  v_worldPosition = worldPosition.xyz;
  v_instanceColor = a_instanceColor;
  gl_Position = u_modelViewProjection * instanceMatrix * vec4(a_position, 1.0);
}
`,
    fragment: `#version 300 es
// ${DEFAULT_INSTANCED_PBR_SHADER_MARKER}
precision highp float;
#include <lighting_common>
#include <pbr_common>
${LEGACY_PBR_SURFACE_DETAIL_GLSL}
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_environmentColor;
uniform float u_environmentIntensity;
uniform float u_materialEnvironmentIntensity;
uniform vec3 u_environmentSkyColor;
uniform vec3 u_environmentHorizonColor;
uniform vec3 u_environmentGroundColor;
uniform vec3 u_environmentSpecularColor;
uniform float u_environmentMapIntensity;
uniform float u_environmentSpecularIntensity;
uniform sampler2D u_environmentMapTexture;
uniform samplerCube u_environmentCubeMapTexture;
uniform float u_environmentCubeMapTextureEnabled;
uniform float u_environmentMapTextureEnabled;
uniform float u_environmentMapTextureIntensity;
uniform float u_environmentMapTextureSpecularIntensity;
uniform float u_environmentMapTextureRotation;
uniform float u_environmentMapTextureMipCount;
uniform float u_environmentMapTextureEncoding;
uniform sampler2D u_environmentBrdfLutTexture;
uniform float u_environmentBrdfLutEnabled;
uniform vec3 u_emissiveColor;
uniform float u_emissiveStrength;
uniform float u_lightCount;
uniform vec4 u_lightData[96];
uniform float u_clusteredLightEnabled;
uniform vec2 u_clusterGridSize;
uniform vec2 u_clusterViewportSize;
uniform sampler2D u_clusterLightData;
uniform sampler2D u_clusterLightIndices;
uniform sampler2D u_shadowMapTexture;
uniform float u_shadowMapEnabled;
uniform mat4 u_shadowMapMatrix;
uniform float u_shadowMapStrength;
uniform float u_shadowMapBias;
uniform float u_shadowMapSlopeBias;
uniform vec2 u_shadowMapTexelSize;
uniform float u_shadowPcfSampleCount;
uniform vec4 u_shadowPcfSamples[32];
uniform sampler2D u_pointShadowMapTexture;
uniform float u_pointShadowMapEnabled;
uniform vec3 u_pointShadowLightPosition;
uniform float u_pointShadowRange;
uniform mat4 u_pointShadowFaceMatrices[6];
uniform vec4 u_pointShadowFaceRects[6];
uniform float u_pointShadowStrength;
uniform float u_pointShadowBias;
uniform float u_pointShadowSlopeBias;
uniform vec2 u_pointShadowTexelSize;
uniform float u_pointShadowPcfSampleCount;
uniform vec4 u_pointShadowPcfSamples[32];
uniform sampler2D u_spotShadowMapTexture;
uniform float u_spotShadowMapEnabled;
uniform vec3 u_spotShadowLightPosition;
uniform vec3 u_spotShadowLightDirection;
uniform mat4 u_spotShadowMatrix;
uniform vec2 u_spotShadowCone;
uniform float u_spotShadowRange;
uniform float u_spotShadowStrength;
uniform float u_spotShadowBias;
uniform float u_spotShadowSlopeBias;
uniform vec2 u_spotShadowTexelSize;
uniform float u_spotShadowPcfSampleCount;
uniform vec4 u_spotShadowPcfSamples[32];
uniform float u_outputColorSpace;
uniform vec3 u_cameraPosition;
uniform float u_environmentFogEnabled;
uniform float u_environmentFogMode;
uniform vec3 u_environmentFogColor;
uniform float u_environmentFogNear;
uniform float u_environmentFogFar;
uniform float u_environmentFogDensity;
uniform float u_environmentFogHeightFalloff;
uniform float u_volumetricIntensity;
uniform vec3 u_volumetricLightDirection;
uniform vec3 u_volumetricLightColor;
uniform float u_environmentFogHeightReference;
uniform float u_environmentFogMaxOpacity;
in vec3 v_normal;
in vec3 v_worldPosition;
in vec4 v_instanceColor;
out vec4 outColor;
#include <environment_fog_common>
#include <contact_shadow_mask>
float a3dForwardShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_shadowMapEnabled < 0.5) return 1.0;
  vec4 lightPosition = u_shadowMapMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_shadowMapSlopeBias * max(u_shadowMapTexelSize.x, u_shadowMapTexelSize.y);
  float projectedDepth = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_shadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_shadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_shadowMapTexelSize;
    float storedDepth = texture(u_shadowMapTexture, uv + offset).r;
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_shadowMapBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_shadowMapStrength, 0.0, 1.0));
}
float a3dPointShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_pointShadowMapEnabled < 0.5) return 1.0;
  vec3 lightToFragment = worldPosition - u_pointShadowLightPosition;
  vec3 absoluteDirection = abs(lightToFragment);
  int faceIndex = absoluteDirection.x >= absoluteDirection.y && absoluteDirection.x >= absoluteDirection.z ? (lightToFragment.x >= 0.0 ? 0 : 1) : (absoluteDirection.y >= absoluteDirection.z ? (lightToFragment.y >= 0.0 ? 2 : 3) : (lightToFragment.z >= 0.0 ? 4 : 5));
  vec4 lightPosition = u_pointShadowFaceMatrices[faceIndex] * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 localUv = projected.xy * 0.5 + 0.5;
  if (localUv.x < 0.0 || localUv.x > 1.0 || localUv.y < 0.0 || localUv.y > 1.0 || length(lightToFragment) > u_pointShadowRange) return 1.0;
  vec4 rect = u_pointShadowFaceRects[faceIndex];
  vec2 uv = rect.xy + localUv * rect.zw;
  float normalDotLight = clamp(abs(dot(normalize(normal), normalize(lightDirection))), 0.0, 1.0);
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_pointShadowSlopeBias * max(u_pointShadowTexelSize.x, u_pointShadowTexelSize.y);
  float projectedDepth = projected.z * 0.5 + 0.5;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_pointShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_pointShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_pointShadowBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > texture(u_pointShadowMapTexture, uv + sampleData.xy * u_pointShadowTexelSize).r ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_pointShadowStrength, 0.0, 1.0));
}
float a3dSpotShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_spotShadowMapEnabled < 0.5) return 1.0;
  vec3 toFragment = worldPosition - u_spotShadowLightPosition;
  float distanceToLight = max(length(toFragment), 0.0001);
  if (distanceToLight > u_spotShadowRange) return 1.0;
  vec3 coneAxis = u_spotShadowLightDirection / max(length(u_spotShadowLightDirection), 0.0001);
  if (dot(toFragment / distanceToLight, coneAxis) < cos(u_spotShadowCone.x)) return 1.0;
  vec4 lightPosition = u_spotShadowMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_spotShadowSlopeBias * max(u_spotShadowTexelSize.x, u_spotShadowTexelSize.y);
  float projectedDepth = projected.z * 0.5 + 0.5;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_spotShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_spotShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_spotShadowTexelSize;
    float storedDepth = texture(u_spotShadowMapTexture, uv + offset).r;
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_spotShadowBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_spotShadowStrength, 0.0, 1.0));
}
float a3dResolveSpotShadowOverride(float baseFactor, float kind, float shadowFlag, vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  float spotGate = step(1.5, kind) * (1.0 - step(2.5, kind)) * step(0.5, u_spotShadowMapEnabled) * step(0.5, shadowFlag);
  return mix(baseFactor, a3dSpotShadowFactor(worldPosition, normal, lightDirection), spotGate);
}
vec2 a3dEnvironmentEquirectUv(vec3 direction, float rotation) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / 6.28318530718 + 0.5 + rotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 a3dEnvironmentCubeDirection(vec3 direction, float rotation) {
  float angle = rotation * 6.28318530718;
  float c = cos(angle);
  float s = sin(angle);
  vec3 d = normalize(direction);
  return normalize(vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
vec3 a3dPbrDecodeEnvironmentSrgb(vec3 encodedColor) {
  return max(encodedColor, vec3(0.0));
}
vec3 a3dPbrDecodeEnvironmentRgbe(vec4 encodedSample) {
  float exponent = encodedSample.a * 255.0;
  float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
  return max(encodedSample.rgb * scale, vec3(0.0));
}
vec3 a3dPbrDecodeEnvironmentSample(vec4 encodedSample) {
  if (u_environmentMapTextureEncoding > 1.5) return max(encodedSample.rgb, vec3(0.0));
  if (u_environmentMapTextureEncoding > 0.5) return a3dPbrDecodeEnvironmentRgbe(encodedSample);
  return a3dPbrDecodeEnvironmentSrgb(encodedSample.rgb);
}
vec3 a3dPbrBoundHdrSpecularRadiance(vec3 radiance) {
  return clamp(radiance, vec3(0.0), vec3(65504.0));
}
vec3 a3dPbrClampSampledSpecularEdgeEnergy(vec3 radiance, float nDotV, float roughness) {
  return max(radiance, vec3(0.0));
}
vec4 a3dPbrEnvironmentSampleRaw(vec3 direction, float lod) {
  vec4 equirectSample = textureLod(u_environmentMapTexture, a3dEnvironmentEquirectUv(direction, u_environmentMapTextureRotation), lod);
  vec4 cubeSample = textureLod(u_environmentCubeMapTexture, a3dEnvironmentCubeDirection(direction, u_environmentMapTextureRotation), lod);
  return mix(equirectSample, cubeSample, step(0.5, u_environmentCubeMapTextureEnabled));
}
vec3 a3dPbrEnvironmentDiffuseInput(vec3 normal) {
  float environmentHemi = mix(0.35, 1.0, clamp(normal.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 ambientEnvironment = u_environmentColor * u_environmentIntensity * environmentHemi;
  float proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity);
  float skyBlend = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  float horizonBlend = 1.0 - abs(normal.y);
  vec3 proceduralDiffuse = mix(u_environmentGroundColor, u_environmentSkyColor, skyBlend);
  proceduralDiffuse = mix(proceduralDiffuse, u_environmentHorizonColor, clamp(horizonBlend, 0.0, 1.0) * 0.55);
  vec3 environmentDiffuse = ambientEnvironment + proceduralDiffuse * u_environmentMapIntensity * proceduralEnvironmentWeight;
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureIntensity);
  float diffuseEnvironmentLod = max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledDiffuse = a3dPbrDecodeEnvironmentSample(a3dPbrEnvironmentSampleRaw(normal, diffuseEnvironmentLod));
  return mix(environmentDiffuse, ambientEnvironment + sampledDiffuse * u_environmentMapTextureIntensity * u_materialEnvironmentIntensity, sampledEnvironmentWeight);
}
vec3 a3dPbrEnvironmentSpecularInput(vec3 normal, vec3 viewDirection, float roughness) {
  float proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity);
  vec3 reflectionDirection = reflect(-viewDirection, normal);
  float clampedRoughness = clamp(roughness, 0.0, 1.0);
  float reflectionBand = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(18.0, 2.0, clampedRoughness));
  float roughEnvironmentFloor = mix(0.04, 0.38, clampedRoughness);
  float proceduralSpecularResponse = max(reflectionBand, roughEnvironmentFloor);
  float horizonStripe = pow(clamp(1.0 - abs(reflectionDirection.y), 0.0, 1.0), mix(14.0, 3.0, clampedRoughness));
  float sideStripe = pow(clamp(abs(reflectionDirection.x), 0.0, 1.0), mix(10.0, 3.0, clampedRoughness)) * smoothstep(0.0, 0.72, 1.0 - abs(reflectionDirection.y));
  float overheadStripe = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(22.0, 4.0, clampedRoughness));
  vec3 proceduralSpecularColor = u_environmentSpecularColor * proceduralSpecularResponse
    + u_environmentHorizonColor * horizonStripe * 0.42
    + u_environmentSkyColor * overheadStripe * 0.28
    + u_environmentGroundColor * sideStripe * 0.22;
  vec3 proceduralSpecular = proceduralSpecularColor * u_environmentSpecularIntensity * proceduralEnvironmentWeight;
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureSpecularIntensity);
  float environmentLod = clampedRoughness * max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledSpecular = a3dPbrBoundHdrSpecularRadiance(a3dPbrDecodeEnvironmentSample(a3dPbrEnvironmentSampleRaw(reflectionDirection, environmentLod)));
  float nDotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
  sampledSpecular = a3dPbrClampSampledSpecularEdgeEnergy(sampledSpecular, nDotV, clampedRoughness);
  sampledSpecular *= u_environmentMapTextureSpecularIntensity * u_materialEnvironmentIntensity * sampledEnvironmentWeight * mix(0.84, 0.58, clampedRoughness);
  return proceduralSpecular + sampledSpecular;
}
vec2 a3dPbrEnvironmentBrdfInput(vec3 normal, vec3 viewDirection, float roughness) {
  float nDotV = clamp(dot(normalize(normal), normalize(viewDirection)), 0.0, 1.0);
  vec2 lut = texture(u_environmentBrdfLutTexture, vec2(nDotV, clamp(roughness, 0.0, 1.0))).rg;
  return mix(vec2(1.0, 0.0), lut, step(0.0001, u_environmentBrdfLutEnabled));
}
vec3 a3dLinearToSrgb(vec3 linear) {
  vec3 clamped = max(linear, vec3(0.0));
  vec3 low = clamped * 12.92;
  vec3 high = 1.055 * pow(clamped, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), clamped));
}
vec3 a3dPbrEncodeOutput(vec3 linearColor) {
  vec3 color = max(linearColor, vec3(0.0));
  vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
  vec3 srgb = a3dLinearToSrgb(filmic);
  return mix(color, srgb, step(0.5, u_outputColorSpace));
}
void main() {
  a3dLegacySetDiffuseDetail();
  vec3 normal = normalize(v_normal);
  if (!gl_FrontFacing) normal = -normal;
  normal = a3dLegacyBumpNormal(v_worldPosition, normalize(v_normal) * (gl_FrontFacing ? 1.0 : -1.0), normal);
  vec3 viewDirection = normalize(u_cameraPosition - v_worldPosition);
  vec3 base = u_baseColor.rgb * v_instanceColor.rgb;
  vec3 shaded = u_emissiveColor * u_emissiveStrength + a3dPbrEnvironmentLightSplitSum(
    normal,
    viewDirection,
    a3dPbrEnvironmentDiffuseInput(normal),
    a3dPbrEnvironmentSpecularInput(normal, viewDirection, u_roughness),
    a3dPbrEnvironmentBrdfInput(normal, viewDirection, u_roughness),
    base,
    u_metallic,
    u_roughness,
    1.0,
    vec3(1.0)
  );
  ivec2 clusterTile = clamp(ivec2(floor(min(gl_FragCoord.xy, u_clusterViewportSize) / vec2(64.0))), ivec2(0), ivec2(u_clusterGridSize) - ivec2(1));
  int clusterIndex = clusterTile.y * int(u_clusterGridSize.x) + clusterTile.x;
  int count = u_clusteredLightEnabled > 0.5 ? min(int(texelFetch(u_clusterLightIndices, ivec2(0, clusterIndex), 0).g), 64) : min(int(u_lightCount), 16);
  for (int i = 0; i < 64; ++i) {
    if (i >= count) break;
    int lightIndex = u_clusteredLightEnabled > 0.5 ? int(texelFetch(u_clusterLightIndices, ivec2(i, clusterIndex), 0).r) : i;
    int baseIndex = lightIndex * 6;
    vec4 colorIntensity = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(0, lightIndex), 0) : u_lightData[baseIndex];
    vec4 positionRange = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(1, lightIndex), 0) : u_lightData[baseIndex + 1];
    vec4 directionKind = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(2, lightIndex), 0) : u_lightData[baseIndex + 2];
    vec4 spotShadowLayer = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(3, lightIndex), 0) : u_lightData[baseIndex + 3];
    vec4 areaRight = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(4, lightIndex), 0) : u_lightData[baseIndex + 4];
    vec4 areaUp = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(5, lightIndex), 0) : u_lightData[baseIndex + 5];
    float kind = directionKind.w;
    if (kind > 2.5) {
      shaded += a3dPbrRectAreaLight(
        v_worldPosition, positionRange.xyz, directionKind.xyz, areaRight.xyz, areaUp.xyz,
        spotShadowLayer.x, spotShadowLayer.y, positionRange.w, areaUp.w,
        normal, viewDirection, colorIntensity.rgb, colorIntensity.a,
        base, u_metallic, u_roughness, 1.0, vec3(1.0)
      );
      continue;
    }
    vec3 lightDirection = -directionKind.xyz;
    float attenuation = 1.0;
    if (kind > 0.5) {
      vec3 toLight = positionRange.xyz - v_worldPosition;
      float distanceToLight = length(toLight);
      lightDirection = distanceToLight > 0.0001 ? toLight / distanceToLight : -directionKind.xyz;
      // range <= 0 means infinite (physical descriptors, PRD-02 §6.3): no
      // range window, decay-only attenuation. Legacy ranges are always > 0.
      float rangeFalloff = positionRange.w <= 0.0 ? 1.0 : clamp(1.0 - pow(distanceToLight / max(positionRange.w, 0.0001), 4.0), 0.0, 1.0);
      rangeFalloff *= rangeFalloff;
      attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);
    }
    if (kind > 1.5) {
      vec3 lightToFragment = normalize(v_worldPosition - positionRange.xyz);
      float cone = dot(normalize(directionKind.xyz), lightToFragment);
      if (areaUp.w > 0.5) cone = abs(cone);
      float outer = cos(spotShadowLayer.x);
      float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    float shadowFactor = a3dResolveSpotShadowOverride(mix(1.0, kind > 0.5 && kind < 1.5 ? a3dPointShadowFactor(v_worldPosition, normal, lightDirection) : a3dForwardShadowFactor(v_worldPosition, normal, lightDirection) * (lightIndex == int(u_contactShadowLightIndex) ? a3dContactShadowMaskFactor(kind) : 1.0), step(0.5, spotShadowLayer.z)), kind, spotShadowLayer.z, v_worldPosition, normal, lightDirection);
    shaded += a3dPbrDirectLight(normal, viewDirection, lightDirection, colorIntensity.rgb, colorIntensity.a * attenuation * shadowFactor, base, u_metallic, u_roughness, 1.0, vec3(1.0));
  }
  float alpha = u_baseColor.a * v_instanceColor.a;
  if (alpha < u_alphaCutoff) discard;
  vec3 fogged = a3dApplyEnvironmentFog(max(shaded, vec3(0.0)), v_worldPosition);
  outColor = vec4(a3dPbrEncodeOutput(fogged), alpha);
}
`
  });
  library.register({
    name: DEFAULT_TEXTURED_UNLIT_SHADER_NAME,
    marker: DEFAULT_TEXTURED_UNLIT_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_TEXTURED_UNLIT_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 2) in vec2 a_uv;
layout(location = 4) in vec4 a_color;
layout(location = 8) in vec4 a_instanceMatrix0;
layout(location = 9) in vec4 a_instanceMatrix1;
layout(location = 10) in vec4 a_instanceMatrix2;
layout(location = 11) in vec4 a_instanceMatrix3;
layout(location = 12) in vec4 a_instanceColor;
uniform mat4 u_modelViewProjection;
uniform vec2 u_baseColorTextureOffset;
uniform vec2 u_baseColorTextureScale;
uniform float u_baseColorTextureRotation;
uniform mat4 u_instanceMatrices[64];
uniform float u_instanceCount;
uniform float u_instanceAttributeMode;
out vec2 v_uv;
out vec4 v_vertexColor;
void main() {
  vec2 scaledUv = a_uv * u_baseColorTextureScale;
  float c = cos(u_baseColorTextureRotation);
  float s = sin(u_baseColorTextureRotation);
  v_uv = vec2(scaledUv.x * c - scaledUv.y * s, scaledUv.x * s + scaledUv.y * c) + u_baseColorTextureOffset;
  if (u_instanceCount > 0.5) {
    int instanceIndex = clamp(gl_InstanceID, 0, max(int(u_instanceCount) - 1, 0));
    mat4 attributeMatrix = mat4(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
    mat4 instanceMatrix = u_instanceAttributeMode > 0.5 ? attributeMatrix : u_instanceMatrices[instanceIndex];
    v_vertexColor = a_color * a_instanceColor;
    gl_Position = u_modelViewProjection * instanceMatrix * vec4(a_position, 1.0);
  } else {
    v_vertexColor = a_color;
    gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
  }
}
`,
    fragment: `#version 300 es
// ${DEFAULT_TEXTURED_UNLIT_SHADER_MARKER}
precision highp float;
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
uniform sampler2D u_baseColorTexture;
in vec2 v_uv;
in vec4 v_vertexColor;
out vec4 outColor;
void main() {
  vec4 base = texture(u_baseColorTexture, v_uv) * u_baseColor * v_vertexColor;
  if (base.a < u_alphaCutoff) discard;
  outColor = base;
}
`
  });
  library.register({
    name: DEFAULT_SKINNED_UNLIT_SHADER_NAME,
    marker: DEFAULT_SKINNED_UNLIT_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_SKINNED_UNLIT_SHADER_MARKER}
precision highp float;
#include <skinning_common>
layout(location = 0) in vec3 a_position;
layout(location = 5) in vec4 a_joints;
layout(location = 6) in vec4 a_weights;
uniform mat4 u_modelViewProjection;
void main() {
  mat4 skin = a3dSkinMatrix4(a_joints, a_weights);
  float weightSum = a_weights.x + a_weights.y + a_weights.z + a_weights.w;
  vec4 skinnedPosition = weightSum > 0.0001 ? skin * vec4(a_position, 1.0) : vec4(a_position, 1.0);
  gl_Position = u_modelViewProjection * skinnedPosition;
}
`,
    fragment: `#version 300 es
// ${DEFAULT_SKINNED_UNLIT_SHADER_MARKER}
precision highp float;
uniform vec4 u_baseColor;
out vec4 outColor;
void main() {
  outColor = u_baseColor;
}
`
  });
  library.register({
    name: DEFAULT_SKINNED_LIT_SHADER_NAME,
    marker: DEFAULT_SKINNED_LIT_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_SKINNED_LIT_SHADER_MARKER}
precision highp float;
#include <skinning_common>
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_uv;
layout(location = 7) in vec2 a_uv1;
layout(location = 3) in vec4 a_tangent;
layout(location = 4) in vec4 a_color;
layout(location = 5) in vec4 a_joints;
layout(location = 6) in vec4 a_weights;
uniform mat4 u_modelViewProjection;
uniform mat4 u_modelMatrix;
uniform mat4 u_normalMatrix;
uniform vec2 u_baseColorTextureOffset;
uniform vec2 u_baseColorTextureScale;
uniform float u_baseColorTextureRotation;
out vec3 v_normal;
out vec4 v_tangent;
out vec3 v_worldPosition;
out vec2 v_a3dDetailUv0;
out vec2 v_a3dDetailUv1;
out vec2 v_uv;
out vec4 v_vertexColor;
out float v_weightSum;
void main() {
  v_a3dDetailUv0 = a_uv;
  v_a3dDetailUv1 = a_uv1;
  vec2 scaledUv = a_uv * u_baseColorTextureScale;
  float c = cos(u_baseColorTextureRotation);
  float s = sin(u_baseColorTextureRotation);
  v_uv = vec2(scaledUv.x * c - scaledUv.y * s, scaledUv.x * s + scaledUv.y * c) + u_baseColorTextureOffset;
  v_vertexColor = a_color;
  mat4 skin = a3dSkinMatrix4(a_joints, a_weights);
  v_weightSum = a_weights.x + a_weights.y + a_weights.z + a_weights.w;
  vec4 skinnedPosition = v_weightSum > 0.0001 ? skin * vec4(a_position, 1.0) : vec4(a_position, 1.0);
  vec3 skinnedNormal = (v_weightSum > 0.0001 ? skin * vec4(a_normal, 0.0) : vec4(a_normal, 0.0)).xyz;
  vec3 skinnedTangent = (v_weightSum > 0.0001 ? skin * vec4(a_tangent.xyz, 0.0) : vec4(a_tangent.xyz, 0.0)).xyz;
  v_normal = mat3(u_normalMatrix) * skinnedNormal;
  v_tangent = vec4(mat3(u_normalMatrix) * skinnedTangent, a_tangent.w);
  v_worldPosition = (u_modelMatrix * skinnedPosition).xyz;
  gl_Position = u_modelViewProjection * skinnedPosition;
}
`,
    fragment: `#version 300 es
// ${DEFAULT_SKINNED_LIT_SHADER_MARKER}
precision highp float;
#include <lighting_common>
#include <pbr_common>
${LEGACY_PBR_SURFACE_DETAIL_GLSL}
uniform vec4 u_baseColor;
uniform sampler2D u_baseColorTexture;
uniform float u_baseColorTextureEnabled;
uniform sampler2D u_normalTexture;
uniform float u_normalTextureEnabled;
uniform float u_normalScale;
uniform float u_wrinkleStrength;
uniform sampler2D u_metallicRoughnessTexture;
uniform float u_metallicRoughnessTextureEnabled;
uniform sampler2D u_occlusionTexture;
uniform float u_occlusionTextureEnabled;
uniform float u_occlusionStrength;
uniform sampler2D u_emissiveTexture;
uniform float u_emissiveTextureEnabled;
uniform float u_alphaCutoff;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_environmentColor;
uniform float u_environmentIntensity;
uniform float u_materialEnvironmentIntensity;
uniform vec3 u_environmentSkyColor;
uniform vec3 u_environmentHorizonColor;
uniform vec3 u_environmentGroundColor;
uniform vec3 u_environmentSpecularColor;
uniform float u_environmentMapIntensity;
uniform float u_environmentSpecularIntensity;
uniform sampler2D u_environmentMapTexture;
uniform samplerCube u_environmentCubeMapTexture;
uniform float u_environmentCubeMapTextureEnabled;
uniform float u_environmentMapTextureEnabled;
uniform float u_environmentMapTextureIntensity;
uniform float u_environmentMapTextureSpecularIntensity;
uniform float u_environmentMapTextureRotation;
uniform float u_environmentMapTextureMipCount;
uniform float u_environmentMapTextureEncoding;
uniform sampler2D u_environmentBrdfLutTexture;
uniform float u_environmentBrdfLutEnabled;
uniform vec3 u_emissiveColor;
uniform float u_emissiveStrength;
uniform float u_clearcoatFactor;
uniform float u_clearcoatRoughnessFactor;
uniform float u_transmissionFactor;
uniform float u_diffuseTransmissionFactor;
uniform vec3 u_diffuseTransmissionColorFactor;
uniform float u_transmissionFallbackEnergy;
uniform float u_volumeThicknessFactor;
uniform float u_volumeAttenuationDistance;
uniform vec3 u_volumeAttenuationColor;
uniform float u_transmissionParallaxStrength;
uniform vec3 u_transmissionParallaxBoxMin;
uniform vec3 u_transmissionParallaxBoxMax;
uniform float u_transmissionBounceCount;
uniform float u_transmissionCausticStrength;
uniform float u_ior;
uniform float u_specularFactor;
uniform vec3 u_specularColorFactor;
uniform vec3 u_sheenColorFactor;
uniform float u_sheenRoughnessFactor;
uniform float u_anisotropyStrength;
uniform float u_anisotropyRotation;
uniform float u_iridescenceFactor;
uniform float u_iridescenceIor;
uniform float u_iridescenceThicknessMinimum;
uniform float u_iridescenceThicknessMaximum;
uniform float u_dispersion;
uniform float u_lightCount;
uniform vec4 u_lightData[96];
uniform float u_clusteredLightEnabled;
uniform vec2 u_clusterGridSize;
uniform vec2 u_clusterViewportSize;
uniform sampler2D u_clusterLightData;
uniform sampler2D u_clusterLightIndices;
uniform sampler2D u_shadowMapTexture;
uniform float u_shadowMapEnabled;
uniform mat4 u_shadowMapMatrix;
uniform float u_shadowMapStrength;
uniform float u_shadowMapBias;
uniform float u_shadowMapSlopeBias;
uniform vec2 u_shadowMapTexelSize;
uniform float u_shadowPcfSampleCount;
uniform vec4 u_shadowPcfSamples[32];
uniform sampler2D u_pointShadowMapTexture;
uniform float u_pointShadowMapEnabled;
uniform vec3 u_pointShadowLightPosition;
uniform float u_pointShadowRange;
uniform mat4 u_pointShadowFaceMatrices[6];
uniform vec4 u_pointShadowFaceRects[6];
uniform float u_pointShadowStrength;
uniform float u_pointShadowBias;
uniform float u_pointShadowSlopeBias;
uniform vec2 u_pointShadowTexelSize;
uniform float u_pointShadowPcfSampleCount;
uniform vec4 u_pointShadowPcfSamples[32];
uniform sampler2D u_spotShadowMapTexture;
uniform float u_spotShadowMapEnabled;
uniform vec3 u_spotShadowLightPosition;
uniform vec3 u_spotShadowLightDirection;
uniform mat4 u_spotShadowMatrix;
uniform vec2 u_spotShadowCone;
uniform float u_spotShadowRange;
uniform float u_spotShadowStrength;
uniform float u_spotShadowBias;
uniform float u_spotShadowSlopeBias;
uniform vec2 u_spotShadowTexelSize;
uniform float u_spotShadowPcfSampleCount;
uniform vec4 u_spotShadowPcfSamples[32];
uniform float u_outputColorSpace;
uniform vec3 u_cameraPosition;
uniform float u_environmentFogEnabled;
uniform float u_environmentFogMode;
uniform vec3 u_environmentFogColor;
uniform float u_environmentFogNear;
uniform float u_environmentFogFar;
uniform float u_environmentFogDensity;
uniform float u_environmentFogHeightFalloff;
uniform float u_volumetricIntensity;
uniform vec3 u_volumetricLightDirection;
uniform vec3 u_volumetricLightColor;
uniform float u_environmentFogHeightReference;
uniform float u_environmentFogMaxOpacity;
in vec3 v_normal;
in vec4 v_tangent;
in vec3 v_worldPosition;
in vec2 v_uv;
in vec4 v_vertexColor;
in float v_weightSum;
out vec4 outColor;
#include <environment_fog_common>
#include <contact_shadow_mask>
vec2 a3dEnvironmentEquirectUv(vec3 direction, float rotation) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / 6.28318530718 + 0.5 + rotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 a3dEnvironmentCubeDirection(vec3 direction, float rotation) {
  float angle = rotation * 6.28318530718;
  float c = cos(angle);
  float s = sin(angle);
  vec3 d = normalize(direction);
  return normalize(vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
vec3 a3dPbrDecodeEnvironmentSrgb(vec3 encodedColor) {
  return max(encodedColor, vec3(0.0));
}
vec3 a3dPbrDecodeEnvironmentRgbe(vec4 encodedSample) {
  float exponent = encodedSample.a * 255.0;
  float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
  return max(encodedSample.rgb * scale, vec3(0.0));
}
vec3 a3dPbrDecodeEnvironmentSample(vec4 encodedSample) {
  if (u_environmentMapTextureEncoding > 1.5) return max(encodedSample.rgb, vec3(0.0));
  if (u_environmentMapTextureEncoding > 0.5) return a3dPbrDecodeEnvironmentRgbe(encodedSample);
  return a3dPbrDecodeEnvironmentSrgb(encodedSample.rgb);
}
vec3 a3dPbrBoundHdrSpecularRadiance(vec3 radiance) {
  return clamp(radiance, vec3(0.0), vec3(65504.0));
}
vec3 a3dPbrClampSampledSpecularEdgeEnergy(vec3 radiance, float nDotV, float roughness) {
  return max(radiance, vec3(0.0));
}
vec4 a3dPbrEnvironmentSampleRaw(vec3 direction, float lod) {
  vec4 equirectSample = textureLod(u_environmentMapTexture, a3dEnvironmentEquirectUv(direction, u_environmentMapTextureRotation), lod);
  vec4 cubeSample = textureLod(u_environmentCubeMapTexture, a3dEnvironmentCubeDirection(direction, u_environmentMapTextureRotation), lod);
  return mix(equirectSample, cubeSample, step(0.5, u_environmentCubeMapTextureEnabled));
}
/**
 * Procedural wrinkle detail (E1 face-rig demo): high-frequency normal perturbation driven
 * by u_wrinkleStrength, which the engine resolves per frame from live morph weights
 * (resolveWrinkleMapStrength). Stable in world space (no time input); strength 0 uploads
 * 0 and the guarded call site below leaves the normal bit-identical.
 */
vec3 a3dWrinkleDetail(vec3 p) {
  float f = sin(p.x * 230.0) * sin(p.y * 197.0 + 1.7) * sin(p.z * 211.0 + 0.6);
  float g = sin(p.x * 97.0 + 0.4) * sin(p.y * 113.0 + 2.1) * sin(p.z * 103.0 + 1.2);
  return vec3(f, g, f * g) * 0.35;
}
vec3 a3dSkinnedPbrNormal(vec3 baseNormal, vec4 tangentFrame, vec2 uv) {
  vec3 sampled = texture(u_normalTexture, uv).xyz * 2.0 - 1.0;
  vec3 n = normalize(baseNormal);
  vec3 tangent = normalize(tangentFrame.xyz);
  vec3 bitangent = normalize(cross(n, tangent) * tangentFrame.w);
  return normalize(tangent * sampled.x * u_normalScale + bitangent * sampled.y * u_normalScale + n * max(sampled.z, 0.001));
}
float a3dForwardShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_shadowMapEnabled < 0.5) return 1.0;
  vec4 lightPosition = u_shadowMapMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_shadowMapSlopeBias * max(u_shadowMapTexelSize.x, u_shadowMapTexelSize.y);
  float projectedDepth = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_shadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_shadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_shadowMapTexelSize;
    float storedDepth = texture(u_shadowMapTexture, uv + offset).r;
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_shadowMapBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_shadowMapStrength, 0.0, 1.0));
}
float a3dPointShadowFaceIndex(vec3 direction) {
  vec3 absoluteDirection = abs(direction);
  if (absoluteDirection.x >= absoluteDirection.y && absoluteDirection.x >= absoluteDirection.z) return direction.x >= 0.0 ? 0.0 : 1.0;
  if (absoluteDirection.y >= absoluteDirection.x && absoluteDirection.y >= absoluteDirection.z) return direction.y >= 0.0 ? 2.0 : 3.0;
  return direction.z >= 0.0 ? 4.0 : 5.0;
}
float a3dPointShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_pointShadowMapEnabled < 0.5) return 1.0;
  vec3 lightToFragment = worldPosition - u_pointShadowLightPosition;
  float distanceToLight = length(lightToFragment);
  if (distanceToLight > u_pointShadowRange) return 1.0;
  int faceIndex = int(a3dPointShadowFaceIndex(lightToFragment));
  vec4 lightPosition = u_pointShadowFaceMatrices[faceIndex] * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 localUv = projected.xy * 0.5 + 0.5;
  if (localUv.x < 0.0 || localUv.x > 1.0 || localUv.y < 0.0 || localUv.y > 1.0) return 1.0;
  vec4 rect = u_pointShadowFaceRects[faceIndex];
  vec2 uv = rect.xy + localUv * rect.zw;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_pointShadowSlopeBias * max(u_pointShadowTexelSize.x, u_pointShadowTexelSize.y);
  float projectedDepth = projected.z * 0.5 + 0.5;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_pointShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_pointShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_pointShadowTexelSize;
    float storedDepth = texture(u_pointShadowMapTexture, uv + offset).r;
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_pointShadowBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_pointShadowStrength, 0.0, 1.0));
}
float a3dSpotShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_spotShadowMapEnabled < 0.5) return 1.0;
  vec3 toFragment = worldPosition - u_spotShadowLightPosition;
  float distanceToLight = max(length(toFragment), 0.0001);
  if (distanceToLight > u_spotShadowRange) return 1.0;
  vec3 coneAxis = u_spotShadowLightDirection / max(length(u_spotShadowLightDirection), 0.0001);
  if (dot(toFragment / distanceToLight, coneAxis) < cos(u_spotShadowCone.x)) return 1.0;
  vec4 lightPosition = u_spotShadowMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_spotShadowSlopeBias * max(u_spotShadowTexelSize.x, u_spotShadowTexelSize.y);
  float projectedDepth = projected.z * 0.5 + 0.5;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_spotShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_spotShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_spotShadowTexelSize;
    float storedDepth = texture(u_spotShadowMapTexture, uv + offset).r;
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_spotShadowBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_spotShadowStrength, 0.0, 1.0));
}
float a3dResolveSpotShadowOverride(float baseFactor, float kind, float shadowFlag, vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  float spotGate = step(1.5, kind) * (1.0 - step(2.5, kind)) * step(0.5, u_spotShadowMapEnabled) * step(0.5, shadowFlag);
  return mix(baseFactor, a3dSpotShadowFactor(worldPosition, normal, lightDirection), spotGate);
}
vec3 a3dLinearToSrgb(vec3 linear) {
  vec3 clamped = max(linear, vec3(0.0));
  vec3 low = clamped * 12.92;
  vec3 high = 1.055 * pow(clamped, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), clamped));
}
vec3 a3dPbrEncodeOutput(vec3 linearColor) {
  vec3 color = max(linearColor, vec3(0.0));
  vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
  vec3 srgb = a3dLinearToSrgb(filmic);
  return mix(color, srgb, step(0.5, u_outputColorSpace));
}
void main() {
  a3dLegacySetDiffuseDetail();
  vec3 normal = normalize(v_normal);
  normal = mix(normal, a3dSkinnedPbrNormal(v_normal, v_tangent, v_uv), step(0.5, u_normalTextureEnabled));
  if (u_wrinkleStrength > 0.0) {
    normal = normalize(normal + u_wrinkleStrength * a3dWrinkleDetail(v_worldPosition));
  }
  if (!gl_FrontFacing) normal = -normal;
  normal = a3dLegacyBumpNormal(v_worldPosition, normalize(v_normal) * (gl_FrontFacing ? 1.0 : -1.0), normal);
  vec3 viewDirection = normalize(u_cameraPosition - v_worldPosition);
  vec4 sampledBaseColor = texture(u_baseColorTexture, v_uv);
  vec4 decodedBaseColor = vec4(a3dPbrDecodeEnvironmentSrgb(sampledBaseColor.rgb), sampledBaseColor.a);
  float baseColorTextureWeight = clamp(u_baseColorTextureEnabled, 0.0, 1.0);
  vec4 baseColor = mix(u_baseColor, u_baseColor * decodedBaseColor, baseColorTextureWeight) * v_vertexColor;
  vec4 metallicRoughnessSample = texture(u_metallicRoughnessTexture, v_uv);
  float metallic = mix(u_metallic, clamp(u_metallic * metallicRoughnessSample.b, 0.0, 1.0), step(0.5, u_metallicRoughnessTextureEnabled));
  float roughness = mix(u_roughness, clamp(u_roughness * metallicRoughnessSample.g, 0.0, 1.0), step(0.5, u_metallicRoughnessTextureEnabled));
  float occlusion = mix(1.0, mix(1.0, texture(u_occlusionTexture, v_uv).r, clamp(u_occlusionStrength, 0.0, 1.0)), step(0.5, u_occlusionTextureEnabled));
  vec3 emissive = u_emissiveColor * u_emissiveStrength * mix(vec3(1.0), a3dPbrDecodeEnvironmentSrgb(texture(u_emissiveTexture, v_uv).rgb), step(0.5, u_emissiveTextureEnabled));
  vec3 materialBase = a3dApplyAdvancedPbrLobes(
    baseColor.rgb,
    u_clearcoatFactor,
    u_clearcoatRoughnessFactor,
    u_transmissionFactor,
    u_diffuseTransmissionFactor,
    u_diffuseTransmissionColorFactor,
    u_transmissionFallbackEnergy,
    u_volumeThicknessFactor,
    u_volumeAttenuationDistance,
    u_volumeAttenuationColor,
    u_ior,
    u_specularFactor,
    u_specularColorFactor,
    u_sheenColorFactor,
    u_sheenRoughnessFactor,
    u_anisotropyStrength,
    u_anisotropyRotation,
    u_iridescenceFactor,
    u_iridescenceIor,
    u_iridescenceThicknessMinimum,
    u_iridescenceThicknessMaximum,
    u_dispersion
  );
  float environmentHemi = mix(0.35, 1.0, clamp(normal.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 ambientEnvironment = u_environmentColor * u_environmentIntensity * environmentHemi;
  float proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity);
  float skyBlend = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  float horizonBlend = 1.0 - abs(normal.y);
  vec3 proceduralDiffuse = mix(u_environmentGroundColor, u_environmentSkyColor, skyBlend);
  proceduralDiffuse = mix(proceduralDiffuse, u_environmentHorizonColor, clamp(horizonBlend, 0.0, 1.0) * 0.55);
  vec3 environmentDiffuse = ambientEnvironment + proceduralDiffuse * u_environmentMapIntensity * proceduralEnvironmentWeight;
  vec3 reflectionDirection = reflect(-viewDirection, normal);
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureIntensity);
  float diffuseEnvironmentLod = max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledDiffuse = a3dPbrDecodeEnvironmentSample(a3dPbrEnvironmentSampleRaw(normal, diffuseEnvironmentLod));
  float clampedRoughness = clamp(roughness, 0.0, 1.0);
  float reflectionBand = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(18.0, 2.0, clampedRoughness));
  float roughEnvironmentFloor = mix(0.04, 0.38, clampedRoughness);
  float proceduralSpecularResponse = max(reflectionBand, roughEnvironmentFloor);
  float horizonStripe = pow(clamp(1.0 - abs(reflectionDirection.y), 0.0, 1.0), mix(14.0, 3.0, clampedRoughness));
  float sideStripe = pow(clamp(abs(reflectionDirection.x), 0.0, 1.0), mix(10.0, 3.0, clampedRoughness)) * smoothstep(0.0, 0.72, 1.0 - abs(reflectionDirection.y));
  float overheadStripe = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(22.0, 4.0, clampedRoughness));
  vec3 proceduralSpecularColor = u_environmentSpecularColor * proceduralSpecularResponse
    + u_environmentHorizonColor * horizonStripe * 0.42
    + u_environmentSkyColor * overheadStripe * 0.28
    + u_environmentGroundColor * sideStripe * 0.22;
  vec3 proceduralSpecular = proceduralSpecularColor * u_environmentSpecularIntensity * proceduralEnvironmentWeight;
  float environmentLod = clampedRoughness * max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledSpecular = a3dPbrBoundHdrSpecularRadiance(a3dPbrDecodeEnvironmentSample(a3dPbrEnvironmentSampleRaw(reflectionDirection, environmentLod)));
  float nDotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
  vec2 brdfLut = texture(u_environmentBrdfLutTexture, vec2(nDotV, clampedRoughness)).rg;
  sampledSpecular = a3dPbrClampSampledSpecularEdgeEnergy(sampledSpecular, nDotV, clampedRoughness);
  sampledSpecular *= u_environmentMapTextureSpecularIntensity * u_materialEnvironmentIntensity * sampledEnvironmentWeight * mix(1.1, 0.65, roughness);
  vec3 shaded = a3dPbrEnvironmentLightSplitSum(
    normal,
    viewDirection,
    mix(environmentDiffuse, ambientEnvironment + sampledDiffuse * u_environmentMapTextureIntensity * u_materialEnvironmentIntensity, sampledEnvironmentWeight),
    proceduralSpecular + sampledSpecular,
    mix(vec2(1.0, 0.0), brdfLut, step(0.0001, u_environmentBrdfLutEnabled)),
    materialBase,
    metallic,
    roughness,
    u_specularFactor,
    u_specularColorFactor
  ) * occlusion + emissive;
  ivec2 clusterTile = clamp(ivec2(floor(min(gl_FragCoord.xy, u_clusterViewportSize) / vec2(64.0))), ivec2(0), ivec2(u_clusterGridSize) - ivec2(1));
  int clusterIndex = clusterTile.y * int(u_clusterGridSize.x) + clusterTile.x;
  int count = u_clusteredLightEnabled > 0.5 ? min(int(texelFetch(u_clusterLightIndices, ivec2(0, clusterIndex), 0).g), 64) : min(int(u_lightCount), 16);
  for (int i = 0; i < 64; ++i) {
    if (i >= count) break;
    int lightIndex = u_clusteredLightEnabled > 0.5 ? int(texelFetch(u_clusterLightIndices, ivec2(i, clusterIndex), 0).r) : i;
    int baseIndex = lightIndex * 6;
    vec4 colorIntensity = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(0, lightIndex), 0) : u_lightData[baseIndex];
    vec4 positionRange = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(1, lightIndex), 0) : u_lightData[baseIndex + 1];
    vec4 directionKind = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(2, lightIndex), 0) : u_lightData[baseIndex + 2];
    vec4 spotShadowLayer = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(3, lightIndex), 0) : u_lightData[baseIndex + 3];
    vec4 areaRight = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(4, lightIndex), 0) : u_lightData[baseIndex + 4];
    vec4 areaUp = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(5, lightIndex), 0) : u_lightData[baseIndex + 5];
    float kind = directionKind.w;
    if (kind > 2.5) {
      shaded += a3dPbrRectAreaLight(
        v_worldPosition, positionRange.xyz, directionKind.xyz, areaRight.xyz, areaUp.xyz,
        spotShadowLayer.x, spotShadowLayer.y, positionRange.w, areaUp.w,
        normal, viewDirection, colorIntensity.rgb, colorIntensity.a,
        materialBase, metallic, roughness, u_specularFactor, u_specularColorFactor
      );
      continue;
    }
    vec3 lightDirection = -directionKind.xyz;
    float attenuation = 1.0;
    if (kind > 0.5) {
      vec3 toLight = positionRange.xyz - v_worldPosition;
      float distanceToLight = length(toLight);
      lightDirection = distanceToLight > 0.0001 ? toLight / distanceToLight : -directionKind.xyz;
      // range <= 0 means infinite (physical descriptors, PRD-02 §6.3): no
      // range window, decay-only attenuation. Legacy ranges are always > 0.
      float rangeFalloff = positionRange.w <= 0.0 ? 1.0 : clamp(1.0 - pow(distanceToLight / max(positionRange.w, 0.0001), 4.0), 0.0, 1.0);
      rangeFalloff *= rangeFalloff;
      attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);
    }
    if (kind > 1.5) {
      vec3 lightToFragment = normalize(v_worldPosition - positionRange.xyz);
      float cone = dot(normalize(directionKind.xyz), lightToFragment);
      if (areaUp.w > 0.5) cone = abs(cone);
      float outer = cos(spotShadowLayer.x);
      float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    shaded += a3dPbrDirectLight(
      normal,
      viewDirection,
      lightDirection,
      colorIntensity.rgb,
      colorIntensity.a * attenuation * a3dResolveSpotShadowOverride(mix(1.0, kind > 0.5 && kind < 1.5 ? a3dPointShadowFactor(v_worldPosition, normal, lightDirection) : a3dForwardShadowFactor(v_worldPosition, normal, lightDirection) * (lightIndex == int(u_contactShadowLightIndex) ? a3dContactShadowMaskFactor(kind) : 1.0), step(0.5, spotShadowLayer.z)), kind, spotShadowLayer.z, v_worldPosition, normal, lightDirection),
      materialBase,
      metallic,
      roughness,
      u_specularFactor,
      u_specularColorFactor
    );
  }
  if (baseColor.a < u_alphaCutoff) discard;
  vec3 fogged = a3dApplyEnvironmentFog(max(shaded, vec3(0.0)), v_worldPosition);
  outColor = vec4(a3dPbrEncodeOutput(fogged), baseColor.a);
}
`
  });
  library.register({
    name: DEFAULT_SKINNED_UNLIT_EIGHT_INFLUENCE_SHADER_NAME,
    marker: DEFAULT_SKINNED_UNLIT_EIGHT_INFLUENCE_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_SKINNED_UNLIT_EIGHT_INFLUENCE_SHADER_MARKER}
precision highp float;
#include <skinning_common>
layout(location = 0) in vec3 a_position;
layout(location = 5) in vec4 a_joints;
layout(location = 6) in vec4 a_weights;
layout(location = 8) in vec4 a_joints1;
layout(location = 9) in vec4 a_weights1;
uniform mat4 u_modelViewProjection;
void main() {
  mat4 skin = a3dSkinMatrix8(a_joints, a_weights, a_joints1, a_weights1);
  float weightSum =
    a_weights.x + a_weights.y + a_weights.z + a_weights.w +
    a_weights1.x + a_weights1.y + a_weights1.z + a_weights1.w;
  vec4 skinnedPosition = weightSum > 0.0001 ? skin * vec4(a_position, 1.0) : vec4(a_position, 1.0);
  gl_Position = u_modelViewProjection * skinnedPosition;
}
`,
    fragment: `#version 300 es
// ${DEFAULT_SKINNED_UNLIT_EIGHT_INFLUENCE_SHADER_MARKER}
precision highp float;
uniform vec4 u_baseColor;
out vec4 outColor;
void main() {
  outColor = u_baseColor;
}
`
  });
  library.register({
    name: DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_NAME,
    marker: DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_MARKER}
precision highp float;
#include <skinning_common>
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_uv;
layout(location = 7) in vec2 a_uv1;
layout(location = 3) in vec4 a_tangent;
layout(location = 4) in vec4 a_color;
layout(location = 5) in vec4 a_joints;
layout(location = 6) in vec4 a_weights;
layout(location = 8) in vec4 a_joints1;
layout(location = 9) in vec4 a_weights1;
uniform mat4 u_modelViewProjection;
uniform mat4 u_modelMatrix;
uniform mat4 u_normalMatrix;
uniform vec2 u_baseColorTextureOffset;
uniform vec2 u_baseColorTextureScale;
uniform float u_baseColorTextureRotation;
out vec3 v_normal;
out vec4 v_tangent;
out vec3 v_worldPosition;
out vec2 v_a3dDetailUv0;
out vec2 v_a3dDetailUv1;
out vec2 v_uv;
out vec4 v_vertexColor;
out float v_weightSum;
void main() {
  v_a3dDetailUv0 = a_uv;
  v_a3dDetailUv1 = a_uv1;
  vec2 scaledUv = a_uv * u_baseColorTextureScale;
  float c = cos(u_baseColorTextureRotation);
  float s = sin(u_baseColorTextureRotation);
  v_uv = vec2(scaledUv.x * c - scaledUv.y * s, scaledUv.x * s + scaledUv.y * c) + u_baseColorTextureOffset;
  v_vertexColor = a_color;
  mat4 skin = a3dSkinMatrix8(a_joints, a_weights, a_joints1, a_weights1);
  v_weightSum =
    a_weights.x + a_weights.y + a_weights.z + a_weights.w +
    a_weights1.x + a_weights1.y + a_weights1.z + a_weights1.w;
  vec4 skinnedPosition = v_weightSum > 0.0001 ? skin * vec4(a_position, 1.0) : vec4(a_position, 1.0);
  vec3 skinnedNormal = (v_weightSum > 0.0001 ? skin * vec4(a_normal, 0.0) : vec4(a_normal, 0.0)).xyz;
  vec3 skinnedTangent = (v_weightSum > 0.0001 ? skin * vec4(a_tangent.xyz, 0.0) : vec4(a_tangent.xyz, 0.0)).xyz;
  v_normal = mat3(u_normalMatrix) * skinnedNormal;
  v_tangent = vec4(mat3(u_normalMatrix) * skinnedTangent, a_tangent.w);
  v_worldPosition = (u_modelMatrix * skinnedPosition).xyz;
  gl_Position = u_modelViewProjection * skinnedPosition;
}
`,
    fragment: `#version 300 es
// ${DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_MARKER}
precision highp float;
#include <lighting_common>
#include <pbr_common>
${LEGACY_PBR_SURFACE_DETAIL_GLSL}
uniform vec4 u_baseColor;
uniform sampler2D u_baseColorTexture;
uniform float u_baseColorTextureEnabled;
uniform sampler2D u_normalTexture;
uniform float u_normalTextureEnabled;
uniform float u_normalScale;
uniform float u_wrinkleStrength;
uniform sampler2D u_metallicRoughnessTexture;
uniform float u_metallicRoughnessTextureEnabled;
uniform sampler2D u_occlusionTexture;
uniform float u_occlusionTextureEnabled;
uniform float u_occlusionStrength;
uniform sampler2D u_emissiveTexture;
uniform float u_emissiveTextureEnabled;
uniform float u_alphaCutoff;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_environmentColor;
uniform float u_environmentIntensity;
uniform float u_materialEnvironmentIntensity;
uniform vec3 u_environmentSkyColor;
uniform vec3 u_environmentHorizonColor;
uniform vec3 u_environmentGroundColor;
uniform vec3 u_environmentSpecularColor;
uniform float u_environmentMapIntensity;
uniform float u_environmentSpecularIntensity;
uniform sampler2D u_environmentMapTexture;
uniform samplerCube u_environmentCubeMapTexture;
uniform float u_environmentCubeMapTextureEnabled;
uniform float u_environmentMapTextureEnabled;
uniform float u_environmentMapTextureIntensity;
uniform float u_environmentMapTextureSpecularIntensity;
uniform float u_environmentMapTextureRotation;
uniform float u_environmentMapTextureMipCount;
uniform float u_environmentMapTextureEncoding;
uniform sampler2D u_environmentBrdfLutTexture;
uniform float u_environmentBrdfLutEnabled;
uniform vec3 u_emissiveColor;
uniform float u_emissiveStrength;
uniform float u_clearcoatFactor;
uniform float u_clearcoatRoughnessFactor;
uniform float u_transmissionFactor;
uniform float u_diffuseTransmissionFactor;
uniform vec3 u_diffuseTransmissionColorFactor;
uniform float u_transmissionFallbackEnergy;
uniform float u_volumeThicknessFactor;
uniform float u_volumeAttenuationDistance;
uniform vec3 u_volumeAttenuationColor;
uniform float u_transmissionParallaxStrength;
uniform vec3 u_transmissionParallaxBoxMin;
uniform vec3 u_transmissionParallaxBoxMax;
uniform float u_transmissionBounceCount;
uniform float u_transmissionCausticStrength;
uniform float u_ior;
uniform float u_specularFactor;
uniform vec3 u_specularColorFactor;
uniform vec3 u_sheenColorFactor;
uniform float u_sheenRoughnessFactor;
uniform float u_anisotropyStrength;
uniform float u_anisotropyRotation;
uniform float u_iridescenceFactor;
uniform float u_iridescenceIor;
uniform float u_iridescenceThicknessMinimum;
uniform float u_iridescenceThicknessMaximum;
uniform float u_dispersion;
uniform float u_lightCount;
uniform vec4 u_lightData[96];
uniform float u_clusteredLightEnabled;
uniform vec2 u_clusterGridSize;
uniform vec2 u_clusterViewportSize;
uniform sampler2D u_clusterLightData;
uniform sampler2D u_clusterLightIndices;
uniform sampler2D u_shadowMapTexture;
uniform float u_shadowMapEnabled;
uniform mat4 u_shadowMapMatrix;
uniform float u_shadowMapStrength;
uniform float u_shadowMapBias;
uniform float u_shadowMapSlopeBias;
uniform vec2 u_shadowMapTexelSize;
uniform float u_shadowPcfSampleCount;
uniform vec4 u_shadowPcfSamples[32];
uniform sampler2D u_pointShadowMapTexture;
uniform float u_pointShadowMapEnabled;
uniform vec3 u_pointShadowLightPosition;
uniform float u_pointShadowRange;
uniform mat4 u_pointShadowFaceMatrices[6];
uniform vec4 u_pointShadowFaceRects[6];
uniform float u_pointShadowStrength;
uniform float u_pointShadowBias;
uniform float u_pointShadowSlopeBias;
uniform vec2 u_pointShadowTexelSize;
uniform float u_pointShadowPcfSampleCount;
uniform vec4 u_pointShadowPcfSamples[32];
uniform sampler2D u_spotShadowMapTexture;
uniform float u_spotShadowMapEnabled;
uniform vec3 u_spotShadowLightPosition;
uniform vec3 u_spotShadowLightDirection;
uniform mat4 u_spotShadowMatrix;
uniform vec2 u_spotShadowCone;
uniform float u_spotShadowRange;
uniform float u_spotShadowStrength;
uniform float u_spotShadowBias;
uniform float u_spotShadowSlopeBias;
uniform vec2 u_spotShadowTexelSize;
uniform float u_spotShadowPcfSampleCount;
uniform vec4 u_spotShadowPcfSamples[32];
uniform float u_outputColorSpace;
uniform vec3 u_cameraPosition;
uniform float u_environmentFogEnabled;
uniform float u_environmentFogMode;
uniform vec3 u_environmentFogColor;
uniform float u_environmentFogNear;
uniform float u_environmentFogFar;
uniform float u_environmentFogDensity;
uniform float u_environmentFogHeightFalloff;
uniform float u_volumetricIntensity;
uniform vec3 u_volumetricLightDirection;
uniform vec3 u_volumetricLightColor;
uniform float u_environmentFogHeightReference;
uniform float u_environmentFogMaxOpacity;
in vec3 v_normal;
in vec4 v_tangent;
in vec3 v_worldPosition;
in vec2 v_uv;
in vec4 v_vertexColor;
in float v_weightSum;
out vec4 outColor;
#include <environment_fog_common>
#include <contact_shadow_mask>
vec2 a3dEnvironmentEquirectUv(vec3 direction, float rotation) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / 6.28318530718 + 0.5 + rotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 a3dEnvironmentCubeDirection(vec3 direction, float rotation) {
  float angle = rotation * 6.28318530718;
  float c = cos(angle);
  float s = sin(angle);
  vec3 d = normalize(direction);
  return normalize(vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
vec3 a3dPbrDecodeEnvironmentSrgb(vec3 encodedColor) {
  return max(encodedColor, vec3(0.0));
}
vec3 a3dPbrDecodeEnvironmentRgbe(vec4 encodedSample) {
  float exponent = encodedSample.a * 255.0;
  float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
  return max(encodedSample.rgb * scale, vec3(0.0));
}
vec3 a3dPbrDecodeEnvironmentSample(vec4 encodedSample) {
  if (u_environmentMapTextureEncoding > 1.5) return max(encodedSample.rgb, vec3(0.0));
  if (u_environmentMapTextureEncoding > 0.5) return a3dPbrDecodeEnvironmentRgbe(encodedSample);
  return a3dPbrDecodeEnvironmentSrgb(encodedSample.rgb);
}
vec3 a3dPbrBoundHdrSpecularRadiance(vec3 radiance) {
  return clamp(radiance, vec3(0.0), vec3(65504.0));
}
vec3 a3dPbrClampSampledSpecularEdgeEnergy(vec3 radiance, float nDotV, float roughness) {
  return max(radiance, vec3(0.0));
}
vec4 a3dPbrEnvironmentSampleRaw(vec3 direction, float lod) {
  vec4 equirectSample = textureLod(u_environmentMapTexture, a3dEnvironmentEquirectUv(direction, u_environmentMapTextureRotation), lod);
  vec4 cubeSample = textureLod(u_environmentCubeMapTexture, a3dEnvironmentCubeDirection(direction, u_environmentMapTextureRotation), lod);
  return mix(equirectSample, cubeSample, step(0.5, u_environmentCubeMapTextureEnabled));
}
/**
 * Procedural wrinkle detail (E1 face-rig demo): high-frequency normal perturbation driven
 * by u_wrinkleStrength, which the engine resolves per frame from live morph weights
 * (resolveWrinkleMapStrength). Stable in world space (no time input); strength 0 uploads
 * 0 and the guarded call site below leaves the normal bit-identical.
 */
vec3 a3dWrinkleDetail(vec3 p) {
  float f = sin(p.x * 230.0) * sin(p.y * 197.0 + 1.7) * sin(p.z * 211.0 + 0.6);
  float g = sin(p.x * 97.0 + 0.4) * sin(p.y * 113.0 + 2.1) * sin(p.z * 103.0 + 1.2);
  return vec3(f, g, f * g) * 0.35;
}
vec3 a3dSkinnedPbrNormal(vec3 baseNormal, vec4 tangentFrame, vec2 uv) {
  vec3 sampled = texture(u_normalTexture, uv).xyz * 2.0 - 1.0;
  vec3 n = normalize(baseNormal);
  vec3 tangent = normalize(tangentFrame.xyz);
  vec3 bitangent = normalize(cross(n, tangent) * tangentFrame.w);
  return normalize(tangent * sampled.x * u_normalScale + bitangent * sampled.y * u_normalScale + n * max(sampled.z, 0.001));
}
float a3dForwardShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_shadowMapEnabled < 0.5) return 1.0;
  vec4 lightPosition = u_shadowMapMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_shadowMapSlopeBias * max(u_shadowMapTexelSize.x, u_shadowMapTexelSize.y);
  float projectedDepth = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_shadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_shadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_shadowMapTexelSize;
    float storedDepth = texture(u_shadowMapTexture, uv + offset).r;
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_shadowMapBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_shadowMapStrength, 0.0, 1.0));
}
float a3dPointShadowFaceIndex(vec3 direction) {
  vec3 absoluteDirection = abs(direction);
  if (absoluteDirection.x >= absoluteDirection.y && absoluteDirection.x >= absoluteDirection.z) return direction.x >= 0.0 ? 0.0 : 1.0;
  if (absoluteDirection.y >= absoluteDirection.x && absoluteDirection.y >= absoluteDirection.z) return direction.y >= 0.0 ? 2.0 : 3.0;
  return direction.z >= 0.0 ? 4.0 : 5.0;
}
float a3dPointShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_pointShadowMapEnabled < 0.5) return 1.0;
  vec3 lightToFragment = worldPosition - u_pointShadowLightPosition;
  float distanceToLight = length(lightToFragment);
  if (distanceToLight > u_pointShadowRange) return 1.0;
  int faceIndex = int(a3dPointShadowFaceIndex(lightToFragment));
  vec4 lightPosition = u_pointShadowFaceMatrices[faceIndex] * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 localUv = projected.xy * 0.5 + 0.5;
  if (localUv.x < 0.0 || localUv.x > 1.0 || localUv.y < 0.0 || localUv.y > 1.0) return 1.0;
  vec4 rect = u_pointShadowFaceRects[faceIndex];
  vec2 uv = rect.xy + localUv * rect.zw;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_pointShadowSlopeBias * max(u_pointShadowTexelSize.x, u_pointShadowTexelSize.y);
  float projectedDepth = projected.z * 0.5 + 0.5;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_pointShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_pointShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_pointShadowTexelSize;
    float storedDepth = texture(u_pointShadowMapTexture, uv + offset).r;
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_pointShadowBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_pointShadowStrength, 0.0, 1.0));
}
float a3dSpotShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_spotShadowMapEnabled < 0.5) return 1.0;
  vec3 toFragment = worldPosition - u_spotShadowLightPosition;
  float distanceToLight = max(length(toFragment), 0.0001);
  if (distanceToLight > u_spotShadowRange) return 1.0;
  vec3 coneAxis = u_spotShadowLightDirection / max(length(u_spotShadowLightDirection), 0.0001);
  if (dot(toFragment / distanceToLight, coneAxis) < cos(u_spotShadowCone.x)) return 1.0;
  vec4 lightPosition = u_spotShadowMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_spotShadowSlopeBias * max(u_spotShadowTexelSize.x, u_spotShadowTexelSize.y);
  float projectedDepth = projected.z * 0.5 + 0.5;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_spotShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_spotShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_spotShadowTexelSize;
    float storedDepth = texture(u_spotShadowMapTexture, uv + offset).r;
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_spotShadowBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_spotShadowStrength, 0.0, 1.0));
}
float a3dResolveSpotShadowOverride(float baseFactor, float kind, float shadowFlag, vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  float spotGate = step(1.5, kind) * (1.0 - step(2.5, kind)) * step(0.5, u_spotShadowMapEnabled) * step(0.5, shadowFlag);
  return mix(baseFactor, a3dSpotShadowFactor(worldPosition, normal, lightDirection), spotGate);
}
vec3 a3dLinearToSrgb(vec3 linear) {
  vec3 clamped = max(linear, vec3(0.0));
  vec3 low = clamped * 12.92;
  vec3 high = 1.055 * pow(clamped, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), clamped));
}
vec3 a3dPbrEncodeOutput(vec3 linearColor) {
  vec3 color = max(linearColor, vec3(0.0));
  vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
  vec3 srgb = a3dLinearToSrgb(filmic);
  return mix(color, srgb, step(0.5, u_outputColorSpace));
}
void main() {
  a3dLegacySetDiffuseDetail();
  vec3 normal = normalize(v_normal);
  normal = mix(normal, a3dSkinnedPbrNormal(v_normal, v_tangent, v_uv), step(0.5, u_normalTextureEnabled));
  if (u_wrinkleStrength > 0.0) {
    normal = normalize(normal + u_wrinkleStrength * a3dWrinkleDetail(v_worldPosition));
  }
  if (!gl_FrontFacing) normal = -normal;
  normal = a3dLegacyBumpNormal(v_worldPosition, normalize(v_normal) * (gl_FrontFacing ? 1.0 : -1.0), normal);
  vec3 viewDirection = normalize(u_cameraPosition - v_worldPosition);
  vec4 sampledBaseColor = texture(u_baseColorTexture, v_uv);
  vec4 decodedBaseColor = vec4(a3dPbrDecodeEnvironmentSrgb(sampledBaseColor.rgb), sampledBaseColor.a);
  float baseColorTextureWeight = clamp(u_baseColorTextureEnabled, 0.0, 1.0);
  vec4 baseColor = mix(u_baseColor, u_baseColor * decodedBaseColor, baseColorTextureWeight) * v_vertexColor;
  vec4 metallicRoughnessSample = texture(u_metallicRoughnessTexture, v_uv);
  float metallic = mix(u_metallic, clamp(u_metallic * metallicRoughnessSample.b, 0.0, 1.0), step(0.5, u_metallicRoughnessTextureEnabled));
  float roughness = mix(u_roughness, clamp(u_roughness * metallicRoughnessSample.g, 0.0, 1.0), step(0.5, u_metallicRoughnessTextureEnabled));
  float occlusion = mix(1.0, mix(1.0, texture(u_occlusionTexture, v_uv).r, clamp(u_occlusionStrength, 0.0, 1.0)), step(0.5, u_occlusionTextureEnabled));
  vec3 emissive = u_emissiveColor * u_emissiveStrength * mix(vec3(1.0), a3dPbrDecodeEnvironmentSrgb(texture(u_emissiveTexture, v_uv).rgb), step(0.5, u_emissiveTextureEnabled));
  vec3 materialBase = a3dApplyAdvancedPbrLobes(
    baseColor.rgb,
    u_clearcoatFactor,
    u_clearcoatRoughnessFactor,
    u_transmissionFactor,
    u_diffuseTransmissionFactor,
    u_diffuseTransmissionColorFactor,
    u_transmissionFallbackEnergy,
    u_volumeThicknessFactor,
    u_volumeAttenuationDistance,
    u_volumeAttenuationColor,
    u_ior,
    u_specularFactor,
    u_specularColorFactor,
    u_sheenColorFactor,
    u_sheenRoughnessFactor,
    u_anisotropyStrength,
    u_anisotropyRotation,
    u_iridescenceFactor,
    u_iridescenceIor,
    u_iridescenceThicknessMinimum,
    u_iridescenceThicknessMaximum,
    u_dispersion
  );
  float environmentHemi = mix(0.35, 1.0, clamp(normal.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 ambientEnvironment = u_environmentColor * u_environmentIntensity * environmentHemi;
  float proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity);
  float skyBlend = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  float horizonBlend = 1.0 - abs(normal.y);
  vec3 proceduralDiffuse = mix(u_environmentGroundColor, u_environmentSkyColor, skyBlend);
  proceduralDiffuse = mix(proceduralDiffuse, u_environmentHorizonColor, clamp(horizonBlend, 0.0, 1.0) * 0.55);
  vec3 environmentDiffuse = ambientEnvironment + proceduralDiffuse * u_environmentMapIntensity * proceduralEnvironmentWeight;
  vec3 reflectionDirection = reflect(-viewDirection, normal);
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureIntensity);
  float diffuseEnvironmentLod = max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledDiffuse = a3dPbrDecodeEnvironmentSample(a3dPbrEnvironmentSampleRaw(normal, diffuseEnvironmentLod));
  float clampedRoughness = clamp(roughness, 0.0, 1.0);
  float reflectionBand = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(18.0, 2.0, clampedRoughness));
  float roughEnvironmentFloor = mix(0.04, 0.38, clampedRoughness);
  float proceduralSpecularResponse = max(reflectionBand, roughEnvironmentFloor);
  float horizonStripe = pow(clamp(1.0 - abs(reflectionDirection.y), 0.0, 1.0), mix(14.0, 3.0, clampedRoughness));
  float sideStripe = pow(clamp(abs(reflectionDirection.x), 0.0, 1.0), mix(10.0, 3.0, clampedRoughness)) * smoothstep(0.0, 0.72, 1.0 - abs(reflectionDirection.y));
  float overheadStripe = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(22.0, 4.0, clampedRoughness));
  vec3 proceduralSpecularColor = u_environmentSpecularColor * proceduralSpecularResponse
    + u_environmentHorizonColor * horizonStripe * 0.42
    + u_environmentSkyColor * overheadStripe * 0.28
    + u_environmentGroundColor * sideStripe * 0.22;
  vec3 proceduralSpecular = proceduralSpecularColor * u_environmentSpecularIntensity * proceduralEnvironmentWeight;
  float environmentLod = clampedRoughness * max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledSpecular = a3dPbrBoundHdrSpecularRadiance(a3dPbrDecodeEnvironmentSample(a3dPbrEnvironmentSampleRaw(reflectionDirection, environmentLod)));
  float nDotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
  vec2 brdfLut = texture(u_environmentBrdfLutTexture, vec2(nDotV, clampedRoughness)).rg;
  sampledSpecular = a3dPbrClampSampledSpecularEdgeEnergy(sampledSpecular, nDotV, clampedRoughness);
  sampledSpecular *= u_environmentMapTextureSpecularIntensity * u_materialEnvironmentIntensity * sampledEnvironmentWeight * mix(1.1, 0.65, roughness);
  vec3 shaded = a3dPbrEnvironmentLightSplitSum(
    normal,
    viewDirection,
    mix(environmentDiffuse, ambientEnvironment + sampledDiffuse * u_environmentMapTextureIntensity * u_materialEnvironmentIntensity, sampledEnvironmentWeight),
    proceduralSpecular + sampledSpecular,
    mix(vec2(1.0, 0.0), brdfLut, step(0.0001, u_environmentBrdfLutEnabled)),
    materialBase,
    metallic,
    roughness,
    u_specularFactor,
    u_specularColorFactor
  ) * occlusion + emissive;
  ivec2 clusterTile = clamp(ivec2(floor(min(gl_FragCoord.xy, u_clusterViewportSize) / vec2(64.0))), ivec2(0), ivec2(u_clusterGridSize) - ivec2(1));
  int clusterIndex = clusterTile.y * int(u_clusterGridSize.x) + clusterTile.x;
  int count = u_clusteredLightEnabled > 0.5 ? min(int(texelFetch(u_clusterLightIndices, ivec2(0, clusterIndex), 0).g), 64) : min(int(u_lightCount), 16);
  for (int i = 0; i < 64; ++i) {
    if (i >= count) break;
    int lightIndex = u_clusteredLightEnabled > 0.5 ? int(texelFetch(u_clusterLightIndices, ivec2(i, clusterIndex), 0).r) : i;
    int baseIndex = lightIndex * 6;
    vec4 colorIntensity = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(0, lightIndex), 0) : u_lightData[baseIndex];
    vec4 positionRange = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(1, lightIndex), 0) : u_lightData[baseIndex + 1];
    vec4 directionKind = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(2, lightIndex), 0) : u_lightData[baseIndex + 2];
    vec4 spotShadowLayer = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(3, lightIndex), 0) : u_lightData[baseIndex + 3];
    vec4 areaRight = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(4, lightIndex), 0) : u_lightData[baseIndex + 4];
    vec4 areaUp = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(5, lightIndex), 0) : u_lightData[baseIndex + 5];
    float kind = directionKind.w;
    if (kind > 2.5) {
      shaded += a3dPbrRectAreaLight(
        v_worldPosition, positionRange.xyz, directionKind.xyz, areaRight.xyz, areaUp.xyz,
        spotShadowLayer.x, spotShadowLayer.y, positionRange.w, areaUp.w,
        normal, viewDirection, colorIntensity.rgb, colorIntensity.a,
        materialBase, metallic, roughness, u_specularFactor, u_specularColorFactor
      );
      continue;
    }
    vec3 lightDirection = -directionKind.xyz;
    float attenuation = 1.0;
    if (kind > 0.5) {
      vec3 toLight = positionRange.xyz - v_worldPosition;
      float distanceToLight = length(toLight);
      lightDirection = distanceToLight > 0.0001 ? toLight / distanceToLight : -directionKind.xyz;
      // range <= 0 means infinite (physical descriptors, PRD-02 §6.3): no
      // range window, decay-only attenuation. Legacy ranges are always > 0.
      float rangeFalloff = positionRange.w <= 0.0 ? 1.0 : clamp(1.0 - pow(distanceToLight / max(positionRange.w, 0.0001), 4.0), 0.0, 1.0);
      rangeFalloff *= rangeFalloff;
      attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);
    }
    if (kind > 1.5) {
      vec3 lightToFragment = normalize(v_worldPosition - positionRange.xyz);
      float cone = dot(normalize(directionKind.xyz), lightToFragment);
      if (areaUp.w > 0.5) cone = abs(cone);
      float outer = cos(spotShadowLayer.x);
      float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    shaded += a3dPbrDirectLight(
      normal,
      viewDirection,
      lightDirection,
      colorIntensity.rgb,
      colorIntensity.a * attenuation * a3dResolveSpotShadowOverride(mix(1.0, kind > 0.5 && kind < 1.5 ? a3dPointShadowFactor(v_worldPosition, normal, lightDirection) : a3dForwardShadowFactor(v_worldPosition, normal, lightDirection) * (lightIndex == int(u_contactShadowLightIndex) ? a3dContactShadowMaskFactor(kind) : 1.0), step(0.5, spotShadowLayer.z)), kind, spotShadowLayer.z, v_worldPosition, normal, lightDirection),
      materialBase,
      metallic,
      roughness,
      u_specularFactor,
      u_specularColorFactor
    );
  }
  if (baseColor.a < u_alphaCutoff) discard;
  vec3 fogged = a3dApplyEnvironmentFog(max(shaded, vec3(0.0)), v_worldPosition);
  outColor = vec4(a3dPbrEncodeOutput(fogged), baseColor.a);
}
`
  });
  library.register({
    name: DEFAULT_MORPH_UNLIT_SHADER_NAME,
    marker: DEFAULT_MORPH_UNLIT_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_MORPH_UNLIT_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
uniform mat4 u_modelViewProjection;
uniform vec4 u_morphPositionDeltas[256];
uniform vec4 u_morphWeights;
uniform float u_morphTargetCount;
uniform sampler2D u_morphDeltaTexture;
uniform float u_morphUsesTexture;
uniform float u_morphTextureWidth;
uniform float u_morphRowsPerTarget;
uniform float u_morphWeightArray[64];
vec3 sampleMorphTexel(float row, float vertex) {
  float u = (vertex + 0.5) / max(1.0, u_morphTextureWidth);
  float height = u_morphTargetCount * u_morphRowsPerTarget;
  float v = (row + 0.5) / max(1.0, height);
  return texture(u_morphDeltaTexture, vec2(u, v)).xyz;
}
void main() {
  vec3 morphDelta = vec3(0.0);
  if (u_morphUsesTexture > 0.5) {
    float vertex = float(gl_VertexID);
    for (int target = 0; target < 64; ++target) {
      if (float(target) >= u_morphTargetCount) break;
      float row = float(target) * u_morphRowsPerTarget;
      morphDelta += sampleMorphTexel(row, vertex) * u_morphWeightArray[target];
    }
  } else {
    int morphVertexIndex = clamp(gl_VertexID, 0, 63);
    for (int target = 0; target < 4; ++target) {
      if (float(target) < u_morphTargetCount) {
        int morphIndex = target * 64 + morphVertexIndex;
        morphDelta += u_morphPositionDeltas[morphIndex].xyz * u_morphWeights[target];
      }
    }
  }
  vec3 morphedPosition = a_position + morphDelta;
  gl_Position = u_modelViewProjection * vec4(morphedPosition, 1.0);
}
`,
    fragment: `#version 300 es
// ${DEFAULT_MORPH_UNLIT_SHADER_MARKER}
precision highp float;
uniform vec4 u_baseColor;
out vec4 outColor;
void main() {
  outColor = u_baseColor;
}
`
  });
  library.register({
    name: DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME,
    marker: DEFAULT_NORMAL_MAPPED_PBR_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_NORMAL_MAPPED_PBR_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_uv;
layout(location = 3) in vec4 a_tangent;
layout(location = 4) in vec4 a_color;
layout(location = 7) in vec2 a_uv1;
layout(location = 8) in vec4 a_instanceMatrix0;
layout(location = 9) in vec4 a_instanceMatrix1;
layout(location = 10) in vec4 a_instanceMatrix2;
layout(location = 11) in vec4 a_instanceMatrix3;
layout(location = 12) in vec4 a_instanceColor;
uniform mat4 u_modelViewProjection;
uniform mat4 u_modelMatrix;
uniform mat4 u_normalMatrix;
uniform mat4 u_instanceMatrices[64];
uniform float u_instanceCount;
uniform float u_instanceAttributeMode;
out vec3 v_normal;
out vec4 v_tangent;
out vec3 v_worldPosition;
out vec2 v_a3dDetailUv0;
out vec2 v_a3dDetailUv1;
out vec2 v_uv;
out vec4 v_vertexColor;
void main() {
  v_a3dDetailUv0 = a_uv;
  v_a3dDetailUv1 = a_uv1;
  if (u_instanceCount > 0.5) {
    int instanceIndex = clamp(gl_InstanceID, 0, max(int(u_instanceCount) - 1, 0));
    mat4 attributeMatrix = mat4(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
    mat4 instanceMatrix = u_instanceAttributeMode > 0.5 ? attributeMatrix : u_instanceMatrices[instanceIndex];
    vec4 worldPosition = u_modelMatrix * instanceMatrix * vec4(a_position, 1.0);
    v_normal = mat3(u_normalMatrix) * transpose(inverse(mat3(instanceMatrix))) * a_normal;
    v_tangent = vec4(mat3(u_normalMatrix) * (mat3(instanceMatrix) * a_tangent.xyz), a_tangent.w);
    v_worldPosition = worldPosition.xyz;
    v_uv = a_uv;
    v_vertexColor = a_color * a_instanceColor;
    gl_Position = u_modelViewProjection * instanceMatrix * vec4(a_position, 1.0);
  } else {
    v_normal = mat3(u_normalMatrix) * a_normal;
    v_tangent = vec4(mat3(u_normalMatrix) * a_tangent.xyz, a_tangent.w);
    v_worldPosition = (u_modelMatrix * vec4(a_position, 1.0)).xyz;
    v_uv = a_uv;
    v_vertexColor = a_color;
    gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
  }
}
`,
    fragment: `#version 300 es
// ${DEFAULT_NORMAL_MAPPED_PBR_SHADER_MARKER}
precision highp float;
#include <lighting_common>
#include <pbr_common>
${LEGACY_PBR_SURFACE_DETAIL_GLSL}
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_environmentColor;
uniform float u_environmentIntensity;
uniform float u_materialEnvironmentIntensity;
uniform vec3 u_environmentSkyColor;
uniform vec3 u_environmentHorizonColor;
uniform vec3 u_environmentGroundColor;
uniform vec3 u_environmentSpecularColor;
uniform float u_environmentMapIntensity;
uniform float u_environmentSpecularIntensity;
uniform sampler2D u_environmentMapTexture;
uniform samplerCube u_environmentCubeMapTexture;
uniform float u_environmentCubeMapTextureEnabled;
uniform float u_environmentMapTextureEnabled;
uniform float u_environmentMapTextureIntensity;
uniform float u_environmentMapTextureSpecularIntensity;
uniform float u_environmentMapTextureRotation;
uniform float u_environmentMapTextureMipCount;
uniform float u_environmentMapTextureEncoding;
uniform sampler2D u_environmentBrdfLutTexture;
uniform float u_environmentBrdfLutEnabled;
uniform vec3 u_emissiveColor;
uniform float u_emissiveStrength;
uniform float u_clearcoatFactor;
uniform float u_clearcoatRoughnessFactor;
uniform float u_transmissionFactor;
uniform float u_diffuseTransmissionFactor;
uniform vec3 u_diffuseTransmissionColorFactor;
uniform float u_transmissionFallbackEnergy;
uniform float u_volumeThicknessFactor;
uniform float u_volumeAttenuationDistance;
uniform vec3 u_volumeAttenuationColor;
uniform float u_transmissionParallaxStrength;
uniform vec3 u_transmissionParallaxBoxMin;
uniform vec3 u_transmissionParallaxBoxMax;
uniform float u_transmissionBounceCount;
uniform float u_transmissionCausticStrength;
uniform float u_ior;
uniform float u_specularFactor;
uniform vec3 u_specularColorFactor;
uniform vec3 u_sheenColorFactor;
uniform float u_sheenRoughnessFactor;
uniform float u_lightCount;
uniform vec4 u_lightData[96];
uniform float u_clusteredLightEnabled;
uniform vec2 u_clusterGridSize;
uniform vec2 u_clusterViewportSize;
uniform sampler2D u_clusterLightData;
uniform sampler2D u_clusterLightIndices;
uniform sampler2D u_normalTexture;
uniform float u_normalScale;
uniform sampler2D u_shadowMapTexture;
uniform float u_shadowMapEnabled;
uniform mat4 u_shadowMapMatrix;
uniform float u_shadowMapStrength;
uniform float u_shadowMapBias;
uniform float u_shadowMapSlopeBias;
uniform vec2 u_shadowMapTexelSize;
uniform float u_shadowPcfSampleCount;
uniform vec4 u_shadowPcfSamples[32];
uniform sampler2D u_pointShadowMapTexture;
uniform float u_pointShadowMapEnabled;
uniform vec3 u_pointShadowLightPosition;
uniform float u_pointShadowRange;
uniform mat4 u_pointShadowFaceMatrices[6];
uniform vec4 u_pointShadowFaceRects[6];
uniform float u_pointShadowStrength;
uniform float u_pointShadowBias;
uniform float u_pointShadowSlopeBias;
uniform vec2 u_pointShadowTexelSize;
uniform float u_pointShadowPcfSampleCount;
uniform vec4 u_pointShadowPcfSamples[32];
uniform sampler2D u_spotShadowMapTexture;
uniform float u_spotShadowMapEnabled;
uniform vec3 u_spotShadowLightPosition;
uniform vec3 u_spotShadowLightDirection;
uniform mat4 u_spotShadowMatrix;
uniform vec2 u_spotShadowCone;
uniform float u_spotShadowRange;
uniform float u_spotShadowStrength;
uniform float u_spotShadowBias;
uniform float u_spotShadowSlopeBias;
uniform vec2 u_spotShadowTexelSize;
uniform float u_spotShadowPcfSampleCount;
uniform vec4 u_spotShadowPcfSamples[32];
uniform float u_outputColorSpace;
uniform vec3 u_cameraPosition;
uniform float u_environmentFogEnabled;
uniform float u_environmentFogMode;
uniform vec3 u_environmentFogColor;
uniform float u_environmentFogNear;
uniform float u_environmentFogFar;
uniform float u_environmentFogDensity;
uniform float u_environmentFogHeightFalloff;
uniform float u_volumetricIntensity;
uniform vec3 u_volumetricLightDirection;
uniform vec3 u_volumetricLightColor;
uniform float u_environmentFogHeightReference;
uniform float u_environmentFogMaxOpacity;
in vec3 v_normal;
in vec4 v_tangent;
in vec3 v_worldPosition;
in vec2 v_uv;
in vec4 v_vertexColor;
out vec4 outColor;
#include <environment_fog_common>
#include <contact_shadow_mask>
vec3 a3dNormalMappedNormal(vec3 baseNormal, vec4 tangentFrame, vec2 uv) {
  vec3 sampled = texture(u_normalTexture, uv).xyz * 2.0 - 1.0;
  vec3 n = normalize(baseNormal);
  vec3 tangent = normalize(tangentFrame.xyz);
  vec3 bitangent = normalize(cross(n, tangent) * tangentFrame.w);
  return normalize(tangent * sampled.x * u_normalScale + bitangent * sampled.y * u_normalScale + n * max(sampled.z, 0.001));
}
float a3dForwardShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_shadowMapEnabled < 0.5) return 1.0;
  vec4 lightPosition = u_shadowMapMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_shadowMapSlopeBias * max(u_shadowMapTexelSize.x, u_shadowMapTexelSize.y);
  float projectedDepth = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_shadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_shadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_shadowMapTexelSize;
    float storedDepth = texture(u_shadowMapTexture, uv + offset).r;
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_shadowMapBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_shadowMapStrength, 0.0, 1.0));
}
float a3dPointShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_pointShadowMapEnabled < 0.5) return 1.0;
  vec3 lightToFragment = worldPosition - u_pointShadowLightPosition;
  vec3 absoluteDirection = abs(lightToFragment);
  int faceIndex = absoluteDirection.x >= absoluteDirection.y && absoluteDirection.x >= absoluteDirection.z ? (lightToFragment.x >= 0.0 ? 0 : 1) : (absoluteDirection.y >= absoluteDirection.z ? (lightToFragment.y >= 0.0 ? 2 : 3) : (lightToFragment.z >= 0.0 ? 4 : 5));
  vec4 lightPosition = u_pointShadowFaceMatrices[faceIndex] * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 localUv = projected.xy * 0.5 + 0.5;
  if (localUv.x < 0.0 || localUv.x > 1.0 || localUv.y < 0.0 || localUv.y > 1.0 || length(lightToFragment) > u_pointShadowRange) return 1.0;
  vec4 rect = u_pointShadowFaceRects[faceIndex];
  vec2 uv = rect.xy + localUv * rect.zw;
  float normalDotLight = clamp(abs(dot(normalize(normal), normalize(lightDirection))), 0.0, 1.0);
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_pointShadowSlopeBias * max(u_pointShadowTexelSize.x, u_pointShadowTexelSize.y);
  float projectedDepth = projected.z * 0.5 + 0.5;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_pointShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_pointShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_pointShadowBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > texture(u_pointShadowMapTexture, uv + sampleData.xy * u_pointShadowTexelSize).r ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_pointShadowStrength, 0.0, 1.0));
}
float a3dSpotShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_spotShadowMapEnabled < 0.5) return 1.0;
  vec3 toFragment = worldPosition - u_spotShadowLightPosition;
  float distanceToLight = max(length(toFragment), 0.0001);
  if (distanceToLight > u_spotShadowRange) return 1.0;
  vec3 coneAxis = u_spotShadowLightDirection / max(length(u_spotShadowLightDirection), 0.0001);
  if (dot(toFragment / distanceToLight, coneAxis) < cos(u_spotShadowCone.x)) return 1.0;
  vec4 lightPosition = u_spotShadowMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_spotShadowSlopeBias * max(u_spotShadowTexelSize.x, u_spotShadowTexelSize.y);
  float projectedDepth = projected.z * 0.5 + 0.5;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_spotShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_spotShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_spotShadowTexelSize;
    float storedDepth = texture(u_spotShadowMapTexture, uv + offset).r;
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_spotShadowBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_spotShadowStrength, 0.0, 1.0));
}
float a3dResolveSpotShadowOverride(float baseFactor, float kind, float shadowFlag, vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  float spotGate = step(1.5, kind) * (1.0 - step(2.5, kind)) * step(0.5, u_spotShadowMapEnabled) * step(0.5, shadowFlag);
  return mix(baseFactor, a3dSpotShadowFactor(worldPosition, normal, lightDirection), spotGate);
}
vec2 a3dEnvironmentEquirectUv(vec3 direction, float rotation) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / 6.28318530718 + 0.5 + rotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 a3dEnvironmentCubeDirection(vec3 direction, float rotation) {
  float angle = rotation * 6.28318530718;
  float c = cos(angle);
  float s = sin(angle);
  vec3 d = normalize(direction);
  return normalize(vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
vec3 a3dPbrDecodeEnvironmentSrgb(vec3 encodedColor) {
  return max(encodedColor, vec3(0.0));
}
vec3 a3dPbrDecodeEnvironmentRgbe(vec4 encodedSample) {
  float exponent = encodedSample.a * 255.0;
  float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
  return max(encodedSample.rgb * scale, vec3(0.0));
}
vec3 a3dPbrDecodeEnvironmentSample(vec4 encodedSample) {
  if (u_environmentMapTextureEncoding > 1.5) return max(encodedSample.rgb, vec3(0.0));
  if (u_environmentMapTextureEncoding > 0.5) return a3dPbrDecodeEnvironmentRgbe(encodedSample);
  return a3dPbrDecodeEnvironmentSrgb(encodedSample.rgb);
}
vec3 a3dPbrBoundHdrSpecularRadiance(vec3 radiance) {
  return clamp(radiance, vec3(0.0), vec3(65504.0));
}
vec3 a3dPbrClampSampledSpecularEdgeEnergy(vec3 radiance, float nDotV, float roughness) {
  return max(radiance, vec3(0.0));
}
vec4 a3dPbrEnvironmentSampleRaw(vec3 direction, float lod) {
  vec4 equirectSample = textureLod(u_environmentMapTexture, a3dEnvironmentEquirectUv(direction, u_environmentMapTextureRotation), lod);
  vec4 cubeSample = textureLod(u_environmentCubeMapTexture, a3dEnvironmentCubeDirection(direction, u_environmentMapTextureRotation), lod);
  return mix(equirectSample, cubeSample, step(0.5, u_environmentCubeMapTextureEnabled));
}
vec3 a3dPbrEnvironmentDiffuseInput(vec3 normal) {
  float environmentHemi = mix(0.35, 1.0, clamp(normal.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 ambientEnvironment = u_environmentColor * u_environmentIntensity * environmentHemi;
  float proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity);
  float skyBlend = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  float horizonBlend = 1.0 - abs(normal.y);
  vec3 proceduralDiffuse = mix(u_environmentGroundColor, u_environmentSkyColor, skyBlend);
  proceduralDiffuse = mix(proceduralDiffuse, u_environmentHorizonColor, clamp(horizonBlend, 0.0, 1.0) * 0.55);
  vec3 environmentDiffuse = ambientEnvironment + proceduralDiffuse * u_environmentMapIntensity * proceduralEnvironmentWeight;
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureIntensity);
  float diffuseEnvironmentLod = max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledDiffuse = a3dPbrDecodeEnvironmentSample(a3dPbrEnvironmentSampleRaw(normal, diffuseEnvironmentLod));
  return mix(environmentDiffuse, ambientEnvironment + sampledDiffuse * u_environmentMapTextureIntensity * u_materialEnvironmentIntensity, sampledEnvironmentWeight);
}
vec3 a3dPbrEnvironmentSpecularInput(vec3 normal, vec3 viewDirection, float roughness) {
  float proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity);
  vec3 reflectionDirection = reflect(-viewDirection, normal);
  float clampedRoughness = clamp(roughness, 0.0, 1.0);
  float reflectionBand = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(18.0, 2.0, clampedRoughness));
  float roughEnvironmentFloor = mix(0.04, 0.38, clampedRoughness);
  float proceduralSpecularResponse = max(reflectionBand, roughEnvironmentFloor);
  vec3 proceduralSpecular = u_environmentSpecularColor * u_environmentSpecularIntensity * proceduralSpecularResponse * proceduralEnvironmentWeight;
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureSpecularIntensity);
  float environmentLod = clampedRoughness * max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledSpecular = a3dPbrBoundHdrSpecularRadiance(a3dPbrDecodeEnvironmentSample(a3dPbrEnvironmentSampleRaw(reflectionDirection, environmentLod)));
  float nDotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
  sampledSpecular = a3dPbrClampSampledSpecularEdgeEnergy(sampledSpecular, nDotV, clampedRoughness);
  sampledSpecular *= u_environmentMapTextureSpecularIntensity * u_materialEnvironmentIntensity * sampledEnvironmentWeight * mix(0.84, 0.58, clampedRoughness);
  return proceduralSpecular + sampledSpecular;
}
vec2 a3dPbrEnvironmentBrdfInput(vec3 normal, vec3 viewDirection, float roughness) {
  float nDotV = clamp(dot(normalize(normal), normalize(viewDirection)), 0.0, 1.0);
  vec2 lut = texture(u_environmentBrdfLutTexture, vec2(nDotV, clamp(roughness, 0.0, 1.0))).rg;
  return mix(vec2(1.0, 0.0), lut, step(0.0001, u_environmentBrdfLutEnabled));
}
vec3 a3dLinearToSrgb(vec3 linear) {
  vec3 clamped = max(linear, vec3(0.0));
  vec3 low = clamped * 12.92;
  vec3 high = 1.055 * pow(clamped, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), clamped));
}
vec3 a3dPbrEncodeOutput(vec3 linearColor) {
  vec3 color = max(linearColor, vec3(0.0));
  vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
  vec3 srgb = a3dLinearToSrgb(filmic);
  return mix(color, srgb, step(0.5, u_outputColorSpace));
}
void main() {
  a3dLegacySetDiffuseDetail();
  vec3 mappedNormal = a3dNormalMappedNormal(v_normal, v_tangent, v_uv);
  if (!gl_FrontFacing) mappedNormal = -mappedNormal;
  mappedNormal = a3dLegacyBumpNormal(v_worldPosition, normalize(v_normal) * (gl_FrontFacing ? 1.0 : -1.0), mappedNormal);
  vec3 viewDirection = normalize(u_cameraPosition - v_worldPosition);
  vec3 materialBase = u_baseColor.rgb * v_vertexColor.rgb;
  vec3 shaded = u_emissiveColor * u_emissiveStrength + a3dPbrEnvironmentLightSplitSum(
    mappedNormal,
    viewDirection,
    a3dPbrEnvironmentDiffuseInput(mappedNormal),
    a3dPbrEnvironmentSpecularInput(mappedNormal, viewDirection, u_roughness),
    a3dPbrEnvironmentBrdfInput(mappedNormal, viewDirection, u_roughness),
    materialBase,
    u_metallic,
    u_roughness,
    u_specularFactor,
    u_specularColorFactor
  );
  ivec2 clusterTile = clamp(ivec2(floor(min(gl_FragCoord.xy, u_clusterViewportSize) / vec2(64.0))), ivec2(0), ivec2(u_clusterGridSize) - ivec2(1));
  int clusterIndex = clusterTile.y * int(u_clusterGridSize.x) + clusterTile.x;
  int count = u_clusteredLightEnabled > 0.5 ? min(int(texelFetch(u_clusterLightIndices, ivec2(0, clusterIndex), 0).g), 64) : min(int(u_lightCount), 16);
  for (int i = 0; i < 64; ++i) {
    if (i >= count) break;
    int lightIndex = u_clusteredLightEnabled > 0.5 ? int(texelFetch(u_clusterLightIndices, ivec2(i, clusterIndex), 0).r) : i;
    int baseIndex = lightIndex * 6;
    vec4 colorIntensity = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(0, lightIndex), 0) : u_lightData[baseIndex];
    vec4 positionRange = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(1, lightIndex), 0) : u_lightData[baseIndex + 1];
    vec4 directionKind = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(2, lightIndex), 0) : u_lightData[baseIndex + 2];
    vec4 spotShadowLayer = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(3, lightIndex), 0) : u_lightData[baseIndex + 3];
    vec4 areaRight = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(4, lightIndex), 0) : u_lightData[baseIndex + 4];
    vec4 areaUp = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(5, lightIndex), 0) : u_lightData[baseIndex + 5];
    float kind = directionKind.w;
    if (kind > 2.5) {
      shaded += a3dPbrRectAreaLight(
        v_worldPosition, positionRange.xyz, directionKind.xyz, areaRight.xyz, areaUp.xyz,
        spotShadowLayer.x, spotShadowLayer.y, positionRange.w, areaUp.w,
        mappedNormal, viewDirection, colorIntensity.rgb, colorIntensity.a,
        materialBase, u_metallic, u_roughness, u_specularFactor, u_specularColorFactor
      );
      continue;
    }
    vec3 lightDirection = -directionKind.xyz;
    float attenuation = 1.0;
    if (kind > 0.5) {
      vec3 toLight = positionRange.xyz - v_worldPosition;
      float distanceToLight = length(toLight);
      lightDirection = distanceToLight > 0.0001 ? toLight / distanceToLight : -directionKind.xyz;
      // range <= 0 means infinite (physical descriptors, PRD-02 §6.3): no
      // range window, decay-only attenuation. Legacy ranges are always > 0.
      float rangeFalloff = positionRange.w <= 0.0 ? 1.0 : clamp(1.0 - pow(distanceToLight / max(positionRange.w, 0.0001), 4.0), 0.0, 1.0);
      rangeFalloff *= rangeFalloff;
      attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);
    }
    if (kind > 1.5) {
      vec3 lightToFragment = normalize(v_worldPosition - positionRange.xyz);
      float cone = dot(normalize(directionKind.xyz), lightToFragment);
      if (areaUp.w > 0.5) cone = abs(cone);
      float outer = cos(spotShadowLayer.x);
      float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    float shadowFactor = a3dResolveSpotShadowOverride(mix(1.0, kind > 0.5 && kind < 1.5 ? a3dPointShadowFactor(v_worldPosition, mappedNormal, lightDirection) : a3dForwardShadowFactor(v_worldPosition, mappedNormal, lightDirection) * (lightIndex == int(u_contactShadowLightIndex) ? a3dContactShadowMaskFactor(kind) : 1.0), step(0.5, spotShadowLayer.z)), kind, spotShadowLayer.z, v_worldPosition, mappedNormal, lightDirection);
    shaded += a3dPbrDirectLight(mappedNormal, viewDirection, lightDirection, colorIntensity.rgb, colorIntensity.a * attenuation * shadowFactor, materialBase, u_metallic, u_roughness, u_specularFactor, u_specularColorFactor);
  }
  float alpha = u_baseColor.a * v_vertexColor.a;
  if (alpha < u_alphaCutoff) discard;
  vec3 fogged = a3dApplyEnvironmentFog(max(shaded, vec3(0.0)), v_worldPosition);
  outColor = vec4(a3dPbrEncodeOutput(fogged), alpha);
}
`
  });
  library.register({
    name: DEFAULT_TEXTURED_PBR_SHADER_NAME,
    marker: DEFAULT_TEXTURED_PBR_SHADER_MARKER,
    variants: [
      { name: DEFAULT_TEXTURED_PBR_EXTENSION_ATLAS_VARIANT, defines: { A3D_PBR_EXTENSION_ATLAS: true, A3D_PBR_CLEARCOAT_TEXTURES: true, A3D_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES: true, A3D_PBR_IRIDESCENCE_TEXTURES: true, A3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true, A3D_PBR_DISABLE_CLUSTERED_LIGHTING: true } },
      { name: DEFAULT_TEXTURED_PBR_CLEARCOAT_SHEEN_ANISOTROPY_TEXTURES_VARIANT, defines: { A3D_PBR_CLEARCOAT_TEXTURES: true, A3D_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES: true, A3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true, A3D_PBR_DISABLE_CLUSTERED_LIGHTING: true, A3D_PBR_NO_SPOT_SHADOW: true } },
      { name: DEFAULT_TEXTURED_PBR_CLEARCOAT_IRIDESCENCE_TEXTURES_VARIANT, defines: { A3D_PBR_CLEARCOAT_TEXTURES: true, A3D_PBR_IRIDESCENCE_TEXTURES: true, A3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true, A3D_PBR_DISABLE_CLUSTERED_LIGHTING: true } },
      { name: DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT, defines: { A3D_PBR_CLEARCOAT_TEXTURES: true, A3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true, A3D_PBR_DISABLE_CLUSTERED_LIGHTING: true } },
      { name: DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT, defines: { A3D_PBR_TRANSMISSION_VOLUME_TEXTURES: true, A3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true, A3D_PBR_DISABLE_CLUSTERED_LIGHTING: true } },
      { name: DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT, defines: { A3D_PBR_SPECULAR_TEXTURES: true, A3D_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES: true, A3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true, A3D_PBR_DISABLE_CLUSTERED_LIGHTING: true } },
      { name: DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT, defines: { A3D_PBR_IRIDESCENCE_TEXTURES: true, A3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true, A3D_PBR_DISABLE_CLUSTERED_LIGHTING: true } },
      { name: DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT, defines: { A3D_PBR_CLEARCOAT_TEXTURES: true, A3D_PBR_TRANSMISSION_VOLUME_TEXTURES: true, A3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true, A3D_PBR_DISABLE_CLUSTERED_LIGHTING: true, A3D_PBR_NO_SPOT_SHADOW: true } },
      { name: DEFAULT_TEXTURED_PBR_CLEARCOAT_SPECULAR_TEXTURES_VARIANT, defines: { A3D_PBR_CLEARCOAT_TEXTURES: true, A3D_PBR_SPECULAR_TEXTURES: true, A3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true, A3D_PBR_DISABLE_CLUSTERED_LIGHTING: true } },
      { name: DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT, defines: { A3D_PBR_SPECULAR_TEXTURES: true, A3D_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES: true, A3D_PBR_IRIDESCENCE_TEXTURES: true, A3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true, A3D_PBR_DISABLE_CLUSTERED_LIGHTING: true, A3D_PBR_NO_SPOT_SHADOW: true } },
    ],
    vertex: `#version 300 es
// ${DEFAULT_TEXTURED_PBR_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_uv;
layout(location = 3) in vec4 a_tangent;
layout(location = 4) in vec4 a_color;
layout(location = 7) in vec2 a_uv1;
layout(location = 8) in vec4 a_instanceMatrix0;
layout(location = 9) in vec4 a_instanceMatrix1;
layout(location = 10) in vec4 a_instanceMatrix2;
layout(location = 11) in vec4 a_instanceMatrix3;
layout(location = 12) in vec4 a_instanceColor;
uniform mat4 u_modelViewProjection;
uniform mat4 u_modelMatrix;
uniform mat4 u_normalMatrix;
uniform mat4 u_instanceMatrices[64];
uniform float u_instanceCount;
uniform float u_instanceAttributeMode;
out vec3 v_normal;
out vec4 v_tangent;
out vec3 v_worldPosition;
out vec2 v_a3dDetailUv0;
out vec2 v_a3dDetailUv1;
out vec2 v_uv;
out vec2 v_uv1;
out vec4 v_vertexColor;
void main() {
  v_a3dDetailUv0 = a_uv;
  v_a3dDetailUv1 = a_uv1;
  v_uv = a_uv;
  v_uv1 = a_uv1;
  if (u_instanceCount > 0.5) {
    int instanceIndex = clamp(gl_InstanceID, 0, max(int(u_instanceCount) - 1, 0));
    mat4 attributeMatrix = mat4(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
    mat4 instanceMatrix = u_instanceAttributeMode > 0.5 ? attributeMatrix : u_instanceMatrices[instanceIndex];
    vec4 worldPosition = u_modelMatrix * instanceMatrix * vec4(a_position, 1.0);
    v_normal = mat3(u_normalMatrix) * transpose(inverse(mat3(instanceMatrix))) * a_normal;
    v_tangent = vec4(mat3(u_normalMatrix) * (mat3(instanceMatrix) * a_tangent.xyz), a_tangent.w);
    v_worldPosition = worldPosition.xyz;
    v_vertexColor = a_color * a_instanceColor;
    gl_Position = u_modelViewProjection * instanceMatrix * vec4(a_position, 1.0);
  } else {
    v_normal = mat3(u_normalMatrix) * a_normal;
    v_tangent = vec4(mat3(u_normalMatrix) * a_tangent.xyz, a_tangent.w);
    v_worldPosition = (u_modelMatrix * vec4(a_position, 1.0)).xyz;
    v_vertexColor = a_color;
    gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
  }
}
`,
    fragment: `#version 300 es
// ${DEFAULT_TEXTURED_PBR_SHADER_MARKER}
precision highp float;
#include <lighting_common>
#include <pbr_common>
${LEGACY_PBR_SURFACE_DETAIL_GLSL}
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_environmentColor;
uniform float u_environmentIntensity;
uniform float u_materialEnvironmentIntensity;
uniform vec3 u_environmentSkyColor;
uniform vec3 u_environmentHorizonColor;
uniform vec3 u_environmentGroundColor;
uniform vec3 u_environmentSpecularColor;
uniform float u_environmentMapIntensity;
uniform float u_environmentSpecularIntensity;
uniform sampler2D u_environmentMapTexture;
uniform samplerCube u_environmentCubeMapTexture;
uniform float u_environmentCubeMapTextureEnabled;
uniform float u_environmentMapTextureEnabled;
uniform float u_environmentMapTextureIntensity;
uniform float u_environmentMapTextureSpecularIntensity;
uniform float u_materialEnvironmentSpecularScale;
uniform float u_environmentMapTextureRotation;
uniform float u_environmentMapTextureMipCount;
uniform float u_environmentMapTextureEncoding;
uniform sampler2D u_environmentBrdfLutTexture;
uniform float u_environmentBrdfLutEnabled;
uniform vec3 u_emissiveColor;
uniform float u_emissiveStrength;
uniform float u_clearcoatFactor;
uniform float u_clearcoatRoughnessFactor;
uniform float u_transmissionFactor;
uniform float u_diffuseTransmissionFactor;
uniform vec3 u_diffuseTransmissionColorFactor;
uniform float u_transmissionFallbackEnergy;
uniform float u_volumeThicknessFactor;
uniform float u_volumeAttenuationDistance;
uniform vec3 u_volumeAttenuationColor;
uniform float u_transmissionParallaxStrength;
uniform vec3 u_transmissionParallaxBoxMin;
uniform vec3 u_transmissionParallaxBoxMax;
uniform float u_transmissionBounceCount;
uniform float u_transmissionCausticStrength;
#ifndef A3D_PBR_DISABLE_TRANSMISSION_BACKDROP
uniform sampler2D u_transmissionBackdropTexture;
uniform float u_transmissionBackdropEnabled;
uniform float u_transmissionBackdropStrength;
uniform vec2 u_transmissionBackdropResolution;
uniform float u_transmissionBackdropMipCount;
uniform float u_transmissionBackdropRefractionScale;
#endif
uniform float u_ior;
uniform float u_specularFactor;
uniform vec3 u_specularColorFactor;
uniform vec3 u_sheenColorFactor;
uniform float u_sheenRoughnessFactor;
uniform float u_anisotropyStrength;
uniform float u_anisotropyRotation;
uniform float u_iridescenceFactor;
uniform float u_iridescenceIor;
uniform float u_iridescenceThicknessMinimum;
uniform float u_iridescenceThicknessMaximum;
uniform float u_dispersion;
uniform float u_lightCount;
uniform vec4 u_lightData[96];
#ifndef A3D_PBR_DISABLE_CLUSTERED_LIGHTING
uniform float u_clusteredLightEnabled;
uniform vec2 u_clusterGridSize;
uniform vec2 u_clusterViewportSize;
uniform sampler2D u_clusterLightData;
uniform sampler2D u_clusterLightIndices;
#endif
uniform sampler2D u_shadowMapTexture;
uniform float u_shadowMapEnabled;
uniform mat4 u_shadowMapMatrix;
uniform float u_shadowMapStrength;
uniform float u_shadowMapBias;
uniform float u_shadowMapSlopeBias;
uniform vec2 u_shadowMapTexelSize;
uniform float u_shadowPcfSampleCount;
uniform vec4 u_shadowPcfSamples[32];
uniform sampler2D u_pointShadowMapTexture;
uniform float u_pointShadowMapEnabled;
uniform vec3 u_pointShadowLightPosition;
uniform float u_pointShadowRange;
uniform mat4 u_pointShadowFaceMatrices[6];
uniform vec4 u_pointShadowFaceRects[6];
uniform float u_pointShadowStrength;
uniform float u_pointShadowBias;
uniform float u_pointShadowSlopeBias;
uniform vec2 u_pointShadowTexelSize;
uniform float u_pointShadowPcfSampleCount;
uniform vec4 u_pointShadowPcfSamples[32];
#ifndef A3D_PBR_NO_SPOT_SHADOW
uniform sampler2D u_spotShadowMapTexture;
uniform float u_spotShadowMapEnabled;
uniform vec3 u_spotShadowLightPosition;
uniform vec3 u_spotShadowLightDirection;
uniform mat4 u_spotShadowMatrix;
uniform vec2 u_spotShadowCone;
uniform float u_spotShadowRange;
uniform float u_spotShadowStrength;
uniform float u_spotShadowBias;
uniform float u_spotShadowSlopeBias;
uniform vec2 u_spotShadowTexelSize;
uniform float u_spotShadowPcfSampleCount;
uniform vec4 u_spotShadowPcfSamples[32];
#endif
uniform sampler2D u_baseColorTexture;
uniform float u_baseColorTextureEnabled;
uniform vec2 u_baseColorTextureOffset;
uniform vec2 u_baseColorTextureScale;
uniform float u_baseColorTextureRotation;
uniform float u_baseColorTextureTexCoord;
uniform vec2 u_baseColorTextureWrap;
uniform sampler2D u_normalTexture;
uniform vec2 u_normalTextureOffset;
uniform vec2 u_normalTextureScale;
uniform float u_normalTextureRotation;
uniform float u_normalTextureTexCoord;
uniform vec2 u_normalTextureWrap;
uniform float u_normalTextureEnabled;
uniform sampler2D u_emissiveTexture;
uniform float u_emissiveTextureEnabled;
uniform vec2 u_emissiveTextureOffset;
uniform vec2 u_emissiveTextureScale;
uniform float u_emissiveTextureRotation;
uniform float u_emissiveTextureTexCoord;
uniform vec2 u_emissiveTextureWrap;
uniform sampler2D u_metallicRoughnessTexture;
uniform float u_metallicRoughnessTextureEnabled;
uniform vec2 u_metallicRoughnessTextureOffset;
uniform vec2 u_metallicRoughnessTextureScale;
uniform float u_metallicRoughnessTextureRotation;
uniform float u_metallicRoughnessTextureTexCoord;
uniform vec2 u_metallicRoughnessTextureWrap;
uniform sampler2D u_occlusionTexture;
uniform float u_occlusionTextureEnabled;
uniform vec2 u_occlusionTextureOffset;
uniform vec2 u_occlusionTextureScale;
uniform float u_occlusionTextureRotation;
uniform float u_occlusionTextureTexCoord;
uniform vec2 u_occlusionTextureWrap;
uniform float u_occlusionStrength;
uniform float u_clearcoatNormalScale;
#ifdef A3D_PBR_CLEARCOAT_TEXTURES
#ifndef A3D_PBR_EXTENSION_ATLAS
uniform sampler2D u_clearcoatTexture;
#else
uniform vec4 u_clearcoatAtlasRect;
uniform float u_clearcoatAtlasY;
uniform vec4 u_clearcoatAtlasFilter;
#endif
uniform float u_clearcoatTextureEnabled;
uniform vec2 u_clearcoatTextureOffset;
uniform vec2 u_clearcoatTextureScale;
uniform float u_clearcoatTextureRotation;
uniform float u_clearcoatTextureTexCoord;
uniform vec2 u_clearcoatTextureWrap;
#ifndef A3D_PBR_EXTENSION_ATLAS
uniform sampler2D u_clearcoatRoughnessTexture;
#else
uniform vec4 u_clearcoatRoughnessAtlasRect;
uniform float u_clearcoatRoughnessAtlasY;
uniform vec4 u_clearcoatRoughnessAtlasFilter;
#endif
uniform float u_clearcoatRoughnessTextureEnabled;
uniform vec2 u_clearcoatRoughnessTextureOffset;
uniform vec2 u_clearcoatRoughnessTextureScale;
uniform float u_clearcoatRoughnessTextureRotation;
uniform float u_clearcoatRoughnessTextureTexCoord;
uniform vec2 u_clearcoatRoughnessTextureWrap;
uniform sampler2D u_clearcoatNormalTexture;
uniform float u_clearcoatNormalTextureEnabled;
uniform vec2 u_clearcoatNormalTextureOffset;
uniform vec2 u_clearcoatNormalTextureScale;
uniform float u_clearcoatNormalTextureRotation;
uniform float u_clearcoatNormalTextureTexCoord;
uniform vec2 u_clearcoatNormalTextureWrap;
#endif
#ifdef A3D_PBR_TRANSMISSION_VOLUME_TEXTURES
uniform sampler2D u_transmissionTexture;
uniform float u_transmissionTextureEnabled;
uniform vec2 u_transmissionTextureOffset;
uniform vec2 u_transmissionTextureScale;
uniform float u_transmissionTextureRotation;
uniform float u_transmissionTextureTexCoord;
uniform vec2 u_transmissionTextureWrap;
uniform sampler2D u_diffuseTransmissionTexture;
uniform float u_diffuseTransmissionTextureEnabled;
uniform vec2 u_diffuseTransmissionTextureOffset;
uniform vec2 u_diffuseTransmissionTextureScale;
uniform float u_diffuseTransmissionTextureRotation;
uniform float u_diffuseTransmissionTextureTexCoord;
uniform vec2 u_diffuseTransmissionTextureWrap;
uniform sampler2D u_diffuseTransmissionColorTexture;
uniform float u_diffuseTransmissionColorTextureEnabled;
uniform vec2 u_diffuseTransmissionColorTextureOffset;
uniform vec2 u_diffuseTransmissionColorTextureScale;
uniform float u_diffuseTransmissionColorTextureRotation;
uniform float u_diffuseTransmissionColorTextureTexCoord;
uniform vec2 u_diffuseTransmissionColorTextureWrap;
uniform sampler2D u_volumeThicknessTexture;
uniform float u_volumeThicknessTextureEnabled;
uniform vec2 u_volumeThicknessTextureOffset;
uniform vec2 u_volumeThicknessTextureScale;
uniform float u_volumeThicknessTextureRotation;
uniform float u_volumeThicknessTextureTexCoord;
uniform vec2 u_volumeThicknessTextureWrap;
#endif
#ifdef A3D_PBR_SPECULAR_TEXTURES
uniform sampler2D u_specularTexture;
uniform float u_specularTextureEnabled;
uniform vec2 u_specularTextureOffset;
uniform vec2 u_specularTextureScale;
uniform float u_specularTextureRotation;
uniform float u_specularTextureTexCoord;
uniform vec2 u_specularTextureWrap;
uniform sampler2D u_specularColorTexture;
uniform float u_specularColorTextureEnabled;
uniform vec2 u_specularColorTextureOffset;
uniform vec2 u_specularColorTextureScale;
uniform float u_specularColorTextureRotation;
uniform float u_specularColorTextureTexCoord;
uniform vec2 u_specularColorTextureWrap;
#endif
#ifdef A3D_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES
uniform sampler2D u_sheenColorTexture;
uniform float u_sheenColorTextureEnabled;
uniform vec2 u_sheenColorTextureOffset;
uniform vec2 u_sheenColorTextureScale;
uniform float u_sheenColorTextureRotation;
uniform float u_sheenColorTextureTexCoord;
uniform vec2 u_sheenColorTextureWrap;
#ifndef A3D_PBR_EXTENSION_ATLAS
uniform sampler2D u_sheenRoughnessTexture;
#else
uniform vec4 u_sheenRoughnessAtlasRect;
uniform float u_sheenRoughnessAtlasY;
uniform vec4 u_sheenRoughnessAtlasFilter;
#endif
uniform float u_sheenRoughnessTextureEnabled;
uniform vec2 u_sheenRoughnessTextureOffset;
uniform vec2 u_sheenRoughnessTextureScale;
uniform float u_sheenRoughnessTextureRotation;
uniform float u_sheenRoughnessTextureTexCoord;
uniform vec2 u_sheenRoughnessTextureWrap;
uniform sampler2D u_anisotropyTexture;
uniform float u_anisotropyTextureEnabled;
uniform vec2 u_anisotropyTextureOffset;
uniform vec2 u_anisotropyTextureScale;
uniform float u_anisotropyTextureRotation;
uniform float u_anisotropyTextureTexCoord;
uniform vec2 u_anisotropyTextureWrap;
#endif
#ifdef A3D_PBR_IRIDESCENCE_TEXTURES
#ifndef A3D_PBR_EXTENSION_ATLAS
uniform sampler2D u_iridescenceTexture;
#else
uniform vec4 u_iridescenceAtlasRect;
uniform float u_iridescenceAtlasY;
uniform vec4 u_iridescenceAtlasFilter;
#endif
uniform float u_iridescenceTextureEnabled;
uniform vec2 u_iridescenceTextureOffset;
uniform vec2 u_iridescenceTextureScale;
uniform float u_iridescenceTextureRotation;
uniform float u_iridescenceTextureTexCoord;
uniform vec2 u_iridescenceTextureWrap;
#ifndef A3D_PBR_EXTENSION_ATLAS
uniform sampler2D u_iridescenceThicknessTexture;
#else
uniform vec4 u_iridescenceThicknessAtlasRect;
uniform float u_iridescenceThicknessAtlasY;
uniform vec4 u_iridescenceThicknessAtlasFilter;
#endif
uniform float u_iridescenceThicknessTextureEnabled;
uniform vec2 u_iridescenceThicknessTextureOffset;
uniform vec2 u_iridescenceThicknessTextureScale;
uniform float u_iridescenceThicknessTextureRotation;
uniform float u_iridescenceThicknessTextureTexCoord;
uniform vec2 u_iridescenceThicknessTextureWrap;
#endif
uniform float u_normalScale;
uniform float u_outputColorSpace;
uniform vec3 u_cameraPosition;
uniform float u_environmentFogEnabled;
uniform float u_environmentFogMode;
uniform vec3 u_environmentFogColor;
uniform float u_environmentFogNear;
uniform float u_environmentFogFar;
uniform float u_environmentFogDensity;
uniform float u_environmentFogHeightFalloff;
uniform float u_volumetricIntensity;
uniform vec3 u_volumetricLightDirection;
uniform vec3 u_volumetricLightColor;
uniform float u_environmentFogHeightReference;
uniform float u_environmentFogMaxOpacity;
in vec3 v_normal;
in vec4 v_tangent;
in vec3 v_worldPosition;
in vec2 v_uv;
in vec2 v_uv1;
in vec4 v_vertexColor;
out vec4 outColor;
#include <environment_fog_common>
// WP-4: the extension-texture variants are tuned to the 16-unit sampler limit (they already
// disable clustering and the transmission backdrop), so only the base variant samples the
// contact-shadow mask; the others keep a factor of exactly 1.0.
#ifndef A3D_PBR_DISABLE_CLUSTERED_LIGHTING
#include <contact_shadow_mask>
#else
uniform float u_contactShadowLightIndex;
float a3dContactShadowMaskFactor(float kind) { return 1.0; }
#endif
vec2 a3dTexturedPbrSelectUv(float texCoord) {
  return texCoord > 0.5 ? v_uv1 : v_uv;
}
vec2 a3dTexturedPbrUv(float texCoord, vec2 offset, vec2 scale, float rotation) {
  vec2 uv = a3dTexturedPbrSelectUv(texCoord);
  vec2 scaledUv = uv * scale;
  float c = cos(rotation);
  float s = sin(rotation);
  return vec2(scaledUv.x * c - scaledUv.y * s, scaledUv.x * s + scaledUv.y * c) + offset;
}
float a3dTexturedPbrWrapCoordinate(float value, float mode) {
  if (mode > 1.5) {
    float repeated = mod(value, 2.0);
    return repeated <= 1.0 ? repeated : 2.0 - repeated;
  }
  if (mode > 0.5) return fract(value);
  return clamp(value, 0.0, 1.0);
}
vec2 a3dTexturedPbrWrapUv(vec2 uv, vec2 wrapMode) {
  return vec2(
    a3dTexturedPbrWrapCoordinate(uv.x, wrapMode.x),
    a3dTexturedPbrWrapCoordinate(uv.y, wrapMode.y)
  );
}
vec3 a3dTexturedPbrEncodeLinearToSrgb(vec3 linear) {
  vec3 clamped = max(linear, vec3(0.0));
  vec3 low = clamped * 12.92;
  vec3 high = 1.055 * pow(clamped, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), clamped));
}
vec3 a3dTexturedPbrEncodeOutput(vec3 linearColor) {
  vec3 color = max(linearColor, vec3(0.0));
  vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
  vec3 srgb = a3dTexturedPbrEncodeLinearToSrgb(filmic);
  return mix(color, srgb, step(0.5, u_outputColorSpace));
}
vec3 a3dTexturedPbrDecodeSrgb(vec3 encodedColor) {
  return max(encodedColor, vec3(0.0));
}
vec3 a3dTexturedPbrDecodeEnvironmentRgbe(vec4 encodedSample) {
  float exponent = encodedSample.a * 255.0;
  float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
  return max(encodedSample.rgb * scale, vec3(0.0));
}
vec3 a3dTexturedPbrDecodeEnvironmentSample(vec4 encodedSample) {
  if (u_environmentMapTextureEncoding > 1.5) return max(encodedSample.rgb, vec3(0.0));
  if (u_environmentMapTextureEncoding > 0.5) return a3dTexturedPbrDecodeEnvironmentRgbe(encodedSample);
  return a3dTexturedPbrDecodeSrgb(encodedSample.rgb);
}
vec3 a3dTexturedPbrBoundHdrTransmissionRadiance(vec3 radiance) {
  vec3 nonNegative = max(radiance, vec3(0.0));
  return nonNegative / (vec3(1.0) + max(nonNegative - vec3(1.0), vec3(0.0)));
}
vec3 a3dTexturedPbrBoundHdrSpecularRadiance(vec3 radiance) {
  return clamp(radiance, vec3(0.0), vec3(65504.0));
}
vec3 a3dTexturedPbrClampSampledSpecularEdgeEnergy(vec3 radiance, float nDotV, float roughness) {
  return max(radiance, vec3(0.0));
}
vec3 a3dTexturedPbrApplyNormalSample(vec3 baseNormal, vec4 tangentFrame, vec3 sampled, float scale) {
  vec3 n = normalize(baseNormal);
  vec3 tangent = normalize(tangentFrame.xyz);
  vec3 bitangent = normalize(cross(n, tangent) * tangentFrame.w);
  return normalize(tangent * sampled.x * scale + bitangent * sampled.y * scale + n * max(sampled.z, 0.001));
}
vec3 a3dTexturedPbrNormal(vec3 baseNormal, vec4 tangentFrame, vec2 uv) {
  vec3 sampled = texture(u_normalTexture, uv).xyz * 2.0 - 1.0;
  return a3dTexturedPbrApplyNormalSample(baseNormal, tangentFrame, sampled, u_normalScale);
}
float a3dTexturedPbrShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_shadowMapEnabled < 0.5) return 1.0;
  vec4 lightPosition = u_shadowMapMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_shadowMapSlopeBias * max(u_shadowMapTexelSize.x, u_shadowMapTexelSize.y);
  float projectedDepth = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_shadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_shadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_shadowMapTexelSize;
    float storedDepth = texture(u_shadowMapTexture, uv + offset).r;
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_shadowMapBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_shadowMapStrength, 0.0, 1.0));
}
float a3dTexturedPbrPointShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_pointShadowMapEnabled < 0.5) return 1.0;
  vec3 lightToFragment = worldPosition - u_pointShadowLightPosition;
  vec3 absoluteDirection = abs(lightToFragment);
  int faceIndex = absoluteDirection.x >= absoluteDirection.y && absoluteDirection.x >= absoluteDirection.z ? (lightToFragment.x >= 0.0 ? 0 : 1) : (absoluteDirection.y >= absoluteDirection.z ? (lightToFragment.y >= 0.0 ? 2 : 3) : (lightToFragment.z >= 0.0 ? 4 : 5));
  vec4 lightPosition = u_pointShadowFaceMatrices[faceIndex] * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 localUv = projected.xy * 0.5 + 0.5;
  if (localUv.x < 0.0 || localUv.x > 1.0 || localUv.y < 0.0 || localUv.y > 1.0 || length(lightToFragment) > u_pointShadowRange) return 1.0;
  vec4 rect = u_pointShadowFaceRects[faceIndex];
  vec2 uv = rect.xy + localUv * rect.zw;
  float normalDotLight = clamp(abs(dot(normalize(normal), normalize(lightDirection))), 0.0, 1.0);
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_pointShadowSlopeBias * max(u_pointShadowTexelSize.x, u_pointShadowTexelSize.y);
  float projectedDepth = projected.z * 0.5 + 0.5;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_pointShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_pointShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_pointShadowBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > texture(u_pointShadowMapTexture, uv + sampleData.xy * u_pointShadowTexelSize).r ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_pointShadowStrength, 0.0, 1.0));
}
#ifndef A3D_PBR_NO_SPOT_SHADOW
float a3dTexturedPbrSpotShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_spotShadowMapEnabled < 0.5) return 1.0;
  vec3 toFragment = worldPosition - u_spotShadowLightPosition;
  float distanceToLight = max(length(toFragment), 0.0001);
  if (distanceToLight > u_spotShadowRange) return 1.0;
  vec3 coneAxis = u_spotShadowLightDirection / max(length(u_spotShadowLightDirection), 0.0001);
  if (dot(toFragment / distanceToLight, coneAxis) < cos(u_spotShadowCone.x)) return 1.0;
  vec4 lightPosition = u_spotShadowMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_spotShadowSlopeBias * max(u_spotShadowTexelSize.x, u_spotShadowTexelSize.y);
  float projectedDepth = projected.z * 0.5 + 0.5;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_spotShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_spotShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_spotShadowTexelSize;
    float storedDepth = texture(u_spotShadowMapTexture, uv + offset).r;
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_spotShadowBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_spotShadowStrength, 0.0, 1.0));
}
float a3dTexturedPbrResolveSpotShadowOverride(float baseFactor, float kind, float shadowFlag, vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  float spotGate = step(1.5, kind) * (1.0 - step(2.5, kind)) * step(0.5, u_spotShadowMapEnabled) * step(0.5, shadowFlag);
  return mix(baseFactor, a3dTexturedPbrSpotShadowFactor(worldPosition, normal, lightDirection), spotGate);
}
#endif
vec2 a3dTexturedPbrEnvironmentUv(vec3 direction, float rotation) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / 6.28318530718 + 0.5 + rotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 a3dTexturedPbrRotateEnvironmentDirection(vec3 direction, float rotation) {
  float angle = rotation * 6.28318530718;
  float c = cos(angle);
  float s = sin(angle);
  vec3 d = normalize(direction);
  return normalize(vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
vec4 a3dTexturedPbrEnvironmentSampleRaw(vec3 direction, float lod) {
  vec4 equirectSample = textureLod(u_environmentMapTexture, a3dTexturedPbrEnvironmentUv(direction, u_environmentMapTextureRotation), lod);
  vec4 cubeSample = textureLod(u_environmentCubeMapTexture, a3dTexturedPbrRotateEnvironmentDirection(direction, u_environmentMapTextureRotation), lod);
  return mix(equirectSample, cubeSample, step(0.5, u_environmentCubeMapTextureEnabled));
}
vec3 a3dTexturedPbrBoxProjectedDirection(vec3 worldPosition, vec3 direction, vec3 boxMin, vec3 boxMax) {
  vec3 safeDirection = normalize(direction);
  vec3 invDirection = 1.0 / max(abs(safeDirection), vec3(0.0001)) * sign(safeDirection);
  vec3 firstPlane = mix(boxMin, boxMax, step(vec3(0.0), safeDirection));
  vec3 distances = (firstPlane - worldPosition) * invDirection;
  float travel = min(min(
    distances.x > 0.0 ? distances.x : 100000.0,
    distances.y > 0.0 ? distances.y : 100000.0
  ), distances.z > 0.0 ? distances.z : 100000.0);
  vec3 hitPosition = worldPosition + safeDirection * travel;
  vec3 boxCenter = (boxMin + boxMax) * 0.5;
  return normalize(hitPosition - boxCenter);
}
vec3 a3dTexturedPbrEnvironmentDiffuseInput(vec3 normal) {
  float environmentHemi = mix(0.35, 1.0, clamp(normal.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 ambientEnvironment = u_environmentColor * u_environmentIntensity * environmentHemi;
  float proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity);
  float skyBlend = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  float horizonBlend = 1.0 - abs(normal.y);
  vec3 proceduralDiffuse = mix(u_environmentGroundColor, u_environmentSkyColor, skyBlend);
  proceduralDiffuse = mix(proceduralDiffuse, u_environmentHorizonColor, clamp(horizonBlend, 0.0, 1.0) * 0.55);
  vec3 environmentDiffuse = ambientEnvironment + proceduralDiffuse * u_environmentMapIntensity * proceduralEnvironmentWeight;
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureIntensity);
  float diffuseEnvironmentLod = max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledDiffuse = a3dTexturedPbrDecodeEnvironmentSample(a3dTexturedPbrEnvironmentSampleRaw(normal, diffuseEnvironmentLod));
  return mix(environmentDiffuse, ambientEnvironment + sampledDiffuse * u_environmentMapTextureIntensity * u_materialEnvironmentIntensity, sampledEnvironmentWeight);
}
vec3 a3dTexturedPbrEnvironmentSpecularInput(vec3 normal, vec3 viewDirection, float roughness) {
  float materialEnvironmentSpecularScale = clamp(u_materialEnvironmentSpecularScale, 0.0, 1.0);
  float materialFiniteSpecularScale = sqrt(materialEnvironmentSpecularScale);
  float proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity);
  vec3 reflectionDirection = reflect(-viewDirection, normal);
  float clampedRoughness = clamp(roughness, 0.0, 1.0);
  float nDotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
  float reflectionBand = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(18.0, 2.0, clampedRoughness));
  float roughEnvironmentFloor = mix(0.012, 0.16, clampedRoughness);
  float proceduralSpecularResponse = max(reflectionBand, roughEnvironmentFloor);
  float horizonStripe = pow(clamp(1.0 - abs(reflectionDirection.y), 0.0, 1.0), mix(14.0, 3.0, clampedRoughness));
  float sideStripe = pow(clamp(abs(reflectionDirection.x), 0.0, 1.0), mix(10.0, 3.0, clampedRoughness)) * smoothstep(0.0, 0.72, 1.0 - abs(reflectionDirection.y));
  float overheadStripe = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(22.0, 4.0, clampedRoughness));
  vec3 proceduralSpecularColor = u_environmentSpecularColor * proceduralSpecularResponse
    + u_environmentHorizonColor * horizonStripe * 0.18
    + u_environmentSkyColor * overheadStripe * 0.12
    + u_environmentGroundColor * sideStripe * 0.09;
  vec3 proceduralSpecular = proceduralSpecularColor * u_environmentSpecularIntensity * proceduralEnvironmentWeight;
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureSpecularIntensity);
  float environmentLod = clampedRoughness * max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledSpecular = a3dTexturedPbrBoundHdrSpecularRadiance(a3dTexturedPbrDecodeEnvironmentSample(a3dTexturedPbrEnvironmentSampleRaw(reflectionDirection, environmentLod)));
  sampledSpecular = a3dTexturedPbrClampSampledSpecularEdgeEnergy(sampledSpecular, nDotV, clampedRoughness);
  sampledSpecular *= u_environmentMapTextureSpecularIntensity * u_materialEnvironmentIntensity * sampledEnvironmentWeight * mix(1.1, 0.65, clampedRoughness);
  float proceduralSpecularScale = materialFiniteSpecularScale;
  float sampledSpecularScale = materialEnvironmentSpecularScale;
  return proceduralSpecular * proceduralSpecularScale + sampledSpecular * sampledSpecularScale;
}
vec3 a3dTexturedPbrThinFilmFresnel(vec3 substrateF0, float filmIor, float thickness, float cosine) {
  float c1 = clamp(cosine, 0.0001, 1.0);
  if (thickness <= 0.0) return a3dFresnelSchlick(substrateF0, c1);
  float n2 = max(filmIor, 1.0001);
  vec3 rootF0 = sqrt(clamp(substrateF0, vec3(0.0), vec3(0.98)));
  vec3 n3 = (vec3(1.0) + rootF0) / max(vec3(1.0) - rootF0, vec3(0.0001));
  float sinSquared = 1.0 - c1 * c1;
  float c2 = sqrt(max(0.0, 1.0 - sinSquared / (n2 * n2)));
  vec3 c3 = sqrt(max(vec3(0.0), vec3(1.0) - sinSquared / (n3 * n3)));
  float r12s = (c1 - n2 * c2) / max(c1 + n2 * c2, 0.0001);
  float r12p = (n2 * c1 - c2) / max(n2 * c1 + c2, 0.0001);
  vec3 r23s = (n2 * c2 - n3 * c3) / max(n2 * c2 + n3 * c3, vec3(0.0001));
  vec3 r23p = (n3 * c2 - n2 * c3) / max(n3 * c2 + n2 * c3, vec3(0.0001));
  vec3 phase = 4.0 * A3D_PI * n2 * max(thickness, 0.0) * c2 / vec3(650.0, 510.0, 475.0);
  vec3 crossS = 2.0 * r12s * r23s * cos(phase);
  vec3 crossP = 2.0 * r12p * r23p * cos(phase);
  vec3 Rs = (r12s * r12s + r23s * r23s + crossS) / max(vec3(1.0) + r12s * r12s * r23s * r23s + crossS, vec3(0.0001));
  vec3 Rp = (r12p * r12p + r23p * r23p + crossP) / max(vec3(1.0) + r12p * r12p * r23p * r23p + crossP, vec3(0.0001));
  return clamp((Rs + Rp) * 0.5, vec3(0.0), vec3(1.0));
}
float a3dTexturedPbrCharlieSheen(float nDotH, float sheenRoughness) {
  float alpha = max(0.07, sheenRoughness * sheenRoughness);
  float inverseAlpha = 1.0 / alpha;
  float sin2h = max(1.0 - nDotH * nDotH, 0.0078125);
  return (2.0 + inverseAlpha) * pow(sin2h, inverseAlpha * 0.5) / (2.0 * A3D_PI);
}
float a3dTexturedPbrAnisotropicDistribution(
  vec3 normal,
  vec3 halfVector,
  vec4 tangentFrame,
  float roughness,
  float anisotropy,
  float rotation
) {
  vec3 N = normalize(normal);
  vec3 authoredTangent = normalize(tangentFrame.xyz);
  vec3 authoredBitangent = normalize(cross(N, authoredTangent)) * (tangentFrame.w < 0.0 ? -1.0 : 1.0);
  float c = cos(rotation);
  float s = sin(rotation);
  vec3 T = normalize(authoredTangent * c + authoredBitangent * s);
  vec3 B = normalize(authoredBitangent * c - authoredTangent * s);
  float alpha = max(0.035, roughness * roughness);
  float aspect = sqrt(max(0.08, 1.0 - clamp(anisotropy, 0.0, 0.98) * 0.92));
  float alphaT = max(0.012, alpha / aspect);
  float alphaB = max(0.012, alpha * aspect);
  float tDotH = dot(T, halfVector);
  float bDotH = dot(B, halfVector);
  float nDotH = max(dot(N, halfVector), 0.0);
  float denominator = tDotH * tDotH / (alphaT * alphaT)
    + bDotH * bDotH / (alphaB * alphaB)
    + nDotH * nDotH;
  return 1.0 / max(A3D_PI * alphaT * alphaB * denominator * denominator, A3D_EPSILON);
}
vec3 a3dTexturedPbrExtensionDirectLight(
  vec3 normal,
  vec4 tangentFrame,
  vec3 viewDirection,
  vec3 lightDirection,
  vec3 lightColor,
  float lightIntensity,
  float clearcoat,
  float clearcoatRoughness,
  vec3 sheenColor,
  float sheenRoughness,
  float anisotropy,
  float anisotropyRotation,
  float iridescence,
  float iridescenceIor,
  float iridescenceThicknessMinimum,
  float iridescenceThicknessMaximum,
  vec3 substrateF0,
  vec3 substrateNormal,
  float substrateRoughness
) {
  vec3 N = normalize(normal);
  vec3 V = normalize(viewDirection);
  vec3 L = normalize(lightDirection);
  vec3 H = normalize(V + L);
  float nDotL = a3dSaturate(dot(N, L));
  float nDotV = max(a3dSaturate(dot(N, V)), A3D_EPSILON);
  float nDotH = a3dSaturate(dot(N, H));
  float vDotH = a3dSaturate(dot(V, H));
  float clearcoatRough = clamp(clearcoatRoughness, 0.18, 1.0);
  vec3 clearcoatF = a3dFresnelSchlick(vec3(0.04), vDotH);
  float clearcoatD = a3dDistributionGGX(nDotH, clearcoatRough);
  float clearcoatG = a3dGeometrySmithGGXCorrelated(nDotV, nDotL, clearcoatRough);
  vec3 clearcoatLobe = clearcoatF * clearcoatD * clearcoatG * clamp(clearcoat, 0.0, 1.0);
  float sheenDistribution = a3dTexturedPbrCharlieSheen(nDotH, sheenRoughness);
  float sheenVisibility = 1.0 / max(4.0 * (nDotV + nDotL - nDotV * nDotL), A3D_EPSILON);
  float sheenGrazing = pow(1.0 - nDotV, 12.0);
  vec3 sheenLobe = clamp(sheenColor, vec3(0.0), vec3(1.0))
    * (sheenDistribution * sheenVisibility * 0.012 + sheenGrazing * 0.18);
  float anisotropicDistribution = a3dTexturedPbrAnisotropicDistribution(N, H, tangentFrame, clearcoatRough, anisotropy, anisotropyRotation);
  float anisotropyShape = anisotropicDistribution / (anisotropicDistribution + 3.0);
  vec3 anisotropyLobe = vec3(clamp(anisotropy, 0.0, 1.0) * anisotropyShape * 0.72);
  vec3 filmF = a3dTexturedPbrThinFilmFresnel(substrateF0, iridescenceIor, (iridescenceThicknessMinimum + iridescenceThicknessMaximum) * 0.5, vDotH);
  vec3 filmN = normalize(substrateNormal);
  float filmNdotV = max(a3dSaturate(dot(filmN, V)), A3D_EPSILON);
  float filmNdotL = a3dSaturate(dot(filmN, L));
  float filmD = a3dDistributionGGX(a3dSaturate(dot(filmN, H)), substrateRoughness);
  float filmG = a3dGeometrySmithGGXCorrelated(filmNdotV, filmNdotL, substrateRoughness);
  vec3 iridescenceLobe = (filmF - a3dFresnelSchlick(substrateF0, vDotH)) * clamp(iridescence, 0.0, 1.0) * filmD * filmG;
  return ((clearcoatLobe + sheenLobe + anisotropyLobe) * nDotL + iridescenceLobe * filmNdotL) * lightColor * lightIntensity;
}
vec3 a3dTexturedPbrExtensionEnvironmentLight(
  vec3 normal,
  vec4 tangentFrame,
  vec3 viewDirection,
  vec3 specularRadiance,
  float clearcoat,
  float clearcoatRoughness,
  vec3 sheenColor,
  float sheenRoughness,
  float anisotropy,
  float anisotropyRotation,
  float iridescence,
  float iridescenceIor,
  float iridescenceThicknessMinimum,
  float iridescenceThicknessMaximum,
  vec3 substrateF0,
  vec3 substrateNormal,
  vec3 substrateSpecularRadiance
) {
  float nDotV = max(a3dSaturate(dot(normalize(normal), normalize(viewDirection))), A3D_EPSILON);
  vec3 clearcoatF = a3dFresnelSchlickRoughness(vec3(0.04), nDotV, clamp(clearcoatRoughness, 0.18, 1.0));
  float faceOn = smoothstep(0.18, 0.68, nDotV);
  vec3 boundedSpecularRadiance = min(specularRadiance * mix(0.1, 0.82, faceOn), vec3(mix(0.08, 0.95, faceOn)));
  vec3 clearcoatLobe = specularRadiance * clearcoatF * clamp(clearcoat, 0.0, 1.0);
  vec3 sheenLobe = clamp(sheenColor, vec3(0.0), vec3(1.0))
    * pow(a3dSaturate(1.0 - nDotV), 8.0)
    * mix(1.4, 0.75, clamp(sheenRoughness, 0.0, 1.0));
  vec3 N = normalize(normal);
  vec3 V = normalize(viewDirection);
  vec3 environmentDirection = normalize(vec3(0.42, 0.78, 0.46));
  vec3 environmentHalf = normalize(V + environmentDirection);
  float anisotropicDistribution = a3dTexturedPbrAnisotropicDistribution(N, environmentHalf, tangentFrame, clearcoatRoughness, anisotropy, anisotropyRotation);
  float anisotropyShape = anisotropicDistribution / (anisotropicDistribution + 3.0);
  vec3 anisotropyLobe = boundedSpecularRadiance * clamp(anisotropy, 0.0, 1.0) * anisotropyShape * 0.72;
  float filmNdotV = max(a3dSaturate(dot(normalize(substrateNormal), normalize(viewDirection))), A3D_EPSILON);
  vec3 filmF = a3dTexturedPbrThinFilmFresnel(substrateF0, iridescenceIor, (iridescenceThicknessMinimum + iridescenceThicknessMaximum) * 0.5, filmNdotV);
  vec3 iridescenceLobe = substrateSpecularRadiance * (filmF - a3dFresnelSchlick(substrateF0, filmNdotV)) * clamp(iridescence, 0.0, 1.0);
  return clearcoatLobe + sheenLobe + anisotropyLobe + iridescenceLobe;
}

#ifdef A3D_PBR_EXTENSION_ATLAS
uniform sampler2D u_extensionScalarAtlas;
int a3dAtlasWrapIndex(int x, int size, float mode) {
  if (mode < 0.5) return clamp(x, 0, size - 1);
  int period = mode < 1.5 ? size : 2 * size;
  int index = ((x % period) + period) % period;
  return mode < 1.5 ? index : (index < size ? index : period - 1 - index);
}
vec4 a3dAtlasFetch(ivec2 point, ivec2 size, ivec2 origin, vec2 wrapMode) {
  ivec2 wrapped = ivec2(a3dAtlasWrapIndex(point.x,size.x,wrapMode.x), a3dAtlasWrapIndex(point.y,size.y,wrapMode.y));
  return texelFetch(u_extensionScalarAtlas, origin + wrapped, 0);
}
vec4 a3dAtlasLevel(vec2 uv, vec4 rect, float originY, vec2 wrapMode, int level, bool nearestFilter) {
  ivec2 size = ivec2(rect.yz);
  ivec2 origin = ivec2(int(rect.x),int(originY));
  for (int i=0; i<16; i++) {
    if (i >= level) break;
    origin.y += size.y;
    size = max(size / 2, ivec2(1));
  }
  vec2 pixel = uv * vec2(size) - 0.5;
  if (nearestFilter) return a3dAtlasFetch(ivec2(floor(pixel + 0.5)),size,origin,wrapMode);
  ivec2 low = ivec2(floor(pixel));
  vec2 fraction = fract(pixel);
  return mix(mix(a3dAtlasFetch(low,size,origin,wrapMode),a3dAtlasFetch(low+ivec2(1,0),size,origin,wrapMode),fraction.x),
             mix(a3dAtlasFetch(low+ivec2(0,1),size,origin,wrapMode),a3dAtlasFetch(low+ivec2(1,1),size,origin,wrapMode),fraction.x),fraction.y);
}
vec4 a3dAtlasSample(vec2 uv, vec4 rect, float originY, vec2 wrapMode, vec4 filterMode) {
  vec2 dx=dFdx(uv), dy=dFdy(uv);
  float lx=length(dx*rect.yz), ly=length(dy*rect.yz);
  float major=max(lx,ly), minor=max(min(lx,ly),0.000001);
  bool magnify=major<=1.0;
  float taps=magnify ? 1.0 : clamp(ceil(major/max(minor,1.0)),1.0,floor(filterMode.w));
  vec2 axis=lx>=ly ? dx : dy;
  float lod=clamp(log2(max(major/taps,1.0)),0.0,rect.w);
  if (filterMode.z<0.5) lod=0.0;
  else if (filterMode.z<1.5) lod=floor(lod+0.5);
  int low=int(floor(lod)), high=min(low+1,int(rect.w));
  bool nearestFilter=magnify ? filterMode.x>0.5 : filterMode.y>0.5;
  vec4 total=vec4(0.0);
  for (int i=0;i<16;i++) {
    if (float(i)>=taps) break;
    vec2 sampleUv=uv+axis*((float(i)+0.5)/taps-0.5);
    total+=mix(a3dAtlasLevel(sampleUv,rect,originY,wrapMode,low,nearestFilter),a3dAtlasLevel(sampleUv,rect,originY,wrapMode,high,nearestFilter),fract(lod));
  }
  return total/taps;
}
#endif






void main() {
  a3dLegacySetDiffuseDetail();
  vec2 baseColorUv = a3dTexturedPbrUv(u_baseColorTextureTexCoord, u_baseColorTextureOffset, u_baseColorTextureScale, u_baseColorTextureRotation);
  vec2 normalUv = a3dTexturedPbrUv(u_normalTextureTexCoord, u_normalTextureOffset, u_normalTextureScale, u_normalTextureRotation);
  vec2 emissiveUv = a3dTexturedPbrUv(u_emissiveTextureTexCoord, u_emissiveTextureOffset, u_emissiveTextureScale, u_emissiveTextureRotation);
  vec2 metallicRoughnessUv = a3dTexturedPbrUv(u_metallicRoughnessTextureTexCoord, u_metallicRoughnessTextureOffset, u_metallicRoughnessTextureScale, u_metallicRoughnessTextureRotation);
  vec2 occlusionUv = a3dTexturedPbrUv(u_occlusionTextureTexCoord, u_occlusionTextureOffset, u_occlusionTextureScale, u_occlusionTextureRotation);
#ifdef A3D_PBR_CLEARCOAT_TEXTURES
  vec2 clearcoatUv = a3dTexturedPbrUv(u_clearcoatTextureTexCoord, u_clearcoatTextureOffset, u_clearcoatTextureScale, u_clearcoatTextureRotation);
  vec2 clearcoatRoughnessUv = a3dTexturedPbrUv(u_clearcoatRoughnessTextureTexCoord, u_clearcoatRoughnessTextureOffset, u_clearcoatRoughnessTextureScale, u_clearcoatRoughnessTextureRotation);
  vec2 clearcoatNormalUv = a3dTexturedPbrUv(u_clearcoatNormalTextureTexCoord, u_clearcoatNormalTextureOffset, u_clearcoatNormalTextureScale, u_clearcoatNormalTextureRotation);
#endif
#ifdef A3D_PBR_TRANSMISSION_VOLUME_TEXTURES
  vec2 transmissionUv = a3dTexturedPbrUv(u_transmissionTextureTexCoord, u_transmissionTextureOffset, u_transmissionTextureScale, u_transmissionTextureRotation);
  vec2 diffuseTransmissionUv = a3dTexturedPbrUv(u_diffuseTransmissionTextureTexCoord, u_diffuseTransmissionTextureOffset, u_diffuseTransmissionTextureScale, u_diffuseTransmissionTextureRotation);
  vec2 diffuseTransmissionColorUv = a3dTexturedPbrUv(u_diffuseTransmissionColorTextureTexCoord, u_diffuseTransmissionColorTextureOffset, u_diffuseTransmissionColorTextureScale, u_diffuseTransmissionColorTextureRotation);
  vec2 volumeThicknessUv = a3dTexturedPbrUv(u_volumeThicknessTextureTexCoord, u_volumeThicknessTextureOffset, u_volumeThicknessTextureScale, u_volumeThicknessTextureRotation);
#endif
#ifdef A3D_PBR_SPECULAR_TEXTURES
  vec2 specularUv = a3dTexturedPbrUv(u_specularTextureTexCoord, u_specularTextureOffset, u_specularTextureScale, u_specularTextureRotation);
  vec2 specularColorUv = a3dTexturedPbrUv(u_specularColorTextureTexCoord, u_specularColorTextureOffset, u_specularColorTextureScale, u_specularColorTextureRotation);
#endif
#ifdef A3D_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES
  vec2 sheenColorUv = a3dTexturedPbrUv(u_sheenColorTextureTexCoord, u_sheenColorTextureOffset, u_sheenColorTextureScale, u_sheenColorTextureRotation);
  vec2 sheenRoughnessUv = a3dTexturedPbrUv(u_sheenRoughnessTextureTexCoord, u_sheenRoughnessTextureOffset, u_sheenRoughnessTextureScale, u_sheenRoughnessTextureRotation);
  vec2 anisotropyUv = a3dTexturedPbrUv(u_anisotropyTextureTexCoord, u_anisotropyTextureOffset, u_anisotropyTextureScale, u_anisotropyTextureRotation);
#endif
#ifdef A3D_PBR_IRIDESCENCE_TEXTURES
  vec2 iridescenceUv = a3dTexturedPbrUv(u_iridescenceTextureTexCoord, u_iridescenceTextureOffset, u_iridescenceTextureScale, u_iridescenceTextureRotation);
  vec2 iridescenceThicknessUv = a3dTexturedPbrUv(u_iridescenceThicknessTextureTexCoord, u_iridescenceThicknessTextureOffset, u_iridescenceThicknessTextureScale, u_iridescenceThicknessTextureRotation);
#endif
  vec4 baseColorSample = texture(u_baseColorTexture, a3dTexturedPbrWrapUv(baseColorUv, u_baseColorTextureWrap));
  vec4 decodedBaseColor = vec4(a3dTexturedPbrDecodeSrgb(baseColorSample.rgb), baseColorSample.a);
  float baseColorTextureWeight = clamp(u_baseColorTextureEnabled, 0.0, 1.0);
  float sourcePaintMaterialGate = smoothstep(0.015, 0.09, u_materialEnvironmentSpecularScale)
    * smoothstep(0.18, 0.62, u_baseColor.r)
    * (1.0 - smoothstep(0.045, 0.16, max(u_baseColor.g, u_baseColor.b)));
  float sourcePaintDetailGate = baseColorTextureWeight * sourcePaintMaterialGate;
  float sourcePaintDetailLuma = dot(decodedBaseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float sourcePaintDepthSignal = smoothstep(0.14, 0.86, sourcePaintDetailLuma);
  vec3 sourcePaintTextureResponse = min(
    u_baseColor.rgb * vec3(
      mix(0.72, 1.22, sourcePaintDepthSignal),
      mix(0.76, 1.03, sourcePaintDepthSignal),
      mix(0.8, 1.0, sourcePaintDepthSignal)
    ),
    vec3(0.98, 0.12, 0.075)
  );
  float sourcePaintDetailContrast = clamp((sourcePaintDepthSignal - 0.5) * 1.9, -0.68, 0.68);
  vec3 sourcePaintDetailScale = vec3(
    1.0 + sourcePaintDetailContrast * 0.48,
    1.0 + sourcePaintDetailContrast * 0.06,
    1.0 + sourcePaintDetailContrast * 0.035
  );
  vec3 sourceNormalDetailSample = texture(u_normalTexture, a3dTexturedPbrWrapUv(normalUv, u_normalTextureWrap)).xyz * 2.0 - 1.0;
  float sourcePaintNormalDetailWeight = sourcePaintDetailGate
    * step(0.5, u_normalTextureEnabled)
    * smoothstep(0.08, 0.42, clamp(u_normalScale, 0.0, 1.0));
  float sourcePaintNormalColorDetail = clamp(
    (sourceNormalDetailSample.x * 0.65 + sourceNormalDetailSample.y * 0.35)
      * sourcePaintNormalDetailWeight
      * 1.15,
    -0.16,
    0.16
  );
  sourcePaintDetailScale *= vec3(
    1.0 + sourcePaintNormalColorDetail * 0.24,
    1.0 + sourcePaintNormalColorDetail * 0.03,
    1.0 + sourcePaintNormalColorDetail * 0.02
  );
  float sourcePaintNormalEdge = clamp(
    length(sourceNormalDetailSample.xy) * sourcePaintNormalDetailWeight * 0.7,
    0.0,
    0.14
  );
  sourcePaintDetailScale *= vec3(
    1.0 + sourcePaintNormalEdge * 0.16,
    1.0 + sourcePaintNormalEdge * 0.02,
    1.0 + sourcePaintNormalEdge * 0.014
  );
  vec3 sourceTexturedBaseColor = mix(u_baseColor.rgb * decodedBaseColor.rgb, sourcePaintTextureResponse, sourcePaintMaterialGate);
  vec4 texturedBase = vec4(mix(u_baseColor.rgb, sourceTexturedBaseColor, baseColorTextureWeight), mix(u_baseColor.a, u_baseColor.a * decodedBaseColor.a, baseColorTextureWeight)) * v_vertexColor;
  vec3 sourcePaintDetailedBase = texturedBase.rgb * mix(vec3(1.0), sourcePaintDetailScale, sourcePaintDetailGate);
  vec3 sourcePaintColorCap = mix(vec3(1.0), vec3(0.98, 0.12, 0.075), sourcePaintDetailGate);
  texturedBase.rgb = clamp(min(sourcePaintDetailedBase, sourcePaintColorCap), vec3(0.0), vec3(1.0));
  vec4 metallicRoughnessSample = texture(u_metallicRoughnessTexture, a3dTexturedPbrWrapUv(metallicRoughnessUv, u_metallicRoughnessTextureWrap));
  float roughness = mix(u_roughness, clamp(u_roughness * metallicRoughnessSample.g, 0.0, 1.0), step(0.5, u_metallicRoughnessTextureEnabled));
  float metallic = mix(u_metallic, clamp(u_metallic * metallicRoughnessSample.b, 0.0, 1.0), step(0.5, u_metallicRoughnessTextureEnabled));
  float occlusion = mix(1.0, mix(1.0, texture(u_occlusionTexture, a3dTexturedPbrWrapUv(occlusionUv, u_occlusionTextureWrap)).r, clamp(u_occlusionStrength, 0.0, 1.0)), step(0.5, u_occlusionTextureEnabled));
  vec3 geometryNormal = normalize(v_normal);
  vec3 mappedNormal = mix(geometryNormal, a3dTexturedPbrApplyNormalSample(geometryNormal, v_tangent, sourceNormalDetailSample, u_normalScale), step(0.5, u_normalTextureEnabled));
  if (!gl_FrontFacing) mappedNormal = -mappedNormal;
  mappedNormal = a3dLegacyBumpNormal(v_worldPosition, normalize(v_normal) * (gl_FrontFacing ? 1.0 : -1.0), mappedNormal);
  vec3 clearcoatNormalDirection = mappedNormal;
  float clearcoatNormalBoost = max(0.25, 1.0 - clamp(u_clearcoatNormalScale, 0.0, 1.0) * 0.12);
#ifdef A3D_PBR_CLEARCOAT_TEXTURES
  float clearcoatNormalTextureWeight = step(0.5, u_clearcoatNormalTextureEnabled);
  vec3 clearcoatNormalSample = texture(u_clearcoatNormalTexture, a3dTexturedPbrWrapUv(clearcoatNormalUv, u_clearcoatNormalTextureWrap)).xyz * 2.0 - 1.0;
  vec3 sampledClearcoatNormal = a3dTexturedPbrApplyNormalSample(mappedNormal, v_tangent, clearcoatNormalSample, u_clearcoatNormalScale);
  clearcoatNormalDirection = normalize(mix(mappedNormal, sampledClearcoatNormal, 0.26 * clearcoatNormalTextureWeight));
  clearcoatNormalBoost *= mix(1.0, max(0.25, clearcoatNormalSample.z), clearcoatNormalTextureWeight);
#endif
  float clearcoat = clamp(u_clearcoatFactor * clearcoatNormalBoost, 0.0, 1.0);
  float clearcoatRoughness = max(clamp(u_clearcoatRoughnessFactor, 0.0, 1.0), 0.18);
  float transmission = clamp(u_transmissionFactor, 0.0, 1.0);
  float diffuseTransmission = clamp(u_diffuseTransmissionFactor, 0.0, 1.0);
  vec3 diffuseTransmissionColor = clamp(u_diffuseTransmissionColorFactor, vec3(0.0), vec3(1.0));
  float volumeThickness = max(u_volumeThicknessFactor, 0.0);
  float specular = clamp(u_specularFactor, 0.0, 1.0);
  vec3 specularColor = max(u_specularColorFactor, vec3(0.0));
  vec3 sheenColor = clamp(u_sheenColorFactor, vec3(0.0), vec3(1.0));
  float sheenRoughness = clamp(u_sheenRoughnessFactor, 0.0, 1.0);
  float anisotropy = clamp(u_anisotropyStrength, 0.0, 1.0);
  float anisotropyRotation = u_anisotropyRotation;
  float iridescence = clamp(u_iridescenceFactor, 0.0, 1.0);
  float iridescenceThickness = u_iridescenceThicknessMaximum;
#ifdef A3D_PBR_CLEARCOAT_TEXTURES
#ifdef A3D_PBR_EXTENSION_ATLAS
  clearcoat = clamp(clearcoat * mix(1.0, a3dAtlasSample(clearcoatUv, u_clearcoatAtlasRect, u_clearcoatAtlasY, u_clearcoatTextureWrap, u_clearcoatAtlasFilter).r, step(0.5, u_clearcoatTextureEnabled)), 0.0, 1.0);
#else
  clearcoat = clamp(clearcoat * mix(1.0, texture(u_clearcoatTexture, a3dTexturedPbrWrapUv(clearcoatUv, u_clearcoatTextureWrap)).r, step(0.5, u_clearcoatTextureEnabled)), 0.0, 1.0);
#endif
#ifdef A3D_PBR_EXTENSION_ATLAS
  clearcoatRoughness = clamp(clearcoatRoughness * mix(1.0, a3dAtlasSample(clearcoatRoughnessUv, u_clearcoatRoughnessAtlasRect, u_clearcoatRoughnessAtlasY, u_clearcoatRoughnessTextureWrap, u_clearcoatRoughnessAtlasFilter).g, step(0.5, u_clearcoatRoughnessTextureEnabled)), 0.0, 1.0);
#else
  clearcoatRoughness = clamp(clearcoatRoughness * mix(1.0, texture(u_clearcoatRoughnessTexture, a3dTexturedPbrWrapUv(clearcoatRoughnessUv, u_clearcoatRoughnessTextureWrap)).g, step(0.5, u_clearcoatRoughnessTextureEnabled)), 0.0, 1.0);
#endif
  clearcoatRoughness = max(clearcoatRoughness, 0.19 + (1.0 - clearcoatNormalBoost) * 0.12);
#endif
#ifdef A3D_PBR_TRANSMISSION_VOLUME_TEXTURES
  transmission = clamp(transmission * mix(1.0, texture(u_transmissionTexture, a3dTexturedPbrWrapUv(transmissionUv, u_transmissionTextureWrap)).r, step(0.5, u_transmissionTextureEnabled)), 0.0, 1.0);
  diffuseTransmission = clamp(diffuseTransmission * mix(1.0, texture(u_diffuseTransmissionTexture, a3dTexturedPbrWrapUv(diffuseTransmissionUv, u_diffuseTransmissionTextureWrap)).r, step(0.5, u_diffuseTransmissionTextureEnabled)), 0.0, 1.0);
  diffuseTransmissionColor *= mix(vec3(1.0), a3dTexturedPbrDecodeSrgb(texture(u_diffuseTransmissionColorTexture, a3dTexturedPbrWrapUv(diffuseTransmissionColorUv, u_diffuseTransmissionColorTextureWrap)).rgb), step(0.5, u_diffuseTransmissionColorTextureEnabled));
  volumeThickness *= mix(1.0, texture(u_volumeThicknessTexture, a3dTexturedPbrWrapUv(volumeThicknessUv, u_volumeThicknessTextureWrap)).g, step(0.5, u_volumeThicknessTextureEnabled));
#endif
#ifdef A3D_PBR_SPECULAR_TEXTURES
  specular = clamp(specular * mix(1.0, texture(u_specularTexture, a3dTexturedPbrWrapUv(specularUv, u_specularTextureWrap)).a, step(0.5, u_specularTextureEnabled)), 0.0, 1.0);
  specularColor *= mix(vec3(1.0), a3dTexturedPbrDecodeSrgb(texture(u_specularColorTexture, a3dTexturedPbrWrapUv(specularColorUv, u_specularColorTextureWrap)).rgb), step(0.5, u_specularColorTextureEnabled));
#endif
#ifdef A3D_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES
  sheenColor *= mix(vec3(1.0), a3dTexturedPbrDecodeSrgb(texture(u_sheenColorTexture, a3dTexturedPbrWrapUv(sheenColorUv, u_sheenColorTextureWrap)).rgb), step(0.5, u_sheenColorTextureEnabled));
#ifdef A3D_PBR_EXTENSION_ATLAS
  sheenRoughness = clamp(sheenRoughness * mix(1.0, a3dAtlasSample(sheenRoughnessUv, u_sheenRoughnessAtlasRect, u_sheenRoughnessAtlasY, u_sheenRoughnessTextureWrap, u_sheenRoughnessAtlasFilter).a, step(0.5, u_sheenRoughnessTextureEnabled)), 0.0, 1.0);
#else
  sheenRoughness = clamp(sheenRoughness * mix(1.0, texture(u_sheenRoughnessTexture, a3dTexturedPbrWrapUv(sheenRoughnessUv, u_sheenRoughnessTextureWrap)).a, step(0.5, u_sheenRoughnessTextureEnabled)), 0.0, 1.0);
#endif
  vec3 anisotropySample = texture(u_anisotropyTexture, a3dTexturedPbrWrapUv(anisotropyUv, u_anisotropyTextureWrap)).rgb;
  anisotropy = clamp(anisotropy * mix(1.0, anisotropySample.b, step(0.5, u_anisotropyTextureEnabled)), 0.0, 1.0);
  vec2 anisotropyDirection = anisotropySample.rg * 2.0 - 1.0;
  if (u_anisotropyTextureEnabled > 0.5 && dot(anisotropyDirection, anisotropyDirection) > 0.000001) {
    anisotropyRotation += atan(anisotropyDirection.y, anisotropyDirection.x);
  }
#endif
#ifdef A3D_PBR_IRIDESCENCE_TEXTURES
#ifdef A3D_PBR_EXTENSION_ATLAS
  iridescence = clamp(iridescence * mix(1.0, a3dAtlasSample(iridescenceUv, u_iridescenceAtlasRect, u_iridescenceAtlasY, u_iridescenceTextureWrap, u_iridescenceAtlasFilter).r, step(0.5, u_iridescenceTextureEnabled)), 0.0, 1.0);
#else
  iridescence = clamp(iridescence * mix(1.0, texture(u_iridescenceTexture, a3dTexturedPbrWrapUv(iridescenceUv, u_iridescenceTextureWrap)).r, step(0.5, u_iridescenceTextureEnabled)), 0.0, 1.0);
#endif
#ifdef A3D_PBR_EXTENSION_ATLAS
  iridescenceThickness = mix(iridescenceThickness, mix(u_iridescenceThicknessMinimum, u_iridescenceThicknessMaximum, a3dAtlasSample(iridescenceThicknessUv, u_iridescenceThicknessAtlasRect, u_iridescenceThicknessAtlasY, u_iridescenceThicknessTextureWrap, u_iridescenceThicknessAtlasFilter).g), step(0.5, u_iridescenceThicknessTextureEnabled));
#else
  iridescenceThickness = mix(iridescenceThickness, mix(u_iridescenceThicknessMinimum, u_iridescenceThicknessMaximum, texture(u_iridescenceThicknessTexture, a3dTexturedPbrWrapUv(iridescenceThicknessUv, u_iridescenceThicknessTextureWrap)).g), step(0.5, u_iridescenceThicknessTextureEnabled));
#endif
#endif
  vec3 base = a3dApplyAdvancedPbrLobes(
    texturedBase.rgb,
    clearcoat,
    clearcoatRoughness,
    transmission,
    diffuseTransmission,
    diffuseTransmissionColor,
    u_transmissionFallbackEnergy,
    volumeThickness,
    u_volumeAttenuationDistance,
    u_volumeAttenuationColor,
    u_ior,
    specular,
    specularColor,
    sheenColor,
    sheenRoughness,
    anisotropy,
    anisotropyRotation,
    0.0,
    u_iridescenceIor,
    iridescenceThickness,
    iridescenceThickness,
    u_dispersion
  );
  vec3 viewDirection = normalize(u_cameraPosition - v_worldPosition);
  vec3 iridescenceSubstrateF0 = mix(vec3(pow((u_ior - 1.0) / max(u_ior + 1.0, 0.0001), 2.0)) * specularColor * specular, texturedBase.rgb, metallic);
  float materialRedPaintGate = smoothstep(0.28, 0.72, texturedBase.r)
    * (1.0 - smoothstep(0.05, 0.18, max(texturedBase.g, texturedBase.b)))
    * smoothstep(0.015, 0.07, u_materialEnvironmentSpecularScale);
  float directTextureOcclusion = mix(1.0, occlusion, clamp(baseColorTextureWeight * mix(0.2, 0.56, materialRedPaintGate), 0.0, 0.56));
  float sourcePaintDirectDetail = mix(0.82, 1.22, sourcePaintDepthSignal);
  float environmentNdotV = clamp(dot(mappedNormal, viewDirection), 0.0, 1.0);
  vec2 environmentBrdf = mix(vec2(1.0, 0.0), texture(u_environmentBrdfLutTexture, vec2(environmentNdotV, roughness)).rg, step(0.0001, u_environmentBrdfLutEnabled));
  vec3 extensionEnvironmentSpecular = a3dTexturedPbrEnvironmentSpecularInput(clearcoatNormalDirection, viewDirection, clamp(clearcoatRoughness, 0.18, 1.0));
  vec3 emissiveSample = a3dTexturedPbrDecodeSrgb(texture(u_emissiveTexture, a3dTexturedPbrWrapUv(emissiveUv, u_emissiveTextureWrap)).rgb);
  vec3 shaded = u_emissiveColor * u_emissiveStrength * mix(vec3(1.0), emissiveSample, step(0.5, u_emissiveTextureEnabled)) + a3dPbrEnvironmentLightSplitSum(
    mappedNormal,
    viewDirection,
    a3dTexturedPbrEnvironmentDiffuseInput(mappedNormal) * occlusion,
    a3dTexturedPbrEnvironmentSpecularInput(mappedNormal, viewDirection, roughness),
    environmentBrdf,
    base,
    metallic,
    roughness,
    specular,
    specularColor
  ) * mix(1.0, 0.18, anisotropy) + a3dTexturedPbrExtensionEnvironmentLight(
    clearcoatNormalDirection,
    v_tangent,
    viewDirection,
    extensionEnvironmentSpecular,
    clearcoat,
    clearcoatRoughness,
    sheenColor,
    sheenRoughness,
    anisotropy,
    anisotropyRotation,
    iridescence,
    u_iridescenceIor,
    iridescenceThickness,
    iridescenceThickness,
    iridescenceSubstrateF0,
    mappedNormal,
    a3dTexturedPbrEnvironmentSpecularInput(mappedNormal, viewDirection, roughness)
  );
  float texturedTransmissionAmount = clamp(max(transmission, diffuseTransmission), 0.0, 1.0);
  float texturedSampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureIntensity);
#ifndef A3D_PBR_DISABLE_TRANSMISSION_BACKDROP
  float texturedBackdropWeight = clamp(u_transmissionBackdropEnabled * u_transmissionBackdropStrength, 0.0, 1.0);
#else
  float texturedBackdropWeight = 0.0;
#endif
  if (texturedTransmissionAmount > 0.0001 && (texturedSampledEnvironmentWeight > 0.0001 || texturedBackdropWeight > 0.0001)) {
    vec3 texturedReflectionDirection = reflect(-viewDirection, mappedNormal);
    vec3 texturedRefractionDirection = refract(-viewDirection, mappedNormal, 1.0 / max(u_ior, 1.0));
    texturedRefractionDirection = length(texturedRefractionDirection) > 0.0001 ? normalize(texturedRefractionDirection) : -texturedReflectionDirection;
    float texturedParallaxStrength = clamp(u_transmissionParallaxStrength, 0.0, 1.0);
    if (texturedParallaxStrength > 0.0001) {
      vec3 texturedParallaxDirection = a3dTexturedPbrBoxProjectedDirection(v_worldPosition, texturedRefractionDirection, u_transmissionParallaxBoxMin, u_transmissionParallaxBoxMax);
      texturedRefractionDirection = normalize(mix(texturedRefractionDirection, texturedParallaxDirection, texturedParallaxStrength));
    }
    float texturedBounceCount = clamp(u_transmissionBounceCount, 0.0, 4.0);
    float texturedRefractionLod = clamp(roughness + volumeThickness * 0.12 + texturedBounceCount * 0.04 * texturedParallaxStrength, 0.0, 1.0) * max(u_environmentMapTextureMipCount - 1.0, 0.0);
    vec3 texturedRefractedEnvironment = a3dTexturedPbrBoundHdrTransmissionRadiance(a3dTexturedPbrDecodeEnvironmentSample(a3dTexturedPbrEnvironmentSampleRaw(texturedRefractionDirection, texturedRefractionLod)));
    float texturedVolumeTravel = clamp((max(volumeThickness, 0.0) * (1.0 + texturedBounceCount * 0.18 * texturedParallaxStrength)) / max(u_volumeAttenuationDistance, 0.0001), 0.0, 16.0);
    vec3 texturedVolumeTint = pow(clamp(u_volumeAttenuationColor, vec3(0.0001), vec3(1.0)), vec3(texturedVolumeTravel));
    float texturedCausticEnergy = u_transmissionCausticStrength * texturedParallaxStrength * texturedTransmissionAmount * pow(1.0 - roughness, 2.0) / (1.0 + texturedBounceCount * 0.35);
    float texturedRoughVolumeIorLift = mix(1.0, 1.45, clamp((u_ior - 1.0) / 1.5, 0.0, 1.0) * smoothstep(0.35, 0.95, roughness + volumeThickness * 0.2));
    float texturedFallbackEnvironmentTransmissionEnergy = mix(1.0, clamp(u_transmissionFallbackEnergy, 0.0, 1.0), texturedTransmissionAmount);
    vec3 texturedRefractionRadiance = (texturedRefractedEnvironment + vec3(texturedCausticEnergy)) * texturedVolumeTint * u_environmentMapTextureIntensity * texturedTransmissionAmount * texturedFallbackEnvironmentTransmissionEnergy * mix(0.9, 0.55, roughness) * texturedRoughVolumeIorLift * texturedSampledEnvironmentWeight * clamp(u_materialEnvironmentSpecularScale, 0.0, 1.0);
#ifndef A3D_PBR_DISABLE_TRANSMISSION_BACKDROP
    if (texturedBackdropWeight > 0.0001) {
      vec2 backdropUv = gl_FragCoord.xy / max(u_transmissionBackdropResolution, vec2(1.0));
      vec2 backdropOffset = normalize(texturedRefractionDirection.xy + vec2(0.0001)) * u_transmissionBackdropRefractionScale * mix(1.25, 0.55, roughness) * clamp(u_ior - 1.0, 0.0, 2.5);
      float backdropLod = clamp((roughness + volumeThickness * 0.08) * max(u_transmissionBackdropMipCount - 1.0, 0.0), 0.0, max(u_transmissionBackdropMipCount - 1.0, 0.0));
      vec3 backdropRadiance = a3dTexturedPbrDecodeSrgb(textureLod(u_transmissionBackdropTexture, clamp(backdropUv + backdropOffset, vec2(0.001), vec2(0.999)), backdropLod).rgb);
      texturedRefractionRadiance = mix(
        texturedRefractionRadiance,
        backdropRadiance * texturedVolumeTint * texturedTransmissionAmount * mix(1.0, 1.22, texturedBackdropWeight),
        texturedBackdropWeight
      );
    }
#endif
    shaded = mix(shaded, shaded * 0.72 + texturedRefractionRadiance, texturedTransmissionAmount * mix(0.08, 0.58, texturedFallbackEnvironmentTransmissionEnergy));
  }
#ifndef A3D_PBR_DISABLE_CLUSTERED_LIGHTING
  ivec2 clusterTile = clamp(ivec2(floor(min(gl_FragCoord.xy, u_clusterViewportSize) / vec2(64.0))), ivec2(0), ivec2(u_clusterGridSize) - ivec2(1));
  int clusterIndex = clusterTile.y * int(u_clusterGridSize.x) + clusterTile.x;
  int count = u_clusteredLightEnabled > 0.5 ? min(int(texelFetch(u_clusterLightIndices, ivec2(0, clusterIndex), 0).g), 64) : min(int(u_lightCount), 16);
#else
  int count = min(int(u_lightCount), 16);
#endif
  for (int i = 0; i < 64; ++i) {
    if (i >= count) break;
#ifndef A3D_PBR_DISABLE_CLUSTERED_LIGHTING
    int lightIndex = u_clusteredLightEnabled > 0.5 ? int(texelFetch(u_clusterLightIndices, ivec2(i, clusterIndex), 0).r) : i;
    int baseIndex = lightIndex * 6;
    vec4 colorIntensity = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(0, lightIndex), 0) : u_lightData[baseIndex];
    vec4 positionRange = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(1, lightIndex), 0) : u_lightData[baseIndex + 1];
    vec4 directionKind = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(2, lightIndex), 0) : u_lightData[baseIndex + 2];
    vec4 spotShadowLayer = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(3, lightIndex), 0) : u_lightData[baseIndex + 3];
    vec4 areaRight = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(4, lightIndex), 0) : u_lightData[baseIndex + 4];
    vec4 areaUp = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(5, lightIndex), 0) : u_lightData[baseIndex + 5];
#else
    int lightIndex = i;
    int baseIndex = lightIndex * 6;
    vec4 colorIntensity = u_lightData[baseIndex];
    vec4 positionRange = u_lightData[baseIndex + 1];
    vec4 directionKind = u_lightData[baseIndex + 2];
    vec4 spotShadowLayer = u_lightData[baseIndex + 3];
    vec4 areaRight = u_lightData[baseIndex + 4];
    vec4 areaUp = u_lightData[baseIndex + 5];
#endif
    float kind = directionKind.w;
    if (kind > 2.5) {
      shaded += a3dPbrRectAreaLight(
        v_worldPosition, positionRange.xyz, directionKind.xyz, areaRight.xyz, areaUp.xyz,
        spotShadowLayer.x, spotShadowLayer.y, positionRange.w, areaUp.w,
        mappedNormal, viewDirection, colorIntensity.rgb, colorIntensity.a,
        base, metallic, roughness, specular, specularColor
      ) * directTextureOcclusion;
      continue;
    }
    vec3 lightDirection = -directionKind.xyz;
    float attenuation = 1.0;
    if (kind > 0.5) {
      vec3 toLight = positionRange.xyz - v_worldPosition;
      float distanceToLight = length(toLight);
      lightDirection = distanceToLight > 0.0001 ? toLight / distanceToLight : -directionKind.xyz;
      // range <= 0 means infinite (physical descriptors, PRD-02 §6.3): no
      // range window, decay-only attenuation. Legacy ranges are always > 0.
      float rangeFalloff = positionRange.w <= 0.0 ? 1.0 : clamp(1.0 - pow(distanceToLight / max(positionRange.w, 0.0001), 4.0), 0.0, 1.0);
      rangeFalloff *= rangeFalloff;
      attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);
    }
    if (kind > 1.5) {
      vec3 lightToFragment = normalize(v_worldPosition - positionRange.xyz);
      float cone = dot(normalize(directionKind.xyz), lightToFragment);
      if (areaUp.w > 0.5) cone = abs(cone);
      float outer = cos(spotShadowLayer.x);
      float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    float shadowFactor = mix(1.0, kind > 0.5 && kind < 1.5 ? a3dTexturedPbrPointShadowFactor(v_worldPosition, mappedNormal, lightDirection) : a3dTexturedPbrShadowFactor(v_worldPosition, mappedNormal, lightDirection) * (lightIndex == int(u_contactShadowLightIndex) ? a3dContactShadowMaskFactor(kind) : 1.0), step(0.5, spotShadowLayer.z));
#ifndef A3D_PBR_NO_SPOT_SHADOW
    shadowFactor = a3dTexturedPbrResolveSpotShadowOverride(shadowFactor, kind, spotShadowLayer.z, v_worldPosition, mappedNormal, lightDirection);
#endif
    float directLightIntensity = colorIntensity.a
      * attenuation
      * shadowFactor
      * directTextureOcclusion
      * mix(1.0, sourcePaintDirectDetail, sourcePaintDetailGate * 0.48);
    float directExtensionNdotV = clamp(dot(clearcoatNormalDirection, viewDirection), 0.0, 1.0);
    float directExtensionGrazingGate = mix(0.18, 1.0, smoothstep(0.12, 0.58, directExtensionNdotV));
    float directExtensionSpecularScale = sqrt(clamp(u_materialEnvironmentSpecularScale, 0.0, 1.0)) * directExtensionGrazingGate;
    shaded += a3dPbrDirectLight(mappedNormal, viewDirection, lightDirection, colorIntensity.rgb, directLightIntensity, base, metallic, roughness, specular, specularColor)
      * mix(1.0, 0.18, anisotropy);
    shaded += a3dTexturedPbrExtensionDirectLight(
      clearcoatNormalDirection,
      v_tangent,
      viewDirection,
      lightDirection,
      colorIntensity.rgb,
      directLightIntensity,
      clearcoat,
      clearcoatRoughness,
      sheenColor,
      sheenRoughness,
      anisotropy,
      anisotropyRotation,
      iridescence,
      u_iridescenceIor,
      iridescenceThickness,
      iridescenceThickness,
      iridescenceSubstrateF0,
      mappedNormal,
      roughness
    ) * directExtensionSpecularScale;
  }
  float alpha = texturedBase.a;
  if (alpha < u_alphaCutoff) discard;
  vec3 fogged = a3dApplyEnvironmentFog(max(shaded, vec3(0.0)), v_worldPosition);
  outColor = vec4(a3dTexturedPbrEncodeOutput(fogged), alpha);
}
`
  });
  registerLeanEnvironmentBackgroundShader(library);
  library.register({
    name: DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME,
    marker: DEFAULT_SCREEN_SPACE_LINE_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_SCREEN_SPACE_LINE_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 4) in vec4 a_color;
layout(location = 10) in vec3 a_lineStart;
layout(location = 11) in vec3 a_lineEnd;
layout(location = 12) in vec2 a_lineCorner;
layout(location = 13) in float a_lineDistance;
layout(location = 14) in vec4 a_lineOtherColor;
layout(location = 15) in float a_lineOtherDistance;
uniform mat4 u_modelViewProjection;
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform float u_lineWidth;
uniform float u_lineWorldUnits;
uniform vec2 u_lineResolution;
uniform float u_linePixelRatio;
uniform float u_lineSquareCaps;
uniform float u_lineRoundCaps;
out vec4 v_lineColor;
out float v_lineDistance;
out vec2 v_lineCap;
out float v_lineCapFraction;

void main() {
  float along = a_lineCorner.y;
  vec4 originalStart = u_modelViewProjection * vec4(a_lineStart, 1.0);
  vec4 originalEnd = u_modelViewProjection * vec4(a_lineEnd, 1.0);
  float nearStart = originalStart.z + originalStart.w;
  float nearEnd = originalEnd.z + originalEnd.w;
  if (nearStart < 0.0 && nearEnd < 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_lineColor = vec4(0.0);
    v_lineDistance = 0.0;
    v_lineCap = vec2(0.0);
    v_lineCapFraction = 0.0;
    return;
  }
  float startT = 0.0;
  float endT = 1.0;
  if (nearStart < 0.0 || nearEnd < 0.0) {
    float crossing = clamp(nearStart / (nearStart - nearEnd), 0.0, 1.0);
    if (nearStart < 0.0) startT = crossing;
    else endT = crossing;
  }
  vec4 clippedStart = mix(originalStart, originalEnd, startT);
  vec4 clippedEnd = mix(originalStart, originalEnd, endT);
  float t = mix(startT, endT, along);
  // Each vertex stores its own and its opposite endpoint's values.
  vec4 colorStart = mix(a_color, a_lineOtherColor, along);
  vec4 colorEnd = mix(a_lineOtherColor, a_color, along);
  float distanceStart = mix(a_lineDistance, a_lineOtherDistance, along);
  float distanceEnd = mix(a_lineOtherDistance, a_lineDistance, along);
  v_lineColor = mix(colorStart, colorEnd, t);
  v_lineDistance = mix(distanceStart, distanceEnd, t);

  vec4 clipAnchor = u_modelViewProjection * vec4(a_position, 1.0);
  clipAnchor += along > 0.5 ? clippedEnd - originalEnd : clippedStart - originalStart;
  vec2 startPixel = clippedStart.xy / max(clippedStart.w, 1e-6) * (0.5 * u_lineResolution);
  vec2 endPixel = clippedEnd.xy / max(clippedEnd.w, 1e-6) * (0.5 * u_lineResolution);
  vec2 pixelDelta = endPixel - startPixel;
  float pixelLength = length(pixelDelta);
  vec2 pixelDirection = pixelLength > 1e-5 ? pixelDelta / pixelLength : vec2(1.0, 0.0);
  vec2 pixelNormal = vec2(-pixelDirection.y, pixelDirection.x);
  float halfPixels = u_lineWidth * u_linePixelRatio * 0.5;
  float capEnabled = max(u_lineSquareCaps, u_lineRoundCaps);
  // A clipped endpoint is a cut through the segment, not a new cap.
  float capAtEndpoint = along > 0.5 ? (endT >= 1.0 ? capEnabled : 0.0) : (startT <= 0.0 ? capEnabled : 0.0);
  float capFraction;
  if (u_lineWorldUnits > 0.5) {
    mat4 modelView = u_viewMatrix * u_modelMatrix;
    vec4 startView = modelView * vec4(a_lineStart, 1.0);
    vec4 endView = modelView * vec4(a_lineEnd, 1.0);
    vec4 clippedStartView = mix(startView, endView, startT);
    vec4 clippedEndView = mix(startView, endView, endT);
    vec3 tangent = clippedEndView.xyz - clippedStartView.xyz;
    float segmentLength = length(tangent);
    tangent = segmentLength > 1e-6 ? tangent / segmentLength : vec3(1.0, 0.0, 0.0);
    vec3 towardEye = abs(u_projectionMatrix[3][3]) > 0.5
      ? vec3(0.0, 0.0, 1.0)
      : -0.5 * (clippedStartView.xyz + clippedEndView.xyz);
    vec3 side = cross(tangent, towardEye);
    if (length(side) < 1e-6) side = cross(tangent, abs(tangent.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0));
    side = normalize(side);
    float halfWorld = 0.5 * u_lineWidth;
    vec4 viewAnchor = modelView * vec4(a_position, 1.0);
    viewAnchor += along > 0.5 ? clippedEndView - endView : clippedStartView - startView;
    viewAnchor.xyz += side * a_lineCorner.x * halfWorld;
    viewAnchor.xyz += tangent * (along > 0.5 ? 1.0 : -1.0) * halfWorld * capAtEndpoint;
    gl_Position = u_projectionMatrix * viewAnchor;
    capFraction = halfWorld / max(segmentLength, 1e-6);
  } else {
    vec2 offset = pixelNormal * a_lineCorner.x * halfPixels;
    offset += pixelDirection * (along > 0.5 ? 1.0 : -1.0) * halfPixels * capAtEndpoint;
    clipAnchor.xy += offset * (2.0 / u_lineResolution) * clipAnchor.w;
    gl_Position = clipAnchor;
    capFraction = halfPixels / max(pixelLength, 1e-6);
  }
  v_lineCapFraction = capFraction;
  v_lineCap = vec2(a_lineCorner.x, along > 0.5 ? 1.0 + capFraction * capAtEndpoint : -capFraction * capAtEndpoint);
}
`,
    portableBindings: [
      { name: "u_modelViewProjection", kind: "mat4" },
      { name: "u_modelMatrix", kind: "mat4" },
      { name: "u_viewMatrix", kind: "mat4" },
      { name: "u_projectionMatrix", kind: "mat4" },
      { name: "u_baseColor", kind: "vec4" },
      { name: "u_lineResolution", kind: "vec2" },
      { name: "u_lineWidth", kind: "float" },
      { name: "u_lineWorldUnits", kind: "float" },
      { name: "u_linePixelRatio", kind: "float" },
      { name: "u_lineSquareCaps", kind: "float" },
      { name: "u_lineRoundCaps", kind: "float" },
      { name: "u_lineDashSize", kind: "float" },
      { name: "u_lineGapSize", kind: "float" },
      { name: "u_lineDashOffset", kind: "float" }
    ],
    webgpu: {
      vertex: `// ${DEFAULT_SCREEN_SPACE_LINE_SHADER_MARKER}
/* @aura3d-bindings */
${ZERO_TO_ONE_PROJECTION_WGSL}
struct LineOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) distance: f32,
  @location(2) cap: vec2f,
  @location(3) capFraction: f32,
};
@vertex fn vs_main(
  @location(0) position: vec3f, @location(4) color: vec4f,
  @location(10) lineStart: vec3f, @location(11) lineEnd: vec3f,
  @location(12) corner: vec2f, @location(13) distance: f32,
  @location(14) otherColor: vec4f, @location(15) otherDistance: f32
) -> LineOut {
  var out: LineOut;
  let along = corner.y;
  let start = aura.u_modelViewProjection * vec4f(lineStart, 1.0);
  let end = aura.u_modelViewProjection * vec4f(lineEnd, 1.0);
  let nearStart = start.z + start.w;
  let nearEnd = end.z + end.w;
  if (nearStart < 0.0 && nearEnd < 0.0) {
    out.position = vec4f(2.0, 2.0, 2.0, 1.0);
    out.color = vec4f(0.0);
    out.distance = 0.0;
    out.cap = vec2f(0.0);
    out.capFraction = 0.0;
    return out;
  }
  var startT = 0.0;
  var endT = 1.0;
  if (nearStart < 0.0 || nearEnd < 0.0) {
    let crossing = clamp(nearStart / (nearStart - nearEnd), 0.0, 1.0);
    if (nearStart < 0.0) { startT = crossing; } else { endT = crossing; }
  }
  let clippedStart = mix(start, end, startT);
  let clippedEnd = mix(start, end, endT);
  let t = mix(startT, endT, along);
  out.color = mix(mix(color, otherColor, along), mix(otherColor, color, along), t);
  out.distance = mix(mix(distance, otherDistance, along), mix(otherDistance, distance, along), t);
  var clipAnchor = aura.u_modelViewProjection * vec4f(position, 1.0);
  if (along > 0.5) { clipAnchor += clippedEnd - end; } else { clipAnchor += clippedStart - start; }
  let startPixel = clippedStart.xy / max(clippedStart.w, 0.000001) * (0.5 * aura.u_lineResolution);
  let endPixel = clippedEnd.xy / max(clippedEnd.w, 0.000001) * (0.5 * aura.u_lineResolution);
  let pixelDelta = endPixel - startPixel;
  let pixelLength = length(pixelDelta);
  var pixelDirection = vec2f(1.0, 0.0);
  if (pixelLength > 0.00001) { pixelDirection = pixelDelta / pixelLength; }
  let pixelNormal = vec2f(-pixelDirection.y, pixelDirection.x);
  let halfPixels = aura.u_lineWidth * aura.u_linePixelRatio * 0.5;
  let capEnabled = max(aura.u_lineSquareCaps, aura.u_lineRoundCaps);
  var capAtEndpoint = 0.0;
  if ((along > 0.5 && endT >= 1.0) || (along <= 0.5 && startT <= 0.0)) { capAtEndpoint = capEnabled; }
  var capFraction = 0.0;
  var clip: vec4f;
  let endSign = select(-1.0, 1.0, along > 0.5);
  if (aura.u_lineWorldUnits > 0.5) {
    let modelView = aura.u_viewMatrix * aura.u_modelMatrix;
    let startView = modelView * vec4f(lineStart, 1.0);
    let endView = modelView * vec4f(lineEnd, 1.0);
    let clippedStartView = mix(startView, endView, startT);
    let clippedEndView = mix(startView, endView, endT);
    let delta = clippedEndView.xyz - clippedStartView.xyz;
    let segmentLength = length(delta);
    var tangent = vec3f(1.0, 0.0, 0.0);
    if (segmentLength > 0.000001) { tangent = delta / segmentLength; }
    var towardEye = -0.5 * (clippedStartView.xyz + clippedEndView.xyz);
    if (abs(aura.u_projectionMatrix[3][3]) > 0.5) { towardEye = vec3f(0.0, 0.0, 1.0); }
    var side = cross(tangent, towardEye);
    if (length(side) < 0.000001) {
      let axis = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(tangent.y) < 0.9);
      side = cross(tangent, axis);
    }
    side = normalize(side);
    let halfWorld = 0.5 * aura.u_lineWidth;
    var viewAnchor = modelView * vec4f(position, 1.0);
    if (along > 0.5) { viewAnchor += clippedEndView - endView; } else { viewAnchor += clippedStartView - startView; }
    viewAnchor = vec4f(viewAnchor.xyz + side * corner.x * halfWorld + tangent * endSign * halfWorld * capAtEndpoint, viewAnchor.w);
    clip = aura.u_projectionMatrix * viewAnchor;
    capFraction = halfWorld / max(segmentLength, 0.000001);
  } else {
    let offset = pixelNormal * corner.x * halfPixels + pixelDirection * endSign * halfPixels * capAtEndpoint;
    clip = vec4f(clipAnchor.xy + offset * (2.0 / aura.u_lineResolution) * clipAnchor.w, clipAnchor.zw);
    capFraction = halfPixels / max(pixelLength, 0.000001);
  }
  // Standard frames pass GL clip depth (remapped to WebGPU's [0,w]); zero-to-one
  // reversed frames specialize a3dZeroToOneProjection and pass clip z through.
  out.position = vec4f(clip.xy, ${rasterClipDepthWgsl("clip")}, clip.w);
  out.capFraction = capFraction;
  out.cap = vec2f(corner.x, select(-capFraction * capAtEndpoint, 1.0 + capFraction * capAtEndpoint, along > 0.5));
  return out;
}`,
      fragment: `// ${DEFAULT_SCREEN_SPACE_LINE_SHADER_MARKER}
/* @aura3d-bindings */
@fragment fn fs_main(@location(0) color: vec4f, @location(1) distance: f32, @location(2) cap: vec2f, @location(3) capFraction: f32) -> @location(0) vec4f {
  if (aura.u_lineDashSize > 0.0) {
    let period = aura.u_lineDashSize + aura.u_lineGapSize;
    let phase = (distance + aura.u_lineDashOffset) - period * floor((distance + aura.u_lineDashOffset) / period);
    if (phase >= aura.u_lineDashSize) { discard; }
  }
  if (aura.u_lineRoundCaps > 0.5) {
    let outside = max(-cap.y, cap.y - 1.0) / max(capFraction, 0.000001);
    if (outside > 0.0 && outside * outside + cap.x * cap.x > 1.0) { discard; }
  }
  return aura.u_baseColor * color;
}`
    },
    fragment: `#version 300 es
// ${DEFAULT_SCREEN_SPACE_LINE_SHADER_MARKER}
precision highp float;
uniform vec4 u_baseColor;
uniform float u_lineDashSize;
uniform float u_lineGapSize;
uniform float u_lineDashOffset;
uniform float u_lineRoundCaps;
in vec4 v_lineColor;
in float v_lineDistance;
in vec2 v_lineCap;
in float v_lineCapFraction;
out vec4 outColor;

void main() {
  if (u_lineDashSize > 0.0) {
    float period = u_lineDashSize + u_lineGapSize;
    float phase = mod(v_lineDistance + u_lineDashOffset, period);
    if (phase >= u_lineDashSize) discard;
  }
  if (u_lineRoundCaps > 0.5) {
    float outside = max(-v_lineCap.y, v_lineCap.y - 1.0) / max(v_lineCapFraction, 1e-6);
    if (outside > 0.0 && outside * outside + v_lineCap.x * v_lineCap.x > 1.0) discard;
  }
  outColor = u_baseColor * v_lineColor;
}
`
  });
  registerLeanDepthShader(library);
  // Register the animation/cel toon program (banded N·L ramp + Fresnel rim).
  // This is a real GLSL program compiled through the same library path as the
  // built-in shaders; AnimationToonMaterial targets it via ANIMATION_TOON_SHADER_NAME.
  registerAnimationToonShader(library);
  recordDefaultShaderLibrary(library);
  return library;
}
