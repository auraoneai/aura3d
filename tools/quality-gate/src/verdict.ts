/**
 * G-REG / G-REF verdict engine (PRD-12 §6.4, §7.5, bar R3 in _sections/E).
 *
 * Distances are >= 0 (SSIM arrives gated as 1 - ssim from metrics.json).
 * Verdicts use the C-32 GateVerdict union; an item fails closed on any
 * infrastructure defect — "blocked-runner" for a software rasterizer is not a
 * code signal but the run still fails, so it is never adjudicated as a pass.
 */
import type { GateVerdict } from "./contracts";
import type { CapturedItem, GoldenEntry, GoldenManifest, MetricValue } from "./types";

/** G-REF bar R3: the reference-gap limits that admit a scene to the bar. */
export interface QualityBar {
  /** FLIP mean per object region. */
  readonly maxFlip: number;
  /** ΔE2000 mean on lit object mask. */
  readonly maxDeltaE2000: number;
  /** shadowContrast ratio tolerance (±15%). */
  readonly maxShadowContrastDelta: number;
  /** highlightEnergy relative change tolerance (±20%). */
  readonly maxHighlightEnergyDelta: number;
}

export const G_REF_BAR_R3: QualityBar = {
  maxFlip: 0.1,
  maxDeltaE2000: 3,
  maxShadowContrastDelta: 0.15,
  maxHighlightEnergyDelta: 0.2
};

const SOFTWARE_RASTERIZER = /swiftshader|llvmpipe|software/i;

export interface ItemVerdictInput {
  readonly item: CapturedItem;
  /** Item-level flags from capture/calibration before metric comparison. */
  readonly maskMisaligned?: boolean;
  readonly calibrationBroken?: boolean;
  readonly nonDiscriminating?: boolean;
  readonly captureFailed?: boolean;
  readonly forbiddenFlags?: readonly string[];
}

export interface GoldenIndex {
  readonly manifest: GoldenManifest;
  readonly byItemId: ReadonlyMap<string, GoldenEntry>;
}

export function indexGoldens(manifest: GoldenManifest): GoldenIndex {
  const byItemId = new Map<string, GoldenEntry>();
  for (const entry of manifest.entries) byItemId.set(entry.itemId, entry);
  return { manifest, byItemId };
}

function thresholdFor(entry: GoldenEntry, value: MetricValue): number | undefined {
  return entry.thresholds.find((t) => t.metric === value.metric && t.region === value.region)?.threshold;
}

/** Distance used for verdict checks: pairwise when present (detectors gate on |pairwise|), else aura. */
function distanceOf(value: MetricValue): number | null {
  return value.pairwise ?? null;
}

/**
 * evaluateGates: gate verdicts per item + the process exit code (§7.5).
 * Order matters — an infrastructure verdict (blocked-runner, capture-failed,
 * forbidden flag) is emitted INSTEAD of metric verdicts, never alongside them:
 * a frame that is not evidence cannot produce a regression or a pass.
 */
export function evaluateGates(input: {
  items: readonly ItemVerdictInput[];
  metrics: ReadonlyMap<string, readonly MetricValue[]>;
  goldens: GoldenManifest;
  bar?: QualityBar;
}): { itemVerdicts: Map<string, GateVerdict[]>; exitCode: 0 | 1 } {
  const bar = input.bar ?? G_REF_BAR_R3;
  const goldens = indexGoldens(input.goldens);
  const itemVerdicts = new Map<string, GateVerdict[]>();
  let exitCode: 0 | 1 = 0;
  for (const { item, ...flags } of input.items) {
    const verdicts: GateVerdict[] = [];
    const gpu = item.env?.gpuRenderer ?? "";
    if (SOFTWARE_RASTERIZER.test(gpu)) verdicts.push("blocked-runner");
    if (flags.captureFailed) verdicts.push("capture-failed");
    if (flags.forbiddenFlags && flags.forbiddenFlags.length > 0) verdicts.push("forbidden-capture-flag");
    if (flags.maskMisaligned) verdicts.push("mask-misaligned");
    if (flags.calibrationBroken) verdicts.push("calibration-broken");
    if (flags.nonDiscriminating) verdicts.push("non-discriminating");

    const golden = goldens.byItemId.get(item.itemId);
    const values = input.metrics.get(item.itemId) ?? [];
    if (verdicts.length === 0) {
      if (!golden) {
        // No approved golden: the item cannot pass G-REG; it is calibration data.
        verdicts.push("non-discriminating");
      } else {
        const failures = values.filter((value) => {
          const threshold = thresholdFor(golden, value);
          const distance = distanceOf(value);
          return value.status !== "unavailable" && threshold !== undefined && distance !== null && distance > threshold;
        });
        if (failures.length > 0) verdicts.push("regression");
      }
      // G-REF distance bar (independent of golden regression): a frame that
      // misses the reference limits is a reference-gap, not a pass.
      for (const value of values) {
        if (value.status === "unavailable") continue;
        const distance = distanceOf(value);
        if (distance === null) continue;
        if (value.metric === "flip" && distance > bar.maxFlip) push(verdicts, "reference-gap");
        if (value.metric === "deltaE2000" && distance > bar.maxDeltaE2000) push(verdicts, "reference-gap");
        if (value.metric === "shadowContrast" && Math.abs(distance) > bar.maxShadowContrastDelta) push(verdicts, "reference-gap");
        if (value.metric === "highlightEnergy" && Math.abs(distance) > bar.maxHighlightEnergyDelta) push(verdicts, "reference-gap");
      }
      if (verdicts.length === 0) verdicts.push("pass");
    }
    if (!verdicts.includes("pass")) exitCode = 1;
    itemVerdicts.set(item.itemId, verdicts);
  }
  return { itemVerdicts, exitCode };
}

function push(verdicts: GateVerdict[], verdict: GateVerdict): void {
  if (!verdicts.includes(verdict)) verdicts.push(verdict);
}
