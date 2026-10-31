// GU47 blind-panel fix pass (lane g12) and phase 3: the 4.6.2 look stays reachable with ?look=original; every chapter
// defaults to the GU47 look since the relit day rows won the blind panel.
import { describe, expect, it } from "vitest";
import { ORIGINAL_LOOK_CHAPTERS, useOriginalLook } from "../../../apps/showcase-slingshot-siege/src/game/look";
import { ORIGINAL_CHAPTER_LOOKS, buildSceneOriginal } from "../../../apps/showcase-slingshot-siege/src/game/stageOriginal";

describe("slingshot-siege 4.6.2 look switch", () => {
  it("GU47 phase 3: every chapter defaults to the relit GU47 look (blind panel g12p3r2b: default and ch0-ch4 better 3/0/0)", () => {
    expect([...ORIGINAL_LOOK_CHAPTERS]).toEqual([]);
    for (let c = 0; c <= 5; c += 1) expect(useOriginalLook(c, null)).toBe(false);
  });

  it("honours ?look=original and ?look=gu47", () => {
    expect(useOriginalLook(5, "original")).toBe(true);
    expect(useOriginalLook(0, "gu47")).toBe(false);
    expect(useOriginalLook(0, "new")).toBe(false);
  });

  it("builds the 4.6.2 scene for every chapter with its rig and no fog", () => {
    expect(ORIGINAL_CHAPTER_LOOKS).toHaveLength(6);
    for (let c = 0; c < 6; c += 1) {
      const json = JSON.stringify(buildSceneOriginal(c, { reducedMotion: false }).toJSON());
      expect(json).toContain("siege-hemi");
      expect(json).toContain("siege-rim");
      expect(json).not.toContain("siege sea");
      expect(json).not.toContain("v-puff-");
    }
  });
});
