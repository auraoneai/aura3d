import type { QrFlags } from "@aura3d/rendering/contracts";
import {
  DEFAULT_LOOP_OVERLOAD_POLICY,
  QR_MAX_FRAME_DT,
  resolveMaxSubSteps,
  type AuraLoopOverloadPolicy
} from "./nodes/game/frameLoopDefaults.js";

export type FrameLoopSource = "raf" | "manual" | "fixed";

export interface FrameLoopFrame {
  readonly dt: number;
  readonly fixedDt: number;
  readonly time: number;
  readonly frame: number;
  readonly alpha: number;
  readonly paused: boolean;
  readonly source: FrameLoopSource;
  readonly substep: number;
  readonly substeps: number;
}

export type FrameLoopCallback = (frame: FrameLoopFrame) => void;

/**
 * L-3: once-per-tick emission, fired after the substep loop — including ticks
 * with 0 substeps (§6.1). The render driver renders on this event, not on
 * `onFrame`, so a tick always produces exactly one presented frame.
 */
export interface FrameLoopTick {
  readonly realDt: number;
  readonly substeps: number;
  readonly alpha: number;
  readonly simTime: number;
  readonly source: FrameLoopSource;
}

export type FrameLoopTickCallback = (tick: FrameLoopTick) => void;

export interface FrameLoopOptions {
  readonly fixedDt?: number;
  readonly maxSubSteps?: number;
  readonly timeScale?: number;
  /**
   * L-1: max real dt a single tick may consume; defaults to
   * `QR_MAX_FRAME_DT` (0.1) under `A3D_QR_CAMERA_LOOP` (§6.1).
   */
  readonly maxFrameDt?: number;
  /** L-2: overload policy under `A3D_QR_CAMERA_LOOP` (§6.1). */
  readonly overload?: AuraLoopOverloadPolicy;
  /** Resolved QR flags; when absent the loop behaves exactly as before. */
  readonly flags?: QrFlags;
  readonly autoStart?: boolean;
  readonly useRaf?: boolean;
  readonly now?: () => number;
  readonly requestFrame?: (callback: (time: number) => void) => number;
  readonly cancelFrame?: (handle: number) => void;
}

export interface FrameLoopSnapshot {
  readonly kind: "aura-frame-loop-snapshot";
  readonly running: boolean;
  readonly paused: boolean;
  readonly frame: number;
  readonly time: number;
  readonly fixedDt: number;
  readonly alpha: number;
  readonly maxSubSteps: number;
  readonly timeScale: number;
  readonly callbackCount: number;
  readonly lastFrame?: FrameLoopFrame;
  /** L-1: ticks whose real dt was clamped to `maxFrameDt` (QR loop only). */
  readonly clampedFrames: number;
  /** L-2: ticks whose substep demand exceeded the cap (QR loop only). */
  readonly overloadFrames: number;
  /** Effective substep cap after §6.7 guard reductions (QR loop only). */
  readonly substepCap: number;
  /** §6.7 death-spiral guard activations (QR loop only). */
  readonly substepCapReduced: number;
}

export class FrameLoop {
  private readonly callbacks = new Set<FrameLoopCallback>();
  private readonly tickCallbacks = new Set<FrameLoopTickCallback>();
  private readonly fixedDt: number;
  private readonly maxSubSteps: number;
  private readonly maxFrameDt: number;
  private readonly overload: AuraLoopOverloadPolicy;
  private readonly qrLoopEnabled: boolean;
  private _timeScale: number;
  private timeScaleSource?: () => number;
  private readonly now: () => number;
  private readonly requestFrame?: (callback: (time: number) => void) => number;
  private readonly cancelFrame?: (handle: number) => void;
  private running = false;
  private paused = false;
  private disposed = false;
  private frame = 0;
  private time = 0;
  private accumulator = 0;
  private lastNow = 0;
  private rafHandle = 0;
  private lastFrame?: FrameLoopFrame;
  private clampedFramesCount = 0;
  private overloadFramesCount = 0;
  private substepCap: number;
  private substepCapReduced = 0;
  private substepCostEma = 0;
  private overBudgetTicks = 0;

  constructor(options: FrameLoopOptions = {}) {
    this.qrLoopEnabled = options.flags?.on("A3D_QR_CAMERA_LOOP") === true;
    this.fixedDt = Math.max(0, options.fixedDt ?? 1 / 60);
    this.maxSubSteps = resolveMaxSubSteps(options.maxSubSteps, options.flags);
    this.substepCap = this.maxSubSteps;
    this.maxFrameDt = Math.max(0, options.maxFrameDt ?? QR_MAX_FRAME_DT);
    this.overload = options.overload ?? DEFAULT_LOOP_OVERLOAD_POLICY;
    this._timeScale = Math.max(0, options.timeScale ?? 1);
    this.now = options.now ?? (() => (typeof performance === "undefined" ? Date.now() : performance.now()));
    this.requestFrame =
      options.useRaf === false
        ? undefined
        : options.requestFrame ??
          (typeof globalThis.requestAnimationFrame === "undefined"
            ? undefined
            : (callback) => globalThis.requestAnimationFrame(callback));
    this.cancelFrame =
      options.useRaf === false
        ? undefined
        : options.cancelFrame ??
          (typeof globalThis.cancelAnimationFrame === "undefined"
            ? undefined
            : (handle) => globalThis.cancelAnimationFrame(handle));
    if (options.autoStart) this.start();
  }

  /** T-2: live timeScale — reads the bound source (TimeController) when set. */
  get timeScale(): number {
    return this.timeScaleSource ? Math.max(0, this.timeScaleSource()) : this._timeScale;
  }

  /** Legacy static setter; ignored while a source is bound via `bindTimeScale`. */
  setTimeScale(value: number): void {
    this._timeScale = Math.max(0, value);
  }

  /** T-2: binds `timeScale` to a live source (e.g. the C-23 TimeController). */
  bindTimeScale(source?: () => number): void {
    this.timeScaleSource = source;
  }

  onFrame(callback: FrameLoopCallback): () => void {
    if (this.disposed) return () => undefined;
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  offFrame(callback: FrameLoopCallback): void {
    this.callbacks.delete(callback);
  }

  /** L-3: subscribe to once-per-tick emissions (after the substep loop). */
  onTick(callback: FrameLoopTickCallback): () => void {
    if (this.disposed) return () => undefined;
    this.tickCallbacks.add(callback);
    return () => {
      this.tickCallbacks.delete(callback);
    };
  }

  offTick(callback: FrameLoopTickCallback): void {
    this.tickCallbacks.delete(callback);
  }

  start(): void {
    if (this.disposed || this.running) return;
    this.running = true;
    this.paused = false;
    this.lastNow = this.now();
    this.schedule();
  }

  pause(): void {
    if (this.disposed) return;
    this.paused = true;
    if (this.rafHandle && this.cancelFrame) this.cancelFrame(this.rafHandle);
    this.rafHandle = 0;
  }

  resume(): void {
    if (this.disposed) return;
    const wasPaused = this.paused;
    this.paused = false;
    this.lastNow = this.now();
    if (!this.running) this.start();
    else if (wasPaused) this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.rafHandle && this.cancelFrame) this.cancelFrame(this.rafHandle);
    this.rafHandle = 0;
  }

  step(dt = this.fixedDt, source: FrameLoopSource = "manual"): FrameLoopSnapshot {
    if (this.disposed) return this.snapshot();
    let realDt = Math.max(0, dt);
    // L-1: clamp real dt before applying timeScale (§6.1). The same clamp
    // covers the rAF path — `tick()` hands its raw dt here.
    if (this.qrLoopEnabled && realDt > this.maxFrameDt) {
      realDt = this.maxFrameDt;
      this.clampedFramesCount += 1;
    }
    const scaledDt = realDt * this.timeScale;
    if (this.fixedDt <= 0) {
      this.emit(scaledDt, source, 1, 1, 0);
      this.emitTick(realDt, 1, source);
      return this.snapshot();
    }

    this.accumulator += scaledDt;
    const availableSubsteps = Math.floor(this.accumulator / this.fixedDt);
    const cap = this.capFor();
    const substeps = Math.min(cap, availableSubsteps);

    if (substeps <= 0) {
      this.emitTick(realDt, 0, source);
      return this.snapshot();
    }

    const started = this.now();
    for (let index = 0; index < substeps; index += 1) {
      this.accumulator = Math.max(0, this.accumulator - this.fixedDt);
      const alpha = this.interpolationAlpha();
      this.emit(this.fixedDt, source, index + 1, substeps, alpha);
    }
    const elapsedSeconds = (this.now() - started) / 1000;
    if (this.qrLoopEnabled) this.updateSubstepGuard(substeps, elapsedSeconds);

    if (availableSubsteps > cap) {
      if (this.qrLoopEnabled) this.overloadFramesCount += 1;
      const leftoverCap =
        this.qrLoopEnabled && this.overload === "catch-up" ? this.maxFrameDt : this.fixedDt;
      this.accumulator = Math.min(this.accumulator, leftoverCap);
    }

    this.emitTick(realDt, substeps, source);
    return this.snapshot();
  }

  snapshot(): FrameLoopSnapshot {
    return {
      kind: "aura-frame-loop-snapshot",
      running: this.running,
      paused: this.paused,
      frame: this.frame,
      time: this.time,
      fixedDt: this.fixedDt,
      alpha: this.interpolationAlpha(),
      maxSubSteps: this.maxSubSteps,
      timeScale: this.timeScale,
      callbackCount: this.callbacks.size,
      lastFrame: this.lastFrame,
      clampedFrames: this.clampedFramesCount,
      overloadFrames: this.overloadFramesCount,
      substepCap: this.substepCap,
      substepCapReduced: this.substepCapReduced
    };
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
    this.callbacks.clear();
    this.tickCallbacks.clear();
    this.lastFrame = undefined;
  }

  private capFor(): number {
    if (!this.qrLoopEnabled) return this.maxSubSteps;
    if (this.overload === "catch-up") {
      return Math.max(this.substepCap, Math.floor(this.maxFrameDt / this.fixedDt));
    }
    return this.substepCap;
  }

  /**
   * §6.7 substep-count death-spiral guard: when the mean CPU time of one
   * substep × the current cap exceeds the frame budget for 30 consecutive
   * ticks, drop the cap by one (floor 2) and count the reduction.
   */
  private updateSubstepGuard(substeps: number, elapsedSeconds: number): void {
    if (substeps <= 0 || elapsedSeconds <= 0) {
      this.overBudgetTicks = 0;
      return;
    }
    const cost = elapsedSeconds / substeps;
    this.substepCostEma =
      this.substepCostEma === 0 ? cost : this.substepCostEma * 0.9 + cost * 0.1;
    const budgetExceeded =
      this.substepCap > 2 && this.substepCostEma * this.substepCap > this.maxFrameDt;
    if (budgetExceeded) {
      this.overBudgetTicks += 1;
      if (this.overBudgetTicks >= 30) {
        this.substepCap -= 1;
        this.substepCapReduced += 1;
        this.overBudgetTicks = 0;
      }
    } else {
      this.overBudgetTicks = 0;
    }
  }

  private schedule(): void {
    if (!this.running || this.paused || !this.requestFrame) return;
    this.rafHandle = this.requestFrame((nextTime) => this.tick(nextTime));
  }

  private tick(nextTime: number): void {
    if (!this.running || this.disposed) return;
    const dt = this.lastNow > 0 ? Math.max(0, (nextTime - this.lastNow) / 1000) : this.fixedDt;
    this.lastNow = nextTime;
    if (!this.paused) this.step(dt, "raf");
    this.schedule();
  }

  private interpolationAlpha(): number {
    if (this.fixedDt <= 0) return 0;
    return Math.max(0, Math.min(1, this.accumulator / this.fixedDt));
  }

  private emitTick(realDt: number, substeps: number, source: FrameLoopSource): void {
    if (this.tickCallbacks.size === 0) return;
    const tick: FrameLoopTick = {
      realDt,
      substeps,
      alpha: this.interpolationAlpha(),
      simTime: this.time,
      source
    };
    for (const callback of [...this.tickCallbacks]) {
      if (this.tickCallbacks.has(callback)) callback(tick);
    }
  }

  private emit(dt: number, source: FrameLoopSource, substep: number, substeps: number, alpha: number): void {
    this.frame += 1;
    this.time += dt;
    const frame: FrameLoopFrame = {
      dt,
      fixedDt: this.fixedDt,
      time: this.time,
      frame: this.frame,
      alpha,
      paused: this.paused,
      source,
      substep,
      substeps
    };
    this.lastFrame = frame;
    for (const callback of [...this.callbacks]) {
      if (this.callbacks.has(callback)) callback(frame);
    }
  }
}

export function createFrameLoop(options: FrameLoopOptions = {}): FrameLoop {
  return new FrameLoop(options);
}
