import { describe, expect, it } from "vitest";
import { resolveProductionCameraDepth } from "../../../packages/engine/src/agent-api/compiler/cameraDepth.js";

describe("infinite far plane diagnostic", () => {
  it("rejects an infinite far plane in production with a typed CAMERA_INFINITE_FAR_UNSUPPORTED code", () => {
    let caught: unknown;
    try {
      resolveProductionCameraDepth({ mode: "perspective", near: 0.1, far: Infinity, depth: { mode: "reversed" } } as never);
    } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(RangeError);
    expect((caught as { code?: string }).code).toBe("CAMERA_INFINITE_FAR_UNSUPPORTED");
    expect((caught as Error).message).toMatch(/finite far clipping/);
  });
});
