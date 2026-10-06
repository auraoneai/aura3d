import { describe, expect, it } from "vitest";
import * as contracts from "@aura3d/audio/contracts";

describe("C-25-audio symbols", () => {
  it("contract surface is present on the stub", () => {
    expect(contracts).toBeDefined();
  });
});
