import { describe, expect, it } from "vitest";
import { explicitMountQualityTier, resolveMountQuality } from "../../../../packages/engine/src/agent-api/compiler/renderer";

/**
 * GU47 eint EB-2 (E-B handoff, `compiler/renderer.ts:194`): the mount passes the app's explicit quality tier to
 * `createProductionRuntimeCollectedLights({ shadowTier })`, so the local shadow caster cap follows
 * `renderer.quality`; auto/unset passes none (the shadow config keeps its coarse-pointer "medium" / desktop "high").
 * The cap itself is E-B's (`tests/unit/gu47/eb/multi-caster-shadows.test.ts`).
 */
describe("GU47 eint EB-2: the explicit mount tier", () => {
  it("names the tier the app set, in both option forms", () => {
    expect(explicitMountQualityTier({ quality: "low" } as never)).toBe("low");
    expect(explicitMountQualityTier({ quality: { tier: "ultra" } } as never)).toBe("ultra");
    expect(explicitMountQualityTier({ quality: "medium" } as never)).toBe("medium");
  });

  it("auto, unset and unknown names leave the caller's own resolution", () => {
    expect(explicitMountQualityTier({ quality: "auto" } as never)).toBeUndefined();
    expect(explicitMountQualityTier(undefined)).toBeUndefined();
    expect(explicitMountQualityTier({} as never)).toBeUndefined();
    expect(explicitMountQualityTier({ quality: "cinematic-max" } as never)).toBeUndefined();
  });

  it("resolveMountQuality still falls back to high", () => {
    expect(resolveMountQuality({ quality: "auto" } as never).tier).toBe("high");
    expect(resolveMountQuality({ quality: "low" } as never).tier).toBe("low");
  });
});
