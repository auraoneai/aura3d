import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetManager } from "../../../packages/assets/src/AssetManager";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import { createAssetTransportTracker, fetchBytes } from "../../../packages/assets/src/LoaderFetch";
import { ImageFormatLoader, type NativeImageAsset } from "../../../packages/assets/src/loaders/ImageFormatLoaders";

afterEach(() => vi.unstubAllGlobals());

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

function observe(promise: Promise<void>): { settled: boolean } {
  const observation = { settled: false };
  void promise.then(() => { observation.settled = true; });
  return observation;
}

/** Independently encoded one-pixel PVR v3 RGBA8 image. */
function pvr(): ArrayBuffer {
  const bytes = new Uint8Array(56);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x03525650, true);
  view.setUint32(8, 0x61626772, true);
  view.setUint32(12, 0x08080808, true);
  view.setUint32(16, 1, true);
  for (const offset of [24, 28, 32, 36, 40, 44]) view.setUint32(offset, 1, true);
  bytes.set([3, 5, 7, 255], 52);
  return bytes.buffer;
}

describe("asset transport settlement", () => {
  it("rejects new loader and fetch roots after sealing while retaining late cleanup", async () => {
    const original = deferred<void>();
    const lateCleanup = deferred<void>();
    const tracker = createAssetTransportTracker();
    const observed = observe(tracker.settled);
    const fetch = vi.fn(async () => new Response(pvr()));
    vi.stubGlobal("fetch", fetch);
    tracker.track(original.promise);
    tracker.seal();
    const loader = new ImageFormatLoader("pvr", { transportTracker: tracker });
    await expect(loader.load({ url: "https://assets.test/not-started.pvr", type: "pvr" }, new LoadContext()))
      .rejects.toThrow("tracker is sealed");
    await expect(fetchBytes("https://assets.test/not-started.pvr", undefined, undefined, {}, tracker))
      .rejects.toThrow("tracker is sealed");
    const manager = new AssetManager();
    manager.register(loader);
    await expect(manager.load("https://assets.test/not-started.pvr", { type: "pvr", transportTracker: tracker }))
      .rejects.toThrow("tracker is sealed");
    expect(fetch).not.toHaveBeenCalled();
    // A child cleanup registered by already-running work remains admissible.
    tracker.track(lateCleanup.promise);
    original.resolve();
    await flush();
    expect(observed.settled).toBe(false);
    lateCleanup.resolve();
    await tracker.settled;
  });

  it("retains an aborted manager acquisition until its request identity digest settles", async () => {
    const digest = deferred<ArrayBuffer>();
    const tracker = createAssetTransportTracker();
    const observed = observe(tracker.settled);
    const controller = new AbortController();
    const calculate = vi.fn(() => {
      // Exercise synchronous abort and seal during WebCrypto admission: the
      // manager has to reserve its lifetime before invoking the digest.
      controller.abort();
      tracker.seal();
      return digest.promise;
    });
    vi.stubGlobal("crypto", { subtle: { digest: calculate } });
    const load = vi.fn(async () => new Uint8Array());
    const manager = new AssetManager();
    manager.register({ type: "identity-fixture", canLoad: () => true, load });
    const result = manager.load("https://assets.test/identity.bin", {
      type: "identity-fixture", signal: controller.signal, transportTracker: tracker
    });
    await expect(result).rejects.toMatchObject({ name: "AssetLoadError", message: "Asset load aborted" });
    await flush();
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();
    expect(observed.settled).toBe(false);
    digest.resolve(new Uint8Array(32).buffer);
    await tracker.settled;
    expect(observed.settled).toBe(true);
  });

  it("reserves the root before a fetch synchronously aborts and seals its tracker", async () => {
    const response = deferred<Response>();
    const cancellation = deferred<void>();
    const tracker = createAssetTransportTracker();
    const observed = observe(tracker.settled);
    const controller = new AbortController();
    const cancel = vi.fn(() => cancellation.promise);
    vi.stubGlobal("fetch", vi.fn(() => {
      controller.abort();
      tracker.seal();
      return response.promise;
    }));
    const result = fetchBytes("https://assets.test/reentrant.pvr", controller.signal, undefined, {}, tracker);
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    expect(observed.settled).toBe(false);
    response.resolve({ body: { locked: false, cancel } } as unknown as Response);
    await flush();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(observed.settled).toBe(false);
    cancellation.resolve();
    await tracker.settled;
  });

  it("retains a late response until its asynchronous body cancellation settles", async () => {
    const response = deferred<Response>();
    const cancellation = deferred<void>();
    const cancel = vi.fn(() => cancellation.promise);
    vi.stubGlobal("fetch", vi.fn(() => response.promise));
    const tracker = createAssetTransportTracker();
    const observed = observe(tracker.settled);
    const controller = new AbortController();
    const result = fetchBytes("https://assets.test/late.pvr", controller.signal, undefined, {}, tracker);

    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    tracker.seal();
    await flush();
    expect(observed.settled).toBe(false);

    response.resolve({ body: { locked: false, cancel } } as unknown as Response);
    await flush();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(observed.settled).toBe(false);
    cancellation.resolve();
    await tracker.settled;
    expect(observed.settled).toBe(true);
    expect(() => tracker.track(Promise.resolve())).toThrow("already settled");
  });

  it("discards a response when abort falls between fetch resolution and its continuation", async () => {
    const cancellation = deferred<void>();
    const cancel = vi.fn(() => cancellation.promise);
    const response = { body: { locked: false, cancel } } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response)));
    const tracker = createAssetTransportTracker();
    const observed = observe(tracker.settled);
    const controller = new AbortController();
    const result = fetchBytes("https://assets.test/resolved.pvr", controller.signal, undefined, {}, tracker);
    queueMicrotask(() => controller.abort());
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    tracker.seal();
    await flush();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(observed.settled).toBe(false);
    cancellation.resolve();
    await tracker.settled;
  });

  it("waits for both a pending stream read and its asynchronous cancellation", async () => {
    const read = deferred<ReadableStreamReadResult<Uint8Array>>();
    const cancellation = deferred<void>();
    const readStarted = deferred<void>();
    const reader = {
      read: vi.fn(() => { readStarted.resolve(); return read.promise; }),
      cancel: vi.fn(() => cancellation.promise),
      releaseLock: vi.fn()
    };
    const response = {
      ok: true, redirected: false, url: "", status: 200,
      headers: new Headers(), body: { getReader: () => reader }
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const tracker = createAssetTransportTracker();
    const observed = observe(tracker.settled);
    const controller = new AbortController();
    const result = fetchBytes("https://assets.test/stream.pvr", controller.signal, undefined, {}, tracker);
    await readStarted.promise;

    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    tracker.seal();
    expect(reader.cancel).toHaveBeenCalled();
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    cancellation.resolve();
    await flush();
    expect(observed.settled).toBe(false);
    read.resolve({ done: true, value: undefined });
    await tracker.settled;
    expect(observed.settled).toBe(true);
  });

  it("retries a refused reader release after the pending read and cancel settle", async () => {
    const read = deferred<ReadableStreamReadResult<Uint8Array>>();
    const cancellation = deferred<void>();
    const readStarted = deferred<void>();
    const reader = {
      read: vi.fn(() => { readStarted.resolve(); return read.promise; }),
      cancel: vi.fn(() => cancellation.promise),
      releaseLock: vi.fn()
        .mockImplementationOnce(() => { throw new TypeError("read still pending"); })
        .mockImplementation(() => {})
    };
    const response = {
      ok: true, redirected: false, url: "", status: 200,
      headers: new Headers(), body: { getReader: () => reader }
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const tracker = createAssetTransportTracker();
    const observed = observe(tracker.settled);
    const controller = new AbortController();
    const result = fetchBytes("https://assets.test/lock.pvr", controller.signal, undefined, {}, tracker);
    await readStarted.promise;
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    tracker.seal();
    cancellation.resolve();
    await flush();
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(observed.settled).toBe(false);
    read.resolve({ done: true, value: undefined });
    await tracker.settled;
    expect(reader.releaseLock).toHaveBeenCalledTimes(2);
    expect(observed.settled).toBe(true);
  });

  it("retains the slot when a late body cancellation rejects", async () => {
    const response = deferred<Response>();
    const cancellation = deferred<void>();
    vi.stubGlobal("fetch", vi.fn(() => response.promise));
    const tracker = createAssetTransportTracker();
    const observed = observe(tracker.settled);
    const controller = new AbortController();
    const result = fetchBytes("https://assets.test/late-error.pvr", controller.signal, undefined, {}, tracker);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    tracker.seal();
    response.resolve({ body: { locked: false, cancel: () => cancellation.promise } } as unknown as Response);
    await flush();
    cancellation.reject(new Error("cancellation failed"));
    await flush();
    expect(observed.settled).toBe(false);
  });

  it("retains the slot when a late body cancellation throws", async () => {
    const response = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => response.promise));
    const tracker = createAssetTransportTracker();
    const observed = observe(tracker.settled);
    const controller = new AbortController();
    const result = fetchBytes("https://assets.test/late-throw.pvr", controller.signal, undefined, {}, tracker);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    tracker.seal();
    response.resolve({ body: { locked: false, cancel: () => { throw new Error("cannot cancel"); } } } as unknown as Response);
    await flush();
    expect(observed.settled).toBe(false);
  });

  it("discards the response if acquiring a stream reader throws", async () => {
    const cancellation = deferred<void>();
    const response = {
      ok: true, redirected: false, url: "", status: 200, headers: new Headers(),
      body: {
        locked: false,
        getReader: () => { throw new Error("reader unavailable"); },
        cancel: () => cancellation.promise
      }
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const tracker = createAssetTransportTracker();
    const observed = observe(tracker.settled);
    await expect(fetchBytes("https://assets.test/no-reader.pvr", undefined, undefined, {}, tracker)).rejects.toThrow("reader unavailable");
    tracker.seal();
    await flush();
    expect(observed.settled).toBe(false);
    cancellation.resolve();
    await tracker.settled;
  });

  it("retains the slot when retrying reader release still fails", async () => {
    const read = deferred<ReadableStreamReadResult<Uint8Array>>();
    const readStarted = deferred<void>();
    const reader = {
      read: vi.fn(() => { readStarted.resolve(); return read.promise; }),
      cancel: vi.fn(async () => {}),
      releaseLock: vi.fn(() => { throw new Error("cannot release"); })
    };
    const response = {
      ok: true, redirected: false, url: "", status: 200,
      headers: new Headers(), body: { getReader: () => reader }
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const tracker = createAssetTransportTracker();
    const observed = observe(tracker.settled);
    const controller = new AbortController();
    const result = fetchBytes("https://assets.test/unreleased.pvr", controller.signal, undefined, {}, tracker);
    await readStarted.promise;
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    tracker.seal();
    read.resolve({ done: true, value: undefined });
    await flush();
    expect(reader.releaseLock).toHaveBeenCalledTimes(2);
    expect(observed.settled).toBe(false);
  });

  it("retains the slot when a stream cancellation rejects even after its read ends", async () => {
    const read = deferred<ReadableStreamReadResult<Uint8Array>>();
    const cancellation = deferred<void>();
    const readStarted = deferred<void>();
    const reader = {
      read: vi.fn(() => { readStarted.resolve(); return read.promise; }),
      cancel: vi.fn(() => cancellation.promise),
      releaseLock: vi.fn()
    };
    const response = {
      ok: true, redirected: false, url: "", status: 200,
      headers: new Headers(), body: { getReader: () => reader }
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const tracker = createAssetTransportTracker();
    const observed = observe(tracker.settled);
    const controller = new AbortController();
    const result = fetchBytes("https://assets.test/read-cancel-error.pvr", controller.signal, undefined, {}, tracker);
    await readStarted.promise;
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    tracker.seal();
    read.resolve({ done: true, value: undefined });
    cancellation.reject(new Error("cancel failed"));
    await flush();
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(observed.settled).toBe(false);
  });

  it("keeps an aborted arrayBuffer read in the barrier until it settles", async () => {
    const read = deferred<ArrayBuffer>();
    const readStarted = deferred<void>();
    const response = {
      ok: true, redirected: false, url: "", status: 200, headers: new Headers(), body: null,
      arrayBuffer: () => { readStarted.resolve(); return read.promise; }
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const tracker = createAssetTransportTracker();
    const observed = observe(tracker.settled);
    const controller = new AbortController();
    const result = fetchBytes("https://assets.test/buffer.pvr", controller.signal, undefined, {}, tracker);
    await readStarted.promise;
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    tracker.seal();
    await flush();
    expect(observed.settled).toBe(false);
    read.resolve(new ArrayBuffer(0));
    await tracker.settled;
    expect(observed.settled).toBe(true);
  });

  it("tracks asynchronous body disposal after a rejected HTTP response", async () => {
    const cancellation = deferred<void>();
    const response = {
      ok: false, status: 404, body: { locked: false, cancel: () => cancellation.promise }
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const tracker = createAssetTransportTracker();
    const observed = observe(tracker.settled);
    await expect(fetchBytes("https://assets.test/missing", undefined, undefined, {}, tracker)).rejects.toMatchObject({ status: 404 });
    tracker.seal();
    await flush();
    expect(observed.settled).toBe(false);
    cancellation.resolve();
    await tracker.settled;
  });

  it("keeps tracking the native image loader after the last manager subscriber aborts", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const response = deferred<Response>();
    const started = deferred<void>();
    const cancellation = deferred<void>();
    const cancel = vi.fn(() => cancellation.promise);
    vi.stubGlobal("fetch", vi.fn(() => { started.resolve(); return response.promise; }));
    const tracker = createAssetTransportTracker();
    const observed = observe(tracker.settled);
    const manager = new AssetManager();
    manager.register(new ImageFormatLoader("pvr", { transportTracker: tracker }));
    const controller = new AbortController();
    const result = manager.load("https://assets.test/image.pvr", { type: "pvr", signal: controller.signal });
    await started.promise;

    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AssetLoadError", message: "Asset load aborted" });
    tracker.seal();
    await flush();
    expect(observed.settled).toBe(false);
    response.resolve({ body: { locked: false, cancel } } as unknown as Response);
    await flush();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(observed.settled).toBe(false);
    cancellation.resolve();
    await tracker.settled;
  });

  it("does not abort a shared flight while another subscriber still needs it", async () => {
    // Deterministically settle both identical request identities without a
    // background crypto-worker race between the two subscribers.
    vi.stubGlobal("crypto", { subtle: { digest: async () => new Uint8Array(32).buffer } });
    const response = deferred<Response>();
    const started = deferred<void>();
    const secondProgress = deferred<void>();
    const endOfStream = deferred<ReadableStreamReadResult<Uint8Array>>();
    let reads = 0;
    const reader = {
      read: vi.fn(() => ++reads === 1
        ? Promise.resolve({ done: false as const, value: new Uint8Array(pvr()) })
        : endOfStream.promise),
      cancel: vi.fn(async () => {}),
      releaseLock: vi.fn()
    };
    let fetchSignal: AbortSignal | undefined;
    const fetch = vi.fn((_url: string, init?: RequestInit) => {
      fetchSignal = init?.signal ?? undefined;
      started.resolve();
      return response.promise;
    });
    vi.stubGlobal("fetch", fetch);
    const tracker = createAssetTransportTracker();
    const manager = new AssetManager({ credentials: "omit" });
    manager.register(new ImageFormatLoader("pvr", { transportTracker: tracker }));
    const first = new AbortController();
    const a = manager.load<NativeImageAsset>("https://assets.test/shared.pvr", { type: "pvr", signal: first.signal });
    const b = manager.load<NativeImageAsset>("https://assets.test/shared.pvr", {
      type: "pvr",
      onProgress: (event) => { if (event.phase === "document" && event.loadedBytes > 0) secondProgress.resolve(); }
    });
    await started.promise;
    await flush();
    response.resolve({
      ok: true, redirected: false, url: "", status: 200,
      headers: new Headers(), body: { getReader: () => reader }
    } as unknown as Response);
    // The second subscriber's actual progress event proves it joined before
    // the first is cancelled; the open second read keeps the flight alive.
    await secondProgress.promise;
    first.abort();
    await expect(a).rejects.toMatchObject({ name: "AssetLoadError", message: "Asset load aborted" });
    expect(fetchSignal?.aborted).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    endOfStream.resolve({ done: true, value: undefined });
    const handle = await b;
    expect(Array.from(handle.value.levels[0]!.data)).toEqual([3, 5, 7, 255]);
    await handle.release();
    tracker.seal();
    await tracker.settled;
  });
});
