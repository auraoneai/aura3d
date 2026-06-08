// Morph-target planning + packing. Decides how a set of morph targets should be uploaded to the
// GPU and packs the delta data accordingly:
//
//   - "uniform": small counts (<= the uniform cap) pack into the fixed uniform arrays the
//     morph-unlit shader already reads (fast path, no texture).
//   - "texture": larger counts pack position (and optional normal) deltas into an RGBA float data
//     texture indexed by (vertex, target), lifting the flat 4-target / 64-vertex uniform ceiling up
//     to the device's texture-size limit. This is the path that lets a real facial rig (ARKit ≈ 52
//     blendshapes over thousands of vertices) run on the GPU.
//   - Anything that exceeds even the texture limit falls back to the CPU morph (applyMorphTargets),
//     which is unlimited and already morphs normals + tangents.
//
// Pure and deterministic: given the same targets/weights it always produces the same plan.

import type { MorphTargetDelta } from "./MorphTarget";

/** Fixed uniform-array fast-path capacities (must match the morph-unlit shader's array sizes). */
export const MORPH_UNIFORM_MAX_TARGETS = 4;
export const MORPH_UNIFORM_MAX_VERTICES = 64;

export interface MorphDeviceLimits {
  /** Max texture dimension (texels) per axis. WebGL2/WebGPU baseline is 4096+. */
  readonly maxTextureSize: number;
}

export const DEFAULT_MORPH_DEVICE_LIMITS: MorphDeviceLimits = { maxTextureSize: 4096 };

export type MorphPlanMode = "uniform" | "texture" | "cpu";

export interface MorphPlanDecision {
  readonly mode: MorphPlanMode;
  readonly targetCount: number;
  readonly vertexCount: number;
  readonly morphsNormals: boolean;
  /** Rows of texels per target in texture mode (1 = positions only, 2 = positions + normals). */
  readonly rowsPerTarget: number;
  readonly textureWidth: number;
  readonly textureHeight: number;
  /** Why this mode was chosen (telemetry / gate detail). */
  readonly reason: string;
}

export interface MorphTargetPlan extends MorphPlanDecision {
  /**
   * RGBA float texels for texture mode (length = textureWidth*textureHeight*4), laid out as
   * row-major (y = target*rowsPerTarget + attributeRow, x = vertex). Empty for non-texture modes.
   */
  readonly textureData: Float32Array;
  /** Packed uniform arrays for uniform mode (positions/normals), empty for other modes. */
  readonly uniformPositionDeltas: Float32Array;
  readonly uniformNormalDeltas: Float32Array;
  readonly uniformWeights: Float32Array;
}

/** Decide the upload mode + dimensions for a morph set without packing data. Deterministic. */
export function planMorphTargets(
  targetCount: number,
  vertexCount: number,
  morphsNormals: boolean,
  limits: MorphDeviceLimits = DEFAULT_MORPH_DEVICE_LIMITS
): MorphPlanDecision {
  const rowsPerTarget = morphsNormals ? 2 : 1;
  if (targetCount <= MORPH_UNIFORM_MAX_TARGETS && vertexCount <= MORPH_UNIFORM_MAX_VERTICES) {
    return {
      mode: "uniform",
      targetCount,
      vertexCount,
      morphsNormals,
      rowsPerTarget,
      textureWidth: 0,
      textureHeight: 0,
      reason: `within uniform cap (${MORPH_UNIFORM_MAX_TARGETS} targets / ${MORPH_UNIFORM_MAX_VERTICES} verts)`
    };
  }
  const textureWidth = vertexCount;
  const textureHeight = targetCount * rowsPerTarget;
  if (textureWidth <= limits.maxTextureSize && textureHeight <= limits.maxTextureSize) {
    return {
      mode: "texture",
      targetCount,
      vertexCount,
      morphsNormals,
      rowsPerTarget,
      textureWidth,
      textureHeight,
      reason: `texture-backed (${textureWidth}x${textureHeight} <= ${limits.maxTextureSize})`
    };
  }
  return {
    mode: "cpu",
    targetCount,
    vertexCount,
    morphsNormals,
    rowsPerTarget,
    textureWidth: 0,
    textureHeight: 0,
    reason: `exceeds texture limit ${limits.maxTextureSize}; CPU morph fallback`
  };
}

/**
 * Plan AND pack a morph set. For "uniform" mode, fills the uniform arrays (position + normal
 * deltas). For "texture" mode, fills the RGBA float texture. "cpu" mode leaves both empty (the
 * caller should run `applyMorphTargets`). Deterministic.
 */
export function createMorphTargetPlan(
  targets: readonly MorphTargetDelta[],
  weights: readonly number[],
  vertexCount: number,
  limits: MorphDeviceLimits = DEFAULT_MORPH_DEVICE_LIMITS
): MorphTargetPlan {
  if (targets.length !== weights.length) {
    throw new Error("Morph target count must match morph weight count.");
  }
  const morphsNormals = targets.some((t) => t.normals && t.normals.length > 0);
  const decision = planMorphTargets(targets.length, vertexCount, morphsNormals, limits);
  const uniformWeights = new Float32Array(Math.max(MORPH_UNIFORM_MAX_TARGETS, targets.length));
  for (let i = 0; i < weights.length; i += 1) uniformWeights[i] = weights[i] ?? 0;

  if (decision.mode === "uniform") {
    const positions = new Float32Array(MORPH_UNIFORM_MAX_TARGETS * MORPH_UNIFORM_MAX_VERTICES * 4);
    const normals = new Float32Array(MORPH_UNIFORM_MAX_TARGETS * MORPH_UNIFORM_MAX_VERTICES * 4);
    for (let t = 0; t < targets.length; t += 1) {
      const target = targets[t]!;
      for (let v = 0; v < vertexCount; v += 1) {
        const offset = (t * MORPH_UNIFORM_MAX_VERTICES + v) * 4;
        writeVec3(positions, offset, target.positions?.[v]);
        writeVec3(normals, offset, target.normals?.[v]);
      }
    }
    return {
      ...decision,
      textureData: new Float32Array(0),
      uniformPositionDeltas: positions,
      uniformNormalDeltas: normals,
      uniformWeights: uniformWeights.slice(0, MORPH_UNIFORM_MAX_TARGETS)
    };
  }

  if (decision.mode === "texture") {
    const { textureWidth, textureHeight, rowsPerTarget } = decision;
    const data = new Float32Array(textureWidth * textureHeight * 4);
    for (let t = 0; t < targets.length; t += 1) {
      const target = targets[t]!;
      const posRow = t * rowsPerTarget;
      for (let v = 0; v < vertexCount; v += 1) {
        writeVec3(data, (posRow * textureWidth + v) * 4, target.positions?.[v]);
        if (rowsPerTarget === 2) {
          writeVec3(data, ((posRow + 1) * textureWidth + v) * 4, target.normals?.[v]);
        }
      }
    }
    return {
      ...decision,
      textureData: data,
      uniformPositionDeltas: new Float32Array(0),
      uniformNormalDeltas: new Float32Array(0),
      uniformWeights
    };
  }

  // cpu mode
  return {
    ...decision,
    textureData: new Float32Array(0),
    uniformPositionDeltas: new Float32Array(0),
    uniformNormalDeltas: new Float32Array(0),
    uniformWeights
  };
}

function writeVec3(out: Float32Array, offset: number, delta: readonly number[] | undefined): void {
  if (!delta) return;
  out[offset] = delta[0] ?? 0;
  out[offset + 1] = delta[1] ?? 0;
  out[offset + 2] = delta[2] ?? 0;
  out[offset + 3] = 0;
}
