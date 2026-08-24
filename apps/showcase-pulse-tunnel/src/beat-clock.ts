/**
 * Pulse Tunnel beat clock — audio-clock obstacle scheduling with a measured drift
 * monitor and an authored pattern fallback.
 *
 * This is PT-01's answer to the portfolio's highest-risk gap (Web-Audio <-> frame-loop
 * sync). The rules are deliberately conservative and published:
 *
 * - In `"beat"` mode the scheduler reads elapsed time from the AudioContext clock
 *   (`ctx.currentTime - anchor`), never from frame deltas.
 * - Once per second the monitor compares audio-clock elapsed against frame-clock
 *   elapsed (`performance.now()/1000`). If |drift| exceeds DRIFT_TOLERANCE_MS for
 *   DRIFT_CHECKS_TO_FLIP consecutive checks, the route flips to `"pattern"` mode and
 *   stays there for the rest of the run (no flapping).
 * - Pattern mode continues scheduling from a frame-time accumulator seeded with the
 *   audio elapsed at flip time, so gates do not jump when tolerance fails.
 *
 * The math here is pure against injected clocks; tests/unit/apps/pulse-tunnel-clock.test.ts
 * drives it with fake clocks. Nothing in this module touches the DOM.
 */

/** Authored arrangement constants — must match scripts/build-music.mjs exactly. */
export const PULSE_BPM = 120;
export const PULSE_BEAT_SECONDS = 60 / PULSE_BPM;
export const PULSE_BEATS_PER_BAR = 4;
export const PULSE_RUN_SECONDS = 90;
export const PULSE_TOTAL_BEATS = Math.round(PULSE_RUN_SECONDS / PULSE_BEAT_SECONDS);

/** Published sync contract (PRD section 2): ±80 ms target tolerance. */
export const PULSE_DRIFT_TOLERANCE_MS = 80;
export const PULSE_DRIFT_CHECKS_TO_FLIP = 3;
export const PULSE_DRIFT_CHECK_INTERVAL_SECONDS = 1;

export type PulseSyncMode = "beat" | "pattern";

export type PulseSectionId = "intro" | "build" | "drop" | "finale";

export interface PulseSectionSpec {
  readonly id: PulseSectionId;
  readonly startBeat: number;
  readonly endBeat: number;
}

/** Section map shared by the music stems, hue washes, stem unmutes, and HUD. */
export const PULSE_SECTIONS: readonly PulseSectionSpec[] = [
  { id: "intro", startBeat: 0, endBeat: 32 },
  { id: "build", startBeat: 32, endBeat: 80 },
  { id: "drop", startBeat: 80, endBeat: 128 },
  { id: "finale", startBeat: 128, endBeat: PULSE_TOTAL_BEATS }
];

export function pulseSectionAtBeat(beat: number): PulseSectionSpec {
  for (const section of PULSE_SECTIONS) {
    if (beat >= section.startBeat && beat < section.endBeat) return section;
  }
  return PULSE_SECTIONS[PULSE_SECTIONS.length - 1];
}

export function pulseSectionAtTime(seconds: number): PulseSectionSpec {
  return pulseSectionAtBeat(Math.floor(seconds / PULSE_BEAT_SECONDS));
}

/** Scheduling seconds for an authored chart beat. */
export function pulseTimeForBeat(beat: number): number {
  return beat * PULSE_BEAT_SECONDS;
}

/** Integer beat index containing `seconds`. */
export function pulseBeatForTime(seconds: number): number {
  return Math.floor(seconds / PULSE_BEAT_SECONDS);
}

export interface BeatClockSample {
  readonly mode: PulseSyncMode;
  /** Scheduler time in seconds (audio clock in beat mode, accumulator in pattern mode). */
  readonly time: number;
  /** Latest audio-vs-frame drift reading in milliseconds. */
  readonly driftMs: number;
  readonly driftChecksFailed: number;
  readonly flippedAtTime: number | null;
}

export interface BeatClockOptions {
  /** Audio-context clock in seconds (e.g. `() => ctx.currentTime`). */
  readonly getAudioTime: () => number;
  /** Frame wall clock in seconds (e.g. `() => performance.now() / 1000`). */
  readonly getFrameTime: () => number;
  /** Called once per newly reached integer beat while running. */
  readonly onBeat?: (beat: number) => void;
  /** Called after every drift-monitor check with the reading that was taken. */
  readonly onDriftCheck?: (schedulerTime: number, driftMs: number, mode: PulseSyncMode) => void;
  /** Optional test hook adding a synthetic millisecond offset to drift readings. */
  readonly injectDriftMs?: () => number;
}

export interface BeatClock {
  /**
   * Anchor both clocks to a run start; `audioStart` is the scheduled stem-start ctx
   * time. Pass `null` when no usable AudioContext exists: the clock starts in
   * permanent pattern mode (PT-01 NO-GO path) instead of pretending beat mode.
   */
  start(audioStart: number | null): void;
  /** Advance monitoring + beat emission. Call once per rendered frame while running. */
  update(): void;
  /** Current scheduler time in seconds. */
  time(): number;
  /** Elapsed run seconds according to the active mode's own clock. */
  elapsed(): number;
  /**
   * Test-only: jump the scheduler forward by seconds regardless of mode. Used by
   * browser specs to reach later sections without playing the full run.
   */
  advanceScheduler(seconds: number): void;
  sample(): BeatClockSample;
  readonly mode: PulseSyncMode;
  /** True once the drift monitor has permanently flipped this run to pattern mode. */
  readonly flipped: boolean;
  reset(): void;
}

export function createBeatClock(options: BeatClockOptions): BeatClock {
  let mode: PulseSyncMode = "beat";
  let audioAnchor = 0;
  let frameAnchor = 0;
  let patternElapsed = 0;
  let lastUpdateTime: number | null = null;
  let lastEmittedBeat = -1;
  let nextCheckFrameElapsed = PULSE_DRIFT_CHECK_INTERVAL_SECONDS;
  let driftChecksFailed = 0;
  let driftMs = 0;
  let flippedAtTime: number | null = null;
  let started = false;

  const clock: BeatClock = {
    get mode() {
      return mode;
    },
    get flipped() {
      return flippedAtTime !== null;
    },
    start(audioStart) {
      if (audioStart === null) {
        // PT-01 NO-GO: no usable audio clock. Run honestly in authored pattern mode.
        mode = "pattern";
        flippedAtTime = 0;
        audioAnchor = 0;
        frameAnchor = options.getFrameTime();
        patternElapsed = 0;
        lastUpdateTime = frameAnchor;
        lastEmittedBeat = -1;
        nextCheckFrameElapsed = Number.POSITIVE_INFINITY;
        driftChecksFailed = 0;
        driftMs = 0;
        started = true;
        return;
      }
      mode = "beat";
      audioAnchor = audioStart;
      frameAnchor = options.getFrameTime();
      patternElapsed = 0;
      lastUpdateTime = frameAnchor;
      lastEmittedBeat = -1;
      nextCheckFrameElapsed = PULSE_DRIFT_CHECK_INTERVAL_SECONDS;
      driftChecksFailed = 0;
      driftMs = 0;
      flippedAtTime = null;
      started = true;
    },
    update() {
      if (!started) return;
      const now = options.getFrameTime();
      const frameDelta = Math.max(0, now - (lastUpdateTime ?? now));
      lastUpdateTime = now;
      patternElapsed += frameDelta;

      const schedulerTime = clock.time();
      // Emit every integer beat crossed since the previous frame.
      const currentBeat = pulseBeatForTime(schedulerTime);
      if (lastEmittedBeat < 0) {
        lastEmittedBeat = currentBeat - 1 >= 0 ? currentBeat : -1;
        if (currentBeat >= 0 && options.onBeat && lastEmittedBeat !== currentBeat) {
          // First update inside beat 0 still counts as reaching beat 0.
          options.onBeat(currentBeat);
          lastEmittedBeat = currentBeat;
        }
      } else if (options.onBeat && currentBeat > lastEmittedBeat) {
        for (let beat = lastEmittedBeat + 1; beat <= currentBeat; beat += 1) options.onBeat(beat);
        lastEmittedBeat = currentBeat;
      } else if (currentBeat > lastEmittedBeat) {
        lastEmittedBeat = currentBeat;
      }

      // Drift monitor: one comparison per check interval of frame time.
      const frameElapsed = now - frameAnchor;
      if (frameElapsed >= nextCheckFrameElapsed) {
        nextCheckFrameElapsed += PULSE_DRIFT_CHECK_INTERVAL_SECONDS;
        if (mode === "beat") {
          const audioElapsed = options.getAudioTime() - audioAnchor;
          const injection = options.injectDriftMs?.() ?? 0;
          driftMs = (frameElapsed - audioElapsed) * 1000 + injection;
          if (Math.abs(driftMs) > PULSE_DRIFT_TOLERANCE_MS) {
            driftChecksFailed += 1;
            if (driftChecksFailed >= PULSE_DRIFT_CHECKS_TO_FLIP) {
              // Seed the pattern accumulator with the audio-clock scheduler time at
              // the flip moment so obstacle scheduling never jumps.
              patternElapsed = schedulerTime;
              mode = "pattern";
              flippedAtTime = schedulerTime;
            }
          } else {
            driftChecksFailed = 0;
          }
        } else {
          // Pattern mode keeps the last reading visible in the debug badge.
          driftMs = options.injectDriftMs?.() ?? driftMs;
        }
        options.onDriftCheck?.(Number(schedulerTime.toFixed(3)), Number(driftMs.toFixed(2)), mode);
      }
    },
    time() {
      if (!started) return 0;
      return mode === "beat"
        ? Math.max(0, options.getAudioTime() - audioAnchor)
        : patternElapsed;
    },
    elapsed() {
      return clock.time();
    },
    advanceScheduler(seconds) {
      if (!started || seconds <= 0) return;
      if (mode === "beat") {
        audioAnchor -= seconds;
        patternElapsed += seconds;
      } else {
        patternElapsed += seconds;
      }
    },
    sample() {
      return {
        mode,
        time: clock.time(),
        driftMs,
        driftChecksFailed,
        flippedAtTime
      };
    },
    reset() {
      mode = "beat";
      started = false;
      patternElapsed = 0;
      lastUpdateTime = null;
      lastEmittedBeat = -1;
      nextCheckFrameElapsed = PULSE_DRIFT_CHECK_INTERVAL_SECONDS;
      driftChecksFailed = 0;
      driftMs = 0;
      flippedAtTime = null;
    }
  };
  return clock;
}
