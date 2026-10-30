/**
 * GU47 TT-P3: six authored venue LUTs (`tools/gen-luts.mjs` -> `assets/luts/slam-<venue>.cube`), admitted as typed
 * `lut` assets and bound through `effects.colorGrade({ lut })` at mount and `app.post.setEffect("colorGrade", { lut })` on
 * a venue change. Pixels (LUT on/off >= 6 mean dRGB in frame, stands hue) are phase 2; here the LUT itself is measured.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCubeLut } from "../../../packages/aura3d-cli/src/admission/cubeLut";
import { slamLutAssets, venueLutUrl } from "../../../examples/aura-slam/view/assets";
import { postEffects } from "../../../examples/aura-slam/view/lighting";
import { VENUE_LOOKS } from "../../../examples/aura-slam/view/look";
import { venueRuntimePlan } from "../../../examples/aura-slam/view/venueRuntime";
import { VENUE_LUT_RECIPES, gradeColor, venueLutCube } from "../../../examples/aura-slam/tools/gen-luts.mjs";

const VENUES = ["hard", "grass", "clay", "desert", "beach", "moon"] as const;
const SUN_VENUES = ["grass", "clay", "desert", "beach", "moon"] as const;
const lutFile = (venue: string) => resolve(__dirname, `../../../examples/aura-slam/assets/luts/slam-${venue}.cube`);

function hueDeg([r, g, b]: number[]): number {
  const mx = Math.max(r!, g!, b!), mn = Math.min(r!, g!, b!), d = mx - mn;
  if (d < 1e-6) return Number.NaN;
  const h = mx === r ? ((g! - b!) / d) % 6 : mx === g ? (b! - r!) / d + 2 : (r! - g!) / d + 4;
  return (h * 60 + 360) % 360;
}
const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

describe("GU47 TT-P3: venue LUTs", () => {
  it("each committed .cube is the generator's output, passes the lut admission check and matches its asset row", () => {
    for (const venue of VENUES) {
      const text = readFileSync(lutFile(venue), "utf8");
      expect(text, venue).toBe(venueLutCube(venue));
      expect(validateCubeLut(text)).toMatchObject({ size: 17, rows: 17 ** 3 });
      const asset = slamLutAssets[`slam-${venue}`] as unknown as { type: string; hash: string; sizeBytes: number; metadata: { license: string } };
      expect(asset.type).toBe("lut");
      expect(asset.hash).toBe(`sha256-${createHash("sha256").update(text).digest("hex")}`);
      expect(asset.sizeBytes).toBe(Buffer.byteLength(text));
      expect(asset.metadata.license).toBe("CC0-1.0");
    }
  });

  it("every LUT moves a colour grid by >= 6 mean dRGB (0..255) from the identity", () => {
    for (const venue of VENUES) {
      let sum = 0, n = 0;
      for (let r = 0; r <= 1; r += 0.125) for (let g = 0; g <= 1; g += 0.125) for (let b = 0; b <= 1; b += 0.125) {
        const o = gradeColor(VENUE_LUT_RECIPES[venue], r, g, b);
        sum += ((Math.abs(o[0]! - r) + Math.abs(o[1]! - g) + Math.abs(o[2]! - b)) / 3) * 255;
        n += 1;
      }
      expect(sum / n, venue).toBeGreaterThanOrEqual(6);
    }
  });

  it("a light neutral (the stands' concrete) takes a hue >= 25 degrees apart between every pair of sun venues", () => {
    const hues = SUN_VENUES.map((v) => hueDeg(gradeColor(VENUE_LUT_RECIPES[v], 0.75, 0.75, 0.75)));
    for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) {
      expect(hueGap(hues[i]!, hues[j]!), `${SUN_VENUES[i]} vs ${SUN_VENUES[j]}`).toBeGreaterThanOrEqual(25);
    }
  });

  it("the mount grade and the venue-change plan both carry the venue's LUT url", () => {
    for (const venue of VENUES) {
      const url = venueLutUrl(VENUE_LOOKS[venue].grade.lut);
      expect(url, venue).toMatch(new RegExp(`slam-${venue}\\.cube$`));
      // Effect builders serialise to their node (toJSON), as the compiler reads them.
      const grade = (JSON.parse(JSON.stringify(postEffects(venue))) as Record<string, unknown>[]).find((n) => n.effect === "color-grade")!;
      expect(grade.lut).toBe(url);
      expect(grade.lutIntensity).toBe(1);
      expect(venueRuntimePlan(VENUE_LOOKS[venue]).post.grade).toMatchObject({ lut: url, lutIntensity: 1 });
    }
    expect(venueLutUrl(null)).toBeNull();
    expect(venueLutUrl("nope")).toBeNull();
  });
});
