import { Material, type RenderState } from "./Material";
import { Sampler } from "./Sampler";
import { DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME } from "./ShaderLibrary";
import { Texture } from "./Texture";
import { TextureBinding } from "./TextureBinding";

export interface NormalMappedPBRMaterialOptions {
  readonly name?: string;
  readonly baseColor?: readonly [number, number, number, number];
  readonly metallic?: number;
  readonly roughness?: number;
  readonly emissiveColor?: readonly [number, number, number];
  readonly emissiveStrength?: number;
  readonly normalTexture: Texture;
  readonly normalSampler?: Sampler;
  readonly normalScale?: number;
  readonly renderState?: Partial<RenderState>;
}

export class NormalMappedPBRMaterial extends Material {
  constructor(options: NormalMappedPBRMaterialOptions) {
    const baseColor = options.baseColor ?? [1, 1, 1, 1];
    const emissiveColor = options.emissiveColor ?? [0, 0, 0];
    validateColor4(baseColor, "baseColor");
    validateColor3(emissiveColor, "emissiveColor");
    validateUnit(options.metallic ?? 0, "metallic");
    validateUnit(options.roughness ?? 0.5, "roughness");
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
