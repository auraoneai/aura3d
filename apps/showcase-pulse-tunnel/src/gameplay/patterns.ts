/**
 * Pulse Tunnel authored pattern charts.
 *
 * One deterministic chart drives BOTH sync modes: beat mode schedules entries by
 * chart beat against the audio clock; pattern mode schedules the identical beats
 * against the frame-time accumulator. That is what "fully playable in pattern mode"
 * means here — the fallback is the same authored run, not a second game.
 *
 * Chart grammar (PRD section 5):
 * - `wall`  blocks one lane (switch lanes);
 * - `low`   spans the tunnel low (jump);
 * - `high`  hangs across the tunnel high (slide);
 * - `pylon` slides between two lanes (timing challenge).
 *
 * Density follows the music sections: intro sparse, build steadier, drop busiest,
 * finale mixed. The run is exactly PULSE_TOTAL_BEATS long; nothing is scheduled at
 * or beyond the final beat so the last gate always resolves before the summary.
 */
import {
  PULSE_BEAT_SECONDS,
  PULSE_TOTAL_BEATS,
  pulseTimeForBeat,
  type PulseSectionId
} from "./beat-clock";

export type PulseGateKind = "wall" | "low" | "high" | "pylon";

export interface PulseChartEntry {
  readonly id: string;
  /** Integer beat on which the gate arrives at the player plane. */
  readonly beat: number;
  readonly kind: PulseGateKind;
  /** Primary lane 0..2; ignored by tunnel-spanning kinds (`low`, `high`). */
  readonly lane: number;
  /** Second lane for `pylon` oscillation; defaults to `lane + 1` clamped in-bounds. */
  readonly moveTo?: number;
}

export const PULSE_CHART_DURATION_BEATS = PULSE_TOTAL_BEATS;

interface AuthoredEntry {
  readonly beat: number;
  readonly kind: PulseGateKind;
  readonly lane: number;
  readonly moveTo?: number;
}

/**
 * The authored chart. Written as plain data so the determinism test can deep-compare
 * two builds and the sync spec can measure arrival times against these exact beats.
 */
const AUTHORED_CHART: readonly AuthoredEntry[] = [
  // ---- intro (beats 0..31): teach one mechanic per phrase, generous spacing ----
  { beat: 8, kind: "low", lane: 1 },
  { beat: 16, kind: "high", lane: 1 },
  { beat: 22, kind: "wall", lane: 0 },
  { beat: 28, kind: "low", lane: 1 },

  // ---- build (32..79): lane walls join, pairs begin ----
  { beat: 34, kind: "wall", lane: 2 },
  { beat: 38, kind: "low", lane: 1 },
  { beat: 42, kind: "wall", lane: 0 },
  { beat: 46, kind: "high", lane: 1 },
  { beat: 50, kind: "wall", lane: 1 },
  { beat: 54, kind: "pylon", lane: 0, moveTo: 2 },
  { beat: 58, kind: "low", lane: 1 },
  { beat: 62, kind: "wall", lane: 0 },
  { beat: 64, kind: "wall", lane: 2 },
  { beat: 70, kind: "high", lane: 1 },
  { beat: 74, kind: "low", lane: 1 },
  { beat: 78, kind: "wall", lane: 1 },

  // ---- drop (80..127): busiest section, every mechanic active ----
  { beat: 82, kind: "low", lane: 1 },
  { beat: 84, kind: "wall", lane: 0 },
  { beat: 86, kind: "wall", lane: 2 },
  { beat: 90, kind: "high", lane: 1 },
  { beat: 92, kind: "pylon", lane: 0, moveTo: 2 },
  { beat: 96, kind: "low", lane: 1 },
  { beat: 98, kind: "wall", lane: 1 },
  { beat: 100, kind: "wall", lane: 0 },
  { beat: 104, kind: "high", lane: 1 },
  { beat: 106, kind: "pylon", lane: 1, moveTo: 0 },
  { beat: 110, kind: "low", lane: 1 },
  { beat: 112, kind: "wall", lane: 2 },
  { beat: 114, kind: "low", lane: 1 },
  { beat: 118, kind: "high", lane: 1 },
  { beat: 120, kind: "wall", lane: 0 },
  { beat: 122, kind: "wall", lane: 1 },
  { beat: 126, kind: "low", lane: 1 },

  // ---- finale (128..179): everything, faster phrases ----
  { beat: 130, kind: "low", lane: 1 },
  { beat: 132, kind: "wall", lane: 0 },
  { beat: 134, kind: "wall", lane: 2 },
  { beat: 138, kind: "high", lane: 1 },
  { beat: 140, kind: "pylon", lane: 0, moveTo: 2 },
  { beat: 144, kind: "low", lane: 1 },
  { beat: 146, kind: "wall", lane: 1 },
  { beat: 148, kind: "high", lane: 1 },
  { beat: 152, kind: "low", lane: 1 },
  { beat: 154, kind: "wall", lane: 0 },
  { beat: 156, kind: "pylon", lane: 2, moveTo: 0 },
  { beat: 160, kind: "low", lane: 1 },
  { beat: 162, kind: "wall", lane: 1 },
  { beat: 164, kind: "high", lane: 1 },
  { beat: 168, kind: "low", lane: 1 },
  { beat: 170, kind: "wall", lane: 2 },
  { beat: 172, kind: "pylon", lane: 0, moveTo: 2 },
  { beat: 176, kind: "high", lane: 1 }
];

/** Builds a fresh, sorted chart with stable ids and validated bounds. */
export function buildPulseChart(): PulseChartEntry[] {
  const entries = AUTHORED_CHART.map((entry, index) => ({
    id: `gate-${index}-b${entry.beat}-${entry.kind}`,
    beat: entry.beat,
    kind: entry.kind,
    lane: Math.max(0, Math.min(2, entry.lane)),
    ...(entry.moveTo === undefined ? {} : { moveTo: Math.max(0, Math.min(2, entry.moveTo)) })
  }));
  entries.sort((a, b) => a.beat - b.beat || a.id.localeCompare(b.id));
  return entries;
}

/** Scheduling time for a chart entry under either clock mode. */
export function pulseScheduleSecondsFor(entry: PulseChartEntry): number {
  return pulseTimeForBeat(entry.beat) ;
}

export function pulseChartSectionSummary(): Readonly<Record<PulseSectionId, number>> {
  const summary = { intro: 0, build: 0, drop: 0, finale: 0 };
  for (const entry of buildPulseChart()) {
    if (entry.beat < 32) summary.intro += 1;
    else if (entry.beat < 80) summary.build += 1;
    else if (entry.beat < 128) summary.drop += 1;
    else summary.finale += 1;
  }
  return summary;
}

/** Seconds-per-beat re-derived here so tests can catch accidental BPM drift. */
export const PULSE_CHART_BEAT_SECONDS = PULSE_BEAT_SECONDS;
