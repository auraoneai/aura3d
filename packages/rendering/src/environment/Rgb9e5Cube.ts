/**
 * PRD-02 §7.1 — RGB9E5 cube decoder for baked environment probes.
 * Reads uncompressed RGB9E5 cubes (six faces, square, mip chain) from the
 * recognized standard KTX2 descriptor or Aura's historical probe layout.
 * The latter is a private container and is not a standard KTX2 file.
 */
export const KTX2_MAGIC = new Uint8Array([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Historical Aura marker. Value 142 is not the Vulkan RGB9E5 format code. */
export const VK_FORMAT_E5B9G9R9_UFLOAT_PACK32 = 142;
/** Historical Aura probe header size, retained for the existing writers. */
export const KTX2_HEADER_BYTES = 68;
/** Standard Vulkan format and KTX2 header size for shared-exponent RGB. */
export const KTX2_RGB9E5_VK_FORMAT = 123;
export const KTX2_STANDARD_HEADER_BYTES = 80;

export type Rgb9e5CubeErrorReason =
  | "ENV_KTX2_TRUNCATED" | "ENV_KTX2_MAGIC" | "ENV_KTX2_FORMAT" | "ENV_KTX2_TYPESIZE"
  | "ENV_KTX2_SUPERCOMPRESSED" | "ENV_KTX2_FACES" | "ENV_KTX2_3D"
  | "ENV_KTX2_LAYERS" | "ENV_KTX2_NONSQUARE" | "ENV_KTX2_LEVELS" | "ENV_KTX2_LEVELSIZE"
  | "ENV_KTX2_LAYOUT" | "ENV_KTX2_DESCRIPTOR" | "ENV_KTX2_METADATA";

export class Rgb9e5CubeError extends Error {
  constructor(public readonly reason: Rgb9e5CubeErrorReason, message: string) {
    super(`${reason}: ${message}`);
    this.name = "Rgb9e5CubeError";
  }
}

export interface Rgb9e5Cube {
  readonly faceSize: number;
  readonly mipCount: number;
  /** levels[m][face] → Float32Array of faceSize_m² × 4 (RGBA). */
  readonly levels: readonly (readonly Float32Array[])[];
}

const LITTLE_ENDIAN_HOST = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/** 2^(e − 15 − 9) for each 5-bit shared exponent. */
const RGB9E5_SCALE: readonly number[] = Array.from({ length: 32 }, (_, e) => Math.pow(2, e - 15 - 9));

type ByteRegion = { readonly offset: number; readonly length: number };

function standardRegion(offset: number, length: number, minimumOffset: number, bytes: Uint8Array, label: string): ByteRegion {
  if (offset < minimumOffset || offset % 4 !== 0 || !Number.isSafeInteger(offset + length)) {
    throw new Rgb9e5CubeError("ENV_KTX2_LAYOUT", `${label} overlaps the header or is misaligned`);
  }
  if (offset + length > bytes.byteLength) throw new Rgb9e5CubeError("ENV_KTX2_TRUNCATED", `${label} is truncated`);
  return { offset, length };
}

/**
 * Accept the published shared-exponent RGBSDA descriptor. Other color spaces,
 * descriptor extensions and packing descriptions are deliberately rejected
 * until the probe API can represent their semantics.
 * See Khronos Data Format 1.4, Table 102.
 */
function validateStandardDescriptor(view: DataView, offset: number, length: number): void {
  if (length !== 124 || view.getUint32(offset, true) !== length ||
      view.getUint16(offset + 4, true) !== 0 || view.getUint16(offset + 6, true) !== 0 ||
      view.getUint16(offset + 8, true) !== 2 || view.getUint16(offset + 10, true) !== 120 ||
      view.getUint8(offset + 12) !== 1 || view.getUint8(offset + 13) !== 1 ||
      view.getUint8(offset + 14) !== 1 || view.getUint8(offset + 15) !== 0) {
    throw new Rgb9e5CubeError("ENV_KTX2_DESCRIPTOR", "unsupported RGB9E5 data format descriptor");
  }
  for (let i = 0; i < 4; i += 1) {
    if (view.getUint8(offset + 16 + i) !== 0) {
      throw new Rgb9e5CubeError("ENV_KTX2_DESCRIPTOR", "RGB9E5 texel block must be one texel");
    }
  }
  for (let i = 0; i < 8; i += 1) {
    if (view.getUint8(offset + 20 + i) !== (i === 0 ? 4 : 0)) {
      throw new Rgb9e5CubeError("ENV_KTX2_DESCRIPTOR", "RGB9E5 texel block must occupy four bytes");
    }
  }
  for (let channel = 0; channel < 3; channel += 1) {
    for (let component = 0; component < 2; component += 1) {
      const sample = offset + 28 + (channel * 2 + component) * 16;
      const exponent = component === 1;
      if (view.getUint16(sample, true) !== (exponent ? 27 : channel * 9) ||
          view.getUint8(sample + 2) !== (exponent ? 4 : 8) ||
          view.getUint8(sample + 3) !== (channel | (exponent ? 0x20 : 0)) ||
          view.getUint32(sample + 4, true) !== 0 ||
          view.getUint32(sample + 8, true) !== (exponent ? 15 : 0) ||
          view.getUint32(sample + 12, true) !== (exponent ? 31 : 8448)) {
        throw new Rgb9e5CubeError("ENV_KTX2_DESCRIPTOR", "unsupported RGB9E5 sample description");
      }
    }
  }
}

/** Check KTX key/value structure and reject transformations not applied here. */
function validateStandardMetadata(bytes: Uint8Array, view: DataView, region: ByteRegion): void {
  const end = region.offset + region.length;
  const known = new Set<string>();
  let cursor = region.offset;
  while (cursor < end) {
    if (end - cursor < 4) throw new Rgb9e5CubeError("ENV_KTX2_METADATA", "key/value length is truncated");
    const size = view.getUint32(cursor, true);
    const start = cursor + 4;
    const finish = start + size;
    const paddedEnd = Math.ceil(finish / 4) * 4;
    if (size === 0 || finish > end || paddedEnd > end) {
      throw new Rgb9e5CubeError("ENV_KTX2_METADATA", "key/value record is truncated");
    }
    let separator = start;
    while (separator < finish && bytes[separator] !== 0) separator += 1;
    if (separator === start || separator === finish) {
      throw new Rgb9e5CubeError("ENV_KTX2_METADATA", "key/value key is missing its terminator");
    }
    // Only the two bounded keys below affect decoding. Avoid constructing an
    // arbitrarily large string from an unrelated caller-controlled key.
    let key = "";
    if (separator - start <= 14) {
      for (let i = start; i < separator; i += 1) key += String.fromCharCode(bytes[i]!);
    }
    if (key === "KTXorientation" || key === "KTXswizzle") {
      if (known.has(key)) throw new Rgb9e5CubeError("ENV_KTX2_METADATA", `duplicate ${key}`);
      known.add(key);
      const valueSize = finish - separator - 1;
      if (valueSize !== (key === "KTXorientation" ? 3 : 5) || bytes[finish - 1] !== 0) {
        throw new Rgb9e5CubeError("ENV_KTX2_METADATA", `${key} value has an invalid length or terminator`);
      }
      let valueEnd = finish;
      valueEnd -= 1;
      let value = "";
      for (let i = separator + 1; i < valueEnd; i += 1) value += String.fromCharCode(bytes[i]!);
      if (key === "KTXorientation" && value !== "rd") {
        throw new Rgb9e5CubeError("ENV_KTX2_METADATA", "unsupported cubemap orientation");
      }
      if (key === "KTXswizzle" && value !== "rgba" && value !== "rgb1") {
        throw new Rgb9e5CubeError("ENV_KTX2_METADATA", "unsupported RGB9E5 channel swizzle");
      }
    }
    for (let i = finish; i < paddedEnd; i += 1) {
      if (bytes[i] !== 0) throw new Rgb9e5CubeError("ENV_KTX2_METADATA", "key/value padding must be zero");
    }
    cursor = paddedEnd;
  }
}

export function readRgb9e5Cube(bytes: Uint8Array): Rgb9e5Cube {
  if (bytes.byteLength < KTX2_HEADER_BYTES) throw new Rgb9e5CubeError("ENV_KTX2_TRUNCATED", `need ${KTX2_HEADER_BYTES} header bytes, got ${bytes.byteLength}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < 12; i += 1) {
    if (bytes[i] !== KTX2_MAGIC[i]) throw new Rgb9e5CubeError("ENV_KTX2_MAGIC", "bad KTX2 identifier");
  }
  const vkFormat = view.getUint32(12, true);
  const standard = vkFormat === KTX2_RGB9E5_VK_FORMAT;
  if (!standard && vkFormat !== VK_FORMAT_E5B9G9R9_UFLOAT_PACK32) {
    throw new Rgb9e5CubeError("ENV_KTX2_FORMAT", `vkFormat ${vkFormat} is not a supported RGB9E5 probe layout`);
  }
  const typeSize = view.getUint32(16, true);
  if (typeSize !== 4) throw new Rgb9e5CubeError("ENV_KTX2_TYPESIZE", `typeSize ${typeSize}, expected 4`);
  const pixelWidth = view.getUint32(20, true);
  const pixelHeight = view.getUint32(24, true);
  const pixelDepth = view.getUint32(28, true);
  const layerCount = view.getUint32(32, true);
  const faceCount = view.getUint32(36, true);
  const levelCount = view.getUint32(40, true);
  const supercompression = view.getUint32(44, true);
  const dfdOff = view.getUint32(48, true);
  const dfdLen = view.getUint32(52, true);
  const kvdOff = view.getUint32(56, true);
  const kvdLen = view.getUint32(60, true);
  if (supercompression !== 0) throw new Rgb9e5CubeError("ENV_KTX2_SUPERCOMPRESSED", `supercompression ${supercompression} unsupported`);
  if (faceCount !== 6) throw new Rgb9e5CubeError("ENV_KTX2_FACES", `faceCount ${faceCount}, expected 6`);
  if (pixelDepth !== 0) throw new Rgb9e5CubeError("ENV_KTX2_3D", "3D textures unsupported");
  if (layerCount !== 0) throw new Rgb9e5CubeError("ENV_KTX2_LAYERS", "array layers unsupported");
  if (pixelWidth !== pixelHeight) throw new Rgb9e5CubeError("ENV_KTX2_NONSQUARE", `${pixelWidth}x${pixelHeight}`);
  if (levelCount === 0) throw new Rgb9e5CubeError("ENV_KTX2_LEVELS", "no mip levels");

  if (pixelWidth === 0) throw new Rgb9e5CubeError("ENV_KTX2_NONSQUARE", "face size must be positive");
  if (levelCount > 1 + Math.floor(Math.log2(pixelWidth))) {
    throw new Rgb9e5CubeError("ENV_KTX2_LEVELS", "mip count exceeds the face dimensions");
  }

  const indexOff = standard ? KTX2_STANDARD_HEADER_BYTES : KTX2_HEADER_BYTES;
  const indexBytes = levelCount * 24;
  if (bytes.byteLength < indexOff + indexBytes) throw new Rgb9e5CubeError("ENV_KTX2_TRUNCATED", "level index truncated");

  // Validate every level before allocating output, including safe u64
  // conversion, alignment, exact face sizes, and non-overlapping byte ranges.
  const layouts: { readonly offset: number; readonly length: number; readonly size: number }[] = [];
  const indexEnd = indexOff + indexBytes;
  const regions: ByteRegion[] = [];
  if (standard) {
    // A non-supercompressed KTX2 has no global supercompression data.
    if (view.getBigUint64(64, true) !== 0n || view.getBigUint64(72, true) !== 0n) {
      throw new Rgb9e5CubeError("ENV_KTX2_LAYOUT", "unexpected supercompression global data");
    }
    const dfd = standardRegion(dfdOff, dfdLen, indexEnd, bytes, "data format descriptor");
    if (dfdLen !== 124) throw new Rgb9e5CubeError("ENV_KTX2_DESCRIPTOR", "unsupported data format descriptor size");
    validateStandardDescriptor(view, dfd.offset, dfd.length);
    regions.push(dfd);
    if (kvdLen > 0) {
      const kvd = standardRegion(kvdOff, kvdLen, indexEnd, bytes, "key/value data");
      validateStandardMetadata(bytes, view, kvd);
      regions.push(kvd);
    }
  } else {
    // Published Aura probes use a private 68-byte header and no DFD/KVD. A
    // standard KTX2 file with format 142 is a different (compressed) format;
    // it must not be silently interpreted as these packed RGB9E5 texels.
    if (dfdLen !== 0 || kvdLen !== 0 ||
        (dfdOff !== 0 && dfdOff !== KTX2_HEADER_BYTES) ||
        (kvdOff !== 0 && kvdOff !== KTX2_HEADER_BYTES)) {
      throw new Rgb9e5CubeError("ENV_KTX2_LAYOUT", "unsupported or ambiguous historical probe metadata");
    }
  }
  for (let level = 0; level < levelCount; level += 1) {
    const offset = view.getBigUint64(indexOff + level * 24, true);
    const length = view.getBigUint64(indexOff + level * 24 + 8, true);
    const unpackedLength = view.getBigUint64(indexOff + level * 24 + 16, true);
    const size = Math.max(1, Math.floor(pixelWidth / 2 ** level));
    const expected = 6 * size * size * 4;
    if (!Number.isSafeInteger(expected) || length !== BigInt(expected) ||
        (standard ? unpackedLength !== length : unpackedLength !== 0n && unpackedLength !== length)) {
      throw new Rgb9e5CubeError("ENV_KTX2_LEVELSIZE", `level ${level} has an invalid byte length`);
    }
    if (offset < BigInt(indexEnd) || offset % 4n !== 0n) {
      throw new Rgb9e5CubeError("ENV_KTX2_LAYOUT", `level ${level} overlaps its header or is misaligned`);
    }
    if (offset + length > BigInt(bytes.byteLength)) {
      throw new Rgb9e5CubeError("ENV_KTX2_TRUNCATED", `level ${level} data truncated`);
    }
    layouts.push({ offset: Number(offset), length: expected, size });
    regions.push({ offset: Number(offset), length: expected });
  }
  const byOffset = regions.sort((a, b) => a.offset - b.offset);
  for (let i = 1; i < byOffset.length; i += 1) {
    if (byOffset[i]!.offset < byOffset[i - 1]!.offset + byOffset[i - 1]!.length) {
      throw new Rgb9e5CubeError("ENV_KTX2_LAYOUT", "container sections overlap");
    }
  }

  const levels: Float32Array[][] = [];
  for (let level = 0; level < levelCount; level += 1) {
    const { offset: levelOffset, size } = layouts[level]!;
    const levelFaces: Float32Array[] = [];
    const faceBytes = size * size * 4;
    for (let face = 0; face < 6; face += 1) {
      const start = levelOffset + face * faceBytes;
      // A caller can provide a valid container as an unaligned subarray. In
      // that case DataView preserves little-endian decoding without requiring
      // a byte copy or imposing host-endianness assumptions.
      const packed = LITTLE_ENDIAN_HOST && (bytes.byteOffset + start) % 4 === 0
        ? new Uint32Array(bytes.buffer, bytes.byteOffset + start, size * size)
        : undefined;
      const rgba = new Float32Array(size * size * 4);
      // Same arithmetic as `unpackRgb9e5` (mantissa × 2^(e−24)) with the 32 possible scales precomputed and no per-texel allocation.
      for (let t = 0; t < size * size; t += 1) {
        const word = packed ? packed[t]! : view.getUint32(start + t * 4, true);
        const scale = RGB9E5_SCALE[(word >>> 27) & 0x1f]!;
        rgba[t * 4] = (word & 0x1ff) * scale;
        rgba[t * 4 + 1] = ((word >>> 9) & 0x1ff) * scale;
        rgba[t * 4 + 2] = ((word >>> 18) & 0x1ff) * scale;
        rgba[t * 4 + 3] = 1;
      }
      levelFaces.push(rgba);
    }
    levels.push(levelFaces);
  }
  return { faceSize: pixelWidth, mipCount: levelCount, levels };
}

/** Decode a packed RGB9E5 texel: 9-bit mantissas, shared 5-bit exponent, bias 15 → value = mantissa·2^(e−24). */
export function unpackRgb9e5(packed: number): [number, number, number] {
  const e = ((packed >>> 27) & 0x1f) - 15 - 9;
  const scale = Math.pow(2, e);
  return [(packed & 0x1ff) * scale, ((packed >>> 9) & 0x1ff) * scale, ((packed >>> 18) & 0x1ff) * scale];
}

/** Encode RGB to a packed RGB9E5 texel (shared 5-bit biased exponent; mantissa = c·2^(24−e)). */
export function packRgb9e5(r: number, g: number, b: number): number {
  const maxC = Math.max(r, g, b, 1e-10);
  // smallest e with maxC·2^(24−e) ≤ 511
  const e = Math.max(0, Math.min(31, Math.ceil(Math.log2(maxC)) + 15));
  const invScale = Math.pow(2, 24 - e);
  const enc = (c: number) => Math.min(0x1ff, Math.max(0, Math.round(c * invScale)));
  return (e << 27) | (enc(b) << 18) | (enc(g) << 9) | enc(r);
}
