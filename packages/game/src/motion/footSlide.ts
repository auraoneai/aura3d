export interface FootSlideOptions {
  /** A foot counts as planted when it is within this height of the ground (default 0.06 m). */
  readonly plantedHeight?: number;
  /** Planted foot horizontal speed limit in m/s (default 0.15). */
  readonly threshold?: number;
  /** Minimum foot lift range in metres expected when the body moves faster than `movingSpeed` (default 0.03). */
  readonly minLift?: number;
  readonly movingSpeed?: number;
}

export interface FootSlideReport {
  readonly samples: number;
  readonly plantedSamples: number;
  readonly maxPlantedSpeed: number;
  readonly meanPlantedSpeed: number;
  readonly p95PlantedSpeed: number;
  /** Highest minus lowest foot height seen while the body was moving. */
  readonly liftRange: number;
  /** The body moved but the foot never lifted: legs are not stepping. */
  readonly notStepping: boolean;
  readonly passed: boolean;
}

export interface FootSlideMeter {
  feed(timeSeconds: number, foot: readonly [number, number, number], extra?: { readonly groundHeight?: number; readonly bodySpeed?: number }): void;
  report(): FootSlideReport;
  reset(): void;
}

/** Objective version of "he is just sliding": world speed of a planted foot, plus a legs-not-stepping check. */
export function createFootSlideMeter(options: FootSlideOptions = {}): FootSlideMeter {
  const plantedHeight = options.plantedHeight ?? 0.06;
  const threshold = options.threshold ?? 0.15;
  const minLift = options.minLift ?? 0.03;
  const movingSpeed = options.movingSpeed ?? 0.5;
  let prev: { t: number; p: readonly [number, number, number]; planted: boolean } | undefined;
  let speeds: number[] = [];
  let samples = 0;
  let loLift = Number.POSITIVE_INFINITY;
  let hiLift = Number.NEGATIVE_INFINITY;
  let movingSamples = 0;

  return {
    feed(t, foot, extra) {
      const ground = extra?.groundHeight ?? 0;
      const h = foot[1] - ground;
      const planted = h <= plantedHeight;
      samples += 1;
      if ((extra?.bodySpeed ?? 0) >= movingSpeed) {
        movingSamples += 1;
        loLift = Math.min(loLift, h);
        hiLift = Math.max(hiLift, h);
      }
      if (prev !== undefined && planted && prev.planted && t > prev.t) {
        const dx = foot[0] - prev.p[0];
        const dz = foot[2] - prev.p[2];
        speeds.push(Math.hypot(dx, dz) / (t - prev.t));
      }
      prev = { t, p: foot, planted };
    },
    report() {
      const sorted = [...speeds].sort((a, b) => a - b);
      const max = sorted.length ? sorted[sorted.length - 1]! : 0;
      const mean = sorted.length ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;
      const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]! : 0;
      const liftRange = movingSamples > 0 ? hiLift - loLift : 0;
      const notStepping = movingSamples > 5 && liftRange < minLift;
      return {
        samples,
        plantedSamples: sorted.length,
        maxPlantedSpeed: max,
        meanPlantedSpeed: mean,
        p95PlantedSpeed: p95,
        liftRange,
        notStepping,
        passed: !notStepping && p95 <= threshold
      };
    },
    reset() {
      prev = undefined;
      speeds = [];
      samples = 0;
      loLift = Number.POSITIVE_INFINITY;
      hiLift = Number.NEGATIVE_INFINITY;
      movingSamples = 0;
    }
  };
}
