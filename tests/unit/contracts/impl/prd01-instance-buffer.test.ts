/**
 * PRD-01 Phase-1 C-07 InstanceBuffer (lane 01): persistent buffer, version
 * bumps on change, partial bufferSubData covering only the written range,
 * doubling growth, `INSTANCE_CAPACITY_EXCEEDED` beyond capacity.
 */

import { describe, expect, it } from "vitest";

import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { InstanceBuffer } from "../../../../packages/rendering/src/resources/InstanceBuffer";
import { instanceBufferSlot } from "../../../../packages/rendering/src/contracts/geometry";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import "../../../../packages/rendering/src/lanes/prd01";

describe("prd01 C-07 InstanceBuffer", () => {
  it("slot.get returns the stub when the flag is off, the real buffer when provided+on", () => {
    const device = new MockRenderDevice();
    const flagsOff = resolveQrFlags({ options: ["-core"] });
    const flagsOn = resolveQrFlags({ env: { A3D_QR_CORE: "v2" } });
    const make = instanceBufferSlot.get(flagsOff);
    const madeOff = make(device, 4);
    expect(madeOff.constructor.name).not.toBe("InstanceBuffer");
    const makeOn = instanceBufferSlot.get(flagsOn);
    expect(makeOn(device, 4)).toBeInstanceOf(InstanceBuffer);
  });

  it("bumps version per write and uploads only the written range", () => {
    const device = new MockRenderDevice();
    const updates: number[] = [];
    const orig = device.updateBuffer.bind(device);
    (device as { updateBuffer: typeof orig }).updateBuffer = (b, off, data) => {
      updates.push(data.byteLength);
      return orig(b, off, data);
    };
    const buf = new InstanceBuffer(device, 64);
    expect(buf.count).toBe(0);
    expect(buf.version).toBe(0);
    buf.setMatrices(new Float32Array(16 * 3).fill(1), 3);
    expect(buf.count).toBe(3);
    expect(buf.version).toBe(1);
    // bufferSubData covers exactly the 3 written matrices, not the capacity array.
    expect(updates.at(-1)).toBe(16 * 3 * 4);
    buf.setMatrices(new Float32Array(16 * 40).fill(2), 40);
    expect(buf.count).toBe(40);
    expect(buf.version).toBe(2);
    expect(updates.at(-1)).toBe(16 * 40 * 4);
  });

  it("grows by doubling and throws INSTANCE_CAPACITY_EXCEEDED past capacity", () => {
    const device = new MockRenderDevice();
    const buf = new InstanceBuffer(device, 64, { colors: true });
    buf.setMatrices(new Float32Array(16 * 20), 20); // 20 > 16 -> allocates 32
    const b1 = buf.bind().matrixBuffer;
    buf.setMatrices(new Float32Array(16 * 40), 40); // 40 > 32 -> allocates 64
    const b2 = buf.bind().matrixBuffer;
    expect(b2).not.toBe(b1); // doubled: fresh device buffer
    expect((b1 as { disposed: boolean }).disposed).toBe(true); // old evicted
    buf.setColors(new Float32Array(4 * 40));
    expect(buf.bind().colorBuffer).toBeDefined();
    expect(() => buf.setMatrices(new Float32Array(16 * 65), 65)).toThrow(/INSTANCE_CAPACITY_EXCEEDED:65>64/);
  });

  it("reuses the same device buffer for repeat writes within allocation", () => {
    const device = new MockRenderDevice();
    const buf = new InstanceBuffer(device, 32);
    buf.setMatrices(new Float32Array(16 * 10), 10);
    const b1 = buf.bind().matrixBuffer;
    buf.setMatrices(new Float32Array(16 * 12), 12);
    expect(buf.bind().matrixBuffer).toBe(b1); // 12 <= 16: no regrowth
  });

  // SI-4 (live-games 4.5.0 audit): the upload skip and the in-place re-upload.
  const counting = () => {
    const device = new MockRenderDevice();
    const updates: number[] = [];
    const orig = device.updateBuffer.bind(device);
    (device as { updateBuffer: typeof orig }).updateBuffer = (b, off, data) => {
      updates.push(data.byteLength);
      return orig(b, off, data);
    };
    return { device, updates };
  };

  it("skips the copy, the upload and the version bump when the same contents are written again", () => {
    const { device, updates } = counting();
    const buf = new InstanceBuffer(device, 64, { colors: true });
    const matrices = new Float32Array(16 * 8).map((_, i) => i);
    const colors = new Float32Array(4 * 8).fill(0.5);
    buf.setMatrices(matrices, 8);
    buf.setColors(colors);
    const version = buf.version;
    const uploads = updates.length;
    // A fresh array with equal contents (the forward pass re-submits static forests every frame) is skipped too.
    buf.setMatrices(Float32Array.from(matrices), 8);
    buf.setColors(Float32Array.from(colors));
    expect(updates.length).toBe(uploads);
    expect(buf.version).toBe(version);
  });

  it("re-uploads when the caller changes the same typed array in place", () => {
    const { device, updates } = counting();
    const buf = new InstanceBuffer(device, 64, { colors: true });
    const matrices = new Float32Array(16 * 4).fill(1);
    const colors = new Float32Array(4 * 4).fill(1);
    buf.setMatrices(matrices, 4);
    buf.setColors(colors);
    const version = buf.version;
    matrices[16 * 3 + 12] = 7; // move the last instance
    colors[2] = 0;
    buf.setMatrices(matrices, 4);
    buf.setColors(colors);
    expect(buf.version).toBe(version + 2);
    expect(updates.slice(-2)).toEqual([16 * 4 * 4, 4 * 4 * 4]);
    const stored = new Float32Array((buf.bind().matrixBuffer as unknown as { bytes: Uint8Array }).bytes.buffer);
    expect(stored[16 * 3 + 12]).toBe(7);
  });

  it("uploads when only the count changes, even if the shared prefix is identical", () => {
    const { device, updates } = counting();
    const buf = new InstanceBuffer(device, 64);
    const matrices = new Float32Array(16 * 10).fill(3);
    buf.setMatrices(matrices, 10);
    const version = buf.version;
    buf.setMatrices(matrices, 6);
    expect(buf.count).toBe(6);
    expect(buf.version).toBe(version + 1);
    expect(updates.at(-1)).toBe(16 * 6 * 4);
  });

  it("uploads into a regrown device buffer even when the CPU copy already matches", () => {
    const { device, updates } = counting();
    const buf = new InstanceBuffer(device, 64);
    const matrices = new Float32Array(16 * 40).fill(2);
    buf.setMatrices(matrices.subarray(0, 16 * 10), 10);
    const small = buf.bind().matrixBuffer;
    // Growing to 40 reallocates; the first 10 matrices are already on the CPU copy, but the new GPU buffer is empty.
    buf.setMatrices(matrices, 40);
    const grown = buf.bind().matrixBuffer;
    expect(grown).not.toBe(small);
    expect(updates.at(-1)).toBe(16 * 40 * 4);
    const stored = new Float32Array((grown as unknown as { bytes: Uint8Array }).bytes.buffer);
    expect(stored[0]).toBe(2);
    expect(stored[16 * 39]).toBe(2);
  });
});
