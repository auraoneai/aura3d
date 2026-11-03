import { describe, expect, it, vi } from "vitest";
import type { AssetLoader } from "../../packages/assets/src/AssetLoader";
import { FormatRegistry, type FormatMetadata, type FormatSelection } from "../../packages/assets/src/FormatRegistry";
import { LoadContext } from "../../packages/assets/src/LoadContext";

interface ExampleAsset { readonly id: string }

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

describe("format registry post-load validation", () => {
  it("snapshots the admitted request and mutable policy before scheduling its loader", async () => {
    const registry = new FormatRegistry();
    const signal = new AbortController();
    const replacementSignal = new AbortController();
    const headers = new Headers({ "x-request-token": "original" });
    const allowedOrigins = ["https://assets.test"];
    const integrity = { version: 1 as const, digest: "a".repeat(64), dependencies: { "part.bin": "b".repeat(64) } };
    const progress = vi.fn();
    const load = vi.fn((request: Parameters<AssetLoader<ExampleAsset>["load"]>[0]) => ({ id: request.url }));
    registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true, load } });
    const request = { url: "https://assets.test/original.sample", type: "sample", format: "sample", signal: signal.signal,
      credentials: "include" as const, headers, allowedOrigins, integrity, onProgress: progress };
    const pending = registry.load<ExampleAsset>(request, new LoadContext());
    request.url = "https://attacker.test/changed.sample";
    request.type = "other";
    request.format = "other";
    request.signal = replacementSignal.signal;
    request.onProgress = vi.fn();
    headers.set("x-request-token", "changed");
    allowedOrigins.push("https://attacker.test");
    integrity.digest = "c".repeat(64);
    integrity.dependencies["part.bin"] = "d".repeat(64);

    const lease = await pending;
    expect(load).toHaveBeenCalledOnce();
    const admitted = load.mock.calls[0]![0];
    expect(admitted).toMatchObject({ url: "https://assets.test/original.sample", type: "sample", format: "sample", credentials: "include",
      allowedOrigins: ["https://assets.test"], integrity: { version: 1, digest: "a".repeat(64), dependencies: { "part.bin": "b".repeat(64) } } });
    expect(new Headers(admitted.headers).get("x-request-token")).toBe("original");
    expect(admitted.signal).toBe(signal.signal);
    expect(admitted.onProgress).toBe(progress);
    expect(lease.asset.id).toBe("https://assets.test/original.sample");
    await lease.dispose();
  });

  it("pins the selected adapter and loader even if the registry entry changes during loading", async () => {
    const registry = new FormatRegistry();
    const loaded = deferred<ExampleAsset>();
    const asset = { id: "original" };
    const originalDispose = vi.fn();
    const replacementDispose = vi.fn();
    const original: AssetLoader<ExampleAsset> = { type: "sample", canLoad: () => true, load: () => loaded.promise, dispose: originalDispose };
    const replacement: AssetLoader<ExampleAsset> = { type: "sample", canLoad: () => true, load: () => ({ id: "replacement" }), dispose: replacementDispose };
    const validate = vi.fn((_value: ExampleAsset, _metadata: Readonly<FormatMetadata> | undefined, loader: AssetLoader<ExampleAsset>) => {
      expect(loader).toBe(original);
    });
    const replacementValidate = vi.fn();
    registry.register({ id: "sample", extensions: ["sample"], loader: original, validateLoadedAsset: validate });
    const exposed = registry.select({ url: "input.sample" }) as { loader: AssetLoader<ExampleAsset>; validateLoadedAsset: typeof validate };
    const pending = registry.load<ExampleAsset>({ url: "input.sample" }, new LoadContext());
    exposed.loader = replacement;
    exposed.validateLoadedAsset = replacementValidate;
    loaded.resolve(asset);
    const lease = await pending;
    expect(lease.asset).toBe(asset);
    expect(validate).toHaveBeenCalledOnce();
    expect(replacementValidate).not.toHaveBeenCalled();
    await lease.dispose();
    expect(originalDispose).toHaveBeenCalledOnce();
    expect(replacementDispose).not.toHaveBeenCalled();
  });

  it("validates with a frozen admission snapshot and the actual override loader", async () => {
    const registry = new FormatRegistry();
    const loaded = deferred<ExampleAsset>();
    const asset = { id: "override" };
    const baseDispose = vi.fn();
    const overrideDispose = vi.fn();
    const base: AssetLoader<ExampleAsset> = { type: "sample", canLoad: () => true, load: () => ({ id: "base" }), dispose: baseDispose };
    const override: AssetLoader<ExampleAsset> = { type: "sample", canLoad: () => true, load: () => loaded.promise, dispose: overrideDispose };
    const validate = vi.fn((value: ExampleAsset, metadata: Readonly<FormatMetadata> | undefined, loader: AssetLoader<ExampleAsset>) => {
      expect(value).toBe(asset);
      expect(loader).toBe(override);
      expect(metadata).toEqual({ adapter: "sample", version: "150", source: { format: "source", version: "1", conversion: "offline" } });
      expect(Object.isFrozen(metadata)).toBe(true);
      expect(Object.isFrozen(metadata?.source)).toBe(true);
    });
    registry.register({ id: "sample", extensions: ["sample"], supportedVersions: ["150", "200"], loader: base, validateLoadedAsset: validate });
    const metadata = { adapter: "sample", version: "150", source: { format: "source", version: "1", conversion: "offline" as const } };
    const pending = registry.load<ExampleAsset>({ url: "input.sample" }, new LoadContext(), { formatMetadata: metadata }, override);
    metadata.version = "200";
    metadata.source.version = "2";
    loaded.resolve(asset);
    const lease = await pending;

    expect(validate).toHaveBeenCalledOnce();
    expect(lease.asset).toBe(asset);
    expect(lease.formatMetadata).toEqual({ adapter: "sample", version: "150", source: { format: "source", version: "1", conversion: "offline" } });
    expect(lease.formatMetadata).not.toBe(metadata);
    await lease.dispose();
    await lease.dispose();
    expect(overrideDispose).toHaveBeenCalledOnce();
    expect(baseDispose).not.toHaveBeenCalled();
  });

  it("waits for exactly one asset cleanup before reporting validation failure", async () => {
    const registry = new FormatRegistry();
    const cleanup = deferred<void>();
    const cleanupStarted = deferred<void>();
    const asset = { id: "bad" };
    const failure = new Error("declared version differs from parsed bytes");
    const dispose = vi.fn(async () => { cleanupStarted.resolve(); await cleanup.promise; });
    const build = vi.fn(() => { throw new Error("render builder should not run"); });
    registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true, load: () => asset, dispose },
      validateLoadedAsset: () => { throw failure; },
      buildRenderableScene: build
    });
    const pending = registry.load({ url: "input.sample" }, new LoadContext());
    let finished = false;
    void pending.then(() => { finished = true; }, () => { finished = true; });
    await cleanupStarted.promise;
    expect(finished).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledWith(asset);
    expect(build).not.toHaveBeenCalled();
    cleanup.resolve();
    await expect(pending).rejects.toBe(failure);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("retains both validation and disposal failures", async () => {
    const registry = new FormatRegistry();
    const validationError = new Error("invalid version");
    const cleanupError = new Error("cleanup failed");
    const dispose = vi.fn(() => { throw cleanupError; });
    registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true, load: () => ({ id: "bad" }), dispose },
      validateLoadedAsset: () => { throw validationError; }
    });
    const error: unknown = await registry.load({ url: "input.sample" }, new LoadContext()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([validationError, cleanupError]);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("cleans up once when validation synchronously aborts the request", async () => {
    const registry = new FormatRegistry();
    const controller = new AbortController();
    const aborted = new Error("cancel from validation");
    const asset = { id: "cancelled" };
    const dispose = vi.fn();
    registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true, load: () => asset, dispose },
      validateLoadedAsset: () => { controller.abort(aborted); }
    });
    await expect(registry.load({ url: "input.sample", signal: controller.signal }, new LoadContext())).rejects.toBe(aborted);
    expect(dispose).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledWith(asset);
  });

  it("fails closed and observes rejection from an asynchronous validation callback", async () => {
    const registry = new FormatRegistry();
    const dispose = vi.fn();
    registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true, load: () => ({ id: "async" }), dispose },
      validateLoadedAsset: async () => { await Promise.resolve(); throw new Error("late validation failure"); }
    });
    await expect(registry.load({ url: "input.sample" }, new LoadContext())).rejects.toThrow(/validation must complete synchronously/);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("rejects non-void callback results rather than interpreting them as approval", async () => {
    const registry = new FormatRegistry();
    const dispose = vi.fn();
    registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true, load: () => ({ id: "result" }), dispose },
      validateLoadedAsset: () => false
    });
    await expect(registry.load({ url: "input.sample" }, new LoadContext())).rejects.toThrow(/validation must complete synchronously/);
    expect(dispose).toHaveBeenCalledOnce();
  });

  for (const source of ["request", "context"] as const) {
    it(`does not start the loader if the ${source} is aborted before its queued callback`, async () => {
      const registry = new FormatRegistry();
      const controller = new AbortController();
      const failure = new Error(`cancel ${source}`);
      const load = vi.fn(() => ({ id: "not-started" }));
      const dispose = vi.fn();
      const validate = vi.fn();
      registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true, load, dispose },
        validateLoadedAsset: validate });
      const context = new LoadContext(source === "context" ? { signal: controller.signal } : {});
      const pending = registry.load({ url: "input.sample", ...(source === "request" ? { signal: controller.signal } : {}) }, context);
      controller.abort(failure);
      await expect(pending).rejects.toBe(failure);
      expect(load).not.toHaveBeenCalled();
      expect(dispose).not.toHaveBeenCalled();
      expect(validate).not.toHaveBeenCalled();
    });
  }

  it("cancels a pending load promptly and disposes its late result without validating it", async () => {
    const registry = new FormatRegistry();
    const loading = deferred<ExampleAsset>();
    const started = deferred<void>();
    const disposed = deferred<void>();
    const controller = new AbortController();
    const error = new Error("cancel pending");
    const asset = { id: "late" };
    const dispose = vi.fn(() => { disposed.resolve(); });
    const validate = vi.fn();
    registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true,
      load: () => { started.resolve(); return loading.promise; }, dispose }, validateLoadedAsset: validate });
    const pending = registry.load({ url: "input.sample", signal: controller.signal }, new LoadContext());
    await started.promise;
    controller.abort(error);
    await expect(pending).rejects.toBe(error);
    loading.resolve(asset);
    await disposed.promise;
    expect(dispose).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledWith(asset);
    expect(validate).not.toHaveBeenCalled();
  });

  it("waits for a late loader result and its disposal when settled abort cleanup is selected", async () => {
    const registry = new FormatRegistry();
    const loading = deferred<ExampleAsset>();
    const started = deferred<void>();
    const cleanup = deferred<void>();
    const cleanupStarted = deferred<void>();
    const controller = new AbortController();
    const aborted = new Error("cancel and await cleanup");
    const asset = { id: "late" };
    const dispose = vi.fn(async () => { cleanupStarted.resolve(); await cleanup.promise; });
    const validate = vi.fn();
    registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true,
      load: () => { started.resolve(); return loading.promise; }, dispose }, validateLoadedAsset: validate });
    const selection: { abortCleanup: "settled" | "prompt" } = { abortCleanup: "settled" };
    const pending = registry.load({ url: "input.sample", signal: controller.signal }, new LoadContext(), selection);
    let finished = false;
    void pending.then(() => { finished = true; }, () => { finished = true; });
    selection.abortCleanup = "prompt";
    await started.promise;
    controller.abort(aborted);
    await flush();
    expect(finished).toBe(false);
    loading.resolve(asset);
    await cleanupStarted.promise;
    expect(finished).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledWith(asset);
    expect(validate).not.toHaveBeenCalled();
    cleanup.resolve();
    await expect(pending).rejects.toBe(aborted);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("surfaces late cleanup failure alongside the original abort reason", async () => {
    const registry = new FormatRegistry();
    const loading = deferred<ExampleAsset>();
    const started = deferred<void>();
    const controller = new AbortController();
    const aborted = new Error("cancel");
    const failure = new Error("late disposal failed");
    const dispose = vi.fn(async () => { throw failure; });
    registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true,
      load: () => { started.resolve(); return loading.promise; }, dispose } });
    const pending = registry.load({ url: "input.sample", signal: controller.signal }, new LoadContext(), { abortCleanup: "settled" });
    await started.promise;
    controller.abort(aborted);
    loading.resolve({ id: "late" });
    const error: unknown = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error).toMatchObject({ code: "FORMAT_ABORT_CLEANUP_FAILED" });
    expect((error as AggregateError).errors).toEqual([aborted, failure]);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("preserves the original reason when a cancelled loader rejects with a distinct AbortError", async () => {
    const registry = new FormatRegistry();
    const loading = deferred<ExampleAsset>();
    const started = deferred<void>();
    const controller = new AbortController();
    const aborted = new Error("original cancel");
    const dispose = vi.fn();
    registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true,
      load: () => { started.resolve(); return loading.promise; }, dispose } });
    const pending = registry.load({ url: "input.sample", signal: controller.signal }, new LoadContext(), { abortCleanup: "settled" });
    await started.promise;
    controller.abort(aborted);
    loading.reject(new DOMException("different cancellation", "AbortError"));
    await expect(pending).rejects.toBe(aborted);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("surfaces a distinct loader failure after cancellation", async () => {
    const registry = new FormatRegistry();
    const loading = deferred<ExampleAsset>();
    const started = deferred<void>();
    const controller = new AbortController();
    const aborted = new Error("cancel");
    const failure = new Error("loader cleanup failed");
    const dispose = vi.fn();
    registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true,
      load: () => { started.resolve(); return loading.promise; }, dispose } });
    const pending = registry.load({ url: "input.sample", signal: controller.signal }, new LoadContext(), { abortCleanup: "settled" });
    await started.promise;
    controller.abort(aborted);
    loading.reject(failure);
    const error: unknown = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error).toMatchObject({ code: "FORMAT_ABORT_LOAD_FAILED" });
    expect((error as AggregateError).errors).toEqual([aborted, failure]);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("does not hide a loader aggregate that contains both abort and cleanup errors", async () => {
    const registry = new FormatRegistry();
    const loading = deferred<ExampleAsset>();
    const started = deferred<void>();
    const controller = new AbortController();
    const aborted = new Error("cancel");
    const failure = new AggregateError([new DOMException("cancelled", "AbortError"), new Error("loader cleanup failed")], "load and cleanup failed");
    registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true,
      load: () => { started.resolve(); return loading.promise; } } });
    const pending = registry.load({ url: "input.sample", signal: controller.signal }, new LoadContext(), { abortCleanup: "settled" });
    await started.promise;
    controller.abort(aborted);
    loading.reject(failure);
    const error: unknown = await pending.catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "FORMAT_ABORT_LOAD_FAILED" });
    expect((error as AggregateError).errors).toEqual([aborted, failure]);
  });

  it("tags cleanup failure if cancellation occurs during post-load validation", async () => {
    const registry = new FormatRegistry();
    const controller = new AbortController();
    const aborted = new Error("cancel in validation");
    const failure = new Error("disposal failed");
    const dispose = vi.fn(() => { throw failure; });
    registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true,
      load: () => ({ id: "loaded" }), dispose }, validateLoadedAsset: () => { controller.abort(aborted); } });
    const error: unknown = await registry.load({ url: "input.sample", signal: controller.signal }, new LoadContext(), { abortCleanup: "settled" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error).toMatchObject({ code: "FORMAT_ABORT_CLEANUP_FAILED" });
    expect((error as AggregateError).errors).toEqual([aborted, failure]);
    expect(dispose).toHaveBeenCalledOnce();
  });

  for (const source of ["request", "context"] as const) {
    it(`preserves the original ${source} reason when settled cleanup aborts before the loader starts`, async () => {
      const registry = new FormatRegistry();
      const controller = new AbortController();
      const aborted = new Error(`cancel ${source}`);
      const load = vi.fn(() => ({ id: "not-started" }));
      const dispose = vi.fn();
      registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true, load, dispose } });
      const context = new LoadContext(source === "context" ? { signal: controller.signal } : {});
      const pending = registry.load({ url: "input.sample", ...(source === "request" ? { signal: controller.signal } : {}) }, context, { abortCleanup: "settled" });
      controller.abort(aborted);
      await expect(pending).rejects.toBe(aborted);
      expect(load).not.toHaveBeenCalled();
      expect(dispose).not.toHaveBeenCalled();
    });
  }

  it("rejects an unknown abort cleanup mode before starting a loader", async () => {
    const registry = new FormatRegistry();
    const load = vi.fn(() => ({ id: "not-started" }));
    registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true, load } });
    const invalid = { abortCleanup: "unknown" } as unknown as FormatSelection;
    await expect(registry.load({ url: "input.sample" }, new LoadContext(), invalid)).rejects.toThrow(/abort cleanup mode/);
    expect(load).not.toHaveBeenCalled();
  });

  it("rejects an unsupported admitted version before invoking the loader", async () => {
    const registry = new FormatRegistry();
    const load = vi.fn(() => ({ id: "unreachable" }));
    const validate = vi.fn();
    registry.register({ id: "sample", extensions: ["sample"], supportedVersions: ["150", "200"],
      loader: { type: "sample", canLoad: () => true, load }, validateLoadedAsset: validate });
    await expect(registry.load({ url: "input.sample" }, new LoadContext(), { formatMetadata: { version: "201" } })).rejects.toThrow(/version/);
    expect(load).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
  });

  it("continues to support adapters that omit the optional hook", async () => {
    const registry = new FormatRegistry();
    const dispose = vi.fn();
    registry.register({ id: "sample", extensions: ["sample"], loader: { type: "sample", canLoad: () => true, load: () => ({ id: "old" }), dispose } });
    const lease = await registry.load<ExampleAsset>({ url: "input.sample" }, new LoadContext());
    expect(lease.asset.id).toBe("old");
    await lease.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
