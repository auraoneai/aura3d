/**
 * threejs-parity L7/SR-06: `Clock` — three's `THREE.Clock` over the FrameLoop
 * time base. `getDelta()` returns seconds since the last `getDelta`/
 * `getElapsedTime` call (0 while stopped); `getElapsedTime()` returns total
 * seconds since `start()`. `autoStart` (default true) starts the clock on the
 * first read, matching three.js. `stop()` folds the pending interval into
 * `elapsedTime` and clears `autoStart`, as three does, so a stopped clock stays
 * stopped and keeps its time (anim-phys-05).
 *
 * Backed by `createFrameLoop({ useRaf: false, fixedDt: 0 })`: the loop is a
 * pure accumulator here — `step(dt)` adds scaled real seconds to `time`, which
 * `getElapsedTime` reports via `snapshot().time`. Injecting `now` keeps the
 * clock deterministic in tests (the unit spec drives it manually).
 */

import { createFrameLoop, type FrameLoop } from "./FrameLoop.js";

export interface AuraClockOptions {
  /** Wall-clock source in milliseconds; defaults to performance.now()/Date.now(). */
  readonly now?: () => number;
  /** three's `autoStart` — start on the first getDelta/getElapsedTime (default true). */
  readonly autoStart?: boolean;
}

export class Clock {
  private readonly loop: FrameLoop;
  private readonly now: () => number;
  /** three's `clock.autoStart`; `stop()` sets it to false. */
  autoStart: boolean;
  private lastNow: number | undefined;
  private runningFlag = false;
  /** Loop time at the last start(); three resets elapsedTime to 0 on every start(). */
  private baseTime = 0;

  /** `new Clock(false)` is three's `autoStart` argument; the options object is the Aura form. */
  constructor(options: AuraClockOptions | boolean = {}) {
    if (typeof options === "boolean") options = { autoStart: options };
    this.now = options.now ?? (() => (typeof performance === "undefined" ? Date.now() : performance.now()));
    this.autoStart = options.autoStart !== false;
    this.loop = createFrameLoop({ useRaf: false, autoStart: false, fixedDt: 0, now: this.now });
  }

  /** three's `clock.running`. */
  get running(): boolean {
    return this.runningFlag;
  }

  /** three's `clock.elapsedTime` (seconds accumulated since start). */
  get elapsedTime(): number {
    return this.loop.snapshot().time - this.baseTime;
  }

  start(): void {
    this.baseTime = this.loop.snapshot().time;
    this.runningFlag = true;
    this.loop.start();
    // `lastNow` marks the resume instant so the stopped interval never leaks
    // into the next delta.
    this.lastNow = this.now();
  }

  stop(): void {
    // three: `this.getElapsedTime(); this.running = false; this.autoStart = false;`
    if (this.runningFlag) this.getDelta();
    this.autoStart = false;
    this.runningFlag = false;
    this.loop.stop();
    this.lastNow = undefined;
  }

  /** Seconds since the previous `getDelta`/`getElapsedTime` (0 while stopped). */
  getDelta(): number {
    if (!this.runningFlag) {
      if (this.autoStart) this.start();
      return 0;
    }
    const now = this.now();
    const dt = Math.max(0, (now - (this.lastNow ?? now)) / 1000);
    this.lastNow = now;
    // fixedDt 0 → the whole real delta accumulates in one step.
    this.loop.step(dt);
    return dt;
  }

  /** Total seconds since `start()`; pulling a pending delta first keeps the two reads consistent. */
  getElapsedTime(): number {
    this.getDelta();
    return this.elapsedTime;
  }
}
