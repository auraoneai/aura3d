import { describe, expect, it } from "vitest";
import { MockRenderDevice, VertexBuffer, VertexFormat, type RenderBuffer } from "../../../packages/rendering/src";

describe("VertexBuffer", () => {
  it("writes interleaved CPU attributes at explicit byte offsets", () => {
    const buffer = new VertexBuffer(VertexFormat.P3N3T2, 1);

    buffer.setAttribute(0, "position", [1, 2, 3]);
    buffer.setAttribute(0, "normal", [0, 1, 0]);
    buffer.setAttribute(0, "uv", [0.25, 0.75]);

    expect(buffer.getAttribute(0, "position")).toEqual([1, 2, 3]);
    expect(buffer.getAttribute(0, "normal")).toEqual([0, 1, 0]);
    expect(buffer.getAttribute(0, "uv")).toEqual([0.25, 0.75]);
  });

  it("uploads and reads back bytes through the mock render device", () => {
    const device = new MockRenderDevice();
    const buffer = new VertexBuffer(VertexFormat.P3, 1);
    buffer.setAttribute(0, "position", [3, 4, 5]);

    const gpuBuffer = buffer.upload(device);
    const readback = new Float32Array(device.readBuffer(gpuBuffer).buffer);

    expect(Array.from(readback)).toEqual([3, 4, 5]);
  });

  it("uploads only dirty ranges after initial upload", () => {
    const device = new MockRenderDevice();
    const buffer = new VertexBuffer(VertexFormat.P3, 2);
    buffer.upload(device);

    buffer.setAttribute(1, "position", [9, 8, 7]);

    expect(buffer.getDirtyRange()).toEqual({ start: 12, end: 24 });
    buffer.upload(device);
    expect(buffer.getDirtyRange()).toBeNull();
  });

  it("does not re-upload static vertex data when nothing changed", () => {
    const device = new CountingMockRenderDevice();
    const buffer = new VertexBuffer(VertexFormat.P3, 1);
    buffer.setAttribute(0, "position", [1, 2, 3]);

    const first = buffer.upload(device);
    const second = buffer.upload(device);
    const third = buffer.upload(device);

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(device.createBufferCount).toBe(1);
    expect(device.updateBufferCount).toBe(0);
    expect(buffer.getDirtyRange()).toBeNull();
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
