// Camera-following volume sprites (snow, rain, marine snow, dust motes) have a world-space size, so one passing
// 0.3 m from the lens used to project to a screen-filling soft disc. The limits cap the projected diameter and fade
// the sprite out close to the camera; this is the CPU model of that vertex math.

import { describe, expect, it } from "vitest";
import { VOLUME_PRESETS, VOLUME_SPRITE_LIMITS, volumeSpriteScreenSize } from "../../../packages/rendering/src/vfx/ProceduralVolumeEmitter";

const FOV = (50 * Math.PI) / 180;

describe("volume sprite on-screen limits", () => {
  for (const kind of ["snow", "marineSnow", "dustMotes", "rain"] as const) {
    it(`${kind}: a sprite at 0.3 to 1 m from the lens never exceeds its cap, at 900 and 1800 px viewport heights`, () => {
      const limits = VOLUME_SPRITE_LIMITS[kind];
      for (const heightPx of [900, 1800]) {
        for (const d of [0.05, 0.3, 0.5, 1]) {
          const r = volumeSpriteScreenSize(VOLUME_PRESETS[kind].size, d, FOV, heightPx, limits);
          expect(r.pixels).toBeLessThanOrEqual(limits.maxScreen * heightPx + 1e-6);
        }
      }
    });
    it(`${kind}: fades out under ${VOLUME_SPRITE_LIMITS[kind].nearFade} m and is opaque beyond it`, () => {
      const limits = VOLUME_SPRITE_LIMITS[kind];
      expect(volumeSpriteScreenSize(VOLUME_PRESETS[kind].size, 0.1, FOV, 900, limits).alpha).toBeLessThan(0.2);
      expect(volumeSpriteScreenSize(VOLUME_PRESETS[kind].size, 1, FOV, 900, limits).alpha).toBe(1);
      expect(volumeSpriteScreenSize(VOLUME_PRESETS[kind].size, 5, FOV, 900, limits).alpha).toBe(1);
    });
  }

  it("without the cap a snow flake at 0.3 m was a disc of hundreds of pixels (the defect)", () => {
    const uncapped = volumeSpriteScreenSize(VOLUME_PRESETS.snow.size, 0.3, FOV, 900, { maxScreen: 0, nearFade: 0 });
    expect(uncapped.pixels).toBeGreaterThan(150);
    const capped = volumeSpriteScreenSize(VOLUME_PRESETS.snow.size, 0.3, FOV, 900, VOLUME_SPRITE_LIMITS.snow);
    expect(capped.pixels).toBeLessThan(15);
  });

  it("a distant sprite keeps its natural size", () => {
    const r = volumeSpriteScreenSize(VOLUME_PRESETS.snow.size, 20, FOV, 900, VOLUME_SPRITE_LIMITS.snow);
    expect(r.pixels).toBeLessThan(8);
    expect(r.alpha).toBe(1);
  });
});
