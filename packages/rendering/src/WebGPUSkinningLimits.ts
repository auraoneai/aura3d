/**
 * WebGPU skinning capacity, kept in its own module on purpose.
 *
 * `WebGPUDevice` is ~139 KB of source including WGSL shader text. `createRenderDevice` imports it
 * dynamically so a WebGL2-only route can drop it, but Rollup keeps a dynamically imported module in
 * the eager graph if *anything* also imports it statically. The public barrel did exactly that, to
 * re-export this constant, which alone was enough to defeat the split ("dynamic import will not move
 * module into another chunk").
 *
 * Holding the value here lets the barrel keep exporting it while the device itself stays lazy.
 */

/** Joint-palette capacity of the WebGPU skinning path — parity with the WebGL2 `u_jointMatrices[96]`. */
export const MAX_WEBGPU_SKINNING_JOINTS = 96;

/**
 * Machine-readable reason a skinned mesh takes (or avoids) the CPU skinning fallback.
 * Reported in diagnostics so gates can distinguish "too many joints" from "no GPU path
 * available" instead of lumping every fallback together.
 */
export type SkinningCpuFallbackReason =
  /** Joint count fits the uniform array; no fallback involved. */
  | "none-uniform-array"
  /** Joint count exceeds the uniform array but fits the data-texture palette path. */
  | "none-data-texture"
  /** Joint count exceeds even the data-texture ceiling — CPU skinning is the only option. */
  | "joint-count-exceeds-data-texture-limit"
  /** The shader has no data-texture palette uniforms, so palettes above the uniform cap fall back. */
  | "shader-lacks-data-texture-palette"
  /** No joint-palette uniforms at all on this shader — CPU skinning is the only option. */
  | "shader-lacks-skinning-uniforms";

export interface SkinningPaletteDecision {
  readonly jointCount: number;
  /** `"uniform-array"` | `"data-texture"` — the GPU upload path, or `"cpu"` when neither fits. */
  readonly path: "uniform-array" | "data-texture" | "cpu";
  readonly reason: SkinningCpuFallbackReason;
  /** True when the mesh must be skinned on the CPU for this shader/capability set. */
  readonly cpuFallback: boolean;
}

/**
 * Decide the joint-palette upload path for a skinned mesh without touching the GPU.
 * Pure and deterministic: same inputs always produce the same decision, so diagnostics
 * and gates can assert on it in unit tests.
 *
 * Mirrors the runtime rule in the forward pass (uniform array up to the uniform cap,
 * data-texture palette above it when the shader declares the uniforms, CPU otherwise)
 * without importing renderer internals.
 */
export function decideSkinningPalettePath(options: {
  readonly jointCount: number;
  readonly maxUniformJoints?: number;
  readonly maxDataTextureJoints?: number;
  readonly shaderHasDataTexturePalette?: boolean;
  readonly shaderHasSkinningUniforms?: boolean;
}): SkinningPaletteDecision {
  const jointCount = options.jointCount;
  if (!Number.isInteger(jointCount) || jointCount < 0) {
    throw new Error("decideSkinningPalettePath jointCount must be a non-negative integer.");
  }
  const maxUniformJoints = options.maxUniformJoints ?? MAX_WEBGPU_SKINNING_JOINTS;
  const maxDataTextureJoints = options.maxDataTextureJoints ?? MAX_WEBGPU_SKINNING_JOINTS;
  const shaderHasSkinningUniforms = options.shaderHasSkinningUniforms ?? true;
  const shaderHasDataTexturePalette = options.shaderHasDataTexturePalette ?? true;
  if (jointCount <= maxUniformJoints && shaderHasSkinningUniforms) {
    return { jointCount, path: "uniform-array", reason: "none-uniform-array", cpuFallback: false };
  }
  if (!shaderHasSkinningUniforms) {
    return { jointCount, path: "cpu", reason: "shader-lacks-skinning-uniforms", cpuFallback: true };
  }
  if (jointCount <= maxDataTextureJoints && shaderHasDataTexturePalette) {
    return { jointCount, path: "data-texture", reason: "none-data-texture", cpuFallback: false };
  }
  if (!shaderHasDataTexturePalette) {
    return { jointCount, path: "cpu", reason: "shader-lacks-data-texture-palette", cpuFallback: true };
  }
  return { jointCount, path: "cpu", reason: "joint-count-exceeds-data-texture-limit", cpuFallback: true };
}
