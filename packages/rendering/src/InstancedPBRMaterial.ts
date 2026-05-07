import { Material, type RenderState } from "./Material";
import { DEFAULT_INSTANCED_PBR_SHADER_NAME } from "./ShaderLibrary";

export const MAX_INSTANCED_PBR_INSTANCES = 64;

export interface InstancedPBRMaterialOptions {
  readonly name?: string;
  readonly baseColor?: readonly [number, number, number, number];
  readonly renderState?: Partial<RenderState>;
  readonly metallic?: number;
  readonly roughness?: number;
  readonly emissiveColor?: readonly [number, number, number];
  readonly emissiveStrength?: number;
}

export class InstancedPBRMaterial extends Material {
  constructor(options: InstancedPBRMaterialOptions = {}) {
    const baseColor = options.baseColor ?? [1, 1, 1, 1];
    const emissiveColor = options.emissiveColor ?? [0, 0, 0];
    validateColor4(baseColor, "baseColor");
    validateColor3(emissiveColor, "emissiveColor");
    validateUnit(options.metallic ?? 0, "metallic");
    validateUnit(options.roughness ?? 0.5, "roughness");
    validateNonNegative(options.emissiveStrength ?? 1, "emissiveStrength");

    super({
      name: options.name ?? "instanced-pbr",
      shaderKey: DEFAULT_INSTANCED_PBR_SHADER_NAME,
      renderState: options.renderState,
      parameters: {
        u_baseColor: baseColor,
        u_metallic: options.metallic ?? 0,
        u_roughness: options.roughness ?? 0.5,
        u_emissiveColor: emissiveColor,
        u_emissiveStrength: options.emissiveStrength ?? 1,
        u_lightCount: 0,
        u_lightData: new Float32Array(0),
        u_instanceMatrices: defaultInstanceMatrices(),
        u_instanceCount: 1,
        u_modelViewProjection: identityMatrix(),
        u_normalMatrix: identityMatrix()
      },
      requiredAttributes: ["a_position", "a_normal"],
      uniformSchema: [
        { name: "u_baseColor", kind: "vec4" },
        { name: "u_metallic", kind: "float" },
        { name: "u_roughness", kind: "float" },
        { name: "u_emissiveColor", kind: "vec3" },
        { name: "u_emissiveStrength", kind: "float" },
        { name: "u_lightCount", kind: "float" },
        { name: "u_lightData", kind: "any" },
        { name: "u_instanceMatrices", kind: "any" },
        { name: "u_instanceCount", kind: "float" },
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
