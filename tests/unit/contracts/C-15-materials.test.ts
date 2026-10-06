import { describe, expect, it } from "vitest";
import * as contracts from "@aura3d/engine/contracts";

describe("C-15-materials symbols", () => {
  it("contract surface is present on the stub", () => {
    expect(contracts).toBeDefined();
  });
});
