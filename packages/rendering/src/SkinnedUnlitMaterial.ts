import { Material } from "./Material";
import { DEFAULT_SKINNED_UNLIT_SHADER_NAME } from "./ShaderLibrary";

export interface SkinnedUnlitMaterialOptions {
  readonly name?: string;
  readonly color?: readonly [number, number, number, number];
  readonly maxJoints?: number;
}

export class SkinnedUnlitMaterial extends Material {
  public readonly maxJoints: number;

  constructor(options: SkinnedUnlitMaterialOptions = {}) {
    const color = options.color ?? [1, 1, 1, 1];
    validateColor(color);
    const maxJoints = options.maxJoints ?? 96;
    if (!Number.isInteger(maxJoints) || maxJoints <= 0 || maxJoints > 96) {
      throw new Error("SkinnedUnlitMaterial maxJoints must be an integer in [1, 96]");
    }
    super({
      name: options.name ?? "skinned-unlit",
      shaderKey: DEFAULT_SKINNED_UNLIT_SHADER_NAME,
      parameters: {
        u_baseColor: color,
        u_modelViewProjection: identityMatrix(),
        u_jointCount: 1,
        u_jointMatrices: identityMatrix()
      },
      requiredAttributes: ["a_position", "a_joints", "a_weights"],
      uniformSchema: [
        { name: "u_baseColor", kind: "vec4" },
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_jointCount", kind: "float" },
        { name: "u_jointMatrices", kind: "any" }
      ]
    });
    this.maxJoints = maxJoints;
  }

  set color(value: readonly [number, number, number, number]) {
    validateColor(value);
    this.setParameter("u_baseColor", value);
  }

  get color(): readonly [number, number, number, number] {
    return this.getParameter("u_baseColor") as readonly [number, number, number, number];
  }
}

function validateColor(color: readonly [number, number, number, number]): void {
  if (color.length !== 4 || color.some((channel) => channel < 0 || channel > 1 || !Number.isFinite(channel))) {
    throw new Error("SkinnedUnlitMaterial color must contain four finite values in [0, 1]");
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
