/**
 * CPU half of the native WebGPU depth-of-field display stages (`NativeDofDisplayStages.ts`): which stages a
 * v2 pipeline bag asks for. Split from the WGSL so the renderer's static path can plan the stages without
 * loading the post WGSL chunks onto a flag-off consumer's critical chunk (PRD-03 §9 split).
 */

import { vignetteColorRgb } from "../post/vignetteColor.js";

/**
 * Custom passes anchored before the v2 graph's S6 depth of field would run
 * after it on the native chain (which starts with depth of field), so only
 * tone-map and display anchors combine with native depth of field.
 */
export function nativeDofCustomAnchorPrecedesDof(insertAt: string | undefined): boolean {
  return insertAt === "after-depth" || insertAt === "before-taa" || insertAt === "after-taa";
}

export interface NativeDofDisplayStages {
  /** Runs on HDR right after the depth-of-field composite. */
  readonly chromaticAberration?: { readonly intensity: number };
  /** Display-referred, after tone mapping and grade, before FXAA. */
  readonly vignette?: { readonly intensity: number; readonly smoothness: number; readonly roundness: number; readonly color: readonly [number, number, number] };
  /** The last display write: grain (intensity may be zero) plus the triangular dither. */
  readonly finalize?: { readonly grainIntensity: number; readonly grainSize: number; readonly grainLuminanceResponse: number };
}

const finite = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/**
 * The stages a v2 pipeline bag asks for, using the same presence rules as the
 * WebGL2 graph: CA only with a non-zero intensity, vignette whenever authored,
 * and the finalize pass whenever the LDR tail runs (vignette or grain).
 */
export function nativeDofDisplayStagesFor(pipeline: {
  readonly chromaticAberration?: unknown; readonly vignette?: unknown; readonly filmGrain?: unknown;
} | undefined): NativeDofDisplayStages | undefined {
  if (!pipeline) return undefined;
  const ca = pipeline.chromaticAberration as { intensity?: unknown } | undefined;
  const vignette = pipeline.vignette as { intensity?: unknown; smoothness?: unknown; roundness?: unknown; color?: unknown } | undefined;
  const grain = pipeline.filmGrain as { intensity?: unknown; size?: unknown; luminanceResponse?: unknown } | undefined;
  const caIntensity = ca && typeof ca === "object" ? finite(ca.intensity, 0) : 0;
  const stages: {
    chromaticAberration?: NativeDofDisplayStages["chromaticAberration"];
    vignette?: NativeDofDisplayStages["vignette"];
    finalize?: NativeDofDisplayStages["finalize"];
  } = {};
  if (caIntensity !== 0) stages.chromaticAberration = { intensity: caIntensity };
  if (vignette && typeof vignette === "object") {
    stages.vignette = { intensity: finite(vignette.intensity, 0), smoothness: finite(vignette.smoothness, 1),
      roundness: finite(vignette.roundness, 1), color: vignetteColorRgb(vignette.color) };
  }
  const grainObject = grain && typeof grain === "object" ? grain : undefined;
  if (stages.vignette || grainObject) {
    stages.finalize = { grainIntensity: grainObject ? finite(grainObject.intensity, 0) : 0,
      grainSize: grainObject ? finite(grainObject.size, 1) : 1,
      grainLuminanceResponse: grainObject ? finite(grainObject.luminanceResponse, 1) : 1 };
  }
  return stages.chromaticAberration || stages.vignette || stages.finalize ? stages : undefined;
}
