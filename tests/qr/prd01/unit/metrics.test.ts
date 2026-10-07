import { describe, expect, it } from "vitest";
import { coverageMask, maskIoU } from "../metrics/maskIoU";
import { meanAbsDiff, regionSsim } from "../metrics/regionSsim";
import { deltaE2000, regionDeltaE2000Stats, rgbToLab } from "../metrics/deltaE2000";
import { temporalSigma } from "../metrics/temporalSigma";
import type { ImageLike } from "../metrics/maskIoU";

function blank(width: number, height: number, rgb: readonly [number, number, number] = [0, 0, 0]): ImageLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return { data, width, height };
}

function fillRect(img: ImageLike, x0: number, y0: number, w: number, h: number, rgb: readonly [number, number, number]): ImageLike {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const o = (y * img.width + x) * 4;
      img.data[o] = rgb[0];
      img.data[o + 1] = rgb[1];
      img.data[o + 2] = rgb[2];
    }
  }
  return img;
}

describe("maskIoU", () => {
  it("identical covered square gives IoU 1 and centroid delta 0", () => {
    const a = fillRect(blank(64, 64), 10, 10, 20, 20, [255, 255, 255]);
    const b = fillRect(blank(64, 64), 10, 10, 20, 20, [255, 255, 255]);
    const result = maskIoU(a, b);
    expect(result.iou).toBe(1);
    expect(result.centroidDeltaPx).toBe(0);
    expect(result.coverageA).toBeCloseTo(400 / 4096, 3);
  });

  it("offset square reports IoU and centroid shift", () => {
    const a = fillRect(blank(64, 64), 10, 10, 20, 20, [255, 255, 255]);
    const b = fillRect(blank(64, 64), 12, 10, 20, 20, [255, 255, 255]);
    const result = maskIoU(a, b);
    // overlap 18x20, union 22x20 -> 360/440
    expect(result.iou).toBeCloseTo(360 / 440, 3);
    expect(result.centroidDeltaPx).toBeCloseTo(2, 1);
  });

  it("empty vs empty is identical", () => {
    const result = maskIoU(blank(8, 8), blank(8, 8));
    expect(result.iou).toBe(1);
  });

  it("respects a region rect", () => {
    const a = fillRect(blank(64, 64), 40, 40, 16, 16, [255, 0, 0]);
    const b = blank(64, 64);
    const result = maskIoU(a, b, { region: { x: 0, y: 0, w: 0.5, h: 0.5 } });
    expect(result.iou).toBe(1);
    expect(result.coverageA).toBe(0);
  });
});

describe("regionSsim + meanAbsDiff", () => {
  it("identical images score ssim 1 and mad 0", () => {
    const a = fillRect(blank(32, 32), 4, 4, 16, 16, [80, 120, 200]);
    const b = fillRect(blank(32, 32), 4, 4, 16, 16, [80, 120, 200]);
    expect(regionSsim(a, b).ssim).toBe(1);
    expect(meanAbsDiff(a, b).mad).toBe(0);
  });

  it("uniform channel difference reports that difference", () => {
    const a = blank(32, 32, [100, 100, 100]);
    const b = blank(32, 32, [104, 104, 104]);
    expect(meanAbsDiff(a, b).mad).toBeCloseTo(4, 5);
  });
});

describe("deltaE2000", () => {
  it("identical colors are 0", () => {
    expect(deltaE2000([128, 40, 200], [128, 40, 200])).toBe(0);
  });

  it("black vs white is ~100 (the Lab scale's full range)", () => {
    const d = deltaE2000([0, 0, 0], [255, 255, 255]);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(110);
  });

  it("small sRGB deltas stay under 2 — the tonemap gate's order of magnitude", () => {
    expect(deltaE2000([120, 120, 120], [121, 121, 121])).toBeLessThan(2);
  });

  it("region stats aggregate mean/max", () => {
    const a = fillRect(blank(16, 16), 0, 0, 8, 8, [200, 0, 0]);
    const b = fillRect(blank(16, 16), 0, 0, 8, 8, [201, 0, 0]);
    const stats = regionDeltaE2000Stats(a, b, { x: 0, y: 0, w: 0.5, h: 0.5 });
    expect(stats.pixels).toBe(64);
    expect(stats.mean).toBeGreaterThan(0);
    expect(stats.mean).toBeLessThan(2);
  });

  it("rgbToLab maps 18% grey near L=50", () => {
    const lab = rgbToLab([118, 118, 118]);
    expect(lab.l).toBeGreaterThan(45);
    expect(lab.l).toBeLessThan(55);
  });
});

describe("temporalSigma", () => {
  it("constant frames give zero sigma", () => {
    const frame = fillRect(blank(16, 16), 4, 4, 8, 8, [90, 140, 190]);
    const frames = [frame, { ...frame, data: new Uint8ClampedArray(frame.data) }];
    const result = temporalSigma(frames);
    expect(result.meanSigma).toBe(0);
    expect(result.maxSigma).toBe(0);
  });

  it("a flickering pixel gives nonzero sigma", () => {
    const a = blank(8, 8);
    const b = fillRect(blank(8, 8), 3, 3, 1, 1, [200, 200, 200]);
    const result = temporalSigma([a, b]);
    expect(result.maxSigma).toBeGreaterThan(10);
    expect(result.pixels).toBe(64);
  });
});
