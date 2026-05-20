import { Material, type RenderState } from "./Material";
import { DEFAULT_PBR_ENVIRONMENT_INTENSITY, DEFAULT_PBR_PROCEDURAL_ENVIRONMENT_MAP } from "./PBRLightingDefaults";
import { TextureBinding } from "./TextureBinding";

export const DEFAULT_PBR_SHADER_NAME = "galileo3d/pbr-direct";
export const DEFAULT_PBR_SHADER_MARKER = "@galileo3d-shader:pbr-direct-v1";

export interface PBRMaterialOptions {
  readonly name?: string;
  readonly baseColor?: readonly [number, number, number, number];
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
  readonly transmissionParallaxStrength?: number;
  readonly transmissionParallaxBoxMin?: readonly [number, number, number];
  readonly transmissionParallaxBoxMax?: readonly [number, number, number];
  readonly transmissionBounceCount?: number;
  readonly transmissionCausticStrength?: number;
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
}

export interface PBRProceduralEnvironmentMapOptions {
  readonly skyColor: readonly [number, number, number];
  readonly horizonColor: readonly [number, number, number];
  readonly groundColor: readonly [number, number, number];
  readonly specularColor: readonly [number, number, number];
  readonly intensity: number;
  readonly specularIntensity: number;
}

export class PBRMaterial extends Material {
  constructor(options: PBRMaterialOptions = {}) {
    const baseColor = options.baseColor ?? [1, 1, 1, 1];
    const environmentColor = options.environmentColor ?? [1, 1, 1];
    const proceduralEnvironmentMap: PBRProceduralEnvironmentMapOptions = options.proceduralEnvironmentMap ?? DEFAULT_PBR_PROCEDURAL_ENVIRONMENT_MAP;
    const emissiveColor = options.emissiveColor ?? [0, 0, 0];
    const specularColorFactor = options.specularColorFactor ?? [1, 1, 1];
    const diffuseTransmissionColorFactor = options.diffuseTransmissionColorFactor ?? [1, 1, 1];
    const sheenColorFactor = options.sheenColorFactor ?? [0, 0, 0];
    const volumeAttenuationColor = options.volumeAttenuationColor ?? [1, 1, 1];
    const transmissionParallaxBoxMin = options.transmissionParallaxBoxMin ?? [-1, -1, -1];
    const transmissionParallaxBoxMax = options.transmissionParallaxBoxMax ?? [1, 1, 1];
    validateColor4(baseColor, "baseColor");
    validateColor3(environmentColor, "environmentColor");
    validateProceduralEnvironmentMap(proceduralEnvironmentMap);
    validateNonNegative(options.environmentMapIntensity ?? 0, "environmentMapIntensity");
    validateNonNegative(options.environmentMapSpecularIntensity ?? 0, "environmentMapSpecularIntensity");
    validateFinite(options.environmentMapRotation ?? 0, "environmentMapRotation");
    validateMipCount(options.environmentMapMipCount ?? 1);
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
      throw new RangeError("PBR transmissionParallaxBoxMin must be lower than transmissionParallaxBoxMax");
    }
    validateNonNegative(options.transmissionBounceCount ?? 0, "transmissionBounceCount");
    validateNonNegative(options.transmissionCausticStrength ?? 0, "transmissionCausticStrength");
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
      throw new RangeError("PBR iridescenceThicknessMaximum must be greater than or equal to iridescenceThicknessMinimum");
    }
    validateNonNegative(options.dispersion ?? 0, "dispersion");
    validateIOR(options.ior ?? 1.5);
    validateNonNegative(options.emissiveStrength ?? 1, "emissiveStrength");

    super({
      name: options.name ?? "pbr",
      shaderKey: DEFAULT_PBR_SHADER_NAME,
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
        u_modelViewProjection: identityMatrix(),
        u_normalMatrix: identityMatrix()
      },
      requiredAttributes: ["a_position", "a_normal"],
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
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_normalMatrix", kind: "mat4" }
      ]
    });
  }

  set baseColor(value: readonly [number, number, number, number]) {
    validateColor4(value, "baseColor");
    this.setParameter("u_baseColor", value);
  }

  get baseColor(): readonly [number, number, number, number] {
    return this.getParameter("u_baseColor") as readonly [number, number, number, number];
  }

  set metallic(value: number) {
    validateUnit(value, "metallic");
    this.setParameter("u_metallic", value);
  }

  get metallic(): number {
    return this.getParameter("u_metallic") as number;
  }

  set roughness(value: number) {
    validateUnit(value, "roughness");
    this.setParameter("u_roughness", value);
  }

  get roughness(): number {
    return this.getParameter("u_roughness") as number;
  }

  set environmentColor(value: readonly [number, number, number]) {
    validateColor3(value, "environmentColor");
    this.setParameter("u_environmentColor", value);
  }

  get environmentColor(): readonly [number, number, number] {
    return this.getParameter("u_environmentColor") as readonly [number, number, number];
  }

  set environmentIntensity(value: number) {
    validateNonNegative(value, "environmentIntensity");
    this.setParameter("u_environmentIntensity", value);
  }

  get environmentIntensity(): number {
    return this.getParameter("u_environmentIntensity") as number;
  }

  set proceduralEnvironmentMap(value: PBRProceduralEnvironmentMapOptions) {
    validateProceduralEnvironmentMap(value);
    this.setParameter("u_environmentSkyColor", value.skyColor);
    this.setParameter("u_environmentHorizonColor", value.horizonColor);
    this.setParameter("u_environmentGroundColor", value.groundColor);
    this.setParameter("u_environmentSpecularColor", value.specularColor);
    this.setParameter("u_environmentMapIntensity", value.intensity);
    this.setParameter("u_environmentSpecularIntensity", value.specularIntensity);
  }

  get proceduralEnvironmentMap(): PBRProceduralEnvironmentMapOptions {
    return {
      skyColor: this.getParameter("u_environmentSkyColor") as readonly [number, number, number],
      horizonColor: this.getParameter("u_environmentHorizonColor") as readonly [number, number, number],
      groundColor: this.getParameter("u_environmentGroundColor") as readonly [number, number, number],
      specularColor: this.getParameter("u_environmentSpecularColor") as readonly [number, number, number],
      intensity: this.getParameter("u_environmentMapIntensity") as number,
      specularIntensity: this.getParameter("u_environmentSpecularIntensity") as number
    };
  }

  set environmentMapTexture(value: TextureBinding | null) {
    this.setParameter("u_environmentMapTexture", value ?? new TextureBinding({ name: "u_environmentMapTexture", required: false }));
    this.setParameter("u_environmentMapTextureEnabled", value ? 1 : 0);
  }

  get environmentMapTexture(): TextureBinding | null {
    const value = this.getParameter("u_environmentMapTexture");
    return value instanceof TextureBinding && value.texture ? value : null;
  }

  set environmentMapIntensity(value: number) {
    validateNonNegative(value, "environmentMapIntensity");
    this.setParameter("u_environmentMapTextureIntensity", value);
  }

  get environmentMapIntensity(): number {
    return this.getParameter("u_environmentMapTextureIntensity") as number;
  }

  set environmentMapSpecularIntensity(value: number) {
    validateNonNegative(value, "environmentMapSpecularIntensity");
    this.setParameter("u_environmentMapTextureSpecularIntensity", value);
  }

  get environmentMapSpecularIntensity(): number {
    return this.getParameter("u_environmentMapTextureSpecularIntensity") as number;
  }

  set environmentMapRotation(value: number) {
    validateFinite(value, "environmentMapRotation");
    this.setParameter("u_environmentMapTextureRotation", value);
  }

  get environmentMapRotation(): number {
    return this.getParameter("u_environmentMapTextureRotation") as number;
  }

  set environmentMapMipCount(value: number) {
    validateMipCount(value);
    this.setParameter("u_environmentMapTextureMipCount", value);
  }

  get environmentMapMipCount(): number {
    return this.getParameter("u_environmentMapTextureMipCount") as number;
  }

  set environmentBrdfLutTexture(value: TextureBinding | null) {
    this.setParameter("u_environmentBrdfLutTexture", value ?? new TextureBinding({ name: "u_environmentBrdfLutTexture", required: false }));
    this.setParameter("u_environmentBrdfLutEnabled", value ? 1 : 0);
  }

  get environmentBrdfLutTexture(): TextureBinding | null {
    const value = this.getParameter("u_environmentBrdfLutTexture");
    return value instanceof TextureBinding && value.texture ? value : null;
  }
}

function validateNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`PBR ${label} must be finite and non-negative`);
  }
}

function validatePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`PBR ${label} must be finite and positive`);
  }
}

function validateUnit(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`PBR ${label} must be finite and within [0, 1]`);
  }
}

function validateFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`PBR ${label} must be finite`);
  }
}

function validateIOR(value: number): void {
  if (!Number.isFinite(value) || value < 1) {
    throw new RangeError("PBR ior must be finite and at least 1");
  }
}

function validateIridescenceIOR(value: number): void {
  if (!Number.isFinite(value) || value < 1 || value > 3) {
    throw new RangeError("PBR iridescenceIor must be finite and within [1, 3]");
  }
}

function validateColor4(value: readonly number[], label: string): void {
  if (value.length !== 4 || value.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 1)) {
    throw new RangeError(`PBR ${label} must contain four finite values in [0, 1]`);
  }
}

function validateColor3(value: readonly number[], label: string): void {
  if (value.length !== 3 || value.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 1)) {
    throw new RangeError(`PBR ${label} must contain three finite values in [0, 1]`);
  }
}

function validateNonNegativeColor3(value: readonly number[], label: string): void {
  if (value.length !== 3 || value.some((channel) => !Number.isFinite(channel) || channel < 0)) {
    throw new RangeError(`PBR ${label} must contain three finite non-negative values`);
  }
}

function validateFiniteVec3(value: readonly number[], label: string): void {
  if (value.length !== 3 || value.some((channel) => !Number.isFinite(channel))) {
    throw new RangeError(`PBR ${label} must contain three finite values`);
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

function validateMipCount(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError("PBR environmentMapMipCount must be a positive integer");
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
