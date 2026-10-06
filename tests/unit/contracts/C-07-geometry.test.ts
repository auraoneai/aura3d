import { describe, expect, it } from "vitest";
import { instanceBufferSlot } from "@aura3d/rendering/contracts";

describe("C-07-geometry symbols", () => {
  it("contract surface is present on the stub", () => {
    expect(instanceBufferSlot).toBeDefined();
  });
});
