import { describe, expect, it } from "vitest";
import { packRgb9e5, readRgb9e5Cube, unpackRgb9e5, Rgb9e5CubeError, KTX2_MAGIC, KTX2_HEADER_BYTES } from "@aura3d/rendering/lanes";

/** Minimal valid KTX2 container for a faceSize-F RGB9E5 cube with L levels. */
function makeKtx2(faceSize: number, levels: number): { bytes: Uint8Array; texels: [number, number, number][] } {
  const dfdLen = 0, kvdLen = 0;
  const indexOff = KTX2_HEADER_BYTES + dfdLen + kvdLen; // already multiple of 4
  const levelIndex = indexOff;
  let dataOff = levelIndex + levels * 24;
  const sizes = Array.from({ length: levels }, (_, i) => Math.max(1, faceSize >> i));
  const total = sizes.reduce((s, f) => s + 6 * f * f * 4, 0);
  const bytes = new Uint8Array(dataOff + total);
  bytes.set(KTX2_MAGIC, 0);
  const v = new DataView(bytes.buffer);
  v.setUint32(12, 142, true);   // VK_FORMAT_E5B9G9R9_UFLOAT_PACK32
  v.setUint32(16, 4, true);     // typeSize
  v.setUint32(20, faceSize, true);
  v.setUint32(24, faceSize, true);
  v.setUint32(28, 0, true);     // depth
  v.setUint32(32, 0, true);     // layers
  v.setUint32(36, 6, true);     // faces
  v.setUint32(40, levels, true);
  v.setUint32(44, 0, true);     // supercompression
  v.setUint32(48, KTX2_HEADER_BYTES, true); v.setUint32(52, 0, true); // dfd
  v.setUint32(56, KTX2_HEADER_BYTES, true); v.setUint32(60, 0, true); // kvd
  const texels: [number, number, number][] = [];
  let off = dataOff;
  const uv = new DataView(bytes.buffer);
  for (let l = 0; l < levels; l += 1) {
    const f = sizes[l]!;
    const levelBytes = 6 * f * f * 4;
    v.setBigUint64(levelIndex + l * 24, BigInt(off), true);
    v.setBigUint64(levelIndex + l * 24 + 8, BigInt(levelBytes), true);
    v.setBigUint64(levelIndex + l * 24 + 16, BigInt(levelBytes), true);
    for (let t = 0; t < 6 * f * f; t += 1) {
      const rgb: [number, number, number] = [1 + l * 0.5, 0.5, 0.25];
      texels.push(rgb);
      uv.setUint32(off + t * 4, packRgb9e5(...rgb), true);
    }
    off += levelBytes;
  }
  return { bytes, texels };
}

describe("prd02 Rgb9e5Cube (PRD-02 §7.1)", () => {
  it("pack/unpack round-trips within RGB9E5 precision (1/256)", () => {
    for (const [r, g, b] of [[1, 0.5, 0.25], [0.001, 0.002, 0.003], [100, 50, 25], [0.1, 0.1, 0.1]] as const) {
      const [dr, dg, db] = unpackRgb9e5(packRgb9e5(r, g, b));
      expect(Math.abs(dr - r) / r).toBeLessThan(1 / 256 + 1e-3);
      expect(Math.abs(dg - g) / g).toBeLessThan(1 / 256 + 1e-3);
      expect(Math.abs(db - b) / b).toBeLessThan(1 / 256 + 1e-3);
    }
  });

  it("reads a synthetic KTX2 cube into per-level faces", () => {
    const { bytes } = makeKtx2(8, 3);
    const cube = readRgb9e5Cube(bytes);
    expect(cube.faceSize).toBe(8);
    expect(cube.mipCount).toBe(3);
    expect(cube.levels[0]).toHaveLength(6);
    expect(cube.levels[0]![0]).toHaveLength(8 * 8 * 4);
    expect(cube.levels[2]![0]).toHaveLength(2 * 2 * 4);
    // level 0 texel ≈ [1, 0.5, 0.25], level 1 ≈ [1.5, .5, .25], level 2 ≈ [2, .5, .25]
    expect(cube.levels[0]![0]![0]).toBeCloseTo(1, 1);
    expect(cube.levels[1]![0]![0]).toBeCloseTo(1.5, 1);
    expect(cube.levels[2]![0]![0]).toBeCloseTo(2, 1);
  });

  it("rejects non-E5B9G9R9 formats, truncation, and non-6-face files", () => {
    const { bytes } = makeKtx2(4, 1);
    expect(() => readRgb9e5Cube(bytes.slice(0, 20))).toThrow(Rgb9e5CubeError);
    const bad = bytes.slice();
    new DataView(bad.buffer).setUint32(12, 131, true);
    expect(() => readRgb9e5Cube(bad)).toThrow(/ENV_KTX2_FORMAT/);
    const faces5 = bytes.slice();
    new DataView(faces5.buffer).setUint32(36, 5, true);
    expect(() => readRgb9e5Cube(faces5)).toThrow(/ENV_KTX2_FACES/);
  });
});
