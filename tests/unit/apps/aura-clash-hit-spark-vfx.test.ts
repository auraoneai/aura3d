import { describe, expect, it } from "vitest";
import {
  auraClashHitboxDebugOverlay,
  getAuraClashHitboxDebugOverlay,
  getHitSparkFrame,
  hitSparkFrames
} from "../../../apps/aura-clash-showcase/src/rendering/HitSparkVfx";

describe("Aura Clash hit spark VFX", () => {
  it("keeps normal hit sparks as production VFX, not debug boxes", () => {
    expect(Object.keys(hitSparkFrames)).toEqual(["light", "heavy", "special", "guard", "ko"]);
    expect(getHitSparkFrame("special")).toMatchObject({
      label: "Aura Burst flash",
      radiusPx: 220
    });
    expect(JSON.stringify(hitSparkFrames).toLowerCase()).not.toContain("debug");
    expect(JSON.stringify(hitSparkFrames).toLowerCase()).not.toContain("hitbox");
  });

  it("exposes intentional debug-only hitbox visibility", () => {
    const normal = getAuraClashHitboxDebugOverlay();
    const debug = getAuraClashHitboxDebugOverlay({ enabled: true });

    expect(auraClashHitboxDebugOverlay).toMatchObject({
      kind: "aura-clash-hitbox-debug-overlay",
      engineOverlay: "game.fighting().debugHitboxOverlay",
      normalPlayVisible: false,
      debugPlayVisible: true
    });
    expect(normal.visibleVolumes).toEqual([]);
    expect(debug.visibleVolumes.map((volume) => volume.id)).toEqual(["active-hitbox", "hurtbox", "guardbox", "pushbox"]);
    expect(debug.visibleVolumes.every((volume) => volume.visibleInNormalPlay === false && volume.visibleWhenDebugEnabled === true)).toBe(true);
  });
});
