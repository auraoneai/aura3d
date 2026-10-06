import { describe, expect, it } from "vitest";
import { resolveSamplerAnisotropy, LIGHTING_SAMPLER_DROP_ORDER, resolveLightingSamplerBudget } from "@aura3d/rendering/contracts";

describe("C-12-sampling symbols", () => {
  it("contract surface is present on the stub", () => {
    expect(resolveSamplerAnisotropy).toBeDefined();
    expect(LIGHTING_SAMPLER_DROP_ORDER).toBeDefined();
    expect(resolveLightingSamplerBudget).toBeDefined();
  });
});
