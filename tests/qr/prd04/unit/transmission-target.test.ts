/**
 * TransmissionRenderTarget (PRD-04 §7.3, P1-8): mip chain contract
 * (`floor(log2(max(w,h))) + 1`), resize reallocates only on real size
 * change, and dispose releases the device target.
 */
import { describe, expect, it } from "vitest";
import { TransmissionRenderTarget } from "../../../../packages/rendering/src/TransmissionRenderTarget";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";

describe("TransmissionRenderTarget", () => {
  it("computes a full mip chain: floor(log2(max(w,h))) + 1", () => {
    const device = new MockRenderDevice();
    const t = new TransmissionRenderTarget(device, { width: 1024, height: 512 });
    expect(t.mipCount).toBe(Math.floor(Math.log2(1024)) + 1); // 11
    expect(t.texture?.width).toBe(1024);
    t.dispose();
    expect(t.texture).toBeUndefined();
    expect(t.mipCount).toBe(0);
  });

  it("resize keeps the same target when dimensions don't change", () => {
    const device = new MockRenderDevice();
    const t = new TransmissionRenderTarget(device, { width: 800, height: 600 });
    const before = t.texture;
    t.resize(800, 600);
    expect(t.texture).toBe(before);
    expect(t.mipCount).toBe(Math.floor(Math.log2(800)) + 1); // 10
    t.dispose();
  });

  it("resize reallocates and re-disposes the old target on change", () => {
    const device = new MockRenderDevice();
    const t = new TransmissionRenderTarget(device, { width: 512, height: 512 });
    const before = t.texture!;
    t.resize(256, 256);
    expect(t.texture).not.toBe(before);
    expect(before.disposed).toBe(true);
    expect(t.mipCount).toBe(9);
    t.dispose();
  });
});
