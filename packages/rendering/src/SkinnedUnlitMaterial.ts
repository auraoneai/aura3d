import { Material } from "./Material";
import { MAX_UNIFORM_SKINNING_JOINTS } from "./ShaderChunks";
import { DEFAULT_SKINNED_UNLIT_EIGHT_INFLUENCE_SHADER_NAME, DEFAULT_SKINNED_UNLIT_SHADER_NAME } from "./ShaderLibraryCore";
import { TextureBinding } from "./TextureBinding";

/** Upper bound on joints per skin when the palette travels as a data texture. */
export const MAX_DATA_TEXTURE_SKINNING_JOINTS = 1024;

export interface SkinnedUnlitMaterialOptions {
  readonly name?: string;
  readonly color?: readonly [number, number, number, number];
  readonly maxJoints?: number;
  /**
   * Use the eight-influence shader, reading a second `joints1`/`weights1` attribute
   * set. Required for glTF meshes that ship `JOINTS_1`/`WEIGHTS_1`.
   */
  readonly extraInfluences?: boolean;
}

export class SkinnedUnlitMaterial extends Material {
  public readonly maxJoints: number;
  public readonly extraInfluences: boolean;

  constructor(options: SkinnedUnlitMaterialOptions = {}) {
    const color = options.color ?? [1, 1, 1, 1];
    validateColor(color);
    // Joints above the uniform-array limit are legal: the palette is uploaded as a
    // data texture instead. Only the absolute data-texture ceiling is rejected.
    const maxJoints = options.maxJoints ?? MAX_UNIFORM_SKINNING_JOINTS;
    if (!Number.isInteger(maxJoints) || maxJoints <= 0 || maxJoints > MAX_DATA_TEXTURE_SKINNING_JOINTS) {
      throw new Error(`SkinnedUnlitMaterial maxJoints must be an integer in [1, ${MAX_DATA_TEXTURE_SKINNING_JOINTS}]`);
    }
    const extraInfluences = options.extraInfluences === true;
    super({
      name: options.name ?? (extraInfluences ? "skinned-unlit-8" : "skinned-unlit"),
      shaderKey: extraInfluences ? DEFAULT_SKINNED_UNLIT_EIGHT_INFLUENCE_SHADER_NAME : DEFAULT_SKINNED_UNLIT_SHADER_NAME,
      parameters: {
        u_baseColor: color,
        u_modelViewProjection: identityMatrix(),
        u_jointCount: 1,
        u_jointMatrices: identityMatrix(),
        u_jointPaletteMode: 0,
        u_jointPaletteTexture: new TextureBinding({ name: "u_jointPaletteTexture", required: false }),
        u_jointPaletteTextureSize: [1, 1]
      },
      requiredAttributes: extraInfluences
        ? ["a_position", "a_joints", "a_weights", "a_joints1", "a_weights1"]
        : ["a_position", "a_joints", "a_weights"],
      uniformSchema: [
        { name: "u_baseColor", kind: "vec4" },
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_jointCount", kind: "float" },
        { name: "u_jointMatrices", kind: "any" },
        { name: "u_jointPaletteMode", kind: "float" },
        { name: "u_jointPaletteTexture", kind: "any" },
        { name: "u_jointPaletteTextureSize", kind: "vec2" }
      ]
    });
    this.extraInfluences = extraInfluences;
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
