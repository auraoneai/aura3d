import { describe, expect, it } from "vitest";
import { exportOBJ, type AuraExportScene } from "@aura3d/assets/exporters";

// This deliberately small reader is independent of Aura's importers and writer.
// It parses only the Wavefront records exercised by these fixtures, resolves
// each index against its own table, and rejects malformed or dangling refs.
interface Corner { readonly position: number[]; readonly color?: number[]; readonly uv?: number[]; readonly normal?: number[] }
interface Primitive { readonly kind: "f" | "l" | "p"; readonly object: string; readonly group: string; readonly material: string; readonly corners: Corner[] }
interface IndependentOBJ { readonly libraries: string[]; readonly vertices: { position: number[]; color?: number[] }[]; readonly primitives: Primitive[] }
interface IndependentMTL { readonly color?: number[]; readonly alpha?: number; readonly emissive?: number[]; readonly maps: Record<string, string> }

function content(data: Blob | Uint8Array): Uint8Array {
  if (!(data instanceof Uint8Array)) throw new Error("The source writer must return byte data");
  return data;
}
function vector(parts: string[], width: number): number[] {
  if (parts.length !== width || parts.some((item) => item.trim() === "" || !Number.isFinite(Number(item)))) throw new Error("Invalid numeric vector");
  return parts.map(Number);
}
function index(value: string | undefined, length: number): number | undefined {
  if (value === undefined || value === "") return undefined;
  if (!/^[1-9]\d*$/.test(value)) throw new Error("Invalid independent-reader index");
  const resolved = Number(value) - 1;
  if (!Number.isSafeInteger(resolved) || resolved >= length) throw new Error("Dangling independent-reader index");
  return resolved;
}
function readOBJ(data: Uint8Array): IndependentOBJ {
  const vertices: IndependentOBJ["vertices"] = [];
  const texcoords: number[][] = [], normals: number[][] = [], primitives: Primitive[] = [], libraries: string[] = [];
  let object = "", group = "", material = "";
  for (const raw of new TextDecoder().decode(data).split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [op, ...parts] = line.split(/\s+/u);
    if (op === "v") {
      if (parts.length !== 3 && parts.length !== 6) throw new Error("Invalid OBJ vertex");
      vertices.push({ position: vector(parts.slice(0, 3), 3), ...(parts.length === 6 ? { color: vector(parts.slice(3), 3) } : {}) });
    } else if (op === "vt") texcoords.push(vector(parts, 2));
    else if (op === "vn") normals.push(vector(parts, 3));
    else if (op === "mtllib") { if (parts.length !== 1) throw new Error("Invalid material library"); libraries.push(parts[0]!); }
    else if (op === "o" || op === "g" || op === "usemtl") {
      if (parts.length !== 1) throw new Error(`Invalid ${op} record`);
      if (op === "o") object = parts[0]!; else if (op === "g") group = parts[0]!; else material = parts[0]!;
    } else if (op === "f" || op === "l" || op === "p") {
      const width = op === "f" ? 3 : op === "l" ? 2 : 1;
      if (parts.length !== width || !object || !group || !material) throw new Error("Invalid primitive record");
      const corners = parts.map((item): Corner => {
        const fields = item.split("/");
        if (fields.length > 3 || (op === "p" && fields.length !== 1) || (op === "l" && fields.length > 2)) throw new Error("Invalid primitive reference");
        const v = index(fields[0], vertices.length), t = index(fields[1], texcoords.length), n = index(fields[2], normals.length);
        if (v === undefined) throw new Error("Missing position reference");
        return { ...vertices[v]!, ...(t === undefined ? {} : { uv: texcoords[t]! }), ...(n === undefined ? {} : { normal: normals[n]! }) };
      });
      primitives.push({ kind: op, object, group, material, corners });
    } else throw new Error(`Unsupported independent-reader OBJ record: ${op}`);
  }
  return { libraries, vertices, primitives };
}
function readMTL(data: Uint8Array): Map<string, IndependentMTL> {
  const materials = new Map<string, { color?: number[]; alpha?: number; emissive?: number[]; maps: Record<string, string> }>();
  let current: { color?: number[]; alpha?: number; emissive?: number[]; maps: Record<string, string> } | undefined;
  for (const raw of new TextDecoder().decode(data).split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [op, ...parts] = line.split(/\s+/u);
    if (op === "newmtl") {
      if (parts.length !== 1 || materials.has(parts[0]!)) throw new Error("Invalid MTL material name");
      current = { maps: {} }; materials.set(parts[0]!, current);
    } else {
      if (!current) throw new Error("MTL property lacks material");
      if (op === "Kd") current.color = vector(parts, 3);
      else if (op === "d") current.alpha = vector(parts, 1)[0];
      else if (op === "Ke") current.emissive = vector(parts, 3);
      else if (op === "map_Kd" || op === "map_Ke" || op === "norm") {
        if (parts.length !== 1 || parts[0]!.startsWith("-") || parts[0]!.split("/").includes("..")) throw new Error("Invalid MTL texture path");
        current.maps[op] = parts[0]!;
      } else throw new Error(`Unsupported independent-reader MTL record: ${op}`);
    }
  }
  return materials;
}

const texel = Uint8Array.of(7, 17, 31, 255);
const normal = Uint8Array.of(128, 128, 255, 255);
const glow = Uint8Array.of(41, 59, 83, 255);
function fixture(): AuraExportScene {
  return {
    nodes: [{ name: "Parent", children: [1] }, { name: "Fixture instance", mesh: 0, translation: [10, 0, 0], scale: [-2, 3, 1] }],
    roots: [0],
    meshes: [{ name: "Mixed topology", primitives: [
      { material: 0, attributes: {
        POSITION: { itemSize: 3, values: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
        NORMAL: { itemSize: 3, values: [0, 0, 1, 0, 0, 1, 0, 0, 1] },
        TEXCOORD_0: { itemSize: 2, values: [0, 0, 1, 0, 0, 1] }
      } },
      { mode: "lines", material: 1, indices: [1, 0], attributes: {
        POSITION: { itemSize: 3, values: [1, 1, 0, 2, 1, 0] },
        TEXCOORD_0: { itemSize: 2, values: [0.25, 0.5, 0.75, 1] },
        NORMAL: { itemSize: 3, values: [0, 0, 1, 0, 0, 1] },
        COLOR_0: { itemSize: 4, normalized: true, values: Uint8Array.of(255, 0, 64, 128, 0, 255, 255, 255) }
      } },
      { mode: "points", indices: [1, 0], attributes: {
        POSITION: { itemSize: 3, values: [0, 0, 1, 0, 1, 1] },
        TEXCOORD_0: { itemSize: 2, values: [0, 0, 1, 1] },
        NORMAL: { itemSize: 3, values: [0, 0, 1, 0, 0, 1] },
        TANGENT: { itemSize: 4, values: [1, 0, 0, 1, 1, 0, 0, 1] }
      } }
    ] }],
    materials: [
      { name: "Paint !", baseColor: [0.2, 0.4, 0.6, 0.5], emissive: [0.1, 0.2, 0.3], baseColorTexture: "maps/albedo.bin", emissiveTexture: "maps/glow.bin", normalTexture: "../normal.bin", normalTextureScale: 0.5 },
      { name: "Paint ?", baseColorTexture: "missing.bin", metallicRoughnessTexture: "metal.bin", metallic: 0.2, roughness: 0.7 }
    ],
    dependencies: [
      { name: "maps/albedo.bin", data: texel }, { name: "maps/glow.bin", data: glow }, { name: "../normal.bin", data: normal },
      { name: "metal.bin", data: Uint8Array.of(1, 2) }
    ]
  };
}

describe("independent OBJ and MTL export round trips", () => {
  it("resolves world-space triangles, reflected winding, lines, points, color and UV/normal indices", () => {
    const result = exportOBJ(fixture());
    const parsed = readOBJ(content(result.data));
    expect(result.mimeType).toBe("model/obj");
    expect(parsed.libraries).toEqual(["materials.mtl"]);
    expect(parsed.vertices).toHaveLength(7);
    expect(parsed.vertices.map((v) => v.color)).toEqual([
      [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 0, 64 / 255], [0, 1, 1], [1, 1, 1], [1, 1, 1]
    ]);
    const [face, edge, firstPoint, secondPoint] = parsed.primitives;
    expect(parsed.primitives.map((item) => item.kind)).toEqual(["f", "l", "p", "p"]);
    expect(face!.corners.map((c) => c.position)).toEqual([[10, 0, 0], [10, 3, 0], [8, 0, 0]]);
    expect(face!.corners.map((c) => c.uv)).toEqual([[0, 0], [0, 1], [1, 0]]);
    expect(face!.corners.map((c) => c.normal)).toEqual([[0, 0, 1], [0, 0, 1], [0, 0, 1]]);
    expect(edge!.corners.map((c) => c.position)).toEqual([[6, 3, 0], [8, 3, 0]]);
    expect(edge!.corners.map((c) => c.uv)).toEqual([[0.75, 1], [0.25, 0.5]]);
    expect(edge!.corners.map((c) => c.color)).toEqual([[0, 1, 1], [1, 0, 64 / 255]]);
    expect([firstPoint!.corners[0]!.position, secondPoint!.corners[0]!.position]).toEqual([[10, 3, 1], [10, 0, 1]]);
    expect(firstPoint!.corners[0]!.uv).toBeUndefined();
    expect(new Set(parsed.primitives.map((item) => item.group)).size).toBe(3);
    const codes = result.warnings.map((warning) => warning.code);
    for (const code of ["HIERARCHY_FLATTENED", "TRANSFORM_BAKED", "VERTEX_COLOR_EXTENSION", "VERTEX_COLOR_DEFAULTED", "VERTEX_ALPHA_LOST", "ATTRIBUTE_LOST"]) expect(codes).toContain(code);
  });

  it("resolves MTL material values, safe dependency names and declared unsupported losses", () => {
    const result = exportOBJ(fixture());
    const obj = readOBJ(content(result.data));
    const dependencies = new Map(result.dependencies.map((entry) => [entry.name, content(entry.data)]));
    const mtl = readMTL(dependencies.get(obj.libraries[0]!)!);
    const face = mtl.get(obj.primitives[0]!.material)!;
    const edge = mtl.get(obj.primitives[1]!.material)!;
    expect(face.color).toEqual([0.2, 0.4, 0.6]);
    expect(face.alpha).toBe(0.5);
    expect(face.emissive).toEqual([0.1, 0.2, 0.3]);
    expect(dependencies.get(face.maps.map_Kd!)).toEqual(texel);
    expect(dependencies.get(face.maps.map_Ke!)).toEqual(glow);
    expect(dependencies.get(face.maps.norm!)).toEqual(normal);
    expect(face.maps.norm).not.toContain("..");
    expect(edge.maps.map_Kd).toBeUndefined();
    expect(obj.primitives[0]!.material).not.toBe(obj.primitives[1]!.material);
    expect(mtl.get(obj.primitives[2]!.material)).toMatchObject({ color: [1, 1, 1], alpha: 1 });
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DEPENDENCY_RENAMED", path: "materials[0].normalTexture" }),
      expect.objectContaining({ code: "MISSING_DEPENDENCY", path: "materials[1].baseColorTexture" }),
      expect.objectContaining({ code: "MATERIAL_TEXTURE_LOST", path: "materials[1].metallicRoughnessTexture" }),
      expect.objectContaining({ code: "MATERIAL_PROPERTY_LOST", path: "materials[0].normalTextureScale" }),
      expect.objectContaining({ code: "DEPENDENCY_LOST", path: "dependencies.metal.bin" })
    ]));
  });

  it("keeps independent vertex, normal and UV index streams across mixed optional attributes", () => {
    const scene: AuraExportScene = {
      nodes: [{ mesh: 0 }], roots: [0], meshes: [{ primitives: [
        { indices: [2, 0, 1], attributes: {
          POSITION: { itemSize: 3, values: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
          NORMAL: { itemSize: 3, values: [0, 1, 0, 0, 1, 0, 0, 1, 0] },
          COLOR_0: { itemSize: 3, normalized: true, values: Uint16Array.of(65535, 0, 0, 0, 65535, 0, 0, 0, 65535) }
        } },
        { attributes: {
          POSITION: { itemSize: 3, values: [2, 0, 0, 3, 0, 0, 2, 1, 0] },
          TEXCOORD_0: { itemSize: 2, values: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6] }
        } },
        { mode: "lines", attributes: { POSITION: { itemSize: 3, values: [4, 0, 0, 5, 0, 0] } } }
      ] }]
    };
    const obj = readOBJ(content(exportOBJ(scene).data));
    const [normalOnly, uvOnly, untexturedEdge] = obj.primitives;
    expect(normalOnly!.corners.map((corner) => corner.position)).toEqual([[0, 1, 0], [0, 0, 0], [1, 0, 0]]);
    expect(normalOnly!.corners.map((corner) => corner.color)).toEqual([[0, 0, 1], [1, 0, 0], [0, 1, 0]]);
    expect(normalOnly!.corners.map((corner) => corner.normal)).toEqual([[0, 1, 0], [0, 1, 0], [0, 1, 0]]);
    expect(normalOnly!.corners.every((corner) => corner.uv === undefined)).toBe(true);
    expect(uvOnly!.corners.map((corner) => corner.uv)).toEqual([[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]]);
    expect(uvOnly!.corners.every((corner) => corner.normal === undefined && corner.color?.every((value) => value === 1))).toBe(true);
    expect(untexturedEdge!.corners.map((corner) => corner.position)).toEqual([[4, 0, 0], [5, 0, 0]]);
    expect(untexturedEdge!.corners.every((corner) => corner.normal === undefined && corner.uv === undefined)).toBe(true);
  });

  it("accounts for earlier default-white vertex rewrites in its exact output byte limit", () => {
    const scene = fixture();
    const complete = content(exportOBJ(scene).data);
    expect(content(exportOBJ(scene, { maxOutputBytes: complete.byteLength }).data)).toEqual(complete);
    expect(() => exportOBJ(scene, { maxOutputBytes: complete.byteLength - 1 })).toThrow(/maxOutputBytes/);
  });

  it("reports when empty authored mesh and material names must be replaced", () => {
    const scene: AuraExportScene = {
      nodes: [{ mesh: 0 }], roots: [0],
      meshes: [{ name: "", primitives: [{ material: 0, attributes: { POSITION: { itemSize: 3, values: [0, 0, 0, 1, 0, 0, 0, 1, 0] } } }] }],
      materials: [{ name: "" }]
    };
    const result = exportOBJ(scene);
    const obj = readOBJ(content(result.data));
    const mtl = readMTL(content(result.dependencies.find((entry) => entry.name === "materials.mtl")!.data));
    expect(mtl.has(obj.primitives[0]!.material)).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "NAME_CHANGED", path: "materials[0].name" }),
      expect.objectContaining({ code: "NAME_CHANGED", path: "meshes[0].name" })
    ]));
  });
});
