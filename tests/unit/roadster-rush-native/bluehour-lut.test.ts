import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCubeLut } from "../../../packages/aura3d-cli/src/admission/cubeLut";
import { parseCubeLut } from "../../../packages/rendering/src/post/CubeLut";
import { APEX_LOOK, APEX_PALETTE, hexToUnit } from "../../../apps/showcase-roadster-rush/src/art/look";
import {
  APEX_LUT_INTENSITY,
  APEX_LUT_SIZE,
  apexBluehourCube,
  apexBluehourGrade,
  apexGradePatch,
  apexToneCurve,
  magentaWeight,
  rgbToHsv
} from "../../../apps/showcase-roadster-rush/src/art/lut";

const CUBE = resolve(__dirname, "../../../apps/showcase-roadster-rush/src/assets/luts/apex-bluehour.cube");
const luma = (c: readonly number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
const hueGap = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

describe("Apex Overdrive apex-bluehour display LUT (GU47 AO-P1)", () => {
  it("the committed .cube is exactly the generator's output and passes the runtime parser and the CLI admission", () => {
    const text = readFileSync(CUBE, "utf8");
    expect(text).toBe(apexBluehourCube());
    const parsed = parseCubeLut(text);
    expect(parsed.size).toBe(APEX_LUT_SIZE);
    expect(parsed.data.length).toBe(APEX_LUT_SIZE ** 3 * 4);
    expect(validateCubeLut(text)).toEqual({ size: APEX_LUT_SIZE, rows: APEX_LUT_SIZE ** 3, title: "apex-bluehour" });
    // red-fastest rows: row 1 is (1/16, 0, 0) graded, the last row is white graded
    const n = APEX_LUT_SIZE - 1;
    const second = apexBluehourGrade([1 / n, 0, 0]);
    expect(parsed.data[4]).toBeCloseTo(second[0], 4);
    const last = (APEX_LUT_SIZE ** 3 - 1) * 4;
    expect(parsed.data[last]).toBeCloseTo(1, 4);
  });

  it("keeps black, mid grey and the grey axis order; sinks the toe and lifts the shoulder", () => {
    expect(apexBluehourGrade([0, 0, 0])).toEqual([0, 0, 0]);
    const mid = apexBluehourGrade([0.5, 0.5, 0.5]);
    for (const v of mid) expect(v).toBeCloseTo(0.5, 3);
    let previous = -1;
    for (let i = 0; i <= 64; i++) {
      const g = i / 64;
      const l = luma(apexBluehourGrade([g, g, g]));
      expect(l).toBeGreaterThanOrEqual(previous);
      previous = l;
    }
    expect(apexToneCurve(0.05)).toBeLessThan(0.05);
    expect(apexToneCurve(0.8)).toBeGreaterThan(0.8);
    expect(luma(apexBluehourGrade([0.05, 0.05, 0.05]))).toBeLessThan(0.05);
    expect(luma(apexBluehourGrade([0.85, 0.85, 0.85]))).toBeGreaterThan(0.85);
  });

  it("splits cobalt shadows from tangerine highlights, and stays within 0.03 of neutral on the grey axis", () => {
    const shadow = apexBluehourGrade([0.12, 0.12, 0.12]);
    expect(shadow[2]).toBeGreaterThan(shadow[0] + 0.01);
    const highlight = apexBluehourGrade([0.85, 0.85, 0.85]);
    expect(highlight[0]).toBeGreaterThan(highlight[2] + 0.01);
    for (let i = 0; i <= 32; i++) {
      const g = i / 32;
      const c = apexBluehourGrade([g, g, g]);
      const l = luma(c);
      for (const v of c) expect(Math.abs(v - l)).toBeLessThanOrEqual(0.03);
    }
  });

  it("mutes magenta toward violet without brightening it, and leaves the identity colours on their hue", () => {
    expect(magentaWeight(315)).toBeCloseTo(1, 6);
    expect(magentaWeight(355)).toBe(0);
    expect(magentaWeight(270)).toBe(0);
    const magenta: [number, number, number] = [1, 66 / 255, 200 / 255];
    const out = apexBluehourGrade(magenta);
    const [h0, s0] = rgbToHsv(magenta);
    const [h1, s1] = rgbToHsv(out);
    expect(h1).toBeLessThan(h0 - 8);
    expect(s1).toBeLessThan(s0 - 0.1);
    expect(Math.abs(luma(out) - luma(magenta))).toBeLessThan(0.05);
    for (const hex of [APEX_PALETTE.cyan, APEX_PALETTE.rival, APEX_PALETTE.tail, APEX_PALETTE.tangerine, APEX_PALETTE.cobalt, APEX_PALETTE.sodium, APEX_PALETTE.bolt]) {
      const c = hexToUnit(hex);
      const graded = apexBluehourGrade(c);
      expect(hueGap(rgbToHsv(graded)[0], rgbToHsv(c)[0])).toBeLessThan(2.5);
      expect(Math.abs(rgbToHsv(graded)[1] - rgbToHsv(c)[1])).toBeLessThan(0.05);
    }
  });

  it("patches the one look grade node with the white balance and the LUT (no LUT field without a URL)", () => {
    const patch = apexGradePatch(APEX_LOOK[2], "/apps/showcase-roadster-rush/src/assets/luts/apex-bluehour.cube");
    expect(patch).toEqual({ temperature: APEX_LOOK[2].grade.temperature, tint: APEX_LOOK[2].grade.tint, lut: "/apps/showcase-roadster-rush/src/assets/luts/apex-bluehour.cube", lutIntensity: APEX_LUT_INTENSITY });
    expect(apexGradePatch(APEX_LOOK[0], null)).toEqual({ temperature: APEX_LOOK[0].grade.temperature, tint: APEX_LOOK[0].grade.tint });
    expect(APEX_LUT_INTENSITY).toBeGreaterThan(0);
    expect(APEX_LUT_INTENSITY).toBeLessThanOrEqual(1);
  });

  it("main.ts sends the patch through app.post.setEffect('colorGrade') and serves the .cube beside the app", () => {
    const main = readFileSync(resolve(__dirname, "../../../apps/showcase-roadster-rush/src/main.ts"), "utf8");
    expect(main).toContain('setEffect?.("colorGrade", apexGradePatch(frame, APEX_LUT_URL))');
    expect(main).toContain('new URL("./assets/luts/apex-bluehour.cube", import.meta.url)');
    // one grade stage: no second colorGrade node next to the look
    expect(main.match(/effects\.colorGrade\(/g) ?? []).toHaveLength(0);
  });
});
