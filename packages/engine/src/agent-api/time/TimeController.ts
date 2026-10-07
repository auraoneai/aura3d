/**
 * C-23 TimeController — the real implementation (PRD-08 §6.2, T-1..T-5).
 *
 * Owns sim/real time, a clamped global timescale (T-5: [0, 4]), halflife
 * `scaleTo` ramps, global and scoped hit-stop (T-4), and slow-mo with
 * ease-out. `advance(realDt)` progresses every clock from real elapsed
 * seconds and returns the scaled dt that entered sim time.
 *
 * The FrameLoop binds its `timeScale` getter to {@link timeScale} (0 while a
 * global hit-stop is active), so hit-stop freezes sim substeps while
 * rendering continues — `emitTick` still fires once per tick (L-3).
 */

import type { AuraRuntimeNodeHandle, AuraVec3 } from "../index.js";
import type { AuraTimeController } from "../../contracts/time.js";
import { QR_TIME_SCALE_MAX } from "../app/frameLoopDefaults.js";

export interface TimeControllerScopeEntry {
  readonly handle: AuraRuntimeNodeHandle;
  previousScale: number;
  remaining: number;
}

export interface TimeControllerOptions {
  /** Resolves a node id to a runtime handle for scoped hit-stop. */
  resolveHandle?: (id: string) => AuraRuntimeNodeHandle | undefined;
}

function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(QR_TIME_SCALE_MAX, value));
}

type HandleWithTimeScale = AuraRuntimeNodeHandle & { timeScale?: number };

export class TimeController implements AuraTimeController {
  private _scale = 1;
  private ramp: { readonly to: number; readonly halflife: number } | null = null;
  private slowMoState: { remaining: number; readonly easeOut: number } | null = null;
  private globalStop = 0;
  private readonly scopedStops = new Map<AuraRuntimeNodeHandle, TimeControllerScopeEntry>();
  private readonly resolveHandle?: (id: string) => AuraRuntimeNodeHandle | undefined;

  public simTime = 0;
  public realTime = 0;

  constructor(options: TimeControllerOptions = {}) {
    this.resolveHandle = options.resolveHandle;
  }

  get scale(): number {
    return this._scale;
  }

  set scale(value: number) {
    this._scale = clampScale(value);
    if (this._scale === 1 && this.ramp?.to === 1) this.ramp = null;
  }

  /** Live multiplier for the loop: 0 while a global hit-stop is active. */
  get timeScale(): number {
    return this.globalStop > 0 ? 0 : this._scale;
  }

  get hitStopRemaining(): number {
    return this.globalStop;
  }

  /** T-3: exponential ramp toward `value` with the given halflife (seconds). */
  scaleTo(value: number, halflife: number): void {
    this.ramp = { to: clampScale(value), halflife: Math.max(1e-6, halflife) };
  }

  /**
   * T-4: global hit-stop freezes sim time (rendering continues); a scoped
   * stop sets `handle.timeScale = 0` on each listed handle/id and restores
   * the previous scale when it expires.
   */
  hitStop(seconds: number, o?: { scope?: "global" | readonly (string | AuraRuntimeNodeHandle)[] }): void {
    const duration = Math.max(0, seconds);
    if (duration <= 0) return;
    const scope = o?.scope;
    if (scope === undefined || scope === "global" || scope.length === 0) {
      this.globalStop = Math.max(this.globalStop, duration);
      return;
    }
    for (const entry of scope) {
      if (entry === "global") continue;
      const handle = typeof entry === "string" ? this.resolveHandle?.(entry) : entry;
      if (!handle) continue;
      const existing = this.scopedStops.get(handle);
      if (existing) {
        existing.remaining = Math.max(existing.remaining, duration);
        continue;
      }
      const previousScale =
        (handle as HandleWithTimeScale).timeScale ?? 1;
      (handle as HandleWithTimeScale).timeScale = 0;
      this.scopedStops.set(handle, { handle, previousScale, remaining: duration });
    }
  }

  /** T-4: slow-mo — scale until `seconds` of real time pass, then ease back to 1. */
  slowMo(scale: number, seconds: number, o?: { easeOut?: number }): void {
    this._scale = clampScale(scale);
    this.ramp = null;
    this.slowMoState = { remaining: Math.max(0, seconds), easeOut: Math.max(0, o?.easeOut ?? 0.1) };
    if (this.slowMoState.remaining <= 0) this.releaseSlowMo();
  }

  /**
   * Called by the loop seam with real dt. Returns the scaled dt that
   * entered sim time (0 while hit-stopped).
   */
  advance(realDt: number): number {
    const dt = Math.max(0, realDt);
    this.realTime += dt;
    if (this.ramp) {
      const k = Math.pow(0.5, dt / this.ramp.halflife);
      this._scale = this.ramp.to + (this._scale - this.ramp.to) * k;
      if (Math.abs(this._scale - this.ramp.to) < 1e-6 * Math.max(1, Math.abs(this.ramp.to))) {
        this._scale = this.ramp.to;
        this.ramp = null;
      }
    }
    if (this.slowMoState) {
      this.slowMoState.remaining -= dt;
      if (this.slowMoState.remaining <= 0) this.releaseSlowMo();
    }
    for (const [handle, entry] of [...this.scopedStops]) {
      entry.remaining -= dt;
      if (entry.remaining <= 0) {
        (handle as HandleWithTimeScale).timeScale = entry.previousScale;
        this.scopedStops.delete(handle);
      }
    }
    if (this.globalStop > 0) {
      this.globalStop = Math.max(0, this.globalStop - dt);
      return 0;
    }
    const scaledDt = dt * this._scale;
    this.simTime += scaledDt;
    return scaledDt;
  }

  /** Handles currently frozen by a scoped hit-stop (evidence surface). */
  get scopedHitStopCount(): number {
    return this.scopedStops.size;
  }

  private releaseSlowMo(): void {
    const easeOut = this.slowMoState?.easeOut ?? 0;
    this.slowMoState = null;
    if (easeOut > 0) this.scaleTo(1, easeOut);
    else this._scale = 1;
  }
}

export function createTimeController(options: TimeControllerOptions = {}): TimeController {
  return new TimeController(options);
}
