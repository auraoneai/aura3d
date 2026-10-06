import { describe, expect, it } from "vitest";
import { frameStatsSlot, renderTargetPoolSlot } from "@aura3d/rendering/contracts";

describe("C-28-device symbols", () => {
  it("contract surface is present on the stub", () => {
    expect(frameStatsSlot).toBeDefined();
    expect(renderTargetPoolSlot).toBeDefined();
  });
});
