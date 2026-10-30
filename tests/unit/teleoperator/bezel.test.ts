import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAM_LABELS, bezelState, feedClock } from "../../../apps/showcase-teleoperator/src/bezel";

const html = readFileSync(new URL("../../../apps/showcase-teleoperator/index.html", import.meta.url), "utf8");

const lin = (c: number): number => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]: readonly number[]): number => 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
const contrast = (a: readonly number[], b: readonly number[]): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
/** `fg` over `bg` at `alpha`, composited on `under` (worst case: a white sky behind the panel). */
const over = (bg: readonly number[], alpha: number, under: readonly number[]): number[] => bg.map((c, i) => c * alpha + under[i]! * (1 - alpha));

describe("grid dispatch GD-18 operator-console bezel", () => {
  it("labels the four cameras and runs a feed clock from each sky's time of day", () => {
    expect(bezelState({ camMode: 2, sky: "golden", simSeconds: 75.4, motionOk: true }).cam).toBe(`CAM 3 · ${CAM_LABELS[2]}`);
    expect(feedClock("golden", 75.4)).toBe("19:43:15");
    expect(feedClock("night", 3600)).toBe("00:18:00");
    expect(bezelState({ camMode: 0, sky: "fog", simSeconds: 0, motionOk: true }).bars).toBe(3);
  });

  it("the REC dot blinks at 1 Hz and stays lit on reduced motion", () => {
    expect(bezelState({ camMode: 0, sky: "noon", simSeconds: 10.2, motionOk: true }).rec).toBe(true);
    expect(bezelState({ camMode: 0, sky: "noon", simSeconds: 10.7, motionOk: true }).rec).toBe(false);
    expect(bezelState({ camMode: 0, sky: "noon", simSeconds: 10.7, motionOk: false }).rec).toBe(true);
  });

  it("mounts the bezel, keeps it out of the rival tags' way and turns warnings amber", () => {
    for (const id of ["opBezel", "bzStrip", "bzRec", "bzCam", "bzClock", "bzBars"]) expect(html).toContain(`id="${id}"`);
    expect(html).not.toContain("#wrongWay { background: rgba(255, 58, 58");
    expect(html).toMatch(/#wrongWay \{ background: rgba\(255, 179, 71/);
    expect(readFileSync(new URL("../../../apps/showcase-teleoperator/src/main.ts", import.meta.url), "utf8")).toContain('"bzStrip"]');
  });

  it("bezel and warning text meet 4.5:1 even over a white sky", () => {
    const strip = over([6, 10, 16], 0.72, [255, 255, 255]);
    expect(contrast([0xeb, 0xf2, 0xf6], strip)).toBeGreaterThanOrEqual(4.5);
    expect(contrast([0x12, 0x0c, 0x03], over([255, 179, 71], 0.92, [255, 255, 255]))).toBeGreaterThanOrEqual(4.5);
  });
});
