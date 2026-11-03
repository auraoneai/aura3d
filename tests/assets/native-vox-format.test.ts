import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetLoadRequest, AssetLoader } from "../../packages/assets/src/AssetLoader";
import { FormatRegistry } from "../../packages/assets/src/FormatRegistry";
import { GLTFLoader, type GLTFAsset } from "../../packages/assets/src/GLTFLoader";
import { LoadContext } from "../../packages/assets/src/LoadContext";
import {
  createVOXFormatAdapter, parseVOX, VOXLoader, voxelVolumeToMesh
} from "../../packages/assets/src/importers";

// Small fixtures are built from the public VOX chunk layout. They are generated
// here rather than copied from another renderer or external asset corpus.
const text = (value: string): Uint8Array => new TextEncoder().encode(value);
function join(...parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}
function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}
function i32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, true);
  return bytes;
}
function string(value: string): Uint8Array {
  const data = text(value);
  return join(u32(data.length), data);
}
function dict(values: Readonly<Record<string, string>> = {}): Uint8Array {
  const entries = Object.entries(values);
  return join(u32(entries.length), ...entries.flatMap(([key, value]) => [string(key), string(value)]));
}
function chunk(name: string, content = new Uint8Array(), children = new Uint8Array()): Uint8Array {
  if (text(name).length !== 4) throw new Error("test chunk name must have four bytes");
  return join(text(name), u32(content.length), u32(children.length), content, children);
}
type Voxel = readonly [number, number, number, number];
function model(size: readonly [number, number, number], voxels: readonly Voxel[]): Uint8Array[] {
  return [
    chunk("SIZE", join(...size.map(u32))),
    chunk("XYZI", join(u32(voxels.length), Uint8Array.from(voxels.flatMap((value) => [...value]))))
  ];
}
function vox(version: number, chunks: readonly Uint8Array[]): Uint8Array {
  return join(text("VOX "), u32(version), chunk("MAIN", new Uint8Array(), join(...chunks)));
}
function palette(first: readonly [number, number, number, number]): Uint8Array {
  const values = new Uint8Array(1024);
  values.set(first, 0);
  return chunk("RGBA", values);
}
function transform(id: number, child: number, frames: readonly Readonly<Record<string, string>>[] = [{}],
  attributes: Readonly<Record<string, string>> = {}, layer = -1): Uint8Array {
  return chunk("nTRN", join(i32(id), dict(attributes), i32(child), i32(-1), i32(layer), u32(frames.length), ...frames.map(dict)));
}
function shape(id: number, modelId = 0): Uint8Array {
  return chunk("nSHP", join(i32(id), dict(), u32(1), i32(modelId), dict()));
}
function group(id: number, children: readonly number[]): Uint8Array {
  return chunk("nGRP", join(i32(id), dict(), u32(children.length), ...children.map(i32)));
}
function source(version = 150): Uint8Array {
  return vox(version, model([1, 1, 1], [[0, 0, 0, 1]]));
}
function dataUrl(input: Uint8Array): string {
  return `data:application/octet-stream;base64,${Buffer.from(input).toString("base64")}`;
}
function bounds(positions: Float32Array): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[index + axis]! === 0 ? 0 : positions[index + axis]!;
      min[axis] = Math.min(min[axis]!, value);
      max[axis] = Math.max(max[axis]!, value);
    }
  }
  return { min, max };
}
function expectOutwardTriangles(positions: Float32Array, normals: Float32Array, indices: Uint32Array): void {
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index]! * 3, b = indices[index + 1]! * 3, c = indices[index + 2]! * 3;
    const ab = [0, 1, 2].map((axis) => positions[b + axis]! - positions[a + axis]!);
    const ac = [0, 1, 2].map((axis) => positions[c + axis]! - positions[a + axis]!);
    const normal = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!];
    expect(normal[0]! * normals[a]! + normal[1]! * normals[a + 1]! + normal[2]! * normals[a + 2]!).toBeGreaterThan(0);
  }
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("bounded VOX parsing with independent fixtures", () => {
  it.each([150, 200])("loads version %s and removes internal faces between adjacent opaque voxels", (version) => {
    const file = vox(version, model([2, 1, 1], [[0, 0, 0, 1], [1, 0, 0, 1]]));
    const parsed = parseVOX(file);
    expect(parsed.version).toBe(version);
    expect(parsed.mesh.positions).toHaveLength(40 * 3);
    expect(parsed.mesh.indices).toHaveLength(10 * 6);
    expect(bounds(parsed.mesh.positions)).toEqual({ min: [0, 0, -1], max: [2, 1, 0] });
    expectOutwardTriangles(parsed.mesh.positions, parsed.mesh.normals!, parsed.mesh.indices);
  });

  it("preserves palette RGB/alpha and reports retained unsupported material data", () => {
    const material = chunk("MATL", join(i32(1), dict({ _type: "_glass", _rough: "0.4" })));
    const file = vox(200, [...model([1, 1, 1], [[0, 0, 0, 1]]), palette([12, 180, 240, 64]), material, chunk("TEST", text("opaque extension"))]);
    const parsed = parseVOX(file);
    expect(Array.from(parsed.palette.slice(4, 8))).toEqual([12, 180, 240, 64]);
    expect(parsed.mesh.colors![0]).toBeCloseTo(12 / 255);
    expect(parsed.mesh.colors![1]).toBeCloseTo(180 / 255);
    expect(parsed.mesh.colors![2]).toBeCloseTo(240 / 255);
    expect(parsed.mesh.colors![3]).toBeCloseTo(64 / 255);
    expect(parsed.materials[1]).toMatchObject({ _type: "_glass", _rough: "0.4" });
    expect(parsed.diagnostics.join(" ")).toMatch(/physical material properties are not mapped/i);
    expect(parsed.diagnostics.join(" ")).toMatch(/TEST.*not interpreted/i);
  });

  it("applies a static scene frame and keeps reflected triangle winding aligned with normals", () => {
    const file = vox(200, [
      ...model([1, 1, 1], [[0, 0, 0, 1]]),
      transform(0, 1, [{ _f: "0", _t: "1 0 0" }, { _f: "2", _t: "4 0 0", _r: "20" }]), shape(1)
    ]);
    const first = parseVOX(file, { frame: 0 }).mesh;
    const second = parseVOX(file, { frame: 2 }).mesh;
    expect(bounds(first.positions)).toEqual({ min: [0.5, -0.5, -0.5], max: [1.5, 0.5, 0.5] });
    expect(bounds(second.positions)).toEqual({ min: [3.5, -0.5, -0.5], max: [4.5, 0.5, 0.5] });
    expect(Array.from(second.indices.slice(0, 6))).toEqual([0, 2, 1, 0, 3, 2]);
    expectOutwardTriangles(second.positions, second.normals!, second.indices);
  });

  it("resolves packed model instances and layer visibility in a scene graph", () => {
    const models = [chunk("PACK", u32(2)), ...model([1, 1, 1], [[0, 0, 0, 1]]), ...model([1, 1, 1], [[0, 0, 0, 2]])];
    const nodes = (secondLayer: number): Uint8Array[] => [
      group(0, [1, 3]), transform(1, 2), shape(2, 0),
      transform(3, 4, [{ _t: "0 0 3" }], {}, secondLayer), shape(4, 1)
    ];
    const visible = parseVOX(vox(200, [...models, ...nodes(-1)])).mesh;
    expect(visible.indices).toHaveLength(72);
    expect(bounds(visible.positions)).toEqual({ min: [-0.5, -0.5, -0.5], max: [0.5, 3.5, 0.5] });
    const hiddenLayer = chunk("LAYR", join(i32(7), dict({ _hidden: "1" }), i32(-1)));
    const hidden = parseVOX(vox(200, [...models, hiddenLayer, ...nodes(7)])).mesh;
    expect(hidden.indices).toHaveLength(36);
    expect(bounds(hidden.positions)).toEqual({ min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] });
  });

  it("does not emit geometry for hidden branches and identifies an empty scene", () => {
    const file = vox(200, [...model([1, 1, 1], [[0, 0, 0, 1]]), transform(0, 1, [{}], { _hidden: "1" }), shape(1)]);
    const result = parseVOX(file);
    expect(result.mesh.positions).toHaveLength(0);
    expect(result.mesh.indices).toHaveLength(0);
    expect(result.mesh.diagnostics.join(" ")).toMatch(/no visible occupied voxels/i);
  });

  it("converts an owned dense volume with the same Y-up coordinates", () => {
    const colors = new Uint8Array(1024);
    colors.set([255, 30, 20, 255], 4);
    const mesh = voxelVolumeToMesh({ size: [1, 1, 2], indices: Uint8Array.of(1, 1), palette: colors });
    expect(mesh.indices).toHaveLength(60);
    expect(bounds(mesh.positions)).toEqual({ min: [0, 0, -1], max: [1, 2, 0] });
    expectOutwardTriangles(mesh.positions, mesh.normals!, mesh.indices);
    expect(() => voxelVolumeToMesh({ size: [1, 1, 2], indices: Uint8Array.of(1), palette: colors })).toThrow(/VOX_VOLUME/);
  });

  it("rejects invalid headers, version, chunk boundaries and malformed voxel records", () => {
    expect(() => parseVOX(new Uint8Array(5))).toThrow(/VOX_HEADER/);
    expect(() => parseVOX(vox(149, model([1, 1, 1], [[0, 0, 0, 1]])))).toThrow(/VOX_VERSION/);
    const malformed = source();
    new DataView(malformed.buffer).setUint32(16, 0xffffffff, true);
    expect(() => parseVOX(malformed)).toThrow(/VOX_CHUNK/);
    expect(() => parseVOX(vox(150, [chunk("XYZI", join(u32(1), Uint8Array.of(0, 0, 0, 1)))]))).toThrow(/requires SIZE/);
    expect(() => parseVOX(vox(150, model([2, 1, 1], [[0, 0, 0, 1], [0, 0, 0, 2]])))).toThrow(/duplicate voxel/);
    expect(() => parseVOX(vox(150, model([1, 1, 1], [[1, 0, 0, 1]])))).toThrow(/outside its bounds/);
    expect(() => parseVOX(vox(150, model([1, 1, 1], [[0, 0, 0, 0]])))).toThrow(/empty palette/);
  });

  it("rejects malformed scene graphs, dictionary bytes and rotations", () => {
    const base = model([1, 1, 1], [[0, 0, 0, 1]]);
    expect(() => parseVOX(vox(200, [...base, transform(0, 0)]))).toThrow(/cyclic/);
    expect(() => parseVOX(vox(200, [...base, transform(0, 1, [{ _r: "0" }]), shape(1)]))).toThrow(/invalid rotation axes/);
    const badDictionary = join(i32(0), u32(1), u32(2), Uint8Array.of(0xc3, 0x28), u32(1), text("x"));
    expect(() => parseVOX(vox(200, [...base, chunk("nTRN", badDictionary)]))).toThrow(/invalid UTF-8/);
    expect(() => parseVOX(vox(200, [...base, group(0, [9])]))).toThrow(/missing child/);
  });

  it("enforces file, voxel, node, generated-vertex, index and output budgets before allocation", () => {
    const one = source(), pair = vox(150, model([2, 1, 1], [[0, 0, 0, 1], [1, 0, 0, 1]]));
    expect(() => parseVOX(one, { maxFileBytes: one.length - 1 })).toThrow(/VOX_FILE_LIMIT/);
    expect(() => parseVOX(pair, { maxVoxelCount: 1 })).toThrow(/VOX_VOXEL_LIMIT/);
    expect(() => parseVOX(vox(200, [...model([1, 1, 1], [[0, 0, 0, 1]]), transform(0, 1), shape(1)]), { maxNodes: 1 })).toThrow(/VOX_NODE_LIMIT/);
    expect(() => parseVOX(one, { maxElements: 23 })).toThrow(/VOX_ALLOCATION_LIMIT/);
    expect(() => parseVOX(one, { maxListItems: 35 })).toThrow(/VOX_ALLOCATION_LIMIT/);
    expect(() => parseVOX(one, { maxOutputBytes: 1103 })).toThrow(/VOX_ALLOCATION_LIMIT/);
    expect(() => parseVOX(one, { frame: -1 })).toThrow(/VOX_FRAME/);
    expect(() => createVOXFormatAdapter({ maxOutputBytes: 0 })).toThrow(/VOX_INVALID_LIMIT/);
    expect(() => createVOXFormatAdapter({ maxOutputBytes: Infinity })).toThrow(/VOX_INVALID_LIMIT/);
    expect(() => createVOXFormatAdapter({ maxOutputBytes: NaN })).toThrow(/VOX_INVALID_LIMIT/);
  });
});

describe("VOX format adapter and version provenance", () => {
  it.each([150, 200])("selects and mounts version %s with a GLTF-backed lease", async (version) => {
    const adapter = createVOXFormatAdapter();
    const registry = new FormatRegistry(); registry.register(adapter);
    const lease = await registry.load<GLTFAsset>({ url: dataUrl(source(version)) }, new LoadContext(), {
      format: "vox", formatMetadata: { adapter: "vox", version: String(version) }
    });
    expect(lease.renderable).toBe(true);
    expect(lease.gltfRenderable).toBe(true);
    expect(lease.asset.meshes.length).toBeGreaterThan(0);
    expect(lease.asset.loaderDiagnostics.features).toContain("native-vox");
    const asset = lease.asset;
    await lease.dispose(); await lease.dispose();
    expect(asset.disposed).toBe(true);
    expect(() => asset.createScene()).toThrow(/disposed/i);
  });

  it("preserves alpha through the native mesh conversion", async () => {
    const file = vox(150, [...model([1, 1, 1], [[0, 0, 0, 1]]), palette([255, 100, 10, 80])]);
    const registry = new FormatRegistry(); registry.register(createVOXFormatAdapter());
    const lease = await registry.load<GLTFAsset>({ url: dataUrl(file) }, new LoadContext(), { format: "vox" });
    try { expect(lease.asset.materials[0]!.alphaMode).toBe("BLEND"); }
    finally { await lease.dispose(); }
  });

  it("rejects a supported but incorrect claimed version and disposes the parsed asset", async () => {
    const adapter = createVOXFormatAdapter();
    const dispose = vi.spyOn(adapter.loader as VOXLoader, "dispose");
    const registry = new FormatRegistry(); registry.register(adapter);
    await expect(registry.load<GLTFAsset>({ url: dataUrl(source(150)) }, new LoadContext(), {
      format: "vox", formatMetadata: { version: "200" }
    })).rejects.toThrow(/VOX_VERSION_MISMATCH/);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose.mock.calls[0]![0].disposed).toBe(true);
  });

  it("accepts a genuine alternate loader only when that loader parsed the returned asset", async () => {
    const registry = new FormatRegistry(); registry.register(createVOXFormatAdapter());
    const alternate = new VOXLoader();
    const lease = await registry.load<GLTFAsset>({ url: dataUrl(source(200)) }, new LoadContext(), {
      format: "vox", formatMetadata: { version: "200" }
    }, alternate);
    expect(lease.asset.disposed).toBe(false);
    await lease.dispose();
    expect(lease.asset.disposed).toBe(true);
  });

  it("does not transfer version provenance when an override returns another loader's asset", async () => {
    const origin = new VOXLoader();
    const foreign = await origin.load({ url: dataUrl(source(150)) }, new LoadContext());
    const dispose = vi.fn((asset: GLTFAsset) => origin.dispose(asset));
    const override: AssetLoader<GLTFAsset> = { type: "vox", canLoad: () => true, load: async () => foreign, dispose };
    const registry = new FormatRegistry(); registry.register(createVOXFormatAdapter());
    await expect(registry.load<GLTFAsset>({ url: dataUrl(source(150)) }, new LoadContext(), {
      format: "vox", formatMetadata: { version: "150" }
    }, override)).rejects.toThrow(/VOX_VERSION_UNVERIFIED/);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(foreign.disposed).toBe(true);
  });

  it("fails closed for a custom parser even when it reports a supported version", async () => {
    const custom = new VOXLoader();
    const original = custom.parse.bind(custom);
    custom.parse = (input) => ({ ...original(input), version: 200 });
    const registry = new FormatRegistry(); registry.register(createVOXFormatAdapter());
    await expect(registry.load<GLTFAsset>({ url: dataUrl(source(150)) }, new LoadContext(), {
      format: "vox", formatMetadata: { version: "200" }
    }, custom)).rejects.toThrow(/VOX_VERSION_UNVERIFIED/);
  });

  it("fails closed when the selected loader's load method has been wrapped", async () => {
    const custom = new VOXLoader();
    const original = custom.load.bind(custom);
    custom.load = (request, context) => original(request, context);
    const registry = new FormatRegistry(); registry.register(createVOXFormatAdapter());
    await expect(registry.load<GLTFAsset>({ url: dataUrl(source(150)) }, new LoadContext(), {
      format: "vox", formatMetadata: { version: "150" }
    }, custom)).rejects.toThrow(/VOX_VERSION_UNVERIFIED/);
  });

  it("fails closed when the converter's load method has been replaced", async () => {
    vi.spyOn(GLTFLoader.prototype, "load");
    const registry = new FormatRegistry(); registry.register(createVOXFormatAdapter());
    await expect(registry.load<GLTFAsset>({ url: dataUrl(source(150)) }, new LoadContext(), {
      format: "vox", formatMetadata: { version: "150" }
    })).rejects.toThrow(/VOX_VERSION_UNVERIFIED/);
  });

  it("keeps unversioned custom loader behavior available", async () => {
    const custom = new VOXLoader();
    const original = custom.parse.bind(custom);
    custom.parse = (input) => original(input);
    const registry = new FormatRegistry(); registry.register(createVOXFormatAdapter());
    const lease = await registry.load<GLTFAsset>({ url: dataUrl(source()) }, new LoadContext(), { format: "vox" }, custom);
    expect(lease.asset.meshes.length).toBeGreaterThan(0);
    await lease.dispose();
  });

  it("keeps the admitted adapter limits fixed when its options object is later mutated", async () => {
    const options = { maxVoxelCount: 1 };
    const adapter = createVOXFormatAdapter(options);
    options.maxVoxelCount = 2;
    const registry = new FormatRegistry(); registry.register(adapter);
    const pair = vox(150, model([2, 1, 1], [[0, 0, 0, 1], [1, 0, 0, 1]]));
    await expect(registry.load({ url: dataUrl(pair) }, new LoadContext(), { format: "vox" })).rejects.toThrow(/VOX_VOXEL_LIMIT/);
  });

  it("captures request URL, callback and mutable loader limits before pending I/O", async () => {
    const originalFetch = globalThis.fetch;
    const initial = vi.fn(), replacement = vi.fn();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const file = source();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("data:")) return originalFetch(input, init);
      await gate;
      return new Response(file.slice().buffer as ArrayBuffer, { headers: { "content-type": "application/octet-stream" } });
    }));
    const limits = { maxVoxelCount: 1 };
    const loader = new VOXLoader(undefined, limits);
    const request: { url: string; onProgress: NonNullable<AssetLoadRequest["onProgress"]> } = {
      url: "https://assets.example.test/original.vox", onProgress: initial
    };
    const pending = loader.load(request, new LoadContext());
    request.url = "https://assets.example.test/changed.vox";
    request.onProgress = replacement;
    limits.maxVoxelCount = 0;
    release();
    const asset = await pending;
    try {
      expect(asset.url).toBe("https://assets.example.test/original.vox");
      expect(initial).toHaveBeenCalled();
      expect(replacement).not.toHaveBeenCalled();
    } finally { loader.dispose(asset); }
  });

  it("releases an asset through the converter that created it", async () => {
    const creator = new GLTFLoader();
    const dispose = vi.spyOn(creator, "dispose");
    const loader = new VOXLoader(creator);
    const asset = await loader.load({ url: dataUrl(source()) }, new LoadContext());
    // Simulate mutable JavaScript consumers changing an otherwise readonly field.
    (loader as unknown as { gltfLoader: GLTFLoader }).gltfLoader = new GLTFLoader();
    loader.dispose(asset); loader.dispose(asset);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(asset.disposed).toBe(true);
  });

  it("disposes its converted asset when the completion callback aborts", async () => {
    const converter = new GLTFLoader();
    const dispose = vi.spyOn(converter, "dispose");
    const loader = new VOXLoader(converter);
    const controller = new AbortController();
    const reason = new Error("synthetic cancellation");
    await expect(loader.load({ url: dataUrl(source()), signal: controller.signal,
      onProgress: (event) => { if (event.phase === "complete") controller.abort(reason); }
    }, new LoadContext())).rejects.toBe(reason);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose.mock.calls[0]![0].disposed).toBe(true);
  });
});
