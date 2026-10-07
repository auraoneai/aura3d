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
    const flagsOff = resolveQrFlags({});
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
});
