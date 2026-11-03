import { describe, expect, it } from "vitest";
import { MAX_WEBGPU_SKINNING_JOINTS } from "../../../packages/rendering/src";

// T2.1 WebGPU 96-joint skinning parity: the WebGPU palette capacity matches WebGL2 `u_jointMatrices[96]`.
//
// The two pixel cases that rendered a joint-#80 / joint-#95 triangle and read it back with synchronous
// `readPixels` were retired (docs/project/status/retired-tests.md §7): they exercised the WebGPU CPU
// emulation rasterizer and synchronous WebGPU readback that QR-11 Phase 1 deleted (d7de114d3; sync
// readback now throws WEBGPU_SYNC_READBACK_UNSUPPORTED). Native WebGPU skinning is covered by the generated
// bone-texture skin4/skin8 programs in tests/unit/rendering/native-generated-pbr.test.ts.

describe("WebGPU 96-joint skinning parity", () => {
  it("exposes a 96-joint palette capacity (WebGL2 u_jointMatrices[96] parity)", () => {
    expect(MAX_WEBGPU_SKINNING_JOINTS).toBe(96);
  });
});
