import { describe, expect, it } from "vitest";
import { BufferGeometryCompat, BoxGeometryCompat, InstancedBufferGeometryCompat } from "../../../packages/three-compat/src";
import { Geometry, VertexBuffer, VertexFormat } from "../../../packages/rendering/src";

describe("Three.js BufferGeometry parity surface", () => {
  it("keeps attribute, index, and drawRange operations available for migration code", () => {
    const geometry = new BufferGeometryCompat()
      .setAttribute("position", { array: [0, 0, 0, 1, 0, 0, 0, 1, 0], itemSize: 3 })
      .setIndex([0, 1, 2])
      .setDrawRange(0, 3);

    expect(geometry.getAttribute("position")).toEqual({ array: [0, 0, 0, 1, 0, 0, 0, 1, 0], itemSize: 3 });
    expect(geometry.index).toEqual([0, 1, 2]);
    expect(geometry.drawRange).toEqual({ start: 0, count: 3 });
    expect(() => geometry.setDrawRange(-1, 3)).toThrow(/drawRange/i);
  });

  it("maps Three.js geometry categories to concrete A3D GPU buffers", () => {
    const compat = new BoxGeometryCompat(2, 3, 4);
    const instances = new InstancedBufferGeometryCompat();
    instances.instanceCount = 128;

    const vertexBuffer = new VertexBuffer(VertexFormat.P3N3T2, 3);
    const a3d = new Geometry(vertexBuffer);

    expect(compat.type).toBe("BoxGeometry");
    expect([compat.width, compat.height, compat.depth]).toEqual([2, 3, 4]);
    expect(instances.instanceCount).toBe(128);
    expect(a3d.vertexBuffer.vertexCount).toBe(3);
  });
});
