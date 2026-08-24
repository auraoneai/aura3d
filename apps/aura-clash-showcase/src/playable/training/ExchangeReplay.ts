/**
 * AC-A2 — training exchange replay.
 *
 * Records the last few seconds of an exchange as per-frame samples (inputs context + mirrored
 * engine state) so training/debug mode can scrub backward through the fight with `[` / `]`.
 *
 * Boundary discipline: this module never recomputes hits or damage. The engine combat world stays
 * the single source of truth; the recorder stores *mirrored snapshots* the route already publishes,
 * and "replay" means reading that recorded timeline back deterministically. That is what makes the
 * HP timeline reproducible byte-for-byte in a unit test without duplicating combat logic.
 *
 * Hidden in normal play: the scrub UI only exists when `readPlayableHudMode(...).training` is true
 * (the `?debug` / test-driver evidence routes), preserving the debug-toggle law.
 */

export interface ExchangeReplaySample {
  /** Simulation frame counter at capture time (monotonic). */
  readonly frame: number;
  /** Round clock seconds at capture time. */
  readonly time: number;
  readonly playerX: number;
  readonly rivalX: number;
  readonly playerHp: number;
  readonly rivalHp: number;
  /** Last attack move id in flight at capture time, or null. Context only — never re-applied. */
  readonly activeAttack: string | null;
}

export interface ExchangeReplayRecorderOptions {
  /** How much history to keep. Defaults to the PRD's 6 seconds. */
  readonly windowSeconds?: number;
  /** Capture cadence in frames per second. Defaults to the route's 60. */
  readonly fps?: number;
}

export interface ExchangeReplayRecorder {
  readonly windowSeconds: number;
  readonly fps: number;
  /** Capacity implied by the window (windowSeconds * fps). */
  readonly capacity: number;
  push(sample: ExchangeReplaySample): void;
  /** Number of retained samples. */
  size(): number;
  /** Oldest-to-newest retained samples. Values round-trip identically to what was pushed. */
  timeline(): readonly ExchangeReplaySample[];
  /**
   * The sample recorded closest at `offsetSeconds` back from the newest entry. Offsets are clamped
   * into `[-bufferedSeconds, 0]`; returns null when nothing is recorded yet.
   */
  sampleAtOffsetSeconds(offsetSeconds: number): ExchangeReplaySample | null;
  /** Seconds of history currently retained (≤ windowSeconds). */
  bufferedSeconds(): number;
  clear(): void;
}

const DEFAULT_WINDOW_SECONDS = 6;
const DEFAULT_FPS = 60;

export function createExchangeReplayRecorder(options: ExchangeReplayRecorderOptions = {}): ExchangeReplayRecorder {
  const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const fps = options.fps ?? DEFAULT_FPS;
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) throw new Error("Exchange replay windowSeconds must be positive.");
  if (!Number.isFinite(fps) || fps <= 0) throw new Error("Exchange replay fps must be positive.");
  const capacity = Math.max(1, Math.round(windowSeconds * fps));
  // Ring buffer of fixed capacity: pushing past the end evicts the oldest sample.
  const buffer: ExchangeReplaySample[] = [];
  return {
    windowSeconds,
    fps,
    capacity,
    push(sample) {
      buffer.push({ ...sample });
      if (buffer.length > capacity) buffer.splice(0, buffer.length - capacity);
    },
    size() {
      return buffer.length;
    },
    timeline() {
      return buffer.map((sample) => ({ ...sample }));
    },
    sampleAtOffsetSeconds(offsetSeconds) {
      if (buffer.length === 0) return null;
      const newest = buffer[buffer.length - 1]!;
      const clamped = clampScrubOffset(offsetSeconds, (newest.time - buffer[0]!.time));
      const targetTime = newest.time + clamped;
      // Walk back to the first sample at or before the target time (deterministic scan).
      for (let index = buffer.length - 1; index >= 0; index -= 1) {
        if (buffer[index]!.time <= targetTime) return { ...buffer[index]! };
      }
      return { ...buffer[0]! };
    },
    bufferedSeconds() {
      if (buffer.length < 2) return buffer.length === 1 ? 0 : 0;
      return buffer[buffer.length - 1]!.time - buffer[0]!.time;
    },
    clear() {
      buffer.length = 0;
    }
  };
}

/** One `[` / `]` press steps the scrub by this many seconds. */
export const EXCHANGE_REPLAY_SCRUB_STEP_SECONDS = 0.25;

/** Scrub offsets live inside `[-bufferedSeconds, 0]` — never into the future, never past the recording. */
export function clampScrubOffset(offsetSeconds: number, bufferedSeconds: number): number {
  const floor = -Math.max(0, bufferedSeconds);
  if (!Number.isFinite(offsetSeconds)) return floor;
  return Math.min(0, Math.max(floor, offsetSeconds));
}

export function stepScrubOffset(currentSeconds: number, direction: 1 | -1, bufferedSeconds: number): number {
  return clampScrubOffset(currentSeconds + direction * EXCHANGE_REPLAY_SCRUB_STEP_SECONDS, bufferedSeconds);
}
