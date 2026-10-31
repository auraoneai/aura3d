/**
 * IRON CROWN refined venue look (GU47 phase 3): the 4.6.2 scene under a drawn sky, neutral rims and grade, no far
 * backdrop, no venue LUT, the airstrip jet on the deck; `?look=original` still builds the 4.6.2 scene.
 */
import { describe, expect, it } from "vitest";
import { buildArenaScene, venueVignette } from "../../../apps/showcase-iron-crown/src/game/arena";
import { FIGHTERS } from "../../../apps/showcase-iron-crown/src/game/fighters";
import { ORIGINAL_VIGNETTE } from "../../../apps/showcase-iron-crown/src/game/originalLook";
import { GROUNDED_PROPS, REFINED_LOOKS, groundDressing } from "../../../apps/showcase-iron-crown/src/game/refinedLook";
import { STAGES, type StageId } from "../../../apps/showcase-iron-crown/src/game/stages";

const [p1, cpu] = FIGHTERS;
const build = (id: StageId, lookMode: "gu47" | "original") =>
  JSON.stringify(
    buildArenaScene({ stage: STAGES.find((s) => s.id === id)!, p1: p1!, cpu: cpu!, typedFighterAssets: {}, playerStart: [-2.2, 0, 0], rivalStart: [2.2, 0, 0], contactShadows: true, reducedMotion: false, lookMode }).toJSON()
  );
const refinedIds = Object.keys(REFINED_LOOKS) as StageId[];

describe("iron-crown refined venue look (GU47 phase 3)", () => {
  it("covers the four venues the panel judged worse or did not judge", () => {
    expect(refinedIds.sort()).toEqual(["colosseum-ruins", "crown-arena", "desert-airbase", "himalayan-monastery"]);
  });

  it("builds the 4.6.2 deck and dressing with back rims, no far backdrop and no LUT", () => {
    for (const id of refinedIds) {
      const json = build(id, "gu47");
      expect(json, id).toContain(`${id}-obsidian-subfloor`);
      expect(json, id).toContain("ic-rim-p1");
      expect(json, id).toContain("ic-rim-p2");
      expect(json, id).not.toContain(`bd-${id}-`);
      expect(json, id).not.toContain('"lut"');
    }
    expect(build("crown-arena", "gu47")).toContain("ic-follow-spot");
    expect(build("colosseum-ruins", "gu47")).not.toContain("ic-follow-spot");
  });

  it("draws a sky HDRI on the open-air venues; the enclosed Crown keeps a colour background", () => {
    for (const id of refinedIds) {
      const look = REFINED_LOOKS[id]!;
      expect(build(id, "gu47"), id).toContain(look.hdri);
      if (id === "crown-arena") expect(look.background).toBe("#141519");
      else expect(look.background).toBeUndefined();
    }
  });

  it("?look=original still builds the 4.6.2 scene on every refined venue", () => {
    for (const id of refinedIds) {
      const json = build(id, "original");
      expect(json, id).not.toContain("ic-rim-p1");
      expect(venueVignette(id, "original")).toBe(ORIGINAL_VIGNETTE);
      expect(venueVignette(id, "gu47")).toBe(REFINED_LOOKS[id]!.vignette);
    }
  });

  it("parks the airstrip jet on the deck", () => {
    const airbase = STAGES.find((s) => s.id === "desert-airbase")!;
    const jet = groundDressing(airbase.originalDressing).find((n) => (n as { name?: string }).name === "ab-jet-center") as { transform?: { position?: number[] }; position?: number[] };
    expect(jet).toBeDefined();
    const y = jet.transform?.position?.[1] ?? jet.position?.[1];
    expect(y).toBe(GROUNDED_PROPS["ab-jet-center"]);
  });
});
