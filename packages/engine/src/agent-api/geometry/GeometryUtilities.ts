import { normalizeGeometryAttributes, validateGeometryMetadata } from "../RootGeometry.js";
import type { AuraCustomGeometrySpec, AuraCustomVertexAttributeData, AuraCustomVertexAttributeSpec, AuraRootVec3 } from "../RootGeometry.js";
import { assertGeometryMorphChannels } from "./MorphChannels.js";

export type AuraAttributeStorage = "number" | "float32" | "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32";

/** A tightly interleaved numeric buffer. Stride and offsets are measured in scalar values. */
export interface AuraInterleavedAttributes {
  readonly data: readonly number[];
  readonly vertexCount: number;
  readonly stride: number;
  readonly attributes: Readonly<Record<string, { readonly itemSize: 1 | 2 | 3 | 4; readonly offset: number; readonly storage: AuraAttributeStorage; readonly normalized?: boolean }>>;
}

export interface AuraGeometryMemoryEstimate {
  readonly cpu: {
    /** Logical eight-byte numbers in unique source arrays, including interleaved padding. */
    readonly numberArrayBytes: number;
    /** Logical UTF-16 code units in source color strings; string sharing is not observable. */
    readonly colorStringBytes: number;
    /** Current byteLength of each distinct backing buffer object retained by a source view. */
    readonly typedBufferBytes: number;
    /** Union of the source view ranges; a subset of typedBufferBytes, not an additional allocation. */
    readonly typedViewBytes: number;
    /** numberArrayBytes + colorStringBytes + typedBufferBytes, not a JS heap measurement. */
    readonly estimatedBytes: number;
  };
  readonly logicalUpload: {
    /** Fresh production custom-geometry vertex stride, including alignment and generated normals. */
    readonly vertexStrideBytes: number;
    readonly vertexBytes: number;
    readonly indexBytes: number;
    /** Float32-equivalent authored morph channels, not the renderer's morph allocation. */
    readonly morphBytes: number;
    /** vertexBytes + indexBytes + morphBytes; this is not GPU residency. */
    readonly totalBytes: number;
  };
}

type AttributeLayout = AuraCustomVertexAttributeSpec & { readonly stride?: number; readonly offset?: number; readonly normalized?: boolean };

function attributeStorage(data: AuraCustomVertexAttributeData): AuraAttributeStorage {
  if (data instanceof Float32Array) return "float32";
  if (data instanceof Int8Array) return "int8";
  if (data instanceof Uint8Array) return "uint8";
  if (data instanceof Int16Array) return "int16";
  if (data instanceof Uint16Array) return "uint16";
  if (data instanceof Int32Array) return "int32";
  if (data instanceof Uint32Array) return "uint32";
  if (Array.isArray(data)) return "number";
  throw new Error("Unsupported attribute storage.");
}

function memoryEstimateError(field: string, message: string): never {
  throw Object.assign(new Error(`Aura3D geometry memory estimate: ${message}`), { code: "AURA_GEOMETRY_INVALID", field });
}

function memoryUnsupportedField(field: string): never {
  throw Object.assign(new Error(`Aura3D geometry memory estimate cannot account for unsupported field "${field}".`), { code: "AURA_GEOMETRY_INCOMPATIBLE", field });
}

function memorySize(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw Object.assign(new RangeError(`Aura3D geometry memory estimate ${field} must be a non-negative safe integer.`), { code: "AURA_GEOMETRY_INVALID", field });
  }
  return value;
}

function memoryAdd(a: number, b: number, field: string): number {
  return memorySize(a + b, field);
}

function memoryMultiply(a: number, b: number, field: string): number {
  return memorySize(a * b, field);
}

/**
 * Estimate source payload and the logical typed footprint of one custom geometry.
 *
 * Source arrays are counted once by identity, and typed views retain their
 * entire backing buffer object once, even when views overlap. Different buffer
 * objects can still share storage (for example cloned SharedArrayBuffers).
 * Number arrays and color strings use logical 8-byte numbers and 2-byte UTF-16
 * code units: actual JS heap layout, array/object overhead, metadata, and
 * string sharing are unknown.
 *
 * The vertex/index figures model a fresh production custom-geometry staging
 * layout, not a device allocation. Distinct semantics are repacked separately
 * even if they share a source buffer. Morph channels are only counted as
 * logical float32 values: uniforms, textures, CPU fallback, backend conversion,
 * copies, sharing with other geometries, and actual GPU residency vary. The
 * shared geometry validators may allocate temporary normalized arrays, which
 * are not included. This validates stream and metadata shape, not drawability.
 */
export function estimateAuraGeometryMemory(spec: AuraCustomGeometrySpec): AuraGeometryMemoryEstimate {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) memoryEstimateError("geometry", "geometry must be an object.");
  if (spec.kind !== "aura-custom-geometry") memoryEstimateError("kind", "geometry kind must be aura-custom-geometry.");
  if (spec.dynamic !== undefined && typeof spec.dynamic !== "boolean") memoryEstimateError("dynamic", "dynamic must be boolean.");

  const arrays = new Set<readonly unknown[]>();
  const buffers = new Map<ArrayBufferLike, { size: number; ranges: [number, number][] }>();
  let numberArrayBytes = 0;
  let colorStringBytes = 0;

  const record = (data: unknown, field: string, mode: "vector" | "color" | "numeric" | "index" | "custom"): void => {
    if (ArrayBuffer.isView(data)) {
      const supported = mode === "index" ? data instanceof Uint16Array || data instanceof Uint32Array
        : mode === "custom" ? data instanceof Float32Array || data instanceof Int8Array || data instanceof Uint8Array ||
          data instanceof Int16Array || data instanceof Uint16Array || data instanceof Int32Array || data instanceof Uint32Array
          : data instanceof Float32Array;
      if (!supported) memoryEstimateError(field, `${field} has unsupported typed storage.`);
      const size = memorySize(data.buffer.byteLength, field);
      const start = memorySize(data.byteOffset, field);
      const end = memoryAdd(start, memorySize(data.byteLength, field), field);
      if (end > size) memoryEstimateError(field, `${field} view exceeds its backing buffer.`);
      const existing = buffers.get(data.buffer);
      if (existing && existing.size !== size) memoryEstimateError(field, `${field} backing buffer changed during estimation.`);
      const buffer = existing ?? { size, ranges: [] };
      buffer.ranges.push([start, end]);
      buffers.set(data.buffer, buffer);
      return;
    }
    if (!Array.isArray(data)) memoryEstimateError(field, `${field} must be an array or supported typed view.`);
    // Guard a spoofed array length before walking it or asking the shared
    // normalizer to allocate a corresponding typed array.
    memoryMultiply(memorySize(data.length, field), 8, field);
    if (arrays.has(data)) return;
    arrays.add(data);
    const tupleOrColorArray = (mode === "vector" || mode === "color") && data.length > 0 && typeof data[0] !== "number";
    for (let index = 0; index < data.length; index++) {
      const value: unknown = data[index];
      if (!tupleOrColorArray && typeof value === "number" && Number.isFinite(value)) {
        numberArrayBytes = memoryAdd(numberArrayBytes, 8, field);
      } else if (tupleOrColorArray && typeof value === "string" && mode === "color") {
        colorStringBytes = memoryAdd(colorStringBytes, memoryMultiply(value.length, 2, field), field);
      } else if (tupleOrColorArray && Array.isArray(value)) {
        record(value, field, "numeric");
      } else {
        memoryEstimateError(field, `${field} must contain finite numeric values${mode === "color" ? " or color strings" : ""}.`);
      }
    }
  };

  record(spec.positions, "positions", "vector");
  if (spec.normals !== undefined) record(spec.normals, "normals", "vector");
  if (spec.uvs !== undefined) record(spec.uvs, "uvs", "vector");
  if (spec.uv1s !== undefined) record(spec.uv1s, "uv1s", "vector");
  if (spec.colors !== undefined) record(spec.colors, "colors", "color");
  if (spec.indices !== undefined) record(spec.indices, "indices", "index");

  const flatPositions = spec.positions instanceof Float32Array || spec.positions.length === 0 || typeof spec.positions[0] === "number";
  if (flatPositions && spec.positions.length % 3 !== 0) memoryEstimateError("positions", "positions array length must be a multiple of 3.");
  const vertexCount = memorySize(flatPositions ? spec.positions.length / 3 : spec.positions.length, "positions");
  memoryMultiply(vertexCount, 24, "vertexBytes");
  if (spec.attributes !== undefined) {
    if (!spec.attributes || typeof spec.attributes !== "object" || Array.isArray(spec.attributes)) memoryEstimateError("attributes", "attributes must be an object.");
    for (const key of Reflect.ownKeys(spec.attributes)) {
      if (typeof key === "symbol" && Object.prototype.propertyIsEnumerable.call(spec.attributes, key)) memoryUnsupportedField(`attributes.${String(key)}`);
    }
    for (const [name, entry] of Object.entries(spec.attributes)) {
      const field = `attributes.${name}`;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) memoryEstimateError(field, `${field} must be an object.`);
      if (![1, 2, 3, 4].includes(entry.itemSize)) memoryEstimateError(`${field}.itemSize`, `${field} itemSize must be 1, 2, 3 or 4.`);
      const stride = memorySize(entry.stride ?? entry.itemSize, `${field}.stride`);
      const offset = memorySize(entry.offset ?? 0, `${field}.offset`);
      if (stride < entry.itemSize || memoryAdd(offset, entry.itemSize, `${field}.offset`) > stride) {
        memoryEstimateError(field, `${field} stride and offset must describe components within each vertex.`);
      }
      if (vertexCount > 0) memoryAdd(memoryAdd(memoryMultiply(vertexCount - 1, stride, field), offset, field), entry.itemSize, field);
      record(entry.data, `${field}.data`, "custom");
    }
  }
  if (spec.groups !== undefined) {
    if (!Array.isArray(spec.groups)) memoryEstimateError("groups", "groups must be an array of objects.");
    for (const [index, group] of spec.groups.entries()) {
      if (!group || typeof group !== "object" || Array.isArray(group)) memoryEstimateError(`groups[${index}]`, "groups must be an array of objects.");
    }
  }
  if (spec.drawRange !== undefined && (!spec.drawRange || typeof spec.drawRange !== "object" || Array.isArray(spec.drawRange))) {
    memoryEstimateError("drawRange", "drawRange must be an object.");
  }
  if (spec.bounds !== undefined && (!spec.bounds || typeof spec.bounds !== "object" || Array.isArray(spec.bounds))) {
    memoryEstimateError("bounds", "bounds must be an object.");
  }
  if (spec.morphTargets !== undefined) {
    if (!Array.isArray(spec.morphTargets)) memoryEstimateError("morphTargets", "morphTargets must be an array.");
    memoryMultiply(memorySize(spec.morphTargets.length, "morphTargets"), memoryMultiply(vertexCount, 12, "morphBytes"), "morphBytes");
    for (const [index, target] of spec.morphTargets.entries()) {
      if (!target || typeof target !== "object") continue; // The shared morph validator reports the malformed target.
      for (const key of Reflect.ownKeys(target)) {
        if (typeof key === "symbol" && Object.prototype.propertyIsEnumerable.call(target, key)) memoryUnsupportedField(`morphTargets[${index}].${String(key)}`);
      }
    }
  }

  const normalized = normalizeGeometryAttributes(spec);
  validateGeometryMetadata(spec, normalized);
  let morphBytes = 0;
  for (const [index, target] of (spec.morphTargets ?? []).entries()) {
    for (const channel of ["positions", "normals", "tangents"] as const) {
      const data = target[channel];
      if (data === undefined) continue;
      const field = `morphTargets[${index}].${channel}`;
      record(data, field, "numeric");
      morphBytes = memoryAdd(morphBytes, memoryMultiply(data.length, 4, field), "morphBytes");
    }
  }

  let typedBufferBytes = 0;
  let typedViewBytes = 0;
  for (const { size, ranges } of buffers.values()) {
    typedBufferBytes = memoryAdd(typedBufferBytes, size, "typedBufferBytes");
    ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let start = 0;
    let end = 0;
    for (const [nextStart, nextEnd] of ranges) {
      if (nextStart > end) {
        typedViewBytes = memoryAdd(typedViewBytes, end - start, "typedViewBytes");
        start = nextStart;
      }
      end = Math.max(end, nextEnd);
    }
    typedViewBytes = memoryAdd(typedViewBytes, end - start, "typedViewBytes");
  }
  const estimatedBytes = memoryAdd(memoryAdd(numberArrayBytes, colorStringBytes, "cpu"), typedBufferBytes, "cpu");

  // Match createProductionGeometryFromCustomSpec/customAttributeLayout: the
  // renderer repacks the source, and only normalized 8/16-bit vec2/vec4
  // attributes keep their integer format. Other custom fields become floats.
  let vertexStrideBytes = 24 + (normalized.uvs ? 8 : 0) + (normalized.uv1s ? 8 : 0) + (normalized.colors ? 16 : 0);
  for (const entry of normalized.custom) {
    const source = spec.attributes![entry.name]!;
    const raw = source.data;
    let bytes = 4;
    if (source.normalized && (entry.itemSize === 2 || entry.itemSize === 4)) {
      if (raw instanceof Int8Array || raw instanceof Uint8Array) bytes = 1;
      else if (raw instanceof Int16Array || raw instanceof Uint16Array) bytes = 2;
    }
    const alignment = Math.min(4, bytes * entry.itemSize);
    vertexStrideBytes = memoryAdd(vertexStrideBytes, (alignment - vertexStrideBytes % alignment) % alignment, "vertexStrideBytes");
    vertexStrideBytes = memoryAdd(vertexStrideBytes, bytes * entry.itemSize, "vertexStrideBytes");
  }
  vertexStrideBytes = memoryAdd(vertexStrideBytes, (4 - vertexStrideBytes % 4) % 4, "vertexStrideBytes");
  const vertexBytes = memoryMultiply(normalized.vertexCount, vertexStrideBytes, "vertexBytes");
  let indexBytes = 0;
  if (normalized.indices) {
    const bytes = normalized.indices.some((index) => index > 65535) ? 4 : 2;
    indexBytes = memoryMultiply(normalized.indices.length, bytes, "indexBytes");
  }
  const totalBytes = memoryAdd(memoryAdd(vertexBytes, indexBytes, "logicalUpload"), morphBytes, "logicalUpload");
  return {
    cpu: { numberArrayBytes, colorStringBytes, typedBufferBytes, typedViewBytes, estimatedBytes },
    logicalUpload: { vertexStrideBytes, vertexBytes, indexBytes, morphBytes, totalBytes }
  };
}

function storedArray(storage: AuraAttributeStorage, values: number[]): AuraCustomVertexAttributeData {
  switch (storage) {
    case "number": return values;
    case "float32": return Float32Array.from(values);
    case "int8": return Int8Array.from(values);
    case "uint8": return Uint8Array.from(values);
    case "int16": return Int16Array.from(values);
    case "uint16": return Uint16Array.from(values);
    case "int32": return Int32Array.from(values);
    case "uint32": return Uint32Array.from(values);
    default: throw new Error("Unsupported attribute storage.");
  }
}

function layout(attribute: AttributeLayout, count?: number): { stride: number; offset: number; count: number } {
  const { itemSize, data } = attribute;
  if (![1, 2, 3, 4].includes(itemSize)) throw new Error("Attribute itemSize must be 1, 2, 3 or 4.");
  for (const key of Reflect.ownKeys(attribute)) {
    if (!Object.prototype.propertyIsEnumerable.call(attribute, key)) continue;
    if (typeof key === "string" && ["itemSize", "data", "normalized", "stride", "offset"].includes(key)) continue;
    throw new Error(`Unsupported attribute metadata ${String(key)}.`);
  }
  if (attribute.normalized !== undefined && typeof attribute.normalized !== "boolean") throw new Error("Attribute normalized must be boolean.");
  const stride = attribute.stride ?? itemSize;
  const offset = attribute.offset ?? 0;
  if (!Number.isInteger(stride) || stride < itemSize || !Number.isInteger(offset) || offset < 0 || offset + itemSize > stride) {
    throw new Error("Attribute stride and offset must describe components within each vertex.");
  }
  const inferredCount = data.length < offset + itemSize ? 0 : 1 + Math.floor((data.length - offset - itemSize) / stride);
  const actualCount = count ?? inferredCount;
  if (!Number.isSafeInteger(actualCount) || actualCount < 0 || (actualCount > 0 && (actualCount - 1) * stride + offset + itemSize > data.length)) {
    throw new Error("Attribute data does not contain the requested vertex count.");
  }
  if (count === undefined && attribute.stride === undefined && attribute.offset === undefined && data.length % itemSize !== 0) {
    throw new Error("Packed attribute data must contain complete vertices.");
  }
  return { stride, offset, count: actualCount };
}

/** Pack attributes in sorted name order into an owned buffer without changing their numeric values. */
export function interleaveAuraAttributes(attributes: Readonly<Record<string, AuraCustomVertexAttributeSpec>>, requestedVertexCount?: number): AuraInterleavedAttributes {
  if (requestedVertexCount !== undefined && (!Number.isSafeInteger(requestedVertexCount) || requestedVertexCount < 0)) {
    throw new Error("Requested vertex count must be a non-negative safe integer.");
  }
  const names = Object.keys(attributes).sort();
  if (names.length === 0) return { data: [], vertexCount: requestedVertexCount ?? 0, stride: 0, attributes: {} };
  let vertexCount: number | undefined;
  let stride = 0;
  const fields: Record<string, { itemSize: 1 | 2 | 3 | 4; offset: number; storage: AuraAttributeStorage; normalized?: boolean }> = Object.create(null);
  const layouts = names.map((name) => {
    const attribute = attributes[name] as AttributeLayout;
    const resolved = layout(attribute, requestedVertexCount);
    if (vertexCount !== undefined && resolved.count !== vertexCount) throw new Error("Interleaved attributes must have equal vertex counts.");
    vertexCount = resolved.count;
    const storage = attributeStorage(attribute.data);
    if (attribute.normalized && (storage === "number" || storage === "float32")) throw new Error("Normalized attributes require integer storage.");
    fields[name] = { itemSize: attribute.itemSize, offset: stride, storage, ...(attribute.normalized !== undefined ? { normalized: attribute.normalized } : {}) };
    stride += attribute.itemSize;
    return resolved;
  });
  const count = vertexCount ?? 0;
  const data = new Array<number>(count * stride);
  for (let field = 0; field < names.length; field++) {
    const source = attributes[names[field]] as AttributeLayout;
    const sourceLayout = layouts[field];
    const targetOffset = fields[names[field]].offset;
    for (let vertex = 0; vertex < count; vertex++) for (let component = 0; component < source.itemSize; component++) {
      const value = source.data[vertex * sourceLayout.stride + sourceLayout.offset + component];
      if (!Number.isFinite(value)) throw new Error("Attribute values must be finite.");
      data[vertex * stride + targetOffset + component] = value;
    }
  }
  return { data, vertexCount: count, stride, attributes: fields };
}

/** Reverse interleaving into independent packed arrays; no input buffer is shared. */
export function deinterleaveAuraAttributes(input: AuraInterleavedAttributes): Readonly<Record<string, AuraCustomVertexAttributeSpec>> {
  if (!Number.isSafeInteger(input.vertexCount) || input.vertexCount < 0 || !Number.isInteger(input.stride) || input.stride < 0 || input.data.length !== input.vertexCount * input.stride) {
    throw new Error("Invalid interleaved buffer dimensions.");
  }
  const result: Record<string, AuraCustomVertexAttributeSpec> = Object.create(null);
  const occupied = new Set<number>();
  for (const name of Object.keys(input.attributes).sort()) {
    const field = input.attributes[name];
    if (![1, 2, 3, 4].includes(field.itemSize) || !Number.isInteger(field.offset) || field.offset < 0 || field.offset + field.itemSize > input.stride) {
      throw new Error(`Invalid interleaved field ${name}.`);
    }
    for (const key of Reflect.ownKeys(field)) {
      if (!Object.prototype.propertyIsEnumerable.call(field, key)) continue;
      if (typeof key === "string" && ["itemSize", "offset", "storage", "normalized"].includes(key)) continue;
      throw new Error(`Unsupported interleaved field metadata ${String(key)}.`);
    }
    if (field.normalized !== undefined && typeof field.normalized !== "boolean") throw new Error("Attribute normalized must be boolean.");
    for (let c = 0; c < field.itemSize; c++) {
      if (occupied.has(field.offset + c)) throw new Error("Interleaved fields overlap.");
      occupied.add(field.offset + c);
    }
    const data = new Array<number>(input.vertexCount * field.itemSize);
    for (let v = 0; v < input.vertexCount; v++) for (let c = 0; c < field.itemSize; c++) {
      const value = input.data[v * input.stride + field.offset + c];
      if (!Number.isFinite(value)) throw new Error("Attribute values must be finite.");
      data[v * field.itemSize + c] = value;
    }
    const restored = storedArray(field.storage, data);
    if (Array.from(restored).some((value, i) => value !== data[i])) throw new Error(`Interleaved field ${name} cannot be represented by its storage type.`);
    if (field.normalized && (field.storage === "number" || field.storage === "float32")) throw new Error("Normalized attributes require integer storage.");
    result[name] = { itemSize: field.itemSize, data: restored, ...(field.normalized !== undefined ? { normalized: field.normalized } : {}) };
  }
  return result;
}

function indexStream(spec: AuraCustomGeometrySpec, vertexCount: number): number[] {
  return spec.indices?.length ? Array.from(spec.indices) : Array.from({ length: vertexCount }, (_, i) => i);
}

function copyPacked(source: ArrayLike<number>, size: number, newToOld: readonly number[]): Float32Array {
  const result = new Float32Array(newToOld.length * size);
  for (let i = 0; i < newToOld.length; i++) for (let c = 0; c < size; c++) result[i * size + c] = source[newToOld[i] * size + c];
  return result;
}

function copyCustom(attribute: AttributeLayout, count: number, newToOld: readonly number[]): AuraCustomVertexAttributeSpec {
  const sourceLayout = layout(attribute, count);
  const values = new Array<number>(newToOld.length * attribute.itemSize);
  for (let i = 0; i < newToOld.length; i++) for (let c = 0; c < attribute.itemSize; c++) {
    values[i * attribute.itemSize + c] = attribute.data[newToOld[i] * sourceLayout.stride + sourceLayout.offset + c];
  }
  // Preserve the source integer/float storage type and normalized flag while packing it.
  const original = attribute.data;
  const data = Array.isArray(original) ? values : new (original.constructor as { new(values: ArrayLike<number>): typeof original })(values);
  const { stride: _stride, offset: _offset, ...metadata } = attribute;
  return { ...metadata, data } as AuraCustomVertexAttributeSpec;
}

function boundsOf(positions: ArrayLike<number>): { min: AuraRootVec3; max: AuraRootVec3 } | undefined {
  if (!positions.length) return undefined;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const value = positions[i];
    if (!Number.isFinite(value)) throw new Error("Geometry positions must be finite.");
    min[i % 3] = Math.min(min[i % 3], value);
    max[i % 3] = Math.max(max[i % 3], value);
  }
  return { min, max };
}

function conservativeBounds(positions: ArrayLike<number>, authored: AuraCustomGeometrySpec["bounds"]): AuraCustomGeometrySpec["bounds"] {
  const computed = boundsOf(positions);
  if (!authored) return computed;
  if (!computed) return { min: [...authored.min] as AuraRootVec3, max: [...authored.max] as AuraRootVec3 };
  return {
    min: [Math.min(computed.min[0], authored.min[0]), Math.min(computed.min[1], authored.min[1]), Math.min(computed.min[2], authored.min[2])],
    max: [Math.max(computed.max[0], authored.max[0]), Math.max(computed.max[1], authored.max[1]), Math.max(computed.max[2], authored.max[2])]
  };
}

/**
 * Copy vertices according to new-to-old indices, including morphs and custom attributes.
 * `indexRemap`, when supplied, provides one output index for each original index entry.
 * Without it, references use the first copy of each old vertex. Group and draw ranges
 * address index entries, so they remain unchanged. Unreferenced vertices may be omitted.
 */
export function remapAuraGeometryVertices(spec: AuraCustomGeometrySpec, newToOld: readonly number[], indexRemap?: readonly number[]): AuraCustomGeometrySpec {
  const normalized = normalizeGeometryAttributes(spec);
  validateGeometryMetadata(spec, normalized);
  const oldIndices = indexStream(spec, normalized.vertexCount);
  const first = new Int32Array(normalized.vertexCount).fill(-1);
  newToOld.forEach((old, next) => {
    if (!Number.isInteger(old) || old < 0 || old >= normalized.vertexCount) throw new Error("Vertex remap is out of range.");
    if (first[old] < 0) first[old] = next;
  });
  if (indexRemap && indexRemap.length !== oldIndices.length) throw new Error("Index remap must match the source index count.");
  const newIndices = oldIndices.map((old, i) => {
    const next = indexRemap ? indexRemap[i] : first[old];
    if (!Number.isInteger(next) || next < 0 || next >= newToOld.length || newToOld[next] !== old) throw new Error("Index remap must reference a copy of the original vertex.");
    return next;
  });
  const attributes: Record<string, AuraCustomVertexAttributeSpec> = Object.create(null);
  for (const [name, attribute] of Object.entries(spec.attributes ?? {})) attributes[name] = copyCustom(attribute as AttributeLayout, normalized.vertexCount, newToOld);
  const positions = copyPacked(normalized.positions, 3, newToOld);
  const morphTargets = spec.morphTargets?.map((target) => {
    return {
      ...target,
      positions: copyPacked(target.positions, 3, newToOld),
      ...(target.normals !== undefined ? { normals: copyPacked(target.normals, 3, newToOld) } : {}),
      ...(target.tangents !== undefined ? { tangents: copyPacked(target.tangents, 3, newToOld) } : {})
    };
  });
  return {
    ...spec,
    positions,
    normals: normalized.normals ? copyPacked(normalized.normals, 3, newToOld) : undefined,
    uvs: normalized.uvs ? copyPacked(normalized.uvs, 2, newToOld) : undefined,
    uv1s: normalized.uv1s ? copyPacked(normalized.uv1s, 2, newToOld) : undefined,
    colors: normalized.colors ? copyPacked(normalized.colors, 4, newToOld) : undefined,
    attributes: spec.attributes ? attributes : undefined,
    morphTargets,
    indices: newToOld.length > 65536 ? Uint32Array.from(newIndices) : Uint16Array.from(newIndices),
    groups: spec.groups?.map((group) => ({ ...group })),
    drawRange: spec.drawRange ? { ...spec.drawRange } : undefined,
    bounds: conservativeBounds(positions, spec.bounds)
  };
}

export interface AuraWeldResult {
  readonly geometry: AuraCustomGeometrySpec;
  /** For each original vertex, the resulting vertex index. */
  readonly oldToNew: readonly number[];
  /** For each resulting vertex, its retained original vertex index. */
  readonly newToOld: readonly number[];
}

/** Weld nearby positions only when every other attribute and morph value agrees exactly. */
export function weldAuraGeometry(spec: AuraCustomGeometrySpec, tolerance = 1e-6): AuraWeldResult {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error("Weld tolerance must be finite and non-negative.");
  const normalized = normalizeGeometryAttributes(spec);
  validateGeometryMetadata(spec, normalized);
  boundsOf(normalized.positions);
  const extra: { data: ArrayLike<number>; itemSize: number; stride: number; offset: number }[] = [];
  if (normalized.normals) extra.push({ data: normalized.normals, itemSize: 3, stride: 3, offset: 0 });
  if (normalized.uvs) extra.push({ data: normalized.uvs, itemSize: 2, stride: 2, offset: 0 });
  if (normalized.uv1s) extra.push({ data: normalized.uv1s, itemSize: 2, stride: 2, offset: 0 });
  if (normalized.colors) extra.push({ data: normalized.colors, itemSize: 4, stride: 4, offset: 0 });
  for (const attr of Object.values(spec.attributes ?? {})) {
    const a = attr as AttributeLayout;
    const resolved = layout(a, normalized.vertexCount);
    extra.push({ data: a.data, itemSize: a.itemSize, stride: resolved.stride, offset: resolved.offset });
  }
  for (const target of spec.morphTargets ?? []) {
    extra.push({ data: target.positions, itemSize: 3, stride: 3, offset: 0 });
    if (target.normals) extra.push({ data: target.normals, itemSize: 3, stride: 3, offset: 0 });
    if (target.tangents) extra.push({ data: target.tangents, itemSize: 3, stride: 3, offset: 0 });
  }
  const position = normalized.positions;
  const buckets = new Map<string, number[]>();
  const newToOld: number[] = [];
  const oldToNew = new Array<number>(normalized.vertexCount);
  const same = (a: number, b: number): boolean => {
    if (Math.hypot(position[a * 3] - position[b * 3], position[a * 3 + 1] - position[b * 3 + 1], position[a * 3 + 2] - position[b * 3 + 2]) > tolerance) return false;
    for (const attr of extra) for (let c = 0; c < attr.itemSize; c++) {
      if (!Object.is(attr.data[a * attr.stride + attr.offset + c], attr.data[b * attr.stride + attr.offset + c])) return false;
    }
    return true;
  };
  for (let vertex = 0; vertex < normalized.vertexCount; vertex++) {
    const point = [position[vertex * 3], position[vertex * 3 + 1], position[vertex * 3 + 2]];
    const cell = tolerance === 0 ? point : point.map((value) => Math.floor(value / tolerance));
    let match = -1;
    const offsets = tolerance === 0 ? [0] : [-1, 0, 1];
    outer: for (const x of offsets) for (const y of offsets) for (const z of offsets) {
      const key = `${cell[0] + x},${cell[1] + y},${cell[2] + z}`;
      for (const candidate of buckets.get(key) ?? []) if (same(vertex, newToOld[candidate])) { match = candidate; break outer; }
    }
    if (match < 0) {
      match = newToOld.length;
      newToOld.push(vertex);
      const key = cell.join(",");
      const bucket = buckets.get(key) ?? [];
      bucket.push(match);
      buckets.set(key, bucket);
    }
    oldToNew[vertex] = match;
  }
  // Welding deliberately makes multiple old vertices share one output vertex.
  // Build a remap against the retained vertices, then replace the index stream.
  const retainedSource: AuraCustomGeometrySpec = { ...spec, indices: Uint32Array.from(newToOld), groups: undefined, drawRange: undefined };
  const retained = remapAuraGeometryVertices(retainedSource, newToOld);
  const indices = indexStream(spec, normalized.vertexCount).map((old) => oldToNew[old]);
  return { geometry: { ...retained, indices: newToOld.length > 65536 ? Uint32Array.from(indices) : Uint16Array.from(indices), groups: spec.groups?.map((g) => ({ ...g })), drawRange: spec.drawRange ? { ...spec.drawRange } : undefined }, oldToNew, newToOld };
}

/** Merge adjacent groups without reordering draw calls. Unchanged geometry buffers are shared. */
export function mergeAuraGeometryGroups(spec: AuraCustomGeometrySpec): AuraCustomGeometrySpec {
  validateGeometryMetadata(spec, normalizeGeometryAttributes(spec));
  const merged: { start: number; count: number; materialIndex?: number }[] = [];
  for (const group of spec.groups ?? []) {
    if (!Number.isInteger(group.start) || group.start < 0 || !Number.isInteger(group.count) || group.count < 0) throw new Error("Group ranges must be non-negative integers.");
    const previous = merged[merged.length - 1];
    if (previous && previous.start + previous.count === group.start && (previous.materialIndex ?? 0) === (group.materialIndex ?? 0)) previous.count += group.count;
    else merged.push({ ...group });
  }
  return { ...spec, groups: spec.groups ? merged : undefined };
}

/** Convert a triangle strip or fan to indexed triangles, preserving winding. */
export function convertAuraTriangleTopology(spec: AuraCustomGeometrySpec, sourceTopology: "triangles" | "triangle-strip" | "triangle-fan"): AuraCustomGeometrySpec {
  if (spec.topology && spec.topology !== "triangles") throw new Error("Triangle conversion requires triangle geometry.");
  const normalized = normalizeGeometryAttributes(spec);
  validateGeometryMetadata(spec, normalized);
  const source = indexStream(spec, normalized.vertexCount);
  if (sourceTopology === "triangles") {
    if (source.length % 3 !== 0) throw new Error("Triangle index count must be divisible by three.");
    return remapAuraGeometryVertices(spec, Array.from({ length: normalized.vertexCount }, (_, i) => i));
  }
  if (sourceTopology !== "triangle-strip" && sourceTopology !== "triangle-fan") throw new Error("Unsupported triangle topology.");
  // Group/draw boundaries start a new primitive; rejecting them avoids changing that meaning.
  if (spec.groups?.length || spec.drawRange) throw new Error("Strip/fan conversion with groups or draw range requires explicit segmentation.");
  const triangles: number[] = [];
  for (let i = 2; i < source.length; i++) {
    const a = sourceTopology === "triangle-fan" ? source[0] : source[i - 2];
    const b = source[i - 1];
    const c = source[i];
    if (a === b || b === c || a === c) continue;
    if (sourceTopology === "triangle-strip" && i % 2 === 1) triangles.push(b, a, c);
    else triangles.push(a, b, c);
  }
  // Empty indices mean non-indexed drawing in Aura geometry, so an empty list
  // would accidentally draw the source vertices rather than an empty mesh.
  if (triangles.length === 0) throw new Error("Triangle strip or fan has no non-degenerate triangles.");
  const copied = remapAuraGeometryVertices(spec, Array.from({ length: normalized.vertexCount }, (_, i) => i));
  return { ...copied, topology: "triangles", indices: normalized.vertexCount > 65536 ? Uint32Array.from(triangles) : Uint16Array.from(triangles) };
}

/** Evaluate relative morph deltas (the geometry default), or absolute targets, into an owned array. */
export function evaluateAuraMorphPositions(spec: AuraCustomGeometrySpec, weights: readonly number[], options: { readonly relative?: boolean } = {}): Float32Array {
  const normalized = normalizeGeometryAttributes(spec);
  assertGeometryMorphChannels(spec.morphTargets, normalized.vertexCount);
  const targets = spec.morphTargets ?? [];
  if (weights.length !== targets.length || weights.some((value) => !Number.isFinite(value))) throw new Error("Supply one finite weight per morph target.");
  const output = Float64Array.from(normalized.positions);
  targets.forEach((target, index) => {
    if (target.positions.length !== output.length) throw new Error("Morph target position count must match the geometry.");
    for (let i = 0; i < output.length; i++) {
      const value = target.positions[i];
      if (!Number.isFinite(value)) throw new Error("Morph target positions must be finite.");
      output[i] += weights[index] * (options.relative !== false ? value : value - normalized.positions[i]);
    }
  });
  const packed = Float32Array.from(output);
  if (packed.some((value) => !Number.isFinite(value))) throw new Error("Morph evaluation must produce finite float32 positions.");
  return packed;
}

/**
 * Calculate area-weighted normals at each triangle corner. A corner averages only
 * faces incident on the same source vertex and within creaseAngle radians of its
 * own face. The output duplicates corners, retaining groups, attributes and morphs.
 */
export function computeAuraCreasedNormals(spec: AuraCustomGeometrySpec, creaseAngle: number): AuraCustomGeometrySpec {
  if (!Number.isFinite(creaseAngle) || creaseAngle < 0 || creaseAngle > Math.PI) throw new Error("Crease angle must be between zero and pi radians.");
  if (spec.topology && spec.topology !== "triangles") throw new Error("Creased normals require triangle geometry.");
  const normalized = normalizeGeometryAttributes(spec);
  validateGeometryMetadata(spec, normalized);
  if (spec.morphTargets?.some((target) => target.normals !== undefined || target.tangents !== undefined)) {
    throw new Error("Creased normal recomputation cannot preserve morph normal or tangent deltas.");
  }
  const indices = indexStream(spec, normalized.vertexCount);
  if (indices.length % 3 !== 0) throw new Error("Triangle index count must be divisible by three.");
  const faces: [number, number, number][] = [];
  const incident: number[][] = Array.from({ length: normalized.vertexCount }, () => []);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
    const p = normalized.positions;
    const ab = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
    const ac = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
    faces.push([ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]);
    for (const vertex of new Set([a, b, c])) incident[vertex].push(i / 3);
  }
  const cosine = Math.cos(creaseAngle) - 1e-12;
  const normals = new Float32Array(indices.length * 3);
  for (let i = 0; i < indices.length; i++) {
    const face = faces[Math.floor(i / 3)];
    const faceLength = Math.hypot(...face);
    let x = 0, y = 0, z = 0;
    if (faceLength > 0) for (const neighborIndex of incident[indices[i]]) {
      const neighbor = faces[neighborIndex];
      const length = Math.hypot(...neighbor);
      if (length > 0 && (face[0] * neighbor[0] + face[1] * neighbor[1] + face[2] * neighbor[2]) / (faceLength * length) >= cosine) {
        x += neighbor[0]; y += neighbor[1]; z += neighbor[2];
      }
    }
    const length = Math.hypot(x, y, z);
    if (length > 0) { normals[i * 3] = x / length; normals[i * 3 + 1] = y / length; normals[i * 3 + 2] = z / length; }
  }
  const geometry = remapAuraGeometryVertices(spec, indices, indices.map((_, i) => i));
  return { ...geometry, normals };
}
