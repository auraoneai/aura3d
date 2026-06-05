import { Material, type RenderState } from "./Material";
import { DEFAULT_PBR_ENVIRONMENT_INTENSITY, DEFAULT_PBR_PROCEDURAL_ENVIRONMENT_MAP } from "./PBRLightingDefaults";
import type { PBRProceduralEnvironmentMapOptions } from "./PBRMaterial";
import { DEFAULT_SKINNED_LIT_SHADER_NAME } from "./ShaderLibrary";
import { TextureBinding } from "./TextureBinding";

export interface SkinnedLitMaterialOptions {
  readonly name?: string;
  readonly color?: readonly [number, number, number, number];
  readonly baseColor?: readonly [number, number, number, number];
  readonly baseColorTexture?: TextureBinding;
  readonly baseColorTextureOffset?: readonly [number, number];
  readonly baseColorTextureScale?: readonly [number, number];
  readonly baseColorTextureRotation?: number;
  readonly normalTexture?: TextureBinding;
  readonly normalScale?: number;
  readonly metallicRoughnessTexture?: TextureBinding;
  readonly occlusionTexture?: TextureBinding;
  readonly occlusionStrength?: number;
  readonly emissiveTexture?: TextureBinding;
  readonly renderState?: Partial<RenderState>;
  readonly metallic?: number;
  readonly roughness?: number;
  readonly environmentColor?: readonly [number, number, number];
  readonly environmentIntensity?: number;
  readonly proceduralEnvironmentMap?: PBRProceduralEnvironmentMapOptions;
  readonly environmentMapTexture?: TextureBinding;
  readonly environmentMapIntensity?: number;
  readonly environmentMapSpecularIntensity?: number;
  readonly environmentMapRotation?: number;
  readonly environmentMapMipCount?: number;
  readonly environmentBrdfLutTexture?: TextureBinding;
  readonly emissiveColor?: readonly [number, number, number];
  readonly emissiveStrength?: number;
  readonly clearcoatFactor?: number;
  readonly clearcoatRoughnessFactor?: number;
  readonly transmissionFactor?: number;
  readonly diffuseTransmissionFactor?: number;
  readonly diffuseTransmissionColorFactor?: readonly [number, number, number];
  readonly transmissionFallbackEnergy?: number;
  readonly volumeThicknessFactor?: number;
  readonly volumeAttenuationDistance?: number;
  readonly volumeAttenuationColor?: readonly [number, number, number];
  readonly ior?: number;
  readonly specularFactor?: number;
  readonly specularColorFactor?: readonly [number, number, number];
  readonly sheenColorFactor?: readonly [number, number, number];
  readonly sheenRoughnessFactor?: number;
  readonly anisotropyStrength?: number;
  readonly anisotropyRotation?: number;
  readonly iridescenceFactor?: number;
  readonly iridescenceIor?: number;
  readonly iridescenceThicknessMinimum?: number;
  readonly iridescenceThicknessMaximum?: number;
  readonly dispersion?: number;
  readonly keyLightDirection?: readonly [number, number, number];
  readonly keyLightColor?: readonly [number, number, number];
  readonly fillLightColor?: readonly [number, number, number];
  readonly lightIntensity?: number;
  readonly maxJoints?: number;
}

export class SkinnedLitMaterial extends Material {
  public readonly maxJoints: number;

  constructor(options: SkinnedLitMaterialOptions = {}) {
    const baseColor = options.baseColor ?? options.color ?? [1, 1, 1, 1];
    const environmentColor = options.environmentColor ?? [1, 1, 1];
    const proceduralEnvironmentMap: PBRProceduralEnvironmentMapOptions = options.proceduralEnvironmentMap ?? DEFAULT_PBR_PROCEDURAL_ENVIRONMENT_MAP;
    const emissiveColor = options.emissiveColor ?? [0, 0, 0];
    const diffuseTransmissionColorFactor = options.diffuseTransmissionColorFactor ?? [1, 1, 1];
    const volumeAttenuationColor = options.volumeAttenuationColor ?? [1, 1, 1];
    const specularColorFactor = options.specularColorFactor ?? [1, 1, 1];
    const sheenColorFactor = options.sheenColorFactor ?? [0, 0, 0];
    validateColor4(baseColor, "baseColor");
    validateVec2(options.baseColorTextureOffset ?? [0, 0], "baseColorTextureOffset");
    validateVec2(options.baseColorTextureScale ?? [1, 1], "baseColorTextureScale");
    validateFinite(options.baseColorTextureRotation ?? 0, "baseColorTextureRotation");
    validateNonNegative(options.normalScale ?? 1, "normalScale");
    validateUnit(options.occlusionStrength ?? 1, "occlusionStrength");
    validateColor3(environmentColor, "environmentColor");
    validateColor3(emissiveColor, "emissiveColor");
    validateColor3(diffuseTransmissionColorFactor, "diffuseTransmissionColorFactor");
    validateColor3(volumeAttenuationColor, "volumeAttenuationColor");
    validateNonNegativeColor3(specularColorFactor, "specularColorFactor");
    validateColor3(sheenColorFactor, "sheenColorFactor");
    validateUnit(options.metallic ?? 0, "metallic");
    validateUnit(options.roughness ?? 0.5, "roughness");
    validateNonNegative(options.environmentIntensity ?? DEFAULT_PBR_ENVIRONMENT_INTENSITY, "environmentIntensity");
    validateProceduralEnvironmentMap(proceduralEnvironmentMap);
    validateNonNegative(options.environmentMapIntensity ?? 0, "environmentMapIntensity");
    validateNonNegative(options.environmentMapSpecularIntensity ?? 0, "environmentMapSpecularIntensity");
    validateFinite(options.environmentMapRotation ?? 0, "environmentMapRotation");
    validateMipCount(options.environmentMapMipCount ?? 1);
    validateNonNegative(options.emissiveStrength ?? 1, "emissiveStrength");
    validateUnit(options.clearcoatFactor ?? 0, "clearcoatFactor");
    validateUnit(options.clearcoatRoughnessFactor ?? 0, "clearcoatRoughnessFactor");
    validateUnit(options.transmissionFactor ?? 0, "transmissionFactor");
    validateUnit(options.diffuseTransmissionFactor ?? 0, "diffuseTransmissionFactor");
    validateUnit(options.transmissionFallbackEnergy ?? 0.08, "transmissionFallbackEnergy");
    validateNonNegative(options.volumeThicknessFactor ?? 0, "volumeThicknessFactor");
    validatePositive(options.volumeAttenuationDistance ?? 1_000_000, "volumeAttenuationDistance");
    validateUnit(options.specularFactor ?? 1, "specularFactor");
    validateUnit(options.sheenRoughnessFactor ?? 0, "sheenRoughnessFactor");
    validateUnit(options.anisotropyStrength ?? 0, "anisotropyStrength");
    validateFinite(options.anisotropyRotation ?? 0, "anisotropyRotation");
    validateUnit(options.iridescenceFactor ?? 0, "iridescenceFactor");
    validateFinite(options.iridescenceIor ?? 1.3, "iridescenceIor");
    validateNonNegative(options.iridescenceThicknessMinimum ?? 100, "iridescenceThicknessMinimum");
    validateNonNegative(options.iridescenceThicknessMaximum ?? 400, "iridescenceThicknessMaximum");
    validateNonNegative(options.dispersion ?? 0, "dispersion");
    validatePositive(options.ior ?? 1.5, "ior");
    const maxJoints = options.maxJoints ?? 96;
    if (!Number.isInteger(maxJoints) || maxJoints <= 0 || maxJoints > 96) {
      throw new Error("SkinnedLitMaterial maxJoints must be an integer in [1, 96]");
    }
    super({
      name: options.name ?? "skinned-lit",
      shaderKey: DEFAULT_SKINNED_LIT_SHADER_NAME,
      renderState: options.renderState,
      parameters: {
        u_baseColor: baseColor,
        u_baseColorTexture: options.baseColorTexture ?? new TextureBinding({ name: "u_baseColorTexture", required: false }),
        u_baseColorTextureEnabled: options.baseColorTexture ? 1 : 0,
        u_baseColorTextureOffset: options.baseColorTextureOffset ?? [0, 0],
        u_baseColorTextureScale: options.baseColorTextureScale ?? [1, 1],
        u_baseColorTextureRotation: options.baseColorTextureRotation ?? 0,
        u_normalTexture: options.normalTexture ?? new TextureBinding({ name: "u_normalTexture", required: false }),
        u_normalTextureEnabled: options.normalTexture ? 1 : 0,
        u_normalScale: options.normalScale ?? 1,
        u_metallicRoughnessTexture: options.metallicRoughnessTexture ?? new TextureBinding({ name: "u_metallicRoughnessTexture", required: false }),
        u_metallicRoughnessTextureEnabled: options.metallicRoughnessTexture ? 1 : 0,
        u_occlusionTexture: options.occlusionTexture ?? new TextureBinding({ name: "u_occlusionTexture", required: false }),
        u_occlusionTextureEnabled: options.occlusionTexture ? 1 : 0,
        u_occlusionStrength: options.occlusionStrength ?? 1,
        u_emissiveTexture: options.emissiveTexture ?? new TextureBinding({ name: "u_emissiveTexture", required: false }),
        u_emissiveTextureEnabled: options.emissiveTexture ? 1 : 0,
        u_alphaCutoff: 0,
        u_metallic: options.metallic ?? 0,
        u_roughness: options.roughness ?? 0.5,
        u_environmentColor: environmentColor,
        u_environmentIntensity: options.environmentIntensity ?? DEFAULT_PBR_ENVIRONMENT_INTENSITY,
        u_environmentSkyColor: proceduralEnvironmentMap.skyColor,
        u_environmentHorizonColor: proceduralEnvironmentMap.horizonColor,
        u_environmentGroundColor: proceduralEnvironmentMap.groundColor,
        u_environmentSpecularColor: proceduralEnvironmentMap.specularColor,
        u_environmentMapIntensity: proceduralEnvironmentMap.intensity,
        u_environmentSpecularIntensity: proceduralEnvironmentMap.specularIntensity,
        u_environmentMapTexture: options.environmentMapTexture ?? new TextureBinding({ name: "u_environmentMapTexture", required: false }),
        u_environmentMapTextureEnabled: options.environmentMapTexture ? 1 : 0,
        u_environmentMapTextureIntensity: options.environmentMapIntensity ?? 0,
        u_environmentMapTextureSpecularIntensity: options.environmentMapSpecularIntensity ?? 0,
        u_environmentMapTextureRotation: options.environmentMapRotation ?? 0,
        u_environmentMapTextureMipCount: options.environmentMapMipCount ?? 1,
        u_environmentMapTextureEncoding: 0,
        u_environmentBrdfLutTexture: options.environmentBrdfLutTexture ?? new TextureBinding({ name: "u_environmentBrdfLutTexture", required: false }),
        u_environmentBrdfLutEnabled: options.environmentBrdfLutTexture ? 1 : 0,
        u_emissiveColor: emissiveColor,
        u_emissiveStrength: options.emissiveStrength ?? 1,
        u_clearcoatFactor: options.clearcoatFactor ?? 0,
        u_clearcoatRoughnessFactor: options.clearcoatRoughnessFactor ?? 0,
        u_transmissionFactor: options.transmissionFactor ?? 0,
        u_diffuseTransmissionFactor: options.diffuseTransmissionFactor ?? 0,
        u_diffuseTransmissionColorFactor: diffuseTransmissionColorFactor,
        u_transmissionFallbackEnergy: options.transmissionFallbackEnergy ?? 0.08,
        u_volumeThicknessFactor: options.volumeThicknessFactor ?? 0,
        u_volumeAttenuationDistance: options.volumeAttenuationDistance ?? 1_000_000,
        u_volumeAttenuationColor: volumeAttenuationColor,
        u_ior: options.ior ?? 1.5,
        u_specularFactor: options.specularFactor ?? 1,
        u_specularColorFactor: specularColorFactor,
        u_sheenColorFactor: sheenColorFactor,
        u_sheenRoughnessFactor: options.sheenRoughnessFactor ?? 0,
        u_anisotropyStrength: options.anisotropyStrength ?? 0,
        u_anisotropyRotation: options.anisotropyRotation ?? 0,
        u_iridescenceFactor: options.iridescenceFactor ?? 0,
        u_iridescenceIor: options.iridescenceIor ?? 1.3,
        u_iridescenceThicknessMinimum: options.iridescenceThicknessMinimum ?? 100,
        u_iridescenceThicknessMaximum: options.iridescenceThicknessMaximum ?? 400,
        u_dispersion: options.dispersion ?? 0,
        u_lightCount: 0,
        u_lightData: new Float32Array(0),
        u_shadowMapTexture: new TextureBinding({ name: "u_shadowMapTexture", required: false }),
        u_shadowMapEnabled: 0,
        u_shadowMapMatrix: identityMatrix(),
        u_shadowMapStrength: 0,
        u_shadowMapBias: 0,
        u_shadowMapSlopeBias: 0,
        u_shadowMapTexelSize: [1, 1],
        u_shadowPcfSampleCount: 1,
        u_shadowPcfSamples: new Float32Array(32 * 4),
        u_outputColorSpace: 1,
        u_cameraPosition: [0, 0, 1],
        u_modelMatrix: identityMatrix(),
        u_normalMatrix: identityMatrix(),
        u_modelViewProjection: identityMatrix(),
        u_jointCount: 1,
        u_jointMatrices: identityMatrix()
      },
      requiredAttributes: [
        "a_position",
        "a_normal",
        ...(usesTextureCoordinates(options) ? ["a_uv"] : []),
        ...(options.normalTexture ? ["a_tangent"] : []),
        "a_joints",
        "a_weights"
      ],
      uniformSchema: [
        { name: "u_baseColor", kind: "vec4" },
        { name: "u_baseColorTexture", kind: "texture2d", required: false },
        { name: "u_baseColorTextureEnabled", kind: "float" },
        { name: "u_baseColorTextureOffset", kind: "vec2" },
        { name: "u_baseColorTextureScale", kind: "vec2" },
        { name: "u_baseColorTextureRotation", kind: "float" },
        { name: "u_normalTexture", kind: "texture2d", required: false },
        { name: "u_normalTextureEnabled", kind: "float" },
        { name: "u_normalScale", kind: "float" },
        { name: "u_metallicRoughnessTexture", kind: "texture2d", required: false },
        { name: "u_metallicRoughnessTextureEnabled", kind: "float" },
        { name: "u_occlusionTexture", kind: "texture2d", required: false },
        { name: "u_occlusionTextureEnabled", kind: "float" },
        { name: "u_occlusionStrength", kind: "float" },
        { name: "u_emissiveTexture", kind: "texture2d", required: false },
        { name: "u_emissiveTextureEnabled", kind: "float" },
        { name: "u_alphaCutoff", kind: "float" },
        { name: "u_metallic", kind: "float" },
        { name: "u_roughness", kind: "float" },
        { name: "u_environmentColor", kind: "vec3" },
        { name: "u_environmentIntensity", kind: "float" },
        { name: "u_environmentSkyColor", kind: "vec3" },
        { name: "u_environmentHorizonColor", kind: "vec3" },
        { name: "u_environmentGroundColor", kind: "vec3" },
        { name: "u_environmentSpecularColor", kind: "vec3" },
        { name: "u_environmentMapIntensity", kind: "float" },
        { name: "u_environmentSpecularIntensity", kind: "float" },
        { name: "u_environmentMapTexture", kind: "texture2d", required: false },
        { name: "u_environmentMapTextureEnabled", kind: "float" },
        { name: "u_environmentMapTextureIntensity", kind: "float" },
        { name: "u_environmentMapTextureSpecularIntensity", kind: "float" },
        { name: "u_environmentMapTextureRotation", kind: "float" },
        { name: "u_environmentMapTextureMipCount", kind: "float" },
        { name: "u_environmentMapTextureEncoding", kind: "float" },
        { name: "u_environmentBrdfLutTexture", kind: "texture2d", required: false },
        { name: "u_environmentBrdfLutEnabled", kind: "float", required: false },
        { name: "u_emissiveColor", kind: "vec3" },
        { name: "u_emissiveStrength", kind: "float" },
        { name: "u_clearcoatFactor", kind: "float" },
        { name: "u_clearcoatRoughnessFactor", kind: "float" },
        { name: "u_transmissionFactor", kind: "float" },
        { name: "u_diffuseTransmissionFactor", kind: "float" },
        { name: "u_diffuseTransmissionColorFactor", kind: "vec3" },
        { name: "u_transmissionFallbackEnergy", kind: "float" },
        { name: "u_volumeThicknessFactor", kind: "float" },
        { name: "u_volumeAttenuationDistance", kind: "float" },
        { name: "u_volumeAttenuationColor", kind: "vec3" },
        { name: "u_ior", kind: "float" },
        { name: "u_specularFactor", kind: "float" },
        { name: "u_specularColorFactor", kind: "vec3" },
        { name: "u_sheenColorFactor", kind: "vec3" },
        { name: "u_sheenRoughnessFactor", kind: "float" },
        { name: "u_anisotropyStrength", kind: "float" },
        { name: "u_anisotropyRotation", kind: "float" },
        { name: "u_iridescenceFactor", kind: "float" },
        { name: "u_iridescenceIor", kind: "float" },
        { name: "u_iridescenceThicknessMinimum", kind: "float" },
        { name: "u_iridescenceThicknessMaximum", kind: "float" },
        { name: "u_dispersion", kind: "float" },
        { name: "u_lightCount", kind: "float" },
        { name: "u_lightData", kind: "any" },
        { name: "u_shadowMapTexture", kind: "texture2d", required: false },
        { name: "u_shadowMapEnabled", kind: "float" },
        { name: "u_shadowMapMatrix", kind: "mat4" },
        { name: "u_shadowMapStrength", kind: "float" },
        { name: "u_shadowMapBias", kind: "float" },
        { name: "u_shadowMapSlopeBias", kind: "float" },
        { name: "u_shadowMapTexelSize", kind: "vec2" },
        { name: "u_shadowPcfSampleCount", kind: "float" },
        { name: "u_shadowPcfSamples", kind: "any" },
        { name: "u_outputColorSpace", kind: "float" },
        { name: "u_cameraPosition", kind: "vec3" },
        { name: "u_modelMatrix", kind: "mat4" },
        { name: "u_normalMatrix", kind: "mat4" },
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_jointCount", kind: "float" },
        { name: "u_jointMatrices", kind: "any" }
      ]
    });
    this.maxJoints = maxJoints;
  }
}

function usesTextureCoordinates(options: SkinnedLitMaterialOptions): boolean {
  return Boolean(options.baseColorTexture || options.normalTexture || options.metallicRoughnessTexture || options.occlusionTexture || options.emissiveTexture);
}

function validateColor4(color: readonly [number, number, number, number], label: string): void {
  if (color.length !== 4 || color.some((channel) => channel < 0 || channel > 1 || !Number.isFinite(channel))) {
    throw new Error(`SkinnedLitMaterial ${label} must contain four finite values in [0, 1]`);
  }
}

function validateColor3(color: readonly [number, number, number], label: string): void {
  if (color.length !== 3 || color.some((channel) => channel < 0 || channel > 1 || !Number.isFinite(channel))) {
    throw new Error(`SkinnedLitMaterial ${label} must contain three finite values in [0, 1]`);
  }
}

function validateNonNegativeColor3(color: readonly [number, number, number], label: string): void {
  if (color.length !== 3 || color.some((channel) => channel < 0 || !Number.isFinite(channel))) {
    throw new Error(`SkinnedLitMaterial ${label} must contain three finite non-negative values`);
  }
}

function validateVec2(value: readonly [number, number], label: string): void {
  if (value.length !== 2 || value.some((entry) => !Number.isFinite(entry))) {
    throw new Error(`SkinnedLitMaterial ${label} must contain two finite values`);
  }
}

function validateUnit(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`SkinnedLitMaterial ${label} must be finite and in [0, 1]`);
  }
}

function validateNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`SkinnedLitMaterial ${label} must be finite and non-negative`);
  }
}

function validateFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`SkinnedLitMaterial ${label} must be finite`);
  }
}

function validatePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`SkinnedLitMaterial ${label} must be finite and positive`);
  }
}

function validateMipCount(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("SkinnedLitMaterial environmentMapMipCount must be a positive integer");
  }
}

function validateProceduralEnvironmentMap(value: PBRProceduralEnvironmentMapOptions): void {
  validateColor3(value.skyColor, "proceduralEnvironmentMap.skyColor");
  validateColor3(value.horizonColor, "proceduralEnvironmentMap.horizonColor");
  validateColor3(value.groundColor, "proceduralEnvironmentMap.groundColor");
  validateColor3(value.specularColor, "proceduralEnvironmentMap.specularColor");
  validateNonNegative(value.intensity, "proceduralEnvironmentMap.intensity");
  validateNonNegative(value.specularIntensity, "proceduralEnvironmentMap.specularIntensity");
}

function identityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}
