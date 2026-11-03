import { mergeAssetRequestOptions, redactAssetUrl, type AssetLoadRequest, type AssetLoader, type AssetRequestOptions } from "../AssetLoader";
import { fetchBytes, validateAssetUrlPolicy, verifyAssetBytes } from "../LoaderFetch";
import { LoadContext } from "../LoadContext";
import { decompressZstdFallback } from "./ZstdDecoder";
import { decodeCompressedPly, decodeKSplat } from "./SplatCodecs";

/**
 * Gaussian splat data import, independent of a rendering backend.
 *
 * KHR_gaussian_splatting defines the accessor semantics and real SH basis:
 * https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_gaussian_splatting
 * The arrays below are owned by the returned object and are never views into the input.
 */
export type GaussianSplatFormat = "ply" | "splat" | "ksplat" | "spz" | "gltf" | "glb";
export type GaussianSplatDegree = 0 | 1 | 2 | 3 | 4;
export type GaussianSplatColorSpace = "srgb_rec709_display" | "lin_rec709_display";
type SplatMatrix = readonly [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
type SplatBounds = { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
export interface GaussianSplatData {
  readonly count: number;
  readonly positions: Float32Array;
  readonly scales: Float32Array;
  /** Unit quaternions in x, y, z, w order. */
  readonly rotations: Float32Array;
  /** Reconstructed degree-zero RGB, in metadata.colorSpace, before clamping. */
  readonly colors: Float32Array;
  readonly opacities: Float32Array;
  /** Per point, coefficient-major RGB triples, excluding degree zero. */
  readonly sphericalHarmonics?: Float32Array;
  readonly shDegree: GaussianSplatDegree;
  /** Conservative 3-sigma bounds in the input coordinate space. */
  readonly bounds: SplatBounds;
  /**
   * glTF scene instances of this mesh, sharing the arrays above. Matrices are
   * column-major in the asset's coordinate system and map the cloud's mesh
   * coordinates into its glTF scene at the authored initial pose. Accessor-
   * defined GPU instances additionally carry their zero-based instanceIndex.
   * Undefined means one identity instance; an empty list means the selected
   * mesh is not in the chosen scene.
   */
  readonly instances?: readonly { readonly nodeIndex: number; readonly instanceIndex?: number; readonly worldMatrix: SplatMatrix }[];
  /** Conservative union of instance bounds in asset scene coordinates. */
  readonly sceneBounds?: SplatBounds;
  /**
   * Other distinct glTF splat primitives, each with its own arrays, material
   * metadata, instances and bounds. This list is flat and shares the parent
   * asset handle's lifetime; entries do not contain further additionalClouds.
   */
  readonly additionalClouds?: readonly GaussianSplatData[];
  /** Conservative union of all visible glTF clouds in asset scene coordinates. */
  readonly assetBounds?: SplatBounds;
  readonly metadata: {
    readonly format: GaussianSplatFormat;
    readonly version?: string;
    readonly colorSpace: GaussianSplatColorSpace;
    readonly coordinateSystem?: string;
    readonly extras?: Readonly<Record<string, unknown>>;
  };
}

/** Codec callbacks return a single uninstanced cloud; the loader copies and validates its arrays. */
export type GaussianSplatCodec = (bytes: Uint8Array, options: GaussianSplatParseOptions) => Promise<GaussianSplatData> | GaussianSplatData;
export interface GaussianSplatParseOptions {
  readonly maxPoints?: number;
  readonly maxInputBytes?: number;
  readonly maxDecodedBytes?: number;
  /** For formats without color-space metadata, including older draft glTF SPZ. */
  readonly defaultColorSpace?: GaussianSplatColorSpace;
  readonly signal?: AbortSignal;
  /** Required when a glTF buffer URI cannot be resolved from its containing URL. */
  readonly resolveUri?: (uri: string, signal?: AbortSignal) => Promise<ArrayBuffer | Uint8Array>;
  /** Validate an inline glTF buffer against the containing asset policy. */
  readonly verifyInlineUri?: (uri: string, bytes: Uint8Array) => Promise<void> | void;
  /** Optional platform Zstandard decompressor for SPZ v4. Must return exactly expectedBytes. */
  readonly decompressZstd?: (bytes: Uint8Array, expectedBytes: number, signal?: AbortSignal) => Promise<Uint8Array> | Uint8Array;
  readonly gltfMesh?: number;
  readonly gltfPrimitive?: number;
  /** glTF scene index; defaults to the document's default scene or scene 0. */
  readonly gltfScene?: number;
  /**
   * Optional override codecs. KSPLAT and chunk-quantized PLY are decoded by the
   * bundled Aura3D codecs (see SplatCodecs.ts) when no override is supplied;
   * SPZ uses the built-in reader unless an override is supplied.
   */
  readonly codecs?: Partial<Record<"ksplat" | "spz" | "compressedPly", GaussianSplatCodec>>;
}

const DEFAULT_MAX_POINTS = 2_000_000;
const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
const C0 = 0.28209479177387814;
const decoder = new TextDecoder("utf-8", { fatal: true });

type MutableSplat = Omit<GaussianSplatData, "bounds">;
function limits(options: GaussianSplatParseOptions) {
  const maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS;
  const maxInputBytes = options.maxInputBytes ?? DEFAULT_MAX_BYTES;
  const maxDecodedBytes = options.maxDecodedBytes ?? DEFAULT_MAX_BYTES;
  for (const [name, value] of Object.entries({ maxPoints, maxInputBytes, maxDecodedBytes })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive safe integer`);
  }
  return { maxPoints, maxInputBytes, maxDecodedBytes };
}
function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}
function shSize(degree: GaussianSplatDegree): number { return ((degree + 1) ** 2 - 1) * 3; }
function checkAllocation(count: number, degree: GaussianSplatDegree, options: GaussianSplatParseOptions): void {
  const bound = limits(options);
  if (!Number.isSafeInteger(count) || count < 1 || count > bound.maxPoints) throw new RangeError(`splat count exceeds limit or is empty: ${count}`);
  if (count * (14 + shSize(degree)) * 4 > bound.maxDecodedBytes) throw new RangeError("splat decoded byte limit exceeded");
}
function allocate(count: number, degree: GaussianSplatDegree, format: GaussianSplatFormat, options: GaussianSplatParseOptions, colorSpace: GaussianSplatColorSpace = options.defaultColorSpace ?? "srgb_rec709_display"): MutableSplat {
  checkAllocation(count, degree, options);
  return {
    count, shDegree: degree,
    positions: new Float32Array(count * 3), scales: new Float32Array(count * 3),
    rotations: new Float32Array(count * 4), colors: new Float32Array(count * 3), opacities: new Float32Array(count),
    ...(degree ? { sphericalHarmonics: new Float32Array(count * shSize(degree)) } : {}),
    metadata: { format, colorSpace }
  };
}
/** Validate all values, normalize rotations in place, and return conservative bounds. Built-in parsers own their arrays. */
export function validateGaussianSplat(data: MutableSplat, options: GaussianSplatParseOptions = {}): GaussianSplatData {
  if (![0, 1, 2, 3, 4].includes(data.shDegree)) throw new RangeError("invalid spherical-harmonic degree");
  checkAllocation(data.count, data.shDegree, options);
  const n = data.count;
  const required: [string, Float32Array | undefined, number][] = [
    ["positions", data.positions, n * 3], ["scales", data.scales, n * 3], ["rotations", data.rotations, n * 4],
    ["colors", data.colors, n * 3], ["opacities", data.opacities, n], ["sphericalHarmonics", data.sphericalHarmonics, n * shSize(data.shDegree)]
  ];
  for (const [name, value, expected] of required) {
    if (expected === 0 && value === undefined) continue;
    if (!(value instanceof Float32Array) || value.length !== expected) throw new TypeError(`invalid ${name} length or array type`);
    for (let i = 0; i < value.length; i++) if (!Number.isFinite(value[i])) throw new RangeError(`${name} contains a non-finite value`);
  }
  if (data.metadata.colorSpace !== "srgb_rec709_display" && data.metadata.colorSpace !== "lin_rec709_display") throw new RangeError("unsupported splat color space");
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    if ((i & 16383) === 0) checkAbort(options.signal);
    const p = i * 3, q = i * 4;
    for (let j = 0; j < 3; j++) {
      const scale = data.scales[p + j]!;
      if (scale < 0) throw new RangeError("splat scales must be non-negative");
      // Covariance uses squared scales in float32 rendering buffers. A finite
      // scale alone can still overflow those buffers and poison projection.
      if (!Number.isFinite(Math.fround(scale * scale))) throw new RangeError("splat covariance exceeds float32 range");
    }
    if (data.opacities[i]! < 0 || data.opacities[i]! > 1) throw new RangeError("splat opacity must be in [0,1]");
    const length = Math.hypot(data.rotations[q]!, data.rotations[q + 1]!, data.rotations[q + 2]!, data.rotations[q + 3]!);
    if (!Number.isFinite(length) || length < 1e-8) throw new RangeError("splat rotation must be nonzero");
    for (let j = 0; j < 4; j++) data.rotations[q + j] = data.rotations[q + j]! / length;
    const radius = 3 * Math.max(data.scales[p]!, data.scales[p + 1]!, data.scales[p + 2]!);
    for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j]!, data.positions[p + j]! - radius); max[j] = Math.max(max[j]!, data.positions[p + j]! + radius); }
  }
  return { ...data, bounds: { min, max } };
}

function asBytes(input: ArrayBuffer | Uint8Array): Uint8Array { return input instanceof Uint8Array ? input : new Uint8Array(input); }
function sigmoid(v: number): number { return v >= 0 ? 1 / (1 + Math.exp(-v)) : Math.exp(v) / (1 + Math.exp(v)); }
function parseSplat(bytes: Uint8Array, options: GaussianSplatParseOptions): GaussianSplatData {
  if (bytes.byteLength % 32 !== 0) throw new Error("SPLAT payload length must be a multiple of 32 bytes");
  const data = allocate(bytes.byteLength / 32, 0, "splat", options);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < data.count; i++) {
    if ((i & 16383) === 0) checkAbort(options.signal);
    const o = i * 32, p = i * 3, q = i * 4;
    for (let j = 0; j < 3; j++) { data.positions[p + j] = view.getFloat32(o + j * 4, true); data.scales[p + j] = view.getFloat32(o + 12 + j * 4, true); data.colors[p + j] = bytes[o + 24 + j]! / 255; }
    data.opacities[i] = bytes[o + 27]! / 255;
    // The file stores a quantized w,x,y,z quaternion; canonical data uses x,y,z,w.
    for (let j = 0; j < 3; j++) data.rotations[q + j] = (bytes[o + 29 + j]! - 128) / 128;
    data.rotations[q + 3] = (bytes[o + 28]! - 128) / 128;
  }
  return validateGaussianSplat(data, options);
}

type PlyScalar = "char" | "uchar" | "short" | "ushort" | "int" | "uint" | "float" | "double";
type PlyProperty = { readonly name: string; readonly scalar: PlyScalar } | { readonly name: string; readonly count: PlyScalar; readonly item: PlyScalar };
type PlyElement = { readonly name: string; readonly count: number; readonly properties: PlyProperty[] };
const PLY_TYPES: Readonly<Record<string, PlyScalar>> = { char: "char", int8: "char", uchar: "uchar", uint8: "uchar", short: "short", int16: "short", ushort: "ushort", uint16: "ushort", int: "int", int32: "int", uint: "uint", uint32: "uint", float: "float", float32: "float", double: "double", float64: "double" };
const PLY_SIZE: Readonly<Record<PlyScalar, number>> = { char: 1, uchar: 1, short: 2, ushort: 2, int: 4, uint: 4, float: 4, double: 8 };
class CompressedPlyUnsupportedError extends Error {
  constructor(readonly declaredCount: number) { super("compressed PLY is routed to the explicitly registered compressedPly decoder"); }
}
function plyType(name: string | undefined): PlyScalar { const t = name && PLY_TYPES[name]; if (!t) throw new Error(`unsupported PLY scalar type: ${name}`); return t; }
function plyNumber(value: number, type: PlyScalar): number {
  if (!Number.isFinite(value)) throw new Error("PLY contains a non-finite number");
  const ranges: Partial<Record<PlyScalar, readonly [number, number]>> = { char: [-128, 127], uchar: [0, 255], short: [-32768, 32767], ushort: [0, 65535], int: [-2147483648, 2147483647], uint: [0, 4294967295] };
  const range = ranges[type];
  if (range && (!Number.isInteger(value) || value < range[0] || value > range[1])) throw new RangeError("PLY integer is out of range");
  return value;
}
function parsePly(bytes: Uint8Array, options: GaussianSplatParseOptions): GaussianSplatData {
  let headerEnd = -1;
  for (let i = 0; i < Math.min(bytes.length, 1024 * 1024); i++) {
    if ((i === 0 || bytes[i - 1] === 10) && bytes[i] === 101 && decoder.decode(bytes.subarray(i, Math.min(i + 10, bytes.length))).startsWith("end_header")) {
      let j = i + 10; if (bytes[j] === 13) j++; if (bytes[j] !== 10) continue; headerEnd = j + 1; break;
    }
  }
  if (headerEnd < 0) throw new Error("PLY header is missing or exceeds 1 MiB");
  const lines = decoder.decode(bytes.subarray(0, headerEnd)).split(/\r?\n/);
  if (lines[0] !== "ply") throw new Error("invalid PLY signature");
  let format = "", version = "", current: PlyElement | undefined, totalElements = 0;
  const elements: PlyElement[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.trim().split(/\s+/); const command = parts[0];
    if (!command || command === "comment" || command === "obj_info" || command === "end_header") continue;
    if (command === "format") { if (format) throw new Error("duplicate PLY format"); format = parts[1] ?? ""; version = parts[2] ?? ""; }
    else if (command === "element") {
      const count = Number(parts[2]); if (!parts[1] || !Number.isSafeInteger(count) || count < 0 || count > limits(options).maxPoints * 8) throw new RangeError("invalid PLY element count");
      totalElements += count;
      if (elements.length >= 256 || totalElements > limits(options).maxPoints * 8) throw new RangeError("PLY element budget exceeded");
      current = { name: parts[1], count, properties: [] }; elements.push(current);
    } else if (command === "property") {
      if (!current) throw new Error("PLY property without element");
      const name = parts[1] === "list" ? parts[4] : parts[2];
      if (!name || current.properties.some((p) => p.name === name)) throw new Error("duplicate or missing PLY property name");
      if (current.properties.length >= 256) throw new RangeError("PLY property budget exceeded");
      current.properties.push(parts[1] === "list" ? { name, count: plyType(parts[2]), item: plyType(parts[3]) } : { name, scalar: plyType(parts[1]) });
    } else throw new Error(`unsupported PLY header directive ${command}`);
  }
  if (version !== "1.0" || !["ascii", "binary_little_endian", "binary_big_endian"].includes(format)) throw new Error("unsupported PLY format or version");
  if (elements.some((element) => element.count > 0 && element.properties.length === 0)) throw new Error("PLY element has no properties");
  const vertices = elements.filter((e) => e.name === "vertex");
  if (vertices.length !== 1) throw new Error("PLY must contain one vertex element");
  const vertex = vertices[0]!;
  if (vertex.properties.some((p) => "count" in p)) throw new Error("PLY splat vertices cannot contain list properties");
  const names = new Set(vertex.properties.map((p) => p.name));
  const required = ["x", "y", "z", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3", "opacity", "f_dc_0", "f_dc_1", "f_dc_2"];
  if (required.some((name) => !names.has(name)) && elements.some((element) => element.name === "chunk") && ["packed_position", "packed_rotation", "packed_scale", "packed_color"].every((name) => names.has(name))) {
    // Chunk-quantized PLY. The bundled decoder implements the exact layout
    // documented in SplatCodecs.ts; an explicitly supplied codec overrides it.
    checkAllocation(vertex.count, 0, options);
    if (options.codecs?.compressedPly) throw new CompressedPlyUnsupportedError(vertex.count);
    const decoded = decodeCompressedPly(bytes, headerEnd, format, elements, (count, degree) => allocate(count, degree, "ply", options), options.signal);
    return validateGaussianSplat({ ...decoded, metadata: { format: "ply", version, colorSpace: options.defaultColorSpace ?? "srgb_rec709_display", extras: { encoding: format, compression: "chunk-quantized" } } }, options);
  }
  for (const name of required) if (!names.has(name)) throw new Error(`missing PLY splat property ${name}`);
  const rest = [...names].filter((n) => /^f_rest_\d+$/.test(n));
  const degrees: Record<number, GaussianSplatDegree> = { 0: 0, 9: 1, 24: 2, 45: 3, 72: 4 };
  const degree = degrees[rest.length];
  if (degree === undefined || rest.some((_, i) => !names.has(`f_rest_${i}`))) throw new Error("incomplete PLY spherical-harmonic coefficients");
  const data = allocate(vertex.count, degree, "ply", options);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = headerEnd, token = 0;
  const textData = format === "ascii" ? decoder.decode(bytes.subarray(headerEnd)) : "";
  function read(type: PlyScalar): number {
    if (format === "ascii") {
      while (token < textData.length && /\s/.test(textData[token]!)) token++;
      const start = token;
      while (token < textData.length && !/\s/.test(textData[token]!)) token++;
      const text = textData.slice(start, token);
      if (!text) throw new Error("truncated PLY data");
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) throw new Error("invalid PLY number");
      return plyNumber(Number(text), type);
    }
    const size = PLY_SIZE[type]; if (offset + size > bytes.length) throw new Error("truncated PLY data");
    const little = format === "binary_little_endian"; let value: number;
    switch (type) {
      case "char": value = view.getInt8(offset); break; case "uchar": value = view.getUint8(offset); break;
      case "short": value = view.getInt16(offset, little); break; case "ushort": value = view.getUint16(offset, little); break;
      case "int": value = view.getInt32(offset, little); break; case "uint": value = view.getUint32(offset, little); break;
      case "float": value = view.getFloat32(offset, little); break; case "double": value = view.getFloat64(offset, little); break;
    }
    offset += size; return plyNumber(value, type);
  }
  for (const element of elements) for (let i = 0; i < element.count; i++) {
    if ((i & 16383) === 0) checkAbort(options.signal);
    const row: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const property of element.properties) {
      if ("scalar" in property) { const value = read(property.scalar); if (element === vertex) row[property.name] = value; }
      else { const count = read(property.count); if (!Number.isInteger(count) || count < 0 || count > limits(options).maxInputBytes) throw new RangeError("invalid PLY list count"); for (let j = 0; j < count; j++) read(property.item); }
    }
    if (element !== vertex) continue;
    const p = i * 3, q = i * 4, coeff = shSize(degree) / 3;
    for (let j = 0; j < 3; j++) {
      data.positions[p + j] = row[["x", "y", "z"][j]!]!;
      data.scales[p + j] = Math.exp(row[`scale_${j}`]!);
      data.colors[p + j] = 0.5 + C0 * row[`f_dc_${j}`]!;
      data.rotations[q + j] = row[`rot_${j + 1}`]!;
      for (let k = 0; k < coeff; k++) data.sphericalHarmonics![i * coeff * 3 + k * 3 + j] = row[`f_rest_${j * coeff + k}`]!;
    }
    data.rotations[q + 3] = row.rot_0!; data.opacities[i] = sigmoid(row.opacity!);
  }
  if (format === "ascii") { while (token < textData.length && /\s/.test(textData[token]!)) token++; }
  if (format === "ascii" ? token !== textData.length : offset !== bytes.length) throw new Error("unexpected trailing PLY data");
  return validateGaussianSplat({ ...data, metadata: { ...data.metadata, version, extras: { encoding: format } } }, options);
}

interface GltfBuffer { readonly byteLength: number; readonly uri?: string }
interface GltfView { readonly buffer: number; readonly byteOffset?: number; readonly byteLength: number; readonly byteStride?: number; readonly extensions?: Readonly<Record<string, unknown>> }
interface GltfAccessor {
  readonly bufferView?: number; readonly byteOffset?: number; readonly componentType: number; readonly count: number; readonly type: string; readonly normalized?: boolean;
  readonly sparse?: { readonly count: number; readonly indices: { readonly bufferView: number; readonly byteOffset?: number; readonly componentType: number }; readonly values: { readonly bufferView: number; readonly byteOffset?: number } };
}
interface GltfDocument {
  readonly asset?: { readonly version?: string }; readonly buffers?: GltfBuffer[]; readonly bufferViews?: GltfView[]; readonly accessors?: GltfAccessor[];
  readonly extensionsRequired?: readonly string[];
  readonly meshes?: { readonly primitives?: { readonly attributes?: Record<string, number>; readonly mode?: number; readonly material?: number; readonly targets?: readonly unknown[]; readonly extensions?: Record<string, Record<string, unknown>> }[] }[];
  readonly materials?: { readonly name?: string; readonly [key: string]: unknown }[];
  readonly nodes?: { readonly mesh?: number; readonly skin?: number; readonly weights?: readonly number[]; readonly children?: readonly number[]; readonly matrix?: readonly number[]; readonly translation?: readonly number[]; readonly rotation?: readonly number[]; readonly scale?: readonly number[]; readonly extensions?: Record<string, unknown> }[];
  readonly scenes?: { readonly nodes?: readonly number[] }[];
  readonly scene?: number;
  readonly animations?: { readonly channels?: { readonly target?: { readonly node?: number; readonly path?: string; readonly extensions?: { readonly KHR_animation_pointer?: { readonly pointer?: string } } } }[] }[];
}
function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new RangeError(`invalid glTF ${label}`);
  return value as number;
}
const GLTF_IDENTITY: SplatMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
type GltfNode = NonNullable<GltfDocument["nodes"]>[number];
type GltfSceneNode = { readonly nodeIndex: number; readonly parentIndex?: number; readonly meshIndex?: number; readonly worldMatrix: SplatMatrix };
type GltfSceneIndex = { readonly byMesh: ReadonlyMap<number, readonly GltfSceneNode[]>; readonly animatedNodes: ReadonlySet<number> };
function gltfVector(value: unknown, length: number, fallback: readonly number[], label: string): readonly number[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length !== length || value.some((n) => typeof n !== "number" || !Number.isFinite(n) || !Number.isFinite(Math.fround(n)))) throw new Error(`invalid glTF node ${label}`);
  return value as number[];
}
function gltfNodeMatrix(node: GltfNode): SplatMatrix {
  if (node.matrix !== undefined) {
    if (node.translation !== undefined || node.rotation !== undefined || node.scale !== undefined) throw new Error("glTF node cannot combine matrix and TRS");
    const matrix = gltfVector(node.matrix, 16, GLTF_IDENTITY, "matrix") as SplatMatrix;
    if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) throw new Error("glTF node matrix must be affine");
    return [...matrix] as unknown as SplatMatrix;
  }
  const t = gltfVector(node.translation, 3, [0, 0, 0], "translation");
  const s = gltfVector(node.scale, 3, [1, 1, 1], "scale");
  const r = gltfVector(node.rotation, 4, [0, 0, 0, 1], "rotation");
  const magnitude = Math.hypot(...r);
  if (!Number.isFinite(magnitude) || Math.abs(magnitude - 1) > 0.001) throw new RangeError("glTF node rotation must be a unit quaternion");
  const [x, y, z, w] = r.map((n) => n / magnitude) as [number, number, number, number];
  const [sx, sy, sz] = s as [number, number, number];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    t[0]!, t[1]!, t[2]!, 1
  ];
}
function gltfMultiply(a: SplatMatrix, b: SplatMatrix): SplatMatrix {
  const result: number[] = [];
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
    let value = 0;
    for (let k = 0; k < 4; k++) value += a[k * 4 + row]! * b[column * 4 + k]!;
    if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) throw new RangeError("glTF world transform exceeds float32 range");
    result.push(value);
  }
  return result as unknown as SplatMatrix;
}
/** Resolve the selected scene iteratively so an untrusted hierarchy cannot overflow the call stack. */
function gltfSceneNodes(doc: GltfDocument, options: GaussianSplatParseOptions): GltfSceneNode[] | undefined {
  if (doc.nodes !== undefined && !Array.isArray(doc.nodes)) throw new Error("invalid glTF nodes");
  if (doc.scenes !== undefined && !Array.isArray(doc.scenes)) throw new Error("invalid glTF scenes");
  const nodes = doc.nodes ?? [];
  if (!doc.scenes && nodes.length === 0) {
    if (options.gltfScene !== undefined || doc.scene !== undefined) throw new Error("glTF scene is missing");
    return undefined;
  }
  // Matrix/stack/visited storage must remain bounded independently of vertex
  // count, even for a file with a single splat and many scene nodes.
  const nodeBudget = Math.min(100_000, Math.floor(limits(options).maxDecodedBytes / 256));
  if (nodes.length > nodeBudget) throw new RangeError("glTF scene node budget exceeded");
  let roots: readonly number[];
  if (doc.scenes) {
    const sceneIndex = integer(options.gltfScene ?? doc.scene ?? 0, "scene index");
    const scene = doc.scenes[sceneIndex];
    if (!scene || (scene.nodes !== undefined && !Array.isArray(scene.nodes))) throw new Error("invalid glTF scene");
    roots = scene.nodes ?? [];
  } else {
    if (options.gltfScene !== undefined || doc.scene !== undefined) throw new Error("glTF scene is missing");
    // Scene-less glTF can be used as a library. Traverse its parentless nodes
    // so authored transforms are not silently discarded.
    const hasParent = new Set<number>();
    for (const node of nodes) {
      if (!node || typeof node !== "object" || (node.children !== undefined && !Array.isArray(node.children))) throw new Error("invalid glTF node");
      for (const child of node.children ?? []) {
        const index = integer(child, "child node index");
        if (!nodes[index] || hasParent.has(index)) throw new Error("invalid or multiply parented glTF node");
        hasParent.add(index);
      }
    }
    roots = nodes.map((_, index) => index).filter((index) => !hasParent.has(index));
    if (nodes.length && !roots.length) throw new Error("glTF node hierarchy contains a cycle");
  }
  const stack: { index: number; parent: SplatMatrix; parentIndex?: number }[] = [], scheduled = new Set<number>();
  if (roots.length > nodes.length) throw new Error("invalid glTF scene root nodes");
  function enqueue(index: number, parent: SplatMatrix, parentIndex?: number): void {
    if (!nodes[index]) throw new Error("invalid glTF node index");
    if (scheduled.has(index)) throw new Error("glTF node hierarchy contains a cycle or multiple parents");
    scheduled.add(index); stack.push({ index, parent, ...(parentIndex !== undefined ? { parentIndex } : {}) });
  }
  for (let i = roots.length - 1; i >= 0; i--) enqueue(integer(roots[i], "root node index"), GLTF_IDENTITY);
  const visited = new Set<number>(), result: GltfSceneNode[] = [];
  while (stack.length) {
    checkAbort(options.signal);
    const { index, parent, parentIndex } = stack.pop()!, node = nodes[index];
    if (!node || typeof node !== "object") throw new Error("invalid glTF node index");
    if (visited.has(index)) throw new Error("glTF node hierarchy contains a cycle or multiple parents");
    visited.add(index);
    const worldMatrix = gltfMultiply(parent, gltfNodeMatrix(node));
    const meshIndex = node.mesh === undefined ? undefined : integer(node.mesh, "mesh index");
    if (meshIndex !== undefined && !doc.meshes?.[meshIndex]) throw new Error("invalid glTF node mesh index");
    result.push({ nodeIndex: index, ...(parentIndex !== undefined ? { parentIndex } : {}), ...(meshIndex !== undefined ? { meshIndex } : {}), worldMatrix });
    if (node.children !== undefined && !Array.isArray(node.children)) throw new Error("invalid glTF node children");
    if ((node.children?.length ?? 0) > nodes.length) throw new Error("invalid glTF node children");
    for (let i = (node.children?.length ?? 0) - 1; i >= 0; i--) enqueue(integer(node.children![i], "child node index"), worldMatrix, index);
  }
  if (!doc.scenes && visited.size !== nodes.length) throw new Error("glTF node hierarchy contains a cycle");
  return result;
}
function gltfIndexScene(doc: GltfDocument, nodes: readonly GltfSceneNode[] | undefined): GltfSceneIndex | undefined {
  if (!nodes) return undefined;
  if (doc.animations !== undefined && !Array.isArray(doc.animations)) throw new Error("invalid glTF animations");
  const animatedTransforms = new Set<number>(), animatedWeights = new Set<number>();
  for (const animation of doc.animations ?? []) {
    if (!animation || !Array.isArray(animation.channels)) throw new Error("invalid glTF animation channels");
    for (const channel of animation.channels) {
      const target = channel?.target;
      let node = target?.node, path = target?.path;
      if (path === "pointer") {
        const pointer = target?.extensions?.KHR_animation_pointer?.pointer;
        if (typeof pointer !== "string") throw new Error("invalid glTF animation pointer");
        const match = /^\/nodes\/(\d+)\/(translation|rotation|scale|weights)(?:\/\d+)?$/.exec(pointer);
        if (match) { node = Number(match[1]); path = match[2]; }
      }
      if (node === undefined) continue;
      if (["translation", "rotation", "scale"].includes(path ?? "")) animatedTransforms.add(integer(node, "animation node index"));
      else if (path === "weights") animatedWeights.add(integer(node, "animation node index"));
    }
  }
  const byMesh = new Map<number, GltfSceneNode[]>(), animatedNodes = new Set<number>(), transformedNodes = new Set<number>();
  // Parents precede children in the traversal, so animated ancestry and mesh
  // groups are indexed once even for a scene with many independent clouds.
  for (const node of nodes) {
    if (animatedTransforms.has(node.nodeIndex) || (node.parentIndex !== undefined && transformedNodes.has(node.parentIndex))) transformedNodes.add(node.nodeIndex);
    if (transformedNodes.has(node.nodeIndex) || animatedWeights.has(node.nodeIndex)) animatedNodes.add(node.nodeIndex);
    if (node.meshIndex !== undefined) {
      const group = byMesh.get(node.meshIndex);
      if (group) group.push(node); else byMesh.set(node.meshIndex, [node]);
    }
  }
  return { byMesh, animatedNodes };
}
function gltfAttachInstances(data: GaussianSplatData, doc: GltfDocument, buffers: readonly Uint8Array[], sceneIndex: GltfSceneIndex | undefined, meshIndex: number, options: GaussianSplatParseOptions): GaussianSplatData {
  if (!sceneIndex) return data;
  const matched = sceneIndex.byMesh.get(meshIndex) ?? [];
  for (const node of matched) {
    if (doc.nodes![node.nodeIndex]!.skin !== undefined || doc.nodes![node.nodeIndex]!.weights !== undefined) throw new Error("skinned or morphed glTF splat nodes are unsupported");
    if (sceneIndex.animatedNodes.has(node.nodeIndex)) throw new Error("animated glTF splat transforms are unsupported");
  }
  const budget = limits(options), baseBytes = data.count * (14 + shSize(data.shDegree)) * 4;
  const instances: { nodeIndex: number; instanceIndex?: number; worldMatrix: SplatMatrix }[] = [];
  function checkInstanceBudget(count: number, temporaryBytes = 0): void {
    if (count * data.count > budget.maxPoints) throw new RangeError("glTF splat instances exceed point limit");
    if (baseBytes + count * 128 + temporaryBytes > budget.maxDecodedBytes) throw new RangeError("glTF splat instances exceed decoded byte limit");
  }
  for (const { nodeIndex, worldMatrix } of matched) {
    checkAbort(options.signal);
    const extension = doc.nodes![nodeIndex]!.extensions?.EXT_mesh_gpu_instancing;
    if (extension === undefined) {
      checkInstanceBudget(instances.length + 1); instances.push({ nodeIndex, worldMatrix }); continue;
    }
    if (!extension || typeof extension !== "object" || Array.isArray(extension)) throw new Error("invalid glTF GPU instancing extension");
    const attrs = (extension as { readonly attributes?: unknown }).attributes;
    if (!attrs || typeof attrs !== "object" || Array.isArray(attrs) || !Object.keys(attrs).length) throw new Error("invalid glTF GPU instance attributes");
    const attributes = attrs as Record<string, unknown>; let count: number | undefined;
    for (const [semantic, index] of Object.entries(attributes)) {
      if (!["TRANSLATION", "ROTATION", "SCALE"].includes(semantic) && !semantic.startsWith("_")) throw new Error(`unsupported glTF GPU instance attribute ${semantic}`);
      const accessor = doc.accessors?.[integer(index, "GPU instance accessor index")];
      if (!accessor) throw new Error("missing glTF GPU instance accessor");
      const n = integer(accessor.count, "GPU instance count", 1);
      if (count !== undefined && count !== n) throw new Error("glTF GPU instance accessor count mismatch");
      count = n;
      if ((semantic === "TRANSLATION" || semantic === "SCALE") && (accessor.componentType !== 5126 || accessor.normalized)) throw new Error(`invalid glTF GPU instance ${semantic} component`);
      if (semantic === "ROTATION" && !(accessor.componentType === 5126 && !accessor.normalized || [5120, 5122].includes(accessor.componentType) && accessor.normalized)) throw new Error("invalid glTF GPU instance rotation component");
    }
    checkInstanceBudget(instances.length + count!, count! * 40);
    const read = (name: string, width: number) => attributes[name] === undefined ? undefined : readAccessor(doc, buffers, integer(attributes[name], "GPU instance accessor index"), width, count, `EXT_mesh_gpu_instancing:${name}`);
    const translations = read("TRANSLATION", 3), rotations = read("ROTATION", 4), scales = read("SCALE", 3);
    const rotationAccessor = rotations && doc.accessors![integer(attributes.ROTATION, "GPU instance rotation accessor index")]!;
    for (let i = 0; i < count!; i++) {
      if ((i & 16383) === 0) checkAbort(options.signal);
      const translation = translations ? Array.from(translations.subarray(i * 3, i * 3 + 3)) : undefined;
      const scale = scales ? Array.from(scales.subarray(i * 3, i * 3 + 3)) : undefined;
      let rotation = rotations ? Array.from(rotations.subarray(i * 4, i * 4 + 4)) : undefined;
      if (rotation) {
        const magnitude = Math.hypot(...rotation), tolerance = rotationAccessor?.componentType === 5120 ? 0.02 : 0.001;
        if (!Number.isFinite(magnitude) || Math.abs(magnitude - 1) > tolerance) throw new RangeError("glTF GPU instance rotation must be a unit quaternion");
        rotation = rotation.map((value) => value / magnitude);
      }
      const matrix = gltfMultiply(worldMatrix, gltfNodeMatrix({ translation, rotation, scale }));
      instances.push({ nodeIndex, instanceIndex: i, worldMatrix: matrix });
    }
  }
  if (!instances.length) return { ...data, instances };
  const center = data.bounds.min.map((value, axis) => (value + data.bounds.max[axis]!) / 2);
  const extent = data.bounds.min.map((value, axis) => (data.bounds.max[axis]! - value) / 2);
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const { worldMatrix: matrix } of instances) for (let axis = 0; axis < 3; axis++) {
    const middle = matrix[12 + axis]! + matrix[axis]! * center[0]! + matrix[4 + axis]! * center[1]! + matrix[8 + axis]! * center[2]!;
    const radius = Math.abs(matrix[axis]!) * extent[0]! + Math.abs(matrix[4 + axis]!) * extent[1]! + Math.abs(matrix[8 + axis]!) * extent[2]!;
    if (!Number.isFinite(middle - radius) || !Number.isFinite(middle + radius)) throw new RangeError("glTF scene bounds exceed numeric range");
    min[axis] = Math.min(min[axis]!, middle - radius); max[axis] = Math.max(max[axis]!, middle + radius);
  }
  return { ...data, instances, sceneBounds: { min, max } };
}
function dataUri(uri: string): Uint8Array {
  const comma = uri.indexOf(","); if (comma < 0) throw new Error("invalid glTF data URI");
  const payload = uri.slice(comma + 1);
  try {
    if (uri.slice(0, comma).endsWith(";base64")) {
      const decoded = atob(decodeURIComponent(payload));
      return Uint8Array.from(decoded, (c) => c.charCodeAt(0));
    }
    // Percent escapes represent binary octets, not necessarily valid UTF-8 characters.
    const output: number[] = [];
    for (let i = 0; i < payload.length;) {
      if (payload[i] === "%") {
        const hex = payload.slice(i + 1, i + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) throw new Error("bad escape");
        output.push(Number.parseInt(hex, 16)); i += 3;
      } else {
        const point = payload.codePointAt(i)!;
        const chars = String.fromCodePoint(point);
        output.push(...new TextEncoder().encode(chars)); i += chars.length;
      }
    }
    return Uint8Array.from(output);
  } catch { throw new Error("invalid glTF data URI encoding"); }
}
function unpackGlb(bytes: Uint8Array): { json: GltfDocument; binary?: Uint8Array } {
  if (bytes.length < 20) throw new Error("truncated GLB header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) throw new Error("invalid GLB header");
  let offset = 12, json: GltfDocument | undefined, binary: Uint8Array | undefined, chunkIndex = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error("truncated GLB chunk header");
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true); offset += 8;
    if (length % 4 || offset + length > bytes.length) throw new Error("invalid GLB chunk size");
    if (type === 0x4e4f534a) {
      if (chunkIndex !== 0 || json) throw new Error("GLB JSON chunk must occur first and once");
      json = JSON.parse(decoder.decode(bytes.subarray(offset, offset + length)).replace(/\u0000+$/, "")) as GltfDocument;
    } else if (type === 0x004e4942) {
      if (binary) throw new Error("duplicate GLB BIN chunk"); binary = bytes.subarray(offset, offset + length);
    }
    offset += length; chunkIndex++;
  }
  if (!json) throw new Error("GLB JSON chunk is missing");
  return { json, ...(binary ? { binary } : {}) };
}
const GLTF_COMPONENT: Readonly<Record<number, { readonly size: number; readonly signed: boolean; readonly floating: boolean }>> = {
  5120: { size: 1, signed: true, floating: false }, 5121: { size: 1, signed: false, floating: false },
  5122: { size: 2, signed: true, floating: false }, 5123: { size: 2, signed: false, floating: false },
  5125: { size: 4, signed: false, floating: false }, 5126: { size: 4, signed: true, floating: true }
};
function readComponent(view: DataView, offset: number, component: number, normalized: boolean): number {
  let x: number;
  switch (component) {
    case 5120: x = view.getInt8(offset); return normalized ? Math.max(-1, x / 127) : x;
    case 5121: x = view.getUint8(offset); return normalized ? x / 255 : x;
    case 5122: x = view.getInt16(offset, true); return normalized ? Math.max(-1, x / 32767) : x;
    case 5123: x = view.getUint16(offset, true); return normalized ? x / 65535 : x;
    case 5125: x = view.getUint32(offset, true); return normalized ? x / 4294967295 : x;
    case 5126: return view.getFloat32(offset, true);
    default: throw new Error("unsupported glTF accessor component type");
  }
}
function readAccessor(doc: GltfDocument, buffers: readonly Uint8Array[], accessorIndex: number, width: number, expectedCount: number | undefined, semantic: string): Float32Array {
  const accessor = doc.accessors?.[integer(accessorIndex, "accessor index")];
  if (!accessor) throw new Error(`missing glTF accessor for ${semantic}`);
  const component = GLTF_COMPONENT[accessor.componentType];
  if (!component || accessor.type !== (width === 1 ? "SCALAR" : `VEC${width}`)) throw new Error(`invalid glTF accessor type for ${semantic}`);
  const count = integer(accessor.count, "accessor count", 1);
  if (expectedCount !== undefined && count !== expectedCount) throw new Error(`glTF ${semantic} count mismatch`);
  if (accessor.componentType === 5126 && accessor.normalized) throw new Error(`glTF ${semantic} float accessor cannot be normalized`);
  // glTF 2.0 requires float positions unless KHR_mesh_quantization is required.
  // The quantized values remain in mesh-local space; the owning node's glTF
  // transform is responsible for any further dequantization.
  if (semantic === "POSITION" && accessor.componentType !== 5126 &&
      !(doc.extensionsRequired?.includes("KHR_mesh_quantization") && [5120, 5121, 5122, 5123].includes(accessor.componentType))) throw new Error("invalid glTF position component");
  if (semantic.startsWith("KHR_gaussian_splatting:SH_") && accessor.componentType !== 5126) throw new Error("glTF SH coefficients must be float32");
  if (semantic.endsWith(":ROTATION") && !([5120, 5122].includes(accessor.componentType) && accessor.normalized || accessor.componentType === 5126)) throw new Error("invalid glTF rotation component");
  if (semantic.endsWith(":SCALE") && ![5121, 5123, 5126].includes(accessor.componentType)) throw new Error("invalid glTF scale component");
  if (semantic.endsWith(":OPACITY") && !([5121, 5123].includes(accessor.componentType) && accessor.normalized || accessor.componentType === 5126)) throw new Error("invalid glTF opacity component");
  const result = new Float32Array(count * width);
  function viewRange(index: number, relativeOffset: number, size: number): { view: DataView; offset: number; stride?: number } {
    const descriptor = doc.bufferViews?.[integer(index, "bufferView index")]; if (!descriptor) throw new Error("missing glTF bufferView");
    if (descriptor.extensions?.EXT_meshopt_compression !== undefined || descriptor.extensions?.KHR_meshopt_compression !== undefined) throw new Error("meshopt-compressed glTF splat bufferViews are unsupported");
    const bytes = buffers[integer(descriptor.buffer, "buffer index")]; if (!bytes) throw new Error("missing glTF buffer");
    const base = integer(descriptor.byteOffset ?? 0, "bufferView offset"), length = integer(descriptor.byteLength, "bufferView length");
    const relative = integer(relativeOffset, "accessor offset");
    if (base + length > bytes.length || relative + size > length) throw new RangeError("glTF accessor exceeds its bufferView");
    return { view: new DataView(bytes.buffer, bytes.byteOffset + base, length), offset: relative, stride: descriptor.byteStride };
  }
  const elementSize = component.size * width, offset = integer(accessor.byteOffset ?? 0, "accessor offset");
  if (offset % component.size) throw new Error("misaligned glTF accessor");
  if (accessor.bufferView !== undefined) {
    const span = viewRange(accessor.bufferView, offset, elementSize);
    const stride = span.stride === undefined ? elementSize : integer(span.stride, "byteStride", elementSize);
    if (stride % component.size || stride > 252 || offset + (count - 1) * stride + elementSize > span.view.byteLength) throw new RangeError("invalid glTF accessor stride or bounds");
    for (let i = 0; i < count; i++) for (let j = 0; j < width; j++) result[i * width + j] = readComponent(span.view, offset + i * stride + j * component.size, accessor.componentType, !!accessor.normalized);
  } else if (!accessor.sparse || offset !== 0) throw new Error("glTF accessor has neither a buffer view nor sparse values");
  if (accessor.sparse) {
    const sparse = accessor.sparse, n = integer(sparse.count, "sparse count", 1);
    if (n > count || ![5121, 5123, 5125].includes(sparse.indices.componentType)) throw new Error("invalid glTF sparse indices");
    const indexSize = GLTF_COMPONENT[sparse.indices.componentType]!.size;
    const indices = viewRange(sparse.indices.bufferView, sparse.indices.byteOffset ?? 0, n * indexSize);
    const values = viewRange(sparse.values.bufferView, sparse.values.byteOffset ?? 0, n * elementSize);
    if (indices.stride !== undefined || values.stride !== undefined || indices.offset % indexSize || values.offset % component.size) throw new Error("invalid glTF sparse buffer view");
    let previous = -1;
    for (let i = 0; i < n; i++) {
      const index = readComponent(indices.view, indices.offset + i * indexSize, sparse.indices.componentType, false);
      if (index <= previous || index >= count) throw new RangeError("glTF sparse indices must be increasing and in range"); previous = index;
      for (let j = 0; j < width; j++) result[index * width + j] = readComponent(values.view, values.offset + (i * width + j) * component.size, accessor.componentType, !!accessor.normalized);
    }
  }
  return result;
}
async function parseGltf(bytes: Uint8Array, format: "gltf" | "glb", options: GaussianSplatParseOptions): Promise<GaussianSplatData> {
  const parsed = format === "glb" ? unpackGlb(bytes) : { json: JSON.parse(decoder.decode(bytes)) as GltfDocument, binary: undefined };
  const doc = parsed.json;
  if (doc.asset?.version !== "2.0") throw new Error("glTF splats require glTF 2.0");
  const sceneNodes = gltfSceneNodes(doc, options);
  const sceneIndex = gltfIndexScene(doc, sceneNodes);
  const selections: { meshIndex: number; primitiveIndex: number }[] = [];
  const explicitPrimitive = options.gltfMesh !== undefined || options.gltfPrimitive !== undefined;
  if (explicitPrimitive) {
    const meshIndex = integer(options.gltfMesh ?? 0, "mesh index"), primitiveIndex = integer(options.gltfPrimitive ?? 0, "primitive index");
    if (!doc.meshes?.[meshIndex]?.primitives?.[primitiveIndex]?.extensions?.KHR_gaussian_splatting) throw new Error("glTF KHR_gaussian_splatting primitive not found");
    selections.push({ meshIndex, primitiveIndex });
  } else {
    const candidates = sceneNodes ? sceneNodes.flatMap((node) => node.meshIndex === undefined ? [] : [node.meshIndex]) : (doc.meshes ?? []).map((_, index) => index);
    const visitedMeshes = new Set<number>(), budget = limits(options);
    const maxClouds = Math.min(100_000, budget.maxPoints, Math.floor(budget.maxDecodedBytes / 56));
    for (const meshIndex of candidates) {
      if (visitedMeshes.has(meshIndex)) continue;
      visitedMeshes.add(meshIndex);
      for (const [primitiveIndex, primitive] of (doc.meshes![meshIndex]!.primitives ?? []).entries()) {
        if (primitive.extensions?.KHR_gaussian_splatting === undefined) continue;
        if (selections.length >= maxClouds) throw new RangeError("glTF splat cloud budget exceeded");
        selections.push({ meshIndex, primitiveIndex });
      }
    }
  }
  if (!selections.length) throw new Error("glTF KHR_gaussian_splatting primitive not found");
  const buffers: Uint8Array[] = []; let total = bytes.byteLength;
  for (let i = 0; i < (doc.buffers?.length ?? 0); i++) {
    checkAbort(options.signal);
    const descriptor = doc.buffers![i]!; const expected = integer(descriptor.byteLength, "buffer length");
    let buffer: Uint8Array;
    if (descriptor.uri?.startsWith("data:")) {
      buffer = dataUri(descriptor.uri);
      await options.verifyInlineUri?.(descriptor.uri, buffer);
    }
    else if (descriptor.uri) { if (!options.resolveUri) throw new Error(`glTF external buffer requires resolveUri: ${redactAssetUrl(descriptor.uri)}`); buffer = asBytes(await options.resolveUri(descriptor.uri, options.signal)); total += buffer.length; }
    else if (i === 0 && parsed.binary) buffer = parsed.binary;
    else throw new Error("missing glTF buffer data");
    if (buffer.length < expected || total > limits(options).maxInputBytes) throw new RangeError("glTF buffer truncated or input byte limit exceeded");
    buffers.push(buffer.subarray(0, expected));
  }
  const budget = limits(options), clouds: GaussianSplatData[] = [];
  let usedPoints = 0, usedBytes = 0;
  for (const { meshIndex, primitiveIndex } of selections) {
    checkAbort(options.signal);
    const maxPoints = budget.maxPoints - usedPoints, maxDecodedBytes = budget.maxDecodedBytes - usedBytes;
    if (maxPoints < 1 || maxDecodedBytes < 1) throw new RangeError("glTF aggregate splat budget exceeded");
    const cloud = await parseGltfPrimitive(doc, buffers, sceneIndex, meshIndex, primitiveIndex, format, { ...options, maxPoints, maxDecodedBytes });
    const instanceCount = cloud.instances?.length ?? 1;
    usedPoints += cloud.count * Math.max(1, instanceCount);
    usedBytes += cloud.count * (14 + shSize(cloud.shDegree)) * 4 + (cloud.instances?.length ?? 0) * 128;
    clouds.push(cloud);
  }
  const primary = clouds[0]!, visibleBounds = clouds.flatMap((cloud) => cloud.instances?.length === 0 ? [] : [cloud.sceneBounds ?? cloud.bounds]);
  let assetBounds: SplatBounds | undefined;
  if (visibleBounds.length) {
    const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const bounds of visibleBounds) for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis]!, bounds.min[axis]!); max[axis] = Math.max(max[axis]!, bounds.max[axis]!); }
    assetBounds = { min, max };
  }
  return { ...primary, ...(clouds.length > 1 ? { additionalClouds: clouds.slice(1) } : {}), ...(assetBounds ? { assetBounds } : {}) };
}

async function parseGltfPrimitive(doc: GltfDocument, buffers: readonly Uint8Array[], sceneIndex: GltfSceneIndex | undefined, meshIndex: number, primitiveIndex: number, format: "gltf" | "glb", options: GaussianSplatParseOptions): Promise<GaussianSplatData> {
  const selected = doc.meshes?.[meshIndex]?.primitives?.[primitiveIndex];
  const ext = selected?.extensions?.KHR_gaussian_splatting;
  if (!selected || !ext) throw new Error("glTF KHR_gaussian_splatting primitive not found");
  if (selected.targets?.length) throw new Error("glTF splat morph targets are unsupported");
  if (selected.extensions?.KHR_draco_mesh_compression !== undefined) throw new Error("Draco-compressed glTF splat primitives are unsupported");
  const materialIndex = selected.material === undefined ? undefined : integer(selected.material, "material index");
  const material = materialIndex === undefined ? undefined : doc.materials?.[materialIndex];
  if (materialIndex !== undefined && (!material || typeof material !== "object" || Array.isArray(material) || (material.name !== undefined && typeof material.name !== "string"))) throw new Error("invalid glTF splat material index");
  // The KHR ellipse kernel ignores the material for splat shading, but retain
  // its identity for fallback/inspection and keep color space on each cloud.
  const primitiveMetadata = { meshIndex, primitiveIndex, ...(materialIndex !== undefined ? { materialIndex, sourceMaterial: material } : {}), ...(material?.name !== undefined ? { materialName: material.name } : {}) };
  // This separately proposed extension is still a draft, so expose it only
  // when explicitly named in the primitive, never by guessing from a buffer.
  // https://github.com/KhronosGroup/glTF/pull/2531
  const extensionContainer = ext.extensions;
  if (extensionContainer !== undefined && (!extensionContainer || typeof extensionContainer !== "object" || Array.isArray(extensionContainer))) throw new Error("invalid glTF splat extensions");
  const compressedExtension = (extensionContainer as Record<string, unknown> | undefined)?.KHR_gaussian_splatting_compression_spz_2;
  const compressed = compressedExtension !== undefined;
  if (compressed && (!compressedExtension || typeof compressedExtension !== "object" || Array.isArray(compressedExtension))) throw new Error("invalid glTF SPZ compression extension");
  // Earlier versions of the draft base extension had no kernel or colorSpace
  // properties. Do not apply these defaults to the ratified uncompressed form.
  const kernel = ext.kernel ?? (compressed ? "ellipse" : undefined);
  if (selected.mode !== 0 || kernel !== "ellipse" || (ext.projection !== undefined && ext.projection !== "perspective") || (ext.sortingMethod !== undefined && ext.sortingMethod !== "cameraDistance")) throw new Error("unsupported glTF Gaussian splat primitive options");
  const colorSpace = ext.colorSpace ?? (compressed ? options.defaultColorSpace ?? "srgb_rec709_display" : undefined);
  if (colorSpace !== "srgb_rec709_display" && colorSpace !== "lin_rec709_display") throw new Error("unsupported glTF splat color space");
  const attrs = selected.attributes ?? {};
  const prefix = "KHR_gaussian_splatting:";
  for (const name of Object.keys(attrs)) {
    if (!name.startsWith(`${prefix}SH_DEGREE_`)) continue;
    const match = /^KHR_gaussian_splatting:SH_DEGREE_(\d+)_COEF_(\d+)$/.exec(name);
    if (!match || Number(match[1]) > 3 || Number(match[2]) > Number(match[1]) * 2) throw new Error(`invalid glTF spherical-harmonic semantic ${name}`);
  }
  const required = ["POSITION", `${prefix}ROTATION`, `${prefix}SCALE`];
  // The draft maps both color and opacity to COLOR_0. Also accept the current
  // ratified base extension's separate opacity and degree-zero attributes.
  if (compressed && attrs.COLOR_0 !== undefined) required.push("COLOR_0");
  else required.push(`${prefix}OPACITY`, `${prefix}SH_DEGREE_0_COEF_0`);
  for (const name of required) if (!Number.isSafeInteger(attrs[name])) throw new Error(`missing glTF splat attribute ${name}`);
  const count = integer(doc.accessors?.[attrs.POSITION!]?.count, "position count", 1);
  let degree: GaussianSplatDegree = 0;
  for (let d = 1; d <= 3; d++) {
    let present = 0;
    for (let j = 0; j < 2 * d + 1; j++) if (attrs[`${prefix}SH_DEGREE_${d}_COEF_${j}`] !== undefined) present++;
    if (present && (present !== 2 * d + 1 || degree !== d - 1)) throw new Error("glTF spherical-harmonic degree is incomplete");
    if (present) degree = d as GaussianSplatDegree;
  }
  checkAllocation(count, degree, options);
  if (compressed) {
    const descriptor = compressedExtension as { readonly bufferView?: unknown };
    const bufferView = doc.bufferViews?.[integer(descriptor.bufferView, "SPZ bufferView index")];
    if (!bufferView || bufferView.byteStride !== undefined) throw new Error("invalid glTF SPZ bufferView");
    if (bufferView.extensions?.EXT_meshopt_compression !== undefined || bufferView.extensions?.KHR_meshopt_compression !== undefined) throw new Error("meshopt-compressed glTF splat bufferViews are unsupported");
    const buffer = buffers[integer(bufferView.buffer, "SPZ buffer index")];
    if (!buffer) throw new Error("missing glTF SPZ buffer");
    const offset = integer(bufferView.byteOffset ?? 0, "SPZ bufferView offset");
    const length = integer(bufferView.byteLength, "SPZ bufferView length", 1);
    if (offset + length > buffer.byteLength) throw new RangeError("glTF SPZ bufferView exceeds its buffer");
    // Placeholder accessors define the decoded type and count even when they
    // have no bufferView. Fallback data, if present, does not override SPZ.
    for (const [semantic, index] of Object.entries(attrs)) {
      if (semantic !== "POSITION" && semantic !== "COLOR_0" && !semantic.startsWith(prefix)) continue;
      const accessor = doc.accessors?.[integer(index, `${semantic} accessor index`)];
      if (!accessor || accessor.count !== count) throw new Error(`glTF ${semantic} count mismatch`);
      let types: readonly string[] = ["VEC3"];
      if (semantic === "COLOR_0") types = ["VEC4"];
      else if (semantic === `${prefix}ROTATION`) types = ["VEC4"];
      else if (semantic === `${prefix}OPACITY`) types = ["SCALAR"];
      if (!types.includes(accessor.type)) throw new Error(`invalid glTF accessor type for ${semantic}`);
      if (accessor.componentType === 5126 && accessor.normalized) throw new Error(`glTF ${semantic} float accessor cannot be normalized`);
      if (semantic === "POSITION" && accessor.componentType !== 5126) throw new Error("invalid glTF SPZ position component");
      if (semantic.startsWith(`${prefix}SH_`) && accessor.componentType !== 5126) throw new Error("glTF SH coefficients must be float32");
      if (semantic === `${prefix}ROTATION` && !(accessor.componentType === 5126 || ([5120, 5122].includes(accessor.componentType) && accessor.normalized))) throw new Error("invalid glTF rotation component");
      if (semantic === `${prefix}SCALE` && ![5121, 5123, 5126].includes(accessor.componentType)) throw new Error("invalid glTF scale component");
      if ((semantic === `${prefix}OPACITY` || semantic === "COLOR_0") && !(accessor.componentType === 5126 || ([5121, 5123].includes(accessor.componentType) && accessor.normalized))) throw new Error(`invalid glTF ${semantic} component`);
    }
    const decoded = await parseSpz(buffer.subarray(offset, offset + length), { ...options, defaultColorSpace: colorSpace });
    if (decoded.metadata.version !== "2") throw new Error("glTF SPZ compression requires SPZ version 2");
    if (decoded.count !== count || decoded.shDegree !== degree) throw new Error("glTF SPZ accessor count or spherical-harmonic degree mismatch");
    const spzCoordinateSystem = decoded.metadata.coordinateSystem;
    if (spzCoordinateSystem !== "RUB" && spzCoordinateSystem !== "LUF") throw new Error(`unsupported glTF SPZ coordinate system: ${spzCoordinateSystem}`);
    if (spzCoordinateSystem === "RUB") {
      // SPZ's wire convention is RUB, whereas glTF's local coordinates are
      // LUF. This is a 180-degree basis rotation about Y. The SH coefficients
      // are changed in the same basis as the centers and quaternion axes.
      const perSplat = shSize(decoded.shDegree);
      for (let i = 0; i < decoded.count; i++) {
        if ((i & 16383) === 0) checkAbort(options.signal);
        decoded.positions[i * 3] *= -1; decoded.positions[i * 3 + 2] *= -1;
        decoded.rotations[i * 4] *= -1; decoded.rotations[i * 4 + 2] *= -1;
        let coefficient = 0;
        for (let l = 1; l <= decoded.shDegree; l++) for (let m = -l; m <= l; m++, coefficient++) {
          // For (x,y,z) -> (-x,y,-z), the real SH sine terms (m<0)
          // have parity (-1)^(l+1), while m>=0 has parity (-1)^l.
          if ((l + (m < 0 ? 1 : 0)) % 2) {
            const offset = i * perSplat + coefficient * 3;
            for (let c = 0; c < 3; c++) decoded.sphericalHarmonics![offset + c] *= -1;
          }
        }
      }
    }
    const result = validateGaussianSplat({ ...decoded, metadata: { format, version: "2.0", colorSpace, coordinateSystem: "LUF", extras: { ...decoded.metadata.extras, ...primitiveMetadata, compression: "KHR_gaussian_splatting_compression_spz_2", spzVersion: "2", spzCoordinateSystem, colorSpaceSpecified: ext.colorSpace !== undefined } } }, options);
    return gltfAttachInstances(result, doc, buffers, sceneIndex, meshIndex, options);
  }
  const data = allocate(count, degree, format, options, colorSpace);
  const read = (name: string, width: number) => readAccessor(doc, buffers, attrs[name]!, width, count, name);
  data.positions.set(read("POSITION", 3)); data.scales.set(read(`${prefix}SCALE`, 3)); data.rotations.set(read(`${prefix}ROTATION`, 4)); data.opacities.set(read(`${prefix}OPACITY`, 1));
  const rotationAccessor = doc.accessors![attrs[`${prefix}ROTATION`]!]!;
  const tolerance = rotationAccessor.componentType === 5120 ? 0.02 : 0.001;
  for (let i = 0; i < count; i++) {
    const j = i * 4, norm = Math.hypot(data.rotations[j]!, data.rotations[j + 1]!, data.rotations[j + 2]!, data.rotations[j + 3]!);
    if (!Number.isFinite(norm) || Math.abs(norm - 1) > tolerance) throw new RangeError("glTF splat rotations must be unit quaternions");
  }
  const dc = read(`${prefix}SH_DEGREE_0_COEF_0`, 3);
  for (let i = 0; i < dc.length; i++) data.colors[i] = 0.5 + C0 * dc[i]!;
  let coef = 0;
  for (let d = 1; d <= degree; d++) for (let j = 0; j < 2 * d + 1; j++, coef++) {
    const values = read(`${prefix}SH_DEGREE_${d}_COEF_${j}`, 3);
    for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) data.sphericalHarmonics![i * shSize(degree) + coef * 3 + c] = values[i * 3 + c]!;
  }
  const result = validateGaussianSplat({ ...data, metadata: { ...data.metadata, version: "2.0", coordinateSystem: "LUF", extras: primitiveMetadata } }, options);
  return gltfAttachInstances(result, doc, buffers, sceneIndex, meshIndex, options);
}

async function decodeSplatWithCodec(bytes: Uint8Array, format: "spz" | "ksplat" | "compressedPly", options: GaussianSplatParseOptions): Promise<GaussianSplatData> {
  const codec = options.codecs?.[format];
  if (!codec) throw new Error(`${format.toUpperCase()} requires an explicitly registered decoder`);
  const result = await codec(bytes, options); checkAbort(options.signal);
  if (result.metadata?.format !== (format === "compressedPly" ? "ply" : format)) throw new Error("splat codec returned mismatched format metadata");
  if (result.instances !== undefined || result.sceneBounds !== undefined || result.additionalClouds !== undefined || result.assetBounds !== undefined) throw new Error("splat codec must return a single uninstanced cloud");
  if (![0, 1, 2, 3, 4].includes(result.shDegree)) throw new RangeError("invalid spherical-harmonic degree");
  checkAllocation(result.count, result.shDegree, options);
  const codecArrays: readonly [Float32Array | undefined, number][] = [
    [result.positions, result.count * 3], [result.scales, result.count * 3], [result.rotations, result.count * 4],
    [result.colors, result.count * 3], [result.opacities, result.count], [result.sphericalHarmonics, result.count * shSize(result.shDegree)]
  ];
  for (const [array, expected] of codecArrays) {
    if (expected === 0 && array === undefined) continue;
    if (!(array instanceof Float32Array) || array.length !== expected) throw new TypeError("splat codec returned an invalid array");
  }
  // Copy third-party arrays before normalization, so a shared decoder result is never mutated.
  return validateGaussianSplat({ ...result, positions: new Float32Array(result.positions), scales: new Float32Array(result.scales), rotations: new Float32Array(result.rotations), colors: new Float32Array(result.colors), opacities: new Float32Array(result.opacities), ...(result.sphericalHarmonics ? { sphericalHarmonics: new Float32Array(result.sphericalHarmonics) } : {}) }, options);
}

/** Parse a supported splat payload, using explicitly supplied codecs where needed. */
export async function parseGaussianSplat(input: ArrayBuffer | Uint8Array, format: GaussianSplatFormat, options: GaussianSplatParseOptions = {}): Promise<GaussianSplatData> {
  checkAbort(options.signal);
  const bytes = asBytes(input);
  if (bytes.byteLength > limits(options).maxInputBytes) throw new RangeError("splat input byte limit exceeded");
  if (format === "ply") {
    try { return parsePly(bytes, options); }
    catch (error) {
      if (error instanceof CompressedPlyUnsupportedError && options.codecs?.compressedPly) {
        const decoded = await decodeSplatWithCodec(bytes, "compressedPly", options);
        if (decoded.count !== error.declaredCount) throw new Error("compressed PLY decoder count does not match its vertex declaration");
        return decoded;
      }
      throw error;
    }
  }
  if (format === "splat") return parseSplat(bytes, options);
  if (format === "gltf" || format === "glb") return parseGltf(bytes, format, options);
  if (format === "spz" && !options.codecs?.spz) return parseSpz(bytes, options);
  if (format === "ksplat" && !options.codecs?.ksplat) {
    const bound = limits(options);
    const decoded = decodeKSplat(bytes, bound, (count, degree) => allocate(count, degree, "ksplat", options), options.signal);
    checkAbort(options.signal);
    return validateGaussianSplat({ ...decoded, metadata: { format: "ksplat", version: `${bytes[0]}.${bytes[1]}`, colorSpace: options.defaultColorSpace ?? "srgb_rec709_display", extras: { compressionLevel: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(20, true) } } }, options);
  }
  if (format === "spz" || format === "ksplat") return decodeSplatWithCodec(bytes, format, options);
  throw new Error(`unknown splat format: ${String(format)}`);
}

export interface GaussianSplatLoadOptions extends GaussianSplatParseOptions, AssetRequestOptions {
  readonly format?: GaussianSplatFormat;
}
function splatFormat(url: string, explicit?: string): GaussianSplatFormat | undefined {
  const candidate = (explicit ?? /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url)?.[1])?.toLowerCase();
  return candidate && ["ply", "splat", "ksplat", "spz", "gltf", "glb"].includes(candidate) ? candidate as GaussianSplatFormat : undefined;
}

/** AssetManager-compatible loader. Document and dependent buffers use the shared integrity and transport policy. */
export class GaussianSplatLoader implements AssetLoader<GaussianSplatData> {
  readonly type = "gaussian-splat";
  constructor(readonly options: GaussianSplatParseOptions = {}) {}
  canLoad(request: AssetLoadRequest): boolean {
    if (request.type === this.type) return !!splatFormat(request.url, request.format);
    // Generic glTF/GLB and PLY may contain meshes; never take precedence over their normal loaders.
    return !request.type && ["splat", "spz", "ksplat"].includes(splatFormat(request.url, request.format) ?? "");
  }
  parse(input: ArrayBuffer | Uint8Array, format: GaussianSplatFormat, options: GaussianSplatParseOptions = {}): Promise<GaussianSplatData> {
    return parseGaussianSplat(input, format, { ...this.options, ...options });
  }
  load(url: string, options?: GaussianSplatLoadOptions): Promise<GaussianSplatData>;
  load(request: AssetLoadRequest, context: LoadContext): Promise<GaussianSplatData>;
  async load(input: string | AssetLoadRequest, supplied: GaussianSplatLoadOptions | LoadContext = {}): Promise<GaussianSplatData> {
    const managed = typeof input !== "string";
    const request: AssetLoadRequest = managed ? input : { ...(supplied as GaussianSplatLoadOptions), url: input };
    const context = managed ? supplied as LoadContext : new LoadContext(request);
    const directOptions = managed ? {} : supplied as GaussianSplatLoadOptions;
    const merged = { ...this.options, ...directOptions };
    const signal = new LoadContext({ signal: merged.signal }).signalFor(context.signalFor(request.signal));
    checkAbort(signal);
    const format = splatFormat(request.url, request.format);
    if (!format) throw new Error("splat format must be specified or present in the URL");
    const policy = mergeAssetRequestOptions(context.requestOptionsFor(request.url), request);
    const maxBytes = Math.min(limits(merged).maxInputBytes, policy.maxBytes ?? Infinity);
    const transport = { ...policy, maxBytes };
    const documentUrl = context.resolve(request.url);
    const bytes = await fetchBytes(documentUrl, signal, (progress) => request.onProgress?.({ url: documentUrl, phase: "document", loadedBytes: progress.loaded, ...(progress.total !== undefined ? { totalBytes: progress.total } : {}) }), transport);
    // Pass the effective document policy into the dependency scope even when
    // this loader is called directly with an otherwise empty LoadContext.
    const child = context.child(request.url, undefined, { ...transport, signal });
    const resolveUri = async (uri: string, childSignal?: AbortSignal) => {
      const url = child.resolve(uri), policy = child.requestOptionsFor(uri);
      if (merged.resolveUri) {
        validateAssetUrlPolicy(url, policy);
        const result = asBytes(await merged.resolveUri(uri, child.signalFor(childSignal)));
        if (result.byteLength > Math.min(maxBytes, policy.maxBytes ?? Infinity)) throw new RangeError("splat dependency byte limit exceeded");
        // The resolver may retain and mutate its bytes while the digest is pending.
        const snapshot = new Uint8Array(result);
        await verifyAssetBytes(snapshot.buffer, policy.integrity, uri);
        return snapshot;
      }
      return fetchBytes(url, child.signalFor(childSignal), (progress) => request.onProgress?.({ url, phase: "buffer", loadedBytes: progress.loaded, ...(progress.total !== undefined ? { totalBytes: progress.total } : {}) }), { ...policy, maxBytes: Math.min(maxBytes, policy.maxBytes ?? Infinity) });
    };
    const verifyInlineUri = async (uri: string, inline: Uint8Array) => {
      const policy = child.requestOptionsFor(uri);
      // The validator must not receive the parser's verified input by reference.
      const snapshot = new Uint8Array(inline);
      await verifyAssetBytes(snapshot.buffer, policy.integrity, uri);
      await merged.verifyInlineUri?.(uri, snapshot);
    };
    const result = await parseGaussianSplat(bytes, format, { ...merged, signal, resolveUri, verifyInlineUri });
    checkAbort(signal);
    request.onProgress?.({ url: request.url, phase: "complete", loadedBytes: bytes.byteLength, totalBytes: bytes.byteLength });
    return result;
  }
}

// SPZ wire layout is defined by the published standalone SPZ file-format documentation:
// https://github.com/nianticlabs/spz/blob/main/README.md#file-format
async function inflateBounded(input: Uint8Array, format: "gzip" | "zstd", limit: number, signal?: AbortSignal): Promise<Uint8Array> {
  checkAbort(signal);
  let transform: DecompressionStream | undefined;
  if (typeof DecompressionStream !== "undefined") {
    try { transform = new DecompressionStream(format as CompressionFormat); }
    catch { /* A runtime may expose DecompressionStream without Zstandard. */ }
  }
  if (!transform) {
    // Node 22.15+ exposes the codec in zlib, but not as a DecompressionStream.
    // Keep the specifier dynamic so browser bundles do not import a Node builtin.
    const node = (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node;
    if (!node) {
      if (format === "zstd") return decompressZstdFallback(input, limit, signal);
      throw new Error(`SPZ ${format} decompression is unavailable`);
    }
    const specifier = "node:zlib";
    const zlib = await import(specifier) as {
      gunzipSync?: (bytes: Uint8Array, options: { maxOutputLength: number }) => Uint8Array;
      zstdDecompressSync?: (bytes: Uint8Array, options: { maxOutputLength: number }) => Uint8Array;
    };
    const decompress = format === "gzip" ? zlib.gunzipSync : zlib.zstdDecompressSync;
    if (!decompress) {
      if (format === "zstd") return decompressZstdFallback(input, limit, signal);
      throw new Error(`SPZ ${format} decompression is unavailable`);
    }
    checkAbort(signal);
    const output = decompress(input, { maxOutputLength: limit });
    checkAbort(signal);
    return new Uint8Array(output);
  }
  const reader = new Blob([new Uint8Array(input).buffer]).stream().pipeThrough(transform).getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  const cancel = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      checkAbort(signal);
      const chunk = await reader.read(); checkAbort(signal); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > limit) { await reader.cancel(); throw new RangeError("SPZ decompressed byte limit exceeded"); }
      chunks.push(chunk.value);
    }
  } finally { signal?.removeEventListener("abort", cancel); reader.releaseLock(); }
  const output = new Uint8Array(length); let at = 0;
  for (const chunk of chunks) { output.set(chunk, at); at += chunk.length; }
  return output;
}
function halfFloat(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1, exponent = bits >>> 10 & 31, fraction = bits & 1023;
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * (exponent ? 1 + fraction / 1024 : fraction / 1024) * 2 ** (exponent ? exponent - 15 : -14);
}
function spzExtensions(bytes: Uint8Array, start: number, end: number): { coordinateSystem: string; extensionTypes: number[] } {
  const labels = ["", "LDB", "RDB", "LUB", "RUB", "LDF", "RDF", "LUF", "RUF", "LFD", "RFD", "LFU", "RFU", "LBD", "RBD", "LBU", "RBU"];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const types: number[] = [];
  let coordinateSystem = "RUB";
  while (start < end) {
    if (start + 8 > end) throw new Error("truncated SPZ extension record");
    const type = view.getUint32(start, true), length = view.getUint32(start + 4, true); start += 8;
    if (!type || start + length > end) throw new Error("invalid SPZ extension size");
    if (type === 0xadbe0003) {
      if (length !== 4) throw new Error("invalid SPZ coordinate system extension");
      const code = view.getUint32(start, true);
      if (code < 1 || code > 16) throw new Error("invalid SPZ coordinate system");
      coordinateSystem = labels[code]!;
    }
    types.push(type); start += length;
  }
  return { coordinateSystem, extensionTypes: types };
}
async function parseSpz(input: Uint8Array, options: GaussianSplatParseOptions): Promise<GaussianSplatData> {
  if (input.length < 2) throw new Error("truncated SPZ file");
  const maxBytes = limits(options).maxDecodedBytes;
  const legacy = input[0] === 0x1f && input[1] === 0x8b;
  const file = legacy ? await inflateBounded(input, "gzip", maxBytes, options.signal) : input;
  if (file.length < (legacy ? 16 : 32)) throw new Error("truncated SPZ header");
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (view.getUint32(0, true) !== 0x5053474e) throw new Error("invalid SPZ signature");
  const version = view.getUint32(4, true), count = view.getUint32(8, true);
  if (legacy ? version < 1 || version > 3 : version !== 4) throw new Error(`unsupported SPZ version ${version}`);
  const degree = view.getUint8(12);
  if (degree > (version < 4 ? 3 : 4)) throw new RangeError(`unsupported SPZ spherical-harmonic degree for version ${version}`);
  const fractional = view.getUint8(13), flags = view.getUint8(14);
  if (fractional > 24 || (flags & ~3)) throw new Error("invalid SPZ header flags or fractional bits");
  if (legacy && view.getUint8(15) !== 0) throw new Error("invalid SPZ legacy reserved byte");
  checkAllocation(count, degree as GaussianSplatDegree, options);
  const lengths = [count * (version === 1 ? 6 : 9), count, count * 3, count * 3, count * (version < 3 ? 3 : 4), count * shSize(degree as GaussianSplatDegree)];
  if (lengths.reduce((a, b) => a + b, 0) > maxBytes) throw new RangeError("SPZ decompressed byte limit exceeded");
  let coordinateSystem = "RUB"; let extensionTypes: number[] = [];
  let streams: Uint8Array[];
  if (legacy) {
    let offset = 16; streams = [];
    for (const length of lengths) { if (offset + length > file.length) throw new Error("truncated SPZ attributes"); streams.push(file.subarray(offset, offset + length)); offset += length; }
    if (flags & 2) ({ coordinateSystem, extensionTypes } = spzExtensions(file, offset, file.length));
    else if (offset !== file.length) throw new Error("unexpected trailing SPZ data");
  } else {
    const numStreams = view.getUint8(15), toc = view.getUint32(16, true);
    for (let i = 20; i < 32; i++) if (file[i] !== 0) throw new Error("nonzero SPZ reserved byte");
    if (toc < 32 || toc + numStreams * 16 > file.length || numStreams !== lengths.filter((n) => n > 0).length) throw new Error("invalid SPZ table of contents");
    if (flags & 2) ({ coordinateSystem, extensionTypes } = spzExtensions(file, 32, toc));
    else if (toc !== 32) throw new Error("unexpected SPZ extension area");
    streams = []; let offset = toc + numStreams * 16, slot = 0;
    for (const expected of lengths) {
      if (!expected) { streams.push(new Uint8Array()); continue; }
      const compressedBig = view.getBigUint64(toc + slot * 16, true), decodedBig = view.getBigUint64(toc + slot * 16 + 8, true); slot++;
      if (compressedBig > BigInt(file.length) || decodedBig !== BigInt(expected)) throw new Error("invalid SPZ stream sizes");
      const compressed = Number(compressedBig);
      if (compressed < 1 || offset + compressed > file.length) throw new Error("truncated SPZ stream");
      const encoded = file.subarray(offset, offset + compressed); offset += compressed;
      const decoded = options.decompressZstd ? await options.decompressZstd(encoded, expected, options.signal) : await inflateBounded(encoded, "zstd", expected, options.signal);
      checkAbort(options.signal);
      if (!(decoded instanceof Uint8Array) || decoded.length !== expected) throw new Error("SPZ Zstandard decoder returned an invalid stream size");
      streams.push(decoded);
    }
    if (offset !== file.length) throw new Error("unexpected trailing SPZ data");
  }
  const [positions, alpha, colors, scales, rotations, sh] = streams as [Uint8Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array];
  const data = allocate(count, degree as GaussianSplatDegree, "spz", options);
  const positionView = new DataView(positions.buffer, positions.byteOffset, positions.byteLength);
  const rotationView = new DataView(rotations.buffer, rotations.byteOffset, rotations.byteLength);
  for (let i = 0; i < count; i++) {
    if ((i & 16383) === 0) checkAbort(options.signal);
    for (let c = 0; c < 3; c++) {
      const j = i * 3 + c;
      if (version === 1) data.positions[j] = halfFloat(positionView.getUint16(j * 2, true));
      else { let x = positions[j * 3]! | positions[j * 3 + 1]! << 8 | positions[j * 3 + 2]! << 16; if (x & 0x800000) x -= 0x1000000; data.positions[j] = x / 2 ** fractional; }
      data.scales[j] = Math.exp(scales[j]! / 16 - 10);
      data.colors[j] = 0.5 + C0 * ((colors[j]! / 255 - 0.5) / 0.15);
    }
    data.opacities[i] = alpha[i]! / 255;
    const q = i * 4;
    if (version < 3) {
      let sum = 0;
      for (let c = 0; c < 3; c++) { const x = rotations[i * 3 + c]! / 127.5 - 1; data.rotations[q + c] = x; sum += x * x; }
      if (sum > 1.02) throw new Error("invalid SPZ quaternion");
      data.rotations[q + 3] = Math.sqrt(Math.max(0, 1 - sum));
    } else {
      const packed = rotationView.getUint32(i * 4, true), largest = packed >>> 30; let sum = 0, index = 0;
      for (let c = 0; c < 4; c++) if (c !== largest) {
        const part = packed >>> (20 - index * 10) & 1023; index++;
        const x = (part & 512 ? -1 : 1) * (part & 511) / (511 * Math.SQRT2);
        data.rotations[q + c] = x; sum += x * x;
      }
      if (sum > 1.01) throw new Error("invalid SPZ quaternion");
      data.rotations[q + largest] = Math.sqrt(Math.max(0, 1 - sum));
    }
  }
  if (data.sphericalHarmonics) for (let i = 0; i < sh.length; i++) data.sphericalHarmonics[i] = (sh[i]! - 128) / 128;
  return validateGaussianSplat({ ...data, metadata: { ...data.metadata, version: String(version), coordinateSystem, extras: { antialiased: !!(flags & 1), extensionTypes } } }, options);
}
