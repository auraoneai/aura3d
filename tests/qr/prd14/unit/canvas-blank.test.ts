/**
 * T1.5 (PRD 14 §14.1) — `canvasBlankCheck`: the real Courier black frame from
 * capture run 37289688772 fails the default limits, and an override above
 * 0.97 is rejected by the validator (schema `maximum: 0.97` + the games.json
 * test asserting every override carries a `reason`).
 */

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canvasBlankCheck } from "@aura3d/game/art";
import { readPngAsRgba } from "./helpers/png";

const FIXTURES = join(fileURLToPath(new URL(".", import.meta.url)), "..", "fixtures");
const DEFAULT_LIMITS = { maxDarkFraction: 0.9, minDistinctColors: 2000 };

function solidFrame(width: number, height: number, rgb: [number, number, number]): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = rgb[0];
    rgba[i * 4 + 1] = rgb[1];
    rgba[i * 4 + 2] = rgb[2];
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

describe("T1.5 canvasBlankCheck", () => {
  it("fails a uniformly black canvas at default limits", () => {
    const rgba = solidFrame(64, 64, [4, 4, 6]);
    const result = canvasBlankCheck(rgba, 64, 64, [], DEFAULT_LIMITS);
    expect(result.pass).toBe(false);
    expect(result.darkFraction).toBe(1);
    expect(result.distinctColors).toBe(1);
  });

  it("fails the real Courier 03-mid black frame (run 37289688772) at default limits", () => {
    const png = readPngAsRgba(join(FIXTURES, "courier-1920-03-mid.png"));
    const result = canvasBlankCheck(png.rgba, png.width, png.height, [], DEFAULT_LIMITS);
    expect(result.darkFraction).toBeGreaterThan(0.97);
    expect(result.pass).toBe(false);
  });

  it("still fails the Courier frame at the maximum allowed override 0.97", () => {
    const png = readPngAsRgba(join(FIXTURES, "courier-1920-03-mid.png"));
    const result = canvasBlankCheck(png.rgba, png.width, png.height, [], { maxDarkFraction: 0.97, minDistinctColors: 1500 });
    expect(result.pass).toBe(false);
  });

  it("passes the real Bank Shot 03-mid frame (run 37289688772) at default limits", () => {
    const png = readPngAsRgba(join(FIXTURES, "bank-shot-1920-03-mid.png"));
    const result = canvasBlankCheck(png.rgba, png.width, png.height, [], DEFAULT_LIMITS);
    expect(result.pass).toBe(true);
  });

  it("excludes HUD-masked pixels from both counts", () => {
    const width = 16;
    const height = 16;
    const rgba = solidFrame(width, height, [0, 0, 0]);
    // Paint a bright 8x8 block in the top-left quadrant.
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const o = (y * width + x) * 4;
        rgba[o] = 200;
        rgba[o + 1] = 200;
        rgba[o + 2] = 200;
        rgba[o + 3] = 255;
      }
    }
    const withoutMask = canvasBlankCheck(rgba, width, height, [], { maxDarkFraction: 0.9, minDistinctColors: 1 });
    expect(withoutMask.darkFraction).toBeCloseTo(0.75, 5);
    const masked = canvasBlankCheck(rgba, width, height, [{ x: 0, y: 0, w: 8, h: 8 }], { maxDarkFraction: 0.9, minDistinctColors: 1 });
    expect(masked.darkFraction).toBe(1);
  });

  it("counts distinct colours only after 5-bit quantisation", () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8ClampedArray(width * height * 4);
    // Two halves 4 apart: same 5-bit bucket (120>>3 === 124>>3 === 15).
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const o = (y * width + x) * 4;
        rgba[o] = x < width / 2 ? 120 : 124;
        rgba[o + 1] = 60;
        rgba[o + 2] = 60;
        rgba[o + 3] = 255;
      }
    }
    const result = canvasBlankCheck(rgba, width, height, [], { maxDarkFraction: 0.9, minDistinctColors: 1 });
    expect(result.distinctColors).toBe(1);
  });
});
