import { afterEach, describe, expect, it, vi } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { applyMorphTargets, createMorphTargetBuffers, type MorphTargetDelta } from "../../../packages/rendering/src/MorphTarget";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";

function sourceGeometry() {
  const format = new VertexFormat([
    { semantic: "position", components: 3, offset: 0 },
    { semantic: "uv", components: 2, offset: 0, bufferSlot: 1 }
  ], 12, [{ slot: 1, stride: 8 }]);
  const vertices = new VertexBuffer(format, 3);
  const uvs = new VertexBuffer(format, 3, 1);
  vertices.setAttribute(0, "position", [0, 0, 0]);
  vertices.setAttribute(1, "position", [1, 0, 0]);
  vertices.setAttribute(2, "position", [0, 1, 0]);
  uvs.setAttribute(0, "uv", [0, 0]);
  uvs.setAttribute(1, "uv", [1, 0]);
  uvs.setAttribute(2, "uv", [0, 1]);
  const indices = new IndexBuffer([0, 1, 2], 3, "uint32");
  return { vertices, uvs, indices, geometry: new Geometry(vertices, indices, "triangles", undefined, [uvs]) };
}

function caught(callback: () => unknown): unknown {
  try { callback(); return undefined; } catch (error) { return error; }
}

afterEach(() => { vi.restoreAllMocks(); });

describe("morph construction cleanup", () => {
  it("releases earlier allocated streams if a later source lookup fails, preserving that error", () => {
    const source = sourceGeometry();
    const failure = new Error("second source stream unavailable");
    const getVertexBuffer = source.geometry.getVertexBuffer;
    vi.spyOn(source.geometry, "getVertexBuffer").mockImplementation((slot) => {
      if (slot === 1) throw failure;
      return getVertexBuffer.call(source.geometry, slot);
    });
    const released: VertexBuffer[] = [];
    const dispose = VertexBuffer.prototype.dispose;
    vi.spyOn(VertexBuffer.prototype, "dispose").mockImplementation(function (this: VertexBuffer) {
      released.push(this);
      dispose.call(this);
      if (this !== source.vertices && this !== source.uvs) throw new Error("cleanup failed");
    });

    expect(caught(() => createMorphTargetBuffers(source.geometry))).toBe(failure);
    expect(released).toHaveLength(1);
    expect(released[0]).not.toBe(source.vertices);
    expect(() => released[0]!.readBytes()).toThrow(/disposed/i);
    expect(source.vertices.getAttribute(1, "position")).toEqual([1, 0, 0]);
    expect(source.uvs.getAttribute(1, "uv")).toEqual([1, 0]);
    vi.restoreAllMocks();
    source.geometry.dispose();
  });

  it("releases all unattached streams and the new index when result construction fails", () => {
    const source = sourceGeometry();
    const failure = new Error("result validation failed");
    const readBytes = VertexBuffer.prototype.readBytes;
    vi.spyOn(VertexBuffer.prototype, "readBytes").mockImplementation(function (this: VertexBuffer, offset?: number, length?: number) {
      if (this !== source.vertices && this !== source.uvs) throw failure;
      return readBytes.call(this, offset, length);
    });
    const releasedVertices: VertexBuffer[] = [];
    const releasedIndices: IndexBuffer[] = [];
    const disposeVertex = VertexBuffer.prototype.dispose;
    const disposeIndex = IndexBuffer.prototype.dispose;
    vi.spyOn(VertexBuffer.prototype, "dispose").mockImplementation(function (this: VertexBuffer) {
      releasedVertices.push(this);
      disposeVertex.call(this);
      if (releasedVertices.length === 1) throw new Error("cleanup failed");
    });
    vi.spyOn(IndexBuffer.prototype, "dispose").mockImplementation(function (this: IndexBuffer) {
      releasedIndices.push(this);
      disposeIndex.call(this);
    });

    expect(caught(() => applyMorphTargets(source.geometry, [], []))).toBe(failure);
    expect(releasedVertices).toHaveLength(2);
    expect(releasedVertices).not.toContain(source.vertices);
    expect(releasedVertices).not.toContain(source.uvs);
    expect(releasedIndices).toHaveLength(1);
    expect(releasedIndices[0]).not.toBe(source.indices);
    expect(() => releasedIndices[0]!.assertReadable()).toThrow(/disposed/i);
    expect(source.indices.data).toEqual(new Uint32Array([0, 1, 2]));
    vi.restoreAllMocks();
    source.geometry.dispose();
  });

  it("releases a constructed result through its geometry owner if metadata transfer fails", () => {
    const source = sourceGeometry();
    const failure = new Error("draw range unavailable");
    Object.defineProperty(source.geometry, "drawRange", { configurable: true, get() { throw failure; } });
    const releasedVertices: VertexBuffer[] = [];
    const releasedIndices: IndexBuffer[] = [];
    const disposeVertex = VertexBuffer.prototype.dispose;
    const disposeIndex = IndexBuffer.prototype.dispose;
    vi.spyOn(VertexBuffer.prototype, "dispose").mockImplementation(function (this: VertexBuffer) {
      releasedVertices.push(this);
      disposeVertex.call(this);
      if (releasedVertices.length === 1) throw new Error("cleanup failed");
    });
    vi.spyOn(IndexBuffer.prototype, "dispose").mockImplementation(function (this: IndexBuffer) {
      releasedIndices.push(this);
      disposeIndex.call(this);
    });

    expect(caught(() => applyMorphTargets(source.geometry, [], []))).toBe(failure);
    expect(releasedVertices).toHaveLength(2);
    expect(releasedIndices).toHaveLength(1);
    expect(releasedIndices[0]).not.toBe(source.indices);
    expect(() => releasedIndices[0]!.assertReadable()).toThrow(/disposed/i);
    expect(source.vertices.getAttribute(2, "position")).toEqual([0, 1, 0]);
    vi.restoreAllMocks();
    source.geometry.dispose();
  });

  it("returns independent successful buffers while preserving index width and shared source ownership", () => {
    const source = sourceGeometry();
    const peer = new Geometry(source.vertices, source.indices, "triangles", undefined, [source.uvs]);
    const delta: MorphTargetDelta = { positions: [[2, 0, 0], [0, 0, 0], [0, 0, 0]] };
    const result = applyMorphTargets(source.geometry, [delta], [1]);
    expect(result.vertexBuffer.getAttribute(0, "position")).toEqual([2, 0, 0]);
    expect(result.getVertexBuffer(1).getAttribute(1, "uv")).toEqual([1, 0]);
    expect(result.indexBuffer?.type).toBe("uint32");
    expect(result.indexBuffer).not.toBe(source.indices);
    result.dispose();
    source.geometry.dispose();
    expect(peer.vertexBuffer.getAttribute(1, "position")).toEqual([1, 0, 0]);
    expect(peer.indexBuffer?.data).toEqual(new Uint32Array([0, 1, 2]));
    peer.dispose();
    expect(() => source.vertices.readBytes()).toThrow(/disposed/i);
    expect(() => source.indices.assertReadable()).toThrow(/disposed/i);
  });
});
