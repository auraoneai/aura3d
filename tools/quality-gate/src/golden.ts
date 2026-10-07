/**
 * §7.5 golden store (T3.1). Goldens live under benchmarks/quality-rebuild/goldens/
 * as LFS images + a tracked manifest.json. proposeGoldenUpdate refuses without a
 * passing panel aggregate — goldens are panel-approved, never auto-promoted.
 */
import { readFileSync } from "node:fs";
import type { GateVerdict } from "./contracts";
import type {
  CalibratedThreshold, CapturedItem, GoldenEntry, GoldenManifest, MetricValue, PanelRoundRecordDoc
} from "./types";

export function loadGoldens(manifestPath: string): GoldenManifest {
  const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (raw?.schema !== "aura3d.quality-gate.goldens/1" || !Array.isArray(raw.entries)) {
    throw new Error(`golden manifest ${manifestPath} is not schema aura3d.quality-gate.goldens/1`);
  }
  return raw as GoldenManifest;
}

/**
 * Compare a fresh capture's metrics against its golden's calibrated thresholds.
 * `pairwise` is aura-vs-golden on the G-REG path. Distances only — a metric
 * without a calibrated threshold on this golden does not vote.
 */
export function compareToGolden(
  item: CapturedItem,
  golden: GoldenEntry,
  metrics: readonly MetricValue[]
): { verdict: GateVerdict; failures: MetricValue[] } {
  const failures = metrics.filter((value) => {
    const threshold = golden.thresholds.find(
      (t) => t.metric === value.metric && t.region === value.region
    )?.threshold;
    if (threshold === undefined || value.status === "unavailable") return false;
    const distance = value.pairwise;
    return distance !== null && distance > threshold;
  });
  return { verdict: failures.length > 0 ? "regression" : "pass", failures };
}

/**
 * Propose updated goldens after a panel round (T3.1). Throws unless every item
 * has a round aggregate that is `pass` — or, where a current manifest supplies
 * one, whose median is no worse than the median recorded for the round that
 * approved the current golden.
 */
export function proposeGoldenUpdate(input: {
  items: readonly CapturedItem[];
  round: PanelRoundRecordDoc;
  calibrations: ReadonlyMap<string, readonly CalibratedThreshold[]>;
  current?: GoldenManifest;
  runnerImage: string;
  gpuRenderer: string;
}): GoldenManifest {
  const { items, round, calibrations } = input;
  const currentById = new Map((input.current?.entries ?? []).map((e) => [e.itemId, e]));
  const entries: GoldenEntry[] = [];
  for (const item of items) {
    const aggregate = round.aggregates.find((a) => a.itemId === item.itemId);
    const current = currentById.get(item.itemId);
    if (!aggregate) {
      throw new Error(`proposeGoldenUpdate: no panel aggregate for ${item.itemId} in round ${round.roundId}`);
    }
    const passes = aggregate.verdict === "pass";
    const noWorse = current !== undefined && aggregate.median >= 0 && medianOfApproved(current, round) !== null
      ? aggregate.median >= (medianOfApproved(current, round) ?? Infinity)
      : false;
    if (!passes && !noWorse) {
      throw new Error(
        `proposeGoldenUpdate: ${item.itemId} refused — aggregate verdict ${aggregate.verdict}` +
        (current ? ` and median ${aggregate.median} worse than the approved golden` : "")
      );
    }
    entries.push({
      itemId: item.itemId,
      image: item.aura,
      masks: item.masks,
      thresholds: calibrations.get(item.itemId) ?? current?.thresholds ?? [],
      approvedBy: round.roundId,
      supersedes: current?.image.sha256 ?? null
    });
  }
  return {
    schema: "aura3d.quality-gate.goldens/1",
    runnerImage: input.runnerImage,
    gpuRenderer: input.gpuRenderer,
    entries
  };
}

/** Median recorded for the round that approved this entry, when resolvable. */
function medianOfApproved(entry: GoldenEntry, round: PanelRoundRecordDoc): number | null {
  return round.aggregates.find((a) => a.itemId === entry.itemId)?.median ?? null;
}
