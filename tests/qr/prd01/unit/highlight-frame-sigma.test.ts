/**
 * 01-S9 metric: `highlightFrameSigma` (PRD-01 §15 `prd01-specular-aa`:
 * temporal luminance variance in highlight regions, frame-to-frame σ).
 */

import { describe, expect, it } from "vitest";
import { highlightFrameSigma } from "../metrics/temporalSigma";
import type { ImageLike } from "../metrics/maskIoU";

function frame(lumas: readonly number[]): ImageLike {
  const data = new Uint8ClampedArray(lumas.length * 4);
  lumas.forEach((l, i) => data.set([l, l, l, 255], i * 4));
  return { data, width: lumas.length, height: 1 };
}

describe("highlightFrameSigma", () => {
  it("is 0 for a still strip and counts only pixels whose peak reaches the threshold", () => {
    const still = [frame([200, 10]), frame([200, 10]), frame([200, 10])];
    expect(highlightFrameSigma(still, 96)).toEqual({ sigma: 0, highlightPixels: 1, frames: 3, threshold: 96 });
  });

  it("is the RMS of consecutive-frame deltas over the highlight pixels", () => {
    // pixel 0 sparkles 0 <-> 200 (deltas 200, 200); pixel 1 never reaches 96 (excluded).
    const sparkle = [frame([0, 50]), frame([200, 60]), frame([0, 50])];
    const r = highlightFrameSigma(sparkle, 96);
    expect(r.highlightPixels).toBe(1);
    expect(r.sigma).toBeCloseTo(200, 6);
  });

  it("a slowly brightening highlight scores far below a sparkling one", () => {
    const ramp = Array.from({ length: 8 }, (_, t) => frame([100 + t * 5]));
    const blink = Array.from({ length: 8 }, (_, t) => frame([t % 2 === 0 ? 100 : 135]));
    expect(highlightFrameSigma(ramp).sigma).toBeCloseTo(5, 6);
    expect(highlightFrameSigma(blink).sigma).toBeCloseTo(35, 6);
  });

  it("returns 0 with fewer than two frames", () => {
    expect(highlightFrameSigma([frame([255])]).sigma).toBe(0);
  });
});
