import { createHash, webcrypto } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormatRegistry } from "../../packages/assets/src/FormatRegistry";
import { LoadContext } from "../../packages/assets/src/LoadContext";
import {
  createScalarVolumeFormatAdapter,
  inspectScalarVolume,
  ScalarVolumeLoader,
  type ScalarVolumeAsset
} from "../../packages/assets/src/loaders/ScalarVolumeLoader";
import { parseNRRD } from "../../packages/assets/src/loaders/ScientificFormatLoaders";

// The fixtures are constructed directly from the NRRD format definition:
// https://teem.sourceforge.net/nrrd/format.html
const documentUrl = "https://assets.test/scans/volume.nrrd";
const detachedUrl = "https://assets.test/scans/volume.nhdr";
const payloadUrl = "https://assets.test/scans/voxels.raw";
const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const hash = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");

function join(...parts: Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(parts.reduce((length, part) => length + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { joined.set(part, offset); offset += part.byteLength; }
  return joined;
}

interface FixtureOptions {
  readonly type?: string;
  readonly sizes?: readonly number[];
  readonly values?: string;
  readonly space?: string | null;
  readonly origin?: string | null;
  readonly directions?: string | null;
  readonly units?: string | null;
  readonly extra?: string;
}

function header(options: FixtureOptions = {}, encoding = "ascii", detached = false): string {
  const sizes = options.sizes ?? [2, 2, 2];
  const space = options.space === undefined ? "right-anterior-superior" : options.space;
  const origin = options.origin === undefined ? "(1,2,3)" : options.origin;
  const directions = options.directions === undefined ? "(1,0,0) (0,2,0) (0,0,3)" : options.directions;
  const units = options.units === undefined ? '"mm" "mm" "mm"' : options.units;
  return [
    "NRRD0005",
    `type: ${options.type ?? "uint8"}`,
    `dimension: ${sizes.length}`,
    `sizes: ${sizes.join(" ")}`,
    `encoding: ${encoding}`,
    ...(space === null ? [] : [`space: ${space}`]),
    ...(origin === null ? [] : [`space origin: ${origin}`]),
    ...(directions === null ? [] : [`space directions: ${directions}`]),
    ...(units === null ? [] : [`space units: ${units}`]),
    ...(options.extra ? [options.extra] : []),
    ...(detached ? ["data file: voxels.raw"] : []),
    ""
  ].join("\n") + "\n";
}

function ascii(options: FixtureOptions = {}): Uint8Array {
  const count = (options.sizes ?? [2, 2, 2]).reduce((product, size) => product * size, 1);
  const values = options.values ?? Array.from({ length: count }, (_, index) => String(index + 1)).join(" ");
  return encode(`${header(options)}${values}\n`);
}

function serve(bytes: Uint8Array) {
  const fetch = vi.fn(async () => new Response(Uint8Array.from(bytes)));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

describe("native scalar-volume NRRD adapter", () => {
  it("inspects parsed volumes without fetching or taking ownership of their samples", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const volume = await parseNRRD(ascii({ extra: "centers: cell node node" }));
    const descriptor = inspectScalarVolume(volume);
    expect(fetch).not.toHaveBeenCalled();
    expect(descriptor.data).toBe(volume.samples);
    expect(descriptor.dimensions).toEqual([2, 2, 2]);
    expect([...descriptor.dataToLocal]).toEqual([
      1, 0, 0, 0,
      0, 0, -2, 0,
      0, 3, 0, 0,
      1, 3, -2, 1
    ]);
    expect(descriptor.metadata).toMatchObject({ centers: ["cell", "node", "node"], extent: "sample-centers" });
    expect(() => inspectScalarVolume(volume, { maxVoxels: 7 })).toThrow(/SCALAR_VOLUME_INVALID_SIZE/);
    expect(() => inspectScalarVolume({ ...volume, samples: new Int32Array(8) })).toThrow(/SCALAR_VOLUME_UNSUPPORTED_TYPE/);
    expect([...descriptor.data]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("maps the first and last sample centers into Aura node-local coordinates", async () => {
    serve(ascii({ sizes: [3, 2, 2], extra: "centers: node cell none\nkinds: space domain space" }));
    const loader = new ScalarVolumeLoader();
    const asset = await loader.load({ url: documentUrl, type: "scalar-volume" }, new LoadContext());
    expect(asset.kind).toBe("scalar-volume");
    expect(asset.dimensions).toEqual([3, 2, 2]);
    expect([...asset.data]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect([...asset.dataToLocal]).toEqual([
      2, 0, 0, 0,
      0, 0, -2, 0,
      0, 3, 0, 0,
      1, 3, -2, 1
    ]);
    expect(asset.metadata).toMatchObject({ sourceFormat: "nrrd", sourceSpace: "right-anterior-superior", spaceUnits: ["mm", "mm", "mm"],
      centers: ["node", "cell", "unknown"], extent: "sample-centers" });
    loader.dispose(asset);
  });

  it.each([
    ["RAS", [1, 3, -2]],
    ["left-anterior-superior", [-1, 3, -2]],
    ["LPS", [-1, 3, 2]]
  ] as const)("converts the named %s basis without changing source units", async (space, translation) => {
    serve(ascii({ space }));
    const asset = await new ScalarVolumeLoader().load({ url: documentUrl }, new LoadContext());
    expect([...asset.dataToLocal.slice(12, 15)]).toEqual(translation);
    expect(asset.metadata.spaceUnits).toEqual(["mm", "mm", "mm"]);
  });

  it("preserves oblique and reflected directions without reordering the samples", async () => {
    serve(ascii({ directions: "(1,1,0) (0,-2,0) (0,0,3)" }));
    const asset = await new ScalarVolumeLoader().load({ url: documentUrl }, new LoadContext());
    expect([...asset.dataToLocal.slice(0, 12)]).toEqual([1, 0, -1, 0, 0, 0, 2, 0, 0, 3, 0, 0]);
    expect([...asset.data]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it.each([
    ["uint8", Uint8Array],
    ["uint16", Uint16Array],
    ["float", Float32Array]
  ] as const)("retains supported %s values without a silent numeric conversion", async (type, expected) => {
    serve(ascii({ type }));
    const asset = await new ScalarVolumeLoader().load({ url: documentUrl }, new LoadContext());
    expect(asset.data).toBeInstanceOf(expected);
    expect([...asset.data]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("supports gzip through the verified scientific loader", async () => {
    const compressed = gzipSync(Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8));
    serve(join(encode(header({}, "gzip")), compressed));
    const asset = await new ScalarVolumeLoader().load({ url: documentUrl }, new LoadContext());
    expect([...asset.data]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("verifies the header and exact detached bytes using the inherited request policy", async () => {
    const source = encode(header({}, "raw", true));
    const payload = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === detachedUrl) return new Response(Uint8Array.from(source));
      if (String(input) === payloadUrl) return new Response(Uint8Array.from(payload));
      throw new Error("Unexpected URL");
    });
    vi.stubGlobal("fetch", fetch);
    const integrity = { version: 1 as const, digest: hash(source), requireDependencies: true, dependencies: { "voxels.raw": hash(payload) } };
    const asset = await new ScalarVolumeLoader().load({ url: detachedUrl, allowedOrigins: ["self"], sourceOrigin: "https://assets.test", integrity }, new LoadContext());
    expect([...asset.data]).toEqual([...payload]);
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect(new ScalarVolumeLoader().load({ url: detachedUrl, integrity: { ...integrity, dependencies: { "voxels.raw": "0".repeat(64) } } }, new LoadContext()))
      .rejects.toThrow(/integrity mismatch/i);
  });

  it("snapshots caller request policy before the underlying document fetch yields", async () => {
    const response = deferred<Response>();
    const fetch = vi.fn(() => response.promise);
    vi.stubGlobal("fetch", fetch);
    const first = new AbortController(), second = new AbortController();
    const headers = new Headers({ "x-test-token": "original" });
    const allowedOrigins = ["https://assets.test"];
    const request = { url: documentUrl, format: "nrrd", signal: first.signal, headers, allowedOrigins };
    const pending = new ScalarVolumeLoader().load(request, new LoadContext());
    request.url = "https://other.test/changed.nrrd";
    request.signal = second.signal;
    headers.set("x-test-token", "changed");
    allowedOrigins.push("https://other.test");
    second.abort();
    response.resolve(new Response(Uint8Array.from(ascii())));
    const asset = await pending;
    expect([...asset.data]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(documentUrl);
    expect(new Headers(init.headers).get("x-test-token")).toBe("original");
  });

  it("rejects a cancelled load without returning an asset", async () => {
    const response = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => response.promise));
    const controller = new AbortController();
    const pending = new ScalarVolumeLoader().load({ url: documentUrl, signal: controller.signal }, new LoadContext());
    controller.abort();
    response.resolve(new Response(Uint8Array.from(ascii())));
    await expect(pending).rejects.toThrow(/abort/i);
  });

  it("supports the registry adapter and releases only its own asset", async () => {
    serve(ascii());
    const registry = new FormatRegistry();
    const adapter = createScalarVolumeFormatAdapter();
    registry.register(adapter);
    const lease = await registry.load<ScalarVolumeAsset>({ url: documentUrl, type: "scalar-volume" }, new LoadContext(), { format: "nrrd" });
    const asset = lease.asset;
    expect(asset.kind).toBe("scalar-volume");
    const retainedArray = asset.data;
    new ScalarVolumeLoader().dispose(asset);
    expect(asset.data).toBe(retainedArray);
    await lease.dispose();
    await lease.dispose();
    expect(() => asset.data).toThrow(/SCALAR_VOLUME_DISPOSED/);
    expect([...retainedArray]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("refuses unverified format-version claims before loading", async () => {
    const fetch = serve(ascii());
    const registry = new FormatRegistry();
    registry.register(createScalarVolumeFormatAdapter());
    await expect(registry.load({ url: documentUrl, type: "scalar-volume" }, new LoadContext(),
      { format: "nrrd", formatMetadata: { version: "5" } })).rejects.toThrow(/version/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("recognizes explicit and extension-based formats without accepting conflicting representations", () => {
    const loader = new ScalarVolumeLoader();
    expect(loader.canLoad({ url: "https://assets.test/signed?sig=1", format: ".NHDR" })).toBe(true);
    expect(loader.canLoad({ url: "scan.NRRD?sig=1" })).toBe(true);
    expect(loader.canLoad({ url: "scan.nrrd", format: "gltf" })).toBe(false);
  });

  it.each([
    [{ sizes: [2, 2, 1] }, /dimensions/i],
    [{ sizes: [2, 2, 2, 1], directions: "(1,0,0) (0,2,0) (0,0,3) none" }, /dimensions/i],
    [{ type: "int32" }, /unsupported_type/i],
    [{ type: "double" }, /unsupported_type/i],
    [{ type: "float", values: "1 2 3 4 5 6 NaN 8" }, /nonfinite_sample/i],
    [{ space: null }, /unsupported_space/i],
    [{ space: "scanner-xyz" }, /unsupported_space/i],
    [{ origin: null }, /unsupported_orientation/i],
    [{ directions: null }, /unsupported_orientation/i],
    [{ directions: "(1,0,0) (2,0,0) (0,0,3)" }, /invalid_transform/i],
    [{ directions: "(1e39,0,0) (0,1,0) (0,0,1)" }, /invalid_transform/i],
    [{ directions: "(1e-46,0,0) (0,1,0) (0,0,1)" }, /invalid_transform/i],
    [{ units: '"mm" "cm" "mm"' }, /unsupported_units/i],
    [{ extra: "centers: node cell invalid" }, /invalid_centering/i],
    [{ extra: "centers: node node node\ncenterings: node node node" }, /invalid_centering/i],
    [{ extra: "kinds: space time space" }, /unsupported_kinds/i]
  ] as const)("rejects unsupported or ambiguous volume data: %#", async (options, error) => {
    serve(ascii(options));
    await expect(new ScalarVolumeLoader().load({ url: documentUrl }, new LoadContext())).rejects.toThrow(error);
  });

  it("enforces the voxel and parser element limits before producing an asset", async () => {
    serve(ascii());
    await expect(new ScalarVolumeLoader({ maxVoxels: 7 }).load({ url: documentUrl }, new LoadContext())).rejects.toThrow(/limit/i);
    await expect(new ScalarVolumeLoader({ maxElements: 7 }).load({ url: documentUrl }, new LoadContext())).rejects.toThrow(/limit/i);
    await expect(new ScalarVolumeLoader({ maxElements: Infinity }).load({ url: documentUrl }, new LoadContext())).rejects.toThrow(/invalid_limit/i);
    expect(() => new ScalarVolumeLoader({ maxVoxels: 0 })).toThrow(/invalid_limit/i);
  });
});
