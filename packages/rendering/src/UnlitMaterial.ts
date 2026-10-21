import { Material, type RenderState } from "./Material";
import { DEFAULT_UNLIT_SHADER_NAME } from "./ShaderLibraryCore";
import type { TextureBinding } from "./TextureBinding";

export interface UnlitMaterialOptions {
  readonly name?: string;
  readonly color?: readonly [number, number, number, number];
  /**
   * Point size in *CSS* pixels for `points` geometry (three's
   * `PointsMaterial.size`). The L6 compiler folds devicePixelRatio into this
   * before draw; no upper bound is imposed here — WebGL clamps to the device's
   * `ALIASED_POINT_SIZE_RANGE` (three.js behaves the same way).
   */
  readonly pointSize?: number;
  /**
   * three.js `PointsMaterial.sizeAttenuation` (SG-07): when true the generated
   * program divides the (device-pixel) point size by view depth so distant
   * points shrink. Consumed by the `prd15.parityPoints` ShaderFeature — on the
   * legacy lean shader it is ignored.
   */
  readonly sizeAttenuation?: boolean;
  /**
   * three.js `PointsMaterial.map` (SG-07): sampled at `gl_PointCoord` on the
   * generated path via `prd15.parityPoints`. Stored under `u_pointMap` so it
   * does not collide with the mesh `u_baseColorMap` (which samples `v_uv`).
   */
  readonly map?: TextureBinding;
  /**
   * three.js `Material.alphaTest` (SG-07/SG-08): >0 selects the generated
   * `ALPHA_MASK` path (`u_alphaCutoff` discards below the threshold).
   */
  readonly alphaTest?: number;
  /** Geometry carries `a_color`; the generated path multiplies `a3dBaseColor`. */
  readonly vertexColors?: boolean;
  /**
   * SG-08 marker: this unlit material drives a billboard sprite quad. Selects
   * the `prd15.paritySprite` ShaderFeature (camera-facing `gl_Position`
   * rebuild, anchor + rotation + size attenuation).
   */
  readonly spriteMode?: boolean;
  /** Sprite anchor in [0,1]² (three's `Sprite.center`); default [0.5, 0.5]. */
  readonly spriteCenter?: readonly [number, number];
  /** Sprite rotation in radians (three's `SpriteMaterial.rotation`). */
  readonly spriteRotation?: number;
  /** three's `Sprite.sizeAttenuation` (default true). */
  readonly spriteSizeAttenuation?: boolean;
  readonly roundPoints?: boolean;
  readonly renderState?: Partial<RenderState>;
}

export class UnlitMaterial extends Material {
  constructor(options: UnlitMaterialOptions = {}) {
    const color = options.color ?? [1, 1, 1, 1];
    validateColor(color);
    validatePointSize(options.pointSize ?? 7);
    const center = options.spriteCenter ?? [0.5, 0.5];
    if (center.length !== 2 || center.some((v) => !Number.isFinite(v))) {
      throw new Error("UnlitMaterial spriteCenter must be two finite numbers");
    }
    super({
      name: options.name ?? "unlit",
      shaderKey: DEFAULT_UNLIT_SHADER_NAME,
      renderState: options.renderState,
      parameters: {
        u_baseColor: color,
        u_pointSize: options.pointSize ?? 7,
        u_roundPoints: options.roundPoints === true ? 1 : 0,
        // SG-07 (L6): generated-path markers — ignored by the legacy shader.
        u_pointSizeAttenuation: options.sizeAttenuation === true ? 1 : 0,
        ...(options.map ? { u_pointMap: options.map } : {}),
        u_alphaCutoff: options.alphaTest ?? 0,
        // SG-08 (L6): billboard sprite markers.
        u_spriteMode: options.spriteMode === true ? 1 : 0,
        u_spriteRotation: options.spriteRotation ?? 0,
        u_spriteCenter: [center[0], center[1]],
        u_spriteSizeAttenuation: options.spriteSizeAttenuation === false ? 0 : 1,
        u_modelViewProjection: identityMatrix(),
        // P2 instanced-GLB path (muse3jsparity-PRD): zero instances by
        // default so non-instanced draws keep the legacy shader branch
        // bit-exact; applyInstanceBinding stamps real counts per item.
        u_instanceMatrices: defaultUnlitInstanceMatrices(),
        u_instanceCount: 0,
        u_instanceAttributeMode: 0
      },
      requiredAttributes: options.vertexColors === true ? ["a_position", "a_color"] : ["a_position"],
      uniformSchema: [
        { name: "u_baseColor", kind: "vec4" },
        { name: "u_pointSize", kind: "float" },
        { name: "u_roundPoints", kind: "float" },
        { name: "u_pointSizeAttenuation", kind: "float", required: false },
        { name: "u_pointMap", kind: "texture2d", required: false },
        { name: "u_alphaCutoff", kind: "float", required: false },
        { name: "u_spriteMode", kind: "float", required: false },
        { name: "u_spriteRotation", kind: "float", required: false },
        { name: "u_spriteCenter", kind: "vec2", required: false },
        { name: "u_spriteSizeAttenuation", kind: "float", required: false },
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_instanceMatrices", kind: "any" },
        { name: "u_instanceCount", kind: "float" },
        { name: "u_instanceAttributeMode", kind: "float" }
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

  /**
   * SG-07: `pointSize` is finite-positive with no fixed upper bound — the GL
   * implementation clamps to `ALIASED_POINT_SIZE_RANGE` at draw time, matching
   * three.js behaviour on oversized points.
   */
  set pointSize(value: number) {
    validatePointSize(value);
    this.setParameter("u_pointSize", value);
  }

  get pointSize(): number {
    return this.getParameter("u_pointSize") as number;
  }

  /** L6: per-frame device-pixel-ratio fold for point size (compiler-owned). */
  set pointSizeAttenuation(enabled: boolean) {
    this.setParameter("u_pointSizeAttenuation", enabled ? 1 : 0);
  }
}

function validateColor(color: readonly [number, number, number, number]): void {
  if (color.length !== 4 || color.some((channel) => channel < 0 || channel > 1 || !Number.isFinite(channel))) {
    throw new Error("UnlitMaterial color must contain four finite values in [0, 1]");
  }
}

function validatePointSize(pointSize: number): void {
  if (!Number.isFinite(pointSize) || pointSize <= 0) {
    throw new RangeError("UnlitMaterial pointSize must be a positive finite number");
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

/** 64 identity matrices: the uniform-path instance ceiling (mirrors ForwardPass MAX_GPU_INSTANCES). */
function defaultUnlitInstanceMatrices(): Float32Array {
  const matrices = new Float32Array(64 * 16);
  matrices[0] = 1;
  matrices[5] = 1;
  matrices[10] = 1;
  matrices[15] = 1;
  return matrices;
}
