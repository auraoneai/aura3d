// PRD-07 / PRD-10 Q-07-2 — gradient bands: additive emission bands on
// gradientFrame/gradientEvaluate (aurora, city glow), capped at 4.

import { describe, expect, it } from "vitest";
import { gradientEvaluate, gradientFrame, SKY_BAND_CAPACITY } from "../../../../packages/rendering/src/atmosphere/GradientSky";

const spec = (bands: { elevationDeg: number; widthDeg: number; color: string | readonly number[]; intensity: number }[]) =>
  ({
    model: "gradient" as const,
    zenith: [0.05, 0.07, 0.2],
    horizon: [0.4, 0.5, 0.6],
    bands
  });

describe("gradient bands (Q-07-2)", () => {
  it("a band brightens its elevation and fades away from it", () => {
    const frame = gradientFrame(spec([{ elevationDeg: 25, widthDeg: 8, color: "#00ff88", intensity: 1.5 }]));
    const elev = (deg: number) => [0, Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)] as const;
    const at25 = gradientEvaluate(frame, [...elev(25)]);
    const at70 = gradientEvaluate(frame, [...elev(70)]);
    // green channel of the band color dominates near its elevation
    expect(at25[1]).toBeGreaterThan(at70[1] + 0.2);
    const plain = gradientEvaluate(gradientFrame(spec([])), [...elev(25)]);
    expect(at25[1]).toBeGreaterThan(plain[1]);
  });

  it("bands cap at SKY_BAND_CAPACITY and zero-intensity adds nothing", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ elevationDeg: i * 10, widthDeg: 5, color: "#ffffff", intensity: 1 }));
    expect(gradientFrame(spec(six)).bands).toHaveLength(SKY_BAND_CAPACITY);
    const zero = gradientFrame(spec([{ elevationDeg: 30, widthDeg: 10, color: "#ff0000", intensity: 0 }]));
    const none = gradientFrame(spec([]));
    const dir = [0, Math.sin((30 * Math.PI) / 180), Math.cos((30 * Math.PI) / 180)];
    expect(gradientEvaluate(zero, [...dir])).toEqual(gradientEvaluate(none, [...dir]));
  });

  it("numeric band colors pass through; hex parses srgb->linear", () => {
    const f = gradientFrame(spec([{ elevationDeg: 0, widthDeg: 20, color: [0.5, 0.25, 1], intensity: 1 }]));
    expect(f.bands[0].color).toEqual([0.5, 0.25, 1]);
    const hex = gradientFrame(spec([{ elevationDeg: 0, widthDeg: 20, color: "#ffffff", intensity: 1 }]));
    expect(hex.bands[0].color[0]).toBeCloseTo(1, 2);
  });
});
