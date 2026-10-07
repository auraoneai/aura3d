// PR 0b-1 seam (CONTRACTS.md §3.2) — C-23 runtime alpha computation, verbatim from createAuraApp.
// L-6 (PRD-08): under `A3D_QR_CAMERA_LOOP` the alpha comes from the
// FixedStepDriver/FrameLoop accumulator instead of the `(dt % fixedDt)/fixedDt`
// modulo; flag off keeps the modulo so legacy callers see identical frames.

import type { QrFlags } from "@aura3d/rendering/contracts";

/** Alpha source the caller (createAuraApp / lane-15) hands in once it owns a FrameLoop. */
export interface RuntimeAlphaSource {
  readonly flags?: Pick<QrFlags, "on">;
  /** Live alpha read — e.g. `() => frameLoop.snapshot().alpha`. */
  readonly loopAlpha?: () => number;
  /** Accumulated real dt the loop has yet to consume (fallback when no loop is bound). */
  readonly accumulatedSeconds?: number;
}

export function computeRuntimeAlpha(dt: number, runtimeFixedDt: number, source?: RuntimeAlphaSource): number {
  if (runtimeFixedDt <= 0) return 0;
  if (source?.flags?.on("A3D_QR_CAMERA_LOOP") === true) {
    const loopAlpha = source.loopAlpha?.();
    if (loopAlpha !== undefined && Number.isFinite(loopAlpha)) {
      return Math.max(0, Math.min(1, loopAlpha));
    }
    const accumulated = source.accumulatedSeconds ?? dt;
    return Math.max(0, Math.min(1, accumulated / runtimeFixedDt));
  }
  return Math.max(0, Math.min(1, (dt % runtimeFixedDt) / runtimeFixedDt));
}

/**
 * L-5 lane side of Q-15-3: the alpha the runtime would put in a frame payload
 * right now. Reads the bound FrameLoop snapshot when the app exposes one
 * (`app.frameLoop`/`app.loop` internal, or the FixedStepDriver's loop), else the
 * app's last `runtimeAlpha` field, else 0. One-line import for lane-15.
 */
export function currentFrameAlpha(app: unknown): number {
  const a = app as {
    frameLoop?: { snapshot(): { alpha: number } };
    loop?: { snapshot?(): { alpha: number } };
    driver?: { loop?: { snapshot(): { alpha: number } } };
    runtimeAlpha?: number;
  };
  const from = a?.frameLoop?.snapshot?.().alpha
    ?? a?.loop?.snapshot?.().alpha
    ?? a?.driver?.loop?.snapshot?.().alpha
    ?? a?.runtimeAlpha;
  return Number.isFinite(from) ? Math.max(0, Math.min(1, from as number)) : 0;
}
