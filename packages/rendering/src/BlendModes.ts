/**
 * C-04 (PRD-01 §6.8) — real blend-mode helpers consumed by the WebGL2 state
 * application and the ForwardPass queue classification. The contract surface
 * (`contracts/blend.ts`) owns the types + `resolveBlendMode`/`renderStateKey`;
 * this module adds the queue policy and factor-name plumbing backends map to
 * their own enums (WebGL2 in `webgl2/MultiDraw.ts`, WebGPU per Q-11-4).
 */

import type { BlendMode } from "./contracts/blend";
import type { RenderCommandState } from "./RenderDevice";
import { resolveBlendMode } from "./contracts/blend";

/**
 * Queue classification per §6.8: additive and multiply draw AFTER the
 * back-to-front alpha group inside the transparent bucket (they are
 * order-independent; sorting them by depth would only waste ordering and can
 * interleave wrongly with alpha-blended quads).
 */
export type BlendQueue = "opaque" | "transparent-sorted" | "transparent-unordered";

export const QUEUE_BY_MODE: Readonly<Record<string, BlendQueue>> = {
  opaque: "opaque",
  alpha: "transparent-sorted",
  premultiplied: "transparent-sorted",
  additive: "transparent-unordered",
  multiply: "transparent-unordered"
};

/** Queue for a resolved blend state; custom blends join the sorted group. */
export function blendQueueForState(state: { readonly blendMode?: BlendMode; readonly blend?: boolean }): BlendQueue {
  const mode = state.blendMode ?? (state.blend ? "alpha" : "opaque");
  if (mode === "opaque") return "opaque";
  if (typeof mode === "string") return QUEUE_BY_MODE[mode] ?? "transparent-sorted";
  return "transparent-sorted";
}

/** True when the state resolves to a blending (non-opaque) mode. */
export function blendStateIsTransparent(state: { readonly blendMode?: BlendMode; readonly blend?: boolean }): boolean {
  return resolveBlendMode(state as RenderCommandState) !== "opaque";
}

/**
 * The §6.8 `depthWrite` default for a blend mode: non-opaque modes default to
 * `false` (the user may still opt into depth writes explicitly).
 */
export function blendModeDefaultDepthWrite(mode: BlendMode | undefined, fallback: boolean): boolean {
  if (mode === undefined) return fallback;
  return mode === "opaque" ? fallback : false;
}

/** GL/WGSL-agnostic name of a `BlendEquation` for backend lookup tables. */
export function blendEquationName(equation: string): string {
  return equation;
}
