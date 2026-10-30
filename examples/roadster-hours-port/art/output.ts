/**
 * GU47 RH47-01: output settings per look mode. The GU47 look renders at the device resolution (DPR up to 2) with dithering
 * on, so the hazy sky gradients and the blue-hour dome do not band; `?look=original` keeps today's DPR 1 (canvas sized at
 * up to 1.5) and dithering off for before/after captures.
 */
import type { AuraOutputOptions } from "@aura3d/engine";

export interface SaltwindOutput {
  /** Cap on `devicePixelRatio` when the page sizes the canvas backing store. */
  readonly maxDpr: number;
  /** `createAuraApp({ pixelRatio })`. */
  readonly pixelRatio: number | { readonly max: number };
  readonly output: AuraOutputOptions;
}

export function outputFor(mode: "gu47" | "original"): SaltwindOutput {
  if (mode === "original") return { maxDpr: 1.5, pixelRatio: 1, output: { toneMapping: "aces", dither: false } };
  return { maxDpr: 2, pixelRatio: { max: 2 }, output: { toneMapping: "aces", dither: true } };
}
