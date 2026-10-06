import { describe, expect, it } from "vitest";
import { VELOCITY_MRT, resetTemporalHistory } from "@aura3d/rendering/contracts";

describe("C-14-velocity symbols", () => {
  it("contract surface is present on the stub", () => {
    expect(VELOCITY_MRT).toBeDefined();
    expect(resetTemporalHistory).toBeDefined();
  });
});
