import { describe, expect, it, vi } from "vitest";

import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { InstancedPBRMaterial } from "../../../packages/rendering/src/InstancedPBRMaterial";
import { consolidateStaticMeshes, createStaticMeshConsolidationCache, deindexGeometryToNonIndexed } from "../../../packages/rendering/src/MeshConsolidation";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice, type RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import type { Texture } from "../../../packages/rendering/src/Texture";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { BatchedGeometryPool } from "../../../packages/rendering/src/batching/BatchedGeometryPool";
import { DrawDataTexture } from "../../../packages/rendering/src/batching/DrawDataTexture";
import { buildMultiDrawBatch, multiDrawCommands } from "../../../packages/rendering/src/batching/MultiDrawBatch";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { resourceRegistrySlot } from "../../../packages/rendering/src/contracts/rendererFactory";
import { applyRendererOwnedStaticMeshConsolidation, batchPlanCacheFor, BatchPlanCache, disposeBatchPlanCacheFor, prd11BatchingFrameContributor } from "../../../packages/rendering/src/renderer/CullingBatching";
import { ResourceRegistry, sharedResourceRegistry } from "../../../packages/rendering/src/resources/ResourceRegistry";

const flags = createTrustedQrFlags({});
type PackedItem = RenderItem & { readonly multiDraw: { readonly drawData: Texture } };

describe("WP-21 batch restore ownership", () => {
  it("scopes both resources before either pool uploads", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const geometryA = Geometry.litTriangle();
    const geometryB = Geometry.litTriangle();
    const material = new PBRMaterial();
    const batchA = buildMultiDrawBatch({
      key: "a", programKey: "a", vertexLayoutKey: "a", members: [{ geometry: geometryA, material }]
    }, undefined, a);
    const batchB = buildMultiDrawBatch({
      key: "b", programKey: "b", vertexLayoutKey: "b", members: [{ geometry: geometryB, material }]
    }, undefined, b);
    const textureA = batchA.drawData.upload();
    const textureB = batchB.drawData.upload();
    const revisionA = textureA.revision;
    const revisionB = textureB.revision;
    try {
      expect(await sharedResourceRegistry().rebuild(a)).toEqual({ rebuilt: 2, refetched: 0, failed: [] });
      expect(textureA.revision).toBeGreaterThan(revisionA);
      expect(textureB.revision).toBe(revisionB);
      const restoredRevisionA = textureA.revision;
      expect(await sharedResourceRegistry().rebuild(b)).toEqual({ rebuilt: 2, refetched: 0, failed: [] });
      expect(textureB.revision).toBeGreaterThan(revisionB);
      expect(textureA.revision).toBe(restoredRevisionA);
    } finally {
      batchA.drawData.dispose(); batchA.pool.dispose();
      batchB.drawData.dispose(); batchB.pool.dispose();
      geometryA.dispose(); geometryB.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
  });

  it("moves a standalone batch's draw-data owner while retaining separate device arenas", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const batch = buildMultiDrawBatch({
      key: "migration", programKey: "migration", vertexLayoutKey: "migration", members: [{ geometry, material }]
    }, undefined, a);
    try {
      const oldA = batch.pool.upload(a).vertexBuffer;
      const residentB = multiDrawCommands(b, batch)[0]!.vertexBuffer;
      const texture = batch.drawData.upload();
      const revision = texture.revision;
      // A's arena remains resident for any other live consumer; restoring it
      // must not move the standalone batch's draw data back from B.
      expect(oldA.disposed).toBe(false);
      expect(await sharedResourceRegistry().rebuild(a)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(oldA.disposed).toBe(true);
      expect(residentB.disposed).toBe(false);
      expect(texture.revision).toBe(revision);
      expect(await sharedResourceRegistry().rebuild(b)).toEqual({ rebuilt: 2, refetched: 0, failed: [] });
      expect(residentB.disposed).toBe(true);
      expect(texture.revision).toBeGreaterThan(revision);
    } finally {
      batch.drawData.dispose(); batch.pool.dispose();
      geometry.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
  });

  it("passes device ownership through independent plan caches before upload", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const cacheA = new BatchPlanCache();
    const cacheB = new BatchPlanCache();
    try {
      const outputA = cacheA.apply(items, { device: a, flags, instancing: false, multiDrawAvailable: true });
      const outputB = cacheB.apply(items, { device: b, flags, instancing: false, multiDrawAvailable: true });
      const textureA = (outputA[0] as PackedItem).multiDraw.drawData;
      const textureB = (outputB[0] as PackedItem).multiDraw.drawData;
      const revisionA = textureA.revision;
      const revisionB = textureB.revision;
      expect(await sharedResourceRegistry().rebuild(a)).toEqual({ rebuilt: 2, refetched: 0, failed: [] });
      expect(textureA.revision).toBeGreaterThan(revisionA);
      expect(textureB.revision).toBe(revisionB);
      const restoredRevisionA = textureA.revision;
      expect(await sharedResourceRegistry().rebuild(b)).toEqual({ rebuilt: 2, refetched: 0, failed: [] });
      expect(textureB.revision).toBeGreaterThan(revisionB);
      expect(textureA.revision).toBe(restoredRevisionA);
    } finally {
      cacheA.dispose(); cacheB.dispose();
      geometry.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
  });

  it("propagates the frame contributor's actual device into its registered resources", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    (a as RenderDevice).multiDrawElementsInstanced = () => undefined;
    (b as RenderDevice).multiDrawElementsInstanced = () => undefined;
    const first = Geometry.litTriangle();
    const second = Geometry.litTriangle();
    second.vertexBuffer.setAttribute(0, "position", [-0.25, -0.5, 0]);
    const material = new PBRMaterial();
    const items = [{ geometry: first, material }, { geometry: second, material }];
    const generated = createTrustedQrFlags({ A3D_QR_CORE_GENERATOR: true });
    const context = (device: RenderDevice): FrameContributorContext => ({
      device, width: 8, height: 8, frameIndex: 0, timeSeconds: 0, camera: null,
      source: {}, items, tier: {} as FrameContributorContext["tier"], flags: generated,
      sceneDepth: { texture: null, linearize: { near: 0.1, far: 100, orthographic: false }, available: false },
      blackboard: new Map()
    });
    try {
      const outputA = prd11BatchingFrameContributor.collect!(items, context(a));
      const outputB = prd11BatchingFrameContributor.collect!(items, context(b));
      const textureA = (outputA[0] as PackedItem).multiDraw.drawData;
      const textureB = (outputB[0] as PackedItem).multiDraw.drawData;
      const revisionA = textureA.revision;
      const revisionB = textureB.revision;
      expect(await sharedResourceRegistry().rebuild(a)).toEqual({ rebuilt: 2, refetched: 0, failed: [] });
      expect(textureA.revision).toBeGreaterThan(revisionA);
      expect(textureB.revision).toBe(revisionB);
    } finally {
      disposeBatchPlanCacheFor(a); disposeBatchPlanCacheFor(b);
      first.dispose(); second.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
  });

  it("replans and retires the old owner when a plan cache changes devices", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const cache = new BatchPlanCache();
    try {
      const first = cache.apply(items, { device: a, flags, instancing: false, multiDrawAvailable: true });
      const oldTexture = (first[0] as PackedItem).multiDraw.drawData;
      const second = cache.apply(items, { device: b, flags, instancing: false, multiDrawAvailable: true });
      const texture = (second[0] as PackedItem).multiDraw.drawData;
      const revision = texture.revision;
      expect(cache.planVersion).toBe(2);
      expect(texture).not.toBe(oldTexture);
      expect(oldTexture.disposed).toBe(true);
      expect(await sharedResourceRegistry().rebuild(a)).toEqual({ rebuilt: 0, refetched: 0, failed: [] });
      expect(texture.revision).toBe(revision);
      expect(await sharedResourceRegistry().rebuild(b)).toEqual({ rebuilt: 2, refetched: 0, failed: [] });
      expect(texture.revision).toBeGreaterThan(revision);
    } finally {
      cache.dispose(); geometry.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
  });

  it("keeps old draw data tied to its original pool lifetime after the pool is reused", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const pool = new BatchedGeometryPool();
    const group = { key: "reuse", programKey: "reuse", vertexLayoutKey: "reuse", members: [{ geometry, material }] };
    const oldBatch = buildMultiDrawBatch(group, pool, a);
    oldBatch.pool.upload(a);
    const oldTexture = oldBatch.drawData.upload();
    pool.dispose();
    const nextBatch = buildMultiDrawBatch(group, pool, b);
    nextBatch.pool.upload(b);
    const nextTexture = nextBatch.drawData.upload();
    const oldRevision = oldTexture.revision;
    const nextRevision = nextTexture.revision;
    try {
      expect(await sharedResourceRegistry().rebuild(a)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(oldTexture.revision).toBeGreaterThan(oldRevision);
      expect(nextTexture.revision).toBe(nextRevision);
      const restoredOldRevision = oldTexture.revision;
      expect(await sharedResourceRegistry().rebuild(b)).toEqual({ rebuilt: 2, refetched: 0, failed: [] });
      expect(nextTexture.revision).toBeGreaterThan(nextRevision);
      expect(oldTexture.revision).toBe(restoredOldRevision);
    } finally {
      oldBatch.drawData.dispose(); nextBatch.drawData.dispose(); pool.dispose();
      geometry.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
  });

  it("keeps a borrowed pool registered with and owned by its original registry", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const original = Geometry.litTriangle();
    const added = Geometry.litTriangle();
    const material = new PBRMaterial();
    const pool = new BatchedGeometryPool();
    const owner = new ResourceRegistry();
    const shared = sharedResourceRegistry();
    const baseline = shared.size;
    pool.pack(original);
    pool.registerForRestore(owner, b);
    const batch = buildMultiDrawBatch({
      key: "borrowed", programKey: "borrowed", vertexLayoutKey: "borrowed", members: [{ geometry: added, material }]
    }, pool, b);
    try {
      const resident = pool.upload(b).vertexBuffer;
      const texture = batch.drawData.upload();
      const revision = texture.revision;
      expect(owner.size).toBe(1);
      expect(shared.size).toBe(baseline + 1);
      expect(await owner.rebuild(a)).toEqual({ rebuilt: 0, refetched: 0, failed: [] });
      expect(await shared.rebuild(a)).toEqual({ rebuilt: 0, refetched: 0, failed: [] });
      expect(resident.disposed).toBe(false);
      expect(texture.revision).toBe(revision);
      expect(await owner.rebuild(b)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(resident.disposed).toBe(true);
      batch.drawData.dispose();
      expect(owner.size).toBe(1);
      expect(pool.stats().geometries).toBe(2);
      expect(pool.upload(b).vertexBuffer.disposed).toBe(false);
    } finally {
      batch.drawData.dispose(); pool.dispose();
      original.dispose(); added.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
    expect(owner.size).toBe(0);
    expect(shared.size).toBe(baseline);
  });

  it("keeps separate draw-data owners when two devices share a borrowed pool", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const first = Geometry.litTriangle();
    const second = Geometry.litTriangle();
    const material = new PBRMaterial();
    const pool = new BatchedGeometryPool();
    const batchA = buildMultiDrawBatch({
      key: "shared-a", programKey: "shared", vertexLayoutKey: "shared", members: [{ geometry: first, material }]
    }, pool, a);
    const batchB = buildMultiDrawBatch({
      key: "shared-b", programKey: "shared", vertexLayoutKey: "shared", members: [{ geometry: second, material }]
    }, pool, b);
    const textureA = batchA.drawData.upload();
    const textureB = batchB.drawData.upload();
    const revisionA = textureA.revision;
    const revisionB = textureB.revision;
    try {
      const residentB = pool.upload(b).vertexBuffer;
      expect(await sharedResourceRegistry().rebuild(a)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(textureA.revision).toBeGreaterThan(revisionA);
      expect(textureB.revision).toBe(revisionB);
      expect(residentB.disposed).toBe(false);
      const restoredRevisionA = textureA.revision;
      expect(await sharedResourceRegistry().rebuild(b)).toEqual({ rebuilt: 2, refetched: 0, failed: [] });
      expect(textureA.revision).toBe(restoredRevisionA);
      expect(textureB.revision).toBeGreaterThan(revisionB);
      expect(residentB.disposed).toBe(true);
    } finally {
      batchA.drawData.dispose(); batchB.drawData.dispose(); pool.dispose();
      first.dispose(); second.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
  });

  it("moves only the borrowed batch explicitly prepared on a different device", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const first = Geometry.litTriangle();
    const second = Geometry.litTriangle();
    const material = new PBRMaterial();
    const pool = new BatchedGeometryPool();
    const batchA = buildMultiDrawBatch({
      key: "migration-a", programKey: "shared", vertexLayoutKey: "shared", members: [{ geometry: first, material }]
    }, pool, a);
    const batchB = buildMultiDrawBatch({
      key: "migration-b", programKey: "shared", vertexLayoutKey: "shared", members: [{ geometry: second, material }]
    }, pool, b);
    try {
      multiDrawCommands(a, batchA);
      const residentB = multiDrawCommands(b, batchB)[0]!.vertexBuffer;
      const textureA = batchA.drawData.upload();
      const textureB = batchB.drawData.upload();
      const revisionA = textureA.revision;
      const revisionB = textureB.revision;
      expect(multiDrawCommands(b, { ...batchA })[0]!.vertexBuffer).toBe(residentB);
      // The draw-data owner has moved, but A still owns its independent arena.
      expect(await sharedResourceRegistry().rebuild(a)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(residentB.disposed).toBe(false);
      expect(textureA.revision).toBe(revisionA);
      expect(textureB.revision).toBe(revisionB);
      expect(await sharedResourceRegistry().rebuild(b)).toEqual({ rebuilt: 3, refetched: 0, failed: [] });
      expect(residentB.disposed).toBe(true);
      expect(textureA.revision).toBeGreaterThan(revisionA);
      expect(textureB.revision).toBeGreaterThan(revisionB);
      const restoredA = textureA.revision;
      const restoredB = textureB.revision;
      const residentA = multiDrawCommands(a, batchB)[0]!.vertexBuffer;
      expect(await sharedResourceRegistry().rebuild(b)).toEqual({ rebuilt: 2, refetched: 0, failed: [] });
      expect(textureA.revision).toBeGreaterThan(restoredA);
      expect(textureB.revision).toBe(restoredB);
      expect(residentA.disposed).toBe(false);
    } finally {
      batchA.drawData.dispose(); batchB.drawData.dispose(); pool.dispose();
      first.dispose(); second.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
  });

  it("keeps a borrowed batch's owner when preparing commands on another device fails", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const pool = new BatchedGeometryPool();
    const batch = buildMultiDrawBatch({
      key: "failed-migration", programKey: "shared", vertexLayoutKey: "shared", members: [{ geometry, material }]
    }, pool, a);
    const resident = pool.upload(a).vertexBuffer;
    const texture = batch.drawData.upload();
    const revision = texture.revision;
    const createBufferOriginal = b.createBuffer.bind(b);
    const createBuffer = vi.spyOn(b, "createBuffer").mockImplementation((usage, size, data) => {
      if (usage === "index") throw new Error("index allocation failed");
      return createBufferOriginal(usage, size, data);
    });
    try {
      expect(() => multiDrawCommands(b, batch)).toThrow("index allocation failed");
      expect(await sharedResourceRegistry().rebuild(b)).toEqual({ rebuilt: 0, refetched: 0, failed: [] });
      expect(resident.disposed).toBe(false);
      expect(texture.revision).toBe(revision);
      expect(await sharedResourceRegistry().rebuild(a)).toEqual({ rebuilt: 2, refetched: 0, failed: [] });
      expect(resident.disposed).toBe(true);
      expect(texture.revision).toBeGreaterThan(revision);
    } finally {
      createBuffer.mockRestore(); batch.drawData.dispose(); pool.dispose();
      geometry.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
  });

  it("does not migrate a standalone batch when replacement of another device's old arena throws", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const first = Geometry.litTriangle();
    const added = Geometry.litTriangle();
    const material = new PBRMaterial();
    const batch = buildMultiDrawBatch({
      key: "retirement-failure", programKey: "shared", vertexLayoutKey: "shared", members: [{ geometry: first, material }]
    }, undefined, a);
    batch.pool.upload(a);
    const oldB = batch.pool.upload(b);
    multiDrawCommands(a, batch);
    const texture = batch.drawData.upload();
    const revision = texture.revision;
    const disposeB = vi.spyOn(oldB.vertexBuffer, "dispose").mockImplementationOnce(() => {
      throw new Error("old device B arena failed");
    });
    try {
      batch.pool.pack(added);
      expect(() => multiDrawCommands(b, batch)).toThrow(/arena retirement failed/i);
      expect(oldB.indexBuffer!.disposed).toBe(true);
      expect(await sharedResourceRegistry().rebuild(a)).toEqual({ rebuilt: 2, refetched: 0, failed: [] });
      expect(texture.revision).toBeGreaterThan(revision);
      const restoredRevision = texture.revision;
      expect(await sharedResourceRegistry().rebuild(b)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(texture.revision).toBe(restoredRevision);
      multiDrawCommands(b, batch);
      expect(await sharedResourceRegistry().rebuild(b)).toEqual({ rebuilt: 2, refetched: 0, failed: [] });
      expect(texture.revision).toBeGreaterThan(restoredRevision);
    } finally {
      disposeB.mockRestore(); batch.drawData.dispose(); batch.pool.dispose();
      first.dispose(); added.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
  });

  it("preserves a borrowed pool and its owner when draw-data registration fails after accepting it", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const original = Geometry.litTriangle();
    const added = Geometry.litTriangle();
    const material = new PBRMaterial();
    const pool = new BatchedGeometryPool();
    const registry = sharedResourceRegistry();
    const baseline = registry.size;
    pool.pack(original);
    pool.registerForRestore(registry, a);
    const resident = pool.upload(a).vertexBuffer;
    const registerOriginal = registry.register.bind(registry);
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      const result = registerOriginal(handle, descriptor);
      if (handle instanceof DrawDataTexture) throw new Error("draw registration failed");
      return result;
    });
    try {
      expect(() => buildMultiDrawBatch({
        key: "failure", programKey: "failure", vertexLayoutKey: "failure", members: [{ geometry: added, material }]
      }, pool, b)).toThrow("draw registration failed");
      expect(pool.geometries()).toEqual([original]);
      expect(pool.upload(a).vertexBuffer).toBe(resident);
      expect(registry.size).toBe(baseline + 1);
      expect(await registry.rebuild(b)).toEqual({ rebuilt: 0, refetched: 0, failed: [] });
      expect(resident.disposed).toBe(false);
      expect(await registry.rebuild(a)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(resident.disposed).toBe(true);
    } finally {
      register.mockRestore(); pool.dispose();
      original.dispose(); added.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
    expect(registry.size).toBe(baseline);
  });

  it("rolls back a borrowed pool when registration and its cleanup both fail", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const original = Geometry.litTriangle();
    const added = Geometry.litTriangle();
    const material = new PBRMaterial();
    const pool = new BatchedGeometryPool();
    const registry = sharedResourceRegistry();
    const baseline = registry.size;
    pool.pack(original);
    const resident = pool.upload(a).vertexBuffer;
    const registerOriginal = registry.register.bind(registry);
    const unregisterOriginal = registry.unregister.bind(registry);
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      const result = registerOriginal(handle, descriptor);
      if (handle === pool) throw new Error("pool registration failed");
      return result;
    });
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      if (handle === pool) throw new Error("pool unregister failed");
      unregisterOriginal(handle);
    });
    const upload = vi.spyOn(pool, "upload");
    try {
      expect(() => buildMultiDrawBatch({
        key: "failed-pool", programKey: "shared", vertexLayoutKey: "shared", members: [{ geometry: added, material }]
      }, pool, b)).toThrow("pool registration failed");
      expect(pool.geometries()).toEqual([original]);
      expect(registry.size).toBe(baseline + 1);
      await registry.rebuild(a);
      await registry.rebuild(b);
      expect(upload).not.toHaveBeenCalled();
      expect(resident.disposed).toBe(false);
      register.mockRestore(); unregister.mockRestore(); upload.mockRestore();
      pool.registerForRestore(registry, a);
      expect(registry.size).toBe(baseline + 1);
      expect(await registry.rebuild(a)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(resident.disposed).toBe(true);
    } finally {
      register.mockRestore(); unregister.mockRestore(); upload.mockRestore();
      unregisterOriginal(pool); pool.dispose();
      original.dispose(); added.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
    expect(registry.size).toBe(baseline);
  });

  it("preserves a plan registration error even if retiring an earlier group also fails", () => {
    const device = new MockRenderDevice();
    const first = Geometry.litTriangle();
    const second = Geometry.triangle();
    const material = new PBRMaterial();
    const cache = new BatchPlanCache();
    const registry = sharedResourceRegistry();
    const baseline = registry.size;
    const registerOriginal = registry.register.bind(registry);
    const unregisterOriginal = registry.unregister.bind(registry);
    let drawDataRegistrations = 0;
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      const result = registerOriginal(handle, descriptor);
      if (handle instanceof DrawDataTexture && ++drawDataRegistrations === 2) throw new Error("second registration failed");
      return result;
    });
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      unregisterOriginal(handle);
      if (handle instanceof BatchedGeometryPool) throw new Error("first pool cleanup failed");
    });
    try {
      const items = [
        { geometry: first, material }, { geometry: first, material },
        { geometry: second, material }, { geometry: second, material }
      ];
      expect(() => cache.apply(items, { device, flags, instancing: false, multiDrawAvailable: true }))
        .toThrow("second registration failed");
      expect(drawDataRegistrations).toBe(2);
      expect(registry.size).toBe(baseline);
      expect(first.disposed).toBe(false);
      expect(second.disposed).toBe(false);
      expect(material.disposed).toBe(false);
      expect(cache.lastPlan).toBeNull();
    } finally {
      register.mockRestore(); unregister.mockRestore(); cache.dispose();
      first.dispose(); second.dispose(); material.dispose(); device.dispose();
    }
  });

  it("reports both packed and instanced retirement failures after cleaning every resource", () => {
    const device = new MockRenderDevice();
    const first = Geometry.litTriangle();
    const second = Geometry.litTriangle();
    const third = Geometry.litTriangle();
    second.vertexBuffer.setAttribute(0, "position", [-0.25, -0.5, 0]);
    third.vertexBuffer.setAttribute(0, "position", [0.25, -0.5, 0]);
    const material = new PBRMaterial();
    const cache = new BatchPlanCache();
    const registry = sharedResourceRegistry();
    const baseline = registry.size;
    const unregisterOriginal = registry.unregister.bind(registry);
    try {
      const items = [
        { geometry: first, material }, { geometry: first, material },
        { geometry: second, material }, { geometry: third, material }
      ];
      expect(cache.apply(items, { device, flags, multiDrawAvailable: true })).toHaveLength(3);
      const owned = cache.lastPlan!.instancedBatches[0]!.material as InstancedPBRMaterial;
      const disposeOriginal = owned.dispose.bind(owned);
      const disposeOwned = vi.spyOn(owned, "dispose").mockImplementation(() => { disposeOriginal(); throw new Error("instanced cleanup failed"); });
      const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
        unregisterOriginal(handle);
        if (handle instanceof BatchedGeometryPool) throw new Error("pool cleanup failed");
      });
      let failure: unknown;
      try { cache.dispose(); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toHaveLength(2);
      expect((failure as AggregateError).errors[0]).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors[1]).toMatchObject({ message: "instanced cleanup failed" });
      expect(owned.disposed).toBe(true);
      expect(registry.size).toBe(baseline);
      // An unregister that threw remains uncertain even if the test double
      // happened to remove its entry before throwing.
      expect(() => cache.dispose()).toThrow(/disposal failed/i);
      unregister.mockRestore();
      expect(() => cache.dispose()).not.toThrow();
      expect(disposeOwned).toHaveBeenCalledOnce();
      expect(first.disposed).toBe(false);
      expect(second.disposed).toBe(false);
      expect(third.disposed).toBe(false);
      expect(material.disposed).toBe(false);
      unregister.mockRestore();
    } finally {
      vi.restoreAllMocks(); cache.dispose();
      first.dispose(); second.dispose(); third.dispose(); material.dispose(); device.dispose();
    }
  });

  it("retires a consolidation cache even when its companion batch cache throws", () => {
    const owner = {};
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const cache = batchPlanCacheFor(owner);
    try {
      cache.apply(items, { flags });
      const owned = cache.lastPlan!.instancedBatches[0]!.material as InstancedPBRMaterial;
      const disposeOriginal = owned.dispose.bind(owned);
      vi.spyOn(owned, "dispose").mockImplementation(() => { disposeOriginal(); throw new Error("batch cache cleanup failed"); });
      const consolidated = applyRendererOwnedStaticMeshConsolidation({ staticMeshConsolidation: true }, items, owner, flags);
      expect(consolidated).toHaveLength(1);
      const merged = consolidated[0]!.geometry;
      expect(merged).not.toBe(geometry);
      expect(() => disposeBatchPlanCacheFor(owner)).toThrow("batch cache cleanup failed");
      expect(owned.disposed).toBe(true);
      expect(merged.disposed).toBe(true);
      expect(geometry.disposed).toBe(false);
      expect(() => disposeBatchPlanCacheFor(owner)).not.toThrow();
    } finally {
      vi.restoreAllMocks(); disposeBatchPlanCacheFor(owner);
      geometry.dispose(); material.dispose();
    }
  });

  it("keeps a failed consolidation cache available for a later cleanup retry", () => {
    const owner = {};
    const geometry = Geometry.litTriangle();
    const first = new PBRMaterial({ roughness: 0.2 });
    const second = new PBRMaterial({ roughness: 0.8 });
    const items = [
      { geometry, material: first }, { geometry, material: first },
      { geometry, material: second }, { geometry, material: second }
    ];
    try {
      const consolidated = applyRendererOwnedStaticMeshConsolidation({ staticMeshConsolidation: true }, items, owner, flags);
      expect(consolidated).toHaveLength(2);
      const firstMerged = consolidated[0]!.geometry;
      const secondMerged = consolidated[1]!.geometry;
      const disposeOriginal = firstMerged.dispose.bind(firstMerged);
      vi.spyOn(firstMerged, "dispose").mockImplementationOnce(() => { disposeOriginal(); throw new Error("consolidation cleanup failed"); });
      expect(() => disposeBatchPlanCacheFor(owner)).toThrow("consolidation cleanup failed");
      expect(firstMerged.disposed).toBe(true);
      expect(secondMerged.disposed).toBe(true);
      expect(() => disposeBatchPlanCacheFor(owner)).not.toThrow();
      expect(secondMerged.disposed).toBe(true);
      expect(geometry.disposed).toBe(false);
    } finally {
      vi.restoreAllMocks(); disposeBatchPlanCacheFor(owner);
      geometry.dispose(); first.dispose(); second.dispose();
    }
  });

  it("attempts every consolidation disposer, reports all failures, and retries only unfinished geometry", () => {
    const owner = {};
    const source = Geometry.litTriangle();
    const materials = [new PBRMaterial(), new PBRMaterial(), new PBRMaterial()];
    const items = materials.flatMap((material) => [{ geometry: source, material }, { geometry: source, material }]);
    const failureA = new Error("first consolidation disposal failed");
    const failureB = new Error("second consolidation disposal failed");
    try {
      const merged = applyRendererOwnedStaticMeshConsolidation({ staticMeshConsolidation: true }, items, owner, flags)
        .map((item) => item.geometry);
      expect(merged).toHaveLength(3);
      const first = vi.spyOn(merged[0]!, "dispose").mockImplementationOnce(() => { throw failureA; });
      const second = vi.spyOn(merged[1]!, "dispose").mockImplementationOnce(() => { throw failureB; });
      const third = vi.spyOn(merged[2]!, "dispose");
      let failure: unknown;
      try { disposeBatchPlanCacheFor(owner); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toEqual([failureA, failureB]);
      expect(merged.map((geometry) => geometry.disposed)).toEqual([false, false, true]);
      expect(third).toHaveBeenCalledOnce();
      expect(source.disposed).toBe(false);
      expect(materials.every((material) => !material.disposed)).toBe(true);

      expect(() => disposeBatchPlanCacheFor(owner)).not.toThrow();
      expect(merged.every((geometry) => geometry.disposed)).toBe(true);
      expect(first).toHaveBeenCalledTimes(2);
      expect(second).toHaveBeenCalledTimes(2);
      expect(third).toHaveBeenCalledOnce();
      expect(() => disposeBatchPlanCacheFor(owner)).not.toThrow();
    } finally {
      vi.restoreAllMocks(); disposeBatchPlanCacheFor(owner);
      source.dispose(); materials.forEach((material) => material.dispose());
    }
  });

  it("keeps replacement geometries and failed retirement available after a consolidation update throws", () => {
    const source = Geometry.litTriangle();
    const materials = [new PBRMaterial(), new PBRMaterial()];
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
    const items = materials.flatMap((material) => [
      { geometry: source, material, modelMatrix: identity }, { geometry: source, material, modelMatrix: identity }
    ]);
    const cache = createStaticMeshConsolidationCache();
    const previous = cache.consolidate(items).renderItems.map((item) => item.geometry);
    const failure = new Error("old consolidation disposal failed");
    const first = vi.spyOn(previous[0]!, "dispose").mockImplementationOnce(() => { throw failure; });
    const second = vi.spyOn(previous[1]!, "dispose");
    try {
      expect(() => cache.consolidate(items, { labelPrefix: "replacement" })).toThrow(failure);
      expect(previous[0]!.disposed).toBe(false);
      expect(previous[1]!.disposed).toBe(true);
      expect(second).toHaveBeenCalledOnce();
      const replacement = cache.consolidate(items, { labelPrefix: "replacement" });
      expect(replacement.renderItems.every((item) => !item.geometry.disposed)).toBe(true);
      cache.dispose();
      expect(previous[0]!.disposed).toBe(true);
      expect(first).toHaveBeenCalledTimes(2);
      expect(second).toHaveBeenCalledOnce();
      expect(replacement.renderItems.every((item) => item.geometry.disposed)).toBe(true);
      expect(source.disposed).toBe(false);
    } finally {
      first.mockRestore(); second.mockRestore(); cache.dispose();
      source.dispose(); materials.forEach((material) => material.dispose());
    }
  });

  it("reports the original merge failure and still cleans later completed geometries", () => {
    const source = Geometry.litTriangle();
    const invalid = Geometry.litTriangle();
    invalid.indexBuffer!.data[0] = 9;
    const materials = [new PBRMaterial(), new PBRMaterial(), new PBRMaterial()];
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
    const items = [
      ...materials.slice(0, 2).flatMap((material) => [
        { geometry: source, material, modelMatrix: identity }, { geometry: source, material, modelMatrix: identity }
      ]),
      { geometry: source, material: materials[2]!, modelMatrix: identity },
      { geometry: invalid, material: materials[2]!, modelMatrix: identity }
    ];
    const cleanupFailure = new Error("generated merge cleanup failed");
    const disposeOriginal = Geometry.prototype.dispose;
    const generated: Geometry[] = [];
    const dispose = vi.spyOn(Geometry.prototype, "dispose").mockImplementation(function (this: Geometry) {
      if (this !== source && this !== invalid) {
        generated.push(this);
        if (generated.length === 1) throw cleanupFailure;
      }
      disposeOriginal.call(this);
    });
    try {
      let failure: unknown;
      try { consolidateStaticMeshes(items); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors[0]).toBeInstanceOf(RangeError);
      expect((failure as AggregateError).errors[0].message).toMatch(/outside vertex count/);
      expect((failure as AggregateError).errors[1]).toBe(cleanupFailure);
      expect((failure as AggregateError).cause).toBe((failure as AggregateError).errors[0]);
      expect(generated).toHaveLength(2);
      expect(generated.map((geometry) => geometry.disposed)).toEqual([false, true]);
      expect(source.disposed).toBe(false);
      expect(invalid.disposed).toBe(false);
    } finally {
      dispose.mockRestore(); generated.forEach((geometry) => geometry.dispose());
      source.dispose(); invalid.dispose(); materials.forEach((material) => material.dispose());
    }
  });

  it("attempts every partially allocated vertex stream when de-indexing fails", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "normal", components: 3, offset: 0, bufferSlot: 1 }
    ], 12, [{ slot: 1, stride: 12 }]);
    const positions = new VertexBuffer(format, 3);
    const normals = new VertexBuffer(format, 3, 1);
    const source = new Geometry(positions, new IndexBuffer([0, 1, 2], 3), "triangles", undefined, [normals]);
    const readFailure = new Error("source stream read failed");
    const cleanupFailure = new Error("expanded stream cleanup failed");
    const read = vi.spyOn(normals, "readBytes").mockImplementation(() => { throw readFailure; });
    const disposeOriginal = VertexBuffer.prototype.dispose;
    const generated: VertexBuffer[] = [];
    const dispose = vi.spyOn(VertexBuffer.prototype, "dispose").mockImplementation(function (this: VertexBuffer) {
      if (this !== positions && this !== normals) {
        generated.push(this);
        if (generated.length === 1) throw cleanupFailure;
      }
      disposeOriginal.call(this);
    });
    try {
      let failure: unknown;
      try { deindexGeometryToNonIndexed(source); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toEqual([readFailure, cleanupFailure]);
      expect(generated).toHaveLength(2);
      expect(() => generated[0]!.readBytes()).not.toThrow();
      expect(() => generated[1]!.readBytes()).toThrow(/disposed/i);
      expect(source.disposed).toBe(false);
    } finally {
      read.mockRestore(); dispose.mockRestore(); generated.forEach((buffer) => buffer.dispose());
      source.dispose();
    }
  });

  it("preserves a snapshot failure while attempting and retrying every generated cleanup", () => {
    const source = Geometry.litTriangle();
    const materials = [new PBRMaterial(), new PBRMaterial()];
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
    const items = materials.flatMap((material) => [
      { geometry: source, material, modelMatrix: identity }, { geometry: source, material, modelMatrix: identity }
    ]);
    const cache = createStaticMeshConsolidationCache();
    const snapshotFailure = new Error("snapshot read failed");
    const cleanupFailure = new Error("generated geometry cleanup failed");
    const readOriginal = source.vertexBuffer.readBytes.bind(source.vertexBuffer);
    const read = vi.spyOn(source.vertexBuffer, "readBytes").mockImplementation((offset, length) => {
      if (length === 0) throw snapshotFailure;
      return readOriginal(offset, length);
    });
    const disposeOriginal = Geometry.prototype.dispose;
    const generated: Geometry[] = [];
    const dispose = vi.spyOn(Geometry.prototype, "dispose").mockImplementation(function (this: Geometry) {
      if (this !== source) {
        generated.push(this);
        if (generated.length === 1) throw cleanupFailure;
      }
      disposeOriginal.call(this);
    });
    try {
      let failure: unknown;
      try { cache.consolidate(items); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toEqual([snapshotFailure, cleanupFailure]);
      expect(generated).toHaveLength(2);
      expect(generated[0]!.disposed).toBe(false);
      expect(generated[1]!.disposed).toBe(true);
      expect(source.disposed).toBe(false);
      cache.dispose();
      expect(generated[0]!.disposed).toBe(true);
      expect(generated.filter((geometry) => geometry === generated[1])).toHaveLength(1);
    } finally {
      read.mockRestore(); dispose.mockRestore(); cache.dispose();
      source.dispose(); materials.forEach((material) => material.dispose());
    }
  });

  it("rolls back a second device registration failure without disturbing the first device", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const source = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    const registry = new ResourceRegistry();
    pool.pack(source);
    pool.registerForRestore(registry, a);
    const residentA = pool.upload(a);
    const registrationFailure = new Error("second device registration failed");
    const registerOriginal = registry.register.bind(registry);
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      const result = registerOriginal(handle, descriptor);
      if (handle !== pool) throw registrationFailure;
      return result;
    });
    const createOriginal = b.createBuffer.bind(b);
    const created: ReturnType<typeof b.createBuffer>[] = [];
    const create = vi.spyOn(b, "createBuffer").mockImplementation((usage, size, data) => {
      const buffer = createOriginal(usage, size, data);
      created.push(buffer);
      return buffer;
    });
    try {
      expect(() => pool.upload(b)).toThrow(registrationFailure);
      expect(created).toHaveLength(2);
      expect(created.every((buffer) => buffer.disposed)).toBe(true);
      expect(registry.size).toBe(1);
      expect(pool.upload(a).vertexBuffer).toBe(residentA.vertexBuffer);
      expect(await registry.rebuild(b)).toEqual({ rebuilt: 0, refetched: 0, failed: [] });
      expect(residentA.vertexBuffer.disposed).toBe(false);
      register.mockRestore();
      const residentB = pool.upload(b);
      expect(registry.size).toBe(2);
      expect(await registry.rebuild(a)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(residentA.vertexBuffer.disposed).toBe(true);
      expect(residentB.vertexBuffer.disposed).toBe(false);
    } finally {
      register.mockRestore(); create.mockRestore(); pool.dispose();
      source.dispose(); a.dispose(); b.dispose();
    }
    expect(registry.size).toBe(0);
  });

  it("retries unregister after an accepted primary registration fails", async () => {
    const device = new MockRenderDevice();
    const source = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    const registry = new ResourceRegistry();
    pool.pack(source);
    const resident = pool.upload(device);
    const registrationFailure = new Error("primary registration failed");
    const unregisterFailure = new Error("primary rollback unregister failed");
    const registerOriginal = registry.register.bind(registry);
    const unregisterOriginal = registry.unregister.bind(registry);
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      registerOriginal(handle, descriptor);
      throw registrationFailure;
    });
    let failUnregister = true;
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      if (failUnregister) throw unregisterFailure;
      unregisterOriginal(handle);
    });
    const createBuffer = vi.spyOn(device, "createBuffer");
    try {
      expect(() => pool.registerForRestore(registry, device)).toThrow(registrationFailure);
      expect(unregister).toHaveBeenCalledOnce();
      expect(registry.size).toBe(1);
      createBuffer.mockClear();
      expect(await registry.rebuild(device)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(createBuffer).not.toHaveBeenCalled();
      expect(resident.vertexBuffer.disposed).toBe(false);
      failUnregister = false;
      pool.dispose();
      expect(unregister).toHaveBeenCalledTimes(2);
      expect(registry.size).toBe(0);
      expect(resident.vertexBuffer.disposed).toBe(true);
    } finally {
      register.mockRestore(); unregister.mockRestore(); createBuffer.mockRestore();
      unregisterOriginal(pool); pool.dispose(); source.dispose(); device.dispose();
    }
  });

  it("retries a failed secondary-registration rollback without disturbing the first device", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const source = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    const registry = new ResourceRegistry();
    pool.pack(source);
    pool.registerForRestore(registry, a);
    const residentA = pool.upload(a);
    const registrationFailure = new Error("secondary registration failed");
    const registerOriginal = registry.register.bind(registry);
    const unregisterOriginal = registry.unregister.bind(registry);
    let failedHandle: object | undefined;
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      registerOriginal(handle, descriptor);
      if (handle !== pool) {
        failedHandle = handle;
        throw registrationFailure;
      }
      return handle;
    });
    let failUnregister = true;
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      if (handle === failedHandle && failUnregister) throw new Error("secondary rollback unregister failed");
      unregisterOriginal(handle);
    });
    const createB = vi.spyOn(b, "createBuffer");
    try {
      expect(() => pool.upload(b)).toThrow(registrationFailure);
      expect(failedHandle).toBeDefined();
      expect(registry.size).toBe(2);
      createB.mockClear();
      expect(await registry.rebuild(b)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(createB).not.toHaveBeenCalled();
      expect(pool.upload(a).vertexBuffer).toBe(residentA.vertexBuffer);
      expect(residentA.vertexBuffer.disposed).toBe(false);
      failUnregister = false;
      pool.dispose();
      expect(unregister.mock.calls.filter(([handle]) => handle === failedHandle)).toHaveLength(2);
      expect(unregister.mock.calls.filter(([handle]) => handle === pool)).toHaveLength(1);
      expect(registry.size).toBe(0);
      expect(residentA.vertexBuffer.disposed).toBe(true);
    } finally {
      register.mockRestore(); unregister.mockRestore(); createB.mockRestore();
      if (failedHandle) unregisterOriginal(failedHandle);
      unregisterOriginal(pool); pool.dispose(); source.dispose(); a.dispose(); b.dispose();
    }
  });

  it("keeps the pool intact when registration rollback reenters disposal or packing", async () => {
    const device = new MockRenderDevice();
    const source = Geometry.litTriangle();
    const extra = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    const registry = new ResourceRegistry();
    pool.pack(source);
    const resident = pool.upload(device);
    const failure = new Error("registration failed");
    const registerOriginal = registry.register.bind(registry);
    const unregisterOriginal = registry.unregister.bind(registry);
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      registerOriginal(handle, descriptor);
      throw failure;
    });
    const reentrantErrors: unknown[] = [];
    const unregister = vi.spyOn(registry, "unregister").mockImplementation(() => {
      try { pool.dispose(); } catch (error) { reentrantErrors.push(error); }
      try { pool.pack(extra); } catch (error) { reentrantErrors.push(error); }
      throw new Error("rollback unregister failed");
    });
    try {
      expect(() => pool.registerForRestore(registry, device)).toThrow(failure);
      expect(reentrantErrors).toHaveLength(2);
      expect(reentrantErrors.every((error) => /during restore registration/i.test(String(error)))).toBe(true);
      expect(pool.geometries()).toEqual([source]);
      expect(resident.vertexBuffer.disposed).toBe(false);
      expect(await registry.rebuild(device)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(resident.vertexBuffer.disposed).toBe(false);
      register.mockRestore(); unregister.mockRestore();
      pool.dispose();
      expect(registry.size).toBe(0);
      expect(resident.vertexBuffer.disposed).toBe(true);
    } finally {
      register.mockRestore(); unregister.mockRestore();
      unregisterOriginal(pool); pool.dispose(); source.dispose(); extra.dispose(); device.dispose();
    }
  });

  it("does not dirty a live arena when restore reenters during registration", async () => {
    const device = new MockRenderDevice();
    const source = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    const registry = new ResourceRegistry();
    pool.pack(source);
    const resident = pool.upload(device);
    const registerOriginal = registry.register.bind(registry);
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      const registered = registerOriginal(handle, descriptor);
      if (handle === pool) expect(() => descriptor.rebuild()).toThrow(/during restore registration/i);
      return registered;
    });
    try {
      pool.registerForRestore(registry, device);
      expect(pool.upload(device).vertexBuffer).toBe(resident.vertexBuffer);
      expect(resident.vertexBuffer.disposed).toBe(false);
      expect(await registry.rebuild(device)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(resident.vertexBuffer.disposed).toBe(true);
    } finally {
      register.mockRestore(); pool.dispose(); source.dispose(); device.dispose();
    }
  });

  it("retries failed pool disposal while retiring other devices and materializations immediately", () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const source = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    pool.pack(source);
    const residentA = pool.upload(a);
    const residentB = pool.upload(b);
    const geometry = pool.asGeometry();
    const failure = new Error("first device retirement failed");
    const vertexA = vi.spyOn(residentA.vertexBuffer, "dispose").mockImplementationOnce(() => { throw failure; });
    const indexA = vi.spyOn(residentA.indexBuffer!, "dispose");
    const vertexB = vi.spyOn(residentB.vertexBuffer, "dispose");
    const indexB = vi.spyOn(residentB.indexBuffer!, "dispose");
    const materialized = vi.spyOn(geometry, "dispose");
    try {
      let thrown: unknown;
      try { pool.dispose(); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(AggregateError);
      expect(((thrown as AggregateError).errors[0] as AggregateError).errors).toEqual([failure]);
      expect(residentA.vertexBuffer.disposed).toBe(false);
      expect(residentA.indexBuffer!.disposed).toBe(true);
      expect(residentB.vertexBuffer.disposed).toBe(true);
      expect(residentB.indexBuffer!.disposed).toBe(true);
      expect(geometry.disposed).toBe(true);
      expect(() => pool.dispose()).not.toThrow();
      expect(residentA.vertexBuffer.disposed).toBe(true);
      expect(vertexA).toHaveBeenCalledTimes(2);
      expect(indexA).toHaveBeenCalledOnce();
      expect(vertexB).toHaveBeenCalledOnce();
      expect(indexB).toHaveBeenCalledOnce();
      expect(materialized).toHaveBeenCalledOnce();
      expect(source.disposed).toBe(false);
    } finally {
      vertexA.mockRestore(); indexA.mockRestore(); vertexB.mockRestore(); indexB.mockRestore(); materialized.mockRestore();
      pool.dispose(); source.dispose(); a.dispose(); b.dispose();
    }
  });

  it("retries only failed per-device unregisters while leaving their old callbacks inert", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const source = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    const registry = new ResourceRegistry();
    pool.pack(source);
    pool.registerForRestore(registry, a);
    const residentA = pool.upload(a);
    const residentB = pool.upload(b);
    const unregisterOriginal = registry.unregister.bind(registry);
    const failure = new Error("primary unregister failed");
    let failPrimary = true;
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      if (handle === pool && failPrimary) throw failure;
      unregisterOriginal(handle);
    });
    const createA = vi.spyOn(a, "createBuffer");
    const createB = vi.spyOn(b, "createBuffer");
    const vertexA = vi.spyOn(residentA.vertexBuffer, "dispose");
    const vertexB = vi.spyOn(residentB.vertexBuffer, "dispose");
    try {
      let firstError: unknown;
      try { pool.dispose(); } catch (error) { firstError = error; }
      expect(firstError).toBeInstanceOf(AggregateError);
      expect((firstError as AggregateError).errors).toEqual([failure]);
      expect(unregister).toHaveBeenCalledTimes(2);
      const secondaryHandle = unregister.mock.calls[1]![0];
      expect(secondaryHandle).not.toBe(pool);
      expect(registry.size).toBe(1);
      expect(residentA.vertexBuffer.disposed).toBe(true);
      expect(residentB.vertexBuffer.disposed).toBe(true);
      createA.mockClear(); createB.mockClear();
      await registry.rebuild(a);
      expect(await registry.rebuild(b)).toEqual({ rebuilt: 0, refetched: 0, failed: [] });
      expect(createA).not.toHaveBeenCalled();
      expect(createB).not.toHaveBeenCalled();
      expect(pool.stats().geometries).toBe(0);
      expect(() => pool.dispose()).toThrow(/disposal failed/i);
      expect(unregister.mock.calls.map(([handle]) => handle)).toEqual([pool, secondaryHandle, pool]);
      expect(registry.size).toBe(1);
      failPrimary = false;
      expect(() => pool.dispose()).not.toThrow();
      expect(unregister.mock.calls.map(([handle]) => handle)).toEqual([pool, secondaryHandle, pool, pool]);
      expect(registry.size).toBe(0);
      expect(vertexA).toHaveBeenCalledOnce();
      expect(vertexB).toHaveBeenCalledOnce();
      expect(() => pool.dispose()).not.toThrow();
      expect(unregister).toHaveBeenCalledTimes(4);
    } finally {
      createA.mockRestore(); createB.mockRestore(); vertexA.mockRestore(); vertexB.mockRestore();
      unregister.mockRestore(); unregisterOriginal(pool);
      pool.dispose(); source.dispose(); a.dispose(); b.dispose();
    }
    expect(registry.size).toBe(0);
  });

  it("aggregates unregister and buffer failures while retrying only unfinished work", () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const c = new MockRenderDevice();
    const source = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    const registry = new ResourceRegistry();
    pool.pack(source);
    pool.registerForRestore(registry, a);
    const residentA = pool.upload(a);
    const residentB = pool.upload(b);
    const residentC = pool.upload(c);
    const primaryFailure = new Error("primary unregister failed");
    const secondaryFailure = new Error("secondary unregister failed");
    const bufferFailure = new Error("vertex retirement failed");
    const unregisterOriginal = registry.unregister.bind(registry);
    let failedSecondary: object | undefined;
    let failUnregister = true;
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      if (handle !== pool && !failedSecondary) failedSecondary = handle;
      if (failUnregister && handle === pool) throw primaryFailure;
      if (failUnregister && handle === failedSecondary) throw secondaryFailure;
      unregisterOriginal(handle);
    });
    const vertexA = vi.spyOn(residentA.vertexBuffer, "dispose").mockImplementationOnce(() => { throw bufferFailure; });
    const vertexB = vi.spyOn(residentB.vertexBuffer, "dispose");
    const vertexC = vi.spyOn(residentC.vertexBuffer, "dispose");
    try {
      let error: unknown;
      try { pool.dispose(); } catch (caught) { error = caught; }
      expect(error).toBeInstanceOf(AggregateError);
      const errors = (error as AggregateError).errors;
      expect(errors.slice(0, 2)).toEqual([primaryFailure, secondaryFailure]);
      expect(errors[2]).toBeInstanceOf(AggregateError);
      expect((errors[2] as AggregateError).errors).toEqual([bufferFailure]);
      expect(unregister).toHaveBeenCalledTimes(3);
      const successfulHandle = unregister.mock.calls[2]![0];
      expect(successfulHandle).not.toBe(failedSecondary);
      expect(registry.size).toBe(2);
      expect(residentA.vertexBuffer.disposed).toBe(false);
      expect(residentA.indexBuffer!.disposed).toBe(true);
      expect(residentB.vertexBuffer.disposed).toBe(true);
      expect(residentC.vertexBuffer.disposed).toBe(true);
      failUnregister = false;
      pool.dispose();
      expect(registry.size).toBe(0);
      expect(residentA.vertexBuffer.disposed).toBe(true);
      expect(unregister.mock.calls.filter(([handle]) => handle === pool)).toHaveLength(2);
      expect(unregister.mock.calls.filter(([handle]) => handle === failedSecondary)).toHaveLength(2);
      expect(unregister.mock.calls.filter(([handle]) => handle === successfulHandle)).toHaveLength(1);
      expect(vertexA).toHaveBeenCalledTimes(2);
      expect(vertexB).toHaveBeenCalledOnce();
      expect(vertexC).toHaveBeenCalledOnce();
    } finally {
      const handles = unregister.mock.calls.map(([handle]) => handle);
      unregister.mockRestore(); vertexA.mockRestore(); vertexB.mockRestore(); vertexC.mockRestore();
      for (const handle of handles) unregisterOriginal(handle);
      pool.dispose(); source.dispose(); a.dispose(); b.dispose(); c.dispose();
    }
  });

  it("retains a failed unregister if the optional method temporarily disappears", () => {
    const device = new MockRenderDevice();
    const source = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    const delegate = new ResourceRegistry();
    const registry = {
      register<T extends object>(handle: T, descriptor: Parameters<ResourceRegistry["register"]>[1]): T {
        return delegate.register(handle, descriptor);
      },
      unregister: ((_: object) => { throw new Error("unregister failed"); }) as ((handle: object) => void) | undefined
    };
    pool.pack(source);
    pool.registerForRestore(registry, device);
    pool.upload(device);
    try {
      expect(() => pool.dispose()).toThrow(/disposal failed/i);
      expect(delegate.size).toBe(1);
      registry.unregister = undefined;
      expect(() => pool.dispose()).toThrow(/disposal failed/i);
      expect(delegate.size).toBe(1);
      registry.unregister = delegate.unregister.bind(delegate);
      expect(() => pool.dispose()).not.toThrow();
      expect(delegate.size).toBe(0);
    } finally {
      registry.unregister = delegate.unregister.bind(delegate);
      delegate.unregister(pool); pool.dispose(); source.dispose(); device.dispose();
    }
  });

  it("keeps retired callbacks inert for a registration-only registry", async () => {
    const device = new MockRenderDevice();
    const source = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    const delegate = new ResourceRegistry();
    const registrationOnly = {
      register<T extends object>(handle: T, descriptor: Parameters<ResourceRegistry["register"]>[1]): T {
        return delegate.register(handle, descriptor);
      }
    };
    pool.pack(source);
    pool.registerForRestore(registrationOnly, device);
    const resident = pool.upload(device);
    const createBuffer = vi.spyOn(device, "createBuffer");
    try {
      expect(() => pool.dispose()).not.toThrow();
      expect(resident.vertexBuffer.disposed).toBe(true);
      expect(delegate.size).toBe(1);
      createBuffer.mockClear();
      expect(await delegate.rebuild(device)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(createBuffer).not.toHaveBeenCalled();
      expect(() => pool.dispose()).not.toThrow();
    } finally {
      createBuffer.mockRestore(); delegate.unregister(pool);
      pool.dispose(); source.dispose(); device.dispose();
    }
  });

  it("blocks reentrant mutation during unregister while allowing reentrant disposal", () => {
    const device = new MockRenderDevice();
    const source = Geometry.litTriangle();
    const extra = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    const registry = new ResourceRegistry();
    pool.pack(source);
    pool.registerForRestore(registry, device);
    const resident = pool.upload(device);
    const disposeVertex = vi.spyOn(resident.vertexBuffer, "dispose");
    const unregisterOriginal = registry.unregister.bind(registry);
    const reentrantErrors: unknown[] = [];
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      pool.dispose();
      try { pool.pack(extra); } catch (error) { reentrantErrors.push(error); }
      try { pool.registerForRestore(registry, device); } catch (error) { reentrantErrors.push(error); }
      unregisterOriginal(handle);
    });
    try {
      expect(() => pool.dispose()).not.toThrow();
      expect(unregister).toHaveBeenCalledOnce();
      expect(reentrantErrors).toHaveLength(2);
      expect(reentrantErrors.every((error) => /during disposal/i.test(String(error)))).toBe(true);
      expect(disposeVertex).toHaveBeenCalledOnce();
      expect(registry.size).toBe(0);
      expect(pool.stats().geometries).toBe(0);
      expect(source.disposed).toBe(false);
      expect(extra.disposed).toBe(false);
    } finally {
      unregister.mockRestore(); disposeVertex.mockRestore();
      unregisterOriginal(pool); pool.dispose(); source.dispose(); extra.dispose(); device.dispose();
    }
  });

  it("retains failed lease cleanup when a disposer reenters lease release", () => {
    const device = new MockRenderDevice();
    const source = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    pool.pack(source);
    const lease = pool.retainGeneration();
    const resident = pool.upload(device);
    const failure = new Error("reentrant lease disposal failed");
    const vertex = vi.spyOn(resident.vertexBuffer, "dispose").mockImplementationOnce(() => {
      lease.release();
      throw failure;
    });
    const index = vi.spyOn(resident.indexBuffer!, "dispose");
    try {
      pool.dispose();
      let error: unknown;
      try { lease.release(); } catch (caught) { error = caught; }
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([failure]);
      expect(resident.vertexBuffer.disposed).toBe(false);
      expect(resident.indexBuffer!.disposed).toBe(true);
      expect(() => pool.dispose()).not.toThrow();
      expect(resident.vertexBuffer.disposed).toBe(true);
      expect(vertex).toHaveBeenCalledTimes(2);
      expect(index).toHaveBeenCalledOnce();
    } finally {
      vertex.mockRestore(); index.mockRestore();
      lease.release(); pool.dispose(); source.dispose(); device.dispose();
    }
  });

  it("retries failed lease cleanup without skipping the other retired resources", () => {
    const device = new MockRenderDevice();
    const source = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    pool.pack(source);
    const lease = pool.retainGeneration();
    const resident = pool.upload(device);
    const vertexFailure = new Error("leased vertex retirement failed");
    const geometryFailure = new Error("leased geometry retirement failed");
    const vertex = vi.spyOn(resident.vertexBuffer, "dispose").mockImplementationOnce(() => { throw vertexFailure; });
    const index = vi.spyOn(resident.indexBuffer!, "dispose");
    const materialized = vi.spyOn(lease.geometry, "dispose").mockImplementationOnce(() => { throw geometryFailure; });
    try {
      pool.dispose();
      let failure: unknown;
      try { lease.release(); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toEqual([vertexFailure, geometryFailure]);
      expect(index).toHaveBeenCalledOnce();
      expect(resident.indexBuffer!.disposed).toBe(true);
      expect(resident.vertexBuffer.disposed).toBe(false);
      expect(lease.geometry.disposed).toBe(false);
      expect(() => lease.release()).not.toThrow();
      expect(resident.vertexBuffer.disposed).toBe(true);
      expect(lease.geometry.disposed).toBe(true);
      expect(vertex).toHaveBeenCalledTimes(2);
      expect(materialized).toHaveBeenCalledTimes(2);
      expect(index).toHaveBeenCalledOnce();
      expect(source.disposed).toBe(false);
    } finally {
      vertex.mockRestore(); index.mockRestore(); materialized.mockRestore();
      lease.release(); pool.dispose(); source.dispose(); device.dispose();
    }
  });

  it("retires pool resources even if unregister throws, without reviving a stale handle", async () => {
    const registry = new ResourceRegistry();
    const unregisterOriginal = registry.unregister.bind(registry);
    const device = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    pool.pack(geometry);
    pool.registerForRestore(registry, device);
    const resident = pool.upload(device).vertexBuffer;
    const materialized = pool.asGeometry();
    const materializedBuffer = materialized.vertexBuffer.upload(device);
    let failUnregister = true;
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      if (failUnregister) throw new Error("unregister failed");
      unregisterOriginal(handle);
    });
    const upload = vi.spyOn(pool, "upload");
    try {
      expect(() => pool.dispose()).toThrow(/disposal failed/i);
      expect(resident.disposed).toBe(true);
      expect(materialized.disposed).toBe(true);
      expect(materializedBuffer.disposed).toBe(true);
      expect(pool.stats().geometries).toBe(0);
      expect(() => pool.dispose()).toThrow(/disposal failed/i);
      await registry.rebuild(device);
      expect(upload).not.toHaveBeenCalled();
      expect(pool.stats().geometries).toBe(0);
      failUnregister = false;
      expect(() => pool.dispose()).not.toThrow();
      expect(registry.size).toBe(0);
      expect(unregister).toHaveBeenCalledTimes(3);
    } finally {
      upload.mockRestore(); unregister.mockRestore(); unregisterOriginal(pool);
      pool.dispose(); geometry.dispose(); device.dispose();
    }
  });

  it("preserves the original allocation failure and retries cleanup of a partially allocated arena", async () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const batch = buildMultiDrawBatch({
      key: "allocation", programKey: "allocation", vertexLayoutKey: "allocation", members: [{ geometry, material }]
    }, undefined, a);
    const resident = batch.pool.upload(a);
    const texture = batch.drawData.upload();
    const revision = texture.revision;
    const createBufferOriginal = b.createBuffer.bind(b);
    let partial: ReturnType<typeof b.createBuffer> | undefined;
    const createBuffer = vi.spyOn(b, "createBuffer").mockImplementation((usage, size, data) => {
      if (usage === "index") throw new Error("index allocation failed");
      partial = createBufferOriginal(usage, size, data);
      vi.spyOn(partial, "dispose").mockImplementationOnce(() => { throw new Error("cleanup failed"); });
      return partial;
    });
    try {
      expect(() => batch.pool.upload(b)).toThrow("index allocation failed");
      expect(partial!.disposed).toBe(false);
      expect(resident.vertexBuffer.disposed).toBe(false);
      expect(await sharedResourceRegistry().rebuild(b)).toEqual({ rebuilt: 0, refetched: 0, failed: [] });
      expect(texture.revision).toBe(revision);
      batch.pool.dispose();
      expect(partial!.disposed).toBe(true);
      expect(resident.vertexBuffer.disposed).toBe(true);
    } finally {
      createBuffer.mockRestore(); batch.drawData.dispose(); batch.pool.dispose();
      geometry.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
  });

  it("finishes replacing both arenas if one old buffer's disposal throws", () => {
    const device = new MockRenderDevice();
    const first = Geometry.litTriangle();
    const second = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    pool.pack(first);
    const original = pool.upload(device);
    const vertexDispose = vi.spyOn(original.vertexBuffer, "dispose").mockImplementationOnce(() => {
      throw new Error("old vertex disposal failed");
    });
    const indexDispose = vi.spyOn(original.indexBuffer!, "dispose");
    try {
      pool.pack(second);
      expect(() => pool.upload(device)).toThrow(/arena retirement failed/i);
      expect(indexDispose).toHaveBeenCalledOnce();
      expect(original.indexBuffer!.disposed).toBe(true);
      const replacement = pool.upload(device);
      expect(replacement.vertexBuffer).not.toBe(original.vertexBuffer);
      expect(replacement.vertexBuffer.disposed).toBe(false);
      expect(replacement.indexBuffer!.disposed).toBe(false);
      pool.dispose();
      expect(original.vertexBuffer.disposed).toBe(true);
      expect(replacement.vertexBuffer.disposed).toBe(true);
      expect(replacement.indexBuffer!.disposed).toBe(true);
    } finally {
      vertexDispose.mockRestore(); indexDispose.mockRestore();
      pool.dispose(); first.dispose(); second.dispose(); device.dispose();
    }
  });

  it("leaves a failed draw-data registration inert when unregister also throws", async () => {
    const registry = new ResourceRegistry();
    const registerOriginal = registry.register.bind(registry);
    const unregisterOriginal = registry.unregister.bind(registry);
    const device = new MockRenderDevice();
    const data = new DrawDataTexture(1);
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      registerOriginal(handle, descriptor);
      throw new Error("registration failed");
    });
    const unregister = vi.spyOn(registry, "unregister").mockImplementation(() => { throw new Error("unregister failed"); });
    const upload = vi.spyOn(data, "upload");
    try {
      expect(() => data.registerForRestore(registry, device)).toThrow("registration failed");
      expect(registry.size).toBe(1);
      await registry.rebuild(device);
      expect(upload).not.toHaveBeenCalled();
      unregister.mockRestore(); unregisterOriginal(data); register.mockRestore();
      data.registerForRestore(registry, device);
      expect(registry.size).toBe(1);
    } finally {
      upload.mockRestore(); unregister.mockRestore(); register.mockRestore();
      unregisterOriginal(data); data.dispose(); device.dispose();
    }
    expect(registry.size).toBe(0);
  });

  it("retires draw data even when unregister throws and leaves its old callback inert", async () => {
    const registry = new ResourceRegistry();
    const unregisterOriginal = registry.unregister.bind(registry);
    const device = new MockRenderDevice();
    const data = new DrawDataTexture(1);
    data.registerForRestore(registry, device);
    const texture = data.upload();
    const upload = vi.spyOn(data, "upload");
    const unregister = vi.spyOn(registry, "unregister").mockImplementation(() => { throw new Error("unregister failed"); });
    try {
      expect(() => data.dispose()).toThrow(/disposal failed/i);
      expect(texture.disposed).toBe(true);
      expect(() => data.dispose()).toThrow(/disposal failed/i);
      await registry.rebuild(device);
      expect(upload).not.toHaveBeenCalled();
      unregister.mockRestore();
      expect(() => data.dispose()).not.toThrow();
      expect(registry.size).toBe(0);
    } finally {
      upload.mockRestore(); unregister.mockRestore(); unregisterOriginal(data);
      data.dispose(); device.dispose();
    }
  });

  it("applies the same device filter in the contract stub while retaining unowned compatibility", async () => {
    const registry = resourceRegistrySlot.stub();
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const rebuildA = vi.fn();
    const rebuildB = vi.fn();
    const legacy = vi.fn();
    registry.register({}, { kind: "a", device: a, rebuild: rebuildA });
    registry.register({}, { kind: "b", device: b, rebuild: rebuildB });
    registry.register({}, { kind: "legacy", rebuild: legacy });
    try {
      expect(await registry.rebuild(a)).toEqual({ rebuilt: 2, refetched: 0, failed: [] });
      expect(rebuildA).toHaveBeenCalledOnce();
      expect(rebuildB).not.toHaveBeenCalled();
      expect(legacy).toHaveBeenCalledOnce();
      expect(await registry.rebuild(b)).toEqual({ rebuilt: 2, refetched: 0, failed: [] });
      expect(rebuildA).toHaveBeenCalledOnce();
      expect(rebuildB).toHaveBeenCalledOnce();
      expect(legacy).toHaveBeenCalledTimes(2);
    } finally {
      a.dispose(); b.dispose();
    }
  });
});
