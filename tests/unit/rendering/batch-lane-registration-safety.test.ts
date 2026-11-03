import { describe, expect, it, vi } from "vitest";

import { Geometry } from "../../../packages/rendering/src/Geometry";
import { InstancedPBRMaterial } from "../../../packages/rendering/src/InstancedPBRMaterial";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { createTrustedQrFlags, type QrFlags } from "../../../packages/rendering/src/contracts/core";
import { frameContributors, registerFrameContributor, type FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import { registerMaterialLobe } from "../../../packages/rendering/src/contracts/materialLobes";
import { registerShaderFeature, shaderChunk, shaderFeaturesFor } from "../../../packages/rendering/src/contracts/program";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import { depthVariantFeaturesFor, registerDepthVariantFeature } from "../../../packages/rendering/src/contracts/shadows";
import { PRD11_DRAWID_CHUNK } from "../../../packages/rendering/src/batching/shaders/drawId.glsl";
import { BatchPlanCache, disposeBatchPlanCacheFor, hasNoBatchSensitiveHooks } from "../../../packages/rendering/src/renderer/CullingBatching";
import { isTrustedBatchExecutionDevice } from "../../../packages/rendering/src/renderer/BatchExecutionTrust";
import "../../../packages/rendering/src/lanes/prd11";

const flags = createTrustedQrFlags({ A3D_QR_TIERS_BATCHING: true });
const options = { flags, multiDrawAvailable: false };

function fixture() {
  const geometry = Geometry.litTriangle();
  const material = new PBRMaterial();
  const items = [{ geometry, material }, { geometry, material }];
  const cache = new BatchPlanCache();
  return { geometry, material, items, cache, dispose() { cache.dispose(); geometry.dispose(); material.dispose(); } };
}

describe("trusted batching lane registrations", () => {
  it("recognizes its registrations while the actual contributor respects device execution trust", () => {
    const { geometry, material, items, cache, dispose } = fixture();
    const device = new MockRenderDevice();
    const contributor = frameContributors(flags).find((entry) => entry.id === "prd11.batching")!;
    const context: FrameContributorContext = {
      device, flags, items, width: 1, height: 1, frameIndex: 0, timeSeconds: 0,
      camera: null, source: {}, tier: QUALITY_TIERS.high,
      sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 1000, orthographic: false } },
      blackboard: new Map()
    };
    try {
      expect(hasNoBatchSensitiveHooks(flags)).toBe(true);
      const planned = cache.apply(items, options);
      expect(planned).toHaveLength(1);
      expect(planned[0]!.geometry).toBe(geometry);
      expect(planned[0]!.material).not.toBe(material);
      expect(planned[0]!.instanceTransforms).toHaveLength(32);
      expect(isTrustedBatchExecutionDevice(device)).toBe(false);
      const result = contributor.collect!(items, context);
      expect(result).toBe(items);
      const clippedItems = [...items];
      const flagOff = createTrustedQrFlags({});
      expect(contributor.collect!([...items], { ...context, flags: flagOff })).toHaveLength(1);
      expect(contributor.collect!(clippedItems, { ...context, flags: flagOff, source: { globalClipping: { planes: [] } } })).toBe(clippedItems);
    } finally {
      disposeBatchPlanCacheFor(device);
      device.dispose();
      dispose();
    }
  });

  it.each([
    ["frame", () => registerFrameContributor({ id: "prd11.foreign-frame", owner: "prd11", flag: "A3D_QR_TIERS_BATCHING", phases: ["collect"], collect: (items) => items })],
    ["shader", () => registerShaderFeature({ id: "prd11.foreign-shader", owner: "prd11", flag: "A3D_QR_TIERS_BATCHING", select: () => undefined, defines: () => ({}), chunks: [], hooks: [] })],
    ["depth", () => registerDepthVariantFeature({ id: "prd11.foreign-depth", owner: "prd11", flag: "A3D_QR_TIERS_BATCHING", passes: ["depth"], select: () => undefined, defines: () => ({}), chunks: [], hooks: [] })],
    ["material lobe", () => registerMaterialLobe({ id: "prd04.foreign-lobe", owner: "prd04", flag: "A3D_QR_TIERS_BATCHING", feature: () => undefined, chunks: { pars: "", fragment: "" }, samplerSlots: [], bind: () => undefined })]
  ] as const)("fails closed for an active foreign %s registration and resumes after removal", (_kind, register) => {
    const { items, cache, dispose } = fixture();
    try {
      const initial = cache.apply(items, options);
      expect(initial).toHaveLength(1);
      const owned = initial[0]!.material as InstancedPBRMaterial;
      const remove = register();
      try {
        expect(hasNoBatchSensitiveHooks(flags)).toBe(false);
        const result = cache.apply(items, options);
        expect(result).toEqual(items);
        expect(result[0]).toBe(items[0]);
        expect(result[1]).toBe(items[1]);
        expect(owned.disposed).toBe(true);
      } finally { remove(); }
      expect(hasNoBatchSensitiveHooks(flags)).toBe(true);
      expect(cache.apply(items, options)).toHaveLength(1);
    } finally { dispose(); }
  });

  it("does not trust foreign registrations merely because their ids and callbacks resemble built-ins", () => {
    const contributor = frameContributors(flags).find((entry) => entry.id === "prd11.batching")!;
    const drawId = shaderFeaturesFor(flags).find((entry) => entry.id === "prd11.drawId")!;
    const depth = depthVariantFeaturesFor(flags).find((entry) => entry.id === "prd11.drawId.depth")!;
    expect(() => registerFrameContributor({ ...contributor })).toThrow(/REGISTRY_DUPLICATE/);
    expect(() => registerShaderFeature({ ...drawId })).toThrow(/REGISTRY_DUPLICATE/);
    expect(() => registerDepthVariantFeature({ ...depth })).toThrow(/REGISTRY_DUPLICATE/);
    const remove = registerShaderFeature({ ...drawId, id: "prd11.drawId.lookalike" });
    try { expect(hasNoBatchSensitiveHooks(flags)).toBe(false); }
    finally { remove(); }
    expect(hasNoBatchSensitiveHooks(flags)).toBe(true);
  });

  it("does not block on a foreign registration with a captured inactive flag", () => {
    const remove = registerShaderFeature({
      id: "prd11.inactive-foreign", owner: "prd11", flag: "A3D_QR_TEST_BATCH_OBSERVER",
      select: () => undefined, defines: () => ({}), chunks: [], hooks: []
    });
    const { items, cache, dispose } = fixture();
    try {
      expect(hasNoBatchSensitiveHooks(flags)).toBe(true);
      expect(cache.apply(items, options)).toHaveLength(1);
    } finally { remove(); dispose(); }
  });

  it("rejects changed original callbacks and array contents without invoking getters", () => {
    const { items, cache, dispose } = fixture();
    const contributor = frameContributors(flags).find((entry) => entry.id === "prd11.batching")!;
    const features = shaderFeaturesFor(flags);
    const drawId = features.find((entry) => entry.id === "prd11.drawId")!;
    const emissive = features.find((entry) => entry.id === "prd11.instanceEmissive")!;
    const depth = depthVariantFeaturesFor(flags).find((entry) => entry.id === "prd11.drawId.depth")!;
    let reads = 0;
    try {
      for (const [target, key] of [[contributor, "collect"], [drawId, "select"], [emissive, "select"], [depth, "select"]] as const) {
        const descriptor = Object.getOwnPropertyDescriptor(target, key)!;
        Object.defineProperty(target, key, { configurable: true, get() { reads += 1; throw new Error("observer getter ran"); } });
        try {
          expect(hasNoBatchSensitiveHooks(flags)).toBe(false);
          expect(cache.apply(items, options)).toEqual(items);
          expect(reads).toBe(0);
        } finally { Object.defineProperty(target, key, descriptor); }
        expect(hasNoBatchSensitiveHooks(flags)).toBe(true);
      }
      const hooks = drawId.hooks as string[];
      const firstHook = hooks[0]!;
      hooks[0] = "fragment:end";
      try { expect(hasNoBatchSensitiveHooks(flags)).toBe(false); }
      finally { hooks[0] = firstHook; }
      const phases = contributor.phases as string[];
      phases.push("after-output");
      try { expect(hasNoBatchSensitiveHooks(flags)).toBe(false); }
      finally { phases.pop(); }
      expect(Reflect.set(depth.passes, "0", "velocity")).toBe(false);
      expect(Reflect.set(contributor, "id", "prd11.replaced")).toBe(false);
      expect(Reflect.set(contributor, "flag", "A3D_QR_CORE")).toBe(false);
      const chunk = shaderChunk(PRD11_DRAWID_CHUNK)!;
      expect(Object.isFrozen(chunk)).toBe(true);
      expect(Reflect.set(chunk, "glsl", "void foreign() {}" )).toBe(false);
      expect(hasNoBatchSensitiveHooks(flags)).toBe(true);
      expect(cache.apply(items, options)).toHaveLength(1);
    } finally { dispose(); }
  });

  it("fails closed for unknown flag metadata and untrusted flag objects without invoking accessors", () => {
    let getterReads = 0;
    const remove = registerShaderFeature({
      id: "prd11.foreign-unknown-flag", owner: "prd11",
      get flag() { getterReads += 1; throw new Error("flag getter ran"); },
      select: () => undefined, defines: () => ({}), chunks: [], hooks: []
    });
    try {
      expect(hasNoBatchSensitiveHooks(flags)).toBe(false);
      expect(getterReads).toBe(0);
    } finally { remove(); }
    let calls = 0;
    const untrusted: QrFlags = { values: Object.freeze({ A3D_QR_TIERS_BATCHING: true }), on() { calls += 1; return true; } };
    const { items, cache, dispose } = fixture();
    try {
      expect(hasNoBatchSensitiveHooks(untrusted)).toBe(false);
      expect(cache.apply(items, { flags: untrusted })).toEqual(items);
      expect(calls).toBe(0);
    } finally { dispose(); }
  });

  it("rejects a foreign provider proxy without reading its fields during preflight", () => {
    let reads = 0;
    const foreign = new Proxy({
      id: "prd11.proxy-observer", owner: "prd11" as const, flag: "A3D_QR_TIERS_BATCHING" as const,
      select: () => undefined, defines: () => ({}), chunks: [], hooks: []
    }, {
      get(target, key, receiver) {
        if (key === "id") return Reflect.get(target, key, receiver);
        reads += 1;
        throw new Error("foreign provider inspected");
      }
    });
    const remove = registerShaderFeature(foreign);
    const { items, cache, dispose } = fixture();
    try {
      expect(hasNoBatchSensitiveHooks(flags)).toBe(false);
      expect(cache.apply(items, options)).toEqual(items);
      expect(reads).toBe(0);
    } finally { remove(); dispose(); }
  });

  it("keeps the multidraw capability and generated-program gate in place", () => {
    const { items, cache, dispose } = fixture();
    const device = { probe: { multiDraw: true }, multiDrawElementsInstanced() {} };
    try {
      expect(cache.apply(items, { flags, device, instancing: false })).toEqual(items);
      expect(cache.lastReport.multiDrawMode).toBe("unavailable");
    } finally { dispose(); }
  });
});

describe("batch preflight during reentrant source work", () => {
  it("retires a candidate plan when material code registers an observer during construction", () => {
    const { material, items, cache, dispose } = fixture();
    const read = material.getParameters.bind(material);
    const retire = vi.spyOn(InstancedPBRMaterial.prototype, "dispose");
    let reads = 0;
    let remove: (() => void) | undefined;
    Object.defineProperty(material, "getParameters", { configurable: true, value() {
      reads += 1;
      if (reads === 2) remove = registerFrameContributor({
        id: "prd11.reentrant-material-observer", owner: "prd11", flag: "A3D_QR_TIERS_BATCHING", phases: ["collect"], collect: (input) => input
      });
      return read();
    } });
    try {
      const result = cache.apply(items, options);
      expect(reads).toBeGreaterThanOrEqual(2);
      expect(remove).toBeDefined();
      expect(result).toEqual(items);
      expect(result[0]).toBe(items[0]);
      expect(cache.lastReport.reasonsNotBatched["active-item-observers"]).toBe(2);
      expect(retire).toHaveBeenCalledTimes(1);
      expect(retire.mock.instances[0]!.disposed).toBe(true);
    } finally { remove?.(); Reflect.deleteProperty(material, "getParameters"); retire.mockRestore(); dispose(); }
  });

  it("drops a cached plan when a new observer appears during its refresh", () => {
    const { material, items, cache, dispose } = fixture();
    const read = material.getParameters.bind(material);
    let reads = 0;
    let remove: (() => void) | undefined;
    try {
      const initial = cache.apply(items, options);
      const owned = initial[0]!.material as InstancedPBRMaterial;
      Object.defineProperty(material, "getParameters", { configurable: true, value() {
        reads += 1;
        if (reads === 2) remove = registerFrameContributor({
          id: "prd11.refresh-observer", owner: "prd11", flag: "A3D_QR_TIERS_BATCHING", phases: ["collect"], collect: (input) => input
        });
        return read();
      } });
      const result = cache.apply(items, options);
      expect(remove).toBeDefined();
      expect(result).toEqual(items);
      expect(owned.disposed).toBe(true);
      expect(cache.lastReport.reasonsNotBatched["active-item-observers"]).toBe(2);
    } finally { remove?.(); Reflect.deleteProperty(material, "getParameters"); dispose(); }
  });

  it("returns logical items for both nested and outer applications of the same cache", () => {
    const { material, items, cache, dispose } = fixture();
    const read = material.getParameters.bind(material);
    let nested: ReturnType<BatchPlanCache["apply"]> | undefined;
    Object.defineProperty(material, "getParameters", { configurable: true, value() {
      if (!nested) nested = cache.apply(items, options);
      return read();
    } });
    try {
      const outer = cache.apply(items, options);
      expect(nested).toEqual(items);
      expect(nested![0]).toBe(items[0]);
      expect(outer).toEqual(items);
      expect(outer[0]).toBe(items[0]);
      expect(cache.lastReport.reasonsNotBatched["reentrant-batch-application"]).toBe(2);
      Reflect.deleteProperty(material, "getParameters");
      expect(cache.apply(items, options)).toHaveLength(1);
    } finally { Reflect.deleteProperty(material, "getParameters"); dispose(); }
  });

  it("does not resurrect a plan when disposed during source inspection", () => {
    const { material, items, cache, dispose } = fixture();
    const read = material.getParameters.bind(material);
    try {
      const initial = cache.apply(items, options);
      const owned = initial[0]!.material as InstancedPBRMaterial;
      let once = false;
      Object.defineProperty(material, "getParameters", { configurable: true, value() {
        if (!once) { once = true; cache.dispose(); }
        return read();
      } });
      const result = cache.apply(items, options);
      expect(once).toBe(true);
      expect(result).toEqual(items);
      expect(result[0]).toBe(items[0]);
      expect(owned.disposed).toBe(true);
      expect(cache.lastPlan).toBeNull();
      Reflect.deleteProperty(material, "getParameters");
      expect(cache.apply(items, options)).toHaveLength(1);
    } finally { Reflect.deleteProperty(material, "getParameters"); dispose(); }
  });

  it("drops a replacement plan if resource retirement registers an observer", () => {
    const { material, items, cache, dispose } = fixture();
    let remove: (() => void) | undefined;
    try {
      const initial = cache.apply(items, options);
      const owned = initial[0]!.material as InstancedPBRMaterial;
      const originalDispose = owned.dispose.bind(owned);
      Object.defineProperty(owned, "dispose", { configurable: true, value() {
        remove = registerFrameContributor({
          id: "prd11.retirement-observer", owner: "prd11", flag: "A3D_QR_TIERS_BATCHING", phases: ["collect"], collect: (input) => input
        });
        originalDispose();
      } });
      material.setParameter("u_roughness", 0.75);
      const result = cache.apply(items, options);
      expect(remove).toBeDefined();
      expect(result).toEqual(items);
      expect(result[0]).toBe(items[0]);
      expect(owned.disposed).toBe(true);
      expect(cache.lastReport.reasonsNotBatched["active-item-observers"]).toBe(2);
      remove!();
      remove = undefined;
      expect(cache.apply(items, options)).toHaveLength(1);
    } finally { remove?.(); dispose(); }
  });

  it("keeps reentrant disposal from returning or retaining a replacement plan", () => {
    const { material, items, cache, dispose } = fixture();
    try {
      const initial = cache.apply(items, options);
      const owned = initial[0]!.material as InstancedPBRMaterial;
      const originalDispose = owned.dispose.bind(owned);
      let nested: ReturnType<BatchPlanCache["apply"]> | undefined;
      let disposalCalls = 0;
      Object.defineProperty(owned, "dispose", { configurable: true, value() {
        disposalCalls += 1;
        cache.dispose();
        nested = cache.apply(items, options);
        originalDispose();
      } });
      material.setParameter("u_roughness", 0.75);
      const result = cache.apply(items, options);
      expect(disposalCalls).toBe(1);
      expect(owned.disposed).toBe(true);
      expect(nested).toEqual(items);
      expect(nested![0]).toBe(items[0]);
      expect(result).toEqual(items);
      expect(result[0]).toBe(items[0]);
      expect(cache.lastPlan).toBeNull();
      expect(cache.apply(items, options)).toHaveLength(1);
    } finally { dispose(); }
  });

  it("retires the rest of a plan even if one owned material throws during disposal", () => {
    const geometry = Geometry.litTriangle();
    const first = new PBRMaterial({ roughness: 0.2 });
    const second = new PBRMaterial({ roughness: 0.8 });
    const items = [{ geometry, material: first }, { geometry, material: first }, { geometry, material: second }, { geometry, material: second }];
    const cache = new BatchPlanCache();
    try {
      const result = cache.apply(items, options);
      expect(result).toHaveLength(2);
      const firstOwned = result[0]!.material as InstancedPBRMaterial;
      const secondOwned = result[1]!.material as InstancedPBRMaterial;
      const originalDispose = firstOwned.dispose.bind(firstOwned);
      Object.defineProperty(firstOwned, "dispose", { configurable: true, value() {
        originalDispose();
        throw new Error("material cleanup failed");
      } });
      expect(() => cache.dispose()).toThrow("material cleanup failed");
      expect(firstOwned.disposed).toBe(true);
      expect(secondOwned.disposed).toBe(true);
      expect(cache.lastPlan).toBeNull();
      expect(() => cache.dispose()).not.toThrow();
      expect(first.disposed).toBe(false);
      expect(second.disposed).toBe(false);
    } finally { cache.dispose(); geometry.dispose(); first.dispose(); second.dispose(); }
  });
});
