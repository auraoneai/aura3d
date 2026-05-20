import { describe, expect, it } from "vitest";
import { IndexBuffer, MockRenderDevice, type RenderBuffer } from "../../../packages/rendering/src";

describe("IndexBuffer", () => {
  it("uploads static index data once and reuses the GPU buffer", () => {
    const device = new CountingMockRenderDevice();
    const buffer = new IndexBuffer([0, 1, 2], 3);

    const first = buffer.upload(device);
    const second = buffer.upload(device);
    const third = buffer.upload(device);

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(device.createBufferCount).toBe(1);
    expect(device.updateBufferCount).toBe(0);
  });
});

class CountingMockRenderDevice extends MockRenderDevice {
  public createBufferCount = 0;
  public updateBufferCount = 0;

  override createBuffer(...args: Parameters<MockRenderDevice["createBuffer"]>): RenderBuffer {
    this.createBufferCount += 1;
    return super.createBuffer(...args);
  }

  override updateBuffer(...args: Parameters<MockRenderDevice["updateBuffer"]>): void {
    this.updateBufferCount += 1;
    super.updateBuffer(...args);
  }
}
