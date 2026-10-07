/**
 * PRD-01 §6.9 `ResolutionGovernor` — the single render-scale state machine
 * (lane 11's `quality/QualityGovernor.ts` wraps it for feature steps and tier
 * changes via C-27 `forceRenderScale`). It samples C-28 FrameStats values
 * (`gpuMs` when non-null, else `intervalMs`) and adjusts `renderScale` inside
 * `[floor, maxRenderScale]` in 0.1 steps with hysteresis: down after
 * `hysteresisDownFrames` (default 30) consecutive frames over
 * `targetFrameMs * 1.1`, up after `hysteresisUpFrames` (default 120)
 * consecutive frames under `targetFrameMs * 0.8`.
 *
 * On HiDPI the floor is `1/devicePixelRatio` (a scene never drops below
 * 1 CSS pixel = 1 render pixel) unless `allowSubCssResolution` is set.
 * The governor touches the scene target only — `Renderer` owns the clamp and
 * the manual ceiling (`setRenderScaleCeiling`, effective = min(ceiling, scale)).
 */

export interface ResolutionGovernorOptions {
  /** Frame-time budget; steps down at `target * 1.1`, up at `target * 0.8`. */
  readonly targetFrameMs: number;
  /** Lowest renderScale the governor may reach (tier floor). */
  readonly minRenderScale: number;
  /** Highest renderScale (normally 1). */
  readonly maxRenderScale: number;
  /** Consecutive over-budget frames before a 0.1 step down. Default 30. */
  readonly hysteresisDownFrames?: number;
  /** Consecutive under-budget frames before a 0.1 step up. Default 120. */
  readonly hysteresisUpFrames?: number;
  /** HiDPI floor: `1/devicePixelRatio` raises the effective floor unless allowed below it. */
  readonly devicePixelRatio?: number;
  /** Lift the `1/devicePixelRatio` floor back to `minRenderScale`. Default false. */
  readonly allowSubCssResolution?: boolean;
}

export const RESOLUTION_GOVERNOR_STEP = 0.1;
export const RESOLUTION_GOVERNOR_DOWN_FACTOR = 1.1;
export const RESOLUTION_GOVERNOR_UP_FACTOR = 0.8;

export class ResolutionGovernor {
  private readonly targetFrameMs: number;
  private readonly minRenderScale: number;
  private readonly maxRenderScale: number;
  private readonly downFrames: number;
  private readonly upFrames: number;
  private renderScale: number;
  private slowStreak = 0;
  private fastStreak = 0;

  constructor(options: ResolutionGovernorOptions) {
    this.targetFrameMs = options.targetFrameMs;
    this.maxRenderScale = options.maxRenderScale;
    const dprFloor = options.allowSubCssResolution !== true && options.devicePixelRatio !== undefined && options.devicePixelRatio > 1
      ? 1 / options.devicePixelRatio
      : 0;
    this.minRenderScale = Math.min(Math.max(options.minRenderScale, dprFloor), options.maxRenderScale);
    this.downFrames = options.hysteresisDownFrames ?? 30;
    this.upFrames = options.hysteresisUpFrames ?? 120;
    this.renderScale = options.maxRenderScale;
  }

  /** Current scale — the value `Renderer.renderScale` clamps with the ceiling. */
  get scale(): number {
    return this.renderScale;
  }

  /** Effective floor after the HiDPI rule. */
  get floor(): number {
    return this.minRenderScale;
  }

  /**
   * Sample one frame. `gpuMs` wins over `frameMs` when provided and non-null
   * (C-28 timer queries); CPU interval is the fallback. Returns the new scale.
   */
  sample(frameMs: number, gpuMs?: number | null): number {
    const measured = gpuMs ?? frameMs;
    if (!Number.isFinite(measured) || measured <= 0) {
      return this.renderScale;
    }
    if (measured > this.targetFrameMs * RESOLUTION_GOVERNOR_DOWN_FACTOR) {
      this.slowStreak += 1;
      this.fastStreak = 0;
      if (this.slowStreak >= this.downFrames && this.renderScale > this.minRenderScale) {
        this.renderScale = Math.max(this.minRenderScale, roundStep(this.renderScale - RESOLUTION_GOVERNOR_STEP));
        this.slowStreak = 0;
      }
    } else if (measured < this.targetFrameMs * RESOLUTION_GOVERNOR_UP_FACTOR) {
      this.fastStreak += 1;
      this.slowStreak = 0;
      if (this.fastStreak >= this.upFrames && this.renderScale < this.maxRenderScale) {
        this.renderScale = Math.min(this.maxRenderScale, roundStep(this.renderScale + RESOLUTION_GOVERNOR_STEP));
        this.fastStreak = 0;
      }
    } else {
      this.slowStreak = 0;
      this.fastStreak = 0;
    }
    return this.renderScale;
  }

  reset(): void {
    this.renderScale = this.maxRenderScale;
    this.slowStreak = 0;
    this.fastStreak = 0;
  }
}

function roundStep(value: number): number {
  return Math.round(value * 1000) / 1000;
}
