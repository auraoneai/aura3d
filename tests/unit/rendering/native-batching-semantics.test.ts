import { describe, expect, it, vi } from "vitest";

import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Material } from "../../../packages/rendering/src/Material";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { InstancedPBRMaterial } from "../../../packages/rendering/src/InstancedPBRMaterial";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { collectRenderItems, Renderer } from "../../../packages/rendering/src/Renderer";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import type { Texture } from "../../../packages/rendering/src/Texture";
import type { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { Renderable, Scene } from "../../../packages/scene/src";
import { createRegistry, createTrustedQrFlags, isTrustedQrFlags, type QrFlags, type QrFlagName, type RegistryEntry } from "../../../packages/rendering/src/contracts/core";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import type { FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import { frameContributors, hasRegisteredFrameContributors, registerFrameContributor } from "../../../packages/rendering/src/contracts/frameGraph";
import { hasPotentiallyActiveShaderFeatures, hasRegisteredShaderFeatures, registerShaderFeature } from "../../../packages/rendering/src/contracts/program";
import { registerMaterialLobe } from "../../../packages/rendering/src/contracts/materialLobes";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import { hasRegisteredDepthVariantFeatures, registerDepthVariantFeature } from "../../../packages/rendering/src/contracts/shadows";
import { planBatches } from "../../../packages/rendering/src/batching/StaticMergePlanner";
import { materialSnapshotKey, materialSpecKey } from "../../../packages/rendering/src/batching/ContentKeys";
import { batchMembersFor, createEngineBatchInstanceItem, createEnginePackedBatchItem, expandLogicalBatchItems, isEngineBatchInstanceItem, isEnginePackedBatchItem, rememberBatchMembers, transferBatchMembers } from "../../../packages/rendering/src/batching/BatchMembers";
import { buildMultiDrawBatch, multiDrawCommands, synthesizeMultiDrawItems } from "../../../packages/rendering/src/batching/MultiDrawBatch";
import { BatchedGeometryPool } from "../../../packages/rendering/src/batching/BatchedGeometryPool";
import { DrawDataTexture } from "../../../packages/rendering/src/batching/DrawDataTexture";
import { ResourceRegistry, sharedResourceRegistry } from "../../../packages/rendering/src/resources/ResourceRegistry";
import { ForwardPass, sortForwardRenderItems } from "../../../packages/rendering/src/ForwardPass";
import { BatchPlanCache, applyRendererOwnedStaticBatching, applyRendererOwnedStaticMeshConsolidation, disposeBatchPlanCacheFor } from "../../../packages/rendering/src/renderer/CullingBatching";
import "../../../packages/rendering/src/lanes/prd01";

const OFF = createTrustedQrFlags({});
const testFlag: QrFlagName = "A3D_QR_TEST_OBSERVER";
const TEST_ON = createTrustedQrFlags({ [testFlag]: true });

describe("registry activation preflight", () => {
  it("copies and freezes trusted flag values without inheriting mutable caller state", () => {
    const values = { [testFlag]: true };
    const flags = createTrustedQrFlags(values);
    values[testFlag] = false;
    expect(isTrustedQrFlags(flags)).toBe(true);
    expect(Object.isFrozen(flags)).toBe(true);
    expect(Object.isFrozen(flags.values)).toBe(true);
    expect(flags.on(testFlag)).toBe(true);
    let getterReads = 0;
    const unsafe = Object.defineProperty({}, testFlag, { enumerable: true, get() { getterReads += 1; return true; } });
    expect(() => createTrustedQrFlags(unsafe)).toThrow(/data property/);
    expect(getterReads).toBe(0);
  });

  it("fails closed for a stateful custom on() without calling it or trusting frozen values", () => {
    const registry = createRegistry<RegistryEntry>("batch-untrusted-flags-test");
    const entry = { id: "prd01.registry.toggling", owner: "prd01" as const, flag: testFlag };
    const remove = registry.register(entry);
    let calls = 0;
    const flags: QrFlags = { values: Object.freeze({}), on: () => ++calls > 1 };
    expect(isTrustedQrFlags(flags)).toBe(false);
    expect(registry.hasPotentiallyActive(flags)).toBe(true);
    expect(registry.potentiallyActiveEntries(flags)[0]).toBe(entry);
    expect(calls).toBe(0);
    expect(registry.active(flags)).toEqual([]);
    expect(registry.active(flags)).toEqual([entry]);
    expect(calls).toBe(2);
    remove();
  });

  it("uses the immutable registered flag for preflight and activation and invalidates cache on registration", () => {
    const registry = createRegistry<RegistryEntry>("batch-preflight-test");
    const first = { id: "prd01.registry.one", owner: "prd01" as const, flag: testFlag };
    const removeFirst = registry.register(first);
    expect(registry.hasPotentiallyActive(OFF)).toBe(false);
    expect(registry.hasPotentiallyActive(TEST_ON)).toBe(true);
    expect(registry.active(TEST_ON)).toEqual([first]);
    first.flag = "A3D_QR_TEST_CHANGED";
    expect(registry.hasPotentiallyActive(TEST_ON)).toBe(true);
    expect(registry.active(TEST_ON)).toEqual([first]);
    const second = { id: "prd01.registry.two", owner: "prd01" as const, flag: testFlag };
    const removeSecond = registry.register(second);
    expect(registry.active(TEST_ON)).toEqual([first, second]);
    removeFirst();
    expect(registry.active(TEST_ON)).toEqual([second]);
    removeSecond();
    expect(registry.hasPotentiallyActive(TEST_ON)).toBe(false);
  });

  it("treats accessor metadata as unknown without evaluating it during registration or preflight", () => {
    const registry = createRegistry<RegistryEntry>("batch-accessor-test");
    let reads = 0;
    const entry = { id: "prd01.registry.getter", owner: "prd01" as const, get flag(): QrFlagName { reads += 1; return testFlag; } };
    const remove = registry.register(entry);
    expect(registry.hasPotentiallyActive(OFF)).toBe(true);
    expect(reads).toBe(0);
    expect(registry.active(TEST_ON)).toEqual([entry]);
    expect(reads).toBe(1);
    remove();
  });

  it("unregisters by the captured id even after the original object changes", () => {
    const registry = createRegistry<RegistryEntry>("batch-mutable-id-test");
    const entry = { id: "prd01.registry.original", owner: "prd01" as const, flag: testFlag };
    const remove = registry.register(entry);
    entry.id = "prd01.registry.changed";
    remove();
    expect(registry.all()).toEqual([]);
    expect(registry.hasPotentiallyActive(TEST_ON)).toBe(false);
  });

  it("contains provider proxy descriptor traps at registration and never repeats them during preflight", () => {
    const registry = createRegistry<RegistryEntry>("batch-proxy-test");
    let descriptorTraps = 0;
    let flagReads = 0;
    const target = { id: "prd01.registry.proxy", owner: "prd01" as const, flag: testFlag };
    const entry = new Proxy(target, {
      getOwnPropertyDescriptor(object, key) {
        if (key === "flag") { descriptorTraps += 1; throw new Error("unavailable descriptor"); }
        return Reflect.getOwnPropertyDescriptor(object, key);
      },
      get(object, key, receiver) {
        if (key === "flag") flagReads += 1;
        return Reflect.get(object, key, receiver);
      }
    });
    const remove = registry.register(entry);
    expect(descriptorTraps).toBe(1);
    expect(registry.hasPotentiallyActive(OFF)).toBe(true);
    expect(descriptorTraps).toBe(1);
    expect(flagReads).toBe(0);
    expect(registry.potentiallyActiveEntries(OFF)[0]).toBe(entry);
    expect(descriptorTraps).toBe(1);
    expect(flagReads).toBe(0);
    expect(registry.active(TEST_ON)).toEqual([entry]);
    expect(flagReads).toBe(1);
    remove();
  });
});

function translation(x: number): readonly number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
}

describe("batch member provenance", () => {
  it("recognizes only factory-created carrier identities without probing unknown proxies", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const handAuthored = { geometry, material, multiDraw: { mode: "loop" as const, drawIndex: 0 } };
    let traps = 0;
    const proxy = new Proxy(handAuthored, {
      get() { traps += 1; throw new Error("get trap"); },
      getPrototypeOf() { traps += 1; throw new Error("prototype trap"); },
      ownKeys() { traps += 1; throw new Error("keys trap"); }
    });
    try {
      const carrier = createEnginePackedBatchItem(handAuthored);
      expect(carrier).not.toBe(handAuthored);
      expect(isEnginePackedBatchItem(carrier)).toBe(true);
      expect(isEnginePackedBatchItem(handAuthored)).toBe(false);
      expect(isEnginePackedBatchItem(proxy)).toBe(false);
      expect(isEnginePackedBatchItem(new Proxy(carrier, {}))).toBe(false);
      const instanceBucket = createEngineBatchInstanceItem({ geometry, material, instanceTransforms: new Float32Array(16) });
      expect(isEngineBatchInstanceItem(instanceBucket)).toBe(true);
      expect(isEnginePackedBatchItem(instanceBucket)).toBe(false);
      expect(isEngineBatchInstanceItem(carrier)).toBe(false);
      expect(isEngineBatchInstanceItem(proxy)).toBe(false);
      expect(traps).toBe(0);
    } finally { geometry.dispose(); material.dispose(); }
  });

  it("retains ordered original identities, flattens compositions, and transfers projections", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const members = [{ geometry, material }, { geometry, material }, { geometry, material }];
    const first = { geometry, material };
    const second = { geometry, material };
    const input = [members[0]!, members[1]!];
    try {
      rememberBatchMembers(first, input);
      input.reverse();
      expect(batchMembersFor(first)).toEqual(members.slice(0, 2));
      expect(Object.isFrozen(batchMembersFor(first))).toBe(true);
      rememberBatchMembers(second, [first, members[2]!]);
      const flattened = batchMembersFor(second)!;
      flattened.forEach((item, index) => expect(item).toBe(members[index]));
      const projected = { geometry, material };
      const projection = new Map<RenderItem, RenderItem>(members.map((item, index) => [item, { ...item, modelMatrix: translation(index) }]));
      expect(transferBatchMembers(second, projected, (item) => projection.get(item)!)).toBe(true);
      const projectedMembers = batchMembersFor(projected)!;
      projectedMembers.forEach((item, index) => expect(item).toBe(projection.get(members[index]!)));
      const ordinary = [members[0]!];
      expect(expandLogicalBatchItems(ordinary)).toBe(ordinary);
      expect(expandLogicalBatchItems([projected])).toEqual(projectedMembers);
      expect(() => rememberBatchMembers(first, [members[2]!])).toThrow(/cannot be replaced/);
      expect(() => rememberBatchMembers({ geometry, material }, [])).toThrow(/nonempty/);
      const recursive = { geometry, material };
      expect(() => rememberBatchMembers(recursive, [recursive])).toThrow(/nonrecursive/);
      const repeated = { geometry, material };
      expect(rememberBatchMembers(repeated, [members[0]!, members[0]!])).toEqual([members[0], members[0]]);
    } finally { geometry.dispose(); material.dispose(); }
  });

  it("looks up provenance by identity without inspecting an item proxy", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const member = { geometry, material };
    const batch = new Proxy({ geometry, material }, {
      get() { throw new Error("get trap"); },
      getPrototypeOf() { throw new Error("prototype trap"); },
      ownKeys() { throw new Error("keys trap"); }
    });
    try {
      rememberBatchMembers(batch, [member]);
      expect(batchMembersFor(batch)?.[0]).toBe(member);
      expect(expandLogicalBatchItems([batch])[0]).toBe(member);
    } finally { geometry.dispose(); material.dispose(); }
  });

  it("retains the distinct carrier origins through renderer projection", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const packed = createEnginePackedBatchItem({ geometry, material, multiDraw: { mode: "loop" as const, drawIndex: 0 } });
    const instance = createEngineBatchInstanceItem({ geometry, material, instanceTransforms: new Float32Array(16) });
    try {
      const projected = collectRenderItems({ renderItems: [packed, instance] });
      expect(projected).toHaveLength(2);
      expect(projected[0]).not.toBe(packed);
      expect(projected[1]).not.toBe(instance);
      expect(isEnginePackedBatchItem(projected[0])).toBe(true);
      expect(isEngineBatchInstanceItem(projected[1])).toBe(true);
      expect(isEngineBatchInstanceItem(projected[0])).toBe(false);
      expect(isEnginePackedBatchItem(projected[1])).toBe(false);
      expect((projected[0] as RenderItem & { temporalObjectKey: unknown }).temporalObjectKey).toBe(packed);
      expect((projected[1] as RenderItem & { temporalObjectKey: unknown }).temporalObjectKey).toBe(instance);
    } finally { geometry.dispose(); material.dispose(); }
  });

  it("recovers static chunks before final forward sorting, including singleton identity", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [2, -3, 0, 4, -1].map((x) => ({ geometry, material, modelMatrix: translation(x) }));
    const source = { staticBatching: { maxInstancesPerBatch: 2 } };
    const owner = {};
    try {
      const planned = applyRendererOwnedStaticBatching(source, items, owner, OFF);
      expect(planned).toHaveLength(3);
      expect(batchMembersFor(planned[0]!)).toEqual(items.slice(0, 2));
      expect(batchMembersFor(planned[1]!)).toEqual(items.slice(2, 4));
      expect(planned[2]).toBe(items[4]);
      const recovered = expandLogicalBatchItems(planned);
      recovered.forEach((item, index) => expect(item).toBe(items[index]));
      const expected = sortForwardRenderItems(items, [0, 0, 0]);
      const actual = sortForwardRenderItems(recovered, [0, 0, 0]);
      expect(expected).toEqual([items[2], items[4], items[0], items[1], items[3]]);
      actual.forEach((item, index) => expect(item).toBe(expected[index]));
    } finally { disposeBatchPlanCacheFor(owner); geometry.dispose(); material.dispose(); }
  });

  it("expands mapped members before the real forward pass sorts and invokes callbacks", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const device = new MockRenderDevice();
    const callbacks: string[] = [];
    const far = { geometry, material, label: "far", modelMatrix: translation(2), onBeforeRender: () => { callbacks.push("far"); } };
    const near = { geometry, material, label: "near", modelMatrix: translation(0), onBeforeRender: () => { callbacks.push("near"); } };
    const physical = { geometry, material, instanceTransforms: new Float32Array([...translation(2), ...translation(0)]) };
    rememberBatchMembers(physical, [far, near]);
    try {
      device.beginFrame(4, 4);
      new ForwardPass({ items: [physical], cameraPosition: [0, 0, 0] }).execute({ device, width: 4, height: 4 });
      device.endFrame();
      expect(callbacks).toEqual(["near", "far"]);
      expect(device.drawCommands.map((command) => command.label)).toEqual(["near", "far"]);
      expect(device.drawCommands.map((command) => command.instanceCount ?? 1)).toEqual([1, 1]);
    } finally { device.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("keeps consolidation provenance distinct across cached frames", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const original = [{ geometry, material, modelMatrix: translation(-1) }, { geometry, material, modelMatrix: translation(1) }];
    const replacement = original.map((item) => ({ ...item }));
    const owner = {};
    const source = { staticMeshConsolidation: true };
    try {
      const first = applyRendererOwnedStaticMeshConsolidation(source, original, owner, OFF);
      const second = applyRendererOwnedStaticMeshConsolidation(source, replacement, owner, OFF);
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(first[0]).not.toBe(second[0]);
      batchMembersFor(first[0]!)!.forEach((item, index) => expect(item).toBe(original[index]));
      batchMembersFor(second[0]!)!.forEach((item, index) => expect(item).toBe(replacement[index]));
    } finally { disposeBatchPlanCacheFor(owner); geometry.dispose(); material.dispose(); }
  });

  it("records PRD11 instance chunks and packed marker originals", () => {
    const geometry = Geometry.litTriangle();
    const other = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const cache = new BatchPlanCache();
    const groupItems = [items[0]!, { geometry: other, material }];
    const registrySize = sharedResourceRegistry().size;
    const packed = buildMultiDrawBatch({ key: "test", programKey: "test", vertexLayoutKey: "test", members: groupItems });
    try {
      expect(sharedResourceRegistry().size).toBe(registrySize + 2);
      const instanced = cache.apply(items, { flags: OFF });
      expect(instanced).toHaveLength(1);
      batchMembersFor(instanced[0]!)!.forEach((item, index) => expect(item).toBe(items[index]));
      const markers = synthesizeMultiDrawItems(packed);
      expect(markers).toHaveLength(2);
      markers.forEach((item, index) => {
        expect(isEnginePackedBatchItem(item)).toBe(true);
        expect(batchMembersFor(item)?.[0]).toBe(groupItems[index]);
      });
    } finally {
      packed.pool.dispose(); packed.drawData.dispose(); cache.dispose(); geometry.dispose(); other.dispose(); material.dispose();
    }
    expect(sharedResourceRegistry().size).toBe(registrySize);
  });
});

describe("packed batch resource lifetimes", () => {
  it("rebuilds live draw data and unregisters and disposes it exactly once", async () => {
    const registry = new ResourceRegistry();
    const unregister = vi.spyOn(registry, "unregister");
    const device = new MockRenderDevice();
    const data = new DrawDataTexture(1);
    data.setDraw(0, { model: translation(7) });
    data.registerForRestore(registry);
    data.registerForRestore(registry);
    const original = data.upload();
    const originalRevision = original.revision;
    let originalDisposals = 0;
    original.onDispose(() => { originalDisposals += 1; });
    try {
      expect(registry.size).toBe(1);
      expect(await registry.rebuild(device)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      const restored = data.upload();
      expect(restored).toBe(original);
      expect(original.disposed).toBe(false);
      expect(original.revision).toBeGreaterThan(originalRevision);
      expect(originalDisposals).toBe(0);
      expect((restored.data as Float32Array)[12]).toBe(7);
      let restoredDisposals = 0;
      restored.onDispose(() => { restoredDisposals += 1; });
      data.dispose();
      data.dispose();
      expect(registry.size).toBe(0);
      expect(unregister).toHaveBeenCalledTimes(1);
      expect(restoredDisposals).toBe(1);
      expect(originalDisposals).toBe(1);
      expect(await registry.rebuild(device)).toEqual({ rebuilt: 0, refetched: 0, failed: [] });
      data.registerForRestore(registry);
      expect(registry.size).toBe(1);
      data.dispose();
      expect(unregister).toHaveBeenCalledTimes(2);
      expect(registry.size).toBe(0);
    } finally { data.dispose(); device.dispose(); unregister.mockRestore(); }
  });

  it("can register again after a failed registry registration", () => {
    const registry = new ResourceRegistry();
    const register = vi.spyOn(registry, "register").mockImplementationOnce(() => { throw new Error("registration failed"); });
    const data = new DrawDataTexture(1);
    try {
      expect(() => data.registerForRestore(registry)).toThrow("registration failed");
      data.registerForRestore(registry);
      expect(registry.size).toBe(1);
    } finally { data.dispose(); register.mockRestore(); }
    expect(registry.size).toBe(0);
  });

  it("unregisters handles accepted before a registration error", () => {
    const registry = sharedResourceRegistry();
    const baseline = registry.size;
    const originalRegister = registry.register.bind(registry);
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      const result = originalRegister(handle, descriptor);
      if (handle instanceof BatchedGeometryPool) throw new Error("registration failed after storing pool");
      return result;
    });
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const pool = new BatchedGeometryPool();
    try {
      const group = { key: "test", programKey: "test", vertexLayoutKey: "test", members: [{ geometry, material }] };
      expect(() => buildMultiDrawBatch(group, pool)).toThrow("registration failed after storing pool");
      expect(registry.size).toBe(baseline);
      expect(pool.stats().geometries).toBe(0);
      register.mockRestore();
      pool.registerForRestore(registry);
      expect(registry.size).toBe(baseline + 1);
    } finally { register.mockRestore(); pool.dispose(); geometry.dispose(); material.dispose(); }
    expect(registry.size).toBe(baseline);
  });

  it("unregisters draw data if its registry throws after accepting it", () => {
    const registry = new ResourceRegistry();
    const originalRegister = registry.register.bind(registry);
    const register = vi.spyOn(registry, "register").mockImplementation((handle, descriptor) => {
      originalRegister(handle, descriptor);
      throw new Error("registration failed after storing draw data");
    });
    const data = new DrawDataTexture(1);
    try {
      expect(() => data.registerForRestore(registry)).toThrow("registration failed after storing draw data");
      expect(registry.size).toBe(0);
      register.mockRestore();
      data.registerForRestore(registry);
      expect(registry.size).toBe(1);
    } finally { register.mockRestore(); data.dispose(); }
    expect(registry.size).toBe(0);
  });

  it("does not leak restore entries when group packing or material access fails", () => {
    const registry = sharedResourceRegistry();
    const baseline = registry.size;
    const geometry = Geometry.litTriangle();
    const incompatible = Geometry.triangle();
    const material = new PBRMaterial();
    const failing = new PBRMaterial();
    Object.defineProperty(failing, "getParameters", { value: () => { throw new Error("material failed"); } });
    try {
      const group = { key: "test", programKey: "test", vertexLayoutKey: "test", members: [{ geometry, material }, { geometry: incompatible, material }] };
      expect(() => buildMultiDrawBatch(group)).toThrow("identical vertex layouts");
      expect(registry.size).toBe(baseline);
      expect(() => buildMultiDrawBatch({ ...group, members: [{ geometry, material: failing }] })).toThrow("material failed");
      expect(registry.size).toBe(baseline);
    } finally { geometry.dispose(); incompatible.dispose(); material.dispose(); failing.dispose(); }
  });

  it("rolls back a borrowed pool without retiring its live content or restore handle", () => {
    const registry = sharedResourceRegistry();
    const baseline = registry.size;
    const original = Geometry.litTriangle();
    const added = Geometry.litTriangle();
    const incompatible = Geometry.triangle();
    const material = new PBRMaterial();
    const pool = new BatchedGeometryPool();
    const device = new MockRenderDevice();
    pool.pack(original);
    pool.registerForRestore(registry);
    const stats = pool.stats();
    const geometry = pool.asGeometry();
    const before = new Uint8Array(geometry.vertexBuffer.data).slice();
    const resident = pool.upload(device);
    try {
      const group = { key: "test", programKey: "test", vertexLayoutKey: "test", members: [{ geometry: added, material }, { geometry: incompatible, material }] };
      expect(() => buildMultiDrawBatch(group, pool)).toThrow("identical vertex layouts");
      expect(registry.size).toBe(baseline + 1);
      expect(pool.stats()).toEqual(stats);
      expect(pool.geometries()).toEqual([original]);
      expect(pool.entryFor(added)).toBeUndefined();
      expect(pool.asGeometry()).toBe(geometry);
      expect(new Uint8Array(geometry.vertexBuffer.data)).toEqual(before);
      expect(pool.upload(device).vertexBuffer).toBe(resident.vertexBuffer);
      expect(resident.vertexBuffer.disposed).toBe(false);
    } finally {
      pool.dispose(); device.dispose(); original.dispose(); added.dispose(); incompatible.dispose(); material.dispose();
    }
    expect(registry.size).toBe(baseline);
  });

  it("blocks a reentrant upload until rollback has restored the borrowed pool", () => {
    const original = Geometry.litTriangle();
    const added = Geometry.litTriangle();
    const material = new PBRMaterial();
    const pool = new BatchedGeometryPool();
    const device = new MockRenderDevice();
    pool.pack(original);
    const resident = pool.upload(device);
    Object.defineProperty(material, "getParameters", { value: () => pool.upload(device) });
    try {
      const group = { key: "test", programKey: "test", vertexLayoutKey: "test", members: [{ geometry: added, material }] };
      expect(() => buildMultiDrawBatch(group, pool)).toThrow("during a packing transaction");
      expect(pool.geometries()).toEqual([original]);
      expect(pool.upload(device).vertexBuffer).toBe(resident.vertexBuffer);
      expect(resident.vertexBuffer.disposed).toBe(false);
    } finally { pool.dispose(); device.dispose(); original.dispose(); added.dispose(); material.dispose(); }
  });

  it("still rebuilds both resources of a live packed batch", async () => {
    const registry = sharedResourceRegistry();
    const baseline = registry.size;
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const device = new MockRenderDevice();
    const group = { key: "test", programKey: "test", vertexLayoutKey: "test", members: [{ geometry, material, modelMatrix: translation(9) }] };
    const batch = buildMultiDrawBatch(group);
    const previousBuffers = batch.pool.upload(device);
    const marker = synthesizeMultiDrawItems(batch)[0] as RenderItem & { readonly multiDraw: { readonly drawData: Texture } };
    const previousTexture = marker.multiDraw.drawData;
    const previousRevision = previousTexture.revision;
    batch.drawData.setDraw(0, { model: translation(11) });
    try {
      expect(registry.size).toBe(baseline + 2);
      const report = await registry.rebuild(device);
      expect(report.failed).toEqual([]);
      const restoredBuffers = batch.pool.upload(device);
      const restoredTexture = batch.drawData.upload();
      expect(restoredBuffers.vertexBuffer).not.toBe(previousBuffers.vertexBuffer);
      expect(previousBuffers.vertexBuffer.disposed).toBe(true);
      expect(restoredTexture).toBe(previousTexture);
      expect(marker.multiDraw.drawData).toBe(restoredTexture);
      expect(previousTexture.disposed).toBe(false);
      expect(previousTexture.revision).toBeGreaterThan(previousRevision);
      expect((marker.multiDraw.drawData.data as Float32Array)[12]).toBe(11);
      const binding = multiDrawCommands(device, batch)[0]!.uniforms!.get("u_a3dDrawData") as TextureBinding;
      expect(binding.texture).toBe(previousTexture);
    } finally { batch.pool.dispose(); batch.drawData.dispose(); device.dispose(); geometry.dispose(); material.dispose(); }
    expect(registry.size).toBe(baseline);
  });

  it("retires both cached batch handles once, including repeated cache disposal", () => {
    const registry = sharedResourceRegistry();
    const baseline = registry.size;
    const unregister = vi.spyOn(registry, "unregister");
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const cache = new BatchPlanCache();
    try {
      const items = [{ geometry, material }, { geometry, material }];
      const result = cache.apply(items, { flags: OFF, instancing: false, multiDrawAvailable: true });
      expect(result).toHaveLength(2);
      expect(registry.size).toBe(baseline + 2);
      cache.dispose();
      cache.dispose();
      expect(registry.size).toBe(baseline);
      expect(unregister).toHaveBeenCalledTimes(2);
    } finally { cache.dispose(); unregister.mockRestore(); geometry.dispose(); material.dispose(); }
  });
});

describe("batching preserves per-item semantics", () => {
  it("replans when a material instance override changes and clears", () => {
    const geometry = Geometry.litTriangle();
    const base = new PBRMaterial({ roughness: 0.5 });
    const first = new MaterialInstance(base), second = new MaterialInstance(base);
    const items = [{ geometry, material: first }, { geometry, material: second }];
    const plans: ReturnType<typeof planBatches>[] = [];
    const plan = () => {
      const result = planBatches(items, { multiDraw: false });
      plans.push(result);
      return result;
    };
    try {
      expect(plan().instancedBatches).toHaveLength(1);
      const originalKey = materialSpecKey(second);
      second.setOverride("u_roughness", 0.8);
      expect(materialSpecKey(second)).not.toBe(originalKey);
      const changed = plan();
      expect(changed.instancedBatches).toHaveLength(0);
      expect(changed.passthrough).toEqual(items);
      second.clearOverride("u_roughness");
      expect(materialSpecKey(second)).toBe(originalKey);
      expect(plan().instancedBatches).toHaveLength(1);
    } finally {
      for (const result of plans) for (const batch of result.instancedBatches) if (batch.material instanceof Material) batch.material.dispose();
      geometry.dispose(); base.dispose();
    }
  });

  it("snapshots every effective parameter with unambiguous numeric and name boundaries", () => {
    const base = new PBRMaterial();
    const instance = new MaterialInstance(base);
    try {
      instance.setOverride("unusual|name:=[x]", [0, NaN, Infinity]);
      const initial = materialSnapshotKey(instance);
      expect(materialSnapshotKey(instance)).toBe(initial);
      instance.setOverride("unusual|name:=[x]", [-0, NaN, Infinity]);
      const negativeZero = materialSnapshotKey(instance);
      expect(negativeZero).not.toBe(initial);
      instance.setOverride("unusual|name:=[x]", [-0, Infinity, Infinity]);
      expect(materialSnapshotKey(instance)).not.toBe(negativeZero);
      instance.setOverride("unusual|name:=[x]", new Float32Array([-0, NaN, Infinity]));
      expect(materialSnapshotKey(instance)).not.toBe(negativeZero);
      instance.clearOverride("unusual|name:=[x]");
      expect(materialSnapshotKey(instance)).toBe(materialSnapshotKey(base));
    } finally { base.dispose(); }
  });

  it("keeps distinct non-finite and delimiter-bearing material parameters in separate groups", () => {
    const base = new PBRMaterial();
    const first = new MaterialInstance(base), second = new MaterialInstance(base);
    try {
      first.setOverride("sample", [NaN]);
      second.setOverride("sample", [Infinity]);
      expect(materialSpecKey(first)).not.toBe(materialSpecKey(second));
      first.clearOverride("sample"); second.clearOverride("sample");
      first.setOverride("x", [1]); first.setOverride("z", [2]);
      second.setOverride("x=a:1|z", [2]);
      expect(materialSpecKey(first)).not.toBe(materialSpecKey(second));
    } finally { base.dispose(); }
  });

  it("keeps different scissor rectangles out of the same multi-draw group", () => {
    const geometry = Geometry.litTriangle();
    const first = new PBRMaterial({ renderState: { scissor: { x: 0, y: 0, width: 2, height: 2 } } });
    const second = new PBRMaterial({ renderState: { scissor: { x: 1, y: 0, width: 2, height: 2 } } });
    const items = [{ geometry, material: first }, { geometry, material: second }];
    try {
      const plan = planBatches(items, { instancing: false, multiDrawAvailable: true });
      expect(plan.multiDrawGroups).toHaveLength(0);
      expect(plan.passthrough).toEqual(items);
    } finally { geometry.dispose(); first.dispose(); second.dispose(); }
  });

  it("enforces integral chunk sizes without losing members and supports an unbounded chunk", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = Array.from({ length: 5 }, () => ({ geometry, material }));
    const plans: ReturnType<typeof planBatches>[] = [];
    try {
      for (const [cap, expected] of [[2, [2, 2, 1]], [Infinity, [5]], [0, [1, 1, 1, 1, 1]]] as const) {
        const result = planBatches(items, { multiDraw: false, maxInstancesPerDraw: cap });
        plans.push(result);
        expect(result.instancedBatches[0]!.chunks.map(chunk => chunk.members.length)).toEqual(expected);
        expect(result.instancedBatches[0]!.chunks.flatMap(chunk => chunk.members)).toEqual(items);
      }
      for (const cap of [NaN, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
        expect(() => planBatches(items, { maxInstancesPerDraw: cap })).toThrow(/maxInstancesPerDraw/);
      }
    } finally {
      for (const result of plans) for (const batch of result.instancedBatches) if (batch.material instanceof Material) batch.material.dispose();
      geometry.dispose(); material.dispose();
    }
  });

  it("disposes earlier synthesized materials if a later group fails to build", () => {
    const geometry = Geometry.litTriangle();
    const first = new PBRMaterial({ roughness: 0.2 });
    const second = new PBRMaterial({ roughness: 0.8 });
    const originalSetParameter = InstancedPBRMaterial.prototype.setParameter;
    const setParameter = vi.spyOn(InstancedPBRMaterial.prototype, "setParameter").mockImplementation(function (this: InstancedPBRMaterial, name, value) {
      if (name === "u_roughness" && value === 0.8) throw new Error("second material failed");
      return originalSetParameter.call(this, name, value);
    });
    const dispose = vi.spyOn(InstancedPBRMaterial.prototype, "dispose");
    try {
      expect(() => planBatches([
        { geometry, material: first }, { geometry, material: first },
        { geometry, material: second }, { geometry, material: second }
      ], { multiDraw: false })).toThrow("second material failed");
      expect(dispose).toHaveBeenCalledTimes(2);
      expect((dispose.mock.instances as unknown as readonly InstancedPBRMaterial[]).every(instance => instance.disposed)).toBe(true);
    } finally { setParameter.mockRestore(); dispose.mockRestore(); geometry.dispose(); first.dispose(); second.dispose(); }
  });

  it("retains shared emissive and fog state and separates different fog modes", () => {
    const geometry = Geometry.litTriangle();
    const unfogged = new PBRMaterial({ fog: false, emissiveColor: [0.2, 0.4, 0.6], emissiveStrength: 0.7 });
    const fogged = new PBRMaterial({ fog: true, emissiveColor: [0.2, 0.4, 0.6], emissiveStrength: 0.7 });
    const plans: ReturnType<typeof planBatches>[] = [];
    try {
      const same = planBatches([{ geometry, material: unfogged }, { geometry, material: unfogged }], { multiDraw: false });
      plans.push(same);
      expect(same.instancedBatches).toHaveLength(1);
      const merged = same.instancedBatches[0]!.material;
      expect(merged instanceof Material && merged.fog).toBe(false);
      expect(merged.getParameter("u_emissiveColor")).toEqual([0.2, 0.4, 0.6]);
      expect(merged.getParameter("u_emissiveStrength")).toBe(0.7);
      const mixedItems = [{ geometry, material: unfogged }, { geometry, material: fogged }];
      const mixed = planBatches(mixedItems, { multiDraw: false });
      plans.push(mixed);
      expect(mixed.instancedBatches).toHaveLength(0);
      expect(mixed.passthrough).toEqual(mixedItems);
    } finally {
      for (const result of plans) for (const batch of result.instancedBatches) if (batch.material instanceof Material) batch.material.dispose();
      geometry.dispose(); unfogged.dispose(); fogged.dispose();
    }
  });

  it("keeps unsupported physical lobes on their original material draws", () => {
    const geometry = Geometry.litTriangle();
    const materials = [
      new PBRMaterial({ clearcoatFactor: 0.5 }),
      new PBRMaterial({ transmissionFactor: 0.3 }),
      new PBRMaterial({ sheenColorFactor: [0.1, 0, 0] }),
      new PBRMaterial({ anisotropyStrength: 0.2 }),
      new PBRMaterial({ iridescenceFactor: 0.4 }),
      new PBRMaterial({ ior: 1.7 })
    ];
    try {
      for (const material of materials) {
        const items = [{ geometry, material }, { geometry, material }];
        const plan = planBatches(items, { multiDraw: false });
        expect(plan.instancedBatches).toHaveLength(0);
        expect(plan.passthrough).toEqual(items);
      }
    } finally { geometry.dispose(); for (const material of materials) material.dispose(); }
  });

  it("still batches compatible unobserved items and carries each transform", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const cache = new BatchPlanCache();
    const a = { geometry, material, modelMatrix: translation(-2), castShadow: true };
    const b = { geometry, material, modelMatrix: translation(3), castShadow: true };
    const result = cache.apply([a, b], { flags: OFF });
    expect(result).toHaveLength(1);
    expect(result[0]!.instanceTransforms?.[12]).toBe(-2);
    expect(result[0]!.instanceTransforms?.[28]).toBe(3);
    expect(result[0]!.castShadow).toBe(true);
    cache.dispose(); geometry.dispose(); material.dispose();
  });

  it("keeps labels, callbacks, extension symbols and their original order", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const cache = new BatchPlanCache();
    const lightingCarrier = Symbol.for("@aura3d/rendering/advanced-lighting-bindings");
    const callback = () => undefined;
    const items: RenderItem[] = [
      { geometry, material, modelMatrix: translation(1) },
      { geometry, material, label: "prd10.wind:grass", onBeforeRender: callback },
      { geometry, material, ...{ [lightingCarrier]: { lightmap: true } } },
      { geometry, material, label: "prd10.caustics:floor" },
      { geometry, material, modelMatrix: translation(2) }
    ];
    const result = cache.apply(items, { flags: OFF, multiDrawAvailable: true });
    expect(result).toEqual(items);
    result.forEach((item, index) => expect(item).toBe(items[index]));
    expect(result[1]!.onBeforeRender).toBe(callback);
    expect(Reflect.get(result[2]!, lightingCarrier)).toEqual({ lightmap: true });
    const direct = planBatches(items, { multiDrawAvailable: true });
    for (const protectedItem of items.slice(1, 4)) expect(direct.passthrough).toContain(protectedItem);
    cache.dispose(); geometry.dispose(); material.dispose();
  });

  it("invalidates a cached batch when metadata appears or an item object is replaced", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const cache = new BatchPlanCache();
    const carrier = Symbol.for("@aura3d/rendering/advanced-lighting-bindings");
    const a = { geometry, material, [carrier]: undefined as unknown };
    const b = { geometry, material };
    expect(cache.apply([a, b], { flags: OFF })).toHaveLength(1);
    a[carrier] = { irradiance: 1 };
    const protectedResult = cache.apply([a, b], { flags: OFF });
    expect(protectedResult).toEqual([a, b]);
    expect(protectedResult[0]).toBe(a);
    const replacement = { ...a };
    const next = cache.apply([replacement, b], { flags: OFF });
    expect(next[0]).toBe(replacement);
    a[carrier] = undefined;
    expect(cache.apply([a, b], { flags: OFF })).toHaveLength(1);
    cache.dispose(); geometry.dispose(); material.dispose();
  });

  it("does not evaluate an item accessor while deciding to pass it through", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const cache = new BatchPlanCache();
    let reads = 0;
    const item = { geometry, material };
    Object.defineProperty(item, "label", { enumerable: true, get() { reads += 1; throw new Error("label getter ran"); } });
    const result = cache.apply([item, { geometry, material }], { flags: OFF });
    expect(result[0]).toBe(item);
    expect(planBatches([item]).passthrough[0]).toBe(item);
    expect(reads).toBe(0);
    cache.dispose(); geometry.dispose(); material.dispose();
  });

  it("rejects inherited Object.prototype draw hooks without reading their getter", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const cache = new BatchPlanCache();
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, "onBeforeRender");
    let reads = 0;
    Object.defineProperty(Object.prototype, "onBeforeRender", {
      configurable: true,
      get() { reads += 1; return () => undefined; }
    });
    try {
      expect(cache.apply(items, { flags: OFF })).toEqual(items);
      expect(applyRendererOwnedStaticBatching({ staticBatching: true }, items, {}, OFF)).toBe(items);
      expect(applyRendererOwnedStaticMeshConsolidation({ staticMeshConsolidation: true }, items, {}, OFF)).toBe(items);
      expect(reads).toBe(0);
    } finally {
      if (previous) Object.defineProperty(Object.prototype, "onBeforeRender", previous);
      else Reflect.deleteProperty(Object.prototype, "onBeforeRender");
      cache.dispose(); geometry.dispose(); material.dispose();
    }
  });

  it("rejects active custom shader and depth observers and resumes after removal", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const cache = new BatchPlanCache();
    const removeShader = registerShaderFeature({
      id: "prd01.test.batch-observer", owner: "prd01", flag: testFlag,
      select: ({ item }) => item.modelMatrix ? 1 : undefined,
      defines: () => ({}), chunks: [], hooks: [],
      bindUniforms: (_value, item, set) => set("u_testLabel", item.label?.length ?? 0)
    });
    try {
      expect(cache.apply(items, { flags: TEST_ON })).toEqual(items);
      const source = { staticBatching: true, staticMeshConsolidation: true };
      expect(applyRendererOwnedStaticBatching(source, items, {}, TEST_ON)).toEqual(items);
      expect(applyRendererOwnedStaticMeshConsolidation(source, items, {}, TEST_ON)).toEqual(items);
    } finally { removeShader(); }
    expect(cache.apply(items, { flags: TEST_ON })).toHaveLength(1);
    const removeDepth = registerDepthVariantFeature({
      id: "prd01.test.batch-depth-observer", owner: "prd01", flag: testFlag,
      passes: ["depth"], select: () => true, defines: () => ({}), chunks: [], hooks: []
    });
    try { expect(cache.apply(items, { flags: TEST_ON })).toEqual(items); }
    finally { removeDepth(); }
    cache.dispose(); geometry.dispose(); material.dispose();
  });

  it("keeps items separate when a potentially active material lobe may inspect their material", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const cache = new BatchPlanCache();
    const remove = registerMaterialLobe({
      id: "prd04.test.batch-lobe", owner: "prd04", flag: testFlag,
      feature: () => undefined, chunks: { pars: "", fragment: "" }, samplerSlots: [], bind: () => undefined
    });
    try {
      expect(cache.apply(items, { flags: TEST_ON })).toEqual(items);
      expect(applyRendererOwnedStaticBatching({ staticBatching: true }, items, {}, TEST_ON)).toBe(items);
      expect(applyRendererOwnedStaticMeshConsolidation({ staticMeshConsolidation: true }, items, {}, TEST_ON)).toBe(items);
      expect(cache.apply(items, { flags: OFF })).toHaveLength(1);
    } finally { remove(); cache.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("treats a material lobe's flag accessor as unknown without invoking it during preflight", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const cache = new BatchPlanCache();
    let reads = 0;
    const remove = registerMaterialLobe({
      id: "prd04.test.batch-lobe-getter", owner: "prd04", get flag(): QrFlagName { reads += 1; throw new Error("flag getter ran"); },
      feature: () => undefined, chunks: { pars: "", fragment: "" }, samplerSlots: [], bind: () => undefined
    });
    try {
      expect(cache.apply(items, { flags: OFF })).toEqual(items);
      expect(reads).toBe(0);
    } finally { remove(); cache.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("does not trust a custom flag whose on() changes between calls", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const cache = new BatchPlanCache();
    let flagCalls = 0;
    const flags: QrFlags = { values: Object.freeze({}), on: () => ++flagCalls > 1 };
    const unregister = registerShaderFeature({
      id: "prd01.test.toggling-flags", owner: "prd01", flag: testFlag,
      select: () => true, defines: () => ({}), chunks: [], hooks: []
    });
    try {
      const result = cache.apply(items, { flags });
      expect(result).toEqual(items);
      expect(result[0]).toBe(items[0]);
      expect(flagCalls).toBe(0);
    } finally { unregister(); cache.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("keeps logical items when an active collect contributor can inspect them", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const cache = new BatchPlanCache();
    const unregister = registerFrameContributor({
      id: "prd01.test.batch-collector", owner: "prd01", flag: testFlag, phases: ["collect"],
      collect: (input) => input
    });
    try { expect(cache.apply(items, { flags: TEST_ON })).toEqual(items); }
    finally { unregister(); }
    expect(cache.apply(items, { flags: TEST_ON })).toHaveLength(1);
    cache.dispose(); geometry.dispose(); material.dispose();
  });

  it("keeps the entire frame logical when a later draw callback registers a provider", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    let unregister: (() => void) | undefined;
    const observer: RenderItem = {
      geometry, material,
      onBeforeRender: () => {
        unregister = registerShaderFeature({
          id: "prd01.test.late-registration", owner: "prd01", flag: testFlag,
          select: ({ item }) => item.label === "target" ? true : undefined,
          defines: () => ({}), chunks: [], hooks: []
        });
      }
    };
    const items = [{ geometry, material }, observer, { geometry, material }];
    const cache = new BatchPlanCache();
    const source = { staticBatching: true, staticMeshConsolidation: true };
    try {
      const staticItems = applyRendererOwnedStaticBatching(source, items, {}, TEST_ON);
      const consolidated = applyRendererOwnedStaticMeshConsolidation(source, items, {}, TEST_ON);
      const lateItems = cache.apply(items, { flags: TEST_ON });
      expect(staticItems).toBe(items);
      expect(consolidated).toBe(items);
      lateItems.forEach((item, index) => expect(item).toBe(items[index]));
      lateItems[1]!.onBeforeRender!(lateItems[1]!);
      expect(hasPotentiallyActiveShaderFeatures(TEST_ON)).toBe(true);
      expect(cache.apply(items, { flags: TEST_ON })).toEqual(items);
    } finally { unregister?.(); cache.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("checks registered provider presence without reading flag accessors", () => {
    let flagReads = 0;
    const flag = () => { flagReads += 1; throw new Error("provider flag getter ran"); };
    const removeShader = registerShaderFeature({
      id: "prd01.test.getter-shader", owner: "prd01", get flag() { return flag(); },
      select: () => undefined, defines: () => ({}), chunks: [], hooks: []
    });
    const removeDepth = registerDepthVariantFeature({
      id: "prd01.test.getter-depth", owner: "prd01", get flag() { return flag(); },
      passes: ["depth"], select: () => undefined, defines: () => ({}), chunks: [], hooks: []
    });
    const removeFrame = registerFrameContributor({
      id: "prd01.test.getter-contributor", owner: "prd01", get flag() { return flag(); }, phases: ["collect"],
      collect: (input) => input
    });
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const cache = new BatchPlanCache();
    try {
      expect(hasRegisteredShaderFeatures()).toBe(true);
      expect(hasRegisteredDepthVariantFeatures()).toBe(true);
      expect(hasRegisteredFrameContributors()).toBe(true);
      expect(cache.apply(items, { flags: OFF })).toEqual(items);
      expect(flagReads).toBe(0);
    } finally {
      removeFrame(); removeDepth(); removeShader(); cache.dispose(); geometry.dispose(); material.dispose();
    }
  });

  it("does not regroup opaque items across an intervening different draw", () => {
    const geometry = Geometry.litTriangle();
    const firstMaterial = new PBRMaterial({ roughness: 0.2 });
    const otherMaterial = new PBRMaterial({ roughness: 0.9 });
    const items = [{ geometry, material: firstMaterial }, { geometry, material: otherMaterial }, { geometry, material: firstMaterial }];
    const cache = new BatchPlanCache();
    const result = cache.apply(items, { flags: OFF });
    result.forEach((item, index) => expect(item).toBe(items[index]));
    expect(result).toHaveLength(3);
    cache.dispose(); geometry.dispose(); firstMaterial.dispose(); otherMaterial.dispose();
  });

  it("keeps the full logical list around unsafe renderer-owned static items", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const a = { geometry, material, modelMatrix: translation(-1) };
    const b = { geometry, material, modelMatrix: translation(1) };
    const protectedItem = { geometry, material, label: "separate" };
    const source = { staticBatching: true };
    const clean = applyRendererOwnedStaticBatching(source, [a, b], {}, OFF);
    expect(clean).toHaveLength(1);
    expect(clean[0]!.instanceTransforms?.length).toBe(32);
    const first = [a, b, protectedItem];
    expect(applyRendererOwnedStaticBatching(source, first, {}, OFF)).toBe(first);
    const last = [protectedItem, a, b];
    expect(applyRendererOwnedStaticBatching(source, last, {}, OFF)).toBe(last);
    const interleaved = [a, protectedItem, b];
    expect(applyRendererOwnedStaticBatching(source, interleaved, {}, OFF)).toBe(interleaved);
    const other = new PBRMaterial({ roughness: 0.9 });
    const alternating = [a, { geometry, material: other }, b];
    expect(applyRendererOwnedStaticBatching(source, alternating, {}, OFF)).toBe(alternating);
    geometry.dispose(); material.dispose(); other.dispose();
  });

  it("retains the full logical list for unsafe consolidation inputs and singleton identity", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const a = { geometry, material, modelMatrix: translation(-1) };
    const b = { geometry, material, modelMatrix: translation(1) };
    const protectedItem = { geometry, material, label: "separate" };
    const source = { staticMeshConsolidation: true };
    const clean = applyRendererOwnedStaticMeshConsolidation(source, [a, b], {}, OFF);
    expect(clean).toHaveLength(1);
    expect(clean[0]!.geometry).not.toBe(geometry);
    clean[0]!.geometry.dispose();
    const first = [a, b, protectedItem];
    expect(applyRendererOwnedStaticMeshConsolidation(source, first, {}, OFF)).toBe(first);
    const last = [protectedItem, a, b];
    expect(applyRendererOwnedStaticMeshConsolidation(source, last, {}, OFF)).toBe(last);
    const interleaved = [a, protectedItem, b];
    expect(applyRendererOwnedStaticMeshConsolidation(source, interleaved, {}, OFF)).toBe(interleaved);
    const other = new PBRMaterial({ roughness: 0.9 });
    const alternating = [a, { geometry, material: other }, b];
    expect(applyRendererOwnedStaticMeshConsolidation(source, alternating, {}, OFF)).toBe(alternating);
    const singleton = [a];
    expect(applyRendererOwnedStaticMeshConsolidation(source, singleton, {}, OFF)[0]).toBe(a);
    geometry.dispose(); material.dispose(); other.dispose();
  });

  it("guards the actual late PRD11 collect entry point with scoped flags", async () => {
    await import("../../../packages/rendering/src/lanes/prd11");
    const flag: QrFlagName = "A3D_QR_TIERS_BATCHING";
    const flags = createTrustedQrFlags({ [flag]: true });
    const contributor = frameContributors(flags).find((candidate) => candidate.id === "prd11.batching");
    expect(contributor?.collect).toBeDefined();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const device = new MockRenderDevice();
    const carrier = Symbol.for("@aura3d/rendering/advanced-lighting-bindings");
    const items: RenderItem[] = [{ geometry, material, label: "prd10.wind:first" }, { geometry, material, ...{ [carrier]: { value: 1 } } }];
    const context: FrameContributorContext = {
      device, flags, items, width: 1, height: 1, frameIndex: 0, timeSeconds: 0,
      camera: null, source: {}, tier: QUALITY_TIERS.high,
      sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 1000, orthographic: false } },
      blackboard: new Map()
    };
    const result = contributor!.collect!(items, context);
    expect(result).toEqual(items);
    result.forEach((item, index) => expect(item).toBe(items[index]));
    device.dispose(); geometry.dispose(); material.dispose();
  });

  it("keeps clipping source and material identities at the late PRD11 collect entry point", async () => {
    await import("../../../packages/rendering/src/lanes/prd11");
    const contributor = frameContributors(createTrustedQrFlags({ A3D_QR_TIERS_BATCHING: true }))
      .find((candidate) => candidate.id === "prd11.batching");
    expect(contributor?.collect).toBeDefined();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const device = new MockRenderDevice();
    const items: RenderItem[] = [{ geometry, material }, { geometry, material }];
    const context: FrameContributorContext = {
      device, flags: OFF, items, width: 1, height: 1, frameIndex: 0, timeSeconds: 0,
      camera: null, source: {}, tier: QUALITY_TIERS.high,
      sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 1000, orthographic: false } },
      blackboard: new Map()
    };
    const collect = (input: RenderItem[], source: FrameContributorContext["source"]) => contributor!.collect!(input, { ...context, items: input, source });
    const group = { planes: [] };
    let sourceCallbackCalls = 0;
    const sourceCallback = () => { sourceCallbackCalls += 1; return group; };
    try {
      // Call the real contributor with unobserved flags so this is a positive
      // control: the general registry guard alone does not explain the result.
      expect(collect(items, {})).toHaveLength(1);
      const globalSource = { globalClipping: group };
      const callbackSource = { materialClippingFor: sourceCallback };
      expect(collect(items, globalSource)).toBe(items);
      expect(collect(items, callbackSource)).toBe(items);
      expect(sourceCallbackCalls).toBe(0);
      expect(applyRendererOwnedStaticBatching({ ...globalSource, staticBatching: true }, items, {}, OFF)).toBe(items);
      expect(applyRendererOwnedStaticMeshConsolidation({ ...callbackSource, staticMeshConsolidation: true }, items, {}, OFF)).toBe(items);
      const globalItem: RenderItem[] = [{ ...items[0]!, globalClipping: group }, items[1]!];
      const materialItem: RenderItem[] = [{ ...items[0]!, materialClipping: group }, items[1]!];
      expect(collect(globalItem, {})).toEqual(globalItem);
      expect(collect(materialItem, {})).toEqual(materialItem);
      Reflect.set(material, "clipping", group);
      expect(collect(items, {})).toEqual(items);
      expect(planBatches(items).passthrough).toEqual(items);
      const instance = new MaterialInstance(material);
      const instances: RenderItem[] = [{ geometry, material: instance }, { geometry, material: instance }];
      expect(collect(instances, {})).toEqual(instances);
      expect(planBatches(instances).passthrough).toEqual(instances);
    } finally {
      disposeBatchPlanCacheFor(device); device.dispose(); geometry.dispose(); material.dispose();
    }
  });

  it("treats source and material clipping accessors as unsafe without evaluating them", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material }, { geometry, material }];
    const cache = new BatchPlanCache();
    let reads = 0;
    const source = Object.defineProperty({ staticBatching: true }, "globalClipping", {
      get() { reads += 1; throw new Error("clipping getter ran"); }
    });
    try {
      expect(applyRendererOwnedStaticBatching(source, items, {}, OFF)).toBe(items);
      Object.defineProperty(material, "clipping", { configurable: true, get() { reads += 1; throw new Error("material getter ran"); } });
      expect(cache.apply(items, { flags: OFF })).toEqual(items);
      expect(planBatches(items).passthrough).toEqual(items);
      expect(reads).toBe(0);
    } finally { cache.dispose(); geometry.dispose(); material.dispose(); }
  });
});

describe("renderer batching preserves observers registered during a frame", () => {
  it.each(["batching", "consolidation"] as const)("retains projected logical items when a source getter registers a collector (%s)", async (mode) => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4, qrFlags: TEST_ON });
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material, modelMatrix: translation(-0.5) }, { geometry, material, modelMatrix: translation(0.5) }];
    const events: string[] = [];
    const observed: RenderItem[][] = [];
    let remove: (() => void) | undefined;
    const source = {
      cameraPolicy: "identity" as const,
      frustumCulling: false,
      collectedLights: [],
      staticBatching: mode === "batching",
      staticMeshConsolidation: mode === "consolidation",
      collectRenderItems() { events.push("items"); return items; },
      get environmentLighting(): false {
        events.push("lighting");
        if (events.includes("items") && !remove) {
          remove = registerFrameContributor({
            id: `prd01.test.getter-${mode}`, owner: "prd01", flag: testFlag, phases: ["collect"],
            collect: (input) => { observed.push([...input]); return input; }
          });
        }
        return false;
      }
    };
    try {
      const diagnostics = renderer.render(source);
      expect(events.indexOf("items")).toBeGreaterThanOrEqual(0);
      expect(events.lastIndexOf("lighting")).toBeGreaterThan(events.indexOf("items"));
      expect(observed).toHaveLength(1);
      expect(observed[0]).toHaveLength(2);
      expect(observed[0]!.map((item) => (item as RenderItem & { temporalObjectKey: unknown }).temporalObjectKey)).toEqual(items);
      expect(observed[0]!.map((item) => item.modelMatrix?.[12])).toEqual([-0.5, 0.5]);
      expect(diagnostics.drawCalls).toBe(2);
      expect((renderer.device as MockRenderDevice).drawCommands.map((command) => command.instanceCount ?? 1)).toEqual([1, 1]);
    } finally { remove?.(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each(["batching", "consolidation"] as const)("keeps explicit draws when a scene callback registers an observer (%s)", async (mode) => {
    const flags = createTrustedQrFlags({ [testFlag]: true, A3D_QR_CORE_GENERATOR: true });
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4, qrFlags: flags });
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material, modelMatrix: translation(-0.5) }, { geometry, material, modelMatrix: translation(0.5) }];
    const scene = new Scene();
    const node = scene.createNode("register-observer");
    node.renderOrder = -1;
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "triangle", material: "pbr" }));
    const selected: unknown[] = [];
    let remove: (() => void) | undefined;
    node.onBeforeRender = () => {
      remove = registerShaderFeature({
        id: `prd01.test.scene-${mode}`, owner: "prd01", flag: testFlag,
        select: ({ item }) => { selected.push((item as RenderItem & { temporalObjectKey: unknown }).temporalObjectKey); return undefined; },
        defines: () => ({}), chunks: [], hooks: []
      });
    };
    try {
      const diagnostics = renderer.render({
        scene, geometryLibrary: { triangle: geometry }, materialLibrary: { pbr: material },
        renderItems: items, cameraPolicy: "identity", frustumCulling: false, collectedLights: [], environmentLighting: false,
        staticBatching: mode === "batching", staticMeshConsolidation: mode === "consolidation"
      });
      expect(remove).toBeDefined();
      expect(selected).toContain(items[0]);
      expect(selected).toContain(items[1]);
      expect(diagnostics.drawCalls).toBe(3);
      expect((renderer.device as MockRenderDevice).drawCommands.map((command) => command.instanceCount ?? 1)).toEqual([1, 1, 1]);
    } finally { remove?.(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each(["batching", "consolidation"] as const)("keeps logical draws when a device registers an observer after its first draw (%s)", async (mode) => {
    const flags = createTrustedQrFlags({ [testFlag]: true, A3D_QR_CORE_GENERATOR: true });
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const draw = device.draw.bind(device);
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material, modelMatrix: translation(-0.5) }, { geometry, material, modelMatrix: translation(0.5) }];
    const selected: unknown[] = [];
    let remove: (() => void) | undefined;
    device.draw = (command) => {
      draw(command);
      if (!remove) remove = registerShaderFeature({
        id: `prd01.test.device-${mode}`, owner: "prd01", flag: testFlag,
        select: ({ item }) => { selected.push((item as RenderItem & { temporalObjectKey: unknown }).temporalObjectKey); return undefined; },
        defines: () => ({}), chunks: [], hooks: []
      });
    };
    try {
      const diagnostics = renderer.render({
        renderItems: items, cameraPolicy: "identity", frustumCulling: false, collectedLights: [], environmentLighting: false,
        staticBatching: mode === "batching", staticMeshConsolidation: mode === "consolidation"
      });
      expect(remove).toBeDefined();
      expect(selected).toContain(items[1]);
      expect(diagnostics.drawCalls).toBe(2);
      expect(device.drawCommands.map((command) => command.instanceCount ?? 1)).toEqual([1, 1]);
    } finally { remove?.(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("does not trust the mock merely because its draw method is unchanged", async () => {
    const flags = createTrustedQrFlags({ [testFlag]: true, A3D_QR_CORE_GENERATOR: true });
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = [{ geometry, material, modelMatrix: translation(-0.5) }, { geometry, material, modelMatrix: translation(0.5) }];
    const selected: unknown[] = [];
    let remove: (() => void) | undefined;
    // The method itself is untouched; an externally visible dependency it
    // calls is enough to install a provider between two logical draws.
    device.drawCommands.push = (...commands) => {
      const length = Array.prototype.push.apply(device.drawCommands, commands);
      if (!remove) remove = registerShaderFeature({
        id: "prd01.test.device-command-log", owner: "prd01", flag: testFlag,
        select: ({ item }) => { selected.push((item as RenderItem & { temporalObjectKey: unknown }).temporalObjectKey); return undefined; },
        defines: () => ({}), chunks: [], hooks: []
      });
      return length;
    };
    try {
      const diagnostics = renderer.render({
        renderItems: items, cameraPolicy: "identity", frustumCulling: false, collectedLights: [], environmentLighting: false,
        staticBatching: true
      });
      expect(remove).toBeDefined();
      expect(selected).toContain(items[1]);
      expect(diagnostics.drawCalls).toBe(2);
      expect(device.drawCommands.map((command) => command.instanceCount ?? 1)).toEqual([1, 1]);
    } finally { remove?.(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });
});
