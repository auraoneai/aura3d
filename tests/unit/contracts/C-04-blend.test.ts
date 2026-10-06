import { describe, expect, it } from "vitest";
import { resolveBlendMode, renderStateKey } from "@aura3d/rendering/contracts";

describe("C-04-blend symbols", () => {
  it("contract surface is present on the stub", () => {
    expect(resolveBlendMode).toBeDefined();
    expect(renderStateKey).toBeDefined();
  });
});
