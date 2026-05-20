import { ShaderPreprocessor, type ShaderPreprocessOptions } from "./ShaderPreprocessor";
import { DEFAULT_PBR_SHADER_MARKER, DEFAULT_PBR_SHADER_NAME } from "./PBRMaterial";
import { SHADER_CHUNKS, validateShaderChunks } from "./ShaderChunks";

export interface ShaderSourcePair {
  readonly name: string;
  readonly marker: string;
  readonly vertex: string;
  readonly fragment: string;
  readonly variants?: readonly ShaderVariantDescriptor[];
}

export interface ShaderVariantDescriptor {
  readonly name: string;
  readonly defines?: Readonly<Record<string, string | number | boolean>>;
}

export interface CompiledShaderSource {
  readonly label: string;
  readonly marker: string;
  readonly vertex: string;
  readonly fragment: string;
}

export class ShaderLibrary {
  private readonly shaders = new Map<string, ShaderSourcePair>();
  private readonly chunks = new Map<string, string>();
  private readonly preprocessor = new ShaderPreprocessor();
  private readonly variantCache = new Map<string, CompiledShaderSource>();

  register(shader: ShaderSourcePair): void {
    if (this.shaders.has(shader.name)) {
      throw new Error(`Shader is already registered: ${shader.name}`);
    }
    this.assertMarker(shader);
    this.assertVariants(shader);
    this.shaders.set(shader.name, shader);
    this.variantCache.clear();
  }

  registerChunk(name: string, source: string): void {
    if (this.chunks.has(name)) {
      throw new Error(`Shader chunk is already registered: ${name}`);
    }
    this.chunks.set(name, source);
    this.variantCache.clear();
  }

  get(name: string): ShaderSourcePair {
    const shader = this.shaders.get(name);
    if (!shader) {
      throw new Error(`Shader is not registered: ${name}`);
    }
    return shader;
  }

  compileSource(name: string, options: ShaderPreprocessOptions = {}): CompiledShaderSource {
    const shader = this.get(name);
    const includes = new Map([...this.chunks, ...(options.includes ?? new Map())]);
    const preprocessOptions = { ...options, includes };
    const vertex = this.preprocessor.preprocess(shader.vertex, preprocessOptions).source;
    const fragment = this.preprocessor.preprocess(shader.fragment, preprocessOptions).source;
    if (!vertex.includes(shader.marker) || !fragment.includes(shader.marker)) {
      throw new Error(`Shader marker ${shader.marker} was not preserved for ${name}`);
    }
    return { label: name, marker: shader.marker, vertex, fragment };
  }

  compileVariant(name: string, variantName: string, options: ShaderPreprocessOptions = {}): CompiledShaderSource {
    const shader = this.get(name);
    const variant = shader.variants?.find((candidate) => candidate.name === variantName);
    if (!variant) {
      throw new Error(`Shader variant is not registered: ${name}:${variantName}`);
    }
    const compileOptions: ShaderPreprocessOptions = {
      ...options,
      defines: {
        ...(variant.defines ?? {}),
        ...(options.defines ?? {})
      }
    };
    const cacheKey = variantCacheKey(name, variantName, compileOptions);
    const cached = this.variantCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const compiled = this.compileSource(name, compileOptions);
    const labeled = { ...compiled, label: `${name}:${variantName}` };
    this.variantCache.set(cacheKey, labeled);
    return labeled;
  }

  names(): readonly string[] {
    return [...this.shaders.keys()];
  }

  private assertMarker(shader: ShaderSourcePair): void {
    if (!shader.marker.trim()) {
      throw new Error(`Shader ${shader.name} must declare a non-empty source marker`);
    }
    if (!shader.vertex.includes(shader.marker) || !shader.fragment.includes(shader.marker)) {
      throw new Error(`Shader ${shader.name} must include marker ${shader.marker} in both stages`);
    }
  }

  private assertVariants(shader: ShaderSourcePair): void {
    const seen = new Set<string>();
    for (const variant of shader.variants ?? []) {
      if (!variant.name.trim()) {
        throw new Error(`Shader ${shader.name} has a variant with an empty name`);
      }
      if (seen.has(variant.name)) {
        throw new Error(`Shader variant is already registered: ${shader.name}:${variant.name}`);
      }
      seen.add(variant.name);
    }
  }
}

function variantCacheKey(name: string, variantName: string, options: ShaderPreprocessOptions): string {
  return JSON.stringify({
    name,
    variantName,
    defines: Object.entries(options.defines ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    includes: [...(options.includes ?? new Map()).entries()].sort(([left], [right]) => left.localeCompare(right))
  });
}

export const DEFAULT_UNLIT_SHADER_NAME = "galileo3d/unlit";
export const DEFAULT_UNLIT_SHADER_MARKER = "@galileo3d-shader:unlit-v1";
export const DEFAULT_INSTANCED_UNLIT_SHADER_NAME = "galileo3d/instanced-unlit";
export const DEFAULT_INSTANCED_UNLIT_SHADER_MARKER = "@galileo3d-shader:instanced-unlit-v1";
export const DEFAULT_INSTANCED_PBR_SHADER_NAME = "galileo3d/instanced-pbr";
export const DEFAULT_INSTANCED_PBR_SHADER_MARKER = "@galileo3d-shader:instanced-pbr-v1";
export const DEFAULT_TEXTURED_UNLIT_SHADER_NAME = "galileo3d/textured-unlit";
export const DEFAULT_TEXTURED_UNLIT_SHADER_MARKER = "@galileo3d-shader:textured-unlit-v1";
export const DEFAULT_SKINNED_UNLIT_SHADER_NAME = "galileo3d/skinned-unlit";
export const DEFAULT_SKINNED_UNLIT_SHADER_MARKER = "@galileo3d-shader:skinned-unlit-v1";
export const DEFAULT_SKINNED_LIT_SHADER_NAME = "galileo3d/skinned-lit";
export const DEFAULT_SKINNED_LIT_SHADER_MARKER = "@galileo3d-shader:skinned-lit-v1";
export const DEFAULT_MORPH_UNLIT_SHADER_NAME = "galileo3d/morph-unlit";
export const DEFAULT_MORPH_UNLIT_SHADER_MARKER = "@galileo3d-shader:morph-unlit-v1";
export const DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME = "galileo3d/pbr-normal-map";
export const DEFAULT_NORMAL_MAPPED_PBR_SHADER_MARKER = "@galileo3d-shader:pbr-normal-map-v1";
export const DEFAULT_TEXTURED_PBR_SHADER_NAME = "galileo3d/pbr-textured";
export const DEFAULT_TEXTURED_PBR_SHADER_MARKER = "@galileo3d-shader:pbr-textured-v1";
export const DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT = "clearcoat-textures";
export const DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT = "transmission-volume-textures";
export const DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT = "specular-sheen-anisotropy-textures";
export const DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT = "iridescence-textures";
export const DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT = "clearcoat-transmission-volume-textures";
export const DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT = "specular-sheen-anisotropy-iridescence-textures";
export const DEFAULT_DEPTH_SHADER_NAME = "galileo3d/depth";
export const DEFAULT_DEPTH_SHADER_MARKER = "@galileo3d-shader:depth-v1";
export const DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_NAME = "galileo3d/environment-background";
export const DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_MARKER = "@galileo3d-shader:environment-background-v1";

export function createDefaultShaderLibrary(): ShaderLibrary {
  const library = new ShaderLibrary();
  validateShaderChunks();
  for (const chunk of SHADER_CHUNKS) {
    library.registerChunk(chunk.name, chunk.source);
  }
  library.register({
    name: DEFAULT_UNLIT_SHADER_NAME,
    marker: DEFAULT_UNLIT_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_UNLIT_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 4) in vec4 a_color;
uniform mat4 u_modelViewProjection;
uniform float u_pointSize;
out vec4 v_vertexColor;
void main() {
  v_vertexColor = a_color;
  gl_PointSize = max(u_pointSize, 1.0);
  gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
}
`,
    fragment: `#version 300 es
// ${DEFAULT_UNLIT_SHADER_MARKER}
precision highp float;
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
uniform float u_roundPoints;
in vec4 v_vertexColor;
out vec4 outColor;
void main() {
  if (u_roundPoints > 0.5) {
    vec2 pointUv = gl_PointCoord * 2.0 - 1.0;
    float radius = dot(pointUv, pointUv);
    if (radius > 1.0) discard;
  }
  vec4 base = u_baseColor * v_vertexColor;
  if (base.a < u_alphaCutoff) discard;
  outColor = base;
}
`
  });
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
  library.register({
    name: DEFAULT_PBR_SHADER_NAME,
    marker: DEFAULT_PBR_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_PBR_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 4) in vec4 a_color;
uniform mat4 u_modelViewProjection;
uniform mat4 u_modelMatrix;
uniform mat4 u_normalMatrix;
out vec3 v_normal;
out vec3 v_worldPosition;
out vec4 v_vertexColor;
void main() {
  v_normal = mat3(u_normalMatrix) * a_normal;
  v_worldPosition = (u_modelMatrix * vec4(a_position, 1.0)).xyz;
  v_vertexColor = a_color;
  gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
}
`,
    fragment: `#version 300 es
// ${DEFAULT_PBR_SHADER_MARKER}
precision highp float;
#include <lighting_common>
#include <pbr_common>
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_environmentColor;
uniform float u_environmentIntensity;
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
uniform vec4 u_lightData[64];
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
uniform float u_outputColorSpace;
uniform vec3 u_cameraPosition;
uniform float u_environmentFogEnabled;
uniform float u_environmentFogMode;
uniform vec3 u_environmentFogColor;
uniform float u_environmentFogNear;
uniform float u_environmentFogFar;
uniform float u_environmentFogDensity;
uniform float u_environmentFogHeightFalloff;
uniform float u_environmentFogHeightReference;
uniform float u_environmentFogMaxOpacity;
in vec3 v_normal;
in vec3 v_worldPosition;
in vec4 v_vertexColor;
out vec4 outColor;
#include <environment_fog_common>
vec2 g3dEnvironmentEquirectUv(vec3 direction, float rotation) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / 6.28318530718 + 0.5 + rotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 g3dEnvironmentCubeDirection(vec3 direction, float rotation) {
  float angle = rotation * 6.28318530718;
  float c = cos(angle);
  float s = sin(angle);
  vec3 d = normalize(direction);
  return normalize(vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
vec3 g3dPbrDecodeEnvironmentSrgb(vec3 encodedColor) {
  return max(encodedColor, vec3(0.0));
}
vec3 g3dPbrDecodeEnvironmentRgbe(vec4 encodedSample) {
  float exponent = encodedSample.a * 255.0;
  float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
  return max(encodedSample.rgb * scale, vec3(0.0));
}
vec3 g3dPbrDecodeEnvironmentSample(vec4 encodedSample) {
  if (u_environmentMapTextureEncoding > 1.5) return max(encodedSample.rgb, vec3(0.0));
  if (u_environmentMapTextureEncoding > 0.5) return g3dPbrDecodeEnvironmentRgbe(encodedSample);
  return g3dPbrDecodeEnvironmentSrgb(encodedSample.rgb);
}
vec4 g3dPbrEnvironmentSampleRaw(vec3 direction, float lod) {
  vec4 equirectSample = textureLod(u_environmentMapTexture, g3dEnvironmentEquirectUv(direction, u_environmentMapTextureRotation), lod);
  vec4 cubeSample = textureLod(u_environmentCubeMapTexture, g3dEnvironmentCubeDirection(direction, u_environmentMapTextureRotation), lod);
  return mix(equirectSample, cubeSample, step(0.5, u_environmentCubeMapTextureEnabled));
}
vec3 g3dPbrBoxProjectedDirection(vec3 worldPosition, vec3 direction, vec3 boxMin, vec3 boxMax) {
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
float g3dForwardShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_shadowMapEnabled < 0.5) return 1.0;
  vec4 lightPosition = u_shadowMapMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeReceiverBias = (1.0 - normalDotLight) * u_shadowMapSlopeBias * max(u_shadowMapTexelSize.x, u_shadowMapTexelSize.y);
  float receiverDepth = projected.z * 0.5 + 0.5 - u_shadowMapBias - slopeReceiverBias;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_shadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_shadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_shadowMapTexelSize;
    float storedDepth = texture(u_shadowMapTexture, uv + offset).r;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_shadowMapStrength, 0.0, 1.0));
}
float g3dPointShadowFaceIndex(vec3 direction) {
  vec3 absoluteDirection = abs(direction);
  if (absoluteDirection.x >= absoluteDirection.y && absoluteDirection.x >= absoluteDirection.z) return direction.x >= 0.0 ? 0.0 : 1.0;
  if (absoluteDirection.y >= absoluteDirection.x && absoluteDirection.y >= absoluteDirection.z) return direction.y >= 0.0 ? 2.0 : 3.0;
  return direction.z >= 0.0 ? 4.0 : 5.0;
}
float g3dPointShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_pointShadowMapEnabled < 0.5) return 1.0;
  vec3 lightToFragment = worldPosition - u_pointShadowLightPosition;
  float distanceToLight = length(lightToFragment);
  if (distanceToLight > u_pointShadowRange) return 1.0;
  int faceIndex = int(g3dPointShadowFaceIndex(lightToFragment));
  vec4 lightPosition = u_pointShadowFaceMatrices[faceIndex] * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 localUv = projected.xy * 0.5 + 0.5;
  if (localUv.x < 0.0 || localUv.x > 1.0 || localUv.y < 0.0 || localUv.y > 1.0) return 1.0;
  vec4 rect = u_pointShadowFaceRects[faceIndex];
  vec2 uv = rect.xy + localUv * rect.zw;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeReceiverBias = (1.0 - normalDotLight) * u_pointShadowSlopeBias * max(u_pointShadowTexelSize.x, u_pointShadowTexelSize.y);
  float receiverDepth = projected.z * 0.5 + 0.5 - u_pointShadowBias - slopeReceiverBias;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_pointShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_pointShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_pointShadowTexelSize;
    float storedDepth = texture(u_pointShadowMapTexture, uv + offset).r;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_pointShadowStrength, 0.0, 1.0));
}
vec3 g3dPbrEncodeOutput(vec3 linearColor) {
  vec3 color = max(linearColor, vec3(0.0));
  vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
  vec3 srgb = pow(filmic, vec3(1.0 / 2.2));
  return mix(color, srgb, step(0.5, u_outputColorSpace));
}
void main() {
  vec3 normal = normalize(v_normal);
  if (!gl_FrontFacing) normal = -normal;
  vec3 viewDirection = normalize(u_cameraPosition - v_worldPosition);
  vec3 materialBase = g3dApplyAdvancedPbrLobes(
    u_baseColor.rgb * v_vertexColor.rgb,
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
  vec3 environmentDiffuse = mix(ambientEnvironment, proceduralDiffuse * u_environmentMapIntensity, proceduralEnvironmentWeight);
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureIntensity);
  float diffuseEnvironmentLod = max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledDiffuse = g3dPbrDecodeEnvironmentSample(g3dPbrEnvironmentSampleRaw(normal, diffuseEnvironmentLod));
  environmentDiffuse = mix(environmentDiffuse, environmentDiffuse * 0.18 + sampledDiffuse * u_environmentMapTextureIntensity * 0.92, sampledEnvironmentWeight);
  vec3 reflectionDirection = reflect(-viewDirection, normal);
  float roughness = clamp(u_roughness, 0.0, 1.0);
  float reflectionBand = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(18.0, 2.0, roughness));
  float roughEnvironmentFloor = mix(0.04, 0.38, roughness);
  float proceduralSpecularResponse = max(reflectionBand, roughEnvironmentFloor);
  vec3 proceduralSpecular = u_environmentSpecularColor * u_environmentSpecularIntensity * proceduralSpecularResponse * proceduralEnvironmentWeight;
  float environmentLod = roughness * max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledSpecular = g3dPbrDecodeEnvironmentSample(g3dPbrEnvironmentSampleRaw(reflectionDirection, environmentLod));
  float nDotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
  vec2 brdfLut = texture(u_environmentBrdfLutTexture, vec2(nDotV, roughness)).rg;
  sampledSpecular *= u_environmentMapTextureSpecularIntensity * sampledEnvironmentWeight * mix(1.1, 0.85, roughness);
  vec3 shaded = g3dPbrEnvironmentLightSplitSum(
    normal,
    viewDirection,
    environmentDiffuse,
    proceduralSpecular + sampledSpecular,
    mix(vec2(1.0, 0.0), brdfLut, step(0.0001, u_environmentBrdfLutEnabled)),
    materialBase,
    u_metallic,
    u_roughness,
    u_specularFactor,
    u_specularColorFactor
  ) + u_emissiveColor * u_emissiveStrength;
  shaded += g3dPbrExtensionEnvironmentLight(
    normal,
    viewDirection,
    proceduralSpecular + sampledSpecular,
    u_clearcoatFactor,
    u_clearcoatRoughnessFactor,
    u_sheenColorFactor,
    u_sheenRoughnessFactor,
    u_anisotropyStrength,
    u_anisotropyRotation,
    u_iridescenceFactor,
    u_iridescenceIor,
    u_iridescenceThicknessMinimum,
    u_iridescenceThicknessMaximum
  );
  float transmissionAmount = clamp(max(u_transmissionFactor, u_diffuseTransmissionFactor), 0.0, 1.0);
  if (transmissionAmount > 0.0001 && sampledEnvironmentWeight > 0.0001) {
    vec3 refractionDirection = refract(-viewDirection, normal, 1.0 / max(u_ior, 1.0));
    refractionDirection = length(refractionDirection) > 0.0001 ? normalize(refractionDirection) : -reflectionDirection;
    float parallaxStrength = clamp(u_transmissionParallaxStrength, 0.0, 1.0);
    if (parallaxStrength > 0.0001) {
      vec3 parallaxDirection = g3dPbrBoxProjectedDirection(v_worldPosition, refractionDirection, u_transmissionParallaxBoxMin, u_transmissionParallaxBoxMax);
      refractionDirection = normalize(mix(refractionDirection, parallaxDirection, parallaxStrength));
    }
    float bounceCount = clamp(u_transmissionBounceCount, 0.0, 4.0);
    float refractionLod = clamp(roughness + u_volumeThicknessFactor * 0.12 + bounceCount * 0.04 * parallaxStrength, 0.0, 1.0) * max(u_environmentMapTextureMipCount - 1.0, 0.0);
    vec3 refractedEnvironment = g3dPbrDecodeEnvironmentSample(g3dPbrEnvironmentSampleRaw(refractionDirection, refractionLod));
    float volumeTravel = clamp((max(u_volumeThicknessFactor, 0.0) * (1.0 + bounceCount * 0.18 * parallaxStrength)) / max(u_volumeAttenuationDistance, 0.0001), 0.0, 16.0);
    vec3 volumeTint = pow(clamp(u_volumeAttenuationColor, vec3(0.0001), vec3(1.0)), vec3(volumeTravel));
    float causticEnergy = u_transmissionCausticStrength * parallaxStrength * transmissionAmount * pow(1.0 - roughness, 2.0) / (1.0 + bounceCount * 0.35);
    float roughVolumeIorLift = mix(1.0, 1.45, clamp((u_ior - 1.0) / 1.5, 0.0, 1.0) * smoothstep(0.35, 0.95, roughness + u_volumeThicknessFactor * 0.2));
    float fallbackEnvironmentTransmissionEnergy = mix(1.0, clamp(u_transmissionFallbackEnergy, 0.0, 1.0), transmissionAmount);
    vec3 refractionRadiance = (refractedEnvironment + vec3(causticEnergy)) * volumeTint * u_environmentMapTextureIntensity * transmissionAmount * fallbackEnvironmentTransmissionEnergy * mix(0.9, 0.55, roughness) * roughVolumeIorLift;
    shaded = mix(shaded, shaded * 0.72 + refractionRadiance, transmissionAmount * mix(0.08, 0.58, fallbackEnvironmentTransmissionEnergy));
  }
  int count = min(int(u_lightCount), 16);
  for (int i = 0; i < count; ++i) {
    int baseIndex = i * 4;
    vec4 colorIntensity = u_lightData[baseIndex];
    vec4 positionRange = u_lightData[baseIndex + 1];
    vec4 directionKind = u_lightData[baseIndex + 2];
    vec4 spotShadowLayer = u_lightData[baseIndex + 3];
    float kind = directionKind.w;
    vec3 lightDirection = -directionKind.xyz;
    float attenuation = 1.0;
    if (kind > 0.5) {
      vec3 toLight = positionRange.xyz - v_worldPosition;
      float distanceToLight = length(toLight);
      lightDirection = distanceToLight > 0.0001 ? toLight / distanceToLight : -directionKind.xyz;
      float range = max(positionRange.w, 0.0001);
      float rangeFalloff = clamp(1.0 - pow(distanceToLight / range, 4.0), 0.0, 1.0);
      rangeFalloff *= rangeFalloff;
      attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);
    }
    if (kind > 1.5) {
      vec3 lightToFragment = normalize(v_worldPosition - positionRange.xyz);
      float cone = dot(normalize(directionKind.xyz), lightToFragment);
      float outer = cos(spotShadowLayer.x);
      float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    float directLightIntensity = colorIntensity.a * attenuation * mix(1.0, kind > 0.5 && kind < 1.5 ? g3dPointShadowFactor(v_worldPosition, normal, lightDirection) : g3dForwardShadowFactor(v_worldPosition, normal, lightDirection), step(0.5, spotShadowLayer.z));
    shaded += g3dPbrDirectLight(
      normal,
      viewDirection,
      lightDirection,
      colorIntensity.rgb,
      directLightIntensity,
      materialBase,
      u_metallic,
      u_roughness,
      u_specularFactor,
      u_specularColorFactor
    );
    shaded += g3dPbrExtensionDirectLight(
      normal,
      viewDirection,
      lightDirection,
      colorIntensity.rgb,
      directLightIntensity,
      u_clearcoatFactor,
      u_clearcoatRoughnessFactor,
      u_sheenColorFactor,
      u_sheenRoughnessFactor,
      u_anisotropyStrength,
      u_anisotropyRotation,
      u_iridescenceFactor,
      u_iridescenceIor,
      u_iridescenceThicknessMinimum,
      u_iridescenceThicknessMaximum
    );
  }
  float alpha = u_baseColor.a * v_vertexColor.a;
  float transmissionAlpha = clamp(max(u_transmissionFactor, u_diffuseTransmissionFactor), 0.0, 1.0);
  float transmissionCoverage = mix(0.34, 0.08, clamp(u_transmissionFallbackEnergy, 0.0, 1.0));
  alpha = mix(alpha, alpha * transmissionCoverage, transmissionAlpha);
  if (alpha < u_alphaCutoff) discard;
  vec3 fogged = g3dApplyEnvironmentFog(max(shaded, vec3(0.0)), v_worldPosition);
  outColor = vec4(g3dPbrEncodeOutput(fogged), alpha);
}
`
  });
  library.register({
    name: DEFAULT_INSTANCED_PBR_SHADER_NAME,
    marker: DEFAULT_INSTANCED_PBR_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_INSTANCED_PBR_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
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
out vec4 v_instanceColor;
void main() {
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
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_environmentColor;
uniform float u_environmentIntensity;
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
uniform vec4 u_lightData[64];
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
uniform float u_outputColorSpace;
uniform vec3 u_cameraPosition;
uniform float u_environmentFogEnabled;
uniform float u_environmentFogMode;
uniform vec3 u_environmentFogColor;
uniform float u_environmentFogNear;
uniform float u_environmentFogFar;
uniform float u_environmentFogDensity;
uniform float u_environmentFogHeightFalloff;
uniform float u_environmentFogHeightReference;
uniform float u_environmentFogMaxOpacity;
in vec3 v_normal;
in vec3 v_worldPosition;
in vec4 v_instanceColor;
out vec4 outColor;
#include <environment_fog_common>
float g3dForwardShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_shadowMapEnabled < 0.5) return 1.0;
  vec4 lightPosition = u_shadowMapMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeReceiverBias = (1.0 - normalDotLight) * u_shadowMapSlopeBias * max(u_shadowMapTexelSize.x, u_shadowMapTexelSize.y);
  float receiverDepth = projected.z * 0.5 + 0.5 - u_shadowMapBias - slopeReceiverBias;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_shadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_shadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_shadowMapTexelSize;
    float storedDepth = texture(u_shadowMapTexture, uv + offset).r;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_shadowMapStrength, 0.0, 1.0));
}
float g3dPointShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
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
  float receiverDepth = projected.z * 0.5 + 0.5 - u_pointShadowBias - (1.0 - normalDotLight) * u_pointShadowSlopeBias * max(u_pointShadowTexelSize.x, u_pointShadowTexelSize.y);
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_pointShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_pointShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    shadowed += (receiverDepth > texture(u_pointShadowMapTexture, uv + sampleData.xy * u_pointShadowTexelSize).r ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_pointShadowStrength, 0.0, 1.0));
}
vec2 g3dEnvironmentEquirectUv(vec3 direction, float rotation) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / 6.28318530718 + 0.5 + rotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 g3dEnvironmentCubeDirection(vec3 direction, float rotation) {
  float angle = rotation * 6.28318530718;
  float c = cos(angle);
  float s = sin(angle);
  vec3 d = normalize(direction);
  return normalize(vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
vec3 g3dPbrDecodeEnvironmentSrgb(vec3 encodedColor) {
  return max(encodedColor, vec3(0.0));
}
vec3 g3dPbrDecodeEnvironmentRgbe(vec4 encodedSample) {
  float exponent = encodedSample.a * 255.0;
  float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
  return max(encodedSample.rgb * scale, vec3(0.0));
}
vec3 g3dPbrDecodeEnvironmentSample(vec4 encodedSample) {
  if (u_environmentMapTextureEncoding > 1.5) return max(encodedSample.rgb, vec3(0.0));
  if (u_environmentMapTextureEncoding > 0.5) return g3dPbrDecodeEnvironmentRgbe(encodedSample);
  return g3dPbrDecodeEnvironmentSrgb(encodedSample.rgb);
}
vec4 g3dPbrEnvironmentSampleRaw(vec3 direction, float lod) {
  vec4 equirectSample = textureLod(u_environmentMapTexture, g3dEnvironmentEquirectUv(direction, u_environmentMapTextureRotation), lod);
  vec4 cubeSample = textureLod(u_environmentCubeMapTexture, g3dEnvironmentCubeDirection(direction, u_environmentMapTextureRotation), lod);
  return mix(equirectSample, cubeSample, step(0.5, u_environmentCubeMapTextureEnabled));
}
vec3 g3dPbrEnvironmentDiffuseInput(vec3 normal) {
  float environmentHemi = mix(0.35, 1.0, clamp(normal.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 ambientEnvironment = u_environmentColor * u_environmentIntensity * environmentHemi;
  float proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity);
  float skyBlend = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  float horizonBlend = 1.0 - abs(normal.y);
  vec3 proceduralDiffuse = mix(u_environmentGroundColor, u_environmentSkyColor, skyBlend);
  proceduralDiffuse = mix(proceduralDiffuse, u_environmentHorizonColor, clamp(horizonBlend, 0.0, 1.0) * 0.55);
  vec3 environmentDiffuse = mix(ambientEnvironment, proceduralDiffuse * u_environmentMapIntensity, proceduralEnvironmentWeight);
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureIntensity);
  float diffuseEnvironmentLod = max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledDiffuse = g3dPbrDecodeEnvironmentSample(g3dPbrEnvironmentSampleRaw(normal, diffuseEnvironmentLod));
  return mix(environmentDiffuse, environmentDiffuse * 0.18 + sampledDiffuse * u_environmentMapTextureIntensity * 0.92, sampledEnvironmentWeight);
}
vec3 g3dPbrEnvironmentSpecularInput(vec3 normal, vec3 viewDirection, float roughness) {
  float proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity);
  vec3 reflectionDirection = reflect(-viewDirection, normal);
  float clampedRoughness = clamp(roughness, 0.0, 1.0);
  float reflectionBand = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(18.0, 2.0, clampedRoughness));
  float roughEnvironmentFloor = mix(0.04, 0.38, clampedRoughness);
  float proceduralSpecularResponse = max(reflectionBand, roughEnvironmentFloor);
  vec3 proceduralSpecular = u_environmentSpecularColor * u_environmentSpecularIntensity * proceduralSpecularResponse * proceduralEnvironmentWeight;
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureSpecularIntensity);
  float environmentLod = clampedRoughness * max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledSpecular = g3dPbrDecodeEnvironmentSample(g3dPbrEnvironmentSampleRaw(reflectionDirection, environmentLod));
  float nDotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
  vec2 brdfLut = texture(u_environmentBrdfLutTexture, vec2(nDotV, clampedRoughness)).rg;
  sampledSpecular *= u_environmentMapTextureSpecularIntensity * sampledEnvironmentWeight * mix(1.05, 0.82, clampedRoughness);
  return proceduralSpecular + sampledSpecular;
}
vec3 g3dPbrEncodeOutput(vec3 linearColor) {
  vec3 color = max(linearColor, vec3(0.0));
  vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
  vec3 srgb = pow(filmic, vec3(1.0 / 2.2));
  return mix(color, srgb, step(0.5, u_outputColorSpace));
}
void main() {
  vec3 normal = normalize(v_normal);
  if (!gl_FrontFacing) normal = -normal;
  vec3 viewDirection = normalize(u_cameraPosition - v_worldPosition);
  vec3 base = u_baseColor.rgb * v_instanceColor.rgb;
  vec3 shaded = u_emissiveColor * u_emissiveStrength + g3dPbrEnvironmentLight(
    normal,
    viewDirection,
    g3dPbrEnvironmentDiffuseInput(normal),
    g3dPbrEnvironmentSpecularInput(normal, viewDirection, u_roughness),
    base,
    u_metallic,
    u_roughness,
    1.0,
    vec3(1.0)
  );
  int count = min(int(u_lightCount), 16);
  for (int i = 0; i < count; ++i) {
    int baseIndex = i * 4;
    vec4 colorIntensity = u_lightData[baseIndex];
    vec4 positionRange = u_lightData[baseIndex + 1];
    vec4 directionKind = u_lightData[baseIndex + 2];
    vec4 spotShadowLayer = u_lightData[baseIndex + 3];
    float kind = directionKind.w;
    vec3 lightDirection = -directionKind.xyz;
    float attenuation = 1.0;
    if (kind > 0.5) {
      vec3 toLight = positionRange.xyz - v_worldPosition;
      float distanceToLight = length(toLight);
      lightDirection = distanceToLight > 0.0001 ? toLight / distanceToLight : -directionKind.xyz;
      float range = max(positionRange.w, 0.0001);
      float rangeFalloff = clamp(1.0 - pow(distanceToLight / range, 4.0), 0.0, 1.0);
      rangeFalloff *= rangeFalloff;
      attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);
    }
    if (kind > 1.5) {
      vec3 lightToFragment = normalize(v_worldPosition - positionRange.xyz);
      float cone = dot(normalize(directionKind.xyz), lightToFragment);
      float outer = cos(spotShadowLayer.x);
      float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    float shadowFactor = mix(1.0, kind > 0.5 && kind < 1.5 ? g3dPointShadowFactor(v_worldPosition, normal, lightDirection) : g3dForwardShadowFactor(v_worldPosition, normal, lightDirection), step(0.5, spotShadowLayer.z));
    shaded += g3dPbrDirectLight(normal, viewDirection, lightDirection, colorIntensity.rgb, colorIntensity.a * attenuation * shadowFactor, base, u_metallic, u_roughness, 1.0, vec3(1.0));
  }
  float alpha = u_baseColor.a * v_instanceColor.a;
  if (alpha < u_alphaCutoff) discard;
  vec3 fogged = g3dApplyEnvironmentFog(max(shaded, vec3(0.0)), v_worldPosition);
  outColor = vec4(g3dPbrEncodeOutput(fogged), alpha);
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
uniform mat4 u_modelViewProjection;
uniform vec2 u_baseColorTextureOffset;
uniform vec2 u_baseColorTextureScale;
uniform float u_baseColorTextureRotation;
out vec2 v_uv;
out vec4 v_vertexColor;
void main() {
  vec2 scaledUv = a_uv * u_baseColorTextureScale;
  float c = cos(u_baseColorTextureRotation);
  float s = sin(u_baseColorTextureRotation);
  v_uv = vec2(scaledUv.x * c - scaledUv.y * s, scaledUv.x * s + scaledUv.y * c) + u_baseColorTextureOffset;
  v_vertexColor = a_color;
  gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
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
layout(location = 0) in vec3 a_position;
layout(location = 5) in vec4 a_joints;
layout(location = 6) in vec4 a_weights;
uniform mat4 u_modelViewProjection;
uniform mat4 u_jointMatrices[64];
uniform float u_jointCount;
void main() {
  float maxJoint = max(u_jointCount - 1.0, 0.0);
  int jointX = int(clamp(a_joints.x, 0.0, maxJoint));
  int jointY = int(clamp(a_joints.y, 0.0, maxJoint));
  int jointZ = int(clamp(a_joints.z, 0.0, maxJoint));
  int jointW = int(clamp(a_joints.w, 0.0, maxJoint));
  mat4 skin =
    u_jointMatrices[jointX] * a_weights.x +
    u_jointMatrices[jointY] * a_weights.y +
    u_jointMatrices[jointZ] * a_weights.z +
    u_jointMatrices[jointW] * a_weights.w;
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
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_uv;
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
uniform mat4 u_jointMatrices[64];
uniform float u_jointCount;
out vec3 v_normal;
out vec4 v_tangent;
out vec3 v_worldPosition;
out vec2 v_uv;
out vec4 v_vertexColor;
out float v_weightSum;
void main() {
  vec2 scaledUv = a_uv * u_baseColorTextureScale;
  float c = cos(u_baseColorTextureRotation);
  float s = sin(u_baseColorTextureRotation);
  v_uv = vec2(scaledUv.x * c - scaledUv.y * s, scaledUv.x * s + scaledUv.y * c) + u_baseColorTextureOffset;
  v_vertexColor = a_color;
  float maxJoint = max(u_jointCount - 1.0, 0.0);
  int jointX = int(clamp(a_joints.x, 0.0, maxJoint));
  int jointY = int(clamp(a_joints.y, 0.0, maxJoint));
  int jointZ = int(clamp(a_joints.z, 0.0, maxJoint));
  int jointW = int(clamp(a_joints.w, 0.0, maxJoint));
  mat4 skin =
    u_jointMatrices[jointX] * a_weights.x +
    u_jointMatrices[jointY] * a_weights.y +
    u_jointMatrices[jointZ] * a_weights.z +
    u_jointMatrices[jointW] * a_weights.w;
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
uniform vec4 u_baseColor;
uniform sampler2D u_baseColorTexture;
uniform float u_baseColorTextureEnabled;
uniform sampler2D u_normalTexture;
uniform float u_normalTextureEnabled;
uniform float u_normalScale;
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
uniform vec4 u_lightData[64];
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
uniform float u_outputColorSpace;
uniform vec3 u_cameraPosition;
uniform float u_environmentFogEnabled;
uniform float u_environmentFogMode;
uniform vec3 u_environmentFogColor;
uniform float u_environmentFogNear;
uniform float u_environmentFogFar;
uniform float u_environmentFogDensity;
uniform float u_environmentFogHeightFalloff;
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
vec2 g3dEnvironmentEquirectUv(vec3 direction, float rotation) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / 6.28318530718 + 0.5 + rotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 g3dEnvironmentCubeDirection(vec3 direction, float rotation) {
  float angle = rotation * 6.28318530718;
  float c = cos(angle);
  float s = sin(angle);
  vec3 d = normalize(direction);
  return normalize(vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
vec3 g3dPbrDecodeEnvironmentSrgb(vec3 encodedColor) {
  return max(encodedColor, vec3(0.0));
}
vec3 g3dPbrDecodeEnvironmentRgbe(vec4 encodedSample) {
  float exponent = encodedSample.a * 255.0;
  float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
  return max(encodedSample.rgb * scale, vec3(0.0));
}
vec3 g3dPbrDecodeEnvironmentSample(vec4 encodedSample) {
  if (u_environmentMapTextureEncoding > 1.5) return max(encodedSample.rgb, vec3(0.0));
  if (u_environmentMapTextureEncoding > 0.5) return g3dPbrDecodeEnvironmentRgbe(encodedSample);
  return g3dPbrDecodeEnvironmentSrgb(encodedSample.rgb);
}
vec4 g3dPbrEnvironmentSampleRaw(vec3 direction, float lod) {
  vec4 equirectSample = textureLod(u_environmentMapTexture, g3dEnvironmentEquirectUv(direction, u_environmentMapTextureRotation), lod);
  vec4 cubeSample = textureLod(u_environmentCubeMapTexture, g3dEnvironmentCubeDirection(direction, u_environmentMapTextureRotation), lod);
  return mix(equirectSample, cubeSample, step(0.5, u_environmentCubeMapTextureEnabled));
}
vec3 g3dSkinnedPbrNormal(vec3 baseNormal, vec4 tangentFrame, vec2 uv) {
  vec3 sampled = texture(u_normalTexture, uv).xyz * 2.0 - 1.0;
  vec3 n = normalize(baseNormal);
  vec3 tangent = normalize(tangentFrame.xyz);
  vec3 bitangent = normalize(cross(n, tangent) * tangentFrame.w);
  return normalize(tangent * sampled.x * u_normalScale + bitangent * sampled.y * u_normalScale + n * max(sampled.z, 0.001));
}
float g3dForwardShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_shadowMapEnabled < 0.5) return 1.0;
  vec4 lightPosition = u_shadowMapMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeReceiverBias = (1.0 - normalDotLight) * u_shadowMapSlopeBias * max(u_shadowMapTexelSize.x, u_shadowMapTexelSize.y);
  float receiverDepth = projected.z * 0.5 + 0.5 - u_shadowMapBias - slopeReceiverBias;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_shadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_shadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_shadowMapTexelSize;
    float storedDepth = texture(u_shadowMapTexture, uv + offset).r;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_shadowMapStrength, 0.0, 1.0));
}
float g3dPointShadowFaceIndex(vec3 direction) {
  vec3 absoluteDirection = abs(direction);
  if (absoluteDirection.x >= absoluteDirection.y && absoluteDirection.x >= absoluteDirection.z) return direction.x >= 0.0 ? 0.0 : 1.0;
  if (absoluteDirection.y >= absoluteDirection.x && absoluteDirection.y >= absoluteDirection.z) return direction.y >= 0.0 ? 2.0 : 3.0;
  return direction.z >= 0.0 ? 4.0 : 5.0;
}
float g3dPointShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_pointShadowMapEnabled < 0.5) return 1.0;
  vec3 lightToFragment = worldPosition - u_pointShadowLightPosition;
  float distanceToLight = length(lightToFragment);
  if (distanceToLight > u_pointShadowRange) return 1.0;
  int faceIndex = int(g3dPointShadowFaceIndex(lightToFragment));
  vec4 lightPosition = u_pointShadowFaceMatrices[faceIndex] * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 localUv = projected.xy * 0.5 + 0.5;
  if (localUv.x < 0.0 || localUv.x > 1.0 || localUv.y < 0.0 || localUv.y > 1.0) return 1.0;
  vec4 rect = u_pointShadowFaceRects[faceIndex];
  vec2 uv = rect.xy + localUv * rect.zw;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeReceiverBias = (1.0 - normalDotLight) * u_pointShadowSlopeBias * max(u_pointShadowTexelSize.x, u_pointShadowTexelSize.y);
  float receiverDepth = projected.z * 0.5 + 0.5 - u_pointShadowBias - slopeReceiverBias;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_pointShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_pointShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_pointShadowTexelSize;
    float storedDepth = texture(u_pointShadowMapTexture, uv + offset).r;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_pointShadowStrength, 0.0, 1.0));
}
vec3 g3dPbrEncodeOutput(vec3 linearColor) {
  vec3 color = max(linearColor, vec3(0.0));
  vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
  vec3 srgb = pow(filmic, vec3(1.0 / 2.2));
  return mix(color, srgb, step(0.5, u_outputColorSpace));
}
void main() {
  vec3 normal = normalize(v_normal);
  normal = mix(normal, g3dSkinnedPbrNormal(v_normal, v_tangent, v_uv), step(0.5, u_normalTextureEnabled));
  if (!gl_FrontFacing) normal = -normal;
  vec3 viewDirection = normalize(u_cameraPosition - v_worldPosition);
  vec4 sampledBaseColor = texture(u_baseColorTexture, v_uv);
  vec4 decodedBaseColor = vec4(g3dPbrDecodeEnvironmentSrgb(sampledBaseColor.rgb), sampledBaseColor.a);
  vec4 baseColor = mix(u_baseColor, u_baseColor * decodedBaseColor, step(0.5, u_baseColorTextureEnabled)) * v_vertexColor;
  vec4 metallicRoughnessSample = texture(u_metallicRoughnessTexture, v_uv);
  float metallic = mix(u_metallic, clamp(u_metallic * metallicRoughnessSample.b, 0.0, 1.0), step(0.5, u_metallicRoughnessTextureEnabled));
  float roughness = mix(u_roughness, clamp(u_roughness * metallicRoughnessSample.g, 0.0, 1.0), step(0.5, u_metallicRoughnessTextureEnabled));
  float occlusion = mix(1.0, mix(1.0, texture(u_occlusionTexture, v_uv).r, clamp(u_occlusionStrength, 0.0, 1.0)), step(0.5, u_occlusionTextureEnabled));
  vec3 emissive = u_emissiveColor * u_emissiveStrength + g3dPbrDecodeEnvironmentSrgb(texture(u_emissiveTexture, v_uv).rgb) * step(0.5, u_emissiveTextureEnabled);
  vec3 materialBase = g3dApplyAdvancedPbrLobes(
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
  vec3 environmentDiffuse = mix(ambientEnvironment, proceduralDiffuse * u_environmentMapIntensity, proceduralEnvironmentWeight);
  vec3 reflectionDirection = reflect(-viewDirection, normal);
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureIntensity);
  float diffuseEnvironmentLod = max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledDiffuse = g3dPbrDecodeEnvironmentSample(g3dPbrEnvironmentSampleRaw(normal, diffuseEnvironmentLod));
  float clampedRoughness = clamp(roughness, 0.0, 1.0);
  float reflectionBand = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(18.0, 2.0, clampedRoughness));
  float roughEnvironmentFloor = mix(0.04, 0.38, clampedRoughness);
  float proceduralSpecularResponse = max(reflectionBand, roughEnvironmentFloor);
  vec3 proceduralSpecular = u_environmentSpecularColor * u_environmentSpecularIntensity * proceduralSpecularResponse * proceduralEnvironmentWeight;
  float environmentLod = clampedRoughness * max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledSpecular = g3dPbrDecodeEnvironmentSample(g3dPbrEnvironmentSampleRaw(reflectionDirection, environmentLod));
  float nDotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
  vec2 brdfLut = texture(u_environmentBrdfLutTexture, vec2(nDotV, clampedRoughness)).rg;
  sampledSpecular *= u_environmentMapTextureSpecularIntensity * sampledEnvironmentWeight * mix(1.1, 0.85, roughness);
  vec3 shaded = g3dPbrEnvironmentLightSplitSum(
    normal,
    viewDirection,
    mix(environmentDiffuse, environmentDiffuse * 0.18 + sampledDiffuse * u_environmentMapTextureIntensity * 0.92, sampledEnvironmentWeight),
    proceduralSpecular + sampledSpecular,
    mix(vec2(1.0, 0.0), brdfLut, step(0.0001, u_environmentBrdfLutEnabled)),
    materialBase,
    metallic,
    roughness,
    u_specularFactor,
    u_specularColorFactor
  ) * occlusion + emissive;
  int count = min(int(u_lightCount), 16);
  for (int i = 0; i < count; ++i) {
    int baseIndex = i * 4;
    vec4 colorIntensity = u_lightData[baseIndex];
    vec4 positionRange = u_lightData[baseIndex + 1];
    vec4 directionKind = u_lightData[baseIndex + 2];
    vec4 spotShadowLayer = u_lightData[baseIndex + 3];
    float kind = directionKind.w;
    vec3 lightDirection = -directionKind.xyz;
    float attenuation = 1.0;
    if (kind > 0.5) {
      vec3 toLight = positionRange.xyz - v_worldPosition;
      float distanceToLight = length(toLight);
      lightDirection = distanceToLight > 0.0001 ? toLight / distanceToLight : -directionKind.xyz;
      float range = max(positionRange.w, 0.0001);
      float rangeFalloff = clamp(1.0 - pow(distanceToLight / range, 4.0), 0.0, 1.0);
      rangeFalloff *= rangeFalloff;
      attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);
    }
    if (kind > 1.5) {
      vec3 lightToFragment = normalize(v_worldPosition - positionRange.xyz);
      float cone = dot(normalize(directionKind.xyz), lightToFragment);
      float outer = cos(spotShadowLayer.x);
      float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    shaded += g3dPbrDirectLight(
      normal,
      viewDirection,
      lightDirection,
      colorIntensity.rgb,
      colorIntensity.a * attenuation * mix(1.0, kind > 0.5 && kind < 1.5 ? g3dPointShadowFactor(v_worldPosition, normal, lightDirection) : g3dForwardShadowFactor(v_worldPosition, normal, lightDirection), step(0.5, spotShadowLayer.z)),
      materialBase,
      metallic,
      roughness,
      u_specularFactor,
      u_specularColorFactor
    );
  }
  if (baseColor.a < u_alphaCutoff) discard;
  vec3 fogged = g3dApplyEnvironmentFog(max(shaded, vec3(0.0)), v_worldPosition);
  outColor = vec4(g3dPbrEncodeOutput(fogged), baseColor.a);
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
void main() {
  int morphVertexIndex = clamp(gl_VertexID, 0, 63);
  vec3 morphDelta = vec3(0.0);
  for (int target = 0; target < 4; ++target) {
    if (float(target) < u_morphTargetCount) {
      int morphIndex = target * 64 + morphVertexIndex;
      morphDelta += u_morphPositionDeltas[morphIndex].xyz * u_morphWeights[target];
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
uniform mat4 u_modelViewProjection;
uniform mat4 u_modelMatrix;
uniform mat4 u_normalMatrix;
out vec3 v_normal;
out vec4 v_tangent;
out vec3 v_worldPosition;
out vec2 v_uv;
out vec4 v_vertexColor;
void main() {
  v_normal = mat3(u_normalMatrix) * a_normal;
  v_tangent = vec4(mat3(u_normalMatrix) * a_tangent.xyz, a_tangent.w);
  v_worldPosition = (u_modelMatrix * vec4(a_position, 1.0)).xyz;
  v_uv = a_uv;
  v_vertexColor = a_color;
  gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
}
`,
    fragment: `#version 300 es
// ${DEFAULT_NORMAL_MAPPED_PBR_SHADER_MARKER}
precision highp float;
#include <lighting_common>
#include <pbr_common>
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_environmentColor;
uniform float u_environmentIntensity;
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
uniform vec4 u_lightData[64];
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
uniform float u_outputColorSpace;
uniform vec3 u_cameraPosition;
uniform float u_environmentFogEnabled;
uniform float u_environmentFogMode;
uniform vec3 u_environmentFogColor;
uniform float u_environmentFogNear;
uniform float u_environmentFogFar;
uniform float u_environmentFogDensity;
uniform float u_environmentFogHeightFalloff;
uniform float u_environmentFogHeightReference;
uniform float u_environmentFogMaxOpacity;
in vec3 v_normal;
in vec4 v_tangent;
in vec3 v_worldPosition;
in vec2 v_uv;
in vec4 v_vertexColor;
out vec4 outColor;
#include <environment_fog_common>
vec3 g3dNormalMappedNormal(vec3 baseNormal, vec4 tangentFrame, vec2 uv) {
  vec3 sampled = texture(u_normalTexture, uv).xyz * 2.0 - 1.0;
  vec3 n = normalize(baseNormal);
  vec3 tangent = normalize(tangentFrame.xyz);
  vec3 bitangent = normalize(cross(n, tangent) * tangentFrame.w);
  return normalize(tangent * sampled.x * u_normalScale + bitangent * sampled.y * u_normalScale + n * max(sampled.z, 0.001));
}
float g3dForwardShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_shadowMapEnabled < 0.5) return 1.0;
  vec4 lightPosition = u_shadowMapMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeReceiverBias = (1.0 - normalDotLight) * u_shadowMapSlopeBias * max(u_shadowMapTexelSize.x, u_shadowMapTexelSize.y);
  float receiverDepth = projected.z * 0.5 + 0.5 - u_shadowMapBias - slopeReceiverBias;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_shadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_shadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_shadowMapTexelSize;
    float storedDepth = texture(u_shadowMapTexture, uv + offset).r;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_shadowMapStrength, 0.0, 1.0));
}
float g3dPointShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
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
  float receiverDepth = projected.z * 0.5 + 0.5 - u_pointShadowBias - (1.0 - normalDotLight) * u_pointShadowSlopeBias * max(u_pointShadowTexelSize.x, u_pointShadowTexelSize.y);
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_pointShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_pointShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    shadowed += (receiverDepth > texture(u_pointShadowMapTexture, uv + sampleData.xy * u_pointShadowTexelSize).r ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_pointShadowStrength, 0.0, 1.0));
}
vec2 g3dEnvironmentEquirectUv(vec3 direction, float rotation) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / 6.28318530718 + 0.5 + rotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 g3dEnvironmentCubeDirection(vec3 direction, float rotation) {
  float angle = rotation * 6.28318530718;
  float c = cos(angle);
  float s = sin(angle);
  vec3 d = normalize(direction);
  return normalize(vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
vec3 g3dPbrDecodeEnvironmentSrgb(vec3 encodedColor) {
  return max(encodedColor, vec3(0.0));
}
vec3 g3dPbrDecodeEnvironmentRgbe(vec4 encodedSample) {
  float exponent = encodedSample.a * 255.0;
  float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
  return max(encodedSample.rgb * scale, vec3(0.0));
}
vec3 g3dPbrDecodeEnvironmentSample(vec4 encodedSample) {
  if (u_environmentMapTextureEncoding > 1.5) return max(encodedSample.rgb, vec3(0.0));
  if (u_environmentMapTextureEncoding > 0.5) return g3dPbrDecodeEnvironmentRgbe(encodedSample);
  return g3dPbrDecodeEnvironmentSrgb(encodedSample.rgb);
}
vec4 g3dPbrEnvironmentSampleRaw(vec3 direction, float lod) {
  vec4 equirectSample = textureLod(u_environmentMapTexture, g3dEnvironmentEquirectUv(direction, u_environmentMapTextureRotation), lod);
  vec4 cubeSample = textureLod(u_environmentCubeMapTexture, g3dEnvironmentCubeDirection(direction, u_environmentMapTextureRotation), lod);
  return mix(equirectSample, cubeSample, step(0.5, u_environmentCubeMapTextureEnabled));
}
vec3 g3dPbrEnvironmentDiffuseInput(vec3 normal) {
  float environmentHemi = mix(0.35, 1.0, clamp(normal.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 ambientEnvironment = u_environmentColor * u_environmentIntensity * environmentHemi;
  float proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity);
  float skyBlend = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  float horizonBlend = 1.0 - abs(normal.y);
  vec3 proceduralDiffuse = mix(u_environmentGroundColor, u_environmentSkyColor, skyBlend);
  proceduralDiffuse = mix(proceduralDiffuse, u_environmentHorizonColor, clamp(horizonBlend, 0.0, 1.0) * 0.55);
  vec3 environmentDiffuse = mix(ambientEnvironment, proceduralDiffuse * u_environmentMapIntensity, proceduralEnvironmentWeight);
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureIntensity);
  float diffuseEnvironmentLod = max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledDiffuse = g3dPbrDecodeEnvironmentSample(g3dPbrEnvironmentSampleRaw(normal, diffuseEnvironmentLod));
  return mix(environmentDiffuse, environmentDiffuse * 0.18 + sampledDiffuse * u_environmentMapTextureIntensity * 0.92, sampledEnvironmentWeight);
}
vec3 g3dPbrEnvironmentSpecularInput(vec3 normal, vec3 viewDirection, float roughness) {
  float proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity);
  vec3 reflectionDirection = reflect(-viewDirection, normal);
  float clampedRoughness = clamp(roughness, 0.0, 1.0);
  float reflectionBand = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(18.0, 2.0, clampedRoughness));
  float roughEnvironmentFloor = mix(0.04, 0.38, clampedRoughness);
  float proceduralSpecularResponse = max(reflectionBand, roughEnvironmentFloor);
  vec3 proceduralSpecular = u_environmentSpecularColor * u_environmentSpecularIntensity * proceduralSpecularResponse * proceduralEnvironmentWeight;
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureSpecularIntensity);
  float environmentLod = clampedRoughness * max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledSpecular = g3dPbrDecodeEnvironmentSample(g3dPbrEnvironmentSampleRaw(reflectionDirection, environmentLod));
  float nDotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
  vec2 brdfLut = texture(u_environmentBrdfLutTexture, vec2(nDotV, clampedRoughness)).rg;
  sampledSpecular *= u_environmentMapTextureSpecularIntensity * sampledEnvironmentWeight * mix(1.05, 0.82, clampedRoughness);
  return proceduralSpecular + sampledSpecular;
}
vec3 g3dPbrEncodeOutput(vec3 linearColor) {
  vec3 color = max(linearColor, vec3(0.0));
  vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
  vec3 srgb = pow(filmic, vec3(1.0 / 2.2));
  return mix(color, srgb, step(0.5, u_outputColorSpace));
}
void main() {
  vec3 mappedNormal = g3dNormalMappedNormal(v_normal, v_tangent, v_uv);
  if (!gl_FrontFacing) mappedNormal = -mappedNormal;
  vec3 viewDirection = normalize(u_cameraPosition - v_worldPosition);
  vec3 materialBase = u_baseColor.rgb * v_vertexColor.rgb;
  vec3 shaded = u_emissiveColor * u_emissiveStrength + g3dPbrEnvironmentLight(
    mappedNormal,
    viewDirection,
    g3dPbrEnvironmentDiffuseInput(mappedNormal),
    g3dPbrEnvironmentSpecularInput(mappedNormal, viewDirection, u_roughness),
    materialBase,
    u_metallic,
    u_roughness,
    u_specularFactor,
    u_specularColorFactor
  );
  int count = min(int(u_lightCount), 16);
  for (int i = 0; i < count; ++i) {
    int baseIndex = i * 4;
    vec4 colorIntensity = u_lightData[baseIndex];
    vec4 positionRange = u_lightData[baseIndex + 1];
    vec4 directionKind = u_lightData[baseIndex + 2];
    vec4 spotShadowLayer = u_lightData[baseIndex + 3];
    float kind = directionKind.w;
    vec3 lightDirection = -directionKind.xyz;
    float attenuation = 1.0;
    if (kind > 0.5) {
      vec3 toLight = positionRange.xyz - v_worldPosition;
      float distanceToLight = length(toLight);
      lightDirection = distanceToLight > 0.0001 ? toLight / distanceToLight : -directionKind.xyz;
      float range = max(positionRange.w, 0.0001);
      float rangeFalloff = clamp(1.0 - pow(distanceToLight / range, 4.0), 0.0, 1.0);
      rangeFalloff *= rangeFalloff;
      attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);
    }
    if (kind > 1.5) {
      vec3 lightToFragment = normalize(v_worldPosition - positionRange.xyz);
      float cone = dot(normalize(directionKind.xyz), lightToFragment);
      float outer = cos(spotShadowLayer.x);
      float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    float shadowFactor = mix(1.0, kind > 0.5 && kind < 1.5 ? g3dPointShadowFactor(v_worldPosition, mappedNormal, lightDirection) : g3dForwardShadowFactor(v_worldPosition, mappedNormal, lightDirection), step(0.5, spotShadowLayer.z));
    shaded += g3dPbrDirectLight(mappedNormal, viewDirection, lightDirection, colorIntensity.rgb, colorIntensity.a * attenuation * shadowFactor, materialBase, u_metallic, u_roughness, u_specularFactor, u_specularColorFactor);
  }
  float alpha = u_baseColor.a * v_vertexColor.a;
  if (alpha < u_alphaCutoff) discard;
  vec3 fogged = g3dApplyEnvironmentFog(max(shaded, vec3(0.0)), v_worldPosition);
  outColor = vec4(g3dPbrEncodeOutput(fogged), alpha);
}
`
  });
  library.register({
    name: DEFAULT_TEXTURED_PBR_SHADER_NAME,
    marker: DEFAULT_TEXTURED_PBR_SHADER_MARKER,
    variants: [
      { name: DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT, defines: { G3D_PBR_CLEARCOAT_TEXTURES: true, G3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true } },
      { name: DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT, defines: { G3D_PBR_TRANSMISSION_VOLUME_TEXTURES: true, G3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true } },
      { name: DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT, defines: { G3D_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES: true, G3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true } },
      { name: DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT, defines: { G3D_PBR_IRIDESCENCE_TEXTURES: true, G3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true } },
      { name: DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT, defines: { G3D_PBR_CLEARCOAT_TEXTURES: true, G3D_PBR_TRANSMISSION_VOLUME_TEXTURES: true, G3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true } },
      { name: DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT, defines: { G3D_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES: true, G3D_PBR_IRIDESCENCE_TEXTURES: true, G3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true } }
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
uniform mat4 u_modelViewProjection;
uniform mat4 u_modelMatrix;
uniform mat4 u_normalMatrix;
out vec3 v_normal;
out vec4 v_tangent;
out vec3 v_worldPosition;
out vec2 v_uv;
out vec2 v_uv1;
out vec4 v_vertexColor;
void main() {
  v_uv = a_uv;
  v_uv1 = a_uv1;
  v_normal = mat3(u_normalMatrix) * a_normal;
  v_tangent = vec4(mat3(u_normalMatrix) * a_tangent.xyz, a_tangent.w);
  v_worldPosition = (u_modelMatrix * vec4(a_position, 1.0)).xyz;
  v_vertexColor = a_color;
  gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
}
`,
    fragment: `#version 300 es
// ${DEFAULT_TEXTURED_PBR_SHADER_MARKER}
precision highp float;
#include <lighting_common>
#include <pbr_common>
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_environmentColor;
uniform float u_environmentIntensity;
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
#ifndef G3D_PBR_DISABLE_TRANSMISSION_BACKDROP
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
uniform vec4 u_lightData[64];
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
uniform sampler2D u_baseColorTexture;
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
uniform vec2 u_emissiveTextureOffset;
uniform vec2 u_emissiveTextureScale;
uniform float u_emissiveTextureRotation;
uniform float u_emissiveTextureTexCoord;
uniform vec2 u_emissiveTextureWrap;
uniform sampler2D u_metallicRoughnessTexture;
uniform vec2 u_metallicRoughnessTextureOffset;
uniform vec2 u_metallicRoughnessTextureScale;
uniform float u_metallicRoughnessTextureRotation;
uniform float u_metallicRoughnessTextureTexCoord;
uniform vec2 u_metallicRoughnessTextureWrap;
uniform sampler2D u_occlusionTexture;
uniform vec2 u_occlusionTextureOffset;
uniform vec2 u_occlusionTextureScale;
uniform float u_occlusionTextureRotation;
uniform float u_occlusionTextureTexCoord;
uniform vec2 u_occlusionTextureWrap;
uniform float u_occlusionStrength;
uniform float u_clearcoatNormalScale;
#ifdef G3D_PBR_CLEARCOAT_TEXTURES
uniform sampler2D u_clearcoatTexture;
uniform vec2 u_clearcoatTextureOffset;
uniform vec2 u_clearcoatTextureScale;
uniform float u_clearcoatTextureRotation;
uniform float u_clearcoatTextureTexCoord;
uniform vec2 u_clearcoatTextureWrap;
uniform sampler2D u_clearcoatRoughnessTexture;
uniform vec2 u_clearcoatRoughnessTextureOffset;
uniform vec2 u_clearcoatRoughnessTextureScale;
uniform float u_clearcoatRoughnessTextureRotation;
uniform float u_clearcoatRoughnessTextureTexCoord;
uniform vec2 u_clearcoatRoughnessTextureWrap;
uniform sampler2D u_clearcoatNormalTexture;
uniform vec2 u_clearcoatNormalTextureOffset;
uniform vec2 u_clearcoatNormalTextureScale;
uniform float u_clearcoatNormalTextureRotation;
uniform float u_clearcoatNormalTextureTexCoord;
uniform vec2 u_clearcoatNormalTextureWrap;
#endif
#ifdef G3D_PBR_TRANSMISSION_VOLUME_TEXTURES
uniform sampler2D u_transmissionTexture;
uniform vec2 u_transmissionTextureOffset;
uniform vec2 u_transmissionTextureScale;
uniform float u_transmissionTextureRotation;
uniform float u_transmissionTextureTexCoord;
uniform vec2 u_transmissionTextureWrap;
uniform sampler2D u_diffuseTransmissionTexture;
uniform vec2 u_diffuseTransmissionTextureOffset;
uniform vec2 u_diffuseTransmissionTextureScale;
uniform float u_diffuseTransmissionTextureRotation;
uniform float u_diffuseTransmissionTextureTexCoord;
uniform vec2 u_diffuseTransmissionTextureWrap;
uniform sampler2D u_diffuseTransmissionColorTexture;
uniform vec2 u_diffuseTransmissionColorTextureOffset;
uniform vec2 u_diffuseTransmissionColorTextureScale;
uniform float u_diffuseTransmissionColorTextureRotation;
uniform float u_diffuseTransmissionColorTextureTexCoord;
uniform vec2 u_diffuseTransmissionColorTextureWrap;
uniform sampler2D u_volumeThicknessTexture;
uniform vec2 u_volumeThicknessTextureOffset;
uniform vec2 u_volumeThicknessTextureScale;
uniform float u_volumeThicknessTextureRotation;
uniform float u_volumeThicknessTextureTexCoord;
uniform vec2 u_volumeThicknessTextureWrap;
#endif
#ifdef G3D_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES
uniform sampler2D u_specularTexture;
uniform vec2 u_specularTextureOffset;
uniform vec2 u_specularTextureScale;
uniform float u_specularTextureRotation;
uniform float u_specularTextureTexCoord;
uniform vec2 u_specularTextureWrap;
uniform sampler2D u_specularColorTexture;
uniform vec2 u_specularColorTextureOffset;
uniform vec2 u_specularColorTextureScale;
uniform float u_specularColorTextureRotation;
uniform float u_specularColorTextureTexCoord;
uniform vec2 u_specularColorTextureWrap;
uniform sampler2D u_sheenColorTexture;
uniform vec2 u_sheenColorTextureOffset;
uniform vec2 u_sheenColorTextureScale;
uniform float u_sheenColorTextureRotation;
uniform float u_sheenColorTextureTexCoord;
uniform vec2 u_sheenColorTextureWrap;
uniform sampler2D u_sheenRoughnessTexture;
uniform vec2 u_sheenRoughnessTextureOffset;
uniform vec2 u_sheenRoughnessTextureScale;
uniform float u_sheenRoughnessTextureRotation;
uniform float u_sheenRoughnessTextureTexCoord;
uniform vec2 u_sheenRoughnessTextureWrap;
uniform sampler2D u_anisotropyTexture;
uniform vec2 u_anisotropyTextureOffset;
uniform vec2 u_anisotropyTextureScale;
uniform float u_anisotropyTextureRotation;
uniform float u_anisotropyTextureTexCoord;
uniform vec2 u_anisotropyTextureWrap;
#endif
#ifdef G3D_PBR_IRIDESCENCE_TEXTURES
uniform sampler2D u_iridescenceTexture;
uniform vec2 u_iridescenceTextureOffset;
uniform vec2 u_iridescenceTextureScale;
uniform float u_iridescenceTextureRotation;
uniform float u_iridescenceTextureTexCoord;
uniform vec2 u_iridescenceTextureWrap;
uniform sampler2D u_iridescenceThicknessTexture;
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
vec2 g3dTexturedPbrSelectUv(float texCoord) {
  return texCoord > 0.5 ? v_uv1 : v_uv;
}
vec2 g3dTexturedPbrUv(float texCoord, vec2 offset, vec2 scale, float rotation) {
  vec2 uv = g3dTexturedPbrSelectUv(texCoord);
  vec2 scaledUv = uv * scale;
  float c = cos(rotation);
  float s = sin(rotation);
  return vec2(scaledUv.x * c - scaledUv.y * s, scaledUv.x * s + scaledUv.y * c) + offset;
}
float g3dTexturedPbrWrapCoordinate(float value, float mode) {
  if (mode > 1.5) {
    float repeated = mod(value, 2.0);
    return repeated <= 1.0 ? repeated : 2.0 - repeated;
  }
  if (mode > 0.5) return fract(value);
  return clamp(value, 0.0, 1.0);
}
vec2 g3dTexturedPbrWrapUv(vec2 uv, vec2 wrapMode) {
  return vec2(
    g3dTexturedPbrWrapCoordinate(uv.x, wrapMode.x),
    g3dTexturedPbrWrapCoordinate(uv.y, wrapMode.y)
  );
}
vec3 g3dTexturedPbrEncodeOutput(vec3 linearColor) {
  vec3 color = max(linearColor, vec3(0.0));
  vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
  vec3 srgb = pow(filmic, vec3(1.0 / 2.2));
  return mix(color, srgb, step(0.5, u_outputColorSpace));
}
vec3 g3dTexturedPbrDecodeSrgb(vec3 encodedColor) {
  return max(encodedColor, vec3(0.0));
}
vec3 g3dTexturedPbrDecodeEnvironmentRgbe(vec4 encodedSample) {
  float exponent = encodedSample.a * 255.0;
  float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
  return max(encodedSample.rgb * scale, vec3(0.0));
}
vec3 g3dTexturedPbrDecodeEnvironmentSample(vec4 encodedSample) {
  if (u_environmentMapTextureEncoding > 1.5) return max(encodedSample.rgb, vec3(0.0));
  if (u_environmentMapTextureEncoding > 0.5) return g3dTexturedPbrDecodeEnvironmentRgbe(encodedSample);
  return g3dTexturedPbrDecodeSrgb(encodedSample.rgb);
}
vec3 g3dTexturedPbrApplyNormalSample(vec3 baseNormal, vec4 tangentFrame, vec3 sampled, float scale) {
  vec3 n = normalize(baseNormal);
  vec3 tangent = normalize(tangentFrame.xyz);
  vec3 bitangent = normalize(cross(n, tangent) * tangentFrame.w);
  return normalize(tangent * sampled.x * scale + bitangent * sampled.y * scale + n * max(sampled.z, 0.001));
}
vec3 g3dTexturedPbrNormal(vec3 baseNormal, vec4 tangentFrame, vec2 uv) {
  vec3 sampled = texture(u_normalTexture, uv).xyz * 2.0 - 1.0;
  return g3dTexturedPbrApplyNormalSample(baseNormal, tangentFrame, sampled, u_normalScale);
}
float g3dTexturedPbrShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_shadowMapEnabled < 0.5) return 1.0;
  vec4 lightPosition = u_shadowMapMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeReceiverBias = (1.0 - normalDotLight) * u_shadowMapSlopeBias * max(u_shadowMapTexelSize.x, u_shadowMapTexelSize.y);
  float receiverDepth = projected.z * 0.5 + 0.5 - u_shadowMapBias - slopeReceiverBias;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_shadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_shadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_shadowMapTexelSize;
    float storedDepth = texture(u_shadowMapTexture, uv + offset).r;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_shadowMapStrength, 0.0, 1.0));
}
float g3dTexturedPbrPointShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
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
  float receiverDepth = projected.z * 0.5 + 0.5 - u_pointShadowBias - (1.0 - normalDotLight) * u_pointShadowSlopeBias * max(u_pointShadowTexelSize.x, u_pointShadowTexelSize.y);
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_pointShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_pointShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    shadowed += (receiverDepth > texture(u_pointShadowMapTexture, uv + sampleData.xy * u_pointShadowTexelSize).r ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_pointShadowStrength, 0.0, 1.0));
}
vec2 g3dTexturedPbrEnvironmentUv(vec3 direction, float rotation) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / 6.28318530718 + 0.5 + rotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 g3dTexturedPbrRotateEnvironmentDirection(vec3 direction, float rotation) {
  float angle = rotation * 6.28318530718;
  float c = cos(angle);
  float s = sin(angle);
  vec3 d = normalize(direction);
  return normalize(vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
vec4 g3dTexturedPbrEnvironmentSampleRaw(vec3 direction, float lod) {
  vec4 equirectSample = textureLod(u_environmentMapTexture, g3dTexturedPbrEnvironmentUv(direction, u_environmentMapTextureRotation), lod);
  vec4 cubeSample = textureLod(u_environmentCubeMapTexture, g3dTexturedPbrRotateEnvironmentDirection(direction, u_environmentMapTextureRotation), lod);
  return mix(equirectSample, cubeSample, step(0.5, u_environmentCubeMapTextureEnabled));
}
vec3 g3dTexturedPbrBoxProjectedDirection(vec3 worldPosition, vec3 direction, vec3 boxMin, vec3 boxMax) {
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
vec3 g3dTexturedPbrEnvironmentDiffuseInput(vec3 normal) {
  float environmentHemi = mix(0.35, 1.0, clamp(normal.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 ambientEnvironment = u_environmentColor * u_environmentIntensity * environmentHemi;
  float proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity);
  float skyBlend = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  float horizonBlend = 1.0 - abs(normal.y);
  vec3 proceduralDiffuse = mix(u_environmentGroundColor, u_environmentSkyColor, skyBlend);
  proceduralDiffuse = mix(proceduralDiffuse, u_environmentHorizonColor, clamp(horizonBlend, 0.0, 1.0) * 0.55);
  vec3 environmentDiffuse = mix(ambientEnvironment, proceduralDiffuse * u_environmentMapIntensity, proceduralEnvironmentWeight);
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureIntensity);
  float diffuseEnvironmentLod = max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledDiffuse = g3dTexturedPbrDecodeEnvironmentSample(g3dTexturedPbrEnvironmentSampleRaw(normal, diffuseEnvironmentLod));
  return mix(environmentDiffuse, environmentDiffuse * 0.18 + sampledDiffuse * u_environmentMapTextureIntensity * 0.92, sampledEnvironmentWeight);
}
vec3 g3dTexturedPbrEnvironmentSpecularInput(vec3 normal, vec3 viewDirection, float roughness) {
  float proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity);
  vec3 reflectionDirection = reflect(-viewDirection, normal);
  float clampedRoughness = clamp(roughness, 0.0, 1.0);
  float reflectionBand = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(18.0, 2.0, clampedRoughness));
  float roughEnvironmentFloor = mix(0.04, 0.38, clampedRoughness);
  float proceduralSpecularResponse = max(reflectionBand, roughEnvironmentFloor);
  vec3 proceduralSpecular = u_environmentSpecularColor * u_environmentSpecularIntensity * proceduralSpecularResponse * proceduralEnvironmentWeight;
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureSpecularIntensity);
  float environmentLod = clampedRoughness * max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledSpecular = g3dTexturedPbrDecodeEnvironmentSample(g3dTexturedPbrEnvironmentSampleRaw(reflectionDirection, environmentLod));
  float nDotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
  vec2 brdfLut = texture(u_environmentBrdfLutTexture, vec2(nDotV, clampedRoughness)).rg;
  sampledSpecular *= u_environmentMapTextureSpecularIntensity * sampledEnvironmentWeight * mix(1.05, 0.82, clampedRoughness);
  return proceduralSpecular + sampledSpecular;
}
vec3 g3dTexturedPbrIridescenceColor(float minimumThickness, float maximumThickness, float iridescenceIor) {
  float thickness = clamp((minimumThickness + maximumThickness) * 0.5, 0.0, 1200.0);
  float phase = clamp((thickness - 100.0) / 1100.0, 0.0, 1.0) * 6.2831853;
  float iorShift = clamp((iridescenceIor - 1.0) / 2.0, 0.0, 1.0) * 0.65;
  return clamp(0.5 + 0.5 * cos(phase + iorShift + vec3(0.0, 2.0943951, 4.1887902)), vec3(0.0), vec3(1.0));
}
vec3 g3dTexturedPbrExtensionDirectLight(
  vec3 normal,
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
  float iridescenceThicknessMaximum
) {
  vec3 N = normalize(normal);
  vec3 V = normalize(viewDirection);
  vec3 L = normalize(lightDirection);
  vec3 H = normalize(V + L);
  float nDotL = g3dSaturate(dot(N, L));
  float nDotV = max(g3dSaturate(dot(N, V)), G3D_EPSILON);
  float nDotH = g3dSaturate(dot(N, H));
  float vDotH = g3dSaturate(dot(V, H));
  float clearcoatRough = clamp(clearcoatRoughness, 0.02, 1.0);
  vec3 clearcoatF = g3dFresnelSchlick(vec3(0.04), vDotH);
  float clearcoatD = g3dDistributionGGX(nDotH, clearcoatRough);
  float clearcoatG = g3dGeometrySmithGGXCorrelated(nDotV, nDotL, clearcoatRough);
  vec3 clearcoatLobe = clearcoatF * clearcoatD * clearcoatG * clamp(clearcoat, 0.0, 1.0) * 0.28;
  float sheenStrength = (1.0 - clamp(sheenRoughness, 0.0, 1.0)) * pow(g3dSaturate(1.0 - vDotH), 5.0);
  vec3 sheenLobe = clamp(sheenColor, vec3(0.0), vec3(1.0)) * sheenStrength * 0.32;
  vec3 anisotropyAxis = normalize(vec3(cos(anisotropyRotation), 0.0, sin(anisotropyRotation)));
  float anisotropyBand = pow(abs(dot(H, anisotropyAxis)), mix(28.0, 6.0, clearcoatRough));
  vec3 anisotropyLobe = vec3(clamp(anisotropy, 0.0, 1.0) * anisotropyBand * 0.12);
  vec3 iridescenceColor = g3dTexturedPbrIridescenceColor(iridescenceThicknessMinimum, iridescenceThicknessMaximum, iridescenceIor);
  vec3 iridescenceLobe = iridescenceColor * clamp(iridescence, 0.0, 1.0) * clearcoatF * pow(g3dSaturate(1.0 - nDotV), 2.0) * 0.65;
  return (clearcoatLobe + sheenLobe + anisotropyLobe + iridescenceLobe) * lightColor * lightIntensity * nDotL;
}
vec3 g3dTexturedPbrExtensionEnvironmentLight(
  vec3 normal,
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
  float iridescenceThicknessMaximum
) {
  float nDotV = max(g3dSaturate(dot(normalize(normal), normalize(viewDirection))), G3D_EPSILON);
  vec3 clearcoatF = g3dFresnelSchlickRoughness(vec3(0.04), nDotV, clamp(clearcoatRoughness, 0.02, 1.0));
  vec3 clearcoatLobe = specularRadiance * clearcoatF * clamp(clearcoat, 0.0, 1.0) * 0.18;
  vec3 sheenLobe = clamp(sheenColor, vec3(0.0), vec3(1.0)) * (1.0 - clamp(sheenRoughness, 0.0, 1.0)) * pow(g3dSaturate(1.0 - nDotV), 5.0) * 0.22;
  float anisotropyBand = 0.5 + 0.5 * cos(anisotropyRotation * 2.0);
  vec3 anisotropyLobe = specularRadiance * clamp(anisotropy, 0.0, 1.0) * mix(0.04, 0.14, anisotropyBand);
  vec3 iridescenceColor = g3dTexturedPbrIridescenceColor(iridescenceThicknessMinimum, iridescenceThicknessMaximum, iridescenceIor);
  vec3 iridescenceLobe = specularRadiance * iridescenceColor * clamp(iridescence, 0.0, 1.0) * pow(g3dSaturate(1.0 - nDotV), 2.0) * 0.5;
  return clearcoatLobe + sheenLobe + anisotropyLobe + iridescenceLobe;
}
void main() {
  vec2 baseColorUv = g3dTexturedPbrUv(u_baseColorTextureTexCoord, u_baseColorTextureOffset, u_baseColorTextureScale, u_baseColorTextureRotation);
  vec2 normalUv = g3dTexturedPbrUv(u_normalTextureTexCoord, u_normalTextureOffset, u_normalTextureScale, u_normalTextureRotation);
  vec2 emissiveUv = g3dTexturedPbrUv(u_emissiveTextureTexCoord, u_emissiveTextureOffset, u_emissiveTextureScale, u_emissiveTextureRotation);
  vec2 metallicRoughnessUv = g3dTexturedPbrUv(u_metallicRoughnessTextureTexCoord, u_metallicRoughnessTextureOffset, u_metallicRoughnessTextureScale, u_metallicRoughnessTextureRotation);
  vec2 occlusionUv = g3dTexturedPbrUv(u_occlusionTextureTexCoord, u_occlusionTextureOffset, u_occlusionTextureScale, u_occlusionTextureRotation);
#ifdef G3D_PBR_CLEARCOAT_TEXTURES
  vec2 clearcoatUv = g3dTexturedPbrUv(u_clearcoatTextureTexCoord, u_clearcoatTextureOffset, u_clearcoatTextureScale, u_clearcoatTextureRotation);
  vec2 clearcoatRoughnessUv = g3dTexturedPbrUv(u_clearcoatRoughnessTextureTexCoord, u_clearcoatRoughnessTextureOffset, u_clearcoatRoughnessTextureScale, u_clearcoatRoughnessTextureRotation);
  vec2 clearcoatNormalUv = g3dTexturedPbrUv(u_clearcoatNormalTextureTexCoord, u_clearcoatNormalTextureOffset, u_clearcoatNormalTextureScale, u_clearcoatNormalTextureRotation);
#endif
#ifdef G3D_PBR_TRANSMISSION_VOLUME_TEXTURES
  vec2 transmissionUv = g3dTexturedPbrUv(u_transmissionTextureTexCoord, u_transmissionTextureOffset, u_transmissionTextureScale, u_transmissionTextureRotation);
  vec2 diffuseTransmissionUv = g3dTexturedPbrUv(u_diffuseTransmissionTextureTexCoord, u_diffuseTransmissionTextureOffset, u_diffuseTransmissionTextureScale, u_diffuseTransmissionTextureRotation);
  vec2 diffuseTransmissionColorUv = g3dTexturedPbrUv(u_diffuseTransmissionColorTextureTexCoord, u_diffuseTransmissionColorTextureOffset, u_diffuseTransmissionColorTextureScale, u_diffuseTransmissionColorTextureRotation);
  vec2 volumeThicknessUv = g3dTexturedPbrUv(u_volumeThicknessTextureTexCoord, u_volumeThicknessTextureOffset, u_volumeThicknessTextureScale, u_volumeThicknessTextureRotation);
#endif
#ifdef G3D_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES
  vec2 specularUv = g3dTexturedPbrUv(u_specularTextureTexCoord, u_specularTextureOffset, u_specularTextureScale, u_specularTextureRotation);
  vec2 specularColorUv = g3dTexturedPbrUv(u_specularColorTextureTexCoord, u_specularColorTextureOffset, u_specularColorTextureScale, u_specularColorTextureRotation);
  vec2 sheenColorUv = g3dTexturedPbrUv(u_sheenColorTextureTexCoord, u_sheenColorTextureOffset, u_sheenColorTextureScale, u_sheenColorTextureRotation);
  vec2 sheenRoughnessUv = g3dTexturedPbrUv(u_sheenRoughnessTextureTexCoord, u_sheenRoughnessTextureOffset, u_sheenRoughnessTextureScale, u_sheenRoughnessTextureRotation);
  vec2 anisotropyUv = g3dTexturedPbrUv(u_anisotropyTextureTexCoord, u_anisotropyTextureOffset, u_anisotropyTextureScale, u_anisotropyTextureRotation);
#endif
#ifdef G3D_PBR_IRIDESCENCE_TEXTURES
  vec2 iridescenceUv = g3dTexturedPbrUv(u_iridescenceTextureTexCoord, u_iridescenceTextureOffset, u_iridescenceTextureScale, u_iridescenceTextureRotation);
  vec2 iridescenceThicknessUv = g3dTexturedPbrUv(u_iridescenceThicknessTextureTexCoord, u_iridescenceThicknessTextureOffset, u_iridescenceThicknessTextureScale, u_iridescenceThicknessTextureRotation);
#endif
  vec4 baseColorSample = texture(u_baseColorTexture, g3dTexturedPbrWrapUv(baseColorUv, u_baseColorTextureWrap));
  vec4 texturedBase = vec4(g3dTexturedPbrDecodeSrgb(baseColorSample.rgb), baseColorSample.a) * u_baseColor * v_vertexColor;
  vec4 metallicRoughnessSample = texture(u_metallicRoughnessTexture, g3dTexturedPbrWrapUv(metallicRoughnessUv, u_metallicRoughnessTextureWrap));
  float roughness = clamp(u_roughness * metallicRoughnessSample.g, 0.0, 1.0);
  float metallic = clamp(u_metallic * metallicRoughnessSample.b, 0.0, 1.0);
  float occlusion = mix(1.0, texture(u_occlusionTexture, g3dTexturedPbrWrapUv(occlusionUv, u_occlusionTextureWrap)).r, clamp(u_occlusionStrength, 0.0, 1.0));
  vec3 geometryNormal = normalize(v_normal);
  vec3 mappedNormal = mix(geometryNormal, g3dTexturedPbrNormal(geometryNormal, v_tangent, g3dTexturedPbrWrapUv(normalUv, u_normalTextureWrap)), step(0.5, u_normalTextureEnabled));
  if (!gl_FrontFacing) mappedNormal = -mappedNormal;
  vec3 clearcoatNormalDirection = geometryNormal;
  float clearcoatNormalBoost = max(0.25, 1.0 - clamp(u_clearcoatNormalScale, 0.0, 1.0) * 0.12);
#ifdef G3D_PBR_CLEARCOAT_TEXTURES
  vec3 clearcoatNormalSample = texture(u_clearcoatNormalTexture, g3dTexturedPbrWrapUv(clearcoatNormalUv, u_clearcoatNormalTextureWrap)).xyz * 2.0 - 1.0;
  clearcoatNormalDirection = g3dTexturedPbrApplyNormalSample(geometryNormal, v_tangent, clearcoatNormalSample, u_clearcoatNormalScale);
  clearcoatNormalBoost *= max(0.25, clearcoatNormalSample.z);
#endif
  float clearcoat = clamp(u_clearcoatFactor * clearcoatNormalBoost, 0.0, 1.0);
  float clearcoatRoughness = clamp(u_clearcoatRoughnessFactor, 0.0, 1.0);
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
  float iridescenceThickness = mix(u_iridescenceThicknessMinimum, u_iridescenceThicknessMaximum, 0.5);
#ifdef G3D_PBR_CLEARCOAT_TEXTURES
  clearcoat = clamp(clearcoat * texture(u_clearcoatTexture, g3dTexturedPbrWrapUv(clearcoatUv, u_clearcoatTextureWrap)).r, 0.0, 1.0);
  clearcoatRoughness = clamp(clearcoatRoughness * texture(u_clearcoatRoughnessTexture, g3dTexturedPbrWrapUv(clearcoatRoughnessUv, u_clearcoatRoughnessTextureWrap)).g, 0.0, 1.0);
#endif
#ifdef G3D_PBR_TRANSMISSION_VOLUME_TEXTURES
  transmission = clamp(transmission * texture(u_transmissionTexture, g3dTexturedPbrWrapUv(transmissionUv, u_transmissionTextureWrap)).r, 0.0, 1.0);
  diffuseTransmission = clamp(diffuseTransmission * texture(u_diffuseTransmissionTexture, g3dTexturedPbrWrapUv(diffuseTransmissionUv, u_diffuseTransmissionTextureWrap)).r, 0.0, 1.0);
  diffuseTransmissionColor *= g3dTexturedPbrDecodeSrgb(texture(u_diffuseTransmissionColorTexture, g3dTexturedPbrWrapUv(diffuseTransmissionColorUv, u_diffuseTransmissionColorTextureWrap)).rgb);
  volumeThickness *= texture(u_volumeThicknessTexture, g3dTexturedPbrWrapUv(volumeThicknessUv, u_volumeThicknessTextureWrap)).g;
#endif
#ifdef G3D_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES
  specular = clamp(specular * texture(u_specularTexture, g3dTexturedPbrWrapUv(specularUv, u_specularTextureWrap)).a, 0.0, 1.0);
  specularColor *= g3dTexturedPbrDecodeSrgb(texture(u_specularColorTexture, g3dTexturedPbrWrapUv(specularColorUv, u_specularColorTextureWrap)).rgb);
  sheenColor *= g3dTexturedPbrDecodeSrgb(texture(u_sheenColorTexture, g3dTexturedPbrWrapUv(sheenColorUv, u_sheenColorTextureWrap)).rgb);
  sheenRoughness = clamp(sheenRoughness * texture(u_sheenRoughnessTexture, g3dTexturedPbrWrapUv(sheenRoughnessUv, u_sheenRoughnessTextureWrap)).a, 0.0, 1.0);
  anisotropy = clamp(anisotropy * texture(u_anisotropyTexture, g3dTexturedPbrWrapUv(anisotropyUv, u_anisotropyTextureWrap)).b, 0.0, 1.0);
#endif
#ifdef G3D_PBR_IRIDESCENCE_TEXTURES
  iridescence = clamp(iridescence * texture(u_iridescenceTexture, g3dTexturedPbrWrapUv(iridescenceUv, u_iridescenceTextureWrap)).r, 0.0, 1.0);
  iridescenceThickness = mix(u_iridescenceThicknessMinimum, u_iridescenceThicknessMaximum, texture(u_iridescenceThicknessTexture, g3dTexturedPbrWrapUv(iridescenceThicknessUv, u_iridescenceThicknessTextureWrap)).g);
#endif
  vec3 base = g3dApplyAdvancedPbrLobes(
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
    iridescence,
    u_iridescenceIor,
    iridescenceThickness,
    iridescenceThickness,
    u_dispersion
  );
  vec3 viewDirection = normalize(u_cameraPosition - v_worldPosition);
  float environmentNdotV = clamp(dot(mappedNormal, viewDirection), 0.0, 1.0);
  vec2 environmentBrdf = mix(vec2(1.0, 0.0), texture(u_environmentBrdfLutTexture, vec2(environmentNdotV, roughness)).rg, step(0.0001, u_environmentBrdfLutEnabled));
  vec3 extensionEnvironmentSpecular = g3dTexturedPbrEnvironmentSpecularInput(clearcoatNormalDirection, viewDirection, clamp(clearcoatRoughness, 0.02, 1.0));
  vec3 shaded = g3dTexturedPbrDecodeSrgb(texture(u_emissiveTexture, g3dTexturedPbrWrapUv(emissiveUv, u_emissiveTextureWrap)).rgb) * u_emissiveColor * u_emissiveStrength + g3dPbrEnvironmentLightSplitSum(
    mappedNormal,
    viewDirection,
    g3dTexturedPbrEnvironmentDiffuseInput(mappedNormal) * occlusion,
    g3dTexturedPbrEnvironmentSpecularInput(mappedNormal, viewDirection, roughness),
    environmentBrdf,
    base,
    metallic,
    roughness,
    specular,
    specularColor
  ) + g3dTexturedPbrExtensionEnvironmentLight(
    clearcoatNormalDirection,
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
    iridescenceThickness
  );
  float texturedTransmissionAmount = clamp(max(transmission, diffuseTransmission), 0.0, 1.0);
  float texturedSampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureIntensity);
#ifndef G3D_PBR_DISABLE_TRANSMISSION_BACKDROP
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
      vec3 texturedParallaxDirection = g3dTexturedPbrBoxProjectedDirection(v_worldPosition, texturedRefractionDirection, u_transmissionParallaxBoxMin, u_transmissionParallaxBoxMax);
      texturedRefractionDirection = normalize(mix(texturedRefractionDirection, texturedParallaxDirection, texturedParallaxStrength));
    }
    float texturedBounceCount = clamp(u_transmissionBounceCount, 0.0, 4.0);
    float texturedRefractionLod = clamp(roughness + volumeThickness * 0.12 + texturedBounceCount * 0.04 * texturedParallaxStrength, 0.0, 1.0) * max(u_environmentMapTextureMipCount - 1.0, 0.0);
    vec3 texturedRefractedEnvironment = g3dTexturedPbrDecodeEnvironmentSample(g3dTexturedPbrEnvironmentSampleRaw(texturedRefractionDirection, texturedRefractionLod));
    float texturedVolumeTravel = clamp((max(volumeThickness, 0.0) * (1.0 + texturedBounceCount * 0.18 * texturedParallaxStrength)) / max(u_volumeAttenuationDistance, 0.0001), 0.0, 16.0);
    vec3 texturedVolumeTint = pow(clamp(u_volumeAttenuationColor, vec3(0.0001), vec3(1.0)), vec3(texturedVolumeTravel));
    float texturedCausticEnergy = u_transmissionCausticStrength * texturedParallaxStrength * texturedTransmissionAmount * pow(1.0 - roughness, 2.0) / (1.0 + texturedBounceCount * 0.35);
    float texturedRoughVolumeIorLift = mix(1.0, 1.45, clamp((u_ior - 1.0) / 1.5, 0.0, 1.0) * smoothstep(0.35, 0.95, roughness + volumeThickness * 0.2));
    float texturedFallbackEnvironmentTransmissionEnergy = mix(1.0, clamp(u_transmissionFallbackEnergy, 0.0, 1.0), texturedTransmissionAmount);
    vec3 texturedRefractionRadiance = (texturedRefractedEnvironment + vec3(texturedCausticEnergy)) * texturedVolumeTint * u_environmentMapTextureIntensity * texturedTransmissionAmount * texturedFallbackEnvironmentTransmissionEnergy * mix(0.9, 0.55, roughness) * texturedRoughVolumeIorLift * texturedSampledEnvironmentWeight;
#ifndef G3D_PBR_DISABLE_TRANSMISSION_BACKDROP
    if (texturedBackdropWeight > 0.0001) {
      vec2 backdropUv = gl_FragCoord.xy / max(u_transmissionBackdropResolution, vec2(1.0));
      vec2 backdropOffset = normalize(texturedRefractionDirection.xy + vec2(0.0001)) * u_transmissionBackdropRefractionScale * mix(1.25, 0.55, roughness) * clamp(u_ior - 1.0, 0.0, 2.5);
      float backdropLod = clamp((roughness + volumeThickness * 0.08) * max(u_transmissionBackdropMipCount - 1.0, 0.0), 0.0, max(u_transmissionBackdropMipCount - 1.0, 0.0));
      vec3 backdropRadiance = g3dTexturedPbrDecodeSrgb(textureLod(u_transmissionBackdropTexture, clamp(backdropUv + backdropOffset, vec2(0.001), vec2(0.999)), backdropLod).rgb);
      texturedRefractionRadiance = mix(texturedRefractionRadiance, backdropRadiance * texturedTransmissionAmount * mix(1.0, 1.22, texturedBackdropWeight), texturedBackdropWeight);
    }
#endif
    shaded = mix(shaded, shaded * 0.72 + texturedRefractionRadiance, texturedTransmissionAmount * mix(0.08, 0.58, texturedFallbackEnvironmentTransmissionEnergy));
  }
  int count = min(int(u_lightCount), 16);
  for (int i = 0; i < count; ++i) {
    int baseIndex = i * 4;
    vec4 colorIntensity = u_lightData[baseIndex];
    vec4 positionRange = u_lightData[baseIndex + 1];
    vec4 directionKind = u_lightData[baseIndex + 2];
    vec4 spotShadowLayer = u_lightData[baseIndex + 3];
    float kind = directionKind.w;
    vec3 lightDirection = -directionKind.xyz;
    float attenuation = 1.0;
    if (kind > 0.5) {
      vec3 toLight = positionRange.xyz - v_worldPosition;
      float distanceToLight = length(toLight);
      lightDirection = distanceToLight > 0.0001 ? toLight / distanceToLight : -directionKind.xyz;
      float range = max(positionRange.w, 0.0001);
      float rangeFalloff = clamp(1.0 - pow(distanceToLight / range, 4.0), 0.0, 1.0);
      rangeFalloff *= rangeFalloff;
      attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);
    }
    if (kind > 1.5) {
      vec3 lightToFragment = normalize(v_worldPosition - positionRange.xyz);
      float cone = dot(normalize(directionKind.xyz), lightToFragment);
      float outer = cos(spotShadowLayer.x);
      float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    float shadowFactor = mix(1.0, kind > 0.5 && kind < 1.5 ? g3dTexturedPbrPointShadowFactor(v_worldPosition, mappedNormal, lightDirection) : g3dTexturedPbrShadowFactor(v_worldPosition, mappedNormal, lightDirection), step(0.5, spotShadowLayer.z));
    float directLightIntensity = colorIntensity.a * attenuation * shadowFactor;
    shaded += g3dPbrDirectLight(mappedNormal, viewDirection, lightDirection, colorIntensity.rgb, directLightIntensity, base, metallic, roughness, specular, specularColor);
    shaded += g3dTexturedPbrExtensionDirectLight(
      clearcoatNormalDirection,
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
      iridescenceThickness
    );
  }
  float alpha = texturedBase.a;
  float transmissionAlpha = clamp(max(transmission, diffuseTransmission), 0.0, 1.0);
  float texturedTransmissionCoverage = mix(0.34, 0.08, clamp(u_transmissionFallbackEnergy, 0.0, 1.0));
  alpha = mix(alpha, alpha * texturedTransmissionCoverage, transmissionAlpha);
  if (alpha < u_alphaCutoff) discard;
  vec3 fogged = g3dApplyEnvironmentFog(max(shaded, vec3(0.0)), v_worldPosition);
  outColor = vec4(g3dTexturedPbrEncodeOutput(fogged), alpha);
}
`
  });
  library.register({
    name: DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_NAME,
    marker: DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
out vec2 v_backgroundNdc;
void main() {
  v_backgroundNdc = a_position.xy;
  gl_Position = vec4(a_position.xy, 1.0, 1.0);
}
`,
    fragment: `#version 300 es
// ${DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_MARKER}
precision highp float;
uniform sampler2D u_environmentBackgroundTexture;
uniform samplerCube u_environmentBackgroundCubeTexture;
uniform float u_environmentBackgroundProjection;
uniform float u_environmentBackgroundRotation;
uniform float u_environmentBackgroundIntensity;
uniform float u_environmentBackgroundEncoding;
uniform float u_outputColorSpace;
uniform mat4 u_environmentBackgroundInverseViewProjection;
in vec2 v_backgroundNdc;
out vec4 outColor;
vec2 g3dBackgroundEquirectUv(vec3 direction) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / 6.28318530718 + 0.5;
  float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 g3dRotateBackgroundDirection(vec3 direction, float rotation) {
  float angle = rotation * 6.28318530718;
  float c = cos(angle);
  float s = sin(angle);
  vec3 d = normalize(direction);
  return normalize(vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
vec3 g3dBackgroundDirectionFromNdc(vec2 ndc) {
  vec4 nearPoint = u_environmentBackgroundInverseViewProjection * vec4(ndc, -1.0, 1.0);
  vec4 farPoint = u_environmentBackgroundInverseViewProjection * vec4(ndc, 1.0, 1.0);
  vec3 nearWorld = nearPoint.xyz / max(nearPoint.w, 0.00001);
  vec3 farWorld = farPoint.xyz / max(farPoint.w, 0.00001);
  return normalize(farWorld - nearWorld);
}
vec3 g3dBackgroundDecodeRgbe(vec4 encodedSample) {
  float exponent = encodedSample.a * 255.0;
  float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
  return max(encodedSample.rgb * scale, vec3(0.0));
}
vec3 g3dBackgroundDecode(vec4 encodedSample) {
  if (u_environmentBackgroundEncoding > 1.5) return g3dBackgroundDecodeRgbe(encodedSample);
  return max(encodedSample.rgb, vec3(0.0));
}
vec3 g3dBackgroundEncodeOutput(vec3 linearColor) {
  vec3 color = max(linearColor, vec3(0.0));
  vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
  vec3 srgb = pow(filmic, vec3(1.0 / 2.2));
  return mix(color, srgb, step(0.5, u_outputColorSpace));
}
void main() {
  vec3 direction = g3dRotateBackgroundDirection(g3dBackgroundDirectionFromNdc(v_backgroundNdc), u_environmentBackgroundRotation);
  vec4 encodedSample = vec4(0.0, 0.0, 0.0, 1.0);
  if (u_environmentBackgroundProjection > 1.5) {
    encodedSample = texture(u_environmentBackgroundCubeTexture, direction);
  } else {
    encodedSample = texture(u_environmentBackgroundTexture, g3dBackgroundEquirectUv(direction));
  }
  vec3 color = g3dBackgroundDecode(encodedSample) * max(u_environmentBackgroundIntensity, 0.0);
  outColor = vec4(g3dBackgroundEncodeOutput(color), 1.0);
}
`
  });
  library.register({
    name: DEFAULT_DEPTH_SHADER_NAME,
    marker: DEFAULT_DEPTH_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_DEPTH_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
uniform mat4 u_modelViewProjection;
void main() {
  gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
}
`,
    fragment: `#version 300 es
// ${DEFAULT_DEPTH_SHADER_MARKER}
precision highp float;
out vec4 outColor;
void main() {
  outColor = vec4(vec3(gl_FragCoord.z), 1.0);
}
`
  });
  return library;
}
