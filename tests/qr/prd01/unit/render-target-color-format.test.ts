/**
 * Lane-01 regression (GPU run 38190015020): a single `colorAttachments` entry
 * is the attachment-0 format of a 2d render target. The WebGL2 2d path read
 * only the legacy `format`, so `createHdrTarget` without coverage
 * ({ format: "rgba8", colorAttachments: [{ format: "rgba16f" }] }) allocated an
 * RGBA8 scene target (device-level ACES of linear 4.0 gave 226 vs three 250).
 */

import { describe, expect, it } from "vitest";

import { renderTargetColorFormat } from "../../../../packages/rendering/src/WebGL2Device";
import { createHdrTarget } from "../../../../packages/rendering/src/output/HdrTarget";
import { MockRenderDevice, type RenderTargetDescriptor } from "../../../../packages/rendering/src/RenderDevice";

describe("render-target attachment-0 color format", () => {
  it("colorAttachments[0].format wins over the legacy format", () => {
    expect(renderTargetColorFormat({ format: "rgba8", colorAttachments: [{ format: "rgba16f" }] })).toBe("rgba16f");
    expect(renderTargetColorFormat({ colorAttachments: [{ format: "rgba32f" }] })).toBe("rgba32f");
  });

  it("falls back to format, then rgba8", () => {
    expect(renderTargetColorFormat({ format: "rgba16f" })).toBe("rgba16f");
    expect(renderTargetColorFormat({})).toBe("rgba8");
  });

  it("createHdrTarget (no coverage) resolves to a float attachment 0 when the device has float targets", () => {
    const device = new MockRenderDevice();
    (device.info as unknown as { capabilities: string[] }).capabilities = [...(device.info.capabilities ?? []), "hdr-render-targets"];
    const seen: RenderTargetDescriptor[] = [];
    const create = device.createRenderTarget.bind(device);
    (device as { createRenderTarget: typeof create }).createRenderTarget = (descriptor) => {
      seen.push(descriptor);
      return create(descriptor);
    };
    createHdrTarget(device, { width: 8, height: 8 });
    expect(seen).toHaveLength(1);
    expect(renderTargetColorFormat(seen[0]!)).toBe("rgba16f");
  });
});
