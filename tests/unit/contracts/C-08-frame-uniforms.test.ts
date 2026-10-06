import { describe, expect, it } from "vitest";
import { AURA_FRAME_BLOCK, createStubFrameUniforms } from "@aura3d/rendering/contracts";

describe("C-08-frame-uniforms symbols", () => {
  it("contract surface is present on the stub", () => {
    expect(AURA_FRAME_BLOCK).toBeDefined();
    expect(createStubFrameUniforms).toBeDefined();
  });
});
