/**
 * PRD-01 §6.9 canvas resolution policy (lane 01). `resolveCanvasPixelRatio`
 * is the single DPR decision point — `explicit ?? resolution.pixelRatio ??
 * min(devicePixelRatio, tier.maxPixelRatio)`, with NO [1, 2] clamp (the Ultra
 * tier cap is 3). `resolveCanvasContextAttributes` owns the §6.9/§8 context
 * attribute set under `A3D_QR_CORE`.
 */

import type { AuraQualityTierSettings } from "../contracts/quality";

/** Engine-facing `renderer.resolution` options (C-27 consumer surface). */
export interface AuraResolutionOptions {
  /** Backing-pixel ratio: a number, or "device" for `min(devicePixelRatio, cap)`. */
  readonly pixelRatio?: number | "device";
  /** Per-app cap, defaults to `tier.maxPixelRatio`. */
  readonly maxPixelRatio?: number;
  /** Dynamic resolution governor. Default true for the "auto" tier. */
  readonly dynamic?: boolean;
  /** Governor target frame budget. Default 16.7. */
  readonly targetFrameMs?: number;
  /** Governor floor, defaults to `tier.minRenderScale`. */
  readonly minRenderScale?: number;
  /** Lift the `1/devicePixelRatio` governor floor. Default false. */
  readonly allowSubCssResolution?: boolean;
}

/**
 * `explicit ?? resolution.pixelRatio ?? min(devicePixelRatio, tier.maxPixelRatio)`.
 * `resolution.pixelRatio === "device"` resolves through the capped DPR branch;
 * `resolution.maxPixelRatio` narrows the cap further. No [1, 2] clamp — the
 * only clamp is the tier/per-app cap.
 */
export function resolveCanvasPixelRatio(options: {
  readonly devicePixelRatio: number;
  readonly tier: Pick<AuraQualityTierSettings, "maxPixelRatio">;
  readonly explicit?: number;
  readonly resolution?: AuraResolutionOptions;
}): number {
  const dpr = Number.isFinite(options.devicePixelRatio) && options.devicePixelRatio > 0 ? options.devicePixelRatio : 1;
  // `explicit` wins verbatim — callers validate finiteness (ResizeToDisplayOptions).
  if (options.explicit !== undefined) {
    return options.explicit;
  }
  const cap = validPositive(options.resolution?.maxPixelRatio) ? options.resolution!.maxPixelRatio! : options.tier.maxPixelRatio;
  const requested = options.resolution?.pixelRatio;
  if (typeof requested === "number" && validPositive(requested)) {
    return requested;
  }
  return Math.min(dpr, cap);
}

function validPositive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

/** WebGL2 context attributes passed to `canvas.getContext("webgl2", ...)`. */
export interface AuraCanvasContextAttributes {
  readonly antialias: boolean;
  readonly alpha: boolean;
  readonly preserveDrawingBuffer: boolean;
  readonly powerPreference: WebGLPowerPreference;
}

/**
 * §6.9: under `A3D_QR_CORE`, lane canvases create their context with
 * `{ antialias: false, preserveDrawingBuffer: false, alpha: false,
 * powerPreference: "high-performance" }` — MSAA lives on the offscreen scene
 * target and `capture()` reads the framebuffer in the same task, so the canvas
 * never needs `preserveDrawingBuffer`. `renderer.debug.preserveDrawingBuffer`
 * opts back into the legacy attribute for one minor release (a dev warning is
 * the caller's job — pass `warn` to emit it here). Flag-off callers get the
 * legacy attribute set ({antialias:true, alpha:false, preserveDrawingBuffer:false}).
 */
export function resolveCanvasContextAttributes(options: {
  readonly flagOn: boolean;
  readonly debugPreserveDrawingBuffer?: boolean;
  readonly warn?: (message: string) => void;
}): AuraCanvasContextAttributes {
  if (!options.flagOn) {
    return { antialias: true, alpha: false, preserveDrawingBuffer: false, powerPreference: "default" };
  }
  const preserveDrawingBuffer = options.debugPreserveDrawingBuffer === true;
  if (preserveDrawingBuffer) {
    options.warn?.(
      "renderer.debug.preserveDrawingBuffer keeps the legacy readback attribute for one minor release; migrate callers to app.capture() before the flag is removed."
    );
  }
  return {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer,
    powerPreference: "high-performance"
  };
}

/**
 * Re-evaluates `onChange` when `devicePixelRatio` changes (window moved across
 * monitors, browser zoom) via `matchMedia("(resolution: Xdppx)")`. Returns the
 * unsubscribe function; a no-op when matchMedia is unavailable.
 */
export function watchDevicePixelRatio(onChange: (devicePixelRatio: number) => void, readDevicePixelRatio: () => number = () => globalThis.devicePixelRatio ?? 1): () => void {
  if (typeof globalThis.matchMedia !== "function") return () => undefined;
  let media: MediaQueryList | null = null;
  let last = readDevicePixelRatio();
  const attach = (): void => {
    media?.removeEventListener?.("change", listener);
    media = globalThis.matchMedia(`(resolution: ${last}dppx)`);
    media.addEventListener?.("change", listener);
  };
  const listener = (): void => {
    const next = readDevicePixelRatio();
    if (next === last) return;
    last = next;
    attach();
    onChange(next);
  };
  attach();
  return () => media?.removeEventListener?.("change", listener);
}
