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
export const DEFAULT_MORPH_UNLIT_SHADER_NAME = "galileo3d/morph-unlit";
export const DEFAULT_MORPH_UNLIT_SHADER_MARKER = "@galileo3d-shader:morph-unlit-v1";
export const DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME = "galileo3d/pbr-normal-map";
export const DEFAULT_NORMAL_MAPPED_PBR_SHADER_MARKER = "@galileo3d-shader:pbr-normal-map-v1";
export const DEFAULT_TEXTURED_PBR_SHADER_NAME = "galileo3d/pbr-textured";
export const DEFAULT_TEXTURED_PBR_SHADER_MARKER = "@galileo3d-shader:pbr-textured-v1";
export const DEFAULT_DEPTH_SHADER_NAME = "galileo3d/depth";
export const DEFAULT_DEPTH_SHADER_MARKER = "@galileo3d-shader:depth-v1";

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
out vec4 v_vertexColor;
void main() {
  v_vertexColor = a_color;
  gl_PointSize = 7.0;
  gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
}
`,
    fragment: `#version 300 es
// ${DEFAULT_UNLIT_SHADER_MARKER}
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
    name: DEFAULT_INSTANCED_UNLIT_SHADER_NAME,
    marker: DEFAULT_INSTANCED_UNLIT_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_INSTANCED_UNLIT_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
uniform mat4 u_modelViewProjection;
uniform mat4 u_instanceMatrices[64];
uniform float u_instanceCount;
void main() {
  int instanceIndex = clamp(gl_InstanceID, 0, max(int(u_instanceCount) - 1, 0));
  gl_Position = u_modelViewProjection * u_instanceMatrices[instanceIndex] * vec4(a_position, 1.0);
}
`,
    fragment: `#version 300 es
// ${DEFAULT_INSTANCED_UNLIT_SHADER_MARKER}
precision highp float;
uniform vec4 u_baseColor;
out vec4 outColor;
void main() {
  outColor = u_baseColor;
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
uniform float u_environmentMapTextureEnabled;
uniform float u_environmentMapTextureIntensity;
uniform float u_environmentMapTextureSpecularIntensity;
uniform float u_environmentMapTextureRotation;
uniform float u_environmentMapTextureMipCount;
uniform sampler2D u_environmentBrdfLutTexture;
uniform float u_environmentBrdfLutEnabled;
uniform vec3 u_emissiveColor;
uniform float u_emissiveStrength;
uniform float u_clearcoatFactor;
uniform float u_clearcoatRoughnessFactor;
uniform float u_transmissionFactor;
uniform float u_diffuseTransmissionFactor;
uniform vec3 u_diffuseTransmissionColorFactor;
uniform float u_volumeThicknessFactor;
uniform float u_volumeAttenuationDistance;
uniform vec3 u_volumeAttenuationColor;
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
uniform vec4 u_lightData[32];
in vec3 v_normal;
in vec3 v_worldPosition;
in vec4 v_vertexColor;
out vec4 outColor;
vec2 g3dEnvironmentEquirectUv(vec3 direction, float rotation) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / 6.28318530718 + 0.5 + rotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
void main() {
  vec3 normal = normalize(v_normal);
  vec3 shaded = u_emissiveColor * u_emissiveStrength;
  float environmentHemi = mix(0.35, 1.0, clamp(normal.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 ambientEnvironment = u_environmentColor * u_environmentIntensity * environmentHemi;
  float proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity);
  float skyBlend = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  float horizonBlend = 1.0 - abs(normal.y);
  vec3 proceduralDiffuse = mix(u_environmentGroundColor, u_environmentSkyColor, skyBlend);
  proceduralDiffuse = mix(proceduralDiffuse, u_environmentHorizonColor, clamp(horizonBlend, 0.0, 1.0) * 0.55);
  shaded += mix(ambientEnvironment, proceduralDiffuse * u_environmentMapIntensity, proceduralEnvironmentWeight);
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureIntensity);
  vec3 sampledDiffuse = texture(u_environmentMapTexture, g3dEnvironmentEquirectUv(normal, u_environmentMapTextureRotation)).rgb;
  shaded = mix(shaded, shaded + sampledDiffuse * u_environmentMapTextureIntensity, sampledEnvironmentWeight);
  int count = min(int(u_lightCount), 8);
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
      attenuation = clamp(1.0 - distanceToLight / range, 0.0, 1.0);
      attenuation *= attenuation;
    }
    if (kind > 1.5) {
      vec3 lightToFragment = normalize(v_worldPosition - positionRange.xyz);
      float cone = dot(normalize(directionKind.xyz), lightToFragment);
      float outer = cos(spotShadowLayer.x);
      float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    shaded += g3dLambert(normal, lightDirection, colorIntensity.rgb, colorIntensity.a * attenuation);
  }
  vec3 viewDirection = normalize(-v_worldPosition);
  vec3 reflectionDirection = reflect(-viewDirection, normal);
  float reflectionBand = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(18.0, 2.0, clamp(u_roughness, 0.0, 1.0)));
  float specularEnvironment = reflectionBand * (1.0 - clamp(u_roughness, 0.0, 1.0)) * mix(0.18, 1.0, clamp(u_metallic, 0.0, 1.0));
  shaded += u_environmentSpecularColor * u_environmentSpecularIntensity * specularEnvironment * proceduralEnvironmentWeight;
  float environmentLod = clamp(u_roughness, 0.0, 1.0) * max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledSpecular = textureLod(u_environmentMapTexture, g3dEnvironmentEquirectUv(reflectionDirection, u_environmentMapTextureRotation), environmentLod).rgb;
  float nDotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
  vec3 brdfLut = texture(u_environmentBrdfLutTexture, vec2(nDotV, clamp(u_roughness, 0.0, 1.0))).rgb;
  sampledSpecular *= mix(vec3(1.0), brdfLut, step(0.0001, u_environmentBrdfLutEnabled));
  shaded += sampledSpecular * u_environmentMapTextureSpecularIntensity * specularEnvironment * sampledEnvironmentWeight;
  vec3 base = g3dApplyAdvancedPbrLobes(
    g3dApplyMetalRough(u_baseColor.rgb * v_vertexColor.rgb, u_metallic, u_roughness),
    u_clearcoatFactor,
    u_clearcoatRoughnessFactor,
    u_transmissionFactor,
    u_diffuseTransmissionFactor,
    u_diffuseTransmissionColorFactor,
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
  float alpha = u_baseColor.a * v_vertexColor.a;
  if (alpha < u_alphaCutoff) discard;
  outColor = vec4(base * max(shaded, vec3(0.04)), alpha);
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
out vec3 v_normal;
out vec3 v_worldPosition;
void main() {
  int instanceIndex = clamp(gl_InstanceID, 0, max(int(u_instanceCount) - 1, 0));
  mat4 instanceMatrix = u_instanceMatrices[instanceIndex];
  vec4 worldPosition = u_modelMatrix * instanceMatrix * vec4(a_position, 1.0);
  v_normal = mat3(u_normalMatrix) * mat3(instanceMatrix) * a_normal;
  v_worldPosition = worldPosition.xyz;
  gl_Position = u_modelViewProjection * instanceMatrix * vec4(a_position, 1.0);
}
`,
    fragment: `#version 300 es
// ${DEFAULT_INSTANCED_PBR_SHADER_MARKER}
precision highp float;
#include <lighting_common>
#include <pbr_common>
uniform vec4 u_baseColor;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_emissiveColor;
uniform float u_emissiveStrength;
uniform float u_lightCount;
uniform vec4 u_lightData[32];
in vec3 v_normal;
in vec3 v_worldPosition;
out vec4 outColor;
void main() {
  vec3 shaded = u_emissiveColor * u_emissiveStrength;
  int count = min(int(u_lightCount), 8);
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
      attenuation = clamp(1.0 - distanceToLight / range, 0.0, 1.0);
      attenuation *= attenuation;
    }
    if (kind > 1.5) {
      vec3 lightToFragment = normalize(v_worldPosition - positionRange.xyz);
      float cone = dot(normalize(directionKind.xyz), lightToFragment);
      float outer = cos(spotShadowLayer.x);
      float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    shaded += g3dLambert(v_normal, lightDirection, colorIntensity.rgb, colorIntensity.a * attenuation);
  }
  vec3 base = g3dApplyMetalRough(u_baseColor.rgb, u_metallic, u_roughness);
  outColor = vec4(base * max(shaded, vec3(0.04)), u_baseColor.a);
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
uniform vec3 u_emissiveColor;
uniform float u_emissiveStrength;
uniform float u_clearcoatFactor;
uniform float u_clearcoatRoughnessFactor;
uniform float u_transmissionFactor;
uniform float u_diffuseTransmissionFactor;
uniform vec3 u_diffuseTransmissionColorFactor;
uniform float u_volumeThicknessFactor;
uniform float u_volumeAttenuationDistance;
uniform vec3 u_volumeAttenuationColor;
uniform float u_ior;
uniform float u_specularFactor;
uniform vec3 u_specularColorFactor;
uniform vec3 u_sheenColorFactor;
uniform float u_sheenRoughnessFactor;
uniform float u_lightCount;
uniform vec4 u_lightData[32];
uniform sampler2D u_normalTexture;
uniform float u_normalScale;
in vec3 v_normal;
in vec4 v_tangent;
in vec3 v_worldPosition;
in vec2 v_uv;
in vec4 v_vertexColor;
out vec4 outColor;
vec3 g3dNormalMappedNormal(vec3 baseNormal, vec4 tangentFrame, vec2 uv) {
  vec3 sampled = texture(u_normalTexture, uv).xyz * 2.0 - 1.0;
  vec3 n = normalize(baseNormal);
  vec3 tangent = normalize(tangentFrame.xyz);
  vec3 bitangent = normalize(cross(n, tangent) * tangentFrame.w);
  return normalize(tangent * sampled.x * u_normalScale + bitangent * sampled.y * u_normalScale + n * max(sampled.z, 0.001));
}
void main() {
  vec3 mappedNormal = g3dNormalMappedNormal(v_normal, v_tangent, v_uv);
  vec3 shaded = u_emissiveColor * u_emissiveStrength;
  int count = min(int(u_lightCount), 8);
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
      attenuation = clamp(1.0 - distanceToLight / range, 0.0, 1.0);
      attenuation *= attenuation;
    }
    if (kind > 1.5) {
      vec3 lightToFragment = normalize(v_worldPosition - positionRange.xyz);
      float cone = dot(normalize(directionKind.xyz), lightToFragment);
      float outer = cos(spotShadowLayer.x);
      float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    shaded += g3dLambert(mappedNormal, lightDirection, colorIntensity.rgb, colorIntensity.a * attenuation);
  }
  vec3 base = g3dApplyMetalRough(u_baseColor.rgb * v_vertexColor.rgb, u_metallic, u_roughness);
  float alpha = u_baseColor.a * v_vertexColor.a;
  if (alpha < u_alphaCutoff) discard;
  outColor = vec4(base * max(shaded, vec3(0.04)), alpha);
}
`
  });
  library.register({
    name: DEFAULT_TEXTURED_PBR_SHADER_NAME,
    marker: DEFAULT_TEXTURED_PBR_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_TEXTURED_PBR_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_uv;
layout(location = 3) in vec4 a_tangent;
layout(location = 4) in vec4 a_color;
uniform mat4 u_modelViewProjection;
uniform mat4 u_modelMatrix;
uniform mat4 u_normalMatrix;
out vec3 v_normal;
out vec4 v_tangent;
out vec3 v_worldPosition;
out vec2 v_uv;
out vec4 v_vertexColor;
void main() {
  v_uv = a_uv;
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
uniform vec3 u_emissiveColor;
uniform float u_emissiveStrength;
uniform float u_clearcoatFactor;
uniform float u_clearcoatRoughnessFactor;
uniform float u_transmissionFactor;
uniform float u_diffuseTransmissionFactor;
uniform vec3 u_diffuseTransmissionColorFactor;
uniform float u_volumeThicknessFactor;
uniform float u_volumeAttenuationDistance;
uniform vec3 u_volumeAttenuationColor;
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
uniform vec4 u_lightData[32];
uniform sampler2D u_baseColorTexture;
uniform vec2 u_baseColorTextureOffset;
uniform vec2 u_baseColorTextureScale;
uniform float u_baseColorTextureRotation;
uniform sampler2D u_normalTexture;
uniform vec2 u_normalTextureOffset;
uniform vec2 u_normalTextureScale;
uniform float u_normalTextureRotation;
uniform sampler2D u_emissiveTexture;
uniform vec2 u_emissiveTextureOffset;
uniform vec2 u_emissiveTextureScale;
uniform float u_emissiveTextureRotation;
uniform sampler2D u_metallicRoughnessTexture;
uniform vec2 u_metallicRoughnessTextureOffset;
uniform vec2 u_metallicRoughnessTextureScale;
uniform float u_metallicRoughnessTextureRotation;
uniform sampler2D u_occlusionTexture;
uniform vec2 u_occlusionTextureOffset;
uniform vec2 u_occlusionTextureScale;
uniform float u_occlusionTextureRotation;
uniform float u_occlusionStrength;
uniform sampler2D u_clearcoatTexture;
uniform vec2 u_clearcoatTextureOffset;
uniform vec2 u_clearcoatTextureScale;
uniform float u_clearcoatTextureRotation;
uniform sampler2D u_clearcoatRoughnessTexture;
uniform vec2 u_clearcoatRoughnessTextureOffset;
uniform vec2 u_clearcoatRoughnessTextureScale;
uniform float u_clearcoatRoughnessTextureRotation;
uniform sampler2D u_clearcoatNormalTexture;
uniform vec2 u_clearcoatNormalTextureOffset;
uniform vec2 u_clearcoatNormalTextureScale;
uniform float u_clearcoatNormalTextureRotation;
uniform float u_clearcoatNormalScale;
uniform sampler2D u_transmissionTexture;
uniform vec2 u_transmissionTextureOffset;
uniform vec2 u_transmissionTextureScale;
uniform float u_transmissionTextureRotation;
uniform sampler2D u_diffuseTransmissionTexture;
uniform vec2 u_diffuseTransmissionTextureOffset;
uniform vec2 u_diffuseTransmissionTextureScale;
uniform float u_diffuseTransmissionTextureRotation;
uniform sampler2D u_diffuseTransmissionColorTexture;
uniform vec2 u_diffuseTransmissionColorTextureOffset;
uniform vec2 u_diffuseTransmissionColorTextureScale;
uniform float u_diffuseTransmissionColorTextureRotation;
uniform sampler2D u_volumeThicknessTexture;
uniform vec2 u_volumeThicknessTextureOffset;
uniform vec2 u_volumeThicknessTextureScale;
uniform float u_volumeThicknessTextureRotation;
uniform sampler2D u_specularTexture;
uniform vec2 u_specularTextureOffset;
uniform vec2 u_specularTextureScale;
uniform float u_specularTextureRotation;
uniform sampler2D u_specularColorTexture;
uniform vec2 u_specularColorTextureOffset;
uniform vec2 u_specularColorTextureScale;
uniform float u_specularColorTextureRotation;
uniform sampler2D u_sheenColorTexture;
uniform vec2 u_sheenColorTextureOffset;
uniform vec2 u_sheenColorTextureScale;
uniform float u_sheenColorTextureRotation;
uniform sampler2D u_sheenRoughnessTexture;
uniform vec2 u_sheenRoughnessTextureOffset;
uniform vec2 u_sheenRoughnessTextureScale;
uniform float u_sheenRoughnessTextureRotation;
uniform sampler2D u_anisotropyTexture;
uniform vec2 u_anisotropyTextureOffset;
uniform vec2 u_anisotropyTextureScale;
uniform float u_anisotropyTextureRotation;
uniform sampler2D u_iridescenceTexture;
uniform vec2 u_iridescenceTextureOffset;
uniform vec2 u_iridescenceTextureScale;
uniform float u_iridescenceTextureRotation;
uniform sampler2D u_iridescenceThicknessTexture;
uniform vec2 u_iridescenceThicknessTextureOffset;
uniform vec2 u_iridescenceThicknessTextureScale;
uniform float u_iridescenceThicknessTextureRotation;
uniform float u_normalScale;
in vec3 v_normal;
in vec4 v_tangent;
in vec3 v_worldPosition;
in vec2 v_uv;
in vec4 v_vertexColor;
out vec4 outColor;
vec2 g3dTexturedPbrUv(vec2 uv, vec2 offset, vec2 scale, float rotation) {
  vec2 scaledUv = uv * scale;
  float c = cos(rotation);
  float s = sin(rotation);
  return vec2(scaledUv.x * c - scaledUv.y * s, scaledUv.x * s + scaledUv.y * c) + offset;
}
vec3 g3dTexturedPbrNormal(vec3 baseNormal, vec4 tangentFrame, vec2 uv) {
  vec3 sampled = texture(u_normalTexture, uv).xyz * 2.0 - 1.0;
  vec3 n = normalize(baseNormal);
  vec3 tangent = normalize(tangentFrame.xyz);
  vec3 bitangent = normalize(cross(n, tangent) * tangentFrame.w);
  return normalize(tangent * sampled.x * u_normalScale + bitangent * sampled.y * u_normalScale + n * max(sampled.z, 0.001));
}
void main() {
  vec2 baseColorUv = g3dTexturedPbrUv(v_uv, u_baseColorTextureOffset, u_baseColorTextureScale, u_baseColorTextureRotation);
  vec2 normalUv = g3dTexturedPbrUv(v_uv, u_normalTextureOffset, u_normalTextureScale, u_normalTextureRotation);
  vec2 emissiveUv = g3dTexturedPbrUv(v_uv, u_emissiveTextureOffset, u_emissiveTextureScale, u_emissiveTextureRotation);
  vec2 metallicRoughnessUv = g3dTexturedPbrUv(v_uv, u_metallicRoughnessTextureOffset, u_metallicRoughnessTextureScale, u_metallicRoughnessTextureRotation);
  vec2 occlusionUv = g3dTexturedPbrUv(v_uv, u_occlusionTextureOffset, u_occlusionTextureScale, u_occlusionTextureRotation);
  vec2 clearcoatUv = g3dTexturedPbrUv(v_uv, u_clearcoatTextureOffset, u_clearcoatTextureScale, u_clearcoatTextureRotation);
  vec2 clearcoatRoughnessUv = g3dTexturedPbrUv(v_uv, u_clearcoatRoughnessTextureOffset, u_clearcoatRoughnessTextureScale, u_clearcoatRoughnessTextureRotation);
  vec2 clearcoatNormalUv = g3dTexturedPbrUv(v_uv, u_clearcoatNormalTextureOffset, u_clearcoatNormalTextureScale, u_clearcoatNormalTextureRotation);
  vec2 transmissionUv = g3dTexturedPbrUv(v_uv, u_transmissionTextureOffset, u_transmissionTextureScale, u_transmissionTextureRotation);
  vec2 diffuseTransmissionUv = g3dTexturedPbrUv(v_uv, u_diffuseTransmissionTextureOffset, u_diffuseTransmissionTextureScale, u_diffuseTransmissionTextureRotation);
  vec2 diffuseTransmissionColorUv = g3dTexturedPbrUv(v_uv, u_diffuseTransmissionColorTextureOffset, u_diffuseTransmissionColorTextureScale, u_diffuseTransmissionColorTextureRotation);
  vec2 volumeThicknessUv = g3dTexturedPbrUv(v_uv, u_volumeThicknessTextureOffset, u_volumeThicknessTextureScale, u_volumeThicknessTextureRotation);
  vec2 specularUv = g3dTexturedPbrUv(v_uv, u_specularTextureOffset, u_specularTextureScale, u_specularTextureRotation);
  vec2 specularColorUv = g3dTexturedPbrUv(v_uv, u_specularColorTextureOffset, u_specularColorTextureScale, u_specularColorTextureRotation);
  vec2 sheenColorUv = g3dTexturedPbrUv(v_uv, u_sheenColorTextureOffset, u_sheenColorTextureScale, u_sheenColorTextureRotation);
  vec2 sheenRoughnessUv = g3dTexturedPbrUv(v_uv, u_sheenRoughnessTextureOffset, u_sheenRoughnessTextureScale, u_sheenRoughnessTextureRotation);
  vec2 anisotropyUv = g3dTexturedPbrUv(v_uv, u_anisotropyTextureOffset, u_anisotropyTextureScale, u_anisotropyTextureRotation);
  vec2 iridescenceUv = g3dTexturedPbrUv(v_uv, u_iridescenceTextureOffset, u_iridescenceTextureScale, u_iridescenceTextureRotation);
  vec2 iridescenceThicknessUv = g3dTexturedPbrUv(v_uv, u_iridescenceThicknessTextureOffset, u_iridescenceThicknessTextureScale, u_iridescenceThicknessTextureRotation);
  vec4 texturedBase = texture(u_baseColorTexture, baseColorUv) * u_baseColor * v_vertexColor;
  vec4 metallicRoughnessSample = texture(u_metallicRoughnessTexture, metallicRoughnessUv);
  float roughness = clamp(u_roughness * metallicRoughnessSample.g, 0.0, 1.0);
  float metallic = clamp(u_metallic * metallicRoughnessSample.b, 0.0, 1.0);
  float occlusion = mix(1.0, texture(u_occlusionTexture, occlusionUv).r, clamp(u_occlusionStrength, 0.0, 1.0));
  vec3 mappedNormal = g3dTexturedPbrNormal(v_normal, v_tangent, normalUv);
  vec3 clearcoatNormalSample = texture(u_clearcoatNormalTexture, clearcoatNormalUv).xyz * 2.0 - 1.0;
  float clearcoatNormalBoost = mix(1.0, clamp(clearcoatNormalSample.z, 0.0, 1.0), clamp(u_clearcoatNormalScale, 0.0, 1.0));
  float clearcoat = clamp(u_clearcoatFactor * texture(u_clearcoatTexture, clearcoatUv).r * clearcoatNormalBoost, 0.0, 1.0);
  float clearcoatRoughness = clamp(u_clearcoatRoughnessFactor * texture(u_clearcoatRoughnessTexture, clearcoatRoughnessUv).g, 0.0, 1.0);
  float transmission = clamp(u_transmissionFactor * texture(u_transmissionTexture, transmissionUv).r, 0.0, 1.0);
  float diffuseTransmission = clamp(u_diffuseTransmissionFactor * texture(u_diffuseTransmissionTexture, diffuseTransmissionUv).a, 0.0, 1.0);
  vec3 diffuseTransmissionColor = clamp(u_diffuseTransmissionColorFactor * texture(u_diffuseTransmissionColorTexture, diffuseTransmissionColorUv).rgb, vec3(0.0), vec3(1.0));
  float volumeThickness = max(u_volumeThicknessFactor * texture(u_volumeThicknessTexture, volumeThicknessUv).g, 0.0);
  float specular = clamp(u_specularFactor * texture(u_specularTexture, specularUv).a, 0.0, 1.0);
  vec3 specularColor = clamp(u_specularColorFactor * texture(u_specularColorTexture, specularColorUv).rgb, vec3(0.0), vec3(1.0));
  vec3 sheenColor = clamp(u_sheenColorFactor * texture(u_sheenColorTexture, sheenColorUv).rgb, vec3(0.0), vec3(1.0));
  float sheenRoughness = clamp(u_sheenRoughnessFactor * texture(u_sheenRoughnessTexture, sheenRoughnessUv).a, 0.0, 1.0);
  vec3 anisotropySample = texture(u_anisotropyTexture, anisotropyUv).rgb;
  float anisotropy = clamp(u_anisotropyStrength * anisotropySample.b, 0.0, 1.0);
  float anisotropyRotation = u_anisotropyRotation + atan(anisotropySample.g - 0.5, anisotropySample.r - 0.5);
  float iridescence = clamp(u_iridescenceFactor * texture(u_iridescenceTexture, iridescenceUv).r, 0.0, 1.0);
  float iridescenceThicknessMix = clamp(texture(u_iridescenceThicknessTexture, iridescenceThicknessUv).g, 0.0, 1.0);
  float iridescenceThickness = mix(u_iridescenceThicknessMinimum, u_iridescenceThicknessMaximum, iridescenceThicknessMix);
  vec3 shaded = texture(u_emissiveTexture, emissiveUv).rgb * u_emissiveColor * u_emissiveStrength;
  int count = min(int(u_lightCount), 8);
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
      attenuation = clamp(1.0 - distanceToLight / range, 0.0, 1.0);
      attenuation *= attenuation;
    }
    if (kind > 1.5) {
      vec3 lightToFragment = normalize(v_worldPosition - positionRange.xyz);
      float cone = dot(normalize(directionKind.xyz), lightToFragment);
      float outer = cos(spotShadowLayer.x);
      float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    shaded += g3dLambert(mappedNormal, lightDirection, colorIntensity.rgb, colorIntensity.a * attenuation);
  }
  vec3 base = g3dApplyAdvancedPbrLobes(
    g3dApplyMetalRough(texturedBase.rgb, metallic, roughness),
    clearcoat,
    clearcoatRoughness,
    transmission,
    diffuseTransmission,
    diffuseTransmissionColor,
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
  if (texturedBase.a < u_alphaCutoff) discard;
  outColor = vec4(base * max(shaded, vec3(0.04)) * occlusion, texturedBase.a);
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
void main() {
}
`
  });
  return library;
}
