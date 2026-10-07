/**
 * PRD-02 §7.1 — RGB9E5 cube decoder for baked environment probes.
 * Reads a KTX2 container holding an uncompressed VK_FORMAT_E5B9G9R9_UFLOAT_PACK32
 * cube (6 faces, square, mip chain) into per-level Float32 RGBA texels.
 */
export const KTX2_MAGIC = new Uint8Array([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
export const VK_FORMAT_E5B9G9R9_UFLOAT_PACK32 = 142;
export const KTX2_HEADER_BYTES = 68;

export type Rgb9e5CubeErrorReason =
  | "ENV_KTX2_TRUNCATED" | "ENV_KTX2_MAGIC" | "ENV_KTX2_FORMAT" | "ENV_KTX2_TYPESIZE"
  | "ENV_KTX2_SUPERCOMPRESSED" | "ENV_KTX2_FACES" | "ENV_KTX2_3D"
  | "ENV_KTX2_LAYERS" | "ENV_KTX2_NONSQUARE" | "ENV_KTX2_LEVELS" | "ENV_KTX2_LEVELSIZE";

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

const align4 = (n: number): number => (n + 3) & ~3;

export function readRgb9e5Cube(bytes: Uint8Array): Rgb9e5Cube {
  if (bytes.byteLength < KTX2_HEADER_BYTES) throw new Rgb9e5CubeError("ENV_KTX2_TRUNCATED", `need ${KTX2_HEADER_BYTES} header bytes, got ${bytes.byteLength}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < 12; i += 1) {
    if (bytes[i] !== KTX2_MAGIC[i]) throw new Rgb9e5CubeError("ENV_KTX2_MAGIC", "bad KTX2 identifier");
  }
  const vkFormat = view.getUint32(12, true);
  if (vkFormat !== VK_FORMAT_E5B9G9R9_UFLOAT_PACK32) throw new Rgb9e5CubeError("ENV_KTX2_FORMAT", `vkFormat ${vkFormat}, expected ${VK_FORMAT_E5B9G9R9_UFLOAT_PACK32}`);
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

  const indexOff = align4(Math.max(KTX2_HEADER_BYTES, dfdOff + dfdLen, kvdOff + kvdLen));
  const indexBytes = levelCount * 24;
  if (bytes.byteLength < indexOff + indexBytes) throw new Rgb9e5CubeError("ENV_KTX2_TRUNCATED", "level index truncated");

  const levels: Float32Array[][] = [];
  for (let level = 0; level < levelCount; level += 1) {
    const levelOffset = Number(view.getBigUint64(indexOff + level * 24, true));
    const levelLength = Number(view.getBigUint64(indexOff + level * 24 + 8, true));
    const size = Math.max(1, pixelWidth >> level);
    const expected = 6 * size * size * 4; // 6 faces × texels × 4-byte RGB9E5
    if (levelLength !== expected) throw new Rgb9e5CubeError("ENV_KTX2_LEVELSIZE", `level ${level}: ${levelLength} bytes, expected ${expected}`);
    if (levelOffset + levelLength > bytes.byteLength) throw new Rgb9e5CubeError("ENV_KTX2_TRUNCATED", `level ${level} data truncated`);
    const levelFaces: Float32Array[] = [];
    const faceBytes = size * size * 4;
    for (let face = 0; face < 6; face += 1) {
      const start = levelOffset + face * faceBytes;
      const packed = new Uint32Array(bytes.buffer, bytes.byteOffset + start, size * size);
      const rgba = new Float32Array(size * size * 4);
      for (let t = 0; t < packed.length; t += 1) {
        const [r, g, b] = unpackRgb9e5(packed[t]!);
        rgba[t * 4] = r; rgba[t * 4 + 1] = g; rgba[t * 4 + 2] = b; rgba[t * 4 + 3] = 1;
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
