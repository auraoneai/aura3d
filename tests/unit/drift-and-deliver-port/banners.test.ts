import { describe, expect, it } from "vitest";
import { BANNER, BANNERS, bannerDistrict, bannerNodes } from "../../../examples/drift-and-deliver-port/banners";
import { STREET_LINES } from "../../../examples/drift-and-deliver-port/world";

describe("gridlock courier district banners (GU47 WP-28 GC-H2)", () => {
  it("hangs each banner over a street line in the district it names", () => {
    const named = { DOWNTOWN: "core", "OLD TOWN": "residential", HARBOUR: "commerce" } as const;
    for (const b of BANNERS) {
      expect(STREET_LINES).toContain(b.x);
      expect(bannerDistrict(b)).toBe(named[b.text as keyof typeof named]);
    }
  });

  it("costs 6 nodes (a panel and an SDF text each) and clears the traffic", () => {
    const nodes = bannerNodes();
    expect(nodes).toHaveLength(6);
    expect(BANNER.y - BANNER.height / 2).toBeGreaterThan(5);
  });

  it("keeps glyphs at least 14 px tall at 30 m on a 720 px, 60 deg view", () => {
    const pxPerMetre = 720 / (2 * 30 * Math.tan(Math.PI / 6));
    expect(BANNER.size * pxPerMetre).toBeGreaterThanOrEqual(14);
  });
});
