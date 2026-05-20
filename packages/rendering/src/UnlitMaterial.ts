import { Material, type RenderState } from "./Material";
import { DEFAULT_UNLIT_SHADER_NAME } from "./ShaderLibrary";

export interface UnlitMaterialOptions {
  readonly name?: string;
  readonly color?: readonly [number, number, number, number];
  readonly pointSize?: number;
  readonly roundPoints?: boolean;
  readonly renderState?: Partial<RenderState>;
}

export class UnlitMaterial extends Material {
  constructor(options: UnlitMaterialOptions = {}) {
    const color = options.color ?? [1, 1, 1, 1];
    validateColor(color);
    validatePointSize(options.pointSize ?? 7);
    super({
      name: options.name ?? "unlit",
      shaderKey: DEFAULT_UNLIT_SHADER_NAME,
      renderState: options.renderState,
      parameters: {
        u_baseColor: color,
        u_pointSize: options.pointSize ?? 7,
        u_roundPoints: options.roundPoints === true ? 1 : 0,
        u_modelViewProjection: identityMatrix()
      },
      requiredAttributes: ["a_position"],
      uniformSchema: [
        { name: "u_baseColor", kind: "vec4" },
        { name: "u_pointSize", kind: "float" },
        { name: "u_roundPoints", kind: "float" },
        { name: "u_modelViewProjection", kind: "mat4" }
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

  set pointSize(value: number) {
    validatePointSize(value);
    this.setParameter("u_pointSize", value);
  }

  get pointSize(): number {
    return this.getParameter("u_pointSize") as number;
  }
}

function validateColor(color: readonly [number, number, number, number]): void {
  if (color.length !== 4 || color.some((channel) => channel < 0 || channel > 1 || !Number.isFinite(channel))) {
    throw new Error("UnlitMaterial color must contain four finite values in [0, 1]");
  }
}

function validatePointSize(pointSize: number): void {
  if (!Number.isFinite(pointSize) || pointSize <= 0 || pointSize > 128) {
    throw new RangeError("UnlitMaterial pointSize must be finite and in (0, 128]");
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
