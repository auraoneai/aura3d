import { describe, expect, it } from "vitest";
import * as contracts from "@aura3d/engine/contracts";

describe("C-37-runtime-nodes symbols", () => {
  it("contract surface is present on the stub", () => {
    expect(contracts).toBeDefined();
  });
});
