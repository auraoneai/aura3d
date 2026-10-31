// GU47 blind-panel fix pass (lane g12): default and chapters 0-4 open on the 4.6.2 look; ch5 keeps the GU47 night.
import { describe, expect, it } from "vitest";
import { ORIGINAL_LOOK_CHAPTERS, useOriginalLook } from "../../../apps/showcase-slingshot-siege/src/game/look";
import { ORIGINAL_CHAPTER_LOOKS, buildSceneOriginal } from "../../../apps/showcase-slingshot-siege/src/game/stageOriginal";

describe("slingshot-siege 4.6.2 look switch", () => {
  it("defaults chapters 0-4 to the 4.6.2 look and ch5 to the GU47 look", () => {
    expect([...ORIGINAL_LOOK_CHAPTERS].sort()).toEqual([0, 1, 2, 3, 4]);
    for (let c = 0; c <= 4; c += 1) expect(useOriginalLook(c, null)).toBe(true);
    expect(useOriginalLook(5, null)).toBe(false);
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
