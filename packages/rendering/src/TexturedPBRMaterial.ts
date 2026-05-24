import { Material, type MaterialUniformDescriptor, type RenderState } from "./Material";
import { DEFAULT_PBR_ENVIRONMENT_INTENSITY, DEFAULT_PBR_PROCEDURAL_ENVIRONMENT_MAP } from "./PBRLightingDefaults";
import { Sampler } from "./Sampler";
import {
  DEFAULT_TEXTURED_PBR_CLEARCOAT_SPECULAR_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_SHADER_NAME,
  DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT
} from "./ShaderLibrary";
import { Texture } from "./Texture";
import { TextureBinding } from "./TextureBinding";

export type TexturedPBRTextureSlot =
  | "baseColor"
  | "normal"
  | "metallicRoughness"
  | "occlusion"
  | "emissive"
  | "clearcoat"
  | "clearcoatRoughness"
  | "clearcoatNormal"
  | "transmission"
  | "diffuseTransmission"
  | "diffuseTransmissionColor"
  | "volumeThickness"
  | "specular"
  | "specularColor"
  | "sheenColor"
  | "sheenRoughness"
  | "anisotropy"
  | "iridescence"
  | "iridescenceThickness";

export interface TexturedPBRMaterialOptions {
  readonly name?: string;
  readonly baseColor?: readonly [number, number, number, number];
  readonly renderState?: Partial<RenderState>;
  readonly metallic?: number;
  readonly roughness?: number;
  readonly environmentColor?: readonly [number, number, number];
  readonly environmentIntensity?: number;
  readonly proceduralEnvironmentMap?: TexturedPBRProceduralEnvironmentMapOptions;
  readonly environmentMapTexture?: TextureBinding;
  readonly environmentMapIntensity?: number;
  readonly environmentMapSpecularIntensity?: number;
  readonly materialEnvironmentSpecularScale?: number;
  readonly environmentMapRotation?: number;
  readonly environmentMapMipCount?: number;
  readonly environmentBrdfLutTexture?: TextureBinding;
  readonly emissiveColor?: readonly [number, number, number];
  readonly emissiveStrength?: number;
  readonly textureTexCoords?: Readonly<Partial<Record<TexturedPBRTextureSlot, number>>>;
  readonly baseColorTexture?: Texture;
  readonly baseColorSampler?: Sampler;
  readonly baseColorTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly normalTexture?: Texture;
  readonly normalSampler?: Sampler;
  readonly normalTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly normalScale?: number;
  readonly metallicRoughnessTexture?: Texture;
  readonly metallicRoughnessSampler?: Sampler;
  readonly metallicRoughnessTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly occlusionTexture?: Texture;
  readonly occlusionSampler?: Sampler;
  readonly occlusionTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly occlusionStrength?: number;
  readonly emissiveTexture?: Texture;
  readonly emissiveSampler?: Sampler;
  readonly emissiveTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly clearcoatFactor?: number;
  readonly clearcoatTexture?: Texture;
  readonly clearcoatSampler?: Sampler;
  readonly clearcoatTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly clearcoatRoughnessFactor?: number;
  readonly clearcoatRoughnessTexture?: Texture;
  readonly clearcoatRoughnessSampler?: Sampler;
  readonly clearcoatRoughnessTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly clearcoatNormalTexture?: Texture;
  readonly clearcoatNormalSampler?: Sampler;
  readonly clearcoatNormalTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly clearcoatNormalScale?: number;
  readonly transmissionFactor?: number;
  readonly transmissionTexture?: Texture;
  readonly transmissionSampler?: Sampler;
  readonly transmissionTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly transmissionFallbackEnergy?: number;
  readonly diffuseTransmissionFactor?: number;
  readonly diffuseTransmissionTexture?: Texture;
  readonly diffuseTransmissionSampler?: Sampler;
  readonly diffuseTransmissionTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly diffuseTransmissionColorFactor?: readonly [number, number, number];
  readonly diffuseTransmissionColorTexture?: Texture;
  readonly diffuseTransmissionColorSampler?: Sampler;
  readonly diffuseTransmissionColorTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly volumeThicknessFactor?: number;
  readonly volumeThicknessTexture?: Texture;
  readonly volumeThicknessSampler?: Sampler;
  readonly volumeThicknessTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly volumeAttenuationDistance?: number;
  readonly volumeAttenuationColor?: readonly [number, number, number];
  readonly transmissionParallaxStrength?: number;
  readonly transmissionParallaxBoxMin?: readonly [number, number, number];
  readonly transmissionParallaxBoxMax?: readonly [number, number, number];
  readonly transmissionBounceCount?: number;
  readonly transmissionCausticStrength?: number;
  readonly transmissionBackdropTexture?: TextureBinding;
  readonly transmissionBackdropStrength?: number;
  readonly transmissionBackdropResolution?: readonly [number, number];
  readonly transmissionBackdropMipCount?: number;
  readonly transmissionBackdropRefractionScale?: number;
  readonly ior?: number;
  readonly specularFactor?: number;
  readonly specularTexture?: Texture;
  readonly specularSampler?: Sampler;
  readonly specularTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly specularColorFactor?: readonly [number, number, number];
  readonly specularColorTexture?: Texture;
  readonly specularColorSampler?: Sampler;
  readonly specularColorTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly sheenColorFactor?: readonly [number, number, number];
  readonly sheenColorTexture?: Texture;
  readonly sheenColorSampler?: Sampler;
  readonly sheenColorTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly sheenRoughnessFactor?: number;
  readonly sheenRoughnessTexture?: Texture;
  readonly sheenRoughnessSampler?: Sampler;
  readonly sheenRoughnessTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly anisotropyStrength?: number;
  readonly anisotropyRotation?: number;
  readonly anisotropyTexture?: Texture;
  readonly anisotropySampler?: Sampler;
  readonly anisotropyTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly iridescenceFactor?: number;
  readonly iridescenceTexture?: Texture;
  readonly iridescenceSampler?: Sampler;
  readonly iridescenceTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly iridescenceIor?: number;
  readonly iridescenceThicknessMinimum?: number;
  readonly iridescenceThicknessMaximum?: number;
  readonly iridescenceThicknessTexture?: Texture;
  readonly iridescenceThicknessSampler?: Sampler;
  readonly iridescenceThicknessTextureTransform?: {
    readonly offset?: readonly [number, number];
    readonly scale?: readonly [number, number];
    readonly rotation?: number;
  };
  readonly dispersion?: number;
}

export interface TexturedPBRProceduralEnvironmentMapOptions {
  readonly skyColor: readonly [number, number, number];
  readonly horizonColor: readonly [number, number, number];
  readonly groundColor: readonly [number, number, number];
  readonly specularColor: readonly [number, number, number];
  readonly intensity: number;
  readonly specularIntensity: number;
}

const BASE_TEXTURED_PBR_SHADER_TEXTURE_SLOTS: readonly TexturedPBRTextureSlot[] = [
  "baseColor",
  "normal",
  "metallicRoughness",
  "occlusion",
  "emissive"
];

const CLEARCOAT_TEXTURE_SLOTS: readonly TexturedPBRTextureSlot[] = [
  "clearcoat",
  "clearcoatRoughness",
  "clearcoatNormal"
];

const TRANSMISSION_VOLUME_TEXTURE_SLOTS: readonly TexturedPBRTextureSlot[] = [
  "transmission",
  "diffuseTransmission",
  "diffuseTransmissionColor",
  "volumeThickness"
];

const SPECULAR_TEXTURE_SLOTS: readonly TexturedPBRTextureSlot[] = [
  "specular",
  "specularColor"
];

const SHEEN_ANISOTROPY_TEXTURE_SLOTS: readonly TexturedPBRTextureSlot[] = [
  "sheenColor",
  "sheenRoughness",
  "anisotropy"
];

const IRIDESCENCE_TEXTURE_SLOTS: readonly TexturedPBRTextureSlot[] = [
  "iridescence",
  "iridescenceThickness"
];

export function texturedPbrShaderActiveTextureSlots(shaderVariant?: string): readonly TexturedPBRTextureSlot[] {
  const slots = new Set<TexturedPBRTextureSlot>(BASE_TEXTURED_PBR_SHADER_TEXTURE_SLOTS);
  if (
    shaderVariant === DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT ||
    shaderVariant === DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT ||
    shaderVariant === DEFAULT_TEXTURED_PBR_CLEARCOAT_SPECULAR_TEXTURES_VARIANT
  ) {
    for (const slot of CLEARCOAT_TEXTURE_SLOTS) slots.add(slot);
  }
  if (
    shaderVariant === DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT ||
    shaderVariant === DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT
  ) {
    for (const slot of TRANSMISSION_VOLUME_TEXTURE_SLOTS) slots.add(slot);
  }
  if (
    shaderVariant === DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT ||
    shaderVariant === DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT ||
    shaderVariant === DEFAULT_TEXTURED_PBR_CLEARCOAT_SPECULAR_TEXTURES_VARIANT
  ) {
    for (const slot of SPECULAR_TEXTURE_SLOTS) slots.add(slot);
  }
  if (
    shaderVariant === DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT ||
    shaderVariant === DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT
  ) {
    for (const slot of SHEEN_ANISOTROPY_TEXTURE_SLOTS) slots.add(slot);
  }
  if (
    shaderVariant === DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT ||
    shaderVariant === DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT
  ) {
    for (const slot of IRIDESCENCE_TEXTURE_SLOTS) slots.add(slot);
  }
  return [...slots];
}

export function isTexturedPbrTextureSlotShaderActive(slot: TexturedPBRTextureSlot, shaderVariant?: string): boolean {
  return texturedPbrShaderActiveTextureSlots(shaderVariant).includes(slot);
}

export class TexturedPBRMaterial extends Material {
  constructor(options: TexturedPBRMaterialOptions = {}) {
    const baseColor = options.baseColor ?? [1, 1, 1, 1];
    const environmentColor = options.environmentColor ?? [1, 1, 1];
    const proceduralEnvironmentMap: TexturedPBRProceduralEnvironmentMapOptions = options.proceduralEnvironmentMap ?? DEFAULT_PBR_PROCEDURAL_ENVIRONMENT_MAP;
    const emissiveColor = options.emissiveColor ?? [0, 0, 0];
    const specularColorFactor = options.specularColorFactor ?? [1, 1, 1];
    const diffuseTransmissionColorFactor = options.diffuseTransmissionColorFactor ?? [1, 1, 1];
    const sheenColorFactor = options.sheenColorFactor ?? [0, 0, 0];
    const volumeAttenuationColor = options.volumeAttenuationColor ?? [1, 1, 1];
    const transmissionParallaxBoxMin = options.transmissionParallaxBoxMin ?? [-1, -1, -1];
    const transmissionParallaxBoxMax = options.transmissionParallaxBoxMax ?? [1, 1, 1];
    const transmissionBackdropResolution = options.transmissionBackdropResolution ?? [1, 1];
    const shaderVariant = texturedPbrShaderVariant(options);
    const hasTransmissionBackdrop = Boolean(options.transmissionBackdropTexture);
    if (hasTransmissionBackdrop && shaderVariant) {
      throw new Error("TexturedPBRMaterial transmissionBackdropTexture currently requires the base textured PBR shader variant; combine advanced extension texture variants through a dedicated transmission pass.");
    }
    const transmissionBackdropUniformSchema: readonly MaterialUniformDescriptor[] = hasTransmissionBackdrop ? [
      { name: "u_transmissionBackdropTexture", kind: "texture2d", required: false },
      { name: "u_transmissionBackdropEnabled", kind: "float" },
      { name: "u_transmissionBackdropStrength", kind: "float" },
      { name: "u_transmissionBackdropResolution", kind: "vec2" },
      { name: "u_transmissionBackdropMipCount", kind: "float" },
      { name: "u_transmissionBackdropRefractionScale", kind: "float" }
    ] : [];
    validateColor4(baseColor, "baseColor");
    validateColor3(environmentColor, "environmentColor");
    validateProceduralEnvironmentMap(proceduralEnvironmentMap);
    validateNonNegative(options.environmentMapIntensity ?? 0, "environmentMapIntensity");
    validateNonNegative(options.environmentMapSpecularIntensity ?? 0, "environmentMapSpecularIntensity");
    validateFinite(options.environmentMapRotation ?? 0, "environmentMapRotation");
    validateMipCount(options.environmentMapMipCount ?? 1, "environmentMapMipCount");
    validateColor3(emissiveColor, "emissiveColor");
    validateNonNegativeColor3(specularColorFactor, "specularColorFactor");
    validateColor3(diffuseTransmissionColorFactor, "diffuseTransmissionColorFactor");
    validateColor3(sheenColorFactor, "sheenColorFactor");
    validateColor3(volumeAttenuationColor, "volumeAttenuationColor");
    validateUnit(options.metallic ?? 0, "metallic");
    validateUnit(options.roughness ?? 0.5, "roughness");
    validateNonNegative(options.environmentIntensity ?? DEFAULT_PBR_ENVIRONMENT_INTENSITY, "environmentIntensity");
    validateUnit(options.clearcoatFactor ?? 0, "clearcoatFactor");
    validateUnit(options.clearcoatRoughnessFactor ?? 0, "clearcoatRoughnessFactor");
    validateUnit(options.transmissionFactor ?? 0, "transmissionFactor");
    validateUnit(options.diffuseTransmissionFactor ?? 0, "diffuseTransmissionFactor");
    validateUnit(options.transmissionFallbackEnergy ?? 0.08, "transmissionFallbackEnergy");
    validateNonNegative(options.volumeThicknessFactor ?? 0, "volumeThicknessFactor");
    validatePositive(options.volumeAttenuationDistance ?? 1_000_000, "volumeAttenuationDistance");
    validateUnit(options.transmissionParallaxStrength ?? 0, "transmissionParallaxStrength");
    validateFiniteVec3(transmissionParallaxBoxMin, "transmissionParallaxBoxMin");
    validateFiniteVec3(transmissionParallaxBoxMax, "transmissionParallaxBoxMax");
    if (transmissionParallaxBoxMin.some((component, index) => component >= transmissionParallaxBoxMax[index]!)) {
      throw new RangeError("TexturedPBRMaterial transmissionParallaxBoxMin must be lower than transmissionParallaxBoxMax");
    }
    validateNonNegative(options.transmissionBounceCount ?? 0, "transmissionBounceCount");
    validateNonNegative(options.transmissionCausticStrength ?? 0, "transmissionCausticStrength");
    validateUnit(options.transmissionBackdropStrength ?? 0, "transmissionBackdropStrength");
    validatePositiveVec2(transmissionBackdropResolution, "transmissionBackdropResolution");
    validateMipCount(options.transmissionBackdropMipCount ?? 1, "transmissionBackdropMipCount");
    validateNonNegative(options.transmissionBackdropRefractionScale ?? 0.035, "transmissionBackdropRefractionScale");
    validateUnit(options.specularFactor ?? 1, "specularFactor");
    validateUnit(options.sheenRoughnessFactor ?? 0, "sheenRoughnessFactor");
    validateUnit(options.anisotropyStrength ?? 0, "anisotropyStrength");
    validateFinite(options.anisotropyRotation ?? 0, "anisotropyRotation");
    validateUnit(options.iridescenceFactor ?? 0, "iridescenceFactor");
    validateIridescenceIOR(options.iridescenceIor ?? 1.3);
    const iridescenceThicknessMinimum = options.iridescenceThicknessMinimum ?? 100;
    const iridescenceThicknessMaximum = options.iridescenceThicknessMaximum ?? 400;
    validateNonNegative(iridescenceThicknessMinimum, "iridescenceThicknessMinimum");
    validateNonNegative(iridescenceThicknessMaximum, "iridescenceThicknessMaximum");
    if (iridescenceThicknessMaximum < iridescenceThicknessMinimum) {
      throw new RangeError("TexturedPBRMaterial iridescenceThicknessMaximum must be greater than or equal to iridescenceThicknessMinimum");
    }
    validateNonNegative(options.dispersion ?? 0, "dispersion");
    validateIOR(options.ior ?? 1.5);
    validateNonNegative(options.emissiveStrength ?? 1, "emissiveStrength");
    const normalScale = options.normalScale ?? 1;
    if (!Number.isFinite(normalScale) || normalScale < 0) {
      throw new RangeError("TexturedPBRMaterial normalScale must be finite and non-negative");
    }
    const occlusionStrength = options.occlusionStrength ?? 1;
    validateUnit(occlusionStrength, "occlusionStrength");
    const clearcoatNormalScale = options.clearcoatNormalScale ?? 1;
    if (!Number.isFinite(clearcoatNormalScale) || clearcoatNormalScale < 0) {
      throw new RangeError("TexturedPBRMaterial clearcoatNormalScale must be finite and non-negative");
    }
    const requiresTangentFrame = Boolean(options.normalTexture || options.clearcoatNormalTexture);

    super({
      name: options.name ?? "textured-pbr",
      shaderKey: DEFAULT_TEXTURED_PBR_SHADER_NAME,
      shaderVariant,
      renderState: options.renderState,
      parameters: {
        u_baseColor: baseColor,
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
        u_materialEnvironmentSpecularScale: options.materialEnvironmentSpecularScale ?? 1,
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
        u_transmissionParallaxStrength: options.transmissionParallaxStrength ?? 0,
        u_transmissionParallaxBoxMin: transmissionParallaxBoxMin,
        u_transmissionParallaxBoxMax: transmissionParallaxBoxMax,
        u_transmissionBounceCount: options.transmissionBounceCount ?? 0,
        u_transmissionCausticStrength: options.transmissionCausticStrength ?? 0,
        u_transmissionBackdropTexture: options.transmissionBackdropTexture ?? new TextureBinding({ name: "u_transmissionBackdropTexture", required: false }),
        u_transmissionBackdropEnabled: options.transmissionBackdropTexture ? 1 : 0,
        u_transmissionBackdropStrength: options.transmissionBackdropStrength ?? 0,
        u_transmissionBackdropResolution: transmissionBackdropResolution,
        u_transmissionBackdropMipCount: options.transmissionBackdropMipCount ?? options.transmissionBackdropTexture?.texture?.textureLevels.length ?? 1,
        u_transmissionBackdropRefractionScale: options.transmissionBackdropRefractionScale ?? 0.035,
        u_ior: options.ior ?? 1.5,
        u_specularFactor: options.specularFactor ?? 1,
        u_specularColorFactor: specularColorFactor,
        u_sheenColorFactor: sheenColorFactor,
        u_sheenRoughnessFactor: options.sheenRoughnessFactor ?? 0,
        u_anisotropyStrength: options.anisotropyStrength ?? 0,
        u_anisotropyRotation: options.anisotropyRotation ?? 0,
        u_iridescenceFactor: options.iridescenceFactor ?? 0,
        u_iridescenceIor: options.iridescenceIor ?? 1.3,
        u_iridescenceThicknessMinimum: iridescenceThicknessMinimum,
        u_iridescenceThicknessMaximum: iridescenceThicknessMaximum,
        u_dispersion: options.dispersion ?? 0,
        u_lightCount: 0,
        u_lightData: new Float32Array(0),
        u_baseColorTexture: new TextureBinding({
          name: "u_baseColorTexture",
          texture: options.baseColorTexture ?? defaultWhiteTexture(),
          sampler: options.baseColorSampler,
          required: true,
          expectedColorSpace: "srgb",
          transform: options.baseColorTextureTransform
        }),
        u_baseColorTextureEnabled: options.baseColorTexture ? 1 : 0,
        u_baseColorTextureOffset: options.baseColorTextureTransform?.offset ?? [0, 0],
        u_baseColorTextureScale: options.baseColorTextureTransform?.scale ?? [1, 1],
        u_baseColorTextureRotation: options.baseColorTextureTransform?.rotation ?? 0,
        u_baseColorTextureTexCoord: textureTexCoord(options.textureTexCoords, "baseColor"),
        u_baseColorTextureWrap: samplerWrapMode(options.baseColorSampler),
        u_normalTexture: new TextureBinding({
          name: "u_normalTexture",
          texture: options.normalTexture ?? defaultFlatNormalTexture(),
          sampler: options.normalSampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.normalTextureTransform
        }),
        u_normalTextureEnabled: options.normalTexture ? 1 : 0,
        u_normalTextureOffset: options.normalTextureTransform?.offset ?? [0, 0],
        u_normalTextureScale: options.normalTextureTransform?.scale ?? [1, 1],
        u_normalTextureRotation: options.normalTextureTransform?.rotation ?? 0,
        u_normalTextureTexCoord: textureTexCoord(options.textureTexCoords, "normal"),
        u_normalTextureWrap: samplerWrapMode(options.normalSampler),
        u_normalScale: normalScale,
        u_metallicRoughnessTexture: new TextureBinding({
          name: "u_metallicRoughnessTexture",
          texture: options.metallicRoughnessTexture ?? defaultMetallicRoughnessTexture(),
          sampler: options.metallicRoughnessSampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.metallicRoughnessTextureTransform
        }),
        u_metallicRoughnessTextureEnabled: options.metallicRoughnessTexture ? 1 : 0,
        u_metallicRoughnessTextureOffset: options.metallicRoughnessTextureTransform?.offset ?? [0, 0],
        u_metallicRoughnessTextureScale: options.metallicRoughnessTextureTransform?.scale ?? [1, 1],
        u_metallicRoughnessTextureRotation: options.metallicRoughnessTextureTransform?.rotation ?? 0,
        u_metallicRoughnessTextureTexCoord: textureTexCoord(options.textureTexCoords, "metallicRoughness"),
        u_metallicRoughnessTextureWrap: samplerWrapMode(options.metallicRoughnessSampler),
        u_occlusionTexture: new TextureBinding({
          name: "u_occlusionTexture",
          texture: options.occlusionTexture ?? defaultLinearWhiteTexture("default-occlusion"),
          sampler: options.occlusionSampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.occlusionTextureTransform
        }),
        u_occlusionTextureEnabled: options.occlusionTexture ? 1 : 0,
        u_occlusionTextureOffset: options.occlusionTextureTransform?.offset ?? [0, 0],
        u_occlusionTextureScale: options.occlusionTextureTransform?.scale ?? [1, 1],
        u_occlusionTextureRotation: options.occlusionTextureTransform?.rotation ?? 0,
        u_occlusionTextureTexCoord: textureTexCoord(options.textureTexCoords, "occlusion"),
        u_occlusionTextureWrap: samplerWrapMode(options.occlusionSampler),
        u_occlusionStrength: occlusionStrength,
        u_emissiveTexture: new TextureBinding({
          name: "u_emissiveTexture",
          texture: options.emissiveTexture ?? defaultWhiteTexture(),
          sampler: options.emissiveSampler,
          required: true,
          expectedColorSpace: "srgb",
          transform: options.emissiveTextureTransform
        }),
        u_emissiveTextureEnabled: options.emissiveTexture ? 1 : 0,
        u_emissiveTextureOffset: options.emissiveTextureTransform?.offset ?? [0, 0],
        u_emissiveTextureScale: options.emissiveTextureTransform?.scale ?? [1, 1],
        u_emissiveTextureRotation: options.emissiveTextureTransform?.rotation ?? 0,
        u_emissiveTextureTexCoord: textureTexCoord(options.textureTexCoords, "emissive"),
        u_emissiveTextureWrap: samplerWrapMode(options.emissiveSampler),
        u_clearcoatTexture: new TextureBinding({
          name: "u_clearcoatTexture",
          texture: options.clearcoatTexture ?? defaultLinearWhiteTexture("default-clearcoat"),
          sampler: options.clearcoatSampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.clearcoatTextureTransform
        }),
        u_clearcoatTextureEnabled: options.clearcoatTexture ? 1 : 0,
        u_clearcoatTextureOffset: options.clearcoatTextureTransform?.offset ?? [0, 0],
        u_clearcoatTextureScale: options.clearcoatTextureTransform?.scale ?? [1, 1],
        u_clearcoatTextureRotation: options.clearcoatTextureTransform?.rotation ?? 0,
        u_clearcoatTextureTexCoord: textureTexCoord(options.textureTexCoords, "clearcoat"),
        u_clearcoatTextureWrap: samplerWrapMode(options.clearcoatSampler),
        u_clearcoatRoughnessTexture: new TextureBinding({
          name: "u_clearcoatRoughnessTexture",
          texture: options.clearcoatRoughnessTexture ?? defaultLinearWhiteTexture("default-clearcoat-roughness"),
          sampler: options.clearcoatRoughnessSampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.clearcoatRoughnessTextureTransform
        }),
        u_clearcoatRoughnessTextureEnabled: options.clearcoatRoughnessTexture ? 1 : 0,
        u_clearcoatRoughnessTextureOffset: options.clearcoatRoughnessTextureTransform?.offset ?? [0, 0],
        u_clearcoatRoughnessTextureScale: options.clearcoatRoughnessTextureTransform?.scale ?? [1, 1],
        u_clearcoatRoughnessTextureRotation: options.clearcoatRoughnessTextureTransform?.rotation ?? 0,
        u_clearcoatRoughnessTextureTexCoord: textureTexCoord(options.textureTexCoords, "clearcoatRoughness"),
        u_clearcoatRoughnessTextureWrap: samplerWrapMode(options.clearcoatRoughnessSampler),
        u_clearcoatNormalTexture: new TextureBinding({
          name: "u_clearcoatNormalTexture",
          texture: options.clearcoatNormalTexture ?? defaultFlatNormalTexture(),
          sampler: options.clearcoatNormalSampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.clearcoatNormalTextureTransform
        }),
        u_clearcoatNormalTextureEnabled: options.clearcoatNormalTexture ? 1 : 0,
        u_clearcoatNormalTextureOffset: options.clearcoatNormalTextureTransform?.offset ?? [0, 0],
        u_clearcoatNormalTextureScale: options.clearcoatNormalTextureTransform?.scale ?? [1, 1],
        u_clearcoatNormalTextureRotation: options.clearcoatNormalTextureTransform?.rotation ?? 0,
        u_clearcoatNormalTextureTexCoord: textureTexCoord(options.textureTexCoords, "clearcoatNormal"),
        u_clearcoatNormalTextureWrap: samplerWrapMode(options.clearcoatNormalSampler),
        u_clearcoatNormalScale: clearcoatNormalScale,
        u_transmissionTexture: new TextureBinding({
          name: "u_transmissionTexture",
          texture: options.transmissionTexture ?? defaultLinearWhiteTexture("default-transmission"),
          sampler: options.transmissionSampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.transmissionTextureTransform
        }),
        u_transmissionTextureEnabled: options.transmissionTexture ? 1 : 0,
        u_transmissionTextureOffset: options.transmissionTextureTransform?.offset ?? [0, 0],
        u_transmissionTextureScale: options.transmissionTextureTransform?.scale ?? [1, 1],
        u_transmissionTextureRotation: options.transmissionTextureTransform?.rotation ?? 0,
        u_transmissionTextureTexCoord: textureTexCoord(options.textureTexCoords, "transmission"),
        u_transmissionTextureWrap: samplerWrapMode(options.transmissionSampler),
        u_diffuseTransmissionTexture: new TextureBinding({
          name: "u_diffuseTransmissionTexture",
          texture: options.diffuseTransmissionTexture ?? defaultLinearWhiteTexture("default-diffuse-transmission"),
          sampler: options.diffuseTransmissionSampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.diffuseTransmissionTextureTransform
        }),
        u_diffuseTransmissionTextureEnabled: options.diffuseTransmissionTexture ? 1 : 0,
        u_diffuseTransmissionTextureOffset: options.diffuseTransmissionTextureTransform?.offset ?? [0, 0],
        u_diffuseTransmissionTextureScale: options.diffuseTransmissionTextureTransform?.scale ?? [1, 1],
        u_diffuseTransmissionTextureRotation: options.diffuseTransmissionTextureTransform?.rotation ?? 0,
        u_diffuseTransmissionTextureTexCoord: textureTexCoord(options.textureTexCoords, "diffuseTransmission"),
        u_diffuseTransmissionTextureWrap: samplerWrapMode(options.diffuseTransmissionSampler),
        u_diffuseTransmissionColorTexture: new TextureBinding({
          name: "u_diffuseTransmissionColorTexture",
          texture: options.diffuseTransmissionColorTexture ?? defaultWhiteTexture("default-diffuse-transmission-color"),
          sampler: options.diffuseTransmissionColorSampler,
          required: true,
          expectedColorSpace: "srgb",
          transform: options.diffuseTransmissionColorTextureTransform
        }),
        u_diffuseTransmissionColorTextureEnabled: options.diffuseTransmissionColorTexture ? 1 : 0,
        u_diffuseTransmissionColorTextureOffset: options.diffuseTransmissionColorTextureTransform?.offset ?? [0, 0],
        u_diffuseTransmissionColorTextureScale: options.diffuseTransmissionColorTextureTransform?.scale ?? [1, 1],
        u_diffuseTransmissionColorTextureRotation: options.diffuseTransmissionColorTextureTransform?.rotation ?? 0,
        u_diffuseTransmissionColorTextureTexCoord: textureTexCoord(options.textureTexCoords, "diffuseTransmissionColor"),
        u_diffuseTransmissionColorTextureWrap: samplerWrapMode(options.diffuseTransmissionColorSampler),
        u_volumeThicknessTexture: new TextureBinding({
          name: "u_volumeThicknessTexture",
          texture: options.volumeThicknessTexture ?? defaultLinearWhiteTexture("default-volume-thickness"),
          sampler: options.volumeThicknessSampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.volumeThicknessTextureTransform
        }),
        u_volumeThicknessTextureEnabled: options.volumeThicknessTexture ? 1 : 0,
        u_volumeThicknessTextureOffset: options.volumeThicknessTextureTransform?.offset ?? [0, 0],
        u_volumeThicknessTextureScale: options.volumeThicknessTextureTransform?.scale ?? [1, 1],
        u_volumeThicknessTextureRotation: options.volumeThicknessTextureTransform?.rotation ?? 0,
        u_volumeThicknessTextureTexCoord: textureTexCoord(options.textureTexCoords, "volumeThickness"),
        u_volumeThicknessTextureWrap: samplerWrapMode(options.volumeThicknessSampler),
        u_specularTexture: new TextureBinding({
          name: "u_specularTexture",
          texture: options.specularTexture ?? defaultLinearWhiteTexture("default-specular"),
          sampler: options.specularSampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.specularTextureTransform
        }),
        u_specularTextureEnabled: options.specularTexture ? 1 : 0,
        u_specularTextureOffset: options.specularTextureTransform?.offset ?? [0, 0],
        u_specularTextureScale: options.specularTextureTransform?.scale ?? [1, 1],
        u_specularTextureRotation: options.specularTextureTransform?.rotation ?? 0,
        u_specularTextureTexCoord: textureTexCoord(options.textureTexCoords, "specular"),
        u_specularTextureWrap: samplerWrapMode(options.specularSampler),
        u_specularColorTexture: new TextureBinding({
          name: "u_specularColorTexture",
          texture: options.specularColorTexture ?? defaultWhiteTexture("default-specular-color"),
          sampler: options.specularColorSampler,
          required: true,
          expectedColorSpace: "srgb",
          transform: options.specularColorTextureTransform
        }),
        u_specularColorTextureEnabled: options.specularColorTexture ? 1 : 0,
        u_specularColorTextureOffset: options.specularColorTextureTransform?.offset ?? [0, 0],
        u_specularColorTextureScale: options.specularColorTextureTransform?.scale ?? [1, 1],
        u_specularColorTextureRotation: options.specularColorTextureTransform?.rotation ?? 0,
        u_specularColorTextureTexCoord: textureTexCoord(options.textureTexCoords, "specularColor"),
        u_specularColorTextureWrap: samplerWrapMode(options.specularColorSampler),
        u_sheenColorTexture: new TextureBinding({
          name: "u_sheenColorTexture",
          texture: options.sheenColorTexture ?? defaultWhiteTexture("default-sheen-color"),
          sampler: options.sheenColorSampler,
          required: true,
          expectedColorSpace: "srgb",
          transform: options.sheenColorTextureTransform
        }),
        u_sheenColorTextureEnabled: options.sheenColorTexture ? 1 : 0,
        u_sheenColorTextureOffset: options.sheenColorTextureTransform?.offset ?? [0, 0],
        u_sheenColorTextureScale: options.sheenColorTextureTransform?.scale ?? [1, 1],
        u_sheenColorTextureRotation: options.sheenColorTextureTransform?.rotation ?? 0,
        u_sheenColorTextureTexCoord: textureTexCoord(options.textureTexCoords, "sheenColor"),
        u_sheenColorTextureWrap: samplerWrapMode(options.sheenColorSampler),
        u_sheenRoughnessTexture: new TextureBinding({
          name: "u_sheenRoughnessTexture",
          texture: options.sheenRoughnessTexture ?? defaultLinearWhiteTexture("default-sheen-roughness"),
          sampler: options.sheenRoughnessSampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.sheenRoughnessTextureTransform
        }),
        u_sheenRoughnessTextureEnabled: options.sheenRoughnessTexture ? 1 : 0,
        u_sheenRoughnessTextureOffset: options.sheenRoughnessTextureTransform?.offset ?? [0, 0],
        u_sheenRoughnessTextureScale: options.sheenRoughnessTextureTransform?.scale ?? [1, 1],
        u_sheenRoughnessTextureRotation: options.sheenRoughnessTextureTransform?.rotation ?? 0,
        u_sheenRoughnessTextureTexCoord: textureTexCoord(options.textureTexCoords, "sheenRoughness"),
        u_sheenRoughnessTextureWrap: samplerWrapMode(options.sheenRoughnessSampler),
        u_anisotropyTexture: new TextureBinding({
          name: "u_anisotropyTexture",
          texture: options.anisotropyTexture ?? defaultLinearWhiteTexture("default-anisotropy"),
          sampler: options.anisotropySampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.anisotropyTextureTransform
        }),
        u_anisotropyTextureEnabled: options.anisotropyTexture ? 1 : 0,
        u_anisotropyTextureOffset: options.anisotropyTextureTransform?.offset ?? [0, 0],
        u_anisotropyTextureScale: options.anisotropyTextureTransform?.scale ?? [1, 1],
        u_anisotropyTextureRotation: options.anisotropyTextureTransform?.rotation ?? 0,
        u_anisotropyTextureTexCoord: textureTexCoord(options.textureTexCoords, "anisotropy"),
        u_anisotropyTextureWrap: samplerWrapMode(options.anisotropySampler),
        u_iridescenceTexture: new TextureBinding({
          name: "u_iridescenceTexture",
          texture: options.iridescenceTexture ?? defaultLinearWhiteTexture("default-iridescence"),
          sampler: options.iridescenceSampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.iridescenceTextureTransform
        }),
        u_iridescenceTextureEnabled: options.iridescenceTexture ? 1 : 0,
        u_iridescenceTextureOffset: options.iridescenceTextureTransform?.offset ?? [0, 0],
        u_iridescenceTextureScale: options.iridescenceTextureTransform?.scale ?? [1, 1],
        u_iridescenceTextureRotation: options.iridescenceTextureTransform?.rotation ?? 0,
        u_iridescenceTextureTexCoord: textureTexCoord(options.textureTexCoords, "iridescence"),
        u_iridescenceTextureWrap: samplerWrapMode(options.iridescenceSampler),
        u_iridescenceThicknessTexture: new TextureBinding({
          name: "u_iridescenceThicknessTexture",
          texture: options.iridescenceThicknessTexture ?? defaultLinearWhiteTexture("default-iridescence-thickness"),
          sampler: options.iridescenceThicknessSampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.iridescenceThicknessTextureTransform
        }),
        u_iridescenceThicknessTextureEnabled: options.iridescenceThicknessTexture ? 1 : 0,
        u_iridescenceThicknessTextureOffset: options.iridescenceThicknessTextureTransform?.offset ?? [0, 0],
        u_iridescenceThicknessTextureScale: options.iridescenceThicknessTextureTransform?.scale ?? [1, 1],
        u_iridescenceThicknessTextureRotation: options.iridescenceThicknessTextureTransform?.rotation ?? 0,
        u_iridescenceThicknessTextureTexCoord: textureTexCoord(options.textureTexCoords, "iridescenceThickness"),
        u_iridescenceThicknessTextureWrap: samplerWrapMode(options.iridescenceThicknessSampler),
        u_modelViewProjection: identityMatrix(),
        u_normalMatrix: identityMatrix()
      },
      requiredAttributes: [
        "a_position",
        "a_normal",
        "a_uv",
        ...(requiresTangentFrame ? ["a_tangent"] : []),
        ...(usesSecondaryTexCoord(options.textureTexCoords) ? ["a_uv1"] : [])
      ],
      uniformSchema: [
        { name: "u_baseColor", kind: "vec4" },
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
        { name: "u_materialEnvironmentSpecularScale", kind: "float" },
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
        { name: "u_transmissionParallaxStrength", kind: "float" },
        { name: "u_transmissionParallaxBoxMin", kind: "vec3" },
        { name: "u_transmissionParallaxBoxMax", kind: "vec3" },
        { name: "u_transmissionBounceCount", kind: "float" },
        { name: "u_transmissionCausticStrength", kind: "float" },
        ...transmissionBackdropUniformSchema,
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
        { name: "u_baseColorTexture", kind: "texture2d" },
        { name: "u_baseColorTextureEnabled", kind: "float" },
        { name: "u_baseColorTextureOffset", kind: "vec2" },
        { name: "u_baseColorTextureScale", kind: "vec2" },
        { name: "u_baseColorTextureRotation", kind: "float" },
        { name: "u_baseColorTextureTexCoord", kind: "float" },
        { name: "u_baseColorTextureWrap", kind: "vec2" },
        { name: "u_normalTexture", kind: "texture2d" },
        { name: "u_normalTextureOffset", kind: "vec2" },
        { name: "u_normalTextureScale", kind: "vec2" },
        { name: "u_normalTextureRotation", kind: "float" },
        { name: "u_normalTextureTexCoord", kind: "float" },
        { name: "u_normalTextureWrap", kind: "vec2" },
        { name: "u_normalTextureEnabled", kind: "float" },
        { name: "u_normalScale", kind: "float" },
        { name: "u_metallicRoughnessTexture", kind: "texture2d" },
        { name: "u_metallicRoughnessTextureEnabled", kind: "float" },
        { name: "u_metallicRoughnessTextureOffset", kind: "vec2" },
        { name: "u_metallicRoughnessTextureScale", kind: "vec2" },
        { name: "u_metallicRoughnessTextureRotation", kind: "float" },
        { name: "u_metallicRoughnessTextureTexCoord", kind: "float" },
        { name: "u_metallicRoughnessTextureWrap", kind: "vec2" },
        { name: "u_occlusionTexture", kind: "texture2d" },
        { name: "u_occlusionTextureEnabled", kind: "float" },
        { name: "u_occlusionTextureOffset", kind: "vec2" },
        { name: "u_occlusionTextureScale", kind: "vec2" },
        { name: "u_occlusionTextureRotation", kind: "float" },
        { name: "u_occlusionTextureTexCoord", kind: "float" },
        { name: "u_occlusionTextureWrap", kind: "vec2" },
        { name: "u_occlusionStrength", kind: "float" },
        { name: "u_emissiveTexture", kind: "texture2d" },
        { name: "u_emissiveTextureEnabled", kind: "float" },
        { name: "u_emissiveTextureOffset", kind: "vec2" },
        { name: "u_emissiveTextureScale", kind: "vec2" },
        { name: "u_emissiveTextureRotation", kind: "float" },
        { name: "u_emissiveTextureTexCoord", kind: "float" },
        { name: "u_emissiveTextureWrap", kind: "vec2" },
        { name: "u_clearcoatTexture", kind: "texture2d", required: false },
        { name: "u_clearcoatTextureEnabled", kind: "float", required: false },
        { name: "u_clearcoatTextureOffset", kind: "vec2", required: false },
        { name: "u_clearcoatTextureScale", kind: "vec2", required: false },
        { name: "u_clearcoatTextureRotation", kind: "float", required: false },
        { name: "u_clearcoatTextureTexCoord", kind: "float", required: false },
        { name: "u_clearcoatTextureWrap", kind: "vec2", required: false },
        { name: "u_clearcoatRoughnessTexture", kind: "texture2d", required: false },
        { name: "u_clearcoatRoughnessTextureEnabled", kind: "float", required: false },
        { name: "u_clearcoatRoughnessTextureOffset", kind: "vec2", required: false },
        { name: "u_clearcoatRoughnessTextureScale", kind: "vec2", required: false },
        { name: "u_clearcoatRoughnessTextureRotation", kind: "float", required: false },
        { name: "u_clearcoatRoughnessTextureTexCoord", kind: "float", required: false },
        { name: "u_clearcoatRoughnessTextureWrap", kind: "vec2", required: false },
        { name: "u_clearcoatNormalTexture", kind: "texture2d", required: false },
        { name: "u_clearcoatNormalTextureEnabled", kind: "float", required: false },
        { name: "u_clearcoatNormalTextureOffset", kind: "vec2", required: false },
        { name: "u_clearcoatNormalTextureScale", kind: "vec2", required: false },
        { name: "u_clearcoatNormalTextureRotation", kind: "float", required: false },
        { name: "u_clearcoatNormalTextureTexCoord", kind: "float", required: false },
        { name: "u_clearcoatNormalTextureWrap", kind: "vec2", required: false },
        { name: "u_clearcoatNormalScale", kind: "float" },
        { name: "u_transmissionTexture", kind: "texture2d", required: false },
        { name: "u_transmissionTextureEnabled", kind: "float", required: false },
        { name: "u_transmissionTextureOffset", kind: "vec2", required: false },
        { name: "u_transmissionTextureScale", kind: "vec2", required: false },
        { name: "u_transmissionTextureRotation", kind: "float", required: false },
        { name: "u_transmissionTextureTexCoord", kind: "float", required: false },
        { name: "u_transmissionTextureWrap", kind: "vec2", required: false },
        { name: "u_diffuseTransmissionTexture", kind: "texture2d", required: false },
        { name: "u_diffuseTransmissionTextureEnabled", kind: "float", required: false },
        { name: "u_diffuseTransmissionTextureOffset", kind: "vec2", required: false },
        { name: "u_diffuseTransmissionTextureScale", kind: "vec2", required: false },
        { name: "u_diffuseTransmissionTextureRotation", kind: "float", required: false },
        { name: "u_diffuseTransmissionTextureTexCoord", kind: "float", required: false },
        { name: "u_diffuseTransmissionTextureWrap", kind: "vec2", required: false },
        { name: "u_diffuseTransmissionColorTexture", kind: "texture2d", required: false },
        { name: "u_diffuseTransmissionColorTextureEnabled", kind: "float", required: false },
        { name: "u_diffuseTransmissionColorTextureOffset", kind: "vec2", required: false },
        { name: "u_diffuseTransmissionColorTextureScale", kind: "vec2", required: false },
        { name: "u_diffuseTransmissionColorTextureRotation", kind: "float", required: false },
        { name: "u_diffuseTransmissionColorTextureTexCoord", kind: "float", required: false },
        { name: "u_diffuseTransmissionColorTextureWrap", kind: "vec2", required: false },
        { name: "u_volumeThicknessTexture", kind: "texture2d", required: false },
        { name: "u_volumeThicknessTextureEnabled", kind: "float", required: false },
        { name: "u_volumeThicknessTextureOffset", kind: "vec2", required: false },
        { name: "u_volumeThicknessTextureScale", kind: "vec2", required: false },
        { name: "u_volumeThicknessTextureRotation", kind: "float", required: false },
        { name: "u_volumeThicknessTextureTexCoord", kind: "float", required: false },
        { name: "u_volumeThicknessTextureWrap", kind: "vec2", required: false },
        { name: "u_specularTexture", kind: "texture2d", required: false },
        { name: "u_specularTextureEnabled", kind: "float", required: false },
        { name: "u_specularTextureOffset", kind: "vec2", required: false },
        { name: "u_specularTextureScale", kind: "vec2", required: false },
        { name: "u_specularTextureRotation", kind: "float", required: false },
        { name: "u_specularTextureTexCoord", kind: "float", required: false },
        { name: "u_specularTextureWrap", kind: "vec2", required: false },
        { name: "u_specularColorTexture", kind: "texture2d", required: false },
        { name: "u_specularColorTextureEnabled", kind: "float", required: false },
        { name: "u_specularColorTextureOffset", kind: "vec2", required: false },
        { name: "u_specularColorTextureScale", kind: "vec2", required: false },
        { name: "u_specularColorTextureRotation", kind: "float", required: false },
        { name: "u_specularColorTextureTexCoord", kind: "float", required: false },
        { name: "u_specularColorTextureWrap", kind: "vec2", required: false },
        { name: "u_sheenColorTexture", kind: "texture2d", required: false },
        { name: "u_sheenColorTextureEnabled", kind: "float", required: false },
        { name: "u_sheenColorTextureOffset", kind: "vec2", required: false },
        { name: "u_sheenColorTextureScale", kind: "vec2", required: false },
        { name: "u_sheenColorTextureRotation", kind: "float", required: false },
        { name: "u_sheenColorTextureTexCoord", kind: "float", required: false },
        { name: "u_sheenColorTextureWrap", kind: "vec2", required: false },
        { name: "u_sheenRoughnessTexture", kind: "texture2d", required: false },
        { name: "u_sheenRoughnessTextureEnabled", kind: "float", required: false },
        { name: "u_sheenRoughnessTextureOffset", kind: "vec2", required: false },
        { name: "u_sheenRoughnessTextureScale", kind: "vec2", required: false },
        { name: "u_sheenRoughnessTextureRotation", kind: "float", required: false },
        { name: "u_sheenRoughnessTextureTexCoord", kind: "float", required: false },
        { name: "u_sheenRoughnessTextureWrap", kind: "vec2", required: false },
        { name: "u_anisotropyTexture", kind: "texture2d", required: false },
        { name: "u_anisotropyTextureEnabled", kind: "float", required: false },
        { name: "u_anisotropyTextureOffset", kind: "vec2", required: false },
        { name: "u_anisotropyTextureScale", kind: "vec2", required: false },
        { name: "u_anisotropyTextureRotation", kind: "float", required: false },
        { name: "u_anisotropyTextureTexCoord", kind: "float", required: false },
        { name: "u_anisotropyTextureWrap", kind: "vec2", required: false },
        { name: "u_iridescenceTexture", kind: "texture2d", required: false },
        { name: "u_iridescenceTextureEnabled", kind: "float", required: false },
        { name: "u_iridescenceTextureOffset", kind: "vec2", required: false },
        { name: "u_iridescenceTextureScale", kind: "vec2", required: false },
        { name: "u_iridescenceTextureRotation", kind: "float", required: false },
        { name: "u_iridescenceTextureTexCoord", kind: "float", required: false },
        { name: "u_iridescenceTextureWrap", kind: "vec2", required: false },
        { name: "u_iridescenceThicknessTexture", kind: "texture2d", required: false },
        { name: "u_iridescenceThicknessTextureEnabled", kind: "float", required: false },
        { name: "u_iridescenceThicknessTextureOffset", kind: "vec2", required: false },
        { name: "u_iridescenceThicknessTextureScale", kind: "vec2", required: false },
        { name: "u_iridescenceThicknessTextureRotation", kind: "float", required: false },
        { name: "u_iridescenceThicknessTextureTexCoord", kind: "float", required: false },
        { name: "u_iridescenceThicknessTextureWrap", kind: "vec2", required: false },
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_normalMatrix", kind: "mat4" }
      ]
    });
  }
}

function validateNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`TexturedPBRMaterial ${label} must be finite and non-negative`);
  }
}

function textureTexCoord(
  texCoords: TexturedPBRMaterialOptions["textureTexCoords"],
  slot: TexturedPBRTextureSlot
): number {
  const value = texCoords?.[slot] ?? 0;
  if (!Number.isInteger(value) || value < 0 || value > 1) {
    throw new RangeError(`TexturedPBRMaterial ${slot} texCoord must be 0 or 1`);
  }
  return value;
}

function usesSecondaryTexCoord(texCoords: TexturedPBRMaterialOptions["textureTexCoords"]): boolean {
  return Object.values(texCoords ?? {}).some((value) => value === 1);
}

function samplerWrapMode(sampler: Sampler | undefined): readonly [number, number] {
  return [
    addressModeCode(sampler?.addressU ?? "clamp-to-edge"),
    addressModeCode(sampler?.addressV ?? "clamp-to-edge")
  ];
}

function addressModeCode(mode: Sampler["addressU"]): number {
  if (mode === "repeat") return 1;
  if (mode === "mirror-repeat") return 2;
  return 0;
}

function texturedPbrShaderVariant(options: TexturedPBRMaterialOptions): string | undefined {
  const hasClearcoatTextures = Boolean(options.clearcoatTexture || options.clearcoatRoughnessTexture || options.clearcoatNormalTexture);
  const hasTransmissionVolumeTextures = Boolean(
    options.transmissionTexture ||
    options.diffuseTransmissionTexture ||
    options.diffuseTransmissionColorTexture ||
    options.volumeThicknessTexture
  );
  const hasSpecularTextures = Boolean(options.specularTexture || options.specularColorTexture);
  const hasSheenAnisotropyTextures = Boolean(
    options.sheenColorTexture ||
    options.sheenRoughnessTexture ||
    options.anisotropyTexture
  );
  const hasSpecularSheenAnisotropyTextures = hasSpecularTextures || hasSheenAnisotropyTextures;
  const hasIridescenceTextures = Boolean(options.iridescenceTexture || options.iridescenceThicknessTexture);

  if (hasClearcoatTextures && hasSpecularTextures && !hasTransmissionVolumeTextures) {
    return DEFAULT_TEXTURED_PBR_CLEARCOAT_SPECULAR_TEXTURES_VARIANT;
  }
  if (hasClearcoatTextures && hasTransmissionVolumeTextures) {
    return DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT;
  }
  if (hasSpecularSheenAnisotropyTextures && hasIridescenceTextures) {
    return DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT;
  }
  if (hasClearcoatTextures) {
    return DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT;
  }
  if (hasTransmissionVolumeTextures) {
    return DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT;
  }
  if (hasSpecularSheenAnisotropyTextures) {
    return DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT;
  }
  if (hasIridescenceTextures) {
    return DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT;
  }
  return undefined;
}

function validatePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`TexturedPBRMaterial ${label} must be finite and positive`);
  }
}

function validateMipCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`TexturedPBRMaterial ${label} must be a positive integer`);
  }
}

function validateProceduralEnvironmentMap(value: TexturedPBRProceduralEnvironmentMapOptions): void {
  validateColor3(value.skyColor, "proceduralEnvironmentMap.skyColor");
  validateColor3(value.horizonColor, "proceduralEnvironmentMap.horizonColor");
  validateColor3(value.groundColor, "proceduralEnvironmentMap.groundColor");
  validateColor3(value.specularColor, "proceduralEnvironmentMap.specularColor");
  validateNonNegative(value.intensity, "proceduralEnvironmentMap.intensity");
  validateNonNegative(value.specularIntensity, "proceduralEnvironmentMap.specularIntensity");
}

function defaultWhiteTexture(label = "default-white"): Texture {
  return new Texture({ width: 1, height: 1, colorSpace: "srgb", label, data: new Uint8Array([255, 255, 255, 255]) });
}

function defaultLinearWhiteTexture(label = "default-linear-white"): Texture {
  return new Texture({ width: 1, height: 1, colorSpace: "linear", label, data: new Uint8Array([255, 255, 255, 255]) });
}

function defaultFlatNormalTexture(): Texture {
  return new Texture({ width: 1, height: 1, label: "default-flat-normal", data: new Uint8Array([128, 128, 255, 255]) });
}

function defaultMetallicRoughnessTexture(): Texture {
  return new Texture({ width: 1, height: 1, colorSpace: "linear", label: "default-metallic-roughness", data: new Uint8Array([255, 255, 255, 255]) });
}

function validateUnit(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`TexturedPBRMaterial ${label} must be finite and within [0, 1]`);
  }
}

function validateFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`TexturedPBRMaterial ${label} must be finite`);
  }
}

function validateIOR(value: number): void {
  if (!Number.isFinite(value) || value < 1) {
    throw new RangeError("TexturedPBRMaterial ior must be finite and at least 1");
  }
}

function validateIridescenceIOR(value: number): void {
  if (!Number.isFinite(value) || value < 1 || value > 3) {
    throw new RangeError("TexturedPBRMaterial iridescenceIor must be finite and within [1, 3]");
  }
}

function validateColor4(value: readonly number[], label: string): void {
  if (value.length !== 4 || value.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 1)) {
    throw new RangeError(`TexturedPBRMaterial ${label} must contain four finite values in [0, 1]`);
  }
}

function validateColor3(value: readonly number[], label: string): void {
  if (value.length !== 3 || value.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 1)) {
    throw new RangeError(`TexturedPBRMaterial ${label} must contain three finite values in [0, 1]`);
  }
}

function validateNonNegativeColor3(value: readonly number[], label: string): void {
  if (value.length !== 3 || value.some((channel) => !Number.isFinite(channel) || channel < 0)) {
    throw new RangeError(`TexturedPBRMaterial ${label} must contain three finite non-negative values`);
  }
}

function validateFiniteVec3(value: readonly number[], label: string): void {
  if (value.length !== 3 || value.some((channel) => !Number.isFinite(channel))) {
    throw new RangeError(`TexturedPBRMaterial ${label} must contain three finite values`);
  }
}

function validatePositiveVec2(value: readonly number[], label: string): void {
  if (value.length !== 2 || value.some((channel) => !Number.isFinite(channel) || channel <= 0)) {
    throw new RangeError(`TexturedPBRMaterial ${label} must contain two finite positive values`);
  }
}

function identityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}
