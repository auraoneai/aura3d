/**
 * §6.4 calibrated thresholds (T2.6). Pure function over measured distances —
 * no image reads here; metrics.py and the capture side produce MetricValues.
 *
 * Per (item, metric, region) triple:
 *   N = max pairwise repeat distance (5 captures → 10 pairwise)
 *   T = max(3·N, floor[metric])
 *   triple discriminates control c when T ≤ 0.5·B_c; B_c = max variant distance
 *   uncovered applicable control → item is calibration-broken
 */
import type {
  CalibratedThreshold, CalibrationReport, CapturedItem, MetricId, MetricValue, RegionId
} from "./types";

type BrokenControlId = import("../../../benchmarks/quality-rebuild/shared/contracts").BrokenControlId;

/** §6.4 initial G-REG floors (tightened only by a new PRD revision). */
export const G_REG_FLOORS: Readonly<Partial<Record<MetricId, number>>> = {
  flip: 0.02,
  ssim: 0.005,          // gated as 1 - ssim
  deltaE2000: 0.5,
  lpips: 0.01,
  // Ratio detectors: relative change floor.
  shadowContrast: 0.05,
  highlightEnergy: 0.05,
  roughnessResponse: 0.05,
  contactDarkening: 0.05,
  textureDetail: 0.05,
  edgeAliasing: 0.05,
  subjectPresence: 0.05,
  temporalFlicker: 0.05,
  // Absolute-change detectors in luma units (0-255).
  skyVariance: 1.0,
  dynamicRange: 1.0,
  blankOrBlack: 1.0
};

export interface CalibrateInputs {
  /** Pairwise distances among the repeat captures: each entry is one comparison's MetricValue[]. */
  readonly noise: readonly MetricValue[][];
  /**
   * Per-control variant comparisons. `aura` = d(variant, golden) on the Aura
   * side; `three` = the three-side measurement used when the variant is
   * unexpressible through the public API (§6.4 "three-proxy").
   */
  readonly variants: Readonly<Partial<Record<BrokenControlId | "aura3d-tuned", {
    readonly aura?: readonly MetricValue[];
    readonly three?: readonly MetricValue[];
  }>>>;
}

function pairwiseKey(value: MetricValue): string {
  return `${value.metric}@${value.region}`;
}

function distance(value: MetricValue): number | null {
  return value.status === "unavailable" ? null : (value.pairwise ?? null);
}

export function calibrate(
  item: CapturedItem,
  inputs: CalibrateInputs,
  floors: Readonly<Partial<Record<MetricId, number>>> = G_REG_FLOORS
): CalibrationReport {
  const itemId = item.itemId;
  const keys = new Set<string>();
  for (const comp of inputs.noise) for (const v of comp) keys.add(pairwiseKey(v));
  for (const control of Object.keys(inputs.variants)) {
    const variant = inputs.variants[control as BrokenControlId];
    for (const v of [...(variant?.aura ?? []), ...(variant?.three ?? [])]) keys.add(pairwiseKey(v));
  }

  const thresholds: CalibratedThreshold[] = [];
  const controls = Object.keys(inputs.variants) as BrokenControlId[];

  for (const key of keys) {
    const [metric, region] = key.split("@") as [MetricId, RegionId];
    let noiseMax = 0;
    for (const comp of inputs.noise) {
      for (const v of comp) {
        if (pairwiseKey(v) !== key) continue;
        const d = distance(v);
        if (d !== null && d > noiseMax) noiseMax = d;
      }
    }
    const threshold = Math.max(3 * noiseMax, floors[metric] ?? 0);
    const brokenControls: Record<string, { distance: number; source: "aura" | "three-proxy" }> = {};
    const rejects: BrokenControlId[] = [];
    for (const control of controls) {
      const variant = inputs.variants[control as BrokenControlId];
      if (!variant) continue;
      const source: "aura" | "three-proxy" = variant.aura && variant.aura.length > 0 ? "aura" : "three-proxy";
      const rows = (source === "aura" ? variant.aura : variant.three) ?? [];
      let bMax: number | null = null;
      for (const v of rows) {
        if (pairwiseKey(v) !== key) continue;
        const d = distance(v);
        if (d !== null && (bMax === null || d > bMax)) bMax = d;
      }
      if (bMax === null) continue;
      brokenControls[control] = { distance: bMax, source };
      if (threshold <= 0.5 * bMax) rejects.push(control);
    }
    thresholds.push({
      itemId, metric, region, noiseMax, brokenControls, threshold,
      rejects, active: rejects.length > 0,
      calibratedAt: { commitSha: item.env.commitSha, runnerImage: item.env.runnerImage }
    });
  }

  // Coverage: every applicable control must be rejected by ≥1 active triple.
  const covered = new Set(thresholds.flatMap((t) => t.rejects));
  const uncoveredControls = controls.filter((control) => !covered.has(control));
  return { itemId, thresholds, uncoveredControls };
}

/**
 * §6.4 self-test: re-rendered broken-control distances (a separate capture run,
 * never the calibration images) must each exceed the calibrated threshold.
 * Returns the covered controls the gate no longer rejects — the caller exits 1
 * with `calibration-broken` when this list is non-empty.
 */
export function selfTest(
  report: CalibrationReport,
  selfTestMetrics: Readonly<Partial<Record<BrokenControlId, readonly MetricValue[]>>>
): BrokenControlId[] {
  const failed: BrokenControlId[] = [];
  const covered = new Set(report.thresholds.flatMap((t) => t.rejects));
  for (const control of covered) {
    const rejected = report.thresholds.some((t) => {
      if (!t.rejects.includes(control)) return false;
      const measured = (selfTestMetrics[control] ?? []).some(
        (v) => v.metric === t.metric && v.region === t.region && distance(v) !== null && distance(v)! > t.threshold
      );
      return measured;
    });
    if (!rejected) failed.push(control);
  }
  return failed;
}
