import { describe, expect, it } from "vitest";
import {
  AO_INDIRECT_FRACTION_TAG,
  indirectFractionWriteChunk
} from "../../../../packages/rendering/src/post/chunks/indirectFraction.glsl";
import { GTAO_APPLY_GLSL } from "../../../../packages/rendering/src/post/shaders/gtaoDenoise.glsl";
import { GTAO_APPLY_WGSL } from "../../../../packages/rendering/src/post/shaders/gtaoDenoise.wgsl";
import { AO_FALLBACK_STRENGTH_MAX, aoFallbackStrength } from "../../../../packages/rendering/src/post/v2Stages";

/**
 * PRD-03 §6.3: AO multiplies only the indirect-light fraction. The forward
 * feature tags opaque generated-program pixels with `alpha = 2 + f_ind`; the
 * S2 apply decodes the tag and multiplies `mix(1, aoMB, f_ind)`, so directly
 * lit (f_ind ≈ 0) pixels stay untouched. Untagged (legacy) pixels take a
 * fallback capped so a lit surface loses at most ~1% luma.
 */

/** CPU mirror of the GLSL apply weight (keep in sync with GTAO_APPLY_GLSL). */
function applyWeight(alpha: number, luma: number, sky: boolean, fallback: number): number {
  const w = alpha >= 1.5 ? Math.min(Math.max(alpha - 2, 0), 1) : fallback * (luma <= 4 ? 1 : 0);
  return sky ? 0 : w;
}
const applyLuma = (luma: number, ao: number, w: number) => luma * (1 + (ao - 1) * w);

describe("§6.3 AO indirect-fraction apply", () => {
  it("the forward chunk writes the tagged fraction for opaque, non-A2C draws only", () => {
    expect(AO_INDIRECT_FRACTION_TAG).toBe(2);
    expect(indirectFractionWriteChunk.glsl).toContain("a3dAlpha = 2.0 + a3dWriteIndirectFraction(");
    expect(indirectFractionWriteChunk.glsl).toContain("!defined(ALPHA_BLEND) && !defined(ALPHA_TO_COVERAGE)");
    expect(indirectFractionWriteChunk.wgsl).toContain("a3dAlpha = 2.0 + a3dWriteIndirectFraction(");
  });

  it("the GLSL and WGSL applies decode the tag, mask sky and restore alpha", () => {
    for (const src of [GTAO_APPLY_GLSL, GTAO_APPLY_WGSL]) {
      expect(src).toContain("hdr.a >= 1.5");
      expect(src).toContain("clamp(hdr.a - 2.0, 0.0, 1.0)");
      expect(src).toMatch(/min\(hdr\.a, 1\.0\)/);
      expect(src).toMatch(/1\.0 - sky/);
    }
    expect(GTAO_APPLY_GLSL).not.toContain("AURA_AO_INDIRECT_FRACTION");
  });

  it("a directly lit generated pixel (f_ind = 0) is untouched; an ambient one gets full AO", () => {
    expect(applyLuma(50, 0.3, applyWeight(2 + 0, 50, false, 0.1))).toBe(50);
    expect(applyLuma(10, 0.3, applyWeight(2 + 1, 10, false, 0.1))).toBeCloseTo(3, 6);
    // Half-indirect crease: AO darkens only the indirect half.
    expect(applyLuma(10, 0.3, applyWeight(2.5, 10, false, 0.1))).toBeCloseTo(6.5, 6);
  });

  it("sky never darkens, tagged or not", () => {
    expect(applyWeight(3, 1, true, 0.1)).toBe(0);
    expect(applyWeight(1, 1, true, 0.1)).toBe(0);
  });

  it("the legacy fallback is capped so an open lit surface loses <= ~1% luma, creases still darken", () => {
    expect(AO_FALLBACK_STRENGTH_MAX).toBe(0.1);
    expect(aoFallbackStrength(0.6)).toBe(0.1);
    expect(aoFallbackStrength(undefined)).toBe(0.1);
    expect(aoFallbackStrength(0.05)).toBe(0.05);
    expect(aoFallbackStrength(-1)).toBe(0);
    expect(aoFallbackStrength(Number.NaN)).toBe(0);
    const s = aoFallbackStrength(0.6);
    const lit = applyLuma(1, 0.9, applyWeight(1, 1, false, s));
    expect(1 - lit).toBeLessThanOrEqual(0.0101);
    const crease = applyLuma(1, 0.3, applyWeight(1, 1, false, s));
    expect(1 - crease).toBeGreaterThan(0.05);
  });
});
