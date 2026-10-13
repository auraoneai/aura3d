// Regression (2026-10-13 production probe): scenes instantiate the same
// prop GLB many times, and every node fetched it concurrently. Chromium
// aborts parallel same-key cache writes for multi-MB responses with
// net::ERR_CACHE_WRITE_FAILURE, so those games never drew on the deployed
// site while localhost captures stayed green. One in-flight fetch per URL.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBytesShared } from "../../../packages/engine/src/agent-api/compiler/gltfRuntime";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function deferredFetch(bytes: Uint8Array, status = 200) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const fetchMock = vi.fn(async (_url: string) => {
    await gate;
    return {
      ok: status >= 200 && status < 300,
      status,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    } as Response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { fetchMock, release };
}

describe("fetchBytesShared in-flight dedupe", () => {
  it("shares one network fetch across concurrent callers of the same URL", async () => {
    const { fetchMock, release } = deferredFetch(new Uint8Array([1, 2, 3, 4]));
    const calls = Array.from({ length: 5 }, () => fetchBytesShared("https://example.test/a.glb"));
    release();
    const results = await Promise.all(calls);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const bytes of results) expect([...new Uint8Array(bytes)]).toEqual([1, 2, 3, 4]);
    // Each caller owns an independent copy.
    new Uint8Array(results[0])[0] = 99;
    expect(new Uint8Array(results[1])[0]).toBe(1);
  });

  it("fetches distinct URLs separately and refetches after settle", async () => {
    const { fetchMock, release } = deferredFetch(new Uint8Array([7]));
    const a = fetchBytesShared("https://example.test/a.glb");
    const b = fetchBytesShared("https://example.test/b.glb");
    release();
    await Promise.all([a, b]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await fetchBytesShared("https://example.test/a.glb");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("propagates the HTTP status to every concurrent waiter", async () => {
    const { fetchMock, release } = deferredFetch(new Uint8Array(), 404);
    const calls = [
      fetchBytesShared("https://example.test/missing.glb"),
      fetchBytesShared("https://example.test/missing.glb")
    ];
    release();
    const settled = await Promise.allSettled(calls);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const result of settled) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") expect((result.reason as { status?: number }).status).toBe(404);
    }
  });
});
