// GU47 phase 5 (4.7.3): dusk sky and candy rafts on the dressed Critter Core view (sibling distinctness, presentation only).
import { describe, expect, it } from "vitest";
import { P5_CANDY_RAFT, P5_DUSK_SKY, p5DuskFor } from "../../../apps/showcase-cross-hop/src/game/look";
import { THEMES } from "../../../apps/showcase-cross-hop/src/game/themes";

describe("cross-hop phase-5 dusk view", () => {
  it("applies only to the dressed 4.6 look of Critter Core", () => {
    expect(p5DuskFor("original", true, "crittercore")).toBe(true);
    expect(p5DuskFor("original", false, "crittercore")).toBe(false);
    expect(p5DuskFor("vivid", true, "crittercore")).toBe(false);
    expect(p5DuskFor("diorama", true, "crittercore")).toBe(false);
    for (const th of THEMES.filter((t) => t.id !== "crittercore")) expect(p5DuskFor("original", true, th.id)).toBe(false);
  });
  it("leaves the theme table untouched (other views keep their 4.7.2 sky)", () => {
    const cc = THEMES.find((t) => t.id === "crittercore")!;
    expect(cc.palette.sky).toBe("#5282c2");
    expect(cc.palette.horizon).toBe("#7caae3");
    expect(P5_DUSK_SKY.sky).not.toBe(cc.palette.sky);
    expect(P5_CANDY_RAFT.deck).toMatch(/^#[0-9a-f]{6}$/);
  });
});
