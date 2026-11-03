import { createHash, webcrypto } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadContext } from "../../packages/assets/src/LoadContext";
// Load the real render adapter during collection so cold module transformation
// does not consume the renderable projection test's execution timeout.
import "../../packages/assets/src/GLTFLoader";
import {
  parseGCode, parseNRRD, parsePCD, parsePDB, parseVTK, parseXYZ, ScientificFormatLoader, ScientificRenderableLoader
} from "../../packages/assets/src/loaders/ScientificFormatLoaders";

// The byte fixtures in this file are independently constructed from these specifications:
// https://pointclouds.org/documentation/tutorials/pcd_file_format.html
// https://openbabel.org/docs/FileFormats/XYZ_cartesian_coordinates_format.html
// https://www.wwpdb.org/documentation/file-format-content/format33/sect9.html
// https://docs.vtk.org/en/latest/vtk_file_formats/vtk_legacy_file_format.html
// https://teem.sourceforge.net/nrrd/format.html
// https://linuxcnc.org/docs/stable/html/gcode/g-code.html
const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
function join(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
function numberBytes(values: number[], type: "f32" | "i32" | "u16", little: boolean): Uint8Array {
  const stride = type === "u16" ? 2 : 4, data = new Uint8Array(values.length * stride), view = new DataView(data.buffer);
  values.forEach((value, i) => {
    if (type === "f32") view.setFloat32(i * stride, value, little);
    else if (type === "i32") view.setInt32(i * stride, value, little);
    else view.setUint16(i * stride, value, little);
  });
  return data;
}
function literalLzf(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += 32) {
    const block = bytes.subarray(i, i + 32);
    parts.push(Uint8Array.of(block.length - 1), block);
  }
  return join(...parts);
}
function compressedPCD(fields: string, size: string, type: string, count: string, raw: Uint8Array, compressed = literalLzf(raw)): Uint8Array {
  const header = encode(`VERSION .7\nFIELDS ${fields}\nSIZE ${size}\nTYPE ${type}\nCOUNT ${count}\nWIDTH 2\nHEIGHT 1\nPOINTS 2\nDATA binary_compressed\n`);
  const sizes = new Uint8Array(8), view = new DataView(sizes.buffer);
  view.setUint32(0, compressed.length, true); view.setUint32(4, raw.length, true);
  return join(header, sizes, compressed);
}
function atom(serial: number, x: number, y: number, z: number, element: string): string {
  const line = Array<string>(80).fill(" ");
  const put = (at: number, text: string) => { for (let i = 0; i < text.length; i++) line[at + i] = text[i]!; };
  put(0, "ATOM  "); put(6, String(serial).padStart(5)); put(12, element.padStart(4));
  put(17, "MOL"); put(21, "A"); put(22, "   1");
  put(30, x.toFixed(3).padStart(8)); put(38, y.toFixed(3).padStart(8)); put(46, z.toFixed(3).padStart(8));
  put(54, "  1.00"); put(60, " 12.50"); put(76, element.padStart(2));
  return line.join("");
}
const digest = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
afterEach(() => vi.unstubAllGlobals());

describe("scientific format imports", () => {
  it("decodes PCD field-major LZF payloads, vector attributes and padding", () => {
    const raw = join(numberBytes([1.25, -2], "f32", true), numberBytes([2, 3], "f32", true),
      numberBytes([3, 4], "f32", true), numberBytes([7, 65535], "u16", true), numberBytes([5, 6, 7, 8], "u16", true));
    const result = parsePCD(compressedPCD("x y z intensity feature _", "4 4 4 2 2 2", "F F F U U U", "1 1 1 1 2 1", raw));
    expect([...result.positions]).toEqual([1.25, 2, 3, -2, 3, 4]);
    expect([...result.attributes.intensity!.data]).toEqual([7, 65535]);
    expect([...result.attributes.feature!.data]).toEqual([5, 6, 7, 8]);
    expect(result.attributes._).toBeUndefined();

    // A one-byte literal followed by an overlapping 23-byte back-reference.
    const repeated = compressedPCD("x y z", "4 4 4", "F F F", "1 1 1", new Uint8Array(24), Uint8Array.of(0, 0, 224, 14, 0));
    expect([...parsePCD(repeated).positions]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(() => parsePCD(compressedPCD("x y z", "4 4 4", "F F F", "1 1 1", new Uint8Array(24), Uint8Array.of(32, 0)))).toThrow(/LZF back-reference/);
  });

  it("preserves PCD NaNs and rejects inconsistent dimensions and out-of-range text", () => {
    const header = "VERSION .7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nWIDTH 1\nHEIGHT 1\nPOINTS 1\nDATA ascii\n";
    const result = parsePCD(`${header}nan -2 3\n`);
    expect(Number.isNaN(result.positions[0])).toBe(true);
    expect(result.diagnostics[0]?.code).toBe("SCIENTIFIC_NONFINITE_COORDINATES");
    expect(() => parsePCD(`${header}1e99 2 3\n`)).toThrow(/f32 range/);
    expect(() => parsePCD(`${header.replace("WIDTH 1", "WIDTH 2")}1 2 3\n`)).toThrow(/dimensions disagree/);
    expect(() => parsePCD(`${header.replace("HEIGHT 1", "HEIGHT wrong")}1 2 3\n`)).toThrow(/Invalid PCD height/);
  });

  it("decodes interleaved little-endian PCD records and rejects truncated data", () => {
    const header = encode("VERSION .7\nFIELDS x y z intensity\nSIZE 4 4 4 2\nTYPE F F F U\nWIDTH 2\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS 2\nDATA binary\n");
    const payload = join(numberBytes([1, -2, 3], "f32", true), numberBytes([255], "u16", true),
      numberBytes([-4, 5, 0.5], "f32", true), numberBytes([12], "u16", true));
    const result = parsePCD(join(header, payload));
    expect([...result.positions]).toEqual([1, -2, 3, -4, 5, 0.5]);
    expect([...result.attributes.intensity!.data]).toEqual([255, 12]);
    expect(result.metadata.viewpoint).toEqual([0, 0, 0, 1, 0, 0, 0]);
    expect(() => parsePCD(join(header, payload.subarray(0, -1)))).toThrow(/binary byte count/);
  });

  it("reads molecular and numeric XYZ units and validates attribute ranges", () => {
    const molecular = parseXYZ("2\nwater fragment\nO 0 1 2\nH -1 0.5 3\n");
    expect(molecular.units).toBe("angstrom");
    expect(molecular.metadata.elements).toEqual(["O", "H"]);
    expect([...molecular.positions]).toEqual([0, 1, 2, -1, 0.5, 3]);
    expect(parseXYZ("1\ncomment\nH 0 0 0\n", { xyzUnits: "mm" }).units).toBe("angstrom");
    expect(parseXYZ("1\natomic-number variant\n6 1 2 3\n").metadata.elements).toEqual(["6"]);
    const numeric = parseXYZ("0 1 2 0.25\n3 4 5 0.75\n", { xyzUnits: "mm" });
    expect(numeric.units).toBe("mm");
    expect([...numeric.attributes.extra!.data]).toEqual([0.25, 0.75]);
    expect(() => parseXYZ("0 1 2 1e99\n")).toThrow(/f32 range/);
    expect(() => parseXYZ("2\ncomment\nH 0 0 0\n")).toThrow(/count disagrees/);
    expect(() => parseXYZ("H 0 0 0\n1 1 1\n")).toThrow(/inconsistent element columns/);
  });

  it("preserves PDB models and expands each distinct CONECT bond within its model", () => {
    const pdb = ["MODEL        1", atom(1, 1, 2, 3, "C"), atom(2, 4, 5, 6, "O"), "ENDMDL",
      "MODEL        2", atom(1, 7, 8, 9, "C"), atom(2, 10, 11, 12, "O"), "ENDMDL",
      "CONECT    1    2", "CONECT    2    1", "CONECT    1   99"].join("\n");
    const result = parsePDB(pdb);
    expect(result.units).toBe("angstrom");
    expect([...result.positions]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect([...result.bonds!]).toEqual([0, 1, 2, 3]);
    expect([...result.attributes.model!.data]).toEqual([1, 1, 2, 2]);
    expect(result.diagnostics.map((item) => item.code)).toEqual(["SCIENTIFIC_PDB_UNKNOWN_BOND"]);
    expect(() => parsePDB(`${atom(1, 0, 0, 0, "C")}\n${atom(1, 1, 1, 1, "C")}`)).toThrow(/Duplicate PDB atom serial/);
  });

  it("decodes VTK ASCII geometry and big-endian binary connectivity and attributes", () => {
    const ascii = "# vtk DataFile Version 3.0\ntri\nASCII\nDATASET POLYDATA\nPOINTS 3 float\n0 0 0  1 0 0  0 1 0\nPOLYGONS 1 4\n3 0 1 2\nPOINT_DATA 3\nSCALARS t float\nLOOKUP_TABLE default\n1 2 3\n";
    const result = parseVTK(ascii);
    expect([...result.positions]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect([...result.cells[0]!.offsets]).toEqual([0, 3]);
    expect([...result.cells[0]!.indices]).toEqual([0, 1, 2]);
    expect([...result.pointAttributes.t!.data]).toEqual([1, 2, 3]);
    const binary = join(encode("# vtk DataFile Version 4.2\ngrid\nBINARY\nDATASET UNSTRUCTURED_GRID\nPOINTS 2 float\n"),
      numberBytes([1, 2, 3, 4, 5, 6], "f32", false), encode("\nCELLS 1 3\n"), numberBytes([2, 0, 1], "i32", false),
      encode("\nCELL_TYPES 1\n"), numberBytes([3], "i32", false), encode("\nCELL_DATA 1\nVECTORS velocity float\n"),
      numberBytes([-1, 0.5, 2], "f32", false), encode("\n"));
    const grid = parseVTK(binary);
    expect([...grid.positions]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...grid.cells[0]!.indices]).toEqual([0, 1]);
    expect([...grid.cellTypes!]).toEqual([3]);
    expect([...grid.cellAttributes.velocity!.data]).toEqual([-1, 0.5, 2]);
    expect(() => parseVTK(ascii.replace("3 0 1 2", "3 0 1 3"))).toThrow(/index outside points/);
    expect(() => parseVTK(ascii.replace("POINT_DATA 3", "POLYGONS 0 0\nPOINT_DATA 3"))).toThrow(/Duplicate or out-of-order/);
    expect(() => parseVTK(ascii.replace("1 2 3\n", "1e99 2 3\n"))).toThrow(/f32 range/);
  });

  it("decodes NRRD orientation and special floats without changing source axes", async () => {
    const text = "NRRD0004\ntype: float\ndimension: 4\nsizes: 2 1 1 1\nencoding: ascii\nspace: left-posterior-superior\nspace origin: (1,2,3)\nspace directions: (0.5,0,0) (0,2,0) (0,0,-3) none\nspace units: \"mm\" \"mm\" \"mm\"\n\nNaN -inf\n";
    const result = await parseNRRD(text);
    expect(result.sizes).toEqual([2, 1, 1, 1]);
    expect(result.origin).toEqual([1, 2, 3]);
    expect(result.directions).toEqual([[0.5, 0, 0], [0, 2, 0], [0, 0, -3], null]);
    expect(result.units).toEqual(["mm", "mm", "mm"]);
    expect(Number.isNaN(result.samples[0])).toBe(true);
    expect(result.samples[1]).toBe(-Infinity);
    await expect(parseNRRD(text.replace("(0,2,0)", "(0,2)"))).rejects.toThrow(/dimensions disagree/);
    await expect(parseNRRD(text.replace("none\n", "none junk\n"))).rejects.toThrow(/Invalid NRRD space directions/);
  });

  it("decodes NRRD big-endian detached data and skips bounded raw and gzip prefixes", async () => {
    const header = "NRRD0005\ntype: ushort\ndimension: 1\nsizes: 2\nencoding: raw\nendian: big\ndatafile: voxels.raw\nlineskip: 1\nbyteskip: 2\n";
    const data = join(encode("comment\r\n"), Uint8Array.of(90, 91), numberBytes([258, 65535], "u16", false));
    expect([...(await parseNRRD(header, { detachedData: data })).samples]).toEqual([258, 65535]);
    expect([...(await parseNRRD(header, { detachedData: join(data, Uint8Array.of(77, 88)) })).samples]).toEqual([258, 65535]);
    const tail = header.replace("lineskip: 1\nbyteskip: 2", "lineskip: 99\nbyteskip: -1");
    expect([...(await parseNRRD(tail, { detachedData: data })).samples]).toEqual([258, 65535]);
    const gzipHeader = header.replace("encoding: raw", "encoding: gzip").replace("byteskip: 2", "byteskip: 3");
    const gzip = join(encode("metadata\n"), gzipSync(join(Uint8Array.of(1, 2, 3), numberBytes([258, 65535], "u16", false))));
    expect([...(await parseNRRD(gzipHeader, { detachedData: gzip })).samples]).toEqual([258, 65535]);
    await expect(parseNRRD(header, { detachedData: data.subarray(0, 5) })).rejects.toThrow(/line skip exceeds/);
    await expect(parseNRRD(gzipHeader, { detachedData: gzip, maxOutputBytes: 12 })).rejects.toThrow(/allocation_limit/i);
    await expect(parseNRRD(`${header}data file: other.raw\n`, { detachedData: data })).rejects.toThrow(/Duplicate NRRD field/);
  });

  it("validates detached dependencies and does not fetch an ambiguous or caller-supplied reference", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const header = encode("NRRD0005\ntype: uint8\ndimension: 1\nsizes: 3\nencoding: raw\ndata file: voxels.raw\n");
    const data = Uint8Array.of(3, 4, 5), requested: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input); requested.push(url);
      return new Response(Uint8Array.from(url.endsWith("vol.nhdr") ? header : data));
    });
    const request = { url: "https://example.test/scan/vol.nhdr", sourceOrigin: "https://example.test", allowedOrigins: ["self"],
      integrity: { version: 1 as const, digest: digest(header), requireDependencies: true, dependencies: { "voxels.raw": digest(data) } } };
    const result = await new ScientificFormatLoader("nrrd").load(request, new LoadContext());
    expect(result.kind).toBe("volume");
    if (result.kind === "volume") expect([...result.samples]).toEqual([3, 4, 5]);
    expect(requested).toEqual([request.url, "https://example.test/scan/voxels.raw"]);
    requested.length = 0;
    const supplied = await new ScientificFormatLoader("nrrd", { detachedData: data }).load(request, new LoadContext());
    expect(supplied.kind).toBe("volume");
    expect(requested).toEqual([request.url]);
    requested.length = 0;
    await expect(new ScientificFormatLoader("nrrd").load({ ...request, integrity: { ...request.integrity, dependencies: {} } }, new LoadContext())).rejects.toThrow(/Missing required dependency integrity/);
    expect(requested).toEqual([request.url]);
    requested.length = 0;
    await expect(new ScientificFormatLoader("nrrd").load({ ...request, maxBytes: header.byteLength + 2 }, new LoadContext())).rejects.toThrow(/maxBytes/);
    expect(requested).toEqual([request.url, "https://example.test/scan/voxels.raw"]);
    requested.length = 0;
    await expect(new ScientificFormatLoader("nrrd").load({ ...request, integrity: { ...request.integrity, dependencies: { "voxels.raw": "0".repeat(64) } } }, new LoadContext())).rejects.toThrow(/integrity mismatch/);

    const ambiguous = encode(`${new TextDecoder().decode(header)}datafile: other.raw\n`);
    requested.length = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { requested.push(String(input)); return new Response(Uint8Array.from(ambiguous)); });
    await expect(new ScientificFormatLoader("nrrd").load({ url: request.url }, new LoadContext())).rejects.toThrow(/Duplicate NRRD field/);
    expect(requested).toEqual([request.url]);
    const embedded = encode("NRRD0005\ntype: uint8\ndimension: 1\nsizes: 1\nencoding: raw\ndata file:=metadata only\n\nA");
    requested.length = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { requested.push(String(input)); return new Response(Uint8Array.from(embedded)); });
    const embeddedResult = await new ScientificFormatLoader("nrrd").load({ url: request.url }, new LoadContext());
    expect(embeddedResult.kind === "volume" && [...embeddedResult.samples]).toEqual([65]);
    expect(requested).toEqual([request.url]);
  });

  it("selects scientific loaders from explicit representations and aliases", () => {
    const nrrd = new ScientificFormatLoader("nrrd"), gcode = new ScientificFormatLoader("gcode");
    expect(nrrd.canLoad({ url: "https://example.test/signed", format: "NHDR" })).toBe(true);
    expect(nrrd.canLoad({ url: "scan.nrrd", format: "glb" })).toBe(false);
    expect(gcode.canLoad({ url: "https://example.test/signed", format: ".NC" })).toBe(true);
    expect(gcode.canLoad({ url: "job.gco?sig=abc" })).toBe(true);
  });

  it("projects source positions to point geometry with matching bounds and explicit losses", async () => {
    const nativeFetch = globalThis.fetch, url = "https://example.test/cloud.xyz";
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => String(input) === url
      ? Promise.resolve(new Response("-2 3 4 0.25\n5 -1 8 0.75\n")) : nativeFetch(input, init));
    const loader = new ScientificRenderableLoader("xyz");
    const asset = await loader.load({ url }, new LoadContext());
    expect(asset.meshes[0]!.topology).toBe("points");
    expect(asset.meshes[0]!.positions).toEqual([[-2, 3, 4], [5, -1, 8]]);
    expect(asset.meshes[0]!.geometry.bounds).toEqual({ min: [-2, -1, 4], max: [5, 3, 8] });
    expect(asset.scientific.kind).toBe("points");
    expect(asset.scientificLosses.map((loss) => loss.code)).toContain("SCIENTIFIC_RENDER_ATTRIBUTE_LOSS");
    loader.dispose(asset);
    expect(asset.disposed).toBe(true);
  });

  it("keeps G92 moves continuous, respects modal units and distributes arc extrusion", () => {
    const path = parseGCode("G21\nG90\nG1 X10 E2 F100\nG92 X0 E0\nG1 X5 E1\nG91 X1\nG20 G90 X1\n");
    expect([...path.positions]).toEqual([0, 0, 0, 10, 0, 0, 10, 0, 0, 15, 0, 0, 15, 0, 0, 16, 0, 0, 16, 0, 0, 35.4, 0, 0]);
    expect([...path.extrusion]).toEqual([2, 1, 0, 0]);
    expect([...path.feedRate]).toEqual([100, 100, 100, 100]);
    const arc = parseGCode("G21\nG0 X1 Y0\nG3 X0 Y1 I-1 J0 E1 P1\n", { arcTolerance: 0.01 });
    expect(arc.positions.at(-3)).toBe(0);
    expect(arc.positions.at(-2)).toBe(1);
    expect([...arc.extrusion].reduce((sum, n) => sum + n, 0)).toBeCloseTo(1);
    expect(arc.positions[6]).toBe(1);
    expect(arc.positions[9]).toBeGreaterThan(0);
    expect(arc.positions[10]).toBeGreaterThan(0);
  });

  it("rejects unsupported, overflowing and unbounded scientific inputs", async () => {
    expect(() => parseGCode(`G1 X1${"0".repeat(309)}`)).toThrow();
    expect(() => parseGCode("G1 X1 F999999999999999999999999999999999999999")).toThrow(/f32 range/);
    expect(() => parseGCode("G0 X1\nG3 X0 Y1 I-1 R1")).toThrow(/cannot combine/);
    expect(() => parseGCode("G0 X1\nG3 X0 Y1 I-1", { arcTolerance: 1e-30, maxSegments: 10 })).toThrow(/segment limit/);
    expect(() => parseGCode("G1 X1\nG92 G1 X2")).toThrow(/cannot share/);
    expect(() => parseXYZ("1 2 3\n4 5 6\n", { maxElements: 1 })).toThrow(/limit/);
    await expect(parseNRRD("NRRD0005\ntype: float\ndimension: 1\nsizes: 1\nencoding: ascii\n\n1e99\n")).rejects.toThrow(/f32 range/);
    await expect(parseNRRD("NRRD0005\ntype: uint8\ndimension: 1\nsizes: 1\nencoding: raw\ndata file: LIST\n")).rejects.toThrow(/multi-file/);
    await expect(parseNRRD("NRRD0005\ntype: uint8\ndimension: 1\nsizes: 1\nencoding: raw\ndata file: image%03x.raw 0 3 1\n")).rejects.toThrow(/multi-file/);
  });
});
