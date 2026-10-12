// PRD-07 P1-T6 — day-0 blend fallback table (PRD-07 §6.2.7).
// While C-04 BlendMode is stubbed, RenderCommandState.blendMode is ignored and
// `blend: true` lowers to classic SRC_ALPHA / ONE_MINUS_SRC_ALPHA alpha-over.
// Every non-alpha blend is emulated there and reported once per batch key.

import type { BlendMode } from "../contracts/blend";
import type { RenderCommandState } from "../RenderDevice";

export interface VfxBlendResolution {
  readonly renderState: RenderCommandState;
  /** Shader writes premultiplied rgb; HW expects straight rgb under alpha-over. */
  readonly unpremultiplyOutput: boolean;
  /** §6.2.7 additive approximation under alpha-over (×1.6 core). */
  readonly additiveFallback: boolean;
  /** Batch draws nothing this frame (multiply under the C-04 stub). */
  readonly skipped: boolean;
  /** Degradation code reported through diagnostics, once per key. */
  readonly degraded: "VFX_BLEND_FALLBACK" | "VFX_BLEND_SKIPPED" | null;
}

const reported = new Set<string>();

/** Test hook: clear the once-per-key report memory. */
export function resetBlendFallbackReports(): void {
  reported.clear();
}

/** Returns the report once per (key, code) pair. */
export function consumeBlendFallbackReport(key: string, code: string): string | null {
  const id = `${key}:${code}`;
  if (reported.has(id)) return null;
  reported.add(id);
  return id;
}

const PREMULTIPLIED_STATE: RenderCommandState = {
  depthTest: true,
  depthWrite: false,
  cullMode: "none",
  blend: true,
  depthCompare: "less-equal"
};

// C-04 is real on WebGL2 (MultiDraw honours `blendMode`). The particle
// program writes premultiplied rgb, so honoured modes must name their factors:
// with no `blendMode` the draw fell back to straight SRC_ALPHA alpha-over and
// the additive branch (alpha 0) drew nothing.
const HONOURED_PREMULTIPLIED: RenderCommandState = { ...PREMULTIPLIED_STATE, blendMode: "premultiplied" };
const HONOURED_ADDITIVE: RenderCommandState = {
  ...PREMULTIPLIED_STATE,
  blendMode: { kind: "custom", color: { equation: "add", src: "one", dst: "one" }, alpha: { equation: "add", src: "one", dst: "one" } }
};
const HONOURED_MULTIPLY: RenderCommandState = { ...PREMULTIPLIED_STATE, blendMode: "multiply" };

export function resolveVfxBlend(blend: BlendMode, deviceHonoursBlendMode: boolean): VfxBlendResolution {
  if (typeof blend === "object") {
    // Custom blends have no alpha-over emulation; skip with an honest report.
    return { renderState: PREMULTIPLIED_STATE, unpremultiplyOutput: false, additiveFallback: false, skipped: true, degraded: "VFX_BLEND_SKIPPED" };
  }
  switch (blend) {
    case "opaque":
      return {
        renderState: { ...PREMULTIPLIED_STATE, blend: false, depthWrite: true },
        unpremultiplyOutput: false,
        additiveFallback: false,
        skipped: false,
        degraded: null
      };
    case "alpha":
      return deviceHonoursBlendMode
        ? { renderState: HONOURED_PREMULTIPLIED, unpremultiplyOutput: false, additiveFallback: false, skipped: false, degraded: null }
        : { renderState: PREMULTIPLIED_STATE, unpremultiplyOutput: true, additiveFallback: false, skipped: false, degraded: null };
    case "premultiplied":
      return {
        renderState: deviceHonoursBlendMode ? HONOURED_PREMULTIPLIED : PREMULTIPLIED_STATE,
        unpremultiplyOutput: !deviceHonoursBlendMode,
        additiveFallback: false,
        skipped: false,
        degraded: deviceHonoursBlendMode ? null : "VFX_BLEND_FALLBACK"
      };
    case "additive":
      return deviceHonoursBlendMode
        ? { renderState: HONOURED_ADDITIVE, unpremultiplyOutput: false, additiveFallback: false, skipped: false, degraded: null }
        : { renderState: PREMULTIPLIED_STATE, unpremultiplyOutput: true, additiveFallback: true, skipped: false, degraded: "VFX_BLEND_FALLBACK" };
    case "multiply":
      return deviceHonoursBlendMode
        ? { renderState: HONOURED_MULTIPLY, unpremultiplyOutput: false, additiveFallback: false, skipped: false, degraded: null }
        : { renderState: PREMULTIPLIED_STATE, unpremultiplyOutput: false, additiveFallback: false, skipped: true, degraded: "VFX_BLEND_SKIPPED" };
    default:
      return { renderState: PREMULTIPLIED_STATE, unpremultiplyOutput: true, additiveFallback: false, skipped: false, degraded: "VFX_BLEND_FALLBACK" };
  }
}
