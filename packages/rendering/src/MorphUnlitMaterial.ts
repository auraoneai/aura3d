import { Material } from "./Material";
import { DEFAULT_MORPH_UNLIT_SHADER_NAME } from "./ShaderLibrary";

export interface MorphUnlitMaterialOptions {
  readonly name?: string;
  readonly color?: readonly [number, number, number, number];
}

export class MorphUnlitMaterial extends Material {
  constructor(options: MorphUnlitMaterialOptions = {}) {
    const color = options.color ?? [1, 1, 1, 1];
    validateColor(color);
    super({
      name: options.name ?? "morph-unlit",
      shaderKey: DEFAULT_MORPH_UNLIT_SHADER_NAME,
      parameters: {
        u_baseColor: color,
        u_modelViewProjection: identityMatrix()
      },
      requiredAttributes: ["a_position"],
      uniformSchema: [
        { name: "u_baseColor", kind: "vec4" },
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_morphPositionDeltas", kind: "any", required: false },
        { name: "u_morphWeights", kind: "vec4", required: false },
        { name: "u_morphTargetCount", kind: "float", required: false }
      ]
    });
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
    throw new Error("MorphUnlitMaterial color must contain four finite values in [0, 1]");
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
