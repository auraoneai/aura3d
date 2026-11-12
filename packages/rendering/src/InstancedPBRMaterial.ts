import type { MaterialFeatureContext } from "./contracts/materialLobes";
import { Material, type RenderState } from "./Material";
import { legacyPhysicalDescriptor, physicalFeatureSet, withLivePhysicalMapFeatures } from "./materials/PhysicalFeatures";
import type { PhysicalFeatureSet } from "./materials/PhysicalMaterial";
import { DEFAULT_PBR_ENVIRONMENT_INTENSITY, DEFAULT_PBR_PROCEDURAL_ENVIRONMENT_MAP } from "./PBRLightingDefaults";
import { PBR_SURFACE_DETAIL_UNIFORM_SCHEMA, pbrSurfaceDetailParameters, type PBRSurfaceDetailOptions } from "./PBRMaterial";
import { DEFAULT_INSTANCED_PBR_SHADER_NAME } from "./ShaderLibraryCore";
import { TextureBinding } from "./TextureBinding";

export const MAX_INSTANCED_PBR_INSTANCES = 64;

export interface InstancedPBRMaterialOptions extends PBRSurfaceDetailOptions {
  readonly name?: string;
  readonly baseColor?: readonly [number, number, number, number];
  readonly renderState?: Partial<RenderState>;
  readonly metallic?: number;
  readonly roughness?: number;
  readonly environmentColor?: readonly [number, number, number];
  readonly environmentIntensity?: number;
  readonly envMapIntensity?: number;
  readonly proceduralEnvironmentMap?: InstancedPBRProceduralEnvironmentMapOptions;
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
  readonly clearcoatNormalScale?: number;
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
  /** threejs-parity L7/SR-02: three's `material.fog` — `false` opts this draw out of scene fog. */
  readonly fog?: boolean;
}

export interface InstancedPBRProceduralEnvironmentMapOptions {
  readonly skyColor: readonly [number, number, number];
  readonly horizonColor: readonly [number, number, number];
  readonly groundColor: readonly [number, number, number];
  readonly specularColor: readonly [number, number, number];
  readonly intensity: number;
  readonly specularIntensity: number;
}

export class InstancedPBRMaterial extends Material {
  private readonly prd04Options: InstancedPBRMaterialOptions;

  constructor(options: InstancedPBRMaterialOptions = {}) {
    const baseColor = options.baseColor ?? [1, 1, 1, 1];
    const environmentColor = options.environmentColor ?? [1, 1, 1];
    const proceduralEnvironmentMap: InstancedPBRProceduralEnvironmentMapOptions = options.proceduralEnvironmentMap ?? DEFAULT_PBR_PROCEDURAL_ENVIRONMENT_MAP;
    const emissiveColor = options.emissiveColor ?? [0, 0, 0];
    const specularColorFactor = options.specularColorFactor ?? [1, 1, 1];
    const sheenColorFactor = options.sheenColorFactor ?? [0, 0, 0];
    const diffuseTransmissionColorFactor = options.diffuseTransmissionColorFactor ?? [1, 1, 1];
    const volumeAttenuationColor = options.volumeAttenuationColor ?? [1, 1, 1];
    const iridescenceThicknessMinimum = options.iridescenceThicknessMinimum ?? 100;
    const iridescenceThicknessMaximum = options.iridescenceThicknessMaximum ?? 400;
    validateColor4(baseColor, "baseColor");
    validateColor3(environmentColor, "environmentColor");
    validateProceduralEnvironmentMap(proceduralEnvironmentMap);
    validateNonNegative(options.environmentMapIntensity ?? 0, "environmentMapIntensity");
    validateNonNegative(options.environmentMapSpecularIntensity ?? 0, "environmentMapSpecularIntensity");
    validateFinite(options.environmentMapRotation ?? 0, "environmentMapRotation");
    validateMipCount(options.environmentMapMipCount ?? 1);
    validateColor3(emissiveColor, "emissiveColor");
    validateNonNegativeColor3(specularColorFactor, "specularColorFactor");
    validateColor3(sheenColorFactor, "sheenColorFactor");
    validateColor3(diffuseTransmissionColorFactor, "diffuseTransmissionColorFactor");
    validateColor3(volumeAttenuationColor, "volumeAttenuationColor");
    validateUnit(options.metallic ?? 0, "metallic");
    validateUnit(options.roughness ?? 0.5, "roughness");
    validateNonNegative(options.environmentIntensity ?? DEFAULT_PBR_ENVIRONMENT_INTENSITY, "environmentIntensity");
    validateNonNegative(options.envMapIntensity ?? 1, "envMapIntensity");
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
    validateIridescenceIOR(options.iridescenceIor ?? 1.3);
    validateNonNegative(iridescenceThicknessMinimum, "iridescenceThicknessMinimum");
    validateNonNegative(iridescenceThicknessMaximum, "iridescenceThicknessMaximum");
    validateNonNegative(options.dispersion ?? 0, "dispersion");
    validateIOR(options.ior ?? 1.5);

    super({
      name: options.name ?? "instanced-pbr",
      shaderKey: DEFAULT_INSTANCED_PBR_SHADER_NAME,
      renderState: options.renderState,
      fog: options.fog,
      parameters: {
        ...pbrSurfaceDetailParameters(options),
        u_baseColor: baseColor,
        u_alphaCutoff: 0,
        u_metallic: options.metallic ?? 0,
        u_roughness: options.roughness ?? 0.5,
        u_environmentColor: environmentColor,
        u_environmentIntensity: options.environmentIntensity ?? DEFAULT_PBR_ENVIRONMENT_INTENSITY,
        u_materialEnvironmentIntensity: options.envMapIntensity ?? 1,
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
        u_iridescenceThicknessMinimum: iridescenceThicknessMinimum,
        u_iridescenceThicknessMaximum: iridescenceThicknessMaximum,
        u_dispersion: options.dispersion ?? 0,
        u_lightCount: 0,
        u_lightData: new Float32Array(0),
        u_instanceMatrices: defaultInstanceMatrices(),
        u_instanceCount: 1,
        u_instanceAttributeMode: 0,
        u_modelViewProjection: identityMatrix(),
        u_normalMatrix: identityMatrix()
      },
      requiredAttributes: [
        "a_position", "a_normal",
        ...(options.diffuseRoughnessTexture?.texture || options.bumpTexture?.texture ? ["a_uv"] : []),
        ...((options.diffuseRoughnessTexture?.texture && options.diffuseRoughnessTextureTexCoord === 1) ||
          (options.bumpTexture?.texture && options.bumpTextureTexCoord === 1) ? ["a_uv1"] : [])
      ],
      uniformSchema: [
        ...PBR_SURFACE_DETAIL_UNIFORM_SCHEMA,
        { name: "u_baseColor", kind: "vec4" },
        { name: "u_alphaCutoff", kind: "float" },
        { name: "u_metallic", kind: "float" },
        { name: "u_roughness", kind: "float" },
        { name: "u_environmentColor", kind: "vec3" },
        { name: "u_environmentIntensity", kind: "float" },
        { name: "u_materialEnvironmentIntensity", kind: "float" },
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
        { name: "u_instanceMatrices", kind: "any" },
        { name: "u_instanceCount", kind: "float" },
        { name: "u_instanceAttributeMode", kind: "float" },
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_normalMatrix", kind: "mat4" }
      ]
    });
    this.prd04Options = options;
  }

  /** C-03 `ProgramFeatureSource` (PRD-04 P3-1): generated-path features from this material's options. Pure — unread by the legacy path. */
  programFeatures(ctx: MaterialFeatureContext): PhysicalFeatureSet {
    return withLivePhysicalMapFeatures(physicalFeatureSet(legacyPhysicalDescriptor(this.prd04Options), ctx, { instancing: { color: false } }), this, ctx);
  }
}

function defaultInstanceMatrices(): Float32Array {
  const matrices = new Float32Array(MAX_INSTANCED_PBR_INSTANCES * 16);
  matrices.set(identityMatrix(), 0);
  return matrices;
}

function validateNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`InstancedPBRMaterial ${label} must be finite and non-negative`);
  }
}

function validateFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`InstancedPBRMaterial ${label} must be finite`);
  }
}

function validateMipCount(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError("InstancedPBRMaterial environmentMapMipCount must be a positive integer");
  }
}

function validateProceduralEnvironmentMap(value: InstancedPBRProceduralEnvironmentMapOptions): void {
  validateColor3(value.skyColor, "proceduralEnvironmentMap.skyColor");
  validateColor3(value.horizonColor, "proceduralEnvironmentMap.horizonColor");
  validateColor3(value.groundColor, "proceduralEnvironmentMap.groundColor");
  validateColor3(value.specularColor, "proceduralEnvironmentMap.specularColor");
  validateNonNegative(value.intensity, "proceduralEnvironmentMap.intensity");
  validateNonNegative(value.specularIntensity, "proceduralEnvironmentMap.specularIntensity");
}

function validateUnit(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`InstancedPBRMaterial ${label} must be finite and within [0, 1]`);
  }
}

function validateColor4(value: readonly number[], label: string): void {
  if (value.length !== 4 || value.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 1)) {
    throw new RangeError(`InstancedPBRMaterial ${label} must contain four finite values in [0, 1]`);
  }
}

function validateColor3(value: readonly number[], label: string): void {
  if (value.length !== 3 || value.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 1)) {
    throw new RangeError(`InstancedPBRMaterial ${label} must contain three finite values in [0, 1]`);
  }
}

function validateNonNegativeColor3(value: readonly number[], label: string): void {
  if (value.length !== 3 || value.some((channel) => !Number.isFinite(channel) || channel < 0)) {
    throw new RangeError(`InstancedPBRMaterial ${label} must contain three finite non-negative values`);
  }
}

function validatePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`InstancedPBRMaterial ${label} must be finite and positive`);
  }
}

function validateIOR(value: number): void {
  if (!Number.isFinite(value) || value < 1) {
    throw new RangeError("InstancedPBRMaterial ior must be finite and >= 1");
  }
}

function validateIridescenceIOR(value: number): void {
  if (!Number.isFinite(value) || value < 1) {
    throw new RangeError("InstancedPBRMaterial iridescenceIor must be finite and >= 1");
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
