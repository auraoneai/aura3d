import { describe, expect, it } from "vitest";
import { diamondCrops, projectRect } from "../../../apps/showcase-aura-diamond-3d/art/qaCrops";
import { PARKS, PARK_ORDER } from "../../../apps/showcase-aura-diamond-3d/src/rules";

/** The batting camera main.ts settles on between pitches (updateCamera, batting mode, no PCI drift). */
const BATTING = { eye: [-0.5, 6.4, 11.6] as [number, number, number], target: [-0.5, 1.28, -7.2] as [number, number, number], fov: 40 };

describe("aura-diamond QA crops (E-I crop contract)", () => {
  it("frames the batter, the infield, the centre-field wall and the board from the batting camera in every park", () => {
    for (const park of PARK_ORDER) {
      const crops = diamondCrops(PARKS[park], BATTING, 16 / 9);
      const names = crops.map((c) => c.name);
      expect(names).toEqual(expect.arrayContaining(["infield", "batter", "sky"]));
      expect(crops.length).toBeLessThanOrEqual(16);
      for (const c of crops) {
        expect(c.name).toMatch(/^[a-z0-9][a-z0-9_-]{0,31}$/);
        for (const v of [c.x, c.y, c.w, c.h]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        expect(c.x + c.w).toBeLessThanOrEqual(1.0000001);
        expect(c.y + c.h).toBeLessThanOrEqual(1.0000001);
      }
      const batter = crops.find((c) => c.name === "batter")!;
      const infield = crops.find((c) => c.name === "infield")!;
      // The batter stands in front of the infield, low in the frame.
      expect(batter.y + batter.h).toBeGreaterThan(infield.y);
    }
  });

  it("projects the screen centre to the middle of the frame and drops points behind the camera", () => {
    const rect = projectRect(BATTING, 16 / 9, [[-0.5 - 0.1, 1.28 - 0.1, -7.2], [-0.5 + 0.1, 1.28 + 0.1, -7.2]]);
    expect(rect).not.toBeNull();
    expect(rect!.x + rect!.w / 2).toBeCloseTo(0.5, 3);
    expect(rect!.y + rect!.h / 2).toBeCloseTo(0.5, 3);
    expect(projectRect(BATTING, 16 / 9, [[0, 1, 40]])).toBeNull();
  });
});
