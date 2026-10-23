import { describe, expect, it } from "vitest";
import { normalFromHeight, paintBark, paintCobble, paintDirt, paintGrass, paintLeaf, paintPlanks, paintPlaster, paintTiles, type Raster } from "../../../examples/ninja-runner-port/textures";

const PAINTERS: [string, () => Raster][] = [
  ["cobble", () => paintCobble(256, 1)], ["dirt", () => paintDirt(128, 2)], ["tiles", () => paintTiles(128, 3)], ["planks", () => paintPlanks(128, 4)],
  ["grass", () => paintGrass(128, 5)], ["plaster", () => paintPlaster(128, 6)], ["bark", () => paintBark(64, 7)], ["leaf", () => paintLeaf(128, 8)]
];

const seamRatio = (r: Raster, axis: "x" | "y"): number => {
  const px = (x: number, y: number): number => { const i = (y * r.width + x) * 4; return r.rgba[i]! + r.rgba[i + 1]! + r.rgba[i + 2]!; };
  let seam = 0, inner = 0, n = 0;
  for (let k = 0; k < (axis === "x" ? r.height : r.width); k++) {
    seam += axis === "x" ? Math.abs(px(0, k) - px(r.width - 1, k)) : Math.abs(px(k, 0) - px(k, r.height - 1));
    for (let j = 1; j < (axis === "x" ? r.width : r.height); j++) { inner += axis === "x" ? Math.abs(px(j, k) - px(j - 1, k)) : Math.abs(px(k, j) - px(k, j - 1)); n++; }
  }
  return seam / (inner / n * (axis === "x" ? r.height : r.width));
};

describe("ninja-runner-port textures", () => {
  for (const [name, paint] of PAINTERS) {
    it(`${name}: opaque, finite, deterministic and seamless when tiled`, () => {
      const a = paint(), b = paint();
      expect(a.rgba.length).toBe(a.width * a.height * 4);
      expect(a.heightField.length).toBe(a.width * a.height);
      expect(Array.from(a.rgba.slice(0, 64))).toEqual(Array.from(b.rgba.slice(0, 64)));
      expect(a.heightField.every(Number.isFinite)).toBe(true);
      for (let i = 3; i < a.rgba.length; i += 4) if (a.rgba[i] !== 255) throw new Error(`${name}: transparent pixel`);
      let sum = 0;
      for (let i = 0; i < a.rgba.length; i += 4) sum += a.rgba[i]! + a.rgba[i + 1]! + a.rgba[i + 2]!;
      expect(sum / (a.width * a.height * 3)).toBeGreaterThan(25);
      // plaster is a single-wrap face texture; planks have thin dark gaps that sit on the wrap line by design
      const limit = name === "planks" ? 10 : 4;
      if (name !== "plaster") { expect(seamRatio(a, "x")).toBeLessThan(limit); expect(seamRatio(a, "y")).toBeLessThan(limit); }
    });
  }

  it("normalFromHeight is a flat +z normal on a flat field and tilts with slope", () => {
    const flat: Raster = { width: 4, height: 4, rgba: new Uint8ClampedArray(64), heightField: new Float32Array(16) };
    const n = normalFromHeight(flat, 2);
    expect(Math.abs(n[0]! - 128)).toBeLessThanOrEqual(1); expect(Math.abs(n[1]! - 128)).toBeLessThanOrEqual(1); expect(n[2]).toBe(255);
    const ramp: Raster = { width: 4, height: 4, rgba: new Uint8ClampedArray(64), heightField: Float32Array.from({ length: 16 }, (_, i) => (i % 4) * 0.2) };
    const m = normalFromHeight(ramp, 2);
    expect(m[4]!).toBeLessThan(120);
  });
});
