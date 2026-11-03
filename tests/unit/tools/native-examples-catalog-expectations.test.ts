import { describe, expect, it } from "vitest";
import {
  catalogSetErrors,
  compareCatalogRegions,
  compareNumericCatalogRegions,
  type NumericRegion,
  type VisualRegion
} from "../../browser/native-examples-catalog.spec.js";

// Synthetic unit-test pixels exercise the oracle; they are not reference
// captures or evidence that any installed example has rendered successfully.
const WIDTH = 16;
const HEIGHT = 16;
const colors = {
  dark: [12, 12, 12],
  red: [220, 30, 30],
  blue: [30, 30, 220]
} as const;

function image(left: readonly number[], right: readonly number[]): Uint8Array {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      pixels.set(x < WIDTH / 2 ? left : right, (y * WIDTH + x) * 3);
    }
  }
  return pixels;
}

const subjectBand: NumericRegion = {
  label: "subject",
  x: 0,
  y: 0,
  width: WIDTH,
  height: HEIGHT,
  minContrast: 5,
  colors: [{
    name: "red subject",
    red: [200, 240], green: [10, 50], blue: [10, 50],
    minFraction: 0.4, maxFraction: 0.6
  }]
};

const referenceRegion: VisualRegion = {
  label: "subject",
  x: 0,
  y: 0,
  width: WIDTH,
  height: HEIGHT,
  pixelThreshold: 10,
  maxMeanDifference: 5,
  maxChangedRatio: 0.1
};

describe("independent example catalog expectations", () => {
  it("requires every catalog ID exactly once", () => {
    expect(catalogSetErrors(["template:a", "capability-example:b"], ["capability-example:b", "template:a"])).toEqual([]);
    expect(catalogSetErrors(["template:a", "capability-example:b"], ["template:a", "other"])).toEqual([
      "missing capability-example:b", "unexpected other"
    ]);
    expect(catalogSetErrors(["template:a", "template:a"], ["template:a", "template:a"])).toEqual([
      "duplicate required catalog ID", "duplicate observed catalog ID"
    ]);
    expect(catalogSetErrors([], [])).toContain("empty required catalog");
  });

  it("requires both a varied image and the specified subject colors", () => {
    const good = compareNumericCatalogRegions(image(colors.red, colors.dark), WIDTH, HEIGHT, [subjectBand])[0]!;
    expect(good.pass).toBe(true);
    expect(good.colors[0]?.fraction).toBe(0.5);
    expect(compareNumericCatalogRegions(image(colors.dark, colors.dark), WIDTH, HEIGHT, [subjectBand])[0]?.pass).toBe(false);
    // Contrast alone cannot make an unrelated blue object pass the red band.
    const wrongSubject = compareNumericCatalogRegions(image(colors.blue, colors.dark), WIDTH, HEIGHT, [subjectBand])[0]!;
    expect(wrongSubject.contrast).toBeGreaterThanOrEqual(subjectBand.minContrast);
    expect(wrongSubject.colors[0]?.fraction).toBe(0);
    expect(wrongSubject.pass).toBe(false);
  });

  it("rejects invalid or unbounded numeric regions before comparing pixels", () => {
    const pixels = image(colors.red, colors.dark);
    const compare = (region: NumericRegion) => compareNumericCatalogRegions(pixels, WIDTH, HEIGHT, [region]);
    expect(() => compareNumericCatalogRegions(pixels, WIDTH, HEIGHT, [])).toThrow(/subject region/);
    expect(() => compareNumericCatalogRegions(pixels.subarray(1), WIDTH, HEIGHT, [subjectBand])).toThrow(/RGB image/);
    expect(() => compare({ ...subjectBand, x: 1 })).toThrow(/invalid or unbounded/);
    expect(() => compare({ ...subjectBand, width: 15 })).toThrow(/invalid or unbounded/);
    expect(() => compare({ ...subjectBand, minContrast: 4 })).toThrow(/invalid or unbounded/);
    const band = subjectBand.colors[0]!;
    expect(() => compare({ ...subjectBand, colors: [] })).toThrow(/invalid or unbounded/);
    expect(() => compare({ ...subjectBand, colors: [band, band] })).toThrow(/color band/);
    expect(() => compare({ ...subjectBand, colors: [{ ...band, minFraction: 0 }] })).toThrow(/color band/);
    expect(() => compare({ ...subjectBand, colors: [{ ...band, red: [0, 255], green: [0, 255], blue: [0, 255] }] })).toThrow(/color band/);
    expect(() => compare({ ...subjectBand, colors: [{ ...band, red: [240, 200] }] })).toThrow(/color band/);
  });

  it("rejects blank reference images and material changes inside the subject region", () => {
    const baseline = image(colors.red, colors.dark);
    expect(compareCatalogRegions(baseline, baseline, WIDTH, HEIGHT, [referenceRegion])[0]?.pass).toBe(true);
    const blank = image(colors.dark, colors.dark);
    expect(compareCatalogRegions(blank, blank, WIDTH, HEIGHT, [referenceRegion])[0]?.pass).toBe(false);
    expect(compareCatalogRegions(image(colors.blue, colors.dark), baseline, WIDTH, HEIGHT, [referenceRegion])[0]?.pass).toBe(false);
    expect(() => compareCatalogRegions(baseline, baseline, WIDTH, HEIGHT, [{ ...referenceRegion, maxChangedRatio: 0.36 }])).toThrow(/invalid or unbounded/);
    expect(() => compareCatalogRegions(baseline, baseline, WIDTH, HEIGHT, [])).toThrow(/subject region/);
  });
});
