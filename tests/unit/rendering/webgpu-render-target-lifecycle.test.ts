import { describe, expect, it } from "vitest";
import { createRenderDevice, runWebGPURenderToTextureProof } from "../../../packages/rendering/src";
import { createProofWebGPU } from "./webgpu-rtt-mock";

describe("WebGPU render target lifecycle", () => {
  it("creates, reads, copies, and disposes WebGPU render targets", async () => {
    const mock = createProofWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: mock.webgpu });
    try {
      const proof = await runWebGPURenderToTextureProof(device, { width: 16, height: 16, label: "unit-webgpu-lifecycle" });
      expect(proof.backend).toBe("webgpu");
      expect(proof.presentation).toBe("offscreen-copy");
      expect(proof.targetPixel).toEqual([26, 204, 51, 255]);
      expect(proof.presentedPixel).toEqual(proof.targetPixel);
      expect(proof.readbackMatchesPresentation).toBe(true);
      expect(proof.diagnosticsBeforeDispose.renderTargets).toBe(2);
      expect(proof.disposedRenderTargets).toBeGreaterThanOrEqual(2);
      expect(proof.disposedTextures).toBeGreaterThanOrEqual(3);
      expect(mock.events).toContain("triangle");
      expect(mock.events).toContain("presentation-copy");
      expect(mock.events.filter((event) => event === "copy-readback")).toHaveLength(3);
    } finally { device.dispose(); }
    expect(device.disposed).toBe(true);
  });
});
