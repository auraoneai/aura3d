import { describe, expect, it } from "vitest";
import { contourSteps } from "../../../../tests/browser/qr-prd03-banding-oracle";

/**
 * 03-S8 oracle validation (#944): the contour-step oracle must fail a
 * 2-LSB-banded gradient and pass dithered and undithered smooth gradients,
 * across gradient directions, spans and with silhouettes in frame. The
 * numbers are recorded on #944.
 */

const W = 320, H = 192;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

type Kind = "undithered" | "dithered" | "banded2";
type Field = (x: number, y: number) => number;

function render(field: Field, kind: Kind, seed = 7, silhouettes = false): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = field(x, y);
      // Two dark pillars (silhouettes) cutting the gradient.
      if (silhouettes && ((x > 90 && x < 110) || (x > 220 && x < 236))) v = 2;
      const q = kind === "dithered" ? Math.round(v + r() + r() - 1) : kind === "undithered" ? Math.round(v) : 2 * Math.round(v / 2);
      out[y * W + x] = Math.max(0, Math.min(255, q));
    }
  }
  return out;
}

const FIELDS: Record<string, Field> = {
  "horizontal 28 LSB": (x) => 4 + (28 * x) / W,
  "horizontal 60 LSB": (x) => 4 + (60 * x) / W,
  "vertical fog exp": (_x, y) => 6 + 40 * (1 - Math.exp(-y / 90)),
  "radial lantern": (x, y) => 6 + 50 * Math.exp(-(((x - 200) ** 2 + (y - 80) ** 2) / (2 * 70 ** 2)))
};

describe("03-S8 contour-step oracle discriminates banding", () => {
  for (const [name, field] of Object.entries(FIELDS)) {
    for (const silhouettes of [false, true]) {
      const label = `${name}${silhouettes ? " + silhouettes" : ""}`;
      it(`${label}: smooth undithered and dithered pass, 2-LSB banded fails`, () => {
        const und = contourSteps(render(field, "undithered", 7, silhouettes), W, H);
        const dit = contourSteps(render(field, "dithered", 7, silhouettes), W, H);
        const ban = contourSteps(render(field, "banded2", 7, silhouettes), W, H);
        console.log(`[oracle] ${label} undithered=${und.contourFraction.toFixed(4)} (max ${und.maxResidualStep.toFixed(2)}) dithered=${dit.contourFraction.toFixed(4)} (max ${dit.maxResidualStep.toFixed(2)}) banded2=${ban.contourFraction.toFixed(4)} (max ${ban.maxResidualStep.toFixed(2)}) mask=${und.maskPixels}`);
        expect(und.maskPixels).toBeGreaterThan(1000);
        expect(und.contourFraction).toBeLessThan(0.005);
        expect(dit.contourFraction).toBeLessThan(0.005);
        expect(ban.contourFraction).toBeGreaterThan(0.005);
      });
    }
  }
});
