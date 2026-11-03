import { describe, expect, it } from "vitest";
import { TransmissionRenderTarget } from "../../../../packages/rendering/src/TransmissionRenderTarget";
import type { RenderDevice, RenderTarget, RenderTargetDescriptor } from "../../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../../packages/rendering/src/Texture";

function targetDevice() {
  const descriptors: RenderTargetDescriptor[] = [];
  let incomplete = false;
  let failAllocation = false;
  const device = {
    createRenderTarget(descriptor: RenderTargetDescriptor) {
      descriptors.push(descriptor);
      if (failAllocation) throw new Error("allocation failed");
      const colorTexture = new Texture({
        width: descriptor.width, height: descriptor.height, format: descriptor.format,
        renderAttachment: true, mipLevelCount: incomplete ? 1 : descriptor.mipLevelCount
      });
      return {
        width: descriptor.width, height: descriptor.height, colorTexture, disposed: false,
        dispose() { this.disposed = true; colorTexture.dispose(); }
      } as RenderTarget;
    }
  } as RenderDevice;
  return { device, descriptors, setIncomplete: () => { incomplete = true; }, fail: () => { failAllocation = true; } };
}

describe("TransmissionRenderTarget", () => {
  it("requests a complete, single-sample chain and reports the allocated texture levels", () => {
    const fake = targetDevice();
    const target = new TransmissionRenderTarget(fake.device, { width: 1024, height: 512 }, { format: "rgba16f" });
    expect(fake.descriptors[0]).toMatchObject({ width: 1024, height: 512, format: "rgba16f", mipLevelCount: 11, sampleCount: 1, depth: false });
    expect(target.mipCount).toBe(target.texture!.colorTexture.mipLevelCount);
    expect(target.mipCount).toBe(11);
    target.dispose();
    expect(target.texture).toBeUndefined();
    expect(target.mipCount).toBe(0);
  });

  it("preserves the old resource on failed resize and retires it after a successful resize", () => {
    const fake = targetDevice();
    const target = new TransmissionRenderTarget(fake.device, { width: 800, height: 600 });
    const original = target.texture!;
    target.resize(800, 600);
    expect(fake.descriptors).toHaveLength(1);
    target.resize(256, 128);
    expect(original.disposed).toBe(true);
    const replacement = target.texture!;
    expect(target.mipCount).toBe(9);
    fake.fail();
    expect(() => target.resize(128, 64)).toThrow("allocation failed");
    expect(target.texture).toBe(replacement);
    expect(replacement.disposed).toBe(false);
    expect(target.width).toBe(256);
    target.dispose();
    expect(replacement.disposed).toBe(true);
  });

  it("rejects a device that returns base-only storage for a mip request", () => {
    const fake = targetDevice();
    fake.setIncomplete();
    expect(() => new TransmissionRenderTarget(fake.device, { width: 32, height: 16 })).toThrow("requested transmission mip chain");
  });

  it("reallocates a disposed color texture even when the target size is unchanged", () => {
    const fake = targetDevice();
    const target = new TransmissionRenderTarget(fake.device, { width: 4, height: 2 });
    const original = target.texture!;
    original.colorTexture.dispose();
    target.resize(4, 2);
    expect(fake.descriptors).toHaveLength(2);
    expect(target.texture).not.toBe(original);
    expect(original.disposed).toBe(true);
    expect(target.texture!.colorTexture.disposed).toBe(false);
    target.dispose();
  });

  it("rejects invalid dimensions before allocating", () => {
    const fake = targetDevice();
    expect(() => new TransmissionRenderTarget(fake.device, { width: 0, height: 2 })).toThrow();
    expect(fake.descriptors).toHaveLength(0);
  });
});
