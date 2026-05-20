import { describe, expect, it } from "vitest";
import { analyzeRgbaFrameVisualMetrics, evaluateFrameVisualQuality } from "../../../packages/rendering/src";

describe("frame visual metrics", () => {
  it("rejects invalid frame buffers at the package boundary", () => {
    expect(() => analyzeRgbaFrameVisualMetrics(new Uint8Array(3), 1, 1)).toThrow(/RGBA pixels/);
    expect(() => analyzeRgbaFrameVisualMetrics(new Uint8Array(4), 0, 1)).toThrow(/positive integer/);
  });

  it("distinguishes a framed detailed subject from a mostly blank frame", () => {
    const detailed = new Uint8Array(64 * 40 * 4);
    fill(detailed, [4, 5, 7, 255]);
    for (let y = 8; y < 32; y += 1) {
      for (let x = 12; x < 52; x += 1) {
        const stripe = (x + y) % 9;
        setPixel(detailed, 64, x, y, [80 + stripe * 12, 40 + (x % 7) * 18, 160 - (y % 6) * 14, 255]);
      }
    }

    const blank = new Uint8Array(64 * 40 * 4);
    fill(blank, [3, 4, 5, 255]);
    for (let y = 4; y < 6; y += 1) {
      for (let x = 4; x < 8; x += 1) {
        setPixel(blank, 64, x, y, [120, 130, 140, 255]);
      }
    }

    const detailedMetrics = analyzeRgbaFrameVisualMetrics(detailed, 64, 40);
    const blankMetrics = analyzeRgbaFrameVisualMetrics(blank, 64, 40);

    expect(detailedMetrics.salientRatio).toBeGreaterThan(0.35);
    expect(detailedMetrics.occupiedAreaRatio).toBeGreaterThan(0.35);
    expect(detailedMetrics.occupiedQuadrants).toBe(4);
    expect(detailedMetrics.colorBuckets).toBeGreaterThan(20);
    expect(detailedMetrics.edgePixelRatio).toBeGreaterThan(0.06);
    expect(detailedMetrics.flatPixelRatio).toBeLessThan(0.78);
    expect(detailedMetrics.localContrastRatio).toBeGreaterThan(0.09);
    expect(blankMetrics.salientRatio).toBeLessThan(0.01);
    expect(blankMetrics.occupiedAreaRatio).toBeLessThan(0.01);
    expect(blankMetrics.occupiedQuadrants).toBe(1);
    expect(blankMetrics.flatPixelRatio).toBeGreaterThan(0.95);
    expect(blankMetrics.localContrastRatio).toBeLessThan(0.02);

    expect(evaluateFrameVisualQuality(detailedMetrics, {
      minSalientRatio: 0.25,
      minOccupiedAreaRatio: 0.25,
      minOccupiedQuadrants: 4,
      minColorBuckets: 16,
      minEdgePixelRatio: 0.04,
      maxDominantBucketRatio: 0.7,
      maxFlatPixelRatio: 0.8,
      minLocalContrastRatio: 0.08
    })).toMatchObject({ ok: true, failures: [] });
    expect(evaluateFrameVisualQuality(blankMetrics, {
      minSalientRatio: 0.25,
      minOccupiedAreaRatio: 0.25,
      minOccupiedQuadrants: 4,
      minColorBuckets: 16,
      minEdgePixelRatio: 0.04,
      maxDominantBucketRatio: 0.7,
      maxFlatPixelRatio: 0.8,
      minLocalContrastRatio: 0.08
    }).failures).toEqual(expect.arrayContaining([
      expect.stringContaining("salientRatio"),
      expect.stringContaining("occupiedAreaRatio"),
      expect.stringContaining("occupiedQuadrants"),
      expect.stringContaining("colorBuckets"),
      expect.stringContaining("edgePixelRatio"),
      expect.stringContaining("dominantBucketRatio"),
      expect.stringContaining("flatPixelRatio"),
      expect.stringContaining("localContrastRatio")
    ]));
  });
});

function fill(pixels: Uint8Array, rgba: readonly [number, number, number, number]): void {
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = rgba[0];
    pixels[index + 1] = rgba[1];
    pixels[index + 2] = rgba[2];
    pixels[index + 3] = rgba[3];
  }
}

function setPixel(pixels: Uint8Array, width: number, x: number, y: number, rgba: readonly [number, number, number, number]): void {
  const index = (y * width + x) * 4;
  pixels[index] = rgba[0];
  pixels[index + 1] = rgba[1];
  pixels[index + 2] = rgba[2];
  pixels[index + 3] = rgba[3];
}
