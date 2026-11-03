/**
 * Alpha-to-coverage for generated WebGPU forward programs. A MASK material that
 * requested `renderState.alphaToCoverage` (selected by the
 * `prd04.alphaToCoverage` contributor) writes a screen-space-sharpened
 * coverage value to output alpha instead of discarding at the cutoff; the
 * pipeline's `alphaToCoverageEnabled` converts it to the sample mask.
 */
import type { GeneratedPbrDescriptor } from "./GeneratedPbrProgram";

export const ALPHA_TO_COVERAGE_FEATURE = "prd04.alphaToCoverage";

/**
 * Resolve the feature for one descriptor. Only MASK materials qualify, and a
 * program whose output alpha already carries other data must refuse it.
 */
export function generatedAlphaToCoverage(
  active: ReadonlyMap<string, string | number | boolean>,
  features: NonNullable<GeneratedPbrDescriptor["features"]>,
  alphaOutputReserved: boolean,
  unsupported: (field: string, detail: string) => never
): boolean {
  const value = active.get(ALPHA_TO_COVERAGE_FEATURE);
  const declared = features.features[ALPHA_TO_COVERAGE_FEATURE];
  if (value === undefined) {
    if (declared !== undefined && declared !== false) unsupported(`features.${ALPHA_TO_COVERAGE_FEATURE}`, "inactive alpha-to-coverage metadata");
    return false;
  }
  if (value !== true || declared !== true) unsupported(`activeFeatures.${ALPHA_TO_COVERAGE_FEATURE}`, "invalid alpha-to-coverage contributor");
  if (features.alphaMode !== "mask") unsupported(`activeFeatures.${ALPHA_TO_COVERAGE_FEATURE}`, "alpha-to-coverage outside MASK alpha mode");
  if (alphaOutputReserved) unsupported(`activeFeatures.${ALPHA_TO_COVERAGE_FEATURE}`, "alpha-to-coverage with points, depth coverage or tagged output alpha");
  return true;
}

/**
 * WGSL statement block defining `a3dCoverage`. The cutoff edge is widened to
 * one pixel of alpha change so the hardware sample mask antialiases it;
 * fragments with no coverage are still discarded so depth stays exact.
 */
export function GENERATED_ALPHA_TO_COVERAGE_WGSL(alpha: string, cutoff: string): string {
  return `let a3dAlphaWidth = max(fwidth(${alpha}), 0.0001);
  let a3dCoverage = clamp((${alpha} - ${cutoff}) / a3dAlphaWidth + 0.5, 0.0, 1.0);
  if (a3dCoverage <= 0.0) { discard; }`;
}
