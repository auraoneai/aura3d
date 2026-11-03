import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetManager } from "../../../packages/assets/src/AssetManager";
import { mergeAssetRequestOptions, requestIdentity, requestIdentityDetails, type AssetRequestOptions } from "../../../packages/assets/src/AssetLoader";
import { fetchBytes } from "../../../packages/assets/src/LoaderFetch";

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { vi.unstubAllGlobals(); });

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("asset authentication generations", () => {
  it("does not reuse implicit or explicit credential-bearing requests without a generation", async () => {
    for (const credentials of [undefined, "same-origin", "include"] as const) {
      const options: AssetRequestOptions = credentials === undefined ? {} : { credentials };
      const first = await requestIdentityDetails(options, "https://assets.test/file.bin");
      const next = await requestIdentityDetails(options, "https://assets.test/file.bin");
      expect(first.reusable).toBe(false);
      expect(next.reusable).toBe(false);
      expect(first.key).not.toBe(next.key);
      expect(first.key).toMatch(/^unshared-/);
      expect(first.policyKey).toMatch(/^request-[a-f0-9]{64}$/);
      expect(first.policyKey).toBe(next.policyKey);
    }
  });

  it("allows omission and explicit same-generation sharing while separating changed policy or generation", async () => {
    const url = "https://assets.test/file.bin";
    const omitted = await requestIdentityDetails({ credentials: "omit" }, url);
    expect(omitted.reusable).toBe(true);
    expect((await requestIdentityDetails({ credentials: "omit" }, url)).key).toBe(omitted.key);
    const first = await requestIdentityDetails({ securityContext: "generation-one" }, url);
    const same = await requestIdentityDetails({ credentials: "same-origin", securityContext: "generation-one" }, url);
    const next = await requestIdentityDetails({ securityContext: "generation-two" }, url);
    const otherHeader = await requestIdentityDetails({ securityContext: "generation-one", headers: { "x-scope": "other" } }, url);
    expect(first.reusable).toBe(true);
    expect(first.key).toBe(same.key);
    expect(new Set([first.key, next.key, otherHeader.key]).size).toBe(3);
    expect(JSON.stringify([first, same, next, otherHeader])).not.toMatch(/generation-one|generation-two|x-scope|assets\.test/);
    expect(await requestIdentity({ securityContext: "generation-one" }, url)).toBe(first.key);
  });

  it("validates a supplied generation even when secure hashing is unavailable", async () => {
    for (const invalid of ["", "  ", null, 7]) {
      const options = { securityContext: invalid } as unknown as AssetRequestOptions;
      await expect(requestIdentityDetails(options)).rejects.toThrow(/non-empty authentication generation/);
      expect(() => mergeAssetRequestOptions({}, options)).toThrow(/non-empty authentication generation/);
    }
    vi.stubGlobal("crypto", undefined);
    const first = await requestIdentityDetails({ credentials: "omit", securityContext: "generation-one" });
    const next = await requestIdentityDetails({ credentials: "omit", securityContext: "generation-one" });
    expect(first).toMatchObject({ reusable: false });
    expect(first.policyKey).toBeUndefined();
    expect(first.key).not.toBe(next.key);
  });

  it("falls back to unique identities when a digest provider returns malformed bytes", async () => {
    vi.stubGlobal("crypto", { subtle: { digest: async () => new ArrayBuffer(0) } });
    const first = await requestIdentityDetails({ credentials: "omit" });
    const next = await requestIdentityDetails({ credentials: "omit" });
    expect(first.reusable).toBe(false);
    expect(first.policyKey).toBeUndefined();
    expect(first.key).not.toBe(next.key);
  });

  it("does not make an unscoped request reusable when caller options change during hashing", async () => {
    const digest = deferred<ArrayBuffer>();
    vi.stubGlobal("crypto", { subtle: { digest: () => digest.promise } });
    const options: { credentials: RequestCredentials; securityContext?: string } = { credentials: "include" };
    const pending = requestIdentityDetails(options, "https://assets.test/file.bin");
    options.credentials = "omit";
    options.securityContext = "generation-added-too-late";
    digest.resolve(new ArrayBuffer(32));
    const identity = await pending;
    expect(identity.reusable).toBe(false);
    expect(identity.key).toMatch(/^unshared-/);
  });

  it("keeps generation metadata out of request init, headers, and opaque identities", async () => {
    const securityContext = "private-test-generation";
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response("body"));
    vi.stubGlobal("fetch", fetch);
    const options: AssetRequestOptions = { credentials: "include", securityContext, headers: { "x-example": "ok" },
      allowedOrigins: ["https://assets.test"] };
    const identity = await requestIdentityDetails(options, "https://assets.test/file.bin");
    expect(JSON.stringify(identity)).not.toContain(securityContext);
    await fetchBytes("https://assets.test/file.bin", undefined, undefined, options);
    const init = fetch.mock.calls[0]![1]! as RequestInit & Record<string, unknown>;
    expect(init).not.toHaveProperty("securityContext");
    expect(new Headers(init.headers).has("securityContext")).toBe(false);
    expect(JSON.stringify(init)).not.toContain(securityContext);
  });

  it("inherits the effective generation into dependencies and honors explicit request overrides", async () => {
    const seen: Array<{ url: string; context?: string }> = [];
    const manager = new AssetManager({ securityContext: "manager-generation" });
    manager.register({ type: "test", canLoad: () => true,
      async load(request, context) {
        seen.push({ url: request.url, context: request.securityContext });
        if (request.url.endsWith("/root")) return (await context.loadDependency<string>("child", "test")).value;
        return "child";
      } });
    const value = await manager.load<string>("https://assets.test/root", { securityContext: "request-generation" });
    expect(value.value).toBe("child");
    expect(seen).toEqual([
      { url: "https://assets.test/root", context: "request-generation" },
      { url: "https://assets.test/child", context: "request-generation" }
    ]);
    await value.release();
    expect(mergeAssetRequestOptions({ securityContext: "one" }, { securityContext: "two" }).securityContext).toBe("two");
    expect(() => mergeAssetRequestOptions({ securityContext: "one" }, { securityContext: " " })).toThrow(/non-empty/);
  });

  it("does not reuse a live asset when ambient identity changes", async () => {
    let ambientIdentity = "first";
    const load = vi.fn(() => ({ identity: ambientIdentity }));
    const dispose = vi.fn();
    const manager = new AssetManager();
    manager.register({ type: "test", canLoad: () => true, load, dispose });
    const first = await manager.load<{ identity: string }>("https://assets.test/file.bin");
    ambientIdentity = "second";
    const next = await manager.load<{ identity: string }>("https://assets.test/file.bin");
    expect(first).not.toBe(next);
    expect(first.value.identity).toBe("first");
    expect(next.value.identity).toBe("second");
    expect(load).toHaveBeenCalledTimes(2);
    expect(manager.cache.snapshot().cachedEntries).toBe(0);
    await first.release();
    await next.release();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(manager.cache.snapshot().totalEntries).toBe(0);
  });

  it("keeps overlapping unscoped requests and their cancellations independent", async () => {
    const firstStarted = deferred<void>();
    const secondStarted = deferred<void>();
    const firstResult = deferred<string>();
    const secondResult = deferred<string>();
    const firstDisposed = deferred<void>();
    const firstAbort = new AbortController();
    let ambientIdentity = "first";
    let secondSignal: AbortSignal | undefined;
    const dispose = vi.fn((value: unknown) => { if (value === "first") firstDisposed.resolve(); });
    const manager = new AssetManager();
    manager.register({ type: "test", canLoad: () => true,
      load: (request) => {
        if (ambientIdentity === "first") { firstStarted.resolve(); return firstResult.promise; }
        secondSignal = request.signal;
        secondStarted.resolve();
        return secondResult.promise;
      }, dispose });
    const first = manager.load<string>("https://assets.test/file.bin", { signal: firstAbort.signal });
    await firstStarted.promise;
    ambientIdentity = "second";
    const next = manager.load<string>("https://assets.test/file.bin");
    await secondStarted.promise;
    firstAbort.abort();
    await expect(first).rejects.toThrow(/Asset load aborted/);
    expect(secondSignal?.aborted).toBe(false);
    firstResult.resolve("first");
    secondResult.resolve("second");
    const secondHandle = await next;
    await firstDisposed.promise;
    expect(secondHandle.value).toBe("second");
    await secondHandle.release();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it("reuses only a matching explicit generation or credential-omitted request", async () => {
    let sequence = 0;
    const load = vi.fn((request: { url: string }) => ({ url: request.url, sequence: ++sequence }));
    const manager = new AssetManager();
    manager.register({ type: "test", canLoad: () => true, load });
    const url = "https://assets.test/file.bin";
    const [a, b, changed, omittedA, omittedB] = await Promise.all([
      manager.load(url, { securityContext: "one" }),
      manager.load(url, { securityContext: "one" }),
      manager.load(url, { securityContext: "two" }),
      manager.load(url, { credentials: "omit" }),
      manager.load(url, { credentials: "omit" })
    ]);
    expect(a).toBe(b);
    expect(changed).not.toBe(a);
    expect(omittedA).toBe(omittedB);
    expect(omittedA).not.toBe(a);
    expect(load).toHaveBeenCalledTimes(3);
    await Promise.all([a.release(), b.release(), changed.release(), omittedA.release(), omittedB.release()]);
    expect(manager.cache.snapshot().totalEntries).toBe(0);
  });

  it("retains distinct same-URL dependency policies while still rejecting actual cycles", async () => {
    const manager = new AssetManager();
    manager.register({ type: "test", canLoad: () => true,
      async load(request, context) {
        const role = new Headers(request.headers).get("x-role");
        if (role === "root") {
          const child = await context.loadDependency<string>(request.url, "test", { headers: { "x-role": "leaf" } });
          return `root:${child.value}`;
        }
        if (role === "cycle") return (await context.loadDependency<string>(request.url, "test")).value;
        return "leaf";
      } });
    const value = await manager.load<string>("https://assets.test/file.bin", { headers: { "x-role": "root" } });
    expect(value.value).toBe("root:leaf");
    await value.release();
    await expect(manager.load("https://assets.test/file.bin", { headers: { "x-role": "cycle" } })).rejects.toThrow(/cycle/i);
    expect(manager.cache.snapshot().totalEntries).toBe(0);
  });
});
