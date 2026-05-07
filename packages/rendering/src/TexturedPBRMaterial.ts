import { Material, type RenderState } from "./Material";
import { Sampler } from "./Sampler";
import { DEFAULT_TEXTURED_PBR_SHADER_NAME } from "./ShaderLibrary";
import { Texture } from "./Texture";
import { TextureBinding } from "./TextureBinding";

export interface TexturedPBRMaterialOptions {
  readonly name?: string;
  readonly baseColor?: readonly [number, number, number, number];
  readonly renderState?: Partial<RenderState>;
  readonly metallic?: number;
  readonly roughness?: number;
  readonly emissiveColor?: readonly [number, number, number];
  readonly emissiveStrength?: number;
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

export class TexturedPBRMaterial extends Material {
  constructor(options: TexturedPBRMaterialOptions = {}) {
    const baseColor = options.baseColor ?? [1, 1, 1, 1];
    const emissiveColor = options.emissiveColor ?? [1, 1, 1];
    const specularColorFactor = options.specularColorFactor ?? [1, 1, 1];
    const diffuseTransmissionColorFactor = options.diffuseTransmissionColorFactor ?? [1, 1, 1];
    const sheenColorFactor = options.sheenColorFactor ?? [0, 0, 0];
    const volumeAttenuationColor = options.volumeAttenuationColor ?? [1, 1, 1];
    validateColor4(baseColor, "baseColor");
    validateColor3(emissiveColor, "emissiveColor");
    validateColor3(specularColorFactor, "specularColorFactor");
    validateColor3(diffuseTransmissionColorFactor, "diffuseTransmissionColorFactor");
    validateColor3(sheenColorFactor, "sheenColorFactor");
    validateColor3(volumeAttenuationColor, "volumeAttenuationColor");
    validateUnit(options.metallic ?? 0, "metallic");
    validateUnit(options.roughness ?? 0.5, "roughness");
    validateUnit(options.clearcoatFactor ?? 0, "clearcoatFactor");
    validateUnit(options.clearcoatRoughnessFactor ?? 0, "clearcoatRoughnessFactor");
    validateUnit(options.transmissionFactor ?? 0, "transmissionFactor");
    validateUnit(options.diffuseTransmissionFactor ?? 0, "diffuseTransmissionFactor");
    validateNonNegative(options.volumeThicknessFactor ?? 0, "volumeThicknessFactor");
    validatePositive(options.volumeAttenuationDistance ?? 1_000_000, "volumeAttenuationDistance");
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

    super({
      name: options.name ?? "textured-pbr",
      shaderKey: DEFAULT_TEXTURED_PBR_SHADER_NAME,
      renderState: options.renderState,
      parameters: {
        u_baseColor: baseColor,
        u_metallic: options.metallic ?? 0,
        u_roughness: options.roughness ?? 0.5,
        u_emissiveColor: emissiveColor,
        u_emissiveStrength: options.emissiveStrength ?? 1,
        u_clearcoatFactor: options.clearcoatFactor ?? 0,
        u_clearcoatRoughnessFactor: options.clearcoatRoughnessFactor ?? 0,
        u_transmissionFactor: options.transmissionFactor ?? 0,
        u_diffuseTransmissionFactor: options.diffuseTransmissionFactor ?? 0,
        u_diffuseTransmissionColorFactor: diffuseTransmissionColorFactor,
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
        u_baseColorTextureOffset: options.baseColorTextureTransform?.offset ?? [0, 0],
        u_baseColorTextureScale: options.baseColorTextureTransform?.scale ?? [1, 1],
        u_baseColorTextureRotation: options.baseColorTextureTransform?.rotation ?? 0,
        u_normalTexture: new TextureBinding({
          name: "u_normalTexture",
          texture: options.normalTexture ?? defaultFlatNormalTexture(),
          sampler: options.normalSampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.normalTextureTransform
        }),
        u_normalTextureOffset: options.normalTextureTransform?.offset ?? [0, 0],
        u_normalTextureScale: options.normalTextureTransform?.scale ?? [1, 1],
        u_normalTextureRotation: options.normalTextureTransform?.rotation ?? 0,
        u_normalScale: normalScale,
        u_metallicRoughnessTexture: new TextureBinding({
          name: "u_metallicRoughnessTexture",
          texture: options.metallicRoughnessTexture ?? defaultMetallicRoughnessTexture(),
          sampler: options.metallicRoughnessSampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.metallicRoughnessTextureTransform
        }),
        u_metallicRoughnessTextureOffset: options.metallicRoughnessTextureTransform?.offset ?? [0, 0],
        u_metallicRoughnessTextureScale: options.metallicRoughnessTextureTransform?.scale ?? [1, 1],
        u_metallicRoughnessTextureRotation: options.metallicRoughnessTextureTransform?.rotation ?? 0,
        u_occlusionTexture: new TextureBinding({
          name: "u_occlusionTexture",
          texture: options.occlusionTexture ?? defaultLinearWhiteTexture("default-occlusion"),
          sampler: options.occlusionSampler,
          required: true,
          expectedColorSpace: "linear",
          transform: options.occlusionTextureTransform
        }),
        u_occlusionTextureOffset: options.occlusionTextureTransform?.offset ?? [0, 0],
        u_occlusionTextureScale: options.occlusionTextureTransform?.scale ?? [1, 1],
        u_occlusionTextureRotation: options.occlusionTextureTransform?.rotation ?? 0,
        u_occlusionStrength: occlusionStrength,
        u_emissiveTexture: new TextureBinding({
          name: "u_emissiveTexture",
          texture: options.emissiveTexture ?? defaultWhiteTexture(),
          sampler: options.emissiveSampler,
          required: true,
          expectedColorSpace: "srgb",
          transform: options.emissiveTextureTransform
        }),
        u_emissiveTextureOffset: options.emissiveTextureTransform?.offset ?? [0, 0],
        u_emissiveTextureScale: options.emissiveTextureTransform?.scale ?? [1, 1],
        u_emissiveTextureRotation: options.emissiveTextureTransform?.rotation ?? 0,
        u_clearcoatTexture: new TextureBinding({
          name: "u_clearcoatTexture",
          texture: options.clearcoatTexture ?? defaultWhiteTexture("default-clearcoat"),
          sampler: options.clearcoatSampler,
          required: true,
          transform: options.clearcoatTextureTransform
        }),
        u_clearcoatTextureOffset: options.clearcoatTextureTransform?.offset ?? [0, 0],
        u_clearcoatTextureScale: options.clearcoatTextureTransform?.scale ?? [1, 1],
        u_clearcoatTextureRotation: options.clearcoatTextureTransform?.rotation ?? 0,
        u_clearcoatRoughnessTexture: new TextureBinding({
          name: "u_clearcoatRoughnessTexture",
          texture: options.clearcoatRoughnessTexture ?? defaultWhiteTexture("default-clearcoat-roughness"),
          sampler: options.clearcoatRoughnessSampler,
          required: true,
          transform: options.clearcoatRoughnessTextureTransform
        }),
        u_clearcoatRoughnessTextureOffset: options.clearcoatRoughnessTextureTransform?.offset ?? [0, 0],
        u_clearcoatRoughnessTextureScale: options.clearcoatRoughnessTextureTransform?.scale ?? [1, 1],
        u_clearcoatRoughnessTextureRotation: options.clearcoatRoughnessTextureTransform?.rotation ?? 0,
        u_clearcoatNormalTexture: new TextureBinding({
          name: "u_clearcoatNormalTexture",
          texture: options.clearcoatNormalTexture ?? defaultFlatNormalTexture(),
          sampler: options.clearcoatNormalSampler,
          required: true,
          transform: options.clearcoatNormalTextureTransform
        }),
        u_clearcoatNormalTextureOffset: options.clearcoatNormalTextureTransform?.offset ?? [0, 0],
        u_clearcoatNormalTextureScale: options.clearcoatNormalTextureTransform?.scale ?? [1, 1],
        u_clearcoatNormalTextureRotation: options.clearcoatNormalTextureTransform?.rotation ?? 0,
        u_clearcoatNormalScale: clearcoatNormalScale,
        u_transmissionTexture: new TextureBinding({
          name: "u_transmissionTexture",
          texture: options.transmissionTexture ?? defaultWhiteTexture("default-transmission"),
          sampler: options.transmissionSampler,
          required: true,
          transform: options.transmissionTextureTransform
        }),
        u_transmissionTextureOffset: options.transmissionTextureTransform?.offset ?? [0, 0],
        u_transmissionTextureScale: options.transmissionTextureTransform?.scale ?? [1, 1],
        u_transmissionTextureRotation: options.transmissionTextureTransform?.rotation ?? 0,
        u_diffuseTransmissionTexture: new TextureBinding({
          name: "u_diffuseTransmissionTexture",
          texture: options.diffuseTransmissionTexture ?? defaultLinearWhiteTexture("default-diffuse-transmission"),
          sampler: options.diffuseTransmissionSampler,
          required: true,
          transform: options.diffuseTransmissionTextureTransform
        }),
        u_diffuseTransmissionTextureOffset: options.diffuseTransmissionTextureTransform?.offset ?? [0, 0],
        u_diffuseTransmissionTextureScale: options.diffuseTransmissionTextureTransform?.scale ?? [1, 1],
        u_diffuseTransmissionTextureRotation: options.diffuseTransmissionTextureTransform?.rotation ?? 0,
        u_diffuseTransmissionColorTexture: new TextureBinding({
          name: "u_diffuseTransmissionColorTexture",
          texture: options.diffuseTransmissionColorTexture ?? defaultWhiteTexture("default-diffuse-transmission-color"),
          sampler: options.diffuseTransmissionColorSampler,
          required: true,
          transform: options.diffuseTransmissionColorTextureTransform
        }),
        u_diffuseTransmissionColorTextureOffset: options.diffuseTransmissionColorTextureTransform?.offset ?? [0, 0],
        u_diffuseTransmissionColorTextureScale: options.diffuseTransmissionColorTextureTransform?.scale ?? [1, 1],
        u_diffuseTransmissionColorTextureRotation: options.diffuseTransmissionColorTextureTransform?.rotation ?? 0,
        u_volumeThicknessTexture: new TextureBinding({
          name: "u_volumeThicknessTexture",
          texture: options.volumeThicknessTexture ?? defaultLinearWhiteTexture("default-volume-thickness"),
          sampler: options.volumeThicknessSampler,
          required: true,
          transform: options.volumeThicknessTextureTransform
        }),
        u_volumeThicknessTextureOffset: options.volumeThicknessTextureTransform?.offset ?? [0, 0],
        u_volumeThicknessTextureScale: options.volumeThicknessTextureTransform?.scale ?? [1, 1],
        u_volumeThicknessTextureRotation: options.volumeThicknessTextureTransform?.rotation ?? 0,
        u_specularTexture: new TextureBinding({
          name: "u_specularTexture",
          texture: options.specularTexture ?? defaultWhiteTexture("default-specular"),
          sampler: options.specularSampler,
          required: true,
          transform: options.specularTextureTransform
        }),
        u_specularTextureOffset: options.specularTextureTransform?.offset ?? [0, 0],
        u_specularTextureScale: options.specularTextureTransform?.scale ?? [1, 1],
        u_specularTextureRotation: options.specularTextureTransform?.rotation ?? 0,
        u_specularColorTexture: new TextureBinding({
          name: "u_specularColorTexture",
          texture: options.specularColorTexture ?? defaultWhiteTexture("default-specular-color"),
          sampler: options.specularColorSampler,
          required: true,
          transform: options.specularColorTextureTransform
        }),
        u_specularColorTextureOffset: options.specularColorTextureTransform?.offset ?? [0, 0],
        u_specularColorTextureScale: options.specularColorTextureTransform?.scale ?? [1, 1],
        u_specularColorTextureRotation: options.specularColorTextureTransform?.rotation ?? 0,
        u_sheenColorTexture: new TextureBinding({
          name: "u_sheenColorTexture",
          texture: options.sheenColorTexture ?? defaultWhiteTexture("default-sheen-color"),
          sampler: options.sheenColorSampler,
          required: true,
          transform: options.sheenColorTextureTransform
        }),
        u_sheenColorTextureOffset: options.sheenColorTextureTransform?.offset ?? [0, 0],
        u_sheenColorTextureScale: options.sheenColorTextureTransform?.scale ?? [1, 1],
        u_sheenColorTextureRotation: options.sheenColorTextureTransform?.rotation ?? 0,
        u_sheenRoughnessTexture: new TextureBinding({
          name: "u_sheenRoughnessTexture",
          texture: options.sheenRoughnessTexture ?? defaultWhiteTexture("default-sheen-roughness"),
          sampler: options.sheenRoughnessSampler,
          required: true,
          transform: options.sheenRoughnessTextureTransform
        }),
        u_sheenRoughnessTextureOffset: options.sheenRoughnessTextureTransform?.offset ?? [0, 0],
        u_sheenRoughnessTextureScale: options.sheenRoughnessTextureTransform?.scale ?? [1, 1],
        u_sheenRoughnessTextureRotation: options.sheenRoughnessTextureTransform?.rotation ?? 0,
        u_anisotropyTexture: new TextureBinding({
          name: "u_anisotropyTexture",
          texture: options.anisotropyTexture ?? defaultWhiteTexture("default-anisotropy"),
          sampler: options.anisotropySampler,
          required: true,
          transform: options.anisotropyTextureTransform
        }),
        u_anisotropyTextureOffset: options.anisotropyTextureTransform?.offset ?? [0, 0],
        u_anisotropyTextureScale: options.anisotropyTextureTransform?.scale ?? [1, 1],
        u_anisotropyTextureRotation: options.anisotropyTextureTransform?.rotation ?? 0,
        u_iridescenceTexture: new TextureBinding({
          name: "u_iridescenceTexture",
          texture: options.iridescenceTexture ?? defaultWhiteTexture("default-iridescence"),
          sampler: options.iridescenceSampler,
          required: true,
          transform: options.iridescenceTextureTransform
        }),
        u_iridescenceTextureOffset: options.iridescenceTextureTransform?.offset ?? [0, 0],
        u_iridescenceTextureScale: options.iridescenceTextureTransform?.scale ?? [1, 1],
        u_iridescenceTextureRotation: options.iridescenceTextureTransform?.rotation ?? 0,
        u_iridescenceThicknessTexture: new TextureBinding({
          name: "u_iridescenceThicknessTexture",
          texture: options.iridescenceThicknessTexture ?? defaultWhiteTexture("default-iridescence-thickness"),
          sampler: options.iridescenceThicknessSampler,
          required: true,
          transform: options.iridescenceThicknessTextureTransform
        }),
        u_iridescenceThicknessTextureOffset: options.iridescenceThicknessTextureTransform?.offset ?? [0, 0],
        u_iridescenceThicknessTextureScale: options.iridescenceThicknessTextureTransform?.scale ?? [1, 1],
        u_iridescenceThicknessTextureRotation: options.iridescenceThicknessTextureTransform?.rotation ?? 0,
        u_modelViewProjection: identityMatrix(),
        u_normalMatrix: identityMatrix()
      },
      requiredAttributes: ["a_position", "a_normal", "a_tangent", "a_uv"],
      uniformSchema: [
        { name: "u_baseColor", kind: "vec4" },
        { name: "u_metallic", kind: "float" },
        { name: "u_roughness", kind: "float" },
        { name: "u_emissiveColor", kind: "vec3" },
        { name: "u_emissiveStrength", kind: "float" },
        { name: "u_clearcoatFactor", kind: "float" },
        { name: "u_clearcoatRoughnessFactor", kind: "float" },
        { name: "u_transmissionFactor", kind: "float" },
        { name: "u_diffuseTransmissionFactor", kind: "float" },
        { name: "u_diffuseTransmissionColorFactor", kind: "vec3" },
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
        { name: "u_baseColorTexture", kind: "texture2d" },
        { name: "u_baseColorTextureOffset", kind: "vec2" },
        { name: "u_baseColorTextureScale", kind: "vec2" },
        { name: "u_baseColorTextureRotation", kind: "float" },
        { name: "u_normalTexture", kind: "texture2d" },
        { name: "u_normalTextureOffset", kind: "vec2" },
        { name: "u_normalTextureScale", kind: "vec2" },
        { name: "u_normalTextureRotation", kind: "float" },
        { name: "u_normalScale", kind: "float" },
        { name: "u_metallicRoughnessTexture", kind: "texture2d" },
        { name: "u_metallicRoughnessTextureOffset", kind: "vec2" },
        { name: "u_metallicRoughnessTextureScale", kind: "vec2" },
        { name: "u_metallicRoughnessTextureRotation", kind: "float" },
        { name: "u_occlusionTexture", kind: "texture2d" },
        { name: "u_occlusionTextureOffset", kind: "vec2" },
        { name: "u_occlusionTextureScale", kind: "vec2" },
        { name: "u_occlusionTextureRotation", kind: "float" },
        { name: "u_occlusionStrength", kind: "float" },
        { name: "u_emissiveTexture", kind: "texture2d" },
        { name: "u_emissiveTextureOffset", kind: "vec2" },
        { name: "u_emissiveTextureScale", kind: "vec2" },
        { name: "u_emissiveTextureRotation", kind: "float" },
        { name: "u_clearcoatTexture", kind: "texture2d" },
        { name: "u_clearcoatTextureOffset", kind: "vec2" },
        { name: "u_clearcoatTextureScale", kind: "vec2" },
        { name: "u_clearcoatTextureRotation", kind: "float" },
        { name: "u_clearcoatRoughnessTexture", kind: "texture2d" },
        { name: "u_clearcoatRoughnessTextureOffset", kind: "vec2" },
        { name: "u_clearcoatRoughnessTextureScale", kind: "vec2" },
        { name: "u_clearcoatRoughnessTextureRotation", kind: "float" },
        { name: "u_clearcoatNormalTexture", kind: "texture2d" },
        { name: "u_clearcoatNormalTextureOffset", kind: "vec2" },
        { name: "u_clearcoatNormalTextureScale", kind: "vec2" },
        { name: "u_clearcoatNormalTextureRotation", kind: "float" },
        { name: "u_clearcoatNormalScale", kind: "float" },
        { name: "u_transmissionTexture", kind: "texture2d" },
        { name: "u_transmissionTextureOffset", kind: "vec2" },
        { name: "u_transmissionTextureScale", kind: "vec2" },
        { name: "u_transmissionTextureRotation", kind: "float" },
        { name: "u_diffuseTransmissionTexture", kind: "texture2d" },
        { name: "u_diffuseTransmissionTextureOffset", kind: "vec2" },
        { name: "u_diffuseTransmissionTextureScale", kind: "vec2" },
        { name: "u_diffuseTransmissionTextureRotation", kind: "float" },
        { name: "u_diffuseTransmissionColorTexture", kind: "texture2d" },
        { name: "u_diffuseTransmissionColorTextureOffset", kind: "vec2" },
        { name: "u_diffuseTransmissionColorTextureScale", kind: "vec2" },
        { name: "u_diffuseTransmissionColorTextureRotation", kind: "float" },
        { name: "u_volumeThicknessTexture", kind: "texture2d" },
        { name: "u_volumeThicknessTextureOffset", kind: "vec2" },
        { name: "u_volumeThicknessTextureScale", kind: "vec2" },
        { name: "u_volumeThicknessTextureRotation", kind: "float" },
        { name: "u_specularTexture", kind: "texture2d" },
        { name: "u_specularTextureOffset", kind: "vec2" },
        { name: "u_specularTextureScale", kind: "vec2" },
        { name: "u_specularTextureRotation", kind: "float" },
        { name: "u_specularColorTexture", kind: "texture2d" },
        { name: "u_specularColorTextureOffset", kind: "vec2" },
        { name: "u_specularColorTextureScale", kind: "vec2" },
        { name: "u_specularColorTextureRotation", kind: "float" },
        { name: "u_sheenColorTexture", kind: "texture2d" },
        { name: "u_sheenColorTextureOffset", kind: "vec2" },
        { name: "u_sheenColorTextureScale", kind: "vec2" },
        { name: "u_sheenColorTextureRotation", kind: "float" },
        { name: "u_sheenRoughnessTexture", kind: "texture2d" },
        { name: "u_sheenRoughnessTextureOffset", kind: "vec2" },
        { name: "u_sheenRoughnessTextureScale", kind: "vec2" },
        { name: "u_sheenRoughnessTextureRotation", kind: "float" },
        { name: "u_anisotropyTexture", kind: "texture2d" },
        { name: "u_anisotropyTextureOffset", kind: "vec2" },
        { name: "u_anisotropyTextureScale", kind: "vec2" },
        { name: "u_anisotropyTextureRotation", kind: "float" },
        { name: "u_iridescenceTexture", kind: "texture2d" },
        { name: "u_iridescenceTextureOffset", kind: "vec2" },
        { name: "u_iridescenceTextureScale", kind: "vec2" },
        { name: "u_iridescenceTextureRotation", kind: "float" },
        { name: "u_iridescenceThicknessTexture", kind: "texture2d" },
        { name: "u_iridescenceThicknessTextureOffset", kind: "vec2" },
        { name: "u_iridescenceThicknessTextureScale", kind: "vec2" },
        { name: "u_iridescenceThicknessTextureRotation", kind: "float" },
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

function validatePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`TexturedPBRMaterial ${label} must be finite and positive`);
  }
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
  return new Texture({ width: 1, height: 1, colorSpace: "linear", label: "default-metallic-roughness", data: new Uint8Array([255, 128, 0, 255]) });
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

function identityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}
