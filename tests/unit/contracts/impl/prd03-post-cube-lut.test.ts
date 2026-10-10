import { describe, expect, it } from "vitest";
import { parseCubeLut } from "../../../../packages/rendering/src/post/CubeLut";

/**
 * PRD-03 Phase 2: `parseCubeLut` reads TITLE/LUT_3D_SIZE/DOMAIN_MIN/MAX and comments,
 * returns a size^3 RGBA Float32 texture (red-fastest ordering), and throws
 * on 1-D LUTs and sizes > 65.
 */

/**
 * The teal-orange 33³ fixture is generated here rather than read from
 * `tests/qr/prd03/fixtures/luts/` — `.gitignore` ignores every `fixtures/`
 * directory, so that file never reached the repo and the suite failed with
 * ENOENT in CI. Shadows pull toward teal (0.1, 0.25, 0.55), mids get a warm
 * orange lift, and white maps to white. Same `.cube` text format, including a
 * TITLE and comments, so the parser path is unchanged.
 */
function tealOrangeCube(size: number): string {
  const teal = [0.1, 0.25, 0.55];
  const orange = [0.08, 0.03, -0.06];
  const lines = ['TITLE "teal-orange-33"', "# generated: shadows→teal, mids→orange, white→white", `LUT_3D_SIZE ${size}`];
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rgb = [r, g, b].map((v) => v / (size - 1));
        const luma = 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
        const shadow = (1 - luma) ** 2;
        const mid = 4 * luma * (1 - luma);
        const out = rgb.map((v, i) => Math.min(1, Math.max(0, v + (teal[i]! - v) * shadow + orange[i]! * mid)));
        lines.push(out.map((v) => v.toFixed(6)).join(" "));
      }
    }
  }
  return lines.join("\n");
}

const fixture = tealOrangeCube(33);

describe("post/CubeLut parseCubeLut", () => {
  it("parses a 33^3 .cube fixture into a size*size*size RGBA texture", () => {
    const lut = parseCubeLut(fixture);
    expect(lut.size).toBe(33);
    expect(lut.data.length).toBe(33 * 33 * 33 * 4);
    // LUT(0,0,0): shadow teal — r≈0.1, g≈0.25, b≈0.55.
    expect(lut.data[0]).toBeCloseTo(0.1, 2);
    expect(lut.data[2]).toBeGreaterThan(0.5);
    // LUT(1,1,1): identity-ish white (b=32,g=32,r=32 → last row).
    const last = (32 + 32 * 33 + 32 * 33 * 33) * 4;
    expect(lut.data[last]).toBeCloseTo(1, 4);
    expect(lut.data[last + 3]).toBe(1); // alpha
  });

  it("indexes red-fastest: data[r + g*size + b*size*size]", () => {
    const text = [
      "LUT_3D_SIZE 2",
      "0 0 0", "1 0 0", // r=0,1 | g=0,b=0
      "0 1 0", "1 1 0", // g=1,b=0
      "0 0 1", "1 0 1", // g=0,b=1
      "0 1 1", "1 1 1"
    ].join("\n");
    const lut = parseCubeLut(text);
    expect(lut.size).toBe(2);
    // index r=1,g=0,b=0 → second row = (1,0,0)
    expect([lut.data[4], lut.data[5], lut.data[6]]).toEqual([1, 0, 0]);
    // index r=0,g=0,b=1 → fifth row = (0,0,1)
    const i = (0 + 0 + 1 * 4) * 4;
    expect([lut.data[i], lut.data[i + 1], lut.data[i + 2]]).toEqual([0, 0, 1]);
  });

  it("remaps through DOMAIN_MIN/MAX", () => {
    const text = [
      "LUT_3D_SIZE 2",
      "DOMAIN_MIN 0.2 0.2 0.2",
      "DOMAIN_MAX 0.8 0.8 0.8",
      "0 0 0", "0.6 0.6 0.6",
      "0 0 0", "0.6 0.6 0.6",
      "0 0 0", "0.6 0.6 0.6",
      "0 0 0", "0.6 0.6 0.6"
    ].join("\n");
    const lut = parseCubeLut(text);
    // Raw 0.6 maps back to 1.0 through the domain (0.6 = 0.2 + 0.8·0.5? no:
    // value ∈ domain → normalized (0.6-0.2)/(0.8-0.2) = 0.666…; the parser
    // renormalizes into [0,1] sample space).
    expect(lut.data[4]).toBeCloseTo((0.6 - 0.2) / (0.8 - 0.2), 4);
  });

  it("throws CUBE_LUT_1D_UNSUPPORTED on LUT_1D_SIZE", () => {
    expect(() => parseCubeLut("LUT_1D_SIZE 16\n0 0 0")).toThrowError(/CUBE_LUT_1D_UNSUPPORTED/);
  });

  it("throws CUBE_LUT_SIZE_INVALID on size > 65 and non-integer sizes", () => {
    expect(() => parseCubeLut("LUT_3D_SIZE 128\n" + "0 0 0\n".repeat(1))).toThrowError(/CUBE_LUT_SIZE_INVALID/);
    expect(() => parseCubeLut("LUT_3D_SIZE abc")).toThrowError(/CUBE_LUT_SIZE_INVALID/);
  });

  it("throws CUBE_LUT_MALFORMED on missing size / wrong row count", () => {
    expect(() => parseCubeLut("0 0 0\n1 1 1")).toThrowError(/CUBE_LUT_MALFORMED/);
    expect(() => parseCubeLut("LUT_3D_SIZE 2\n0 0 0")).toThrowError(/CUBE_LUT_MALFORMED/);
  });
});
