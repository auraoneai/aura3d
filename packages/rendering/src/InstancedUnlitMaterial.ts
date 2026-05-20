import { Material, type RenderState } from "./Material";
import { DEFAULT_INSTANCED_UNLIT_SHADER_NAME } from "./ShaderLibrary";

export const MAX_INSTANCED_UNLIT_INSTANCES = 64;

export interface InstancedUnlitMaterialOptions {
  readonly name?: string;
  readonly color?: readonly [number, number, number, number];
  readonly renderState?: Partial<RenderState>;
}

export class InstancedUnlitMaterial extends Material {
  constructor(options: InstancedUnlitMaterialOptions = {}) {
    const color = options.color ?? [1, 1, 1, 1];
    validateColor(color);
    super({
      name: options.name ?? "instanced-unlit",
      shaderKey: DEFAULT_INSTANCED_UNLIT_SHADER_NAME,
      renderState: options.renderState,
      parameters: {
        u_baseColor: color,
        u_alphaCutoff: 0,
        u_instanceMatrices: defaultInstanceMatrices(),
        u_instanceCount: 1,
        u_instanceAttributeMode: 0,
        u_modelViewProjection: identityMatrix()
      },
      requiredAttributes: ["a_position"],
      uniformSchema: [
        { name: "u_baseColor", kind: "vec4" },
        { name: "u_alphaCutoff", kind: "float" },
        { name: "u_instanceMatrices", kind: "any" },
        { name: "u_instanceCount", kind: "float" },
        { name: "u_instanceAttributeMode", kind: "float" },
        { name: "u_modelViewProjection", kind: "mat4" }
      ]
    });
  }
}

function defaultInstanceMatrices(): Float32Array {
  const matrices = new Float32Array(MAX_INSTANCED_UNLIT_INSTANCES * 16);
  matrices.set(identityMatrix(), 0);
  return matrices;
}

function validateColor(color: readonly [number, number, number, number]): void {
  if (color.length !== 4 || color.some((channel) => channel < 0 || channel > 1 || !Number.isFinite(channel))) {
    throw new Error("InstancedUnlitMaterial color must contain four finite values in [0, 1]");
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
