import { describe, expect, it, vi } from "vitest";

import {
  BatchPlanBuildError,
  Geometry,
  InstancedPBRMaterial,
  MockRenderDevice,
  PBRMaterial,
  Renderer,
  createDefaultShaderLibrary,
  planBatches
} from "@aura3d/rendering";
import { BatchPlanBuildError as BatchingBuildError } from "../../../packages/rendering/src/batching/index";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import {
  applyRendererOwnedStaticBatching,
  batchPlanCacheFor,
  disposeBatchPlanCacheFor
} from "../../../packages/rendering/src/renderer/CullingBatching";

const options = { flags: createTrustedQrFlags({}), multiDraw: false } as const;
const batchingFlags = createTrustedQrFlags({ A3D_QR_TIERS_BATCHING: true });

function pairs(geometry: Geometry, ...materials: PBRMaterial[]): RenderItem[] {
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

function installFailure(name = "broken") {
  const planningError = new Error(`${name} planning failed`);
  const cleanupError = new Error(`${name} cleanup failed`);
  const originalSet = InstancedPBRMaterial.prototype.setParameter;
  const originalDispose = InstancedPBRMaterial.prototype.dispose;
  let generated: InstancedPBRMaterial | undefined;
  let blocked = true;
  let attempts = 0;
  let onDispose: (() => void) | undefined;
  const set = vi.spyOn(InstancedPBRMaterial.prototype, "setParameter").mockImplementation(function (this: InstancedPBRMaterial, key, value) {
    if (this.name === `a3d-prd11-batched-${name}` && key === "u_roughness" && value === 0.8) {
      generated = this;
      throw planningError;
    }
    originalSet.call(this, key, value);
  });
  const dispose = vi.spyOn(InstancedPBRMaterial.prototype, "dispose").mockImplementation(function (this: InstancedPBRMaterial) {
    if (this === generated) {
      attempts += 1;
      onDispose?.();
      if (blocked) throw cleanupError;
    }
    originalDispose.call(this);
  });
  return {
    planningError,
    cleanupError,
    get material(): InstancedPBRMaterial {
      if (!generated) throw new Error("The synthesized material was not created");
      return generated;
    },
    get attempts() { return attempts; },
    unblock() { blocked = false; },
    onDispose(callback: (() => void) | undefined) { onDispose = callback; },
    restore() { set.mockRestore(); dispose.mockRestore(); },
    release() { if (generated && !generated.disposed) originalDispose.call(generated); }
  };
}

function expectBuildError(value: unknown, original: unknown): BatchPlanBuildError {
  expect(value).toBeInstanceOf(BatchPlanBuildError);
  const error = value as BatchPlanBuildError;
  expect(error.originalError).toBe(original);
  expect(error.cause).toBe(original);
  return error;
}

describe("public batch-plan failures and cache cleanup ownership", () => {
  it("exports the real retryable error through the batching barrel and package root", () => {
    expect(typeof BatchPlanBuildError).toBe("function");
    expect(BatchingBuildError).toBe(BatchPlanBuildError);
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial({ name: "broken", roughness: 0.8 });
    const fault = installFailure();
    try {
      const failure = expectBuildError(failureOf(() => planBatches(pairs(geometry, material), { multiDraw: false })), fault.planningError);
      expect(failure.errors).toEqual([fault.planningError, fault.cleanupError]);
      expect(fault.material.disposed).toBe(false);
      fault.unblock();
      failure.retryCleanup();
      failure.retryCleanup();
      expect(fault.material.disposed).toBe(true);
      expect(fault.attempts).toBe(2);
      expect(material.disposed).toBe(false);
    } finally {
      fault.restore(); fault.release(); geometry.dispose(); material.dispose();
    }
  });

  it("retries failed planning cleanup at owner disposal without touching a peer device", () => {
    const deviceA = new MockRenderDevice();
    const deviceB = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const stable = new PBRMaterial({ name: "stable", roughness: 0.2 });
    const broken = new PBRMaterial({ name: "broken", roughness: 0.8 });
    const source = { staticBatching: true };
    const stableItems = pairs(geometry, stable);
    const old = applyRendererOwnedStaticBatching(source, stableItems, deviceA, batchingFlags)[0]!.material as InstancedPBRMaterial;
    const peer = applyRendererOwnedStaticBatching(source, stableItems, deviceB, batchingFlags)[0]!.material as InstancedPBRMaterial;
    const cacheA = batchPlanCacheFor(deviceA);
    const priorPlan = cacheA.lastPlan;
    const fault = installFailure();
    try {
      const failure = expectBuildError(failureOf(() =>
        applyRendererOwnedStaticBatching(source, pairs(geometry, stable, broken), deviceA, batchingFlags)), fault.planningError);
      expect(cacheA.lastPlan).toBe(priorPlan);
      expect(old.disposed).toBe(false);
      expect(fault.material.disposed).toBe(false);

      const disposalError = failureOf(() => disposeBatchPlanCacheFor(deviceA)) as AggregateError;
      expect(disposalError).toBeInstanceOf(AggregateError);
      expect(disposalError.errors).toContain(failure);
      expect(disposalError.cause).toBe(failure);
      expect(disposalError.errors[1]).toBeInstanceOf(AggregateError);
      expect((disposalError.errors[1] as AggregateError).errors).toEqual([fault.cleanupError]);
      expect(failure.errors).toEqual([fault.planningError, fault.cleanupError]);
      expect(old.disposed).toBe(true);
      expect(fault.material.disposed).toBe(false);
      expect(peer.disposed).toBe(false);
      expect(fault.attempts).toBe(2);

      fault.unblock();
      disposeBatchPlanCacheFor(deviceA);
      failure.retryCleanup();
      disposeBatchPlanCacheFor(deviceA);
      expect(fault.material.disposed).toBe(true);
      expect(fault.attempts).toBe(3);
      expect(peer.disposed).toBe(false);
      expect(stable.disposed).toBe(false);
      expect(broken.disposed).toBe(false);
      expect(geometry.disposed).toBe(false);
    } finally {
      fault.restore();
      disposeBatchPlanCacheFor(deviceA); disposeBatchPlanCacheFor(deviceB);
      fault.release(); geometry.dispose(); stable.dispose(); broken.dispose(); deviceA.dispose(); deviceB.dispose();
    }
  });

  it("allows a caller to finish cleanup before owner disposal without a second release", () => {
    const owner = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial({ name: "broken", roughness: 0.8 });
    const fault = installFailure();
    try {
      const failure = expectBuildError(failureOf(() =>
        applyRendererOwnedStaticBatching({ staticBatching: true }, pairs(geometry, material), owner, batchingFlags)), fault.planningError);
      fault.unblock();
      failure.retryCleanup();
      expect(fault.material.disposed).toBe(true);
      disposeBatchPlanCacheFor(owner);
      failure.retryCleanup();
      expect(fault.attempts).toBe(2);
      expect(material.disposed).toBe(false);
    } finally {
      fault.restore(); disposeBatchPlanCacheFor(owner);
      fault.release(); geometry.dispose(); material.dispose(); owner.dispose();
    }
  });

  it("does not retry a material that disposed before reporting its cleanup error", () => {
    const owner = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial({ name: "broken", roughness: 0.8 });
    const planningError = new Error("planning failed");
    const cleanupError = new Error("cleanup reported failure after disposal");
    const originalSet = InstancedPBRMaterial.prototype.setParameter;
    const originalDispose = InstancedPBRMaterial.prototype.dispose;
    const generated: { material?: InstancedPBRMaterial } = {};
    let attempts = 0;
    const set = vi.spyOn(InstancedPBRMaterial.prototype, "setParameter").mockImplementation(function (this: InstancedPBRMaterial, key, value) {
      if (key === "u_roughness" && value === 0.8) {
        generated.material = this;
        throw planningError;
      }
      originalSet.call(this, key, value);
    });
    const dispose = vi.spyOn(InstancedPBRMaterial.prototype, "dispose").mockImplementation(function (this: InstancedPBRMaterial) {
      if (this === generated.material) {
        attempts += 1;
        originalDispose.call(this);
        throw cleanupError;
      }
      originalDispose.call(this);
    });
    try {
      const failure = expectBuildError(failureOf(() =>
        batchPlanCacheFor(owner).apply(pairs(geometry, material), { ...options, device: owner })), planningError);
      expect(failure.errors).toEqual([planningError, cleanupError]);
      expect(generated.material?.disposed).toBe(true);
      disposeBatchPlanCacheFor(owner);
      failure.retryCleanup();
      expect(attempts).toBe(1);
      expect(material.disposed).toBe(false);
    } finally {
      set.mockRestore(); dispose.mockRestore(); disposeBatchPlanCacheFor(owner);
      if (generated.material && !generated.material.disposed) originalDispose.call(generated.material);
      geometry.dispose(); material.dispose(); owner.dispose();
    }
  });

  it("retries before the next apply and preserves the previous plan when retry fails", () => {
    const owner = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const stable = new PBRMaterial({ name: "stable", roughness: 0.2 });
    const broken = new PBRMaterial({ name: "broken", roughness: 0.8 });
    const cache = batchPlanCacheFor(owner);
    const stableItems = pairs(geometry, stable);
    const previous = cache.apply(stableItems, { ...options, device: owner });
    const previousPlan = cache.lastPlan;
    const fault = installFailure();
    try {
      const failure = expectBuildError(failureOf(() =>
        cache.apply(pairs(geometry, stable, broken), { ...options, device: owner })), fault.planningError);
      const retryError = failureOf(() => cache.apply(stableItems, { ...options, device: owner })) as AggregateError;
      expect(retryError.errors).toContain(failure);
      expect(retryError.cause).toBe(failure);
      expect(cache.lastPlan).toBe(previousPlan);
      expect((previous[0]!.material as InstancedPBRMaterial).disposed).toBe(false);
      expect(fault.attempts).toBe(2);

      fault.unblock();
      expect(cache.apply(stableItems, { ...options, device: owner })).toBe(previous);
      expect(cache.lastPlan).toBe(previousPlan);
      expect(fault.material.disposed).toBe(true);
      failure.retryCleanup();
      expect(fault.attempts).toBe(3);
    } finally {
      fault.restore(); disposeBatchPlanCacheFor(owner);
      fault.release(); geometry.dispose(); stable.dispose(); broken.dispose(); owner.dispose();
    }
  });

  it("retries only the still-failed synthesized materials after a partial manual cleanup", () => {
    const owner = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const sources = [
      new PBRMaterial({ name: "first", roughness: 0.2 }),
      new PBRMaterial({ name: "second", roughness: 0.4 }),
      new PBRMaterial({ name: "broken", roughness: 0.8 })
    ];
    const names = sources.map((source) => `a3d-prd11-batched-${source.name}`);
    const generated = new Map<string, InstancedPBRMaterial>();
    const attempts = new Map<string, number>();
    const blocked = new Set(names);
    const planningError = new Error("third material planning failed");
    const cleanupErrors = new Map(names.map((name) => [name, new Error(`${name} cleanup failed`)]));
    const originalSet = InstancedPBRMaterial.prototype.setParameter;
    const originalDispose = InstancedPBRMaterial.prototype.dispose;
    const set = vi.spyOn(InstancedPBRMaterial.prototype, "setParameter").mockImplementation(function (this: InstancedPBRMaterial, key, value) {
      if (key === "u_roughness" && names.includes(this.name) && value !== 0.5) {
        generated.set(this.name, this);
        if (this.name === names[2]) throw planningError;
      }
      originalSet.call(this, key, value);
    });
    const dispose = vi.spyOn(InstancedPBRMaterial.prototype, "dispose").mockImplementation(function (this: InstancedPBRMaterial) {
      if (generated.get(this.name) === this) {
        attempts.set(this.name, (attempts.get(this.name) ?? 0) + 1);
        if (blocked.has(this.name)) throw cleanupErrors.get(this.name);
      }
      originalDispose.call(this);
    });
    try {
      const error = expectBuildError(failureOf(() =>
        batchPlanCacheFor(owner).apply(pairs(geometry, ...sources), { ...options, device: owner })), planningError);
      expect(error.errors).toEqual([planningError, ...names.map((name) => cleanupErrors.get(name))]);
      blocked.delete(names[0]!);
      blocked.delete(names[2]!);
      const partial = failureOf(() => error.retryCleanup()) as AggregateError;
      expect(partial.errors).toEqual([cleanupErrors.get(names[1]!)]);
      expect(generated.get(names[0]!)?.disposed).toBe(true);
      expect(generated.get(names[1]!)?.disposed).toBe(false);
      expect(generated.get(names[2]!)?.disposed).toBe(true);

      expect(failureOf(() => disposeBatchPlanCacheFor(owner))).toBeInstanceOf(AggregateError);
      expect(attempts.get(names[0]!)).toBe(2);
      expect(attempts.get(names[1]!)).toBe(3);
      expect(attempts.get(names[2]!)).toBe(2);
      blocked.clear();
      disposeBatchPlanCacheFor(owner);
      error.retryCleanup();
      expect(attempts.get(names[0]!)).toBe(2);
      expect(attempts.get(names[1]!)).toBe(4);
      expect(attempts.get(names[2]!)).toBe(2);
      expect([...generated.values()].every((material) => material.disposed)).toBe(true);
      expect(sources.every((material) => !material.disposed)).toBe(true);
    } finally {
      set.mockRestore(); dispose.mockRestore(); disposeBatchPlanCacheFor(owner);
      for (const material of generated.values()) if (!material.disposed) originalDispose.call(material);
      geometry.dispose(); for (const material of sources) material.dispose(); owner.dispose();
    }
  });

  it("returns logical items if apply reenters while a caller is retrying cleanup", () => {
    const owner = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const stable = new PBRMaterial({ name: "stable", roughness: 0.2 });
    const broken = new PBRMaterial({ name: "broken", roughness: 0.8 });
    const cache = batchPlanCacheFor(owner);
    const stableItems = pairs(geometry, stable);
    const previous = cache.apply(stableItems, { ...options, device: owner });
    const previousPlan = cache.lastPlan;
    const fault = installFailure();
    const nested: { items?: RenderItem[] } = {};
    try {
      const failure = expectBuildError(failureOf(() =>
        cache.apply(pairs(geometry, broken), { ...options, device: owner })), fault.planningError);
      fault.onDispose(() => {
        fault.onDispose(undefined);
        nested.items = cache.apply(stableItems, { ...options, device: owner });
      });
      fault.unblock();
      failure.retryCleanup();
      expect(nested.items).toEqual(stableItems);
      expect(nested.items).not.toBe(previous);
      expect(cache.lastPlan).toBe(previousPlan);
      expect((previous[0]!.material as InstancedPBRMaterial).disposed).toBe(false);
      expect(cache.apply(stableItems, { ...options, device: owner })).toBe(previous);
      expect(fault.attempts).toBe(2);
    } finally {
      fault.restore(); disposeBatchPlanCacheFor(owner);
      fault.release(); geometry.dispose(); stable.dispose(); broken.dispose(); owner.dispose();
    }
  });

  it.each(["error handle", "cache disposal"] as const)(
    "retains a failed cleanup when owner disposal reenters an active %s retry",
    (retryFrom) => {
      const owner = new MockRenderDevice();
      const geometry = Geometry.litTriangle();
      const material = new PBRMaterial({ name: "broken", roughness: 0.8 });
      const cache = batchPlanCacheFor(owner);
      const fault = installFailure();
      try {
        const failure = expectBuildError(failureOf(() =>
          cache.apply(pairs(geometry, material), { ...options, device: owner })), fault.planningError);
        fault.onDispose(() => {
          fault.onDispose(undefined);
          disposeBatchPlanCacheFor(owner);
        });
        expect(failureOf(() => retryFrom === "error handle" ? failure.retryCleanup() : cache.dispose())).toBeInstanceOf(AggregateError);
        expect(fault.attempts).toBe(2);
        expect(fault.material.disposed).toBe(false);

        fault.unblock();
        disposeBatchPlanCacheFor(owner);
        expect(fault.material.disposed).toBe(true);
        failure.retryCleanup();
        expect(fault.attempts).toBe(3);
      } finally {
        fault.restore(); disposeBatchPlanCacheFor(owner);
        fault.release(); geometry.dispose(); material.dispose(); owner.dispose();
      }
    }
  );

  it("retains the in-flight cache if its owner is disposed before the planner throws", () => {
    const owner = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial({ name: "broken", roughness: 0.8 });
    const cache = batchPlanCacheFor(owner);
    const fault = installFailure();
    try {
      fault.onDispose(() => {
        fault.onDispose(undefined);
        disposeBatchPlanCacheFor(owner);
      });
      const failure = expectBuildError(failureOf(() =>
        cache.apply(pairs(geometry, material), { ...options, device: owner })), fault.planningError);
      expect(fault.material.disposed).toBe(false);
      expect(failureOf(() => disposeBatchPlanCacheFor(owner))).toBeInstanceOf(AggregateError);
      fault.unblock();
      disposeBatchPlanCacheFor(owner);
      failure.retryCleanup();
      expect(fault.material.disposed).toBe(true);
      expect(fault.attempts).toBe(3);
    } finally {
      fault.restore(); disposeBatchPlanCacheFor(owner);
      fault.release(); geometry.dispose(); material.dispose(); owner.dispose();
    }
  });

  it("does not adopt a different device's already-owned failure when it propagates through another planner", () => {
    const deviceA = new MockRenderDevice();
    const deviceB = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const sourceA = new PBRMaterial({ name: "outer", roughness: 0.9 });
    const sourceB = new PBRMaterial({ name: "broken", roughness: 0.8 });
    const cacheA = batchPlanCacheFor(deviceA);
    const cacheB = batchPlanCacheFor(deviceB);
    const originalSet = InstancedPBRMaterial.prototype.setParameter;
    const originalDispose = InstancedPBRMaterial.prototype.dispose;
    const planningError = new Error("device B planning failed");
    const cleanupError = new Error("device B cleanup failed");
    let failureB: unknown;
    const generated: { a?: InstancedPBRMaterial; b?: InstancedPBRMaterial } = {};
    let blockB = true;
    let attemptsB = 0;
    const set = vi.spyOn(InstancedPBRMaterial.prototype, "setParameter").mockImplementation(function (this: InstancedPBRMaterial, key, value) {
      if (key === "u_roughness" && this.name === "a3d-prd11-batched-broken" && value === 0.8) {
        generated.b = this;
        throw planningError;
      }
      if (key === "u_roughness" && this.name === "a3d-prd11-batched-outer" && value === 0.9) {
        generated.a = this;
        throw failureB;
      }
      originalSet.call(this, key, value);
    });
    const dispose = vi.spyOn(InstancedPBRMaterial.prototype, "dispose").mockImplementation(function (this: InstancedPBRMaterial) {
      if (this === generated.b) {
        attemptsB += 1;
        if (blockB) throw cleanupError;
      }
      originalDispose.call(this);
    });
    try {
      failureB = failureOf(() => cacheB.apply(pairs(geometry, sourceB), { ...options, device: deviceB }));
      const error = expectBuildError(failureB, planningError);
      expect(failureOf(() => cacheA.apply(pairs(geometry, sourceA), { ...options, device: deviceA }))).toBe(failureB);
      expect(generated.a?.disposed).toBe(true);
      disposeBatchPlanCacheFor(deviceA);
      expect(generated.b?.disposed).toBe(false);
      expect(attemptsB).toBe(1);
      blockB = false;
      disposeBatchPlanCacheFor(deviceB);
      error.retryCleanup();
      expect(generated.b?.disposed).toBe(true);
      expect(attemptsB).toBe(2);
      expect(sourceA.disposed).toBe(false);
      expect(sourceB.disposed).toBe(false);
    } finally {
      set.mockRestore(); dispose.mockRestore();
      disposeBatchPlanCacheFor(deviceA); disposeBatchPlanCacheFor(deviceB);
      if (generated.a && !generated.a.disposed) originalDispose.call(generated.a);
      if (generated.b && !generated.b.disposed) originalDispose.call(generated.b);
      geometry.dispose(); sourceA.dispose(); sourceB.dispose(); deviceA.dispose(); deviceB.dispose();
    }
  });

  it("preserves a nonstandard thrown value even when instanceof inspection itself throws", () => {
    const owner = new MockRenderDevice();
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial({ name: "broken", roughness: 0.8 });
    const inspectionError = new Error("prototype access must not replace the planning error");
    const thrown = new Proxy({}, { getPrototypeOf() { throw inspectionError; } });
    const originalSet = InstancedPBRMaterial.prototype.setParameter;
    const set = vi.spyOn(InstancedPBRMaterial.prototype, "setParameter").mockImplementation(function (this: InstancedPBRMaterial, key, value) {
      if (key === "u_roughness" && value === 0.8) throw thrown;
      originalSet.call(this, key, value);
    });
    try {
      expect(failureOf(() => batchPlanCacheFor(owner).apply(pairs(geometry, material), { ...options, device: owner }))).toBe(thrown);
    } finally {
      set.mockRestore(); disposeBatchPlanCacheFor(owner); geometry.dispose(); material.dispose(); owner.dispose();
    }
  });

  it("keeps the retryable planning error in a real renderer disposal failure", () => {
    const device = new MockRenderDevice();
    const renderer = new Renderer(device, {
      backend: "mock", width: 8, height: 8, shaderLibrary: createDefaultShaderLibrary()
    }, new TemporalHistory());
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial({ name: "broken", roughness: 0.8 });
    const fault = installFailure();
    try {
      const failure = expectBuildError(failureOf(() =>
        applyRendererOwnedStaticBatching({ staticBatching: true }, pairs(geometry, material), renderer, batchingFlags)), fault.planningError);
      const disposal = failureOf(() => renderer.dispose()) as AggregateError;
      expect(disposal).toBeInstanceOf(AggregateError);
      const cacheError = disposal.errors.find((error: unknown) =>
        error instanceof AggregateError && error.errors.includes(failure)) as AggregateError | undefined;
      expect(cacheError?.cause).toBe(failure);
      expect(fault.material.disposed).toBe(false);
      fault.unblock();
      (cacheError!.cause as BatchPlanBuildError).retryCleanup();
      expect(fault.material.disposed).toBe(true);
      expect(fault.attempts).toBe(3);
    } finally {
      fault.restore(); disposeBatchPlanCacheFor(renderer); renderer.dispose();
      fault.release(); geometry.dispose(); material.dispose(); device.dispose();
    }
  });
});
