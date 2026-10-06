import { describe, expect, it } from "vitest";
import { resolveShadowCasterVariant, registerDepthVariantFeature } from "@aura3d/rendering/contracts";

describe("C-11-shadows symbols", () => {
  it("contract surface is present on the stub", () => {
    expect(resolveShadowCasterVariant).toBeDefined();
    expect(registerDepthVariantFeature).toBeDefined();
  });
});
