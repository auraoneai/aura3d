/**
 * C-04 — BlendMode, RenderCommandState, DepthCompare (CONTRACTS.md). Provider: PRD 01.
 * RenderCommandState (RenderDevice.ts:135) gains optional fields in PR 0a.
 */

import type { RenderCommandState } from "../RenderDevice";

export type BlendFactor = "zero" | "one" | "src-color" | "one-minus-src-color" | "src-alpha" | "one-minus-src-alpha" | "dst-color" | "one-minus-dst-color" | "dst-alpha" | "one-minus-dst-alpha";
export type BlendEquation = "add" | "subtract" | "reverse-subtract" | "min" | "max";
export interface BlendComponent { readonly equation: BlendEquation; readonly src: BlendFactor; readonly dst: BlendFactor; }
export type BlendMode = "opaque" | "alpha" | "premultiplied" | "additive" | "multiply" | { readonly kind: "custom"; readonly color: BlendComponent; readonly alpha: BlendComponent };
export type DepthCompare = "never" | "less" | "equal" | "less-equal" | "greater" | "not-equal" | "greater-equal" | "always";
export type AuraBlendMode = "opaque" | "alpha" | "premultiplied" | "additive" | "multiply";   // engine-level (AuraMaterialSpec.blend, C-15)

const NAMED_BLEND_COMPONENTS: Readonly<Record<"alpha" | "premultiplied" | "additive" | "multiply", { readonly color: BlendComponent; readonly alpha: BlendComponent }>> = {
  alpha: { color: { equation: "add", src: "src-alpha", dst: "one-minus-src-alpha" }, alpha: { equation: "add", src: "one", dst: "one-minus-src-alpha" } },
  premultiplied: { color: { equation: "add", src: "one", dst: "one-minus-src-alpha" }, alpha: { equation: "add", src: "one", dst: "one-minus-src-alpha" } },
  additive: { color: { equation: "add", src: "one", dst: "one" }, alpha: { equation: "add", src: "zero", dst: "one" } },
  multiply: { color: { equation: "add", src: "dst-color", dst: "zero" }, alpha: { equation: "add", src: "zero", dst: "one" } }
};

/**
 * PR 0a stub: maps the existing `blend: true` to `alpha` and `false` to `opaque`;
 * `blendMode` wins over `blend` when present. Named modes resolve to their
 * component pair; "opaque" short-circuits. `WebGL2Device` ignores the resolved
 * mode until PRD 01 lands.
 */
export function resolveBlendMode(state: RenderCommandState): Exclude<BlendMode, string> | "opaque" {
  const mode = state.blendMode ?? (state.blend ? "alpha" : "opaque");
  if (mode === "opaque") return "opaque";
  if (typeof mode === "string") {
    const components = NAMED_BLEND_COMPONENTS[mode];
    return { kind: "custom", color: components.color, alpha: components.alpha };
  }
  const custom = mode as { readonly kind: "custom"; readonly color: BlendComponent; readonly alpha: BlendComponent };
  return { kind: "custom", color: custom.color, alpha: custom.alpha };
}

/** Stable across WebGL2 and WebGPU: same state tuple => same key. */
export function renderStateKey(state: RenderCommandState): number {
  const mode = state.blendMode ?? (state.blend ? "alpha" : "opaque");
  const modeCode =
    mode === "opaque" ? 0 :
    mode === "alpha" ? 1 :
    mode === "premultiplied" ? 2 :
    mode === "additive" ? 3 :
    mode === "multiply" ? 4 : 5;
  const compare = state.depthCompareV2 ?? state.depthCompare;
  const compareCode = [
    "never", "less", "equal", "less-equal", "greater", "not-equal", "greater-equal", "always"
  ].indexOf(compare);
  const cullCode = state.cullMode === "back" ? 1 : state.cullMode === "front" ? 2 : 0;
  let key = 0;
  key |= modeCode & 0x7;
  key |= (compareCode & 0xf) << 3;
  key |= (state.depthTest ? 1 : 0) << 7;
  key |= (state.depthWrite ? 1 : 0) << 8;
  key |= cullCode << 9;
  key |= (state.alphaToCoverage ? 1 : 0) << 11;
  key |= (state.blend ? 1 : 0) << 12;
  return key >>> 0;
}
