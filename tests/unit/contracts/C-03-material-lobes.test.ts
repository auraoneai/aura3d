import { describe, expect, it } from "vitest";
import { registerMaterialLobe, materialLobes } from "@aura3d/rendering/contracts";

describe("C-03-material-lobes symbols", () => {
  it("contract surface is present on the stub", () => {
    expect(registerMaterialLobe).toBeDefined();
    expect(materialLobes).toBeDefined();
  });
});
