import type { AuraExportResult, AuraExportWarning } from "./ExportContext";

/** A channel is a planar, row-major set of samples. `half` Uint16Array data
 * contains IEEE-754 binary16 bit patterns, not integer color values. */
export interface AuraEXRChannel {
  readonly name: string;
  readonly type: "float" | "half";
  readonly data: Float32Array | Uint16Array;
}
export interface AuraEXRLayer {
  readonly name: string;
  readonly channels: readonly AuraEXRChannel[];
}
export interface AuraEXRAttachment {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly layers: readonly AuraEXRLayer[];
}
export interface AuraEXRSource {
  readonly attachments: readonly AuraEXRAttachment[];
  /** String header attributes, including applicable author/license provenance. */
  readonly metadata?: Readonly<Record<string, string>>;
}

/** Optional PIZ compressor override. The codec receives uncompressed OpenEXR scanline
 * bytes in increasing y order, with channels in `channels` order per line.
 * A codec must output one standards-compliant PIZ block. The exporter may use
 * the legal raw-block representation instead when it is not smaller. */
export interface AuraEXRPizEncoder {
  readonly supported: boolean;
  encodeBlock(input: {
    readonly data: Uint8Array;
    readonly width: number;
    readonly lines: number;
    readonly channels: readonly { readonly name: string; readonly type: "float" | "half" }[];
    readonly signal?: AbortSignal;
  }): Uint8Array;
}
export interface AuraEXRExportOptions {
  /** These selectors are mandatory even when the source contains only one. */
  readonly attachment: string;
  readonly layer: string;
  readonly compression?: "none" | "rle" | "piz";
  readonly pizEncoder?: AuraEXRPizEncoder;
  readonly maxBytes?: number;
  readonly signal?: AbortSignal;
}

export class EXRExportError extends Error {
  readonly warnings: readonly AuraExportWarning[];
  constructor(readonly code: string, message: string, path?: string) {
    super(message);
    this.name = "EXRExportError";
    this.warnings = [{ code, ...(path === undefined ? {} : { path }), message }];
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
function fail(code: string, message: string, path?: string): never { throw new EXRExportError(code, message, path); }
function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) fail("EXPORT_CANCELLED", "EXR export was cancelled"); }
function bytesString(value: string): Uint8Array { return encoder.encode(value); }
function nameCheck(value: unknown, path: string, empty = false): asserts value is string {
  if (typeof value !== "string" || (!empty && !value.length) || value.includes("\0")) {
    fail("EXR_INVALID_NAME", `${path} must be a well-formed name of at most 31 UTF-8 bytes without NUL`, path);
  }
  const bytes = bytesString(value);
  // TextEncoder substitutes U+FFFD for lone UTF-16 surrogates. Reject them
  // rather than writing a different name or producing duplicate wire names.
  if (bytes.length > 31 || decoder.decode(bytes) !== value) fail("EXR_INVALID_NAME", `${path} must be a well-formed name of at most 31 UTF-8 bytes without NUL`, path);
}
function compareChannelNames(a: string, b: string): number {
  const left = bytesString(a), right = bytesString(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i]! - right[i]!;
  return left.length - right.length;
}
function checkLimit(value: number | undefined): number {
  const max = value ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(max) || max < 1) fail("EXR_INVALID_LIMIT", "maxBytes must be a positive safe integer", "maxBytes");
  return max;
}
function numberBytes(value: number, size: number, float = false): Uint8Array {
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  if (size === 1) v.setUint8(0, value);
  else if (float) v.setFloat32(0, value, true);
  else v.setInt32(0, value, true);
  return out;
}
function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
}
function cstring(value: string): Uint8Array { return concat([bytesString(value), new Uint8Array(1)]); }
function attribute(name: string, type: string, value: Uint8Array): Uint8Array {
  return concat([cstring(name), cstring(type), numberBytes(value.length, 4), value]);
}
function box(width: number, height: number): Uint8Array {
  return concat([numberBytes(0, 4), numberBytes(0, 4), numberBytes(width - 1, 4), numberBytes(height - 1, 4)]);
}

// Round a binary32 value to nearest-even binary16, including signed zero,
// infinities and NaNs. Input is rounded to float32 by its typed source first.
const floatScratch = new DataView(new ArrayBuffer(4));
function floatToHalf(value: number): number {
  floatScratch.setFloat32(0, value, true);
  const n = floatScratch.getUint32(0, true);
  const sign = (n >>> 16) & 0x8000;
  const exp = (n >>> 23) & 0xff;
  const mantissa = n & 0x7fffff;
  if (exp === 255) return sign | 0x7c00 | (mantissa ? 0x0200 : 0);
  const halfExp = exp - 127 + 15;
  if (halfExp >= 31) return sign | 0x7c00;
  if (halfExp < -10) return sign;
  if (halfExp <= 0) {
    const significand = mantissa | 0x800000;
    const shift = 14 - halfExp;
    let rounded = significand >>> shift;
    const remainder = significand & ((1 << shift) - 1);
    const halfway = 1 << (shift - 1);
    if (remainder > halfway || (remainder === halfway && (rounded & 1))) rounded++;
    return sign | rounded;
  }
  let rounded = (halfExp << 10) | (mantissa >>> 13);
  const remainder = mantissa & 0x1fff;
  if (remainder > 0x1000 || (remainder === 0x1000 && (rounded & 1))) rounded++;
  return sign | rounded;
}

/** OpenEXR RLE consists of even/odd byte reordering, a byte predictor, then
 * signed PackBits-style runs. Literals encode 1..127 bytes; runs 2..128. */
function encodeRLE(raw: Uint8Array): Uint8Array {
  const predicted = new Uint8Array(raw.length);
  let n = 0;
  for (let i = 0; i < raw.length; i += 2) predicted[n++] = raw[i]!;
  for (let i = 1; i < raw.length; i += 2) predicted[n++] = raw[i]!;
  for (let i = predicted.length - 1; i > 0; i--) predicted[i] = (predicted[i]! - predicted[i - 1]! + 128) & 255;
  const out = new Uint8Array(raw.length + Math.ceil(raw.length / 127) + 1);
  let written = 0;
  let i = 0;
  while (i < predicted.length) {
    let run = 1;
    while (run < 128 && i + run < predicted.length && predicted[i + run] === predicted[i]) run++;
    if (run >= 3) { out[written++] = run - 1; out[written++] = predicted[i]!; i += run; continue; }
    const start = i;
    i += run;
    while (i < predicted.length && i - start < 127) {
      let next = 1;
      while (next < 3 && i + next < predicted.length && predicted[i + next] === predicted[i]) next++;
      if (next >= 3 || i - start + next > 127) break;
      i += next;
    }
    out[written++] = 256 - (i - start);
    for (let j = start; j < i; j++) out[written++] = predicted[j]!;
  }
  return out.subarray(0, written);
}

/** A zero-only PIZ block needs no bitmap entries and its reversible wavelet
 * coefficients are all zero. Its Huffman alphabet therefore contains only
 * zero and the run marker. Other blocks use the general native encoder. */
function encodeZeroPIZ(raw: Uint8Array): Uint8Array | undefined {
  if (raw.length % 2 || raw.some((byte) => byte !== 0)) return undefined;
  const words = raw.length / 2;
  const runs = Math.floor(words / 256);
  const remainder = words % 256;
  const bitCount = runs * 10 + (remainder <= 10 ? remainder : 10);
  const streamBytes = Math.ceil(bitCount / 8);
  const huffmanSize = 22 + streamBytes;
  const output = new Uint8Array(8 + huffmanSize);
  if (output.length >= raw.length) return undefined;
  const view = new DataView(output.buffer);
  // Empty bitmap has minimum index 8191 and maximum index zero.
  view.setUint16(0, 8191, true);
  view.setUint16(2, 0, true);
  view.setUint32(4, huffmanSize, true);
  view.setUint32(8, 0, true);  // minimum symbol
  view.setUint32(12, 1, true); // maximum symbol, reserved run marker
  view.setUint32(16, 2, true); // packed code table bytes
  view.setUint32(20, bitCount, true);
  view.setUint32(24, 0, true);
  output[28] = 0x04; output[29] = 0x10; // both canonical codes have length one
  let bit = 30 * 8;
  const put = (value: number, count: number): void => {
    for (let shift = count - 1; shift >= 0; shift--) {
      if ((value >>> shift) & 1) output[bit >>> 3]! |= 1 << (7 - (bit & 7));
      bit++;
    }
  };
  const run = (count: number): void => {
    put(0, 1);
    if (count <= 10) { for (let i = 1; i < count; i++) put(0, 1); }
    else { put(1, 1); put(count - 1, 8); }
  };
  for (let i = 0; i < runs; i++) run(256);
  if (remainder) run(remainder);
  return output;
}

/** Encode the lossless PIZ bitmap, reversible Haar coefficients and canonical
 * Huffman stream for a scanline block, using narrow or full-width lifting as
 * needed by its alphabet. A block that is larger after compression is stored
 * raw as allowed by EXR.
 * The transform and bit packing are independent implementations of the PIZ
 * format; no external codec or implementation is loaded. */
function encodePIZ(
  raw: Uint8Array,
  width: number,
  height: number,
  channels: readonly { readonly type: "half" | "float" }[],
  signal?: AbortSignal
): Uint8Array | undefined {
  const wordCount = raw.length / 2;
  const input = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const bitmap = new Uint8Array(8192);
  const lookup = new Uint16Array(65536);
  for (let i = 0; i < wordCount; i++) {
    if ((i & 8191) === 0) checkAbort(signal);
    const value = input.getUint16(i * 2, true);
    if (value) bitmap[value >>> 3]! |= 1 << (value & 7);
  }
  let firstByte = 8191, lastByte = 0, unique = 0;
  for (let i = 0; i < bitmap.length; i++) if (bitmap[i]) { firstByte = Math.min(firstByte, i); lastByte = i; }
  for (let value = 1; value < 65536; value++) if (bitmap[value >>> 3]! & (1 << (value & 7))) lookup[value] = ++unique;
  const words = new Uint16Array(wordCount);
  const starts: number[] = [];
  let offset = 0;
  for (const channel of channels) { starts.push(offset); offset += width * height * (channel.type === "half" ? 1 : 2); }
  let source = 0;
  // EXR's block is scanline/channel ordered. Wavelets operate on one plane
  // for each 16-bit word of a channel, including both halves of FLOAT.
  for (let y = 0; y < height; y++) {
    checkAbort(signal);
    for (let c = 0; c < channels.length; c++) {
      const components = channels[c]!.type === "half" ? 1 : 2;
      const destination = starts[c]! + y * width * components;
      for (let x = 0; x < width * components; x++) words[destination + x] = lookup[input.getUint16(source++ * 2, true)]!;
    }
  }
  const signed = (word: number): number => word & 0x8000 ? word - 65536 : word;
  const pair = unique < 16384
    ? (a: number, b: number): readonly [number, number] => [Math.floor((signed(a) + signed(b)) / 2) & 65535, (signed(a) - signed(b)) & 65535]
    : (a: number, b: number): readonly [number, number] => {
      const difference = (a - b + 32768) & 65535;
      return [(b + (difference >>> 1)) & 65535, difference];
    };
  for (let c = 0; c < channels.length; c++) {
    const components = channels[c]!.type === "half" ? 1 : 2;
    for (let component = 0; component < components; component++) {
      for (let stride = 1; stride * 2 <= width && stride * 2 <= height; stride *= 2) {
        checkAbort(signal);
        for (let y = 0; y + stride <= height; y += stride * 2) {
          const hasY = y + stride * 2 <= height;
          for (let x = 0; x + stride <= width; x += stride * 2) {
            const hasX = x + stride * 2 <= width;
            const i = starts[c]! + (y * width + x) * components + component;
            const ix = i + stride * components, iy = i + stride * width * components, ixy = iy + stride * components;
            if (hasX && hasY) {
              const [loA, hiA] = pair(words[i]!, words[ix]!);
              const [loB, hiB] = pair(words[iy]!, words[ixy]!);
              const [loLo, loHi] = pair(loA, loB), [hiLo, hiHi] = pair(hiA, hiB);
              words[i] = loLo; words[ix] = hiLo; words[iy] = loHi; words[ixy] = hiHi;
            } else if (hasX) {
              const [lo, hi] = pair(words[i]!, words[ix]!); words[i] = lo; words[ix] = hi;
            } else if (hasY) {
              const [lo, hi] = pair(words[i]!, words[iy]!); words[i] = lo; words[iy] = hi;
            }
          }
        }
      }
    }
  }
  const counts = new Uint32Array(65537);
  let firstSymbol = 65536, lastSymbol = 0;
  for (let i = 0; i < words.length; i++) {
    if ((i & 8191) === 0) checkAbort(signal);
    const value = words[i]!; counts[value]!++; firstSymbol = Math.min(firstSymbol, value); lastSymbol = Math.max(lastSymbol, value);
  }
  const runMarker = lastSymbol + 1; counts[runMarker] = 1;
  const symbols: number[] = [];
  for (let symbol = firstSymbol; symbol <= runMarker; symbol++) if (counts[symbol]) symbols.push(symbol);
  // A bounded balanced prefix tree avoids a heap or unbounded code lengths;
  // common values get the shorter codes. Compression quality may be lower
  // than an optimal tree, but decoded values are identical.
  const lengths = new Uint8Array(65537), codes = new Uint32Array(65537);
  const longest = Math.ceil(Math.log2(symbols.length)), shorter = 2 ** longest - symbols.length;
  symbols.sort((a, b) => counts[b]! - counts[a]! || a - b);
  symbols.forEach((symbol, i) => { lengths[symbol] = i < shorter ? longest - 1 : longest; });
  symbols.sort((a, b) => a - b);
  let code = 0;
  for (let length = longest; length >= 1; length--) {
    for (const symbol of symbols) if (lengths[symbol] === length) codes[symbol] = code++;
    code >>>= 1;
  }
  const table = new Uint8Array(Math.ceil((runMarker - firstSymbol + 1) * 6 / 8) + 16);
  let tableBits = 0;
  const tablePut = (value: number, bits: number): void => {
    for (let bit = bits - 1; bit >= 0; bit--) { if ((value >>> bit) & 1) table[tableBits >>> 3]! |= 1 << (7 - (tableBits & 7)); tableBits++; }
  };
  for (let symbol = firstSymbol; symbol <= runMarker;) {
    if (lengths[symbol]) { tablePut(lengths[symbol]!, 6); symbol++; continue; }
    let run = 1;
    while (symbol + run <= runMarker && !lengths[symbol + run] && run < 261) run++;
    if (run === 1) tablePut(0, 6);
    else if (run <= 5) tablePut(57 + run, 6);
    else { tablePut(63, 6); tablePut(run - 6, 8); }
    symbol += run;
  }
  const encoded = new Uint8Array(raw.length);
  let bits = 0;
  const put = (value: number, count: number): boolean => {
    if (bits + count > encoded.length * 8) return false;
    for (let bit = count - 1; bit >= 0; bit--) { if ((value >>> bit) & 1) encoded[bits >>> 3]! |= 1 << (7 - (bits & 7)); bits++; }
    return true;
  };
  for (let i = 0; i < words.length;) {
    if ((i & 8191) === 0) checkAbort(signal);
    let run = 1;
    while (i + run < words.length && words[i + run] === words[i] && run < 256) run++;
    const symbol = words[i]!, length = lengths[symbol]!;
    if (!put(codes[symbol]!, length)) return undefined;
    if (run > 1 && lengths[runMarker]! + 8 < (run - 1) * length) {
      if (!put(codes[runMarker]!, lengths[runMarker]!) || !put(run - 1, 8)) return undefined;
    } else for (let j = 1; j < run; j++) if (!put(codes[symbol]!, length)) return undefined;
    i += run;
  }
  const bitmapBytes = firstByte <= lastByte ? lastByte - firstByte + 1 : 0;
  const tableBytes = Math.ceil(tableBits / 8), encodedBytes = Math.ceil(bits / 8);
  const huffmanLength = 20 + tableBytes + encodedBytes;
  if (8 + bitmapBytes + huffmanLength >= raw.length) return undefined;
  const output = new Uint8Array(8 + bitmapBytes + huffmanLength);
  const view = new DataView(output.buffer);
  view.setUint16(0, firstByte, true); view.setUint16(2, lastByte, true);
  if (bitmapBytes) output.set(bitmap.subarray(firstByte, lastByte + 1), 4);
  const at = 4 + bitmapBytes;
  view.setUint32(at, huffmanLength, true); view.setUint32(at + 4, firstSymbol, true); view.setUint32(at + 8, runMarker, true);
  view.setUint32(at + 12, tableBytes, true); view.setUint32(at + 16, bits, true); view.setUint32(at + 20, 0, true);
  output.set(table.subarray(0, tableBytes), at + 24); output.set(encoded.subarray(0, encodedBytes), at + 24 + tableBytes);
  return output;
}

/** Basic framing validation of an injected PIZ block. Full codec semantics
 * remain the responsibility of the codec and the receiving EXR decoder. */
function validatePizBlock(data: Uint8Array): void {
  if (data.length < 8) fail("EXR_PIZ_ENCODER_RESULT", "PIZ block is shorter than its bitmap and Huffman headers");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const min = view.getUint16(0, true), max = view.getUint16(2, true);
  if (min > 8191 || max > 8191) fail("EXR_PIZ_ENCODER_RESULT", "PIZ bitmap bounds are invalid");
  const bytes = min <= max ? max - min + 1 : 0;
  const sizeOffset = 4 + bytes;
  if (sizeOffset + 4 > data.length) fail("EXR_PIZ_ENCODER_RESULT", "PIZ bitmap is truncated");
  const huffmanBytes = view.getUint32(sizeOffset, true);
  if (huffmanBytes < 20 || sizeOffset + 4 + huffmanBytes !== data.length) fail("EXR_PIZ_ENCODER_RESULT", "PIZ Huffman payload length is invalid");
  const huff = sizeOffset + 4;
  const firstSymbol = view.getUint32(huff, true), lastSymbol = view.getUint32(huff + 4, true);
  const tableBytes = view.getUint32(huff + 8, true), bitCount = view.getUint32(huff + 12, true);
  if (firstSymbol > lastSymbol || lastSymbol > 65536 || tableBytes > huffmanBytes - 20 || Math.ceil(bitCount / 8) > huffmanBytes - 20 - tableBytes) fail("EXR_PIZ_ENCODER_RESULT", "PIZ Huffman framing is invalid");
}

/** Encode a selected attachment/layer as an OpenEXR v2 scanline image. Native
 * PIZ uses raw blocks when compression is ineffective; an optional codec can
 * be provided to choose a different lossless compression implementation. */
export function exportEXR(source: AuraEXRSource, options: AuraEXRExportOptions): AuraExportResult {
  const signal = options?.signal;
  checkAbort(signal);
  const maxBytes = checkLimit(options?.maxBytes);
  if (!source || !Array.isArray(source.attachments) || !options || typeof options.attachment !== "string" || typeof options.layer !== "string") {
    fail("EXR_SELECTION_REQUIRED", "Select both an attachment and a layer", "options");
  }
  const compression = options.compression ?? "none";
  if (!["none", "rle", "piz"].includes(compression)) fail("EXR_UNSUPPORTED_COMPRESSION", `Unsupported EXR compression: ${String(compression)}`);
  const attachments: readonly AuraEXRAttachment[] = source.attachments;
  if (attachments.some((a) => !a || typeof a !== "object" || typeof a.name !== "string")) fail("EXR_INVALID_ATTACHMENT", "Each attachment must have a name", "attachments");
  if (attachments.filter((a) => a.name === options.attachment).length !== 1) fail("EXR_ATTACHMENT_SELECTION", "Attachment must identify exactly one source", "attachment");
  const attachment = attachments.find((a) => a.name === options.attachment)!;
  nameCheck(attachment.name, "attachment");
  const { width, height } = attachment;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 0x7fffffff || height > 0x7fffffff) fail("EXR_INVALID_DIMENSIONS", "EXR dimensions must be positive signed 32-bit integers");
  if (!Array.isArray(attachment.layers)) fail("EXR_LAYER_SELECTION", "The selected attachment must provide layers", "layer");
  const layers: readonly AuraEXRLayer[] = attachment.layers;
  if (layers.some((l) => !l || typeof l !== "object" || typeof l.name !== "string")) fail("EXR_INVALID_LAYER", "Each layer must have a name", "layer");
  if (layers.filter((l) => l.name === options.layer).length !== 1) fail("EXR_LAYER_SELECTION", "Layer must identify exactly one layer in the selected attachment", "layer");
  const layer = layers.find((l) => l.name === options.layer)!;
  nameCheck(layer.name, "layer", true);
  if (!Array.isArray(layer.channels) || layer.channels.length === 0 || layer.channels.length > 256) fail("EXR_INVALID_CHANNELS", "The layer must contain between 1 and 256 channels");
  const sourceChannels: readonly AuraEXRChannel[] = layer.channels;
  const warnings: AuraExportWarning[] = [];
  // Bound diagnostics independently of the caller's document size. The final
  // slot reports truncation rather than silently dropping any further losses.
  const maxWarnings = 128, maxInspectedFields = 4096;
  let omittedWarnings = 0, inspectedFields = 0, inspectionTruncated = false;
  const warn = (warning: AuraExportWarning): void => {
    if (warnings.length < maxWarnings - 1) warnings.push(warning);
    else omittedWarnings++;
  };
  if (compression !== "piz" && options.pizEncoder !== undefined) warn({ code: "EXR_PIZ_ENCODER_IGNORED", path: "options.pizEncoder", message: "The supplied PIZ encoder is not used with the selected compression." });
  const inspectKeys = (object: object, allowed: readonly string[], path: string): void => {
    for (const key in object) {
      if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
      if (++inspectedFields > maxInspectedFields) { inspectionTruncated = true; return; }
      if (!allowed.includes(key)) warn({ code: "EXR_UNSUPPORTED_PROPERTY", path: `${path}.${key.slice(0, 160)}`, message: "The property is not represented in the exported EXR." });
    }
  };
  // Only inspect data properties on unselected attachments/layers. They may be
  // incomplete or contain getters and must not be evaluated merely to report
  // losses. Arbitrary keys inside source.metadata are handled as EXR metadata.
  const ownData = (object: object, key: string): unknown => Object.getOwnPropertyDescriptor(object, key)?.value;
  inspectKeys(source, ["attachments", "metadata"], "source");
  for (let ai = 0; ai < attachments.length && !inspectionTruncated; ai++) {
    checkAbort(signal);
    const current = Object.getOwnPropertyDescriptor(attachments, String(ai))?.value;
    if (!current || typeof current !== "object" || Array.isArray(current)) continue;
    const attachmentPath = `attachments[${ai}]`;
    inspectKeys(current, ["name", "width", "height", "layers"], attachmentPath);
    const currentLayers = ownData(current, "layers");
    if (!Array.isArray(currentLayers)) continue;
    for (let li = 0; li < currentLayers.length && !inspectionTruncated; li++) {
      if (++inspectedFields > maxInspectedFields) { inspectionTruncated = true; break; }
      const currentLayer = Object.getOwnPropertyDescriptor(currentLayers, String(li))?.value;
      if (!currentLayer || typeof currentLayer !== "object" || Array.isArray(currentLayer)) continue;
      const layerPath = `${attachmentPath}.layers[${li}]`;
      inspectKeys(currentLayer, ["name", "channels"], layerPath);
      const currentChannels = ownData(currentLayer, "channels");
      if (!Array.isArray(currentChannels)) continue;
      for (let ci = 0; ci < currentChannels.length && !inspectionTruncated; ci++) {
        if (++inspectedFields > maxInspectedFields) { inspectionTruncated = true; break; }
        const currentChannel = Object.getOwnPropertyDescriptor(currentChannels, String(ci))?.value;
        if (currentChannel && typeof currentChannel === "object" && !Array.isArray(currentChannel)) inspectKeys(currentChannel, ["name", "type", "data"], `${layerPath}.channels[${ci}]`);
      }
    }
  }
  for (const a of attachments) if (a !== attachment) warn({ code: "EXR_ATTACHMENT_OMITTED", path: `attachments.${a.name}`, message: "The attachment was not selected for this EXR." });
  for (const l of layers) if (l !== layer) warn({ code: "EXR_LAYER_OMITTED", path: `attachments.${attachment.name}.layers.${l.name}`, message: "The layer was not selected for this EXR." });
  const pixelCount = width * height;
  if (!Number.isSafeInteger(pixelCount) || pixelCount > maxBytes / 2) fail("EXR_MEMORY_LIMIT", "Image dimensions exceed the allocation limit");
  let pixelBytes = 0;
  const names = new Set<string>();
  const channels = sourceChannels.map((channel, index) => {
    if (!channel || typeof channel !== "object") fail("EXR_CHANNEL_DATA", `Channel ${index} must be an object`, `channels.${index}`);
    nameCheck(channel.name, `channels.${index}.name`);
    const name = layer.name ? `${layer.name}.${channel.name}` : channel.name;
    nameCheck(name, `channels.${index}.name`);
    if (names.has(name)) fail("EXR_DUPLICATE_CHANNEL", `Duplicate channel ${name}`);
    names.add(name);
    if (channel.type !== "half" && channel.type !== "float") fail("EXR_CHANNEL_TYPE", `Unsupported channel type for ${name}`);
    if (!(channel.data instanceof Float32Array || channel.data instanceof Uint16Array) || channel.data.length !== pixelCount || (channel.type === "float" && !(channel.data instanceof Float32Array))) fail("EXR_CHANNEL_DATA", `Channel ${name} has an incompatible sample array or length`);
    if (channel.type === "half" && channel.data instanceof Float32Array) warn({ code: "EXR_HALF_ROUNDING", path: `channels.${index}`, message: "Float32 samples are rounded to binary16; out-of-range values become infinity." });
    pixelBytes += channel.type === "half" ? 2 : 4;
    return { name, type: channel.type, data: channel.data };
  }).sort((a, b) => compareChannelNames(a.name, b.name));
  const rawTotal = pixelCount * pixelBytes;
  // At most raw blocks + output + temporary predictor/codec output coexist.
  const workingOverhead = compression === "piz" ? 2 * 1024 * 1024 : 65536;
  if (!Number.isSafeInteger(rawTotal) || rawTotal * 4 + height * 16 + workingOverhead > maxBytes) fail("EXR_MEMORY_LIMIT", "The selected image exceeds maxBytes including working memory");
  if (compression === "piz" && options.pizEncoder && (options.pizEncoder.supported !== true || typeof options.pizEncoder.encodeBlock !== "function")) fail("EXR_PIZ_ENCODER_UNAVAILABLE", "The supplied PIZ encoder reports no support");
  const reserved = new Set(["channels", "compression", "dataWindow", "displayWindow", "lineOrder", "pixelAspectRatio", "screenWindowCenter", "screenWindowWidth", "type", "version", "name", "chunkCount"]);
  const metadata: Uint8Array[] = [];
  let metadataBytes = 0;
  if (source.metadata !== undefined) {
    if (!source.metadata || typeof source.metadata !== "object" || Array.isArray(source.metadata)) fail("EXR_INVALID_METADATA", "Metadata must be a string dictionary");
    for (const [key, value] of Object.entries(source.metadata).sort(([a], [b]) => a.localeCompare(b))) {
      nameCheck(key, `metadata.${key}`);
      if (reserved.has(key)) fail("EXR_RESERVED_METADATA", `${key} is a reserved EXR attribute`, `metadata.${key}`);
      if (typeof value !== "string" || value.includes("\0") || value.length > 65536) fail("EXR_INVALID_METADATA", "Metadata values must be bounded NUL-free strings", `metadata.${key}`);
      const attr = attribute(key, "string", bytesString(value));
      metadataBytes += attr.length;
      if (metadataBytes > 65536) fail("EXR_METADATA_LIMIT", "Metadata exceeds 64 KiB");
      metadata.push(attr);
    }
  }
  const channelList = concat([...channels.map((channel) => concat([cstring(channel.name), numberBytes(channel.type === "half" ? 1 : 2, 4), new Uint8Array(4), numberBytes(1, 4), numberBytes(1, 4)])), new Uint8Array(1)]);
  const header = concat([
    Uint8Array.of(0x76, 0x2f, 0x31, 0x01, 2, 0, 0, 0),
    attribute("channels", "chlist", channelList),
    attribute("compression", "compression", numberBytes(compression === "none" ? 0 : compression === "rle" ? 1 : 4, 1)),
    attribute("dataWindow", "box2i", box(width, height)),
    attribute("displayWindow", "box2i", box(width, height)),
    attribute("lineOrder", "lineOrder", numberBytes(0, 1)),
    attribute("pixelAspectRatio", "float", numberBytes(1, 4, true)),
    attribute("screenWindowCenter", "v2f", concat([numberBytes(0, 4, true), numberBytes(0, 4, true)])),
    attribute("screenWindowWidth", "float", numberBytes(1, 4, true)),
    ...metadata,
    new Uint8Array(1)
  ]);
  const blockLines = compression === "piz" ? 32 : 1;
  const blockCount = Math.ceil(height / blockLines);
  const table = new Uint8Array(blockCount * 8);
  const tableView = new DataView(table.buffer);
  const blocks: Uint8Array[] = [];
  let byteOffset = header.length + table.length;
  let storedPizBlocks = 0;
  for (let block = 0; block < blockCount; block++) {
    checkAbort(signal);
    const y0 = block * blockLines;
    const lines = Math.min(blockLines, height - y0);
    const raw = new Uint8Array(width * lines * pixelBytes);
    const view = new DataView(raw.buffer);
    let offset = 0;
    for (let y = y0; y < y0 + lines; y++) {
      checkAbort(signal);
      for (const channel of channels) {
        for (let x = 0; x < width; x++) {
          const sample = channel.data[y * width + x]!;
          if (channel.type === "half") { view.setUint16(offset, channel.data instanceof Uint16Array ? sample : floatToHalf(sample), true); offset += 2; }
          else { view.setFloat32(offset, sample, true); offset += 4; }
        }
      }
    }
    let payload: Uint8Array = raw;
    if (compression === "rle") {
      const compressed = encodeRLE(raw);
      if (compressed.length < raw.length) payload = compressed;
    } else if (compression === "piz") {
      if (options.pizEncoder) {
        let compressed: Uint8Array;
        try { compressed = options.pizEncoder.encodeBlock({ data: raw.slice(), width, lines, channels: channels.map(({ name, type }) => ({ name, type })), signal }); }
        catch { checkAbort(signal); fail("EXR_PIZ_ENCODER_FAILED", "The supplied PIZ encoder failed"); }
        checkAbort(signal);
        if (!(compressed instanceof Uint8Array) || compressed.length === 0 || compressed.length > maxBytes) fail("EXR_PIZ_ENCODER_RESULT", "PIZ encoder returned an invalid block");
        if (compressed.length < raw.length) { validatePizBlock(compressed); payload = compressed; }
        else storedPizBlocks++;
      } else {
        const compressed = encodeZeroPIZ(raw) ?? encodePIZ(raw, width, lines, channels, signal);
        if (compressed) payload = compressed;
        else storedPizBlocks++;
      }
    }
    tableView.setBigUint64(block * 8, BigInt(byteOffset), true);
    const blockBytes = concat([numberBytes(y0, 4), numberBytes(payload.length, 4), payload]);
    blocks.push(blockBytes);
    byteOffset += blockBytes.length;
    if (byteOffset > maxBytes) fail("EXR_MEMORY_LIMIT", "Encoded image exceeds maxBytes");
  }
  checkAbort(signal);
  if (storedPizBlocks) warn({ code: "EXR_PIZ_BLOCKS_STORED", message: `${storedPizBlocks} PIZ block(s) were stored uncompressed because their encoded form was not smaller.` });
  if (omittedWarnings || inspectionTruncated) warnings.push({ code: "EXR_DIAGNOSTICS_TRUNCATED", message: `${omittedWarnings} additional warning(s) were omitted${inspectionTruncated ? "; further input fields were not inspected" : ""}.` });
  return { data: concat([header, table, ...blocks]), mimeType: "image/x-exr", warnings, dependencies: [] };
}
