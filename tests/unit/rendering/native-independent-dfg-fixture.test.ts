import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DFG_LUT_RG16F,
  generateDfgLut,
  integrateGgxDfg
} from "../../../packages/rendering/src/program/DFGLutData";
import {
  decodeNativeDfgFloat16,
  nativeDfgLutRg16f,
  nativeDfgLutRg32f,
  NATIVE_DFG_LUT_SAMPLES,
  NATIVE_DFG_LUT_SHA256,
  NATIVE_DFG_LUT_SIZE,
  sampleNativeDfgLut
} from "../../qr/prd04/oracles/native-dfg-lut";

/** Portable word serialization: low byte first, independent of host order. */
function digest(words: Uint16Array): string {
  const bytes = new Uint8Array(words.length * 2);
  const view = new DataView(bytes.buffer);
  words.forEach((word, index) => view.setUint16(index * 2, word, true));
  return createHash("sha256").update(bytes).digest("hex");
}

/** A separate arithmetic decoder for finite nonnegative fixture words. */
function referenceHalf(bits: number): number {
  const power = Math.floor(bits / 1024);
  const fraction = bits % 1024;
  return power === 0 ? fraction / 2 ** 24 : (1 + fraction / 1024) * 2 ** (power - 15);
}

/**
 * Uniform-solid-angle integration over reflected directions, using an
 * equal-area spherical spiral. This does not sample GGX half-vectors or use
 * the generator's low-discrepancy sequence or overshoot normalization.
 */
function hemisphereIntegral(roughness: number, nv: number): readonly [number, number] {
  const count = 16384;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const alphaSquared = roughness ** 4;
  const viewX = Math.sqrt(1 - nv * nv);
  const viewRoot = Math.sqrt(alphaSquared + (1 - alphaSquared) * nv * nv);
  let red = 0, green = 0;
  for (let i = 0; i < count; i += 1) {
    const nl = (i + 0.5) / count;
    const radial = Math.sqrt(1 - nl * nl);
    const lx = radial * Math.cos(i * goldenAngle);
    const ly = radial * Math.sin(i * goldenAngle);
    const inverseHalfLength = 1 / Math.hypot(viewX + lx, ly, nv + nl);
    const nh = (nv + nl) * inverseHalfLength;
    const vh = (viewX * (viewX + lx) + nv * (nv + nl)) * inverseHalfLength;
    const denominator = 1 + (alphaSquared - 1) * nh * nh;
    const distribution = alphaSquared / (Math.PI * denominator * denominator);
    const lightRoot = Math.sqrt(alphaSquared + (1 - alphaSquared) * nl * nl);
    const masking = 2 * nl * nv / (nl * viewRoot + nv * lightRoot);
    const fresnelWeight = (1 - vh) ** 5;
    const contribution = distribution * masking / (4 * nv);
    red += contribution * (1 - fresnelWeight);
    green += contribution * fresnelWeight;
  }
  const solidAngle = 2 * Math.PI / count;
  return [red * solidAngle, green * solidAngle];
}

describe("Aura3D independent native DFG fixture", () => {
  it("reproduces the generator, native RG words and endian-defined digest", () => {
    expect(NATIVE_DFG_LUT_SIZE).toBe(16);
    expect(NATIVE_DFG_LUT_SAMPLES).toBe(4096);
    const words = nativeDfgLutRg16f();
    expect(words).toHaveLength(16 * 16 * 2);
    expect(words).toEqual(DFG_LUT_RG16F);
    const regenerated = generateDfgLut();
    expect(regenerated).toEqual(words);
    expect(digest(words)).toBe(NATIVE_DFG_LUT_SHA256);
    expect(digest(regenerated)).toBe(NATIVE_DFG_LUT_SHA256);
  });

  it("decodes binary16 normals, subnormals, signs and special values", () => {
    const cases: readonly (readonly [number, number])[] = [
      [0x0000, 0], [0x8000, -0], [0x0001, 2 ** -24],
      [0x03ff, 2 ** -14 - 2 ** -24], [0x0400, 2 ** -14],
      [0x3c00, 1], [0xbc00, -1], [0x7bff, 65504],
      [0x7c00, Infinity], [0xfc00, -Infinity]
    ];
    for (const [bits, value] of cases) expect(decodeNativeDfgFloat16(bits)).toBe(value);
    expect(Number.isNaN(decodeNativeDfgFloat16(0x7e00))).toBe(true);
    for (const invalid of [-1, 0x10000, 1.5, NaN, Infinity]) {
      expect(() => decodeNativeDfgFloat16(invalid)).toThrow(RangeError);
    }
    const words = nativeDfgLutRg16f();
    const floats = nativeDfgLutRg32f();
    for (let index = 0; index < words.length; index += 2) {
      const red = referenceHalf(words[index]!);
      const green = referenceHalf(words[index + 1]!);
      expect(floats[index]).toBe(red);
      expect(floats[index + 1]).toBe(green);
      expect(Number.isFinite(red) && Number.isFinite(green)).toBe(true);
      expect(red).toBeGreaterThanOrEqual(0);
      expect(green).toBeGreaterThanOrEqual(0);
      expect(red + green).toBeLessThanOrEqual(1.001);
    }
  });

  it("returns independently owned buffers and keeps its sampling snapshot private", () => {
    const words = nativeDfgLutRg16f();
    const floats = nativeDfgLutRg32f();
    const original = sampleNativeDfgLut(0, 0);
    const sourceWord = DFG_LUT_RG16F[0];
    words[0] = 0;
    floats[0] = 0;
    expect(DFG_LUT_RG16F[0]).toBe(sourceWord);
    expect(nativeDfgLutRg16f()[0]).toBe(sourceWord);
    expect(nativeDfgLutRg32f()[0]).toBe(original[0]);
    expect(sampleNativeDfgLut(0, 0)).toEqual(original);
  });

  it("keeps roughness on X, N·V on Y, and A and B in their respective channels", () => {
    // These asymmetric centers distinguish transposition as well as RG swaps.
    const size = NATIVE_DFG_LUT_SIZE;
    expect(sampleNativeDfgLut(2.5 / size, 11.5 / size)).toEqual([0.99755859375, 0.0019369125366210938]);
    expect(sampleNativeDfgLut(11.5 / size, 2.5 / size)).toEqual([0.765625, 0.046844482421875]);
  });

  it("uses four independently decoded texels with bilinear weights", () => {
    const words = nativeDfgLutRg16f();
    const texel = (x: number, y: number, channel: number): number =>
      referenceHalf(words[2 * (y * 16 + x) + channel]!);
    // Fractional texel coordinates (3.25, 9.75): x weights 3/4, 1/4;
    // y weights 1/4, 3/4. Each channel is evaluated separately.
    const expected = [0, 1].map(channel =>
      3 / 16 * texel(3, 9, channel) + 1 / 16 * texel(4, 9, channel)
      + 9 / 16 * texel(3, 10, channel) + 3 / 16 * texel(4, 10, channel));
    const actual = sampleNativeDfgLut(3.75 / 16, 10.25 / 16);
    expect(actual[0]).toBeCloseTo(expected[0]!, 14);
    expect(actual[1]).toBeCloseTo(expected[1]!, 14);
  });

  it("clamps each axis to its own edge while retaining interpolation on the other", () => {
    const edge = 0.5 / NATIVE_DFG_LUT_SIZE;
    const top = 1 - edge;
    const middle = 6.75 / NATIVE_DFG_LUT_SIZE;
    expect(sampleNativeDfgLut(-4, middle)).toEqual(sampleNativeDfgLut(edge, middle));
    expect(sampleNativeDfgLut(4, middle)).toEqual(sampleNativeDfgLut(top, middle));
    expect(sampleNativeDfgLut(middle, -4)).toEqual(sampleNativeDfgLut(middle, edge));
    expect(sampleNativeDfgLut(middle, 4)).toEqual(sampleNativeDfgLut(middle, top));
    expect(sampleNativeDfgLut(-4, 4)).toEqual(sampleNativeDfgLut(edge, top));
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(() => sampleNativeDfgLut(value, 0.5)).toThrow(RangeError);
      expect(() => sampleNativeDfgLut(0.5, value)).toThrow(RangeError);
    }
  });

  it("matches smooth Fresnel and fully rough normal-incidence limits", () => {
    for (const row of [0, 2, 8, 14, 15]) {
      const nv = (row + 0.5) / NATIVE_DFG_LUT_SIZE;
      const fc = (1 - nv) ** 5;
      const actual = sampleNativeDfgLut(0, nv);
      // The first LUT column is at roughness 1/32, not exactly zero.
      expect(Math.abs(actual[0] - (1 - fc))).toBeLessThan(0.002);
      expect(Math.abs(actual[1] - fc)).toBeLessThan(0.002);
      expect(integrateGgxDfg(0, nv)).toEqual([1 - fc, fc]);
    }
    const [red, green] = integrateGgxDfg(1, 1);
    expect(red + green).toBeCloseTo(1 - Math.log(2), 3);
  });

  it("agrees with independent reflected-hemisphere integration at asymmetric texels", () => {
    for (const [x, y] of [[6, 4], [11, 2], [12, 2], [4, 12], [2, 11]] as const) {
      const roughness = (x + 0.5) / NATIVE_DFG_LUT_SIZE;
      const nv = (y + 0.5) / NATIVE_DFG_LUT_SIZE;
      const actual = sampleNativeDfgLut(roughness, nv);
      const expected = hemisphereIntegral(roughness, nv);
      // Includes binary16 quantization and the generator's finite quadrature.
      expect(Math.abs(actual[0] - expected[0])).toBeLessThan(0.003);
      expect(Math.abs(actual[1] - expected[1])).toBeLessThan(0.003);
    }
  });
});
