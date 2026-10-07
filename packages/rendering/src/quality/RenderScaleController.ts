/**
 * PRD 11 Phase 4 — `RenderScaleController`, the default `RenderScaleSource`
 * (§6.5). One scale in 0.1 steps: down after 30 consecutive frames over
 * `targetFrameMs · 1.1`, up after 120 consecutive frames under
 * `targetFrameMs · 0.8`. GPU ms wins when present.
 */

export interface RenderScaleSource {
  /** Feed one frame; returns the (possibly unchanged) scale. */
  sample(frameMs: number, gpuMs?: number | null): number;
  readonly scale: number;
  readonly minScale: number;
  readonly maxScale: number;
  /** Frames currently counted toward the next down-step. */
  readonly overFrames: number;
  /** Frames currently counted toward the next up-step. */
  readonly underFrames: number;
}

export interface RenderScaleControllerOptions {
  readonly targetFrameMs: number;
  readonly minScale: number;
  readonly maxScale?: number;
  readonly initialScale?: number;
  /** Consecutive over-budget frames before a down-step. Default 30. */
  readonly downAfter?: number;
  /** Consecutive under-budget frames before an up-step. Default 120. */
  readonly upAfter?: number;
  readonly step?: number;
}

export function createRenderScaleController(options: RenderScaleControllerOptions): RenderScaleSource {
  const target = options.targetFrameMs;
  const minScale = options.minScale;
  const maxScale = options.maxScale ?? 1;
  const step = options.step ?? 0.1;
  const downAfter = options.downAfter ?? 30;
  const upAfter = options.upAfter ?? 120;
  let scale = Math.min(maxScale, Math.max(minScale, options.initialScale ?? 1));
  let over = 0;
  let under = 0;
  return {
    get scale() { return scale; },
    get minScale() { return minScale; },
    get maxScale() { return maxScale; },
    get overFrames() { return over; },
    get underFrames() { return under; },
    sample(frameMs: number, gpuMs?: number | null): number {
      const ms = gpuMs ?? frameMs;
      if (ms > target * 1.1) {
        over += 1;
        under = 0;
      } else if (ms < target * 0.8) {
        under += 1;
        over = 0;
      } else {
        over = 0;
        under = 0;
      }
      if (over >= downAfter && scale > minScale + 1e-9) {
        scale = Math.max(minScale, Number((scale - step).toFixed(4)));
        over = 0;
      } else if (under >= upAfter && scale < maxScale - 1e-9) {
        scale = Math.min(maxScale, Number((scale + step).toFixed(4)));
        under = 0;
      }
      return scale;
    }
  };
}

/**
 * §6.5 effective floor: `max(tier.minRenderScale, allowSubCssResolution ? 0
 * : 1 / devicePixelRatio_effective)`.
 */
export function effectiveRenderScaleFloor(
  tierMinRenderScale: number,
  devicePixelRatio: number,
  allowSubCssResolution: boolean
): number {
  const cssFloor = allowSubCssResolution || devicePixelRatio <= 0 ? 0 : 1 / devicePixelRatio;
  return Math.max(tierMinRenderScale, cssFloor);
}
