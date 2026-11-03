import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultProbeLoader } from "../../../packages/rendering/src/environment/EnvironmentCache.js";
import type { Texture } from "../../../packages/rendering/src/Texture.js";

const encoder = new TextEncoder();
const key = { preset: "fixture", tier: "medium" } as const;
const loader = () => defaultProbeLoader({} as never);
type Asset = "manifest" | "specular" | "sh9";

// Independently constructed private probe bytes: one 128×128 black mip for
// each of six faces. These are synthetic data, not an external probe asset.
function fixture() {
  const faceSize = 128;
  const payloadBytes = 6 * faceSize * faceSize * 4;
  const cube = new Uint8Array(92 + payloadBytes);
  cube.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  const header = new DataView(cube.buffer);
  header.setUint32(12, 142, true);
  header.setUint32(16, 4, true);
  header.setUint32(20, faceSize, true);
  header.setUint32(24, faceSize, true);
  header.setUint32(36, 6, true);
  header.setUint32(40, 1, true);
  header.setBigUint64(68, 92n, true);
  header.setBigUint64(76, BigInt(payloadBytes), true);
  header.setBigUint64(84, BigInt(payloadBytes), true);
  const sh9 = new Uint8Array(27 * 4);
  new DataView(sh9.buffer).setFloat32(0, 0.75, true);
  new DataView(sh9.buffer).setFloat32(4, -1.25, true);
  return {
    manifest: encoder.encode(JSON.stringify({
      name: "fixture", faceSize, mipCount: 1,
      specular: "fixture.specular.ktx2", sh9: "fixture.sh9.f32"
    })),
    specular: cube,
    sh9
  };
}

interface StreamStats {
  pulls: number;
  readers: number;
  readerCancels: number;
  sourceCancels: number;
  releases: number;
  arrayBufferCalls: number;
}

interface TrackedResponse {
  readonly response: unknown;
  readonly stats: StreamStats;
  readonly locked: () => boolean;
}

function chunksOf(bytes: Uint8Array, length: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let start = 0; start < bytes.length; start += length) chunks.push(bytes.subarray(start, start + length));
  return chunks;
}

function sizedChunks(total: number): Uint8Array[] {
  const block = new Uint8Array(64 * 1024).fill(0x20);
  const chunks = Array.from({ length: Math.floor(total / block.length) }, () => block);
  const remainder = total % block.length;
  if (remainder) chunks.push(block.subarray(0, remainder));
  return chunks;
}

function streamResponse(chunks: readonly unknown[], contentLength?: string, fallbackBytes = new Uint8Array()): TrackedResponse {
  const stats: StreamStats = { pulls: 0, readers: 0, readerCancels: 0, sourceCancels: 0, releases: 0, arrayBufferCalls: 0 };
  let index = 0;
  // A zero high-water mark ensures pulls count actual reader demand rather
  // than eager stream buffering before Content-Length has been checked.
  const stream = new ReadableStream<unknown>({
    pull(controller) {
      stats.pulls += 1;
      if (index >= chunks.length) { controller.close(); return; }
      const next = chunks[index++];
      // A producer may reuse one scratch buffer on successive pulls.
      const chunk = typeof next === "function" ? next() : next;
      if (chunk instanceof Error) controller.error(chunk);
      else controller.enqueue(chunk);
    },
    cancel() { stats.sourceCancels += 1; }
  }, { highWaterMark: 0 });
  const body = {
    get locked() { return stream.locked; },
    cancel: (reason?: unknown) => stream.cancel(reason),
    getReader() {
      stats.readers += 1;
      const reader = stream.getReader();
      return {
        read: () => reader.read(),
        cancel(reason?: unknown) { stats.readerCancels += 1; return reader.cancel(reason); },
        releaseLock() { stats.releases += 1; reader.releaseLock(); }
      };
    }
  };
  const headers = new Headers();
  if (contentLength !== undefined) headers.set("Content-Length", contentLength);
  return {
    response: {
      ok: true, status: 200, headers, body,
      async arrayBuffer() { stats.arrayBufferCalls += 1; return Uint8Array.from(fallbackBytes).buffer; }
    },
    stats,
    locked: () => stream.locked
  };
}

function fallbackResponse(bytes: Uint8Array): TrackedResponse {
  const stats: StreamStats = { pulls: 0, readers: 0, readerCancels: 0, sourceCancels: 0, releases: 0, arrayBufferCalls: 0 };
  return {
    response: {
      ok: true, status: 200, headers: new Headers(), body: null,
      async arrayBuffer() { stats.arrayBufferCalls += 1; return Uint8Array.from(bytes).buffer; }
    },
    stats,
    locked: () => false
  };
}

function validResponses(data = fixture()): Record<Asset, TrackedResponse> {
  return {
    manifest: streamResponse(chunksOf(data.manifest, 13)),
    specular: streamResponse(chunksOf(data.specular, 64 * 1024)),
    sh9: streamResponse(chunksOf(data.sh9, 19))
  };
}

function installFetch(responses: Record<Asset, TrackedResponse>) {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;
    if (url.endsWith("fixture.manifest.json")) return responses.manifest.response;
    if (url.endsWith("fixture.specular.ktx2")) return responses.specular.response;
    if (url.endsWith("fixture.sh9.f32")) return responses.sh9.response;
    return { ok: false, status: 404, headers: new Headers(), body: null };
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

const limits: Record<Asset, number> = {
  manifest: 1024 * 1024,
  specular: 6 * 128 * 128 * 4 + 4 * 1024 * 1024,
  sh9: 27 * 4
};

afterEach(() => vi.unstubAllGlobals());

describe("bounded preset streaming", () => {
  it("loads valid chunked manifest, cube, and SH9 bodies and releases their reader locks", async () => {
    const responses = validResponses();
    const fetcher = installFetch(responses);
    const probe = await loader()(key);
    try {
      expect(probe.faceSize).toBe(128);
      expect(probe.mipCount).toBe(1);
      expect(probe.sh9[0]).toBe(0.75);
      expect(fetcher).toHaveBeenCalledTimes(3);
      for (const response of Object.values(responses)) {
        expect(response.stats.pulls).toBeGreaterThan(1);
        expect(response.stats.readerCancels).toBe(0);
        expect(response.stats.releases).toBe(1);
        expect(response.stats.arrayBufferCalls).toBe(0);
        expect(response.locked()).toBe(false);
      }
    } finally { probe.dispose(); }
  });

  it.each((["manifest", "specular", "sh9"] as const).flatMap((asset) => [
    { asset, contentLength: undefined },
    { asset, contentLength: "1" }
  ]))("rejects actual $asset bytes over the cap with Content-Length $contentLength", async ({ asset, contentLength }) => {
    const responses = validResponses();
    const overLimitChunks = sizedChunks(limits[asset] + 1);
    const oversized = streamResponse([...overLimitChunks, Uint8Array.of(99)], contentLength);
    responses[asset] = oversized;
    installFetch(responses);
    await expect(loader()(key)).rejects.toThrow(/ENV_PRESET_UNAVAILABLE:fixture:.*ENV_FETCH_TOO_LARGE/);
    expect(oversized.stats.pulls).toBe(overLimitChunks.length);
    expect(oversized.stats.readerCancels).toBe(1);
    expect(oversized.stats.sourceCancels).toBe(1);
    expect(oversized.stats.releases).toBe(1);
    expect(oversized.stats.arrayBufferCalls).toBe(0);
    expect(oversized.locked()).toBe(false);
  });

  it.each(["manifest", "specular", "sh9"] as const)("rejects an oversized %s Content-Length before pulling its body", async (asset) => {
    const responses = validResponses();
    const oversized = streamResponse([Uint8Array.of(1)], String(limits[asset] + 1));
    responses[asset] = oversized;
    installFetch(responses);
    await expect(loader()(key)).rejects.toThrow(/ENV_PRESET_UNAVAILABLE:fixture:.*ENV_FETCH_TOO_LARGE/);
    expect(oversized.stats.pulls).toBe(0);
    expect(oversized.stats.arrayBufferCalls).toBe(0);
    expect(oversized.stats.sourceCancels).toBe(1);
    expect(oversized.locked()).toBe(false);
  });

  it("preserves earlier chunks when a stream reuses the same backing buffer", async () => {
    const data = fixture();
    const responses = validResponses(data);
    const scratch = new Uint8Array(4);
    const chunks = Array.from({ length: data.sh9.length / scratch.length }, (_, index) => () => {
      scratch.set(data.sh9.subarray(index * scratch.length, (index + 1) * scratch.length));
      return scratch;
    });
    const reused = streamResponse(chunks);
    responses.sh9 = reused;
    installFetch(responses);
    const probe = await loader()(key);
    try {
      expect(Array.from(probe.sh9.subarray(0, 2))).toEqual([0.75, -1.25]);
      expect(reused.stats.readerCancels).toBe(0);
      expect(reused.stats.releases).toBe(1);
      expect(reused.locked()).toBe(false);
    } finally { probe.dispose(); }
  });

  it("accepts a bounded number of empty chunks without changing the resulting bytes", async () => {
    const data = fixture();
    const responses = validResponses(data);
    const empty = new Uint8Array();
    const manyEmpty = streamResponse([...Array<Uint8Array>(1024).fill(empty), data.sh9]);
    responses.sh9 = manyEmpty;
    installFetch(responses);
    const probe = await loader()(key);
    try {
      expect(Array.from(probe.sh9.subarray(0, 2))).toEqual([0.75, -1.25]);
      expect(manyEmpty.stats.pulls).toBe(1026); // empty chunks, data, then EOF
      expect(manyEmpty.stats.readerCancels).toBe(0);
      expect(manyEmpty.stats.releases).toBe(1);
      expect(manyEmpty.locked()).toBe(false);
    } finally { probe.dispose(); }
  });

  for (const { label, byte } of [
    { label: "empty", byte: undefined },
    { label: "one-byte", byte: 0x20 }
  ]) {
    it(`rejects more than 65,536 ${label} chunks below the byte cap`, { timeout: 15_000 }, async () => {
      const responses = validResponses();
      const chunk = byte === undefined ? new Uint8Array() : Uint8Array.of(byte);
      const excess = streamResponse([...Array<Uint8Array>(65_537).fill(chunk), Uint8Array.of(99)]);
      responses.manifest = excess;
      installFetch(responses);
      await expect(loader()(key)).rejects.toThrow(/ENV_PRESET_UNAVAILABLE:fixture:.*ENV_FETCH_INVALID_STREAM/);
      expect(excess.stats.pulls).toBe(65_537);
      expect(excess.stats.readerCancels).toBe(1);
      expect(excess.stats.sourceCancels).toBe(1);
      expect(excess.stats.releases).toBe(1);
      expect(excess.locked()).toBe(false);
    });
  }

  it.each(["manifest", "sh9"] as const)("cancels and unlocks a %s stream that yields a non-byte chunk", async (asset) => {
    const responses = validResponses();
    const malformed = streamResponse(["not a byte chunk"]);
    responses[asset] = malformed;
    installFetch(responses);
    await expect(loader()(key)).rejects.toThrow(/ENV_PRESET_UNAVAILABLE:fixture:.*ENV_FETCH_INVALID_STREAM/);
    expect(malformed.stats.readerCancels).toBe(1);
    expect(malformed.stats.sourceCancels).toBe(1);
    expect(malformed.stats.releases).toBe(1);
    expect(malformed.locked()).toBe(false);
  });

  it("unlocks a stream when its source rejects a read", async () => {
    const responses = validResponses();
    const broken = streamResponse([new Error("synthetic read failure")]);
    responses.sh9 = broken;
    installFetch(responses);
    await expect(loader()(key)).rejects.toThrow(/ENV_PRESET_UNAVAILABLE:fixture:.*synthetic read failure/);
    expect(broken.stats.releases).toBe(1);
    expect(broken.locked()).toBe(false);
  });

  it.each([
    { asset: "manifest" as const, error: /ENV_PRESET_INVALID:fixture/ },
    { asset: "specular" as const, error: /ENV_KTX2_TRUNCATED/ },
    { asset: "sh9" as const, error: /ENV_PRESET_INVALID:fixture:.*SH9/ }
  ])("rejects an empty $asset body and releases its completed reader", async ({ asset, error }) => {
    const responses = validResponses();
    const empty = streamResponse([]);
    responses[asset] = empty;
    installFetch(responses);
    await expect(loader()(key)).rejects.toThrow(error);
    expect(empty.stats.releases).toBe(1);
    expect(empty.locked()).toBe(false);
  });

  it("preserves the arrayBuffer fallback for providers without a body stream", async () => {
    const data = fixture();
    const responses = {
      manifest: fallbackResponse(data.manifest),
      specular: fallbackResponse(data.specular),
      sh9: fallbackResponse(data.sh9)
    };
    installFetch(responses);
    const probe = await loader()(key);
    try {
      expect(probe.faceSize).toBe(128);
      expect(probe.sh9[0]).toBe(0.75);
      for (const response of Object.values(responses)) expect(response.stats.arrayBufferCalls).toBe(1);
    } finally { probe.dispose(); }
  });

  it("rejects an oversized non-stream fallback after reading its supplied buffer", async () => {
    const responses = validResponses();
    const oversized = fallbackResponse(new Uint8Array(limits.sh9 + 1));
    responses.sh9 = oversized;
    installFetch(responses);
    await expect(loader()(key)).rejects.toThrow(/ENV_PRESET_UNAVAILABLE:fixture:.*ENV_FETCH_TOO_LARGE/);
    expect(oversized.stats.arrayBufferCalls).toBe(1);
  });

  it("keeps the HDR URL path on its original unbounded arrayBuffer fetch", async () => {
    // A single synthetic black RGBE pixel; the oversized declared length is
    // intentionally false so this only checks routing, not a large allocation.
    const header = encoder.encode("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 1\n");
    const hdr = new Uint8Array(header.length + 4);
    hdr.set(header);
    const response = streamResponse([hdr], "999999999", hdr);
    vi.stubGlobal("fetch", vi.fn(async () => response.response));
    vi.stubGlobal("requestAnimationFrame", undefined);
    const expected = {};
    const fromEquirect = vi.fn((_source: Texture) => expected);
    const result = await defaultProbeLoader({ fromEquirect } as never)({ url: "/tiny.hdr", tier: "medium" });
    try {
      expect(result).toBe(expected);
      expect(fromEquirect).toHaveBeenCalledTimes(1);
      expect(response.stats.arrayBufferCalls).toBe(1);
      expect(response.stats.pulls).toBe(0);
    } finally { fromEquirect.mock.calls[0]?.[0].dispose(); }
  });
});
