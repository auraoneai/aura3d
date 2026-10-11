// Lane-07 numeric visual checks (tests/qr/prd07/ci/vfx-pixels.mjs): the
// metrics behave on synthetic frames, so a CI verdict means what it says.
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs CI script, no type declarations
import { changedFraction, colourFraction, evaluateScene, stats } from "../ci/vfx-pixels.mjs";

type Img = { w: number; h: number; rgb: Uint8Array };

function frame(w: number, h: number, paint: (x: number, y: number) => [number, number, number]): Img {
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) rgb.set(paint(x, y), (y * w + x) * 3);
  return { w, h, rgb };
}

const W = 64, H = 64;
const flatGrey = frame(W, H, () => [200, 200, 200]);
const dark = frame(W, H, (_x, y) => (y > 40 ? [20, 22, 28] : [5, 6, 10]));
const fountain = frame(W, H, (x, y) => (y > 40 ? [20, 22, 28] : Math.abs(x - 32) < 6 && y > 10 ? [255, 154, 60] : [5, 6, 10]));
const sky = frame(W, H, (_x, y) => (y > 40 ? [40, 50, 30] : [60 + y * 2, 110 + y * 2, 200]));

describe("vfx-pixels metrics", () => {
  it("flags a flat single-colour frame", () => {
    expect(stats(flatGrey).dominantColourFraction).toBe(1);
    const r = evaluateScene("x", flatGrey, dark, {});
    expect(r.checks.find((c: { name: string }) => c.name.startsWith("not-flat"))?.ok).toBe(false);
  });

  it("detects the emitter colour only where it is drawn", () => {
    expect(colourFraction(fountain, "#ff9a3c")).toBeGreaterThan(0.01);
    expect(colourFraction(dark, "#ff9a3c")).toBe(0);
  });

  it("vfx-vs-none change is zero for identical frames", () => {
    expect(changedFraction(dark, dark)).toBe(0);
    expect(changedFraction(fountain, dark)).toBeGreaterThan(0.002);
  });

  it("passes a fountain frame and a gradient sky, fails a missing frame", () => {
    expect(evaluateScene("prd07-particles-fountain", fountain, dark).checks.every((c: { ok: boolean }) => c.ok)).toBe(true);
    expect(evaluateScene("prd07-sky-timeofday", sky, dark).checks.every((c: { ok: boolean }) => c.ok)).toBe(true);
    expect(evaluateScene("prd07-decals", null, dark).checks[0].ok).toBe(false);
  });
});
