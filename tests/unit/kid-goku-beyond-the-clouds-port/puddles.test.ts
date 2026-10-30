import { describe, expect, it } from "vitest";
import { CUMULUS_RIDGE as CH } from "../../../examples/kid-goku-beyond-the-clouds-port/chapter";
import { CUMULUS_LOOK } from "../../../examples/kid-goku-beyond-the-clouds-port/art/look";
import { PUDDLE_CAP, buildPuddles, puddlePlacements } from "../../../examples/kid-goku-beyond-the-clouds-port/puddles";
import { ROAD_HALF } from "../../../examples/kid-goku-beyond-the-clouds-port/terrain";

describe("CD-12 wet sandstone track", () => {
  const placements = puddlePlacements(CH);
  it("lays 20-30 puddles (<= 32), on the road, off the stream, deterministically", () => {
    expect(placements.length).toBeGreaterThanOrEqual(20);
    expect(placements.length).toBeLessThanOrEqual(Math.min(30, PUDDLE_CAP));
    for (const p of placements) {
      expect(Math.abs(p.lane) + p.rx).toBeLessThan(ROAD_HALF);
      expect(p.s).toBeGreaterThan(20);
      expect(CH.waters.some((w) => p.s > w.start - 8 && p.s < w.end + 8)).toBe(false);
    }
    expect(puddlePlacements(CH)).toEqual(placements);
  });
  it("is one merged mesh with a fan per puddle", () => {
    const m = buildPuddles(CH, placements);
    expect(m.indices.length / 3).toBe(placements.length * 14);
    expect(m.vertexCount).toBe(placements.length * 15);
  });
  it("the storm road is darker and smoother than dry rock; the original is unchanged", () => {
    expect(CUMULUS_LOOK[0].road).toMatchObject({ roughness: 0.72, puddles: true });
    expect(CUMULUS_LOOK[1].road).toEqual({ color: "#ffffff", roughness: 1, puddles: false });
  });
});
