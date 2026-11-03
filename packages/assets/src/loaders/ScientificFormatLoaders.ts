import { AssetLoadError, mergeAssetRequestOptions, redactAssetUrl, validateAssetMaxBytes, type AssetIntegrity, type AssetLoadRequest, type AssetLoader, type AssetRequestOptions } from "../AssetLoader";
import type { LoadContext } from "../LoadContext";
import type { GLTFAsset, GLTFLoader as GLTFLoaderType } from "../GLTFLoader";
import { AssetIntegrityError, AssetSizeError, fetchBytes, validateAssetUrlPolicy, verifyAssetBytes } from "../LoaderFetch";
import { readNRRDHeader } from "../NRRDHeader";
import {
  checkedScientificInput,
  DEFAULT_SCIENTIFIC_INPUT_BYTES,
  ScientificImportError,
  scientificLineEnd as lineEnd,
  scientificUtf8 as utf8
} from "../ScientificInput";

export { inspectNRRDDataReference } from "../NRRDHeader";
export { ScientificImportError } from "../ScientificInput";

/** Scientific imports preserve source axes; no implicit handedness conversion is applied. */
export type ScientificFormat = "pcd" | "pdb" | "vtk" | "xyz" | "nrrd" | "gcode";
export type ScientificArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;
export interface ScientificAttribute { readonly components: number; readonly data: ScientificArray; readonly unit?: string }
export interface ScientificDiagnostic { readonly code: string; readonly message: string }
export interface ScientificImportOptions {
  readonly maxBytes?: number;
  readonly maxElements?: number;
  readonly maxOutputBytes?: number;
  readonly maxSegments?: number;
  readonly arcTolerance?: number;
  /** Overrides the unspecified unit of numeric XYZ point lists. */
  readonly xyzUnits?: string;
  /** Optional detached NRRD bytes; the loader applies the dependency integrity policy to them. */
  readonly detachedData?: Uint8Array | ArrayBuffer;
}
interface CommonAsset { readonly format: ScientificFormat; readonly diagnostics: readonly ScientificDiagnostic[] }
export interface ScientificPointCloud extends CommonAsset {
  readonly kind: "points";
  readonly units: string;
  readonly positions: Float32Array | Float64Array;
  readonly attributes: Readonly<Record<string, ScientificAttribute>>;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly bonds?: Uint32Array;
}
export interface ScientificCellSet { readonly kind: "vertices" | "lines" | "polygons" | "triangle-strips" | "cells"; readonly offsets: Uint32Array; readonly indices: Uint32Array }
export interface ScientificMesh extends CommonAsset {
  readonly kind: "mesh";
  readonly units: "unspecified";
  readonly positions: Float32Array | Float64Array;
  readonly cells: readonly ScientificCellSet[];
  readonly cellTypes?: Uint8Array;
  readonly pointAttributes: Readonly<Record<string, ScientificAttribute>>;
  readonly cellAttributes: Readonly<Record<string, ScientificAttribute>>;
  readonly metadata: Readonly<Record<string, unknown>>;
}
export interface ScientificVolume extends CommonAsset {
  readonly kind: "volume";
  readonly sizes: readonly number[];
  readonly samples: ScientificArray;
  readonly units: readonly string[];
  readonly space?: string;
  readonly origin?: readonly number[];
  readonly directions?: readonly (readonly number[] | null)[];
  readonly metadata: Readonly<Record<string, string>>;
}
export interface ScientificToolpath extends CommonAsset {
  readonly kind: "toolpath";
  readonly units: "mm";
  /** Consecutive start/end XYZ pairs, one pair per move or arc segment. */
  readonly positions: Float32Array | Float64Array;
  readonly rapid: Uint8Array;
  readonly feedRate: Float32Array;
  readonly extrusion: Float32Array;
}
export type ScientificAsset = ScientificPointCloud | ScientificMesh | ScientificVolume | ScientificToolpath;

const DEFAULT_BYTES = DEFAULT_SCIENTIFIC_INPUT_BYTES;
const DEFAULT_ELEMENTS = 5_000_000;
const DEFAULT_OUTPUT = 256 * 1024 * 1024;
function fail(code: string, message: string): never { throw new ScientificImportError(code, message); }
function positiveLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) fail("SCIENTIFIC_INVALID_LIMIT", "Limits must be positive safe integers");
  return value;
}
function limits(options: ScientificImportOptions) {
  return { bytes: positiveLimit(options.maxBytes, DEFAULT_BYTES), elements: positiveLimit(options.maxElements, DEFAULT_ELEMENTS), output: positiveLimit(options.maxOutputBytes, DEFAULT_OUTPUT), segments: positiveLimit(options.maxSegments, 1_000_000) };
}
function checkedInput(input: string | Uint8Array | ArrayBuffer, options: ScientificImportOptions): Uint8Array {
  return checkedScientificInput(input, limits(options).bytes);
}
function sizeProduct(values: readonly number[], cap: number, label: string): number {
  let result = 1;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || (value !== 0 && result > Math.floor(cap / value))) fail("SCIENTIFIC_ALLOCATION_LIMIT", `${label} exceeds its limit`);
    result *= value;
  }
  return result;
}
function num(text: string | undefined, context: string, allowNonFinite = false): number {
  if (text === undefined || !text.trim()) fail("SCIENTIFIC_MALFORMED", `Missing ${context}`);
  if (allowNonFinite && /^nan$/i.test(text.trim())) return NaN;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text.trim())) fail("SCIENTIFIC_MALFORMED", `Invalid ${context}: ${text}`);
  const n = Number(text);
  if (!Number.isFinite(n)) fail("SCIENTIFIC_MALFORMED", `Invalid ${context}: ${text}`);
  return n;
}
function int(text: string | undefined, context: string): number {
  const value = num(text, context);
  if (!Number.isSafeInteger(value)) fail("SCIENTIFIC_MALFORMED", `${context} must be an integer`);
  return value;
}
type ScalarName = "i8" | "u8" | "i16" | "u16" | "i32" | "u32" | "f32" | "f64";
const scalarBytes: Record<ScalarName, number> = { i8: 1, u8: 1, i16: 2, u16: 2, i32: 4, u32: 4, f32: 4, f64: 8 };
function typed(type: ScalarName, length: number): ScientificArray {
  switch (type) {
    case "i8": return new Int8Array(length); case "u8": return new Uint8Array(length);
    case "i16": return new Int16Array(length); case "u16": return new Uint16Array(length);
    case "i32": return new Int32Array(length); case "u32": return new Uint32Array(length);
    case "f32": return new Float32Array(length); case "f64": return new Float64Array(length);
  }
}
function scalar(view: DataView, offset: number, type: ScalarName, little: boolean): number {
  if (offset < 0 || offset + scalarBytes[type] > view.byteLength) fail("SCIENTIFIC_TRUNCATED", "Binary scalar exceeds input");
  switch (type) {
    case "i8": return view.getInt8(offset); case "u8": return view.getUint8(offset);
    case "i16": return view.getInt16(offset, little); case "u16": return view.getUint16(offset, little);
    case "i32": return view.getInt32(offset, little); case "u32": return view.getUint32(offset, little);
    case "f32": return view.getFloat32(offset, little); case "f64": return view.getFloat64(offset, little);
  }
}
function assignScalar(out: ScientificArray, index: number, value: number, type: ScalarName): void {
  if (type === "f32" && Number.isFinite(value) && !Number.isFinite(Math.fround(value))) {
    fail("SCIENTIFIC_MALFORMED", "Value outside f32 range");
  } else if (!type.startsWith("f")) {
    const bounds: Record<string, readonly [number, number]> = { i8: [-128, 127], u8: [0, 255], i16: [-32768, 32767], u16: [0, 65535], i32: [-2147483648, 2147483647], u32: [0, 4294967295] };
    const range = bounds[type]!;
    if (!Number.isInteger(value) || value < range[0] || value > range[1]) fail("SCIENTIFIC_MALFORMED", `Value outside ${type} range`);
  }
  out[index] = value;
}
function byteView(bytes: Uint8Array): DataView { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
function fieldsToPositions(attributes: Record<string, ScientificAttribute>, count: number): Float64Array {
  const x = attributes.x, y = attributes.y, z = attributes.z;
  if (!x || !y || !z || x.components !== 1 || y.components !== 1 || z.components !== 1) fail("SCIENTIFIC_MALFORMED", "Scalar x, y and z fields are required");
  const positions = new Float64Array(count * 3);
  for (let i = 0; i < count; i++) { positions[i * 3] = x.data[i]!; positions[i * 3 + 1] = y.data[i]!; positions[i * 3 + 2] = z.data[i]!; }
  return positions;
}

/** PCD 0.7 ASCII, little-endian binary and LZF binary_compressed point clouds. */
export function parsePCD(input: string | Uint8Array | ArrayBuffer, options: ScientificImportOptions = {}): ScientificPointCloud {
  const bytes = checkedInput(input, options), lim = limits(options);
  let cursor = 0, mode = "";
  const header: Record<string, string[]> = {};
  while (cursor < bytes.length) {
    const line = lineEnd(bytes, cursor); cursor = line.next;
    if (cursor > 1024 * 1024) fail("SCIENTIFIC_INPUT_LIMIT", "PCD header exceeds 1 MiB");
    const words = line.line.replace(/#.*/, "").trim().split(/\s+/);
    if (!words[0]) continue;
    const key = words[0].toUpperCase();
    if (header[key]) fail("SCIENTIFIC_MALFORMED", `Duplicate PCD ${key}`);
    header[key] = words.slice(1);
    if (key === "DATA") { mode = (words[1] ?? "").toLowerCase(); break; }
  }
  if (!mode) fail("SCIENTIFIC_TRUNCATED", "Missing PCD DATA header");
  const version = header.VERSION?.[0];
  if (version && version !== ".7" && version !== "0.7") fail("SCIENTIFIC_UNSUPPORTED", `Unsupported PCD version ${version}`);
  const names = header.FIELDS ?? header.FIELD;
  const named = names?.filter((name) => name !== "_");
  if (!names?.length || !named || new Set(named).size !== named.length) fail("SCIENTIFIC_MALFORMED", "PCD requires unique named fields");
  if (names.length > Math.min(lim.elements, 4096)) fail("SCIENTIFIC_ALLOCATION_LIMIT", "PCD field count exceeds limit");
  const sizes = header.SIZE, types = header.TYPE, counts = header.COUNT ?? names.map(() => "1");
  if (!sizes || !types || [sizes, types, counts].some((x) => x.length !== names.length)) fail("SCIENTIFIC_MALFORMED", "PCD field declarations differ in length");
  const width = header.WIDTH ? int(header.WIDTH[0], "PCD width") : undefined;
  const height = header.HEIGHT ? int(header.HEIGHT[0], "PCD height") : 1;
  if ((width !== undefined && width < 0) || height < 0) fail("SCIENTIFIC_MALFORMED", "PCD dimensions must be non-negative");
  const count = header.POINTS ? int(header.POINTS[0], "PCD point count") : sizeProduct([width ?? int(undefined, "PCD width"), height], lim.elements, "PCD dimensions");
  if (count < 0 || count > lim.elements) fail("SCIENTIFIC_ALLOCATION_LIMIT", "PCD point count exceeds limit");
  if (width !== undefined && sizeProduct([width, height], lim.elements, "PCD dimensions") !== count) fail("SCIENTIFIC_MALFORMED", "PCD dimensions disagree with POINTS");
  if (header.VIEWPOINT && header.VIEWPOINT.length !== 7) fail("SCIENTIFIC_MALFORMED", "PCD VIEWPOINT requires seven components");
  const declarations = names.map((name, i) => {
    const size = int(sizes[i], "PCD field size"), components = int(counts[i], "PCD field count");
    const code = types[i]?.toUpperCase();
    const type = ({ F4: "f32", F8: "f64", I1: "i8", I2: "i16", I4: "i32", U1: "u8", U2: "u16", U4: "u32" } as Record<string, ScalarName>)[`${code}${size}`];
    if (!type) fail("SCIENTIFIC_UNSUPPORTED", `Unsupported PCD scalar ${code}${size}`);
    if (components < 1 || components > 1024) fail("SCIENTIFIC_ALLOCATION_LIMIT", "Invalid PCD component count");
    return { name, size, components, type };
  });
  const stride = declarations.reduce((sum, field) => sum + field.size * field.components, 0);
  sizeProduct([count, stride * (mode === "binary_compressed" ? 2 : 1) + 24], lim.output, "PCD decoded bytes");
  const attributes: Record<string, ScientificAttribute> = Object.create(null) as Record<string, ScientificAttribute>;
  for (const field of declarations) if (field.name !== "_") attributes[field.name] = { components: field.components, data: typed(field.type, count * field.components) };
  const set = (field: typeof declarations[number], point: number, component: number, value: number) => {
    const dest = attributes[field.name]; if (dest) assignScalar(dest.data, point * field.components + component, value, field.type);
  };
  if (mode === "ascii") {
    const tokens = utf8(bytes.subarray(cursor)).trim().split(/\s+/).filter(Boolean);
    const expected = count * declarations.reduce((sum, field) => sum + field.components, 0);
    if (tokens.length !== expected) fail("SCIENTIFIC_MALFORMED", "PCD ASCII value count disagrees with header");
    let n = 0;
    for (let p = 0; p < count; p++) for (const field of declarations) for (let c = 0; c < field.components; c++) set(field, p, c, num(tokens[n++], "PCD value", field.type.startsWith("f")));
  } else if (mode === "binary" || mode === "binary_compressed") {
    let data: Uint8Array, fieldMajor = false, omitPadding = false;
    const expected = count * stride;
    if (mode === "binary") {
      data = bytes.subarray(cursor);
      if (data.length !== expected) fail("SCIENTIFIC_TRUNCATED", "PCD binary byte count disagrees with header");
    } else {
      if (cursor + 8 > bytes.length) fail("SCIENTIFIC_TRUNCATED", "PCD compressed size header is truncated");
      const view = byteView(bytes), compressed = view.getUint32(cursor, true), expanded = view.getUint32(cursor + 4, true); cursor += 8;
      const packedStride = declarations.filter((field) => field.name !== "_").reduce((sum, field) => sum + field.size * field.components, 0);
      omitPadding = expanded === count * packedStride && packedStride !== stride;
      if ((!omitPadding && expanded !== expected) || compressed !== bytes.length - cursor) fail("SCIENTIFIC_MALFORMED", "PCD compressed sizes disagree with payload");
      data = decompressLZF(bytes.subarray(cursor), expanded); fieldMajor = true;
    }
    const view = byteView(data);
    let fieldOffset = 0;
    for (const field of declarations) {
      if (omitPadding && field.name === "_") continue;
      for (let p = 0; p < count; p++) for (let c = 0; c < field.components; c++) {
        const offset = fieldMajor ? fieldOffset * count + (p * field.components + c) * field.size : p * stride + fieldOffset + c * field.size;
        set(field, p, c, scalar(view, offset, field.type, true));
      }
      fieldOffset += field.size * field.components;
    }
  } else fail("SCIENTIFIC_UNSUPPORTED", `Unsupported PCD DATA encoding ${mode}`);
  const positions = fieldsToPositions(attributes, count);
  let invalid = 0;
  for (const value of positions) if (!Number.isFinite(value)) invalid++;
  return { format: "pcd", kind: "points", units: "unspecified", positions, attributes, metadata: { version: header.VERSION?.[0], width: width ?? count, height, viewpoint: header.VIEWPOINT?.map((v) => num(v, "PCD viewpoint")), encoding: mode }, diagnostics: invalid ? [{ code: "SCIENTIFIC_NONFINITE_COORDINATES", message: `${invalid} non-finite coordinate components were preserved` }] : [] };
}
function decompressLZF(source: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size); let i = 0, o = 0;
  while (i < source.length) {
    const control = source[i++]!;
    if (control < 32) {
      const length = control + 1;
      if (i + length > source.length || o + length > size) fail("SCIENTIFIC_TRUNCATED", "Invalid LZF literal run");
      out.set(source.subarray(i, i + length), o); i += length; o += length;
    } else {
      let length = control >> 5; let reference = o - ((control & 31) << 8) - 1;
      if (length === 7) { if (i >= source.length) fail("SCIENTIFIC_TRUNCATED", "LZF length missing"); length += source[i++]!; }
      if (i >= source.length) fail("SCIENTIFIC_TRUNCATED", "LZF offset missing");
      reference -= source[i++]!; length += 2;
      if (reference < 0 || o + length > size) fail("SCIENTIFIC_MALFORMED", "Invalid LZF back-reference");
      for (let j = 0; j < length; j++) out[o++] = out[reference + j]!;
    }
  }
  if (o !== size) fail("SCIENTIFIC_TRUNCATED", "LZF output length differs from header");
  return out;
}

/** Atomic XYZ (count + comment + symbol or atomic number and XYZ) and numeric XYZ point lists. */
export function parseXYZ(input: string | Uint8Array | ArrayBuffer, options: ScientificImportOptions = {}): ScientificPointCloud {
  const bytes = checkedInput(input, options), lim = limits(options), lines = utf8(bytes).split(/\r?\n/);
  let start = 0; while (start < lines.length && !lines[start]!.trim()) start++;
  const first = lines[start]?.trim() ?? "";
  const molecular = /^\d+$/.test(first);
  const expected = molecular ? int(first, "XYZ atom count") : undefined;
  if (expected !== undefined && expected > lim.elements) fail("SCIENTIFIC_ALLOCATION_LIMIT", "XYZ atom count exceeds limit");
  const comment = molecular ? lines[start + 1] : undefined;
  if (molecular && comment === undefined) fail("SCIENTIFIC_TRUNCATED", "XYZ comment line missing");
  const rows = lines.slice(start + (molecular ? 2 : 0)).filter((line) => line.trim() && !line.trim().startsWith("#"));
  if (rows.length > lim.elements) fail("SCIENTIFIC_ALLOCATION_LIMIT", "XYZ point count exceeds limit");
  if (expected !== undefined && rows.length !== expected) fail("SCIENTIFIC_MALFORMED", "XYZ atom count disagrees with data");
  if (!rows.length) fail("SCIENTIFIC_MALFORMED", "XYZ requires at least one point");
  sizeProduct([rows.length, 24], lim.output, "XYZ decoded bytes");
  const positions = new Float64Array(rows.length * 3), elements: string[] = [], extra: number[] = [];
  let extraCount: number | undefined;
  let firstHasElement: boolean | undefined;
  rows.forEach((line, i) => {
    const cols = line.trim().split(/\s+/), symbol = cols[0] ?? "";
    const hasElement = (/^[A-Za-z][A-Za-z0-9]*$/.test(symbol) && !Number.isFinite(Number(symbol))) || (molecular && /^\d+$/.test(symbol) && Number(symbol) >= 1 && Number(symbol) <= 118);
    if (molecular && !hasElement) fail("SCIENTIFIC_MALFORMED", `XYZ atom ${i + 1} lacks an element`);
    if (firstHasElement === undefined) firstHasElement = hasElement;
    else if (firstHasElement !== hasElement) fail("SCIENTIFIC_MALFORMED", "XYZ rows have inconsistent element columns");
    const offset = hasElement ? 1 : 0;
    if (cols.length < offset + 3) fail("SCIENTIFIC_TRUNCATED", `XYZ point ${i + 1} lacks coordinates`);
    if (hasElement) elements.push(cols[0]!);
    for (let c = 0; c < 3; c++) positions[i * 3 + c] = num(cols[offset + c], "XYZ coordinate");
    const extras = cols.slice(offset + 3);
    if (extraCount === undefined) extraCount = extras.length;
    if (extras.length !== extraCount) fail("SCIENTIFIC_MALFORMED", "XYZ rows have inconsistent attribute counts");
    if (extras.length > 1024 || rows.length * 24 + (extra.length + extras.length) * 4 > lim.output) fail("SCIENTIFIC_ALLOCATION_LIMIT", "XYZ attributes exceed output limit");
    for (const value of extras) extra.push(num(value, "XYZ attribute"));
  });
  const attributes: Record<string, ScientificAttribute> = {};
  if (extraCount) {
    sizeProduct([extra.length, 4], lim.output, "XYZ attribute bytes");
    const data = new Float32Array(extra.length);
    extra.forEach((value, index) => assignScalar(data, index, value, "f32"));
    attributes.extra = { components: extraCount, data };
  }
  return { format: "xyz", kind: "points", units: molecular ? "angstrom" : options.xyzUnits ?? "unspecified", positions, attributes, metadata: { ...(comment === undefined ? {} : { comment }), ...(elements.length ? { elements } : {}) }, diagnostics: [] };
}

/** PDB fixed-column ATOM/HETATM, MODEL and CONECT records; coordinates are Ångström. */
export function parsePDB(input: string | Uint8Array | ArrayBuffer, options: ScientificImportOptions = {}): ScientificPointCloud {
  const lim = limits(options), lines = utf8(checkedInput(input, options)).split(/\r?\n/);
  const positions: number[] = [], occupancy: number[] = [], temperature: number[] = [], models: number[] = [], atoms: Record<string, unknown>[] = [];
  const serialToIndex = new Map<string, number>(), serialModels = new Map<string, number[]>(), connections: Array<[string, string]> = [], diagnostics: ScientificDiagnostic[] = [];
  let model = 1;
  for (const line of lines) {
    const record = line.slice(0, 6).trim();
    if (record === "MODEL") model = int(line.slice(10, 14).trim(), "PDB MODEL");
    if (record === "ATOM" || record === "HETATM") {
      if (atoms.length >= lim.elements || (atoms.length + 1) * 36 > lim.output) fail("SCIENTIFIC_ALLOCATION_LIMIT", "PDB atom count exceeds limit");
      if (line.length < 54) fail("SCIENTIFIC_TRUNCATED", "PDB atom coordinates are truncated");
      const serial = line.slice(6, 11).trim();
      if (!serial) fail("SCIENTIFIC_MALFORMED", "PDB atom serial missing");
      const key = `${model}:${serial}`;
      if (serialToIndex.has(key)) fail("SCIENTIFIC_MALFORMED", `Duplicate PDB atom serial ${serial} in model ${model}`);
      serialToIndex.set(key, atoms.length);
      const modelsForSerial = serialModels.get(serial) ?? [];
      modelsForSerial.push(model); serialModels.set(serial, modelsForSerial);
      positions.push(num(line.slice(30, 38), "PDB x"), num(line.slice(38, 46), "PDB y"), num(line.slice(46, 54), "PDB z"));
      occupancy.push(line.slice(54, 60).trim() ? num(line.slice(54, 60), "PDB occupancy") : 1);
      temperature.push(line.slice(60, 66).trim() ? num(line.slice(60, 66), "PDB temperature") : 0);
      models.push(model);
      atoms.push({ serial, name: line.slice(12, 16).trim(), alternate: line.slice(16, 17).trim(), residue: line.slice(17, 20).trim(), chain: line.slice(21, 22).trim(), residueNumber: line.slice(22, 26).trim(), element: line.slice(76, 78).trim() });
    } else if (record === "CONECT") {
      const source = line.slice(6, 11).trim();
      for (let p = 11; p < line.length; p += 5) { const target = line.slice(p, p + 5).trim(); if (target) {
        if (connections.length >= lim.elements) fail("SCIENTIFIC_ALLOCATION_LIMIT", "PDB bond records exceed limit");
        connections.push([source, target]);
      } }
    }
  }
  if (!atoms.length) fail("SCIENTIFIC_MALFORMED", "PDB has no ATOM or HETATM records");
  sizeProduct([atoms.length, 32], lim.output, "PDB decoded bytes");
  const unique = new Set<string>(), checkedConnections = new Set<string>(), bonds: number[] = [];
  let checks = 0;
  for (const [a, b] of connections) {
    const connectionKey = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (checkedConnections.has(connectionKey)) continue;
    checkedConnections.add(connectionKey);
    let found = false;
    const aModels = serialModels.get(a) ?? [], bModels = serialModels.get(b) ?? [];
    for (const id of aModels.length < bModels.length ? aModels : bModels) {
      if (++checks > Math.min(lim.elements * 16, 10_000_000)) fail("SCIENTIFIC_ALLOCATION_LIMIT", "PDB bond resolution exceeds work limit");
      const x = serialToIndex.get(`${id}:${a}`), y = serialToIndex.get(`${id}:${b}`);
      if (x === undefined || y === undefined) continue;
      found = true;
      const key = `${Math.min(x, y)}:${Math.max(x, y)}`;
      if (x !== y && !unique.has(key)) {
        if ((bonds.length + 2) * 4 + atoms.length * 36 > lim.output) fail("SCIENTIFIC_ALLOCATION_LIMIT", "PDB bonds exceed output limit");
        unique.add(key); bonds.push(x, y);
      }
    }
    if (!found && diagnostics.length < 1024) diagnostics.push({ code: "SCIENTIFIC_PDB_UNKNOWN_BOND", message: `CONECT refers to unknown atoms ${a} and ${b}` });
  }
  const occupancyData = new Float32Array(occupancy.length), temperatureData = new Float32Array(temperature.length);
  occupancy.forEach((value, index) => assignScalar(occupancyData, index, value, "f32"));
  temperature.forEach((value, index) => assignScalar(temperatureData, index, value, "f32"));
  return { format: "pdb", kind: "points", units: "angstrom", positions: new Float64Array(positions), attributes: { occupancy: { components: 1, data: occupancyData }, temperatureFactor: { components: 1, data: temperatureData }, model: { components: 1, data: new Int32Array(models) } }, metadata: { atoms }, bonds: new Uint32Array(bonds), diagnostics };
}

const vtkTypes: Record<string, ScalarName> = { char: "i8", signed_char: "i8", unsigned_char: "u8", short: "i16", unsigned_short: "u16", int: "i32", unsigned_int: "u32", float: "f32", double: "f64" };
/** Legacy VTK 2–4 POLYDATA/UNSTRUCTURED_GRID, ASCII or big-endian binary. */
export function parseVTK(input: string | Uint8Array | ArrayBuffer, options: ScientificImportOptions = {}): ScientificMesh {
  const bytes = checkedInput(input, options), lim = limits(options);
  let cursor = 0;
  const readLine = (): string => { const item = lineEnd(bytes, cursor); cursor = item.next; return item.line.trim(); };
  const magic = readLine(), title = readLine(), encoding = readLine().toUpperCase(), dataset = readLine().split(/\s+/);
  if (!/^# vtk DataFile Version [1-4](?:\.\d+)?$/i.test(magic)) fail("SCIENTIFIC_UNSUPPORTED", "Unsupported VTK legacy version or magic");
  if (encoding !== "ASCII" && encoding !== "BINARY") fail("SCIENTIFIC_UNSUPPORTED", `Unsupported VTK encoding ${encoding}`);
  const datasetType = dataset[1]?.toUpperCase();
  if (dataset[0]?.toUpperCase() !== "DATASET" || (datasetType !== "POLYDATA" && datasetType !== "UNSTRUCTURED_GRID")) fail("SCIENTIFIC_UNSUPPORTED", `Unsupported VTK dataset ${datasetType ?? ""}`);
  let allocation = 0;
  const allocate = (count: number, type: ScalarName): void => {
    if (!Number.isSafeInteger(count) || count < 0 || count > lim.elements * 16) fail("SCIENTIFIC_ALLOCATION_LIMIT", "VTK scalar count exceeds limit");
    const bytesNeeded = sizeProduct([count, scalarBytes[type]], lim.output, "VTK array bytes");
    allocation += bytesNeeded;
    if (allocation > lim.output) fail("SCIENTIFIC_ALLOCATION_LIMIT", "VTK decoded bytes exceed limit");
  };
  const readArray = (count: number, type: ScalarName): ScientificArray => {
    allocate(count, type);
    const result = typed(type, count);
    if (encoding === "BINARY") {
      const bytesNeeded = count * scalarBytes[type];
      if (cursor + bytesNeeded > bytes.length) fail("SCIENTIFIC_TRUNCATED", "VTK binary data truncated");
      const view = byteView(bytes);
      for (let i = 0; i < count; i++) result[i] = scalar(view, cursor + i * scalarBytes[type], type, false);
      cursor += bytesNeeded;
      if (bytes[cursor] === 13) cursor++;
      if (bytes[cursor] === 10) cursor++;
      return result;
    }
    for (let i = 0; i < count; i++) {
      while (cursor < bytes.length && bytes[cursor]! <= 32) cursor++;
      const begin = cursor;
      while (cursor < bytes.length && bytes[cursor]! > 32) cursor++;
      if (begin === cursor) fail("SCIENTIFIC_TRUNCATED", "VTK ASCII data truncated");
      assignScalar(result, i, num(utf8(bytes.subarray(begin, cursor)), "VTK scalar", type.startsWith("f")), type);
    }
    return result;
  };
  let positions: Float32Array | Float64Array | undefined, cellTypes: Uint8Array | undefined;
  const cells: ScientificCellSet[] = [], pointAttributes: Record<string, ScientificAttribute> = Object.create(null), cellAttributes: Record<string, ScientificAttribute> = Object.create(null);
  const sections = new Set<string>(), attributeSections = new Set<string>();
  let pointCount = 0, cellCount = 0, tuples: number | undefined, target: Record<string, ScientificAttribute> | undefined;
  const getType = (name: string | undefined): ScalarName => {
    const type = vtkTypes[(name ?? "").toLowerCase()];
    if (!type) fail("SCIENTIFIC_UNSUPPORTED", `Unsupported VTK scalar type ${name ?? ""}`);
    return type;
  };
  const addAttribute = (name: string, components: number, count: number, type: ScalarName): void => {
    if (!target) fail("SCIENTIFIC_MALFORMED", "VTK attribute appears before POINT_DATA or CELL_DATA");
    if (!name || target[name]) fail("SCIENTIFIC_MALFORMED", `Duplicate or missing VTK attribute ${name}`);
    if (components < 1 || components > 1024) fail("SCIENTIFIC_ALLOCATION_LIMIT", "VTK component count exceeds limit");
    target[name] = { components, data: readArray(sizeProduct([count, components], lim.elements * 16, "VTK attributes"), type) };
  };
  while (cursor < bytes.length) {
    const line = readLine(); if (!line) continue;
    const words = line.split(/\s+/), directive = words[0]!.toUpperCase();
    if (directive === "POINTS") {
      if (positions || cells.length || attributeSections.size) fail("SCIENTIFIC_MALFORMED", "Duplicate or out-of-order VTK POINTS");
      pointCount = int(words[1], "VTK point count");
      if (pointCount < 0 || pointCount > lim.elements) fail("SCIENTIFIC_ALLOCATION_LIMIT", "VTK point count exceeds limit");
      const values = readArray(pointCount * 3, getType(words[2]));
      if (values instanceof Float32Array || values instanceof Float64Array) positions = values;
      else { allocate(values.length, "f64"); positions = Float64Array.from(values); }
    } else if (["VERTICES", "LINES", "POLYGONS", "TRIANGLE_STRIPS", "CELLS"].includes(directive)) {
      if (!positions || attributeSections.size || cellTypes || sections.has(directive)) fail("SCIENTIFIC_MALFORMED", "Duplicate or out-of-order VTK cell section");
      if ((datasetType === "UNSTRUCTURED_GRID") !== (directive === "CELLS")) fail("SCIENTIFIC_MALFORMED", `VTK ${directive} is incompatible with ${datasetType}`);
      sections.add(directive);
      const n = int(words[1], "VTK cell count"), total = int(words[2], "VTK connectivity length");
      if (n < 0 || n > lim.elements - cellCount || n >= 0xffffffff || total < n || total - n > 0xffffffff) fail("SCIENTIFIC_ALLOCATION_LIMIT", "VTK cell count exceeds limit");
      const data = readArray(total, "i32");
      allocate(n + 1, "u32"); allocate(total - n, "u32");
      const offsets = new Uint32Array(n + 1), indices = new Uint32Array(total - n);
      let offset = 0, indexOffset = 0;
      for (let i = 0; i < n; i++) {
        if (offset >= data.length) fail("SCIENTIFIC_TRUNCATED", "VTK cell list truncated");
        const length = data[offset++]!;
        if (length < 0 || offset + length > data.length) fail("SCIENTIFIC_MALFORMED", "Invalid VTK cell length");
        for (let k = 0; k < length; k++) { const index = data[offset++]!; if (index < 0 || index >= pointCount) fail("SCIENTIFIC_MALFORMED", "VTK cell index outside points"); indices[indexOffset++] = index; }
        offsets[i + 1] = indexOffset;
      }
      if (offset !== data.length) fail("SCIENTIFIC_MALFORMED", "VTK cell list has trailing indices");
      cellCount += n;
      const kind = ({ VERTICES: "vertices", LINES: "lines", POLYGONS: "polygons", TRIANGLE_STRIPS: "triangle-strips", CELLS: "cells" } as const)[directive as "VERTICES"];
      cells.push({ kind, offsets, indices });
    } else if (directive === "CELL_TYPES") {
      if (datasetType !== "UNSTRUCTURED_GRID" || !sections.has("CELLS") || cellTypes || attributeSections.size) fail("SCIENTIFIC_MALFORMED", "Duplicate or out-of-order VTK CELL_TYPES");
      const n = int(words[1], "VTK cell type count");
      if (n !== cellCount) fail("SCIENTIFIC_MALFORMED", "VTK CELL_TYPES count differs from cells");
      const types = readArray(n, "i32");
      for (const type of types) if (type < 0 || type > 255) fail("SCIENTIFIC_MALFORMED", "Invalid VTK cell type");
      allocate(n, "u8"); cellTypes = Uint8Array.from(types);
    } else if (directive === "POINT_DATA" || directive === "CELL_DATA") {
      if (!positions || attributeSections.has(directive) || (datasetType === "UNSTRUCTURED_GRID" && sections.has("CELLS") && !cellTypes)) fail("SCIENTIFIC_MALFORMED", `Duplicate or out-of-order VTK ${directive}`);
      attributeSections.add(directive);
      const count = int(words[1], "VTK attribute tuple count"), expected = directive === "POINT_DATA" ? pointCount : cellCount;
      if (count !== expected) fail("SCIENTIFIC_MALFORMED", `${directive} count differs from geometry`);
      tuples = count; target = directive === "POINT_DATA" ? pointAttributes : cellAttributes;
    } else if (directive === "SCALARS") {
      if (tuples === undefined) fail("SCIENTIFIC_MALFORMED", "SCALARS requires POINT_DATA or CELL_DATA");
      const components = words[3] === undefined ? 1 : int(words[3], "VTK components");
      const lookup = readLine().split(/\s+/);
      if (lookup[0]?.toUpperCase() !== "LOOKUP_TABLE" || !lookup[1]) fail("SCIENTIFIC_MALFORMED", "VTK SCALARS must specify LOOKUP_TABLE");
      addAttribute(words[1] ?? "", components, tuples, getType(words[2]));
    } else if (directive === "VECTORS" || directive === "NORMALS" || directive === "TENSORS" || directive === "TEXTURE_COORDINATES") {
      if (tuples === undefined) fail("SCIENTIFIC_MALFORMED", `${directive} requires POINT_DATA or CELL_DATA`);
      const components = directive === "TENSORS" ? 9 : directive === "TEXTURE_COORDINATES" ? int(words[2], "VTK texture dimensions") : 3;
      addAttribute(words[1] ?? "", components, tuples, getType(words[directive === "TEXTURE_COORDINATES" ? 3 : 2]));
    } else if (directive === "COLOR_SCALARS") {
      if (tuples === undefined) fail("SCIENTIFIC_MALFORMED", "COLOR_SCALARS requires POINT_DATA or CELL_DATA");
      addAttribute(words[1] ?? "", int(words[2], "VTK color components"), tuples, encoding === "BINARY" ? "u8" : "f32");
    } else if (directive === "FIELD") {
      const n = int(words[2], "VTK FIELD count");
      if (n < 0 || n > 1024 || tuples === undefined) fail("SCIENTIFIC_UNSUPPORTED", "Unsupported VTK FIELD collection");
      for (let i = 0; i < n; i++) {
        const spec = readLine().split(/\s+/), components = int(spec[1], "VTK FIELD components"), count = int(spec[2], "VTK FIELD tuples");
        if (count !== tuples) fail("SCIENTIFIC_UNSUPPORTED", "VTK FIELD tuple count differs from geometry");
        addAttribute(spec[0] ?? "", components, count, getType(spec[3]));
      }
    } else fail("SCIENTIFIC_UNSUPPORTED", `Unsupported VTK directive ${directive}`);
  }
  if (!positions) fail("SCIENTIFIC_MALFORMED", "VTK requires POINTS");
  if (datasetType === "UNSTRUCTURED_GRID" && !cellTypes && cellCount) fail("SCIENTIFIC_MALFORMED", "VTK unstructured cells require CELL_TYPES");
  return { format: "vtk", kind: "mesh", units: "unspecified", positions, cells, ...(cellTypes ? { cellTypes } : {}), pointAttributes, cellAttributes, metadata: { title, encoding, dataset: datasetType, version: magic }, diagnostics: [] };
}

const nrrdTypes: Record<string, ScalarName> = {
  char: "i8", "signed char": "i8", int8: "i8", int8_t: "i8", uchar: "u8", "unsigned char": "u8", uint8: "u8", uint8_t: "u8",
  short: "i16", "short int": "i16", "signed short": "i16", "signed short int": "i16", int16: "i16", int16_t: "i16",
  ushort: "u16", "unsigned short": "u16", "unsigned short int": "u16", uint16: "u16", uint16_t: "u16",
  int: "i32", "signed int": "i32", int32: "i32", int32_t: "i32", uint: "u32", "unsigned int": "u32", uint32: "u32", uint32_t: "u32",
  float: "f32", double: "f64"
};
function parseVector(value: string, label: string): number[] {
  const match = /^\(([^)]*)\)$/.exec(value.trim());
  if (!match) fail("SCIENTIFIC_MALFORMED", `Invalid NRRD ${label}`);
  const out = match[1]!.split(",").map((part) => num(part, `NRRD ${label}`));
  if (!out.length || out.length > 8) fail("SCIENTIFIC_MALFORMED", `Invalid NRRD ${label} dimensions`);
  return out;
}
function nrrdFloat(value: string): number {
  if (/nan/i.test(value)) return NaN;
  if (/-inf/i.test(value)) return -Infinity;
  if (/inf/i.test(value)) return Infinity;
  return num(value, "NRRD sample");
}
function skipNRRDLines(bytes: Uint8Array, count: number): Uint8Array {
  let cursor = 0;
  for (let line = 0; line < count; line++) {
    while (cursor < bytes.length && bytes[cursor] !== 10) cursor++;
    if (cursor === bytes.length) fail("SCIENTIFIC_TRUNCATED", "NRRD line skip exceeds data");
    cursor++;
  }
  return bytes.subarray(cursor);
}
/** NRRD0001–0005, embedded or explicitly supplied detached raw/ASCII/gzip data, up to eight axes. */
export async function parseNRRD(input: string | Uint8Array | ArrayBuffer, options: ScientificImportOptions = {}): Promise<ScientificVolume> {
  const bytes = checkedInput(input, options), lim = limits(options);
  const parsedHeader = readNRRDHeader(bytes), header = parsedHeader.fields;
  const detached = header["data file"];
  if (detached && options.detachedData === undefined) fail("SCIENTIFIC_UNSUPPORTED", "Detached NRRD data requires verified dependency bytes");
  const type = nrrdTypes[(header.type ?? "").toLowerCase()];
  if (!type) fail("SCIENTIFIC_UNSUPPORTED", `Unsupported NRRD scalar type ${header.type ?? ""}`);
  const dimension = int(header.dimension, "NRRD dimension"), sizes = (header.sizes ?? "").split(/\s+/).filter(Boolean).map((v) => int(v, "NRRD size"));
  if (dimension < 1 || dimension > 8 || sizes.length !== dimension || sizes.some((v) => v < 1)) fail("SCIENTIFIC_MALFORMED", "NRRD dimensions and sizes disagree");
  const count = sizeProduct(sizes, lim.elements, "NRRD sample count"), expected = sizeProduct([count, scalarBytes[type]], lim.output, "NRRD decoded bytes");
  const encoding = (header.encoding ?? "").toLowerCase();
  const endian = (header.endian ?? "").toLowerCase();
  if (scalarBytes[type] > 1 && encoding !== "ascii" && encoding !== "text" && encoding !== "txt" && endian !== "little" && endian !== "big") fail("SCIENTIFIC_MALFORMED", "NRRD binary data requires endian");
  const lineSkip = header["line skip"] === undefined ? 0 : int(header["line skip"], "NRRD line skip");
  const byteSkip = header["byte skip"] === undefined ? 0 : int(header["byte skip"], "NRRD byte skip");
  if (lineSkip < 0 || byteSkip < -1) fail("SCIENTIFIC_MALFORMED", "Invalid NRRD skip");
  if (byteSkip === -1 && encoding !== "raw") fail("SCIENTIFIC_UNSUPPORTED", "NRRD byte skip -1 requires raw encoding");
  let payload = detached ? checkedInput(options.detachedData!, options) : bytes.subarray(parsedHeader.cursor);
  if (detached && bytes.byteLength + payload.byteLength > lim.bytes) fail("SCIENTIFIC_INPUT_LIMIT", "NRRD header and detached data exceed maxBytes");
  if (byteSkip !== -1) payload = skipNRRDLines(payload, lineSkip);
  if (encoding === "gzip" || encoding === "gz") {
    if (byteSkip > lim.output - expected) fail("SCIENTIFIC_ALLOCATION_LIMIT", "NRRD gzip byte skip exceeds output limit");
    const expanded = expected + byteSkip;
    sizeProduct([expanded, 3], lim.output, "NRRD gzip working bytes");
    payload = (await gunzipBounded(payload, expanded)).subarray(byteSkip);
  } else if (byteSkip === -1) {
    if (payload.length < expected) fail("SCIENTIFIC_TRUNCATED", "NRRD data is shorter than dimensions");
    payload = payload.subarray(payload.length - expected);
  } else {
    if (byteSkip > payload.length) fail("SCIENTIFIC_TRUNCATED", "NRRD byte skip exceeds data");
    payload = payload.subarray(byteSkip);
  }
  // A detached raw file may contain unrelated bytes after its raster.
  if (detached && encoding === "raw" && payload.length >= expected) payload = payload.subarray(0, expected);
  const samples = typed(type, count);
  if (encoding === "ascii" || encoding === "text" || encoding === "txt") {
    const values = utf8(payload).trim().split(/\s+/).filter(Boolean);
    if (values.length !== count) fail("SCIENTIFIC_MALFORMED", "NRRD ASCII sample count differs from dimensions");
    values.forEach((v, i) => assignScalar(samples, i, type.startsWith("f") ? nrrdFloat(v) : num(v, "NRRD sample"), type));
  } else if (encoding === "raw" || encoding === "gzip" || encoding === "gz") {
    if (payload.length !== expected) fail("SCIENTIFIC_TRUNCATED", "NRRD data length differs from dimensions");
    const view = byteView(payload);
    for (let i = 0; i < count; i++) samples[i] = scalar(view, i * scalarBytes[type], type, endian === "little");
  } else fail("SCIENTIFIC_UNSUPPORTED", `Unsupported NRRD encoding ${encoding}`);
  const unitsText = header["space units"] ?? "";
  const unitTokens = unitsText.match(/"(?:\\.|[^"\\])*"/g) ?? [];
  if (unitsText.replace(/"(?:\\.|[^"\\])*"/g, "").trim()) fail("SCIENTIFIC_MALFORMED", "Invalid NRRD space units");
  const units = unitTokens.map((item) => item.slice(1, -1).replace(/\\(["\\])/g, "$1"));
  const origin = header["space origin"] ? parseVector(header["space origin"], "origin") : undefined;
  const directionText = header["space directions"]?.match(/none|\([^)]*\)/gi);
  if (header["space directions"]?.replace(/none|\([^)]*\)/gi, "").trim()) fail("SCIENTIFIC_MALFORMED", "Invalid NRRD space directions");
  const directions = directionText?.map((value) => value.toLowerCase() === "none" ? null : parseVector(value, "direction"));
  if (directions && directions.length !== dimension) fail("SCIENTIFIC_MALFORMED", "NRRD direction count differs from dimensions");
  const spaces3 = ["right-anterior-superior", "left-anterior-superior", "left-posterior-superior", "ras", "las", "lps", "scanner-xyz", "3d-right-handed", "3d-left-handed"];
  const spaces4 = ["right-anterior-superior-time", "left-anterior-superior-time", "left-posterior-superior-time", "rast", "last", "lpst", "scanner-xyz-time", "3d-right-handed-time", "3d-left-handed-time"];
  const spaceName = header.space?.toLowerCase();
  if (spaceName && header["space dimension"] !== undefined) fail("SCIENTIFIC_MALFORMED", "NRRD space and space dimension are mutually exclusive");
  const spaceDimension = spaceName ? (spaces3.includes(spaceName) ? 3 : spaces4.includes(spaceName) ? 4 : fail("SCIENTIFIC_UNSUPPORTED", `Unsupported NRRD space ${header.space}`)) : header["space dimension"] === undefined ? undefined : int(header["space dimension"], "NRRD space dimension");
  if (spaceDimension !== undefined && (spaceDimension < 1 || spaceDimension > 8)) fail("SCIENTIFIC_MALFORMED", "Invalid NRRD space dimension");
  const vectorDimension = spaceDimension ?? origin?.length ?? directions?.find((value) => value !== null)?.length;
  if ((origin && origin.length !== vectorDimension) || directions?.some((value) => value !== null && value.length !== vectorDimension) || (units.length && units.length !== vectorDimension)) fail("SCIENTIFIC_MALFORMED", "NRRD space vector dimensions disagree");
  return { format: "nrrd", kind: "volume", sizes, samples, units, ...(header.space ? { space: header.space } : {}), ...(origin ? { origin } : {}), ...(directions ? { directions } : {}), metadata: parsedHeader.metadata, diagnostics: [] };
}
async function gunzipBounded(bytes: Uint8Array, expected: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") fail("SCIENTIFIC_UNSUPPORTED", "NRRD gzip requires DecompressionStream");
  const input = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  const reader = input.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      total += value.length;
      if (total > expected) { await reader.cancel(); fail("SCIENTIFIC_ALLOCATION_LIMIT", "NRRD gzip expands beyond declared dimensions"); }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ScientificImportError) throw error;
    fail("SCIENTIFIC_MALFORMED", "Invalid NRRD gzip stream");
  } finally { reader.releaseLock(); }
  if (total !== expected) fail("SCIENTIFIC_TRUNCATED", "NRRD gzip output is shorter than declared dimensions");
  const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

/** RS-274-style G0/G1/G2/G3 toolpaths, modal coordinates and extrusion, converted to millimetres. */
export function parseGCode(input: string | Uint8Array | ArrayBuffer, options: ScientificImportOptions = {}): ScientificToolpath {
  const lim = limits(options), source = utf8(checkedInput(input, options));
  const tolerance = options.arcTolerance ?? 0.1;
  if (!Number.isFinite(tolerance) || tolerance <= 0) fail("SCIENTIFIC_INVALID_LIMIT", "arcTolerance must be positive");
  const positions: number[] = [], rapid: number[] = [], feedRate: number[] = [], extrusion: number[] = [], diagnostics: ScientificDiagnostic[] = [];
  // XYZ remains in the original physical frame; G92 changes the programmed origin.
  let xyz = [0, 0, 0], origin = [0, 0, 0], e = 0, scale = 1, absolute = true, eAbsolute = true, feed = 0, motion = 0, plane = 17;
  const add = (from: readonly number[], to: readonly number[], fast: boolean, extrude: number): void => {
    if (rapid.length >= lim.segments || (rapid.length + 1) * 57 > lim.output) fail("SCIENTIFIC_ALLOCATION_LIMIT", "GCode segment limit exceeded");
    if (![...from, ...to, feed, extrude].every(Number.isFinite) || !Number.isFinite(Math.fround(feed)) || !Number.isFinite(Math.fround(extrude))) fail("SCIENTIFIC_MALFORMED", "GCode move exceeds numeric range");
    positions.push(...from, ...to); rapid.push(fast ? 1 : 0); feedRate.push(feed); extrusion.push(extrude);
  };
  for (const [lineIndex, sourceLine] of source.split(/\r?\n/).entries()) {
    if (sourceLine.length > 65536) fail("SCIENTIFIC_INPUT_LIMIT", "GCode line is too long");
    const line = sourceLine.replace(/\([^)]*\)/g, "").replace(/;.*/, "").replace(/\*\d+\s*$/, "").trim();
    if (!line || line === "%") continue;
    const tokens = Array.from(line.matchAll(/([A-Za-z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/g));
    const residue = line.replace(/([A-Za-z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/g, "").replace(/\s/g, "");
    if (residue || !tokens.length) fail("SCIENTIFIC_MALFORMED", `Invalid GCode line ${lineIndex + 1}`);
    const values: Record<string, number> = Object.create(null), commands: Array<[string, number]> = [];
    for (const token of tokens) {
      const key = token[1]!.toUpperCase(), value = num(token[2], `GCode ${key}`);
      if (key === "G" || key === "M") commands.push([key, value]);
      else if (key !== "N") { if (values[key] !== undefined) fail("SCIENTIFIC_MALFORMED", `Duplicate GCode ${key} on line ${lineIndex + 1}`); values[key] = value; }
    }
    let reset = false, hasMotion = false, suppressModal = false;
    for (const [command, code] of commands) {
      if (command === "M") {
        if (code === 82) eAbsolute = true; else if (code === 83) eAbsolute = false;
        else { if (diagnostics.length < 1024) diagnostics.push({ code: "SCIENTIFIC_GCODE_UNSUPPORTED_COMMAND", message: `M${code} on line ${lineIndex + 1} was not simulated` }); suppressModal = true; }
        continue;
      }
      if ([0, 1, 2, 3].includes(code)) { motion = code; hasMotion = true; }
      else if (code === 20) scale = 25.4;
      else if (code === 21) scale = 1;
      else if (code === 90) absolute = true;
      else if (code === 91) absolute = false;
      else if (code === 92) { reset = true; suppressModal = true; }
      else if ([17, 18, 19].includes(code)) plane = code;
      else if (code === 4) { if (diagnostics.length < 1024) diagnostics.push({ code: "SCIENTIFIC_GCODE_DWELL_IGNORED", message: `G4 dwell on line ${lineIndex + 1} was not simulated` }); suppressModal = true; }
      else fail("SCIENTIFIC_UNSUPPORTED", `Unsupported GCode G${code} on line ${lineIndex + 1}`);
    }
    for (const axis of ["A", "B", "C", "U", "V", "W"]) {
      if (values[axis] !== undefined) fail("SCIENTIFIC_UNSUPPORTED", `GCode rotary or auxiliary axis ${axis} on line ${lineIndex + 1} is unsupported`);
    }
    if (values.T !== undefined && diagnostics.length < 1024) diagnostics.push({ code: "SCIENTIFIC_GCODE_TOOL_IGNORED", message: `Tool selection T${values.T} on line ${lineIndex + 1} was not simulated` });
    if ((motion === 2 || motion === 3) && values.P !== undefined && values.P !== 1 && (hasMotion || !suppressModal)) fail("SCIENTIFIC_UNSUPPORTED", "Multi-turn GCode arcs are unsupported");
    if (values.F !== undefined) { feed = values.F * scale; if (!Number.isFinite(feed) || !Number.isFinite(Math.fround(feed)) || feed < 0) fail("SCIENTIFIC_MALFORMED", "GCode feed must be finite, non-negative and within f32 range"); }
    if (reset) {
      if (hasMotion) fail("SCIENTIFIC_MALFORMED", "GCode G92 cannot share a block with motion");
      origin = origin.map((v, i) => values[["X", "Y", "Z"][i]!] === undefined ? v : xyz[i]! - values[["X", "Y", "Z"][i]!]! * scale);
      if (values.E !== undefined) e = values.E * scale;
      if (![...origin, e].every(Number.isFinite)) fail("SCIENTIFIC_MALFORMED", "GCode reset exceeds numeric range");
      continue;
    }
    if (!hasMotion && suppressModal) continue;
    const next = xyz.map((v, i) => { const value = values[["X", "Y", "Z"][i]!]; return value === undefined ? v : absolute ? value * scale + origin[i]! : v + value * scale; });
    const nextE = values.E === undefined ? e : eAbsolute ? values.E * scale : e + values.E * scale;
    if (![...next, nextE].every(Number.isFinite)) fail("SCIENTIFIC_MALFORMED", "GCode move exceeds numeric range");
    if (values.X === undefined && values.Y === undefined && values.Z === undefined && values.E === undefined && values.I === undefined && values.J === undefined && values.K === undefined && values.R === undefined) continue;
    if (motion === 0 || motion === 1) add(xyz, next, motion === 0, nextE - e);
    else {
      const axes = plane === 17 ? [0, 1, 2, "I", "J"] as const : plane === 18 ? [2, 0, 1, "K", "I"] as const : [1, 2, 0, "J", "K"] as const;
      const [u, v, w, centerU, centerV] = axes, du = next[u]! - xyz[u]!, dv = next[v]! - xyz[v]!;
      let cu: number, cv: number;
      if (values.R !== undefined) {
        if (values.I !== undefined || values.J !== undefined || values.K !== undefined) fail("SCIENTIFIC_MALFORMED", "GCode arc cannot combine radius and center offsets");
        const radius = Math.abs(values.R * scale), chord = Math.hypot(du, dv);
        if (!Number.isFinite(radius) || !Number.isFinite(chord) || radius <= 0 || chord <= 1e-12 || chord / 2 > radius + 5e-8) fail("SCIENTIFIC_MALFORMED", "Invalid GCode arc radius");
        const halfChord = chord / 2;
        const h = radius * Math.sqrt(Math.max(0, 1 - (halfChord / radius) ** 2));
        const side = (motion === 2 ? -1 : 1) * (values.R < 0 ? -1 : 1);
        cu = (xyz[u]! + next[u]!) / 2 - side * dv / chord * h;
        cv = (xyz[v]! + next[v]!) / 2 + side * du / chord * h;
      } else {
        const invalidCenter = ["I", "J", "K"].find((axis) => axis !== centerU && axis !== centerV && values[axis] !== undefined);
        if (invalidCenter) fail("SCIENTIFIC_MALFORMED", `GCode ${invalidCenter} center offset is outside the active plane`);
        if (values[centerU] === undefined && values[centerV] === undefined) fail("SCIENTIFIC_MALFORMED", "GCode arc requires center offsets or radius");
        cu = xyz[u]! + (values[centerU] ?? 0) * scale; cv = xyz[v]! + (values[centerV] ?? 0) * scale;
      }
      const r1 = Math.hypot(xyz[u]! - cu, xyz[v]! - cv), r2 = Math.hypot(next[u]! - cu, next[v]! - cv);
      if (![cu, cv, r1, r2].every(Number.isFinite) || r1 <= 1e-12 || Math.abs(r1 - r2) > Math.max(0.01, r1 * 0.001)) fail("SCIENTIFIC_MALFORMED", "GCode arc endpoints disagree on radius");
      const a0 = Math.atan2(xyz[v]! - cv, xyz[u]! - cu), a1 = Math.atan2(next[v]! - cv, next[u]! - cu);
      let sweep = a1 - a0;
      if (motion === 2) { while (sweep >= 0) sweep -= 2 * Math.PI; } else { while (sweep <= 0) sweep += 2 * Math.PI; }
      const maxAngle = 4 * Math.asin(Math.sqrt(Math.min(1, tolerance / r1 / 2)));
      const segmentCount = Math.max(1, Math.ceil(Math.abs(sweep) / maxAngle));
      if (!Number.isSafeInteger(segmentCount) || segmentCount > lim.segments - rapid.length || (rapid.length + segmentCount) * 57 > lim.output) fail("SCIENTIFIC_ALLOCATION_LIMIT", "GCode arc exceeds segment limit");
      let previous = xyz;
      for (let i = 1; i <= segmentCount; i++) {
        const t = i / segmentCount, point = [...xyz];
        point[u] = cu + r1 * Math.cos(a0 + sweep * t); point[v] = cv + r1 * Math.sin(a0 + sweep * t); point[w] = xyz[w]! + (next[w]! - xyz[w]!) * t;
        if (i === segmentCount) { point[u] = next[u]!; point[v] = next[v]!; }
        add(previous, point, false, (nextE - e) / segmentCount); previous = point;
      }
    }
    xyz = next; e = nextE;
  }
  return { format: "gcode", kind: "toolpath", units: "mm", positions: new Float64Array(positions), rapid: new Uint8Array(rapid), feedRate: new Float32Array(feedRate), extrusion: new Float32Array(extrusion), diagnostics };
}

export async function parseScientificAsset(format: ScientificFormat, input: string | Uint8Array | ArrayBuffer, options: ScientificImportOptions = {}): Promise<ScientificAsset> {
  switch (format) {
    case "pcd": return parsePCD(input, options); case "pdb": return parsePDB(input, options);
    case "vtk": return parseVTK(input, options); case "xyz": return parseXYZ(input, options);
    case "nrrd": return parseNRRD(input, options); case "gcode": return parseGCode(input, options);
    default: return fail("SCIENTIFIC_UNSUPPORTED", `Unsupported scientific format ${String(format)}`);
  }
}

/** Opt-in loader. Register it explicitly in an AssetManager or FormatRegistry. */
export class ScientificFormatLoader implements AssetLoader<ScientificAsset> {
  readonly type: ScientificFormat;
  constructor(format: ScientificFormat, readonly options: ScientificImportOptions = {}) { this.type = format; }
  canLoad(request: AssetLoadRequest): boolean {
    const suffix = this.type === "nrrd" ? "(?:nrrd|nhdr)" : this.type === "gcode" ? "(?:gcode|gco|nc)" : this.type;
    if (request.format !== undefined) return new RegExp(`^${suffix}$`, "i").test(request.format.replace(/^\./, ""));
    return request.type === this.type || new RegExp(`\\.${suffix}(?:[?#]|$)`, "i").test(request.url);
  }
  async load(request: AssetLoadRequest, context: LoadContext): Promise<ScientificAsset> {
    const requestUrl = request.url;
    context.throwIfAborted(requestUrl);
    const url = context.resolve(requestUrl);
    const requestOptions = mergeAssetRequestOptions(context.requestOptionsFor(url), request);
    validateAssetMaxBytes(requestOptions.maxBytes);
    const sourceOptions = { ...this.options };
    const sourceLimit = limits(sourceOptions).bytes;
    const inputBudget = Math.min(requestOptions.maxBytes ?? sourceLimit, sourceLimit);
    const signal = context.signalFor(request.signal);
    const onProgress = request.onProgress;
    if (signal?.aborted) throw new AssetLoadError("Asset load aborted", url, context.dependencyChain, signal.reason);
    // The header fetch can yield to caller code. Keep the dependency policy and
    // a bounded, exact copy of any supplied view independent of later mutation.
    const child = this.type === "nrrd" ? context.child(url, undefined, requestOptions) : undefined;
    const supplied = this.type === "nrrd" ? sourceOptions.detachedData : undefined;
    let suppliedSnapshot: ArrayBuffer | undefined;
    if (supplied !== undefined && supplied.byteLength <= inputBudget) {
      const view = supplied instanceof Uint8Array ? supplied : new Uint8Array(supplied);
      suppliedSnapshot = new ArrayBuffer(view.byteLength);
      new Uint8Array(suppliedSnapshot).set(view);
    }
    const buffer = await fetchBytes(url, signal, ({ loaded, total }) => {
      onProgress?.({ url: requestUrl, phase: "document", loadedBytes: loaded, ...(total === undefined ? {} : { totalBytes: total }) });
      if (loaded > sourceLimit) fail("SCIENTIFIC_INPUT_LIMIT", "Input exceeds maxBytes");
    }, { ...requestOptions, maxBytes: inputBudget });
    context.throwIfAborted(requestUrl);
    if (signal?.aborted) throw new AssetLoadError("Asset load aborted", url, context.dependencyChain, signal.reason);
    let options = { ...sourceOptions, maxBytes: inputBudget };
    if (this.type === "nrrd") {
      const reference = nrrdExternalReference(new Uint8Array(buffer));
      if (reference && child) {
        const dependencyUrl = child.resolve(reference);
        const dependencyOptions = nrrdDependencyOptions(child, url, dependencyUrl);
        const remaining = inputBudget - buffer.byteLength;
        if (remaining <= 0) fail("SCIENTIFIC_INPUT_LIMIT", "No input budget remains for NRRD dependency");
        const dependencyBudget = Math.min(dependencyOptions.maxBytes ?? remaining, remaining);
        if (supplied !== undefined) {
          validateAssetUrlPolicy(dependencyUrl, dependencyOptions);
          if (!suppliedSnapshot || suppliedSnapshot.byteLength > dependencyBudget) {
            throw new AssetSizeError(`Asset ${redactAssetUrl(dependencyUrl)} exceeds maxBytes (${dependencyBudget})`);
          }
          await verifyDetachedNRRD(suppliedSnapshot, dependencyOptions.integrity, dependencyUrl, signal, context);
          options = { ...options, detachedData: suppliedSnapshot };
        } else {
          const data = await fetchBytes(dependencyUrl, signal, ({ loaded, total }) => {
            onProgress?.({ url: dependencyUrl, phase: "buffer", loadedBytes: loaded, ...(total === undefined ? {} : { totalBytes: total }) });
          }, { ...dependencyOptions, maxBytes: dependencyBudget });
          options = { ...options, detachedData: data };
        }
      }
    }
    if (signal?.aborted) throw new AssetLoadError("Asset load aborted", url, context.dependencyChain, signal.reason);
    const result = await parseScientificAsset(this.type, buffer, options);
    if (signal?.aborted) throw new AssetLoadError("Asset load aborted", url, context.dependencyChain, signal.reason);
    context.throwIfAborted(requestUrl);
    return result;
  }
}

function nrrdDependencyOptions(child: LoadContext, documentUrl: string, dependencyUrl: string): AssetRequestOptions {
  if (dependencyUrl !== documentUrl && child.resolve(dependencyUrl) !== documentUrl) return child.requestOptionsFor(dependencyUrl);

  // A data file may resolve to its header URL. It is still a declared child
  // reference: do not let the document special case skip required metadata.
  const { integrity, expectedUrl: _documentExpectedUrl, ...options } = child.requestOptions;
  let sourceOrigin = options.sourceOrigin;
  try { const origin = new URL(documentUrl).origin; if (origin !== "null") sourceOrigin = origin; } catch { /* Relative URLs retain the configured origin. */ }
  const entry = integrity && Object.entries(integrity.dependencies ?? {}).find(([candidate]) =>
    candidate === dependencyUrl || child.resolve(candidate) === dependencyUrl
  );
  if (!entry && integrity?.requireDependencies) {
    throw new AssetIntegrityError(`Missing required dependency integrity metadata for ${redactAssetUrl(dependencyUrl)}`);
  }
  return {
    ...options,
    ...(sourceOrigin ? { sourceOrigin } : {}),
    ...(entry && integrity ? { expectedUrl: dependencyUrl, integrity: { ...integrity, digest: entry[1] } } : {})
  };
}

async function verifyDetachedNRRD(bytes: ArrayBuffer, integrity: AssetIntegrity | undefined, url: string, signal: AbortSignal | undefined, context: LoadContext): Promise<void> {
  if (signal?.aborted) throw new AssetLoadError("Asset load aborted", url, context.dependencyChain, signal.reason);
  const pending = verifyAssetBytes(bytes, integrity, url);
  if (!signal) return pending;
  await new Promise<void>((resolve, reject) => {
    let done = false;
    const abort = (): void => {
      if (done) return;
      done = true;
      signal.removeEventListener("abort", abort);
      reject(new AssetLoadError("Asset load aborted", url, context.dependencyChain, signal.reason));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    void pending.then(() => {
      if (done) return;
      done = true;
      signal.removeEventListener("abort", abort);
      resolve();
    }, (error: unknown) => {
      if (done) return;
      done = true;
      signal.removeEventListener("abort", abort);
      reject(error);
    });
  });
}

function nrrdExternalReference(bytes: Uint8Array): string | undefined {
  return readNRRDHeader(bytes).fields["data file"];
}

/** A renderable projection also retains the complete typed scientific source and its declared losses. */
export interface ScientificRenderableAsset extends GLTFAsset {
  readonly scientific: ScientificAsset;
  readonly scientificLosses: readonly ScientificDiagnostic[];
}

/**
 * Projects point clouds, VTK surfaces and G-code paths to the existing native
 * glTF scene/resource pipeline. Source metadata and numeric fields remain on
 * `scientific`; unmapped presentation fields are reported in `scientificLosses`.
 * Volume samples and volumetric VTK cells require a volume renderer and are
 * rejected rather than represented as an unrelated surface.
 */
export class ScientificRenderableLoader implements AssetLoader<ScientificRenderableAsset> {
  readonly type: ScientificFormat;
  private readonly source: ScientificFormatLoader;
  private readonly owned = new WeakMap<ScientificRenderableAsset, { loader: GLTFLoaderType; inner: GLTFAsset }>();
  constructor(format: ScientificFormat, readonly options: ScientificImportOptions = {}) {
    this.type = format;
    this.source = new ScientificFormatLoader(format, options);
  }
  canLoad(request: AssetLoadRequest): boolean { return this.source.canLoad(request); }
  async load(request: AssetLoadRequest, context: LoadContext): Promise<ScientificRenderableAsset> {
    const scientific = await this.source.load(request, context);
    const projected = createScientificGLTF(scientific, this.options);
    const [{ GLTFLoader }, { LoadContext: Context }] = await Promise.all([import("../GLTFLoader"), import("../LoadContext")]);
    const loader = new GLTFLoader();
    const signal = context.signalFor(request.signal);
    const inner = await loader.load({ url: projected.url, type: "gltf", signal }, new Context({ signal }));
    if (signal?.aborted) { loader.dispose(inner); throw signal.reason ?? new DOMException("Asset load aborted", "AbortError"); }
    const diagnostics = { ...inner.loaderDiagnostics, features: [...inner.loaderDiagnostics.features, `scientific-${this.type}`], unsupportedFeatures: [...inner.loaderDiagnostics.unsupportedFeatures, ...projected.losses.map((loss) => loss.message)] };
    const wrapped: ScientificRenderableAsset = {
      url: request.url,
      get disposed() { return inner.disposed; },
      loaderDiagnostics: diagnostics,
      images: inner.images, textures: inner.textures, materials: inner.materials, materialVariants: inner.materialVariants,
      scenes: inner.scenes, defaultScene: inner.defaultScene, meshes: inner.meshes, cameras: inner.cameras, lights: inner.lights,
      skins: inner.skins, animations: inner.animations,
      createScene: (options) => inner.createScene(options),
      toJSON: () => ({ ...inner.toJSON(), url: request.url, loaderDiagnostics: diagnostics }),
      scientific, scientificLosses: projected.losses
    };
    this.owned.set(wrapped, { loader, inner });
    return wrapped;
  }
  dispose(asset: ScientificRenderableAsset): void {
    const owned = this.owned.get(asset);
    if (owned) { this.owned.delete(asset); owned.loader.dispose(owned.inner); }
  }
}

function createScientificGLTF(asset: ScientificAsset, options: ScientificImportOptions): { url: string; losses: ScientificDiagnostic[] } {
  if (asset.kind === "volume") fail("SCIENTIFIC_UNSUPPORTED", "Volume rendering requires a volume resource adapter");
  const lim = limits(options), maxBinary = Math.min(Math.floor(lim.output / 4), 64 * 1024 * 1024);
  const positions = asset.positions;
  if (!positions.length || positions.length % 3) fail("SCIENTIFIC_MALFORMED", "Renderable scientific geometry needs XYZ positions");
  const vertexCount = positions.length / 3;
  if (vertexCount > lim.elements || positions.length * 4 > maxBinary) fail("SCIENTIFIC_ALLOCATION_LIMIT", "Scientific render geometry exceeds limit");
  const pointIndices: number[] = [], lineIndices: number[] = [], triangleIndices: number[] = [];
  const push = (out: number[], ...values: number[]): void => {
    if ((pointIndices.length + lineIndices.length + triangleIndices.length + values.length) * 4 + positions.length * 4 > maxBinary) fail("SCIENTIFIC_ALLOCATION_LIMIT", "Scientific render indices exceed limit");
    for (const value of values) out.push(value);
  };
  if (asset.kind === "points") {
    if (asset.bonds) for (let i = 0; i < asset.bonds.length; i += 2) push(lineIndices, asset.bonds[i]!, asset.bonds[i + 1]!);
  } else if (asset.kind === "mesh") {
    let globalCell = 0;
    for (const set of asset.cells) for (let c = 0; c + 1 < set.offsets.length; c++, globalCell++) {
      const start = set.offsets[c]!, end = set.offsets[c + 1]!, cell = Array.from(set.indices.subarray(start, end));
      const code = set.kind === "cells" ? asset.cellTypes?.[globalCell] : undefined;
      if ((code === 1 && cell.length !== 1) || (code === 3 && cell.length !== 2) || (code === 5 && cell.length !== 3) || ((code === 8 || code === 9) && cell.length !== 4)) fail("SCIENTIFIC_MALFORMED", `Invalid VTK cell type ${code} vertex count`);
      if (set.kind === "vertices" || code === 1 || code === 2) for (const index of cell) push(pointIndices, index);
      else if (set.kind === "lines" || code === 3 || code === 4) for (let i = 1; i < cell.length; i++) push(lineIndices, cell[i - 1]!, cell[i]!);
      else if (set.kind === "triangle-strips" || code === 6) {
        for (let i = 2; i < cell.length; i++) push(triangleIndices, i % 2 === 0 ? cell[i - 2]! : cell[i - 1]!, i % 2 === 0 ? cell[i - 1]! : cell[i - 2]!, cell[i]!);
      } else if (set.kind === "polygons" || code === 5 || code === 7 || code === 8 || code === 9) {
        if (code === 8 && cell.length === 4) [cell[2], cell[3]] = [cell[3]!, cell[2]!];
        for (const index of triangulatePolygon(cell, positions)) push(triangleIndices, index);
      } else fail("SCIENTIFIC_UNSUPPORTED", `VTK cell type ${code ?? "unknown"} requires a volume or higher-order geometry adapter`);
    }
    if (!asset.cells.length) for (let i = 0; i < vertexCount; i++) push(pointIndices, i);
  }
  // GCode stores one start/end pair per segment, so it can draw without indices.
  const primitives: Array<{ mode: number; indices?: number[] }> = [];
  if (asset.kind === "points") primitives.push({ mode: 0 });
  if (asset.kind === "toolpath") primitives.push({ mode: 1 });
  if (pointIndices.length) primitives.push({ mode: 0, indices: pointIndices });
  if (lineIndices.length) primitives.push({ mode: 1, indices: lineIndices });
  if (triangleIndices.length) primitives.push({ mode: 4, indices: triangleIndices });
  if (!primitives.length) fail("SCIENTIFIC_MALFORMED", "Scientific data does not contain a renderable primitive");
  const byteLength = positions.length * 4 + (pointIndices.length + lineIndices.length + triangleIndices.length) * 4;
  const bytes = new Uint8Array(byteLength), view = byteView(bytes);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const value = Math.fround(positions[i]!);
    if (!Number.isFinite(value)) fail("SCIENTIFIC_UNSUPPORTED", "Non-finite or out-of-range coordinates cannot be rendered as glTF");
    view.setFloat32(i * 4, value, true); const axis = i % 3; min[axis] = Math.min(min[axis]!, value); max[axis] = Math.max(max[axis]!, value);
  }
  const bufferViews: Array<Record<string, number>> = [{ buffer: 0, byteOffset: 0, byteLength: positions.length * 4 }];
  const accessors: Array<Record<string, unknown>> = [{ bufferView: 0, componentType: 5126, count: vertexCount, type: "VEC3", min, max }];
  let offset = positions.length * 4;
  const gltfPrimitives = primitives.map((primitive) => {
    if (!primitive.indices) return { attributes: { POSITION: 0 }, mode: primitive.mode, material: 0 };
    const start = offset;
    for (const index of primitive.indices) {
      if (!Number.isInteger(index) || index < 0 || index >= vertexCount) fail("SCIENTIFIC_MALFORMED", "Scientific render index outside positions");
      view.setUint32(offset, index, true); offset += 4;
    }
    const bufferView = bufferViews.length; bufferViews.push({ buffer: 0, byteOffset: start, byteLength: offset - start });
    const accessor = accessors.length; accessors.push({ bufferView, componentType: 5125, count: primitive.indices.length, type: "SCALAR" });
    return { attributes: { POSITION: 0 }, mode: primitive.mode, material: 0, indices: accessor };
  });
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const gltf = { asset: { version: "2.0", generator: "Aura3D scientific import" }, buffers: [{ uri: `data:application/octet-stream;base64,${btoa(binary)}`, byteLength }], bufferViews, accessors, materials: [{ name: "scientific-data", pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0, roughnessFactor: 1 }, doubleSided: true }], meshes: [{ primitives: gltfPrimitives }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 };
  const losses: ScientificDiagnostic[] = [{ code: "SCIENTIFIC_RENDER_ATTRIBUTE_LOSS", message: "Source attributes, units and metadata remain in scientific data but are not mapped to rendered material or geometry." }];
  return { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`, losses };
}

/** Project a simple polygon onto its dominant plane and clip ears without filling concavities. */
function triangulatePolygon(indices: readonly number[], positions: Float32Array | Float64Array): number[] {
  if (indices.length < 3 || indices.length > 256) fail("SCIENTIFIC_MALFORMED", "VTK polygon must have 3 to 256 vertices");
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < indices.length; i++) {
    const a = indices[i]! * 3, b = indices[(i + 1) % indices.length]! * 3;
    nx += (positions[a + 1]! - positions[b + 1]!) * (positions[a + 2]! + positions[b + 2]!);
    ny += (positions[a + 2]! - positions[b + 2]!) * (positions[a]! + positions[b]!);
    nz += (positions[a]! - positions[b]!) * (positions[a + 1]! + positions[b + 1]!);
  }
  const abs = [Math.abs(nx), Math.abs(ny), Math.abs(nz)], drop = abs[0]! >= abs[1]! && abs[0]! >= abs[2]! ? 0 : abs[1]! >= abs[2]! ? 1 : 2;
  const axes = drop === 0 ? [1, 2] : drop === 1 ? [0, 2] : [0, 1];
  const xy = (index: number): [number, number] => [positions[index * 3 + axes[0]!]!, positions[index * 3 + axes[1]!]!];
  const cross = (a: number, b: number, c: number): number => { const p = xy(a), q = xy(b), r = xy(c); return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); };
  const onSegment = (a: number, b: number, p: number): boolean => {
    const x = xy(a), y = xy(b), point = xy(p);
    return point[0] >= Math.min(x[0], y[0]) && point[0] <= Math.max(x[0], y[0]) && point[1] >= Math.min(x[1], y[1]) && point[1] <= Math.max(x[1], y[1]);
  };
  const intersects = (a: number, b: number, c: number, d: number): boolean => {
    const p = cross(a, b, c), q = cross(a, b, d), r = cross(c, d, a), t = cross(c, d, b);
    return (p === 0 && onSegment(a, b, c)) || (q === 0 && onSegment(a, b, d)) || (r === 0 && onSegment(c, d, a)) || (t === 0 && onSegment(c, d, b)) || (p * q < 0 && r * t < 0);
  };
  for (let i = 0; i < indices.length; i++) for (let j = i + 1; j < indices.length; j++) {
    if (j === i + 1 || (i === 0 && j === indices.length - 1)) continue;
    if (intersects(indices[i]!, indices[(i + 1) % indices.length]!, indices[j]!, indices[(j + 1) % indices.length]!)) fail("SCIENTIFIC_MALFORMED", "Self-intersecting VTK polygon");
  }
  let signed = 0;
  for (let i = 0; i < indices.length; i++) { const a = xy(indices[i]!), b = xy(indices[(i + 1) % indices.length]!); signed += a[0] * b[1] - b[0] * a[1]; }
  if (!Number.isFinite(signed) || Math.abs(signed) < 1e-16) fail("SCIENTIFIC_MALFORMED", "Degenerate VTK polygon");
  const orientation = Math.sign(signed), remaining = [...indices], out: number[] = [];
  while (remaining.length > 3) {
    let clipped = false;
    for (let i = 0; i < remaining.length; i++) {
      const a = remaining[(i + remaining.length - 1) % remaining.length]!, b = remaining[i]!, c = remaining[(i + 1) % remaining.length]!;
      if (cross(a, b, c) * orientation <= 1e-16) continue;
      if (remaining.some((p) => p !== a && p !== b && p !== c && cross(a, b, p) * orientation >= -1e-16 && cross(b, c, p) * orientation >= -1e-16 && cross(c, a, p) * orientation >= -1e-16)) continue;
      out.push(a, b, c); remaining.splice(i, 1); clipped = true; break;
    }
    if (!clipped) fail("SCIENTIFIC_MALFORMED", "Self-intersecting or degenerate VTK polygon");
  }
  out.push(...remaining);
  return out;
}
