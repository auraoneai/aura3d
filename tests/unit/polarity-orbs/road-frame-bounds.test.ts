import { describe, expect, it } from "vitest";
import { ROAD_FRAME_BOUNDS } from "../../../apps/showcase-polarity-orbs/src/world";

/**
 * Real-GPU full-run QA: the deck, rails and dashes sit at local z = -segment * SEG_LEN under a node moved to +distance,
 * so a fixed corridor box (local z >= -420) culled the whole road after ~420 m. The road frame must stay unbounded.
 */
describe("polarity orbs road-frame culling bounds", () => {
  it("contain the road after an hour at top speed", () => {
    for (const localZ of [0, -420, -5_000, -60 * 60 * 60]) {
      expect(localZ).toBeGreaterThanOrEqual(ROAD_FRAME_BOUNDS.min[2]);
      expect(localZ).toBeLessThanOrEqual(ROAD_FRAME_BOUNDS.max[2]);
    }
  });
});
