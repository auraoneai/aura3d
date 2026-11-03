import { describe, expect, it } from "vitest";
import { encodeRgb9e5ProbeKTX2, type Rgb9e5ProbeLevel } from "../../../packages/assets/src/exporters/Rgb9e5ProbeKTX2.js";
import { readRgb9e5Cube, Rgb9e5CubeError } from "../../../packages/rendering/src/environment/Rgb9e5Cube.js";
import type { BakedEnvironmentProbe, ProbeCubeFaces } from "../../../tools/independent-probe-baker/index.js";
import { encodeProbeKTX2 } from "../../../tools/independent-probe-baker/ktx2.js";

const KTX2_IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
const COLORS = [
  [0, 0, 0],
  [1, 1, 1],
  [1, 0.5, 0.25],
  [2 ** -24, 0, 0],
  [0, 2 ** -24, 0],
  [0, 0, 2 ** -24],
] as const;
// Independently derived packed words corresponding to COLORS, not a codec roundtrip.
const WORDS = [0x00000000, 0x84020100, 0x81010100, 0x00000001, 0x00000200, 0x00040000] as const;

function faces(size: number, reverse = false): ProbeCubeFaces {
  const result = Array.from({ length: 6 }, (_, face) => {
    const pixels = new Float32Array(size * size * 3);
    for (let pixel = 0; pixel < size * size; pixel += 1) {
      const index = reverse ? 5 - face : (face + pixel) % 6;
      pixels.set(COLORS[index]!, pixel * 3);
    }
    return pixels;
  });
  return result as unknown as ProbeCubeFaces;
}

function probe(): BakedEnvironmentProbe {
  return {
    mips: [
      { size: 2, roughness: 0, faces: faces(2) },
      { size: 1, roughness: 1, faces: faces(1, true) },
    ],
    sh9: new Float32Array(27),
  };
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function uint64(view: DataView, offset: number): number {
  const value = view.getBigUint64(offset, true);
  expect(value).toBeLessThanOrEqual(BigInt(Number.MAX_SAFE_INTEGER));
  return Number(value);
}

describe("independent KTX2 probe encoding", () => {
  it("writes the standard header and mip index followed by exact face-major RGB9E5 data", () => {
    const input = probe();
    const bytes = encodeProbeKTX2(input, { colorPrimaries: "bt709" });
    expect(bytes).toBeInstanceOf(Uint8Array);
    const data = viewOf(bytes);
    expect(Array.from(bytes.slice(0, 12))).toEqual(KTX2_IDENTIFIER);

    expect(data.getUint32(12, true)).toBe(123); // VK_FORMAT_E5B9G9R9_UFLOAT_PACK32
    expect(data.getUint32(16, true)).toBe(4); // packed 32-bit element
    expect(data.getUint32(20, true)).toBe(2);
    expect(data.getUint32(24, true)).toBe(2);
    expect(data.getUint32(28, true)).toBe(0); // no 3D depth
    expect(data.getUint32(32, true)).toBe(0); // not an array texture
    expect(data.getUint32(36, true)).toBe(6);
    expect(data.getUint32(40, true)).toBe(2);
    expect(data.getUint32(44, true)).toBe(0); // no supercompression

    const firstOffset = uint64(data, 80);
    const firstLength = uint64(data, 88);
    const firstUncompressed = uint64(data, 96);
    const secondOffset = uint64(data, 104);
    const secondLength = uint64(data, 112);
    const secondUncompressed = uint64(data, 120);
    expect(firstLength).toBe(2 * 2 * 6 * 4);
    expect(firstUncompressed).toBe(firstLength);
    expect(secondLength).toBe(1 * 1 * 6 * 4);
    expect(secondUncompressed).toBe(secondLength);
    const dfdOffset = data.getUint32(48, true);
    const dfdLength = data.getUint32(52, true);
    for (const [offset, length] of [[firstOffset, firstLength], [secondOffset, secondLength]] as const) {
      expect(offset).toBeGreaterThanOrEqual(80 + 2 * 24);
      expect(offset % 4).toBe(0);
      expect(offset + length).toBeLessThanOrEqual(bytes.length);
      expect(offset + length <= dfdOffset || dfdOffset + dfdLength <= offset).toBe(true);
    }
    expect(firstOffset + firstLength <= secondOffset || secondOffset + secondLength <= firstOffset).toBe(true);

    for (let face = 0; face < 6; face += 1) {
      for (let pixel = 0; pixel < 4; pixel += 1) {
        const offset = firstOffset + (face * 4 + pixel) * 4;
        expect(data.getUint32(offset, true)).toBe(WORDS[(face + pixel) % 6]);
      }
      expect(data.getUint32(secondOffset + face * 4, true)).toBe(WORDS[5 - face]);
    }
    const before = data.getUint32(firstOffset + 4, true);
    input.mips[0]!.faces[0]![3] = 0;
    expect(data.getUint32(firstOffset + 4, true)).toBe(before);
  });

  it("writes the Khronos RGB9E5 descriptor with exact sample records", () => {
    const bytes = encodeProbeKTX2(probe(), { colorPrimaries: "bt709" });
    const data = viewOf(bytes);
    const dfdOffset = data.getUint32(48, true);
    const dfdLength = data.getUint32(52, true);
    expect(dfdLength).toBe(124);
    expect(dfdOffset).toBeGreaterThanOrEqual(80 + 2 * 24);
    expect(dfdOffset + dfdLength).toBeLessThanOrEqual(bytes.length);
    expect(data.getUint32(dfdOffset, true)).toBe(124);

    const descriptor = dfdOffset + 4;
    expect(data.getUint32(descriptor, true)).toBe(0); // Khronos vendor + basic descriptor
    expect(data.getUint16(descriptor + 4, true)).toBe(2);
    expect(data.getUint16(descriptor + 6, true)).toBe(120);
    expect(data.getUint8(descriptor + 8)).toBe(1); // RGBSDA color model
    expect(data.getUint8(descriptor + 9)).toBe(1); // BT.709 primaries
    expect(data.getUint8(descriptor + 10)).toBe(1); // linear transfer
    expect(data.getUint8(descriptor + 11)).toBe(0);
    expect(Array.from(bytes.slice(descriptor + 12, descriptor + 16))).toEqual([0, 0, 0, 0]);
    expect(Array.from(bytes.slice(descriptor + 16, descriptor + 24))).toEqual([4, 0, 0, 0, 0, 0, 0, 0]);

    const offsets = [0, 27, 9, 27, 18, 27];
    const lengths = [8, 4, 8, 4, 8, 4]; // actual bit count minus one
    const channels = [0x00, 0x20, 0x01, 0x21, 0x02, 0x22];
    const lower = [0, 15, 0, 15, 0, 15];
    const upper = [8448, 31, 8448, 31, 8448, 31];
    for (let sample = 0; sample < 6; sample += 1) {
      const offset = descriptor + 24 + sample * 16;
      expect(data.getUint16(offset, true)).toBe(offsets[sample]);
      expect(data.getUint8(offset + 2)).toBe(lengths[sample]);
      expect(data.getUint8(offset + 3)).toBe(channels[sample]);
      expect(Array.from(bytes.slice(offset + 4, offset + 8))).toEqual([0, 0, 0, 0]);
      expect(data.getUint32(offset + 8, true)).toBe(lower[sample]);
      expect(data.getUint32(offset + 12, true)).toBe(upper[sample]);
    }
  });

  it("requires explicit supported primaries and emits the selected DFD value", () => {
    const input = probe();
    const unspecified = viewOf(encodeProbeKTX2(input, { colorPrimaries: "unspecified" }));
    const descriptor = unspecified.getUint32(48, true) + 4;
    expect(unspecified.getUint8(descriptor + 9)).toBe(0);
    expect(() => encodeProbeKTX2(input, {} as { colorPrimaries: "bt709" })).toThrow();
    expect(() => encodeProbeKTX2(input, { colorPrimaries: "unknown" as unknown as "bt709" })).toThrow();
  });

  it("rejects malformed levels, faces, and radiance without producing an artifact", () => {
    const options = { colorPrimaries: "bt709" } as const;
    expect(() => encodeProbeKTX2({ ...probe(), mips: [] }, options)).toThrow();
    const valid = probe();
    expect(() => encodeProbeKTX2({ ...valid, mips: [{ ...valid.mips[0]!, size: 0 }] }, options)).toThrow();
    expect(() => encodeProbeKTX2({ ...valid, mips: [valid.mips[0]!, valid.mips[0]!] }, options)).toThrow();
    const fiveFaces = valid.mips[0]!.faces.slice(0, 5) as unknown as ProbeCubeFaces;
    expect(() => encodeProbeKTX2({ ...valid, mips: [{ ...valid.mips[0]!, faces: fiveFaces }] }, options)).toThrow();
    const shortFaces = [...valid.mips[0]!.faces] as unknown as Float32Array[];
    shortFaces[5] = new Float32Array(11);
    expect(() => encodeProbeKTX2({ ...valid, mips: [{ ...valid.mips[0]!, faces: shortFaces as unknown as ProbeCubeFaces }] }, options)).toThrow();
    for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY, 65_409]) {
      const bad = probe();
      bad.mips[1]!.faces[5]![2] = invalid;
      expect(() => encodeProbeKTX2(bad, options)).toThrow();
    }
  });
});

describe("standard RGB9E5 probe writer and source reader", () => {
  it("decodes BT.709 face colors and mip order from a synthetic encoded probe", () => {
    const bytes = encodeProbeKTX2(probe(), { colorPrimaries: "bt709" });
    const decoded = readRgb9e5Cube(bytes);
    expect(decoded.faceSize).toBe(2);
    expect(decoded.mipCount).toBe(2);
    expect(decoded.levels).toHaveLength(2);

    for (let level = 0; level < 2; level += 1) {
      const pixelCount = level === 0 ? 4 : 1;
      expect(decoded.levels[level]).toHaveLength(6);
      for (let face = 0; face < 6; face += 1) {
        const expected: number[] = [];
        for (let pixel = 0; pixel < pixelCount; pixel += 1) {
          const colorIndex = level === 0 ? (face + pixel) % 6 : 5 - face;
          expected.push(...COLORS[colorIndex]!, 1);
        }
        expect(Array.from(decoded.levels[level]![face]!)).toEqual(expected);
      }
    }
  });

  it("rejects unspecified primaries because the reader has no color-space metadata", () => {
    const bytes = encodeProbeKTX2(probe(), { colorPrimaries: "unspecified" });
    expect(() => readRgb9e5Cube(bytes)).toThrow(Rgb9e5CubeError);
  });
});

describe("shared RGB9E5 KTX2 encoder", () => {
  function rgbaFaces(size: number, reverse = false): Float32Array[] {
    return faces(size, reverse).map((rgb) => {
      const rgba = new Float32Array(size * size * 4);
      for (let pixel = 0; pixel < size * size; pixel += 1) {
        rgba[pixel * 4] = rgb[pixel * 3]!;
        rgba[pixel * 4 + 1] = rgb[pixel * 3 + 1]!;
        rgba[pixel * 4 + 2] = rgb[pixel * 3 + 2]!;
        rgba[pixel * 4 + 3] = 1;
      }
      return rgba;
    });
  }

  function rgbaLevels(): Rgb9e5ProbeLevel[] {
    return [
      { size: 2, channels: 4, faces: rgbaFaces(2) },
      { size: 1, channels: 4, faces: rgbaFaces(1, true) },
    ];
  }

  it("encodes opaque RGBA faces identically to RGB without losing channel or mip order", () => {
    const options = { colorPrimaries: "bt709" } as const;
    const rgba = encodeRgb9e5ProbeKTX2(rgbaLevels(), options);
    const rgb = encodeRgb9e5ProbeKTX2([
      { size: 2, channels: 3, faces: faces(2) },
      { size: 1, channels: 3, faces: faces(1, true) },
    ], options);
    expect(rgba).toBeInstanceOf(Uint8Array);
    expect(rgba).toEqual(rgb);
    const data = viewOf(rgba);
    expect(data.getUint32(12, true)).toBe(123);
    expect(data.getUint32(36, true)).toBe(6);
    expect(data.getUint32(40, true)).toBe(2);
    const firstOffset = uint64(data, 80);
    const secondOffset = uint64(data, 104);
    for (let face = 0; face < 6; face += 1) {
      for (let pixel = 0; pixel < 4; pixel += 1) {
        expect(data.getUint32(firstOffset + (face * 4 + pixel) * 4, true)).toBe(WORDS[(face + pixel) % 6]);
      }
      expect(data.getUint32(secondOffset + face * 4, true)).toBe(WORDS[5 - face]);
    }
  });

  it("rejects unsupported channel counts and incorrect face lengths", () => {
    const options = { colorPrimaries: "bt709" } as const;
    const level = rgbaLevels()[0]!;
    for (const channels of [0, 2, 5, 3.5]) {
      expect(() => encodeRgb9e5ProbeKTX2([{ ...level, channels: channels as unknown as 4 }], options)).toThrow();
    }
    for (const length of [15, 17]) {
      const badFaces = [...level.faces];
      badFaces[5] = new Float32Array(length);
      expect(() => encodeRgb9e5ProbeKTX2([{ ...level, faces: badFaces }], options)).toThrow();
    }
    expect(() => encodeRgb9e5ProbeKTX2([{ ...level, faces: level.faces.slice(0, 5) }], options)).toThrow();
    expect(() => encodeRgb9e5ProbeKTX2([{ ...level, faces: [...level.faces, new Float32Array(16)] }], options)).toThrow();
  });

  it("rejects nonopaque or nonfinite alpha and invalid RGB instead of dropping data", () => {
    const options = { colorPrimaries: "bt709" } as const;
    for (const alpha of [0, 0.5, 1 - 2 ** -24, 1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const level = rgbaLevels()[1]!;
      level.faces[5]![3] = alpha;
      expect(() => encodeRgb9e5ProbeKTX2([level], options)).toThrow();
    }
    for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY, 65_409]) {
      const level = rgbaLevels()[1]!;
      level.faces[5]![2] = invalid;
      expect(() => encodeRgb9e5ProbeKTX2([level], options)).toThrow();
    }
  });
});
