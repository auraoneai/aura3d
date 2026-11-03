import { gzipSync, gunzipSync, zstdCompressSync, zstdDecompressSync } from "node:zlib";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AssetManager } from "../../packages/assets/src/AssetManager";
import { LoadContext } from "../../packages/assets/src/LoadContext";
import { GaussianSplatLoader, parseGaussianSplat, type GaussianSplatData } from "../../packages/assets/src/loaders/GaussianSplatLoader";

// Fixtures are generated from numeric values in this test, with no external asset or engine data.
function splat(): Uint8Array {
  const b = new Uint8Array(64); const v = new DataView(b.buffer);
  for (let i = 0; i < 2; i++) {
    const o = i * 32;
    [i + 1, 2, -3, 1, 2, 3].forEach((x, j) => v.setFloat32(o + j * 4, x, true));
    b.set([255, 128, 0, 128, 255, 128, 128, 128], o + 24);
  }
  return b;
}
function ply(binary?: "le" | "be", degree = 1): Uint8Array {
  const rest = ((degree + 1) ** 2 - 1) * 3;
  const names = ["x", "y", "z", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3", "opacity", "f_dc_0", "f_dc_1", "f_dc_2", ...Array.from({ length: rest }, (_, i) => `f_rest_${i}`)];
  const values = [1, 2, -3, 0, Math.log(2), Math.log(3), 1, 0, 0, 0, 0, 1, 0, -1, ...Array.from({ length: rest }, (_, i) => i / 10)];
  const header = `ply\nformat ${binary ? binary === "le" ? "binary_little_endian" : "binary_big_endian" : "ascii"} 1.0\ncomment authored test fixture\nelement vertex 1\n${names.map((n) => `property float ${n}\n`).join("")}end_header\n`;
  const h = new TextEncoder().encode(header);
  if (!binary) return new TextEncoder().encode(header + values.join(" ") + "\n");
  const bytes = new Uint8Array(h.length + values.length * 4); bytes.set(h); const view = new DataView(bytes.buffer);
  values.forEach((value, i) => view.setFloat32(h.length + i * 4, value, binary === "le")); return bytes;
}
// Header shape follows the public compressed-PLY overview and independent
// field-name report; the zero body is synthetic and is not a decoded fixture.
function compressedPlyDeclaration(count = 1): Uint8Array {
  const chunk = ["min_x", "min_y", "min_z", "max_x", "max_y", "max_z", "min_scale_x", "min_scale_y", "min_scale_z", "max_scale_x", "max_scale_y", "max_scale_z"];
  const fields = ["packed_position", "packed_rotation", "packed_scale", "packed_color"];
  const header = `ply\nformat binary_little_endian 1.0\nelement chunk 1\n${chunk.map((field) => `property float ${field}\n`).join("")}element vertex ${count}\n${fields.map((field) => `property uint ${field}\n`).join("")}end_header\n`;
  const bytes = new Uint8Array(new TextEncoder().encode(header).length + 48 + count * 16);
  bytes.set(new TextEncoder().encode(header)); return bytes;
}
function gltf(external = false): { bytes: Uint8Array; binary: Uint8Array } {
  const values = [1, 2, -3, 1, 2, 3, 0, 0, 0, 1, 0.5, 1, 0, -1, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  const binary = new Uint8Array(values.length * 4), view = new DataView(binary.buffer);
  values.forEach((n, i) => view.setFloat32(i * 4, n, true));
  const sizes = [3, 3, 4, 1, 3, 3, 3, 3]; let offset = 0;
  const bufferViews = sizes.map((size) => { const result = { buffer: 0, byteOffset: offset, byteLength: size * 4 }; offset += size * 4; return result; });
  const accessors = sizes.map((size, i) => ({ bufferView: i, componentType: 5126, count: 1, type: size === 1 ? "SCALAR" : `VEC${size}` }));
  const prefix = "KHR_gaussian_splatting:";
  const json = { asset: { version: "2.0" }, buffers: [{ byteLength: binary.length, uri: external ? "points.bin" : `data:application/octet-stream;base64,${Buffer.from(binary).toString("base64")}` }], bufferViews, accessors,
    meshes: [{ primitives: [{ mode: 0, extensions: { KHR_gaussian_splatting: { kernel: "ellipse", colorSpace: "lin_rec709_display" } }, attributes: { POSITION: 0, [`${prefix}SCALE`]: 1, [`${prefix}ROTATION`]: 2, [`${prefix}OPACITY`]: 3, [`${prefix}SH_DEGREE_0_COEF_0`]: 4, [`${prefix}SH_DEGREE_1_COEF_0`]: 5, [`${prefix}SH_DEGREE_1_COEF_1`]: 6, [`${prefix}SH_DEGREE_1_COEF_2`]: 7 } }] }] };
  return { bytes: new TextEncoder().encode(JSON.stringify(json)), binary };
}
function spz(version: number, degree = 1): Uint8Array {
  const pos = version === 1 ? [0, 60, 0, 192, 0, 56] : [0, 16, 0, 0, 224, 255, 0, 8, 0];
  const rot = version < 3 ? [128, 128, 128] : [0, 0, 0, 192];
  const attrs = [pos, [128], [128, 64, 192], [160, 176, 144], rot, Array.from({ length: ((degree + 1) ** 2 - 1) * 3 }, (_, i) => 128 + i)];
  if (version === 4) {
    const streams = attrs.filter((a) => a.length).map((a) => zstdCompressSync(Uint8Array.from(a)));
    const offset = 32 + streams.length * 16, file = new Uint8Array(offset + streams.reduce((n, s) => n + s.length, 0)), view = new DataView(file.buffer);
    view.setUint32(0, 0x5053474e, true); view.setUint32(4, 4, true); view.setUint32(8, 1, true); file[12] = degree; file[13] = 12; file[15] = streams.length; view.setUint32(16, 32, true);
    let p = offset; let index = 0;
    for (const stream of streams) { view.setBigUint64(32 + index * 16, BigInt(stream.length), true); view.setBigUint64(40 + index * 16, BigInt(attrs.filter((a) => a.length)[index]!.length), true); file.set(stream, p); p += stream.length; index++; }
    return file;
  }
  const payload = new Uint8Array(16 + attrs.reduce((n, a) => n + a.length, 0)); const view = new DataView(payload.buffer);
  view.setUint32(0, 0x5053474e, true); view.setUint32(4, version, true); view.setUint32(8, 1, true); payload[12] = degree; payload[13] = 12;
  let offset = 16; for (const attr of attrs) { payload.set(attr, offset); offset += attr.length; }
  return gzipSync(payload);
}
function compressedSpzV4(count = 512): Uint8Array {
  const repeat = (values: number[]) => Uint8Array.from({ length: count * values.length }, (_, i) => values[i % values.length]!);
  const attributes = [repeat([0, 16, 0, 0, 224, 255, 0, 8, 0]), repeat([128]), repeat([128, 64, 192]), repeat([160, 176, 144]), repeat([0, 0, 0, 192]), repeat([128, 129, 130, 131, 132, 133, 134, 135, 136])];
  const streams = attributes.map((attribute) => zstdCompressSync(attribute));
  // The repeating nine-byte position sequence cannot be represented as raw
  // or single-byte RLE and must produce an actual compressed Zstd block.
  expect(streams[0]!.length).toBeLessThan(attributes[0]!.length);
  const headerSize = 32 + streams.length * 16, file = new Uint8Array(headerSize + streams.reduce((sum, stream) => sum + stream.length, 0));
  const view = new DataView(file.buffer); view.setUint32(0, 0x5053474e, true); view.setUint32(4, 4, true); view.setUint32(8, count, true);
  file[12] = 1; file[13] = 12; file[15] = streams.length; view.setUint32(16, 32, true);
  let offset = headerSize;
  streams.forEach((stream, i) => { view.setBigUint64(32 + i * 16, BigInt(stream.length), true); view.setBigUint64(40 + i * 16, BigInt(attributes[i]!.length), true); file.set(stream, offset); offset += stream.length; });
  return file;
}
function spzGltf(version = 2): { document: any; binary: Uint8Array } {
  const binary = spz(version), prefix = "KHR_gaussian_splatting:";
  const semantics = ["POSITION", "COLOR_0", `${prefix}SCALE`, `${prefix}ROTATION`, ...Array.from({ length: 3 }, (_, i) => `${prefix}SH_DEGREE_1_COEF_${i}`)];
  const accessors = semantics.map((semantic) => ({ componentType: 5126, count: 1, type: semantic === "COLOR_0" || semantic.endsWith(":ROTATION") ? "VEC4" : "VEC3" }));
  const attributes = Object.fromEntries(semantics.map((semantic, i) => [semantic, i]));
  const document = {
    asset: { version: "2.0" }, buffers: [{ byteLength: binary.length, uri: `data:application/octet-stream;base64,${Buffer.from(binary).toString("base64")}` }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.length }], accessors,
    meshes: [{ primitives: [{ mode: 0, attributes, extensions: { KHR_gaussian_splatting: { kernel: "ellipse", colorSpace: "lin_rec709_display", extensions: { KHR_gaussian_splatting_compression_spz_2: { bufferView: 0 } } } } }] }]
  };
  return { document, binary };
}

describe("native Gaussian splat imports", () => {
  it("decodes standard packed SPLAT records and owns conservative bounds", async () => {
    const bytes = splat(), result = await parseGaussianSplat(bytes, "splat"); bytes.fill(0);
    expect(result.count).toBe(2); expect([...result.positions]).toEqual([1, 2, -3, 2, 2, -3]);
    expect([...result.rotations]).toEqual([0, 0, 0, 1, 0, 0, 0, 1]);
    expect(result.opacities[0]).toBeCloseTo(128 / 255); expect(result.metadata.colorSpace).toBe("srgb_rec709_display");
    expect((await parseGaussianSplat(splat(), "splat", { defaultColorSpace: "lin_rec709_display" })).metadata.colorSpace).toBe("lin_rec709_display");
    expect(result.bounds).toEqual({ min: [-8, -7, -12], max: [11, 11, 6] });
  });
  it.each([undefined, "le", "be"] as const)("decodes PLY %s, preserving channel-major SH values", async (format) => {
    const result = await parseGaussianSplat(ply(format), "ply");
    expect(result.positions).toEqual(new Float32Array([1, 2, -3])); expect(result.scales[1]).toBeCloseTo(2); expect(result.scales[2]).toBeCloseTo(3);
    expect(result.colors[0]).toBeCloseTo(0.78209479); expect(result.opacities[0]).toBeCloseTo(0.5);
    expect([...result.sphericalHarmonics!]).toEqual(expect.arrayContaining([expect.closeTo(0), expect.closeTo(0.3), expect.closeTo(0.6)]));
    expect(result.sphericalHarmonics![1]).toBeCloseTo(0.3); expect(result.sphericalHarmonics![2]).toBeCloseTo(0.6); expect(result.sphericalHarmonics![3]).toBeCloseTo(0.1);
  });
  it.each([0, 1, 2, 3, 4])("validates all supported PLY spherical-harmonic degrees: %i", async (degree) => {
    const result = await parseGaussianSplat(ply("le", degree), "ply"), perChannel = (degree + 1) ** 2 - 1;
    expect(result.shDegree).toBe(degree);
    if (degree === 0) expect(result.sphericalHarmonics).toBeUndefined();
    else {
      expect(result.sphericalHarmonics).toHaveLength(perChannel * 3);
      expect(result.sphericalHarmonics![1]).toBeCloseTo(perChannel / 10);
      expect(result.sphericalHarmonics![perChannel * 3 - 1]).toBeCloseTo((perChannel * 3 - 1) / 10);
    }
  });
  it("recognizes compressed PLY without pretending its undocumented packed payload is native", async () => {
    const compressed = compressedPlyDeclaration();
    await expect(parseGaussianSplat(compressed, "ply")).rejects.toThrow(/compressed PLY.*registered compressedPly decoder/);
    const ordinary = await parseGaussianSplat(ply("le"), "ply");
    const codec = vi.fn(async (_bytes: Uint8Array) => ordinary);
    const decoded = await parseGaussianSplat(compressed, "ply", { codecs: { compressedPly: codec } });
    expect(codec).toHaveBeenCalledTimes(1); expect(codec.mock.calls[0]?.[0]).toBe(compressed);
    expect(decoded.positions).toEqual(ordinary.positions); expect(decoded.positions).not.toBe(ordinary.positions);
    codec.mockClear(); await parseGaussianSplat(ply("le"), "ply", { codecs: { compressedPly: codec } });
    expect(codec).not.toHaveBeenCalled();
    const unrelated = new TextDecoder().decode(compressed.subarray(0, compressed.indexOf(0))).replace("packed_color", "packed_custom");
    await expect(parseGaussianSplat(new TextEncoder().encode(unrelated), "ply", { codecs: { compressedPly: codec } })).rejects.toThrow(/missing PLY splat property/);
    expect(codec).not.toHaveBeenCalled();
  });
  it("checks compressed PLY budgets and decoder results before accepting codec data", async () => {
    const compressed = compressedPlyDeclaration(), ordinary = await parseGaussianSplat(ply("le"), "ply");
    const codec = vi.fn(async (_bytes: Uint8Array) => ordinary);
    await expect(parseGaussianSplat(compressedPlyDeclaration(2), "ply", { maxPoints: 1, codecs: { compressedPly: codec } })).rejects.toThrow(/count/);
    await expect(parseGaussianSplat(compressed, "ply", { maxDecodedBytes: 55, codecs: { compressedPly: codec } })).rejects.toThrow(/decoded byte limit/);
    expect(codec).not.toHaveBeenCalled();
    await expect(parseGaussianSplat(compressed, "ply", { codecs: { compressedPly: () => ({ ...ordinary, metadata: { ...ordinary.metadata, format: "spz" } }) } })).rejects.toThrow(/mismatched format/);
    await expect(parseGaussianSplat(compressed, "ply", { codecs: { compressedPly: () => ({ ...ordinary, opacities: new Float32Array([2]) }) } })).rejects.toThrow(/opacity/);
    const two = await parseGaussianSplat(splat(), "splat");
    await expect(parseGaussianSplat(compressed, "ply", { codecs: { compressedPly: () => ({ ...two, metadata: { ...two.metadata, format: "ply" } }) } })).rejects.toThrow(/count does not match/);
    const controller = new AbortController();
    const pending = parseGaussianSplat(compressed, "ply", { signal: controller.signal, codecs: { compressedPly: async () => { await Promise.resolve(); return ordinary; } } });
    controller.abort(); await expect(pending).rejects.toThrow();
  });
  it("decodes KHR Gaussian splat glTF attributes and resolves external buffers", async () => {
    const embedded = await parseGaussianSplat(gltf().bytes, "gltf");
    expect([...embedded.positions]).toEqual([1, 2, -3]); expect(embedded.metadata.colorSpace).toBe("lin_rec709_display");
    expect(embedded.metadata.version).toBe("2.0"); expect(embedded.metadata.coordinateSystem).toBe("LUF"); expect(embedded.metadata.extras).toEqual({ meshIndex: 0, primitiveIndex: 0 });
    expect(embedded.colors[0]).toBeCloseTo(0.78209479); expect(embedded.sphericalHarmonics![4]).toBeCloseTo(0.5);
    const source = gltf(true); let uri = "";
    const external = await parseGaussianSplat(source.bytes, "gltf", { resolveUri: async (value) => { uri = value; return source.binary; } });
    expect(uri).toBe("points.bin"); expect(external.positions).toEqual(embedded.positions);
  });
  it("reads a real GLB JSON/BIN container with the same splat primitive", async () => {
    const fixture = gltf(true), document = JSON.parse(new TextDecoder().decode(fixture.bytes));
    delete document.buffers[0].uri;
    const json = new TextEncoder().encode(JSON.stringify(document));
    const jsonSize = (json.length + 3) & ~3, binSize = (fixture.binary.length + 3) & ~3;
    const glb = new Uint8Array(12 + 8 + jsonSize + 8 + binSize), view = new DataView(glb.buffer);
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, glb.length, true);
    view.setUint32(12, jsonSize, true); view.setUint32(16, 0x4e4f534a, true); glb.fill(32, 20, 20 + jsonSize); glb.set(json, 20);
    const binHeader = 20 + jsonSize; view.setUint32(binHeader, binSize, true); view.setUint32(binHeader + 4, 0x004e4942, true); glb.set(fixture.binary, binHeader + 8);
    const result = await parseGaussianSplat(glb, "glb"); expect(result.positions).toEqual(new Float32Array([1, 2, -3])); expect(result.metadata.coordinateSystem).toBe("LUF");
    view.setUint32(8, glb.length - 1, true); await expect(parseGaussianSplat(glb, "glb")).rejects.toThrow(/header/);
  });
  it("keeps uncompressed glTF splat attributes in mesh-local space", async () => {
    const fixture = gltf(), document = JSON.parse(new TextDecoder().decode(fixture.bytes));
    document.nodes = [{ mesh: 0, translation: [9, 8, 7], rotation: [0, 1, 0, 0], scale: [2, 2, 2] }];
    document.scenes = [{ nodes: [0] }]; document.scene = 0;
    const result = await parseGaussianSplat(new TextEncoder().encode(JSON.stringify(document)), "gltf");
    expect([...result.positions]).toEqual([1, 2, -3]); expect([...result.rotations]).toEqual([0, 0, 0, 1]);
    expect(result.metadata.coordinateSystem).toBe("LUF");
  });
  it("resolves nested transforms and repeated splat nodes without duplicating cloud arrays", async () => {
    const fixture = gltf(), document = JSON.parse(new TextDecoder().decode(fixture.bytes));
    const half = Math.SQRT1_2;
    document.nodes = [
      { translation: [10, 0, 0], rotation: [0, 0, half, half], children: [1, 2] },
      { mesh: 0, translation: [1, 2, 3], scale: [2, 3, 1] },
      { mesh: 0, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 0, 0, 1] },
      { mesh: 0, translation: [100, 100, 100] }
    ];
    document.scenes = [{ nodes: [0] }, { nodes: [3] }]; document.scene = 0;
    const bytes = new TextEncoder().encode(JSON.stringify(document));
    const result = await parseGaussianSplat(bytes, "gltf", { maxPoints: 2 });
    expect(result.count).toBe(1); expect([...result.positions]).toEqual([1, 2, -3]);
    expect(result.instances?.map((instance) => instance.nodeIndex)).toEqual([1, 2]);
    const expected = [
      [0, 2, 0, 0, -3, 0, 0, 0, 0, 0, 1, 0, 8, 1, 3, 1],
      [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 10, 4, 0, 1]
    ];
    for (let instance = 0; instance < expected.length; instance++) for (let i = 0; i < 16; i++) expect(result.instances![instance]!.worldMatrix[i]).toBeCloseTo(expected[instance]![i]!);
    expect(result.bounds).toEqual({ min: [-8, -7, -12], max: [10, 11, 6] });
    for (let i = 0; i < 3; i++) { expect(result.sceneBounds!.min[i]).toBeCloseTo([-25, -15, -12][i]!); expect(result.sceneBounds!.max[i]).toBeCloseTo([29, 21, 9][i]!); }
    const secondScene = await parseGaussianSplat(bytes, "gltf", { gltfScene: 1 });
    expect(secondScene.instances?.map((instance) => instance.nodeIndex)).toEqual([3]);
    expect(secondScene.instances![0]!.worldMatrix.slice(12, 15)).toEqual([100, 100, 100]);
    await expect(parseGaussianSplat(bytes, "gltf", { maxPoints: 1 })).rejects.toThrow(/instances exceed point limit/);
    await expect(parseGaussianSplat(bytes, "gltf", { maxDecodedBytes: 512 })).rejects.toThrow(/scene node budget/);
  });
  it("selects active-scene splats and retains distinct mesh primitives", async () => {
    const fixture = gltf(), document = JSON.parse(new TextDecoder().decode(fixture.bytes));
    document.meshes.push(structuredClone(document.meshes[0]));
    document.nodes = [{ mesh: 0, translation: [2, 0, 0] }, { mesh: 1, translation: [5, 0, 0] }];
    document.scenes = [{ nodes: [1] }, { nodes: [0, 1] }]; document.scene = 0;
    const bytes = new TextEncoder().encode(JSON.stringify(document));
    const active = await parseGaussianSplat(bytes, "gltf");
    expect(active.metadata.extras?.meshIndex).toBe(1); expect(active.instances![0]!.worldMatrix[12]).toBe(5);
    const both = await parseGaussianSplat(bytes, "gltf", { gltfScene: 1 });
    expect(both.metadata.extras?.meshIndex).toBe(0); expect(both.instances![0]!.worldMatrix[12]).toBe(2);
    expect(both.additionalClouds).toHaveLength(1); expect(both.additionalClouds![0]!.metadata.extras?.meshIndex).toBe(1);
    expect(both.additionalClouds![0]!.instances![0]!.worldMatrix[12]).toBe(5);
    const selected = await parseGaussianSplat(bytes, "gltf", { gltfScene: 1, gltfMesh: 0 });
    expect(selected.instances?.map((instance) => instance.nodeIndex)).toEqual([0]);
    const absent = await parseGaussianSplat(bytes, "gltf", { gltfMesh: 0 });
    expect(absent.instances).toEqual([]); expect(absent.sceneBounds).toBeUndefined();
  });
  it("owns distinct cloud data, material metadata, repeated nodes and aggregate bounds within one budget", async () => {
    const fixture = gltf(true), document = JSON.parse(new TextDecoder().decode(fixture.bytes)), start = fixture.binary.length;
    const binary = new Uint8Array(start + 12); binary.set(fixture.binary); const view = new DataView(binary.buffer);
    [4, 5, 6].forEach((value, i) => view.setFloat32(start + i * 4, value, true));
    document.buffers[0].byteLength = binary.length;
    document.bufferViews.push({ buffer: 0, byteOffset: start, byteLength: 12 });
    document.accessors.push({ bufferView: 8, componentType: 5126, count: 1, type: "VEC3" });
    document.materials = [{ name: "Painted", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.1, 0.2, 0.3, 0.4] } }, { name: "Fallback points", alphaMode: "BLEND" }];
    document.meshes[0].primitives[0].material = 0;
    const second = structuredClone(document.meshes[0].primitives[0]);
    second.attributes.POSITION = 8; second.material = 1; second.extensions.KHR_gaussian_splatting.colorSpace = "srgb_rec709_display";
    document.meshes[0].primitives.push(second);
    document.meshes.push({ primitives: [structuredClone(document.meshes[0].primitives[0])] });
    document.nodes = [{ mesh: 0 }, { mesh: 0, translation: [10, 0, 0] }, { mesh: 1, translation: [0, 20, 0] }];
    document.scenes = [{ nodes: [0, 1, 2] }];
    const bytes = new TextEncoder().encode(JSON.stringify(document)), resolveUri = vi.fn(async () => binary);
    const result = await parseGaussianSplat(bytes, "gltf", { resolveUri, maxPoints: 5, maxDecodedBytes: 916 });
    expect(resolveUri).toHaveBeenCalledTimes(1);
    expect(result.metadata.extras).toMatchObject({ meshIndex: 0, primitiveIndex: 0, materialIndex: 0, materialName: "Painted", sourceMaterial: { doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.1, 0.2, 0.3, 0.4] } } });
    expect(result.additionalClouds).toHaveLength(2);
    const [secondCloud, thirdCloud] = result.additionalClouds!;
    expect(secondCloud!.metadata.extras).toMatchObject({ meshIndex: 0, primitiveIndex: 1, materialIndex: 1, materialName: "Fallback points", sourceMaterial: { alphaMode: "BLEND" } });
    expect(secondCloud!.metadata.colorSpace).toBe("srgb_rec709_display"); expect(thirdCloud!.metadata.colorSpace).toBe("lin_rec709_display");
    expect([...secondCloud!.positions]).toEqual([4, 5, 6]); expect(secondCloud!.instances?.map((instance) => instance.nodeIndex)).toEqual([0, 1]);
    expect(thirdCloud!.instances?.map((instance) => instance.nodeIndex)).toEqual([2]); expect(secondCloud!.additionalClouds).toBeUndefined();
    expect(secondCloud!.positions).not.toBe(result.positions); expect(thirdCloud!.positions).not.toBe(result.positions);
    expect(result.assetBounds).toEqual({ min: [-8, -7, -12], max: [23, 31, 15] });
    binary.fill(0); expect([...secondCloud!.positions]).toEqual([4, 5, 6]);
  });
  it("enforces point and decoded-byte limits across all glTF clouds and instances", async () => {
    const fixture = gltf(), document = JSON.parse(new TextDecoder().decode(fixture.bytes));
    document.meshes[0].primitives.push(structuredClone(document.meshes[0].primitives[0]));
    document.meshes.push({ primitives: [structuredClone(document.meshes[0].primitives[0])] });
    document.nodes = [{ mesh: 0 }, { mesh: 0 }, { mesh: 1 }]; document.scenes = [{ nodes: [0, 1, 2] }];
    const bytes = new TextEncoder().encode(JSON.stringify(document));
    expect((await parseGaussianSplat(bytes, "gltf", { maxPoints: 5, maxDecodedBytes: 916 })).additionalClouds).toHaveLength(2);
    await expect(parseGaussianSplat(bytes, "gltf", { maxPoints: 4 })).rejects.toThrow(/aggregate splat budget|count exceeds|instances exceed point limit/);
    await expect(parseGaussianSplat(bytes, "gltf", { maxDecodedBytes: 800 })).rejects.toThrow(/decoded byte limit/);
    document.meshes[0].primitives[1].material = 99;
    await expect(parseGaussianSplat(new TextEncoder().encode(JSON.stringify(document)), "gltf")).rejects.toThrow(/material index/);
  });
  it("decodes mixed uncompressed and draft SPZ glTF primitives without losing either cloud", async () => {
    const fixture = gltf(true), document = JSON.parse(new TextDecoder().decode(fixture.bytes));
    const compressed = spzGltf(), binary = new Uint8Array(fixture.binary.length + compressed.binary.length);
    binary.set(fixture.binary); binary.set(compressed.binary, fixture.binary.length);
    document.buffers[0] = { byteLength: binary.length, uri: `data:application/octet-stream;base64,${Buffer.from(binary).toString("base64")}` };
    document.bufferViews.push({ buffer: 0, byteOffset: fixture.binary.length, byteLength: compressed.binary.length });
    const primitive = structuredClone(compressed.document.meshes[0].primitives[0]);
    for (const semantic of Object.keys(primitive.attributes)) primitive.attributes[semantic] += document.accessors.length;
    primitive.extensions.KHR_gaussian_splatting.extensions.KHR_gaussian_splatting_compression_spz_2.bufferView = 8;
    document.accessors.push(...compressed.document.accessors); document.meshes[0].primitives.push(primitive);
    document.nodes = [{ mesh: 0, translation: [10, 0, 0] }]; document.scenes = [{ nodes: [0] }];
    const result = await parseGaussianSplat(new TextEncoder().encode(JSON.stringify(document)), "gltf");
    expect([...result.positions]).toEqual([1, 2, -3]); expect(result.additionalClouds).toHaveLength(1);
    const decoded = result.additionalClouds![0]!;
    expect([...decoded.positions]).toEqual([-1, -2, -0.5]); expect(decoded.metadata.extras?.compression).toBe("KHR_gaussian_splatting_compression_spz_2");
    expect(decoded.instances![0]!.worldMatrix[12]).toBe(10); expect(decoded.sphericalHarmonics![8]).toBeCloseTo(-8 / 128);
  });
  it("rejects cyclic, malformed and overflowing glTF scene transforms", async () => {
    const fixture = gltf(), document = JSON.parse(new TextDecoder().decode(fixture.bytes));
    const encode = () => new TextEncoder().encode(JSON.stringify(document));
    document.scenes = [{ nodes: [0] }]; document.nodes = [{ children: [1] }, { mesh: 0, children: [0] }];
    await expect(parseGaussianSplat(encode(), "gltf")).rejects.toThrow(/cycle or multiple parents/);
    document.nodes = [{ mesh: 0, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], translation: [1, 0, 0] }];
    await expect(parseGaussianSplat(encode(), "gltf")).rejects.toThrow(/matrix and TRS/);
    document.nodes = [{ mesh: 0, rotation: [0, 0, 0, 2] }];
    await expect(parseGaussianSplat(encode(), "gltf")).rejects.toThrow(/unit quaternion/);
    document.nodes = [{ scale: [1e30, 1, 1], children: [1] }, { mesh: 0, scale: [1e30, 1, 1] }];
    await expect(parseGaussianSplat(encode(), "gltf")).rejects.toThrow(/world transform exceeds float32 range/);
    document.nodes = [{ mesh: 0, children: [9] }];
    await expect(parseGaussianSplat(encode(), "gltf")).rejects.toThrow(/node index/);
  });
  it("uses parentless node roots when a glTF asset defines no scenes", async () => {
    const fixture = gltf(), document = JSON.parse(new TextDecoder().decode(fixture.bytes));
    document.nodes = [{ translation: [2, 0, 0], children: [1] }, { mesh: 0, translation: [3, 0, 0] }];
    const result = await parseGaussianSplat(new TextEncoder().encode(JSON.stringify(document)), "gltf");
    expect(result.instances).toHaveLength(1); expect(result.instances![0]!.worldMatrix[12]).toBe(5);
  });
  it("rejects animated ancestors, skins and morphs instead of silently freezing splats", async () => {
    const fixture = gltf(), document = JSON.parse(new TextDecoder().decode(fixture.bytes));
    document.nodes = [{ children: [1] }, { mesh: 0 }, { translation: [1, 0, 0] }]; document.scenes = [{ nodes: [0, 2] }];
    document.animations = [{ channels: [{ target: { node: 2, path: "translation" } }] }];
    const encode = () => new TextEncoder().encode(JSON.stringify(document));
    expect((await parseGaussianSplat(encode(), "gltf")).instances).toHaveLength(1);
    document.animations[0].channels[0].target.node = 0;
    await expect(parseGaussianSplat(encode(), "gltf")).rejects.toThrow(/animated glTF splat transforms/);
    document.animations[0].channels[0].target = { path: "pointer", extensions: { KHR_animation_pointer: { pointer: "/nodes/0/translation/0" } } };
    await expect(parseGaussianSplat(encode(), "gltf")).rejects.toThrow(/animated glTF splat transforms/);
    delete document.animations; document.nodes[1].skin = 0;
    await expect(parseGaussianSplat(encode(), "gltf")).rejects.toThrow(/skinned or morphed/);
    delete document.nodes[1].skin; document.meshes[0].primitives[0].targets = [{}];
    await expect(parseGaussianSplat(encode(), "gltf")).rejects.toThrow(/morph targets/);
  });
  it("expands EXT_mesh_gpu_instancing accessors under the authored node transform", async () => {
    const fixture = gltf(), document = JSON.parse(new TextDecoder().decode(fixture.bytes)), start = fixture.binary.length;
    const binary = new Uint8Array(start + 56); binary.set(fixture.binary); const view = new DataView(binary.buffer);
    [1, 0, 0, 0, 2, 0].forEach((value, i) => view.setFloat32(start + i * 4, value, true));
    binary.set([0, 0, 0, 127, 0, 0, 127, 0], start + 24);
    [1, 1, 1, 2, 3, 4].forEach((value, i) => view.setFloat32(start + 32 + i * 4, value, true));
    document.buffers[0] = { byteLength: binary.length, uri: `data:application/octet-stream;base64,${Buffer.from(binary).toString("base64")}` };
    document.bufferViews.push({ buffer: 0, byteOffset: start, byteLength: 24 }, { buffer: 0, byteOffset: start + 24, byteLength: 8 }, { buffer: 0, byteOffset: start + 32, byteLength: 24 });
    document.accessors.push({ bufferView: 8, componentType: 5126, count: 2, type: "VEC3" }, { bufferView: 9, componentType: 5120, normalized: true, count: 2, type: "VEC4" }, { bufferView: 10, componentType: 5126, count: 2, type: "VEC3" });
    document.nodes = [{ mesh: 0, translation: [10, 20, 30], extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 8, ROTATION: 9, SCALE: 10 } } } }];
    document.scenes = [{ nodes: [0] }];
    const encode = () => new TextEncoder().encode(JSON.stringify(document));
    const result = await parseGaussianSplat(encode(), "gltf", { maxPoints: 2 });
    expect(result.count).toBe(1); expect(result.instances?.map(({ nodeIndex, instanceIndex }) => [nodeIndex, instanceIndex])).toEqual([[0, 0], [0, 1]]);
    expect(result.instances![0]!.worldMatrix.slice(12, 15)).toEqual([11, 20, 30]);
    expect(result.instances![1]!.worldMatrix.slice(12, 15)).toEqual([10, 22, 30]);
    expect(result.instances![1]!.worldMatrix[0]).toBeCloseTo(-2); expect(result.instances![1]!.worldMatrix[5]).toBeCloseTo(-3); expect(result.instances![1]!.worldMatrix[10]).toBeCloseTo(4);
    for (let i = 0; i < 3; i++) { expect(result.sceneBounds!.min[i]).toBeCloseTo([-10, -11, -18][i]!); expect(result.sceneBounds!.max[i]).toBeCloseTo([26, 43, 54][i]!); }
    await expect(parseGaussianSplat(encode(), "gltf", { maxPoints: 1 })).rejects.toThrow(/instances exceed point limit/);
    document.meshes[0].primitives.push(structuredClone(document.meshes[0].primitives[0]));
    const multiple = await parseGaussianSplat(encode(), "gltf", { maxPoints: 4 });
    expect(multiple.additionalClouds![0]!.instances?.map((instance) => instance.instanceIndex)).toEqual([0, 1]);
    expect(multiple.additionalClouds![0]!.instances![1]!.worldMatrix).toEqual(result.instances![1]!.worldMatrix);
    await expect(parseGaussianSplat(encode(), "gltf", { maxPoints: 3 })).rejects.toThrow(/instances exceed point limit/);
    document.meshes[0].primitives.pop();
    document.accessors[10].count = 1;
    await expect(parseGaussianSplat(encode(), "gltf")).rejects.toThrow(/instance accessor count mismatch/);
    document.accessors[10].count = 2; document.accessors[9].normalized = false;
    await expect(parseGaussianSplat(encode(), "gltf")).rejects.toThrow(/instance rotation component/);
  });
  it("reads glTF sparse positions and normalized integer rotation and opacity", async () => {
    const fixture = gltf(true), document = JSON.parse(new TextDecoder().decode(fixture.bytes));
    const bytes = new Uint8Array(fixture.binary.length + 20); bytes.set(fixture.binary); const base = fixture.binary.length, view = new DataView(bytes.buffer);
    bytes[base] = 0; // sparse index
    view.setFloat32(base + 4, 5, true); view.setFloat32(base + 8, 6, true); view.setFloat32(base + 12, 7, true);
    bytes.set([0, 0, 0, 127], base + 16);
    const views = document.bufferViews;
    views.push({ buffer: 0, byteOffset: base, byteLength: 1 }, { buffer: 0, byteOffset: base + 4, byteLength: 12 }, { buffer: 0, byteOffset: base + 16, byteLength: 4 });
    document.accessors[0] = { componentType: 5126, count: 1, type: "VEC3", sparse: { count: 1, indices: { bufferView: 8, componentType: 5121 }, values: { bufferView: 9 } } };
    document.accessors[2] = { bufferView: 10, componentType: 5120, normalized: true, count: 1, type: "VEC4" };
    document.buffers[0].byteLength = bytes.length; document.buffers[0].uri = `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`;
    const result = await parseGaussianSplat(new TextEncoder().encode(JSON.stringify(document)), "gltf");
    expect(result.positions).toEqual(new Float32Array([5, 6, 7])); expect(result.rotations).toEqual(new Float32Array([0, 0, 0, 1]));
    bytes[base] = 1; document.buffers[0].uri = `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`;
    await expect(parseGaussianSplat(new TextEncoder().encode(JSON.stringify(document)), "gltf")).rejects.toThrow(/sparse indices/);
  });
  it("decodes required KHR_mesh_quantization positions in mesh-local space", async () => {
    const fixture = gltf(true), document = JSON.parse(new TextDecoder().decode(fixture.bytes));
    const bytes = new Uint8Array(fixture.binary.length + 6); bytes.set(fixture.binary);
    const view = new DataView(bytes.buffer), offset = fixture.binary.length;
    view.setUint16(offset, 0, true); view.setUint16(offset + 2, 32768, true); view.setUint16(offset + 4, 65535, true);
    document.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: 6 });
    document.accessors[0] = { bufferView: 8, componentType: 5123, normalized: true, count: 1, type: "VEC3" };
    document.buffers[0].byteLength = bytes.length;
    document.buffers[0].uri = `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`;
    document.extensionsRequired = ["KHR_mesh_quantization"];
    const encode = () => new TextEncoder().encode(JSON.stringify(document));
    const result = await parseGaussianSplat(encode(), "gltf");
    expect(result.positions[0]).toBe(0); expect(result.positions[1]).toBeCloseTo(32768 / 65535); expect(result.positions[2]).toBe(1);
    delete document.extensionsRequired;
    await expect(parseGaussianSplat(encode(), "gltf")).rejects.toThrow(/position component/);
    document.extensionsRequired = ["KHR_mesh_quantization"];
    document.accessors[0].componentType = 5125;
    await expect(parseGaussianSplat(encode(), "gltf")).rejects.toThrow(/position component/);
  });
  it("accepts interleaved glTF buffers and binary percent-encoded data URIs", async () => {
    const fixture = gltf(), doc = JSON.parse(new TextDecoder().decode(fixture.bytes));
    const originalViews = doc.bufferViews;
    doc.bufferViews = [{ buffer: 0, byteLength: fixture.binary.length, byteStride: fixture.binary.length }];
    for (let i = 0; i < doc.accessors.length; i++) { doc.accessors[i].bufferView = 0; doc.accessors[i].byteOffset = originalViews[i].byteOffset; }
    doc.buffers[0].uri = `data:application/octet-stream,${Array.from(fixture.binary, (n) => `%${n.toString(16).padStart(2, "0")}`).join("")}`;
    const result = await parseGaussianSplat(new TextEncoder().encode(JSON.stringify(doc)), "gltf");
    expect(result.positions).toEqual(new Float32Array([1, 2, -3])); expect(result.sphericalHarmonics![8]).toBeCloseTo(0.9);
  });
  it("decodes draft SPZ-v2 glTF and GLB payloads with placeholder accessors", async () => {
    const fixture = spzGltf(), encode = () => new TextEncoder().encode(JSON.stringify(fixture.document));
    const result = await parseGaussianSplat(encode(), "gltf");
    expect(result.count).toBe(1); expect(result.shDegree).toBe(1); expect([...result.positions]).toEqual([-1, -2, -0.5]);
    expect(result.opacities[0]).toBeCloseTo(128 / 255); expect(result.sphericalHarmonics![8]).toBeCloseTo(-8 / 128);
    expect(result.rotations[0]).toBeCloseTo(-1 / 255); expect(result.rotations[1]).toBeCloseTo(1 / 255); expect(result.rotations[2]).toBeCloseTo(-1 / 255);
    expect(result.metadata).toMatchObject({ format: "gltf", version: "2.0", colorSpace: "lin_rec709_display", coordinateSystem: "LUF", extras: { compression: "KHR_gaussian_splatting_compression_spz_2", spzVersion: "2", spzCoordinateSystem: "RUB" } });
    // Evaluate degree-one lighting in the two bases at corresponding view
    // directions. A consistent coordinate conversion preserves the result.
    const raw = await parseGaussianSplat(fixture.binary, "spz");
    const contribution = (coefficients: Float32Array, direction: readonly [number, number, number]) => {
      const [x, y, z] = direction, basis = [-y, z, -x];
      return basis.reduce((sum, value, i) => sum + value * coefficients[i * 3]!, 0);
    };
    expect(contribution(result.sphericalHarmonics!, [-0.6, 0.3, -0.74])).toBeCloseTo(contribution(raw.sphericalHarmonics!, [0.6, 0.3, 0.74]));
    delete fixture.document.buffers[0].uri;
    const json = encode(), jsonSize = (json.length + 3) & ~3, binSize = (fixture.binary.length + 3) & ~3;
    const glb = new Uint8Array(12 + 8 + jsonSize + 8 + binSize), view = new DataView(glb.buffer);
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, glb.length, true);
    view.setUint32(12, jsonSize, true); view.setUint32(16, 0x4e4f534a, true); glb.fill(32, 20, 20 + jsonSize); glb.set(json, 20);
    const header = 20 + jsonSize; view.setUint32(header, binSize, true); view.setUint32(header + 4, 0x004e4942, true); glb.set(fixture.binary, header + 8);
    expect((await parseGaussianSplat(glb, "glb")).positions).toEqual(result.positions);
  });
  it("prefers compressed glTF data to provided fallback attributes", async () => {
    const fixture = gltf(true), document = JSON.parse(new TextDecoder().decode(fixture.bytes)), encoded = spz(2);
    const binary = new Uint8Array(fixture.binary.length + encoded.length); binary.set(fixture.binary); binary.set(encoded, fixture.binary.length);
    document.buffers[0] = { byteLength: binary.length, uri: `data:application/octet-stream;base64,${Buffer.from(binary).toString("base64")}` };
    document.bufferViews.push({ buffer: 0, byteOffset: fixture.binary.length, byteLength: encoded.length });
    document.meshes[0].primitives[0].extensions.KHR_gaussian_splatting.extensions = { KHR_gaussian_splatting_compression_spz_2: { bufferView: 8 } };
    const result = await parseGaussianSplat(new TextEncoder().encode(JSON.stringify(document)), "gltf");
    expect(result.positions[1]).toBeCloseTo(-2); // fallback position is +2
  });
  it("reads older draft glTF SPZ primitives that omit kernel and color space", async () => {
    const fixture = spzGltf(), extension = fixture.document.meshes[0].primitives[0].extensions.KHR_gaussian_splatting;
    delete extension.kernel; delete extension.colorSpace;
    const bytes = new TextEncoder().encode(JSON.stringify(fixture.document));
    const result = await parseGaussianSplat(bytes, "gltf");
    expect(result.positions[1]).toBeCloseTo(-2); expect(result.metadata.colorSpace).toBe("srgb_rec709_display");
    expect(result.metadata.extras?.colorSpaceSpecified).toBe(false);
    expect((await parseGaussianSplat(bytes, "gltf", { defaultColorSpace: "lin_rec709_display" })).metadata.colorSpace).toBe("lin_rec709_display");
  });
  it("preserves glTF node transforms after decoding compressed splat coordinates", async () => {
    const fixture = spzGltf(); fixture.document.nodes = [{ mesh: 0, translation: [4, 5, 6] }]; fixture.document.scenes = [{ nodes: [0] }];
    const result = await parseGaussianSplat(new TextEncoder().encode(JSON.stringify(fixture.document)), "gltf");
    expect([...result.positions]).toEqual([-1, -2, -0.5]);
    expect(result.instances![0]!.worldMatrix.slice(12, 15)).toEqual([4, 5, 6]);
    const radius = 3 * Math.E;
    expect(result.sceneBounds!.min[0]).toBeCloseTo(3 - radius); expect(result.sceneBounds!.max[0]).toBeCloseTo(3 + radius);
    expect(result.sceneBounds!.min[1]).toBeCloseTo(3 - radius); expect(result.sceneBounds!.max[2]).toBeCloseTo(5.5 + radius);
  });
  it("avoids a second conversion for LUF-labeled SPZ and refuses other unsupported labels", async () => {
    const fixture = spzGltf(), payload = gunzipSync(fixture.binary), extended = new Uint8Array(payload.length + 12);
    extended.set(payload); extended[14] |= 2;
    const view = new DataView(extended.buffer); view.setUint32(payload.length, 0xadbe0003, true); view.setUint32(payload.length + 4, 4, true);
    const encode = (coordinate: number) => {
      view.setUint32(payload.length + 8, coordinate, true);
      const binary = gzipSync(extended); fixture.document.buffers[0].byteLength = binary.length;
      fixture.document.buffers[0].uri = `data:application/octet-stream;base64,${Buffer.from(binary).toString("base64")}`;
      fixture.document.bufferViews[0].byteLength = binary.length;
      return new TextEncoder().encode(JSON.stringify(fixture.document));
    };
    const result = await parseGaussianSplat(encode(7), "gltf");
    expect([...result.positions]).toEqual([1, -2, 0.5]); expect(result.sphericalHarmonics![8]).toBeCloseTo(8 / 128);
    expect(result.metadata.extras?.spzCoordinateSystem).toBe("LUF");
    await expect(parseGaussianSplat(encode(6), "gltf")).rejects.toThrow(/unsupported glTF SPZ coordinate system: RDF/);
  });
  it("rejects mismatched compressed glTF versions, accessor counts, SH layouts and buffer ranges", async () => {
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    const wrongVersion = spzGltf(3);
    await expect(parseGaussianSplat(encode(wrongVersion.document), "gltf")).rejects.toThrow(/SPZ version 2/);
    const wrongCount = spzGltf(); wrongCount.document.accessors[2].count = 2;
    await expect(parseGaussianSplat(encode(wrongCount.document), "gltf")).rejects.toThrow(/count mismatch/);
    const wrongDegree = spzGltf();
    for (let i = 0; i < 3; i++) delete wrongDegree.document.meshes[0].primitives[0].attributes[`KHR_gaussian_splatting:SH_DEGREE_1_COEF_${i}`];
    await expect(parseGaussianSplat(encode(wrongDegree.document), "gltf")).rejects.toThrow(/degree mismatch/);
    const badRange = spzGltf(); badRange.document.bufferViews[0].byteLength += 1;
    await expect(parseGaussianSplat(encode(badRange.document), "gltf")).rejects.toThrow(/bufferView/);
  });
  it("rejects missing and incomplete glTF attributes and invalid binary layouts", async () => {
    const fixture = gltf(), document = JSON.parse(new TextDecoder().decode(fixture.bytes));
    const attrs = document.meshes[0].primitives[0].attributes;
    delete attrs["KHR_gaussian_splatting:SH_DEGREE_1_COEF_1"];
    await expect(parseGaussianSplat(new TextEncoder().encode(JSON.stringify(document)), "gltf")).rejects.toThrow(/incomplete/);
    const nonunit = JSON.parse(new TextDecoder().decode(fixture.bytes));
    const badRotation = fixture.binary.slice(); new DataView(badRotation.buffer).setFloat32(36, 2, true);
    nonunit.buffers[0].uri = `data:application/octet-stream;base64,${Buffer.from(badRotation).toString("base64")}`;
    await expect(parseGaussianSplat(new TextEncoder().encode(JSON.stringify(nonunit)), "gltf")).rejects.toThrow(/unit quaternions/);
    const malformed = JSON.parse(new TextDecoder().decode(fixture.bytes)); malformed.bufferViews[0].byteLength = 4;
    await expect(parseGaussianSplat(new TextEncoder().encode(JSON.stringify(malformed)), "gltf")).rejects.toThrow(/bufferView/);
  });
  it("rejects unsupported glTF mesh compression rather than interpreting encoded bytes as splats", async () => {
    const fixture = gltf(), document = JSON.parse(new TextDecoder().decode(fixture.bytes));
    const encode = () => new TextEncoder().encode(JSON.stringify(document));
    document.bufferViews[0].extensions = { EXT_meshopt_compression: {} };
    await expect(parseGaussianSplat(encode(), "gltf")).rejects.toThrow(/meshopt-compressed/);
    delete document.bufferViews[0].extensions;
    document.meshes[0].primitives[0].extensions.KHR_draco_mesh_compression = {};
    await expect(parseGaussianSplat(encode(), "gltf")).rejects.toThrow(/Draco-compressed/);
  });
  it.each([1, 2, 3])("decodes independently generated SPZ v%i gzip streams", async (version) => {
    const result = await parseGaussianSplat(spz(version), "spz");
    expect(result.metadata.version).toBe(String(version)); expect(result.metadata.coordinateSystem).toBe("RUB");
    expect(result.positions[0]).toBeCloseTo(1); expect(result.positions[1]).toBeCloseTo(-2); expect(result.positions[2]).toBeCloseTo(0.5);
    expect(result.scales[0]).toBeCloseTo(1); expect(result.opacities[0]).toBeCloseTo(128 / 255);
    expect(result.rotations[3]).toBeCloseTo(1, 3); expect(result.sphericalHarmonics![3]).toBeCloseTo(3 / 128);
  });
  it("decodes SPZ v4 attribute streams using the supplied Zstandard implementation", async () => {
    const result = await parseGaussianSplat(spz(4), "spz", { decompressZstd: (bytes) => zstdDecompressSync(bytes) });
    expect(result.positions[1]).toBeCloseTo(-2); expect(result.rotations[3]).toBe(1); expect(result.sphericalHarmonics![8]).toBeCloseTo(8 / 128);
  });
  it("decodes SPZ v4 with Node's bounded built-in Zstandard codec and no callback", async () => {
    const result = await parseGaussianSplat(spz(4), "spz");
    expect(result.metadata.version).toBe("4"); expect(result.positions[0]).toBeCloseTo(1);
    expect(result.rotations[3]).toBe(1); expect(result.sphericalHarmonics![8]).toBeCloseTo(8 / 128);
  });
  it("decodes genuinely compressed Zstandard streams for a multi-point SPZ v4 cloud", async () => {
    const count = 512, result = await parseGaussianSplat(compressedSpzV4(count), "spz");
    expect(result.count).toBe(count); expect([...result.positions.slice(-3)]).toEqual([1, -2, 0.5]);
    expect(result.sphericalHarmonics![count * 9 - 1]).toBeCloseTo(8 / 128);
  });
  it("routes SPZ v4 through the bounded worker fallback when browser Zstandard is unavailable", async () => {
    const count = 512, source = compressedSpzV4(count), original = source.slice();
    const nodeVersion = Object.getOwnPropertyDescriptor(process.versions, "node")!;
    let started = 0, terminated = 0;
    class SimulatedWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor() { started++; }
      postMessage(message: { input: ArrayBuffer; expectedBytes: number }): void {
        // Emulate the worker's codec with Node zlib. The worker module's own
        // tests exercise the original Zstandard WASM implementation.
        expect(message.input).not.toBe(source.buffer);
        const decoded = Uint8Array.from(zstdDecompressSync(new Uint8Array(message.input)));
        expect(decoded.byteLength).toBe(message.expectedBytes);
        queueMicrotask(() => this.onmessage?.({ data: { ok: true, output: decoded.buffer } } as MessageEvent));
      }
      terminate(): void { terminated++; }
    }
    vi.stubGlobal("Worker", SimulatedWorker);
    vi.stubGlobal("DecompressionStream", undefined);
    Object.defineProperty(process.versions, "node", { ...nodeVersion, value: undefined });
    try {
      const result = await parseGaussianSplat(source, "spz");
      expect(result.count).toBe(count); expect([...result.positions.slice(-3)]).toEqual([1, -2, 0.5]);
      expect(result.sphericalHarmonics![count * 9 - 1]).toBeCloseTo(8 / 128);
      expect(started).toBe(6); expect(terminated).toBe(started);
      expect(source).toEqual(original);
      vi.stubGlobal("Worker", undefined);
      await expect(parseGaussianSplat(source, "spz")).rejects.toThrow(/module worker/);
    } finally {
      Object.defineProperty(process.versions, "node", nodeVersion);
      vi.unstubAllGlobals();
    }
  });
  it("bounds native Zstandard output even when a stream claims a smaller decoded size", async () => {
    const source = spz(4), original = new DataView(source.buffer, source.byteOffset, source.byteLength);
    const dataStart = 32 + source[15]! * 16, oldLength = Number(original.getBigUint64(32, true));
    const oversized = zstdCompressSync(new Uint8Array(10)); // positions claim nine bytes
    const forged = new Uint8Array(source.length - oldLength + oversized.length);
    forged.set(source.subarray(0, dataStart)); forged.set(oversized, dataStart);
    forged.set(source.subarray(dataStart + oldLength), dataStart + oversized.length);
    new DataView(forged.buffer).setBigUint64(32, BigInt(oversized.length), true);
    await expect(parseGaussianSplat(forged, "spz")).rejects.toThrow(/larger than|limit|range|size/i);
  });
  it("retains degree-four SPZ coefficients and coordinate system metadata", async () => {
    const source = spz(4, 4), bytes = new Uint8Array(source.length + 12); bytes.set(source.subarray(0, 32)); bytes.set(source.subarray(32), 44); bytes[14] = 2;
    const view = new DataView(bytes.buffer); view.setUint32(16, 44, true);
    view.setUint32(32, 0xadbe0003, true); view.setUint32(36, 4, true); view.setUint32(40, 6, true);
    const result = await parseGaussianSplat(bytes, "spz");
    expect(result.shDegree).toBe(4); expect(result.sphericalHarmonics).toHaveLength(72); expect(result.sphericalHarmonics![71]).toBeCloseTo(71 / 128);
    expect(result.metadata.coordinateSystem).toBe("RDF"); expect(result.metadata.extras?.extensionTypes).toEqual([0xadbe0003]);
    await expect(parseGaussianSplat(spz(3, 4), "spz")).rejects.toThrow(/degree.*version 3/);
  });
  it("preserves each SPZ axis label without converting raw attributes", async () => {
    const labels = ["LDB", "RDB", "LUB", "RUB", "LDF", "RDF", "LUF", "RUF", "LFD", "RFD", "LFU", "RFU", "LBD", "RBD", "LBU", "RBU"];
    const source = spz(4), bytes = new Uint8Array(source.length + 12); bytes.set(source.subarray(0, 32)); bytes.set(source.subarray(32), 44); bytes[14] = 2;
    const view = new DataView(bytes.buffer); view.setUint32(16, 44, true); view.setUint32(32, 0xadbe0003, true); view.setUint32(36, 4, true);
    for (let i = 0; i < labels.length; i++) {
      view.setUint32(40, i + 1, true);
      const result = await parseGaussianSplat(bytes, "spz");
      expect(result.metadata.coordinateSystem).toBe(labels[i]); expect([...result.positions]).toEqual([1, -2, 0.5]);
      expect(result.sphericalHarmonics![8]).toBeCloseTo(8 / 128);
    }
    view.setUint32(40, 0, true); await expect(parseGaussianSplat(bytes, "spz")).rejects.toThrow(/coordinate system/);
    view.setUint32(40, 17, true); await expect(parseGaussianSplat(bytes, "spz")).rejects.toThrow(/coordinate system/);
  });
  it("rejects SPZ streams with forged decoded lengths", async () => {
    const source = spz(4); new DataView(source.buffer, source.byteOffset, source.byteLength).setBigUint64(40, 900n, true);
    await expect(parseGaussianSplat(source, "spz", { decompressZstd: (bytes) => zstdDecompressSync(bytes) })).rejects.toThrow(/stream sizes/);
    await expect(parseGaussianSplat(spz(4), "spz", { decompressZstd: () => new Uint8Array(0) })).rejects.toThrow(/invalid stream size/);
  });
  it("validates versions, malformed payloads, budgets, opacity, scale and cancellation", async () => {
    await expect(parseGaussianSplat(splat().subarray(0, 63), "splat")).rejects.toThrow(/multiple of 32/);
    await expect(parseGaussianSplat(splat(), "splat", { maxPoints: 1 })).rejects.toThrow(/count/);
    await expect(parseGaussianSplat(splat(), "splat", { maxDecodedBytes: 100 })).rejects.toThrow(/byte limit/);
    const invalid = splat(); new DataView(invalid.buffer).setFloat32(12, -1, true);
    await expect(parseGaussianSplat(invalid, "splat")).rejects.toThrow(/non-negative/);
    const overflow = splat(); new DataView(overflow.buffer).setFloat32(12, 2e19, true);
    await expect(parseGaussianSplat(overflow, "splat")).rejects.toThrow(/covariance/);
    await expect(parseGaussianSplat(ply().subarray(0, 30), "ply")).rejects.toThrow(/header/);
    await expect(parseGaussianSplat(spz(3).subarray(0, 12), "spz")).rejects.toThrow();
    const unknown = spz(4); new DataView(unknown.buffer).setUint32(4, 7, true);
    await expect(parseGaussianSplat(unknown, "spz")).rejects.toThrow(/version/);
    const controller = new AbortController(); controller.abort();
    await expect(parseGaussianSplat(splat(), "splat", { signal: controller.signal })).rejects.toThrow();
    const inFlight = new AbortController(); const pending = parseGaussianSplat(spz(3), "spz", { signal: inFlight.signal }); inFlight.abort();
    await expect(pending).rejects.toThrow();
  });
  it("enforces codec ownership and fails explicitly when KSPLAT support is absent", async () => {
    await expect(parseGaussianSplat(Uint8Array.of(0), "ksplat")).rejects.toThrow(/registered decoder/);
    const input = await parseGaussianSplat(splat(), "splat");
    const value: GaussianSplatData = { ...input, metadata: { ...input.metadata, format: "ksplat" } };
    const result = await parseGaussianSplat(Uint8Array.of(1), "ksplat", { codecs: { ksplat: () => value } });
    expect(result.positions).toEqual(value.positions); expect(result.positions).not.toBe(value.positions);
    await expect(parseGaussianSplat(Uint8Array.of(1), "ksplat", { codecs: { ksplat: () => ({ ...value, opacities: new Float32Array([2, 0]) }) } })).rejects.toThrow(/opacity/);
    await expect(parseGaussianSplat(Uint8Array.of(1), "ksplat", { codecs: { ksplat: () => ({ ...value, additionalClouds: [value] }) } })).rejects.toThrow(/single uninstanced cloud/);
  });
  it("uses the asset transport, integrity policy, dependency digests and progress", async () => {
    const fixture = gltf(true), sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
    const mock = vi.fn(async (url: string | URL | Request) => {
      const content = String(url).endsWith("points.bin") ? fixture.binary : fixture.bytes;
      return new Response(new Uint8Array(content).buffer, { status: 200 });
    });
    vi.stubGlobal("fetch", mock);
    try {
      const url = "https://example.test/models/cloud.gltf", integrity = { version: 1 as const, digest: sha(fixture.bytes), requireDependencies: true, dependencies: { "points.bin": sha(fixture.binary) } };
      const loader = new GaussianSplatLoader();
      const phases: string[] = [];
      const request = { url, type: "gaussian-splat", integrity, onProgress: (event: { phase: string }) => phases.push(event.phase) };
      expect(loader.canLoad(request)).toBe(true); expect(loader.canLoad({ url })).toBe(false);
      const result = await loader.load(request, new LoadContext({ integrity }));
      expect(result.positions).toEqual(new Float32Array([1, 2, -3])); expect(phases).toEqual(["document", "buffer", "complete"]);
      expect(mock.mock.calls[1]?.[0]).toBe("https://example.test/models/points.bin");
      const wrong = { ...integrity, digest: "0".repeat(64) };
      await expect(loader.load({ url, type: "gaussian-splat", integrity: wrong }, new LoadContext({ integrity: wrong }))).rejects.toThrow(/integrity mismatch/);
      const missing = { ...integrity, dependencies: {} };
      await expect(loader.load({ url, type: "gaussian-splat", integrity: missing }, new LoadContext({ integrity: missing }))).rejects.toThrow(/dependency integrity/);
    } finally { vi.unstubAllGlobals(); }
  });
  it("loads a typed splat through AssetManager and releases its handle", async () => {
    const bytes = splat(); vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes).buffer)));
    try {
      const manager = new AssetManager(); manager.register(new GaussianSplatLoader());
      const handle = await manager.load<GaussianSplatData>("https://example.test/cloud.splat", { type: "gaussian-splat" });
      expect(handle.value.count).toBe(2); expect(handle.status).toBe("ready");
      await handle.release(); expect(handle.status).toBe("disposed");
    } finally { vi.unstubAllGlobals(); }
  });
  it("routes compressed PLY through an explicitly configured AssetManager codec", async () => {
    const ordinary = await parseGaussianSplat(ply(), "ply"), compressed = compressedPlyDeclaration();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(compressed).buffer)));
    try {
      const codec = vi.fn(async (_bytes: Uint8Array) => ordinary);
      const manager = new AssetManager(); manager.register(new GaussianSplatLoader({ codecs: { compressedPly: codec } }));
      const handle = await manager.load<GaussianSplatData>("https://example.test/cloud.ply", { type: "gaussian-splat" });
      expect(codec).toHaveBeenCalledTimes(1); expect(handle.value.positions).toEqual(ordinary.positions);
      await handle.release(); expect(handle.status).toBe("disposed");
    } finally { vi.unstubAllGlobals(); }
  });
  it("retains glTF instances through the AssetManager transport", async () => {
    const fixture = gltf(), document = JSON.parse(new TextDecoder().decode(fixture.bytes));
    document.nodes = [{ mesh: 0, translation: [1, 2, 3] }, { mesh: 0, translation: [4, 5, 6] }]; document.scenes = [{ nodes: [0, 1] }];
    const bytes = new TextEncoder().encode(JSON.stringify(document));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes).buffer)));
    try {
      const manager = new AssetManager(); manager.register(new GaussianSplatLoader());
      const handle = await manager.load<GaussianSplatData>("https://example.test/cloud.gltf", { type: "gaussian-splat" });
      expect(handle.value.instances?.map(({ worldMatrix }) => worldMatrix.slice(12, 15))).toEqual([[1, 2, 3], [4, 5, 6]]);
      await handle.release(); expect(handle.status).toBe("disposed");
    } finally { vi.unstubAllGlobals(); }
  });
  it("owns all glTF clouds under one reference-counted asset lifetime", async () => {
    const fixture = gltf(), document = JSON.parse(new TextDecoder().decode(fixture.bytes));
    document.meshes[0].primitives.push(structuredClone(document.meshes[0].primitives[0]));
    document.nodes = [{ mesh: 0 }]; document.scenes = [{ nodes: [0] }];
    const bytes = new TextEncoder().encode(JSON.stringify(document)), fetchMock = vi.fn(async () => new Response(new Uint8Array(bytes).buffer));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const manager = new AssetManager(); manager.register(new GaussianSplatLoader());
      const first = await manager.load<GaussianSplatData>("https://example.test/multi.gltf", { type: "gaussian-splat" });
      const second = await manager.load<GaussianSplatData>("https://example.test/multi.gltf", { type: "gaussian-splat" });
      expect(second).toBe(first); expect(first.refCount).toBe(2); expect(first.value.additionalClouds).toHaveLength(1);
      const previous = first.value.additionalClouds![0]!.positions;
      await first.release(); expect(second.value.additionalClouds![0]!.positions).toBe(previous);
      await second.release(); expect(second.status).toBe("disposed"); expect(() => second.value).toThrow(/disposed/);
      const reloaded = await manager.load<GaussianSplatData>("https://example.test/multi.gltf", { type: "gaussian-splat" });
      expect(fetchMock).toHaveBeenCalledTimes(2); expect(reloaded.value.additionalClouds![0]!.positions).not.toBe(previous);
      await reloaded.release();
    } finally { vi.unstubAllGlobals(); }
  });
  it("verifies integrity even when a custom dependency resolver supplies bytes", async () => {
    const fixture = gltf(true), digest = createHash("sha256").update(fixture.bytes).digest("hex");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(fixture.bytes).buffer)));
    try {
      const loader = new GaussianSplatLoader({ resolveUri: async () => fixture.binary });
      const integrity = { version: 1 as const, digest, requireDependencies: true, dependencies: { "points.bin": "0".repeat(64) } };
      await expect(loader.load({ url: "https://example.test/cloud.gltf", type: "gaussian-splat", integrity }, new LoadContext({ integrity }))).rejects.toThrow(/integrity mismatch/);
    } finally { vi.unstubAllGlobals(); }
  });
  it("can parse using the loader instance and reports unresolved external buffers", async () => {
    const loader = new GaussianSplatLoader({ maxPoints: 3 });
    expect((await loader.parse(splat(), "splat")).count).toBe(2);
    await expect(loader.parse(gltf(true).bytes, "gltf")).rejects.toThrow(/resolveUri/);
  });
});
