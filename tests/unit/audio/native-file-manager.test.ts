import { describe, expect, it } from "vitest";
import { AudioClip } from "../../../packages/audio/src/AudioClip";
import { AudioFileManager, type AudioDecodeContextLike, type AudioFileFetchOptions } from "../../../packages/audio/src/AudioFileManager";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const abc = new TextEncoder().encode("abc");
const abcHash = "sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const buffer = (length = 4, channels = 1) => ({ length, numberOfChannels: channels, duration: 1, sampleRate: 4 }) as AudioBuffer;
const response = (bytes = abc, url?: string) => ({ ok: true, status: 200, url, arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer });
const context = (decode: (bytes: ArrayBuffer) => Promise<AudioBuffer> | AudioBuffer = () => buffer()) => ({
  decodeAudioData: decode
}) as AudioDecodeContextLike;

describe("AudioFileManager request and ownership contracts", () => {
  it("allows each subscriber to abort without cancelling a shared fetch", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    let calls = 0;
    let networkSignal: AbortSignal | undefined;
    const manager = new AudioFileManager({ securityContext: "test-session", context: context(), fetch: async (_url, init) => {
      calls++;
      networkSignal = init?.signal;
      return pending.promise;
    } });
    const first = new AbortController();
    const second = new AbortController();
    const progress: number[] = [];
    const a = manager.load("/clip.wav", { signal: first.signal });
    const aRejected = expect(a).rejects.toMatchObject({ name: "AbortError" });
    const b = manager.load("/clip.wav", { signal: second.signal, onProgress: ({ loadedBytes }) => progress.push(loadedBytes) });
    expect(calls).toBe(1);
    first.abort();
    await aRejected;
    expect(networkSignal?.aborted).toBe(false);
    pending.resolve(response());
    const clip = await b;
    expect(progress).toEqual([3]);
    expect(await manager.load("/clip.wav")).toBe(clip);
    expect(manager.stats()).toMatchObject({ decodedBytes: 16, cachedEntries: 1, inFlight: 0 });
  });

  it("aborts the underlying work when the last subscriber leaves and permits retry", async () => {
    const firstResponse = deferred<ReturnType<typeof response>>();
    const signals: AbortSignal[] = [];
    let calls = 0;
    const manager = new AudioFileManager({ securityContext: "test-session", context: context(), fetch: async (_url, init) => {
      calls++;
      signals.push(init!.signal!);
      return calls === 1 ? firstResponse.promise : response();
    } });
    const aController = new AbortController();
    const bController = new AbortController();
    const a = manager.load("/x.wav", { signal: aController.signal });
    const b = manager.load("/x.wav", { signal: bController.signal });
    const rejected = Promise.all([expect(a).rejects.toMatchObject({ name: "AbortError" }), expect(b).rejects.toMatchObject({ name: "AbortError" })]);
    aController.abort();
    expect(signals[0].aborted).toBe(false);
    bController.abort();
    await rejected;
    expect(signals[0].aborted).toBe(true);
    expect(manager.stats().inFlight).toBe(0);
    const retry = await manager.load("/x.wav");
    firstResponse.resolve(response()); // A non-cooperative old fetch must not replace the retry.
    await Promise.resolve();
    expect(manager.getCached("/x.wav")).toBe(retry);
    expect(calls).toBe(2);
  });

  it("partitions actual request contexts and digests without exposing headers in cache keys", async () => {
    const seen: AudioFileFetchOptions[] = [];
    const sharedCache = new Map<string, AudioClip>();
    const manager = new AudioFileManager({ securityContext: "test-session", cache: sharedCache, context: context(), fetch: async (_url, init) => {
      seen.push(init!);
      return response(abc, "https://audio.example/line.wav");
    } });
    const request = { headers: { Authorization: "Bearer private-token" }, credentials: "include" as const, expectedHash: abcHash, sourceOrigin: "https://audio.example" };
    const first = await manager.load("https://audio.example/line.wav", request);
    expect(await manager.load("https://audio.example/line.wav", request)).toBe(first);
    const other = await manager.load("https://audio.example/line.wav", { ...request, headers: { Authorization: "Bearer other" } });
    expect(other).not.toBe(first);
    expect(seen).toHaveLength(2);
    expect(new Headers(seen[0].headers).get("authorization")).toBe("Bearer private-token");
    expect(seen[0].credentials).toBe("include");
    expect([...sharedCache.keys()].join(" ")).not.toContain("private-token");
    await expect(manager.load("https://audio.example/line.wav", { ...request, expectedHash: `sha256-${"0".repeat(64)}` })).rejects.toThrow(/SHA-256 mismatch/);
    expect(manager.getCached("https://audio.example/line.wav", request)).toBe(first);
    expect(manager.stats().cachedEntries).toBe(2);
  });

  it("partitions duplicate IDs and explicit cache keys by actual URL and isolates shared maps across managers", async () => {
    const cache = new Map<string, AudioClip>();
    let fetches = 0;
    const fetch = async () => { fetches++; return response(); };
    const firstManager = new AudioFileManager({ securityContext: "test-session", context: context(), fetch, cache });
    const secondManager = new AudioFileManager({ securityContext: "test-session", context: context(), fetch, cache });
    const a = await firstManager.load({ id: "same", type: "audio", url: "/a.wav" }, { cacheKey: "same" });
    const b = await firstManager.load({ id: "same", type: "audio", url: "/b.wav" }, { cacheKey: "same" });
    const c = await secondManager.load({ id: "same", type: "audio", url: "/a.wav" }, { cacheKey: "same" });
    expect(new Set([a, b, c]).size).toBe(3);
    expect(fetches).toBe(3);
    firstManager.clear();
    expect(secondManager.getCached({ id: "same", type: "audio", url: "/a.wav" }, { cacheKey: "same" })).toBe(c);
  });

  it("clear during fetch invalidates its generation and cannot erase or replace a later request", async () => {
    const oldResponse = deferred<ReturnType<typeof response>>();
    let calls = 0;
    const manager = new AudioFileManager({ securityContext: "test-session", context: context(), fetch: async () => ++calls === 1 ? oldResponse.promise : response() });
    const old = manager.load("/generation.wav");
    const oldRejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
    manager.clear("/generation.wav");
    const current = await manager.load("/generation.wav");
    oldResponse.resolve(response());
    await oldRejected;
    await Promise.resolve();
    expect(manager.getCached("/generation.wav")).toBe(current);
    expect(manager.stats().cachedEntries).toBe(1);
  });

  it("clear and dispose during decode reject promptly and never publish late results", async () => {
    const decodes = [deferred<AudioBuffer>(), deferred<AudioBuffer>()];
    let calls = 0;
    const manager = new AudioFileManager({ securityContext: "test-session", context: context(() => decodes[calls++].promise), fetch: async () => response() });
    const first = manager.load("/one.wav");
    const firstRejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    while (calls < 1) await Promise.resolve();
    manager.clear("/one.wav");
    await firstRejected;
    decodes[0].resolve(buffer());
    const second = manager.load("/two.wav");
    const secondRejected = expect(second).rejects.toMatchObject({ name: "AbortError" });
    while (calls < 2) await Promise.resolve();
    manager.dispose();
    manager.dispose();
    await secondRejected;
    decodes[1].resolve(buffer());
    await Promise.resolve();
    expect(manager.stats()).toMatchObject({ decodedBytes: 0, cachedEntries: 0, inFlight: 0 });
    await expect(manager.load("/new.wav")).rejects.toThrow(/disposed/);
  });

  it("keeps decoded residency within budget and releases the last leased cache reference", async () => {
    let fetches = 0;
    const manager = new AudioFileManager({ securityContext: "test-session", context: context(), maxDecodedBytes: 16, fetch: async () => { fetches++; return response(); } });
    const [a, b] = await Promise.all([manager.acquire("/leased.wav"), manager.acquire("/leased.wav")]);
    expect(a.clip).toBe(b.clip);
    expect(manager.stats()).toMatchObject({ decodedBytes: 16, pinnedEntries: 1 });
    await manager.load("/uncached.wav"); // The only resident entry is pinned.
    expect(manager.getCached("/uncached.wav")).toBeUndefined();
    expect(manager.stats().decodedBytes).toBe(16);
    a.release();
    a.release();
    expect(manager.getCached("/leased.wav")).toBe(a.clip);
    b.release();
    expect(manager.getCached("/leased.wav")).toBeUndefined();
    expect(manager.stats()).toMatchObject({ decodedBytes: 0, pinnedEntries: 0 });
    const loaded = await manager.load("/uncached.wav");
    expect(manager.getCached("/uncached.wav")).toBe(loaded);
    expect(fetches).toBe(3);
  });

  it("evicts the least recently used unleased buffer and never caches oversized buffers", async () => {
    let count = 0;
    const manager = new AudioFileManager({ securityContext: "test-session", context: context(() => buffer(count++ === 3 ? 9 : 4)), maxDecodedBytes: 32, fetch: async () => response() });
    await manager.load("/a");
    await manager.load("/b");
    manager.getCached("/a");
    await manager.load("/c");
    expect(manager.has("/a")).toBe(true);
    expect(manager.has("/b")).toBe(false);
    expect(manager.has("/c")).toBe(true);
    await manager.load("/large");
    expect(manager.has("/large")).toBe(false);
    expect(manager.stats().decodedBytes).toBe(32);
  });

  it("enforces origin policy, final URL and digests before decoding", async () => {
    let decodes = 0;
    let finalUrl = "https://other.example/a.wav";
    const inits: AudioFileFetchOptions[] = [];
    const manager = new AudioFileManager({ securityContext: "test-session", context: context(() => { decodes++; return buffer(); }), fetch: async (_url, init) => {
      inits.push(init!);
      return response(abc, finalUrl);
    } });
    await expect(manager.load("https://audio.example/a.wav", { allowedOrigins: ["https://audio.example"] })).rejects.toThrow(/origin/);
    await expect(manager.load("https://audio.example/a.wav", { allowedOrigins: ["self", "https://other.example"], sourceOrigin: "https://audio.example" })).rejects.toThrow(/redirect/);
    await expect(manager.load("https://audio.example/a.wav", { allowedOrigins: ["self"], sourceOrigin: "https://audio.example", redirect: "follow" })).rejects.toThrow(/redirect/);
    await expect(manager.load("https://audio.example/a.wav", { expectedUrl: "https://audio.example/a.wav" })).rejects.toThrow(/URL mismatch/);
    expect(decodes).toBe(0);
    expect(inits[0].redirect).toBe("error");
    finalUrl = "https://audio.example/a.wav";
    const allowed = await manager.load("https://audio.example/a.wav", {
      integrity: { version: 1, digest: abcHash }, allowedOrigins: ["self"], sourceOrigin: "https://audio.example", expectedUrl: finalUrl
    });
    expect(allowed).toBeInstanceOf(AudioClip);
    expect(decodes).toBe(1);
  });

  it("bounds streamed encoded bytes and reports subscriber progress", async () => {
    let decodeCalls = 0;
    const progress: number[] = [];
    const manager = new AudioFileManager({ securityContext: "test-session", context: context(() => { decodeCalls++; return buffer(); }), fetch: async () => ({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
          controller.enqueue(new Uint8Array([3, 4]));
          controller.close();
        }
      }),
      arrayBuffer: async () => { throw new Error("streaming expected"); }
    }) });
    await expect(manager.load("/stream.wav", { maxBytes: 3, onProgress: (event) => progress.push(event.loadedBytes) })).rejects.toThrow(/exceeds 3/);
    expect(progress).toEqual([2]);
    expect(decodeCalls).toBe(0);
    await manager.load("/stream.wav", { maxBytes: 4, onProgress: (event) => progress.push(event.loadedBytes) });
    expect(progress).toEqual([2, 2, 4]);
    expect(decodeCalls).toBe(1);
  });

  it("partitions ambient credential sessions and requires proof for predecoded clips", async () => {
    let fetches = 0;
    const manager = new AudioFileManager({ securityContext: "test-session", context: context(), fetch: async () => { fetches++; return response(); } });
    const a = await manager.load("/authenticated", { securityContext: "session-a" });
    const b = await manager.load("/authenticated", { securityContext: "session-b" });
    expect(a).not.toBe(b);
    expect(fetches).toBe(2);
    await expect(manager.load(a, { integrity: { version: 1, digest: abcHash } })).rejects.toThrow(/already decoded/);
  });
  it("fails closed on absent final URLs under origin policy and size mismatch before decoding", async () => {
    let decoded = 0;
    const manager = new AudioFileManager({ securityContext: "test-session", context: context(() => { decoded++; return buffer(); }), fetch: async () => response() });
    await expect(manager.load("https://audio.example/a", { allowedOrigins: ["https://audio.example"] })).rejects.toThrow(/final URL/);
    await expect(manager.load({ url: "/audio", sizeBytes: 2 })).rejects.toThrow(/size mismatch/);
    await manager.load({ url: "/audio", sizeBytes: 3 });
    expect(decoded).toBe(1);
  });

  it("retries decode failures and clears only the requested security context", async () => {
    let decodeCalls = 0;
    let fetches = 0;
    const manager = new AudioFileManager({ securityContext: "test-session", context: context(() => {
      if (++decodeCalls === 1) throw new Error("bad audio");
      return buffer();
    }), fetch: async () => { fetches++; return response(); } });
    await expect(manager.load("/decode", { securityContext: "a" })).rejects.toThrow(/bad audio/);
    const a = await manager.load("/decode", { securityContext: "a" });
    const b = await manager.load("/decode", { securityContext: "b" });
    manager.clear("/decode", { securityContext: "a" });
    expect(manager.getCached("/decode", { securityContext: "a" })).toBeUndefined();
    expect(manager.getCached("/decode", { securityContext: "b" })).toBe(b);
    expect(await manager.load("/decode", { securityContext: "a" })).not.toBe(a);
    expect(fetches).toBe(4);
  });

  it("keeps progress subscriptions independent even when they use the same callback", async () => {
    const pending = deferred<ReadableStreamDefaultController<Uint8Array>>();
    const progress: number[] = [];
    const manager = new AudioFileManager({ securityContext: "test-session", context: context(), fetch: async () => ({
      ok: true, status: 200,
      body: new ReadableStream<Uint8Array>({ start(controller) { pending.resolve(controller); } }),
      arrayBuffer: async () => { throw new Error("streaming expected"); }
    }) });
    const one = new AbortController();
    const listener = (event: { loadedBytes: number }) => progress.push(event.loadedBytes);
    const a = manager.load("/p", { signal: one.signal, onProgress: listener });
    const rejected = expect(a).rejects.toMatchObject({ name: "AbortError" });
    const b = manager.load("/p", { onProgress: listener });
    const controller = await pending.promise;
    one.abort();
    await rejected;
    controller.enqueue(new Uint8Array([1]));
    controller.close();
    await b;
    expect(progress).toEqual([1]);
  });

  it("cancels a streaming response when all subscribers abort", async () => {
    const cancelled = deferred<void>();
    const manager = new AudioFileManager({ securityContext: "test-session", context: context(), fetch: async () => ({
      ok: true, status: 200,
      body: new ReadableStream<Uint8Array>({ cancel() { cancelled.resolve(); } }),
      arrayBuffer: async () => { throw new Error("streaming expected"); }
    }) });
    const abort = new AbortController();
    const load = manager.load("/slow", { signal: abort.signal });
    const rejected = expect(load).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    abort.abort();
    await rejected;
    await cancelled.promise;
    expect(manager.stats().inFlight).toBe(0);
  });
  it("honors no-store and revalidation modes in the decoded cache", async () => {
    let calls = 0;
    const manager = new AudioFileManager({ securityContext: "test-session", context: context(), fetch: async () => { calls++; return response(); } });
    for (const cache of ["no-store", "reload", "no-cache"] as const) {
      const a = await manager.load("/fresh", { cache });
      const b = await manager.load("/fresh", { cache });
      expect(a).not.toBe(b);
      expect(manager.getCached("/fresh", { cache })).toBeUndefined();
    }
    expect(calls).toBe(6);
    expect(manager.stats().decodedBytes).toBe(0);
  });

  it("rejects malformed integrity objects instead of bypassing byte verification", async () => {
    let calls = 0;
    const manager = new AudioFileManager({ securityContext: "test-session", context: context(), fetch: async () => { calls++; return response(); } });
    await expect(manager.load("/missing", { integrity: { version: 1 } as never })).rejects.toThrow(/integrity metadata/);
    await expect(manager.load("/missing", { integrity: { version: 2, digest: abcHash } as never })).rejects.toThrow(/integrity metadata/);
    expect(calls).toBe(0);
  });
  it("forwards request policy through codec selection", async () => {
    let received: AudioFileFetchOptions | undefined;
    const manager = new AudioFileManager({ securityContext: "test-session", context: context(), fetch: async (_url, init) => { received = init; return response(abc, "https://audio.example/voice.wav"); } });
    await manager.loadFirstSupported([{ input: "/voice.wav", mimeType: "audio/wav" }], () => "probably", {
      credentials: "include", headers: { authorization: "Bearer scoped" }, expectedHash: abcHash, sourceOrigin: "https://audio.example"
    });
    expect(received?.credentials).toBe("include");
    expect(new Headers(received?.headers).get("authorization")).toBe("Bearer scoped");
  });
  it("keeps default ambient credential requests independent without an authentication generation", async () => {
    const firstResponse = deferred<ReturnType<typeof response>>();
    const secondResponse = deferred<ReturnType<typeof response>>();
    let fetches = 0;
    const manager = new AudioFileManager({ context: context(), fetch: async () => ++fetches === 1 ? firstResponse.promise : secondResponse.promise });
    const a = manager.load("/private.wav");
    const b = manager.load("/private.wav");
    expect(fetches).toBe(2);
    firstResponse.resolve(response());
    secondResponse.resolve(response());
    expect(await a).not.toBe(await b);
    expect(manager.has("/private.wav")).toBe(false);
    expect(manager.stats()).toMatchObject({ decodedBytes: 0, cachedEntries: 0 });
  });

  it("shares credential-omitting requests and partitions explicit authentication generations", async () => {
    let fetches = 0;
    const manager = new AudioFileManager({ context: context(), fetch: async () => { fetches++; return response(); } });
    const [a, b] = await Promise.all([manager.load("/public.wav", { credentials: "omit" }), manager.load("/public.wav", { credentials: "omit" })]);
    expect(a).toBe(b);
    expect(await manager.load("/public.wav", { credentials: "omit" })).toBe(a);
    const firstUser = await manager.load("/private.wav", { securityContext: "user-a-generation-1" });
    const secondUser = await manager.load("/private.wav", { securityContext: "user-b-generation-1" });
    expect(firstUser).not.toBe(secondUser);
    expect(fetches).toBe(3);
  });

  it("enforces same-origin sensitive requests and controlled redirects before fetch", async () => {
    const requests: AudioFileFetchOptions[] = [];
    const manager = new AudioFileManager({ securityContext: "generation", context: context(), fetch: async (url, init) => {
      requests.push(init!);
      return response(abc, url);
    } });
    for (const policy of [{ credentials: "include" as const }, { headers: { Authorization: "Bearer test" } }]) {
      await expect(manager.load("https://other.example/audio", { ...policy, sourceOrigin: "https://site.example" })).rejects.toThrow(/Cross-origin/);
      await expect(manager.load("https://site.example/audio", { ...policy, sourceOrigin: "https://site.example", redirect: "follow" })).rejects.toThrow(/redirect/);
      await manager.load("https://site.example/audio", { ...policy, sourceOrigin: "https://site.example" });
      await manager.load("https://other.example/audio", { ...policy, sourceOrigin: "https://site.example", allowedOrigins: ["https://other.example"] });
    }
    expect(requests).toHaveLength(4);
    expect(requests.every((request) => request.redirect === "error")).toBe(true);
  });

  it("rejects unverifiable origins and untrusted redirect responses for sensitive requests", async () => {
    let fetches = 0;
    let finalUrl = "https://site.example/redirected";
    const manager = new AudioFileManager({ securityContext: "generation", context: context(), fetch: async () => { fetches++; return response(abc, finalUrl); } });
    await expect(manager.load("https://site.example/a", { headers: { "x-token": "private" } })).rejects.toThrow(/source origin/);
    await expect(manager.load("data:audio/wav;base64,c2VjcmV0", { sourceOrigin: "https://site.example", credentials: "include" })).rejects.toThrow(/verify origin/);
    await expect(manager.load("blob:https://site.example/opaque", { sourceOrigin: "https://site.example", headers: { "x-token": "private" } })).rejects.toThrow(/verify origin/);
    expect(fetches).toBe(0);
    await expect(manager.load("https://site.example/a", { sourceOrigin: "https://site.example", credentials: "include" })).rejects.toThrow(/redirect/);
    expect(fetches).toBe(1);
    finalUrl = "https://site.example/a";
    await manager.load("https://site.example/a", { sourceOrigin: "https://site.example", credentials: "include" });
    expect(fetches).toBe(2);
  });

  it("rejects malformed allowlists and missing response URLs before decoding", async () => {
    let calls = 0;
    let decodes = 0;
    const manager = new AudioFileManager({ securityContext: "generation", context: context(() => { decodes++; return buffer(); }), fetch: async () => { calls++; return response(); } });
    await expect(manager.load("https://site.example/a", { allowedOrigins: ["https://site.example/path"] })).rejects.toThrow(/allowedOrigins/);
    await expect(manager.load("https://site.example/a", { allowedOrigins: ["https://user:password@site.example"] })).rejects.toThrow(/allowedOrigins/);
    await expect(manager.load("https://site.example/a", { sourceOrigin: "https://site.example", credentials: "include" })).rejects.toThrow(/final URL/);
    expect(calls).toBe(1);
    expect(decodes).toBe(0);
  });
  it("clears all independent in-flight loads for an exact ambient request context", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    const manager = new AudioFileManager({ context: context(), fetch: async () => pending.promise });
    const a = manager.load("/private");
    const b = manager.load("/private");
    const rejected = Promise.all([expect(a).rejects.toMatchObject({ name: "AbortError" }), expect(b).rejects.toMatchObject({ name: "AbortError" })]);
    expect(manager.stats().inFlight).toBe(2);
    manager.clear("/private", {});
    await rejected;
    pending.resolve(response());
    expect(manager.stats()).toMatchObject({ inFlight: 0, decodedBytes: 0 });
  });
  it("fetches the same absolute URL it validated when given an explicit base", async () => {
    const requested: string[] = [];
    const manager = new AudioFileManager({ securityContext: "generation", context: context(), fetch: async (url) => { requested.push(url); return response(abc, url); } });
    await manager.load("../audio.wav", { baseURL: "https://site.example/nested/page", headers: { authorization: "Bearer scoped" } });
    expect(requested).toEqual(["https://site.example/audio.wav"]);
  });
});
