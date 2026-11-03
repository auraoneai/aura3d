import { afterEach, describe, expect, it, vi } from "vitest";
import { createQrPrimitiveMesh } from "../../../packages/engine/src/agent-api/compiler/geometry";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { clearPrimitiveGeometryCache, createPrimitiveGeometry, primitiveGeometryCacheSize } from "../../../packages/rendering/src/geometry/Primitives";

const full = { primitiveSegments: "full" as const };

afterEach(() => {
  clearPrimitiveGeometryCache();
  vi.restoreAllMocks();
});

describe("primitive geometry ownership", () => {
  it("isolates mutable vertex, index, bounds, format and group data across equal requests", () => {
    const a = createPrimitiveGeometry("cone", undefined, full);
    const b = createPrimitiveGeometry("cone", undefined, full);
    const originalPosition = b.vertexBuffer.getAttribute(0, "position");
    const originalIndex = b.indexBuffer!.data[0];
    const originalMin = b.bounds.min[0];
    const originalOffset = b.vertexBuffer.format.attributes[0]!.offset;
    const originalGroup = b.groups![0]!.count;

    expect(a).not.toBe(b);
    expect(a.vertexBuffer).not.toBe(b.vertexBuffer);
    expect(a.indexBuffer).not.toBe(b.indexBuffer);
    expect(primitiveGeometryCacheSize()).toBe(1);
    a.vertexBuffer.setAttribute(0, "position", [8, 9, 10]);
    a.indexBuffer!.setIndices(0, [1]);
    (a.bounds.min as unknown as number[])[0] = -999;
    Object.assign(a.vertexBuffer.format.attributes[0]!, { offset: 4 });
    Object.assign(a.groups![0]!, { count: 0 });
    expect(b.vertexBuffer.getAttribute(0, "position")).toEqual(originalPosition);
    expect(b.indexBuffer!.data[0]).toBe(originalIndex);
    expect(b.bounds.min[0]).toBe(originalMin);
    expect(b.vertexBuffer.format.attributes[0]!.offset).toBe(originalOffset);
    expect(b.groups![0]!.count).toBe(originalGroup);

    const c = createPrimitiveGeometry("cone", undefined, full);
    expect(c.vertexBuffer.getAttribute(0, "position")).toEqual(originalPosition);
    expect(c.indexBuffer!.data[0]).toBe(originalIndex);
    expect(c.bounds.min[0]).toBe(originalMin);
    expect(c.vertexBuffer.format.attributes[0]!.offset).toBe(originalOffset);
    expect(c.groups![0]!.count).toBe(originalGroup);
    a.dispose(); b.dispose(); c.dispose();
  });

  it("does not retire another consumer's device buffers when one geometry is disposed", () => {
    const device = new MockRenderDevice();
    const a = createPrimitiveGeometry("box", undefined, full);
    const b = createPrimitiveGeometry("box", undefined, full);
    const aVertices = a.uploadVertexBuffers(device)[0]!;
    const aIndices = a.indexBuffer!.upload(device);
    const bVertices = b.uploadVertexBuffers(device)[0]!;
    const bIndices = b.indexBuffer!.upload(device);

    a.dispose();
    expect(aVertices.disposed).toBe(true);
    expect(aIndices.disposed).toBe(true);
    expect(bVertices.disposed).toBe(false);
    expect(bIndices.disposed).toBe(false);
    expect(b.uploadVertexBuffers(device)[0]).toBe(bVertices);
    expect(b.indexBuffer!.upload(device)).toBe(bIndices);
    const next = createPrimitiveGeometry("box", undefined, full);
    expect(next.vertexBuffer.getAttribute(0, "position")).toEqual(b.vertexBuffer.getAttribute(0, "position"));
    b.dispose(); next.dispose(); device.dispose();
  });

  it("clears only cached templates and leaves existing geometry and uploads alive", () => {
    const device = new MockRenderDevice();
    const existing = createPrimitiveGeometry("box", undefined, full);
    const uploaded = existing.uploadVertexBuffers(device)[0]!;
    expect(primitiveGeometryCacheSize()).toBe(1);
    clearPrimitiveGeometryCache();
    expect(primitiveGeometryCacheSize()).toBe(0);
    expect(uploaded.disposed).toBe(false);
    expect(existing.uploadVertexBuffers(device)[0]).toBe(uploaded);
    const fresh = createPrimitiveGeometry("box", undefined, full);
    expect(fresh.vertexBuffer.getAttribute(0, "position")).toEqual(existing.vertexBuffer.getAttribute(0, "position"));
    expect(primitiveGeometryCacheSize()).toBe(1);
    existing.dispose(); fresh.dispose(); device.dispose();
  });

  it("bounds cached templates and evicts least-recently-used entries", () => {
    const build = vi.spyOn(Geometry, "box");
    for (let width = 1; width <= 128; width += 1) {
      createPrimitiveGeometry("box", { widthSegments: width }, full).dispose();
    }
    expect(primitiveGeometryCacheSize()).toBe(128);
    createPrimitiveGeometry("box", { widthSegments: 1 }, full).dispose();
    createPrimitiveGeometry("box", { widthSegments: 129 }, full).dispose();
    expect(build).toHaveBeenCalledTimes(129);
    expect(primitiveGeometryCacheSize()).toBe(128);
    createPrimitiveGeometry("box", { widthSegments: 1 }, full).dispose();
    expect(build).toHaveBeenCalledTimes(129);
    createPrimitiveGeometry("box", { widthSegments: 2 }, full).dispose();
    expect(build).toHaveBeenCalledTimes(130);
    expect(primitiveGeometryCacheSize()).toBe(128);
  });

  it("keeps the app compiler's built-in primitive data valid after public disposal", () => {
    const external = createPrimitiveGeometry("box", undefined, full);
    const expected = external.vertexBuffer.getAttribute(0, "position");
    external.dispose();
    const mesh = createQrPrimitiveMesh("box", [1, 1, 1], { core: true, primitiveSegments: "full" });
    expect(Array.from(mesh.positions.slice(0, 3))).toEqual(expected);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });
});
