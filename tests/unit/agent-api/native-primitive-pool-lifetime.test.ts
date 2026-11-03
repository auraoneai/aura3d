import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPrimitiveGeometryCache,
  createPrimitiveGeometry,
  Geometry,
  IndexBuffer,
  MockRenderDevice,
  VertexBuffer,
  VertexFormat
} from "@aura3d/rendering";
import {
  createQrPrimitiveMesh,
  QrPrimitiveGeometryPool,
  qrPrimitiveGeometryOptions
} from "../../../packages/engine/src/agent-api/compiler/geometry";
import { createProductionRuntimePrimitiveEntries, selectProductionPrimitiveResource } from "../../../packages/engine/src/agent-api/compiler/primitives";
import type { AuraPrimitiveNode } from "../../../packages/engine/src/agent-api/nodes/types";
import { defineAuraCustomGeometry } from "../../../packages/engine/src/agent-api/RootGeometry";

afterEach(() => {
  vi.restoreAllMocks();
  clearPrimitiveGeometryCache();
});

describe("per-mount primitive geometry ownership", () => {
  it("invalidates only the released handle and frees shared uploads after the last peer", () => {
    const pool = new QrPrimitiveGeometryPool();
    const device = new MockRenderDevice();
    const first = pool.acquire("triangle", () => Geometry.triangle());
    const second = pool.acquire("triangle", () => { throw new Error("must reuse pool entry"); });
    const vertices = first.vertexBuffer;
    const indices = first.indexBuffer!;
    const gpuVertices = vertices.upload(device);
    const gpuIndices = indices.upload(device);

    expect(second.vertexBuffer).toBe(vertices);
    expect(second.indexBuffer).toBe(indices);
    expect(pool.refCount("triangle")).toBe(2);
    first.dispose();
    first.dispose();
    expect(pool.refCount("triangle")).toBe(1);
    expect(() => first.getVertexBuffer(0)).toThrow(/disposed/i);
    expect(() => first.vertexBuffer).toThrow(/disposed/i);
    expect(() => first.indexBuffer).toThrow(/disposed/i);
    expect(() => first.refreshBounds()).toThrow(/disposed/i);
    expect(second.getAttributeBuffer("position").getAttribute(0, "position")).toEqual([-0.5, -0.5, 0]);
    expect(second.vertexBuffer.upload(device)).toBe(gpuVertices);
    expect(gpuVertices.disposed).toBe(false);
    expect(gpuIndices.disposed).toBe(false);

    second.dispose();
    expect(pool.size).toBe(0);
    expect(gpuVertices.disposed).toBe(true);
    expect(gpuIndices.disposed).toBe(true);
    expect(() => vertices.getAttribute(0, "position")).toThrow(/disposed/i);

    const replacement = pool.acquire("triangle", () => Geometry.triangle());
    expect(replacement.vertexBuffer).not.toBe(vertices);
    replacement.dispose();
    device.dispose();
  });

  it("isolates mount scopes while reusing one pool across quality settings", () => {
    const flags = { on: () => true };
    const scopeA = {};
    const scopeB = {};
    const a = qrPrimitiveGeometryOptions(flags, { primitiveSegments: "full" }, scopeA)!;
    const halfA = qrPrimitiveGeometryOptions(flags, { primitiveSegments: "half" }, scopeA)!;
    const b = qrPrimitiveGeometryOptions(flags, { primitiveSegments: "full" }, scopeB)!;
    expect(a.pool).toBe(halfA.pool);
    expect(a.pool).not.toBe(b.pool);
    const left = a.pool!.acquire("key", () => Geometry.triangle());
    const right = b.pool!.acquire("key", () => Geometry.triangle());
    expect(left.vertexBuffer).not.toBe(right.vertexBuffer);
    left.dispose();
    expect(a.pool!.size).toBe(0);
    expect(right.getVertexBuffer(0).getAttribute(0, "position")).toEqual([-0.5, -0.5, 0]);
    right.dispose();
    expect(b.pool!.size).toBe(0);
  });

  it("retains every vertex stream and snapshots per-handle geometry metadata", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "normal", components: 3, offset: 0, bufferSlot: 1 }
    ], 12, [{ slot: 1, stride: 12, stepMode: "vertex" }]);
    const positions = new VertexBuffer(format, 3);
    const normals = new VertexBuffer(format, 3, 1);
    for (let i = 0; i < 3; i += 1) {
      positions.setAttribute(i, "position", [i, 0, 0]);
      normals.setAttribute(i, "normal", [0, 1, 0]);
    }
    const base = new Geometry(positions, new IndexBuffer([0, 1, 2]), "triangles", undefined, [normals]);
    base.groups = [{ start: 0, count: 3, materialIndex: 2 }];
    base.drawRange = { start: 0, count: 3 };
    base.morphTargets = [{ name: "raise", positions: Float32Array.of(0, 1, 0) }];
    const pool = new QrPrimitiveGeometryPool();
    const first = pool.acquire("multistream", () => base);
    const second = pool.acquire("multistream", () => { throw new Error("unexpected creation"); });

    expect(first.getAttributeBuffer("normal")).toBe(normals);
    expect(second.getAttributeBuffer("normal").getAttribute(0, "normal")).toEqual([0, 1, 0]);
    expect(first.bounds).toEqual(second.bounds);
    expect(first.bounds).not.toBe(second.bounds);
    expect(first.bounds.min).not.toBe(second.bounds.min);
    expect(first.groups).toEqual(second.groups);
    expect(first.groups).not.toBe(second.groups);
    expect(first.drawRange).not.toBe(second.drawRange);
    expect(first.morphTargets![0]!.positions).not.toBe(second.morphTargets![0]!.positions);
    (first.morphTargets![0]!.positions as Float32Array)[1] = 7;
    expect(second.morphTargets![0]!.positions[1]).toBe(1);
    first.dispose();
    expect(() => second.getVertexBuffer(1).getAttribute(0, "normal")).not.toThrow();
    second.dispose();
    expect(() => normals.getAttribute(0, "normal")).toThrow(/disposed/i);
  });

  it("does not leak a pool entry when construction fails or recursively requests the same key", () => {
    const pool = new QrPrimitiveGeometryPool();
    expect(() => pool.acquire("recursive", () => pool.acquire("recursive", () => Geometry.triangle())))
      .toThrow(/constructing/i);
    expect(pool.size).toBe(0);
    const source = Geometry.triangle();
    const vertices = source.vertexBuffer;
    Object.defineProperty(source, "groups", { get() { throw new Error("bad metadata"); } });
    expect(() => pool.acquire("bad", () => source)).toThrow("bad metadata");
    expect(pool.refCount("bad")).toBe(0);
    expect(pool.size).toBe(0);
    expect(() => vertices.getAttribute(0, "position")).toThrow(/disposed/i);
    const retry = pool.acquire("bad", () => Geometry.triangle());
    retry.dispose();
  });

  it("releases the pool entry even when final buffer cleanup fails", () => {
    const pool = new QrPrimitiveGeometryPool();
    const first = pool.acquire("triangle", () => Geometry.triangle());
    const second = pool.acquire("triangle", () => { throw new Error("unexpected creation"); });
    const vertices = first.vertexBuffer;
    const dispose = vi.spyOn(vertices, "dispose").mockImplementationOnce(() => { throw new Error("device cleanup failed"); });
    first.dispose();
    let failure: unknown;
    try { second.dispose(); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors[0]).toMatchObject({ message: "device cleanup failed" });
    expect(pool.size).toBe(0);
    expect(() => second.getVertexBuffer(0)).toThrow(/disposed/i);
    expect(() => second.dispose()).not.toThrow();
    dispose.mockRestore();
    vertices.dispose();
  });
});

describe("primitive mesh temporary ownership", () => {
  it("releases the factory geometry after copying and after a copy failure", () => {
    const warm = createPrimitiveGeometry("box", undefined, { primitiveSegments: "full" });
    warm.dispose();
    const dispose = vi.spyOn(Geometry.prototype, "dispose");
    const options = { core: true, primitiveSegments: "full" } as const;
    const mesh = createQrPrimitiveMesh("box", [1, 1, 1], options);
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(dispose).toHaveBeenCalledTimes(1);
    dispose.mockClear();
    const read = vi.spyOn(VertexBuffer.prototype, "getAttribute").mockImplementationOnce(() => { throw new Error("copy failed"); });
    expect(() => createQrPrimitiveMesh("box", [1, 1, 1], options)).toThrow("copy failed");
    expect(dispose).toHaveBeenCalledTimes(1);
    read.mockRestore();
  });
});

describe("node-local geometry edits with shared buffers", () => {
  function customResource() {
    const spec = defineAuraCustomGeometry({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] });
    const node: AuraPrimitiveNode = { kind: "primitive", primitive: "custom", name: "editable", geometry: spec };
    const entry = createProductionRuntimePrimitiveEntries([node])[0]!;
    const resource = entry.resources[0]!;
    const current = resource.geometry;
    const peer = new Geometry(current.vertexBuffer, current.indexBuffer, current.topology, current.bounds, current.additionalVertexBuffers);
    return { spec, node, entry, resource, peer };
  }

  it("detaches shared vertex and index storage for a same-size geometry update", () => {
    const { spec, node, entry, resource, peer } = customResource();
    const oldVertices = peer.vertexBuffer;
    const oldIndices = peer.indexBuffer!;
    try {
      const updated = { ...node, geometry: { ...spec, positions: [0, 0, 0, 2, 0, 0, 0, 1, 0], indices: [0, 2, 1] } };
      selectProductionPrimitiveResource(entry, updated, [0, 0, 0]);
      expect(resource.geometry.vertexBuffer).not.toBe(oldVertices);
      expect(resource.geometry.indexBuffer).not.toBe(oldIndices);
      expect(resource.geometry.vertexBuffer.getAttribute(1, "position")).toEqual([2, 0, 0]);
      expect(peer.vertexBuffer.getAttribute(1, "position")).toEqual([1, 0, 0]);
      expect(Array.from(resource.geometry.indexBuffer!.data)).toEqual([0, 2, 1]);
      expect(Array.from(peer.indexBuffer!.data)).toEqual([0, 1, 2]);
    } finally { resource.geometry.dispose(); peer.dispose(); resource.material.dispose(); }
  });

  it("replaces a differently sized or removed index without disposing a peer's index", () => {
    const { spec, node, entry, resource, peer } = customResource();
    const oldIndices = peer.indexBuffer!;
    try {
      selectProductionPrimitiveResource(entry, { ...node, geometry: { ...spec, indices: [0, 1, 2, 0, 2, 1] } }, [0, 0, 0]);
      expect(resource.geometry.indexBuffer!.count).toBe(6);
      expect(peer.indexBuffer).toBe(oldIndices);
      expect(Array.from(oldIndices.data)).toEqual([0, 1, 2]);
      resource.geometry.replaceIndexBuffer(null);
      expect(resource.geometry.indexBuffer).toBeNull();
      expect(() => oldIndices.assertReadable()).not.toThrow();
    } finally { resource.geometry.dispose(); peer.dispose(); resource.material.dispose(); }
  });

  it("detaches before a partial attribute update but keeps unique storage in place", () => {
    const { node, entry, resource, peer } = customResource();
    try {
      const oldVertices = peer.vertexBuffer;
      const update = { ...node, __parityL2AttributeUpdates: [{ name: "position", offset: 1, array: [3, 0, 0] }] };
      selectProductionPrimitiveResource(entry, update, [0, 0, 0]);
      expect(resource.geometry.vertexBuffer).not.toBe(oldVertices);
      expect(resource.geometry.vertexBuffer.getAttribute(1, "position")).toEqual([3, 0, 0]);
      expect(peer.vertexBuffer.getAttribute(1, "position")).toEqual([1, 0, 0]);
      const unique = resource.geometry.vertexBuffer;
      const nextUpdate = { ...node, __parityL2AttributeUpdates: [{ name: "position", offset: 1, array: [4, 0, 0] }] };
      selectProductionPrimitiveResource(entry, nextUpdate, [0, 0, 0]);
      expect(resource.geometry.vertexBuffer).toBe(unique);
      expect(unique.getAttribute(1, "position")).toEqual([4, 0, 0]);
    } finally { resource.geometry.dispose(); peer.dispose(); resource.material.dispose(); }
  });

  it("keeps another pooled primitive unchanged when a runtime attribute edit is applied", () => {
    const pool = new QrPrimitiveGeometryPool();
    const firstNode = { kind: "primitive", primitive: "box", name: "first" } as AuraPrimitiveNode;
    const secondNode = { kind: "primitive", primitive: "box", name: "second" } as AuraPrimitiveNode;
    const [first, second] = createProductionRuntimePrimitiveEntries([firstNode, secondNode], { core: true, pool });
    const firstResource = first!.resources[0]!;
    const secondResource = second!.resources[0]!;
    try {
      expect(firstResource.geometry.vertexBuffer).toBe(secondResource.geometry.vertexBuffer);
      const oldPosition = secondResource.geometry.vertexBuffer.getAttribute(0, "position");
      const updated = {
        ...firstNode, __parityL2AttributeUpdates: [{ name: "position", offset: 0, array: [8, 9, 10] }]
      };
      selectProductionPrimitiveResource(first!, updated, [0, 0, 0]);
      expect(firstResource.geometry.vertexBuffer).not.toBe(secondResource.geometry.vertexBuffer);
      expect(firstResource.geometry.vertexBuffer.getAttribute(0, "position")).toEqual([8, 9, 10]);
      expect(secondResource.geometry.vertexBuffer.getAttribute(0, "position")).toEqual(oldPosition);
    } finally {
      firstResource.geometry.dispose();
      secondResource.geometry.dispose();
      firstResource.material.dispose();
      secondResource.material.dispose();
    }
    expect(pool.size).toBe(0);
  });

  it("rejects a bad later attribute value before changing or detaching shared storage", () => {
    const { node, entry, resource, peer } = customResource();
    try {
      const original = resource.geometry.vertexBuffer;
      const update = { ...node, __parityL2AttributeUpdates: [{ name: "position", offset: 0, array: [5, 0, 0, Number.NaN, 0, 0] }] };
      expect(() => selectProductionPrimitiveResource(entry, update, [0, 0, 0])).toThrow(/storage range/i);
      expect(resource.geometry.vertexBuffer).toBe(original);
      expect(peer.vertexBuffer).toBe(original);
      expect(original.getAttribute(0, "position")).toEqual([0, 0, 0]);
      expect(original.getAttribute(1, "position")).toEqual([1, 0, 0]);
    } finally { resource.geometry.dispose(); peer.dispose(); resource.material.dispose(); }
  });
});
