import { describe, expect, it } from "vitest";
import { DisplayLutCache, displayGradeKey } from "../../../../packages/rendering/src/post/DisplayLutCache";

/** PRD-03 §6.7 S10b — the 33³ bake runs once per unique grade (phase-2 metric). */

const params = { contrast: 1.1, saturation: 0.9, vibrance: 0.2, lutIntensity: 1, userLut: "teal-orange-33.cube" };

describe("DisplayLutCache (§6.7)", () => {
  it("rebake count is 1 across 60 frames of identical grade", () => {
    const cache = new DisplayLutCache(() => ({}), () => undefined);
    const handle = cache.acquire(params);
    for (let frame = 0; frame < 60; frame += 1) {
      expect(cache.acquire(params)).toBe(handle);
    }
    expect(cache.bakeCount).toBe(1);
  });

  it("a changed grade param is a new key (rebake), reverted reuses", () => {
    const cache = new DisplayLutCache((p) => ({ key: displayGradeKey(p) }), () => undefined);
    const a = cache.acquire(params);
    const b = cache.acquire({ ...params, contrast: 1.2 });
    const aAgain = cache.acquire(params);
    expect(cache.bakeCount).toBe(2);
    expect(aAgain).toBe(a);
    expect(b.key).not.toBe(a.key);
  });

  it("userLut identity participates in the key", () => {
    expect(displayGradeKey({ ...params, userLut: "a.cube" })).not.toBe(
      displayGradeKey({ ...params, userLut: "b.cube" })
    );
  });
});
