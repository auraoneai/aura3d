/**
 * Lane-01 unit checks for metrics/shapeMetrics.ts (used by the S3/S10 browser
 * specs): the sphere-faceting circle fit separates a true disc from a 16-gon,
 * the cap tilt estimator inverts the cosine model, and the swatch ΔE finds
 * components and measures color differences.
 */

import { describe, expect, it } from "vitest";
import { capAnalysis, silhouetteCircleFit, swatchDeltaE } from "../metrics/shapeMetrics";
import type { ImageLike } from "../metrics/maskIoU";

const W = 320;
const H = 240;

/** White shape on black with 8×8 supersampled coverage, written as encoded 0..255. */
function raster(inside: (x: number, y: number) => boolean): ImageLike {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < 8; sy += 1) for (let sx = 0; sx < 8; sx += 1) if (inside(x + (sx + 0.5) / 8, y + (sy + 0.5) / 8)) hits += 1;
      const v = Math.round((hits / 64) * 255);
      const o = (y * W + x) * 4;
      data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

function polygonInside(cx: number, cy: number, r: number, sides: number) {
  const apothem = r * Math.cos(Math.PI / sides);
  return (x: number, y: number) => {
    const angle = Math.atan2(y - cy, x - cx);
    const sector = (2 * Math.PI) / sides;
    const local = ((angle % sector) + sector) % sector - sector / 2;
    return Math.hypot(x - cx, y - cy) * Math.cos(local) <= apothem;
  };
}

function solid(value: number, mask: (x: number, y: number) => boolean): ImageLike {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const v = mask(x, y) ? value : 0;
      const o = (y * W + x) * 4;
      data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

const encode = (v: number) => Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);

describe("silhouetteCircleFit", () => {
  it("a smooth disc fits within 0.5 px; a 16-gon does not", () => {
    const disc = silhouetteCircleFit(raster((x, y) => Math.hypot(x - 160.3, y - 119.7) <= 80));
    expect(disc.radius).toBeGreaterThan(78);
    expect(disc.radius).toBeLessThan(82);
    expect(disc.maxDeviationPx).toBeLessThan(0.5);
    const facets = silhouetteCircleFit(raster(polygonInside(160.3, 119.7, 80, 16)));
    expect(facets.maxDeviationPx).toBeGreaterThan(0.5);
  });
});

describe("capAnalysis", () => {
  it("recovers a known cap tilt from tilted-light luma (cosine model)", () => {
    const mask = (x: number, y: number) => x > 100 && x < 220 && y > 80 && y < 160;
    const theta = (6 * Math.PI) / 180; // cap normal tilted 6° about Z, toward +X
    const k = 0.5;
    const lit = (l: readonly [number, number, number]) => {
      const n = [Math.sin(theta), Math.cos(theta), 0];
      return Math.max(0, n[0]! * l[0] + n[1]! * l[1] + n[2]! * l[2]) * k;
    };
    const s = Math.sin(Math.PI / 6);
    const c = Math.cos(Math.PI / 6);
    const img = (l: readonly [number, number, number]) => solid(encode(lit(l)), mask);
    const result = capAnalysis(img([0, 1, 0]), img([s, c, 0]), img([-s, c, 0]), img([0, c, s]), img([0, c, -s]));
    expect(result.capPixels).toBe(119 * 79);
    expect(Math.abs(result.tiltXDeg - 6)).toBeLessThan(0.6);
    expect(Math.abs(result.tiltZDeg)).toBeLessThan(0.3);
    expect(Math.abs(result.normalTiltDeg - 6)).toBeLessThan(0.6);
  });
});

describe("swatchDeltaE", () => {
  it("finds the swatches and reports 0 for identical frames, > 2 for a shifted color", () => {
    const swatches = (shift: number) => {
      const data = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
          const o = (y * W + x) * 4;
          const swatch = y > 60 && y < 180 ? Math.floor(x / 64) : -1;
          const inGap = x % 64 < 8;
          const v = swatch >= 0 && !inGap ? 40 + swatch * 40 : 10;
          data[o] = v + (swatch === 2 && !inGap && y > 60 && y < 180 ? shift : 0); data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
        }
      }
      return { data, width: W, height: H };
    };
    const same = swatchDeltaE(swatches(0), swatches(0), [10, 10, 10]);
    expect(same.swatches).toBe(5);
    expect(same.max).toBe(0);
    const shifted = swatchDeltaE(swatches(20), swatches(0), [10, 10, 10]);
    expect(shifted.swatches).toBe(5);
    expect(shifted.max).toBeGreaterThan(2);
  });
});
