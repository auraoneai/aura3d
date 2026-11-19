import { describe, expect, it } from "vitest";
import { CONFIG } from "../../../apps/showcase-splat-turf/src/sim";
import { RUN_FRAME_BOUNDS } from "../../../apps/showcase-splat-turf/src/scenery";

/**
 * Real-GPU full-run QA: road, curbs, lamp posts, pennants, solvent strips and can halos vanished after ~420 m because their
 * scrolling-frame batches (instances at local z = -row) carried the shared corridor box (local z >= -420) as culling bounds.
 */
describe("splat turf scrolling-frame culling bounds", () => {
  it("contain every road row of the run, the finish run-out and the camera side", () => {
    for (const row of [0, 420, 800, CONFIG.RUN_LENGTH, CONFIG.RUN_LENGTH + 200]) {
      const localZ = -row - 0.5;
      expect(localZ).toBeGreaterThanOrEqual(RUN_FRAME_BOUNDS.min[2]);
      expect(localZ).toBeLessThanOrEqual(RUN_FRAME_BOUNDS.max[2]);
    }
  });
});
