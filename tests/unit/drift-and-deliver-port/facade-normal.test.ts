import { describe, expect, it } from "vitest";
import { heightField, heightToNormal } from "../../../examples/drift-and-deliver-port/facadeNormal";

describe("gridlock courier facade normal canvas (GU47 WP-28 GC-M2)", () => {
  it("is flat (128, 128, 255) on a flat wall", () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(200);
    const n = heightToNormal(heightField(rgba, 4, 4));
    expect([n[0], n[1], n[2], n[3]]).toEqual([128, 128, 255, 255]);
  });

  it("tilts the normal away from a brighter neighbour (recessed dark windows)", () => {
    const w = 8, h = 8;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = x < 4 ? 40 : 220; // dark window left, stucco right
      rgba.set([v, v, v, 255], 4 * (y * w + x));
    }
    const n = heightToNormal(heightField(rgba, w, h));
    // at x = 3 the height rises to the right: the normal leans to -x
    expect(n[4 * (2 * w + 3)]!).toBeLessThan(128);
    // rows are uniform: no y tilt
    expect(n[4 * (2 * w + 3) + 1]!).toBe(128);
  });

  it("downsamples by the step", () => {
    const f = heightField(new Uint8ClampedArray(16 * 16 * 4).fill(255), 16, 16, 2);
    expect([f.w, f.h]).toEqual([8, 8]);
    expect(f.data[0]).toBeCloseTo(1, 6);
  });
});
