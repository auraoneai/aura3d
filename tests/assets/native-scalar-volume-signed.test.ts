import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadContext } from "../../packages/assets/src/LoadContext";
import { inspectScalarVolume, ScalarVolumeLoader } from "../../packages/assets/src/loaders/ScalarVolumeLoader";
import { parseNRRD } from "../../packages/assets/src/loaders/ScientificFormatLoaders";

// Small fixtures are encoded directly from the NRRD field and byte-order rules.
const encode = (text: string) => new TextEncoder().encode(text);
const header = (type: string, encoding: "ascii" | "raw", endian?: "little" | "big") => encode([
  "NRRD0005", `type: ${type}`, "dimension: 3", "sizes: 2 2 2", `encoding: ${encoding}`,
  ...(endian ? [`endian: ${endian}`] : []), "space: RAS", "space origin: (0,0,0)",
  "space directions: (1,0,0) (0,1,0) (0,0,1)", "", ""
].join("\n"));

function join(first: Uint8Array, second: Uint8Array): Uint8Array {
  const result = new Uint8Array(first.length + second.length);
  result.set(first);
  result.set(second, first.length);
  return result;
}

function raw(type: "int8" | "int16", values: readonly number[], endian: "little" | "big" = "little"): Uint8Array {
  const width = type === "int8" ? 1 : 2;
  const bytes = new Uint8Array(values.length * width);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => {
    if (width === 1) view.setInt8(index, value);
    else view.setInt16(index * width, value, endian === "little");
  });
  return join(header(type, "raw", width === 2 ? endian : undefined), bytes);
}

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

describe("signed typed scalar-volume NRRD", () => {
  it.each([
    ["int8 raw", raw("int8", [-128, -3, -1, 0, 1, 3, 64, 127]), Int8Array, [-128, -3, -1, 0, 1, 3, 64, 127]],
    ["int16 little-endian", raw("int16", [-32768, -257, -1, 0, 1, 257, 2048, 32767]), Int16Array, [-32768, -257, -1, 0, 1, 257, 2048, 32767]],
    ["int16 big-endian", raw("int16", [-32768, -257, -1, 0, 1, 257, 2048, 32767], "big"), Int16Array, [-32768, -257, -1, 0, 1, 257, 2048, 32767]],
    ["signed ASCII", join(header("short", "ascii"), encode("-32768 -257 -1 0 1 257 2048 32767\n")), Int16Array, [-32768, -257, -1, 0, 1, 257, 2048, 32767]]
  ] as const)("borrows %s samples exactly, without changing their spatial metadata", async (_name, fixture, sampleType, expected) => {
    const scientific = await parseNRRD(fixture);
    expect(scientific.samples).toBeInstanceOf(sampleType);
    const descriptor = inspectScalarVolume(scientific, { maxVoxels: 8 });
    expect(descriptor.data).toBe(scientific.samples);
    expect([...descriptor.data]).toEqual(expected);
    expect(descriptor.dimensions).toEqual([2, 2, 2]);
    expect(descriptor.metadata).toMatchObject({ sourceSpace: "ras", extent: "sample-centers" });
    expect(() => inspectScalarVolume(scientific, { maxVoxels: 7 })).toThrow(/SCALAR_VOLUME_INVALID_SIZE/);
  });

  it("retains signed loader ownership and releases access on disposal", async () => {
    const fixture = raw("int16", [-32768, -2, -1, 0, 1, 2, 3, 32767]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Uint8Array.from(fixture))));
    const loader = new ScalarVolumeLoader({ maxVoxels: 8 });
    const asset = await loader.load({ url: "https://assets.test/signed.nrrd", type: "scalar-volume" }, new LoadContext());
    expect(asset.data).toBeInstanceOf(Int16Array);
    expect([...asset.data]).toEqual([-32768, -2, -1, 0, 1, 2, 3, 32767]);
    loader.dispose(asset);
    loader.dispose(asset);
    expect(() => asset.data).toThrow(/SCALAR_VOLUME_DISPOSED/);
  });

  it("continues to reject scalar formats whose values may lose precision in the renderer", async () => {
    const volume = await parseNRRD(raw("int8", [-128, -3, -1, 0, 1, 3, 64, 127]));
    expect(() => inspectScalarVolume({ ...volume, samples: new Int32Array(8) })).toThrow(/SCALAR_VOLUME_UNSUPPORTED_TYPE/);
    expect(() => inspectScalarVolume({ ...volume, samples: new Uint32Array(8) })).toThrow(/SCALAR_VOLUME_UNSUPPORTED_TYPE/);
    expect(() => inspectScalarVolume({ ...volume, samples: new Float64Array(8) })).toThrow(/SCALAR_VOLUME_UNSUPPORTED_TYPE/);
  });
});
