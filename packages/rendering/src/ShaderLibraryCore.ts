import { ShaderPreprocessor, type ShaderPreprocessOptions } from "./ShaderPreprocessor";
import type { PortableShaderBinding } from "./RenderDevice";
export { DEFAULT_PBR_SHADER_MARKER, DEFAULT_PBR_SHADER_NAME } from "./PBRMaterial";
import { DEFAULT_PBR_SHADER_MARKER, DEFAULT_PBR_SHADER_NAME } from "./PBRMaterial";
import { SHADER_CHUNKS, validateShaderChunks } from "./ShaderChunks";

export interface ShaderSourcePair {
  readonly name: string;
  readonly marker: string;
  readonly vertex: string;
  readonly fragment: string;
  readonly webgpu?: {
    readonly vertex: string;
    readonly fragment: string;
  };
  readonly portableBindings?: readonly PortableShaderBinding[];
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
  readonly webgpu?: {
    readonly vertex: string;
    readonly fragment: string;
  };
  readonly portableBindings?: readonly PortableShaderBinding[];
}

export class ShaderLibrary {
  private readonly shaders = new Map<string, ShaderSourcePair>();
  private readonly chunks = new Map<string, string>();
  private readonly preprocessor = new ShaderPreprocessor();
  private readonly variantCache = new Map<string, CompiledShaderSource>();
  private revision = 0;

  register(shader: ShaderSourcePair): void {
    if (this.shaders.has(shader.name)) {
      throw new Error(`Shader is already registered: ${shader.name}`);
    }
    this.assertMarker(shader);
    this.assertVariants(shader);
    this.shaders.set(shader.name, shader);
    this.variantCache.clear();
    this.revision += 1;
  }

  replace(shader: ShaderSourcePair): void {
    if (!this.shaders.has(shader.name)) {
      throw new Error(`Shader is not registered: ${shader.name}`);
    }
    this.assertMarker(shader);
    this.assertVariants(shader);
    this.shaders.set(shader.name, shader);
    this.variantCache.clear();
    this.revision += 1;
  }

  unregister(name: string): boolean {
    const removed = this.shaders.delete(name);
    if (removed) {
      this.variantCache.clear();
      this.revision += 1;
    }
    return removed;
  }

  getRevision(): number {
    return this.revision;
  }

  registerChunk(name: string, source: string): void {
    if (this.chunks.has(name)) {
      throw new Error(`Shader chunk is already registered: ${name}`);
    }
    this.chunks.set(name, source);
    this.variantCache.clear();
    this.revision += 1;
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
    return {
      label: name,
      marker: shader.marker,
      vertex,
      fragment,
      ...(shader.webgpu ? { webgpu: shader.webgpu } : {}),
      ...(shader.portableBindings ? { portableBindings: shader.portableBindings } : {})
    };
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
    if (shader.webgpu && (!shader.webgpu.vertex.includes(shader.marker) || !shader.webgpu.fragment.includes(shader.marker))) {
      throw new Error(`Shader ${shader.name} must include marker ${shader.marker} in both WebGPU stages`);
    }
    if ((shader.webgpu === undefined) !== (shader.portableBindings === undefined)) {
      throw new Error(`Portable shader ${shader.name} must provide both webgpu sources and portableBindings`);
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

export const DEFAULT_UNLIT_SHADER_NAME = "aura3d/unlit";
export const DEFAULT_UNLIT_SHADER_MARKER = "@aura3d-shader:unlit";
export const DEFAULT_INSTANCED_UNLIT_SHADER_NAME = "aura3d/instanced-unlit";
export const DEFAULT_INSTANCED_UNLIT_SHADER_MARKER = "@aura3d-shader:instanced-unlit";
export const DEFAULT_INSTANCED_PBR_SHADER_NAME = "aura3d/instanced-pbr";
export const DEFAULT_INSTANCED_PBR_SHADER_MARKER = "@aura3d-shader:instanced-pbr";
export const DEFAULT_TEXTURED_UNLIT_SHADER_NAME = "aura3d/textured-unlit";
export const DEFAULT_TEXTURED_UNLIT_SHADER_MARKER = "@aura3d-shader:textured-unlit";
export const DEFAULT_SKINNED_UNLIT_SHADER_NAME = "aura3d/skinned-unlit";
export const DEFAULT_SKINNED_UNLIT_SHADER_MARKER = "@aura3d-shader:skinned-unlit";
export const DEFAULT_SKINNED_LIT_SHADER_NAME = "aura3d/skinned-lit";
export const DEFAULT_SKINNED_LIT_SHADER_MARKER = "@aura3d-shader:skinned-lit";
/**
 * Eight-influence skinned shaders. These read a second `JOINTS_1`/`WEIGHTS_1`
 * attribute set and select between uniform-array and data-texture joint palettes at
 * runtime through `u_jointPaletteMode`, so a single program serves both small rigs
 * and rigs above the uniform-array joint limit.
 */
export const DEFAULT_SKINNED_UNLIT_EIGHT_INFLUENCE_SHADER_NAME = "aura3d/skinned-unlit-8";
export const DEFAULT_SKINNED_UNLIT_EIGHT_INFLUENCE_SHADER_MARKER = "@aura3d-shader:skinned-unlit-8";
export const DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_NAME = "aura3d/skinned-lit-8";
export const DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_MARKER = "@aura3d-shader:skinned-lit-8";
export const DEFAULT_MORPH_UNLIT_SHADER_NAME = "aura3d/morph-unlit";
export const DEFAULT_MORPH_UNLIT_SHADER_MARKER = "@aura3d-shader:morph-unlit";
export const DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME = "aura3d/pbr-normal-map";
export const DEFAULT_NORMAL_MAPPED_PBR_SHADER_MARKER = "@aura3d-shader:pbr-normal-map";
export const DEFAULT_TEXTURED_PBR_SHADER_NAME = "aura3d/pbr-textured";
export const DEFAULT_TEXTURED_PBR_SHADER_MARKER = "@aura3d-shader:pbr-textured";
export const DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT = "clearcoat-textures";
export const DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT = "transmission-volume-textures";
export const DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT = "specular-sheen-anisotropy-textures";
export const DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT = "iridescence-textures";
export const DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT = "clearcoat-transmission-volume-textures";
export const DEFAULT_TEXTURED_PBR_CLEARCOAT_SPECULAR_TEXTURES_VARIANT = "clearcoat-specular-textures";
export const DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT = "specular-sheen-anisotropy-iridescence-textures";
/**
 * True screen-space fat lines, equivalent in intent to Three.js `Line2`/`LineMaterial`.
 * Width is specified in pixels and stays constant across distance, FOV, viewport size,
 * and device pixel ratio.
 */
export const DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME = "aura3d/screen-space-line";
export const DEFAULT_SCREEN_SPACE_LINE_SHADER_MARKER = "@aura3d-shader:screen-space-line";

export const DEFAULT_DEPTH_SHADER_NAME = "aura3d/depth";
export const DEFAULT_DEPTH_SHADER_MARKER = "@aura3d-shader:depth";
export const DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_NAME = "aura3d/environment-background";
export const DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_MARKER = "@aura3d-shader:environment-background";

export function registerLeanUnlitShader(library: ShaderLibrary): void {
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
}

export function registerLeanPbrShader(library: ShaderLibrary): void {
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
vec3 a3dPbrBoundHdrTransmissionRadiance(vec3 radiance) {
  vec3 nonNegative = max(radiance, vec3(0.0));
  return nonNegative / (vec3(1.0) + max(nonNegative - vec3(1.0), vec3(0.0)));
}
vec3 a3dPbrBoundHdrSpecularRadiance(vec3 radiance) {
  vec3 nonNegative = max(radiance, vec3(0.0));
  vec3 softKnee = nonNegative / (vec3(1.0) + max(nonNegative - vec3(1.0), vec3(0.0)) * 0.58);
  float maxChannel = max(max(softKnee.r, softKnee.g), softKnee.b);
  return maxChannel > 1.65 ? softKnee * (1.65 / maxChannel) : softKnee;
}
vec3 a3dPbrClampSampledSpecularEdgeEnergy(vec3 radiance, float nDotV, float roughness) {
  float faceOn = smoothstep(0.12, 0.55, clamp(nDotV, 0.0, 1.0));
  float roughEnergy = mix(0.6, 1.0, clamp(roughness, 0.0, 1.0));
  float edgeCap = mix(0.12, 1.2, faceOn) * roughEnergy;
  float edgeScale = mix(0.14, 0.92, faceOn);
  vec3 bounded = min(radiance * edgeScale, vec3(edgeCap));
  return max(bounded, vec3(0.0));
}
vec4 a3dPbrEnvironmentSampleRaw(vec3 direction, float lod) {
  vec4 equirectSample = textureLod(u_environmentMapTexture, a3dEnvironmentEquirectUv(direction, u_environmentMapTextureRotation), lod);
  vec4 cubeSample = textureLod(u_environmentCubeMapTexture, a3dEnvironmentCubeDirection(direction, u_environmentMapTextureRotation), lod);
  return mix(equirectSample, cubeSample, step(0.5, u_environmentCubeMapTextureEnabled));
}
vec3 a3dPbrBoxProjectedDirection(vec3 worldPosition, vec3 direction, vec3 boxMin, vec3 boxMax) {
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
float a3dForwardShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_shadowMapEnabled < 0.5) return 1.0;
  vec4 lightPosition = u_shadowMapMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  // Slope-scaled depth bias must be evaluated per PCF sample, not once for the kernel
  // centre. A sample offset N texels away on a receiver sloped relative to the light sees a
  // depth difference proportional to N, so a centre-only bias under-compensates every outer
  // tap and the receiver shadows itself. Scaling by each sample's own texel distance keeps
  // wide kernels acne-free without inflating the constant bias into peter-panning.
  // The depth gradient across one shadow texel is tan(angle between receiver normal and
  // light), not (1 - N.L). The linear form collapses toward zero far faster than the real
  // gradient grows, so it under-biases exactly the grazing angles that need the most
  // compensation. Clamped so a near-perpendicular receiver cannot demand unbounded bias.
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_shadowMapSlopeBias * max(u_shadowMapTexelSize.x, u_shadowMapTexelSize.y);
  float projectedDepth = projected.z * 0.5 + 0.5;
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
  // Slope-scaled depth bias must be evaluated per PCF sample, not once for the kernel
  // centre. A sample offset N texels away on a receiver sloped relative to the light sees a
  // depth difference proportional to N, so a centre-only bias under-compensates every outer
  // tap and the receiver shadows itself. Scaling by each sample's own texel distance keeps
  // wide kernels acne-free without inflating the constant bias into peter-panning.
  // The depth gradient across one shadow texel is tan(angle between receiver normal and
  // light), not (1 - N.L). The linear form collapses toward zero far faster than the real
  // gradient grows, so it under-biases exactly the grazing angles that need the most
  // compensation. Clamped so a near-perpendicular receiver cannot demand unbounded bias.
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
vec3 a3dPbrEncodeOutput(vec3 linearColor) {
  vec3 color = max(linearColor, vec3(0.0));
  vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
  vec3 srgb = pow(filmic, vec3(1.0 / 2.2));
  return mix(color, srgb, step(0.5, u_outputColorSpace));
}
void main() {
  vec3 normal = normalize(v_normal);
  if (!gl_FrontFacing) normal = -normal;
  vec3 viewDirection = normalize(u_cameraPosition - v_worldPosition);
  vec3 materialBase = a3dApplyAdvancedPbrLobes(
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
  // The ambient term must be added to the procedural contribution, not replaced by it. A mix
  // here discarded u_environmentColor * u_environmentIntensity entirely whenever a procedural
  // map was present, which is the normal case: raising ambient intensity from 0.18 to 3.0 on
  // the product-turntable kit produced a byte-identical frame. Ambient and a sky gradient are
  // separate physical contributions, so they sum.
  vec3 environmentDiffuse = ambientEnvironment + proceduralDiffuse * u_environmentMapIntensity * proceduralEnvironmentWeight;
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureIntensity);
  float diffuseEnvironmentLod = max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledDiffuse = a3dPbrDecodeEnvironmentSample(a3dPbrEnvironmentSampleRaw(normal, diffuseEnvironmentLod));
  environmentDiffuse = mix(environmentDiffuse, ambientEnvironment + sampledDiffuse * u_environmentMapTextureIntensity, sampledEnvironmentWeight);
  vec3 reflectionDirection = reflect(-viewDirection, normal);
  float roughness = clamp(u_roughness, 0.0, 1.0);
  float reflectionBand = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(18.0, 2.0, roughness));
  float roughEnvironmentFloor = mix(0.04, 0.38, roughness);
  float proceduralSpecularResponse = max(reflectionBand, roughEnvironmentFloor);
  vec3 proceduralSpecular = u_environmentSpecularColor * u_environmentSpecularIntensity * proceduralSpecularResponse * proceduralEnvironmentWeight;
  float environmentLod = roughness * max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledSpecular = a3dPbrBoundHdrSpecularRadiance(a3dPbrDecodeEnvironmentSample(a3dPbrEnvironmentSampleRaw(reflectionDirection, environmentLod)));
  float nDotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
  vec2 brdfLut = texture(u_environmentBrdfLutTexture, vec2(nDotV, roughness)).rg;
  sampledSpecular = a3dPbrClampSampledSpecularEdgeEnergy(sampledSpecular, nDotV, roughness);
  sampledSpecular *= u_environmentMapTextureSpecularIntensity * sampledEnvironmentWeight * mix(1.1, 0.85, roughness);
  vec3 shaded = a3dPbrEnvironmentLightSplitSum(
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
  shaded += a3dPbrExtensionEnvironmentLight(
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
      vec3 parallaxDirection = a3dPbrBoxProjectedDirection(v_worldPosition, refractionDirection, u_transmissionParallaxBoxMin, u_transmissionParallaxBoxMax);
      refractionDirection = normalize(mix(refractionDirection, parallaxDirection, parallaxStrength));
    }
    float bounceCount = clamp(u_transmissionBounceCount, 0.0, 4.0);
    float refractionLod = clamp(roughness + u_volumeThicknessFactor * 0.12 + bounceCount * 0.04 * parallaxStrength, 0.0, 1.0) * max(u_environmentMapTextureMipCount - 1.0, 0.0);
    vec3 refractedEnvironment = a3dPbrBoundHdrTransmissionRadiance(a3dPbrDecodeEnvironmentSample(a3dPbrEnvironmentSampleRaw(refractionDirection, refractionLod)));
    float volumeTravel = clamp((max(u_volumeThicknessFactor, 0.0) * (1.0 + bounceCount * 0.18 * parallaxStrength)) / max(u_volumeAttenuationDistance, 0.0001), 0.0, 16.0);
    vec3 volumeTint = pow(clamp(u_volumeAttenuationColor, vec3(0.0001), vec3(1.0)), vec3(volumeTravel));
    float causticEnergy = u_transmissionCausticStrength * parallaxStrength * transmissionAmount * pow(1.0 - roughness, 2.0) / (1.0 + bounceCount * 0.35);
    float roughVolumeIorLift = mix(1.0, 1.45, clamp((u_ior - 1.0) / 1.5, 0.0, 1.0) * smoothstep(0.35, 0.95, roughness + u_volumeThicknessFactor * 0.2));
    float fallbackEnvironmentTransmissionEnergy = mix(1.0, clamp(u_transmissionFallbackEnergy, 0.0, 1.0), transmissionAmount);
    vec3 refractionRadiance = (refractedEnvironment + vec3(causticEnergy)) * volumeTint * u_environmentMapTextureIntensity * transmissionAmount * fallbackEnvironmentTransmissionEnergy * mix(0.9, 0.55, roughness) * roughVolumeIorLift;
    shaded = mix(shaded, shaded * 0.72 + refractionRadiance, transmissionAmount * mix(0.08, 0.58, fallbackEnvironmentTransmissionEnergy));
  }
  ivec2 clusterTile = clamp(ivec2(floor(gl_FragCoord.xy / max(u_clusterViewportSize / u_clusterGridSize, vec2(1.0)))), ivec2(0), ivec2(u_clusterGridSize) - ivec2(1));
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
        spotShadowLayer.x, spotShadowLayer.y, positionRange.w,
        normal, viewDirection, colorIntensity.rgb, colorIntensity.a,
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
    float directLightIntensity = colorIntensity.a * attenuation * mix(1.0, kind > 0.5 && kind < 1.5 ? a3dPointShadowFactor(v_worldPosition, normal, lightDirection) : a3dForwardShadowFactor(v_worldPosition, normal, lightDirection), step(0.5, spotShadowLayer.z));
    shaded += a3dPbrDirectLight(
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
    shaded += a3dPbrExtensionDirectLight(
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
  if (alpha < u_alphaCutoff) discard;
  vec3 fogged = a3dApplyEnvironmentFog(max(shaded, vec3(0.0)), v_worldPosition);
  outColor = vec4(a3dPbrEncodeOutput(fogged), alpha);
}
`
  });
}

export function registerLeanDepthShader(library: ShaderLibrary): void {
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
}

export function registerLeanEnvironmentBackgroundShader(library: ShaderLibrary): void {
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
vec2 a3dBackgroundEquirectUv(vec3 direction) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / 6.28318530718 + 0.5;
  float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 a3dRotateBackgroundDirection(vec3 direction, float rotation) {
  float angle = rotation * 6.28318530718;
  float c = cos(angle);
  float s = sin(angle);
  vec3 d = normalize(direction);
  return normalize(vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
vec3 a3dBackgroundDirectionFromNdc(vec2 ndc) {
  vec4 nearPoint = u_environmentBackgroundInverseViewProjection * vec4(ndc, -1.0, 1.0);
  vec4 farPoint = u_environmentBackgroundInverseViewProjection * vec4(ndc, 1.0, 1.0);
  vec3 nearWorld = nearPoint.xyz / max(nearPoint.w, 0.00001);
  vec3 farWorld = farPoint.xyz / max(farPoint.w, 0.00001);
  return normalize(farWorld - nearWorld);
}
vec3 a3dBackgroundDecodeRgbe(vec4 encodedSample) {
  float exponent = encodedSample.a * 255.0;
  float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
  return max(encodedSample.rgb * scale, vec3(0.0));
}
vec3 a3dBackgroundDecode(vec4 encodedSample) {
  if (u_environmentBackgroundEncoding > 1.5) return a3dBackgroundDecodeRgbe(encodedSample);
  return max(encodedSample.rgb, vec3(0.0));
}
vec3 a3dBackgroundEncodeOutput(vec3 linearColor) {
  vec3 color = max(linearColor, vec3(0.0));
  vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
  vec3 srgb = pow(filmic, vec3(1.0 / 2.2));
  return mix(color, srgb, step(0.5, u_outputColorSpace));
}
void main() {
  vec3 direction = a3dRotateBackgroundDirection(a3dBackgroundDirectionFromNdc(v_backgroundNdc), u_environmentBackgroundRotation);
  vec4 encodedSample = vec4(0.0, 0.0, 0.0, 1.0);
  if (u_environmentBackgroundProjection > 1.5) {
    encodedSample = texture(u_environmentBackgroundCubeTexture, direction);
  } else {
    encodedSample = texture(u_environmentBackgroundTexture, a3dBackgroundEquirectUv(direction));
  }
  vec3 color = a3dBackgroundDecode(encodedSample) * max(u_environmentBackgroundIntensity, 0.0);
  outColor = vec4(a3dBackgroundEncodeOutput(color), 1.0);
}
`
  });
}

export function createLeanCoreShaderLibrary(): ShaderLibrary {
  const library = new ShaderLibrary();
  validateShaderChunks();
  for (const chunk of SHADER_CHUNKS) {
    library.registerChunk(chunk.name, chunk.source);
  }
  registerLeanUnlitShader(library);
  registerLeanPbrShader(library);
  registerLeanDepthShader(library);
  registerLeanEnvironmentBackgroundShader(library);
  return library;
}
