import { Material, type RenderState } from "./Material";
import { DEFAULT_PBR_ENVIRONMENT_INTENSITY, DEFAULT_PBR_PROCEDURAL_ENVIRONMENT_MAP } from "./PBRLightingDefaults";
import { DEFAULT_INSTANCED_PBR_SHADER_NAME } from "./ShaderLibrary";
import { TextureBinding } from "./TextureBinding";

export const MAX_INSTANCED_PBR_INSTANCES = 64;

export interface InstancedPBRMaterialOptions {
  readonly name?: string;
  readonly baseColor?: readonly [number, number, number, number];
  readonly renderState?: Partial<RenderState>;
  readonly metallic?: number;
  readonly roughness?: number;
  readonly environmentColor?: readonly [number, number, number];
  readonly environmentIntensity?: number;
  readonly proceduralEnvironmentMap?: InstancedPBRProceduralEnvironmentMapOptions;
  readonly environmentMapTexture?: TextureBinding;
  readonly environmentMapIntensity?: number;
  readonly environmentMapSpecularIntensity?: number;
  readonly environmentMapRotation?: number;
  readonly environmentMapMipCount?: number;
  readonly environmentBrdfLutTexture?: TextureBinding;
  readonly emissiveColor?: readonly [number, number, number];
  readonly emissiveStrength?: number;
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
  constructor(options: InstancedPBRMaterialOptions = {}) {
    const baseColor = options.baseColor ?? [1, 1, 1, 1];
    const environmentColor = options.environmentColor ?? [1, 1, 1];
    const proceduralEnvironmentMap: InstancedPBRProceduralEnvironmentMapOptions = options.proceduralEnvironmentMap ?? DEFAULT_PBR_PROCEDURAL_ENVIRONMENT_MAP;
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

    super({
      name: options.name ?? "instanced-pbr",
      shaderKey: DEFAULT_INSTANCED_PBR_SHADER_NAME,
      renderState: options.renderState,
      parameters: {
        u_baseColor: baseColor,
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
        u_lightCount: 0,
        u_lightData: new Float32Array(0),
        u_instanceMatrices: defaultInstanceMatrices(),
        u_instanceCount: 1,
        u_instanceAttributeMode: 0,
        u_modelViewProjection: identityMatrix(),
        u_normalMatrix: identityMatrix()
      },
      requiredAttributes: ["a_position", "a_normal"],
      uniformSchema: [
        { name: "u_baseColor", kind: "vec4" },
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
        { name: "u_lightCount", kind: "float" },
        { name: "u_lightData", kind: "any" },
        { name: "u_instanceMatrices", kind: "any" },
        { name: "u_instanceCount", kind: "float" },
        { name: "u_instanceAttributeMode", kind: "float" },
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_normalMatrix", kind: "mat4" }
      ]
    });
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

function identityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}
