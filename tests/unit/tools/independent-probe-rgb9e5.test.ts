import { describe, expect, it } from "vitest";
import { encodeProbeSH9, encodeRgb9e5Faces, packRgb9e5 } from "../../../tools/independent-probe-baker/rgb9e5.js";

describe("independent RGB9E5 packing", () => {
  it("packs black and the minimum positive mantissa in the documented channel positions", () => {
    const minPositive = 2 ** -24;
    expect(packRgb9e5(0, 0, 0)).toBe(0x00000000);
    expect(packRgb9e5(-0, 0, 0)).toBe(0x00000000);
    expect(packRgb9e5(minPositive, 0, 0)).toBe(0x00000001);
    expect(packRgb9e5(0, minPositive, 0)).toBe(0x00000200);
    expect(packRgb9e5(0, 0, minPositive)).toBe(0x00040000);
  });

  it("encodes one and unequal channels with a shared exponent", () => {
    // Shared exponent 16 has a mantissa step of 2^-8. Thus [1,1,1]
    // has three mantissas of 256, and [1,1/2,1/4] has [256,128,64].
    expect(packRgb9e5(1, 1, 1)).toBe(0x84020100);
    expect(packRgb9e5(1, 0, 0)).toBe(0x80000100);
    expect(packRgb9e5(1, 0.5, 0.25)).toBe(0x81010100);
  });

  it("preserves the maximum representable components as an unsigned word", () => {
    expect(packRgb9e5(65_408, 65_408, 65_408)).toBe(0xffffffff);
    expect(packRgb9e5(65_408, 0, 0)).toBe(0xf80001ff);
  });

  it("rounds exact halfway values to an even mantissa", () => {
    // Green fixes the shared exponent at 16; the red mantissa lies halfway
    // between 128/129 and 129/130 respectively.
    expect(packRgb9e5(128.5 / 256, 1, 0)).toBe(0x80020080);
    expect(packRgb9e5(129.5 / 256, 1, 0)).toBe(0x80020082);

    // Also check both even and odd halfway mantissas at the minimum exponent.
    const halfStep = 2 ** -25;
    expect(packRgb9e5(halfStep, 0, 0)).toBe(0x00000000);
    expect(packRgb9e5(3 * halfStep, 0, 0)).toBe(0x00000002);
    expect(packRgb9e5(5 * halfStep, 0, 0)).toBe(0x00000002);
    expect(packRgb9e5(7 * halfStep, 0, 0)).toBe(0x00000004);
  });

  it("increments the shared exponent when the largest mantissa rounds to 512", () => {
    expect(packRgb9e5(511.49 / 256, 1, 0)).toBe(0x800201ff);
    // At 511.5/256, ties-to-even gives 512, requiring exponent 17 and
    // re-quantization of both channels to [256,128,0].
    expect(packRgb9e5(511.5 / 256, 1, 0)).toBe(0x88010100);
  });

  it("rejects negative, non-finite, and out-of-range values in every channel", () => {
    for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 65_409]) {
      expect(() => packRgb9e5(invalid, 0, 0)).toThrow();
      expect(() => packRgb9e5(0, invalid, 0)).toThrow();
      expect(() => packRgb9e5(0, 0, invalid)).toThrow();
    }
  });
});

describe("independent probe byte layout", () => {
  it("writes six RGB9E5 faces in face-major little-endian order", () => {
    const smallest = 2 ** -24;
    const faces = [
      new Float32Array([0, 0, 0]),
      new Float32Array([1, 1, 1]),
      new Float32Array([1, 0.5, 0.25]),
      new Float32Array([smallest, 0, 0]),
      new Float32Array([0, smallest, 0]),
      new Float32Array([0, 0, smallest]),
    ];
    const bytes = encodeRgb9e5Faces(faces, 1);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual([
      0x00, 0x00, 0x00, 0x00, // +X: black
      0x00, 0x01, 0x02, 0x84, // -X: [1,1,1] => 0x84020100
      0x00, 0x01, 0x01, 0x81, // +Y: [1,1/2,1/4] => 0x81010100
      0x01, 0x00, 0x00, 0x00, // -Y: minimum red
      0x00, 0x02, 0x00, 0x00, // +Z: minimum green
      0x00, 0x00, 0x04, 0x00, // -Z: minimum blue
    ]);

    // The returned byte storage must not alias a caller-owned pixel array.
    faces[1]![0] = 0;
    expect(Array.from(bytes.slice(4, 8))).toEqual([0x00, 0x01, 0x02, 0x84]);
  });

  it("keeps row-major pixel order inside each face", () => {
    const smallest = 2 ** -24;
    const first = new Float32Array([
      0, 0, 0,
      smallest, 0, 0,
      0, smallest, 0,
      0, 0, smallest,
    ]);
    const faces = [first, ...Array.from({ length: 5 }, () => new Float32Array(12))];
    const bytes = encodeRgb9e5Faces(faces, 2);

    expect(bytes).toHaveLength(6 * 2 * 2 * 4);
    expect(Array.from(bytes.slice(0, 16))).toEqual([
      0x00, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x00, 0x00,
      0x00, 0x02, 0x00, 0x00,
      0x00, 0x00, 0x04, 0x00,
    ]);
    expect(Array.from(bytes.slice(16)).every((value) => value === 0)).toBe(true);
  });

  it("rejects invalid face counts, sizes, sample lengths, and channel values", () => {
    const valid = () => Array.from({ length: 6 }, () => new Float32Array(3));
    expect(() => encodeRgb9e5Faces(valid().slice(0, 5), 1)).toThrow();
    expect(() => encodeRgb9e5Faces([...valid(), new Float32Array(3)], 1)).toThrow();
    expect(() => encodeRgb9e5Faces(valid(), 0)).toThrow();
    expect(() => encodeRgb9e5Faces(valid(), -1)).toThrow();
    expect(() => encodeRgb9e5Faces(valid(), 1.5)).toThrow();
    const shortFace = valid();
    shortFace[5] = new Float32Array(2);
    expect(() => encodeRgb9e5Faces(shortFace, 1)).toThrow();
    const longFace = valid();
    longFace[0] = new Float32Array(4);
    expect(() => encodeRgb9e5Faces(longFace, 1)).toThrow();
    for (const invalid of [-0.1, Number.NaN, Number.POSITIVE_INFINITY, 65_409]) {
      const faces = valid();
      faces[5]![2] = invalid;
      expect(() => encodeRgb9e5Faces(faces, 1)).toThrow();
    }
  });

  it("writes exactly 27 signed float32 coefficients in little-endian order", () => {
    const coefficients = new Float32Array(27);
    coefficients[0] = 1;
    coefficients[1] = -2.5;
    coefficients[2] = 0.5;
    coefficients[3] = -0;
    coefficients[4] = -(2 ** -149);
    coefficients[26] = -1;
    const expected = new Uint8Array(108);
    expected.set([
      0x00, 0x00, 0x80, 0x3f, // +1
      0x00, 0x00, 0x20, 0xc0, // -2.5
      0x00, 0x00, 0x00, 0x3f, // +0.5
      0x00, 0x00, 0x00, 0x80, // -0
      0x01, 0x00, 0x00, 0x80, // smallest negative float32 subnormal
    ]);
    expected.set([0x00, 0x00, 0x80, 0xbf], 26 * 4); // -1

    const bytes = encodeProbeSH9(coefficients);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toEqual(expected);
    coefficients[0] = 0;
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x00, 0x00, 0x80, 0x3f]);
  });

  it("rejects SH arrays of the wrong length or with non-finite coefficients", () => {
    expect(() => encodeProbeSH9(new Float32Array(26))).toThrow();
    expect(() => encodeProbeSH9(new Float32Array(28))).toThrow();
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const coefficients = new Float32Array(27);
      coefficients[26] = invalid;
      expect(() => encodeProbeSH9(coefficients)).toThrow();
    }
  });
});
