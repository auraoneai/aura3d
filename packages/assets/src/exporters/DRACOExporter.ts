import type { AuraExportAttribute, AuraExportPrimitive, AuraExportResult } from "./ExportContext";

/**
 * Standalone Draco capability: triangle meshes and point clouds, with named
 * per-point scalar/vector attributes. Lines, materials, rigs and morph targets
 * are not part of a standalone Draco stream. Position units and coordinates
 * are passed through unchanged. Quantization is opt-in and is reported.
 *
 * Encoding requires an injected encoder; importing this module never loads a
 * codec. `createDracoEncoder` adapts an already initialized Draco encoder
 * module and does not own the module itself.
 */
export type AuraDracoAttributeKind = "POSITION" | "NORMAL" | "COLOR" | "TEX_COORD" | "GENERIC";
export type AuraDracoValues = Float32Array | Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array;

export interface AuraDracoAttribute {
  readonly values: AuraDracoValues;
  readonly itemSize: number;
  readonly normalized: boolean;
}

export interface AuraDracoEncodeInput {
  readonly mode: "triangles" | "points";
  readonly vertexCount: number;
  readonly attributes: Readonly<Record<string, AuraDracoAttribute>>;
  /** Triangles use three indices per face; point-cloud indices are expanded. */
  readonly indices?: Uint32Array;
}

export interface AuraDracoEncodedData {
  readonly data: Uint8Array;
  /** Unique attribute IDs in the encoded stream, keyed by input semantic. */
  readonly attributeIds: Readonly<Record<string, number>>;
  /** Whether the codec preserved attribute sample values exactly. */
  readonly lossless?: boolean;
  /** Additional losses or limitations observed by a custom codec. */
  readonly warnings?: readonly AuraDracoDiagnostic[];
}

export interface AuraDracoEncodeOptions {
  readonly signal?: AbortSignal;
  readonly quantization?: Readonly<Partial<Record<AuraDracoAttributeKind, number>>>;
  readonly maxOutputBytes: number;
}

export interface AuraDracoEncoder {
  readonly supported?: boolean;
  encode(input: AuraDracoEncodeInput, options: AuraDracoEncodeOptions): AuraDracoEncodedData | Promise<AuraDracoEncodedData>;
}

export interface AuraDracoExportOptions {
  readonly encoder?: AuraDracoEncoder;
  readonly signal?: AbortSignal;
  /** Explicit lossy quantization for the requested Draco attribute classes. */
  readonly quantization?: Readonly<Partial<Record<AuraDracoAttributeKind, number>>>;
  readonly maxVertices?: number;
  readonly maxInputBytes?: number;
  readonly maxOutputBytes?: number;
  /** Safe file name for the sidecar that maps source semantics to Draco IDs. */
  readonly descriptorName?: string;
}

export interface AuraDracoExportResult extends AuraExportResult {
  readonly attributeIds: Readonly<Record<string, number>>;
}

export interface AuraDracoDiagnostic {
  readonly code: string;
  readonly path?: string;
  readonly message: string;
}

/** Failure with the same structured diagnostic shape as successful exports. */
export class DracoExportError extends Error {
  readonly code: string;
  readonly warnings: readonly AuraDracoDiagnostic[];

  constructor(code: string, message: string, path?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DracoExportError";
    this.code = code;
    this.warnings = [{ code, ...(path === undefined ? {} : { path }), message }];
  }
}

const DEFAULT_MAX_VERTICES = 1_000_000;
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
const DRACO_MAGIC = [0x44, 0x52, 0x41, 0x43, 0x4f];
const KINDS = ["POSITION", "NORMAL", "COLOR", "TEX_COORD", "GENERIC"] as const;
const MAX_UNSUPPORTED_PROPERTIES = 256;
const MAX_ATTRIBUTE_DESCRIPTORS = 256;

function fail(code: string, message: string, path?: string): never {
  throw new DracoExportError(code, message, path);
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) fail("EXPORT_CANCELLED", "Draco export was cancelled");
}

function awaitCodec<T>(value: T | PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(value);
  checkAbort(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener("abort", onAbort);
      reject(new DracoExportError("EXPORT_CANCELLED", "Draco export was cancelled"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    // A codec must use the provided signal to release its own resources. We
    // still settle this export immediately if a custom asynchronous codec does
    // not respond, and ignore any late result rather than transferring it.
    Promise.resolve(value).then(
      (result) => { signal.removeEventListener("abort", onAbort); resolve(result); },
      (error) => { signal.removeEventListener("abort", onAbort); reject(error); }
    );
    if (signal.aborted) onAbort();
  });
}

function checkedLimit(value: number | undefined, fallback: number, name: string): number {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit <= 0) fail("DRACO_INVALID_LIMIT", `${name} must be a positive safe integer`, name);
  return limit;
}

function attributeKind(name: string): AuraDracoAttributeKind {
  if (name === "POSITION") return "POSITION";
  if (name === "NORMAL") return "NORMAL";
  if (/^COLOR(?:_\d+)?$/.test(name)) return "COLOR";
  if (/^TEXCOORD(?:_\d+)?$/.test(name)) return "TEX_COORD";
  return "GENERIC";
}

function validateQuantization(quantization: AuraDracoExportOptions["quantization"]): void {
  if (!quantization) return;
  for (const [kind, bits] of Object.entries(quantization)) {
    if (!KINDS.includes(kind as AuraDracoAttributeKind) || !Number.isInteger(bits) || bits! < 1 || bits! > 30) {
      fail("DRACO_INVALID_QUANTIZATION", "Draco quantization requires a recognized attribute class and 1–30 bits", `quantization.${kind}`);
    }
  }
}

function validateDescriptorName(name: string): void {
  if (!name || name === "." || name === ".." || !/^[A-Za-z0-9._-]+$/.test(name)) {
    fail("DRACO_INVALID_DESCRIPTOR_NAME", "Descriptor name must be a single safe file name", "descriptorName");
  }
}

function valuesByteLength(attribute: AuraExportAttribute): number {
  // Ordinary JavaScript numbers are converted to float32 before encoding.
  return Array.isArray(attribute.values) ? attribute.values.length * 4 : (attribute.values as Exclude<typeof attribute.values, readonly number[]>).byteLength;
}

function checkedTotal(total: number, addition: number, limit: number): number {
  const next = total + addition;
  if (!Number.isSafeInteger(next) || next > limit) fail("DRACO_INPUT_LIMIT", `Draco input exceeds the ${limit}-byte limit`);
  return next;
}

function copyValues(attribute: AuraExportAttribute, path: string, warnings: AuraDracoDiagnostic[]): AuraDracoValues {
  const source = attribute.values;
  for (let index = 0; index < source.length; index += 1) {
    if (!Number.isFinite(source[index])) fail("DRACO_INVALID_ATTRIBUTE", `Non-finite component at index ${index}`, path);
  }
  if (Array.isArray(source)) {
    const output = Float32Array.from(source);
    if (output.some((value) => !Number.isFinite(value))) fail("DRACO_INVALID_ATTRIBUTE", "Attribute cannot be represented as float32", path);
    if (source.some((value, index) => value !== output[index])) {
      warnings.push({ code: "DRACO_FLOAT32_CONVERSION", path, message: "Number-array values were rounded to float32 for Draco encoding." });
    }
    return output;
  }
  if (source instanceof Float32Array) return source.slice();
  if (source instanceof Int8Array) return source.slice();
  if (source instanceof Uint8Array) return source.slice();
  if (source instanceof Int16Array) return source.slice();
  if (source instanceof Uint16Array) return source.slice();
  if (source instanceof Uint32Array) return source.slice();
  return fail("DRACO_UNSUPPORTED_ATTRIBUTE_TYPE", "Use a supported numeric typed array or number array", path);
}

function expandedPointValues(values: AuraDracoValues, itemSize: number, indices: Uint32Array): AuraDracoValues {
  const constructor = values.constructor as { new (length: number): AuraDracoValues };
  const expanded = new constructor(indices.length * itemSize);
  for (let point = 0; point < indices.length; point += 1) {
    for (let component = 0; component < itemSize; component += 1) {
      expanded[point * itemSize + component] = values[indices[point] * itemSize + component];
    }
  }
  return expanded;
}

/** JS and JSON callers can supply fields absent from the TypeScript contract. */
function warnUnsupportedProperties(primitive: AuraExportPrimitive, warnings: AuraDracoDiagnostic[]): void {
  let count = 0;
  let descriptors = 0;
  let truncated = false;
  const check = (object: unknown, allowed: readonly string[], path: string): void => {
    if (!object || typeof object !== "object" || Array.isArray(object) || truncated) return;
    for (const key in object) {
      if (!Object.prototype.hasOwnProperty.call(object, key) || allowed.includes(key)) continue;
      if (count >= MAX_UNSUPPORTED_PROPERTIES) { truncated = true; break; }
      warnings.push({ code: "UNSUPPORTED_PROPERTY", path: `${path}.${key}`, message: "The property is not represented by the export primitive contract." });
      count += 1;
    }
  };
  const checkAttribute = (attribute: unknown, path: string): void => {
    if (descriptors >= MAX_ATTRIBUTE_DESCRIPTORS) { truncated = true; return; }
    descriptors += 1;
    check(attribute, ["values", "itemSize", "normalized"], path);
  };
  check(primitive, ["attributes", "indices", "mode", "material", "targets"], "primitive");
  for (const [semantic, attribute] of Object.entries(primitive.attributes)) {
    if (truncated) break;
    checkAttribute(attribute, `attributes.${semantic}`);
  }
  // Targets are omitted as a whole, but reporting their unknown descriptor
  // properties also tells callers what would be lost from their JS input.
  if (Array.isArray(primitive.targets)) {
    for (let index = 0; index < primitive.targets.length && !truncated; index += 1) {
      if (index >= MAX_ATTRIBUTE_DESCRIPTORS) { truncated = true; break; }
      const target = primitive.targets[index];
      if (!target || typeof target !== "object" || Array.isArray(target)) continue;
      for (const semantic in target) {
        if (truncated) break;
        if (Object.prototype.hasOwnProperty.call(target, semantic)) checkAttribute(target[semantic], `targets[${index}].${semantic}`);
      }
    }
  }
  if (truncated) warnings.push({ code: "DIAGNOSTICS_TRUNCATED", message: "Additional unsupported properties or attribute descriptors were not individually inspected." });
}

/** Encode a single primitive. The optional injected codec must return actual Draco bytes. */
export async function exportDRACO(primitive: AuraExportPrimitive, options: AuraDracoExportOptions = {}): Promise<AuraDracoExportResult> {
  checkAbort(options.signal);
  const encoder = options.encoder;
  if (!encoder || (encoder.supported !== undefined && encoder.supported !== true) || typeof encoder.encode !== "function") {
    fail("DRACO_ENCODER_UNAVAILABLE", "Provide an initialized optional Draco encoder via options.encoder");
  }
  const maxVertices = checkedLimit(options.maxVertices, DEFAULT_MAX_VERTICES, "maxVertices");
  const maxInputBytes = checkedLimit(options.maxInputBytes, DEFAULT_MAX_BYTES, "maxInputBytes");
  const maxOutputBytes = checkedLimit(options.maxOutputBytes, DEFAULT_MAX_BYTES, "maxOutputBytes");
  const descriptorName = options.descriptorName ?? "geometry.attributes.json";
  validateDescriptorName(descriptorName);
  validateQuantization(options.quantization);
  if (!primitive || !primitive.attributes || typeof primitive.attributes !== "object") fail("DRACO_INVALID_PRIMITIVE", "Primitive attributes are required");
  const mode = primitive.mode ?? "triangles";
  if (mode !== "triangles" && mode !== "points") {
    fail("DRACO_UNSUPPORTED_TOPOLOGY", "Standalone Draco supports triangles and points; it cannot preserve indexed lines", "mode");
  }
  const position = primitive.attributes.POSITION;
  if (!position || position.itemSize !== 3) fail("DRACO_INVALID_POSITION", "POSITION must contain three components per vertex", "attributes.POSITION");
  if (!position.values || position.values.length % 3 !== 0) fail("DRACO_INVALID_POSITION", "POSITION component count must be divisible by three", "attributes.POSITION");
  const vertexCount = position.values.length / 3;
  if (vertexCount === 0 || vertexCount > maxVertices) fail("DRACO_VERTEX_LIMIT", `Vertex count must be between 1 and ${maxVertices}`, "attributes.POSITION");
  const entries = Object.entries(primitive.attributes);
  if (entries.length > 128) fail("DRACO_ATTRIBUTE_LIMIT", "At most 128 attributes are supported");
  const warnings: AuraDracoDiagnostic[] = [];
  let inputBytes = 0;
  const attributes: Record<string, AuraDracoAttribute> = Object.create(null);
  for (const [semantic, attribute] of entries) {
    checkAbort(options.signal);
    const path = `attributes.${semantic}`;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(semantic)) fail("DRACO_INVALID_ATTRIBUTE_NAME", "Attribute semantic is not a valid identifier", path);
    if (!attribute || !attribute.values || !Number.isInteger(attribute.itemSize) || attribute.itemSize < 1 || attribute.itemSize > 4) {
      fail("DRACO_INVALID_ATTRIBUTE", "Attributes require one to four components per vertex", path);
    }
    if (attribute.values.length !== vertexCount * attribute.itemSize) fail("DRACO_INVALID_ATTRIBUTE", "All attributes must have the POSITION vertex count", path);
    if (semantic === "NORMAL" && attribute.itemSize !== 3) fail("DRACO_INVALID_ATTRIBUTE", "NORMAL must have three components", path);
    if (/^TEXCOORD(?:_\d+)?$/.test(semantic) && attribute.itemSize !== 2) fail("DRACO_INVALID_ATTRIBUTE", "Texture coordinates must have two components", path);
    if (/^COLOR(?:_\d+)?$/.test(semantic) && attribute.itemSize !== 3 && attribute.itemSize !== 4) fail("DRACO_INVALID_ATTRIBUTE", "Colors must have three or four components", path);
    if (attribute.normalized && (Array.isArray(attribute.values) || attribute.values instanceof Float32Array)) {
      fail("DRACO_INVALID_NORMALIZATION", "Only integer attributes can be normalized", path);
    }
    inputBytes = checkedTotal(inputBytes, valuesByteLength(attribute), maxInputBytes);
    attributes[semantic] = { values: copyValues(attribute, path, warnings), itemSize: attribute.itemSize, normalized: attribute.normalized === true };
  }
  warnUnsupportedProperties(primitive, warnings);

  const rawIndices = primitive.indices;
  let indices: Uint32Array | undefined;
  if (rawIndices !== undefined) {
    if (!Array.isArray(rawIndices) && !(rawIndices instanceof Uint8Array) && !(rawIndices instanceof Uint16Array) && !(rawIndices instanceof Uint32Array)) {
      fail("DRACO_INVALID_INDICES", "Indices must be unsigned integer values", "indices");
    }
    if (rawIndices.length === 0) fail("DRACO_INVALID_INDICES", "An explicitly indexed primitive cannot have zero indices", "indices");
    if (mode === "points" && rawIndices.length > maxVertices) fail("DRACO_VERTEX_LIMIT", `Expanded point count exceeds ${maxVertices}`, "indices");
    inputBytes = checkedTotal(inputBytes, rawIndices.length * 4, maxInputBytes);
    indices = new Uint32Array(rawIndices.length);
    for (let index = 0; index < rawIndices.length; index += 1) {
      const value = rawIndices[index];
      if (!Number.isSafeInteger(value) || value < 0 || value >= vertexCount) fail("DRACO_INVALID_INDICES", `Index ${index} is outside the vertex range`, "indices");
      indices[index] = value;
    }
  } else if (mode === "triangles") {
    inputBytes = checkedTotal(inputBytes, vertexCount * 4, maxInputBytes);
    indices = Uint32Array.from({ length: vertexCount }, (_, index) => index);
  }
  if (mode === "triangles" && indices!.length % 3 !== 0) fail("DRACO_INVALID_INDICES", "Triangle indices must be a multiple of three", "indices");
  let encodedVertexCount = vertexCount;
  if (mode === "points" && indices) {
    encodedVertexCount = indices.length;
    for (const [semantic, attribute] of Object.entries(attributes)) {
      inputBytes = checkedTotal(inputBytes, indices.length * attribute.itemSize * attribute.values.BYTES_PER_ELEMENT, maxInputBytes);
      attributes[semantic] = { ...attribute, values: expandedPointValues(attribute.values, attribute.itemSize, indices) };
    }
    warnings.push({ code: "DRACO_POINT_INDICES_EXPANDED", path: "indices", message: "Indexed points were expanded; the original index buffer and unused vertices are not stored." });
    indices = undefined;
  }
  if (primitive.material !== undefined) warnings.push({ code: "DRACO_MATERIAL_OMITTED", path: "material", message: "Standalone Draco does not store material bindings." });
  if (primitive.targets && primitive.targets.length > 0) warnings.push({ code: "DRACO_MORPH_TARGETS_OMITTED", path: "targets", message: "Standalone Draco does not store morph targets." });
  if (mode === "triangles") warnings.push({ code: "DRACO_VERTEX_ORDER", message: "The codec may reorder vertices and faces or discard unused vertices; original buffer indices are not preserved." });
  for (const [kind, bits] of Object.entries(options.quantization ?? {})) {
    if (entries.some(([semantic]) => attributeKind(semantic) === kind)) warnings.push({ code: "DRACO_LOSSY_QUANTIZATION", path: `quantization.${kind}`, message: `${kind} attributes use lossy ${bits}-bit quantization.` });
  }
  const input: AuraDracoEncodeInput = { mode, vertexCount: encodedVertexCount, attributes, ...(indices ? { indices } : {}) };
  let encoded: AuraDracoEncodedData;
  try {
    encoded = await awaitCodec(encoder.encode(input, { signal: options.signal, quantization: options.quantization, maxOutputBytes }), options.signal);
  } catch (error) {
    checkAbort(options.signal);
    if (error instanceof DracoExportError) throw error;
    throw new DracoExportError("DRACO_ENCODER_FAILED", "The Draco encoder failed", undefined, { cause: error });
  }
  checkAbort(options.signal);
  if (!(encoded?.data instanceof Uint8Array) || encoded.data.byteLength < 11 || DRACO_MAGIC.some((byte, i) => encoded.data[i] !== byte)) {
    fail("DRACO_INVALID_ENCODER_OUTPUT", "The encoder did not return a valid Draco stream header");
  }
  if (encoded.data.byteLength > maxOutputBytes) fail("DRACO_OUTPUT_LIMIT", `Encoded output exceeds the ${maxOutputBytes}-byte limit`);
  if (!encoded.attributeIds || typeof encoded.attributeIds !== "object") fail("DRACO_INVALID_ENCODER_OUTPUT", "The encoder must return attribute IDs");
  if (encoded.lossless !== undefined && typeof encoded.lossless !== "boolean") fail("DRACO_INVALID_ENCODER_OUTPUT", "Encoder lossless must be a boolean when present");
  if (encoded.warnings !== undefined && (!Array.isArray(encoded.warnings) || encoded.warnings.some((warning) => !warning || typeof warning.code !== "string" || typeof warning.message !== "string" || (warning.path !== undefined && typeof warning.path !== "string")))) {
    fail("DRACO_INVALID_ENCODER_OUTPUT", "Encoder warnings must contain structured diagnostics");
  }
  if (encoded.warnings) warnings.push(...encoded.warnings);
  if (encoded.lossless === false) warnings.push({ code: "DRACO_LOSSY_ENCODING", message: "The supplied Draco codec reports lossy attribute encoding." });
  else if (encoded.lossless !== true) warnings.push({ code: "DRACO_CODEC_LOSS_UNSPECIFIED", message: "The supplied Draco codec did not declare whether attribute samples are preserved exactly." });
  const attributeIds: Record<string, number> = Object.create(null);
  const usedIds = new Set<number>();
  for (const semantic of Object.keys(attributes)) {
    const id = encoded.attributeIds[semantic];
    if (!Number.isSafeInteger(id) || id < 0 || usedIds.has(id)) fail("DRACO_INVALID_ENCODER_OUTPUT", `Missing or duplicate encoded attribute ID for ${semantic}`);
    attributeIds[semantic] = id;
    usedIds.add(id);
  }
  const descriptor = {
    format: "aura3d-draco-attributes",
    version: 1,
    mode,
    attributes: Object.fromEntries(Object.entries(attributes).map(([name, attribute]) => [name, {
      id: attributeIds[name], itemSize: attribute.itemSize, componentType: attribute.values.constructor.name, normalized: attribute.normalized
    }]))
  };
  warnings.push({ code: "DRACO_ATTRIBUTE_DESCRIPTOR", path: descriptorName, message: "Keep the attribute descriptor with the stream to recover source attribute names and normalization." });
  return {
    data: encoded.data.slice(),
    mimeType: "application/octet-stream",
    warnings,
    dependencies: [{ name: descriptorName, data: new TextEncoder().encode(JSON.stringify(descriptor)) }],
    attributeIds
  };
}

/** Minimal ABI used by the optional Draco encoder adapter. */
export interface AuraDracoEncoderModule {
  readonly POSITION: number;
  readonly NORMAL: number;
  readonly COLOR: number;
  readonly TEX_COORD: number;
  readonly GENERIC: number;
  readonly Mesh: new () => object;
  readonly PointCloud: new () => object;
  readonly MeshBuilder: new () => AuraDracoBuilder & { AddFacesToMesh(mesh: object, faceCount: number, indices: Uint32Array): boolean };
  readonly PointCloudBuilder: new () => AuraDracoBuilder;
  readonly Encoder: new () => {
    SetAttributeQuantization(kind: number, bits: number): void;
    EncodeMeshToDracoBuffer(mesh: object, output: AuraDracoOutputArray): number;
    EncodePointCloudToDracoBuffer(cloud: object, deduplicate: boolean, output: AuraDracoOutputArray): number;
  };
  readonly DracoInt8Array: new () => AuraDracoOutputArray;
  destroy(object: object): void;
}

export interface AuraDracoOutputArray {
  size(): number;
  GetValue(index: number): number;
}

export interface AuraDracoBuilder {
  AddFloatAttribute(object: object, kind: number, count: number, itemSize: number, values: Float32Array): number;
  AddInt8Attribute(object: object, kind: number, count: number, itemSize: number, values: Int8Array): number;
  AddUInt8Attribute(object: object, kind: number, count: number, itemSize: number, values: Uint8Array): number;
  AddInt16Attribute(object: object, kind: number, count: number, itemSize: number, values: Int16Array): number;
  AddUInt16Attribute(object: object, kind: number, count: number, itemSize: number, values: Uint16Array): number;
  AddUInt32Attribute(object: object, kind: number, count: number, itemSize: number, values: Uint32Array): number;
  SetNormalizedFlagForAttribute(object: object, id: number, normalized: boolean): boolean;
}

/** Adapt an initialized, caller-owned Draco encoder module. */
export function createDracoEncoder(module: AuraDracoEncoderModule): AuraDracoEncoder {
  return {
    encode(input, options) {
      checkAbort(options.signal);
      const allocated: object[] = [];
      const track = <T extends object>(value: T): T => { allocated.push(value); return value; };
      let failed = false;
      try {
        const geometry = track(input.mode === "triangles" ? new module.Mesh() : new module.PointCloud());
        const builder = track(input.mode === "triangles" ? new module.MeshBuilder() : new module.PointCloudBuilder());
        const encoder = track(new module.Encoder());
        const output = track(new module.DracoInt8Array());
        const ids: Record<string, number> = Object.create(null);
        for (const [name, attribute] of Object.entries(input.attributes)) {
          checkAbort(options.signal);
          const kind = module[attributeKind(name)];
          const values = attribute.values;
          let id: number;
          if (values instanceof Float32Array) id = builder.AddFloatAttribute(geometry, kind, input.vertexCount, attribute.itemSize, values);
          else if (values instanceof Int8Array) id = builder.AddInt8Attribute(geometry, kind, input.vertexCount, attribute.itemSize, values);
          else if (values instanceof Uint8Array) id = builder.AddUInt8Attribute(geometry, kind, input.vertexCount, attribute.itemSize, values);
          else if (values instanceof Int16Array) id = builder.AddInt16Attribute(geometry, kind, input.vertexCount, attribute.itemSize, values);
          else if (values instanceof Uint16Array) id = builder.AddUInt16Attribute(geometry, kind, input.vertexCount, attribute.itemSize, values);
          else id = builder.AddUInt32Attribute(geometry, kind, input.vertexCount, attribute.itemSize, values);
          if (!Number.isInteger(id) || id < 0) fail("DRACO_ENCODER_FAILED", `Codec could not add attribute ${name}`, `attributes.${name}`);
          if (attribute.normalized && !builder.SetNormalizedFlagForAttribute(geometry, id, true)) {
            fail("DRACO_ENCODER_FAILED", `Codec could not preserve normalization for ${name}`, `attributes.${name}`);
          }
          ids[name] = id;
        }
        if (input.mode === "triangles" && !(builder as InstanceType<AuraDracoEncoderModule["MeshBuilder"]>).AddFacesToMesh(geometry, input.indices!.length / 3, input.indices!)) {
          fail("DRACO_ENCODER_FAILED", "Codec could not add triangle faces", "indices");
        }
        for (const [kind, bits] of Object.entries(options.quantization ?? {})) encoder.SetAttributeQuantization(module[kind as AuraDracoAttributeKind], bits);
        checkAbort(options.signal);
        const length = input.mode === "triangles"
          ? encoder.EncodeMeshToDracoBuffer(geometry, output)
          : encoder.EncodePointCloudToDracoBuffer(geometry, false, output);
        checkAbort(options.signal);
        if (!Number.isSafeInteger(length) || length <= 0 || length !== output.size()) fail("DRACO_ENCODER_FAILED", "Codec did not produce a complete Draco stream");
        if (length > options.maxOutputBytes) fail("DRACO_OUTPUT_LIMIT", `Encoded output exceeds the ${options.maxOutputBytes}-byte limit`);
        const data = new Uint8Array(length);
        for (let index = 0; index < length; index += 1) data[index] = output.GetValue(index);
        const quantizedKinds = Object.keys(options.quantization ?? {});
        const quantized = Object.keys(input.attributes).some((name) => quantizedKinds.includes(attributeKind(name)));
        // The adapter can identify requested quantization, but its injected
        // module's default encoding behavior is not independently verified.
        return { data, attributeIds: ids, ...(quantized ? { lossless: false } : {}) };
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        let cleanupError: unknown;
        for (let index = allocated.length - 1; index >= 0; index -= 1) {
          try {
            module.destroy(allocated[index]);
          } catch (error) {
            cleanupError ??= error;
          }
        }
        if (cleanupError !== undefined && !failed) {
          throw new DracoExportError("DRACO_CLEANUP_FAILED", "Codec resource cleanup failed", undefined, { cause: cleanupError });
        }
      }
    }
  };
}
