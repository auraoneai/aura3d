import type { AuraExportResult, AuraExportWarning } from "./ExportContext";

/** Native KTX2 formats. Every level is tightly packed in layer, face, depth,
 * row, pixel order; half and float words are supplied little-endian. */
export type AuraKTX2Format = "r8unorm" | "rg8unorm" | "rgba8unorm" | "rgba8unorm-srgb" | "rgba16float" | "rgba32float";
export type AuraKTX2Orientation = "rd" | "ru" | "rdi" | "rdo" | "rui" | "ruo";
export type AuraKTX2Encoding = "none" | "basis-etc1s" | "basis-uastc" | "zstd" | "zlib";
export interface AuraKTX2Level { readonly data: Uint8Array }
export interface AuraKTX2Texture {
  readonly width: number;
  readonly height: number;
  /** Omit for 2D; specify for a 3D texture. 3D cannot be an array or cube. */
  readonly depth?: number;
  /** Omit for non-array; specify 1 or more for an array. */
  readonly layers?: number;
  /** Cube faces, in +X, -X, +Y, -Y, +Z, -Z order. */
  readonly faces?: 1 | 6;
  readonly format: AuraKTX2Format;
  /** Full-resolution level first. Dimensions halve, with a minimum of one. */
  readonly levels: readonly AuraKTX2Level[];
  /** Color primaries, if known. Linear and data textures default unspecified;
   * the sRGB Vulkan format defaults to its standard BT.709 primaries. */
  readonly colorPrimaries?: "bt709" | "unspecified";
  /** X is right, Y down/up, and, for 3D, Z in/out. */
  readonly orientation?: AuraKTX2Orientation;
  /** UTF-8 metadata, for example source, author and license. */
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface AuraKTX2EncodeResult {
  /** Complete KTX2 container encoded by the codec. */
  readonly data: Uint8Array;
  /** Declare whether texture samples survive this codec exactly. */
  readonly lossless?: boolean;
  readonly warnings?: readonly AuraExportWarning[];
}
export interface AuraKTX2Encoder {
  readonly name: string;
  supports(texture: AuraKTX2Texture, encoding: AuraKTX2Encoding): boolean;
  /** A codec owns its transient resources and must honor the signal. */
  encode(texture: AuraKTX2Texture, options: { readonly encoding: AuraKTX2Encoding; readonly signal?: AbortSignal; readonly maxBytes: number }): AuraKTX2EncodeResult | Promise<AuraKTX2EncodeResult>;
}
export interface AuraKTX2ExportOptions {
  /** `none` emits raw Vulkan layouts; other names need an injected encoder. */
  readonly encoding?: AuraKTX2Encoding;
  readonly encoder?: AuraKTX2Encoder;
  readonly signal?: AbortSignal;
  readonly maxBytes?: number;
}
export class KTX2ExportError extends Error {
  readonly warnings: readonly AuraExportWarning[];
  constructor(readonly code: string, message: string, path?: string) {
    super(message);
    this.name = "KTX2ExportError";
    this.warnings = [{ code, ...(path === undefined ? {} : { path }), message }];
  }
}

const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
const IDENTIFIER = Uint8Array.of(0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a);
const textEncoder = new TextEncoder();
const FORMAT: Readonly<Record<AuraKTX2Format, { readonly vk: number; readonly components: number; readonly componentBytes: number; readonly float: boolean; readonly srgb: boolean }>> = {
  "r8unorm": { vk: 9, components: 1, componentBytes: 1, float: false, srgb: false },
  "rg8unorm": { vk: 16, components: 2, componentBytes: 1, float: false, srgb: false },
  "rgba8unorm": { vk: 37, components: 4, componentBytes: 1, float: false, srgb: false },
  "rgba8unorm-srgb": { vk: 43, components: 4, componentBytes: 1, float: false, srgb: true },
  "rgba16float": { vk: 97, components: 4, componentBytes: 2, float: true, srgb: false },
  "rgba32float": { vk: 109, components: 4, componentBytes: 4, float: true, srgb: false }
};
function fail(code: string, message: string, path?: string): never { throw new KTX2ExportError(code, message, path); }
function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) fail("EXPORT_CANCELLED", "KTX2 export was cancelled"); }
function align(value: number, multiple: number): number { return Math.ceil(value / multiple) * multiple; }
function limit(value: number | undefined): number {
  const n = value ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(n) || n <= 0) fail("KTX2_INVALID_LIMIT", "maxBytes must be a positive safe integer", "maxBytes");
  return n;
}
function dimensions(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 0xffffffff) fail("KTX2_INVALID_DIMENSIONS", `${name} must be a positive 32-bit integer`, name);
}

/** Report JS/JSON properties that are outside the portable source contract.
 * Metadata is intentionally an open string dictionary, and mip payload bytes
 * are opaque. Limit the result so malformed inputs cannot flood diagnostics. */
function unsupportedProperties(texture: AuraKTX2Texture, options: AuraKTX2ExportOptions): AuraExportWarning[] {
  const warnings: AuraExportWarning[] = [];
  let omitted = 0;
  const check = (value: object, allowed: readonly string[], path: string): void => {
    for (const key of Object.keys(value)) {
      if (allowed.includes(key)) continue;
      if (warnings.length >= 256) { omitted++; continue; }
      const boundedKey = key.length <= 256 ? key : `${key.slice(0, 256)}…`;
      warnings.push({ code: "UNSUPPORTED_PROPERTY", path: `${path}.${boundedKey}`, message: "The property is not represented by the KTX2 export contract and may be omitted." });
    }
  };
  check(texture, ["width", "height", "depth", "layers", "faces", "format", "levels", "orientation", "colorPrimaries", "metadata"], "texture");
  texture.levels.forEach((level, index) => check(level, ["data"], `levels[${index}]`));
  check(options, ["encoding", "encoder", "signal", "maxBytes"], "options");
  if (omitted) warnings.push({ code: "DIAGNOSTICS_TRUNCATED", message: `${omitted} additional unsupported properties were not individually reported.` });
  return warnings;
}

function validateTexture(texture: AuraKTX2Texture, maxBytes: number): void {
  if (!texture || typeof texture !== "object") fail("KTX2_INVALID_TEXTURE", "Texture input is required");
  dimensions(texture.width, "width"); dimensions(texture.height, "height");
  if (texture.depth !== undefined) dimensions(texture.depth, "depth");
  if (texture.layers !== undefined) dimensions(texture.layers, "layers");
  const faces = texture.faces ?? 1;
  if (faces !== 1 && faces !== 6) fail("KTX2_INVALID_FACES", "A texture has one or six faces", "faces");
  if (faces === 6 && (texture.width !== texture.height || texture.depth !== undefined)) fail("KTX2_INVALID_CUBEMAP", "Cubemap faces must be square and cannot have depth");
  if (texture.depth !== undefined && texture.layers !== undefined) fail("KTX2_INVALID_LAYOUT", "3D array textures are not supported");
  if (!Object.prototype.hasOwnProperty.call(FORMAT, texture.format)) fail("KTX2_UNSUPPORTED_FORMAT", `Unsupported source format: ${String(texture.format)}`, "format");
  const format = FORMAT[texture.format];
  const maxLevels = Math.floor(Math.log2(Math.max(texture.width, texture.height, texture.depth ?? 1))) + 1;
  if (!Array.isArray(texture.levels) || texture.levels.length < 1 || texture.levels.length > Math.min(maxLevels, 32)) fail("KTX2_INVALID_LEVELS", "Supply a valid nonempty mip chain", "levels");
  let total = 0;
  for (let i = 0; i < texture.levels.length; i++) {
    const data = texture.levels[i]?.data;
    const width = Math.max(1, Math.floor(texture.width / (2 ** i)));
    const height = Math.max(1, Math.floor(texture.height / (2 ** i)));
    const depth = Math.max(1, Math.floor((texture.depth ?? 1) / (2 ** i)));
    const expected = width * height * depth * (texture.layers ?? 1) * faces * format.components * format.componentBytes;
    if (!Number.isSafeInteger(expected) || expected > maxBytes || !(data instanceof Uint8Array) || data.byteLength !== expected) fail("KTX2_LEVEL_SIZE", `Level ${i} must contain exactly ${expected} bytes`, `levels.${i}`);
    total += expected;
    if (!Number.isSafeInteger(total) || total * 2 + 65536 > maxBytes) fail("KTX2_MEMORY_LIMIT", "Texture exceeds maxBytes including output and working memory");
  }
  if (texture.orientation !== undefined && !(texture.depth === undefined ? /^(rd|ru)$/ : /^(rdi|rdo|rui|ruo)$/).test(texture.orientation)) fail("KTX2_INVALID_ORIENTATION", "Orientation must specify each texture dimension", "orientation");
  if (texture.colorPrimaries !== undefined && texture.colorPrimaries !== "bt709" && texture.colorPrimaries !== "unspecified") fail("KTX2_INVALID_PRIMARIES", "Unsupported color primaries", "colorPrimaries");
  if (format.srgb && texture.colorPrimaries === "unspecified") fail("KTX2_INVALID_PRIMARIES", "The sRGB Vulkan format uses BT.709 color primaries", "colorPrimaries");
  if (texture.metadata !== undefined) {
    if (!texture.metadata || typeof texture.metadata !== "object" || Array.isArray(texture.metadata)) fail("KTX2_INVALID_METADATA", "Metadata must be a string dictionary", "metadata");
    let size = 0;
    for (const [key, value] of Object.entries(texture.metadata)) {
      if (!key || key.includes("\0") || typeof value !== "string" || value.includes("\0")) fail("KTX2_INVALID_METADATA", "Metadata keys and values must be NUL-free strings", `metadata.${key}`);
      if (key === "KTXorientation") fail("KTX2_INVALID_METADATA", "Set orientation through the orientation property", `metadata.${key}`);
      if (key === "KTXwriter") fail("KTX2_INVALID_METADATA", "KTXwriter is generated by the exporter", `metadata.${key}`);
      if (key.length + value.length > 65536) fail("KTX2_METADATA_LIMIT", "Metadata exceeds 64 KiB");
      size += align(4 + textEncoder.encode(key).length + textEncoder.encode(value).length + 2, 4);
      if (size > 65536) fail("KTX2_METADATA_LIMIT", "Metadata exceeds 64 KiB");
    }
  }
}
function makeDFD(format: typeof FORMAT[AuraKTX2Format], primaries: AuraKTX2Texture["colorPrimaries"]): Uint8Array {
  // Khronos basic data-format descriptor, one sample per channel. Component
  // bit order follows the Vulkan RGBA layouts declared by vkFormat.
  const blockSize = 24 + format.components * 16;
  const dfd = new Uint8Array(4 + blockSize);
  const v = new DataView(dfd.buffer);
  v.setUint32(0, dfd.length, true);
  v.setUint16(8, 2, true); // KHR_DF_VERSION
  v.setUint16(10, blockSize, true);
  v.setUint8(12, 1); // RGBSDA
  v.setUint8(13, primaries === "bt709" || (primaries === undefined && format.srgb) ? 1 : 0);
  v.setUint8(14, format.srgb ? 2 : 1);
  v.setUint8(20, format.components * format.componentBytes);
  for (let c = 0; c < format.components; c++) {
    const at = 28 + c * 16;
    v.setUint16(at, c * format.componentBytes * 8, true);
    v.setUint8(at + 2, format.componentBytes * 8 - 1);
    const channel = c === 3 ? 15 : c;
    v.setUint8(at + 3, channel | (format.float ? 0xc0 : 0) | (format.srgb && c === 3 ? 0x10 : 0));
    v.setUint32(at + 8, format.float ? 0xbf800000 : 0, true);
    v.setUint32(at + 12, format.float ? 0x3f800000 : 255, true);
  }
  return dfd;
}
function makeKVD(texture: AuraKTX2Texture): Uint8Array {
  if (texture.metadata && Object.prototype.hasOwnProperty.call(texture.metadata, "KTXorientation")) fail("KTX2_INVALID_METADATA", "Set the orientation property instead of KTXorientation metadata", "metadata.KTXorientation");
  const metadata: Record<string, string> = { KTXwriter: "Aura3D", ...(texture.metadata ?? {}) };
  if (texture.orientation !== undefined) metadata.KTXorientation = texture.orientation;
  const records: Uint8Array[] = [];
  let total = 0;
  for (const key of Object.keys(metadata).sort()) {
    const value = metadata[key];
    if (!key || key.includes("\0") || typeof value !== "string" || value.includes("\0")) fail("KTX2_INVALID_METADATA", "Metadata keys and values must be NUL-free strings", `metadata.${key}`);
    if (key.length + value.length > 65536) fail("KTX2_METADATA_LIMIT", "Metadata exceeds 64 KiB");
    const bytes = textEncoder.encode(`${key}\0${value}\0`);
    const size = align(4 + bytes.length, 4);
    if (size > 65536 || total + size > 65536) fail("KTX2_METADATA_LIMIT", "Metadata exceeds 64 KiB");
    const record = new Uint8Array(size);
    new DataView(record.buffer).setUint32(0, bytes.length, true);
    record.set(bytes, 4);
    records.push(record); total += size;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const record of records) { out.set(record, offset); offset += record.length; }
  return out;
}
function writeRaw(texture: AuraKTX2Texture, maxBytes: number, signal?: AbortSignal): Uint8Array {
  const format = FORMAT[texture.format];
  const dfd = makeDFD(format, texture.colorPrimaries);
  const kvd = makeKVD(texture);
  const indexEnd = 80 + 24 * texture.levels.length;
  const dfdOffset = indexEnd;
  const kvdOffset = align(dfdOffset + dfd.length, 4);
  // Each mip offset is aligned to the least common multiple of 4 and the
  // uncompressed texel-block size. All supported block sizes are powers of 2.
  const levelAlignment = Math.max(4, format.components * format.componentBytes);
  const dataStart = align(kvdOffset + kvd.length, levelAlignment);
  const offsets: number[] = [];
  let cursor = dataStart;
  // KTX2 stores smallest mip first for streaming, although the index is largest first.
  for (let i = texture.levels.length - 1; i >= 0; i--) {
    cursor = align(cursor, levelAlignment);
    offsets[i] = cursor;
    cursor += texture.levels[i]!.data.byteLength;
  }
  if (!Number.isSafeInteger(cursor) || cursor > maxBytes) fail("KTX2_MEMORY_LIMIT", "Encoded texture exceeds maxBytes");
  const out = new Uint8Array(cursor);
  const v = new DataView(out.buffer);
  out.set(IDENTIFIER);
  v.setUint32(12, format.vk, true);
  v.setUint32(16, format.componentBytes, true);
  v.setUint32(20, texture.width, true);
  v.setUint32(24, texture.height, true);
  v.setUint32(28, texture.depth ?? 0, true);
  v.setUint32(32, texture.layers ?? 0, true);
  v.setUint32(36, texture.faces ?? 1, true);
  v.setUint32(40, texture.levels.length, true);
  v.setUint32(44, 0, true);
  v.setUint32(48, dfdOffset, true);
  v.setUint32(52, dfd.length, true);
  v.setUint32(56, kvdOffset, true);
  v.setUint32(60, kvd.length, true);
  out.set(dfd, dfdOffset); out.set(kvd, kvdOffset);
  for (let i = 0; i < texture.levels.length; i++) {
    checkAbort(signal);
    const data = texture.levels[i]!.data;
    const index = 80 + i * 24;
    v.setBigUint64(index, BigInt(offsets[i]!), true);
    v.setBigUint64(index + 8, BigInt(data.byteLength), true);
    v.setBigUint64(index + 16, BigInt(data.byteLength), true);
    out.set(data, offsets[i]!);
  }
  return out;
}
function validateEncoded(data: unknown, texture: AuraKTX2Texture, encoding: AuraKTX2Encoding, maxBytes: number): asserts data is Uint8Array {
  if (!(data instanceof Uint8Array) || data.length < 104 || data.length > maxBytes || IDENTIFIER.some((b, i) => data[i] !== b)) fail("KTX2_ENCODER_RESULT", "Encoder did not return a bounded KTX2 container");
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (v.getUint32(20, true) !== texture.width || v.getUint32(24, true) !== texture.height || v.getUint32(28, true) !== (texture.depth ?? 0) || v.getUint32(32, true) !== (texture.layers ?? 0) || v.getUint32(36, true) !== (texture.faces ?? 1) || v.getUint32(40, true) !== texture.levels.length) fail("KTX2_ENCODER_LAYOUT", "Encoder changed the texture layout");
  const count = v.getUint32(40, true);
  if (count === 0 || 80 + count * 24 > data.length) fail("KTX2_ENCODER_RESULT", "Encoder returned an incomplete level index");
  const indexEnd = 80 + count * 24;
  const sections: { start: bigint; end: bigint }[] = [];
  const addSection = (offset: bigint, length: bigint, name: string): void => {
    if (length === 0n || offset < BigInt(indexEnd) || offset + length > BigInt(data.length)) fail("KTX2_ENCODER_RESULT", `${name} is outside the container`);
    sections.push({ start: offset, end: offset + length });
  };
  for (let i = 0; i < count; i++) {
    const pos = 80 + i * 24;
    const offset = v.getBigUint64(pos, true);
    const length = v.getBigUint64(pos + 8, true);
    addSection(offset, length, `Encoded mip level ${i}`);
  }
  const dfdOffset = v.getUint32(48, true), dfdLength = v.getUint32(52, true);
  if (dfdLength < 28) fail("KTX2_ENCODER_RESULT", "Encoder returned an invalid data format descriptor");
  addSection(BigInt(dfdOffset), BigInt(dfdLength), "Data format descriptor");
  if (v.getUint32(dfdOffset, true) !== dfdLength || v.getUint16(dfdOffset + 10, true) < 24 || v.getUint16(dfdOffset + 10, true) > dfdLength - 4) fail("KTX2_ENCODER_RESULT", "Encoder returned an invalid data format descriptor");
  const kvdOffset = v.getUint32(56, true), kvdLength = v.getUint32(60, true);
  if (kvdLength) addSection(BigInt(kvdOffset), BigInt(kvdLength), "Key/value data");
  const globalOffset = v.getBigUint64(64, true), globalLength = v.getBigUint64(72, true);
  if (globalLength) addSection(globalOffset, globalLength, "Supercompression global data");
  sections.sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
  if (sections.some((section, i) => i > 0 && section.start < sections[i - 1]!.end)) fail("KTX2_ENCODER_RESULT", "Encoder returned overlapping container sections");
  const vk = v.getUint32(12, true), scheme = v.getUint32(44, true), model = v.getUint8(dfdOffset + 12);
  const matches = encoding === "basis-etc1s" ? vk === 0 && scheme === 1 && model === 163
    : encoding === "basis-uastc" ? vk === 0 && (scheme === 0 || scheme === 2) && model === 166
    : encoding === "zstd" ? scheme === 2 && vk === FORMAT[texture.format].vk
    : encoding === "zlib" ? scheme === 3 && vk === FORMAT[texture.format].vk
    : false;
  if (!matches) fail("KTX2_ENCODER_FORMAT", `The encoder output does not match requested ${encoding} encoding`);
  if (encoding === "basis-etc1s") {
    const offset = v.getBigUint64(64, true), size = v.getBigUint64(72, true);
    if (size === 0n || offset + size > BigInt(data.length)) fail("KTX2_ENCODER_RESULT", "BasisLZ requires valid supercompression global data");
  }
}
async function waitForCodec<T>(promise: T | PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  checkAbort(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => { signal.removeEventListener("abort", abort); reject(new KTX2ExportError("EXPORT_CANCELLED", "KTX2 export was cancelled")); };
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then((value) => { signal.removeEventListener("abort", abort); resolve(value); }, (error) => { signal.removeEventListener("abort", abort); reject(error); });
    if (signal.aborted) abort();
  });
}

/** Encode a complete KTX2 texture. A caller-injected codec is mandatory for
 * compressed encodings; no codec is silently loaded or substituted. */
export async function exportKTX2(texture: AuraKTX2Texture, options: AuraKTX2ExportOptions = {}): Promise<AuraExportResult> {
  checkAbort(options.signal);
  const maxBytes = limit(options.maxBytes);
  validateTexture(texture, maxBytes);
  const encoding = options.encoding ?? "none";
  if (!["none", "basis-etc1s", "basis-uastc", "zstd", "zlib"].includes(encoding)) fail("KTX2_INVALID_ENCODING", `Unknown encoding ${String(encoding)}`, "encoding");
  const sourceWarnings = unsupportedProperties(texture, options);
  if (encoding === "none") {
    const warnings: AuraExportWarning[] = [...sourceWarnings];
    if (options.encoder !== undefined) warnings.push({ code: "KTX2_ENCODER_IGNORED", path: "options.encoder", message: "The raw encoding does not use the supplied encoder." });
    if (!texture.orientation) warnings.push({ code: "KTX2_ORIENTATION_UNSPECIFIED", path: "orientation", message: "The texture orientation was not specified." });
    return { data: writeRaw(texture, maxBytes, options.signal), mimeType: "image/ktx2", warnings, dependencies: [] };
  }
  if (!options.encoder || typeof options.encoder.name !== "string" || !options.encoder.name || typeof options.encoder.supports !== "function" || typeof options.encoder.encode !== "function") fail("KTX2_ENCODER_UNAVAILABLE", `No supplied encoder supports ${encoding}`, "encoding");
  let supported: boolean;
  try { supported = options.encoder.supports(texture, encoding); }
  catch { fail("KTX2_ENCODER_CAPABILITY", "The encoder capability check failed", "encoder"); }
  if (typeof supported !== "boolean") fail("KTX2_ENCODER_CAPABILITY", "The encoder capability check must return a boolean", "encoder");
  if (!supported) fail("KTX2_ENCODER_UNAVAILABLE", `No supplied encoder supports ${encoding}`, "encoding");
  let encoded: AuraKTX2EncodeResult;
  try { encoded = await waitForCodec(options.encoder.encode(texture, { encoding, signal: options.signal, maxBytes }), options.signal); }
  catch (error) { if (error instanceof KTX2ExportError) throw error; checkAbort(options.signal); fail("KTX2_ENCODER_FAILED", "The supplied encoder failed", "encoder"); }
  checkAbort(options.signal);
  if (!encoded || typeof encoded !== "object") fail("KTX2_ENCODER_RESULT", "Encoder returned no result");
  if (encoded.lossless !== undefined && typeof encoded.lossless !== "boolean") fail("KTX2_ENCODER_RESULT", "Encoder lossless must be a boolean when present");
  if (encoded.warnings !== undefined && (!Array.isArray(encoded.warnings) || encoded.warnings.some((warning) => !warning || typeof warning.code !== "string" || typeof warning.message !== "string" || (warning.path !== undefined && typeof warning.path !== "string")))) fail("KTX2_ENCODER_RESULT", "Encoder warnings must contain structured diagnostics");
  validateEncoded(encoded.data, texture, encoding, maxBytes);
  const warnings: AuraExportWarning[] = [...sourceWarnings, ...(encoded.warnings ?? [])];
  if (encoded.lossless === false) warnings.push({ code: "KTX2_LOSSY_ENCODING", message: `The ${encoding} codec reports that its output is lossy.` });
  else if (encoded.lossless !== true) warnings.push({ code: "KTX2_CODEC_LOSS_UNSPECIFIED", message: `The ${encoding} codec did not declare whether its output is lossless.` });
  if (texture.orientation !== undefined || texture.colorPrimaries !== undefined || Object.keys(texture.metadata ?? {}).length) warnings.push({ code: "KTX2_CODEC_METADATA_UNVERIFIED", message: "Metadata preservation by the supplied codec has not been independently verified." });
  if (texture.orientation === undefined) warnings.push({ code: "KTX2_ORIENTATION_UNSPECIFIED", path: "orientation", message: "The texture orientation was not specified." });
  return { data: encoded.data.slice(), mimeType: "image/ktx2", warnings, dependencies: [] };
}
