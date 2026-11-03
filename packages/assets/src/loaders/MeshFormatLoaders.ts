import { mergeAssetRequestOptions, type AssetLoader, type AssetLoadRequest } from "../AssetLoader";
import { GLTFLoader, type GLTFAsset } from "../GLTFLoader";
import { LoadContext } from "../LoadContext";
import { fetchBytes } from "../LoaderFetch";

/** Limits apply before allocation, including scalar and list properties in PLY. */
export interface MeshImportLimits {
  readonly maxFileBytes?: number;
  readonly maxElements?: number;
  readonly maxListItems?: number;
  readonly maxOutputBytes?: number;
}

export type MeshNumericArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;
export interface PlyScalarProperty {
  readonly kind: "scalar";
  readonly type: string;
  readonly values: MeshNumericArray;
}
export interface PlyListProperty {
  readonly kind: "list";
  readonly countType: string;
  readonly type: string;
  /** Values for row i occupy offsets[i] through offsets[i + 1]. */
  readonly offsets: Uint32Array;
  readonly values: MeshNumericArray;
}
export interface PlyElementData {
  readonly count: number;
  readonly properties: Readonly<Record<string, PlyScalarProperty | PlyListProperty>>;
}

/** Native, indexed triangles or points. Coordinates and units are retained from the file. */
export interface NativeMeshData {
  readonly positions: Float32Array;
  readonly normals?: Float32Array;
  readonly texcoords?: Float32Array;
  /** Linear interpretation is left to the caller; values are normalized to 0..1. */
  readonly colors?: Float32Array;
  readonly indices: Uint32Array;
  readonly topology: "triangles" | "points";
  readonly groups?: readonly { readonly name: string; readonly start: number; readonly count: number }[];
  readonly diagnostics: readonly string[];
}
export interface PlyMeshData extends NativeMeshData {
  readonly format: "ascii" | "binary_little_endian" | "binary_big_endian";
  readonly version: "1.0";
  /** All declared scalar and list properties, including unknown elements. */
  readonly elements: Readonly<Record<string, PlyElementData>>;
}
export interface StlMeshData extends NativeMeshData {
  readonly format: "ascii" | "binary";
  readonly attributes: Uint16Array;
}

const DEFAULT_LIMITS = { maxFileBytes: 64 * 1024 * 1024, maxElements: 2_000_000, maxListItems: 12_000_000, maxOutputBytes: 256 * 1024 * 1024 };
const MAX_HEADER_BYTES = 64 * 1024;
const MAX_GROUP_NAME_LENGTH = 1024;
const STL_FACET_ACCOUNTED_BYTES = 3 * 3 * 8 + 2 + 3 * 4;
type ScalarName = "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32" | "float32" | "float64";
interface ScalarType { readonly name: ScalarName; readonly size: number; readonly min: number; readonly max: number; readonly integer: boolean }
const SCALARS: Record<string, ScalarType> = Object.create(null) as Record<string, ScalarType>;
function defineScalar(names: readonly string[], type: ScalarType): void { for (const name of names) SCALARS[name] = type; }
defineScalar(["char", "int8"], { name: "int8", size: 1, min: -128, max: 127, integer: true });
defineScalar(["uchar", "uint8"], { name: "uint8", size: 1, min: 0, max: 255, integer: true });
defineScalar(["short", "int16"], { name: "int16", size: 2, min: -32768, max: 32767, integer: true });
defineScalar(["ushort", "uint16"], { name: "uint16", size: 2, min: 0, max: 65535, integer: true });
defineScalar(["int", "int32"], { name: "int32", size: 4, min: -2147483648, max: 2147483647, integer: true });
defineScalar(["uint", "uint32"], { name: "uint32", size: 4, min: 0, max: 4294967295, integer: true });
defineScalar(["float", "float32"], { name: "float32", size: 4, min: -3.4028234663852886e38, max: 3.4028234663852886e38, integer: false });
defineScalar(["double", "float64"], { name: "float64", size: 8, min: -Number.MAX_VALUE, max: Number.MAX_VALUE, integer: false });
interface PropertySpec { readonly name: string; readonly valueType: ScalarType; readonly countType?: ScalarType }
interface ElementSpec { readonly name: string; readonly count: number; readonly properties: PropertySpec[] }

function limitsWithDefaults(limits: MeshImportLimits): Required<MeshImportLimits> {
  const result = { maxFileBytes: limits.maxFileBytes ?? DEFAULT_LIMITS.maxFileBytes, maxElements: limits.maxElements ?? DEFAULT_LIMITS.maxElements, maxListItems: limits.maxListItems ?? DEFAULT_LIMITS.maxListItems, maxOutputBytes: limits.maxOutputBytes ?? DEFAULT_LIMITS.maxOutputBytes };
  for (const [name, value] of Object.entries(result)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`MESH_INVALID_LIMIT: ${name} must be a positive safe integer`);
  }
  return result;
}
function bytesOf(input: ArrayBuffer | Uint8Array | string, maximum: number): Uint8Array {
  if (typeof input === "string" && input.length > maximum) throw new Error("MESH_FILE_LIMIT: input exceeds maxFileBytes");
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > maximum) throw new Error("MESH_FILE_LIMIT: input exceeds maxFileBytes");
  return bytes;
}
function arrayFor(type: ScalarType, count: number): MeshNumericArray {
  switch (type.name) {
    case "int8": return new Int8Array(count);
    case "uint8": return new Uint8Array(count);
    case "int16": return new Int16Array(count);
    case "uint16": return new Uint16Array(count);
    case "int32": return new Int32Array(count);
    case "uint32": return new Uint32Array(count);
    case "float32": return new Float32Array(count);
    case "float64": return new Float64Array(count);
  }
}
function checkValue(value: number, type: ScalarType, label: string): number {
  if (!Number.isFinite(value) || value < type.min || value > type.max || (type.integer && !Number.isInteger(value))) {
    throw new Error(`PLY_INVALID_VALUE: ${label} is outside ${type.name}`);
  }
  return value;
}
function headerLines(bytes: Uint8Array): { lines: string[]; bodyOffset: number } {
  let start = 0;
  const lines: string[] = [];
  let firstTerminator: "lf" | "cr" | "crlf" | undefined;
  for (let i = 0; i < bytes.length && i < MAX_HEADER_BYTES; i += 1) {
    if (bytes[i]! > 127) throw new Error("PLY_HEADER: header must be ASCII");
    if (bytes[i] !== 10 && bytes[i] !== 13) continue;
    const terminator = bytes[i] === 10 ? "lf" : bytes[i + 1] === 10 ? "crlf" : "cr";
    firstTerminator ??= terminator;
    const line = new TextDecoder().decode(bytes.subarray(start, i));
    lines.push(line);
    // In a CR-only binary file, the first payload byte may itself be LF.
    const consumePair = terminator === "crlf" && (line.trim() !== "end_header" || firstTerminator !== "cr");
    start = i + (consumePair ? 2 : 1);
    if (line.trim() === "end_header") return { lines, bodyOffset: start };
    if (consumePair) i += 1;
  }
  throw new Error("PLY_HEADER: missing or oversized end_header line");
}
function plyHeader(lines: string[], limits: Required<MeshImportLimits>): { format: PlyMeshData["format"]; elements: ElementSpec[] } {
  if (lines[0]?.trim() !== "ply") throw new Error("PLY_HEADER: missing ply magic");
  let format: PlyMeshData["format"] | undefined;
  let current: ElementSpec | undefined;
  const elements: ElementSpec[] = [];
  let total = 0;
  for (const line of lines.slice(1, -1)) {
    const fields = line.trim().split(/\s+/);
    if (!fields[0] || fields[0] === "comment" || fields[0] === "obj_info") continue;
    if (fields[0] === "format") {
      if (format || fields.length !== 3 || fields[2] !== "1.0" || !["ascii", "binary_little_endian", "binary_big_endian"].includes(fields[1]!)) throw new Error("PLY_HEADER: unsupported or duplicate format");
      format = fields[1] as PlyMeshData["format"];
    } else if (fields[0] === "element") {
      if (fields.length !== 3 || !/^[0-9]+$/.test(fields[2]!)) throw new Error("PLY_HEADER: invalid element declaration");
      const count = Number(fields[2]);
      if (!Number.isSafeInteger(count) || (total += count) > limits.maxElements) throw new Error("PLY_ELEMENT_LIMIT: element count exceeds maxElements");
      if (elements.some((element) => element.name === fields[1])) throw new Error("PLY_HEADER: duplicate element");
      current = { name: fields[1]!, count, properties: [] };
      elements.push(current);
    } else if (fields[0] === "property") {
      if (!current) throw new Error("PLY_HEADER: property before element");
      const isList = fields[1] === "list";
      if (fields.length !== (isList ? 5 : 3)) throw new Error("PLY_HEADER: invalid property");
      const valueType = SCALARS[fields[isList ? 3 : 1]!];
      const countType = isList ? SCALARS[fields[2]!] : undefined;
      const name = fields[isList ? 4 : 2]!;
      if (!valueType || (isList && (!countType || !countType.integer))) throw new Error("PLY_HEADER: unknown property type");
      if (current.properties.some((property) => property.name === name)) throw new Error("PLY_HEADER: duplicate property");
      current.properties.push({ name, valueType, countType });
    } else throw new Error(`PLY_HEADER: unsupported directive ${fields[0]}`);
  }
  if (!format || !elements.length) throw new Error("PLY_HEADER: missing format or elements");
  return { format, elements };
}
function readBinary(view: DataView, offset: number, type: ScalarType, little: boolean): number {
  if (offset + type.size > view.byteLength) throw new Error("PLY_TRUNCATED: incomplete binary property");
  switch (type.name) {
    case "int8": return view.getInt8(offset);
    case "uint8": return view.getUint8(offset);
    case "int16": return view.getInt16(offset, little);
    case "uint16": return view.getUint16(offset, little);
    case "int32": return view.getInt32(offset, little);
    case "uint32": return view.getUint32(offset, little);
    case "float32": return view.getFloat32(offset, little);
    case "float64": return view.getFloat64(offset, little);
  }
}

export function parsePLY(input: ArrayBuffer | Uint8Array | string, options: MeshImportLimits = {}): PlyMeshData {
  const limits = limitsWithDefaults(options);
  const bytes = bytesOf(input, limits.maxFileBytes);
  const header = headerLines(bytes);
  const { format, elements: specs } = plyHeader(header.lines, limits);
  const body = bytes.subarray(header.bodyOffset);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let byteOffset = 0, listItems = 0, allocation = 0;
  const asciiToken = (): string | undefined => {
    while (byteOffset < body.length && body[byteOffset]! <= 32) byteOffset += 1;
    if (byteOffset === body.length) return undefined;
    const start = byteOffset;
    while (byteOffset < body.length && body[byteOffset]! > 32) {
      if (body[byteOffset]! > 127 || byteOffset - start >= 128) throw new Error("PLY_INVALID_VALUE: non-ASCII or oversized token");
      byteOffset += 1;
    }
    return new TextDecoder().decode(body.subarray(start, byteOffset));
  };
  const reserve = (amount: number): void => {
    allocation += amount;
    if (!Number.isSafeInteger(allocation) || allocation > limits.maxOutputBytes) throw new Error("PLY_ALLOCATION_LIMIT: decoded properties exceed maxOutputBytes");
  };
  const read = (type: ScalarType, label: string): number => {
    let value: number;
    if (format === "ascii") {
      const token = asciiToken();
      if (token === undefined) throw new Error("PLY_TRUNCATED: incomplete ASCII property");
      if (!(type.integer ? /^[+-]?\d+$/ : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/).test(token)) throw new Error(`PLY_INVALID_VALUE: invalid ${label}`);
      value = Number(token);
    } else {
      value = readBinary(view, byteOffset, type, format === "binary_little_endian");
      byteOffset += type.size;
    }
    return checkValue(value, type, label);
  };
  const elements: Record<string, PlyElementData> = Object.create(null) as Record<string, PlyElementData>;
  for (const spec of specs) {
    const rows: Array<{ spec: PropertySpec; scalar?: MeshNumericArray; offsets?: Uint32Array; list?: number[] }> = [];
    for (const property of spec.properties) {
      if (property.countType) {
        reserve((spec.count + 1) * 4);
        rows.push({ spec: property, offsets: new Uint32Array(spec.count + 1), list: [] });
      } else {
        reserve(spec.count * property.valueType.size);
        rows.push({ spec: property, scalar: arrayFor(property.valueType, spec.count) });
      }
    }
    for (let row = 0; row < spec.count; row += 1) {
      for (const property of rows) {
        if (property.spec.countType) {
          const count = read(property.spec.countType, `${spec.name}.${property.spec.name} count`);
          if (count < 0 || count > 0xffffffff - property.list!.length || (listItems += count) > limits.maxListItems) throw new Error("PLY_LIST_LIMIT: invalid or excessive list length");
          reserve(count * (property.spec.valueType.size + 8));
          for (let i = 0; i < count; i += 1) property.list!.push(read(property.spec.valueType, `${spec.name}.${property.spec.name}`));
          property.offsets![row + 1] = property.list!.length;
        } else property.scalar![row] = read(property.spec.valueType, `${spec.name}.${property.spec.name}`);
      }
    }
    const properties: Record<string, PlyScalarProperty | PlyListProperty> = Object.create(null) as Record<string, PlyScalarProperty | PlyListProperty>;
    for (const property of rows) {
      if (property.spec.countType) {
        const values = arrayFor(property.spec.valueType, property.list!.length);
        values.set(property.list!);
        properties[property.spec.name] = { kind: "list", type: property.spec.valueType.name, countType: property.spec.countType.name, values, offsets: property.offsets! };
      } else properties[property.spec.name] = { kind: "scalar", type: property.spec.valueType.name, values: property.scalar! };
    }
    elements[spec.name] = { count: spec.count, properties };
  }
  if (format === "ascii" ? asciiToken() !== undefined : byteOffset !== body.byteLength) throw new Error("PLY_TRAILING_DATA: unexpected body data");
  const vertex = elements.vertex;
  if (!vertex || vertex.count === 0) throw new Error("PLY_GEOMETRY: vertices are required");
  const scalar = (name: string): PlyScalarProperty | undefined => {
    const prop = vertex.properties[name];
    if (prop && prop.kind !== "scalar" && ["x", "y", "z", "nx", "ny", "nz", "u", "v", "s", "t", "texture_u", "texture_v", "red", "green", "blue", "alpha"].includes(name)) throw new Error(`PLY_GEOMETRY: ${name} must be scalar`);
    return prop?.kind === "scalar" ? prop : undefined;
  };
  const x = scalar("x"), y = scalar("y"), z = scalar("z");
  if (!x || !y || !z) throw new Error("PLY_GEOMETRY: scalar x, y and z are required");
  reserve(vertex.count * 12);
  const positions = new Float32Array(vertex.count * 3);
  for (let i = 0; i < vertex.count; i += 1) {
    positions.set([x.values[i]!, y.values[i]!, z.values[i]!], i * 3);
    if (!Number.isFinite(positions[i * 3]) || !Number.isFinite(positions[i * 3 + 1]) || !Number.isFinite(positions[i * 3 + 2])) throw new Error("PLY_GEOMETRY: position exceeds float32 range");
  }
  const componentArray = (names: readonly string[], width: number): Float32Array | undefined => {
    const parts = names.map(scalar);
    if (parts.every((part) => !part)) return undefined;
    if (parts.some((part) => !part)) throw new Error(`PLY_GEOMETRY: incomplete ${names.join("/")} attributes`);
    reserve(vertex.count * width * 4);
    const result = new Float32Array(vertex.count * width);
    for (let i = 0; i < vertex.count; i += 1) for (let j = 0; j < width; j += 1) {
      result[i * width + j] = parts[j]!.values[i]!;
      if (!Number.isFinite(result[i * width + j])) throw new Error("PLY_GEOMETRY: attribute exceeds float32 range");
    }
    return result;
  };
  const normals = componentArray(["nx", "ny", "nz"], 3);
  const uvNames = scalar("u") || scalar("v") ? ["u", "v"] : scalar("s") || scalar("t") ? ["s", "t"] : ["texture_u", "texture_v"];
  const texcoords = componentArray(uvNames, 2);
  const channels = [scalar("red"), scalar("green"), scalar("blue")];
  const alpha = scalar("alpha");
  let colors: Float32Array | undefined;
  if (channels.some(Boolean) || alpha) {
    if (channels.some((channel) => !channel)) throw new Error("PLY_GEOMETRY: incomplete red/green/blue attributes");
    reserve(vertex.count * 16);
    colors = new Float32Array(vertex.count * 4);
    const normalized = (property: PlyScalarProperty, i: number): number => {
      const type = SCALARS[property.type]!;
      const value = property.values[i]!;
      const result = type.integer ? value / type.max : value;
      if (result < 0 || result > 1 || !Number.isFinite(result)) throw new Error("PLY_GEOMETRY: color outside normalized range");
      return result;
    };
    for (let i = 0; i < vertex.count; i += 1) {
      for (let j = 0; j < 3; j += 1) colors[i * 4 + j] = normalized(channels[j]!, i);
      colors[i * 4 + 3] = alpha ? normalized(alpha, i) : 1;
    }
  }
  const face = elements.face;
  if (face?.properties.vertex_indices && face.properties.vertex_index) throw new Error("PLY_GEOMETRY: ambiguous face vertex index lists");
  const faceList = face?.properties.vertex_indices ?? face?.properties.vertex_index;
  let indices: Uint32Array;
  let alternateTriangulation = false;
  if (face && face.count > 0) {
    if (!faceList || faceList.kind !== "list") throw new Error("PLY_GEOMETRY: face vertex_indices list is required");
    if (!SCALARS[faceList.type]?.integer) throw new Error("PLY_GEOMETRY: face vertex_indices must have an integer type");
    let count = 0, triangulationWork = 0;
    for (let i = 0; i < face.count; i += 1) {
      const length = faceList.offsets[i + 1]! - faceList.offsets[i]!;
      if (length < 3) throw new Error("PLY_GEOMETRY: a face has fewer than three vertices");
      if (length > 3 && (triangulationWork += length ** 3) > 16_000_000) throw new Error("PLY_LIST_LIMIT: polygon triangulation work exceeds limit");
      count += (length - 2) * 3;
      if (count > limits.maxListItems) throw new Error("PLY_LIST_LIMIT: triangulated faces exceed maxListItems");
    }
    reserve(count * 4);
    indices = new Uint32Array(count);
    let at = 0;
    for (let i = 0; i < face.count; i += 1) {
      const start = faceList.offsets[i]!, end = faceList.offsets[i + 1]!;
      for (let j = start; j < end; j += 1) {
        const index = faceList.values[j]!;
        if (!Number.isInteger(index) || index < 0 || index >= vertex.count) throw new Error("PLY_GEOMETRY: face index outside vertex array");
      }
      const polygon = Array.from(faceList.values.subarray(start, end));
      const { triangles, usedAlternative } = triangulatePlyFace(polygon, positions);
      alternateTriangulation ||= usedAlternative;
      indices.set(triangles, at);
      at += triangles.length;
    }
  } else {
    reserve(vertex.count * 4);
    indices = Uint32Array.from({ length: vertex.count }, (_, i) => i);
  }
  const mapped = new Set(["x", "y", "z", "nx", "ny", "nz", ...uvNames, "red", "green", "blue", "alpha"]);
  const diagnostics = Object.keys(vertex.properties).filter((name) => !mapped.has(name)).map((name) => `PLY attribute ${name} is available in parsePLY elements but not mapped to the render asset`);
  if (face && Object.keys(face.properties).some((name) => name !== "vertex_indices" && name !== "vertex_index")) diagnostics.push("PLY face properties are available in parsePLY elements but not mapped to the render asset");
  for (const [name, element] of Object.entries(elements)) {
    if (name !== "vertex" && name !== "face" && element.count > 0) diagnostics.push(`PLY element ${name} is available in parsePLY elements but not mapped to the render asset`);
  }
  if (header.lines.some((line) => /^(?:comment|obj_info)(?:\s|$)/.test(line.trim()))) diagnostics.push("PLY header comments and obj_info are not retained");
  if (alternateTriangulation) diagnostics.push("PLY polygon used non-fan triangulation; indexed attribute interpolation can differ from a triangle fan");
  return { format, version: "1.0", elements, positions, normals, texcoords, colors, indices, topology: face && face.count > 0 ? "triangles" : "points", diagnostics };
}

/** Prefer the PLY triangle fan; use diagnosed ear clipping for other simple polygons. */
function triangulatePlyFace(polygon: readonly number[], positions: Float32Array): { triangles: number[]; usedAlternative: boolean } {
  if (polygon.length === 3) return { triangles: [...polygon], usedAlternative: false };
  if (polygon.length > 512) throw new Error("PLY_LIST_LIMIT: polygon has more than 512 corners");
  if (new Set(polygon).size !== polygon.length) throw new Error("PLY_GEOMETRY: face repeats a vertex");
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]! * 3, b = polygon[(i + 1) % polygon.length]! * 3;
    nx += (positions[a + 1]! - positions[b + 1]!) * (positions[a + 2]! + positions[b + 2]!);
    ny += (positions[a + 2]! - positions[b + 2]!) * (positions[a]! + positions[b]!);
    nz += (positions[a]! - positions[b]!) * (positions[a + 1]! + positions[b + 1]!);
  }
  const axis = Math.abs(nx) >= Math.abs(ny) && Math.abs(nx) >= Math.abs(nz) ? 0 : Math.abs(ny) >= Math.abs(nz) ? 1 : 2;
  if (Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz)) === 0) throw new Error("PLY_GEOMETRY: degenerate polygon");
  const points = polygon.map((index) => {
    const p = index * 3;
    return axis === 0 ? [positions[p + 1]!, positions[p + 2]!] : axis === 1 ? [positions[p]!, positions[p + 2]!] : [positions[p]!, positions[p + 1]!];
  });
  const cross = (a: number, b: number, c: number): number => (points[b]![0]! - points[a]![0]!) * (points[c]![1]! - points[a]![1]!) - (points[b]![1]! - points[a]![1]!) * (points[c]![0]! - points[a]![0]!);
  let area = 0;
  for (let i = 0; i < points.length; i += 1) { const a = points[i]!, b = points[(i + 1) % points.length]!; area += a[0]! * b[1]! - a[1]! * b[0]!; }
  if (!Number.isFinite(area) || area === 0) throw new Error("PLY_GEOMETRY: degenerate polygon");
  const between = (a: number, b: number, c: number): boolean => Math.min(points[a]![0]!, points[b]![0]!) <= points[c]![0]! && points[c]![0]! <= Math.max(points[a]![0]!, points[b]![0]!) && Math.min(points[a]![1]!, points[b]![1]!) <= points[c]![1]! && points[c]![1]! <= Math.max(points[a]![1]!, points[b]![1]!);
  for (let a = 0; a < points.length; a += 1) for (let b = a + 1; b < points.length; b += 1) {
    const nextA = (a + 1) % points.length, nextB = (b + 1) % points.length;
    if (a === b || nextA === b || nextB === a) continue;
    const ca = cross(a, nextA, b), cb = cross(a, nextA, nextB), cc = cross(b, nextB, a), cd = cross(b, nextB, nextA);
    if ((ca * cb < 0 && cc * cd < 0) || (ca === 0 && between(a, nextA, b)) || (cb === 0 && between(a, nextA, nextB)) || (cc === 0 && between(b, nextB, a)) || (cd === 0 && between(b, nextB, nextA))) throw new Error("PLY_GEOMETRY: self-intersecting polygon");
  }
  const winding = Math.sign(area);
  const fan: number[] = [];
  for (let i = 1; i < polygon.length - 1; i += 1) {
    if (cross(0, i, i + 1) * winding <= 0) { fan.length = 0; break; }
    fan.push(polygon[0]!, polygon[i]!, polygon[i + 1]!);
  }
  if (fan.length) return { triangles: fan, usedAlternative: false };
  const remaining = polygon.map((_, index) => index), result: number[] = [];
  while (remaining.length > 3) {
    let removed = false;
    for (let i = 0; i < remaining.length; i += 1) {
      const a = remaining[(i + remaining.length - 1) % remaining.length]!, b = remaining[i]!, c = remaining[(i + 1) % remaining.length]!;
      if (cross(a, b, c) * winding <= 0) continue;
      const contains = remaining.some((point) => point !== a && point !== b && point !== c && cross(a, b, point) * winding >= 0 && cross(b, c, point) * winding >= 0 && cross(c, a, point) * winding >= 0);
      if (contains) continue;
      result.push(polygon[a]!, polygon[b]!, polygon[c]!);
      remaining.splice(i, 1); removed = true; break;
    }
    if (!removed) throw new Error("PLY_GEOMETRY: non-simple or degenerate polygon");
  }
  if (cross(remaining[0]!, remaining[1]!, remaining[2]!) * winding <= 0) throw new Error("PLY_GEOMETRY: non-simple or degenerate polygon");
  result.push(...remaining.map((index) => polygon[index]!));
  return { triangles: result, usedAlternative: true };
}

const STL_NUMBER = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
const STL_TRIPLE = new RegExp(`^\\s*(?:facet\\s+normal|vertex)\\s+(${STL_NUMBER})\\s+(${STL_NUMBER})\\s+(${STL_NUMBER})\\s*$`, "i");
function stlTriple(line: string, prefix: "facet" | "vertex"): [number, number, number] {
  if (!new RegExp(`^\\s*${prefix}\\b`, "i").test(line)) throw new Error(`STL_SYNTAX: expected ${prefix}`);
  const match = STL_TRIPLE.exec(line);
  if (!match) throw new Error(`STL_SYNTAX: invalid ${prefix} vector`);
  const value: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (value.some((component) => !Number.isFinite(component) || Math.abs(component) > 3.4028234663852886e38)) throw new Error("STL_VALUE: non-finite or oversized coordinate");
  return value;
}
function triangleNormal(a: readonly number[], b: readonly number[], c: readonly number[]): [number, number, number] {
  const ux = b[0]! - a[0]!, uy = b[1]! - a[1]!, uz = b[2]! - a[2]!;
  const vx = c[0]! - a[0]!, vy = c[1]! - a[1]!, vz = c[2]! - a[2]!;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);
  return length > 0 && Number.isFinite(length) ? [nx / length, ny / length, nz / length] : [0, 0, 0];
}
function normalizeNormal(normal: readonly number[], vertices: readonly (readonly number[])[]): [number, number, number] {
  const length = Math.hypot(...normal);
  return length > 0 && Number.isFinite(length) ? [normal[0]! / length, normal[1]! / length, normal[2]! / length] : triangleNormal(vertices[0]!, vertices[1]!, vertices[2]!);
}
export function parseSTL(input: ArrayBuffer | Uint8Array | string, options: MeshImportLimits = {}): StlMeshData {
  const limits = limitsWithDefaults(options);
  const bytes = bytesOf(input, limits.maxFileBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const binaryCount = bytes.length >= 84 ? view.getUint32(80, true) : -1;
  const isBinary = binaryCount >= 0 && 84 + binaryCount * 50 === bytes.length;
  const positions: number[] = [], normals: number[] = [], attributes: number[] = [];
  const groups: Array<{ name: string; start: number; count: number }> = [];
  const diagnostics: string[] = [];
  let repairedNormals = false;
  let degenerateNormals = false;
  let groupBytes = 0;
  const group = (name: string, start: number, count: number): void => {
    if (name.length > MAX_GROUP_NAME_LENGTH || groups.length >= limits.maxElements) throw new Error("STL_GROUP_LIMIT: too many solids or solid name exceeds 1024 characters");
    groupBytes += 64 + name.length * 2;
    if (groupBytes + attributes.length * STL_FACET_ACCOUNTED_BYTES > limits.maxOutputBytes) throw new Error("STL_ALLOCATION_LIMIT: solids exceed maxOutputBytes");
    groups.push({ name, start, count });
  };
  const add = (normal: readonly number[], vertices: readonly (readonly number[])[], attr: number): void => {
    if ((attributes.length + 1) * 3 > limits.maxElements || (attributes.length + 1) * 3 > limits.maxListItems || groupBytes + (attributes.length + 1) * STL_FACET_ACCOUNTED_BYTES > limits.maxOutputBytes) {
      throw new Error("STL_ALLOCATION_LIMIT: facets exceed import limits");
    }
    const n = normalizeNormal(normal, vertices);
    if (Math.hypot(...normal) === 0) {
      repairedNormals = true;
      if (Math.hypot(...n) === 0) degenerateNormals = true;
    }
    for (const vertex of vertices) {
      if (vertex.some((component) => !Number.isFinite(component))) throw new Error("STL_VALUE: non-finite coordinate");
      positions.push(...vertex);
      normals.push(...n);
    }
    attributes.push(attr);
  };
  if (isBinary) {
    for (let facet = 0; facet < binaryCount; facet += 1) {
      const offset = 84 + facet * 50;
      const vector = (at: number): [number, number, number] => [view.getFloat32(at, true), view.getFloat32(at + 4, true), view.getFloat32(at + 8, true)];
      const normal = vector(offset);
      if (normal.some((value) => !Number.isFinite(value))) throw new Error("STL_VALUE: non-finite normal");
      add(normal, [vector(offset + 12), vector(offset + 24), vector(offset + 36)], view.getUint16(offset + 48, true));
    }
    const header = new TextDecoder().decode(bytes.subarray(0, 80));
    if (attributes.some((attribute) => attribute !== 0) || header.includes("COLOR=")) diagnostics.push("STL binary attribute words are available in parseSTL but not mapped to the render asset; nonstandard color encodings are not interpreted");
    group("binary", 0, positions.length / 3);
  } else {
    const text = new TextDecoder().decode(bytes);
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    let i = 0;
    while (i < lines.length) {
      const solid = /^solid(?:\s+(.*))?$/i.exec(lines[i++] ?? "");
      if (!solid) throw new Error("STL_SYNTAX: expected solid or exact-length binary STL");
      const name = solid[1] ?? "solid";
      if (name.length > MAX_GROUP_NAME_LENGTH) throw new Error("STL_GROUP_LIMIT: solid name exceeds 1024 characters");
      const start = positions.length / 3;
      let ended = false;
      while (i < lines.length) {
        if (/^endsolid(?:\s+.*)?$/i.test(lines[i]!)) { i += 1; ended = true; break; }
        const normal = stlTriple(lines[i++] ?? "", "facet");
        if (!/^outer\s+loop$/i.test(lines[i++] ?? "")) throw new Error("STL_SYNTAX: expected outer loop");
        const vertices = [stlTriple(lines[i++] ?? "", "vertex"), stlTriple(lines[i++] ?? "", "vertex"), stlTriple(lines[i++] ?? "", "vertex")];
        if (!/^endloop$/i.test(lines[i++] ?? "") || !/^endfacet$/i.test(lines[i++] ?? "")) throw new Error("STL_SYNTAX: missing endloop or endfacet");
        add(normal, vertices, 0);
      }
      if (!ended) throw new Error("STL_TRUNCATED: missing endsolid");
      group(name, start, positions.length / 3 - start);
    }
  }
  if (!attributes.length) throw new Error("STL_GEOMETRY: at least one facet is required");
  if (groups.some((group) => group.count === 0)) diagnostics.push("STL empty solids are not represented as scene meshes");
  if (repairedNormals) diagnostics.push("STL zero facet normals recomputed from vertices");
  if (degenerateNormals) diagnostics.push("STL degenerate facets have zero normals");
  return {
    format: isBinary ? "binary" : "ascii", positions: Float32Array.from(positions), normals: Float32Array.from(normals),
    indices: Uint32Array.from({ length: positions.length / 3 }, (_, index) => index),
    topology: "triangles", groups, attributes: Uint16Array.from(attributes), diagnostics
  };
}

/** Bounded source read. All loaders use the caller's request and abort policy. */
export async function readMeshAssetBytes(request: AssetLoadRequest, context: LoadContext, maxBytes = DEFAULT_LIMITS.maxFileBytes): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("MESH_INVALID_LIMIT: maxFileBytes must be a positive safe integer");
  context.throwIfAborted(request.url);
  const policy = mergeAssetRequestOptions(context.requestOptionsFor(request.url), request);
  const bytes = await fetchBytes(context.resolve(request.url), context.signalFor(request.signal), ({ loaded, total }) => {
    request.onProgress?.({ url: request.url, phase: "document", loadedBytes: loaded, ...(total === undefined ? {} : { totalBytes: total }) });
  }, { ...policy, maxBytes: Math.min(maxBytes, policy.maxBytes ?? maxBytes) });
  context.throwIfAborted(request.url);
  return new Uint8Array(bytes);
}

/** Translate native mesh data into the existing Aura3D glTF asset/render path. */
export async function loadNativeMeshAsset(mesh: NativeMeshData, name: string, url: string, loader: GLTFLoader, context: LoadContext, signal?: AbortSignal): Promise<GLTFAsset> {
  const count = mesh.positions.length / 3;
  if (!Number.isInteger(count) || count < 1 || mesh.normals && mesh.normals.length !== count * 3 || mesh.texcoords && mesh.texcoords.length !== count * 2 || mesh.colors && mesh.colors.length !== count * 4) throw new Error("MESH_GEOMETRY: attribute sizes disagree");
  for (const values of [mesh.positions, mesh.normals, mesh.texcoords, mesh.colors]) if (values) for (const value of values) if (!Number.isFinite(value)) throw new Error("MESH_GEOMETRY: non-finite attribute");
  if (!mesh.indices.length || (mesh.topology === "triangles" && mesh.indices.length % 3 !== 0)) throw new Error("MESH_GEOMETRY: invalid primitive index count");
  for (const index of mesh.indices) if (index >= count) throw new Error("MESH_GEOMETRY: index outside vertex array");
  const chunks: Uint8Array[] = [];
  const views: Array<{ buffer: number; byteOffset: number; byteLength: number }> = [];
  const accessors: Array<Record<string, unknown>> = [];
  let length = 0;
  const append = (data: Float32Array | Uint32Array, type: string, min?: readonly number[], max?: readonly number[]): number => {
    const padding = (4 - length % 4) % 4;
    if (padding) { chunks.push(new Uint8Array(padding)); length += padding; }
    if (length + data.length * 4 > 32 * 1024 * 1024) throw new Error("MESH_ADAPTER_LIMIT: glTF buffer exceeds 32 MiB");
    const bytes = new Uint8Array(data.length * 4);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < data.length; i += 1) {
      if (data instanceof Float32Array) view.setFloat32(i * 4, data[i]!, true);
      else view.setUint32(i * 4, data[i]!, true);
    }
    const viewIndex = views.length;
    views.push({ buffer: 0, byteOffset: length, byteLength: bytes.length });
    chunks.push(bytes); length += bytes.length;
    const accessor = accessors.length;
    const width = type === "VEC4" ? 4 : type === "VEC3" ? 3 : type === "VEC2" ? 2 : 1;
    accessors.push({ bufferView: viewIndex, componentType: data instanceof Float32Array ? 5126 : 5125, count: data.length / width, type, ...(min ? { min } : {}), ...(max ? { max } : {}) });
    return accessor;
  };
  const groups = mesh.groups ?? [{ name, start: 0, count: mesh.indices.length }];
  let covered = 0;
  for (const group of groups) {
    if (typeof group.name !== "string" || group.name.length > MAX_GROUP_NAME_LENGTH) throw new Error("MESH_GROUP_LIMIT: group name must be a string of at most 1024 characters");
    if (!Number.isSafeInteger(group.start) || !Number.isSafeInteger(group.count) || group.start !== covered || group.count < 0 || group.start + group.count > mesh.indices.length || (mesh.topology === "triangles" && (group.start % 3 !== 0 || group.count % 3 !== 0))) throw new Error("MESH_GEOMETRY: groups must cover the index array in order");
    covered += group.count;
  }
  if (covered !== mesh.indices.length) throw new Error("MESH_GEOMETRY: groups must cover the index array in order");
  const nonemptyGroups = groups.filter((group) => group.count > 0);
  if (nonemptyGroups.length > 4096) throw new Error("MESH_ADAPTER_LIMIT: more than 4096 nonempty groups");
  const adapterDiagnostics: string[] = [];
  const names = new Set<string>();
  const referenced = nonemptyGroups.length > 1 ? new Uint8Array(count) : undefined;
  const meshes = nonemptyGroups.map((group) => {
    let groupName = group.name || name;
    const baseName = groupName;
    for (let suffix = 2; names.has(groupName); suffix += 1) groupName = `${baseName} (${suffix})`;
    if (groupName !== group.name) adapterDiagnostics.push(`Native mesh group ${JSON.stringify(group.name)} renamed ${JSON.stringify(groupName)} for a unique render geometry key`);
    names.add(groupName);
    let positions = mesh.positions, normals = mesh.normals, texcoords = mesh.texcoords, colors = mesh.colors;
    let indices = mesh.indices.subarray(group.start, group.start + group.count);
    if (referenced) {
      // Each glTF mesh is decoded separately. Remap groups to their referenced
      // vertices so many solids cannot copy the entire original mesh per group.
      if (group.count * 4 + length > 32 * 1024 * 1024) throw new Error("MESH_ADAPTER_LIMIT: glTF buffer exceeds 32 MiB");
      const map = new Map<number, number>(), originals: number[] = [];
      const remapped = new Uint32Array(group.count);
      for (let i = 0; i < indices.length; i += 1) {
        const original = indices[i]!;
        let local = map.get(original);
        if (local === undefined) { local = originals.length; map.set(original, local); originals.push(original); referenced[original] = 1; }
        remapped[i] = local;
      }
      const bytesPerVertex = 4 * (3 + (normals ? 3 : 0) + (texcoords ? 2 : 0) + (colors ? 4 : 0));
      if (length + originals.length * bytesPerVertex + remapped.byteLength > 32 * 1024 * 1024) throw new Error("MESH_ADAPTER_LIMIT: glTF buffer exceeds 32 MiB");
      const remap = (source: Float32Array, width: number): Float32Array => {
        const output = new Float32Array(originals.length * width);
        for (let i = 0; i < originals.length; i += 1) for (let j = 0; j < width; j += 1) output[i * width + j] = source[originals[i]! * width + j]!;
        return output;
      };
      positions = remap(positions, 3);
      if (normals) normals = remap(normals, 3);
      if (texcoords) texcoords = remap(texcoords, 2);
      if (colors) colors = remap(colors, 4);
      indices = remapped;
    }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) for (let axis = 0; axis < 3; axis += 1) { min[axis] = Math.min(min[axis]!, positions[i + axis]!); max[axis] = Math.max(max[axis]!, positions[i + axis]!); }
    const attributes: Record<string, number> = { POSITION: append(positions, "VEC3", min, max) };
    if (normals) attributes.NORMAL = append(normals, "VEC3");
    if (texcoords) attributes.TEXCOORD_0 = append(texcoords, "VEC2");
    if (colors) attributes.COLOR_0 = append(colors, "VEC4");
    const primitive = { attributes, indices: append(indices, "SCALAR"), material: 0, mode: mesh.topology === "points" ? 0 : 4 };
    return { name: groupName, primitives: [primitive] };
  });
  if (!meshes.length) throw new Error("MESH_GEOMETRY: no primitives");
  if (referenced && referenced.some((value) => value === 0)) adapterDiagnostics.push("Native mesh unreferenced vertices are not mapped to grouped render meshes");
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x4000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x4000));
  const dataUrl = `data:application/octet-stream;base64,${btoa(binary)}`;
  const nodes = meshes.map((mesh, index) => ({ name: mesh.name, mesh: index }));
  const document = { asset: { version: "2.0", generator: "Aura3D native mesh import" }, buffers: [{ uri: dataUrl, byteLength: bytes.length }], bufferViews: views, accessors, materials: [{ name: `${name}-material`, doubleSided: true, alphaMode: mesh.colors?.some((value, index) => index % 4 === 3 && value < 1) ? "BLEND" : "OPAQUE", pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.7 } }], meshes, nodes, scenes: [{ nodes: nodes.map((_, index) => index) }], scene: 0 };
  // The synthetic glTF document is internally generated from already verified
  // bytes, so the original file's digest and origin policy do not apply to it.
  const internalSignal = context.signalFor(signal);
  const inner = await loader.load({ url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(document))}`, type: "gltf", signal: internalSignal }, new LoadContext({ signal: internalSignal }));
  if (internalSignal?.aborted) { loader.dispose(inner); throw internalSignal.reason ?? new Error("Asset load aborted"); }
  const diagnostics = { ...inner.loaderDiagnostics, features: [...new Set([...inner.loaderDiagnostics.features, `native-${name}`])], unsupportedFeatures: [...inner.loaderDiagnostics.unsupportedFeatures, ...mesh.diagnostics, ...adapterDiagnostics] };
  return { ...inner, url, loaderDiagnostics: diagnostics, get disposed() { return inner.disposed; }, createScene: (options) => inner.createScene(options), toJSON: () => ({ ...inner.toJSON(), url, loaderDiagnostics: diagnostics }) };
}

abstract class NativeMeshLoader implements AssetLoader<GLTFAsset> {
  abstract readonly type: string;
  private readonly owned = new WeakSet<GLTFAsset>();
  constructor(protected readonly gltfLoader = new GLTFLoader(), protected readonly limits: MeshImportLimits = {}) {}
  canLoad(request: AssetLoadRequest): boolean { return request.type === this.type || new RegExp(`\\.${this.type}(?:[?#]|$)`, "i").test(request.url); }
  protected abstract parse(bytes: Uint8Array): NativeMeshData;
  async load(request: AssetLoadRequest, context: LoadContext): Promise<GLTFAsset> {
    const bytes = await readMeshAssetBytes(request, context, limitsWithDefaults(this.limits).maxFileBytes);
    const mesh = this.parse(bytes);
    const asset = await loadNativeMeshAsset(mesh, this.type, request.url, this.gltfLoader, context, request.signal);
    try {
      context.throwIfAborted(request.url);
      if (request.signal?.aborted) throw request.signal.reason ?? new Error("Asset load aborted");
      request.onProgress?.({ url: request.url, phase: "complete", loadedBytes: bytes.byteLength, totalBytes: bytes.byteLength });
      this.owned.add(asset);
      return asset;
    } catch (error) {
      this.gltfLoader.dispose(asset);
      throw error;
    }
  }
  dispose(asset: GLTFAsset): void {
    if (this.owned.has(asset)) { this.owned.delete(asset); this.gltfLoader.dispose(asset); }
  }
}
export class PLYLoader extends NativeMeshLoader {
  readonly type = "ply";
  parse(bytes: ArrayBuffer | Uint8Array | string): PlyMeshData { return parsePLY(bytes, this.limits); }
}
export class STLLoader extends NativeMeshLoader {
  readonly type = "stl";
  parse(bytes: ArrayBuffer | Uint8Array | string): StlMeshData { return parseSTL(bytes, this.limits); }
}
