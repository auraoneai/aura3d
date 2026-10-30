import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VFX_ATLAS_GUTTER, vfxAtlasTwinRect, type VfxAtlasManifest } from "../../../../packages/rendering/src/vfx/VfxAtlas";
import { vfxSpriteRect } from "../../../../packages/engine/src/production-runtime/effects/FlipbookAtlas";

/**
 * GU47 eint EF-7 (E-F unowned follow-up, `rendering/src/vfx/VfxAtlas.ts:sequence`): rects moved onto the 1k tier twin
 * snap to its 132 px pitch (128 px cells + the bake's 4 px gutter) instead of halving the 2k rect, which drifted 2 px
 * per cell. Cross-checked against E-F's `vfxSpriteRect` (its 1k centroids are checked on the decoded PNG).
 */
const manifest = JSON.parse(readFileSync(resolve(__dirname, "../../../../packages/engine/assets/vfx/manifest.json"), "utf8")) as VfxAtlasManifest;

describe("GU47 eint EF-7: VFX atlas twin rects", () => {
  it("snaps positions to the twin pitch and scales sizes", () => {
    expect(VFX_ATLAS_GUTTER).toBe(4);
    // smoke-a: column 3, row 1 on the 2k page (pitch 260), a 2x2 block of 256 px cells.
    expect(vfxAtlasTwinRect([784, 264, 512, 512], 2, 0.5)).toEqual([400, 136, 256, 256]);
    expect(vfxAtlasTwinRect([4, 4, 256, 256], 1, 0.5)).toEqual([4, 4, 128, 128]);
    // Identity at scale 1.
    expect(vfxAtlasTwinRect([784, 264, 512, 512], 2, 1)).toEqual([784, 264, 512, 512]);
  });

  it("agrees with E-F's FlipbookAtlas 1k rects for every shipped sequence", () => {
    for (const [name, sequence] of Object.entries(manifest.sequences)) {
      const ours = vfxAtlasTwinRect(sequence.rect, sequence.columns, 0.5);
      const theirs = vfxSpriteRect({ rect: sequence.rect } as never, 1024);
      expect(ours, name).toEqual([...theirs]);
    }
  });
});
