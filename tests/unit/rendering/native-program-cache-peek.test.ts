import { afterEach, describe, expect, it, vi } from "vitest";
import { MockRenderDevice, type RenderShaderProgram, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import type { ProgramCacheLike, ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import { ProgramCache, subscribeProgramReadiness } from "../../../packages/rendering/src/program/ProgramCache";
import { normalizeProgramFeatures, PROGRAM_OUTPUT_SRGB_FEATURE } from "../../../packages/rendering/src/program/ProgramFeatures";
import { staticGeneratedCacheCapability } from "../../../packages/rendering/src/program/StaticGeneratedCacheCapability";
import { getRecordedStaticGeneratedUnlitSources } from "../../../packages/rendering/src/webgl2/StaticGeneratedUnlitShader";

const features = (lighting: "lit" | "unlit" = "unlit") => normalizeProgramFeatures({ lighting });

class GenerationDevice extends MockRenderDevice {
  generation = 1;
}

class DeferredDevice extends GenerationDevice {
  readonly jobs: Array<{ sources: ShaderSources; resolve: (program: RenderShaderProgram) => void }> = [];
  compileAsync(sources: ShaderSources): Promise<RenderShaderProgram> {
    return new Promise((resolve) => this.jobs.push({ sources, resolve }));
  }
}

afterEach(() => { vi.restoreAllMocks(); });

describe("generated program cache speculative lookup", () => {
  it("finds the exact ready program by normalized value without compilation or reuse accounting", () => {
    const device = new GenerationDevice();
    const create = vi.spyOn(device, "createShaderProgram");
    const degradation = vi.fn();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const cache = new ProgramCache(device, { parallelCompile: false, onDegradation: degradation });
    const input = normalizeProgramFeatures({ maps: { baseColor: { uvSet: 1, transform: true } },
      features: { "test.z": true, "test.a": 2 } });
    try {
      const handle = cache.acquire(input);
      expect(handle.status).toBe("ready");
      const capability = staticGeneratedCacheCapability(cache)!;
      const before = { stats: cache.stats(), keys: cache.keys(), reused: cache.reused, creates: create.mock.calls.length };
      const equivalent: ProgramFeatures = { ...input,
        lights: { hemisphere: false, clustered: false, rect: 0, spot: 0, point: 0, dir: 0 },
        shadows: { contact: false, localShadows: 0, pcfTaps: 1, cascades: 0 },
        maps: { baseColor: { transform: true, uvSet: 1 }, normal: undefined }, extensions: [],
        features: { "test.a": 2, "test.z": true, omitted: undefined } as unknown as ProgramFeatures["features"] };
      expect(capability.peekReady(equivalent)).toBe(handle.program);
      expect(capability.peekReady(input)).toBe(handle.program);
      expect(capability.peekReady(features("lit"))).toBeUndefined();
      expect(capability.peekReady({ ...equivalent, maps: { baseColor: { transform: true, uvSet: 0 } } })).toBeUndefined();
      expect(capability.peekReady({ ...equivalent, features: { "test.a": 3, "test.z": true } })).toBeUndefined();
      expect(staticGeneratedCacheCapability(cache)).toBe(capability);
      expect({ stats: cache.stats(), keys: cache.keys(), reused: cache.reused, creates: create.mock.calls.length }).toEqual(before);
      expect(degradation).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    } finally { cache.dispose(); device.dispose(); }
  });

  it("does not retry a budget-pending or failed entry or repeat its diagnostics", () => {
    const device = new GenerationDevice();
    const create = vi.spyOn(device, "createShaderProgram");
    const pending = new ProgramCache(device, { parallelCompile: false, maxSyncCompilesPerFrame: 0 });
    const failedDevice = new GenerationDevice();
    const failCreate = vi.spyOn(failedDevice, "createShaderProgram").mockImplementation(() => { throw new Error("compile failed"); });
    const degradation = vi.fn();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = new ProgramCache(failedDevice, { parallelCompile: false, onDegradation: degradation });
    const input = features();
    try {
      const pendingHandle = pending.acquire(input);
      const failedHandle = failed.acquire(input);
      expect(pendingHandle.status).toBe("pending");
      expect(failedHandle.status).toBe("failed");
      const pendingStats = pending.stats(), failedStats = failed.stats();
      const pendingCapability = staticGeneratedCacheCapability(pending)!;
      const failedCapability = staticGeneratedCacheCapability(failed)!;
      expect(pendingCapability.peekReady(input)).toBeUndefined();
      expect(failedCapability.peekReady(input)).toBeUndefined();
      expect(pendingCapability.commitReadyReuse(input, undefined as unknown as RenderShaderProgram, 1)).toBe(false);
      expect(failedCapability.commitReadyReuse(input, undefined as unknown as RenderShaderProgram, 1)).toBe(false);
      expect(pending.stats()).toEqual(pendingStats);
      expect(failed.stats()).toEqual(failedStats);
      expect([pending.reused, failed.reused]).toEqual([0, 0]);
      expect(create).not.toHaveBeenCalled();
      expect(failCreate).toHaveBeenCalledTimes(1);
      expect(degradation).toHaveBeenCalledTimes(1);
      expect(errors).toHaveBeenCalledTimes(1);
      expect(failed.acquire(input)).toBe(failedHandle);
      expect(failed.reused).toBe(1);
      expect(failCreate).toHaveBeenCalledTimes(1);
      expect(errors).toHaveBeenCalledTimes(1);
    } finally { pending.dispose(); failed.dispose(); device.dispose(); failedDevice.dispose(); }
  });

  it("leaves an in-flight compile untouched and observes the same program once it settles", async () => {
    const device = new DeferredDevice();
    const cache = new ProgramCache(device, { parallelCompile: true });
    const input = features();
    const listener = vi.fn();
    const unsubscribe = subscribeProgramReadiness(device, listener);
    try {
      const handle = cache.acquire(input);
      const capability = staticGeneratedCacheCapability(cache)!;
      const before = cache.stats();
      expect(handle.status).toBe("pending");
      expect(capability.peekReady(input)).toBeUndefined();
      expect(capability.peekReady(input)).toBeUndefined();
      expect(device.jobs).toHaveLength(1);
      expect(cache.stats()).toEqual(before);
      expect(cache.reused).toBe(0);
      await Promise.resolve();
      expect(listener).not.toHaveBeenCalled();
      const job = device.jobs[0]!;
      const program = device.createShaderProgram(job.sources);
      job.resolve(program);
      await Promise.resolve();
      await Promise.resolve();
      expect(handle.status).toBe("ready");
      expect(capability.peekReady(input)).toBe(program);
      expect(cache.reused).toBe(0);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally { unsubscribe(); cache.dispose(); device.dispose(); }
  });

  it.each([false, true])("issues the actual generated source identity before compilation (async=%s)", async (parallelCompile) => {
    const device = new DeferredDevice();
    const create = vi.spyOn(device, "createShaderProgram");
    const cache = new ProgramCache(device, { parallelCompile });
    const input = normalizeProgramFeatures({ features: { [PROGRAM_OUTPUT_SRGB_FEATURE]: true } });
    try {
      const handle = cache.acquire(input);
      const sources = parallelCompile ? device.jobs[0]!.sources : create.mock.calls[0]![0];
      const recorded = getRecordedStaticGeneratedUnlitSources(sources);
      expect(recorded).toBeDefined();
      expect(recorded).toMatchObject({ label: sources.label, marker: sources.marker, vertex: sources.vertex, fragment: sources.fragment });
      expect(getRecordedStaticGeneratedUnlitSources({ ...sources })).toBeUndefined();
      if (parallelCompile) {
        device.jobs[0]!.resolve(device.createShaderProgram(sources));
        await Promise.resolve();
      }
      expect(handle.status).toBe("ready");
      expect(cache.peekReady(input)).toBe(handle.program);
    } finally { cache.dispose(); device.dispose(); }
  });

  it("declines stale, lost, disposed and foreign program identities without invalidating entries", () => {
    const device = new GenerationDevice(), otherDevice = new GenerationDevice();
    const cache = new ProgramCache(device, { parallelCompile: false });
    const other = new ProgramCache(otherDevice, { parallelCompile: false });
    const input = features();
    try {
      const handle = cache.acquire(input), foreign = other.acquire(input).program!;
      const program = handle.program!;
      const capability = staticGeneratedCacheCapability(cache)!;
      const before = { stats: cache.stats(), keys: cache.keys(), reused: cache.reused };
      expect(capability.commitReadyReuse(input, foreign, 1)).toBe(false);
      device.contextLost = true;
      expect(capability.peekReady(input)).toBeUndefined();
      expect(capability.commitReadyReuse(input, program, 1)).toBe(false);
      device.contextLost = false;
      device.generation += 1;
      expect(capability.peekReady(input)).toBeUndefined();
      expect(capability.commitReadyReuse(input, program, 1)).toBe(false);
      expect(program.disposed).toBe(false);
      expect(handle.status).toBe("ready");
      expect({ stats: cache.stats(), keys: cache.keys(), reused: cache.reused }).toEqual(before);
      const current = cache.acquire(input);
      expect(program.disposed).toBe(true);
      expect(current.program).not.toBe(program);
      expect(capability.peekReady(input)).toBe(current.program);
      current.program!.dispose();
      expect(capability.peekReady(input)).toBeUndefined();
      expect(capability.commitReadyReuse(input, current.program!, 1)).toBe(false);
      cache.dispose();
      expect(capability.peekReady(input)).toBeUndefined();
      expect(() => cache.acquire(input)).toThrow(/disposed/i);
    } finally { cache.dispose(); other.dispose(); device.dispose(); otherDevice.dispose(); }
  });

  it("rejects accessor-bearing features without reading the getter or altering the cache", () => {
    const device = new GenerationDevice(), cache = new ProgramCache(device, { parallelCompile: false });
    const input = features();
    const getter = vi.fn(() => "unlit");
    try {
      cache.acquire(input);
      const capability = staticGeneratedCacheCapability(cache)!;
      const before = { stats: cache.stats(), keys: cache.keys(), reused: cache.reused };
      const accessor = { ...input };
      Object.defineProperty(accessor, "lighting", { enumerable: true, get: getter });
      expect(capability.peekReady(accessor)).toBeUndefined();
      expect(getter).not.toHaveBeenCalled();
      expect({ stats: cache.stats(), keys: cache.keys(), reused: cache.reused }).toEqual(before);
      expect(cache.acquire(accessor).status).toBe("ready");
      expect(getter).toHaveBeenCalled();
      expect(cache.reused).toBe(1);
    } finally { cache.dispose(); device.dispose(); }
  });

  it("declines replaced cache state and never invokes its accessors or map overrides", () => {
    const device = new GenerationDevice(), cache = new ProgramCache(device, { parallelCompile: false });
    const input = features();
    const trap = vi.fn(() => { throw new Error("unexpected cache state read"); });
    try {
      const program = cache.acquire(input).program!;
      const capability = staticGeneratedCacheCapability(cache)!;
      const before = { stats: cache.stats(), keys: cache.keys(), reused: cache.reused };
      for (const name of ["entries", "device", "reuseCount"]) {
        const descriptor = Object.getOwnPropertyDescriptor(cache, name)!;
        Object.defineProperty(cache, name, { configurable: true, get: trap });
        try {
          expect(staticGeneratedCacheCapability(cache)).toBeUndefined();
          expect(capability.peekReady(input)).toBeUndefined();
          expect(capability.commitReadyReuse(input, program, 1)).toBe(false);
          expect(trap).not.toHaveBeenCalled();
        } finally { Object.defineProperty(cache, name, descriptor); }
      }
      const entries = Object.getOwnPropertyDescriptor(cache, "entries")!.value as Map<string, unknown>;
      Object.defineProperty(entries, "get", { configurable: true, value: trap });
      try {
        expect(staticGeneratedCacheCapability(cache)).toBeUndefined();
        expect(capability.peekReady(input)).toBeUndefined();
        expect(capability.commitReadyReuse(input, program, 1)).toBe(false);
        expect(trap).not.toHaveBeenCalled();
      } finally { delete (entries as unknown as { get?: unknown }).get; }
      expect({ stats: cache.stats(), keys: cache.keys(), reused: cache.reused }).toEqual(before);
      expect(capability.peekReady(input)).toBe(program);
    } finally { cache.dispose(); device.dispose(); }
  });

  it("counts one reuse at attempt and one at native success, including failure boundaries", () => {
    const device = new GenerationDevice(), cache = new ProgramCache(device, { parallelCompile: false });
    const input = features();
    try {
      const program = cache.acquire(input).program!;
      const capability = staticGeneratedCacheCapability(cache)!;
      expect(capability.peekReady(input)).toBe(program); // pre-submit decline
      expect(cache.reused).toBe(0);
      for (const count of [0, -1, 1.5, 3, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(capability.commitReadyReuse(input, program, count)).toBe(false);
      }
      expect(cache.reused).toBe(0);

      const nativeAttempt = () => {
        if (!capability.commitReadyReuse(input, program, 1)) throw new Error("attempt accounting declined");
      };
      const nativeSuccess = () => {
        if (!capability.commitReadyReuse(input, program, 1)) throw new Error("success accounting declined");
      };
      expect(() => { nativeAttempt(); throw new Error("native attempt failed"); }).toThrow("native attempt failed");
      expect(cache.reused).toBe(1);
      expect(() => { nativeAttempt(); nativeSuccess(); throw new Error("restore failed"); }).toThrow("restore failed");
      expect(cache.reused).toBe(3);
      nativeAttempt(); nativeSuccess();
      expect(cache.reused).toBe(5);
      // A declined speculative plan leaves normal fallback acquires responsible
      // for the original two hit counts.
      expect(capability.peekReady(input)).toBe(program);
      cache.acquire(input); cache.acquire(input);
      expect(cache.reused).toBe(7);
      expect(capability.commitReadyReuse(features("lit"), program, 1)).toBe(false);
      expect(capability.commitReadyReuse(input, program, 2)).toBe(true);
      expect(cache.reused).toBe(9);
    } finally { cache.dispose(); device.dispose(); }
  });

  it("rejects unregistered, subclassed, instance-overridden and prototype-overridden caches", () => {
    const device = new GenerationDevice(), cache = new ProgramCache(device, { parallelCompile: false });
    const input = features();
    const trap = vi.fn(() => { throw new Error("untrusted cache read"); });
    const unregistered = new Proxy({} as ProgramCacheLike, { get: trap });
    class DerivedCache extends ProgramCache {}
    const derived = new DerivedCache(device, { parallelCompile: false });
    try {
      const program = cache.acquire(input).program!;
      const capability = staticGeneratedCacheCapability(cache)!;
      expect(staticGeneratedCacheCapability(unregistered)).toBeUndefined();
      expect(trap).not.toHaveBeenCalled();
      expect(staticGeneratedCacheCapability(derived)).toBeUndefined();
      const override = vi.fn(() => program);
      Object.defineProperty(cache, "peekReady", { configurable: true, value: override });
      expect(staticGeneratedCacheCapability(cache)).toBeUndefined();
      expect(capability.peekReady(input)).toBeUndefined();
      expect(capability.commitReadyReuse(input, program, 1)).toBe(false);
      expect(override).not.toHaveBeenCalled();
      expect(cache.reused).toBe(0);
      delete (cache as unknown as { peekReady?: unknown }).peekReady;
      expect(staticGeneratedCacheCapability(cache)).toBe(capability);
      const altered = vi.spyOn(ProgramCache.prototype, "acquire");
      expect(staticGeneratedCacheCapability(cache)).toBeUndefined();
      expect(capability.peekReady(input)).toBeUndefined();
      expect(capability.commitReadyReuse(input, program, 1)).toBe(false);
      expect(altered).not.toHaveBeenCalled();
      expect(cache.reused).toBe(0);
      altered.mockRestore();
      expect(capability.peekReady(input)).toBe(program);
    } finally { vi.restoreAllMocks(); cache.dispose(); derived.dispose(); device.dispose(); }
  });
});
