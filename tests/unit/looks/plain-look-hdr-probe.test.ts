// N3 plain look: a WebGL2 device without EXT_color_buffer_float cannot allocate the rgba16f target the neutral output
// tone-maps through, so the plain path stays off there and the scene keeps the direct path (no HDR_POSTPROCESS_UNSUPPORTED).
import { afterEach, describe, expect, it, vi } from "vitest";

function fakeDocument(hasFloat: boolean) {
  return {
    createElement: () => ({
      getContext: () => ({ getExtension: (name: string) => (name === "EXT_color_buffer_float" ? (hasFloat ? {} : null) : { loseContext() {} }) })
    })
  };
}

describe("plain look HDR probe", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("stays off on a WebGL2 device without float colour buffers", async () => {
    vi.stubGlobal("document", fakeDocument(false));
    const { plainLookEnabled } = await import("../../../packages/engine/src/agent-api/looks/plainLook.js");
    expect(plainLookEnabled()).toBe(false);
  });

  it("stays on when the device has float colour buffers", async () => {
    vi.stubGlobal("document", fakeDocument(true));
    const { plainLookEnabled } = await import("../../../packages/engine/src/agent-api/looks/plainLook.js");
    expect(plainLookEnabled()).toBe(true);
  });
});
