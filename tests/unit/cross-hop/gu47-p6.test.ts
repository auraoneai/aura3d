// GU47 phase 6 (4.7.4): candy rafts on the vivid Critter Core view and the panel-candidate looks (presentation only).
import { describe, expect, it } from "vitest";
import { VIVID_DEFAULT_THEMES, VIVID_LOOKS, candyRaftFor, defaultLookFor, p5DuskFor } from "../../../apps/showcase-cross-hop/src/game/look";
import { THEMES } from "../../../apps/showcase-cross-hop/src/game/themes";

describe("cross-hop phase-6 views", () => {
  it("candy rafts only on Critter Core (dressed 4.6 look or vivid), never in the diorama", () => {
    expect(candyRaftFor("vivid", true, "crittercore")).toBe(true);
    expect(candyRaftFor("original", true, "crittercore")).toBe(true);
    expect(candyRaftFor("diorama", true, "crittercore")).toBe(false);
    for (const th of THEMES.filter((t) => t.id !== "crittercore")) {
      expect(candyRaftFor("vivid", true, th.id)).toBe(false);
      expect(candyRaftFor("original", true, th.id)).toBe(false);
    }
    // The phase-5 dusk palette swap of the 4.6 look is unchanged.
    expect(p5DuskFor("vivid", true, "crittercore")).toBe(false);
  });
  it("every theme boots the vivid look; Critter Core's vivid look is the candy dusk", () => {
    expect([...VIVID_DEFAULT_THEMES]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(defaultLookFor(null, null)).toBe("vivid");
    expect(defaultLookFor("original", 0)).toBe("original");
    expect(VIVID_LOOKS[5]!.sky.zenith).toBe("#4b3a86");
    expect(VIVID_LOOKS[5]!.sky.horizon).toBe("#f2a07e");
  });
});
