import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MockRenderDevice, type RenderTargetDescriptor } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";

describe("renderer HDR depth fallback", () => {
  it.each([false, true])("uses a 1x sampleable depth target and reports the missing MSAA contract (async=%s)", async asynchronous => {
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_OUTPUT: true });
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    // This mock records commands only; the kind exercises the WebGPU route's
    // allocation policy without claiming native rendering or depth pixels.
    Object.defineProperty(device, "kind", { configurable: true, value: "webgpu" });
    Object.defineProperty(device.info, "capabilities", { configurable: true, value: [...(device.info.capabilities ?? []), "hdr-render-targets"] });
    Object.defineProperty(device, "drawChecked", { configurable: true, value: device.draw.bind(device) });
    const create = device.createRenderTarget.bind(device), descriptors: RenderTargetDescriptor[] = [];
    const spy = vi.spyOn(device, "createRenderTarget").mockImplementation(descriptor => {
      descriptors.push(descriptor);
      if (descriptor.depth === "texture" && (descriptor.sampleCount ?? 1) > 1) throw new Error("unsupported multisampled sampleable depth");
      return create(descriptor);
    });
    renderer.setRenderScaleCeiling(0.5);
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    try {
      const input = { source: { cameraPolicy: "identity" as const, renderItems: [{ geometry, material }] }, frameId: 1 };
      if (asynchronous) await renderer.renderAsync(input); else renderer.render(input);
      const target = descriptors.find(entry => entry.label === "renderer-hdr-scene");
      expect(target).toMatchObject({ width: 2, height: 2, depth: "texture", sampleCount: 1 });
      expect(renderer.appliedOutput?.degraded).toBe("hdr-msaa-depth-unsupported");
    } finally { spy.mockRestore(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });
});
