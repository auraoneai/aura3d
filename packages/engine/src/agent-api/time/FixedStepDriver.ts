/**
 * L-4 FixedStepDriver (PRD-08 §6.5) — the flag-on (`A3D_QR_CAMERA_LOOP`)
 * seam between the frame loop and `AuraApp`.
 *
 * Per tick: advance the C-23 TimeController by real dt, run 0..cap
 * `app.advance(fixedDt)` substeps (capturing interpolation prev/curr around
 * each), then render exactly once via `app.step(0)` — so rendered output is
 * never duplicated and always presented, even at 0 substeps (hit-stop).
 *
 * `renderPerSubstep: true` is the escape hatch reproducing today's
 * render-per-substep behavior (one `app.step(0)` per substep).
 */

import type { QrFlags } from "@aura3d/rendering/contracts";
import type { AuraRuntimeNodeHandle } from "../index.js";
import type { AuraLoopOptions } from "../../contracts/time.js";
import { createFrameLoop, type FrameLoop, type FrameLoopSnapshot } from "../FrameLoop.js";
import { TimeController } from "./TimeController.js";
import { InterpolationStore } from "./Interpolation.js";

export interface FixedStepDriverApp {
  /** Advances simulation only (no present). */
  advance(dt: number): void;
  /** Advances + presents one frame. Called with dt = 0 by the driver. */
  step(dt: number): void;
}

export interface FixedStepDriverOptions extends AuraLoopOptions {
  readonly flags?: QrFlags;
  readonly autoStart?: boolean;
  readonly useRaf?: boolean;
  readonly now?: () => number;
  readonly requestFrame?: (callback: (time: number) => void) => number;
  readonly cancelFrame?: (handle: number) => void;
  /** Handle resolver for scoped hit-stop and C-37 time extensions. */
  readonly resolveHandle?: (id: string) => AuraRuntimeNodeHandle | undefined;
  /** Injection point for tests; defaults to a fresh InterpolationStore. */
  readonly interpolationStore?: InterpolationStore;
}

export interface AuraRenderFrame {
  readonly alpha: number;
  readonly realDt: number;
  readonly simTime: number;
}

export type AuraRenderCallback = (frame: AuraRenderFrame) => void;

export class FixedStepDriver {
  readonly loop: FrameLoop;
  readonly time: TimeController;
  readonly interpolation: InterpolationStore | null;

  private readonly app: FixedStepDriverApp;
  private readonly renderPerSubstep: boolean;
  private readonly fixedDtValue: number;
  private readonly renderCallbacks = new Set<AuraRenderCallback>();
  private rendersLastTick = 0;
  private rendersThisTick = 0;

  constructor(app: FixedStepDriverApp, options: FixedStepDriverOptions = {}) {
    this.app = app;
    this.renderPerSubstep = options.renderPerSubstep === true;
    this.time = new TimeController({ resolveHandle: options.resolveHandle });
    const interpolationEnabled =
      options.interpolation === true ||
      (options.interpolation !== false &&
        options.flags?.on("A3D_QR_CAMERA_INTERPOLATION") === true);
    this.interpolation = interpolationEnabled
      ? options.interpolationStore ?? new InterpolationStore()
      : null;
    this.loop = createFrameLoop({
      fixedDt: options.fixedDt,
      maxSubSteps: options.maxSubSteps,
      maxFrameDt: options.maxFrameDt,
      overload: options.overload,
      flags: options.flags,
      autoStart: false,
      useRaf: options.useRaf,
      now: options.now,
      requestFrame: options.requestFrame,
      cancelFrame: options.cancelFrame
    });
    // T-2: the loop's scaledDt flows through the live controller scale
    // (0 during global hit-stop), so the accumulator freezes correctly.
    this.loop.bindTimeScale(() => this.time.timeScale);
    this.fixedDtValue = this.loop.snapshot().fixedDt;
    this.loop.onFrame(() => this.advanceSubstep());
    this.loop.onTick((tick) => this.presentTick(tick.realDt));
    if (options.autoStart) this.start();
  }

  /** Frames presented during the most recent tick (S2 evidence). */
  get renderSubmissionsLastTick(): number {
    return this.rendersLastTick;
  }

  onRender(callback: AuraRenderCallback): () => void {
    this.renderCallbacks.add(callback);
    return () => {
      this.renderCallbacks.delete(callback);
    };
  }

  /** Manual tick — the rAF path lands here through `FrameLoop.tick`. */
  step(dt: number): FrameLoopSnapshot {
    return this.loop.step(dt, "manual");
  }

  start(): void {
    this.loop.start();
  }

  pause(): void {
    this.loop.pause();
  }

  resume(): void {
    this.loop.resume();
  }

  stop(): void {
    this.loop.stop();
  }

  snapshot(): FrameLoopSnapshot {
    return this.loop.snapshot();
  }

  dispose(): void {
    this.loop.dispose();
    this.renderCallbacks.clear();
  }

  private advanceSubstep(): void {
    this.interpolation?.capturePrevious();
    this.app.advance(this.fixedDtValue);
    this.interpolation?.captureCurrent();
    if (this.renderPerSubstep) {
      this.rendersThisTick += 1;
      this.app.step(0);
    }
  }

  /**
   * §6.5 once-per-tick presentation: progress the time controller by real
   * dt, resolve interpolation at the loop alpha, present exactly once (or
   * not at all here under `renderPerSubstep`), then emit `onRender`.
   */
  private presentTick(realDt: number): void {
    this.time.advance(realDt);
    const alpha = this.loop.snapshot().alpha;
    this.interpolation?.resolve(alpha);
    if (!this.renderPerSubstep) this.app.step(0);
    this.rendersLastTick = this.renderPerSubstep ? this.rendersThisTick : 1;
    this.rendersThisTick = 0;
    const frame: AuraRenderFrame = { alpha, realDt, simTime: this.time.simTime };
    for (const callback of [...this.renderCallbacks]) {
      if (this.renderCallbacks.has(callback)) callback(frame);
    }
  }
}

export function createFixedStepDriver(
  app: FixedStepDriverApp,
  options: FixedStepDriverOptions = {}
): FixedStepDriver {
  return new FixedStepDriver(app, options);
}
