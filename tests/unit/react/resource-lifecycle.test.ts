import { describe, expect, it, vi } from "vitest";
import {
  createAuraAssetResource,
  createFrameScheduler,
  resourceForDescriptors,
  type AuraAssetPreloadEvidence,
  type AuraAssetPreloadFn,
  type AuraAssetResource,
  type AuraFrameInfo
} from "../../../packages/react/src";

vi.mock("@aura3d/engine", () => ({
  camera: {},
  createAuraApp: vi.fn(),
  effects: {},
  environments: {},
  interactions: {},
  lights: {},
  model: vi.fn(),
  scene: vi.fn()
}));

const descriptors = [{ id: "model", url: "/model.glb" }] as const;
const success: AuraAssetPreloadEvidence = { ok: true, loaded: ["model"], failed: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function readWithSignal(resource: AuraAssetResource, signal: AbortSignal): AuraAssetPreloadEvidence {
  return resource.read({ signal });
}

function suspendedRead(resource: AuraAssetResource, signal: AbortSignal): Promise<AuraAssetPreloadEvidence> {
  try {
    readWithSignal(resource, signal);
  } catch (value) {
    if (value instanceof Promise) return value as Promise<AuraAssetPreloadEvidence>;
    throw value;
  }
  throw new Error("Expected a suspended asset read.");
}

describe("React asset resource cancellation races", () => {
  it("rejects an already-resolved load if disposal wins before its completion is observed", async () => {
    const loader = vi.fn<AuraAssetPreloadFn>(async () => success);
    const resource = createAuraAssetResource(descriptors, loader);
    const pending = resource.preload();
    resource.dispose();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(loader).toHaveBeenCalledOnce();
  });

  it("does not cache an immediately resolved flight after the last waiter cancels", async () => {
    const loader = vi.fn<AuraAssetPreloadFn>(async () => success);
    const resource = createAuraAssetResource(descriptors, loader);
    const controller = new AbortController();
    const pending = resource.preload({ signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await expect(resource.preload()).resolves.toEqual(success);
    expect(loader).toHaveBeenCalledTimes(2);
    resource.dispose();
  });

  it("allows independently cancelled reads to share one flight", async () => {
    const loading = deferred<AuraAssetPreloadEvidence>();
    let flightSignal: AbortSignal | undefined;
    const loader = vi.fn<AuraAssetPreloadFn>((_descriptors, options) => {
      flightSignal = options?.signal;
      return loading.promise;
    });
    const resource = createAuraAssetResource(descriptors, loader);
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = suspendedRead(resource, firstController.signal);
    const second = suspendedRead(resource, secondController.signal);
    const firstResult = expect(first).rejects.toMatchObject({ name: "AbortError" });
    firstController.abort();
    expect(flightSignal?.aborted).toBe(false);
    loading.resolve(success);
    await firstResult;
    await expect(second).resolves.toEqual(success);
    expect(resource.read()).toEqual(success);
    expect(loader).toHaveBeenCalledOnce();
    resource.dispose();
  });

  it("reuses a subscriber promise for repeated reads and aborts its abandoned flight", async () => {
    const loading = deferred<AuraAssetPreloadEvidence>();
    let flightSignal: AbortSignal | undefined;
    const loader = vi.fn<AuraAssetPreloadFn>((_descriptors, options) => {
      flightSignal = options?.signal;
      return loading.promise;
    });
    const resource = createAuraAssetResource(descriptors, loader);
    const controller = new AbortController();
    const first = suspendedRead(resource, controller.signal);
    expect(suspendedRead(resource, controller.signal)).toBe(first);
    const result = expect(first).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    loading.resolve(success);
    await result;
    expect(flightSignal?.aborted).toBe(true);
    resource.dispose();
  });

  it("does not start a read with an already-aborted subscriber signal", () => {
    const loading = deferred<AuraAssetPreloadEvidence>();
    const loader = vi.fn<AuraAssetPreloadFn>(() => loading.promise);
    const resource = createAuraAssetResource(descriptors, loader);
    const controller = new AbortController();
    controller.abort();
    let thrown: unknown;
    try {
      readWithSignal(resource, controller.signal);
    } catch (error) {
      thrown = error;
    }
    if (thrown instanceof Promise) void thrown.catch(() => undefined);
    resource.dispose();
    expect(thrown).toMatchObject({ name: "AbortError" });
    expect(loader).not.toHaveBeenCalled();
  });

  it("aborts a flight disposed synchronously from inside the loader", async () => {
    const loading = deferred<AuraAssetPreloadEvidence>();
    let resource!: AuraAssetResource;
    let flightSignal: AbortSignal | undefined;
    const loader = vi.fn<AuraAssetPreloadFn>((_descriptors, options) => {
      flightSignal = options?.signal;
      resource.dispose();
      return loading.promise;
    });
    resource = createAuraAssetResource(descriptors, loader);
    const pending = resource.preload();
    const abortedOnDispose = flightSignal?.aborted;
    loading.resolve(success);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(abortedOnDispose).toBe(true);
  });

  it("shares the pending flight with a synchronous reentrant preload", async () => {
    const loading = deferred<AuraAssetPreloadEvidence>();
    let resource!: AuraAssetResource;
    let nested: Promise<AuraAssetPreloadEvidence> | undefined;
    const loader = vi.fn<AuraAssetPreloadFn>(() => {
      if (loader.mock.calls.length === 1) nested = resource.preload();
      return loading.promise;
    });
    resource = createAuraAssetResource(descriptors, loader);
    const pending = resource.preload();
    loading.resolve(success);
    await expect(pending).resolves.toEqual(success);
    await expect(nested).resolves.toEqual(success);
    expect(loader).toHaveBeenCalledOnce();
    expect(nested).toBe(pending);
    resource.dispose();
  });

  it("permits a retry to be cancelled without caching its late completion", async () => {
    const stale = deferred<AuraAssetPreloadEvidence>();
    const fresh = deferred<AuraAssetPreloadEvidence>();
    const failure = new Error("first attempt failed");
    const signals: AbortSignal[] = [];
    const loader = vi.fn<AuraAssetPreloadFn>((_descriptors, options) => {
      signals.push(options!.signal);
      if (signals.length === 1) return Promise.reject(failure);
      return signals.length === 2 ? stale.promise : fresh.promise;
    });
    const resource = createAuraAssetResource(descriptors, loader);
    await expect(resource.preload()).rejects.toBe(failure);
    const controller = new AbortController();
    const retry = resource.retry({ signal: controller.signal });
    const result = expect(retry).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    stale.resolve(success);
    await result;
    expect(signals[1]?.aborted).toBe(true);
    const next = resource.retry();
    fresh.resolve(success);
    await expect(next).resolves.toEqual(success);
    expect(loader).toHaveBeenCalledTimes(3);
    resource.dispose();
  });

  it("preserves the prior failure when a retry signal is already aborted", async () => {
    const failure = new Error("first attempt failed");
    const loader = vi.fn<AuraAssetPreloadFn>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(success);
    const resource = createAuraAssetResource(descriptors, loader);
    await expect(resource.preload()).rejects.toBe(failure);
    const controller = new AbortController();
    controller.abort();
    const retry = resource.retry({ signal: controller.signal });
    await expect(retry).rejects.toMatchObject({ name: "AbortError" });
    expect(() => resource.read()).toThrow(failure);
    expect(loader).toHaveBeenCalledOnce();
    resource.dispose();
  });

  it("isolates scoped reads by loader, security context and digest during cancellation and retry", async () => {
    const loads = [
      deferred<AuraAssetPreloadEvidence>(),
      deferred<AuraAssetPreloadEvidence>(),
      deferred<AuraAssetPreloadEvidence>()
    ];
    const signals: AbortSignal[] = [];
    const loader = vi.fn<AuraAssetPreloadFn>((_descriptors, options) => {
      signals.push(options!.signal);
      return loads[signals.length - 1]!.promise;
    });
    const firstContext = {};
    const secondContext = {};
    const first = resourceForDescriptors(descriptors, loader, firstContext);
    const second = resourceForDescriptors(descriptors, loader, secondContext);
    const otherDigest = resourceForDescriptors([{ ...descriptors[0], hash: "a".repeat(64) }], loader, firstContext);
    const otherLoader = resourceForDescriptors(descriptors, async () => success, firstContext);
    expect(resourceForDescriptors(descriptors, loader, firstContext)).toBe(first);
    expect(second).not.toBe(first);
    expect(otherDigest).not.toBe(first);
    expect(otherLoader).not.toBe(first);
    const firstController = new AbortController();
    const secondController = new AbortController();
    const firstRead = suspendedRead(first, firstController.signal);
    const secondRead = suspendedRead(second, secondController.signal);
    const firstResult = expect(firstRead).rejects.toMatchObject({ name: "AbortError" });
    firstController.abort();
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    const retry = suspendedRead(first, new AbortController().signal);
    loads[0]!.resolve({ ok: true, loaded: ["model"], failed: [] });
    loads[1]!.resolve(success);
    loads[2]!.resolve(success);
    await firstResult;
    await expect(secondRead).resolves.toEqual(success);
    await expect(retry).resolves.toEqual(success);
    expect(loader).toHaveBeenCalledTimes(3);
    expect(first.read()).toEqual(success);
    expect(second.read()).toEqual(success);
    first.dispose();
    second.dispose();
    otherDigest.dispose();
    otherLoader.dispose();
  });
});

describe("React asset resource default unsignalled interest", () => {
  function suspendedUnsignalled(resource: AuraAssetResource): Promise<AuraAssetPreloadEvidence> {
    try { resource.read(); } catch (value) {
      if (value instanceof Promise) return value as Promise<AuraAssetPreloadEvidence>;
      throw value;
    }
    throw new Error("Expected a suspended asset read.");
  }

  it("bounds an abandoned unsignalled read, keeps its lookup owned until then, and permits retry", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const loader = vi.fn<AuraAssetPreloadFn>((_descriptors, options) => {
      signals.push(options!.signal);
      return new Promise<AuraAssetPreloadEvidence>(() => undefined); // A stalled request.
    });
    const context = {};
    const abandonedDescriptors = [{ id: "abandoned", url: "/abandoned.glb" }];
    const abandoned = resourceForDescriptors(abandonedDescriptors, loader, context);
    const churn: AuraAssetResource[] = [];
    try {
      // An uncommitted Suspense render calls read() with no signal and never commits cleanup.
      const wait = suspendedUnsignalled(abandoned);
      expect(suspendedUnsignalled(abandoned)).toBe(wait);
      const settled = expect(wait).rejects.toMatchObject({ name: "TimeoutError" });
      // While its work is live, cache pressure neither evicts nor cancels the owned entry.
      for (let index = 0; index < 160; index++) {
        churn.push(resourceForDescriptors([{ id: `idle-${index}`, url: `/idle-${index}` }], loader, context));
      }
      expect(resourceForDescriptors(abandonedDescriptors, loader, context)).toBe(abandoned);
      expect(signals[0]?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(signals[0]?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await settled;
      // The interest ended: the stalled flight is cancelled and left as a retryable failure.
      expect(signals[0]?.aborted).toBe(true);
      expect(() => abandoned.read()).toThrow(expect.objectContaining({ name: "TimeoutError" }));
      expect(loader).toHaveBeenCalledOnce();
      const retry = abandoned.retry({ signal: new AbortController().signal });
      void retry.catch(() => undefined);
      expect(loader).toHaveBeenCalledTimes(2);
      expect(signals[1]?.aborted).toBe(false);
    } finally {
      abandoned.dispose();
      for (const resource of churn) resource.dispose();
      vi.useRealTimers();
    }
  });

  it("a retained owner suspends the unsignalled deadline and releasing it resumes the bound", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const loader = vi.fn<AuraAssetPreloadFn>((_descriptors, options) => {
      signals.push(options!.signal);
      return new Promise<AuraAssetPreloadEvidence>(() => undefined);
    });
    const resource = createAuraAssetResource(descriptors, loader);
    try {
      const wait = suspendedUnsignalled(resource);
      const settled = expect(wait).rejects.toMatchObject({ name: "TimeoutError" });
      const release = resource.retain();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(signals[0]?.aborted).toBe(false);
      release();
      await vi.advanceTimersByTimeAsync(30_000);
      await settled;
      expect(signals[0]?.aborted).toBe(true);
      expect(loader).toHaveBeenCalledOnce();
    } finally {
      resource.dispose();
      vi.useRealTimers();
    }
  });
});

describe("React frame subscriber lifecycle", () => {
  it("does not invoke a subscriber released earlier in the same frame", () => {
    let dispatch: ((frame: AuraFrameInfo) => void) | undefined;
    const unsubscribe = vi.fn();
    const scheduler = createFrameScheduler({
      onFrame(callback) {
        dispatch = callback;
        return unsubscribe;
      }
    });
    const removed = vi.fn();
    let releaseRemoved: () => void = () => undefined;
    const releaseFirst = scheduler.subscribe(() => releaseRemoved());
    releaseRemoved = scheduler.subscribe(removed);
    dispatch?.({
      dt: 0, fixedDt: 0, time: 0, frame: 1, alpha: 0, paused: false,
      source: "manual", substep: 0, substeps: 1
    });
    expect(removed).not.toHaveBeenCalled();
    releaseFirst();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("rolls back a subscriber when the host cannot register its frame listener", () => {
    const failure = new Error("host is disposed");
    const scheduler = createFrameScheduler({
      onFrame() {
        throw failure;
      }
    });
    expect(() => scheduler.subscribe(() => undefined)).toThrow(failure);
    expect(scheduler.subscriberCount()).toBe(0);
  });

  it("can register a new listener after an earlier host cleanup throws", () => {
    const failure = new Error("listener cleanup failed");
    const onFrame = vi.fn()
      .mockImplementationOnce(() => () => { throw failure; })
      .mockImplementationOnce(() => () => undefined);
    const scheduler = createFrameScheduler({ onFrame });
    const first = scheduler.subscribe(() => undefined);
    expect(() => first()).toThrow(failure);
    const second = scheduler.subscribe(() => undefined);
    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(scheduler.subscriberCount()).toBe(1);
    second();
    expect(scheduler.subscriberCount()).toBe(0);
  });
});
