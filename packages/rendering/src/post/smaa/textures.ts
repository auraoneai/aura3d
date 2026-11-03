/**
 * Aura3D-owned lookup data for the bounded morphological antialiasing pass.
 *
 * The area lookup is indexed by two integer distances in [0, 8]. It stores
 * twice the fraction of a one-pixel triangular coverage estimate on the
 * shorter side of the run: 2 * (min(a, b) + 0.5) / (a + b + 1).
 * The search lookup is a linear 8-bit contrast response. Both are generated
 * from these equations; neither contains externally sourced image data.
 *
 * They are encoded as tiny, single-row grayscale PNG data URLs so the existing
 * lazy ImageBitmap upload path can consume them in browsers without a canvas,
 * compression API, Node globals, or a network request.
 */

export const SMAA_MAX_RUN = 8;
export const SMAA_AREA_WIDTH = (SMAA_MAX_RUN + 1) ** 2;
export const SMAA_SEARCH_WIDTH = 256;

/** R8 data, indexed by `negativeDistance + 9 * positiveDistance`. */
export function generateSmaaAreaData(): Uint8Array {
  const data = new Uint8Array(SMAA_AREA_WIDTH);
  for (let positive = 0; positive <= SMAA_MAX_RUN; positive += 1) {
    for (let negative = 0; negative <= SMAA_MAX_RUN; negative += 1) {
      const fraction = 2 * (Math.min(negative, positive) + 0.5) / (negative + positive + 1);
      data[negative + (SMAA_MAX_RUN + 1) * positive] = Math.round(fraction * 255);
    }
  }
  return data;
}

/** R8 identity response, indexed by an edge's quantized contrast. */
export function generateSmaaSearchData(): Uint8Array {
  return Uint8Array.from({ length: SMAA_SEARCH_WIDTH }, (_, i) => i);
}

function be32(value: number): number[] {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function crc32(bytes: readonly number[]): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, payload: readonly number[]): number[] {
  const content = [...type].map((c) => c.charCodeAt(0)).concat(payload);
  return [...be32(payload.length), ...content, ...be32(crc32(content))];
}

function pngDataUrl(pixels: Uint8Array): string {
  // PNG scanline filter 0 followed by an uncompressed zlib/DEFLATE block.
  const scanline = [0, ...pixels];
  const len = scanline.length;
  let a = 1, b = 0;
  for (const byte of scanline) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  const zlib = [0x78, 0x01, 1, len & 255, len >>> 8, (~len) & 255, ((~len) >>> 8) & 255,
    ...scanline, ...be32((b << 16) | a)];
  const png = [137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk("IHDR", [...be32(pixels.length), ...be32(1), 8, 0, 0, 0, 0]),
    ...chunk("IDAT", zlib), ...chunk("IEND", [])];
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let encoded = "";
  for (let i = 0; i < png.length; i += 3) {
    const first = png[i]!;
    const second = png[i + 1] ?? 0;
    const third = png[i + 2] ?? 0;
    const value = (first << 16) | (second << 8) | third;
    encoded += alphabet.charAt((value >>> 18) & 63) + alphabet.charAt((value >>> 12) & 63);
    encoded += i + 1 < png.length ? alphabet.charAt((value >>> 6) & 63) : "=";
    encoded += i + 2 < png.length ? alphabet.charAt(value & 63) : "=";
  }
  return `data:image/png;base64,${encoded}`;
}

export const SMAA_AREATEX_PNG = pngDataUrl(generateSmaaAreaData());
export const SMAA_SEARCHTEX_PNG = pngDataUrl(generateSmaaSearchData());
