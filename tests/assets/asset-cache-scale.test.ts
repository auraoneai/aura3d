import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetCache, AssetCacheKeyError, AssetHandle, AssetLoadError, AssetManager, type AssetLoader } from "../../packages/assets/src";

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("asset cache scale behavior", () => {
  it("deduplicates a burst of duplicate in-flight loads and exposes cache diagnostics", async () => {
    let loads = 0;
    let releaseLoad!: () => void;
    const heldLoad = new Promise<void>((resolve) => { releaseLoad = resolve; });
    let allSubscribersJoined!: () => void;
    const joined = new Promise<void>((resolve) => { allSubscribersJoined = resolve; });
    const joinedSubscribers = new Set<number>();
    const publishProgress: Array<() => void> = [];
    const loader: AssetLoader<{ readonly url: string }> = {
      type: "mock",
      canLoad: () => true,
      async load(request) {
        loads += 1;
        publishProgress.push(() => request.onProgress?.({ url: request.url, phase: "document", loadedBytes: 0 }));
        await heldLoad;
        return { url: request.url };
      }
    };
    const manager = new AssetManager({ baseUrl: "https://assets.example.test/", credentials: "omit" });
    manager.register(loader);

    const pending = Array.from({ length: 64 }, (_, index) => manager.load("shared.mesh", {
      type: "mock",
      onProgress: () => {
        joinedSubscribers.add(index);
        if (joinedSubscribers.size === 64) allSubscribersJoined();
      }
    }));
    const completed = Promise.all(pending);
    // Progress is broadcast to actual subscribers by the manager. Repeating it
    // until every distinct caller observes it avoids assumptions about async
    // digest ordering or how many microtasks are needed to join the flight.
    const ticker = setInterval(() => { for (const publish of publishProgress) publish(); }, 1);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(() => reject(new Error("Not all 64 asset subscribers joined the held load")), 5000);
    });
    try {
      await Promise.race([
        joined,
        timedOut,
        completed.then(() => { throw new Error("The held asset load completed before its subscribers joined"); })
      ]);
      expect(loads).toBe(1);
      expect(manager.cache.snapshot()).toMatchObject({
        cachedEntries: 0,
        inFlightEntries: 1,
        totalEntries: 1
      });
      expect(manager.cache.snapshot().keys).toEqual([expect.stringMatching(/^asset-cache-\d+$/)]);
    } finally {
      clearInterval(ticker);
      if (deadline !== undefined) clearTimeout(deadline);
      releaseLoad();
    }

    const handles = await completed;

    expect(new Set(handles).size).toBe(1);
    expect(handles[0]?.refCount).toBe(64);
    expect(manager.cache.snapshot()).toMatchObject({
      cachedEntries: 1,
      inFlightEntries: 0,
      totalEntries: 1
    });

    for (const handle of handles) {
      await manager.release(handle);
    }
    expect(manager.cache.snapshot()).toMatchObject({
      cachedEntries: 0,
      inFlightEntries: 0,
      totalEntries: 0
    });
  }, 10000);

  it("keeps failed scale loads out of the cache so retries can recover", async () => {
    let attempts = 0;
    const loader: AssetLoader<string> = {
      type: "mock",
      canLoad: () => true,
      load() {
        attempts += 1;
        if (attempts <= 2) {
          throw new Error(`transient-${attempts}`);
        }
        return "ready";
      }
    };
    const manager = new AssetManager({ retries: 1 });
    manager.register(loader);

    await expect(manager.load("retry.mesh", { type: "mock" })).rejects.toThrow(AssetLoadError);
    expect(attempts).toBe(2);
    expect(manager.cache.snapshot()).toMatchObject({ cachedEntries: 0, inFlightEntries: 0, totalEntries: 0 });

    const handle = await manager.load<string>("retry.mesh", { type: "mock" });
    expect(handle.value).toBe("ready");
    expect(attempts).toBe(3);
  });

  it("releases dependency graphs for many cached parent assets", async () => {
    const disposed: string[] = [];
    const leaf: AssetLoader<string> = {
      type: "leaf",
      canLoad: (request) => request.url.endsWith(".leaf"),
      load: (request) => request.url,
      dispose: (value) => {
        disposed.push(value);
      }
    };
    const parent: AssetLoader<string> = {
      type: "parent",
      canLoad: (request) => request.url.endsWith(".parent"),
      dependencies: (request) => [request.url.replace(/\.parent$/, ".leaf")],
      load: (request) => request.url,
      dispose: (value) => {
        disposed.push(value);
      }
    };
    const manager = new AssetManager({ credentials: "omit" });
    manager.register(leaf);
    manager.register(parent);

    const handles = await Promise.all(Array.from({ length: 40 }, (_, index) => manager.load(`asset-${index}.parent`, { type: "parent" })));
    expect(manager.cache.snapshot()).toMatchObject({ cachedEntries: 80, inFlightEntries: 0, totalEntries: 80 });

    for (const handle of handles) {
      await manager.release(handle);
    }

    expect(manager.cache.snapshot()).toMatchObject({ cachedEntries: 0, inFlightEntries: 0, totalEntries: 0 });
    expect(disposed).toHaveLength(80);
    expect(disposed).toContain("asset-0.parent");
    expect(disposed).toContain("asset-0.leaf");
  });

  it("rejects aborted scale loads without caching partial work", async () => {
    const controller = new AbortController();
    let loads = 0;
    const loader: AssetLoader<string> = {
      type: "mock",
      canLoad: () => true,
      async load(request, context) {
        loads += 1;
        controller.abort("cancel import");
        context.throwIfAborted(request.url);
        return "unreachable";
      }
    };
    const manager = new AssetManager();
    manager.register(loader);

    await expect(manager.load("cancel.mesh", { type: "mock", signal: controller.signal })).rejects.toMatchObject({
      message: "Asset load aborted",
      url: "cancel.mesh"
    });

    expect(loads).toBe(1);
    expect(manager.cache.snapshot()).toMatchObject({ cachedEntries: 0, inFlightEntries: 0, totalEntries: 0 });
  });
});

describe("raw AssetCache effective-context keys", () => {
  const makeHandle = (handleUrl: string) => new AssetHandle({ id: "raw", url: handleUrl, type: "mock", value: {} });
  const url = "https://assets.example.test/private/model.glb";

  it("rejects caller-chosen keys without echoing them", () => {
    const cache = new AssetCache();
    const raw = `${url}?token=secret-signature`;
    const handle = makeHandle(raw);
    let thrown: unknown;
    try { cache.set(raw, handle); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(AssetCacheKeyError);
    expect((thrown as AssetCacheKeyError).code).toBe("ASSET_CACHE_KEY_UNISSUED");
    expect(String((thrown as Error).message)).not.toContain("secret-signature");
    expect(() => cache.get(raw)).toThrow(AssetCacheKeyError);
    expect(() => cache.setInFlight(raw, Promise.resolve(handle))).toThrow(AssetCacheKeyError);
    expect(cache.has(raw)).toBe(false);
    expect(cache.snapshot().totalEntries).toBe(0);
  });

  it("partitions one URL by effective request context and shares only an identical reusable context", async () => {
    const cache = new AssetCache();
    const tokenA = await cache.keyFor(url, { credentials: "omit", headers: { authorization: "Bearer token-a" } });
    const tokenAAgain = await cache.keyFor(url, { credentials: "omit", headers: { authorization: "Bearer token-a" } });
    const tokenB = await cache.keyFor(url, { credentials: "omit", headers: { authorization: "Bearer token-b" } });
    const generation2 = await cache.keyFor(url, { credentials: "include", securityContext: "generation-2" });
    const ambientOne = await cache.keyFor(url, { credentials: "include" });
    const ambientTwo = await cache.keyFor(url, { credentials: "include" });
    expect(tokenAAgain).toBe(tokenA);
    expect(new Set([tokenA, tokenB, generation2, ambientOne, ambientTwo]).size).toBe(5);
    for (const key of [tokenA, tokenB, generation2, ambientOne]) expect(key).not.toMatch(/token-|generation-2|example\.test/);

    const handle = makeHandle(url);
    cache.set(tokenA, handle);
    expect(cache.get(tokenAAgain)).toBe(handle);
    expect(cache.get(tokenB)).toBeUndefined();
    expect(cache.get(generation2)).toBeUndefined();
    expect(JSON.stringify(cache.snapshot())).not.toMatch(/token-|Bearer/);
  });

  it("forgets unshared keys once their entry is gone so they cannot be replayed", async () => {
    const cache = new AssetCache();
    const ambient = await cache.keyFor(url, { credentials: "include" });
    cache.set(ambient, makeHandle(url));
    expect(cache.delete(ambient)).toBe(true);
    expect(() => cache.set(ambient, makeHandle(url))).toThrow(AssetCacheKeyError);
  });
});
