import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPrimitiveGeometryCache, Geometry, IndexBuffer, Material, VertexBuffer } from "@aura3d/rendering";
import { defineAuraCustomGeometry } from "../../../packages/engine/src/agent-api/RootGeometry";
import { QrPrimitiveGeometryPool } from "../../../packages/engine/src/agent-api/compiler/geometry";
import { createProductionPrimitiveResources, createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import type { AuraPrimitiveNode } from "../../../packages/engine/src/agent-api/nodes/types";

afterEach(() => {
  vi.restoreAllMocks();
  clearPrimitiveGeometryCache();
});

const box = (): AuraPrimitiveNode => ({ kind: "primitive", primitive: "box" });
const badCustom = (): AuraPrimitiveNode => ({ kind: "primitive", primitive: "custom" });

function observeGeometryDisposals(): Geometry[] {
  const observed: Geometry[] = [];
  const dispose = Geometry.prototype.dispose;
  vi.spyOn(Geometry.prototype, "dispose").mockImplementation(function (this: Geometry) {
    observed.push(this);
    dispose.call(this);
  });
  return observed;
}

function observeMaterialDisposals(): Material[] {
  const observed: Material[] = [];
  const dispose = Material.prototype.dispose;
  vi.spyOn(Material.prototype, "dispose").mockImplementation(function (this: Material) {
    observed.push(this);
    dispose.call(this);
  });
  return observed;
}

function observeVertexDisposals(): VertexBuffer[] {
  const observed: VertexBuffer[] = [];
  const dispose = VertexBuffer.prototype.dispose;
  vi.spyOn(VertexBuffer.prototype, "dispose").mockImplementation(function (this: VertexBuffer) {
    observed.push(this);
    dispose.call(this);
  });
  return observed;
}

function observeIndexDisposals(): IndexBuffer[] {
  const observed: IndexBuffer[] = [];
  const dispose = IndexBuffer.prototype.dispose;
  vi.spyOn(IndexBuffer.prototype, "dispose").mockImplementation(function (this: IndexBuffer) {
    observed.push(this);
    dispose.call(this);
  });
  return observed;
}

describe("primitive resource construction ownership", () => {
  it("retires the first node when a later node cannot be constructed", () => {
    const geometries = observeGeometryDisposals();
    const materials = observeMaterialDisposals();
    expect(() => createProductionRuntimePrimitiveEntries([box(), badCustom()])).toThrow(/custom primitive requires geometry/i);
    expect(geometries).toHaveLength(1);
    expect(materials).toHaveLength(1);
    const geometry = geometries[0]!;
    const material = materials[0]!;
    expect(() => geometry.getVertexBuffer(0)).toThrow(/disposed/i);
    expect(material.disposed).toBe(true);
  });

  it("releases earlier LOD levels when a later level is invalid", () => {
    const geometries = observeGeometryDisposals();
    const materials = observeMaterialDisposals();
    const node = { ...box(), lod: { levels: [{ primitive: "box", maxDistance: 5 }, { name: "invalid" }] } } as unknown as AuraPrimitiveNode;
    expect(() => createProductionPrimitiveResources(node)).toThrow(/LOD level 1 requires primitive or custom geometry/i);
    expect(geometries).toHaveLength(1);
    expect(materials).toHaveLength(1);
    expect(() => geometries[0]!.getVertexBuffer(0)).toThrow(/disposed/i);
    expect(materials[0]!.disposed).toBe(true);
  });

  it("releases only the failed pooled lease when material construction throws", () => {
    const pool = new QrPrimitiveGeometryPool();
    const peer = createProductionPrimitiveResources(box(), { core: true, pool })[0]!;
    const shared = peer.geometry.vertexBuffer;
    const broken = box();
    Object.defineProperty(broken, "material", { get() { throw new Error("material construction failed"); } });
    try {
      expect(() => createProductionPrimitiveResources(broken, { core: true, pool })).toThrow("material construction failed");
      expect(pool.size).toBe(1);
      expect(peer.geometry.vertexBuffer).toBe(shared);
      expect(() => shared.readBytes(0, 0)).not.toThrow();
    } finally {
      peer.geometry.dispose();
      peer.material.dispose();
    }
    expect(pool.size).toBe(0);
    expect(() => shared.readBytes(0, 0)).toThrow(/disposed/i);
  });

  it("releases a vertex buffer if a mesh write fails before geometry exists", () => {
    const vertices = observeVertexDisposals();
    vi.spyOn(VertexBuffer.prototype, "setAttribute").mockImplementationOnce(() => { throw new Error("attribute write failed"); });
    expect(() => createProductionPrimitiveResources(box())).toThrow("attribute write failed");
    expect(vertices).toHaveLength(1);
    expect(() => vertices[0]!.readBytes(0, 0)).toThrow(/disposed/i);
  });

  it("releases both custom geometry buffers if metadata fails after allocation", () => {
    const vertices = observeVertexDisposals();
    const indices = observeIndexDisposals();
    const source = defineAuraCustomGeometry({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] });
    const spec = { ...source, get groups(): never { throw new Error("metadata unavailable"); } };
    expect(() => createProductionPrimitiveResources({ kind: "primitive", primitive: "custom", geometry: spec })).toThrow("metadata unavailable");
    expect(vertices).toHaveLength(1);
    expect(indices).toHaveLength(1);
    expect(() => vertices[0]!.readBytes(0, 0)).toThrow(/disposed/i);
    expect(() => indices[0]!.assertReadable()).toThrow(/disposed/i);
  });

  it("attempts all cleanup and retains the original construction failure when cleanup fails", () => {
    const originalDispose = Geometry.prototype.dispose;
    const cleanupFailure = new Error("geometry cleanup failed");
    const materials = observeMaterialDisposals();
    vi.spyOn(Geometry.prototype, "dispose").mockImplementation(function (this: Geometry) {
      originalDispose.call(this);
      throw cleanupFailure;
    });
    const node = { ...box(), lod: { levels: [{ primitive: "box", maxDistance: 5 }, { name: "invalid" }] } } as unknown as AuraPrimitiveNode;
    let thrown: unknown;
    try { createProductionPrimitiveResources(node); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors[0]).toMatchObject({ message: expect.stringMatching(/LOD level 1/) });
    expect((thrown as AggregateError).errors).toContain(cleanupFailure);
    expect(materials).toHaveLength(1);
    expect(materials[0]!.disposed).toBe(true);
  });

  it("retires tessellation probes while retaining the returned instanced geometry", () => {
    const geometries = observeGeometryDisposals();
    const node = { ...box(), instances: Array.from({ length: 65 }, () => ({})) } as AuraPrimitiveNode;
    const resource = createProductionPrimitiveResources(node, { core: true })[0]!;
    try {
      expect(geometries.length).toBeGreaterThanOrEqual(2);
      expect(geometries).not.toContain(resource.geometry);
      expect(() => resource.geometry.getVertexBuffer(0)).not.toThrow();
    } finally {
      resource.geometry.dispose();
      resource.shadowGeometry?.dispose();
      resource.material.dispose();
    }
  });
});
