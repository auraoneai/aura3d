import { describe, expect, it } from "vitest";
import { CUMULUS_RIDGE as CH } from "../../../examples/kid-goku-beyond-the-clouds-port/chapter";
import { CUMULUS_LOOK } from "../../../examples/kid-goku-beyond-the-clouds-port/art/look";
import { HOLLOW_CAP, HOLLOW_DEPTH, HOLLOW_SPACING, buildWaymarks, hollowPlacements, waymarkPlacements } from "../../../examples/kid-goku-beyond-the-clouds-port/waymarks";
import { ROAD_HALF, groundHeight } from "../../../examples/kid-goku-beyond-the-clouds-port/terrain";

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

describe("CD-20 moss and flowers in hollows", () => {
  const hollows = hollowPlacements(CH);
  it("sit in real shoulder dips, spaced, capped, off the road, the stream and the gorges", () => {
    expect(hollows.length).toBeGreaterThanOrEqual(12);
    expect(hollows.length).toBeLessThanOrEqual(HOLLOW_CAP);
    hollows.forEach((h, i) => {
      expect(Math.abs(h.lane)).toBeGreaterThan(ROAD_HALF + 2);
      const around = (groundHeight(CH, h.s - 3, h.lane) + groundHeight(CH, h.s + 3, h.lane) + groundHeight(CH, h.s, h.lane - 3) + groundHeight(CH, h.s, h.lane + 3)) / 4;
      expect(around - groundHeight(CH, h.s, h.lane)).toBeGreaterThanOrEqual(HOLLOW_DEPTH);
      if (i > 0) expect(h.s - hollows[i - 1]!.s).toBeGreaterThanOrEqual(HOLLOW_SPACING);
      expect(CH.waters.some((w) => h.s > w.start - 6 && h.s < w.end + 6)).toBe(false);
    });
  });
  it("ride in the waymarks draw and add under 8k triangles", () => {
    const all = buildWaymarks(CH), without = buildWaymarks(CH, waymarkPlacements(CH).filter((w) => w.kind !== "hollow"));
    expect((all.indices.length - without.indices.length) / 3).toBeLessThan(8000);
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
