/**
 * setScene remount (D1-02): the module-level water GPU state outlives the scene when the water record does. A new device
 * can draw it before the old device's buffers are disposed, so the grid must follow the device that owns the buffers.
 */
import { describe, expect, it } from "vitest";
import { ensureWaterGrid } from "../../../packages/engine/src/production-runtime/world/WaterRuntime";
import type { RenderDevice } from "../../../packages/rendering/src/RenderDevice";

function fakeDevice() {
  const created: Array<{ disposed: boolean }> = [];
  const device = {
    createBuffer: () => {
      const buffer = { disposed: false, dispose() { this.disposed = true; } };
      created.push(buffer);
      return buffer;
    }
  } as unknown as RenderDevice;
  return { device, created };
}

function waterState() {
  const record = { node: { id: "water-1" }, options: { shape: { kind: "circle", radius: 4, center: [0, 0] } } };
  return {
    record, vb: null, ib: null, vertexCount: 0, indexCount: 0, extent: 0, centerX: 0, centerZ: 0,
    normalTex: null, foamTex: null, causticTex: null
  } as unknown as Parameters<typeof ensureWaterGrid>[1];
}

describe("water grid buffers follow the drawing device", () => {
  it("keeps the grid on one device, rebuilds after disposal, and rebuilds for a different still-live device", () => {
    const a = fakeDevice();
    const b = fakeDevice();
    const st = waterState();
    expect(ensureWaterGrid(a.device, st)).toBe(true);
    const first = st.vb;
    expect(a.created).toHaveLength(2);
    ensureWaterGrid(a.device, st);
    expect(st.vb).toBe(first);
    expect(a.created).toHaveLength(2);

    // New device while the old buffers are still undisposed: must not reuse them.
    ensureWaterGrid(b.device, st);
    expect(b.created).toHaveLength(2);
    expect(st.vb).toBe(b.created[0]);
    expect(st.vb).not.toBe(first);

    // Disposed buffers on the same device are rebuilt.
    b.created.forEach((buffer) => buffer.disposed = true);
    ensureWaterGrid(b.device, st);
    expect(b.created).toHaveLength(4);
    expect(st.vb!.disposed).toBe(false);
  });
});
