import { describe, expect, it, vi } from "vitest";

import { Geometry } from "../../../packages/rendering/src/Geometry";
import { InstancedPBRMaterial } from "../../../packages/rendering/src/InstancedPBRMaterial";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import type { Texture } from "../../../packages/rendering/src/Texture";
import { BatchedGeometryPool } from "../../../packages/rendering/src/batching/BatchedGeometryPool";
import { DrawDataTexture } from "../../../packages/rendering/src/batching/DrawDataTexture";
import { buildMultiDrawBatch, MultiDrawBatchBuildError } from "../../../packages/rendering/src/batching/MultiDrawBatch";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { applyRendererOwnedStaticMeshConsolidation, batchPlanCacheFor, BatchPlanCache, disposeBatchPlanCacheFor } from "../../../packages/rendering/src/renderer/CullingBatching";
import { ResourceRegistry, sharedResourceRegistry } from "../../../packages/rendering/src/resources/ResourceRegistry";

const flags = createTrustedQrFlags({});
const multiDrawOptions = { flags, instancing: false, multiDrawAvailable: true } as const;
const instancingOptions = { flags, multiDraw: false } as const;
type PackedItem = RenderItem & { readonly multiDraw: { readonly drawData: Texture } };

describe("batch parent cleanup retries", () => {
  it("retries draw-data unregister and texture disposal independently without touching another device", async () => {
    const registry = new ResourceRegistry();
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const first = new DrawDataTexture(1);
    const second = new DrawDataTexture(1);
    first.registerForRestore(registry, a);
    second.registerForRestore(registry, b);
    const textureA = first.upload();
    const textureB = second.upload();
    const revisionA = textureA.revision;
    const revisionB = textureB.revision;
    const unregisterFailure = new Error("first unregister failed");
    const textureFailure = new Error("first texture disposal failed");
    const unregisterOriginal = registry.unregister.bind(registry);
    let failUnregister = true;
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      if (handle === first && failUnregister) throw unregisterFailure;
      unregisterOriginal(handle);
    });
    const disposeA = vi.spyOn(textureA, "dispose").mockImplementationOnce(() => { throw textureFailure; });
    const disposeB = vi.spyOn(textureB, "dispose");
    try {
      let failure: unknown;
      try { first.dispose(); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toEqual([unregisterFailure, textureFailure]);
      expect(textureA.disposed).toBe(false);
      expect(registry.size).toBe(2);
      await registry.rebuild(a);
      expect(textureA.revision).toBe(revisionA);
      expect(textureB.revision).toBe(revisionB);
      expect((await registry.rebuild(b)).failed).toEqual([]);
      expect(textureB.revision).toBeGreaterThan(revisionB);

      expect(() => first.dispose()).toThrow(/disposal failed/i);
      expect(textureA.disposed).toBe(true);
      expect(disposeA).toHaveBeenCalledTimes(2);
      failUnregister = false;
      expect(() => first.dispose()).not.toThrow();
      expect(registry.size).toBe(1);
      expect(disposeA).toHaveBeenCalledTimes(2);
      expect(disposeB).not.toHaveBeenCalled();
      expect(textureB.disposed).toBe(false);
      expect(unregister.mock.calls.filter(([handle]) => handle === second)).toHaveLength(0);
    } finally {
      unregister.mockRestore(); disposeA.mockRestore(); disposeB.mockRestore();
      unregisterOriginal(first); first.dispose(); second.dispose();
      textureA.dispose(); textureB.dispose(); a.dispose(); b.dispose();
    }
  });

  it("keeps a new same-registry lifetime distinct from a failed registration rollback", async () => {
    const registry = new ResourceRegistry();
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const data = new DrawDataTexture(1);
    const registrationFailure = new Error("registration failed after accepting draw data");
    const registerOriginal = registry.register.bind(registry);
    const unregisterOriginal = registry.unregister.bind(registry);
    const handles: object[] = [];
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      handles.push(handle);
      const result = registerOriginal(handle, descriptor);
      if (handle === data) throw registrationFailure;
      return result;
    });
    let failOld = true;
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      if (handle === data && failOld) throw new Error("old unregister failed");
      unregisterOriginal(handle);
    });
    try {
      expect(() => data.registerForRestore(registry, a)).toThrow(registrationFailure);
      register.mockRestore();
      const record = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
        handles.push(handle);
        return registerOriginal(handle, descriptor);
      });
      data.registerForRestore(registry, b);
      const live = data.upload();
      const revision = live.revision;
      expect(handles[0]).toBe(data);
      expect(handles[1]).not.toBe(data);
      expect(registry.size).toBe(2);
      expect((await registry.rebuild(a)).failed).toEqual([]);
      expect(live.revision).toBe(revision);
      expect((await registry.rebuild(b)).failed).toEqual([]);
      expect(live.revision).toBeGreaterThan(revision);
      failOld = false;
      data.dispose();
      expect(registry.size).toBe(0);
      record.mockRestore();
    } finally {
      register.mockRestore(); unregister.mockRestore();
      for (const handle of handles) unregisterOriginal(handle);
      data.dispose(); a.dispose(); b.dispose();
    }
  });

  it("retains an unregister retry when the optional method temporarily disappears", () => {
    const delegate = new ResourceRegistry();
    const device = new MockRenderDevice();
    const data = new DrawDataTexture(1);
    const registry = {
      register<T extends object>(handle: T, descriptor: Parameters<ResourceRegistry["register"]>[1]): T {
        return delegate.register(handle, descriptor);
      },
      unregister: ((_: object) => { throw new Error("unregister unavailable"); }) as ((handle: object) => void) | undefined
    };
    data.registerForRestore(registry, device);
    try {
      expect(() => data.dispose()).toThrow(/disposal failed/i);
      registry.unregister = undefined;
      expect(() => data.dispose()).toThrow(/disposal failed/i);
      expect(delegate.size).toBe(1);
      registry.unregister = delegate.unregister.bind(delegate);
      data.dispose();
      expect(delegate.size).toBe(0);
    } finally {
      registry.unregister = delegate.unregister.bind(delegate);
      data.dispose(); delegate.unregister(data); device.dispose();
    }
  });

  it("does not repeat a texture disposal that completed before throwing", () => {
    const data = new DrawDataTexture(1);
    const texture = data.upload();
    const originalDispose = texture.dispose.bind(texture);
    const dispose = vi.spyOn(texture, "dispose").mockImplementation(() => {
      originalDispose();
      throw new Error("notification failed after disposal");
    });
    try {
      expect(() => data.dispose()).toThrow(/disposal failed/i);
      expect(texture.disposed).toBe(true);
      expect(() => data.dispose()).not.toThrow();
      expect(dispose).toHaveBeenCalledOnce();
    } finally {
      dispose.mockRestore(); data.dispose(); texture.dispose();
    }
  });

  it("retries an old registry without repeating the new registry's successful cleanup", async () => {
    const oldRegistry = new ResourceRegistry();
    const newRegistry = new ResourceRegistry();
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const data = new DrawDataTexture(1);
    const oldUnregisterOriginal = oldRegistry.unregister.bind(oldRegistry);
    let failOld = true;
    const oldUnregister = vi.spyOn(oldRegistry, "unregister").mockImplementation((handle) => {
      if (failOld) throw new Error("old registry unavailable");
      oldUnregisterOriginal(handle);
    });
    const newUnregister = vi.spyOn(newRegistry, "unregister");
    try {
      data.registerForRestore(oldRegistry, a);
      const oldTexture = data.upload();
      expect(() => data.dispose()).toThrow(/disposal failed/i);
      expect(oldTexture.disposed).toBe(true);
      data.registerForRestore(newRegistry, b);
      const nextTexture = data.upload();
      const revision = nextTexture.revision;
      expect((await oldRegistry.rebuild(a)).failed).toEqual([]);
      expect(nextTexture.revision).toBe(revision);
      expect((await newRegistry.rebuild(b)).rebuilt).toBe(1);
      expect(nextTexture.revision).toBeGreaterThan(revision);
      expect(() => data.dispose()).toThrow(/disposal failed/i);
      expect(nextTexture.disposed).toBe(true);
      expect(newRegistry.size).toBe(0);
      expect(newUnregister).toHaveBeenCalledOnce();
      failOld = false;
      data.dispose();
      expect(oldRegistry.size).toBe(0);
      expect(newUnregister).toHaveBeenCalledOnce();
    } finally {
      oldUnregister.mockRestore(); newUnregister.mockRestore();
      oldUnregisterOriginal(data); data.dispose(); a.dispose(); b.dispose();
    }
  });

  it("keeps registration-only callbacks inert after disposal", async () => {
    const delegate = new ResourceRegistry();
    const device = new MockRenderDevice();
    const data = new DrawDataTexture(1);
    const registry = {
      register<T extends object>(handle: T, descriptor: Parameters<ResourceRegistry["register"]>[1]): T {
        return delegate.register(handle, descriptor);
      }
    };
    data.registerForRestore(registry, device);
    const texture = data.upload();
    const upload = vi.spyOn(data, "upload");
    try {
      data.dispose();
      expect(texture.disposed).toBe(true);
      expect(delegate.size).toBe(1);
      expect(await delegate.rebuild(device)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(upload).not.toHaveBeenCalled();
      expect(() => data.dispose()).not.toThrow();
    } finally {
      upload.mockRestore(); delegate.unregister(data); data.dispose(); device.dispose();
    }
  });

  it("blocks reentrant draw-data mutation during registration and disposal", () => {
    const registry = new ResourceRegistry();
    const device = new MockRenderDevice();
    const data = new DrawDataTexture(1);
    const registerOriginal = registry.register.bind(registry);
    const unregisterOriginal = registry.unregister.bind(registry);
    const registrationErrors: unknown[] = [];
    const disposalErrors: unknown[] = [];
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      try { data.dispose(); } catch (error) { registrationErrors.push(error); }
      try { data.registerForRestore(registry, device); } catch (error) { registrationErrors.push(error); }
      return registerOriginal(handle, descriptor);
    });
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      data.dispose();
      try { data.upload(); } catch (error) { disposalErrors.push(error); }
      try { data.registerForRestore(registry, device); } catch (error) { disposalErrors.push(error); }
      unregisterOriginal(handle);
    });
    try {
      data.registerForRestore(registry, device);
      const texture = data.upload();
      data.dispose();
      expect(registrationErrors).toHaveLength(2);
      expect(registrationErrors.every((error) => /during restore registration/i.test(String(error)))).toBe(true);
      expect(disposalErrors).toHaveLength(2);
      expect(disposalErrors.every((error) => /during disposal/i.test(String(error)))).toBe(true);
      expect(unregister).toHaveBeenCalledOnce();
      expect(texture.disposed).toBe(true);
      expect(registry.size).toBe(0);
    } finally {
      register.mockRestore(); unregister.mockRestore(); unregisterOriginal(data); data.dispose(); device.dispose();
    }
  });

  it("lets a failed standalone build retry its own cleanup without disposing a borrowed pool", () => {
    const registry = sharedResourceRegistry();
    const baseline = registry.size;
    const poolRegistry = new ResourceRegistry();
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const original = Geometry.litTriangle();
    const added = Geometry.litTriangle();
    const material = new PBRMaterial();
    const pool = new BatchedGeometryPool();
    pool.pack(original);
    pool.registerForRestore(poolRegistry, a);
    const resident = pool.upload(a).vertexBuffer;
    const registrationFailure = new Error("draw-data construction failed");
    const registerOriginal = registry.register.bind(registry);
    const unregisterOriginal = registry.unregister.bind(registry);
    let failedHandle: object | undefined;
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      const result = registerOriginal(handle, descriptor);
      if (handle instanceof DrawDataTexture) {
        failedHandle = handle;
        throw registrationFailure;
      }
      return result;
    });
    let failCleanup = true;
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      if (handle === failedHandle && failCleanup) throw new Error("draw-data cleanup unavailable");
      unregisterOriginal(handle);
    });
    let failure: unknown;
    try {
      try {
        buildMultiDrawBatch({ key: "borrowed", programKey: "p", vertexLayoutKey: "v", members: [{ geometry: added, material }] }, pool, b);
      } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).cause).toBe(registrationFailure);
      expect(typeof (failure as { retryCleanup?: unknown }).retryCleanup).toBe("function");
      expect(registry.size).toBe(baseline + 1);
      expect(pool.geometries()).toEqual([original]);
      expect(poolRegistry.size).toBe(1);
      expect(resident.disposed).toBe(false);
      failCleanup = false;
      (failure as { retryCleanup(): void }).retryCleanup();
      expect(registry.size).toBe(baseline);
      expect(poolRegistry.size).toBe(1);
      expect(resident.disposed).toBe(false);
    } finally {
      register.mockRestore(); unregister.mockRestore();
      if (failedHandle) unregisterOriginal(failedHandle);
      pool.dispose(); original.dispose(); added.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
  });

  it("retries both resources of a failed owned build without touching an independent device", async () => {
    const registry = sharedResourceRegistry();
    const baseline = registry.size;
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const group = { key: "owned", programKey: "p", vertexLayoutKey: "v", members: [{ geometry, material }] };
    const peer = buildMultiDrawBatch(group, undefined, b);
    const peerTexture = peer.drawData.upload();
    const registerOriginal = registry.register.bind(registry);
    const unregisterOriginal = registry.unregister.bind(registry);
    const registrationFailure = new Error("owned pool registration failed");
    let failedDraw: object | undefined;
    let failedPool: object | undefined;
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      const result = registerOriginal(handle, descriptor);
      if (handle instanceof DrawDataTexture) failedDraw = handle;
      if (handle instanceof BatchedGeometryPool) {
        failedPool = handle;
        throw registrationFailure;
      }
      return result;
    });
    let failDraw = true;
    let failPool = true;
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      if ((handle === failedDraw && failDraw) || (handle === failedPool && failPool)) throw new Error("owned cleanup unavailable");
      unregisterOriginal(handle);
    });
    let failure: unknown;
    try {
      try { buildMultiDrawBatch(group, undefined, a); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(MultiDrawBatchBuildError);
      expect((failure as MultiDrawBatchBuildError).cause).toBe(registrationFailure);
      expect(failedDraw).toBeDefined();
      expect(failedPool).toBeDefined();
      expect(registry.size).toBe(baseline + 4);
      const peerRevision = peerTexture.revision;
      expect((await registry.rebuild(b)).failed).toEqual([]);
      expect(peerTexture.revision).toBeGreaterThan(peerRevision);
      expect(peerTexture.disposed).toBe(false);
      failDraw = false;
      expect(() => (failure as MultiDrawBatchBuildError).retryCleanup()).toThrow(/cleanup retry failed/i);
      const drawCalls = unregister.mock.calls.filter(([handle]) => handle === failedDraw).length;
      expect(registry.size).toBe(baseline + 3);
      failPool = false;
      (failure as MultiDrawBatchBuildError).retryCleanup();
      expect(registry.size).toBe(baseline + 2);
      expect(unregister.mock.calls.filter(([handle]) => handle === failedDraw)).toHaveLength(drawCalls);
      expect((await registry.rebuild(b)).rebuilt).toBe(2);
      expect(peerTexture.disposed).toBe(false);
    } finally {
      register.mockRestore(); unregister.mockRestore();
      if (failedDraw) unregisterOriginal(failedDraw);
      if (failedPool) unregisterOriginal(failedPool);
      if (failure instanceof MultiDrawBatchBuildError) failure.retryCleanup();
      peer.drawData.dispose(); peer.pool.dispose(); geometry.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
    expect(registry.size).toBe(baseline);
  });

  it("keeps cleanup for a different build error with its original owner", () => {
    const registry = sharedResourceRegistry();
    const baseline = registry.size;
    const device = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const cache = new BatchPlanCache();
    const foreignCleanup = { dispose: vi.fn() };
    const foreignError = new MultiDrawBatchBuildError(new Error("foreign build"), [new Error("foreign cleanup")], [foreignCleanup]);
    const register = vi.spyOn(registry, "register").mockImplementationOnce(() => { throw foreignError; });
    try {
      let failure: unknown;
      try { cache.apply([{ geometry, material }, { geometry, material }], { ...multiDrawOptions, device }); } catch (error) { failure = error; }
      expect(failure).toBe(foreignError);
      expect(foreignCleanup.dispose).not.toHaveBeenCalled();
      expect(registry.size).toBe(baseline);
      foreignError.retryCleanup();
      expect(foreignCleanup.dispose).toHaveBeenCalledOnce();
    } finally {
      register.mockRestore(); foreignError.retryCleanup(); cache.dispose();
      geometry.dispose(); material.dispose(); device.dispose();
    }
  });

  it("retries a cache's failed pool cleanup without repeating its completed draw-data cleanup", async () => {
    const registry = sharedResourceRegistry();
    const baseline = registry.size;
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const cacheA = new BatchPlanCache();
    const cacheB = new BatchPlanCache();
    const register = vi.spyOn(registry, "register");
    const unregisterOriginal = registry.unregister.bind(registry);
    let poolA: object | undefined;
    let drawA: object | undefined;
    let failPool = true;
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      if (handle === poolA && failPool) throw new Error("pool unregister unavailable");
      unregisterOriginal(handle);
    });
    try {
      const outputA = cacheA.apply(items, { ...multiDrawOptions, device: a });
      cacheB.apply(items, { ...multiDrawOptions, device: b });
      poolA = register.mock.calls.find(([handle, descriptor]) =>
        handle instanceof BatchedGeometryPool && "device" in descriptor && descriptor.device === a)?.[0];
      drawA = register.mock.calls.find(([handle, descriptor]) =>
        handle instanceof DrawDataTexture && "device" in descriptor && descriptor.device === a)?.[0];
      expect(poolA).toBeDefined();
      expect(drawA).toBeDefined();
      const textureA = (outputA[0] as PackedItem).multiDraw.drawData;
      const textureDispose = vi.spyOn(textureA, "dispose");
      expect(() => cacheA.dispose()).toThrow(/disposal failed/i);
      expect(textureA.disposed).toBe(true);
      expect(textureDispose).toHaveBeenCalledOnce();
      expect(registry.size).toBe(baseline + 3);
      expect((await registry.rebuild(b)).rebuilt).toBe(2);
      expect(() => cacheA.dispose()).toThrow(/disposal failed/i);
      failPool = false;
      cacheA.dispose();
      expect(registry.size).toBe(baseline + 2);
      expect(unregister.mock.calls.filter(([handle]) => handle === poolA)).toHaveLength(3);
      expect(unregister.mock.calls.filter(([handle]) => handle === drawA)).toHaveLength(1);
      expect(textureDispose).toHaveBeenCalledOnce();
      expect((await registry.rebuild(b)).rebuilt).toBe(2);
      textureDispose.mockRestore();
    } finally {
      register.mockRestore(); unregister.mockRestore();
      if (poolA) unregisterOriginal(poolA);
      if (drawA) unregisterOriginal(drawA);
      cacheA.dispose(); cacheB.dispose(); geometry.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
    expect(registry.size).toBe(baseline);
  });

  it("retries a replaced plan's failed material before returning its live replacement", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial({ roughness: 0.2 });
    const items = [{ geometry, material }, { geometry, material }];
    const cache = new BatchPlanCache();
    const other = new BatchPlanCache();
    try {
      const first = cache.apply(items, instancingOptions)[0]!.material as InstancedPBRMaterial;
      const independent = other.apply(items, instancingOptions)[0]!.material as InstancedPBRMaterial;
      const disposeFirst = vi.spyOn(first, "dispose").mockImplementationOnce(() => { throw new Error("old material disposal failed"); });
      material.setParameter("u_roughness", 0.7);
      expect(() => cache.apply(items, instancingOptions)).toThrow("old material disposal failed");
      const replacement = cache.lastPlan!.instancedBatches[0]!.material as InstancedPBRMaterial;
      expect(replacement).not.toBe(first);
      expect(replacement.disposed).toBe(false);
      expect(first.disposed).toBe(false);
      expect(cache.apply(items, instancingOptions)[0]!.material).toBe(replacement);
      expect(first.disposed).toBe(true);
      expect(disposeFirst).toHaveBeenCalledTimes(2);
      expect(replacement.disposed).toBe(false);
      expect(independent.disposed).toBe(false);
      disposeFirst.mockRestore();
    } finally {
      vi.restoreAllMocks(); cache.dispose(); other.dispose(); geometry.dispose(); material.dispose();
    }
  });

  it("retains failed construction rollback and earlier group cleanup for the originating cache", async () => {
    const registry = sharedResourceRegistry();
    const baseline = registry.size;
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const first = Geometry.litTriangle();
    const second = Geometry.triangle();
    const material = new PBRMaterial();
    const cache = new BatchPlanCache();
    const independent = new BatchPlanCache();
    const peerItems = [{ geometry: first, material }, { geometry: first, material }];
    independent.apply(peerItems, { ...multiDrawOptions, device: b });
    const registerOriginal = registry.register.bind(registry);
    const unregisterOriginal = registry.unregister.bind(registry);
    const registrationFailure = new Error("second draw-data registration failed");
    const handles: object[] = [];
    let drawCount = 0;
    let failedDraw: object | undefined;
    let firstPool: object | undefined;
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      handles.push(handle);
      const result = registerOriginal(handle, descriptor);
      if (handle instanceof BatchedGeometryPool && !firstPool) firstPool = handle;
      if (handle instanceof DrawDataTexture && ++drawCount === 2) {
        failedDraw = handle;
        throw registrationFailure;
      }
      return result;
    });
    let failCleanup = true;
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      if (failCleanup && (handle === failedDraw || handle === firstPool)) throw new Error("cleanup unavailable");
      unregisterOriginal(handle);
    });
    try {
      const items = [
        { geometry: first, material }, { geometry: first, material },
        { geometry: second, material }, { geometry: second, material }
      ];
      let failure: unknown;
      try { cache.apply(items, { ...multiDrawOptions, device: a }); } catch (error) { failure = error; }
      expect(failure).toBe(registrationFailure);
      expect(drawCount).toBe(2);
      expect(registry.size).toBe(baseline + 4);
      expect((await registry.rebuild(b)).rebuilt).toBe(2);
      expect(() => cache.dispose()).toThrow();
      failCleanup = false;
      cache.dispose();
      expect(registry.size).toBe(baseline + 2);
      expect((await registry.rebuild(b)).rebuilt).toBe(2);
      expect(first.disposed).toBe(false);
      expect(second.disposed).toBe(false);
      expect(material.disposed).toBe(false);
    } finally {
      register.mockRestore(); unregister.mockRestore();
      for (const handle of handles) unregisterOriginal(handle);
      cache.dispose(); independent.dispose(); first.dispose(); second.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
    expect(registry.size).toBe(baseline);
  });

  it("keeps an old failed owner cache alongside a new cache created during disposal", () => {
    const owner = {};
    const peerOwner = {};
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const oldCache = batchPlanCacheFor(owner);
    const peerCache = batchPlanCacheFor(peerOwner);
    let replacementCache: BatchPlanCache | undefined;
    let replacementMaterial: InstancedPBRMaterial | undefined;
    try {
      const old = oldCache.apply(items, instancingOptions)[0]!.material as InstancedPBRMaterial;
      const peer = peerCache.apply(items, instancingOptions)[0]!.material as InstancedPBRMaterial;
      const disposeOld = vi.spyOn(old, "dispose").mockImplementationOnce(() => {
        replacementCache = batchPlanCacheFor(owner);
        replacementMaterial = replacementCache.apply(items, instancingOptions)[0]!.material as InstancedPBRMaterial;
        throw new Error("old cache disposal failed");
      });
      expect(() => disposeBatchPlanCacheFor(owner)).toThrow("old cache disposal failed");
      expect(replacementCache).not.toBe(oldCache);
      expect(batchPlanCacheFor(owner)).toBe(replacementCache);
      expect(old.disposed).toBe(false);
      expect(replacementMaterial!.disposed).toBe(false);
      expect(peer.disposed).toBe(false);
      disposeBatchPlanCacheFor(owner);
      expect(old.disposed).toBe(true);
      expect(disposeOld).toHaveBeenCalledTimes(2);
      expect(replacementMaterial!.disposed).toBe(true);
      expect(peer.disposed).toBe(false);
      disposeOld.mockRestore();
    } finally {
      vi.restoreAllMocks(); oldCache.dispose(); replacementCache?.dispose();
      disposeBatchPlanCacheFor(owner); disposeBatchPlanCacheFor(peerOwner);
      geometry.dispose(); material.dispose();
    }
  });

  it("keeps an owner cache reachable when its in-flight construction is disposed reentrantly", () => {
    const owner = {};
    const registry = sharedResourceRegistry();
    const baseline = registry.size;
    const device = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const cache = batchPlanCacheFor(owner);
    const registrationFailure = new Error("construction interrupted after owner disposal");
    const registerOriginal = registry.register.bind(registry);
    const unregisterOriginal = registry.unregister.bind(registry);
    let failedHandle: object | undefined;
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      const result = registerOriginal(handle, descriptor);
      if (handle instanceof DrawDataTexture) {
        failedHandle = handle;
        disposeBatchPlanCacheFor(owner);
        throw registrationFailure;
      }
      return result;
    });
    let failCleanup = true;
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      if (handle === failedHandle && failCleanup) throw new Error("interrupted draw-data cleanup unavailable");
      unregisterOriginal(handle);
    });
    try {
      expect(() => cache.apply(items, { ...multiDrawOptions, device })).toThrow(registrationFailure);
      expect(cache.lastPlan).toBeNull();
      expect(registry.size).toBe(baseline + 1);
      expect(() => disposeBatchPlanCacheFor(owner)).toThrow();
      failCleanup = false;
      disposeBatchPlanCacheFor(owner);
      expect(registry.size).toBe(baseline);
      expect(geometry.disposed).toBe(false);
      expect(material.disposed).toBe(false);
    } finally {
      register.mockRestore(); unregister.mockRestore();
      if (failedHandle) unregisterOriginal(failedHandle);
      cache.dispose(); disposeBatchPlanCacheFor(owner); geometry.dispose(); material.dispose(); device.dispose();
    }
  });

  it("does not return an orphaned consolidation created after reentrant owner disposal", () => {
    const owner = {};
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const originalRead = geometry.vertexBuffer.readBytes.bind(geometry.vertexBuffer);
    const read = vi.spyOn(geometry.vertexBuffer, "readBytes").mockImplementationOnce((...args) => {
      disposeBatchPlanCacheFor(owner);
      return originalRead(...args);
    });
    const dispose = vi.spyOn(Geometry.prototype, "dispose");
    let orphan: Geometry | undefined;
    try {
      const result = applyRendererOwnedStaticMeshConsolidation({ staticMeshConsolidation: true }, items, owner, flags);
      if (result[0]!.geometry !== geometry) orphan = result[0]!.geometry;
      expect(read).toHaveBeenCalled();
      expect(result).toBe(items);
      expect((dispose.mock.instances as unknown as readonly Geometry[])
        .some((candidate) => candidate !== geometry && candidate.disposed)).toBe(true);
      expect(geometry.disposed).toBe(false);
      expect(material.disposed).toBe(false);
    } finally {
      read.mockRestore(); dispose.mockRestore();
      orphan?.dispose(); disposeBatchPlanCacheFor(owner); geometry.dispose(); material.dispose();
    }
  });

  it("retains failed cleanup of a consolidation detached during its own build", () => {
    const owner = {};
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const originalRead = geometry.vertexBuffer.readBytes.bind(geometry.vertexBuffer);
    const read = vi.spyOn(geometry.vertexBuffer, "readBytes").mockImplementationOnce((...args) => {
      disposeBatchPlanCacheFor(owner);
      return originalRead(...args);
    });
    const originalDispose = Geometry.prototype.dispose;
    const generated: { value?: Geometry } = {};
    const dispose = vi.spyOn(Geometry.prototype, "dispose").mockImplementation(function (this: Geometry) {
      if (this !== geometry && !generated.value) {
        generated.value = this;
        throw new Error("detached consolidation cleanup failed");
      }
      originalDispose.call(this);
    });
    try {
      expect(() => applyRendererOwnedStaticMeshConsolidation({ staticMeshConsolidation: true }, items, owner, flags))
        .toThrow("detached consolidation cleanup failed");
      expect(generated.value).toBeDefined();
      expect(generated.value!.disposed).toBe(false);
      disposeBatchPlanCacheFor(owner);
      expect(generated.value!.disposed).toBe(true);
      expect((dispose.mock.instances as unknown as readonly Geometry[])
        .filter((candidate) => candidate === generated.value)).toHaveLength(2);
      expect(geometry.disposed).toBe(false);
      expect(material.disposed).toBe(false);
    } finally {
      read.mockRestore(); dispose.mockRestore();
      generated.value?.dispose(); disposeBatchPlanCacheFor(owner); geometry.dispose(); material.dispose();
    }
  });
});
