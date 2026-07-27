/**
 * Exact lookup tables and integer decompositions that let GPU fragment shaders reproduce the
 * CPU postprocess kernels in `PostProcessPass` byte for byte.
 *
 * Float32 GPU arithmetic cannot be trusted to match the CPU float64 kernels at rounding ties, so
 * every decision that depends on a tie is precomputed here in float64/BigInt and uploaded as data
 * the shader only has to index:
 *
 * - Bloom bright extract: a 1-bit-per-color bitset over all 16,777,216 RGB values.
 * - Bloom composite: a 256x256 table over `(source, blurred)` byte pairs.
 * - Outline blend: a 256-entry table per channel for a fixed color and alpha.
 * - Outline threshold: an exact integer bound so the shader compares integers, never floats.
 *
 * Bloom blur needs no table: `Math.round(sum / kernelSize)` equals integer
 * `(2 * sum + kernelSize) / (2 * kernelSize)`, and every magnitude involved stays below 2^24.
 */

/** Width of the bloom bright-extract bitset texture, in texels. */
export const BLOOM_BRIGHT_LUT_WIDTH = 2048;
/** Height of the bloom bright-extract bitset texture, in texels. */
export const BLOOM_BRIGHT_LUT_HEIGHT = 256;
/** Width and height of the bloom composite lookup texture, in texels. */
export const BLOOM_COMPOSITE_LUT_SIZE = 256;
/** Width of the outline blend lookup texture, in texels. */
export const OUTLINE_BLEND_LUT_WIDTH = 256;

/**
 * Integer luma numerator scale. The CPU kernel computes
 * `(0.2126 * r + 0.7152 * g + 0.0722 * b) / 255`; the shader works with the integer numerator
 * `2126 * r + 7152 * g + 722 * b`, whose full-white value is `OUTLINE_LUMA_SCALE`.
 */
export const OUTLINE_LUMA_SCALE = 10000 * 255;

/** Radix used to carry the outline gradient magnitude across two shader-side uint words. */
export const OUTLINE_LIMB_RADIX = 1 << 24;

const BLOOM_BRIGHT_LUT_BYTES = BLOOM_BRIGHT_LUT_WIDTH * BLOOM_BRIGHT_LUT_HEIGHT * 4;
const RGB_COLOR_COUNT = 1 << 24;

/**
 * Builds the bloom bright-extract bitset for a threshold.
 *
 * Bit `r * 65536 + g * 256 + b` is set when the CPU predicate
 * `(0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 >= threshold` holds. Bits are packed low bit
 * first into bytes, bytes into RGBA texels, texels row major.
 */
export function createBloomBrightThresholdLut(threshold: number): Uint8Array {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error("Bloom threshold must be finite and in [0, 1].");
  }
  const lut = new Uint8Array(BLOOM_BRIGHT_LUT_BYTES);
  for (let red = 0; red < 256; red += 1) {
    const redTerm = 0.2126 * red;
    for (let green = 0; green < 256; green += 1) {
      const greenTerm = 0.7152 * green;
      const base = (red << 16) | (green << 8);
      for (let blue = 0; blue < 256; blue += 1) {
        const luma = (redTerm + greenTerm + 0.0722 * blue) / 255;
        if (luma < threshold) continue;
        const colorIndex = base | blue;
        lut[colorIndex >> 3]! |= 1 << (colorIndex & 7);
      }
    }
  }
  return lut;
}

/** Reads a packed bright-extract bit the same way the shader does. */
export function readBloomBrightThresholdLut(lut: Uint8Array, red: number, green: number, blue: number): boolean {
  if (lut.length !== BLOOM_BRIGHT_LUT_BYTES) {
    throw new Error(`Bloom bright LUT must contain ${BLOOM_BRIGHT_LUT_BYTES} bytes.`);
  }
  const colorIndex = (red << 16) | (green << 8) | blue;
  if (colorIndex < 0 || colorIndex >= RGB_COLOR_COUNT) {
    throw new Error("Bloom bright LUT lookup requires channel bytes in [0, 255].");
  }
  return ((lut[colorIndex >> 3]! >> (colorIndex & 7)) & 1) === 1;
}

/**
 * Builds the bloom composite table for an intensity.
 *
 * Texel `(source, blurred)` stores `clampByte(source + blurred * intensity)` in every color
 * channel. The CPU composite depends on nothing else, so the table is exact by construction.
 */
export function createBloomCompositeLut(intensity: number): Uint8Array {
  if (!Number.isFinite(intensity) || intensity < 0) {
    throw new Error("Bloom intensity must be finite and non-negative.");
  }
  const lut = new Uint8Array(BLOOM_COMPOSITE_LUT_SIZE * BLOOM_COMPOSITE_LUT_SIZE * 4);
  for (let blurred = 0; blurred < BLOOM_COMPOSITE_LUT_SIZE; blurred += 1) {
    const boost = blurred * intensity;
    for (let source = 0; source < BLOOM_COMPOSITE_LUT_SIZE; source += 1) {
      const value = clampByte(source + boost);
      const offset = (blurred * BLOOM_COMPOSITE_LUT_SIZE + source) * 4;
      lut[offset] = value;
      lut[offset + 1] = value;
      lut[offset + 2] = value;
      lut[offset + 3] = 255;
    }
  }
  return lut;
}

/**
 * Builds the outline blend table for a fixed color and combined alpha.
 *
 * Texel `before` stores `clampByte(before * (1 - alpha) + color[channel] * alpha)` for each of
 * the three color channels, so the shader indexes the table once per channel.
 */
export function createOutlineBlendLut(color: readonly [number, number, number, number], alpha: number): Uint8Array {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new Error("Outline blend alpha must be finite and in [0, 1].");
  }
  const lut = new Uint8Array(OUTLINE_BLEND_LUT_WIDTH * 4);
  const inverse = 1 - alpha;
  for (let before = 0; before < OUTLINE_BLEND_LUT_WIDTH; before += 1) {
    const offset = before * 4;
    lut[offset] = clampByte(before * inverse + color[0] * alpha);
    lut[offset + 1] = clampByte(before * inverse + color[1] * alpha);
    lut[offset + 2] = clampByte(before * inverse + color[2] * alpha);
    lut[offset + 3] = 255;
  }
  return lut;
}

/**
 * Exact integer bound for the outline edge predicate.
 *
 * The CPU kernel keeps `hypot(gx, gy) >= threshold` where `gx`/`gy` are float64 Sobel responses
 * over lumas in `[0, 1]`. Scaling by `OUTLINE_LUMA_SCALE` turns those responses into integers, so
 * the predicate becomes `gxNumerator^2 + gyNumerator^2 >= (threshold * OUTLINE_LUMA_SCALE)^2`.
 * Because the left side is a non-negative integer, comparing against the exact ceiling of the
 * right side is equivalent and removes every float from the shader-side decision.
 *
 * The returned bound is split into two base-2^24 words for uint arithmetic in GLSL.
 */
export function createOutlineGradientBound(threshold: number): {
  readonly value: bigint;
  /**
   * `value` as a Number. Exact: the largest possible squared gradient magnitude is
   * `2 * (4 * 2550000)^2 ≈ 2.08e14`, and any bound above that is clamped by the caller's
   * threshold range, so this always stays inside float64's exact-integer range.
   */
  readonly numberValue: number;
  readonly highWord: number;
  readonly lowWord: number;
} {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 4) {
    throw new Error("Outline threshold must be finite and in [0, 4].");
  }
  const { numerator, shift } = exactDyadic(threshold);
  const scaled = numerator * BigInt(OUTLINE_LUMA_SCALE);
  const denominator = 1n << BigInt(2 * shift);
  const value = ceilDivide(scaled * scaled, denominator);
  const radix = BigInt(OUTLINE_LIMB_RADIX);
  const highWord = value / radix;
  if (highWord >= radix) {
    throw new Error("Outline gradient bound exceeds the two-word shader representation.");
  }
  return { value, numberValue: Number(value), highWord: Number(highWord), lowWord: Number(value % radix) };
}

/**
 * Integer luma numerator used by the outline gradient, matching the shader exactly.
 */
export function outlineLumaNumerator(red: number, green: number, blue: number): number {
  return 2126 * red + 7152 * green + 722 * blue;
}

/**
 * Reference implementation of the shader-side outline edge test.
 *
 * Squares each Sobel numerator into base-2^24 words with the same carry sequence the GLSL uses,
 * so a mismatch here is a mismatch on the GPU.
 */
export function outlineEdgeFromNumerators(
  gxNumerator: number,
  gyNumerator: number,
  bound: { readonly highWord: number; readonly lowWord: number }
): boolean {
  const x = squareToWords(Math.abs(gxNumerator));
  const y = squareToWords(Math.abs(gyNumerator));
  let low = x.lowWord + y.lowWord;
  let high = x.highWord + y.highWord;
  if (low >= OUTLINE_LIMB_RADIX) {
    low -= OUTLINE_LIMB_RADIX;
    high += 1;
  }
  if (high !== bound.highWord) return high > bound.highWord;
  return low >= bound.lowWord;
}

function squareToWords(value: number): { readonly highWord: number; readonly lowWord: number } {
  const high = value >>> 12;
  const low = value & 4095;
  const middle = 2 * high * low;
  const middleHigh = Math.floor(middle / 4096);
  const middleLow = middle % 4096;
  let lowWord = low * low + middleLow * 4096;
  let highWord = high * high + middleHigh;
  if (lowWord >= OUTLINE_LIMB_RADIX) {
    highWord += Math.floor(lowWord / OUTLINE_LIMB_RADIX);
    lowWord %= OUTLINE_LIMB_RADIX;
  }
  return { highWord, lowWord };
}

function exactDyadic(value: number): { readonly numerator: bigint; readonly shift: number } {
  let scaled = value;
  let shift = 0;
  while (!Number.isInteger(scaled)) {
    scaled *= 2;
    shift += 1;
    if (shift > 1100) throw new Error("Outline threshold is not a finite dyadic rational.");
  }
  return { numerator: BigInt(scaled), shift };
}

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return quotient * denominator === numerator ? quotient : quotient + 1n;
}

function clampByte(value: number): number {
  return Math.round(Math.max(0, Math.min(255, value)));
}
