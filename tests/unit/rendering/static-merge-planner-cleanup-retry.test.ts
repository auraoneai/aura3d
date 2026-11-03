import { describe, expect, it, vi } from "vitest";

import { Geometry } from "../../../packages/rendering/src/Geometry";
import { InstancedPBRMaterial } from "../../../packages/rendering/src/InstancedPBRMaterial";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import type { RenderMaterial } from "../../../packages/rendering/src/ForwardPass";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { planBatches } from "../../../packages/rendering/src/batching/index";
import { applyRendererOwnedStaticBatching, BatchPlanCache, disposeBatchPlanCacheFor } from "../../../packages/rendering/src/renderer/CullingBatching";

interface RetryablePlanError extends AggregateError {
  readonly originalError: unknown;
  retryCleanup(): void;
}

function pairs(geometry: Geometry, ...materials: RenderMaterial[]): RenderItem[] {
  return materials.flatMap((material) => [{ geometry, material }, { geometry, material }]);
}

function failureOf(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the operation to fail");
}

function retryableFailure(error: unknown, original: unknown): RetryablePlanError {
  expect(error).toBeInstanceOf(AggregateError);
  const failure = error as RetryablePlanError;
  expect(failure.originalError).toBe(original);
  expect(failure.cause).toBe(original);
  expect(typeof failure.retryCleanup).toBe("function");
  return failure;
}

describe("static merge planner cleanup ownership", () => {
  it("retains a material whose initialization and disposal both fail", () => {
    const geometry = Geometry.litTriangle();
    const base = new PBRMaterial({ roughness: 0.8 });
    const source = new MaterialInstance(base);
    const planningError = new Error("material initialization failed");
    const cleanupError = new Error("material cleanup failed");
    const originalSet = InstancedPBRMaterial.prototype.setParameter;
    const originalDispose = InstancedPBRMaterial.prototype.dispose;
    const touched = new Set<InstancedPBRMaterial>();
    let cleanupUnavailable = true;
    const set = vi.spyOn(InstancedPBRMaterial.prototype, "setParameter").mockImplementation(function (this: InstancedPBRMaterial, name, value) {
      if (name === "u_roughness" && value === 0.8) throw planningError;
      originalSet.call(this, name, value);
    });
    const dispose = vi.spyOn(InstancedPBRMaterial.prototype, "dispose").mockImplementation(function (this: InstancedPBRMaterial) {
      touched.add(this);
      if (cleanupUnavailable) throw cleanupError;
      originalDispose.call(this);
    });
    try {
      const failure = retryableFailure(failureOf(() => planBatches(pairs(geometry, source), { multiDraw: false })), planningError);
      expect(failure.errors).toEqual([planningError, cleanupError]);
      expect(touched.size).toBe(1);
      const synthesized = [...touched][0]!;
      expect(synthesized.disposed).toBe(false);
      expect(base.disposed).toBe(false);
      expect(source.getParameter("u_roughness")).toBe(0.8);

      cleanupUnavailable = false;
      failure.retryCleanup();
      expect(synthesized.disposed).toBe(true);
      failure.retryCleanup();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(base.disposed).toBe(false);
    } finally {
      set.mockRestore(); dispose.mockRestore();
      for (const material of touched) if (!material.disposed) originalDispose.call(material);
      geometry.dispose(); base.dispose();
    }
  });

  it("aggregates all failures and retries only unfinished materials, even on reentry", () => {
    const geometry = Geometry.litTriangle();
    const first = new InstancedPBRMaterial({ name: "caller-instanced", roughness: 0.2 });
    const second = new PBRMaterial({ name: "second", roughness: 0.35 });
    const third = new PBRMaterial({ name: "third", roughness: 0.6 });
    const fourth = new PBRMaterial({ name: "fourth", roughness: 0.8 });
    const sources = [first, second, third, fourth];
    const firstName = "a3d-prd11-batched-caller-instanced";
    const secondName = "a3d-prd11-batched-second";
    const thirdName = "a3d-prd11-batched-third";
    const fourthName = "a3d-prd11-batched-fourth";
    const planningError = new Error("fourth material failed");
    const cleanupErrors = new Map([
      [firstName, new Error("first cleanup failed")],
      [secondName, new Error("second cleanup failed")],
      [fourthName, new Error("fourth cleanup failed")]
    ]);
    const unavailable = new Set(cleanupErrors.keys());
    const attempts = new Map<string, number>();
    const touched = new Map<string, InstancedPBRMaterial>();
    const originalSet = InstancedPBRMaterial.prototype.setParameter;
    const originalDispose = InstancedPBRMaterial.prototype.dispose;
    let failure: unknown;
    let retrying = false;
    let reentries = 0;
    const set = vi.spyOn(InstancedPBRMaterial.prototype, "setParameter").mockImplementation(function (this: InstancedPBRMaterial, name, value) {
      if (name === "u_roughness" && value === 0.8) throw planningError;
      originalSet.call(this, name, value);
    });
    const dispose = vi.spyOn(InstancedPBRMaterial.prototype, "dispose").mockImplementation(function (this: InstancedPBRMaterial) {
      touched.set(this.name, this);
      attempts.set(this.name, (attempts.get(this.name) ?? 0) + 1);
      if (retrying && this.name === firstName) {
        reentries += 1;
        (failure as RetryablePlanError).retryCleanup();
      }
      const error = cleanupErrors.get(this.name);
      if (error && unavailable.has(this.name)) throw error;
      originalDispose.call(this);
    });
    try {
      failure = failureOf(() => planBatches(pairs(geometry, ...sources), { multiDraw: false }));
      const retryable = retryableFailure(failure, planningError);
      expect(retryable.errors[0]).toBe(planningError);
      expect(new Set(retryable.errors.slice(1))).toEqual(new Set(cleanupErrors.values()));
      expect([...attempts.entries()]).toHaveLength(4);
      for (const name of [firstName, secondName, thirdName, fourthName]) expect(attempts.get(name)).toBe(1);
      expect(touched.get(thirdName)!.disposed).toBe(true);
      expect(sources.every((source) => !source.disposed)).toBe(true);
      expect(attempts.has(first.name)).toBe(false);

      unavailable.delete(firstName);
      retrying = true;
      const retryError = failureOf(() => retryable.retryCleanup());
      retrying = false;
      expect(retryError).toBeInstanceOf(AggregateError);
      expect(new Set((retryError as AggregateError).errors)).toEqual(new Set([cleanupErrors.get(secondName), cleanupErrors.get(fourthName)]));
      expect(reentries).toBe(1);
      expect(attempts.get(firstName)).toBe(2);
      expect(attempts.get(secondName)).toBe(2);
      expect(attempts.get(thirdName)).toBe(1);
      expect(attempts.get(fourthName)).toBe(2);
      expect(touched.get(firstName)!.disposed).toBe(true);

      unavailable.clear();
      retryable.retryCleanup();
      retryable.retryCleanup();
      expect(attempts.get(firstName)).toBe(2);
      expect(attempts.get(secondName)).toBe(3);
      expect(attempts.get(thirdName)).toBe(1);
      expect(attempts.get(fourthName)).toBe(3);
      expect([...touched.values()].every((material) => material.disposed)).toBe(true);
      expect(sources.every((source) => !source.disposed)).toBe(true);
    } finally {
      set.mockRestore(); dispose.mockRestore();
      for (const material of touched.values()) if (!material.disposed) originalDispose.call(material);
      geometry.dispose();
      for (const source of sources) source.dispose();
    }
  });

  it("reports a cleanup exception without retrying a material already disposed before it threw", () => {
    const geometry = Geometry.litTriangle();
    const source = new PBRMaterial({ roughness: 0.8 });
    const planningError = new Error("material initialization failed");
    const cleanupError = new Error("cleanup reported failure after disposal");
    const originalSet = InstancedPBRMaterial.prototype.setParameter;
    const originalDispose = InstancedPBRMaterial.prototype.dispose;
    const touched = new Set<InstancedPBRMaterial>();
    const set = vi.spyOn(InstancedPBRMaterial.prototype, "setParameter").mockImplementation(function (this: InstancedPBRMaterial, name, value) {
      if (name === "u_roughness" && value === 0.8) throw planningError;
      originalSet.call(this, name, value);
    });
    const dispose = vi.spyOn(InstancedPBRMaterial.prototype, "dispose").mockImplementation(function (this: InstancedPBRMaterial) {
      touched.add(this);
      originalDispose.call(this);
      throw cleanupError;
    });
    try {
      const failure = retryableFailure(failureOf(() => planBatches(pairs(geometry, source), { multiDraw: false })), planningError);
      expect(failure.errors).toEqual([planningError, cleanupError]);
      expect([...touched][0]!.disposed).toBe(true);
      failure.retryCleanup();
      failure.retryCleanup();
      expect(dispose).toHaveBeenCalledOnce();
      expect(source.disposed).toBe(false);
    } finally {
      set.mockRestore(); dispose.mockRestore();
      for (const material of touched) if (!material.disposed) originalDispose.call(material);
      geometry.dispose(); source.dispose();
    }
  });

  it("does not dispose a second material again when an earlier disposer already retired it", () => {
    const geometry = Geometry.litTriangle();
    const first = new PBRMaterial({ name: "first", roughness: 0.2 });
    const second = new PBRMaterial({ name: "second", roughness: 0.8 });
    const planningError = new Error("second initialization failed");
    const originalSet = InstancedPBRMaterial.prototype.setParameter;
    const originalDispose = InstancedPBRMaterial.prototype.dispose;
    const touched = new Set<InstancedPBRMaterial>();
    const merged: { first?: InstancedPBRMaterial; second?: InstancedPBRMaterial } = {};
    const set = vi.spyOn(InstancedPBRMaterial.prototype, "setParameter").mockImplementation(function (this: InstancedPBRMaterial, name, value) {
      if (name === "u_roughness" && value === 0.2) merged.first = this;
      if (name === "u_roughness" && value === 0.8) { merged.second = this; throw planningError; }
      originalSet.call(this, name, value);
    });
    const dispose = vi.spyOn(InstancedPBRMaterial.prototype, "dispose").mockImplementation(function (this: InstancedPBRMaterial) {
      touched.add(this);
      if (this === merged.first) merged.second!.dispose();
      originalDispose.call(this);
    });
    try {
      expect(failureOf(() => planBatches(pairs(geometry, first, second), { multiDraw: false }))).toBe(planningError);
      expect(merged.first?.disposed).toBe(true);
      expect(merged.second?.disposed).toBe(true);
      expect(dispose.mock.instances.filter((material) => material === merged.first)).toHaveLength(1);
      expect(dispose.mock.instances.filter((material) => material === merged.second)).toHaveLength(1);
      expect(first.disposed).toBe(false);
      expect(second.disposed).toBe(false);
    } finally {
      set.mockRestore(); dispose.mockRestore();
      for (const material of touched) if (!material.disposed) originalDispose.call(material);
      geometry.dispose(); first.dispose(); second.dispose();
    }
  });

  it("retains a synthesized material when an item throws after material creation but before batch insertion", () => {
    const geometry = Geometry.litTriangle();
    const source = new PBRMaterial({ roughness: 0.2 });
    const planningError = new Error("post-material item access failed");
    const cleanupError = new Error("post-material cleanup failed");
    const originalSet = InstancedPBRMaterial.prototype.setParameter;
    const originalDispose = InstancedPBRMaterial.prototype.dispose;
    const created: { material?: InstancedPBRMaterial } = {};
    let cleanupUnavailable = true;
    const set = vi.spyOn(InstancedPBRMaterial.prototype, "setParameter").mockImplementation(function (this: InstancedPBRMaterial, name, value) {
      if (name === "u_roughness" && value === 0.2) created.material = this;
      originalSet.call(this, name, value);
    });
    const dispose = vi.spyOn(InstancedPBRMaterial.prototype, "dispose").mockImplementation(function (this: InstancedPBRMaterial) {
      if (cleanupUnavailable) throw cleanupError;
      originalDispose.call(this);
    });
    const item = new Proxy({ geometry, material: source, castShadow: true }, {
      get(target, key, receiver) {
        if (key === "castShadow" && created.material) throw planningError;
        return Reflect.get(target, key, receiver);
      }
    });
    try {
      const failure = retryableFailure(failureOf(() => planBatches([item, item], { multiDraw: false })), planningError);
      expect(failure.errors).toEqual([planningError, cleanupError]);
      expect(created.material?.disposed).toBe(false);
      expect(dispose).toHaveBeenCalledOnce();
      cleanupUnavailable = false;
      failure.retryCleanup();
      expect(created.material?.disposed).toBe(true);
      expect(source.disposed).toBe(false);
    } finally {
      set.mockRestore(); dispose.mockRestore();
      if (created.material && !created.material.disposed) originalDispose.call(created.material);
      geometry.dispose(); source.dispose();
    }
  });

  it("keeps nested planning failures and their cleanup owners independent", () => {
    const geometry = Geometry.litTriangle();
    const outerSource = new PBRMaterial({ name: "outer", roughness: 0.8 });
    const innerSource = new PBRMaterial({ name: "inner", roughness: 0.9 });
    const outerPlanningError = new Error("outer planning failed");
    const innerPlanningError = new Error("inner planning failed");
    const innerCleanupError = new Error("inner cleanup failed");
    const originalSet = InstancedPBRMaterial.prototype.setParameter;
    const originalDispose = InstancedPBRMaterial.prototype.dispose;
    const touched = new Map<string, InstancedPBRMaterial>();
    let launchNested = true;
    let innerCleanupUnavailable = true;
    let nestedFailure: unknown;
    const set = vi.spyOn(InstancedPBRMaterial.prototype, "setParameter").mockImplementation(function (this: InstancedPBRMaterial, name, value) {
      if (name === "u_roughness" && value === 0.8) throw outerPlanningError;
      if (name === "u_roughness" && value === 0.9) throw innerPlanningError;
      originalSet.call(this, name, value);
    });
    const dispose = vi.spyOn(InstancedPBRMaterial.prototype, "dispose").mockImplementation(function (this: InstancedPBRMaterial) {
      touched.set(this.name, this);
      if (this.name === "a3d-prd11-batched-outer" && launchNested) {
        launchNested = false;
        nestedFailure = failureOf(() => planBatches(pairs(geometry, innerSource), { multiDraw: false }));
        throw nestedFailure;
      }
      if (this.name === "a3d-prd11-batched-inner" && innerCleanupUnavailable) throw innerCleanupError;
      originalDispose.call(this);
    });
    try {
      const outer = retryableFailure(failureOf(() => planBatches(pairs(geometry, outerSource), { multiDraw: false })), outerPlanningError);
      const inner = retryableFailure(nestedFailure, innerPlanningError);
      expect(outer.errors).toEqual([outerPlanningError, inner]);
      expect(inner.errors).toEqual([innerPlanningError, innerCleanupError]);
      outer.retryCleanup();
      expect(touched.get("a3d-prd11-batched-outer")!.disposed).toBe(true);
      expect(touched.get("a3d-prd11-batched-inner")!.disposed).toBe(false);
      innerCleanupUnavailable = false;
      inner.retryCleanup();
      expect(touched.get("a3d-prd11-batched-inner")!.disposed).toBe(true);
      expect(outerSource.disposed).toBe(false);
      expect(innerSource.disposed).toBe(false);
    } finally {
      set.mockRestore(); dispose.mockRestore();
      for (const material of touched.values()) if (!material.disposed) originalDispose.call(material);
      geometry.dispose(); outerSource.dispose(); innerSource.dispose();
    }
  });

  it("exposes the retry handle through the cache caller without retiring its prior plan or source materials", () => {
    const geometry = Geometry.litTriangle();
    const stable = new PBRMaterial({ name: "stable", roughness: 0.2 });
    const failingBase = new PBRMaterial({ name: "failing", roughness: 0.8 });
    const failing = new MaterialInstance(failingBase);
    const cache = new BatchPlanCache();
    const options = { flags: createTrustedQrFlags({}), multiDraw: false };
    const stableItems = pairs(geometry, stable);
    const previousItems = cache.apply(stableItems, options);
    const previousMaterial = previousItems[0]!.material as InstancedPBRMaterial;
    const previousPlan = cache.lastPlan;
    const planningError = new Error("cache planning failed");
    const cleanupError = new Error("cache planning cleanup failed");
    const originalSet = InstancedPBRMaterial.prototype.setParameter;
    const originalDispose = InstancedPBRMaterial.prototype.dispose;
    const touched = new Set<InstancedPBRMaterial>();
    let cleanupUnavailable = true;
    const failed: { material?: InstancedPBRMaterial } = {};
    const set = vi.spyOn(InstancedPBRMaterial.prototype, "setParameter").mockImplementation(function (this: InstancedPBRMaterial, name, value) {
      if (name === "u_roughness" && value === 0.8) { failed.material = this; throw planningError; }
      originalSet.call(this, name, value);
    });
    const dispose = vi.spyOn(InstancedPBRMaterial.prototype, "dispose").mockImplementation(function (this: InstancedPBRMaterial) {
      touched.add(this);
      if (this === failed.material && cleanupUnavailable) throw cleanupError;
      originalDispose.call(this);
    });
    try {
      expect(previousItems).toHaveLength(1);
      expect(previousMaterial).toBeInstanceOf(InstancedPBRMaterial);
      const failure = retryableFailure(failureOf(() => cache.apply(pairs(geometry, stable, failing), options)), planningError);
      expect(failure.errors).toEqual([planningError, cleanupError]);
      expect(cache.lastPlan).toBe(previousPlan);
      expect(cache.planVersion).toBe(1);
      expect(previousMaterial.disposed).toBe(false);
      expect(failed.material?.disposed).toBe(false);
      expect(stable.disposed).toBe(false);
      expect(failingBase.disposed).toBe(false);

      expect(() => cache.dispose()).toThrow("Batch plan cleanup retry failed");
      expect(previousMaterial.disposed).toBe(true);
      expect(failed.material?.disposed).toBe(false);
      cleanupUnavailable = false;
      failure.retryCleanup();
      cache.dispose();
      expect(failed.material?.disposed).toBe(true);
      expect(dispose.mock.contexts.filter((material) => material === previousMaterial)).toHaveLength(1);
      expect(stable.disposed).toBe(false);
      expect(failingBase.disposed).toBe(false);
    } finally {
      set.mockRestore(); dispose.mockRestore();
      cache.dispose();
      for (const material of touched) if (!material.disposed) originalDispose.call(material);
      geometry.dispose(); stable.dispose(); failingBase.dispose();
    }
  });

  it("propagates the same retry handle through renderer-owned batching", () => {
    const geometry = Geometry.litTriangle();
    const sourceMaterial = new PBRMaterial({ roughness: 0.8 });
    const source = { staticBatching: true };
    const owner = {};
    const flags = createTrustedQrFlags({ A3D_QR_TIERS_BATCHING: true });
    const planningError = new Error("renderer batching planning failed");
    const cleanupError = new Error("renderer batching cleanup failed");
    const originalSet = InstancedPBRMaterial.prototype.setParameter;
    const originalDispose = InstancedPBRMaterial.prototype.dispose;
    const created: { material?: InstancedPBRMaterial } = {};
    let cleanupUnavailable = true;
    const set = vi.spyOn(InstancedPBRMaterial.prototype, "setParameter").mockImplementation(function (this: InstancedPBRMaterial, name, value) {
      if (name === "u_roughness" && value === 0.8) { created.material = this; throw planningError; }
      originalSet.call(this, name, value);
    });
    const dispose = vi.spyOn(InstancedPBRMaterial.prototype, "dispose").mockImplementation(function (this: InstancedPBRMaterial) {
      if (cleanupUnavailable) throw cleanupError;
      originalDispose.call(this);
    });
    try {
      const failure = retryableFailure(failureOf(() => applyRendererOwnedStaticBatching(source, pairs(geometry, sourceMaterial), owner, flags)), planningError);
      expect(failure.errors).toEqual([planningError, cleanupError]);
      expect(created.material?.disposed).toBe(false);
      expect(() => disposeBatchPlanCacheFor(owner)).toThrow("Batch plan cleanup retry failed");
      expect(created.material?.disposed).toBe(false);
      cleanupUnavailable = false;
      failure.retryCleanup();
      disposeBatchPlanCacheFor(owner);
      expect(created.material?.disposed).toBe(true);
      expect(dispose).toHaveBeenCalledTimes(3);
      expect(sourceMaterial.disposed).toBe(false);
    } finally {
      set.mockRestore(); dispose.mockRestore();
      disposeBatchPlanCacheFor(owner);
      if (created.material && !created.material.disposed) originalDispose.call(created.material);
      geometry.dispose(); sourceMaterial.dispose();
    }
  });
});
