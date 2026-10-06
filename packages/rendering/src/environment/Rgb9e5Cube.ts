/**
 * PRD-02 §7.2 — `Rgb9e5Cube`: minimal KTX2 reader for the day-0 prebaked
 * environment presets (`<preset>.<tier>.ktx2`, RGB9E5 cube with mips).
 * Reads exactly one layout — `VK_FORMAT_E5B9G9R9_UFLOAT_PACK32`, cube
 * (6 faces), mip levels, **no supercompression** — and rejects everything
 * else with a named error. Output is float32 faces per level, ready for
 * the worker prefilter's own mip chain or direct `RGB9_E5` upload
 * (request Q-06-1) / RGBA16F expansion fallback.
 */

export const KTX2_MAGIC = new Uint8Array([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
export const VK_FORMAT_E5B9G9R9_UFLOAT_PACK32 = 142;

export interface Rgb9e5CubeLevel {
  readonly faceSize: number;
  /** 6 × faceSize² × 4 floats (RGBA; A = 1), linear HDR. */
  readonly faces: readonly Float32Array[];
  /** Raw RGB9E5 words (6 × faceSize²) for a direct RGB9_E5 upload path. */
  readonly packed: readonly Uint32Array[];
}

export interface Rgb9e5Cube {
  readonly faceSize: number;
  readonly levelCount: number;
  readonly levels: readonly Rgb9e5CubeLevel[];
}

export class Rgb9e5CubeError extends Error {
  constructor(readonly reason: string, detail: string) {
    super(`${reason}:${detail}`);
    this.name = "Rgb9e5CubeError";
  }
}

const KTX2_HEADER_BYTES = 68;

export function readRgb9e5Cube(buffer: ArrayBuffer | Uint8Array): Rgb9e5Cube {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength < KTX2_HEADER_BYTES) {
    throw new Rgb9e5CubeError("ENV_KTX2_TRUNCATED", `${bytes.byteLength} bytes`);
  }
  for (let i = 0; i < 12; i += 1) {
    if (bytes[i] !== KTX2_MAGIC[i]) throw new Rgb9e5CubeError("ENV_KTX2_MAGIC", `byte ${i}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vkFormat = view.getUint32(12, true);
  if (vkFormat !== VK_FORMAT_E5B9G9R9_UFLOAT_PACK32) {
    throw new Rgb9e5CubeError("ENV_KTX2_FORMAT", `vkFormat ${vkFormat}`);
  }
  const typeSize = view.getUint32(16, true);
  if (typeSize !== 4) throw new Rgb9e5CubeError("ENV_KTX2_TYPESIZE", `${typeSize}`);
  const pixelWidth = view.getUint32(20, true);
  const pixelHeight = view.getUint32(24, true);
  const pixelDepth = view.getUint32(28, true);
  const layerCount = view.getUint32(32, true);
  const faceCount = view.getUint32(36, true);
  const levelCount = view.getUint32(40, true);
  const supercompression = view.getUint32(44, true);
  if (supercompression !== 0) {
    throw new Rgb9e5CubeError("ENV_KTX2_SUPERCOMPRESSED", `scheme ${supercompression}`);
  }
  if (faceCount !== 6) throw new Rgb9e5CubeError("ENV_KTX2_FACES", `${faceCount}`);
  if (pixelDepth !== 0) throw new Rgb9e5CubeError("ENV_KTX2_3D", `${pixelDepth}`);
  if (layerCount > 1) throw new Rgb9e5CubeError("ENV_KTX2_LAYERS", `${layerCount}`);
  if (pixelWidth !== pixelHeight) throw new Rgb9e5CubeError("ENV_KTX2_NONSQUARE", `${pixelWidth}x${pixelHeight}`);
  // KTX2 order: header | DFD | KVD | level index | level data.
  const dfdByteOffset = view.getUint32(48, true);
  const dfdByteLength = view.getUint32(52, true);
  const kvdByteOffset = view.getUint32(56, true);
  const kvdByteLength = view.getUint32(60, true);
  const afterDfd = dfdByteOffset + dfdByteLength;
  const afterKvd = kvdByteLength === 0 ? afterDfd : kvdByteOffset + kvdByteLength;
  const indexOffset = align4(Math.max(afterDfd, afterKvd, KTX2_HEADER_BYTES));
  // Level index entries are (byteOffset, byteLength, uncompressedByteLength) u64 triples.
  const levels: Rgb9e5CubeLevel[] = [];
  const bytesPerFace = (size: number) => size * size * 4;
  for (let level = 0; level < levelCount; level += 1) {
    const entry = indexOffset + level * 24;
    if (entry + 24 > bytes.byteLength) throw new Rgb9e5CubeError("ENV_KTX2_TRUNCATED", `level index ${level}`);
    const byteOffset = Number(view.getBigUint64(entry, true));
    const byteLength = Number(view.getBigUint64(entry + 8, true));
    const faceSize = pixelWidth >> level;
    if (faceSize < 1) throw new Rgb9e5CubeError("ENV_KTX2_LEVELS", `level ${level} size ${faceSize}`);
    const expected = bytesPerFace(faceSize) * 6;
    if (byteLength !== expected) {
      throw new Rgb9e5CubeError("ENV_KTX2_LEVELSIZE", `level ${level}: ${byteLength} != ${expected}`);
    }
    if (byteOffset + byteLength > bytes.byteLength) throw new Rgb9e5CubeError("ENV_KTX2_TRUNCATED", `level ${level} data`);
    const faces: Float32Array[] = [];
    const packed: Uint32Array[] = [];
    for (let face = 0; face < 6; face += 1) {
      const faceStart = byteOffset + face * bytesPerFace(faceSize);
      const words = new Uint32Array(faceSize * faceSize);
      const floats = new Float32Array(faceSize * faceSize * 4);
      for (let i = 0; i < faceSize * faceSize; i += 1) {
        const word = view.getUint32(faceStart + i * 4, true);
        words[i] = word;
        const [r, g, b] = unpackRgb9e5(word);
        floats[i * 4] = r;
        floats[i * 4 + 1] = g;
        floats[i * 4 + 2] = b;
        floats[i * 4 + 3] = 1;
      }
      faces.push(floats);
      packed.push(words);
    }
    levels.push({ faceSize, faces, packed });
  }
  return { faceSize: pixelWidth, levelCount, levels };
}

/** shared-exponent decode: v = mantissa · 2^(E − 15 − 9), mantissa / 512. */
export function unpackRgb9e5(word: number): [number, number, number] {
  const r = word & 0x1ff;
  const g = (word >>> 9) & 0x1ff;
  const b = (word >>> 18) & 0x1ff;
  const e = (word >>> 27) & 0x1f;
  if (e === 0) return [0, 0, 0];
  const scale = Math.pow(2, e - 24);
  return [r * scale, g * scale, b * scale];
}

/** shared-exponent encode (max channel in the shared exponent; round-to-nearest mantissas). */
export function packRgb9e5(r: number, g: number, b: number): number {
  const maxC = Math.max(r, g, b);
  if (!(maxC > 0) || !Number.isFinite(maxC)) return 0;
  const e = Math.max(-16, Math.min(16, Math.ceil(Math.log2(maxC))));
  const scale = Math.pow(2, e - 9);
  const clamp = (v: number) => Math.max(0, Math.min(511, Math.round(v / scale)));
  return ((e + 16) << 27) | (clamp(b) << 18) | (clamp(g) << 9) | clamp(r);
}

function align4(v: number): number { return (v + 3) & ~3; }
