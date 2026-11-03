import { describe, expect, it, vi } from "vitest";
import { AudioFileManager, type AudioDecodeContextLike, type AudioFileFetchResponseLike } from "../../../packages/audio/src/AudioFileManager";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function audioContext(length = 0): AudioDecodeContextLike {
  return { decodeAudioData: () => ({ length, numberOfChannels: 1, duration: 0, sampleRate: 48_000 }) as AudioBuffer } as unknown as AudioDecodeContextLike;
}

function response(): AudioFileFetchResponseLike {
  return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1]).buffer };
}

describe("audio cache entry and response ownership", () => {
  it("bounds zero-sized entries, evicts least recently used entries and keeps pinned entries", async () => {
    const manager = new AudioFileManager({ context: audioContext(), securityContext: "session", maxCachedEntries: 2, fetch: async () => response() });
    const a = await manager.load("/a.wav");
    await manager.load("/b.wav");
    expect(manager.getCached("/a.wav")).toBe(a);
    await manager.load("/c.wav");
    expect(manager.has("/b.wav")).toBe(false);
    expect(manager.stats()).toMatchObject({ maxCachedEntries: 2, cachedEntries: 2, decodedBytes: 0 });

    const heldA = await manager.acquire("/a.wav");
    const heldC = await manager.acquire("/c.wav");
    await manager.load("/d.wav");
    expect(manager.has("/d.wav")).toBe(false);
    expect(manager.has("/a.wav")).toBe(true);
    expect(manager.has("/c.wav")).toBe(true);
    heldA.release();
    heldC.release();
    expect(manager.stats()).toMatchObject({ cachedEntries: 0, decodedBytes: 0 });
  });

  it("validates the entry bound and permits an explicitly disabled decoded cache", async () => {
    for (const limit of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => new AudioFileManager({ context: audioContext(), maxCachedEntries: limit })).toThrow(/maxCachedEntries/);
    }
    let fetches = 0;
    const manager = new AudioFileManager({ context: audioContext(), securityContext: "session", maxCachedEntries: 0, fetch: async () => { fetches++; return response(); } });
    expect(await manager.load("/empty.wav")).not.toBe(await manager.load("/empty.wav"));
    expect(fetches).toBe(2);
    expect(manager.stats()).toMatchObject({ maxCachedEntries: 0, cachedEntries: 0 });
  });

  it("cancels a response arriving after its last subscriber has aborted", async () => {
    const arrival = deferred<AudioFileFetchResponseLike>();
    const cancelled = deferred<void>();
    const decode = vi.fn(() => ({ length: 1, numberOfChannels: 1 }) as AudioBuffer);
    const manager = new AudioFileManager({ context: { decodeAudioData: decode } as unknown as AudioDecodeContextLike, securityContext: "session", fetch: async () => arrival.promise });
    const abort = new AbortController();
    const pending = manager.load("/late.wav", { signal: abort.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    abort.abort();
    await rejected;
    arrival.resolve({ ok: true, status: 200, body: new ReadableStream<Uint8Array>({ cancel() { cancelled.resolve(); } }), arrayBuffer: async () => new ArrayBuffer(0) });
    await cancelled.promise;
    expect(decode).not.toHaveBeenCalled();
    expect(manager.stats()).toMatchObject({ inFlight: 0, cachedEntries: 0 });
  });

  it("cancels unread error, rejected-origin and oversized responses without decoding", async () => {
    const cancellations: string[] = [];
    let kind: "status" | "origin" | "size" = "status";
    const decode = vi.fn(() => ({ length: 1, numberOfChannels: 1 }) as AudioBuffer);
    const manager = new AudioFileManager({ context: { decodeAudioData: decode } as unknown as AudioDecodeContextLike, securityContext: "session", fetch: async () => {
      const current = kind;
      return {
        ok: current !== "status", status: current === "status" ? 503 : 200,
        url: current === "origin" ? "https://else.test/file.wav" : "https://audio.test/file.wav",
        headers: { get: (name: string) => name === "content-length" && current === "size" ? "100" : null },
        body: new ReadableStream<Uint8Array>({ cancel() { cancellations.push(current); } }),
        arrayBuffer: async () => { throw new Error("unread body should be cancelled"); }
      };
    } });
    await expect(manager.load("https://audio.test/file.wav")).rejects.toThrow(/503/);
    kind = "origin";
    await expect(manager.load("https://audio.test/file.wav", { expectedUrl: "https://audio.test/file.wav" })).rejects.toThrow(/URL mismatch/);
    kind = "size";
    await expect(manager.load("https://audio.test/file.wav", { maxBytes: 4 })).rejects.toThrow(/exceeds 4/);
    expect(cancellations).toEqual(["status", "origin", "size"]);
    expect(decode).not.toHaveBeenCalled();
    expect(manager.stats()).toMatchObject({ inFlight: 0, cachedEntries: 0 });
  });
});
