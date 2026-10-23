import { createFixedStepLoop, type FixedStepLoop } from "@aura3d/engine";
import { FIXED_DT } from "../contract";
import { clamp } from "../ui/format";

export interface MatchLoopOptions {
  /** One simulation step (`update(FIXED_DT)` in game.js). */
  step(dt: number): void;
  /** Present the current state (game.js `render`); receives the frame time in seconds. */
  render(frameSeconds: number): void;
  /** Per-frame work that must not run during manual stepping, such as polling the gamepad. */
  beforeFrame?(nowMs: number): void;
  /** Frames are dropped while the page is not ready. */
  isActive?(): boolean;
  manual?: boolean;
  now?: () => number;
  schedule?: (callback: (nowMs: number) => void) => unknown;
  cancel?: (handle: unknown) => void;
}

export interface MatchLoop {
  readonly loop: FixedStepLoop;
  manual: boolean;
  start(): void;
  /** Seconds of the current frame already accumulated, used to time-stamp input between steps (game.js `inputEventTime`). */
  timeIntoFrame(eventTimeStamp: number | undefined, simTime: number): number;
  /** `window.advanceTime(ms)`: switch to manual stepping and run whole 1/60 s steps. */
  advanceTime(ms: number): number;
}

/** The match loop: real time accumulates into 1/60 s steps, frames longer than 50 ms are clamped, one render per frame. */
export function createMatchLoop(options: MatchLoopOptions): MatchLoop {
  let lastFrameMs = typeof performance === "undefined" ? 0 : performance.now();
  const schedule = options.schedule ?? ((cb: (nowMs: number) => void) => requestAnimationFrame(cb));
  const loop = createFixedStepLoop({
    step: (dt) => options.step(dt),
    render: (frameSeconds) => options.render(frameSeconds),
    stepSeconds: FIXED_DT,
    maxFrameSeconds: 0.05,
    maxCatchUpSteps: 6,
    manual: options.manual ?? false,
    isActive: options.isActive,
    now: options.now,
    schedule: (cb) => schedule((nowMs) => { lastFrameMs = nowMs; options.beforeFrame?.(nowMs); cb(nowMs); }),
    cancel: options.cancel
  });
  return {
    loop,
    get manual() { return loop.manual; },
    set manual(value: boolean) { loop.manual = value; },
    start: () => loop.start(),
    timeIntoFrame(eventTimeStamp, simTime) {
      if (loop.manual || !Number.isFinite(eventTimeStamp)) return simTime;
      const elapsed = clamp(((eventTimeStamp as number) - lastFrameMs) / 1000, 0, FIXED_DT);
      return simTime + clamp(loop.accumulator + elapsed, 0, 0.05);
    },
    advanceTime(ms) {
      loop.manual = true;
      const steps = Math.max(1, Math.round(ms / (1000 / 60)));
      return loop.advance(steps);
    }
  };
}
