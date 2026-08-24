/**
 * Gravity Post — sampled trajectory prediction builder.
 *
 * Pure geometry: converts an integratePath sample list into placement specs the
 * scene layer renders as a primitive bead trail (never DOM/SVG). Budget guard:
 * the builder refuses more than PREDICTION_MAX_STEPS integration steps.
 */
import type { TrajectorySample } from "./wells";
import { FIXED_DT } from "./wells";

export const PREDICTION_MAX_STEPS = 200;
/** Published maximum positional error for the pinned no-correction fixture. */
export const PREDICTION_DIVERGENCE_TOLERANCE = 0.02;

export interface PredictionDivergence {
  readonly comparedSamples: number;
  readonly maxPositionError: number;
  readonly meanPositionError: number;
  readonly withinTolerance: boolean;
}

/** Compare prediction and live samples by shared fixed-step index. */
export function measurePredictionDivergence(
  predicted: readonly TrajectorySample[],
  live: readonly TrajectorySample[],
  tolerance = PREDICTION_DIVERGENCE_TOLERANCE
): PredictionDivergence {
  const count = Math.min(predicted.length, live.length);
  let maxPositionError = 0;
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    const expected = predicted[index]!.position;
    const actual = live[index]!.position;
    const error = Math.hypot(expected[0] - actual[0], expected[1] - actual[1]);
    maxPositionError = Math.max(maxPositionError, error);
    total += error;
  }
  return {
    comparedSamples: count,
    maxPositionError,
    meanPositionError: count === 0 ? 0 : total / count,
    withinTolerance: count > 0 && maxPositionError <= tolerance
  };
}

export interface PredictionBead {
  readonly x: number;
  readonly z: number;
  /** Normalized progress along the line, 0..1, for sizing/fading. */
  readonly progress: number;
}

export interface PredictionBuildOptions {
  readonly samples: readonly TrajectorySample[];
  readonly maxBeads?: number;
}

/** Downsample integration samples into at most maxBeads placements. */
export function buildPredictionBeads(options: PredictionBuildOptions): PredictionBead[] {
  const { samples } = options;
  const maxBeads = Math.max(2, Math.min(64, options.maxBeads ?? 40));
  if (samples.length < 2) return [];
  const beads: PredictionBead[] = [];
  const stride = Math.max(1, Math.floor(samples.length / maxBeads));
  for (let index = 0; index < samples.length; index += stride) {
    const sample = samples[index]!;
    beads.push({
      x: sample.position[0],
      z: sample.position[1],
      progress: index / Math.max(1, samples.length - 1)
    });
  }
  return beads;
}

/** Integration steps for one full prediction sweep at FIXED_DT granularity. */
export function predictionStepsForHorizon(seconds: number): number {
  return Math.min(PREDICTION_MAX_STEPS, Math.max(8, Math.round(seconds / FIXED_DT)));
}
