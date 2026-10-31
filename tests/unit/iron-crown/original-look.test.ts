/**
 * IRON CROWN GU47 blind-panel pass: the venues the panel did not judge better default to their 4.6.2 look; `?look=`
 * forces one look everywhere; the 4.6.2 scene carries no GU47 backdrop, follow-spot, back rims or LUT.
 */
import { describe, expect, it } from "vitest";
import { buildArenaScene } from "../../../apps/showcase-iron-crown/src/game/arena";
import { FIGHTERS } from "../../../apps/showcase-iron-crown/src/game/fighters";
import { ORIGINAL_LOOKS, VENUE_LOOK_DEFAULT, venueLookMode } from "../../../apps/showcase-iron-crown/src/game/originalLook";
import { STAGES } from "../../../apps/showcase-iron-crown/src/game/stages";

const q = (search: string) => new URLSearchParams(search);

describe("iron-crown per-venue 4.6.2 look (GU47 blind-panel pass)", () => {
  it("defaults follow the blind-panel table (phase 3: the refined look on every venue the panel judged better)", () => {
    const gu47 = STAGES.filter((s) => venueLookMode(s.id) === "gu47").map((s) => s.id);
    expect(gu47).toContain("bangkok-dock");
    expect(gu47).toContain("neo-tokyo-rooftop");
    expect(Object.keys(VENUE_LOOK_DEFAULT).sort()).toEqual(STAGES.map((s) => s.id).sort());
  });

  it("?look=original and ?look=gu47 override every venue; other values keep the default", () => {
    for (const s of STAGES) {
      expect(venueLookMode(s.id, q("?look=original"))).toBe("original");
      expect(venueLookMode(s.id, q("?look=gu47"))).toBe("gu47");
      expect(venueLookMode(s.id, q("?look=bogus"))).toBe(VENUE_LOOK_DEFAULT[s.id]);
    }
  });

  it("the 4.6.2 scene uses the 4.6.2 look preset, no far backdrop and no GU47 venue lights", () => {
    const [p1, cpu] = FIGHTERS;
    for (const s of STAGES) {
      const json = JSON.stringify(
        buildArenaScene({ stage: s, p1: p1!, cpu: cpu!, typedFighterAssets: {}, playerStart: [-2.2, 0, 0], rivalStart: [2.2, 0, 0], contactShadows: true, reducedMotion: false, lookMode: "original" }).toJSON()
      );
      expect(json, s.id).not.toContain(`bd-${s.id}-`);
      expect(json, s.id).not.toContain("ic-follow-spot");
      expect(json, s.id).not.toContain("ic-rim-p1");
      expect(json, s.id).toContain("crown ring key");
      expect(json, s.id).toContain(`${s.id}-obsidian-subfloor`);
      expect(ORIGINAL_LOOKS[s.id].lookId.length).toBeGreaterThan(0);
    }
  });
});
