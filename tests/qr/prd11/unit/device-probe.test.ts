import { describe, expect, it } from "vitest";

import { probeWebGL2Device } from "../../../../packages/rendering/src/quality/DeviceProbe";

const DEBUG_INFO = { UNMASKED_RENDERER_WEBGL: 0x9245, UNMASKED_VENDOR_WEBGL: 0x9246 };

function fakeGl(extensions: Record<string, unknown> = {}): WebGL2RenderingContext {
  const params = new Map<number, unknown>([
    [0x1f01 /* RENDERER */, "ANGLE (test)"],
    [0x0d33 /* MAX_TEXTURE_SIZE */, 16384],
    [0x8d57 /* MAX_SAMPLES */, 4],
    [DEBUG_INFO.UNMASKED_RENDERER_WEBGL, "Fake GPU 9000"],
    [DEBUG_INFO.UNMASKED_VENDOR_WEBGL, "FakeVendor"]
  ]);
  return {
    RENDERER: 0x1f01,
    MAX_TEXTURE_SIZE: 0x0d33,
    MAX_SAMPLES: 0x8d57,
    getParameter: (pname: number) => params.get(pname) ?? null,
    getExtension: (name: string) => extensions[name] ?? null
  } as unknown as WebGL2RenderingContext;
}

describe("probeWebGL2Device (C-28, prd11)", () => {
  it("fills every probe field from the GL and injected env", () => {
    const probe = probeWebGL2Device(fakeGl({
      WEBGL_debug_renderer_info: DEBUG_INFO,
      EXT_color_buffer_float: {},
      WEBGL_multi_draw: {},
      KHR_parallel_shader_compile: {},
      EXT_disjoint_timer_query_webgl2: {}
    }), {
      navigator: { hardwareConcurrency: 12, deviceMemory: 16, userAgent: "TestBrowser" },
      screen: { width: 2560, height: 1440 },
      devicePixelRatio: 2,
      coarsePointer: false
    });
    expect(probe).toMatchObject({
      backend: "webgl2",
      rendererString: "ANGLE (test)",
      unmaskedRenderer: "Fake GPU 9000",
      unmaskedVendor: "FakeVendor",
      maxTextureSize: 16384,
      maxSamples: 4,
      floatColorBuffer: true,
      halfFloatColorBuffer: false,
      timerQuery: true,
      parallelShaderCompile: true,
      multiDraw: true,
      devicePixelRatio: 2,
      screen: [2560, 1440],
      hardwareConcurrency: 12,
      deviceMemoryGB: 16,
      mobile: false
    });
  });

  it("mobile detection prefers userAgentData, then coarse pointer, then the UA regex", () => {
    const gl = fakeGl();
    expect(probeWebGL2Device(gl, { navigator: { userAgentData: { mobile: true }, userAgent: "x" }, coarsePointer: false }).mobile).toBe(true);
    expect(probeWebGL2Device(gl, { navigator: { userAgent: "x" }, coarsePointer: true }).mobile).toBe(true);
    expect(probeWebGL2Device(gl, { navigator: { userAgent: "Mozilla/5.0 (iPhone)" } }).mobile).toBe(true);
    expect(probeWebGL2Device(gl, { navigator: { userAgent: "Mozilla/5.0 (X11; Linux x86_64)" } }).mobile).toBe(false);
    expect(probeWebGL2Device(gl, { navigator: {} }).mobile).toBeNull();
  });
});
