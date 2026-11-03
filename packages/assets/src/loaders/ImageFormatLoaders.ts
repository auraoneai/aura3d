import { mergeAssetRequestOptions, type AssetLoader, type AssetLoadRequest } from "../AssetLoader";
import type { LoadContext } from "../LoadContext";
import { fetchBytes, type AssetTransportTracker } from "../LoaderFetch";

export { createAssetTransportTracker } from "../LoaderFetch";
export type { AssetTransportTracker } from "../LoaderFetch";

/** Texture containers are identified explicitly; recognition is not a decoder guarantee. */
export type NativeImageFormat = "dds" | "pvr" | "ktx1" | "tga" | "tiff" | "jxl" | "ultrahdr";
export type NativeBlockFormat = "bc1" | "bc1-rgb" | "bc2" | "bc3" | "bc4" | "bc5" | "pvrtc1-2-rgb" | "pvrtc1-2-rgba" | "pvrtc1-4-rgb" | "pvrtc1-4-rgba" | "etc1" | "etc2-rgb" | "etc2-rgba";
export interface NativeImageLevel {
  readonly width: number;
  readonly height: number;
  /** Uncompressed levels contain interleaved RGBA pixels. Compressed levels retain encoded blocks. */
  readonly data: Uint8Array | Uint16Array | Float32Array;
  readonly encoding: "rgba8" | "rgba16" | "rgba32f" | NativeBlockFormat;
}
export interface NativeImageAsset {
  readonly format: NativeImageFormat;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: "srgb" | "linear";
  readonly levels: readonly NativeImageLevel[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly diagnostics: readonly string[];
}
export interface NativeImageCodecResult {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Float32Array;
  readonly colorSpace?: "srgb" | "linear";
  /** Required for UltraHDR: the decoder must apply the gain map and return linear HDR data. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
export interface NativeImageOptions {
  readonly maxFileBytes?: number;
  readonly maxPixels?: number;
  readonly maxDecodedBytes?: number;
  readonly maxMipLevels?: number;
  /** Caller-declared GPU upload formats, not renderer-negotiated capabilities. Declare sRGB data only when the sRGB variant is supported. BC1–5 have CPU RGBA8 fallbacks. */
  readonly gpuFormats?: readonly NativeBlockFormat[];
  /** Overrides legacy DDS row alignment when its header cannot identify the mip layout. */
  readonly ddsRowAlignment?: "tight" | "dword";
  /** Optional application-supplied codecs. UltraHDR output must be gain-map-applied linear data. */
  readonly codecs?: Partial<Record<"jxl" | "ultrahdr", (bytes: Uint8Array, limits: { readonly maxPixels: number; readonly maxDecodedBytes: number; readonly signal?: AbortSignal }) => Promise<NativeImageCodecResult> | NativeImageCodecResult>>;
  readonly signal?: AbortSignal;
  /** Optional execution-local lifetime barrier; never sent as a request option. */
  readonly transportTracker?: AssetTransportTracker;
}
export class NativeImageError extends Error {
  constructor(readonly code: "malformed" | "unsupported" | "limit" | "codec-unavailable", message: string) {
    super(message);
    this.name = "NativeImageError";
  }
}
interface Limits { file: number; pixels: number; decoded: number; mips: number }
function limit(value: number | undefined, fallback: number, label: string): number {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n <= 0) throw new NativeImageError("limit", `${label} must be a positive safe integer`);
  return n;
}
function limits(options: NativeImageOptions): Limits {
  return { file: limit(options.maxFileBytes, 128 * 1024 * 1024, "maxFileBytes"), pixels: limit(options.maxPixels, 32 * 1024 * 1024, "maxPixels"), decoded: limit(options.maxDecodedBytes, 256 * 1024 * 1024, "maxDecodedBytes"), mips: limit(options.maxMipLevels, 32, "maxMipLevels") };
}
function assertRange(bytes: Uint8Array, offset: number, count: number, label: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(count) || offset < 0 || count < 0 || offset > bytes.length || count > bytes.length - offset) throw new NativeImageError("malformed", `${label} is truncated or outside the input`);
}
function checkSize(width: number, height: number, lim: Limits): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) throw new NativeImageError("malformed", "Image dimensions must be positive integers");
  if (width * height > lim.pixels || width * height * 4 > lim.decoded) throw new NativeImageError("limit", "Image dimensions exceed pixel or decoded-byte limit");
}
function checkMips(width: number, height: number, mips: number, lim: Limits): void {
  if (!Number.isInteger(mips) || mips < 1 || mips > lim.mips || mips > Math.floor(Math.log2(Math.max(width, height))) + 1) throw new NativeImageError("limit", "Invalid or excessive mip count");
  let total = 0;
  for (let n = 0; n < mips; n++) total += Math.max(1, Math.floor(width / 2 ** n)) * Math.max(1, Math.floor(height / 2 ** n)) * 4;
  if (total > lim.decoded) throw new NativeImageError("limit", "Mip levels exceed decoded-byte limit");
}
function view(bytes: Uint8Array): DataView { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
function output(format: NativeImageFormat, width: number, height: number, levels: NativeImageLevel[], metadata: Record<string, unknown> = {}, colorSpace: "linear" | "srgb" = "srgb", diagnostics: string[] = []): NativeImageAsset {
  return { format, width, height, levels, metadata, colorSpace, diagnostics };
}
function aligned4(n: number): number { return Math.ceil(n / 4) * 4; }
function blockBytes(format: NativeBlockFormat): number { return format === "bc1" || format === "bc1-rgb" || format === "bc4" || format === "etc1" || format === "etc2-rgb" ? 8 : 16; }
function blockSize(format: NativeBlockFormat, width: number, height: number): number {
  if (format.startsWith("pvrtc1-2")) return Math.max(2, Math.ceil(width / 8)) * Math.max(2, Math.ceil(height / 4)) * 8;
  if (format.startsWith("pvrtc1-4")) return Math.max(2, Math.ceil(width / 4)) * Math.max(2, Math.ceil(height / 4)) * 8;
  return Math.ceil(width / 4) * Math.ceil(height / 4) * blockBytes(format);
}
function bcColor565(n: number): [number, number, number] {
  return [Math.round(((n >> 11) & 31) * 255 / 31), Math.round(((n >> 5) & 63) * 255 / 63), Math.round((n & 31) * 255 / 31)];
}
function bcAlpha(bytes: Uint8Array, p: number): Uint8Array {
  const a = bytes[p]!; const b = bytes[p + 1]!;
  const table = [a, b];
  if (a > b) for (let i = 1; i <= 6; i++) table.push(Math.floor(((7 - i) * a + i * b) / 7));
  else { for (let i = 1; i <= 4; i++) table.push(Math.floor(((5 - i) * a + i * b) / 5)); table.push(0, 255); }
  let bits = 0n;
  for (let i = 0; i < 6; i++) bits |= BigInt(bytes[p + 2 + i]!) << BigInt(8 * i);
  return Uint8Array.from({ length: 16 }, (_, i) => table[Number((bits >> BigInt(i * 3)) & 7n)]!);
}
function decompressBC(format: NativeBlockFormat, bytes: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4); const blocksWide = Math.ceil(width / 4); const blocksHigh = Math.ceil(height / 4);
  let pos = 0;
  for (let by = 0; by < blocksHigh; by++) for (let bx = 0; bx < blocksWide; bx++) {
    let alpha: Uint8Array = new Uint8Array(16).fill(255); let red: Uint8Array | undefined, green: Uint8Array | undefined;
    if (format === "bc2") { for (let i = 0; i < 16; i++) alpha[i] = ((bytes[pos + (i >> 1)]! >> ((i & 1) * 4)) & 15) * 17; pos += 8; }
    else if (format === "bc3") { alpha = bcAlpha(bytes, pos); pos += 8; }
    else if (format === "bc4" || format === "bc5") { red = bcAlpha(bytes, pos); pos += 8; if (format === "bc5") { green = bcAlpha(bytes, pos); pos += 8; } }
    let palette: number[][] = [], indices = 0;
    if (!red) {
      const c0 = bytes[pos]! | bytes[pos + 1]! << 8, c1 = bytes[pos + 2]! | bytes[pos + 3]! << 8;
      const c = bcColor565(c0), d = bcColor565(c1); palette = [[...c, 255], [...d, 255]];
      if (c0 > c1 || (format !== "bc1" && format !== "bc1-rgb")) {
        palette.push([0, 1, 2].map((i) => Math.floor((2 * c[i]! + d[i]!) / 3)).concat(255));
        palette.push([0, 1, 2].map((i) => Math.floor((c[i]! + 2 * d[i]!) / 3)).concat(255));
      } else { palette.push([0, 1, 2].map((i) => Math.floor((c[i]! + d[i]!) / 2)).concat(255), [0, 0, 0, format === "bc1-rgb" ? 255 : 0]); }
      indices = view(bytes).getUint32(pos + 4, true); pos += 8;
    }
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const px = bx * 4 + x, py = by * 4 + y, i = y * 4 + x;
      if (px >= width || py >= height) continue;
      const dest = (py * width + px) * 4;
      const c = red ? [red[i]!, green?.[i] ?? 0, 0, 255] : palette[(indices >>> (i * 2)) & 3]!;
      out[dest] = c[0]!; out[dest + 1] = c[1]!; out[dest + 2] = c[2]!; out[dest + 3] = Math.round(c[3]! * alpha[i]! / 255);
    }
  }
  return out;
}
function encodedLevel(format: NativeBlockFormat, bytes: Uint8Array, width: number, height: number, options: NativeImageOptions, diagnostics: string[]): NativeImageLevel {
  if (options.gpuFormats?.includes(format)) {
    if (format === "bc1-rgb") diagnostics.push("bc1-rgb can use texture.fromNativeImage, with an opaque RGBA8 fallback where required");
    return { width, height, encoding: format, data: bytes.slice() };
  }
  if (["bc1", "bc1-rgb", "bc2", "bc3", "bc4", "bc5"].includes(format)) {
    diagnostics.push(`${format} decoded to RGBA8 because GPU support was not declared`);
    return { width, height, encoding: "rgba8", data: decompressBC(format, bytes, width, height) };
  }
  throw new NativeImageError("codec-unavailable", `${format} requires a GPU format or a transcoder`);
}
function maskComponent(pixel: number, mask: number, defaultValue: number): number {
  if (!mask) return defaultValue;
  let shift = 0; while (shift < 32 && ((mask >>> shift) & 1) === 0) shift++;
  const field = mask >>> shift;
  if ((field & (field + 1)) !== 0) throw new NativeImageError("unsupported", "Non-contiguous pixel mask");
  return Math.round(((pixel & mask) >>> shift) * 255 / field);
}
function parseDDS(bytes: Uint8Array, options: NativeImageOptions, lim: Limits): NativeImageAsset {
  assertRange(bytes, 0, 128, "DDS header"); const d = view(bytes);
  if (d.getUint32(0, true) !== 0x20534444 || d.getUint32(4, true) !== 124 || d.getUint32(76, true) !== 32) throw new NativeImageError("malformed", "Invalid DDS header");
  const width = d.getUint32(16, true), height = d.getUint32(12, true), count = d.getUint32(28, true) || 1;
  checkSize(width, height, lim); checkMips(width, height, count, lim);
  if (d.getUint32(112, true) & 0x0020fe00 || d.getUint32(24, true) > 1) throw new NativeImageError("unsupported", "DDS cubemaps and volume textures are not supported");
  let flags = d.getUint32(80, true), bits = d.getUint32(88, true); const fourcc = d.getUint32(84, true);
  let masks = [d.getUint32(92, true), d.getUint32(96, true), d.getUint32(100, true), d.getUint32(104, true)];
  let offset = 128, compression: NativeBlockFormat | undefined, colorSpace: "linear" | "srgb" = "linear";
  let channelModel: "rgb" | "luminance" | "alpha" | "r" | "rg" = "rgb";
  let alphaMode: "unknown" | "straight" | "premultiplied" | "opaque" | "custom" = "unknown";
  if (flags & 4) {
    const code = String.fromCharCode(fourcc & 255, (fourcc >>> 8) & 255, (fourcc >>> 16) & 255, fourcc >>> 24);
    const map: Record<string, NativeBlockFormat> = { DXT1: "bc1", DXT2: "bc2", DXT3: "bc2", DXT4: "bc3", DXT5: "bc3", ATI1: "bc4", BC4U: "bc4", ATI2: "bc5", BC5U: "bc5" };
    compression = map[code];
    if (code === "DXT2" || code === "DXT4") alphaMode = "premultiplied";
    if (code === "DX10") {
      assertRange(bytes, offset, 20, "DDS DX10 header"); const dxgi = d.getUint32(offset, true), dimension = d.getUint32(offset + 4, true), misc = d.getUint32(offset + 8, true), arraySize = d.getUint32(offset + 12, true);
      if (dimension !== 3 || misc & 4 || arraySize !== 1) throw new NativeImageError("unsupported", "DDS DX10 arrays, volumes and cubes are unsupported");
      const alphaValue = d.getUint32(offset + 16, true) & 7;
      if (alphaValue > 4) throw new NativeImageError("unsupported", `DDS DX10 alpha mode ${alphaValue} is unsupported`);
      alphaMode = (["unknown", "straight", "premultiplied", "opaque", "custom"] as const)[alphaValue]!;
      const dxmap: Record<number, NativeBlockFormat> = { 71: "bc1", 72: "bc1", 74: "bc2", 75: "bc2", 77: "bc3", 78: "bc3", 80: "bc4", 83: "bc5" };
      compression = dxmap[dxgi]; colorSpace = [29, 72, 75, 78, 91, 93].includes(dxgi) ? "srgb" : "linear"; offset += 20;
      if (!compression && [28, 29, 87, 88, 91, 93].includes(dxgi)) {
        bits = 32; flags |= 0x40;
        masks = [87, 88, 91, 93].includes(dxgi) ? [0x00ff0000, 0x0000ff00, 0x000000ff, [88, 93].includes(dxgi) ? 0 : 0xff000000] : [0x000000ff, 0x0000ff00, 0x00ff0000, 0xff000000];
      } else if (!compression && [49, 61, 65, 85, 86, 115].includes(dxgi)) {
        flags |= 0x40;
        if (dxgi === 49) { bits = 16; masks = [0xff, 0xff00, 0, 0]; channelModel = "rg"; }
        else if (dxgi === 61) { bits = 8; masks = [0xff, 0, 0, 0]; channelModel = "r"; }
        else if (dxgi === 65) { bits = 8; masks = [0, 0, 0, 0xff]; channelModel = "alpha"; }
        else { bits = 16; masks = dxgi === 85 ? [0xf800, 0x07e0, 0x001f, 0] : dxgi === 86 ? [0x7c00, 0x03e0, 0x001f, 0x8000] : [0x0f00, 0x00f0, 0x000f, 0xf000]; }
      } else if (!compression) throw new NativeImageError("unsupported", `DDS DXGI format ${dxgi} is unsupported`);
    } else if (!compression) throw new NativeImageError("unsupported", `DDS FOURCC ${code} is unsupported`);
  } else if (flags & 0x20000) {
    channelModel = "luminance";
    masks[1] = masks[2] = 0;
    if (!(flags & 1)) masks[3] = 0;
  } else if (flags & 2) {
    channelModel = "alpha"; masks[0] = masks[1] = masks[2] = 0;
  } else if (!(flags & 1)) {
    masks[3] = 0;
  }
  if (!compression && (![8, 16, 24, 32].includes(bits) || (channelModel === "rgb" && (!(flags & 0x40) || !masks[0] || !masks[1] || !masks[2])) || (channelModel === "luminance" && !masks[0]) || (channelModel === "alpha" && !masks[3]))) throw new NativeImageError("unsupported", "Unsupported DDS uncompressed pixel format");
  if (!compression && masks.some((mask, i) => masks.some((other, j) => i !== j && (mask & other) !== 0))) throw new NativeImageError("malformed", "DDS channel masks overlap");
  if (!compression && bits < 32 && masks.some((mask) => (mask >>> bits) !== 0)) throw new NativeImageError("malformed", "DDS channel mask exceeds pixel width");
  const levels: NativeImageLevel[] = [], diagnostics: string[] = [];
  if (alphaMode === "premultiplied") diagnostics.push("DDS pixels are premultiplied; the consumer must preserve alpha semantics");
  if (alphaMode === "opaque") diagnostics.push("DDS alpha mode is opaque; compressed uploads must ignore any stored alpha");
  if (alphaMode === "custom") diagnostics.push("DDS uses a custom alpha mode; interpretation is application-defined");
  let allocated = 0;
  if (options.ddsRowAlignment !== undefined && options.ddsRowAlignment !== "tight" && options.ddsRowAlignment !== "dword") throw new NativeImageError("unsupported", "Unknown DDS row alignment");
  const tightPitch = width * (bits / 8), hasPitch = !compression && Boolean(d.getUint32(8, true) & 8);
  const declaredPitch = hasPitch ? d.getUint32(20, true) : tightPitch;
  if (!compression && declaredPitch < tightPitch) throw new NativeImageError("malformed", "DDS pitch is shorter than a row");
  if (!compression && count > 1 && declaredPitch !== tightPitch && declaredPitch !== aligned4(tightPitch) && !options.ddsRowAlignment) throw new NativeImageError("unsupported", "DDS custom pitch with mipmaps requires explicit row alignment");
  let rowAlignment = options.ddsRowAlignment ?? (declaredPitch !== tightPitch && declaredPitch === aligned4(tightPitch) ? "dword" : "tight");
  if (!compression && !options.ddsRowAlignment) {
    const lengthFor = (alignment: "tight" | "dword"): number => {
      let total = 0;
      for (let i = 0; i < count; i++) {
        const w = Math.max(1, Math.floor(width / 2 ** i)), h = Math.max(1, Math.floor(height / 2 ** i)), tight = w * bits / 8;
        total += (i === 0 && hasPitch ? declaredPitch : alignment === "dword" ? aligned4(tight) : tight) * h;
      }
      return total;
    };
    const tightLength = lengthFor("tight"), dwordLength = lengthFor("dword"), remaining = bytes.length - offset;
    if (tightLength !== dwordLength && remaining === dwordLength) {
      rowAlignment = "dword";
      if (!hasPitch || declaredPitch === tightPitch) diagnostics.push("DDS DWORD row alignment was inferred from file length; set ddsRowAlignment if trailing data makes this ambiguous");
    }
    else if (tightLength !== dwordLength && remaining === tightLength) rowAlignment = "tight";
    else if (tightLength !== dwordLength && remaining !== tightLength && remaining !== dwordLength && remaining >= Math.min(tightLength, dwordLength)) diagnostics.push(`DDS row alignment is ambiguous; assuming ${rowAlignment} rows`);
  }
  for (let i = 0; i < count; i++) {
    const w = Math.max(1, Math.floor(width / 2 ** i)), h = Math.max(1, Math.floor(height / 2 ** i)), tightRow = w * bits / 8, row = !compression && i === 0 && hasPitch ? declaredPitch : rowAlignment === "dword" ? aligned4(tightRow) : tightRow;
    const size = compression ? blockSize(compression, w, h) : row * h;
    assertRange(bytes, offset, size, `DDS mip ${i}`);
    allocated += compression && options.gpuFormats?.includes(compression) ? size : w * h * 4;
    if (allocated > lim.decoded) throw new NativeImageError("limit", "DDS levels exceed allocation limit");
    if (compression) levels.push(encodedLevel(compression, bytes.subarray(offset, offset + size), w, h, options, diagnostics));
    else {
      const data = new Uint8Array(w * h * 4); const bpp = bits / 8;
      for (let p = 0; p < w * h; p++) {
        const source = offset + Math.floor(p / w) * row + (p % w) * bpp;
        let value = 0; for (let b = 0; b < bpp; b++) value |= bytes[source + b]! << (8 * b);
        for (let c = 0; c < 4; c++) data[p * 4 + c] = maskComponent(value, masks[c]!, c === 3 ? 255 : 0);
        if (channelModel === "luminance") data[p * 4 + 1] = data[p * 4 + 2] = data[p * 4]!;
      }
      levels.push({ width: w, height: h, encoding: "rgba8", data });
    }
    const level = levels[levels.length - 1]!;
    if (alphaMode === "opaque" && level.encoding === "rgba8") {
      const pixels = level.data as Uint8Array;
      for (let p = 3; p < pixels.length; p += 4) pixels[p] = 255;
    }
    offset += size;
  }
  return output("dds", width, height, levels, { mipLevels: count, compression: compression ?? null, bitsPerPixel: compression ? null : bits, masks: compression ? null : masks, channelModel, alphaMode, rowAlignment: compression ? null : rowAlignment, pitch: compression ? null : hasPitch ? declaredPitch : rowAlignment === "dword" ? aligned4(tightPitch) : tightPitch }, colorSpace, diagnostics);
}
function parsePVR(bytes: Uint8Array, options: NativeImageOptions, lim: Limits): NativeImageAsset {
  assertRange(bytes, 0, 52, "PVR header"); const d = view(bytes);
  if (d.getUint32(0, true) !== 0x03525650) throw new NativeImageError("unsupported", "Only little-endian PVR v3 is supported");
  const lo = d.getUint32(8, true), hi = d.getUint32(12, true), colorSpaceValue = d.getUint32(16, true), channelType = d.getUint32(20, true);
  if (colorSpaceValue > 1) throw new NativeImageError("unsupported", `PVR color space ${colorSpaceValue} is unsupported`);
  const colorSpace = colorSpaceValue === 1 ? "srgb" : "linear";
  const height = d.getUint32(24, true), width = d.getUint32(28, true), depth = d.getUint32(32, true), surfaces = d.getUint32(36, true), faces = d.getUint32(40, true), count = d.getUint32(44, true), meta = d.getUint32(48, true);
  checkSize(width, height, lim); checkMips(width, height, count, lim);
  if (depth !== 1 || surfaces !== 1 || faces !== 1) throw new NativeImageError("unsupported", "PVR arrays, volumes and cubemaps are unsupported");
  let offset = 52 + meta; assertRange(bytes, 52, meta, "PVR metadata");
  const map: Record<number, NativeBlockFormat> = { 0: "pvrtc1-2-rgb", 1: "pvrtc1-2-rgba", 2: "pvrtc1-4-rgb", 3: "pvrtc1-4-rgba", 6: "etc1", 7: "bc1", 8: "bc2", 9: "bc2", 10: "bc3", 11: "bc3", 12: "bc4", 13: "bc5", 22: "etc2-rgb", 23: "etc2-rgba" };
  const compression = hi === 0 ? map[lo] : undefined;
  const channels = Array.from({ length: 4 }, (_, i) => String.fromCharCode((lo >>> (8 * i)) & 255));
  const channelBits = Array.from({ length: 4 }, (_, i) => (hi >>> (8 * i)) & 255);
  const nchan = channelBits.filter((n) => n !== 0).length;
  if (hi === 0 && !compression) throw new NativeImageError("unsupported", `PVR pixel format ${lo} is unsupported`);
  const sampleBytes = channelType === 0 ? 1 : channelType === 4 ? 2 : 0;
  if (compression && channelType !== 0) throw new NativeImageError("unsupported", `PVR compressed channel type ${channelType} is unsupported`);
  if (hi !== 0 && (!sampleBytes || nchan < 1 || channelBits.slice(0, nchan).some((n) => n !== sampleBytes * 8) || channelBits.slice(nchan).some(Boolean) || channels.slice(0, nchan).some((x) => !"rgba".includes(x)) || new Set(channels.slice(0, nchan)).size !== nchan)) throw new NativeImageError("unsupported", "Only unsigned-normalized 8/16-bit PVR channels are supported");
  const levels: NativeImageLevel[] = [], diagnostics: string[] = [];
  let allocated = meta;
  for (let i = 0; i < count; i++) {
    const w = Math.max(1, Math.floor(width / 2 ** i)), h = Math.max(1, Math.floor(height / 2 ** i)); const size = compression ? blockSize(compression, w, h) : w * h * nchan * sampleBytes;
    assertRange(bytes, offset, size, `PVR mip ${i}`);
    allocated += compression && options.gpuFormats?.includes(compression) ? size : w * h * 4 * (compression ? 1 : sampleBytes);
    if (allocated > lim.decoded) throw new NativeImageError("limit", "PVR levels and metadata exceed allocation limit");
    if (compression) levels.push(encodedLevel(compression, bytes.subarray(offset, offset + size), w, h, options, diagnostics));
    else {
      const data = sampleBytes === 1 ? new Uint8Array(w * h * 4) : new Uint16Array(w * h * 4);
      for (let p = 0; p < w * h; p++) { data[p * 4 + 3] = sampleBytes === 1 ? 255 : 65535; for (let c = 0; c < nchan; c++) { const source = offset + (p * nchan + c) * sampleBytes; data[p * 4 + "rgba".indexOf(channels[c]!)] = sampleBytes === 1 ? bytes[source]! : d.getUint16(source, true); } }
      levels.push({ width: w, height: h, encoding: sampleBytes === 1 ? "rgba8" : "rgba16", data });
    }
    offset += size;
  }
  if (meta) diagnostics.push("PVR metadata, including any orientation hints, is not applied");
  if ((d.getUint32(4, true) & 2) || (hi === 0 && (lo === 8 || lo === 10))) diagnostics.push("PVR pixels are premultiplied; the consumer must preserve alpha semantics");
  return output("pvr", width, height, levels, { version: 3, mipLevels: count, flags: d.getUint32(4, true), channelType, pixelFormat: [lo, hi], metadata: bytes.slice(52, 52 + meta) }, colorSpace, diagnostics);
}
function parseKTX1(bytes: Uint8Array, options: NativeImageOptions, lim: Limits): NativeImageAsset {
  assertRange(bytes, 0, 64, "KTX1 header");
  const identifier = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!identifier.every((x, i) => bytes[i] === x)) throw new NativeImageError("malformed", "Invalid KTX1 identifier");
  const d = view(bytes), marker = d.getUint32(12, true); if (marker !== 0x04030201 && marker !== 0x01020304) throw new NativeImageError("malformed", "Invalid KTX1 endianness");
  const le = marker === 0x04030201, u = (offset: number): number => d.getUint32(offset, le);
  const type = u(16), typeSize = u(20), format = u(24), internal = u(28), base = u(32), width = u(36), height = u(40), depth = u(44), arrays = u(48), faces = u(52), generateMipmaps = u(56) === 0, count = u(56) || 1, metadataBytes = u(60);
  checkSize(width, height, lim); checkMips(width, height, count, lim);
  if (depth !== 0 || arrays !== 0 || faces !== 1) throw new NativeImageError("unsupported", "KTX1 arrays, volumes and cubemaps are unsupported");
  assertRange(bytes, 64, metadataBytes, "KTX1 metadata");
  const keyValues: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
  let metaAt = 64, metadataAllocation = 0, metadataEntries = 0;
  while (metaAt < 64 + metadataBytes) {
    if (++metadataEntries > 4096) throw new NativeImageError("limit", "KTX1 metadata has too many entries");
    if (metaAt + 4 > 64 + metadataBytes) throw new NativeImageError("malformed", "Truncated KTX1 metadata entry");
    const length = u(metaAt); metaAt += 4;
    if (length === 0 || metaAt + aligned4(length) > 64 + metadataBytes) throw new NativeImageError("malformed", "Invalid KTX1 metadata entry length");
    metadataAllocation += length * 2 + 128;
    if (metadataAllocation > lim.decoded) throw new NativeImageError("limit", "KTX1 metadata exceeds allocation limit");
    const entry = bytes.subarray(metaAt, metaAt + length), split = entry.indexOf(0);
    if (split < 1) throw new NativeImageError("malformed", "Invalid KTX1 metadata key");
    const key = new TextDecoder().decode(entry.subarray(0, split));
    if (key in keyValues) throw new NativeImageError("malformed", `Duplicate KTX1 metadata key ${key}`);
    keyValues[key] = entry.slice(split + 1);
    metaAt += aligned4(length);
  }
  const orientation = keyValues.KTXorientation ? new TextDecoder().decode(keyValues.KTXorientation).replace(/\0+$/, "") : "S=r,T=d";
  const axes = /^S=([rl]),\s*T=([du])$/.exec(orientation);
  if (!axes) throw new NativeImageError("unsupported", `KTX1 orientation ${orientation} is unsupported`);
  const flipX = axes[1] === "l", flipY = axes[2] === "u";
  let offset = 64 + metadataBytes;
  const blockMap: Record<number, NativeBlockFormat> = { 0x83f0: "bc1-rgb", 0x83f1: "bc1", 0x83f2: "bc2", 0x83f3: "bc3", 0x8c4c: "bc1-rgb", 0x8c4d: "bc1", 0x8c4e: "bc2", 0x8c4f: "bc3", 0x8dbb: "bc4", 0x8dbd: "bc5", 0x8d64: "etc1", 0x9274: "etc2-rgb", 0x9275: "etc2-rgb", 0x9278: "etc2-rgba", 0x9279: "etc2-rgba" };
  const compression = type === 0 && format === 0 ? blockMap[internal] : undefined;
  const layouts: Record<number, { channels: number; base: number; internals: readonly number[] }> = {
    0x1903: { channels: 1, base: 0x1903, internals: [0x1903, 0x8229, 0x822a] },
    0x8227: { channels: 2, base: 0x8227, internals: [0x8227, 0x822b, 0x822c] },
    0x1906: { channels: 1, base: 0x1906, internals: [0x1906, 0x803c, 0x803e] },
    0x1909: { channels: 1, base: 0x1909, internals: [0x1909, 0x8040, 0x8042] },
    0x190a: { channels: 2, base: 0x190a, internals: [0x190a, 0x8045, 0x8048] },
    0x1907: { channels: 3, base: 0x1907, internals: [0x1907, 0x8051, 0x8054, 0x8c40, 0x8c41] },
    0x80e0: { channels: 3, base: 0x1907, internals: [0x1907, 0x8051, 0x8054, 0x8c40, 0x8c41] },
    0x1908: { channels: 4, base: 0x1908, internals: [0x1908, 0x8058, 0x805b, 0x8c42, 0x8c43] },
    0x80e1: { channels: 4, base: 0x1908, internals: [0x1908, 0x8058, 0x805b, 0x8c42, 0x8c43] }
  };
  const layout = layouts[format], sampleBytes = type === 0x1401 ? 1 : type === 0x1403 ? 2 : 0;
  if (compression && typeSize !== 1) throw new NativeImageError("malformed", "KTX1 compressed type size must be one");
  if (compression) {
    const expectedBase = compression === "bc4" ? 0x1903 : compression === "bc5" ? 0x8227 : ["bc1-rgb", "etc1", "etc2-rgb"].includes(compression) ? 0x1907 : 0x1908;
    if (base !== expectedBase) throw new NativeImageError("malformed", "KTX1 compressed base format does not match its internal format");
  }
  if (!compression && (!layout || !sampleBytes || typeSize !== sampleBytes || base !== layout.base || !layout.internals.includes(internal))) throw new NativeImageError("unsupported", `KTX1 type/format ${type}/${format}, internal ${internal} is unsupported`);
  const eightBitInternals = [0x8229, 0x822b, 0x803c, 0x8040, 0x8045, 0x8051, 0x8058, 0x8c41, 0x8c43];
  const sixteenBitInternals = [0x822a, 0x822c, 0x803e, 0x8042, 0x8048, 0x8054, 0x805b];
  if (!compression && ((sampleBytes === 2 && eightBitInternals.includes(internal)) || (sampleBytes === 1 && sixteenBitInternals.includes(internal)))) throw new NativeImageError("unsupported", "KTX1 conversion between source and internal bit depths is unsupported");
  const nchan = layout?.channels;
  const levels: NativeImageLevel[] = [], diagnostics: string[] = [];
  if (!keyValues.KTXorientation) diagnostics.push("KTX1 orientation is unspecified; assuming S=r,T=d");
  if (generateMipmaps) diagnostics.push("KTX1 requests generation of a full mip pyramid from level zero");
  for (const key of Object.keys(keyValues)) if (key !== "KTXorientation") diagnostics.push(`KTX1 metadata ${key} retained but not applied`);
  let allocated = metadataAllocation;
  for (let i = 0; i < count; i++) {
    assertRange(bytes, offset, 4, `KTX1 mip ${i} header`); const size = u(offset); offset += 4;
    const w = Math.max(1, Math.floor(width / 2 ** i)), h = Math.max(1, Math.floor(height / 2 ** i)), row = aligned4(w * (nchan ?? 0) * sampleBytes);
    const expected = compression ? blockSize(compression, w, h) : row * h;
    if (size !== expected) throw new NativeImageError("malformed", `KTX1 mip ${i} size does not match dimensions`);
    assertRange(bytes, offset, aligned4(size), `KTX1 mip ${i}`);
    allocated += compression && options.gpuFormats?.includes(compression) ? size : w * h * 4 * (compression ? 1 : sampleBytes);
    if (allocated > lim.decoded) throw new NativeImageError("limit", "KTX1 levels and metadata exceed allocation limit");
    if (compression) levels.push(encodedLevel(compression, bytes.subarray(offset, offset + size), w, h, options, diagnostics));
    else {
      const data = sampleBytes === 1 ? new Uint8Array(w * h * 4) : new Uint16Array(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const src = offset + y * row + x * nchan! * sampleBytes, dst = (y * w + x) * 4;
        const sample = (i: number): number => sampleBytes === 1 ? bytes[src + i]! : d.getUint16(src + i * 2, le);
        if (format === 0x1909 || format === 0x190a) data[dst] = data[dst + 1] = data[dst + 2] = sample(0);
        else if (format !== 0x1906) { const bgr = format === 0x80e0 || format === 0x80e1; data[dst] = sample(bgr ? 2 : 0); data[dst + 1] = nchan! > 1 ? sample(1) : 0; data[dst + 2] = nchan! > 2 ? sample(bgr ? 0 : 2) : 0; }
        data[dst + 3] = format === 0x1906 ? sample(0) : format === 0x190a ? sample(1) : nchan === 4 ? sample(3) : sampleBytes === 1 ? 255 : 65535;
      }
      levels.push({ width: w, height: h, encoding: sampleBytes === 1 ? "rgba8" : "rgba16", data });
    }
    const level = levels[levels.length - 1]!;
    if ((flipX || flipY) && (level.encoding === "rgba8" || level.encoding === "rgba16")) {
      const pixels = level.data as Uint8Array | Uint16Array;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const source = (y * w + x) * 4, target = ((flipY ? h - 1 - y : y) * w + (flipX ? w - 1 - x : x)) * 4;
        if (target > source) for (let channel = 0; channel < 4; channel++) { const tmp = pixels[source + channel]!; pixels[source + channel] = pixels[target + channel]!; pixels[target + channel] = tmp; }
      }
    } else if ((flipX || flipY) && i === 0) diagnostics.push("Compressed KTX1 data retains source orientation; the consumer must apply metadata.uvTransform");
    offset += aligned4(size);
  }
  const retainedOrientation = levels[0]!.encoding !== "rgba8" && levels[0]!.encoding !== "rgba16";
  return output("ktx1", width, height, levels, { mipLevels: count, generateMipmaps, internalFormat: internal, littleEndian: le, keyValues, uvTransform: { scale: [flipX && retainedOrientation ? -1 : 1, flipY && retainedOrientation ? -1 : 1], offset: [flipX && retainedOrientation ? 1 : 0, flipY && retainedOrientation ? 1 : 0] } }, [0x8c40, 0x8c41, 0x8c42, 0x8c43, 0x8c4c, 0x8c4d, 0x8c4e, 0x8c4f, 0x9275, 0x9279].includes(internal) ? "srgb" : "linear", diagnostics);
}
function tgaColor(bytes: Uint8Array, offset: number, bits: number, alphaBits: number): [number, number, number, number] {
  if (bits === 8) return [bytes[offset]!, bytes[offset]!, bytes[offset]!, 255];
  if (bits === 15 || bits === 16) {
    const value = bytes[offset]! | bytes[offset + 1]! << 8;
    return [Math.round(((value >> 10) & 31) * 255 / 31), Math.round(((value >> 5) & 31) * 255 / 31), Math.round((value & 31) * 255 / 31), alphaBits ? (value & 0x8000 ? 255 : 0) : 255];
  }
  if (bits === 24 || bits === 32) return [bytes[offset + 2]!, bytes[offset + 1]!, bytes[offset]!, bits === 32 && alphaBits ? bytes[offset + 3]! : 255];
  throw new NativeImageError("unsupported", `Unsupported TGA color depth ${bits}`);
}
function parseTGA(bytes: Uint8Array, lim: Limits): NativeImageAsset {
  assertRange(bytes, 0, 18, "TGA header"); const d = view(bytes);
  const idLength = bytes[0]!, mapType = bytes[1]!, kind = bytes[2]!, first = d.getUint16(3, true), entries = d.getUint16(5, true), paletteBits = bytes[7]!;
  const width = d.getUint16(12, true), height = d.getUint16(14, true), bits = bytes[16]!, descriptor = bytes[17]!, alphaBits = descriptor & 15;
  checkSize(width, height, lim);
  if (descriptor & 0xc0) throw new NativeImageError("unsupported", "TGA interleaved images are unsupported");
  const indexed = kind === 1 || kind === 9, gray = kind === 3 || kind === 11, rle = kind === 9 || kind === 10 || kind === 11;
  if (![1, 2, 3, 9, 10, 11].includes(kind) || (indexed ? mapType !== 1 : mapType !== 0)) throw new NativeImageError("unsupported", "TGA image or color-map type is unsupported");
  if ((indexed && ![8, 16].includes(bits)) || (gray && ![8, 16].includes(bits)) || (!indexed && !gray && ![15, 16, 24, 32].includes(bits))) throw new NativeImageError("unsupported", "TGA pixel depth is unsupported");
  if (!indexed && (gray ? !(alphaBits === 0 || bits === 16 && alphaBits === 8) : !(alphaBits === 0 || bits === 16 && alphaBits === 1 || bits === 32 && alphaBits === 8))) throw new NativeImageError("unsupported", "TGA attribute depth is unsupported");
  const signature = new TextEncoder().encode("TRUEVISION-XFILE.\0"), footer = bytes.length - 26;
  const version2 = footer >= 18 && signature.every((value, i) => bytes[footer + 8 + i] === value);
  let imageEnd = version2 ? footer : bytes.length, attributeType: number | undefined;
  const diagnostics: string[] = [];
  if (version2) {
    const extension = d.getUint32(footer, true), developer = d.getUint32(footer + 4, true);
    if (extension) {
      if (extension < 18 || extension > footer - 2) throw new NativeImageError("malformed", "TGA extension area is outside the input");
      const extensionSize = d.getUint16(extension, true);
      if (extensionSize < 495 || extensionSize > footer - extension) throw new NativeImageError("malformed", "TGA extension area is truncated");
      attributeType = bytes[extension + 494]!;
      if (attributeType > 4) throw new NativeImageError("unsupported", `TGA attribute type ${attributeType} is unsupported`);
      imageEnd = Math.min(imageEnd, extension);
      diagnostics.push("TGA extension metadata other than alpha semantics was not applied");
    }
    if (developer) {
      if (developer < 18 || developer >= footer) throw new NativeImageError("malformed", "TGA developer directory is outside the input");
      imageEnd = Math.min(imageEnd, developer);
      diagnostics.push("TGA developer metadata was not applied");
    }
  }
  const assertImageRange = (offset: number, count: number, label: string): void => {
    assertRange(bytes, offset, count, label);
    if (offset + count > imageEnd) throw new NativeImageError("malformed", `${label} overlaps TGA metadata`);
  };
  let offset = 18 + idLength; assertImageRange(18, idLength, "TGA image ID");
  let palette = new Uint8Array();
  if (indexed) {
    if (![15, 16, 24, 32].includes(paletteBits) || !entries) throw new NativeImageError("unsupported", "TGA palette is unsupported");
    const stride = Math.ceil(paletteBits / 8); assertImageRange(offset, entries * stride, "TGA palette");
    if (entries * 4 + width * height * 4 > lim.decoded) throw new NativeImageError("limit", "TGA palette and pixels exceed allocation limit");
    palette = new Uint8Array(entries * 4);
    for (let i = 0; i < entries; i++) palette.set(tgaColor(bytes, offset + i * stride, paletteBits, paletteBits === 32 ? 8 : paletteBits === 16 ? 1 : 0), i * 4);
    offset += entries * stride;
  }
  const stride = Math.ceil(bits / 8), data = new Uint8Array(width * height * 4); let decoded = 0;
  const readPixel = (): [number, number, number, number] => {
    assertImageRange(offset, stride, "TGA pixel");
    let value: [number, number, number, number];
    if (indexed) { const index = (bits === 8 ? bytes[offset]! : d.getUint16(offset, true)) - first; if (index < 0 || index >= entries) throw new NativeImageError("malformed", "TGA palette index is out of range"); const at = index * 4; value = [palette[at]!, palette[at + 1]!, palette[at + 2]!, palette[at + 3]!]; }
    else if (gray) { const g = bytes[offset]!; value = [g, g, g, bits === 16 && alphaBits ? bytes[offset + 1]! : 255]; }
    else value = tgaColor(bytes, offset, bits, alphaBits);
    offset += stride;
    if (attributeType === 0 || attributeType === 1) value = [value[0], value[1], value[2], 255];
    return value;
  };
  const write = (pixel: [number, number, number, number]): void => {
    const row = Math.floor(decoded / width), col = decoded % width;
    const x = descriptor & 0x10 ? width - 1 - col : col, y = descriptor & 0x20 ? row : height - 1 - row;
    data.set(pixel, (y * width + x) * 4); decoded++;
  };
  while (decoded < width * height) {
    if (!rle) { write(readPixel()); continue; }
    assertImageRange(offset, 1, "TGA packet"); const packet = bytes[offset++]!, count = (packet & 127) + 1;
    if (count > width * height - decoded) throw new NativeImageError("malformed", "TGA RLE packet exceeds image size");
    if (packet & 128) { const pixel = readPixel(); for (let i = 0; i < count; i++) write(pixel); }
    else for (let i = 0; i < count; i++) write(readPixel());
  }
  if (attributeType === 2) diagnostics.push("TGA undefined attribute data is retained in alpha; interpretation is application-defined");
  if (attributeType === 4) diagnostics.push("TGA pixels are premultiplied; the consumer must preserve alpha semantics");
  if (attributeType === undefined && (alphaBits || indexed && (paletteBits === 16 || paletteBits === 32))) diagnostics.push("TGA attribute data was interpreted as alpha without an extension declaration");
  return output("tga", width, height, [{ width, height, encoding: "rgba8", data }], { imageType: kind, sourceDepth: bits, origin: descriptor & 0x20 ? "top" : "bottom", paletteEntries: entries, version: version2 ? 2 : 1, attributeType: attributeType ?? null }, "srgb", diagnostics);
}
function unpackPackBits(src: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected); let i = 0, o = 0;
  while (i < src.length && o < expected) {
    const n = src[i++]!;
    if (n <= 127) { const count = n + 1; if (i + count > src.length || o + count > expected) throw new NativeImageError("malformed", "TIFF PackBits literal exceeds strip"); out.set(src.subarray(i, i + count), o); i += count; o += count; }
    else if (n !== 128) { const count = 257 - n; if (i >= src.length || o + count > expected) throw new NativeImageError("malformed", "TIFF PackBits run exceeds strip"); out.fill(src[i++]!, o, o + count); o += count; }
  }
  if (o !== expected) throw new NativeImageError("malformed", "TIFF PackBits strip is truncated");
  return out;
}
/** TIFF LZW codes are MSB-first and use TIFF's early code-width change. */
function unpackLZW(src: Uint8Array, expected: number, maxWorkingBytes: number): Uint8Array {
  let bit = 0, size = 9, next = 258, previous: Uint8Array | undefined, ended = false;
  // Account for the table and short entries as well as decoded output; each dictionary expansion is bounded.
  const overhead = 4096 * 8 + 256 * 32;
  if (maxWorkingBytes < overhead) throw new NativeImageError("limit", "TIFF LZW dictionary exceeds allocation limit");
  let dictionaryBytes = overhead;
  const table: Array<Uint8Array | undefined> = new Array(4096);
  const reset = (): void => { for (let i = 0; i < 256; i++) table[i] = Uint8Array.of(i); table.fill(undefined, 256); size = 9; next = 258; previous = undefined; dictionaryBytes = overhead; };
  reset(); const result = new Uint8Array(expected); let at = 0;
  const read = (): number | undefined => {
    if (bit + size > src.length * 8) return undefined;
    let value = 0; for (let i = 0; i < size; i++, bit++) value = (value << 1) | ((src[bit >> 3]! >> (7 - (bit & 7))) & 1);
    return value;
  };
  for (;;) {
    const code = read(); if (code === undefined) break;
    if (code === 256) { reset(); continue; }
    if (code === 257) { ended = true; break; }
    let entry = table[code];
    if (!entry && code === next && previous) { if (dictionaryBytes + previous.length + 1 > maxWorkingBytes) throw new NativeImageError("limit", "TIFF LZW dictionary exceeds allocation limit"); entry = new Uint8Array(previous.length + 1); entry.set(previous); entry[previous.length] = previous[0]!; }
    if (!entry) throw new NativeImageError("malformed", "Invalid TIFF LZW code");
    if (at + entry.length > expected) throw new NativeImageError("malformed", "TIFF LZW exceeds strip size"); result.set(entry, at); at += entry.length;
    if (previous && next < 4096) {
      dictionaryBytes += previous.length + 1 + 32;
      if (dictionaryBytes > maxWorkingBytes) throw new NativeImageError("limit", "TIFF LZW dictionary exceeds allocation limit");
      const item = new Uint8Array(previous.length + 1); item.set(previous); item[previous.length] = entry[0]!; table[next++] = item;
      if (size < 12 && next === (1 << size) - 1) size++;
    }
    previous = entry;
  }
  if (!ended || at !== expected) throw new NativeImageError("malformed", "TIFF LZW strip is truncated");
  return result;
}
async function inflateStrip(src: Uint8Array, expected: number, signal?: AbortSignal): Promise<Uint8Array> {
  if (typeof DecompressionStream !== "function") throw new NativeImageError("codec-unavailable", "TIFF Deflate requires DecompressionStream");
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const abort = (): void => { if (reader) void reader.cancel(signal?.reason).catch(() => {}); };
  try {
    reader = new Blob([src as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
    signal?.addEventListener("abort", abort, { once: true });
    const result = new Uint8Array(expected); let at = 0;
    for (;;) { signal?.throwIfAborted(); const part = await reader.read(); signal?.throwIfAborted(); if (part.done) break; if (at + part.value.length > expected) { await reader.cancel(); throw new NativeImageError("malformed", "TIFF Deflate exceeds strip size"); } result.set(part.value, at); at += part.value.length; }
    if (at !== expected) throw new NativeImageError("malformed", "TIFF Deflate strip is truncated");
    return result;
  } catch (error) { if (signal?.aborted) throw signal.reason ?? new Error("Image decode aborted"); if (error instanceof NativeImageError) throw error; throw new NativeImageError("malformed", `Invalid TIFF Deflate stream: ${String(error)}`); }
  finally { signal?.removeEventListener("abort", abort); if (signal?.aborted) await reader?.cancel(signal.reason).catch(() => {}); reader?.releaseLock(); }
}
async function parseTIFF(bytes: Uint8Array, lim: Limits, signal?: AbortSignal): Promise<NativeImageAsset> {
  assertRange(bytes, 0, 8, "TIFF header"); const le = bytes[0] === 0x49 && bytes[1] === 0x49;
  if (!le && !(bytes[0] === 0x4d && bytes[1] === 0x4d)) throw new NativeImageError("malformed", "Invalid TIFF byte order");
  const d = view(bytes); if (d.getUint16(2, le) !== 42) throw new NativeImageError("unsupported", "Only classic TIFF version 42 is supported");
  const ifd = d.getUint32(4, le); assertRange(bytes, ifd, 2, "TIFF directory"); const count = d.getUint16(ifd, le);
  if (count > 4096) throw new NativeImageError("limit", "TIFF directory has too many entries");
  assertRange(bytes, ifd + 2, count * 12 + 4, "TIFF directory entries");
  const tags = new Map<number, number[]>();
  const admittedTags = new Set([256, 257, 258, 259, 262, 266, 273, 274, 277, 278, 279, 284, 317, 320, 338, 339]);
  let valueBytes = 0, hasTiles = false, ignoredTagCount = 0;
  for (let i = 0; i < count; i++) {
    const p = ifd + 2 + i * 12, tag = d.getUint16(p, le), type = d.getUint16(p + 2, le), n = d.getUint32(p + 4, le), stride = ({ 1: 1, 3: 2, 4: 4 } as Record<number, number>)[type];
    if ([322, 323, 324, 325].includes(tag)) hasTiles = true;
    if (!admittedTags.has(tag)) { ignoredTagCount++; continue; }
    if (!stride) throw new NativeImageError("unsupported", `TIFF tag ${tag} uses unsupported field type ${type}`);
    valueBytes += n * 8;
    if (n > 1_000_000 || n * stride > lim.file || valueBytes > lim.decoded) throw new NativeImageError("limit", "TIFF tag value count exceeds allocation limit");
    const pos = n * stride <= 4 ? p + 8 : d.getUint32(p + 8, le); assertRange(bytes, pos, n * stride, `TIFF tag ${tag}`);
    const values: number[] = []; for (let j = 0; j < n; j++) values.push(type === 1 ? bytes[pos + j]! : type === 3 ? d.getUint16(pos + j * 2, le) : d.getUint32(pos + j * 4, le));
    if (tags.has(tag)) throw new NativeImageError("malformed", `Duplicate TIFF tag ${tag}`); tags.set(tag, values);
  }
  if (hasTiles) throw new NativeImageError("unsupported", "Tiled TIFF images are unsupported");
  const get = (tag: number, fallback: number): number => tags.get(tag)?.[0] ?? fallback;
  const width = get(256, 0), height = get(257, 0); checkSize(width, height, lim);
  const compression = get(259, 1), photo = get(262, 1), samples = get(277, 1), rows = get(278, height), planar = get(284, 1), predictor = get(317, 1), orientation = get(274, 1), sampleFormat = get(339, 1), fillOrder = get(266, 1);
  const bits = tags.get(258) ?? [1], formats = tags.get(339) ?? [1], stripOffsets = tags.get(273) ?? [], stripCounts = tags.get(279) ?? [];
  if (!Number.isInteger(rows) || rows < 1 || rows > 0xffffffff || samples < 1 || samples > 4 || orientation < 1 || orientation > 8) throw new NativeImageError("malformed", "Invalid TIFF image dimensions or layout");
  if (bits.length !== 1 && bits.length !== samples || formats.length !== 1 && formats.length !== samples || ![1, 2, 4, 8, 16].includes(bits[0]!) || bits.some((n) => n !== bits[0]) || sampleFormat !== 1 || formats.some((n) => n !== 1) || ![1, 2].includes(planar) || ![1, 2].includes(predictor)) throw new NativeImageError("unsupported", "TIFF supports unsigned 1/2/4/8/16-bit samples and horizontal prediction only");
  const sampleBits = bits[0]!, maxValue = 2 ** sampleBits - 1, outputBytes = sampleBits === 16 ? 2 : 1;
  if (![0, 1, 2, 3].includes(photo) || (photo === 2 && samples < 3) || (photo !== 2 && samples > 2)) throw new NativeImageError("unsupported", "TIFF photometric interpretation or samples are unsupported");
  if (![1, 5, 8, 32946, 32773].includes(compression)) throw new NativeImageError("unsupported", `TIFF compression ${compression} is unsupported`);
  if (fillOrder !== 1 && !(fillOrder === 2 && sampleBits === 1 && compression === 1)) throw new NativeImageError("unsupported", "TIFF FillOrder is supported only for ordinary data or uncompressed 1-bit samples");
  const extraCount = samples - (photo === 2 ? 3 : 1), extras = tags.get(338);
  if (extras && extras.length !== extraCount) throw new NativeImageError("malformed", "TIFF ExtraSamples count does not match samples per pixel");
  if (extras?.some((extra) => extra > 2)) throw new NativeImageError("unsupported", "TIFF ExtraSamples interpretation is unsupported");
  const hasAlpha = extraCount === 1 && (!extras || extras[0] === 1 || extras[0] === 2), associatedAlpha = hasAlpha && extras?.[0] === 1;
  const stripsPerPlane = Math.ceil(height / rows), strips = stripsPerPlane * (planar === 2 ? samples : 1);
  if (stripOffsets.length !== strips || stripCounts.length !== strips) throw new NativeImageError("malformed", "TIFF strip table does not match image height and planes");
  const rowBytes = Math.ceil(width * (planar === 1 ? samples : 1) * sampleBits / 8), rawBytes = rowBytes * height * (planar === 2 ? samples : 1), stripWorking = rowBytes * Math.min(rows, height);
  if (valueBytes + rawBytes + width * height * 4 * outputBytes + stripWorking > lim.decoded) throw new NativeImageError("limit", "TIFF decoded strips exceed allocation limit");
  const raw = new Uint8Array(rawBytes);
  for (let i = 0; i < strips; i++) {
    signal?.throwIfAborted();
    const plane = planar === 2 ? Math.floor(i / stripsPerPlane) : 0, firstRow = (i % stripsPerPlane) * rows;
    const start = stripOffsets[i]!, size = stripCounts[i]!, expected = rowBytes * Math.min(rows, height - firstRow); assertRange(bytes, start, size, `TIFF strip ${i}`);
    const src = bytes.subarray(start, start + size);
    const decoded = compression === 1 ? src : compression === 32773 ? unpackPackBits(src, expected) : compression === 5 ? unpackLZW(src, expected, lim.decoded - valueBytes - rawBytes - width * height * 4 * outputBytes - expected) : await inflateStrip(src, expected, signal);
    if (decoded.length !== expected) throw new NativeImageError("malformed", `TIFF strip ${i} length mismatch`);
    raw.set(decoded, (plane * height + firstRow) * rowBytes);
  }
  const rawView = view(raw);
  const samplePosition = (x: number, y: number, channel: number): number => ((planar === 2 ? channel * height : 0) + y) * rowBytes * 8 + (x * (planar === 1 ? samples : 1) + (planar === 1 ? channel : 0)) * sampleBits;
  const readSample = (x: number, y: number, channel: number): number => {
    const bit = samplePosition(x, y, channel), byte = Math.floor(bit / 8);
    if (sampleBits === 16) return rawView.getUint16(byte, le);
    if (sampleBits === 8) return raw[byte]!;
    const shift = fillOrder === 2 ? bit % 8 : 8 - sampleBits - bit % 8;
    return (raw[byte]! >>> shift) & maxValue;
  };
  const writeSample = (x: number, y: number, channel: number, value: number): void => {
    const bit = samplePosition(x, y, channel), byte = Math.floor(bit / 8);
    if (sampleBits === 16) rawView.setUint16(byte, value, le);
    else if (sampleBits === 8) raw[byte] = value;
    else { const shift = fillOrder === 2 ? bit % 8 : 8 - sampleBits - bit % 8; raw[byte] = (raw[byte]! & ~(maxValue << shift)) | (value << shift); }
  };
  if (predictor === 2) for (let y = 0; y < height; y++) for (let x = 1; x < width; x++) for (let c = 0; c < samples; c++) {
    writeSample(x, y, c, (readSample(x, y, c) + readSample(x - 1, y, c)) & maxValue);
  }
  const palette = tags.get(320), paletteSize = 2 ** sampleBits; if (photo === 3 && (!palette || palette.length !== paletteSize * 3)) throw new NativeImageError("malformed", "TIFF palette size does not match sample depth");
  const outWidth = orientation >= 5 ? height : width, outHeight = orientation >= 5 ? width : height, data = outputBytes === 1 ? new Uint8Array(width * height * 4) : new Uint16Array(width * height * 4), outputMax = outputBytes === 1 ? 255 : 65535;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = readSample(x, y, 0), normalized = (sample: number): number => Math.round(sample * outputMax / maxValue);
    let r = normalized(v), g = r, b = r, a = outputMax;
    if (photo === 0) r = g = b = outputMax - r;
    if (photo === 2) { g = normalized(readSample(x, y, 1)); b = normalized(readSample(x, y, 2)); if (hasAlpha) a = normalized(readSample(x, y, 3)); }
    else if (photo === 3) { const scale = outputBytes === 1 ? 257 : 1; r = Math.round(palette![v]! / scale); g = Math.round(palette![paletteSize + v]! / scale); b = Math.round(palette![2 * paletteSize + v]! / scale); if (hasAlpha) a = normalized(readSample(x, y, 1)); }
    else if (hasAlpha) a = normalized(readSample(x, y, 1));
    // Associated alpha stores premultiplied channels. Return straight RGBA.
    if (associatedAlpha) {
      if (a === 0) r = g = b = 0;
      else { r = Math.min(outputMax, Math.round(r * outputMax / a)); g = Math.min(outputMax, Math.round(g * outputMax / a)); b = Math.min(outputMax, Math.round(b * outputMax / a)); }
    }
    let ox = x, oy = y;
    switch (orientation) {
      case 2: ox = width - 1 - x; break;
      case 3: ox = width - 1 - x; oy = height - 1 - y; break;
      case 4: oy = height - 1 - y; break;
      case 5: ox = y; oy = x; break;
      case 6: ox = height - 1 - y; oy = x; break;
      case 7: ox = height - 1 - y; oy = width - 1 - x; break;
      case 8: ox = y; oy = width - 1 - x; break;
    }
    const p = (oy * outWidth + ox) * 4; data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = a;
  }
  const next = d.getUint32(ifd + 2 + count * 12, le); const diagnostics = next ? ["Additional TIFF pages were not decoded"] : [];
  if (hasAlpha && !extras) diagnostics.push("TIFF alpha has no ExtraSamples declaration; interpreted as straight alpha");
  if (extras?.[0] === 0) diagnostics.push("TIFF unspecified extra sample was not interpreted as alpha");
  if (ignoredTagCount) diagnostics.push(`${ignoredTagCount} TIFF metadata tags were not interpreted`);
  return output("tiff", outWidth, outHeight, [{ width: outWidth, height: outHeight, encoding: outputBytes === 1 ? "rgba8" : "rgba16", data }], { orientation, compression, photometric: photo, littleEndian: le, bitsPerSample: sampleBits, planarConfiguration: planar, fillOrder }, "srgb", diagnostics);
}

/** Decode an explicitly selected image format with bounded allocation and capability reporting. */
export async function parseImageFormat(input: ArrayBuffer | Uint8Array, format: NativeImageFormat, options: NativeImageOptions = {}): Promise<NativeImageAsset> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input), lim = limits(options);
  if (bytes.byteLength > lim.file) throw new NativeImageError("limit", "Image file exceeds byte limit");
  if (options.signal?.aborted) throw options.signal.reason ?? new Error("Image decode aborted");
  if (format === "dds") return parseDDS(bytes, options, lim);
  if (format === "pvr") return parsePVR(bytes, options, lim);
  if (format === "ktx1") return parseKTX1(bytes, options, lim);
  if (format === "tga") return parseTGA(bytes, lim);
  if (format === "tiff") {
    const result = await parseTIFF(bytes, lim, options.signal);
    options.signal?.throwIfAborted(); return result;
  }
  if (format !== "jxl" && format !== "ultrahdr") throw new NativeImageError("unsupported", `Unknown image format ${String(format)}`);
  if (format === "jxl") {
    const raw = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0x0a;
    const signature = [0, 0, 0, 12, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a];
    if (!raw && !signature.every((v, i) => bytes[i] === v)) throw new NativeImageError("malformed", "Invalid JPEG XL signature");
  } else if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) throw new NativeImageError("malformed", "Invalid UltraHDR JPEG envelope");
  const codec = options.codecs?.[format];
  if (typeof codec !== "function") throw new NativeImageError("codec-unavailable", `${format} requires an explicitly supplied decoder`);
  const decoded = await codec(bytes, { maxPixels: lim.pixels, maxDecodedBytes: lim.decoded, signal: options.signal });
  if (options.signal?.aborted) throw options.signal.reason ?? new Error("Image decode aborted");
  if (!decoded || typeof decoded !== "object") throw new NativeImageError("malformed", `${format} decoder returned an invalid result`);
  checkSize(decoded.width, decoded.height, lim);
  if (!(decoded.data instanceof Uint8Array || decoded.data instanceof Float32Array) || decoded.data.length !== decoded.width * decoded.height * 4 || (decoded.colorSpace !== undefined && decoded.colorSpace !== "linear" && decoded.colorSpace !== "srgb")) throw new NativeImageError("malformed", `${format} decoder returned invalid RGBA data or color space`);
  if (decoded.data.byteLength > lim.decoded) throw new NativeImageError("limit", `${format} decoder returned data exceeding the decoded-byte limit`);
  if (decoded.data instanceof Float32Array && decoded.data.some((v) => !Number.isFinite(v))) throw new NativeImageError("malformed", `${format} decoder returned non-finite samples`);
  if (format === "ultrahdr" && (!(decoded.data instanceof Float32Array) || decoded.colorSpace !== "linear" || decoded.metadata?.gainMapApplied !== true)) throw new NativeImageError("unsupported", "UltraHDR decoder must apply its gain map and return linear RGBA float data");
  return output(format, decoded.width, decoded.height, [{ width: decoded.width, height: decoded.height, encoding: decoded.data instanceof Float32Array ? "rgba32f" : "rgba8", data: decoded.data.slice() }], { ...(decoded.metadata ?? {}), codec: "application-supplied" }, decoded.colorSpace ?? "srgb");
}

/** Asset-manager adapter; this loader has no external image dependencies. */
export class ImageFormatLoader implements AssetLoader<NativeImageAsset> {
  readonly type: NativeImageFormat;
  constructor(format: NativeImageFormat, private readonly options: NativeImageOptions = {}) { this.type = format; }
  canLoad(request: AssetLoadRequest): boolean {
    if (request.type) return request.type === this.type;
    const extensions: Record<NativeImageFormat, string> = { dds: "dds", pvr: "pvr", ktx1: "ktx", tga: "tga", tiff: "tiff?", jxl: "jxl", ultrahdr: "uhdr" };
    return new RegExp(`\\.${extensions[this.type]}(?:[?#]|$)`, "i").test(request.url);
  }
  load(request: AssetLoadRequest, context: LoadContext): Promise<NativeImageAsset> {
    const tracker = this.options.transportTracker;
    let releaseRoot: (() => void) | undefined;
    try { releaseRoot = tracker?.begin(); }
    catch (error) { return Promise.reject(error); }
    const work = this.loadImage(request, context, tracker);
    if (releaseRoot) void work.then(releaseRoot, releaseRoot);
    return work;
  }
  private async loadImage(request: AssetLoadRequest, context: LoadContext, tracker?: AssetTransportTracker): Promise<NativeImageAsset> {
    const url = context.resolve(request.url); context.throwIfAborted(url);
    const signals = [...new Set([context.signalFor(request.signal), this.options.signal].filter((s): s is AbortSignal => s !== undefined))];
    const controller = new AbortController();
    const listeners = new Map<AbortSignal, () => void>();
    const abort = (source: AbortSignal): void => { controller.abort(source.reason); };
    for (const signal of signals) {
      const listener = (): void => abort(signal); listeners.set(signal, listener);
      if (signal.aborted) abort(signal); else signal.addEventListener("abort", listener, { once: true });
    }
    try {
      const settings = mergeAssetRequestOptions(context.requestOptionsFor(request.url), request);
      const fileLimit = limits(this.options).file;
      const maxBytes = Math.min(settings.maxBytes ?? fileLimit, fileLimit);
      const buffer = await fetchBytes(url, controller.signal, (progress) => request.onProgress?.({ url, phase: "document", loadedBytes: progress.loaded, totalBytes: progress.total }), { ...settings, maxBytes }, tracker);
      context.throwIfAborted(url); controller.signal.throwIfAborted();
      const result = await parseImageFormat(buffer, this.type, { ...this.options, signal: controller.signal });
      context.throwIfAborted(url); controller.signal.throwIfAborted();
      request.onProgress?.({ url, phase: "complete", loadedBytes: buffer.byteLength, totalBytes: buffer.byteLength });
      return result;
    } finally {
      for (const [signal, listener] of listeners) signal.removeEventListener("abort", listener);
    }
  }
}
