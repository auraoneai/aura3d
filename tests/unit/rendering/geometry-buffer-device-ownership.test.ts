/**
 * setScene remount: the old device is released after its in-flight frame, so a shared Geometry can be uploaded to the
 * new device while the old device's buffers are still undisposed. A buffer owned by another device must be recreated
 * ("Buffer is not a live WebGL2 resource owned by this device", Aura Links 3D course switch).
 */
import { describe, expect, it } from "vitest";

import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import type { RenderDevice } from "../../../packages/rendering/src/RenderDevice";

function fakeDevice(): { device: RenderDevice; created: unknown[] } {
  const created: unknown[] = [];
  const device = {
    createBuffer: () => {
      const buffer = { id: created.length + 1, disposed: false, dispose() { this.disposed = true; } };
      created.push(buffer);
      return buffer;
    },
    updateBuffer: () => undefined
  } as unknown as RenderDevice;
  return { device, created };
}

describe("geometry buffers follow the uploading device", () => {
  it("reuses the GPU buffer on the same device and recreates it for a different, still-live device", () => {
    const a = fakeDevice();
    const b = fakeDevice();
    const vertices = new VertexBuffer(VertexFormat.P3, 3);
    const indices = new IndexBuffer(new Uint16Array([0, 1, 2]));

    const va = vertices.upload(a.device);
    const ia = indices.upload(a.device);
    expect(vertices.upload(a.device)).toBe(va);
    expect(indices.upload(a.device)).toBe(ia);

    const vb = vertices.upload(b.device);
    const ib = indices.upload(b.device);
    expect(vb).not.toBe(va);
    expect(ib).not.toBe(ia);
    expect(b.created).toContain(vb);
    expect(b.created).toContain(ib);
    expect(vertices.upload(b.device)).toBe(vb);
  });
});
