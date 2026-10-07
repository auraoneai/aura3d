/**
 * PRD 11 Phase 3 (§6.6 layer 3) — `DrawDataTexture` is the per-draw data
 * source the `a3d_prd11_draw_id` chunk fetches. Each draw occupies
 * `TEXELS_PER_DRAW` RGBA32F texels in a single-row texture:
 *
 *   [0..3]  model matrix columns 0..3 (mat4)
 *   [4]     base colour (linear RGBA; multiplies the shared material)
 *   [5]     meta — (firstIndex, baseVertex, indexCount, flags)
 *
 * `gl_DrawID` (with `WEBGL_multi_draw`) or the `u_drawId` uniform (loop
 * fallback) selects the row offset `drawIndex * TEXELS_PER_DRAW`.
 */

import { Texture, type TextureDescriptor } from "../Texture";
import { TextureBinding } from "../TextureBinding";
import type { UniformValue } from "../RenderDevice";

export const DRAW_DATA_TEXELS_PER_DRAW = 6;

export interface DrawDataEntry {
  /** Column-major mat4. */
  readonly model: ArrayLike<number>;
  readonly baseColor?: ArrayLike<number>;
  /** Packed meta texel; defaults to firstIndex=baseVertex=indexCount=flags=0. */
  readonly meta?: ArrayLike<number>;
}

export class DrawDataTexture {
  private readonly data: Float32Array;
  private texture: Texture | null = null;
  private dirty = true;
  private restoreRegistered = false;

  constructor(readonly maxDraws: number) {
    if (!Number.isInteger(maxDraws) || maxDraws <= 0) {
      throw new RangeError("DrawDataTexture maxDraws must be a positive integer");
    }
    this.data = new Float32Array(maxDraws * DRAW_DATA_TEXELS_PER_DRAW * 4);
  }

  setDraw(drawIndex: number, entry: DrawDataEntry): void {
    if (drawIndex < 0 || drawIndex >= this.maxDraws) {
      throw new RangeError(`Draw index ${drawIndex} outside DrawDataTexture capacity ${this.maxDraws}`);
    }
    const base = drawIndex * DRAW_DATA_TEXELS_PER_DRAW * 4;
    for (let i = 0; i < 16; i += 1) this.data[base + i] = entry.model[i] ?? (i % 5 === 0 ? 1 : 0);
    const color = entry.baseColor;
    this.data[base + 16] = color?.[0] ?? 1;
    this.data[base + 17] = color?.[1] ?? 1;
    this.data[base + 18] = color?.[2] ?? 1;
    this.data[base + 19] = color?.[3] ?? 1;
    const meta = entry.meta;
    this.data[base + 20] = meta?.[0] ?? 0;
    this.data[base + 21] = meta?.[1] ?? 0;
    this.data[base + 22] = meta?.[2] ?? 0;
    this.data[base + 23] = meta?.[3] ?? 0;
    this.dirty = true;
  }

  /** Uniform snapshot for tests and the `u_drawId` loop path. */
  drawTexels(drawIndex: number): Float32Array {
    const base = drawIndex * DRAW_DATA_TEXELS_PER_DRAW * 4;
    return this.data.subarray(base, base + DRAW_DATA_TEXELS_PER_DRAW * 4);
  }

  descriptor(): TextureDescriptor {
    return {
      width: this.maxDraws * DRAW_DATA_TEXELS_PER_DRAW,
      height: 1,
      format: "rgba32f",
      colorSpace: "linear",
      label: "a3d-prd11-draw-data",
      data: this.data
    };
  }

  /** Materializes/re-uploads only when marked dirty; the Texture itself is CPU data until the device binds it. */
  upload(): Texture {
    if (!this.texture || this.dirty) {
      this.texture?.dispose();
      this.texture = new Texture(this.descriptor());
      this.dirty = false;
    }
    return this.texture;
  }

  /**
   * PRD 11 Phase 5 (§6.9): register with the C-29 `ResourceRegistry` once.
   * The CPU-side `data` array IS the retained source — the restore rebuild
   * marks the texture dirty and re-uploads it.
   */
  registerForRestore(registry: { register<T extends object>(handle: T, descriptor: { kind: string; rebuild: () => Promise<void> | void }): T }): void {
    if (this.restoreRegistered) return;
    this.restoreRegistered = true;
    registry.register(this, {
      kind: "a3d-prd11-draw-data",
      rebuild: () => {
        this.texture?.dispose();
        this.texture = null;
        this.upload();
      }
    });
  }

  /** `sampler2D` binding ready for `uniforms.set("u_a3dDrawData", ...)`. */
  asUniform(): UniformValue {
    return new TextureBinding({ name: "u_a3dDrawData", texture: this.upload(), required: false });
  }

  dispose(): void {
    this.texture?.dispose();
    this.texture = null;
  }
}
