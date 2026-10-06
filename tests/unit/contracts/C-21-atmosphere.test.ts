import { describe, expect, it } from "vitest";
import { FOG_CHUNK, skyBackgroundSlot, onSkyChanged } from "@aura3d/rendering/contracts";

describe("C-21-atmosphere symbols", () => {
  it("contract surface is present on the stub", () => {
    expect(FOG_CHUNK).toBeDefined();
    expect(skyBackgroundSlot).toBeDefined();
    expect(onSkyChanged).toBeDefined();
  });
});
