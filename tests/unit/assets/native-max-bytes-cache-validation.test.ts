import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetManager } from "../../../packages/assets/src/AssetManager";
import { requestIdentity } from "../../../packages/assets/src/AssetLoader";
import { fetchBytes } from "../../../packages/assets/src/LoaderFetch";

afterEach(() => vi.unstubAllGlobals());

describe("asset size policy before cache reuse", () => {
  it("rejects malformed limits instead of reusing a cached unlimited response", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const fetchMock = vi.fn(async () => new Response("unlimited response"));
    vi.stubGlobal("fetch", fetchMock);
    const manager = new AssetManager({ credentials: "omit" });
    manager.register({
      type: "binary-fixture",
      canLoad: () => true,
      load: (request) => fetchBytes(request.url, request.signal, undefined, request)
    });
    const url = "https://assets.test/model.bin";
    const cached = await manager.load<ArrayBuffer>(url);
    expect(new TextDecoder().decode(cached.value)).toBe("unlimited response");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    for (const maxBytes of [NaN, Infinity, -Infinity, null as unknown as number]) {
      await expect(manager.load(url, { maxBytes })).rejects.toMatchObject({
        name: "AssetLoadError",
        cause: { name: "RangeError", message: "Asset maxBytes must be a non-negative safe integer" }
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(manager.cache.snapshot().cachedEntries).toBe(1);
    await cached.release();
  });

  it("validates before request identities are returned, even without cryptography", async () => {
    vi.stubGlobal("crypto", undefined);
    await expect(requestIdentity({ maxBytes: NaN })).rejects.toThrow("Asset maxBytes must be a non-negative safe integer");
    await expect(requestIdentity({ maxBytes: Infinity })).rejects.toThrow("Asset maxBytes must be a non-negative safe integer");
    await expect(requestIdentity({ maxBytes: -1 })).rejects.toThrow("Asset maxBytes must be a non-negative safe integer");
    expect(await requestIdentity({ maxBytes: 0 })).toMatch(/^unshared-/);
    expect(await requestIdentity()).toMatch(/^unshared-/);
  });

  it("rejects an invalid limit without joining an unlimited request in flight", async () => {
    vi.stubGlobal("crypto", webcrypto);
    let resolveResponse!: (response: Response) => void;
    let signalStarted!: () => void;
    const response = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const fetchMock = vi.fn(() => { signalStarted(); return response; });
    vi.stubGlobal("fetch", fetchMock);
    const manager = new AssetManager({ credentials: "omit" });
    manager.register({
      type: "binary-fixture",
      canLoad: () => true,
      load: (request) => fetchBytes(request.url, request.signal, undefined, request)
    });
    const pending = manager.load<ArrayBuffer>("https://assets.test/in-flight.bin");
    await started;
    const invalid = manager.load("https://assets.test/in-flight.bin", { maxBytes: NaN }).then(
      async (handle) => { await handle.release(); return "unexpected success"; },
      (error: unknown) => error
    );
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        invalid,
        new Promise<string>((resolve) => { timeout = setTimeout(() => resolve("joined the pending request"), 500); })
      ]);
      expect(outcome).toMatchObject({ name: "AssetLoadError", cause: { name: "RangeError" } });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      resolveResponse(new Response("data"));
    }
    const handle = await pending;
    await handle.release();
    await invalid;
  });
});
