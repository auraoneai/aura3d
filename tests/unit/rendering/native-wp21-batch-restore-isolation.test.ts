import { describe, expect, it, vi } from "vitest";

import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { BatchedGeometryPool } from "../../../packages/rendering/src/batching/BatchedGeometryPool";
import { buildMultiDrawBatch, multiDrawCommands } from "../../../packages/rendering/src/batching/MultiDrawBatch";
import { ResourceRegistry, sharedResourceRegistry } from "../../../packages/rendering/src/resources/ResourceRegistry";

class GenerationalMockDevice extends MockRenderDevice {
  generation = 0;
}

describe("WP-21 packed batch restore isolation", () => {
  it("keeps another device's resident geometry and draw data unchanged", async () => {
    const deviceA = new MockRenderDevice();
    const deviceB = new MockRenderDevice();
    const geometryA = Geometry.litTriangle();
    const geometryB = Geometry.litTriangle();
    const materialA = new PBRMaterial();
    const materialB = new PBRMaterial();
    const batchA = buildMultiDrawBatch({
      key: "a",
      programKey: "a",
      vertexLayoutKey: "a",
      members: [{ geometry: geometryA, material: materialA }]
    });
    const batchB = buildMultiDrawBatch({
      key: "b",
      programKey: "b",
      vertexLayoutKey: "b",
      members: [{ geometry: geometryB, material: materialB }]
    });
    try {
      const originalA = batchA.pool.upload(deviceA);
      const originalB = batchB.pool.upload(deviceB);
      const geometryBResident = batchB.pool.asGeometry();
      const geometryBBuffer = geometryBResident.vertexBuffer.upload(deviceB);
      const drawDataA = batchA.drawData.upload();
      const drawDataB = batchB.drawData.upload();
      const revisionA = drawDataA.revision;
      const revisionB = drawDataB.revision;
      const result = await sharedResourceRegistry().rebuild(deviceA);
      expect(result.failed).toEqual([]);
      expect(originalA.vertexBuffer.disposed).toBe(true);
      expect(originalA.indexBuffer!.disposed).toBe(true);
      expect(originalB.vertexBuffer.disposed).toBe(false);
      expect(originalB.indexBuffer!.disposed).toBe(false);
      expect(batchB.pool.upload(deviceB).vertexBuffer).toBe(originalB.vertexBuffer);
      expect(batchB.pool.upload(deviceB).indexBuffer).toBe(originalB.indexBuffer);
      expect(geometryBResident.disposed).toBe(false);
      expect(geometryBBuffer.disposed).toBe(false);
      expect(drawDataA.revision).toBeGreaterThan(revisionA);
      expect(drawDataB.disposed).toBe(false);
      expect(drawDataB.revision).toBe(revisionB);
      const restoredA = batchA.pool.upload(deviceA);
      const restoredRevisionA = drawDataA.revision;
      expect((await sharedResourceRegistry().rebuild(deviceB)).failed).toEqual([]);
      expect(originalB.vertexBuffer.disposed).toBe(true);
      expect(originalB.indexBuffer!.disposed).toBe(true);
      expect(restoredA.vertexBuffer.disposed).toBe(false);
      expect(restoredA.indexBuffer!.disposed).toBe(false);
      expect(drawDataA.revision).toBe(restoredRevisionA);
      expect(drawDataB.revision).toBeGreaterThan(revisionB);
      expect(geometryBBuffer.disposed).toBe(false);
      expect(geometryB.disposed).toBe(false);
    } finally {
      batchA.drawData.dispose();
      batchA.pool.dispose();
      batchB.drawData.dispose();
      batchB.pool.dispose();
      geometryA.dispose();
      geometryB.dispose();
      materialA.dispose();
      materialB.dispose();
      deviceA.dispose();
      deviceB.dispose();
    }
  });

  it("keeps concurrent borrowed-pool commands resident on their respective devices", () => {
    const deviceA = new MockRenderDevice();
    const deviceB = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const pool = new BatchedGeometryPool();
    const group = { key: "shared", programKey: "shared", vertexLayoutKey: "shared", members: [{ geometry, material }] };
    const batchA = buildMultiDrawBatch(group, pool, deviceA);
    const batchB = buildMultiDrawBatch(group, pool, deviceB);
    try {
      const commandA = multiDrawCommands(deviceA, batchA)[0]!;
      const commandB = multiDrawCommands(deviceB, batchB)[0]!;
      expect(commandA.vertexBuffer).not.toBe(commandB.vertexBuffer);
      expect(commandA.indexBuffer).not.toBe(commandB.indexBuffer);
      expect(commandA.vertexBuffer.disposed).toBe(false);
      expect(commandA.indexBuffer!.disposed).toBe(false);
      expect(deviceA.readBuffer(commandA.vertexBuffer)).toEqual(deviceB.readBuffer(commandB.vertexBuffer));
      expect(multiDrawCommands(deviceA, batchA)[0]!.vertexBuffer).toBe(commandA.vertexBuffer);
      expect(multiDrawCommands(deviceB, batchB)[0]!.vertexBuffer).toBe(commandB.vertexBuffer);
      expect(commandB.vertexBuffer.disposed).toBe(false);
    } finally {
      batchA.drawData.dispose(); batchB.drawData.dispose(); pool.dispose();
      geometry.dispose(); material.dispose(); deviceA.dispose(); deviceB.dispose();
    }
  });

  it("restores each leased device arena independently and retires them only after the last lease", async () => {
    const deviceA = new GenerationalMockDevice();
    const deviceB = new GenerationalMockDevice();
    const geometryA = Geometry.litTriangle();
    const geometryB = Geometry.litTriangle();
    const material = new PBRMaterial();
    const pool = new BatchedGeometryPool();
    const registry = new ResourceRegistry();
    pool.registerForRestore(registry, deviceA);
    const batchA = buildMultiDrawBatch({
      key: "a", programKey: "shared", vertexLayoutKey: "shared", members: [{ geometry: geometryA, material }]
    }, pool, deviceA);
    const batchB = buildMultiDrawBatch({
      key: "b", programKey: "shared", vertexLayoutKey: "shared", members: [{ geometry: geometryB, material }]
    }, pool, deviceB);
    const leaseA = pool.retainGeneration();
    const leaseB = pool.retainGeneration();
    try {
      const initialA = multiDrawCommands(deviceA, batchA)[0]!;
      const initialB = multiDrawCommands(deviceB, batchB)[0]!;
      expect(pool.upload(deviceA).vertexBuffer).toBe(initialA.vertexBuffer);
      expect(pool.upload(deviceB).vertexBuffer).toBe(initialB.vertexBuffer);
      expect(pool.upload(deviceA).indexBuffer).toBe(initialA.indexBuffer);
      expect(pool.upload(deviceB).indexBuffer).toBe(initialB.indexBuffer);
      expect(registry.size).toBe(2);

      deviceA.generation += 1;
      expect(await registry.rebuild(deviceA)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      const restoredA = pool.upload(deviceA);
      expect(restoredA.vertexBuffer).not.toBe(initialA.vertexBuffer);
      expect(restoredA.indexBuffer).not.toBe(initialA.indexBuffer);
      expect(pool.upload(deviceB).vertexBuffer).toBe(initialB.vertexBuffer);
      expect(pool.upload(deviceB).indexBuffer).toBe(initialB.indexBuffer);
      expect(initialA.vertexBuffer.disposed).toBe(false);
      expect(initialA.indexBuffer!.disposed).toBe(false);
      expect(initialB.vertexBuffer.disposed).toBe(false);
      expect(initialB.indexBuffer!.disposed).toBe(false);

      deviceB.generation += 1;
      expect(await registry.rebuild(deviceB)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      const restoredB = pool.upload(deviceB);
      expect(restoredB.vertexBuffer).not.toBe(initialB.vertexBuffer);
      expect(restoredB.indexBuffer).not.toBe(initialB.indexBuffer);
      expect(pool.upload(deviceA).vertexBuffer).toBe(restoredA.vertexBuffer);
      expect(pool.upload(deviceA).indexBuffer).toBe(restoredA.indexBuffer);
      expect(leaseA.isCurrent()).toBe(true);
      expect(leaseB.isCurrent()).toBe(true);

      pool.dispose();
      expect(registry.size).toBe(0);
      expect([initialA.vertexBuffer, initialB.vertexBuffer, restoredA.vertexBuffer, restoredB.vertexBuffer]
        .every((buffer) => !buffer.disposed)).toBe(true);
      leaseA.release();
      expect(restoredB.vertexBuffer.disposed).toBe(false);
      leaseB.release();
      expect([initialA.vertexBuffer, initialB.vertexBuffer, restoredA.vertexBuffer, restoredB.vertexBuffer]
        .every((buffer) => buffer.disposed)).toBe(true);
      expect([initialA.indexBuffer!, initialB.indexBuffer!, restoredA.indexBuffer!, restoredB.indexBuffer!]
        .every((buffer) => buffer.disposed)).toBe(true);
      expect(geometryA.disposed).toBe(false);
      expect(geometryB.disposed).toBe(false);
    } finally {
      leaseA.release(); leaseB.release();
      batchA.drawData.dispose(); batchB.drawData.dispose(); pool.dispose();
      geometryA.dispose(); geometryB.dispose(); material.dispose(); deviceA.dispose(); deviceB.dispose();
    }
  });

  it("updates every device's packed-content generation independently", () => {
    const deviceA = new MockRenderDevice();
    const deviceB = new MockRenderDevice();
    const first = Geometry.litTriangle();
    const second = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    try {
      pool.pack(first);
      const initialA = pool.upload(deviceA);
      const initialB = pool.upload(deviceB);
      pool.pack(second);
      const updatedA = pool.upload(deviceA);
      expect(updatedA.vertexBuffer.byteLength).toBe(initialA.vertexBuffer.byteLength * 2);
      expect(initialB.vertexBuffer.disposed).toBe(false);
      const updatedB = pool.upload(deviceB);
      expect(updatedB.vertexBuffer).not.toBe(initialB.vertexBuffer);
      expect(updatedB.vertexBuffer.byteLength).toBe(initialB.vertexBuffer.byteLength * 2);
      expect(deviceA.readBuffer(updatedA.vertexBuffer)).toEqual(deviceB.readBuffer(updatedB.vertexBuffer));
      expect(deviceA.readBuffer(updatedA.indexBuffer!)).toEqual(deviceB.readBuffer(updatedB.indexBuffer!));
      expect(pool.upload(deviceA).vertexBuffer).toBe(updatedA.vertexBuffer);
      expect(pool.upload(deviceB).vertexBuffer).toBe(updatedB.vertexBuffer);
    } finally {
      pool.dispose(); first.dispose(); second.dispose(); deviceA.dispose(); deviceB.dispose();
    }
  });

  it("registers every device already resident when restore ownership is attached later", async () => {
    const deviceA = new MockRenderDevice();
    const deviceB = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    const registry = new ResourceRegistry();
    try {
      pool.pack(geometry);
      const residentA = pool.upload(deviceA);
      const residentB = pool.upload(deviceB);
      pool.registerForRestore(registry);
      expect(registry.size).toBe(2);
      expect(await registry.rebuild(deviceA)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(residentA.vertexBuffer.disposed).toBe(true);
      expect(residentB.vertexBuffer.disposed).toBe(false);
      const restoredA = pool.upload(deviceA);
      expect(await registry.rebuild(deviceB)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(residentB.vertexBuffer.disposed).toBe(true);
      expect(restoredA.vertexBuffer.disposed).toBe(false);
    } finally {
      pool.dispose(); geometry.dispose(); deviceA.dispose(); deviceB.dispose();
    }
    expect(registry.size).toBe(0);
  });

  it("keeps a new same-registry lifetime distinct from a pending old unregister", async () => {
    const deviceA = new MockRenderDevice();
    const deviceB = new MockRenderDevice();
    const first = Geometry.litTriangle();
    const second = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    const registry = new ResourceRegistry();
    pool.pack(first);
    pool.registerForRestore(registry, deviceA);
    const oldA = pool.upload(deviceA);
    const unregisterOriginal = registry.unregister.bind(registry);
    let failOld = true;
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      if (handle === pool && failOld) throw new Error("old unregister failed");
      unregisterOriginal(handle);
    });
    const createA = vi.spyOn(deviceA, "createBuffer");
    const createB = vi.spyOn(deviceB, "createBuffer");
    try {
      expect(() => pool.dispose()).toThrow(/disposal failed/i);
      expect(oldA.vertexBuffer.disposed).toBe(true);
      expect(registry.size).toBe(1);

      pool.pack(second);
      pool.registerForRestore(registry, deviceB);
      const liveB = pool.upload(deviceB);
      expect(registry.size).toBe(2);
      createA.mockClear(); createB.mockClear();
      expect(await registry.rebuild(deviceA)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(createA).not.toHaveBeenCalled();
      expect(createB).not.toHaveBeenCalled();
      expect(liveB.vertexBuffer.disposed).toBe(false);
      expect(await registry.rebuild(deviceB)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(liveB.vertexBuffer.disposed).toBe(true);
      const restoredB = pool.upload(deviceB);
      expect(restoredB.vertexBuffer.disposed).toBe(false);

      failOld = false;
      expect(() => pool.dispose()).not.toThrow();
      expect(restoredB.vertexBuffer.disposed).toBe(true);
      expect(registry.size).toBe(0);
      expect(unregister.mock.calls.filter(([handle]) => handle !== pool)).toHaveLength(1);
    } finally {
      unregister.mockRestore(); createA.mockRestore(); createB.mockRestore();
      unregisterOriginal(pool); pool.dispose(); first.dispose(); second.dispose(); deviceA.dispose(); deviceB.dispose();
    }
  });

  it("retries an old registry without skipping cleanup for the new registry", async () => {
    const deviceA = new MockRenderDevice();
    const deviceB = new MockRenderDevice();
    const first = Geometry.litTriangle();
    const second = Geometry.litTriangle();
    const pool = new BatchedGeometryPool();
    const oldRegistry = new ResourceRegistry();
    const newRegistry = new ResourceRegistry();
    pool.pack(first);
    pool.registerForRestore(oldRegistry, deviceA);
    pool.upload(deviceA);
    const oldUnregisterOriginal = oldRegistry.unregister.bind(oldRegistry);
    let failOld = true;
    const oldUnregister = vi.spyOn(oldRegistry, "unregister").mockImplementation((handle) => {
      if (failOld) throw new Error("old registry unavailable");
      oldUnregisterOriginal(handle);
    });
    const newUnregister = vi.spyOn(newRegistry, "unregister");
    try {
      expect(() => pool.dispose()).toThrow(/disposal failed/i);
      pool.pack(second);
      pool.registerForRestore(newRegistry, deviceB);
      const liveB = pool.upload(deviceB);
      expect(await oldRegistry.rebuild(deviceA)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      expect(liveB.vertexBuffer.disposed).toBe(false);

      expect(() => pool.dispose()).toThrow(/disposal failed/i);
      expect(oldRegistry.size).toBe(1);
      expect(newRegistry.size).toBe(0);
      expect(newUnregister).toHaveBeenCalledOnce();
      expect(liveB.vertexBuffer.disposed).toBe(true);
      failOld = false;
      expect(() => pool.dispose()).not.toThrow();
      expect(oldRegistry.size).toBe(0);
      expect(newUnregister).toHaveBeenCalledOnce();
    } finally {
      oldUnregister.mockRestore(); newUnregister.mockRestore();
      oldUnregisterOriginal(pool); pool.dispose(); first.dispose(); second.dispose(); deviceA.dispose(); deviceB.dispose();
    }
  });
});
