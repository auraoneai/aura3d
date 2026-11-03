import { describe, expect, it } from "vitest";
import { GLTFLoader } from "../../packages/assets/src/GLTFLoader";
import { createGLTFRenderResources } from "../../packages/assets/src/GLTFRenderResources";
import { LoadContext } from "../../packages/assets/src/LoadContext";
import { loadNativeMeshAsset, parsePLY, parseSTL, PLYLoader, STLLoader, type NativeMeshData } from "../../packages/assets/src/loaders/MeshFormatLoaders";

// Independently authored fixtures based on Greg Turk's PLY format description
// (https://paulbourke.net/dataformats/ply/) and Marshall Burns' account of the
// 3D Systems STL interface (https://www.fabbers.com/tech/STL_Format). The
// original 3D Systems document itself is not publicly located by the Library
// of Congress: https://www.loc.gov/preservation/digital/formats/fdd/fdd000505.shtml
const asciiPly = [
  "ply", "format ascii 1.0", "comment independently authored concave polygon",
  "element vertex 5", "property float z", "property float x", "property float y",
  "property float nx", "property float ny", "property float nz",
  "property float u", "property float v", "property uchar red", "property uchar green",
  "property uchar blue", "property uchar alpha", "property float confidence",
  "element face 1", "property list uchar int vertex_indices", "property int material_index",
  "element edge 1", "property int vertex1", "property int vertex2", "end_header",
  "0 0 0 0 0 1 0 0 255 0 0 255 0.5",
  "0 2 0 0 0 1 1 0 0 255 0 128 0.6",
  "0 2 2 0 0 1 1 1 0 0 255 255 0.7",
  "0 1 1 0 0 1 .5 .5 255 255 255 255 0.8",
  "0 0 2 0 0 1 0 1 0 0 0 255 0.9",
  "5 0 1 2 3 4 17", "0 1", ""
].join("\n");

function binaryPly(little: boolean, endOfLine: "\n" | "\r\n" | "\r" = "\n"): Uint8Array {
  const header = [
    "ply", `format binary_${little ? "little" : "big"}_endian 1.0`,
    "element vertex 3", "property double x", "property short y", "property float z", "property uchar red", "property uchar green", "property uchar blue",
    "element face 1", "property list uchar uint vertex_index", "property short label",
    "element edge 1", "property list uchar float weights", "end_header", ""
  ].join(endOfLine);
  const prefix = new TextEncoder().encode(header);
  const body = new Uint8Array(3 * 17 + 15 + 9);
  const view = new DataView(body.buffer);
  let at = 0;
  for (const row of [[1.5, -2, 3.25, 255, 0, 128], [4.5, 5, -6.25, 0, 255, 0], [7.5, 8, 9.25, 0, 0, 255]]) {
    view.setFloat64(at, row[0]!, little); at += 8;
    view.setInt16(at, row[1]!, little); at += 2;
    view.setFloat32(at, row[2]!, little); at += 4;
    for (const color of row.slice(3)) view.setUint8(at++, color);
  }
  view.setUint8(at++, 3);
  for (const index of [2, 0, 1]) { view.setUint32(at, index, little); at += 4; }
  view.setInt16(at, -17, little); at += 2;
  view.setUint8(at++, 2); view.setFloat32(at, 0.25, little); at += 4; view.setFloat32(at, -0.5, little);
  const result = new Uint8Array(prefix.length + body.length);
  result.set(prefix); result.set(body, prefix.length);
  return result;
}

function binaryStl(): Uint8Array {
  const bytes = new Uint8Array(84 + 2 * 50);
  bytes.set(new TextEncoder().encode("solid binary HEADER COLOR="));
  const view = new DataView(bytes.buffer);
  view.setUint32(80, 2, true);
  const facets = [
    { normal: [0, 0, 2], vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], attr: 0x801f },
    { normal: [0, 0, 0], vertices: [[0, 0, 1], [1, 0, 1], [0, 1, 1]], attr: 0 }
  ];
  let offset = 84;
  for (const facet of facets) {
    for (const value of [...facet.normal, ...facet.vertices.flat()]) { view.setFloat32(offset, value, true); offset += 4; }
    view.setUint16(offset, facet.attr, true); offset += 2;
  }
  return bytes;
}

const asciiStl = [
  "solid empty", "endsolid empty", "solid first",
  "facet normal 0 0 3", "outer loop", "vertex 0 0 0", "vertex 1 0 0", "vertex 0 1 0", "endloop", "endfacet", "endsolid first",
  "solid second", "facet normal 0 0 0", "outer loop", "vertex 0 0 1", "vertex 1 0 1", "vertex 0 1 1", "endloop", "endfacet", "endsolid second", ""
].join("\r\n");

const pointPly = ["ply", "format ascii 1.0", "element vertex 1", "property float x", "property float y", "property float z", "end_header", "1 2 3", ""].join("\n");
const dataUrl = (data: string | Uint8Array): string => `data:application/octet-stream;base64,${Buffer.from(data).toString("base64")}`;

function polygonArea(positions: Float32Array, indices: Uint32Array): number {
  let area = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = Array.from(indices.subarray(i, i + 3), (index) => index * 3);
    const cross = (positions[b!]! - positions[a!]!) * (positions[c! + 1]! - positions[a! + 1]!) - (positions[b! + 1]! - positions[a! + 1]!) * (positions[c!]! - positions[a!]!);
    expect(cross).toBeGreaterThan(0);
    area += cross / 2;
  }
  return area;
}

describe("independent PLY fixtures", () => {
  it("preserves reordered vertex attributes and extra elements while triangulating a concave face", () => {
    const mesh = parsePLY(asciiPly);
    expect(mesh.format).toBe("ascii"); expect(mesh.topology).toBe("triangles");
    expect(Array.from(mesh.positions)).toEqual([0, 0, 0, 2, 0, 0, 2, 2, 0, 1, 1, 0, 0, 2, 0]);
    expect(Array.from(mesh.normals!)).toEqual(Array(5).fill([0, 0, 1]).flat());
    expect(Array.from(mesh.texcoords!)).toEqual([0, 0, 1, 0, 1, 1, 0.5, 0.5, 0, 1]);
    expect(Array.from(mesh.colors!.subarray(0, 4))).toEqual([1, 0, 0, 1]);
    expect(mesh.colors![7]).toBeCloseTo(128 / 255);
    expect(mesh.indices).toHaveLength(9); expect(polygonArea(mesh.positions, mesh.indices)).toBe(3);
    const indices = mesh.elements.face!.properties.vertex_indices!;
    expect(indices.kind).toBe("list");
    if (indices.kind === "list") { expect(Array.from(indices.offsets)).toEqual([0, 5]); expect(Array.from(indices.values)).toEqual([0, 1, 2, 3, 4]); }
    expect(mesh.elements.edge!.count).toBe(1);
    expect(mesh.diagnostics.join(" ")).toContain("confidence");
    expect(mesh.diagnostics.join(" ")).toContain("face properties");
    expect(mesh.diagnostics.join(" ")).toContain("element edge");
    expect(mesh.diagnostics.join(" ")).toContain("non-fan triangulation");
  });

  it("uses the specified triangle-fan indices for a convex polygon", () => {
    const input = ["ply", "format ascii 1.0", "element vertex 4", "property float x", "property float y", "property float z",
      "element face 1", "property list uchar int vertex_index", "end_header",
      "0 0 0", "2 0 0", "2 2 0", "0 2 0", "4 0 1 2 3", ""].join("\n");
    const mesh = parsePLY(input);
    expect(Array.from(mesh.indices)).toEqual([0,1,2, 0,2,3]);
    expect(mesh.diagnostics.join(" ")).not.toContain("non-fan triangulation");
  });

  it.each([true, false])("reads mixed-width binary properties with little-endian = %s", (little) => {
    const bytes = binaryPly(little, "\r\n");
    const padded = new Uint8Array(bytes.length + 7); padded.set(bytes, 3);
    const mesh = parsePLY(padded.subarray(3, bytes.length + 3));
    expect(mesh.format).toBe(little ? "binary_little_endian" : "binary_big_endian");
    expect(Array.from(mesh.positions)).toEqual([1.5, -2, 3.25, 4.5, 5, -6.25, 7.5, 8, 9.25]);
    expect(Array.from(mesh.indices)).toEqual([2, 0, 1]);
    expect(mesh.elements.face!.properties.label!.values[0]).toBe(-17);
    const weights = mesh.elements.edge!.properties.weights!;
    if (weights.kind !== "list") throw new Error("expected list");
    expect(Array.from(weights.offsets)).toEqual([0, 2]); expect(Array.from(weights.values)).toEqual([0.25, -0.5]);
    expect(Array.from(mesh.colors!.subarray(0, 4))).toEqual([1, 0, 128 / 255, 1].map(Math.fround));
    expect(mesh.diagnostics.join(" ")).toContain("element edge");
  });

  it("supports CR-only headers without consuming an LF-valued binary payload byte", () => {
    const header = ["ply", "format binary_little_endian 1.0", "element vertex 1", "property float x", "property float y", "property float z", "end_header", ""].join("\r");
    const prefix = new TextEncoder().encode(header), body = new Uint8Array(12), view = new DataView(body.buffer);
    view.setUint32(0, 0x3f80000a, true); view.setFloat32(4, 2, true); view.setFloat32(8, 3, true);
    const input = new Uint8Array(prefix.length + body.length); input.set(prefix); input.set(body, prefix.length);
    const mesh = parsePLY(input);
    expect(mesh.positions[0]).toBe(view.getFloat32(0, true)); expect(Array.from(mesh.positions.subarray(1))).toEqual([2, 3]);
    expect(mesh.topology).toBe("points"); expect(Array.from(mesh.indices)).toEqual([0]);
  });

  it("rejects malformed declarations, geometry, values and resource-limit violations", () => {
    const bad = (input: string | Uint8Array, pattern: RegExp, options = {}) => expect(() => parsePLY(input, options)).toThrow(pattern);
    bad(pointPly.replace("format ascii 1.0", "format ascii 2.0"), /PLY_HEADER/);
    bad(pointPly.replace("property float x", "property constructor x"), /PLY_HEADER/);
    bad(pointPly.replace("property float x", "property float x\nproperty float x"), /duplicate property/);
    bad(pointPly.replace("property float x", "property list float float x"), /unknown property type/);
    bad(pointPly.replace("property float x", "property list uchar float x").replace("1 2 3", "1 1 2 3"), /must be scalar/);
    bad(pointPly.replace("property float x", "property double x").replace("1 2 3", "1e40 2 3"), /float32 range/);
    bad(pointPly.replace("1 2 3", "NaN 2 3"), /PLY_INVALID_VALUE/);
    bad(pointPly.replace("1 2 3", "1 2"), /PLY_TRUNCATED/);
    bad(pointPly + "1", /PLY_TRAILING_DATA/);
    bad(pointPly.replace("element vertex 1", "element vertex 999"), /PLY_ELEMENT_LIMIT/, { maxElements: 10 });
    bad(pointPly, /MESH_FILE_LIMIT/, { maxFileBytes: 5 });
    bad(pointPly, /PLY_ALLOCATION_LIMIT/, { maxOutputBytes: 11 });
    bad(pointPly, /MESH_INVALID_LIMIT/, { maxOutputBytes: 0 });
    bad(`ply\ncomment ${"a".repeat(65536)}\n`, /PLY_HEADER/);
    bad(asciiPly.replace("5 0 1 2 3 4 17", "5 0 1 2 3 5 17"), /face index/);
    bad(asciiPly.replace("property list uchar int vertex_indices", "property list uchar float vertex_indices"), /integer type/);
    bad(pointPly.replace("end_header", "property float nx\nend_header").replace("1 2 3", "1 2 3 0"), /incomplete nx\/ny\/nz/);
    bad(asciiPly, /PLY_LIST_LIMIT/, { maxListItems: 4 });
    const binary = binaryPly(false); bad(binary.subarray(0, binary.length - 1), /PLY_TRUNCATED/);
    const trailing = new Uint8Array(binary.length + 1); trailing.set(binary); bad(trailing, /PLY_TRAILING_DATA/);
  });
});

describe("independent STL fixtures", () => {
  it("decodes multiple ASCII solids and normalizes or repairs facet normals", () => {
    const mesh = parseSTL(asciiStl);
    expect(mesh.format).toBe("ascii");
    expect(mesh.groups).toEqual([{ name: "empty", start: 0, count: 0 }, { name: "first", start: 0, count: 3 }, { name: "second", start: 3, count: 3 }]);
    expect(Array.from(mesh.indices)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Array.from(mesh.normals!)).toEqual(Array(6).fill([0, 0, 1]).flat());
    expect(mesh.diagnostics.join(" ")).toContain("empty solids"); expect(mesh.diagnostics.join(" ")).toContain("recomputed");
  });

  it("recognizes binary even with a solid header, retaining uninterpreted attribute words", () => {
    const mesh = parseSTL(binaryStl());
    expect(mesh.format).toBe("binary");
    expect(Array.from(mesh.attributes)).toEqual([0x801f, 0]);
    expect(Array.from(mesh.positions.subarray(9))).toEqual([0, 0, 1, 1, 0, 1, 0, 1, 1]);
    expect(Array.from(mesh.normals!)).toEqual(Array(6).fill([0, 0, 1]).flat());
    expect(mesh.diagnostics.join(" ")).toContain("not interpreted");
    expect(mesh.diagnostics.join(" ")).toContain("recomputed");
    const headerColorOnly = binaryStl(); new DataView(headerColorOnly.buffer).setUint16(132, 0, true);
    expect(parseSTL(headerColorOnly).diagnostics.join(" ")).toContain("not interpreted");
  });

  it("reports zero normals for degenerate faces instead of inventing a direction", () => {
    const mesh = parseSTL(asciiStl.replace("vertex 1 0 1", "vertex 0 0 1").replace("vertex 0 1 1", "vertex 0 0 1"));
    expect(Array.from(mesh.normals!.subarray(9))).toEqual(Array(9).fill(0));
    expect(mesh.diagnostics.join(" ")).toContain("degenerate facets");
  });

  it("rejects malformed, truncated, nonfinite and over-limit facets", () => {
    expect(() => parseSTL(asciiStl.replace("endloop", "missing"))).toThrow(/STL_SYNTAX/);
    expect(() => parseSTL(asciiStl.replace("vertex 1 0 0", "vertex NaN 0 0"))).toThrow(/STL_SYNTAX/);
    expect(() => parseSTL(asciiStl.replace("endsolid second", ""))).toThrow(/STL_TRUNCATED/);
    const binary = binaryStl();
    expect(() => parseSTL(binary.subarray(0, binary.length - 1))).toThrow(/STL_SYNTAX|STL_TRUNCATED/);
    const nonfinite = binary.slice(); new DataView(nonfinite.buffer).setFloat32(96, NaN, true);
    expect(() => parseSTL(nonfinite)).toThrow(/STL_VALUE/);
    expect(() => parseSTL(binary, { maxFileBytes: 4 })).toThrow(/MESH_FILE_LIMIT/);
    expect(() => parseSTL(binary, { maxElements: 3 })).toThrow(/STL_ALLOCATION_LIMIT/);
    expect(() => parseSTL(binary, { maxListItems: 3 })).toThrow(/STL_ALLOCATION_LIMIT/);
    expect(() => parseSTL(binary, { maxOutputBytes: 85 })).toThrow(/STL_ALLOCATION_LIMIT/);
    expect(() => parseSTL(`solid ${"x".repeat(1025)}\nendsolid\n`)).toThrow(/STL_GROUP_LIMIT/);
    expect(() => parseSTL(asciiStl, { maxOutputBytes: 200 })).toThrow(/STL_ALLOCATION_LIMIT/);
  });
});

describe("native mesh asset integration", () => {
  it("loads PLY indexed attributes and diagnostics through the existing glTF asset contract", async () => {
    const loader = new PLYLoader(), progress: string[] = [];
    const url = dataUrl(asciiPly);
    const asset = await loader.load({ url, type: "ply", onProgress: ({ phase }) => progress.push(phase) }, new LoadContext());
    expect(asset.url).toBe(url); expect(progress).toContain("complete");
    expect(asset.meshes).toHaveLength(1);
    const mesh = asset.meshes[0]!;
    expect(mesh.topology).toBe("triangles"); expect(mesh.positions).toHaveLength(5); expect(mesh.indices).toHaveLength(9);
    expect(mesh.normals[0]).toEqual([0, 0, 1]); expect(mesh.texcoords[3]).toEqual([0.5, 0.5]);
    expect(mesh.colors[1]![3]).toBeCloseTo(128 / 255);
    expect(asset.loaderDiagnostics.unsupportedFeatures.join(" ")).toContain("element edge");
    expect(() => asset.createScene()).not.toThrow();
    loader.dispose(asset); expect(asset.disposed).toBe(true); expect(() => asset.createScene()).toThrow(/disposed/);
  });

  it("preserves nonempty STL solid names and index ranges as separate asset meshes", async () => {
    const loader = new STLLoader();
    const asset = await loader.load({ url: dataUrl(asciiStl), type: "stl" }, new LoadContext());
    expect(asset.meshes.map((mesh) => mesh.name)).toEqual(["first", "second"]);
    expect(asset.meshes.map((mesh) => mesh.indices)).toEqual([[0, 1, 2], [0, 1, 2]]);
    expect(asset.meshes.map((mesh) => mesh.positions.length)).toEqual([3, 3]);
    expect(asset.meshes[1]!.positions[0]).toEqual([0, 0, 1]);
    expect(asset.loaderDiagnostics.unsupportedFeatures.join(" ")).toContain("empty solids");
    expect(() => asset.createScene()).not.toThrow();
    loader.dispose(asset); expect(asset.disposed).toBe(true);
  });

  it("remaps shared indexed attributes per group and makes duplicate names safe for render resources", async () => {
    const source: NativeMeshData = {
      positions: new Float32Array([0,0,0, 1,0,0, 0,1,0, 1,1,0, 9,9,9]),
      normals: new Float32Array(Array(5).fill([0,0,1]).flat()),
      texcoords: new Float32Array([0,0, 1,0, 0,1, 1,1, 9,9]),
      colors: new Float32Array([1,0,0,1, 0,1,0,1, 0,0,1,1, 1,1,1,1, 0,0,0,1]),
      indices: new Uint32Array([0,1,2, 2,1,3]), topology: "triangles", diagnostics: [],
      groups: [{ name: "part", start: 0, count: 3 }, { name: "part", start: 3, count: 3 }]
    };
    const loader = new GLTFLoader();
    const asset = await loadNativeMeshAsset(source, "test", "memory:test", loader, new LoadContext());
    expect(asset.meshes.map((mesh) => mesh.name)).toEqual(["part", "part (2)"]);
    expect(asset.meshes.map((mesh) => mesh.indices)).toEqual([[0,1,2], [0,1,2]]);
    expect(asset.meshes[1]!.positions).toEqual([[0,1,0], [1,0,0], [1,1,0]]);
    expect(asset.meshes[1]!.texcoords).toEqual([[0,1], [1,0], [1,1]]);
    expect(asset.meshes[1]!.colors).toEqual([[0,0,1,1], [0,1,0,1], [1,1,1,1]]);
    expect(asset.loaderDiagnostics.unsupportedFeatures.join(" ")).toContain("renamed");
    expect(asset.loaderDiagnostics.unsupportedFeatures.join(" ")).toContain("unreferenced vertices");
    const resources = await createGLTFRenderResources(asset);
    expect([...resources.geometryLibrary.keys()]).toEqual(["part", "part (2)"]);
    expect(resources.renderableBindings).toHaveLength(2);
    resources.dispose();
    loader.dispose(asset);
  });

  it("preserves point topology and rejects a cancelled source request", async () => {
    const loader = new PLYLoader(), url = dataUrl(pointPly);
    const asset = await loader.load({ url, type: "ply" }, new LoadContext());
    expect(asset.meshes[0]!.topology).toBe("points"); expect(asset.meshes[0]!.indices).toEqual([0]);
    loader.dispose(asset);
    const controller = new AbortController(), reason = new Error("stop mesh import"); controller.abort(reason);
    await expect(loader.load({ url, signal: controller.signal }, new LoadContext())).rejects.toBe(reason);
  });

  it("rejects groups that omit, overlap, reorder or split triangle indices", async () => {
    const source = parseSTL(asciiStl), gltf = new GLTFLoader();
    const invalidGroups: NonNullable<NativeMeshData["groups"]>[] = [
      [{ name: "partial", start: 0, count: 3 }],
      [{ name: "overlap", start: 0, count: 3 }, { name: "overlap", start: 0, count: 3 }],
      [{ name: "split", start: 0, count: 1 }, { name: "split", start: 1, count: 5 }],
      [{ name: "negative", start: 0, count: -3 }]
    ];
    for (const groups of invalidGroups) {
      await expect(loadNativeMeshAsset({ ...source, groups }, "test", "memory:test", gltf, new LoadContext())).rejects.toThrow(/groups must cover/);
    }
    await expect(loadNativeMeshAsset({ ...source, groups: [{ name: "x".repeat(1025), start: 0, count: 6 }] }, "test", "memory:test", gltf, new LoadContext())).rejects.toThrow(/MESH_GROUP_LIMIT/);
  });

  it("bounds the number of separate render groups before constructing a synthetic document", async () => {
    const groups = Array.from({ length: 4097 }, (_, i) => ({ name: `part-${i}`, start: i * 3, count: 3 }));
    const indices = Uint32Array.from({ length: groups.length * 3 }, (_, i) => i % 3);
    const source: NativeMeshData = { positions: new Float32Array([0,0,0, 1,0,0, 0,1,0]), indices, topology: "triangles", diagnostics: [], groups };
    await expect(loadNativeMeshAsset(source, "test", "memory:test", new GLTFLoader(), new LoadContext())).rejects.toThrow(/MESH_ADAPTER_LIMIT/);
  });
});
