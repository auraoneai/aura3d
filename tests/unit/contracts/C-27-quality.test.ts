import { describe, expect, it } from "vitest";
import { QUALITY_TIERS, resolveTierSettings, nextLowerTier } from "@aura3d/rendering/contracts";

describe("C-27-quality symbols", () => {
  it("contract surface is present on the stub", () => {
    expect(QUALITY_TIERS).toBeDefined();
    expect(resolveTierSettings).toBeDefined();
    expect(nextLowerTier).toBeDefined();
  });
});
