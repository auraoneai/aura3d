import { describe, expect, it } from "vitest";
import { AssetLoadError, AssetManager, type AssetLoader } from "../../packages/assets/src";

describe("asset cache scale behavior", () => {
  it("deduplicates a burst of duplicate in-flight loads and exposes cache diagnostics", async () => {
    let loads = 0;
    let releaseLoad: (() => void) | undefined;
    const loader: AssetLoader<{ readonly url: string }> = {
      type: "mock",
      canLoad: () => true,
      async load(request) {
        loads += 1;
        await new Promise<void>((resolve) => {
          releaseLoad = resolve;
        });
        return { url: request.url };
      }
    };
    const manager = new AssetManager({ baseUrl: "https://assets.example.test/" });
    manager.register(loader);

    const pending = Array.from({ length: 64 }, () => manager.load("shared.mesh", { type: "mock" }));
    await Promise.resolve();

    expect(loads).toBe(1);
    expect(manager.cache.snapshot()).toMatchObject({
      cachedEntries: 0,
      inFlightEntries: 1,
      totalEntries: 1
    });
    expect(manager.cache.snapshot().keys).toEqual(["mock:https://assets.example.test/shared.mesh"]);

    releaseLoad?.();
    const handles = await Promise.all(pending);

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
  });

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
    const manager = new AssetManager();
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
