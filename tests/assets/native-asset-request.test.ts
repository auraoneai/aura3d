import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { AssetLoadError, mergeAssetRequestOptions, requestIdentity } from "../../packages/assets/src/AssetLoader";
import { FileLoader } from "../../packages/assets/src/FileLoader";
import { LoadContext } from "../../packages/assets/src/LoadContext";
import { AssetIntegrityError, AssetPolicyError, AssetSizeError, fetchBytes } from "../../packages/assets/src/LoaderFetch";

const sha = (input: string) => createHash("sha256").update(input).digest("hex");
const bytes = (buffer: ArrayBuffer) => new TextDecoder().decode(buffer);

afterEach(() => vi.unstubAllGlobals());

describe("native asset request transport", () => {
  it("forwards FileLoader credentials, headers, cache and priority with progress and callbacks", async () => {
    const fetchMock = vi.fn(async () => new Response("payload", { headers: { "content-length": "7" } }));
    vi.stubGlobal("fetch", fetchMock);
    const loaded = vi.fn();
    const progress = vi.fn();
    const loader = new FileLoader<string>().setPath("https://example.test/assets/").setResponseType("text")
      .setWithCredentials(true).setRequestHeader({ Authorization: "Bearer abc", "X-Keep": "yes" })
      .setRequestOptions({ cache: "no-store", priority: "high", headers: { "X-Keep": "override" } });
    await expect(loader.load("file.txt", loaded, progress)).resolves.toBe("payload");
    expect(loaded).toHaveBeenCalledWith("payload");
    expect(progress).toHaveBeenLastCalledWith({ loaded: 7, total: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { priority: string }];
    expect(url).toBe("https://example.test/assets/file.txt");
    expect(init).toMatchObject({ credentials: "include", cache: "no-store", priority: "high", redirect: "error" });
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer abc");
    expect(new Headers(init.headers).get("x-keep")).toBe("override");
  });

  it("hashes effective request settings and full URLs without exposing secrets", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const securityContext = "generation-one";
    const a = await requestIdentity({ securityContext, headers: { Authorization: "secret", Accept: "*/*" }, credentials: "include" }, "https://x.test/a?token=private");
    const b = await requestIdentity({ securityContext, credentials: "include", headers: [["accept", "*/*"], ["authorization", "secret"]] }, "https://x.test/a?token=private");
    const c = await requestIdentity({ securityContext, headers: { Authorization: "different", Accept: "*/*" }, credentials: "include" }, "https://x.test/a?token=private");
    const d = await requestIdentity({ securityContext, headers: { Authorization: "secret", Accept: "*/*" }, credentials: "include" }, "https://x.test/a?token=other");
    expect(a).toBe(b);
    expect(new Set([a, c, d]).size).toBe(3);
    expect(a).not.toMatch(/secret|token|private|generation-one/);
    vi.stubGlobal("crypto", undefined);
    expect(await requestIdentity()).not.toBe(await requestIdentity());
  });

  it("verifies real bytes before returning and fails closed if hashing is unavailable", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("hello")));
    const integrity = { version: 1 as const, digest: `sha256-${sha("hello")}` };
    expect(bytes(await fetchBytes("https://example.test/a", undefined, undefined, { integrity }))).toBe("hello");
    await expect(fetchBytes("https://example.test/a", undefined, undefined, { integrity: { ...integrity, digest: sha("changed") } })).rejects.toBeInstanceOf(AssetIntegrityError);
    await expect(fetchBytes("https://example.test/a", undefined, undefined, { integrity: { ...integrity, digest: "bad" } })).rejects.toBeInstanceOf(AssetIntegrityError);
    vi.stubGlobal("crypto", undefined);
    await expect(fetchBytes("https://example.test/a", undefined, undefined, { integrity })).rejects.toThrow(/SHA-256 is unavailable/);
  });

  it("enforces allowed origins, redirect policy and exact final URL without exposing signed queries", async () => {
    const fetchMock = vi.fn(async () => {
      const response = new Response("ok");
      Object.defineProperty(response, "url", { value: "https://other.test/result" });
      Object.defineProperty(response, "redirected", { value: true });
      return response;
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchBytes("https://other.test/a?secret=value", undefined, undefined, { allowedOrigins: ["https://example.test"] })).rejects.toBeInstanceOf(AssetPolicyError);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(fetchBytes("https://example.test/a", undefined, undefined, { allowedOrigins: ["https://example.test"], redirect: "follow" })).rejects.toThrow(/redirect/);
    await expect(fetchBytes("https://example.test/a", undefined, undefined, { allowedOrigins: ["https://example.test"] })).rejects.toThrow(/origin is not allowed/);
    await expect(fetchBytes("https://example.test/a", undefined, undefined, { expectedUrl: "https://example.test/a" })).rejects.toThrow(/redirect target/);
    await expect(fetchBytes("https://other.test/a", undefined, undefined, {
      sourceOrigin: "https://example.test", headers: { Authorization: "secret" }
    })).rejects.toThrow(/explicit allowedOrigins/);
    const error = new AssetLoadError("Failed https://user:pass@example.test/a?token=secret", "https://user:pass@example.test/a?token=secret", ["https://example.test/b?key=private"], new Error("Authorization: Bearer secret"));
    expect(JSON.stringify({ message: error.message, url: error.url, chain: error.dependencyChain, cause: String(error.cause) })).not.toMatch(/user|pass|token|secret|private/);
  });

  it("bounds streamed response bytes and cancels over-limit reads", async () => {
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.enqueue(new Uint8Array([3, 4])); },
      cancel
    }))));
    await expect(fetchBytes("https://example.test/a", undefined, undefined, { maxBytes: 3 })).rejects.toBeInstanceOf(AssetSizeError);
    expect(cancel).toHaveBeenCalledTimes(1);
    await expect(fetchBytes("https://example.test/a", undefined, undefined, { maxBytes: -1 })).rejects.toThrow(/non-negative/);
  });

  it("independently cancels concurrent callers and allows a subsequent retry", async () => {
    let calls = 0;
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
      const call = ++calls;
      if (call === 3) { reject(new TypeError("temporary")); return; }
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      if (call !== 1) resolve(new Response("ok"));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const first = new AbortController();
    const pending = fetchBytes("https://example.test/a", first.signal);
    const second = fetchBytes("https://example.test/a", undefined);
    first.abort(new Error("cancel first"));
    await expect(pending).rejects.toThrow("cancel first");
    expect(bytes(await second)).toBe("ok");
    await expect(fetchBytes("https://example.test/a", undefined)).rejects.toThrow("temporary");
    expect(bytes(await fetchBytes("https://example.test/a", undefined))).toBe("ok");
  });

  it("cancels a stalled response body and discards a late fetch result", async () => {
    const streamCancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel: streamCancel }));
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const controller = new AbortController();
    const pending = fetchBytes("https://example.test/slow", controller.signal);
    await Promise.resolve();
    await Promise.resolve();
    controller.abort(new Error("stop stream"));
    await expect(pending).rejects.toThrow("stop stream");
    expect(streamCancel).toHaveBeenCalled();

    let fulfill!: (response: Response) => void;
    const fetchPending = new Promise<Response>((resolve) => { fulfill = resolve; });
    vi.stubGlobal("fetch", vi.fn(() => fetchPending));
    const lateCancel = vi.fn();
    const lateResponse = new Response(new ReadableStream({ cancel: lateCancel }));
    const lateController = new AbortController();
    const late = fetchBytes("https://example.test/late", lateController.signal);
    lateController.abort(new Error("stop request"));
    await expect(late).rejects.toThrow("stop request");
    fulfill(lateResponse);
    await Promise.resolve();
    await Promise.resolve();
    expect(lateCancel).toHaveBeenCalled();
  });

  it("resolves document-relative dependencies and selects their own digests", () => {
    const root = new LoadContext({ baseUrl: "https://example.test/root/" });
    const context = root.child("models/scene.gltf", undefined, {
      headers: { Authorization: "secret" },
      integrity: { version: 1, digest: sha("doc"), dependencies: { "../textures/albedo.png": sha("image") }, requireDependencies: true }
    });
    expect(context.resolve("../textures/./albedo.png")).toBe("https://example.test/root/textures/albedo.png");
    const options = context.requestOptionsFor("../textures/albedo.png");
    expect(options.sourceOrigin).toBe("https://example.test");
    expect(options.integrity?.digest).toBe(sha("image"));
    expect(() => context.requestOptionsFor("missing.bin")).toThrow(/Missing required dependency integrity/);
    expect(mergeAssetRequestOptions({ credentials: "include" }, { credentials: undefined }).credentials).toBe("include");
    expect(new LoadContext().resolve("https://example.test/a/../scene.gltf?x=1")).toBe("https://example.test/scene.gltf?x=1");
    const relative = new LoadContext({ baseUrl: "assets/" }).child("models/scene.gltf");
    expect(relative.resolve("assets/models/scene.gltf")).toBe("assets/models/scene.gltf");
    expect(relative.resolve("../image.png")).toBe("assets/image.png");
    expect(relative.resolve("%2e%2e/image.png")).toBe("assets/image.png");
    expect(relative.resolve("sub//image.png")).toBe("assets/models/sub//image.png");
    expect(relative.resolve("?revision=2")).toBe("assets/models/scene.gltf?revision=2");
    expect(context.resolve("#mesh")).toBe("https://example.test/root/models/scene.gltf#mesh");
  });
});
