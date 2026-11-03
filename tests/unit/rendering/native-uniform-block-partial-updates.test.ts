import { describe, expect, it } from "vitest";
import { MockRenderDevice, type RenderBuffer } from "../../../packages/rendering/src/RenderDevice";
import { UniformBlock } from "../../../packages/rendering/src/resources/UniformBlock";

class TrackingDevice extends MockRenderDevice {
  generation = 1;
  readonly uploads: { offset: number; bytes: Uint8Array }[] = [];
  readonly lost = new Set<() => void>();
  readonly restored = new Set<() => void>();
  failAfterWrite = false;
  duringWrite: (() => void) | undefined;

  onDeviceLost(listener: () => void): () => void {
    this.lost.add(listener);
    return () => { this.lost.delete(listener); };
  }

  onDeviceRestored(listener: () => void): () => void {
    this.restored.add(listener);
    return () => { this.restored.delete(listener); };
  }

  override updateBuffer(buffer: RenderBuffer, offset: number, data: ArrayBufferView): void {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
    this.uploads.push({ offset, bytes });
    super.updateBuffer(buffer, offset, data);
    this.duringWrite?.();
    if (this.failAfterWrite) {
      this.failAfterWrite = false;
      throw new Error("injected failure after write");
    }
  }
}

const fields = [["value", "float"], ["color", "vec4"], ["matrix", "mat4"]] as const;
const ranges = (device: TrackingDevice): number[][] => device.uploads.map(({ offset, bytes }) => [offset, bytes.length]);

describe("uniform block partial uploads", () => {
  it("initializes the whole buffer, then uploads aligned changed ranges including direct data edits", () => {
    const device = new TrackingDevice();
    const block = new UniformBlock(device, "Example", fields, { trackPartialUpdates: true });
    block.upload();
    expect(ranges(device)).toEqual([[0, block.layout.byteSize]]);
    block.upload();
    expect(device.uploads).toHaveLength(1);

    block.set("color", [1, 2, 3, 4]);
    block.upload();
    expect(ranges(device).at(-1)).toEqual([16, 16]);
    block.data[6] = 7.25;
    block.upload();
    expect(ranges(device).at(-1)).toEqual([24, 4]);

    // Compare exact bits, not floating-point equality (including NaN payloads).
    const words = new Uint32Array(block.data.buffer);
    words[0] = 0x7fc00001;
    words[8] = 0x7fc00002;
    block.upload();
    expect(ranges(device).at(-1)).toEqual([0, 36]);
    expect(device.readBuffer(block.buffer)).toEqual(new Uint8Array(block.data.buffer));
    block.dispose();
  });

  it("preserves legacy full uploads and permits callers to restore an externally changed buffer", () => {
    const device = new TrackingDevice();
    const block = new UniformBlock(device, "Legacy", fields);
    block.set("value", 3);
    block.upload();
    device.updateBuffer(block.buffer, 0, new Uint8Array([0, 0, 0, 0]));
    block.upload();
    block.upload();
    expect(ranges(device)).toEqual([[0, block.layout.byteSize], [0, 4], [0, block.layout.byteSize], [0, block.layout.byteSize]]);
    expect(new DataView(device.readBuffer(block.buffer).buffer).getFloat32(0, true)).toBe(3);
    block.dispose();
  });

  it("rewrites a whole tracked buffer after explicit invalidation or a failed partial write", () => {
    const device = new TrackingDevice();
    const block = new UniformBlock(device, "Owned", fields, { trackPartialUpdates: true });
    block.set("value", 3);
    block.upload();
    device.updateBuffer(block.buffer, 0, new Uint8Array([0, 0, 0, 0]));
    block.invalidateUploadCache();
    block.upload();
    expect(ranges(device).at(-1)).toEqual([0, block.layout.byteSize]);
    block.set("color", [1, 0, 0, 0]);
    device.failAfterWrite = true;
    expect(() => block.upload()).toThrow("injected failure after write");
    expect(ranges(device).at(-1)).toEqual([16, 4]);
    block.upload();
    expect(ranges(device).at(-1)).toEqual([0, block.layout.byteSize]);
    expect(device.readBuffer(block.buffer)).toEqual(new Uint8Array(block.data.buffer));
    block.dispose();
  });

  it("invalidates on lifecycle events and generation changes, detects loss, and unregisters listeners", () => {
    const device = new TrackingDevice();
    const block = new UniformBlock(device, "Recovery", fields, { trackPartialUpdates: true });
    block.set("value", 5);
    block.upload();
    device.contextLost = true;
    for (const listener of device.lost) listener();
    expect(() => block.upload()).toThrow();
    device.contextLost = false;
    device.generation += 1;
    for (const listener of device.restored) listener();
    block.upload();
    expect(ranges(device).at(-1)).toEqual([0, block.layout.byteSize]);
    device.generation += 1;
    block.upload();
    expect(ranges(device).at(-1)).toEqual([0, block.layout.byteSize]);
    block.dispose();
    expect(device.lost.size).toBe(0);
    expect(device.restored.size).toBe(0);
    expect(block.buffer.disposed).toBe(true);
    expect(() => block.upload()).toThrow(/disposed/);
  });

  it("falls back to full writes when a device has no generation or lifecycle events", () => {
    const device = new MockRenderDevice();
    const calls: number[][] = [];
    const write = device.updateBuffer.bind(device);
    device.updateBuffer = (buffer, offset, data) => { calls.push([offset, data.byteLength]); write(buffer, offset, data); };
    const block = new UniformBlock(device, "UnknownLifecycle", fields, { trackPartialUpdates: true });
    block.upload();
    block.upload();
    expect(calls).toEqual([[0, block.layout.byteSize], [0, block.layout.byteSize]]);
    block.dispose();
  });

  it("protects a write from reentrancy and detects staging mutations made during the call", () => {
    const device = new TrackingDevice();
    const block = new UniformBlock(device, "Reentry", fields, { trackPartialUpdates: true });
    block.upload();
    block.set("color", [1, 0, 0, 0]);
    device.duringWrite = () => {
      expect(() => block.upload()).toThrow(/reentrant/);
      block.data[0] = 7;
    };
    block.upload();
    device.duringWrite = undefined;
    block.upload();
    expect(ranges(device).slice(-2)).toEqual([[16, 4], [0, 4]]);
    expect(device.readBuffer(block.buffer)).toEqual(new Uint8Array(block.data.buffer));
    block.dispose();
  });

  it("does not trust a successful write if the device generation changed during the call", () => {
    const device = new TrackingDevice();
    const block = new UniformBlock(device, "ChangedDevice", fields, { trackPartialUpdates: true });
    block.upload();
    block.set("value", 3);
    device.duringWrite = () => { device.generation += 1; };
    block.upload();
    device.duringWrite = undefined;
    block.upload();
    expect(ranges(device).slice(-2)).toEqual([[0, 4], [0, block.layout.byteSize]]);
    block.dispose();
  });

  it("releases already-registered resources if lifecycle registration fails", () => {
    const device = new TrackingDevice();
    const allocated: RenderBuffer[] = [];
    const create = device.createBuffer.bind(device);
    device.createBuffer = (...args) => { const buffer = create(...args); allocated.push(buffer); return buffer; };
    device.onDeviceRestored = () => { throw new Error("registration failed"); };
    expect(() => new UniformBlock(device, "NoLeak", fields, { trackPartialUpdates: true })).toThrow("registration failed");
    expect(device.lost.size).toBe(0);
    expect(allocated).toHaveLength(1);
    expect(allocated[0].disposed).toBe(true);
  });
});
