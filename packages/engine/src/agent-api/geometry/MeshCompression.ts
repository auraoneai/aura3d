import { normalizeGeometryAttributes, validateGeometryMetadata } from "../RootGeometry.js";
import type { AuraCustomGeometrySpec } from "../RootGeometry.js";

/**
 * Lossy vertex-stream quantization for custom geometry.
 *
 * Positions and UV channels are stored as unsigned integers over their
 * per-component range; normals are stored as signed normalized integers.
 * Index streams narrow to 16 bits when every vertex is addressable. Colors,
 * custom attributes, morph targets, groups, draw range, topology, bounds and
 * the dynamic flag are carried unchanged (copied) and listed in
 * `uncompressedFields`, so nothing is silently dropped. Every quantized field
 * reports its measured maximum absolute reconstruction error.
 *
 * This is an in-memory transport/storage helper with an explicit decoder, not
 * a GPU vertex format: `dequantizeAuraGeometry` restores float32 streams.
 */

export interface AuraGeometryQuantizeOptions {
  /** Bits per position component, 8-16 (default 16). */
  readonly positionBits?: number;
  /** Bits per normal component including sign, 8-16 (default 12). */
  readonly normalBits?: number;
  /** Bits per UV component, 8-16 (default 16). */
  readonly uvBits?: number;
  /** Vertex budget checked before allocation; default and hard maximum 1,048,576. */
  readonly maxVertices?: number;
}

/** `value = offset[c] + q * scale[c]` for unsigned ranges; `value = q * scale[c]` for signed normals. */
export interface AuraQuantizedStream {
  readonly bits: number;
  readonly itemSize: 2 | 3;
  readonly signed: boolean;
  readonly data: Uint16Array | Int16Array;
  readonly offset: readonly number[];
  readonly scale: readonly number[];
  /** Largest absolute component error measured after decoding. */
  readonly maxError: number;
}

export type AuraGeometryUncompressedField =
  "colors" | "attributes" | "morphTargets" | "groups" | "drawRange" | "topology" | "bounds" | "dynamic";

export interface AuraQuantizedGeometry {
  readonly kind: "aura-quantized-geometry";
  readonly version: 1;
  readonly vertexCount: number;
  readonly positions: AuraQuantizedStream;
  readonly normals?: AuraQuantizedStream;
  readonly uvs?: AuraQuantizedStream;
  readonly uv1s?: AuraQuantizedStream;
  /** Absent for a sequential, non-indexed stream. */
  readonly indices?: Uint16Array | Uint32Array;
  /** Carried unchanged; see `uncompressedFields`. */
  readonly passthrough: Readonly<Pick<AuraCustomGeometrySpec, AuraGeometryUncompressedField>>;
  readonly uncompressedFields: readonly AuraGeometryUncompressedField[];
  /** Logical bytes: float32 vertex streams and 32-bit indices before, typed storage after. */
  readonly bytes: { readonly before: number; readonly after: number };
}

const HARD_MAX_VERTICES = 1_048_576;

function fail(field: string, message: string): never {
  throw Object.assign(new RangeError(`Aura3D geometry quantization: ${message}`), { code: "AURA_GEOMETRY_INVALID", field });
}

function bitsOption(value: number | undefined, fallback: number, field: string): number {
  const bits = value ?? fallback;
  if (!Number.isSafeInteger(bits) || bits < 8 || bits > 16) fail(field, `${field} must be an integer from 8 through 16`);
  return bits;
}

function quantizeRange(values: Float32Array, itemSize: 2 | 3, bits: number): AuraQuantizedStream {
  const levels = 2 ** bits - 1;
  const offset: number[] = [], scale: number[] = [];
  for (let c = 0; c < itemSize; c += 1) {
    let min = Infinity, max = -Infinity;
    for (let i = c; i < values.length; i += itemSize) { min = Math.min(min, values[i]!); max = Math.max(max, values[i]!); }
    if (min === Infinity) { min = 0; max = 0; }
    offset.push(min);
    scale.push(max > min ? (max - min) / levels : 0);
  }
  const data = new Uint16Array(values.length);
  let maxError = 0;
  for (let i = 0; i < values.length; i += 1) {
    const c = i % itemSize, step = scale[c]!;
    const q = step > 0 ? Math.min(levels, Math.max(0, Math.round((values[i]! - offset[c]!) / step))) : 0;
    data[i] = q;
    maxError = Math.max(maxError, Math.abs(offset[c]! + q * step - values[i]!));
  }
  return { bits, itemSize, signed: false, data, offset, scale, maxError };
}

function quantizeSigned(values: Float32Array, bits: number): AuraQuantizedStream {
  const levels = 2 ** (bits - 1) - 1, step = 1 / levels;
  const data = new Int16Array(values.length);
  let maxError = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]!;
    if (value < -1 - 1e-6 || value > 1 + 1e-6) fail("normals", "normal components must lie in [-1, 1]");
    const q = Math.round(Math.min(1, Math.max(-1, value)) * levels);
    data[i] = q;
    maxError = Math.max(maxError, Math.abs(q * step - value));
  }
  return { bits, itemSize: 3, signed: true, data, offset: [0, 0, 0], scale: [step, step, step], maxError };
}

function decode(stream: AuraQuantizedStream): Float32Array {
  const out = new Float32Array(stream.data.length);
  for (let i = 0; i < out.length; i += 1) {
    const c = i % stream.itemSize;
    out[i] = stream.offset[c]! + stream.data[i]! * stream.scale[c]!;
  }
  return out;
}

function copyPassthrough(spec: AuraCustomGeometrySpec): { passthrough: AuraQuantizedGeometry["passthrough"]; fields: AuraGeometryUncompressedField[] } {
  const passthrough: Record<string, unknown> = {};
  const fields: AuraGeometryUncompressedField[] = [];
  const keep = (field: AuraGeometryUncompressedField, value: unknown): void => {
    if (value === undefined) return;
    passthrough[field] = value;
    fields.push(field);
  };
  const copyArray = <T>(value: T): T => (ArrayBuffer.isView(value) ? (value as unknown as Float32Array).slice() : Array.isArray(value) ? [...value] : value) as T;
  keep("colors", spec.colors === undefined ? undefined : copyArray(spec.colors));
  keep("attributes", spec.attributes === undefined ? undefined : Object.fromEntries(Object.entries(spec.attributes).map(([name, attribute]) => [name, { ...attribute, data: copyArray(attribute.data) }])));
  keep("morphTargets", spec.morphTargets?.map((target) => {
    const copy: Record<string, unknown> = { ...target };
    for (const key of ["positions", "normals", "tangents"] as const) if (target[key] !== undefined) copy[key] = copyArray(target[key]);
    return copy;
  }));
  keep("groups", spec.groups?.map((group) => ({ ...group })));
  keep("drawRange", spec.drawRange === undefined ? undefined : { ...spec.drawRange });
  keep("topology", spec.topology);
  keep("bounds", spec.bounds === undefined ? undefined : { min: [...spec.bounds.min], max: [...spec.bounds.max] });
  keep("dynamic", spec.dynamic);
  return { passthrough: passthrough as AuraQuantizedGeometry["passthrough"], fields };
}

/** Quantize one custom geometry; the source is validated first and never modified. */
export function quantizeAuraGeometry(spec: AuraCustomGeometrySpec, options: AuraGeometryQuantizeOptions = {}): AuraQuantizedGeometry {
  if (!spec || typeof spec !== "object" || spec.kind !== "aura-custom-geometry") fail("kind", "geometry kind must be aura-custom-geometry");
  if (!options || typeof options !== "object" || Array.isArray(options)) fail("options", "options must be an object");
  const positionBits = bitsOption(options.positionBits, 16, "positionBits");
  const normalBits = bitsOption(options.normalBits, 12, "normalBits");
  const uvBits = bitsOption(options.uvBits, 16, "uvBits");
  const maxVertices = options.maxVertices ?? HARD_MAX_VERTICES;
  if (!Number.isSafeInteger(maxVertices) || maxVertices < 1 || maxVertices > HARD_MAX_VERTICES) fail("maxVertices", `maxVertices must be an integer from 1 through ${HARD_MAX_VERTICES}`);
  const positionCount = Array.isArray(spec.positions) && Array.isArray(spec.positions[0]) ? spec.positions.length : (spec.positions?.length ?? 0) / 3;
  if (positionCount > maxVertices) fail("positions", `geometry has ${positionCount} vertices; the budget is ${maxVertices}`);

  const normalized = normalizeGeometryAttributes(spec);
  validateGeometryMetadata(spec, normalized);
  const { vertexCount } = normalized;
  const positions = quantizeRange(normalized.positions, 3, positionBits);
  const normals = normalized.normals ? quantizeSigned(normalized.normals, normalBits) : undefined;
  const uvs = normalized.uvs ? quantizeRange(normalized.uvs, 2, uvBits) : undefined;
  const uv1s = normalized.uv1s ? quantizeRange(normalized.uv1s, 2, uvBits) : undefined;
  const sourceIndices = normalized.indices;
  const indices = sourceIndices === undefined || sourceIndices.length === 0 ? undefined
    : vertexCount <= 65_536 ? Uint16Array.from(sourceIndices) : Uint32Array.from(sourceIndices);
  const { passthrough, fields } = copyPassthrough(spec);
  const floats = normalized.positions.length + (normalized.normals?.length ?? 0) + (normalized.uvs?.length ?? 0) + (normalized.uv1s?.length ?? 0);
  const before = floats * 4 + (sourceIndices?.length ?? 0) * 4;
  const after = [positions, normals, uvs, uv1s].reduce((sum, stream) => sum + (stream?.data.byteLength ?? 0), 0) + (indices?.byteLength ?? 0);
  return {
    kind: "aura-quantized-geometry", version: 1, vertexCount, positions,
    ...(normals ? { normals } : {}), ...(uvs ? { uvs } : {}), ...(uv1s ? { uv1s } : {}), ...(indices ? { indices } : {}),
    passthrough, uncompressedFields: fields, bytes: { before, after }
  };
}

/** Decode a quantized geometry back to float32 streams plus its carried fields. */
export function dequantizeAuraGeometry(quantized: AuraQuantizedGeometry): AuraCustomGeometrySpec {
  if (!quantized || quantized.kind !== "aura-quantized-geometry" || quantized.version !== 1) fail("kind", "expected an aura-quantized-geometry version 1 value");
  const streams = [quantized.positions, quantized.normals, quantized.uvs, quantized.uv1s];
  for (const stream of streams) {
    if (stream && stream.data.length !== quantized.vertexCount * stream.itemSize) fail("vertexCount", "stream length does not match vertexCount");
  }
  if (quantized.indices && quantized.indices.some((index) => index >= quantized.vertexCount)) fail("indices", "index out of range");
  return {
    kind: "aura-custom-geometry",
    positions: decode(quantized.positions),
    ...(quantized.normals ? { normals: decode(quantized.normals) } : {}),
    ...(quantized.uvs ? { uvs: decode(quantized.uvs) } : {}),
    ...(quantized.uv1s ? { uv1s: decode(quantized.uv1s) } : {}),
    indices: quantized.indices ? Array.from(quantized.indices) : [],
    ...quantized.passthrough
  };
}
