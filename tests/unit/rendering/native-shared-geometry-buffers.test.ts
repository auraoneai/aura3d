import { describe, expect, it, vi } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";

function sharedTriangle() {
  const vertices = new VertexBuffer(VertexFormat.P3, 3);
  vertices.setAttribute(0, "position", [0, 0, 0]);
  vertices.setAttribute(1, "position", [1, 0, 0]);
  vertices.setAttribute(2, "position", [0, 1, 0]);
  const indices = new IndexBuffer([0, 1, 2], 3);
  return { vertices, indices, first: new Geometry(vertices, indices), second: new Geometry(vertices, indices) };
}

class GenerationDevice extends MockRenderDevice {
  generation = 0;
}

describe("shared geometry buffer ownership", () => {
  it("keeps shared CPU and device buffers alive until the final geometry releases them", () => {
    const { vertices, indices, first, second } = sharedTriangle();
    const device = new MockRenderDevice();
    const vertexResource = vertices.upload(device);
    const indexResource = indices.upload(device);

    first.dispose();
    first.dispose();
    expect(() => first.vertexBuffer).toThrow(/disposed/i);
    expect(() => first.indexBuffer).toThrow(/disposed/i);
    expect(() => first.additionalVertexBuffers).toThrow(/disposed/i);
    expect(vertexResource.disposed).toBe(false);
    expect(indexResource.disposed).toBe(false);
    vertices.setAttribute(1, "position", [4, 5, 6]);
    expect(second.getVertexBuffer(0).getAttribute(1, "position")).toEqual([4, 5, 6]);
    expect(second.uploadVertexBuffers(device)[0]).toBe(vertexResource);
    expect(second.indexBuffer!.upload(device)).toBe(indexResource);

    second.dispose();
    expect(vertexResource.disposed).toBe(true);
    expect(indexResource.disposed).toBe(true);
    expect(() => vertices.readBytes()).toThrow(/disposed/i);
    expect(() => indices.assertReadable()).toThrow(/disposed/i);
    device.dispose();
  });

  it("retains additional streams independently from each primary stream", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "uv", components: 2, offset: 0, bufferSlot: 1 }
    ], 12, [{ slot: 1, stride: 8 }]);
    const shared = new VertexBuffer(format, 3, 1);
    const firstPrimary = new VertexBuffer(format, 3);
    const secondPrimary = new VertexBuffer(format, 3);
    const first = new Geometry(firstPrimary, null, "triangles", undefined, [shared]);
    const second = new Geometry(secondPrimary, null, "triangles", undefined, [shared]);
    first.dispose();
    expect(() => firstPrimary.readBytes()).toThrow(/disposed/i);
    shared.setAttribute(0, "uv", [0.25, 0.75]);
    expect(second.getVertexBuffer(1).getAttribute(0, "uv")).toEqual([0.25, 0.75]);
    second.dispose();
    expect(() => shared.readBytes()).toThrow(/disposed/i);
    expect(() => secondPrimary.readBytes()).toThrow(/disposed/i);
  });

  it("does not acquire or destroy existing buffers when construction fails", () => {
    const { vertices, indices, first, second } = sharedTriangle();
    const deadIndex = new IndexBuffer([0], 3);
    deadIndex.dispose();
    expect(() => new Geometry(vertices, deadIndex, "triangles", { min: [0, 0, 0], max: [1, 1, 1] })).toThrow(/disposed/i);
    const badStream = new VertexBuffer(VertexFormat.P3, 3);
    expect(() => new Geometry(vertices, indices, "triangles", undefined, [badStream])).toThrow(/slot|unique/i);
    expect(() => badStream.readBytes()).not.toThrow();
    first.dispose();
    expect(() => vertices.readBytes()).not.toThrow();
    second.dispose();
    expect(() => vertices.readBytes()).toThrow(/disposed/i);
    expect(() => indices.assertReadable()).toThrow(/disposed/i);
    badStream.dispose();
  });

  it("preserves assign-and-restore and rejects a disposed replacement transactionally", () => {
    const { vertices, indices, first, second } = sharedTriangle();
    const replacement = new VertexBuffer(VertexFormat.P3, 3);
    first.vertexBuffer = replacement;
    expect(() => vertices.readBytes()).not.toThrow();
    first.vertexBuffer = vertices;
    expect(() => replacement.readBytes()).not.toThrow();
    const deadVertex = new VertexBuffer(VertexFormat.P3, 3);
    deadVertex.dispose();
    expect(() => { first.vertexBuffer = deadVertex; }).toThrow(/disposed/i);
    expect(first.vertexBuffer).toBe(vertices);
    const deadIndex = new IndexBuffer([0], 3);
    deadIndex.dispose();
    expect(() => first.replaceIndexBuffer(deadIndex)).toThrow(/disposed/i);
    expect(first.indexBuffer).toBe(indices);
    replacement.dispose(); first.dispose(); second.dispose();
  });

  it("replaces and retires indices without invalidating a peer geometry", () => {
    const { indices, first, second } = sharedTriangle();
    const next = new IndexBuffer([2, 1, 0], 3);
    first.replaceIndexBuffer(next);
    expect(second.indexBuffer).toBe(indices);
    expect(() => indices.assertReadable()).not.toThrow();
    second.dispose();
    expect(() => indices.assertReadable()).toThrow(/disposed/i);
    const final = new IndexBuffer([0, 2, 1], 3);
    first.replaceIndexBuffer(final);
    expect(() => next.assertReadable()).toThrow(/disposed/i);
    expect(first.indexBuffer).toBe(final);
    first.replaceIndexBuffer(null);
    expect(() => final.assertReadable()).toThrow(/disposed/i);
    first.dispose();
  });

  it("copies shared writable buffers before per-geometry edits and reuses unique buffers", () => {
    const { vertices, indices, first, second } = sharedTriangle();
    const writable = first.ensureWritableBuffers({ vertex: true, index: true });
    expect(writable.vertexBuffer).not.toBe(vertices);
    expect(writable.indexBuffer).not.toBe(indices);
    writable.vertexBuffer.setAttribute(1, "position", [7, 8, 9]);
    writable.indexBuffer!.setIndices(0, [2, 1, 0]);
    expect(second.vertexBuffer.getAttribute(1, "position")).toEqual([1, 0, 0]);
    expect(Array.from(second.indexBuffer!.data)).toEqual([0, 1, 2]);
    const again = first.ensureWritableBuffers({ vertex: true, index: true });
    expect(again.vertexBuffer).toBe(writable.vertexBuffer);
    expect(again.indexBuffer).toBe(writable.indexBuffer);
    second.dispose();
    expect(() => vertices.readBytes()).toThrow(/disposed/i);
    expect(() => indices.assertReadable()).toThrow(/disposed/i);
    first.dispose();
    expect(() => writable.vertexBuffer.readBytes()).toThrow(/disposed/i);
    expect(() => writable.indexBuffer!.assertReadable()).toThrow(/disposed/i);
  });

  it("preserves a wide index buffer's storage type when its values are small", () => {
    const vertices = new VertexBuffer(VertexFormat.P3, 3);
    const indices = new IndexBuffer([0, 1, 2], 3, "uint32");
    const first = new Geometry(vertices, indices);
    const second = new Geometry(vertices, indices);
    const writable = first.ensureWritableBuffers({ index: true });
    expect(writable.indexBuffer!.type).toBe("uint32");
    expect(writable.indexBuffer!.data).toBeInstanceOf(Uint32Array);
    expect(Array.from(writable.indexBuffer!.data)).toEqual([0, 1, 2]);
    expect(first.vertexBuffer).toBe(second.vertexBuffer);
    expect(() => new IndexBuffer([65536], undefined, "uint16")).toThrow(/uint16/i);
    first.dispose(); second.dispose();
  });

  it("does not publish a staged vertex copy if index validation fails", () => {
    const { vertices, indices, first, second } = sharedTriangle();
    indices.dispose();
    const dispose = vi.spyOn(VertexBuffer.prototype, "dispose");
    try {
      expect(() => first.ensureWritableBuffers({ vertex: true, index: true })).toThrow(/disposed/i);
      expect(first.vertexBuffer).toBe(vertices);
      expect(second.vertexBuffer).toBe(vertices);
      expect(dispose).toHaveBeenCalledTimes(1); // The staged, unpublished copy.
    } finally {
      dispose.mockRestore();
      first.dispose(); second.dispose();
    }
  });

  it("keeps another line geometry's buffers alive when a line grows", () => {
    const line = Geometry.lineSegments([[0, 0, 0], [1, 0, 0]]);
    const old = line.vertexBuffer;
    const peer = new Geometry(old, null, "lines", line.bounds);
    line.updateLineSegments([[0, 0, 0], [1, 0, 0], [1, 0, 0], [2, 0, 0]]);
    expect(line.vertexBuffer).not.toBe(old);
    expect(peer.vertexBuffer.getAttribute(1, "position")).toEqual([1, 0, 0]);
    peer.dispose();
    expect(() => old.readBytes()).toThrow(/disposed/i);
    line.dispose();
  });

  it("keeps shared screen-space vertices and indices through growth", () => {
    const segment = { start: [0, 0, 0] as const, end: [1, 0, 0] as const };
    const line = Geometry.screenSpaceLineSegments([segment]);
    const oldVertices = line.vertexBuffer;
    const oldIndices = line.indexBuffer!;
    const peer = new Geometry(oldVertices, oldIndices, "triangles", line.bounds);
    line.updateScreenSpaceLineSegments([segment, segment]);
    expect(line.vertexBuffer).not.toBe(oldVertices);
    expect(line.indexBuffer).not.toBe(oldIndices);
    expect(peer.vertexBuffer.getAttribute(0, "position")).toBeDefined();
    expect(() => peer.indexBuffer!.assertReadable()).not.toThrow();
    peer.dispose();
    expect(() => oldVertices.readBytes()).toThrow(/disposed/i);
    expect(() => oldIndices.assertReadable()).toThrow(/disposed/i);
    line.dispose();
  });

  it("keeps explicit direct buffer disposal as an immediate invalidation", () => {
    const { vertices, indices, first, second } = sharedTriangle();
    vertices.dispose();
    indices.dispose();
    expect(() => first.uploadVertexBuffers(new MockRenderDevice())).toThrow(/disposed/i);
    expect(() => second.indexBuffer!.assertReadable()).toThrow(/disposed/i);
    expect(() => first.dispose()).not.toThrow();
    expect(() => second.dispose()).not.toThrow();
  });

  it("keeps shared CPU ownership across device loss and a new device generation", () => {
    const { vertices, indices, first, second } = sharedTriangle();
    const device = new GenerationDevice();
    const oldVertices = vertices.upload(device);
    const oldIndices = indices.upload(device);
    first.dispose();
    device.contextLost = true;
    expect(() => second.uploadVertexBuffers(device)).toThrow(/lost/i);
    device.contextLost = false;
    device.generation += 1;
    const currentVertices = second.uploadVertexBuffers(device)[0]!;
    const currentIndices = second.indexBuffer!.upload(device);
    expect(currentVertices).not.toBe(oldVertices);
    expect(currentIndices).not.toBe(oldIndices);
    expect(oldVertices.disposed).toBe(true);
    expect(oldIndices.disposed).toBe(true);
    second.dispose();
    expect(currentVertices.disposed).toBe(true);
    expect(currentIndices.disposed).toBe(true);
    device.dispose();
  });

  it("rejects a reentrant disposal during replacement without taking the candidate", () => {
    const { vertices, first, second } = sharedTriangle();
    const candidate = new VertexBuffer(VertexFormat.P3, 3);
    const read = candidate.readBytes.bind(candidate);
    vi.spyOn(candidate, "readBytes").mockImplementation((offset, length) => {
      first.dispose();
      return read(offset, length);
    });
    expect(() => { first.vertexBuffer = candidate; }).toThrow(/disposed/i);
    expect(() => candidate.readBytes()).not.toThrow();
    expect(() => vertices.readBytes()).not.toThrow();
    candidate.dispose(); second.dispose();
  });

  it("rejects a candidate that disposes itself while being checked", () => {
    const { vertices, first, second } = sharedTriangle();
    const candidate = new VertexBuffer(VertexFormat.P3, 3);
    const read = candidate.readBytes.bind(candidate);
    vi.spyOn(candidate, "readBytes").mockImplementation((offset, length) => {
      const data = read(offset, length);
      candidate.dispose();
      return data;
    });
    expect(() => { first.vertexBuffer = candidate; }).toThrow(/disposed/i);
    expect(first.vertexBuffer).toBe(vertices);
    first.dispose(); second.dispose();
  });
});
