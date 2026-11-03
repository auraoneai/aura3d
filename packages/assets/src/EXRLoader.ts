/**
 * Independently authored OpenEXR reader. It supports bounded scanlines and
 * tiled resolution levels, including mixed multipart images, using NONE, RLE,
 * ZIPS, ZIP, PIZ, PXR24, B44/B44A and DWA. Deep scanlines retain their samples
 * through the explicit deep-data API below. Unsupported variants fail with an error.
 */

import { AssetLoadError, mergeAssetRequestOptions, type AssetLoader, type AssetLoadRequest, type AssetRequestOptions } from "./AssetLoader";
import type { LoadContext } from "./LoadContext";
import { fetchBytes, type AuraLoaderProgress } from "./LoaderFetch";

export type AuraEXRDataType = "half" | "float";
export type AuraEXROutputFormat = "rgba" | "rg" | "r";

export interface AuraEXRParseOptions {
  /** Output pixel type — three's `HalfFloatType` (default) vs `FloatType`. */
  readonly type?: AuraEXRDataType;
  /** Channel layout — three's `RGBAFormat` (default), `RGFormat`, `RedFormat`. */
  readonly outputFormat?: AuraEXROutputFormat;
  /** Part index for multi-part files (three's `setPart`). */
  readonly part?: number;
  /** Exact channel-layer name, including nested names such as `beauty.diffuse`.
   * The default empty name selects unlayered channels. */
  readonly layer?: string;
  /** Tile resolution level; mipmaps require x === y. Defaults to {x: 0, y: 0}.
   * Width and height describe this level; header.dataWindow stays at the source level-zero window. */
  readonly level?: { readonly x: number; readonly y: number };
  /** Maximum encoded input bytes. Cannot exceed the decoder's hard ceiling. */
  readonly maxInputBytes?: number;
  /** Maximum pixels per part. Cannot exceed the hard ceiling. */
  readonly maxPixels?: number;
}

export interface AuraEXRTextureData {
  readonly width: number;
  readonly height: number;
  /** RGBA/RG/R interleaved pixels — `Uint16Array` half bits or `Float32Array`.
   * Subsampled channels use nearest-neighbor reconstruction with edge clamping. */
  readonly data: Uint16Array | Float32Array;
  /** Pixel channel count — 4 (rgba), 2 (rg) or 1 (r). */
  readonly channels: 4 | 2 | 1;
  readonly type: AuraEXRDataType;
  readonly format: AuraEXROutputFormat;
  readonly colorSpace: "linear";
  /** three parity: decoded EXR data is already device-row ordered. */
  readonly flipY: false;
  readonly generateMipmaps: false;
  /** The parsed EXR header attributes (channels, dataWindow, ...). */
  readonly header: Record<string, unknown>;
  /** Source channels that cannot be represented in the selected texture layout. */
  readonly diagnostics: readonly { readonly code: string; readonly message: string }[];
}

const halfScratch = new Float32Array(1);
const halfScratchBits = new Uint32Array(halfScratch.buffer);

/** Convert binary32 to binary16, rounding ties to even. */
function toHalfFloat(value: number): number {
  halfScratch[0] = value;
  const bits = halfScratchBits[0];
  const sign = (bits >>> 16) & 0x8000;
  const exponent = (bits >>> 23) & 0xff;
  let fraction = bits & 0x7fffff;
  if (exponent === 0xff) return sign | 0x7c00 | (fraction ? 0x200 : 0);
  const halfExponent = exponent - 127 + 15;
  if (halfExponent >= 31) return sign | 0x7c00;
  if (halfExponent < -10) return sign;
  if (halfExponent <= 0) {
    fraction |= 0x800000;
    const shift = 14 - halfExponent;
    const result = fraction >>> shift;
    const remainder = fraction & ((1 << shift) - 1);
    const midpoint = 1 << (shift - 1);
    return sign | (result + Number(remainder > midpoint || (remainder === midpoint && (result & 1) !== 0)));
  }
  const result = (halfExponent << 10) | (fraction >>> 13);
  const remainder = fraction & 0x1fff;
  return sign | (result + Number(remainder > 0x1000 || (remainder === 0x1000 && (result & 1) !== 0)));
}

/**
 * zlib inflate for ZIP/ZIPS blocks. `DecompressionStream("deflate")` covers
 * browsers and Node >= 18; the `node:zlib` fallback keeps older Node test
 * environments working. Decompression is bounded by the declared block size.
 */
async function inflateZlib(compressed: Uint8Array, maxOutputBytes: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === "function") {
    const stream = new Blob([compressed as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxOutputBytes) {
          await reader.cancel();
          throw new AssetLoadError("EXRLoader: inflated block exceeds its declared size.", "exr");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
    return output;
  }
  // Runtime-only Node fallback. The specifier is a variable so bundlers
  // (esbuild/vite/rollup) cannot resolve it — browser entries must never
  // graph a Node builtin even behind a capability probe (bundle-size gate).
  const zlibModule = "node:zlib";
  const zlib = (await import(zlibModule)) as { inflateSync(input: Uint8Array, options: { maxOutputLength: number }): Uint8Array };
  const out = zlib.inflateSync(compressed, { maxOutputLength: maxOutputBytes });
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

/**
 * Validate the container before decoding. Offsets and lengths
 * in an EXR are untrusted; none may influence an allocation or an unbounded
 * string/bit scan until checked here. Unsupported variants fail explicitly.
 */
interface EXRAttribute { readonly type: string; readonly start: number; readonly size: number }
interface EXRChannel { readonly name: string; readonly pixelType: 0 | 1 | 2; readonly pLinear: number; readonly xSampling: number; readonly ySampling: number }
interface EXRChunk { readonly offset: number; readonly size: number; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rawSize: number }
interface EXRPart {
  readonly xmin: number; readonly ymin: number; readonly width: number; readonly height: number;
  readonly compression: number; readonly chunkCount: number; readonly tileWidth: number; readonly tileHeight: number;
  readonly attrs: ReadonlyMap<string, EXRAttribute>; readonly channels: readonly EXRChannel[]; readonly chunks: EXRChunk[];
  readonly tiled: boolean; readonly deep: boolean; readonly multipart: boolean; readonly version: number;
  readonly levelMode: 0 | 1 | 2; readonly roundUp: boolean; readonly levelsX: number; readonly levelsY: number;
}

/** OpenEXR level dimensions and counts use the selected rounding mode. */
function exrLevelSize(size: number, level: number, roundUp: boolean): number {
  return Math.max(1, (roundUp ? Math.ceil : Math.floor)(size / 2 ** level));
}
function exrLevelCount(size: number, roundUp: boolean): number {
  let count = 1;
  while (size > 1) { size = (roundUp ? Math.ceil : Math.floor)(size / 2); count++; }
  return count;
}

/** Sample positions are multiples of the channel rate in absolute pixel space. */
function exrSampleCount(start: number, length: number, sampling: number): number {
  return Math.max(0, Math.floor((start + length - 1) / sampling) - Math.ceil(start / sampling) + 1);
}
function exrChunkBytes(part: EXRPart, x: number, y: number, width: number, height: number): number {
  return part.channels.reduce((sum, channel) => sum +
    exrSampleCount(part.xmin + x, width, channel.xSampling) * exrSampleCount(part.ymin + y, height, channel.ySampling) * (channel.pixelType === 1 ? 2 : 4), 0);
}
interface EXRChannelLayout {
  readonly channel: EXRChannel; readonly width: number; readonly height: number;
  readonly firstX: number; readonly firstY: number; readonly stride: number; readonly rows: Uint32Array;
}
interface EXRChunkLayout { readonly channels: readonly EXRChannelLayout[]; readonly rawSize: number }
function exrChunkLayout(part: EXRPart, chunk: EXRChunk): EXRChunkLayout {
  const startX = part.xmin + chunk.x, startY = part.ymin + chunk.y;
  const channels = part.channels.map(channel => {
    const width = exrSampleCount(startX, chunk.width, channel.xSampling);
    const height = exrSampleCount(startY, chunk.height, channel.ySampling);
    return { channel, width, height, firstX: Math.ceil(startX / channel.xSampling) * channel.xSampling,
      firstY: Math.ceil(startY / channel.ySampling) * channel.ySampling, stride: channel.pixelType === 1 ? 2 : 4, rows: new Uint32Array(height) };
  });
  let offset = 0;
  for (let y = 0; y < chunk.height; y++) for (const item of channels) {
    const absoluteY = startY + y;
    if (absoluteY % item.channel.ySampling !== 0) continue;
    item.rows[(absoluteY - item.firstY) / item.channel.ySampling] = offset;
    offset += item.width * item.stride;
  }
  if (offset !== chunk.rawSize) throw new AssetLoadError("EXRLoader: inconsistent sampled chunk layout.", "exr");
  return { channels, rawSize: offset };
}

function validateEXRContainer(buffer: ArrayBuffer, options: AuraEXRParseOptions): EXRPart {
  const fail = (message: string): never => { throw new AssetLoadError(`EXRLoader: ${message}`, "exr"); };
  const limit = (value: number | undefined, ceiling: number, label: string): number => {
    const actual = value ?? ceiling;
    if (!Number.isSafeInteger(actual) || actual <= 0 || actual > ceiling) fail(`${label} must be a positive integer at most ${ceiling}.`);
    return actual;
  };
  const maxBytes = limit(options.maxInputBytes, 256 * 1024 * 1024, "maxInputBytes");
  const maxPixels = limit(options.maxPixels, 16_777_216, "maxPixels");
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 8 || buffer.byteLength > maxBytes) fail("invalid or over-limit input byte length.");
  if (options.type !== undefined && options.type !== "half" && options.type !== "float") fail("invalid output type.");
  if (options.outputFormat !== undefined && options.outputFormat !== "rgba" && options.outputFormat !== "rg" && options.outputFormat !== "r") fail("invalid output format.");
  if (options.layer !== undefined && (typeof options.layer !== "string" || options.layer.includes("\0") || options.layer.length > 255 || new TextEncoder().encode(options.layer).length > 255)) fail("layer must be a valid channel-layer name of at most 255 bytes.");
  const selectedPart = options.part ?? 0;
  if (!Number.isSafeInteger(selectedPart) || selectedPart < 0) fail("part must be a non-negative integer.");
  const selectedLevel = options.level === undefined ? { x: 0, y: 0 } : options.level;
  if (!selectedLevel || typeof selectedLevel !== "object" || !Number.isSafeInteger(selectedLevel.x) || selectedLevel.x < 0 || !Number.isSafeInteger(selectedLevel.y) || selectedLevel.y < 0) fail("level coordinates must be non-negative integers.");
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (view.getUint32(0, true) !== 20000630) fail("invalid OpenEXR magic.");
  const version = view.getUint32(4, true);
  if ((version & 0xff) !== 2 || (version & ~0x1e02) !== 0) fail("unsupported OpenEXR version or flags.");
  // The legacy tile flag describes a single-part tiled file. In multipart
  // files, each header's type selects its own chunk layout instead.
  const singleTiled = (version & 0x200) !== 0;
  const deep = (version & 0x800) !== 0;
  const multipart = (version & 0x1000) !== 0;
  if (deep && !multipart) fail("deep image data requires parseDeepEXR.");
  if (multipart && singleTiled) fail("multipart files cannot set the single-part tiled flag.");
  let cursor = 8;
  const requireBytes = (count: number, end = bytes.length): void => {
    if (!Number.isSafeInteger(count) || count < 0 || cursor + count > end) fail("truncated header or chunk table.");
  };
  const cstring = (end = bytes.length): string => {
    const start = cursor;
    while (cursor < end && bytes[cursor] !== 0 && cursor - start <= 255) cursor++;
    if (cursor >= end || cursor - start > 255) fail("unterminated or overlong header string.");
    const result = new TextDecoder().decode(bytes.subarray(start, cursor));
    cursor++;
    return result;
  };
  const headers: EXRPart[] = [];
  for (;;) {
    const attrs = new Map<string, { type: string; start: number; size: number }>();
    for (;;) {
      const name = cstring();
      if (!name) break;
      if (attrs.has(name) || attrs.size >= 128) fail("duplicate or excessive header attributes.");
      const type = cstring();
      requireBytes(4);
      const size = view.getUint32(cursor, true); cursor += 4;
      if (size > 4 * 1024 * 1024) fail("header attribute exceeds the size limit.");
      requireBytes(size);
      attrs.set(name, { type, start: cursor, size });
      cursor += size;
    }
    if (attrs.size === 0) {
      if (multipart && headers.length > 0) break;
      fail("missing header attributes.");
    }
    if (headers.length >= 64) fail("too many image parts.");
    const fixedSizes: Record<string, number> = { compression: 1, box2i: 16, envmap: 1, tiledesc: 9, lineOrder: 1, float: 4, v2f: 8, v3f: 12, int: 4, rational: 8, timecode: 8, chromaticities: 32 };
    for (const attr of attrs.values()) {
      if (fixedSizes[attr.type] !== undefined && fixedSizes[attr.type] !== attr.size) fail(`invalid ${attr.type} attribute size.`);
    }
    const required = (name: string, type: string) => {
      const attr = attrs.get(name);
      if (!attr || attr.type !== type) fail(`missing or invalid ${name} attribute.`);
      return attr!;
    };
    const window = required("dataWindow", "box2i");
    const xmin = view.getInt32(window.start, true), ymin = view.getInt32(window.start + 4, true);
    const width = view.getInt32(window.start + 8, true) - xmin + 1;
    const height = view.getInt32(window.start + 12, true) - ymin + 1;
    if (width <= 0 || height <= 0 || width > 16384 || height > 16384 || width * height > maxPixels) fail("invalid or over-limit data window.");
    const channels = required("channels", "chlist");
    const channelEnd = channels.start + channels.size;
    const headerCursor = cursor;
    cursor = channels.start;
    let channelCount = 0;
    const channelList: EXRChannel[] = [];
    const channelNames = new Set<string>();
    for (;;) {
      const name = cstring(channelEnd);
      if (!name) break;
      if (channelNames.has(name) || ++channelCount > 64) fail("duplicate or excessive channel count.");
      channelNames.add(name);
      requireBytes(16, channelEnd);
      const type = view.getInt32(cursor, true);
      const pLinear = view.getUint8(cursor + 4);
      const xSampling = view.getInt32(cursor + 8, true), ySampling = view.getInt32(cursor + 12, true);
      if (type !== 0 && type !== 1 && type !== 2) fail("unknown channel pixel type.");
      if (xSampling <= 0 || ySampling <= 0) fail("invalid channel sampling rate.");
      channelList.push({ name, pixelType: type as 0 | 1 | 2, pLinear, xSampling, ySampling });
      cursor += 16;
    }
    if (cursor !== channelEnd || !channelCount) fail("malformed channel list.");
    const sampledBytes = channelList.reduce((sum, channel) => sum +
      exrSampleCount(xmin, width, channel.xSampling) * exrSampleCount(ymin, height, channel.ySampling) * (channel.pixelType === 1 ? 2 : 4), 0);
    if (sampledBytes > 512 * 1024 * 1024) fail("decoded channel data exceeds the size limit.");
    cursor = headerCursor;
    const compression = view.getUint8(required("compression", "compression").start);
    const blockHeights = [1, 1, 1, 16, 32, 16, 32, 32, 32, 256];
    if (compression === 10 || compression === 11) fail(`HTJ2K${compression === 10 ? "256" : "32"} compression is unsupported.`);
    if (compression >= blockHeights.length) fail("unknown compression method.");
    let partTiled = singleTiled, partDeep = false;
    if (multipart) {
      const type = required("type", "string");
      const partType = new TextDecoder().decode(bytes.subarray(type.start, type.start + type.size));
      if (!["scanlineimage", "tiledimage", "deepscanline", "deeptile"].includes(partType)) fail("unsupported multipart image type.");
      partDeep = partType === "deepscanline" || partType === "deeptile";
      partTiled = partType === "tiledimage" || partType === "deeptile";
      if (partDeep && !deep) fail("deep part is missing the non-image flag.");
      if (partDeep && (compression > 3 || view.getInt32(required("version", "int").start, true) !== 1)) fail("unsupported deep compression or version.");
    }
    if (partDeep && channelList.some(channel => channel.xSampling !== 1 || channel.ySampling !== 1)) fail("deep channel subsampling is unsupported.");
    if (partTiled && channelList.some(channel => channel.xSampling !== 1 || channel.ySampling !== 1)) fail("tiled images cannot contain subsampled channels.");
    if (channelList.some(channel => exrSampleCount(xmin, width, channel.xSampling) === 0 || exrSampleCount(ymin, height, channel.ySampling) === 0)) fail("channel sampling has no samples in the data window.");
    let tileWidth = width, tileHeight = blockHeights[compression];
    let levelMode: 0 | 1 | 2 = 0, roundUp = false, levelsX = 1, levelsY = 1;
    if (partTiled) {
      const desc = required("tiles", "tiledesc");
      tileWidth = view.getUint32(desc.start, true); tileHeight = view.getUint32(desc.start + 4, true);
      if (tileWidth === 0 || tileHeight === 0 || tileWidth > 16384 || tileHeight > 16384) fail("invalid tile dimensions.");
      const mode = view.getUint8(desc.start + 8);
      if ((mode & 0xf) > 2 || (mode >> 4) > 1) fail("invalid tile level or rounding mode.");
      levelMode = (mode & 0xf) as 0 | 1 | 2;
      roundUp = (mode >> 4) === 1;
      if (levelMode === 1) levelsX = levelsY = exrLevelCount(Math.max(width, height), roundUp);
      else if (levelMode === 2) { levelsX = exrLevelCount(width, roundUp); levelsY = exrLevelCount(height, roundUp); }
    }
    const maxChunkWidth = Math.min(width, tileWidth), maxChunkHeight = Math.min(height, tileHeight);
    const maxChunkBytes = channelList.reduce((sum, channel) => sum + Math.ceil(maxChunkWidth / channel.xSampling) * Math.ceil(maxChunkHeight / channel.ySampling) * (channel.pixelType === 1 ? 2 : 4), 0);
    if (maxChunkBytes > 64 * 1024 * 1024) fail("decoded chunk exceeds the size limit.");
    let expectedChunks = 0;
    if (partTiled) {
      for (let ly = 0; ly < levelsY; ly++) for (let lx = 0; lx < levelsX; lx++) {
        if (levelMode === 1 && lx !== ly) continue;
        expectedChunks += Math.ceil(exrLevelSize(width, lx, roundUp) / tileWidth) * Math.ceil(exrLevelSize(height, ly, roundUp) / tileHeight);
        if (expectedChunks > 65_536) fail("chunk count exceeds the limit.");
      }
    } else expectedChunks = Math.ceil(height / tileHeight);
    let chunkCount = expectedChunks;
    if (multipart) {
      chunkCount = view.getInt32(required("chunkCount", "int").start, true);
      if (chunkCount !== expectedChunks) fail("part chunk count does not match its data window.");
    }
    if (chunkCount > 65_536) fail("chunk count exceeds the limit.");
    headers.push({ xmin, ymin, width, height, compression, chunkCount, tileWidth, tileHeight, attrs, channels: channelList, chunks: [], tiled: partTiled, deep: partDeep, multipart, version, levelMode, roundUp, levelsX, levelsY });
    if (!multipart) break;
  }
  if (selectedPart >= headers.length) fail("part index is out of range.");
  const selected = headers[selectedPart];
  if (selected.deep) fail("selected deep part requires parseDeepEXR.");
  if (selectedLevel.x >= selected.levelsX || selectedLevel.y >= selected.levelsY || (selected.levelMode === 1 && selectedLevel.x !== selectedLevel.y)) fail("requested image level is unavailable for this part.");
  const totalChunks = headers.reduce((sum, header) => sum + header.chunkCount, 0);
  if (totalChunks > 65_536) fail("total chunk count exceeds the limit.");
  const tableEnd = cursor + totalChunks * 8;
  if (tableEnd > bytes.length) fail("truncated chunk offset table.");
  const intervals: Array<[number, number]> = [];
  for (let part = 0; part < headers.length; part++) {
    const header = headers[part];
    const seen = new Set<string>();
    for (let chunk = 0; chunk < header.chunkCount; chunk++) {
      const offset64 = view.getBigUint64(cursor, true); cursor += 8;
      if (offset64 > BigInt(Number.MAX_SAFE_INTEGER)) fail("chunk offset exceeds the safe integer range.");
      let offset = Number(offset64);
      const prefix = (header.tiled ? 20 : 8) + (multipart ? 4 : 0) + (header.deep ? 20 : 0);
      if (offset < tableEnd || offset + prefix > bytes.length) fail("chunk offset is outside the input.");
      if (multipart) {
        if (view.getInt32(offset, true) !== part) fail("chunk belongs to a different part.");
        offset += 4;
      }
      let columns = header.width, lines: number, key: string, xStart = 0, yStart = 0, levelX = 0, levelY = 0;
      if (header.tiled) {
        const x = view.getInt32(offset, true), y = view.getInt32(offset + 4, true);
        levelX = view.getInt32(offset + 8, true); levelY = view.getInt32(offset + 12, true);
        if (levelX < 0 || levelY < 0 || levelX >= header.levelsX || levelY >= header.levelsY || (header.levelMode === 1 && levelX !== levelY)) fail("invalid tile level.");
        const levelWidth = exrLevelSize(header.width, levelX, header.roundUp), levelHeight = exrLevelSize(header.height, levelY, header.roundUp);
        if (x < 0 || y < 0 || x * header.tileWidth >= levelWidth || y * header.tileHeight >= levelHeight) fail("invalid tile coordinates or level.");
        columns = Math.min(header.tileWidth, levelWidth - x * header.tileWidth);
        lines = Math.min(header.tileHeight, levelHeight - y * header.tileHeight);
        xStart = x * header.tileWidth; yStart = y * header.tileHeight;
        key = `${levelX},${levelY},${x},${y}`; offset += 16;
      } else {
        const line = view.getInt32(offset, true) - header.ymin; offset += 4;
        if (line < 0 || line >= header.height || line % header.tileHeight !== 0) fail("invalid scanline chunk coordinate.");
        lines = Math.min(header.tileHeight, header.height - line); key = String(line); yStart = line;
      }
      if (seen.has(key)) fail("duplicate image chunk.");
      seen.add(key);
      if (header.deep) {
        const countLen = view.getBigUint64(offset, true), sampleLen = view.getBigUint64(offset + 8, true), unpacked = view.getBigUint64(offset + 16, true);
        offset += 24;
        const countLimit = (header.tiled ? header.tileWidth * header.tileHeight : columns * lines) * 4;
        if (!countLen || countLen > BigInt(countLimit) || sampleLen > unpacked || unpacked > BigInt(256 * 1024 * 1024) || offset + Number(countLen) + Number(sampleLen) > bytes.length) fail("invalid or over-limit deep chunk.");
        intervals.push([Number(offset64), offset + Number(countLen) + Number(sampleLen)]);
        continue;
      }
      const size = view.getUint32(offset, true); offset += 4;
      const rawSize = exrChunkBytes(header, xStart, yStart, columns, lines);
      if ((size === 0 && rawSize !== 0) || size > rawSize || offset + size > bytes.length || (header.compression === 0 && size !== rawSize)) fail("invalid or truncated image chunk.");
      if (part === selectedPart && levelX === selectedLevel.x && levelY === selectedLevel.y) header.chunks.push({ offset, size, x: xStart, y: yStart, width: columns, height: lines, rawSize });
      intervals.push([Number(offset64), offset + size]);
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < intervals.length; i++) if (intervals[i][0] < intervals[i - 1][1]) fail("overlapping image chunks.");
  return { ...selected, width: exrLevelSize(selected.width, selectedLevel.x, selected.roundUp), height: exrLevelSize(selected.height, selectedLevel.y, selected.roundUp) };
}

/**
 * Independently written PIZ block decoder.
 * The byte-level wire format and transform definitions are specified by
 * OpenEXR: https://github.com/AcademySoftwareFoundation/openexr
 * Compression family requires one sample per pixel in each dimension.
 */
class BitInput {
  position = 0;
  constructor(readonly input: Uint8Array, readonly bits: number = input.length * 8) {
    if (!Number.isSafeInteger(bits) || bits < 0 || bits > input.length * 8) throw Error('PIZ invalid bit length');
  }
  read(n: number): number {
    if (n < 0 || n > 8 || this.position + n > this.bits) throw Error('PIZ truncated bitstream');
    let value = 0;
    for (let i = 0; i < n; i++) {
      value = value * 2 + ((this.input[this.position >>> 3] >>> (7 - (this.position & 7))) & 1);
      this.position++;
    }
    return value;
  }
}

/** Use a binary trie; avoiding 32-bit bitwise truncation preserves 58-bit codes. */
function decodeHuffman(encoded: Uint8Array, count: number): Uint16Array {
  if (encoded.length < 20) throw Error('PIZ truncated Huffman header');
  const v = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  const min = v.getUint32(0, true), max = v.getUint32(4, true);
  const tableBytes = v.getUint32(8, true), dataBits = v.getUint32(12, true);
  if (min > max || max > 65536 || tableBytes > encoded.length - 20) throw Error('PIZ invalid Huffman table');
  if (Math.ceil(dataBits / 8) > encoded.length - 20 - tableBytes) throw Error('PIZ truncated Huffman data');
  const lengths = new Uint8Array(max + 1);
  const table = new BitInput(encoded.subarray(20, 20 + tableBytes));
  for (let i = min; i <= max;) {
    const item = table.read(6);
    if (item <= 58) { lengths[i++] = item; continue; }
    const run = item === 63 ? 6 + table.read(8) : item - 57;
    if (i + run > max + 1) throw Error('PIZ invalid zero run');
    i += run;
  }
  if (Math.ceil(table.position / 8) !== tableBytes) throw Error('PIZ invalid table byte count');
  const frequencies = new Uint32Array(59);
  let symbols = 0;
  for (let i = min; i <= max; i++) if (lengths[i]) { frequencies[lengths[i]]++; symbols++; }
  if (!symbols || !lengths[max]) throw Error('PIZ missing Huffman symbols');
  const next: bigint[] = Array(59).fill(0n);
  let start = 0n;
  for (let n = 58; n >= 1; n--) { next[n] = start; start = (start + BigInt(frequencies[n])) >> 1n; }
  // A trie allows every width, including code lengths longer than JS integer bit operations.
  const maxNodes = Math.min(1_000_000, 1 + symbols * 58);
  let zeros = new Int32Array(Math.min(256, maxNodes));
  let ones = new Int32Array(zeros.length);
  let leaves = new Int32Array(zeros.length);
  let size = 1;
  function node(): number {
    if (size >= maxNodes) throw Error('PIZ Huffman tree exceeds limit');
    if (size === zeros.length) {
      const n = Math.min(maxNodes, zeros.length * 2);
      const z = new Int32Array(n), o = new Int32Array(n), l = new Int32Array(n);
      z.set(zeros); o.set(ones); l.set(leaves); zeros = z; ones = o; leaves = l;
    }
    return size++;
  }
  for (let value = min; value <= max; value++) {
    const length = lengths[value];
    if (!length) continue;
    const code = next[length]++;
    if (code >= (1n << BigInt(length))) throw Error('PIZ invalid Huffman code');
    let at = 0;
    for (let bit = length - 1; bit >= 0; bit--) {
      if (leaves[at]) throw Error('PIZ ambiguous Huffman code');
      const edges = ((code >> BigInt(bit)) & 1n) ? ones : zeros;
      // node() may resize arrays, so assign to the new array after allocation.
      let child = edges[at];
      if (!child) {
        child = node();
        if (((code >> BigInt(bit)) & 1n) === 1n) ones[at] = child;
        else zeros[at] = child;
      }
      at = child;
    }
    if (leaves[at] || zeros[at] || ones[at]) throw Error('PIZ ambiguous Huffman tree');
    leaves[at] = value + 1;
  }
  const bits = new BitInput(encoded.subarray(20 + tableBytes), dataBits);
  const result = new Uint16Array(count);
  let cursor = 0;
  while (bits.position < bits.bits) {
    let at = 0;
    do {
      at = bits.read(1) ? ones[at] : zeros[at];
      if (!at) throw Error('PIZ invalid Huffman symbol');
    } while (!leaves[at]);
    const symbol = leaves[at] - 1;
    if (symbol === max) {
      const repeats = bits.read(8);
      if (cursor === 0 || cursor + repeats > count) throw Error('PIZ invalid repeated symbol');
      result.fill(result[cursor - 1], cursor, cursor + repeats);
      cursor += repeats;
    } else {
      if (cursor >= count) throw Error('PIZ Huffman output exceeds limit');
      result[cursor++] = symbol;
    }
  }
  if (cursor !== count) throw Error('PIZ incomplete Huffman output');
  return result;
}

function reversePair(low: number, high: number, narrow: boolean): [number, number] {
  if (narrow) {
    const a = ((low << 16) >> 16) + Math.ceil(((high << 16) >> 16) / 2);
    return [a & 65535, (a - ((high << 16) >> 16)) & 65535];
  }
  const b = (low - Math.floor(high / 2)) & 65535;
  return [(high + b - 32768) & 65535, b];
}

/** Reverse the two-dimensional lifting transform in coarse-to-fine stages. */
function reverseWavelet(data: Uint16Array, start: number, width: number, height: number, stride: number, narrow: boolean): void {
  const at = (x: number, y: number) => start + (y * width + x) * stride;
  const pair = (a: number, b: number) => {
    const [x, y] = reversePair(data[a], data[b], narrow);
    data[a] = x; data[b] = y;
  };
  let step = 1;
  while (step * 2 <= Math.min(width, height)) step *= 2;
  for (step /= 2; step >= 1; step /= 2) {
    const span = step * 2;
    let y = 0;
    for (; y + span <= height; y += span) {
      let x = 0;
      for (; x + span <= width; x += span) {
        const a = at(x, y), b = at(x + step, y), c = at(x, y + step), d = at(x + step, y + step);
        pair(a, c); pair(b, d); pair(a, b); pair(c, d);
      }
      if ((width & step) !== 0) pair(at(x, y), at(x, y + step));
    }
    if ((height & step) !== 0) {
      for (let x = 0; x + span <= width; x += span) pair(at(x, y), at(x + step, y));
    }
  }
}

/** Decode one PIZ-compressed scanline/tile chunk into little-endian channel rows. */
function decodePizBlock(input: Uint8Array, layout: EXRChunkLayout): Uint8Array {
  const channels = layout.channels;
  const wordCount = layout.rawSize / 2;
  if (!Number.isSafeInteger(wordCount) || wordCount > 32 * 1024 * 1024) throw Error('PIZ output exceeds limit');
  if (input.length < 8) throw Error('PIZ truncated bitmap header');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const first = view.getUint16(0, true), last = view.getUint16(2, true);
  if (last >= 8192) throw Error('PIZ invalid bitmap bounds');
  const bitmapLength = first <= last ? last - first + 1 : 0;
  let pos = 4;
  if (pos + bitmapLength + 4 > input.length) throw Error('PIZ truncated bitmap');
  const bitmap = new Uint8Array(8192);
  bitmap.set(input.subarray(pos, pos + bitmapLength), first <= last ? first : 0); pos += bitmapLength;
  const huffmanBytes = view.getUint32(pos, true); pos += 4;
  if (huffmanBytes > input.length - pos) throw Error('PIZ truncated Huffman payload');
  const reverse = new Uint16Array(65536);
  let entries = 1;
  for (let i = 1; i < 65536; i++) if ((bitmap[i >>> 3] & (1 << (i & 7))) !== 0) reverse[entries++] = i;
  const words = decodeHuffman(input.subarray(pos, pos + huffmanBytes), wordCount);
  let channelStart = 0;
  for (const channel of channels) {
    const stride = channel.stride / 2;
    if (channel.width && channel.height) for (let plane = 0; plane < stride; plane++) reverseWavelet(words, channelStart + plane, channel.width, channel.height, stride, entries - 1 < 16384);
    channelStart += channel.width * channel.height * stride;
  }
  for (let i = 0; i < words.length; i++) {
    if (words[i] >= entries) throw Error('PIZ palette index exceeds bitmap');
    words[i] = reverse[words[i]];
  }
  const result = new Uint8Array(wordCount * 2), out = new DataView(result.buffer);
  channelStart = 0;
  for (const channel of channels) {
    const stride = channel.stride / 2;
    for (let y = 0; y < channel.height; y++) {
      const line = channelStart + y * channel.width * stride, output = channel.rows[y];
      for (let i = 0; i < channel.width * stride; i++) out.setUint16(output + i * 2, words[line + i], true);
    }
    channelStart += channel.width * channel.height * stride;
  }
  return result;
}


/** Independently authored DWAA/DWAB scanline decoder. */
type BoundedInflate = (data: Uint8Array, maximumBytes: number) => Promise<Uint8Array>;

type Rule = { suffix: string; pixelType: number; scheme: number; insensitive: boolean; csc: number };

/** Output is scanline-major with channel-planar little-endian samples per scanline. */
async function decodeDwaBlock(
  input: Uint8Array,
  width: number,
  height: number,
  layout: EXRChunkLayout,
  inflate: BoundedInflate
): Promise<Uint8Array> {
  const bad = (message: string): never => { throw new Error(`EXRLoader: DWA ${message}`); };
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || layout.channels.length < 1 || layout.channels.length > 64) bad('invalid dimensions or channels.');
  if (input.byteLength < 88) bad('truncated block header.');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const counters = Array.from({length: 11}, (_, index) => {
    const number = view.getBigUint64(index * 8, true);
    if (number > BigInt(Number.MAX_SAFE_INTEGER)) bad('counter exceeds the safe integer range.');
    return Number(number);
  });
  const [version, unknownLength, unknownCompressed, acCompressed, dcCompressed, rleCompressed, rleLength, rleRawLength, acCount, dcCount, acMethod] = counters;
  if (version > 2 || acMethod > 1) bad('unsupported block version or AC method.');
  let position = 88;
  const rules: Rule[] = [];
  if (version >= 2) {
    if (position + 2 > input.length) bad('truncated classification table.');
    const tableSize = view.getUint16(position, true);
    if (tableSize < 2 || position + tableSize > input.length) bad('invalid classification table size.');
    const tableEnd = position + tableSize;
    position += 2;
    while (position < tableEnd) {
      const start = position;
      while (position < tableEnd && input[position] !== 0 && position - start <= 128) position++;
      if (position >= tableEnd || position - start > 128 || position + 3 > tableEnd || rules.length >= 256) bad('invalid classification rule.');
      const suffix = new TextDecoder('utf-8', {fatal:true}).decode(input.subarray(start, position));
      position++;
      const flags = input[position++];
      const pixelType = input[position++];
      const scheme = (flags >>> 2) & 3;
      if ((flags >>> 4) > 3 || scheme > 2 || pixelType > 2 || (flags & 2) !== 0) bad('unsupported classification rule.');
      rules.push({suffix, pixelType, scheme, insensitive: Boolean(flags & 1), csc: (flags >>> 4) - 1});
    }
    if (position !== tableEnd) bad('classification table length mismatch.');
  } else {
    for (const [suffix, csc] of [['r',0],['red',0],['g',1],['grn',1],['green',1],['b',2],['blu',2],['blue',2],['y',-1],['by',-1],['ry',-1]] as const) {
      for (const pixelType of [1,2]) rules.push({suffix, pixelType, scheme:1, insensitive:true, csc});
    }
    for (const pixelType of [0,1,2]) rules.push({suffix:'a',pixelType,scheme:2,insensitive:true,csc:-1});
  }
  if (!Number.isSafeInteger(width * height) || width * height > 16_777_216) bad('pixel count exceeds limit.');
  const rawBytes = layout.rawSize;
  if (!Number.isSafeInteger(rawBytes) || rawBytes > 64 * 1024 * 1024) bad('expanded block exceeds limit.');
  let expectedUnknown = 0, expectedRle = 0;
  const channelsInfo = layout.channels.map((sample) => {
    const channel = sample.channel;
    if (![0,1,2].includes(channel.pixelType)) bad('unsupported channel type.');
    const suffix = channel.name.slice(channel.name.lastIndexOf('.') + 1);
    let scheme = 0, csc = -1;
    for (const rule of rules) {
      const matches = rule.insensitive ? suffix.toLowerCase() === rule.suffix.toLowerCase() : suffix === rule.suffix;
      if (channel.pixelType === rule.pixelType && matches) { scheme = rule.scheme; csc = rule.csc; }
    }
    const stride = sample.stride, pixelCount = sample.width * sample.height;
    const size = pixelCount * stride;
    const offset = scheme === 0 ? expectedUnknown : expectedRle;
    if (scheme === 0) expectedUnknown += size; else if (scheme === 2) expectedRle += size;
    const blocks = Math.ceil(sample.width / 8) * Math.ceil(sample.height / 8);
    return {scheme, stride, offset, csc, channel, sample, pixelCount, blocks, linear: Boolean(channel.pLinear), dct: undefined as Float32Array | undefined};
  });
  const totalBlocks = channelsInfo.reduce((sum, item) => sum + (item.scheme === 1 ? item.blocks : 0), 0);
  if (totalBlocks > 65_536) bad('DCT operation budget exceeded.');
  for (const channel of channelsInfo) if (channel.scheme === 1) channel.dct = new Float32Array(channel.pixelCount);
  if (unknownLength !== expectedUnknown || rleRawLength !== expectedRle || rleLength > expectedRle * 2 || dcCount !== totalBlocks || acCount > totalBlocks * 63) bad('stream sizes disagree with channel layout.');
  if ((acCount === 0) !== (acCompressed === 0) || (dcCount === 0) !== (dcCompressed === 0)) bad('missing lossy DCT stream.');
  if (position + unknownCompressed + acCompressed + dcCompressed + rleCompressed !== input.length) bad('compressed section lengths are invalid.');
  if ((unknownLength === 0) !== (unknownCompressed === 0) || (rleRawLength === 0) !== (rleCompressed === 0)) bad('missing compressed data.');
  let unknown: Uint8Array = new Uint8Array(0);
  if (unknownCompressed) {
    unknown = await inflate(input.subarray(position, position + unknownCompressed), unknownLength);
    if (unknown.length !== unknownLength) bad('lossless channel stream size mismatch.');
  }
  position += unknownCompressed;
  let ac: Uint16Array = new Uint16Array(0);
  if (acCompressed) {
    const encoded = input.subarray(position, position + acCompressed);
    if (acMethod === 0) ac = decodeHuffman(encoded, acCount);
    else {
      const data = await inflate(encoded, acCount * 2);
      if (data.length !== acCount * 2) bad('AC stream has the wrong length.');
      const reader = new DataView(data.buffer, data.byteOffset, data.byteLength);
      ac = Uint16Array.from({length:acCount}, (_, i) => reader.getUint16(i*2, true));
    }
  }
  position += acCompressed;
  let dc = new Uint16Array(0);
  if (dcCompressed) {
    const compressed = await inflate(input.subarray(position, position + dcCompressed), dcCount * 2);
    if (compressed.length !== dcCount * 2) bad('DC stream has the wrong length.');
    for (let i=1;i<compressed.length;i++) compressed[i]=(compressed[i-1]+compressed[i]-128)&255;
    const reconstructed = new Uint8Array(compressed.length);
    const second = Math.ceil(compressed.length/2);
    for (let i=0;i<reconstructed.length;i++) reconstructed[i]=compressed[i%2===0?i/2:second+Math.floor(i/2)];
    const reader = new DataView(reconstructed.buffer);
    dc = Uint16Array.from({length:dcCount}, (_,i)=>reader.getUint16(i*2,true));
  }
  position += dcCompressed;
  let rle = new Uint8Array(0);
  if (rleCompressed) {
    const packed = await inflate(input.subarray(position, position + rleCompressed), rleLength);
    if (packed.length !== rleLength) bad('RLE stream size mismatch.');
    rle = new Uint8Array(rleRawLength);
    let src=0, dst=0;
    while (src < packed.length) {
      const length = (packed[src++] << 24) >> 24;
      const count = length < 0 ? -length : length + 1;
      if (dst + count > rle.length) bad('RLE stream exceeds declared output.');
      if (length < 0) {
        if (src + count > packed.length) bad('truncated RLE literal.');
        rle.set(packed.subarray(src, src + count), dst); src += count;
      } else {
        if (src >= packed.length) bad('truncated RLE run.');
        rle.fill(packed[src++], dst, dst + count);
      }
      dst += count;
    }
    if (dst !== rleRawLength) bad('RLE output size mismatch.');
  }
  const sets = new Map<string, Array<number | undefined>>();
  for (let index=0; index<channelsInfo.length; index++) {
    const info=channelsInfo[index];
    if (info.scheme !== 1 || info.csc < 0) continue;
    const dot=info.channel.name.lastIndexOf('.');
    const prefix=dot < 0 ? '' : info.channel.name.slice(0,dot+1);
    const set=sets.get(prefix) ?? [];
    if (set[info.csc] !== undefined) bad('duplicate color channel.');
    set[info.csc]=index; sets.set(prefix,set);
  }
  const groups: number[][] = [];
  const grouped = new Set<number>();
  for (const set of sets.values()) if (set.length === 3 && [0,1,2].every((index)=>set[index] !== undefined)) {
    const group = set as number[];
    const first = channelsInfo[group[0]].sample;
    if (group.every(index => channelsInfo[index].sample.width === first.width && channelsInfo[index].sample.height === first.height && channelsInfo[index].channel.xSampling === first.channel.xSampling && channelsInfo[index].channel.ySampling === first.channel.ySampling)) {
      groups.push(group); for(const index of group) grouped.add(index);
    }
  }
  for (let i=0;i<channelsInfo.length;i++) if (channelsInfo[i].scheme===1 && !grouped.has(i)) groups.push([i]);
  let acPosition=0,dcPosition=0;
  for (const group of groups) {
    const sample = channelsInfo[group[0]].sample, blockCount = channelsInfo[group[0]].blocks;
    for (let by=0;by<Math.ceil(sample.height/8);by++) for (let bx=0;bx<Math.ceil(sample.width/8);bx++) {
      const blockIndex=by*Math.ceil(sample.width/8)+bx;
      const blocks = group.map((_index,component)=>{
        const coefficients = new Float64Array(64);
        coefficients[0] = halfToNumber(dc[dcPosition+component*blockCount+blockIndex]);
        let index=1;
        while(index<64){
          if(acPosition>=ac.length) bad('truncated AC coefficients.');
          const item=ac[acPosition++];
          if((item&0xff00)===0xff00){const run=item&255;if(run===0) index=64; else {index+=run;if(index>64)bad('AC zero run exceeds block.');}}
          else coefficients[zigzag[index++]]=halfToNumber(item);
        }
        return inverseDct(coefficients);
      });
      for(let y=0;y<8 && by*8+y<sample.height;y++) for(let x=0;x<8 && bx*8+x<sample.width;x++) {
        const pixel=y*8+x, dst=(by*8+y)*sample.width+bx*8+x;
        if(group.length===3){
          const luminance=blocks[0][pixel], cb=blocks[1][pixel], cr=blocks[2][pixel];
          blocks[0][pixel]=luminance+1.5747*cr;
          blocks[1][pixel]=luminance-0.1873*cb-0.4682*cr;
          blocks[2][pixel]=luminance+1.8556*cb;
        }
        for(let i=0;i<group.length;i++){
          const info=channelsInfo[group[i]];
          let value=halfToNumber(numberToHalf(blocks[i][pixel]));
          if(group.length===3 || !info.linear) value=toLinear(value);
          info.dct![dst]=halfToNumber(numberToHalf(value));
        }
      }
    }
    dcPosition+=group.length*blockCount;
  }
  if(acPosition!==ac.length || dcPosition!==dc.length) bad('unused DCT coefficients.');
  const output = new Uint8Array(rawBytes), resultView = new DataView(output.buffer);
  for (const info of channelsInfo) {
    const sample = info.sample;
    for (let y=0; y<sample.height; y++) {
      const dest = sample.rows[y];
      if (info.scheme === 1) {
        for(let x=0;x<sample.width;x++){
          const value=info.dct![y*sample.width+x];
          if(info.stride===2) resultView.setUint16(dest+x*2,numberToHalf(value),true);
          else resultView.setFloat32(dest+x*4,value,true);
        }
      } else if (info.scheme === 0) {
        const start = info.offset + y * sample.width * info.stride;
        output.set(unknown.subarray(start, start + sample.width * info.stride), dest);
      } else {
        for (let x=0; x<sample.width; x++) {
          for (let component=0; component<info.stride; component++) {
            output[dest + x * info.stride + component] = rle[info.offset + component * info.pixelCount + y * sample.width + x];
          }
        }
      }
    }
  }
  return output;
}


const zigzag: number[] = [];
for (let sum=0;sum<=14;sum++) {
  const min=Math.max(0,sum-7),max=Math.min(7,sum);
  if(sum%2===0){for(let row=max;row>=min;row--)zigzag.push(row*8+(sum-row));}
  else {for(let row=min;row<=max;row++)zigzag.push(row*8+(sum-row));}
}
const weights=Array.from({length:8},(_,position)=>Array.from({length:8},(_,frequency)=>
  (frequency===0?1/Math.sqrt(2):1)*Math.cos((2*position+1)*frequency*Math.PI/16)));
function inverseDct(coefficients:Float64Array):Float64Array {
  const intermediate=new Float64Array(64), output=new Float64Array(64);
  for(let v=0;v<8;v++) for(let x=0;x<8;x++) {
    let value=0; for(let u=0;u<8;u++) value+=coefficients[v*8+u]*weights[x][u];
    intermediate[v*8+x]=value/2;
  }
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    let value=0;for(let v=0;v<8;v++)value+=intermediate[v*8+x]*weights[y][v];
    output[y*8+x]=value/2;
  }
  return output;
}
function halfToNumber(bits:number):number {
  const sign=bits&0x8000?-1:1,exponent=(bits>>>10)&31,mantissa=bits&1023;
  if(exponent===31) return mantissa?NaN:sign*Infinity;
  if(exponent===0) return sign*mantissa*2**-24;
  return sign*(1+mantissa/1024)*2**(exponent-15);
}
const scratchFloat=new Float32Array(1),scratchBits=new Uint32Array(scratchFloat.buffer);
function numberToHalf(value:number):number {
  scratchFloat[0]=value;
  const bits=scratchBits[0],sign=(bits>>>16)&0x8000,exponent=(bits>>>23)&255;
  let fraction=bits&0x7fffff;
  if(exponent===255)return sign|0x7c00|(fraction?0x200:0);
  const halfExponent=exponent-112;
  if(halfExponent>=31)return sign|0x7c00;
  if(halfExponent< -10)return sign;
  if(halfExponent<=0){
    fraction|=0x800000;const shift=14-halfExponent,result=fraction>>>shift,remainder=fraction&((1<<shift)-1),midpoint=1<<(shift-1);
    return sign|(result+Number(remainder>midpoint||(remainder===midpoint&&(result&1)!==0)));
  }
  const result=(halfExponent<<10)|(fraction>>>13),remainder=fraction&0x1fff;
  return sign|(result+Number(remainder>0x1000||(remainder===0x1000&&(result&1)!==0)));
}
function toLinear(value:number):number {
  if(!Number.isFinite(value))return 0;
  const sign=value<0?-1:1,magnitude=Math.abs(value);
  return sign*(magnitude<=1?magnitude**2.2:9.02501329156**(magnitude-1));
}


/**
 * Decode one compressed OpenEXR B44 or B44A image chunk. Encoded channels
 * appear in header order, each channel containing either raw FLOAT/UINT rows
 * or HALF samples encoded as 4x4 blocks. The output is EXR scanline layout.
 */
function decodeB44Block(
  source: Uint8Array,
  layout: EXRChunkLayout,
  flatBlocks: boolean,
  halfToFloat: (bits: number) => number,
  floatToHalf: (value: number) => number,
): DataView {
  const size = layout.rawSize;
  if (!Number.isSafeInteger(size) || size > 64 * 1024 * 1024) throw new Error('EXR B44 block exceeds allocation limit');
  const decoded = new Uint8Array(size);
  const output = new DataView(decoded.buffer);
  let input = 0;
  for (const item of layout.channels) {
    const channel = item.channel, width = item.width, height = item.height, sampleBytes = item.stride;
    if (channel.pixelType !== 1) {
      for (let y = 0; y < height; y++) {
        const rowLength = width * sampleBytes;
        if (input + rowLength > source.length) throw new Error('EXR B44 truncated raw channel');
        decoded.set(source.subarray(input, input + rowLength), item.rows[y]);
        input += rowLength;
      }
    } else {
      for (let y0 = 0; y0 < height; y0 += 4) {
        for (let x0 = 0; x0 < width; x0 += 4) {
          if (input + 3 > source.length) throw new Error('EXR B44 truncated block header');
          const base = (source[input] << 8) | source[input + 1];
          const shift = source[input + 2] >>> 2;
          const values = new Uint16Array(16);
          values[0] = base;
          if (shift === 63) {
            if (!flatBlocks || source[input + 2] !== 0xfc) throw new Error('EXR B44 invalid flat block');
            values.fill(base);
            input += 3;
          } else {
            if (shift > 15 || input + 14 > source.length) throw new Error('EXR B44 invalid shift or truncated block');
            let bit = (input + 2) * 8 + 6;
            const next = (): number => {
              let code = 0;
              for (let i = 0; i < 6; i++, bit++) code = (code << 1) | ((source[bit >>> 3] >>> (7 - (bit & 7))) & 1);
              return (code - 32) * 2 ** shift;
            };
            for (let y = 1; y < 4; y++) values[y * 4] = (values[(y - 1) * 4] + next()) & 0xffff;
            for (let x = 1; x < 4; x++) for (let y = 0; y < 4; y++) {
              const index = y * 4 + x;
              values[index] = (values[index - 1] + next()) & 0xffff;
            }
            input += 14;
          }
          for (let y = 0; y < 4 && y0 + y < height; y++) {
            for (let x = 0; x < 4 && x0 + x < width; x++) {
              const ordered = values[y * 4 + x];
              let bits = ordered & 0x8000 ? ordered & 0x7fff : (~ordered) & 0xffff;
              if (channel.pLinear) {
                const value = halfToFloat(bits);
                bits = !Number.isFinite(value) || value < 0 ? 0
                  : value === 0 ? 0xfc00 : floatToHalf(Math.fround(Math.log(value)) * 8);
              }
              output.setUint16(item.rows[y0 + y] + (x0 + x) * 2, bits, true);
            }
          }
        }
      }
    }
  }
  if (input !== source.length) throw new Error('EXR B44 unexpected trailing block bytes');
  return output;
}


/** Interpret a decoded binary16 bit pattern as a JavaScript number. */
function fromHalfFloat(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >>> 10) & 31, fraction = bits & 1023;
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

const EXR_COMPRESSION_NAMES = ["NO_COMPRESSION", "RLE_COMPRESSION", "ZIPS_COMPRESSION", "ZIP_COMPRESSION", "PIZ_COMPRESSION", "PXR24_COMPRESSION", "B44_COMPRESSION", "B44A_COMPRESSION", "DWAA_COMPRESSION", "DWAB_COMPRESSION", "HTJ2K256_COMPRESSION", "HTJ2K32_COMPRESSION"] as const;

function readEXRMetadata(part: EXRPart, view: DataView, bytes: Uint8Array): Record<string, unknown> {
  const metadata: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const decode = new TextDecoder();
  for (const [name, attr] of part.attrs) {
    const start = attr.start;
    switch (attr.type) {
      case "chlist": metadata[name] = part.channels; break;
      case "compression": metadata[name] = EXR_COMPRESSION_NAMES[part.compression]; break;
      case "box2i": metadata[name] = { xMin:view.getInt32(start,true), yMin:view.getInt32(start+4,true), xMax:view.getInt32(start+8,true), yMax:view.getInt32(start+12,true) }; break;
      case "lineOrder": metadata[name] = ["INCREASING_Y", "DECREASING_Y", "RANDOM_Y"][view.getUint8(start)]; break;
      case "envmap": metadata[name] = ["ENVMAP_LATLONG", "ENVMAP_CUBE"][view.getUint8(start)]; break;
      case "tiledesc": metadata[name] = { xSize:view.getUint32(start,true), ySize:view.getUint32(start+4,true), levelMode:["ONE_LEVEL", "MIPMAP_LEVELS", "RIPMAP_LEVELS"][part.levelMode], roundingMode:part.roundUp ? "ROUND_UP" : "ROUND_DOWN" }; break;
      case "float": metadata[name] = view.getFloat32(start,true); break;
      case "int": metadata[name] = view.getInt32(start,true); break;
      case "v2f": metadata[name] = [view.getFloat32(start,true), view.getFloat32(start+4,true)]; break;
      case "v3f": metadata[name] = [view.getFloat32(start,true), view.getFloat32(start+4,true), view.getFloat32(start+8,true)]; break;
      case "rational": metadata[name] = [view.getInt32(start,true), view.getUint32(start+4,true)]; break;
      case "timecode": metadata[name] = [view.getUint32(start,true), view.getUint32(start+4,true)]; break;
      case "chromaticities": metadata[name] = Object.fromEntries(["redX","redY","greenX","greenY","blueX","blueY","whiteX","whiteY"].map((key, i) => [key,view.getFloat32(start+i*4,true)])); break;
      case "string": metadata[name] = decode.decode(bytes.subarray(start,start+attr.size)); break;
      case "stringvector": {
        const values: string[] = [];
        let offset = start;
        const end = start + attr.size;
        while (offset < end) {
          if (offset + 4 > end) throw new AssetLoadError("EXRLoader: truncated string vector.", "exr");
          const length = view.getInt32(offset, true); offset += 4;
          if (length < 0 || offset + length > end) throw new AssetLoadError("EXRLoader: invalid string vector length.", "exr");
          values.push(decode.decode(bytes.subarray(offset, offset + length))); offset += length;
        }
        metadata[name] = values;
        break;
      }
      default: metadata[name] = { type: attr.type, bytes: bytes.subarray(start,start+attr.size) }; break;
    }
  }
  metadata.version = part.version & 0xff;
  metadata.spec = {singleTile:Boolean(part.version & 0x200), longName:Boolean(part.version & 0x400), deepFormat:Boolean(part.version & 0x800), multiPart:part.multipart};
  return metadata;
}

async function decodePXR24Block(input: Uint8Array, part: EXRPart, chunk: EXRChunk, layout: EXRChunkLayout): Promise<Uint8Array> {
  const expected = layout.channels.reduce((sum, item) => sum + item.width * item.height * (item.channel.pixelType === 1 ? 2 : item.channel.pixelType === 2 ? 3 : 4), 0);
  const planes = await inflateZlib(input, expected);
  if (planes.length !== expected) throw new AssetLoadError("EXRLoader: PXR24 output has an invalid size.", "exr");
  const result = new Uint8Array(layout.rawSize), output = new DataView(result.buffer);
  let src = 0;
  for (let y = 0; y < chunk.height; y++) for (const item of layout.channels) {
    const channel = item.channel, absoluteY = part.ymin + chunk.y + y;
    if (absoluteY % channel.ySampling !== 0) continue;
    const size = item.stride, count = channel.pixelType === 1 ? 2 : channel.pixelType === 2 ? 3 : 4;
    let dst = item.rows[(absoluteY - item.firstY) / channel.ySampling];
    let value=0;
    for (let x=0; x<item.width; x++) {
      let delta=0;
      for (let plane=0; plane<count; plane++) delta=(delta << 8) | planes[src+plane*item.width+x];
      if (channel.pixelType === 2) delta <<= 8;
      value=(value+delta) >>> 0;
      if (size === 2) output.setUint16(dst,value & 0xffff,true); else output.setUint32(dst,value,true);
      dst += size;
    }
    src += count*item.width;
  }
  return result;
}

async function decodeEXRChunk(part: EXRPart, chunk: EXRChunk, bytes: Uint8Array, layout: EXRChunkLayout): Promise<Uint8Array> {
  const source = bytes.subarray(chunk.offset,chunk.offset+chunk.size);
  const expected = layout.rawSize;
  if (source.length === expected) return source;
  switch (part.compression) {
    case 0: throw new AssetLoadError("EXRLoader: truncated uncompressed block.", "exr");
    case 1: return decodeDeepRle(source,expected);
    case 2: case 3: {
      const decoded = await inflateZlib(source,expected);
      if (decoded.length !== expected) throw new AssetLoadError("EXRLoader: ZIP output has an invalid size.", "exr");
      return undoDeepPredictorAndShuffle(decoded);
    }
    case 4: return decodePizBlock(source,layout);
    case 5: return decodePXR24Block(source,part,chunk,layout);
    case 6: case 7: {
      const decoded = decodeB44Block(source,layout,part.compression===7,fromHalfFloat,toHalfFloat);
      return new Uint8Array(decoded.buffer,decoded.byteOffset,decoded.byteLength);
    }
    case 8: case 9: return decodeDwaBlock(source,chunk.width,chunk.height,layout,inflateZlib);
    default: throw new AssetLoadError(`EXRLoader: ${EXR_COMPRESSION_NAMES[part.compression] ?? "unknown compression"} is unsupported.`, "exr");
  }
}

/** Derive RGB luminance coefficients from the file's CIE xy primaries and white. */
function exrLuminanceWeights(part: EXRPart, view: DataView): readonly [number, number, number] {
  const attr = part.attrs.get("chromaticities");
  if (!attr) return [0.2126, 0.7152, 0.0722];
  const invalid = (): never => { throw new AssetLoadError("EXRLoader: invalid or degenerate chromaticities for luminance/chroma conversion.", "exr"); };
  if (attr.type !== "chromaticities" || attr.size !== 32) invalid();
  const xy = Array.from({ length: 8 }, (_, i) => view.getFloat32(attr.start + i * 4, true));
  if (xy.some(value => !Number.isFinite(value)) || [xy[1], xy[3], xy[5], xy[7]].some(y => y === 0)) invalid();
  const xyz = (index: number): readonly [number, number] => {
    const x = xy[index], y = xy[index + 1];
    return [x / y, (1 - x - y) / y];
  };
  const [rx, rz] = xyz(0), [gx, gz] = xyz(2), [bx, bz] = xyz(4), [wx, wz] = xyz(6);
  // The Y row of the primary-to-XYZ matrix is [1,1,1], so green's
  // contribution can be eliminated and the remaining 2x2 system solved.
  const a = rx - gx, b = bx - gx, c = wx - gx;
  const d = rz - gz, e = bz - gz, f = wz - gz;
  const det = a * e - b * d;
  if (!Number.isFinite(det) || Math.abs(det) <= Math.max(1, Math.abs(a * e), Math.abs(b * d)) * 1e-12) invalid();
  const red = (c * e - b * f) / det, blue = (a * f - c * d) / det, green = 1 - red - blue;
  if (![red, green, blue].every(Number.isFinite) || Math.abs(green) <= 1e-12) invalid();
  return [red, green, blue];
}

/** Decode bounded scanline or selected tiled-level OpenEXR pixels. */
export async function parseEXR(buffer: ArrayBuffer, options: AuraEXRParseOptions = {}): Promise<AuraEXRTextureData> {
  const part = validateEXRContainer(buffer,options);
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const header = readEXRMetadata(part,view,bytes);
  const names = new Set(part.channels.map(channel => channel.name));
  const layer = options.layer ?? "", prefix = layer ? `${layer}.` : "";
  const key = (name: string) => `${prefix}${name}`, has = (name: string) => names.has(key(name));
  if (!["R","G","B","A","Y"].some(has)) throw new AssetLoadError(`EXRLoader: no representable color channels in ${layer ? `layer ${layer}` : "the root layer"}.`,"exr");
  const chroma = has("RY") || has("BY");
  if (chroma && (!has("Y") || !has("RY") || !has("BY"))) throw new AssetLoadError("EXRLoader: luminance/chroma requires Y, RY and BY channels in the selected layer.","exr");
  const luminanceWeights = chroma ? exrLuminanceWeights(part, view) : undefined;
  const outputFormat: AuraEXROutputFormat = options.outputFormat ?? "rgba";
  const outputType = options.type ?? "half";
  const components: 1 | 2 | 4 = outputFormat === "rgba" ? 4 : outputFormat === "rg" ? 2 : 1;
  const data = outputType === "float" ? new Float32Array(part.width * part.height * components) : new Uint16Array(part.width * part.height * components);
  const chromaPlane = chroma && components < 4
    ? outputType === "float" ? new Float32Array(part.width * part.height) : new Uint16Array(part.width * part.height)
    : undefined;
  const channelMap: Record<string, number> = Object.create(null) as Record<string, number>;
  if (chroma) {
    channelMap[key("Y")] = 0; channelMap[key("RY")] = 1;
    if (components >= 2) channelMap[key("BY")] = 2;
    if (components === 4 && has("A")) channelMap[key("A")] = 3;
  } else {
    channelMap[key("R")] = 0;
    if (!has("R") && has("Y")) channelMap[key("Y")] = 0;
    if (components >= 2) channelMap[key("G")] = 1;
    if (components === 4) { channelMap[key("B")] = 2; channelMap[key("A")] = 3; }
  }
  if (components === 4 && !has("A")) for (let i=3;i<data.length;i+=4) data[i] = outputType === "half" ? 0x3c00 : 1;
  for (const chunk of part.chunks) {
    const layout = exrChunkLayout(part, chunk);
    let raw: Uint8Array;
    try { raw = await decodeEXRChunk(part,chunk,bytes,layout); }
    catch (error) {
      if (error instanceof AssetLoadError) throw error;
      throw new AssetLoadError(`EXRLoader: failed to decode ${EXR_COMPRESSION_NAMES[part.compression]}: ${error instanceof Error ? error.message : String(error)}`, "exr", [], error);
    }
    if (raw.length !== layout.rawSize) throw new AssetLoadError("EXRLoader: decoded block has an invalid size.","exr");
    const block = new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
    for (const item of layout.channels) {
      const channel = item.channel, stride = item.stride, slot = channelMap[channel.name];
      if (slot !== undefined) {
        const target = slot < components ? data : chromaPlane!;
        const targetStride = slot < components ? components : 1;
        const targetSlot = slot < components ? slot : 0;
        for (let y=0;y<item.height;y++) for (let x=0;x<item.width;x++) {
          const src = item.rows[y] + x * stride;
          const imageX = item.firstX + x * channel.xSampling - part.xmin;
          const imageY = item.firstY + y * channel.ySampling - part.ymin;
          const dst=((part.height-1-imageY)*part.width+imageX)*targetStride+targetSlot;
          if (channel.pixelType === 1) {
            const bits=block.getUint16(src,true);
            target[dst]=outputType === "half" ? bits : fromHalfFloat(bits);
          } else {
            const value=channel.pixelType === 2 ? block.getFloat32(src,true) : block.getUint32(src,true);
            target[dst]=outputType === "half" ? toHalfFloat(value) : value;
          }
        }
      }
    }
  }
  for (const channel of part.channels) {
    const slot = channelMap[channel.name];
    if (slot === undefined || (channel.xSampling === 1 && channel.ySampling === 1)) continue;
    const target = slot < components ? data : chromaPlane!;
    const targetStride = slot < components ? components : 1;
    const targetSlot = slot < components ? slot : 0;
    const firstX = Math.ceil(part.xmin / channel.xSampling) * channel.xSampling;
    const firstY = Math.ceil(part.ymin / channel.ySampling) * channel.ySampling;
    const lastX = Math.floor((part.xmin + part.width - 1) / channel.xSampling) * channel.xSampling;
    const lastY = Math.floor((part.ymin + part.height - 1) / channel.ySampling) * channel.ySampling;
    for (let y = 0; y < part.height; y++) for (let x = 0; x < part.width; x++) {
      const sourceX = Math.max(firstX, Math.min(lastX, Math.floor((part.xmin + x) / channel.xSampling + 0.5) * channel.xSampling)) - part.xmin;
      const sourceY = Math.max(firstY, Math.min(lastY, Math.floor((part.ymin + y) / channel.ySampling + 0.5) * channel.ySampling)) - part.ymin;
      const dst = ((part.height - 1 - y) * part.width + x) * targetStride + targetSlot;
      const src = ((part.height - 1 - sourceY) * part.width + sourceX) * targetStride + targetSlot;
      target[dst] = target[src];
    }
  }
  const luminance = !chroma && has("Y") && !has("R") && !has("G") && !has("B");
  if (luminance && components>1) for (let i=0;i<data.length;i+=components) {
    data[i+1]=data[i]; if (components===4) data[i+2]=data[i];
  }
  if (chroma) for (let i=0;i<data.length;i+=components) {
    const pixel = i / components;
    const y=outputType === "half" ? fromHalfFloat(data[i]) : data[i];
    const ryBits=components === 1 ? chromaPlane![pixel] : data[i+1];
    const ry=outputType === "half" ? fromHalfFloat(ryBits) : ryBits;
    const r=(1+ry)*y;
    data[i]=outputType === "half" ? toHalfFloat(r) : r;
    if (components >= 2) {
      const byBits=components === 2 ? chromaPlane![pixel] : data[i+2];
      const by=outputType === "half" ? fromHalfFloat(byBits) : byBits;
      const b=(1+by)*y, g=(y-r*luminanceWeights![0]-b*luminanceWeights![2])/luminanceWeights![1];
      data[i+1]=outputType === "half" ? toHalfFloat(g) : g;
      if (components === 4) data[i+2]=outputType === "half" ? toHalfFloat(b) : b;
    }
  }
  return {width:part.width,height:part.height,data,channels:components,type:outputType,format:outputFormat,colorSpace:"linear",flipY:false,generateMipmaps:false,
    header,
    diagnostics:part.channels.flatMap(channel=>channelMap[channel.name] !== undefined ? [] : [{code:"EXR_CHANNEL_OMITTED",message:`Channel ${channel.name} is not represented in the output texture.`}])
  };
}


/** Independently authored bounded OpenEXR deep reader (NONE/RLE/ZIPS/ZIP).
 * Output rows run in increasing source Y, left-to-right. Sample order and source
 * channel types are preserved; no color conversion, sorting or compositing occurs.
 */
export interface AuraEXRDeepChannel {
  readonly pixelType: "uint" | "half" | "float";
  /** HALF retains IEEE binary16 bits; UINT and FLOAT use their numeric values. */
  readonly values: Uint16Array | Uint32Array | Float32Array;
}
export interface AuraEXRDeepData {
  readonly width: number;
  readonly height: number;
  readonly dataWindow: { readonly xMin: number; readonly yMin: number; readonly xMax: number; readonly yMax: number };
  /** One entry per pixel plus a final sentinel. Sample range is [offsets[i], offsets[i+1]). */
  readonly offsets: Uint32Array;
  readonly channels: Readonly<Record<string, AuraEXRDeepChannel>>;
  readonly compression: "none" | "rle" | "zips" | "zip";
}
export interface AuraEXRDeepOptions {
  /** Zero-based part index. The selected part must contain deep samples. */
  readonly part?: number;
  /** Tile level. Mipmap coordinates must match; defaults to {x: 0, y: 0}. */
  readonly level?: { readonly x: number; readonly y: number };
  readonly maxInputBytes?: number;
  readonly maxPixels?: number;
  readonly maxSamples?: number;
  readonly maxSamplesPerPixel?: number;
  readonly maxSampleBytes?: number;
}
interface EXRDeepSourceChannel { name: string; type: 0 | 1 | 2; bytes: 2 | 4 }
interface EXRDeepChunk { start: number; end: number; x: number; y: number; width: number; height: number; countWidth: number; countHeight: number; countStart: number; countSize: number; sampleStart: number; sampleSize: number; unpackedSize: number }
interface EXRDeepPart {
  kind: "scanlineimage" | "tiledimage" | "deepscanline" | "deeptile";
  xMin: number; yMin: number; width: number; height: number; compression: number;
  tileWidth: number; tileHeight: number; mode: 0 | 1 | 2; roundUp: boolean; levelsX: number; levelsY: number;
  chunkCount: number; channels: EXRDeepSourceChannel[]; sampleStride: number; chunks: EXRDeepChunk[];
}
const failDeep = (reason: string): never => { throw new AssetLoadError(`EXR deep: ${reason}`, "exr"); };
const MAX_DEEP_INPUT = 256 * 1024 * 1024;
const MAX_DEEP_PIXELS = 16_777_216;
const MAX_DEEP_SAMPLES = 8_388_608;
const MAX_DEEP_SAMPLE_BYTES = 256 * 1024 * 1024;

function deepConfigured(value: number | undefined, ceiling: number, name: string): number {
  if (value === undefined) return ceiling;
  if (!Number.isSafeInteger(value) || value <= 0 || value > ceiling) failDeep(`${name} must be a positive integer at most ${ceiling}`);
  return value;
}
function undoDeepPredictorAndShuffle(input: Uint8Array): Uint8Array {
  for (let i = 1; i < input.length; i++) input[i] = (input[i - 1] + input[i] - 128) & 255;
  const out = new Uint8Array(input.length);
  let even = 0, odd = Math.ceil(input.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = input[(i & 1) === 0 ? even++ : odd++];
  return out;
}
function decodeDeepRle(input: Uint8Array, expected: number, alternate?: number): Uint8Array {
  const result = new Uint8Array(expected); let source = 0, target = 0;
  while (source < input.length) {
    const code = (input[source++] << 24) >> 24;
    const count = code < 0 ? -code : code + 1;
    if (target + count > expected) failDeep("RLE exceeds declared output");
    if (code < 0) {
      if (source + count > input.length) failDeep("truncated RLE literal");
      result.set(input.subarray(source, source + count), target); source += count;
    } else {
      if (source === input.length) failDeep("truncated RLE run");
      result.fill(input[source++], target, target + count);
    }
    target += count;
  }
  if (target !== expected && target !== alternate) failDeep("RLE output size mismatch");
  return undoDeepPredictorAndShuffle(result.subarray(0, target));
}
async function decodeDeepZip(input: Uint8Array, expected: number, alternate?: number): Promise<Uint8Array> {
  let output: Uint8Array;
  if (typeof DecompressionStream === "function") {
    const reader = new Blob([input as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
    const fragments: Uint8Array[] = []; let length = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > expected) { await reader.cancel(); failDeep("ZIP exceeds declared output"); }
        fragments.push(value);
      }
    } finally { reader.releaseLock(); }
    output = new Uint8Array(length); let at = 0;
    for (const part of fragments) { output.set(part, at); at += part.length; }
  } else {
    const specifier = "node:zlib";
    const zlib = await import(specifier) as {inflateSync(bytes: Uint8Array, options: {maxOutputLength: number}): Uint8Array};
    const decoded = zlib.inflateSync(input, {maxOutputLength: expected});
    output = new Uint8Array(decoded);
  }
  if (output.length !== expected && output.length !== alternate) failDeep("ZIP output size mismatch");
  return undoDeepPredictorAndShuffle(output);
}
async function unpackDeep(input: Uint8Array, expected: number, compression: number): Promise<Uint8Array> {
  if (input.length > expected) failDeep("chunk payload larger than unpacked size");
  if (input.length === expected) return input;
  if (expected === 0 || input.length === 0 || compression === 0) failDeep("truncated chunk payload");
  return compression === 1 ? decodeDeepRle(input, expected) : decodeDeepZip(input, expected);
}
/** Edge-tile count tables may be compact or padded to the full tile size. */
async function unpackDeepCounts(input: Uint8Array, compact: number, padded: number, compression: number): Promise<Uint8Array> {
  if (input.length === compact || input.length === padded) return input;
  if (!input.length || input.length > padded || compression === 0) failDeep("invalid deep count table size");
  return compression === 1 ? decodeDeepRle(input, padded, compact) : decodeDeepZip(input, padded, compact);
}

/** Decode a bounded deep scanline or tiled part, preserving every sample. */
export async function parseDeepEXR(buffer: ArrayBuffer, options: AuraEXRDeepOptions = {}): Promise<AuraEXRDeepData> {
  const inputLimit = deepConfigured(options.maxInputBytes, MAX_DEEP_INPUT, "maxInputBytes");
  const pixelLimit = deepConfigured(options.maxPixels, MAX_DEEP_PIXELS, "maxPixels");
  const sampleLimit = deepConfigured(options.maxSamples, MAX_DEEP_SAMPLES, "maxSamples");
  const samplePixelLimit = deepConfigured(options.maxSamplesPerPixel, 65_536, "maxSamplesPerPixel");
  const sampleByteLimit = deepConfigured(options.maxSampleBytes, MAX_DEEP_SAMPLE_BYTES, "maxSampleBytes");
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 8 || buffer.byteLength > inputLimit) failDeep("invalid or over-limit input");
  const view = new DataView(buffer); const bytes = new Uint8Array(buffer);
  if (view.getUint32(0, true) !== 20000630) failDeep("invalid magic");
  const version = view.getUint32(4, true);
  if ((version & 0xff) !== 2 || (version & ~0x1e02) !== 0 || !(version & 0x800) || (version & 0x200)) failDeep("invalid deep image version or flags");
  const multipart = Boolean(version & 0x1000), selectedPart = options.part ?? 0;
  const selectedLevel = options.level === undefined ? {x: 0, y: 0} : options.level;
  if (!Number.isSafeInteger(selectedPart) || selectedPart < 0) failDeep("part must be a non-negative integer");
  if (!selectedLevel || typeof selectedLevel !== "object" || !Number.isSafeInteger(selectedLevel.x) || selectedLevel.x < 0 || !Number.isSafeInteger(selectedLevel.y) || selectedLevel.y < 0) failDeep("level coordinates must be non-negative integers");
  let cursor = 8;
  const requireBytes = (n: number, end = bytes.length) => {
    if (!Number.isSafeInteger(n) || n < 0 || cursor + n > end) failDeep("truncated header or table");
  };
  const str = (end = bytes.length) => {
    const start = cursor;
    while (cursor < end && bytes[cursor] !== 0 && cursor - start <= 255) cursor++;
    if (cursor >= end || cursor - start > 255) failDeep("unterminated or overlong string");
    const text = new TextDecoder().decode(bytes.subarray(start, cursor)); cursor++; return text;
  };
  const parts: EXRDeepPart[] = [];
  for (;;) {
    const attrs = new Map<string, {type: string; start: number; size: number}>();
    for (;;) {
      const name = str(); if (!name) break;
      if (attrs.has(name) || attrs.size >= 128) failDeep("duplicate or excessive attributes");
      const type = str(); requireBytes(4); const size = view.getUint32(cursor, true); cursor += 4;
      if (size > 4 * 1024 * 1024) failDeep("attribute too large"); requireBytes(size);
      attrs.set(name, {type, start: cursor, size}); cursor += size;
    }
    if (!attrs.size) { if (multipart && parts.length) break; failDeep("missing part header"); }
    if (parts.length >= 64) failDeep("too many parts");
    const attr = (name: string, type: string, size?: number) => {
      const a = attrs.get(name);
      if (!a || a.type !== type || (size !== undefined && a.size !== size)) failDeep(`invalid or missing ${name}`);
      return a!;
    };
    const marker = attr("type", "string");
    const kindText = new TextDecoder().decode(bytes.subarray(marker.start, marker.start + marker.size));
    if (!["scanlineimage", "tiledimage", "deepscanline", "deeptile"].includes(kindText)) failDeep("unsupported part storage type");
    const kind = kindText as EXRDeepPart["kind"], isDeep = kind === "deepscanline" || kind === "deeptile", tiled = kind === "tiledimage" || kind === "deeptile";
    if (isDeep) {
      const deepVersion = attr("version", "int", 4);
      if (view.getInt32(deepVersion.start, true) !== 1) failDeep("unsupported deep version");
    }
    const compression = view.getUint8(attr("compression", "compression", 1).start);
    const blockHeights = [1, 1, 1, 16, 32, 16, 32, 32, 32, 256, 256, 32];
    if (isDeep && compression > 3) failDeep(`unsupported deep compression ${EXR_COMPRESSION_NAMES[compression] ?? compression}`);
    if (compression >= blockHeights.length) failDeep("unknown compression method");
    const window = attr("dataWindow", "box2i", 16);
    const xMin = view.getInt32(window.start, true), yMin = view.getInt32(window.start + 4, true);
    const width = view.getInt32(window.start + 8, true) - xMin + 1, height = view.getInt32(window.start + 12, true) - yMin + 1;
    if (width <= 0 || height <= 0 || width > 16384 || height > 16384 || width * height > pixelLimit) failDeep("invalid or over-limit data window");
    const channelAttr = attr("channels", "chlist"), channelEnd = channelAttr.start + channelAttr.size, headerEnd = cursor;
    cursor = channelAttr.start;
    const channelList: EXRDeepSourceChannel[] = []; const names = new Set<string>(); let sampleStride = 0;
    for (;;) {
      const name = str(channelEnd); if (!name) break;
      if (names.has(name) || channelList.length >= 64) failDeep("duplicate or excessive channels");
      names.add(name); requireBytes(16, channelEnd);
      const type = view.getInt32(cursor, true), xs = view.getInt32(cursor + 8, true), ys = view.getInt32(cursor + 12, true); cursor += 16;
      if ((type !== 0 && type !== 1 && type !== 2) || xs <= 0 || ys <= 0 || ((isDeep || tiled) && (xs !== 1 || ys !== 1))) failDeep("unsupported channel type or sampling");
      const size = type === 1 ? 2 : 4; sampleStride += size;
      channelList.push({name, type: type as 0 | 1 | 2, bytes: size});
    }
    if (cursor !== channelEnd || !channelList.length) failDeep("malformed channels"); cursor = headerEnd;
    let tileWidth = width, tileHeight = blockHeights[compression], mode: 0 | 1 | 2 = 0, roundUp = false, levelsX = 1, levelsY = 1;
    if (tiled) {
      const desc = attr("tiles", "tiledesc", 9);
      tileWidth = view.getUint32(desc.start, true); tileHeight = view.getUint32(desc.start + 4, true);
      if (!tileWidth || !tileHeight || tileWidth > 16384 || tileHeight > 16384) failDeep("invalid tile size");
      if (isDeep && tileWidth * tileHeight > pixelLimit) failDeep("deep tile count table exceeds the pixel limit");
      const value = view.getUint8(desc.start + 8);
      if ((value & 15) > 2 || (value >> 4) > 1) failDeep("invalid tile level or rounding mode");
      mode = (value & 15) as 0 | 1 | 2; roundUp = (value >> 4) === 1;
      if (mode === 1) levelsX = levelsY = exrLevelCount(Math.max(width, height), roundUp);
      else if (mode === 2) { levelsX = exrLevelCount(width, roundUp); levelsY = exrLevelCount(height, roundUp); }
    }
    let expectedChunks = 0;
    if (tiled) {
      for (let ly = 0; ly < levelsY; ly++) for (let lx = 0; lx < levelsX; lx++) {
        if (mode === 1 && lx !== ly) continue;
        expectedChunks += Math.ceil(exrLevelSize(width, lx, roundUp) / tileWidth) * Math.ceil(exrLevelSize(height, ly, roundUp) / tileHeight);
        if (expectedChunks > 65_536) failDeep("chunk count exceeds the limit");
      }
    } else expectedChunks = Math.ceil(height / tileHeight);
    const chunkCount = view.getInt32(attr("chunkCount", "int", 4).start, true);
    if (chunkCount !== expectedChunks || chunkCount > 65_536) failDeep("invalid chunk count");
    parts.push({kind, xMin, yMin, width, height, compression, tileWidth, tileHeight, mode, roundUp, levelsX, levelsY, chunkCount, channels: channelList, sampleStride, chunks: []});
    if (!multipart) break;
  }
  if (selectedPart >= parts.length) failDeep("part index is out of range");
  const selected = parts[selectedPart];
  if (selected.kind !== "deepscanline" && selected.kind !== "deeptile") failDeep("selected part is not deep data");
  if (selectedLevel.x >= selected.levelsX || selectedLevel.y >= selected.levelsY || (selected.mode === 1 && selectedLevel.x !== selectedLevel.y)) failDeep("requested image level is unavailable for this part");
  const totalChunks = parts.reduce((sum, part) => sum + part.chunkCount, 0);
  if (totalChunks > 65_536) failDeep("total chunk count exceeds the limit");
  requireBytes(totalChunks * 8); const tableEnd = cursor + totalChunks * 8;
  const intervals: Array<{start: number; end: number}> = [];
  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex], deep = part.kind === "deepscanline" || part.kind === "deeptile", tiled = part.kind === "tiledimage" || part.kind === "deeptile", seen = new Set<string>();
    for (let index = 0; index < part.chunkCount; index++) {
      const offset = view.getBigUint64(cursor, true); cursor += 8;
      if (offset > BigInt(Number.MAX_SAFE_INTEGER)) failDeep("unsafe chunk offset");
      const start = Number(offset), prefix = (multipart ? 4 : 0) + (tiled ? 16 : 4) + (deep ? 24 : 4);
      if (start < tableEnd || start + prefix > bytes.length) failDeep("invalid chunk offset");
      let pos = start;
      if (multipart) { if (view.getInt32(pos, true) !== partIndex) failDeep("chunk belongs to a different part"); pos += 4; }
      let x = 0, y = 0, width = part.width, height: number, lx = 0, ly = 0, key: string;
      if (tiled) {
        const tx = view.getInt32(pos, true), ty = view.getInt32(pos + 4, true);
        lx = view.getInt32(pos + 8, true); ly = view.getInt32(pos + 12, true); pos += 16;
        if (lx < 0 || ly < 0 || lx >= part.levelsX || ly >= part.levelsY || (part.mode === 1 && lx !== ly)) failDeep("invalid tile level");
        const levelWidth = exrLevelSize(part.width, lx, part.roundUp), levelHeight = exrLevelSize(part.height, ly, part.roundUp);
        if (tx < 0 || ty < 0 || tx * part.tileWidth >= levelWidth || ty * part.tileHeight >= levelHeight) failDeep("invalid tile coordinates");
        x = tx * part.tileWidth; y = ty * part.tileHeight;
        width = Math.min(part.tileWidth, levelWidth - x); height = Math.min(part.tileHeight, levelHeight - y); key = `${lx},${ly},${tx},${ty}`;
      } else {
        y = view.getInt32(pos, true) - part.yMin; pos += 4;
        if (y < 0 || y >= part.height || y % part.tileHeight !== 0) failDeep("invalid chunk row");
        height = Math.min(part.tileHeight, part.height - y); key = String(y);
      }
      if (seen.has(key)) failDeep("duplicate image chunk"); seen.add(key);
      if (deep) {
        const countLen = view.getBigUint64(pos, true), sampleLen = view.getBigUint64(pos + 8, true), unpacked = view.getBigUint64(pos + 16, true); pos += 24;
        const countWidth = tiled ? part.tileWidth : width, countHeight = tiled ? part.tileHeight : height, countBytes = countWidth * countHeight * 4;
        if (countLen > BigInt(countBytes) || sampleLen > unpacked || unpacked > BigInt(sampleByteLimit)) failDeep("over-limit deep chunk");
        const countSize = Number(countLen), sampleSize = Number(sampleLen), unpackedSize = Number(unpacked);
        const countStart = pos, sampleStart = countStart + countSize, end = sampleStart + sampleSize;
        if (!countSize || end > bytes.length) failDeep("truncated deep chunk");
        if (part.compression === 0 && ((countSize !== countBytes && countSize !== width * height * 4) || sampleSize !== unpackedSize)) failDeep("truncated uncompressed deep chunk");
        if (partIndex === selectedPart && lx === selectedLevel.x && ly === selectedLevel.y) part.chunks.push({start, end, x, y, width, height, countWidth, countHeight, countStart, countSize, sampleStart, sampleSize, unpackedSize});
        intervals.push({start, end});
      } else {
        const size = view.getUint32(pos, true); pos += 4;
        if (pos + size > bytes.length) failDeep("truncated regular image chunk");
        intervals.push({start, end: pos + size});
      }
    }
  }
  intervals.sort((a,b) => a.start - b.start);
  for (let i = 1; i < intervals.length; i++) if (intervals[i].start < intervals[i - 1].end) failDeep("overlapping image chunks");
  const xMin = selected.xMin, yMin = selected.yMin, width = exrLevelSize(selected.width, selectedLevel.x, selected.roundUp), height = exrLevelSize(selected.height, selectedLevel.y, selected.roundUp);
  const xMax = xMin + width - 1, yMax = yMin + height - 1, compression = selected.compression, sampleStride = selected.sampleStride, channelList = selected.channels;
  const offsets = new Uint32Array(width * height + 1); let total = 0;
  for (const chunk of selected.chunks) {
    const compact = chunk.width * chunk.height * 4, padded = chunk.countWidth * chunk.countHeight * 4;
    const counts = await unpackDeepCounts(bytes.subarray(chunk.countStart, chunk.countStart + chunk.countSize), compact, padded, compression);
    const countWidth = counts.length === compact ? chunk.width : chunk.countWidth;
    const countView = new DataView(counts.buffer, counts.byteOffset, counts.byteLength); let chunkSamples = 0;
    for (let y = 0; y < chunk.height; y++) {
      let previous = 0;
      for (let x = 0; x < chunk.width; x++) {
        const cumulative = countView.getUint32((y * countWidth + x) * 4, true);
        if (cumulative < previous || cumulative - previous > samplePixelLimit) failDeep("invalid or over-limit sample count");
        const samples = cumulative - previous; previous = cumulative; total += samples; chunkSamples += samples;
        if (total > sampleLimit || total * sampleStride > sampleByteLimit) failDeep("over-limit sample allocation");
        offsets[(chunk.y + y) * width + chunk.x + x + 1] = samples;
      }
    }
    if (chunkSamples * sampleStride !== chunk.unpackedSize) failDeep("deep sample byte count mismatch");
  }
  for (let i = 1; i < offsets.length; i++) offsets[i] += offsets[i - 1];
  const channels: Record<string, AuraEXRDeepChannel> = Object.create(null) as Record<string, AuraEXRDeepChannel>;
  for (const c of channelList) channels[c.name] = {
    pixelType: c.type === 0 ? "uint" : c.type === 1 ? "half" : "float",
    values: c.type === 0 ? new Uint32Array(total) : c.type === 1 ? new Uint16Array(total) : new Float32Array(total)
  };
  for (const chunk of selected.chunks) {
    const raw = await unpackDeep(bytes.subarray(chunk.sampleStart, chunk.sampleStart + chunk.sampleSize), chunk.unpackedSize, compression);
    const data = new DataView(raw.buffer, raw.byteOffset, raw.byteLength); let at = 0;
    const readRow = (c: EXRDeepSourceChannel, row: number) => {
      const output = channels[c.name].values;
      for (let x = 0; x < chunk.width; x++) {
        const pixel = (chunk.y + row) * width + chunk.x + x;
        for (let s = offsets[pixel]; s < offsets[pixel + 1]; s++) {
          output[s] = c.type === 0 ? data.getUint32(at, true) : c.type === 1 ? data.getUint16(at, true) : data.getFloat32(at, true);
          at += c.bytes;
        }
      }
    };
    for (let y = 0; y < chunk.height; y++) for (const c of channelList) readRow(c, y);
    if (at !== raw.length) failDeep("unexpected deep sample data");
  }
  return {width, height, dataWindow: {xMin,yMin,xMax,yMax}, offsets, channels, compression: (["none", "rle", "zips", "zip"] as const)[compression]};
}

/**
 * Opt-in compositing for point samples. RGB is assumed premultiplied by A;
 * samples are sorted by finite Z front to back and combined with the over
 * operator. Samples with ZBack != Z represent volumes and are rejected.
 * The result is RGBA32F, bottom row first, matching AuraEXRTextureData.
 */
export function compositeDeepEXR(source: AuraEXRDeepData): Float32Array {
  const pixels = source.width * source.height;
  if (!Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height) || source.width <= 0 || source.height <= 0 || pixels > MAX_DEEP_PIXELS || !(source.offsets instanceof Uint32Array) || source.offsets.length !== pixels + 1 || source.offsets[0] !== 0) failDeep("invalid deep image shape");
  const total = source.offsets[pixels];
  if (total > MAX_DEEP_SAMPLES || !source.channels || Object.keys(source.channels).length > 64) failDeep("invalid deep channel allocation");
  for (const channel of Object.values(source.channels)) {
    const validType = channel.pixelType === "half" ? channel.values instanceof Uint16Array : channel.pixelType === "uint" ? channel.values instanceof Uint32Array : channel.pixelType === "float" && channel.values instanceof Float32Array;
    if (!validType || channel.values.length !== total) failDeep("invalid deep channel data");
  }
  for (let i = 0; i < pixels; i++) {
    if (source.offsets[i + 1] < source.offsets[i] || source.offsets[i + 1] - source.offsets[i] > 65_536) failDeep("invalid deep pixel offsets");
  }
  const output = new Float32Array(pixels * 4);
  const sample = (name: string, index: number, fallback: number): number => {
    const channel = source.channels[name];
    if (!channel) return fallback;
    const value = channel.values[index];
    if (channel.pixelType !== "half") return value;
    const exponent = (value >>> 10) & 31, mantissa = value & 1023;
    const sign = value & 0x8000 ? -1 : 1;
    if (exponent === 31) return mantissa ? NaN : sign * Infinity;
    if (exponent === 0) return sign * mantissa * 2 ** -24;
    return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
  };
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const pixel = y * source.width + x;
    const start = source.offsets[pixel], end = source.offsets[pixel + 1];
    if (end > start + 1 && !source.channels.Z) failDeep("multiple samples require a Z channel to composite");
    const order: number[] = [];
    for (let i = start; i < end; i++) {
      const z = sample("Z", i, 0), zBack = sample("ZBack", i, z);
      if (!Number.isFinite(z) || !Number.isFinite(zBack) || zBack !== z) failDeep("invalid depth or unsupported volume sample");
      order.push(i);
    }
    order.sort((a, b) => sample("Z", a, 0) - sample("Z", b, 0) || a - b);
    let red = 0, green = 0, blue = 0, alpha = 0;
    for (const i of order) {
      const a = sample("A", i, 1), luminance = sample("Y", i, 0);
      const r = sample("R", i, luminance), g = sample("G", i, luminance), b = sample("B", i, luminance);
      if (![a, r, g, b].every(Number.isFinite) || a < 0 || a > 1) failDeep("invalid color or alpha for compositing");
      const remaining = 1 - alpha;
      red += remaining * r; green += remaining * g; blue += remaining * b; alpha += remaining * a;
    }
    const base = ((source.height - 1 - y) * source.width + x) * 4;
    output[base] = red; output[base + 1] = green; output[base + 2] = blue; output[base + 3] = alpha;
  }
  return output;
}


/**
 * `new THREE.EXRLoader()` — real async decode. Works standalone
 * (`load(url, onLoad?, onProgress?, onError?)` → `Promise<AuraEXRTextureData>`)
 * and as an `AssetManager` loader (`type: "exr"`).
 *
 * `type`/`outputFormat`/`part` mirror three's `setDataType`/`setOutputFormat`/
 * `setPart` builder methods.
 */
export class EXRLoader implements AssetLoader<AuraEXRTextureData> {
  readonly type = "exr";
  outputType: AuraEXRDataType = "half";
  outputFormat: AuraEXROutputFormat = "rgba";
  part = 0;
  layer = "";
  level: { readonly x: number; readonly y: number } = { x: 0, y: 0 };

  setDataType( value: AuraEXRDataType ): this {
    this.outputType = value;
    return this;
  }

  setOutputFormat( value: AuraEXROutputFormat ): this {
    this.outputFormat = value;
    return this;
  }

  setPart( value: number ): this {
    this.part = value;
    return this;
  }

  /** Select a named channel layer; the empty name selects unlayered channels. */
  setLayer( value: string ): this {
    this.layer = value;
    return this;
  }

  /** Select a tile level; y defaults to x for mipmap images. */
  setLevel( x: number, y = x ): this {
    this.level = { x, y };
    return this;
  }

  canLoad( request: AssetLoadRequest ): boolean {
    return request.type === this.type || (request.type === undefined && /\.exr(?:[?#].*)?$/i.test( request.url ));
  }

  /** AssetManager entry — fetches bytes, then `parseEXR`. */
  async load( request: AssetLoadRequest, context: LoadContext ): Promise<AuraEXRTextureData>;
  /** three signature — `load(url, onLoad?, onProgress?, onError?)`. */
  load( url: string, onLoad?: ( data: AuraEXRTextureData ) => void, onProgress?: ( event: { readonly loaded?: number; readonly total?: number } ) => void, onError?: ( error: unknown ) => void ): Promise<AuraEXRTextureData>;
  load(
    requestOrUrl: AssetLoadRequest | string,
    contextOrOnLoad?: LoadContext | ( ( data: AuraEXRTextureData ) => void ),
    onProgress?: ( event: { readonly loaded?: number; readonly total?: number } ) => void,
    onError?: ( error: unknown ) => void
  ): Promise<AuraEXRTextureData> {
    if ( typeof requestOrUrl === "string" ) {
      const url = requestOrUrl;
      const onLoad = typeof contextOrOnLoad === "function" ? contextOrOnLoad : undefined;
      const pending = this.loadBytes( url, undefined, onProgress )
        .then( ( data ) => { onLoad?.( data ); return data; });
      if ( onError ) pending.catch( onError );
      return pending;
    }

    const request = requestOrUrl;
    const context = contextOrOnLoad as LoadContext;
    const url = context.resolve(request.url);
    context.throwIfAborted(url);
    const options = mergeAssetRequestOptions(context.requestOptionsFor(url), request);
    let loadedBytes = 0;
    let totalBytes: number | undefined;
    return this.loadBytes(url, context.signalFor(request.signal), (progress) => {
      loadedBytes = progress.loaded;
      totalBytes = progress.total;
      request.onProgress?.({ url, phase: "document", loadedBytes, ...(totalBytes !== undefined ? { totalBytes } : {}) });
    }, options).then((result) => {
      context.throwIfAborted(url);
      request.onProgress?.({ url, phase: "complete", loadedBytes, ...(totalBytes !== undefined ? { totalBytes } : {}) });
      return result;
    });
  }

  /** `parse(buffer)` — three's synchronous-looking parse; async here for zlib. */
  parse( buffer: ArrayBuffer ): Promise<AuraEXRTextureData> {
    return parseEXR( buffer, { type: this.outputType, outputFormat: this.outputFormat, part: this.part, layer: this.layer, level: this.level } );
  }

  private async loadBytes( url: string, signal?: AbortSignal, onProgress?: (event: AuraLoaderProgress) => void, options: AssetRequestOptions = {} ): Promise<AuraEXRTextureData> {
    try {
      const buffer = await fetchBytes(url, signal, onProgress, {
        ...options, maxBytes: Math.min(options.maxBytes ?? 256 * 1024 * 1024, 256 * 1024 * 1024)
      });
      if (signal?.aborted) throw signal.reason ?? new DOMException("Asset load aborted", "AbortError");
      const result = await parseEXR( buffer, { type: this.outputType, outputFormat: this.outputFormat, part: this.part, layer: this.layer, level: this.level } );
      if (signal?.aborted) throw signal.reason ?? new DOMException("Asset load aborted", "AbortError");
      return result;
    } catch ( error ) {
      throw new AssetLoadError(
        error instanceof Error ? error.message : String( error ),
        url,
        [],
        error
      );
    }
  }
}

/** Alias matching three's export name where an explicit class is wanted. */
export { EXRLoader as EXRLoaderThreeCompat };
