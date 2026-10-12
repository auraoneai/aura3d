import { describe, expect, it } from "vitest";
import { normalizeNativeBloomOptions } from "../../../../packages/rendering/src/webgl2/LegacyPost";
import {
  BLOOM_V2_BLUR_RADII,
  resolveBloomPyramidPlan,
  resolveBloomPyramidV2Response
} from "../../../../packages/rendering/src/postprocess/NativeBloomPyramid";

/**
 * PRD-03 §6.6 flag-on native pyramid response. GPU promote run 38195587054
 * (post): with the ×17 legacy gain removed, the legacy cinematic weights
 * (0.4 … 0.08) and radius-scaled kernels left the prd03-hdr-bloom halo far
 * below three's UnrealBloomPass (flag-on frame mean 0.12 vs three 0.29).
 */
describe("v2 bloom pyramid response (flag-on)", () => {
  const cinematic = resolveBloomPyramidPlan(1280, 720, "cinematic", true);

  it("weights sum to 1 for every spread (constant excess E blooms E · intensity)", () => {
    for (const spread of [0, 0.25, 0.4, 0.7, 1]) {
      const { weights } = resolveBloomPyramidV2Response(cinematic, spread);
      expect(weights).toHaveLength(5);
      expect(weights.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1, 12);
    }
  });

  it("spread moves weight from the finest mip to the widest", () => {
    const narrow = resolveBloomPyramidV2Response(cinematic, 0).weights;
    const wide = resolveBloomPyramidV2Response(cinematic, 1).weights;
    expect(narrow[0]!).toBeGreaterThan(narrow[4]!);
    expect(wide[4]!).toBeGreaterThan(wide[0]!);
    // spread 0.4 → mix(f, 1.2 − f, 0.4) / 3 = (0.2f + 0.48) / 3.
    const mid = resolveBloomPyramidV2Response(cinematic, 0.4).weights;
    expect(mid[0]!).toBeCloseTo(0.68 / 3, 12);
    expect(mid[4]!).toBeCloseTo(0.52 / 3, 12);
  });

  it("uses the fixed widening kernels, independent of spread", () => {
    expect(resolveBloomPyramidV2Response(cinematic, 0.1).blurRadii).toEqual(BLOOM_V2_BLUR_RADII);
    const balanced = resolveBloomPyramidPlan(1280, 720, "balanced", true);
    expect(resolveBloomPyramidV2Response(balanced, 0.5).blurRadii).toEqual(BLOOM_V2_BLUR_RADII.slice(0, 3));
  });

  it("rejects an out-of-range spread", () => {
    expect(() => resolveBloomPyramidV2Response(cinematic, 1.5)).toThrow();
    expect(() => resolveBloomPyramidV2Response(cinematic, Number.NaN)).toThrow();
  });

  it("normalizeNativeBloomOptions carries spread only on the v2 stamp", () => {
    expect(normalizeNativeBloomOptions({ v2: true, threshold: 1, spread: 0.4 }).spread).toBe(0.4);
    expect(normalizeNativeBloomOptions({ v2: true, threshold: 1 }).spread).toBe(0.7);
    expect(normalizeNativeBloomOptions({ threshold: 0.8 })).not.toHaveProperty("spread");
    expect(() => normalizeNativeBloomOptions({ v2: true, threshold: 1, spread: 2 })).toThrow();
  });
});
