import { describe, expect, it } from "vitest";
import { GROUND_HALF } from "../../../examples/drift-and-deliver-port/city";
import { outerGroundRects } from "../../../examples/drift-and-deliver-port/look";

describe("gridlock courier ground layers", () => {
  it("never lays terrain under the road square (coplanar layers lose the depth test in flipping order)", () => {
    for (const [x0, z0, x1, z1] of outerGroundRects()) {
      const overlapX = Math.min(x1, GROUND_HALF) - Math.max(x0, -GROUND_HALF);
      const overlapZ = Math.min(z1, GROUND_HALF) - Math.max(z0, -GROUND_HALF);
      expect(overlapX > 0 && overlapZ > 0, `[${x0},${z0},${x1},${z1}] overlaps the road square`).toBe(false);
    }
  });

  it("still covers the whole 3.2 km terrain square except the road square", () => {
    const area = outerGroundRects().reduce((s, [x0, z0, x1, z1]) => s + (x1 - x0) * (z1 - z0), 0);
    const full = 3200 * 3200;
    const road = 2 * GROUND_HALF * 2 * GROUND_HALF;
    expect(area).toBeCloseTo(full - road, 0);
  });
});
