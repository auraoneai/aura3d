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
  /**
   * The app's C-23 controller (`app.time`). When given, the driver advances
   * and reads THIS controller, so `app.time.hitStop()` / `app.feel` hit-stop
   * events freeze the loop the app presents. Without it the driver owns a
   * private controller that nothing else can reach (a global hit-stop issued
   * on `app.time` would never stall the sim, and its scoped stops would never
   * expire).
   */
  readonly time?: TimeController;
  /**
   * The app's C-22 controller (`app.camera`) when it exposes the present
   * seam. §6.1: the camera updates ONCE per presented tick, after
   * interpolation resolve, on real dt (layers keep running through hit-stop),
   * reading interpolated subject positions.
   */
  readonly camera?: {
    present(realDt: number, timeMs: number, subjectPosition?: (id: string) => readonly number[] | undefined): unknown;
  };
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
  private readonly camera?: FixedStepDriverOptions["camera"];
  private readonly renderPerSubstep: boolean;
  private readonly fixedDtValue: number;
  private readonly renderCallbacks = new Set<AuraRenderCallback>();
  private rendersLastTick = 0;
  private rendersThisTick = 0;
  /**
   * Per-substep mode: real seconds owed to the camera. Substeps present
   * `fixedDt` each (and may consume time carried from earlier ticks), each
   * tick adds its real dt, and only a positive balance is presented — so over
   * any run the camera advances by exactly the real time that elapsed.
   */
  private cameraDebt = 0;
  /**
   * Per-substep mode: the camera's own clock (seconds), advanced by exactly
   * the dt of every present. Strictly monotonic across substep and
   * debt-only presents, so time-keyed rigs (legacy follow treats an equal
   * timestamp as a duplicate frame) never see a repeated time after a
   * 0-substep tick (Codex review on #948).
   */
  private cameraClock = 0;

  constructor(app: FixedStepDriverApp, options: FixedStepDriverOptions = {}) {
    this.app = app;
    this.camera = options.camera;
    this.renderPerSubstep = options.renderPerSubstep === true;
    this.time = options.time ?? new TimeController({ resolveHandle: options.resolveHandle });
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
      // Legacy escape hatch: each substep is a submitted frame, so the camera
      // must be presented for that substep before it renders; otherwise every
      // submission shows the previous tick's pose (Codex review on #911).
      this.cameraClock += this.fixedDtValue;
      const timeMs = this.cameraClock * 1000;
      this.rendersThisTick += 1;
      const current = this.interpolation?.resolve(1);
      this.camera?.present(this.fixedDtValue, timeMs, current ? (id) => current.get(id)?.position : undefined);
      if (this.camera) this.cameraDebt -= this.fixedDtValue;
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
    const resolved = this.interpolation?.resolve(alpha);
    if (!this.renderPerSubstep) {
      this.camera?.present(realDt, this.time.realTime * 1000, resolved ? (id) => resolved.get(id)?.position : undefined);
      this.app.step(0);
    } else {
      // Per-substep mode presented `fixedDt` per rendered substep above. Real
      // time not covered by those substeps (all of it on a 0-substep tick,
      // e.g. global hit-stop) must still advance the camera — its sequences,
      // shake, ramps and layers run on real time (Codex review on #946). No
      // render here: the next submission shows the advanced pose.
      if (this.camera) {
        this.cameraDebt += realDt;
        if (this.cameraDebt > 1e-9) {
          this.cameraClock += this.cameraDebt;
          this.camera.present(this.cameraDebt, this.cameraClock * 1000, resolved ? (id) => resolved.get(id)?.position : undefined);
          this.cameraDebt = 0;
        }
      }
    }
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
