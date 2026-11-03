import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import { ScientificFormatLoader, type ScientificAsset } from "../../../packages/assets/src/loaders/ScientificFormatLoaders";

const documentUrl = "https://assets.test/scans/volume.nhdr";
const payloadUrl = "https://assets.test/scans/voxels.raw";
const payload = Uint8Array.of(11, 23, 37);
const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const hash = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");
const detachedHeader = (reference = "voxels.raw"): Uint8Array => encode(
  `NRRD0005\ntype: uint8\ndimension: 1\nsizes: 3\nencoding: raw\ndata file: ${reference}\n`
);

function request(header: Uint8Array, data: Uint8Array = payload) {
  return {
    url: documentUrl,
    sourceOrigin: "https://assets.test",
    allowedOrigins: ["self"],
    integrity: {
      version: 1 as const,
      digest: hash(header),
      requireDependencies: true,
      dependencies: { "voxels.raw": hash(data) }
    }
  };
}

function onlyHeader(header: Uint8Array) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) !== documentUrl) throw new Error("Unexpected dependency fetch");
    return new Response(Uint8Array.from(header));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function samples(result: ScientificAsset): number[] {
  if (result.kind !== "volume") throw new Error("Expected a scientific volume");
  return [...result.samples];
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

describe("detached NRRD dependency integrity", () => {
  it("verifies exactly the supplied typed-array view without fetching the dependency", async () => {
    const header = detachedHeader(), fetch = onlyHeader(header);
    const padded = Uint8Array.of(90, 91, ...payload, 92, 93);
    const view = padded.subarray(2, 5);
    const result = await new ScientificFormatLoader("nrrd", { detachedData: view }).load(request(header), new LoadContext());
    expect(samples(result)).toEqual([...payload]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("accepts a supplied ArrayBuffer and optional missing digest when dependency integrity is not required", async () => {
    const header = detachedHeader(), fetch = onlyHeader(header);
    const optional = { ...request(header), integrity: { ...request(header).integrity, dependencies: {}, requireDependencies: false } };
    const bytes = Uint8Array.from(payload).buffer;
    const result = await new ScientificFormatLoader("nrrd", { detachedData: bytes }).load(optional, new LoadContext());
    expect(samples(result)).toEqual([...payload]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects absent, malformed, and mismatched required dependency digests", async () => {
    const header = detachedHeader(), fetch = onlyHeader(header);
    const base = request(header);
    const loader = new ScientificFormatLoader("nrrd", { detachedData: Uint8Array.from(payload) });
    await expect(loader.load({ ...base, integrity: { ...base.integrity, dependencies: {} } }, new LoadContext()))
      .rejects.toThrow(/Missing required dependency integrity metadata/);
    await expect(loader.load({ ...base, integrity: { ...base.integrity, dependencies: { "voxels.raw": "invalid" } } }, new LoadContext()))
      .rejects.toThrow(/Invalid SHA-256 integrity metadata/);
    await expect(loader.load({ ...base, integrity: { ...base.integrity, dependencies: { "voxels.raw": "0".repeat(64) } } }, new LoadContext()))
      .rejects.toThrow(/SHA-256 integrity mismatch/);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("still requires dependency metadata when the data-file URL resolves to the header URL", async () => {
    const header = detachedHeader("volume.nhdr"), fetch = onlyHeader(header);
    const base = request(header);
    const loader = new ScientificFormatLoader("nrrd", { detachedData: Uint8Array.from(payload) });
    await expect(loader.load(base, new LoadContext())).rejects.toThrow(/Missing required dependency integrity metadata/);
    const withDigest = { ...base, integrity: { ...base.integrity, dependencies: { "volume.nhdr": hash(payload) } } };
    expect(samples(await loader.load(withDigest, new LoadContext()))).toEqual([...payload]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("snapshots supplied bytes and dependency policy before the header fetch yields", async () => {
    const header = detachedHeader();
    const headerResponse = deferred<Response>();
    const fetch = vi.fn(() => headerResponse.promise);
    vi.stubGlobal("fetch", fetch);
    const padded = Uint8Array.of(4, ...payload, 5);
    const original = padded.subarray(1, 4);
    const base = request(header);
    const pending = new ScientificFormatLoader("nrrd", { detachedData: original }).load(base, new LoadContext());
    original.fill(0);
    base.integrity.dependencies["voxels.raw"] = "0".repeat(64);
    base.allowedOrigins[0] = "https://wrong.test";
    headerResponse.resolve(new Response(Uint8Array.from(header)));
    expect(samples(await pending)).toEqual([...payload]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the verified payload stable if the caller changes its bytes during digest calculation", async () => {
    const header = detachedHeader();
    onlyHeader(header);
    const started = deferred<void>();
    const release = deferred<void>();
    let calls = 0;
    vi.stubGlobal("crypto", { subtle: { digest: (_algorithm: string, data: BufferSource) => {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const computed = Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer;
      if (++calls === 2) { started.resolve(); return release.promise.then(() => computed); }
      return Promise.resolve(computed);
    } } });
    const supplied = Uint8Array.from(payload);
    const pending = new ScientificFormatLoader("nrrd", { detachedData: supplied }).load(request(header), new LoadContext());
    await started.promise;
    supplied.fill(99);
    release.resolve();
    expect(samples(await pending)).toEqual([...payload]);
  });

  it("rejects cancellation promptly while dependency verification is pending", async () => {
    const header = detachedHeader();
    onlyHeader(header);
    const started = deferred<void>();
    const digest = deferred<ArrayBuffer>();
    let calls = 0;
    vi.stubGlobal("crypto", { subtle: { digest: (_algorithm: string, data: BufferSource) => {
      if (++calls === 2) { started.resolve(); return digest.promise; }
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      return Promise.resolve(Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer);
    } } });
    const controller = new AbortController();
    const pending = new ScientificFormatLoader("nrrd", { detachedData: Uint8Array.from(payload) })
      .load({ ...request(header), signal: controller.signal }, new LoadContext());
    await started.promise;
    const rejected = expect(pending).rejects.toMatchObject({ name: "AssetLoadError", message: "Asset load aborted" });
    controller.abort(new Error("stop"));
    await rejected;
    // A late digest mismatch must be observed without reviving the cancelled load.
    digest.resolve(new Uint8Array(32).buffer);
    await Promise.resolve();
  });

  it("does not fetch an already-cancelled request", async () => {
    const header = detachedHeader(), fetch = onlyHeader(header);
    const controller = new AbortController();
    controller.abort();
    const loader = new ScientificFormatLoader("nrrd", { detachedData: Uint8Array.from(payload) });
    await expect(loader.load({ ...request(header), signal: controller.signal }, new LoadContext()))
      .rejects.toMatchObject({ name: "AssetLoadError", message: "Asset load aborted" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed if hashing the supplied dependency fails", async () => {
    const header = detachedHeader(), fetch = onlyHeader(header);
    let calls = 0;
    vi.stubGlobal("crypto", { subtle: { digest: (_algorithm: string, data: BufferSource) => {
      if (++calls === 2) return Promise.reject(new Error("digest failed"));
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      return Promise.resolve(Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer);
    } } });
    const loader = new ScientificFormatLoader("nrrd", { detachedData: Uint8Array.from(payload) });
    await expect(loader.load(request(header), new LoadContext())).rejects.toThrow(/SHA-256 failed/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("enforces the shared header and supplied-dependency byte budget", async () => {
    const header = detachedHeader(), fetch = onlyHeader(header);
    const loader = new ScientificFormatLoader("nrrd", { detachedData: Uint8Array.from(payload) });
    await expect(loader.load({ ...request(header), maxBytes: header.byteLength + payload.byteLength - 1 }, new LoadContext()))
      .rejects.toThrow(/maxBytes/);
    expect(samples(await loader.load({ ...request(header), maxBytes: header.byteLength + payload.byteLength }, new LoadContext())))
      .toEqual([...payload]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("enforces allowed origins for a supplied dependency without issuing a request to that origin", async () => {
    const header = detachedHeader("https://other.test/voxels.raw"), fetch = onlyHeader(header);
    const base = request(header);
    const integrity = { ...base.integrity, dependencies: { "https://other.test/voxels.raw": hash(payload) } };
    const loader = new ScientificFormatLoader("nrrd", { detachedData: Uint8Array.from(payload) });
    await expect(loader.load({ ...base, integrity }, new LoadContext())).rejects.toThrow(/origin is not allowed/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("redacts a signed dependency URL from an integrity failure", async () => {
    const reference = "https://other.test/voxels.raw?token=private-value";
    const header = detachedHeader(reference), fetch = onlyHeader(header);
    const base = request(header);
    const integrity = { ...base.integrity, dependencies: { [reference]: "0".repeat(64) } };
    const loader = new ScientificFormatLoader("nrrd", { detachedData: Uint8Array.from(payload) });
    const error = await loader.load({ ...base, integrity, allowedOrigins: ["https://assets.test", "https://other.test"] }, new LoadContext())
      .then(() => { throw new Error("Expected integrity failure"); }, (failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/integrity mismatch/);
    expect((error as Error).message).not.toContain("private-value");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not proceed to a dependency when the header request fails", async () => {
    const header = detachedHeader();
    const fetch = vi.fn(async () => new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    const loader = new ScientificFormatLoader("nrrd", { detachedData: Uint8Array.from(payload) });
    await expect(loader.load(request(header), new LoadContext())).rejects.toThrow(/503/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fetches and verifies a normal detached dependency with the original policy snapshot", async () => {
    const header = detachedHeader(), gate = deferred<Response>();
    const fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === documentUrl) return gate.promise;
      if (String(input) === payloadUrl) return Promise.resolve(new Response(Uint8Array.from(payload)));
      throw new Error("Unexpected URL");
    });
    vi.stubGlobal("fetch", fetch);
    const base = request(header);
    const pending = new ScientificFormatLoader("nrrd").load(base, new LoadContext());
    base.integrity.dependencies["voxels.raw"] = "0".repeat(64);
    gate.resolve(new Response(Uint8Array.from(header)));
    expect(samples(await pending)).toEqual([...payload]);
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([documentUrl, payloadUrl]);
  });

  it("ignores oversized unused detached bytes for an embedded volume", async () => {
    const header = encode("NRRD0005\ntype: uint8\ndimension: 1\nsizes: 3\nencoding: raw\n\n\x0b\x17%");
    const fetch = onlyHeader(header);
    const result = await new ScientificFormatLoader("nrrd", { detachedData: new Uint8Array(header.byteLength + 1) })
      .load({ url: documentUrl, maxBytes: header.byteLength }, new LoadContext());
    expect(samples(result)).toEqual([...payload]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
