import { describe, expect, it } from "vitest";
import {
  bloomPyramidCompositeGain,
  normalizeBloomQualityPreset,
  resolveBloomPyramidPlan,
} from "../../../packages/rendering/src";
import { createBloomCompositeLut } from "../../../packages/rendering/src/postprocess/NativeLdrEffectLuts";

/**
 * A1 native bloom pyramid + shoulder composite (muse3jsparity-PRD Phase 1).
 * Pure-math pins: mip geometry, energy-preserving weights, target bytes,
 * option validation, and the shoulder-baked composite LUT. GL execution is
 * browser-proven separately (executionMode + pixel contracts).
 */

function compositeCell(lut: Uint8Array, source: number, blurred: number): number {
  return lut[(blurred * 256 + source) * 4]!;
}

describe("native bloom pyramid plan", () => {
  it("keeps performance on the legacy single full-res target", () => {
    const plan = resolveBloomPyramidPlan(800, 600, "performance", false);
    expect(plan.mipCount).toBe(1);
    expect(plan.mips).toEqual([{ width: 800, height: 600 }]);
    expect(plan.weights).toEqual([1]);
    expect(plan.halfFloat).toBe(false);
    expect(plan.targetBytes).toBe(800 * 600 * 4);
    expect(bloomPyramidCompositeGain(plan)).toBe(1);
  });

  it("builds halving mip chains with weights that sum to exactly 1", () => {
    const balanced = resolveBloomPyramidPlan(800, 600, "balanced", false);
    expect(balanced.mipCount).toBe(3);
    expect(balanced.mips).toEqual([
      { width: 400, height: 300 },
      { width: 200, height: 150 },
      { width: 100, height: 75 },
    ]);
    expect(balanced.weights.reduce((total, weight) => total + weight, 0)).toBeCloseTo(1, 12);
    const cinematic = resolveBloomPyramidPlan(800, 600, "cinematic", false);
    expect(cinematic.mipCount).toBe(5);
    expect(cinematic.mips[4]).toEqual({ width: 25, height: 19 });
    expect(cinematic.weights.reduce((total, weight) => total + weight, 0)).toBeCloseTo(1, 12);
    expect(cinematic.halfFloat).toBe(true);
    expect(cinematic.targetBytes).toBeGreaterThan(balanced.targetBytes);
  });

  it("uses half-float accounting for HDR sources", () => {
    const ldr = resolveBloomPyramidPlan(800, 600, "balanced", false);
    const hdr = resolveBloomPyramidPlan(800, 600, "balanced", true);
    expect(hdr.halfFloat).toBe(true);
    expect(hdr.targetBytes).toBe(ldr.targetBytes * 2);
  });

  it("rejects bad geometry and unknown qualities", () => {
    expect(() => resolveBloomPyramidPlan(0, 600, "balanced", false)).toThrow();
    expect(() => resolveBloomPyramidPlan(800, -1, "balanced", false)).toThrow();
    expect(normalizeBloomQualityPreset(undefined)).toBe("performance");
    expect(normalizeBloomQualityPreset("cinematic")).toBe("cinematic");
    expect(() => normalizeBloomQualityPreset("ultra")).toThrow();
  });
});

describe("shoulder-baked composite LUT", () => {
  it("keeps the legacy clamp table byte-for-byte by default", () => {
    const lut = createBloomCompositeLut(0.35);
    expect(compositeCell(lut, 100, 100)).toBe(Math.min(255, Math.round(100 + 100 * 0.35)));
    expect(compositeCell(lut, 250, 200)).toBe(255);
    expect(compositeCell(lut, 0, 0)).toBe(0);
    const explicit = createBloomCompositeLut(0.35, { shoulder: 0 });
    expect([...explicit]).toEqual([...lut]);
  });

  it("rolls highlights off smoothly instead of clipping", () => {
    const lut = createBloomCompositeLut(0.35, { shoulder: 0.5 });
    // Full-scale input still reaches white (energy endpoint preserved).
    expect(compositeCell(lut, 255, 255)).toBe(255);
    expect(compositeCell(lut, 0, 0)).toBe(0);
    // Overbright blends that clipped to 255 now resolve below it.
    expect(compositeCell(lut, 250, 200)).toBeLessThan(255);
    // Monotonic in both axes: no banding inversions.
    let previous = -1;
    for (let source = 0; source < 256; source += 7) {
      const value = compositeCell(lut, source, 200);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("validates its inputs", () => {
    expect(() => createBloomCompositeLut(-1)).toThrow();
    expect(() => createBloomCompositeLut(0.35, { shoulder: -0.1 })).toThrow();
    expect(() => createBloomCompositeLut(0.35, { shoulder: 1.1 })).toThrow();
  });
});
