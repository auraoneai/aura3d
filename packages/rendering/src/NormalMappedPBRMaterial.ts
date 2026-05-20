import { Material, type RenderState } from "./Material";
import { DEFAULT_PBR_ENVIRONMENT_INTENSITY, DEFAULT_PBR_PROCEDURAL_ENVIRONMENT_MAP } from "./PBRLightingDefaults";
import { Sampler } from "./Sampler";
import { DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME } from "./ShaderLibrary";
import { Texture } from "./Texture";
import { TextureBinding } from "./TextureBinding";

export interface NormalMappedPBRMaterialOptions {
  readonly name?: string;
  readonly baseColor?: readonly [number, number, number, number];
  readonly metallic?: number;
  readonly roughness?: number;
  readonly environmentColor?: readonly [number, number, number];
  readonly environmentIntensity?: number;
  readonly proceduralEnvironmentMap?: NormalMappedPBRProceduralEnvironmentMapOptions;
  readonly environmentMapTexture?: TextureBinding;
  readonly environmentMapIntensity?: number;
  readonly environmentMapSpecularIntensity?: number;
  readonly environmentMapRotation?: number;
  readonly environmentMapMipCount?: number;
  readonly environmentBrdfLutTexture?: TextureBinding;
  readonly emissiveColor?: readonly [number, number, number];
  readonly emissiveStrength?: number;
  readonly normalTexture: Texture;
  readonly normalSampler?: Sampler;
  readonly normalScale?: number;
  readonly renderState?: Partial<RenderState>;
}

export interface NormalMappedPBRProceduralEnvironmentMapOptions {
  readonly skyColor: readonly [number, number, number];
  readonly horizonColor: readonly [number, number, number];
  readonly groundColor: readonly [number, number, number];
  readonly specularColor: readonly [number, number, number];
  readonly intensity: number;
  readonly specularIntensity: number;
}

export class NormalMappedPBRMaterial extends Material {
  constructor(options: NormalMappedPBRMaterialOptions) {
    const baseColor = options.baseColor ?? [1, 1, 1, 1];
    const environmentColor = options.environmentColor ?? [1, 1, 1];
    const proceduralEnvironmentMap: NormalMappedPBRProceduralEnvironmentMapOptions = options.proceduralEnvironmentMap ?? DEFAULT_PBR_PROCEDURAL_ENVIRONMENT_MAP;
    const emissiveColor = options.emissiveColor ?? [0, 0, 0];
    validateColor4(baseColor, "baseColor");
    validateColor3(environmentColor, "environmentColor");
    validateProceduralEnvironmentMap(proceduralEnvironmentMap);
    validateNonNegative(options.environmentMapIntensity ?? 0, "environmentMapIntensity");
    validateNonNegative(options.environmentMapSpecularIntensity ?? 0, "environmentMapSpecularIntensity");
    validateFinite(options.environmentMapRotation ?? 0, "environmentMapRotation");
    validateMipCount(options.environmentMapMipCount ?? 1);
    validateColor3(emissiveColor, "emissiveColor");
    validateUnit(options.metallic ?? 0, "metallic");
    validateUnit(options.roughness ?? 0.5, "roughness");
    validateNonNegative(options.environmentIntensity ?? DEFAULT_PBR_ENVIRONMENT_INTENSITY, "environmentIntensity");
    validateNonNegative(options.emissiveStrength ?? 1, "emissiveStrength");
    const normalScale = options.normalScale ?? 1;
    if (!Number.isFinite(normalScale) || normalScale < 0) {
      throw new RangeError("PBR normalScale must be finite and non-negative");
    }

    super({
      name: options.name ?? "normal-mapped-pbr",
      shaderKey: DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME,
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
        u_lightCount: 0,
        u_lightData: new Float32Array(0),
        u_normalTexture: new TextureBinding({
          name: "u_normalTexture",
          texture: options.normalTexture,
          sampler: options.normalSampler,
          required: true
        }),
        u_normalScale: normalScale,
        u_modelViewProjection: identityMatrix(),
        u_normalMatrix: identityMatrix()
      },
      requiredAttributes: ["a_position", "a_normal", "a_tangent", "a_uv"],
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
        { name: "u_lightCount", kind: "float" },
        { name: "u_lightData", kind: "any" },
        { name: "u_normalTexture", kind: "texture2d" },
        { name: "u_normalScale", kind: "float" },
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_normalMatrix", kind: "mat4" }
      ]
    });
  }
}

function validateNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`PBR ${label} must be finite and non-negative`);
  }
}

function validateFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`PBR ${label} must be finite`);
  }
}

function validateMipCount(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError("PBR environmentMapMipCount must be a positive integer");
  }
}

function validateProceduralEnvironmentMap(value: NormalMappedPBRProceduralEnvironmentMapOptions): void {
  validateColor3(value.skyColor, "proceduralEnvironmentMap.skyColor");
  validateColor3(value.horizonColor, "proceduralEnvironmentMap.horizonColor");
  validateColor3(value.groundColor, "proceduralEnvironmentMap.groundColor");
  validateColor3(value.specularColor, "proceduralEnvironmentMap.specularColor");
  validateNonNegative(value.intensity, "proceduralEnvironmentMap.intensity");
  validateNonNegative(value.specularIntensity, "proceduralEnvironmentMap.specularIntensity");
}

function validateUnit(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`PBR ${label} must be finite and within [0, 1]`);
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

function identityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}
