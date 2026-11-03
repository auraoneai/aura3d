import { describe, expect, it, vi } from "vitest";
import { AssetManager } from "../../packages/assets/src/AssetManager";
import { AssetDependencyGraph } from "../../packages/assets/src/AssetDependencyGraph";
import type { AssetLoader } from "../../packages/assets/src/AssetLoader";
import { ImageLoader } from "../../packages/assets/src/ImageLoader";
import { TextureLoader } from "../../packages/assets/src/TextureLoader";
import { ShaderLoader } from "../../packages/assets/src/ShaderLoader";
import { MaterialLoader } from "../../packages/assets/src/MaterialLoader";
import { TextureLoaderThreeCompat } from "../../packages/assets/src/loaders/TextureLoader";
import { ImportPipeline } from "../../packages/assets/src/ImportPipeline";
import { LoadContext } from "../../packages/assets/src/LoadContext";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("asset dependency graph and ownership", () => {
  it("resolves nested dependencies relative to their containing files and balances duplicate and shared acquisitions", async () => {
    const disposed: string[] = [];
    const calls: string[] = [];
    const manager = new AssetManager({ baseUrl: "https://assets.example.test/root/", credentials: "omit" });
    const loader: AssetLoader<string> = {
      type: "test",
      canLoad: () => true,
      dependencies(request) {
        if (request.url.endsWith("/models/a.scene")) return ["../images/shared.png", "../images/./shared.png"];
        if (request.url.endsWith("/models/b.scene")) return ["../images/shared.png"];
        return [];
      },
      load(request) { calls.push(request.url); return request.url; },
      dispose(value) { disposed.push(value); }
    };
    manager.register(loader);
    const [a, b] = await Promise.all([
      manager.load("models/a.scene"), manager.load("models/b.scene")
    ]);
    expect(calls.filter((url) => url.endsWith("/images/shared.png"))).toEqual([
      "https://assets.example.test/root/images/shared.png"
    ]);
    const [sharedId] = manager.dependencies.dependenciesOf(a.id);
    expect(manager.dependencies.dependencyCount(a.id, sharedId!)).toBe(2);
    expect(manager.dependencies.dependentsOf(sharedId!)).toHaveLength(2);
    await a.release();
    expect(disposed).not.toContain("https://assets.example.test/root/images/shared.png");
    await manager.release(b);
    expect(disposed.filter((url) => url.endsWith("/images/shared.png"))).toHaveLength(1);
    expect(manager.cache.snapshot()).toMatchObject({ cachedEntries: 0, inFlightEntries: 0 });
  });

  it("owns dependencies requested during load, including same-URL differently typed adapters", async () => {
    const disposed: string[] = [];
    const manager = new AssetManager();
    manager.register({
      type: "image", canLoad: () => false,
      load: (request) => request.url,
      dispose: (value) => { disposed.push(`image:${value}`); }
    });
    manager.register({
      type: "texture", canLoad: () => true,
      async load(request, context) {
        const image = await context.loadDependency<string>(request.url, "image");
        return image.value;
      },
      dispose: (value) => { disposed.push(`texture:${value}`); }
    });
    const handle = await manager.load("/a.png", { type: "texture" });
    expect(handle.value).toBe("/a.png");
    await handle.release();
    expect(disposed).toEqual(["texture:/a.png", "image:/a.png"]);
    expect(manager.cache.snapshot().totalEntries).toBe(0);
  });

  it("allows the same URL as a dependency when its effective request identity differs", async () => {
    const disposed: string[] = [];
    const manager = new AssetManager();
    manager.register({
      type: "test", canLoad: () => true,
      async load(request, context) {
        const role = new Headers(request.headers).get("x-resource-role");
        if (role === "document") {
          const dependency = await context.loadDependency<string>(request.url, "test", {
            headers: { "x-resource-role": "image" }
          });
          return `document:${dependency.value}`;
        }
        return "image";
      },
      dispose: (value) => { disposed.push(value as string); }
    });
    const document = await manager.load<string>("https://assets.example.test/content", {
      headers: { "x-resource-role": "document" }
    });
    expect(document.value).toBe("document:image");
    await document.release();
    expect(disposed).toEqual(["document:image", "image"]);
    expect(manager.cache.snapshot().totalEntries).toBe(0);
  });

  it("does not apply a relative manager base twice to nested paths", async () => {
    const calls: string[] = [];
    const manager = new AssetManager({ baseUrl: "assets/" });
    manager.register({
      type: "test", canLoad: () => true,
      dependencies(request) { return request.url === "assets/models/scene.gltf" ? ["../image.png"] : []; },
      load(request, context) { calls.push(context.resolve(request.url)); return request.url; }
    });
    const scene = await manager.load("models/scene.gltf");
    expect(calls).toEqual(["assets/image.png", "assets/models/scene.gltf"]);
    await scene.release();
  });

  it("rejects normalized cycles before awaiting and leaves no cached dependencies", async () => {
    const manager = new AssetManager({ baseUrl: "https://assets.example.test/base/" });
    manager.register({
      type: "test", canLoad: () => true,
      dependencies(request) {
        if (request.url.endsWith("/a.model")) return ["dir/b.model"];
        if (request.url.endsWith("/dir/b.model")) return [".././a.model"];
        return [];
      },
      load: (request) => request.url
    });
    await expect(manager.load("a.model")).rejects.toThrow(/cycle/i);
    expect(manager.cache.snapshot().totalEntries).toBe(0);
  });

  it("bounds an acyclic but unending dependency chain without retrying it", async () => {
    const manager = new AssetManager({ maxDependencyDepth: 3, retries: 2 });
    const visited: string[] = [];
    manager.register({
      type: "test", canLoad: () => true,
      dependencies(request) {
        visited.push(request.url);
        return [`asset-${Number(request.url.slice("asset-".length)) + 1}`];
      },
      load: (request) => request.url
    });
    await expect(manager.load("asset-0")).rejects.toThrow(/dependency depth exceeds 3/);
    expect(visited).toEqual(["asset-0", "asset-1", "asset-2", "asset-3"]);
    expect(manager.cache.snapshot().totalEntries).toBe(0);
    expect(() => new AssetManager({ maxDependencyDepth: Infinity })).toThrow(/maxDependencyDepth/);
  });

  it("rejects non-finite retry configuration instead of retrying forever", async () => {
    expect(() => new AssetManager({ retries: Number.NaN })).toThrow(/retries/);
    expect(() => new AssetManager({ retryDelayMs: Infinity })).toThrow(/retryDelayMs/);
    const manager = new AssetManager();
    await expect(manager.load("asset", { retries: Infinity })).rejects.toThrow(/retries/);
  });

  it("normalizes absolute URL aliases for cycle detection and cache reuse", async () => {
    const manager = new AssetManager({ credentials: "omit" });
    let count = 0;
    manager.register({
      type: "test", canLoad: () => true,
      dependencies(request) {
        return request.url.endsWith("/cycle") ? ["https://assets.example.test/dir/../cycle"] : [];
      },
      load(request) { count++; return request.url; }
    });
    await expect(manager.load("https://assets.example.test/cycle")).rejects.toThrow(/cycle/i);
    const [one, two] = await Promise.all([
      manager.load("https://assets.example.test/dir/../shared"),
      manager.load("https://assets.example.test/shared")
    ]);
    expect(one).toBe(two);
    expect(count).toBe(1);
    await one.release();
    await two.release();
    expect(manager.cache.snapshot().totalEntries).toBe(0);
  });

  it("rejects cycles across independently started in-flight roots", async () => {
    const aStarted = deferred<void>();
    const bStarted = deferred<void>();
    const manager = new AssetManager({ credentials: "omit" });
    manager.register({
      type: "test", canLoad: () => true,
      async dependencies(request) {
        if (request.url === "a.model") {
          aStarted.resolve();
          await bStarted.promise;
          return ["b.model"];
        }
        bStarted.resolve();
        await aStarted.promise;
        return ["a.model"];
      },
      load: (request) => request.url
    });
    const results = await Promise.allSettled([manager.load("a.model"), manager.load("b.model")]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(results.map((result) => result.status === "rejected" && String(result.reason))).toEqual([
      expect.stringMatching(/cycle/i), expect.stringMatching(/cycle/i)
    ]);
    expect(manager.cache.snapshot().totalEntries).toBe(0);
  });

  it("still detects a dependency cycle when secure cache hashing is unavailable", async () => {
    vi.stubGlobal("crypto", undefined);
    try {
      const manager = new AssetManager();
      manager.register({
        type: "test", canLoad: () => true,
        dependencies(request) { return [request.url === "a" ? "b" : "a"]; },
        load: (request) => request.url
      });
      await expect(manager.load("a")).rejects.toThrow(/cycle/i);
      expect(manager.cache.snapshot().totalEntries).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("retains each caller separately when the first subscriber aborts", async () => {
    const start = deferred<void>();
    const finish = deferred<void>();
    const cancelled = new AbortController();
    let calls = 0;
    let disposed = 0;
    let sharedSignal: AbortSignal | undefined;
    const manager = new AssetManager({ credentials: "omit" });
    manager.register({
      type: "test", canLoad: () => true,
      async load(request) {
        calls++;
        sharedSignal = request.signal;
        start.resolve();
        await finish.promise;
        return "payload";
      },
      dispose() { disposed++; }
    });
    const first = manager.load("model", { signal: cancelled.signal });
    await start.promise;
    const second = manager.load<string>("model");
    // Ensure second subscriber has joined the in-flight request.
    await new Promise((resolve) => setTimeout(resolve, 0));
    cancelled.abort("first caller left");
    await expect(first).rejects.toThrow("Asset load aborted");
    expect(sharedSignal?.aborted).toBe(false);
    finish.resolve();
    const handle = await second;
    expect(handle.value).toBe("payload");
    expect(handle.refCount).toBe(1);
    expect(calls).toBe(1);
    await handle.release();
    expect(disposed).toBe(1);
    expect(manager.cache.snapshot().totalEntries).toBe(0);
  });

  it("cancels promptly while the secure request identity is still being computed", async () => {
    const hashing = deferred<ArrayBuffer>();
    const started = deferred<void>();
    const controller = new AbortController();
    const load = vi.fn();
    vi.stubGlobal("crypto", { subtle: { digest: () => { started.resolve(); return hashing.promise; } } });
    try {
      const manager = new AssetManager();
      manager.register({ type: "test", canLoad: () => true, load });
      const loading = manager.load("asset", { signal: controller.signal });
      const result = expect(loading).rejects.toThrow(/aborted/i);
      await started.promise;
      controller.abort();
      await result;
      expect(load).not.toHaveBeenCalled();
      hashing.resolve(new ArrayBuffer(32));
      await Promise.resolve();
      expect(manager.cache.snapshot().totalEntries).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });

  it("disposes late results after every subscriber cancels, and allows a fresh generation", async () => {
    const start = deferred<void>();
    const finish = deferred<void>();
    const disposed = deferred<string>();
    const cancelled = new AbortController();
    let calls = 0;
    const manager = new AssetManager({ credentials: "omit" });
    manager.register({
      type: "test", canLoad: () => true,
      async load() {
        calls++;
        if (calls === 1) { start.resolve(); await finish.promise; return "stale"; }
        return "fresh";
      },
      dispose(value) { if (value === "stale") disposed.resolve(value as string); }
    });
    const first = manager.load("model", { signal: cancelled.signal });
    await start.promise;
    cancelled.abort();
    await expect(first).rejects.toThrow("Asset load aborted");
    const current = await manager.load<string>("model");
    expect(current.value).toBe("fresh");
    finish.resolve();
    await disposed.promise;
    expect(manager.cache.snapshot()).toMatchObject({ cachedEntries: 1, inFlightEntries: 0 });
    await current.release();
    expect(manager.cache.snapshot().totalEntries).toBe(0);
  });

  it("isolates request contexts and digest identities while keeping cache keys opaque", async () => {
    const manager = new AssetManager({ securityContext: "generation-one" });
    const requests: string[] = [];
    manager.register({
      type: "test", canLoad: () => true,
      load(request) {
        requests.push(new Headers(request.headers).get("authorization") ?? "");
        return requests.length;
      }
    });
    const url = "https://assets.example.test/object?signature=private-signature";
    const options = { headers: { Authorization: "Bearer private-token" } };
    const [first, same, other, otherDigest] = await Promise.all([
      manager.load(url, options),
      manager.load(url, { headers: { authorization: "Bearer private-token" } }),
      manager.load(url, { headers: { authorization: "Bearer different-token" } }),
      manager.load(url, { ...options, integrity: { version: 1, digest: `sha256-${"a".repeat(64)}` } })
    ]);
    expect(first).toBe(same);
    expect(first).not.toBe(other);
    expect(first).not.toBe(otherDigest);
    expect(requests).toHaveLength(3);
    expect(JSON.stringify(manager.cache.snapshot())).not.toMatch(/private-token|different-token|private-signature|generation-one/);
    await Promise.all([first.release(), same.release(), other.release(), otherDigest.release()]);
    expect(manager.cache.snapshot().totalEntries).toBe(0);
  });

  it("redacts signed URLs and credentials from load failures", async () => {
    const manager = new AssetManager();
    const url = "https://user:pass@assets.example.test/no-loader?signature=secret#fragment";
    let error: unknown;
    try { await manager.load(url); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toMatch(/user|pass|signature|secret|fragment/);
    expect(JSON.stringify(error)).not.toMatch(/user|pass|signature|secret|fragment/);
  });

  it("does not share a cache entry between distinct explicit formats", async () => {
    const manager = new AssetManager({ credentials: "omit" });
    manager.register({
      type: "test", canLoad: () => true,
      load(request) { return request.format; }
    });
    const [glb, gltf] = await Promise.all([
      manager.load<string>("https://assets.example.test/model", { format: "glb" }),
      manager.load<string>("https://assets.example.test/model", { format: "gltf" })
    ]);
    expect(glb.value).toBe("glb");
    expect(gltf.value).toBe("gltf");
    expect(glb).not.toBe(gltf);
    await glb.release();
    await gltf.release();
  });

  it("does not reuse a removed loader's cached value for its replacement", async () => {
    const firstDispose = vi.fn();
    const nextDispose = vi.fn();
    const manager = new AssetManager({ credentials: "omit" });
    manager.register({ type: "test", canLoad: () => true, load: () => "first", dispose: firstDispose });
    const first = await manager.load<string>("asset");
    expect(manager.registry.unregister("test")).toBe(true);
    manager.register({ type: "test", canLoad: () => true, load: () => "second", dispose: nextDispose });
    const next = await manager.load<string>("asset");
    expect(next).not.toBe(first);
    expect(first.value).toBe("first");
    expect(next.value).toBe("second");
    await first.release();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(nextDispose).not.toHaveBeenCalled();
    const shared = await manager.load<string>("asset");
    expect(shared).toBe(next);
    await next.release();
    await shared.release();
    expect(nextDispose).toHaveBeenCalledOnce();
    expect(manager.cache.snapshot().totalEntries).toBe(0);
  });

  it("recognizes image, material and shader URLs with fragments", () => {
    expect(new ImageLoader().canLoad({ url: "image.gif#frame" })).toBe(true);
    expect(new TextureLoader().canLoad({ url: "image.gif#frame", type: "texture" })).toBe(true);
    expect(new MaterialLoader().canLoad({ url: "a.material.json#material" })).toBe(true);
    expect(new ShaderLoader().canLoad({ url: "shader.wgsl#main" })).toBe(true);
  });

  it("does not let a cleared in-flight generation overwrite a newer result", async () => {
    const started = deferred<void>();
    const finish = deferred<void>();
    const manager = new AssetManager({ credentials: "omit" });
    let calls = 0;
    manager.register({
      type: "test", canLoad: () => true,
      async load() {
        if (++calls === 1) { started.resolve(); await finish.promise; return "old"; }
        return "new";
      }
    });
    const old = manager.load<string>("model");
    await started.promise;
    manager.cache.clear();
    const current = await manager.load<string>("model");
    finish.resolve();
    const stale = await old;
    const again = await manager.load<string>("model");
    expect(stale.value).toBe("old");
    expect(current.value).toBe("new");
    expect(again).toBe(current);
    await stale.release();
    expect(current.disposed).toBe(false);
    await current.release();
    await again.release();
    expect(manager.cache.snapshot().totalEntries).toBe(0);
  });

  it("releases dependencies between retry attempts", async () => {
    const events: string[] = [];
    let attempts = 0;
    const manager = new AssetManager({ retries: 1 });
    manager.register({
      type: "test", canLoad: () => true,
      dependencies: (request) => request.url === "parent" ? ["child"] : [],
      load(request) {
        events.push(`load:${request.url}`);
        if (request.url === "parent" && ++attempts === 1) throw new Error("temporary");
        return request.url;
      },
      dispose(value) { events.push(`dispose:${value}`); }
    });
    const handle = await manager.load("parent");
    expect(events).toEqual(["load:child", "load:parent", "dispose:child", "load:child", "load:parent"]);
    await handle.release();
    expect(events.slice(-2)).toEqual(["dispose:parent", "dispose:child"]);
    expect(manager.cache.snapshot().totalEntries).toBe(0);
  });

  it("enforces request and digest policy through the real image-backed texture and releases the bitmap", async () => {
    const bytes = new Uint8Array([1, 7, 3, 9]);
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((value) => value.toString(16).padStart(2, "0")).join("");
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(bytes, { headers: { "content-type": "image/png" } }));
    const close = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 2, height: 2, close })));
    try {
      const manager = new AssetManager();
      manager.register(new ImageLoader());
      manager.register(new TextureLoader());
      const texture = await manager.load<{ source: unknown }>("https://assets.example.test/image.png", {
        type: "texture", credentials: "include", headers: { authorization: "Bearer secret" },
        integrity: { version: 1, digest: `sha256-${digest}` },
        allowedOrigins: ["https://assets.example.test"]
      });
      expect(texture.value.source).toMatchObject({ width: 2, height: 2 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "include", headers: { authorization: "Bearer secret" }, redirect: "error" });
      expect(close).not.toHaveBeenCalled();
      await texture.release();
      expect(close).toHaveBeenCalledOnce();
      expect(manager.cache.snapshot().totalEntries).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });

  it("releases image dependencies acquired by a directly invoked texture loader", async () => {
    const close = vi.fn();
    const bytes = new Uint8Array([1]);
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((value) => value.toString(16).padStart(2, "0")).join("");
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(bytes));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close })));
    try {
      const manager = new AssetManager();
      manager.register(new ImageLoader());
      const loader = new TextureLoader();
      const texture = await loader.load({
        url: "https://assets.example.test/image.png", type: "texture", credentials: "include",
        headers: { "x-texture-token": "secret" }, integrity: { version: 1, digest }
      }, new LoadContext({ manager }));
      expect(texture.source).toMatchObject({ width: 1, height: 1 });
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "include", headers: { "x-texture-token": "secret" } });
      expect(close).not.toHaveBeenCalled();
      await loader.dispose(texture);
      await loader.dispose(texture);
      expect(close).toHaveBeenCalledOnce();
      expect(manager.cache.snapshot().totalEntries).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });

  it("propagates a direct texture request's cancellation to image decoding", async () => {
    const decoding = deferred<void>();
    const bitmap = deferred<{ width: number; height: number; close: () => void }>();
    const close = vi.fn();
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    vi.stubGlobal("createImageBitmap", vi.fn(() => { decoding.resolve(); return bitmap.promise; }));
    try {
      const manager = new AssetManager();
      manager.register(new ImageLoader());
      const loader = new TextureLoader();
      const loading = loader.load({ url: "https://assets.example.test/image.png", type: "texture", signal: controller.signal }, new LoadContext({ manager }));
      const result = expect(loading).rejects.toThrow(/aborted/i);
      await decoding.promise;
      controller.abort();
      await result;
      bitmap.resolve({ width: 1, height: 1, close });
      await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
      expect(manager.cache.snapshot().totalEntries).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });

  it("closes a bitmap when its last subscriber cancels during decode", async () => {
    const decoding = deferred<void>();
    const bitmap = deferred<{ width: number; height: number; close: () => void }>();
    const closed = deferred<void>();
    const cancelled = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } })));
    vi.stubGlobal("createImageBitmap", vi.fn(() => { decoding.resolve(); return bitmap.promise; }));
    try {
      const manager = new AssetManager();
      manager.register(new ImageLoader());
      const pending = manager.load("image.png", { signal: cancelled.signal });
      await decoding.promise;
      cancelled.abort();
      await expect(pending).rejects.toThrow("Asset load aborted");
      bitmap.resolve({ width: 1, height: 1, close: () => closed.resolve() });
      await closed.promise;
      expect(manager.cache.snapshot().totalEntries).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });

  it("rejects direct image decoding promptly on cancellation and closes its late bitmap", async () => {
    const decoding = deferred<void>();
    const bitmap = deferred<{ width: number; height: number; close: () => void }>();
    const close = vi.fn();
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    vi.stubGlobal("createImageBitmap", vi.fn(() => { decoding.resolve(); return bitmap.promise; }));
    try {
      const loader = new ImageLoader();
      const loading = loader.load({ url: "https://assets.example.test/image.png", signal: controller.signal }, new LoadContext({ signal: controller.signal }));
      const result = expect(loading).rejects.toThrow(/aborted/i);
      await decoding.promise;
      controller.abort();
      await result;
      expect(close).not.toHaveBeenCalled();
      bitmap.resolve({ width: 1, height: 1, close });
      await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    } finally { vi.unstubAllGlobals(); }
  });

  it("never decodes tampered image bytes", async () => {
    const decode = vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([9]), { headers: { "content-type": "image/png" } })));
    vi.stubGlobal("createImageBitmap", decode);
    try {
      const manager = new AssetManager();
      manager.register(new ImageLoader());
      await expect(manager.load("image.png", { integrity: { version: 1, digest: "0".repeat(64) } })).rejects.toThrow();
      expect(decode).not.toHaveBeenCalled();
      expect(manager.cache.snapshot().totalEntries).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });

  it("returns individually releasable compatible textures and disposes remaining acquisitions", async () => {
    const close = vi.fn();
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(new Uint8Array([7]), { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close })));
    try {
      const manager = new AssetManager();
      manager.register(new ImageLoader());
      manager.register(new TextureLoader());
      const loader = new TextureLoaderThreeCompat(manager);
      const options = { headers: { "x-asset-test": "policy" }, credentials: "same-origin" as const, securityContext: "generation-one" };
      const [first, second] = await Promise.all([loader.loadAsync("same.png", undefined, options), loader.loadAsync("same.png", undefined, options)]);
      expect(first.source).toBe(second.source);
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: { "x-asset-test": "policy" }, credentials: "same-origin" });
      expect(first.released).toBe(false);
      await first.release();
      await first.release();
      expect(first.released).toBe(true);
      expect(close).not.toHaveBeenCalled();
      await loader.dispose();
      await loader.dispose();
      expect(second.released).toBe(true);
      expect(close).toHaveBeenCalledOnce();
      expect(manager.cache.snapshot().totalEntries).toBe(0);
      await expect(loader.loadAsync("same.png")).rejects.toThrow(/disposed/);
    } finally { vi.unstubAllGlobals(); }
  });

  it("loads a real owned texture for a bare compatible loader call", async () => {
    const close = vi.fn();
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([7]), { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3, height: 2, close })));
    try {
      const loader = new TextureLoaderThreeCompat();
      const texture = await loader.load("https://assets.example.test/real.png");
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(texture).toMatchObject({ width: 3, height: 2, released: false });
      expect(close).not.toHaveBeenCalled();
      await texture.release();
      expect(close).toHaveBeenCalledOnce();
      await loader.dispose();
    } finally { vi.unstubAllGlobals(); }
  });

  it("aborts a compatible texture decode when its loader is disposed", async () => {
    const decoding = deferred<void>();
    const bitmap = deferred<{ width: number; height: number; close: () => void }>();
    const closed = deferred<void>();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } })));
    vi.stubGlobal("createImageBitmap", vi.fn(() => { decoding.resolve(); return bitmap.promise; }));
    try {
      const manager = new AssetManager();
      manager.register(new ImageLoader());
      manager.register(new TextureLoader());
      const loader = new TextureLoaderThreeCompat(manager);
      const loading = loader.loadAsync("same.png");
      await decoding.promise;
      const disposal = loader.dispose();
      await expect(loading).rejects.toThrow(/abort/i);
      await disposal;
      bitmap.resolve({ width: 1, height: 1, close: () => closed.resolve() });
      await closed.promise;
      expect(manager.cache.snapshot().totalEntries).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });

  it("uses verified bytes for the HTML image fallback and revokes its object URL on abort", async () => {
    let image: FakeImage | undefined;
    class FakeImage {
      width = 2;
      height = 2;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      removeAttribute(name: string) { if (name === "src") this.src = ""; }
      constructor() { image = this; }
    }
    const makeUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:verified");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const fetched = deferred<void>();
    vi.stubGlobal("fetch", vi.fn(async () => { fetched.resolve(); return new Response(new Uint8Array([2]), { headers: { "content-type": "image/png" } }); }));
    vi.stubGlobal("createImageBitmap", undefined);
    vi.stubGlobal("Image", FakeImage);
    const abort = new AbortController();
    try {
      const manager = new AssetManager();
      manager.register(new ImageLoader());
      const pending = manager.load("https://assets.example.test/image.png", { signal: abort.signal });
      await fetched.promise;
      while (!image?.src) await new Promise((resolve) => setTimeout(resolve, 0));
      expect(image.src).toBe("blob:verified");
      abort.abort();
      await expect(pending).rejects.toThrow("Asset load aborted");
      await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:verified"));
      expect(image.src).toBe("");
      expect(makeUrl).toHaveBeenCalledOnce();
    } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
  });

  it("verifies shader and material bytes before parsing and does not retry an integrity failure", async () => {
    const body = new TextEncoder().encode(JSON.stringify({ model: "unlit", properties: {} }));
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", body))]
      .map((value) => value.toString(16).padStart(2, "0")).join("");
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(body, { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const manager = new AssetManager({ retries: 2 });
      manager.register(new ShaderLoader());
      manager.register(new MaterialLoader());
      const material = await manager.load("https://assets.example.test/a.material.json", {
        headers: { "x-test": "material" }, integrity: { version: 1, digest }
      });
      const shader = await manager.load<{ source: string }>("https://assets.example.test/a.wgsl", {
        headers: { "x-test": "shader" }, integrity: { version: 1, digest }
      });
      expect(shader.value.source).toContain('"unlit"');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: { "x-test": "material" } });
      await expect(manager.load("https://assets.example.test/b.wgsl", {
        integrity: { version: 1, digest: "0".repeat(64) }
      })).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      await material.release();
      await shader.release();
      expect(manager.cache.snapshot().totalEntries).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });

  it("releases every dependency after a parent disposer fails and rejects repeated release", async () => {
    const disposed: string[] = [];
    const manager = new AssetManager();
    manager.register({
      type: "test", canLoad: () => true,
      dependencies: (request) => request.url === "parent" ? ["child"] : [],
      load: (request) => request.url,
      dispose(value) { disposed.push(value as string); if (value === "parent") throw new Error("dispose failure"); }
    });
    const parent = await manager.load("parent");
    await expect(parent.release()).rejects.toThrow("Failed to dispose asset");
    expect(disposed).toEqual(["parent", "child"]);
    expect(manager.cache.snapshot().totalEntries).toBe(0);
    await expect(parent.release()).rejects.toThrow(/disposed/);
  });

  it("tracks and balances duplicate graph edges independently", () => {
    const graph = new AssetDependencyGraph();
    graph.addDependency("a", "b");
    graph.addDependency("a", "b");
    expect(graph.dependenciesOf("a")).toEqual(["b"]);
    expect(graph.dependencyCount("a", "b")).toBe(2);
    expect(graph.removeDependency("a", "b")).toBe(true);
    expect(graph.dependencyCount("a", "b")).toBe(1);
    expect(() => graph.addDependency("b", "a")).toThrow(/cycle/);
    graph.removeDependency("a", "b");
    expect(graph.dependentsOf("b")).toEqual([]);
  });
});

describe("import pipeline ownership", () => {
  it("rejects cancellation promptly and acknowledges late outputs only after reverse-order rollback", async () => {
    const started = deferred<void>();
    const finish = deferred<string>();
    const controller = new AbortController();
    const events: string[] = [];
    const pipeline = new ImportPipeline()
      .addStage<string, string>({
        name: "first", run: () => "first-output",
        rollback: (output, context) => {
          expect(context.signal?.aborted).not.toBe(true);
          events.push(`rollback:${output}`);
        }
      })
      .addStage<string, string>({
        name: "second", run: () => { started.resolve(); return finish.promise; },
        rollback: (output, context) => {
          expect(context.signal?.aborted).not.toBe(true);
          events.push(`rollback:${output}`);
        }
      });
    const run = pipeline.start<string, string>("input", { url: "asset", signal: controller.signal });
    const aborted = expect(run.result).rejects.toMatchObject({ stageName: "second", cause: "cancel" });
    await started.promise;
    controller.abort("cancel");
    await aborted;
    let acknowledged = false;
    void run.settled.then(() => { acknowledged = true; });
    await Promise.resolve();
    expect(acknowledged).toBe(false);
    expect(events).toEqual([]);
    finish.resolve("late-output");
    await run.settled;
    expect(events).toEqual(["rollback:late-output", "rollback:first-output"]);
  });

  it("continues rollback after a failure and exposes cleanup failure to the owner", async () => {
    const events: string[] = [];
    const pipeline = new ImportPipeline()
      .addStage<string, string>({ name: "first", run: () => "first", rollback: () => { events.push("first"); } })
      .addStage<string, string>({ name: "second", run: () => "second", rollback: () => { events.push("second"); throw new Error("cleanup failure"); } })
      .addStage<string, string>({ name: "invalid", run: () => { throw new Error("import failure"); } });
    const run = pipeline.start("input", { url: "asset" });
    const result = expect(run.result).rejects.toThrow(/cleanup failed/);
    const settled = expect(run.settled).rejects.toThrow(/cleanup failed/);
    await Promise.all([result, settled]);
    expect(events).toEqual(["second", "first"]);
  });

  it("waits for an asynchronous stage eligibility check before acknowledging cancellation", async () => {
    const eligibility = deferred<boolean>();
    const controller = new AbortController();
    const execute = vi.fn();
    const pipeline = new ImportPipeline().addStage({ name: "inspect", canRun: () => eligibility.promise, run: execute });
    const run = pipeline.start("input", { url: "asset", signal: controller.signal });
    const result = expect(run.result).rejects.toThrow(/aborted/);
    controller.abort();
    await result;
    let acknowledged = false;
    void run.settled.then(() => { acknowledged = true; });
    await Promise.resolve();
    expect(acknowledged).toBe(false);
    eligibility.resolve(true);
    await run.settled;
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps a running import's stage sequence stable when a stage is added", async () => {
    const finish = deferred<string>();
    const pipeline = new ImportPipeline().addStage<string, string>({ name: "first", run: () => finish.promise });
    const first = pipeline.run<string, string>("input", { url: "asset" });
    pipeline.addStage<string, string>({ name: "later", run: (value) => `${value}:later` });
    finish.resolve("initial");
    await expect(first).resolves.toBe("initial");
    await expect(pipeline.run<string, string>("input", { url: "asset" })).resolves.toBe("initial:later");
  });

  it("rolls back a final result if a progress observer cancels it", async () => {
    const controller = new AbortController();
    const rollback = vi.fn();
    const pipeline = new ImportPipeline().addStage({ name: "convert", run: () => "owned", rollback });
    const run = pipeline.start("input", {
      url: "asset", signal: controller.signal,
      onProgress: (event) => { if (event.status === "completed") controller.abort(); }
    });
    await expect(run.result).rejects.toThrow(/aborted/);
    await run.settled;
    expect(rollback).toHaveBeenCalledOnce();
    expect(rollback.mock.calls[0]?.[0]).toBe("owned");
  });
});
