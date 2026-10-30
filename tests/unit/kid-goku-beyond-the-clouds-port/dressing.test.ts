import { describe, expect, it } from "vitest";
import { CUMULUS_RIDGE as CH } from "../../../examples/kid-goku-beyond-the-clouds-port/chapter";
import { CUMULUS_LOOK } from "../../../examples/kid-goku-beyond-the-clouds-port/art/look";
import { buildWaymarks, waymarkPlacements } from "../../../examples/kid-goku-beyond-the-clouds-port/waymarks";
import { ROAD_HALF } from "../../../examples/kid-goku-beyond-the-clouds-port/terrain";

describe("CD-20 waymarks", () => {
  const marks = waymarkPlacements(CH);
  it("cairns off the road on alternating shoulders, two cord poles per gorge, off the stream", () => {
    const cairns = marks.filter((m) => m.kind === "cairn"), poles = marks.filter((m) => m.kind === "pole");
    expect(cairns.length).toBeGreaterThanOrEqual(8);
    expect(poles).toHaveLength(CH.poles.length * 2);
    for (const m of marks) expect(Math.abs(m.lane)).toBeGreaterThan(ROAD_HALF);
    for (const c of cairns) expect(CH.waters.some((w) => c.s > w.start - 10 && c.s < w.end + 10)).toBe(false);
  });
  it("is one deterministic merged mesh with a tone attribute source", () => {
    const a = buildWaymarks(CH, marks), b = buildWaymarks(CH, marks);
    expect(a.indices.length).toBeGreaterThan(0);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(a.colors.length).toBe(a.vertexCount * 4);
  });
});

describe("CD-17 wind and cloud drift", () => {
  it("the storm row sways the hero trees and drifts the cloud sea slower than the sky; the original is static", () => {
    expect(CUMULUS_LOOK[0].wind?.strength).toBeGreaterThan(0);
    expect(CUMULUS_LOOK[0].cloudDrift.sea).toBeLessThan(CUMULUS_LOOK[0].cloudDrift.sky);
    expect(CUMULUS_LOOK[1].wind).toBeNull();
    expect(CUMULUS_LOOK[1].cloudDrift).toEqual({ sky: 1, sea: 1 });
  });
});
