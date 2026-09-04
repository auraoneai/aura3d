/**
 * B1 cascade stabilization (muse3jsparity-PRD).
 *
 * Sits on top of the existing `selectForwardShadowMap` depth selection:
 * hysteresis on cascade selection, a temporal shimmer metric, and
 * per-cascade bias tables. Pure functions so the 60s moving-camera browser
 * stress can assert the same math the renderer uses.
 */

export interface HysteresisCascadeSplit {
  readonly index: number;
  readonly near: number;
  readonly far: number;
}

export interface CascadeHysteresisInput {
  readonly depth: number;
  readonly splits: readonly HysteresisCascadeSplit[];
  /** Previously selected cascade index, or null on the first frame. */
  readonly previousIndex: number | null;
  /**
   * Hysteresis band as a fraction of the current cascade depth span.
   * The camera must travel this far past a boundary before the selection
   * flips, which kills boundary flicker on long moving-camera paths.
   */
  readonly hysteresis?: number;
}

export function selectCascadeWithHysteresis(input: CascadeHysteresisInput): number {
  if (input.splits.length === 0) throw new RangeError("Cascade hysteresis requires at least one split.");
  if (!Number.isFinite(input.depth) || input.depth < 0) {
    throw new RangeError("Cascade hysteresis depth must be finite and non-negative.");
  }
  const hysteresis = input.hysteresis ?? 0.08;
  if (!Number.isFinite(hysteresis) || hysteresis < 0 || hysteresis > 0.5) {
    throw new RangeError("Cascade hysteresis must be in [0, 0.5].");
  }
  const raw = rawCascadeIndex(input.depth, input.splits);
  if (input.previousIndex === null) return raw;
  if (raw === input.previousIndex) return raw;
  const current = input.splits[input.previousIndex];
  if (!current) return raw;
  const span = Math.max(current.far - current.near, 1e-6);
  if (raw > input.previousIndex) {
    // Moving outward: require depth to clear the far edge + band.
    if (input.depth <= current.far + hysteresis * span) return input.previousIndex;
    return raw;
  }
  // Moving inward: require depth to clear the near edge - band.
  if (input.depth >= current.near - hysteresis * span) return input.previousIndex;
  return raw;
}

function rawCascadeIndex(depth: number, splits: readonly HysteresisCascadeSplit[]): number {
  const hit = splits.find((split) => depth <= split.far);
  return hit ? hit.index : splits[splits.length - 1]!.index;
}

export interface ShimmerSample {
  readonly cascadeIndex: number;
  /** Receiver depth used for this frame's selection. */
  readonly depth: number;
}

export interface ShimmerScore {
  /** Fraction of frames where the cascade index changed (0 = rock solid). */
  readonly flipRate: number;
  /** Mean absolute depth delta per frame, normalized by scene depth range. */
  readonly depthJitter: number;
  /** Combined score in [0, 1]; the B1 long-path stress asserts this. */
  readonly score: number;
  readonly frames: number;
}

/**
 * Temporal shimmer metric over a moving-camera sample window.
 * flipRate captures cascade-boundary flicker; depthJitter captures the
 * camera-path energy so the stress report proves the camera actually moved.
 */
export function computeShimmerScore(samples: readonly ShimmerSample[], sceneDepthRange: number): ShimmerScore {
  if (samples.length < 2) throw new RangeError("Shimmer scoring requires at least two samples.");
  if (!Number.isFinite(sceneDepthRange) || sceneDepthRange <= 0) {
    throw new RangeError("Shimmer sceneDepthRange must be finite and positive.");
  }
  let flips = 0;
  let jitter = 0;
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i]!.cascadeIndex !== samples[i - 1]!.cascadeIndex) flips += 1;
    jitter += Math.abs(samples[i]!.depth - samples[i - 1]!.depth);
  }
  const frames = samples.length - 1;
  const flipRate = Number((flips / frames).toFixed(6));
  const depthJitter = Number((jitter / frames / sceneDepthRange).toFixed(6));
  // A static camera legitimately scores 0 (no flicker without motion), so the
  // B1 60s stress must drive a moving-camera path: depthJitter is reported
  // alongside the score so reviewers can verify the path had energy.
  const score = Number(Math.min(1, flipRate * (1 + depthJitter * 10)).toFixed(6));
  return { flipRate, depthJitter, score, frames: samples.length };
}

export interface CascadeBiasTableEntry {
  readonly cascadeIndex: number;
  readonly baseBias: number;
  readonly slopeScale: number;
  readonly texelSize: number;
  /** Effective bias at normal incidence (grazing adds slope term). */
  readonly effectiveBias: number;
}

/**
 * Per-cascade bias tables: outer cascades cover more world per texel, so
 * both the base bias and the slope scale grow with cascade index while the
 * innermost cascade keeps the tightest values (contact-gap retention).
 */
export function createCascadeBiasTable(options: {
  readonly cascadeCount: number;
  readonly baseBias?: number;
  readonly slopeScale?: number;
  readonly texelSize?: number;
  readonly growthPerCascade?: number;
}): readonly CascadeBiasTableEntry[] {
  const cascadeCount = options.cascadeCount;
  if (!Number.isInteger(cascadeCount) || cascadeCount <= 0 || cascadeCount > 8) {
    throw new RangeError("Cascade bias table requires 1-8 cascades.");
  }
  const baseBias = options.baseBias ?? 0.001;
  const slopeScale = options.slopeScale ?? 1;
  const texelSize = options.texelSize ?? 1;
  const growth = options.growthPerCascade ?? 0.35;
  if (!Number.isFinite(baseBias) || baseBias < 0) throw new RangeError("Cascade baseBias must be finite and non-negative.");
  if (!Number.isFinite(slopeScale) || slopeScale < 0) throw new RangeError("Cascade slopeScale must be finite and non-negative.");
  if (!Number.isFinite(texelSize) || texelSize <= 0) throw new RangeError("Cascade texelSize must be finite and positive.");
  if (!Number.isFinite(growth) || growth < 0) throw new RangeError("Cascade bias growth must be finite and non-negative.");
  return Array.from({ length: cascadeCount }, (_, index) => {
    const entryBase = Number((baseBias * (1 + growth * index)).toFixed(8));
    const entrySlope = Number((slopeScale * (1 + growth * index)).toFixed(8));
    return {
      cascadeIndex: index,
      baseBias: entryBase,
      slopeScale: entrySlope,
      texelSize,
      effectiveBias: entryBase,
    };
  });
}
