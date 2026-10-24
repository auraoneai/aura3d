import { createFixedStepLoop } from "@aura3d/engine";

export interface MotionGateOptions {
  /** Display refresh rate to simulate. */
  displayHz: number;
  /** Seconds of play to simulate. Default 8. */
  seconds?: number;
  /** Fixed step length. Default 1/60. */
  stepSeconds?: number;
  /** Frame time jitter in seconds (deterministic, +/-). Default 0. */
  jitterSeconds?: number;
  /** Advance the real simulation by one step. */
  step: (stepSeconds: number, stepIndex: number) => void;
  /** Called at the end of every step (push the presenter snapshot here). */
  afterStep?: () => void;
  /** The scalar entity values drawn this frame (for example x and z of the player), read after the frame's steps. */
  drawn: (alpha: number) => readonly number[];
  /** Optional: the animation clip drawn this frame. Counts changes between frames. */
  clip?: () => string;
  /** Largest allowed share of frames where a moving entity is drawn unchanged. Default 0.05. */
  maxStillFraction?: number;
  /** Largest allowed coefficient of variation of the per-frame displacement. Default 0.25. */
  maxCv?: number;
  /** Largest allowed clip changes per 10 seconds. Default 4. */
  maxClipFlipsPer10s?: number;
}

export interface MotionGateReport {
  readonly frames: number;
  readonly stillFrames: number;
  readonly stillFraction: number;
  readonly cv: number;
  readonly clipFlipsPer10s: number;
  readonly passed: boolean;
  readonly failures: readonly string[];
}

/**
 * Drives the real fixed-step loop at a simulated display rate and reports whether the drawn entities advance
 * smoothly: no frames where they stand still, no uneven jumps, no clip flapping. Pure, no DOM.
 */
export function runMotionGate(options: MotionGateOptions): MotionGateReport {
  const seconds = options.seconds ?? 8;
  const stepSeconds = options.stepSeconds ?? 1 / 60;
  const frameMs = 1000 / options.displayHz;
  const jitterMs = (options.jitterSeconds ?? 0) * 1000;
  let seed = 1234567;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff - 0.5;
  };

  let clock = 0;
  const loop = createFixedStepLoop({
    stepSeconds,
    step: (dt, index) => {
      options.step(dt, index);
      options.afterStep?.();
    },
    now: () => clock,
    schedule: () => 0,
    cancel: () => undefined
  });

  const frames = Math.round(seconds * options.displayHz);
  const previous: number[] = [];
  const displacement: number[] = [];
  let still = 0;
  let flips = 0;
  let lastClip: string | undefined;
  let counted = 0;

  for (let f = 0; f < frames; f += 1) {
    clock += frameMs + (jitterMs ? rand() * 2 * jitterMs : 0);
    loop.tick(clock);
    const values = options.drawn(loop.alpha);
    if (previous.length === values.length && f > 1) {
      let moved = 0;
      for (let i = 0; i < values.length; i += 1) moved += Math.abs(values[i]! - previous[i]!);
      displacement.push(moved);
      if (moved < 1e-9) still += 1;
      counted += 1;
    }
    previous.length = 0;
    previous.push(...values);
    if (options.clip) {
      const clip = options.clip();
      if (lastClip !== undefined && clip !== lastClip) flips += 1;
      lastClip = clip;
    }
  }

  const mean = displacement.reduce((s, v) => s + v, 0) / Math.max(1, displacement.length);
  const variance = displacement.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, displacement.length);
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  const stillFraction = counted > 0 ? still / counted : 0;
  const clipFlipsPer10s = flips * (10 / seconds);
  const failures: string[] = [];
  if (stillFraction > (options.maxStillFraction ?? 0.05)) failures.push(`still frames ${(stillFraction * 100).toFixed(1)}%`);
  if (cv > (options.maxCv ?? 0.25)) failures.push(`displacement CV ${cv.toFixed(3)}`);
  if (clipFlipsPer10s > (options.maxClipFlipsPer10s ?? 4)) failures.push(`clip flips ${clipFlipsPer10s.toFixed(0)} per 10 s`);
  return { frames: counted, stillFrames: still, stillFraction, cv, clipFlipsPer10s, passed: failures.length === 0, failures };
}
