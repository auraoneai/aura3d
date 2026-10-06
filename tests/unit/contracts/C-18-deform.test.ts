import { describe, expect, it } from "vitest";
import { DEFORM_CHUNKS, deformFeatureId } from "@aura3d/rendering/contracts";

describe("C-18-deform symbols", () => {
  it("contract surface is present on the stub", () => {
    expect(DEFORM_CHUNKS).toBeDefined();
    expect(deformFeatureId).toBeDefined();
  });
});
