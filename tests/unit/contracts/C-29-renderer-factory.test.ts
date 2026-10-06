import { describe, expect, it } from "vitest";
import { resourceRegistrySlot } from "@aura3d/rendering/contracts";

describe("C-29-renderer-factory symbols", () => {
  it("contract surface is present on the stub", () => {
    expect(resourceRegistrySlot).toBeDefined();
  });
});
