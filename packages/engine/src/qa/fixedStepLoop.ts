export interface FixedStepLoopOptions {
  /** Advance the simulation by one fixed step (`stepSeconds`). */
  readonly step: (stepSeconds: number, stepIndex: number) => void;
  /** Present the current state; called once per animation frame (after its steps) and once at the end of `advance`. */
  readonly render?: (frameSeconds: number) => void;
  /** Fixed step length in seconds. Default 1/60. */
  readonly stepSeconds?: number;
  /** Most steps one frame may run before the remaining time is dropped. Default 6. */
  readonly maxCatchUpSteps?: number;
  /** A frame longer than this is clamped (tab switches, debugger pauses). Default 0.1. */
  readonly maxFrameSeconds?: number;
  /** Shortest frame time used for the accumulator. Default 0.001. */
  readonly minFrameSeconds?: number;
  /** Manual mode: the loop never advances on its own; only `advance(n)` moves it (QA runs). */
  readonly manual?: boolean;
  /** Returning false pauses the loop (for example before the app is ready) without losing the clock. */
  readonly isActive?: () => boolean;
  /** Injectable clock and scheduler for tests. Default `performance.now` and `requestAnimationFrame`. */
  readonly now?: () => number;
  readonly schedule?: (callback: (nowMs: number) => void) => unknown;
  readonly cancel?: (handle: unknown) => void;
}

export interface FixedStepLoop {
  /** Begin scheduling frames. Idempotent. */
  start(): void;
  stop(): void;
  readonly running: boolean;
  manual: boolean;
  /** Total simulation steps executed through this loop (live and manual). */
  readonly steps: number;
  /** Seconds of unsimulated time carried to the next frame. */
  readonly accumulator: number;
  /** Run one animation frame at `nowMs` (what the scheduler calls); returns the steps it executed. */
  tick(nowMs: number): number;
  /** Run exactly `count` steps now, ignoring the clock, then render once. Returns the step count. */
  advance(count: number, beforeStep?: (indexInBatch: number) => void): number;
}

/**
 * The accumulator loop every port hand-rolled: variable frame time in, fixed simulation steps out, with the
 * same clamping and catch-up guard, a manual mode for deterministic QA, and one render per frame.
 */
export function createFixedStepLoop(options: FixedStepLoopOptions): FixedStepLoop {
  const stepSeconds = options.stepSeconds ?? 1 / 60;
  const maxCatchUp = options.maxCatchUpSteps ?? 6;
  const maxFrame = options.maxFrameSeconds ?? 0.1;
  const minFrame = options.minFrameSeconds ?? 0.001;
  if (!(stepSeconds > 0)) throw new RangeError("stepSeconds must be > 0");
  const now = options.now ?? (() => (typeof performance === "undefined" ? Date.now() : performance.now()));
  const schedule = options.schedule ?? ((cb: (nowMs: number) => void) => requestAnimationFrame(cb));
  const cancel = options.cancel ?? ((handle: unknown) => cancelAnimationFrame(handle as number));

  let running = false;
  let handle: unknown;
  let last = 0;
  let accumulator = 0;
  let steps = 0;

  const runStep = (): void => {
    options.step(stepSeconds, steps);
    steps++;
  };

  const loop: FixedStepLoop = {
    manual: options.manual ?? false,
    get running() {
      return running;
    },
    get steps() {
      return steps;
    },
    get accumulator() {
      return accumulator;
    },
    tick(nowMs) {
      const frameSeconds = Math.min(maxFrame, Math.max(minFrame, (nowMs - last) / 1000));
      last = nowMs;
      if (loop.manual || (options.isActive && !options.isActive())) return 0;
      accumulator += frameSeconds;
      let executed = 0;
      while (accumulator >= stepSeconds && executed < maxCatchUp) {
        accumulator -= stepSeconds;
        runStep();
        executed++;
      }
      if (executed === maxCatchUp && accumulator >= stepSeconds) accumulator = 0;
      options.render?.(frameSeconds);
      return executed;
    },
    advance(count, beforeStep) {
      const n = Math.max(0, Math.trunc(count));
      for (let i = 0; i < n; i++) {
        beforeStep?.(i);
        runStep();
      }
      options.render?.(stepSeconds);
      return n;
    },
    start() {
      if (running) return;
      running = true;
      last = now();
      const frame = (nowMs: number): void => {
        if (!running) return;
        handle = schedule(frame);
        loop.tick(nowMs);
      };
      handle = schedule(frame);
    },
    stop() {
      running = false;
      if (handle !== undefined) cancel(handle);
      handle = undefined;
    }
  };
  return loop;
}
