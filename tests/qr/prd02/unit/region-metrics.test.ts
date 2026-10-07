/**
 * Unit tests for tests/qr/prd02/metrics/regionMetrics.ts — synthetic buffers
 * with analytic answers (PRD-02 §15 unit lane).
 */
import { describe, expect, it } from "vitest";
import {
  channelRatio,
  clippingFraction,
  coverage,
  diffPixelRatio,
  edgeDensity,
  hfEnergy,
  lumaAt,
  lumaRange,
  maskIoU,
  meanFrameDiff,
  meanLuma,
  shadowDrop,
  shadowMask,
  stdLuma,
  type MaskBuffer,
  type PixelBuffer
} from "../metrics/regionMetrics";

function solid(width: number, height: number, rgba: readonly [number, number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = rgba[0];
    data[index * 4 + 1] = rgba[1];
    data[index * 4 + 2] = rgba[2];
    data[index * 4 + 3] = rgba[3];
  }
  return { width, height, data };
}

function box(width: number, height: number, x0: number, y0: number, x1: number, y1: number): MaskBuffer {
  const mask = new Uint8Array(width * height);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) mask[y * width + x] = 255;
  }
  return mask;
}

const W = 64;
const H = 64;
const FULL = box(W, H, 0, 0, W, H);

describe("regionMetrics primitives", () => {
  it("lumaAt uses Rec.601 weights", () => {
    const px = solid(1, 1, [255, 0, 0, 255]);
    expect(lumaAt(px.data, 0)).toBeCloseTo(76.245, 2);
  });

  it("meanLuma/stdLuma honor the mask", () => {
    const img = solid(W, H, [100, 100, 100, 255]);
    const half = box(W, H, 0, 0, W, 4);
    for (let index = 0; index < W * 4; index += 1) {
      img.data[index * 4] = 200; img.data[index * 4 + 1] = 200; img.data[index * 4 + 2] = 200;
    }
    expect(meanLuma(img, half)).toBeCloseTo(200, 5);
    expect(stdLuma(img, half)).toBeCloseTo(0, 5);
    // 4 of 64 rows at 200 vs rest at 100: std = sqrt(585.9) ≈ 24.2
    expect(stdLuma(img, FULL)).toBeGreaterThan(20);
  });

  it("shadowDrop matches the analytic ratio", () => {
    // receiver mask covers the whole frame; off=200 luma, on=150 luma -> 25% drop
    const off = solid(W, H, [200, 200, 200, 255]);
    const on = solid(W, H, [150, 150, 150, 255]);
    expect(shadowDrop(on, off, FULL)).toBeCloseTo(0.25, 3);
    // lit-is-brighter clamps at 0
    expect(shadowDrop(off, on, FULL)).toBe(0);
  });

  it("shadowMask + maskIoU recover a known overlap", () => {
    // off: bright; on: left half darkened -> shadow mask = left half
    const off = solid(W, H, [220, 220, 220, 255]);
    const on = solid(W, H, [220, 220, 220, 255]);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W / 2; x += 1) {
        const index = (y * W + x) * 4;
        on.data[index] = 120; on.data[index + 1] = 120; on.data[index + 2] = 120;
      }
    }
    const mask = shadowMask(on, off);
    const left = box(W, H, 0, 0, W / 2, H);
    expect(maskIoU(mask, left)).toBeCloseTo(1, 5);
    // IoU of half-overlapping masks = 1/3
    const a = box(W, H, 0, 0, 32, 32);
    const b = box(W, H, 16, 0, 48, 32);
    expect(maskIoU(a, b)).toBeCloseTo(16 / 48, 3);
  });

  it("coverage counts shadowed pixels inside a region", () => {
    const shadow = box(W, H, 0, 0, 16, 64);
    const region = box(W, H, 0, 0, 64, 64);
    expect(coverage(shadow, region)).toBeCloseTo(0.25, 5);
  });

  it("edgeDensity detects an edge, hfEnergy is zero on flats", () => {
    const img = solid(W, H, [60, 60, 60, 255]);
    for (let y = 0; y < H; y += 1) {
      for (let x = W / 2; x < W; x += 1) {
        const index = (y * W + x) * 4;
        img.data[index] = 220; img.data[index + 1] = 220; img.data[index + 2] = 220;
      }
    }
    expect(edgeDensity(img, FULL, 40)).toBeGreaterThan(0);
    expect(hfEnergy(solid(W, H, [128, 128, 128, 255]), FULL)).toBeLessThan(1e-6);
    expect(hfEnergy(img, FULL)).toBeGreaterThan(0);
  });

  it("lumaRange spans the min-max inside the mask", () => {
    const img = solid(W, H, [50, 50, 50, 255]);
    img.data[0] = 250; img.data[1] = 250; img.data[2] = 250;
    const { range } = lumaRange(img, FULL);
    expect(range).toBeCloseTo(250 - 50, 3);
  });

  it("clippingFraction counts near-white pixels", () => {
    const img = solid(W, H, [255, 255, 255, 255]);
    for (let index = W * H / 2; index < W * H; index += 1) {
      img.data[index * 4] = 100; img.data[index * 4 + 1] = 100; img.data[index * 4 + 2] = 100;
    }
    expect(clippingFraction(img, FULL)).toBeCloseTo(0.5, 2);
  });

  it("channelRatio is blue-over-red in the masked region", () => {
    const img = solid(W, H, [100, 50, 200, 255]);
    expect(channelRatio(img, FULL, 2, 0)).toBeCloseTo(2.0, 5);
  });

  it("diffPixelRatio counts changed pixels only inside the mask", () => {
    const a = solid(W, H, [200, 200, 200, 255]);
    const b = solid(W, H, [200, 200, 200, 255]);
    for (let index = 0; index < W; index += 1) {
      b.data[index * 4] = 40; b.data[index * 4 + 1] = 40; b.data[index * 4 + 2] = 40;
    }
    const topRow = box(W, H, 0, 0, W, 1);
    expect(diffPixelRatio(a, b, topRow)).toBeCloseTo(1, 5);
    const rest = box(W, H, 0, 1, W, H);
    expect(diffPixelRatio(a, b, rest)).toBe(0);
  });

  it("meanFrameDiff is 0 for identical frames and positive for changes", () => {
    const a = solid(8, 8, [100, 100, 100, 255]);
    const b = solid(8, 8, [140, 140, 140, 255]);
    const mask = new Uint8Array(64).fill(255);
    expect(meanFrameDiff([a, a], mask)).toBe(0);
    expect(meanFrameDiff([a, b], mask)).toBeCloseTo(40, 3);
    expect(meanFrameDiff([a], mask)).toBe(0);
  });
});
