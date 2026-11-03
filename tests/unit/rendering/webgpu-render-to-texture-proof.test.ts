import { describe, expect, it } from "vitest";
import { createRenderDevice, runWebGPURenderToTextureProof } from "../../../packages/rendering/src";
import { createProofWebGPU } from "./webgpu-rtt-mock";

describe("WebGPU render-to-texture proof", () => {
  it("renders an offscreen triangle and reads the native presentation-copy target", async () => {
    const mock = createProofWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: mock.webgpu });
    try {
      const proof = await runWebGPURenderToTextureProof(device, { width: 24, height: 24, label: "unit-webgpu-rtt" });
      expect(proof.backend).toBe("webgpu");
      expect(proof.presentation).toBe("offscreen-copy");
      expect(proof.renderTargetFormat).toBe("rgba8");
      expect(proof.hasDepthTexture).toBe(true);
      expect(proof.drawCalls).toBe(1);
      expect(proof.targetPixel).toEqual([26, 204, 51, 255]);
      expect(proof.presentedPixel).toEqual([26, 204, 51, 255]);
      expect(proof.readbackMatchesPresentation).toBe(true);
      expect(proof.targetPixels.byteLength).toBe(24 * 24 * 4);
      expect(Array.from(proof.targetPixels.slice(0, 4))).toEqual([5, 6, 9, 255]);
      expect(proof.diagnosticsBeforeDispose.renderTargets).toBe(2);
      expect(proof.diagnosticsBeforeDispose.textures).toBe(2);
      expect(proof.disposedRenderTargets).toBeGreaterThanOrEqual(2);
      expect(proof.disposedTextures).toBeGreaterThanOrEqual(3);
      expect(mock.modules.some((code) => code.includes("@vertex fn vs_main"))).toBe(true);
      expect(mock.modules.some((code) => code.includes("return aura.u_color"))).toBe(true);
      expect(mock.events.indexOf("triangle")).toBeLessThan(mock.events.indexOf("presentation-copy"));
    } finally { device.dispose(); }
    expect(device.disposed).toBe(true);
  });

  it("rejects non-WebGPU devices so proof evidence cannot come from a fallback backend", () => {
    const device = new (class { readonly kind = "mock" as const; })();
    expect(() => runWebGPURenderToTextureProof(device as never)).toThrow(/requires a WebGPU render device/);
  });
});
