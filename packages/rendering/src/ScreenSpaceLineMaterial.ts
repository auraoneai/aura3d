import { Material, type RenderState } from "./Material";
import { DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME } from "./ShaderLibraryCore";

export type ScreenSpaceLineCap = "butt" | "square" | "round";

export interface ScreenSpaceLineMaterialOptions {
  readonly name?: string;
  readonly color?: readonly [number, number, number, number];
  /** Stroke width in CSS pixels. Constant on screen regardless of camera distance. */
  readonly width?: number;
  /** Device-pixel resolution of the render target. */
  readonly resolution?: readonly [number, number];
  /** Device pixel ratio, so a CSS-pixel width renders identically at any DPR. */
  readonly pixelRatio?: number;
  readonly cap?: ScreenSpaceLineCap;
  /** Dash length in world units. Zero or omitted renders a solid line. */
  readonly dashSize?: number;
  readonly gapSize?: number;
  readonly dashOffset?: number;
  readonly renderState?: RenderState;
}

/**
 * Material for true screen-space fat lines.
 *
 * Width is expressed in pixels and applied after projection, so the rendered stroke
 * does not change thickness with distance, field of view, viewport size, or device
 * pixel ratio. `resolution` and `pixelRatio` must be kept in sync with the render
 * target, otherwise the pixel width is computed against the wrong basis.
 */
export class ScreenSpaceLineMaterial extends Material {
  constructor(options: ScreenSpaceLineMaterialOptions = {}) {
    const color = options.color ?? [1, 1, 1, 1];
    if (color.length !== 4 || color.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 1)) {
      throw new Error("ScreenSpaceLineMaterial color must contain four finite values in [0, 1]");
    }
    const width = options.width ?? 4;
    if (!Number.isFinite(width) || width <= 0) {
      throw new Error("ScreenSpaceLineMaterial width must be a positive finite number of pixels");
    }
    const resolution = options.resolution ?? [1, 1];
    if (resolution.length !== 2 || resolution.some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new Error("ScreenSpaceLineMaterial resolution must contain two positive finite values");
    }
    const pixelRatio = options.pixelRatio ?? 1;
    if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
      throw new Error("ScreenSpaceLineMaterial pixelRatio must be a positive finite number");
    }
    const dashSize = options.dashSize ?? 0;
    const gapSize = options.gapSize ?? 0;
    if (!Number.isFinite(dashSize) || dashSize < 0 || !Number.isFinite(gapSize) || gapSize < 0) {
      throw new Error("ScreenSpaceLineMaterial dashSize and gapSize must be non-negative finite numbers");
    }
    if (dashSize > 0 && gapSize <= 0) {
      throw new Error("ScreenSpaceLineMaterial dashSize requires a positive gapSize");
    }
    const cap = options.cap ?? "butt";
    super({
      name: options.name ?? "screen-space-line",
      shaderKey: DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME,
      renderState: options.renderState,
      parameters: {
        u_baseColor: color,
        u_modelViewProjection: identityMatrix(),
        u_lineWidth: width,
        u_lineResolution: [resolution[0], resolution[1]],
        u_linePixelRatio: pixelRatio,
        u_lineSquareCaps: cap === "square" ? 1 : 0,
        u_lineRoundCaps: cap === "round" ? 1 : 0,
        u_lineDashSize: dashSize,
        u_lineGapSize: gapSize,
        u_lineDashOffset: options.dashOffset ?? 0
      },
      requiredAttributes: ["a_position", "a_lineStart", "a_lineEnd", "a_lineCorner", "a_lineDistance"],
      uniformSchema: [
        { name: "u_baseColor", kind: "vec4" },
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_lineWidth", kind: "float" },
        { name: "u_lineResolution", kind: "vec2" },
        { name: "u_linePixelRatio", kind: "float" },
        { name: "u_lineSquareCaps", kind: "float" },
        { name: "u_lineRoundCaps", kind: "float" },
        { name: "u_lineDashSize", kind: "float" },
        { name: "u_lineGapSize", kind: "float" },
        { name: "u_lineDashOffset", kind: "float" }
      ]
    });
  }

  /** Keeps the pixel-width basis aligned with the current render target. */
  setResolution(width: number, height: number, pixelRatio = 1): void {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new Error("ScreenSpaceLineMaterial resolution must be positive and finite");
    }
    if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
      throw new Error("ScreenSpaceLineMaterial pixelRatio must be positive and finite");
    }
    this.setParameter("u_lineResolution", [width, height]);
    this.setParameter("u_linePixelRatio", pixelRatio);
  }

  set width(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("ScreenSpaceLineMaterial width must be a positive finite number of pixels");
    }
    this.setParameter("u_lineWidth", value);
  }

  get width(): number {
    return this.getParameter("u_lineWidth") as number;
  }
}

function identityMatrix(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
