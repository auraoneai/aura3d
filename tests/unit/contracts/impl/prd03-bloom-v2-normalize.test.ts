import { describe, expect, it } from "vitest";
import { normalizeNativeBloomOptions } from "../../../../packages/rendering/src/webgl2/LegacyPost";

/**
 * PRD-03 §7.2 carve: flag-on (`v2` stamp on the bloom descriptor options)
 * accepts the HDR option ranges — threshold [0,64], knee [0,1] — and drops
 * the `softKnee ≤ 0.5` throw; §7.1 deprecated fields map while the
 * transitional chain executes. Flag-off behavior is byte-identical.
 */

const v2 = (options: Record<string, unknown>) => ({ v2: true, ...options });

describe("normalizeNativeBloomOptions §7.2 carve", () => {
  it("flag-on: threshold > 1 accepted up to 64 (HDR range)", () => {
    expect(normalizeNativeBloomOptions(v2({ threshold: 2.5 })).threshold).toBe(2.5);
    expect(normalizeNativeBloomOptions(v2({ threshold: 64 })).threshold).toBe(64);
    expect(() => normalizeNativeBloomOptions(v2({ threshold: 64.1 }))).toThrowError(/0, 64/);
  });

  it("flag-off: threshold > 1 still throws (legacy range)", () => {
    expect(() => normalizeNativeBloomOptions({ threshold: 1.5 })).toThrowError(/0, 1/);
  });

  it("flag-on: knee [0,1] feeds the soft-knee slot as threshold × kneeRatio", () => {
    // §6.6 knee is a ratio; the transitional slot carries the absolute width
    // threshold × knee (clamped to the legacy 0.5 slot bound).
    expect(normalizeNativeBloomOptions(v2({ threshold: 2, knee: 0.25 })).softKnee).toBeCloseTo(0.5, 6);
    expect(normalizeNativeBloomOptions(v2({ threshold: 1, knee: 0.3 })).softKnee).toBeCloseTo(0.3, 6);
    expect(() => normalizeNativeBloomOptions(v2({ knee: 1.1 }))).toThrowError(/knee/);
    expect(() => normalizeNativeBloomOptions(v2({ knee: -0.1 }))).toThrowError(/knee/);
  });

  it("flag-on: softKnee > 0.5 no longer throws (deprecated field honored)", () => {
    const options = normalizeNativeBloomOptions(v2({ softKnee: 0.9 }));
    expect(options.softKnee).toBe(0.9);
  });

  it("flag-off: softKnee > 0.5 still throws", () => {
    expect(() => normalizeNativeBloomOptions({ softKnee: 0.9 })).toThrowError(/0, 0\.5/);
  });

  it("flag-on: scatter maps onto the legacy integer radius", () => {
    expect(normalizeNativeBloomOptions(v2({ scatter: 8 })).radius).toBe(8);
    // authored radius still works (§7.1 maps radius → scatter upstream)
    expect(normalizeNativeBloomOptions(v2({ radius: 6 })).radius).toBe(6);
    // scatter wins when both present
    expect(normalizeNativeBloomOptions(v2({ radius: 6, scatter: 10 })).radius).toBe(10);
  });

  it("flag-on: maxIntensity/antiBlowout/clampLuminance/quality/shoulder accepted and ignored by the legacy slots", () => {
    const options = normalizeNativeBloomOptions(v2({ maxIntensity: 24, antiBlowout: true, clampLuminance: 32 }));
    expect(options.threshold).toBe(0.75); // defaults unchanged
    // quality still normalizes (deprecated but consumed by the legacy plan)
    expect(normalizeNativeBloomOptions(v2({ quality: "cinematic" })).quality).toBe("cinematic");
  });

  it("flag-off: identical output for identical legacy options (byte-identical carve)", () => {
    const legacy = { threshold: 0.8, intensity: 0.4, radius: 4, softKnee: 0.3, shoulder: 0.2, quality: "balanced" };
    expect(normalizeNativeBloomOptions(legacy)).toEqual({
      threshold: 0.8, intensity: 0.4, radius: 4, quality: "balanced", softKnee: 0.3, shoulder: 0.2
    });
  });
});
