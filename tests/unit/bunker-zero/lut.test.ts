import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateCubeLut } from "../../../packages/aura3d-cli/src/admission/cubeLut";
import {
  BZ_CA_PULSE, BZ_LUT_SHA256, BZ_LUT_SIZE, BZ_LUT_SPECS, caPulseLevel, cubeText, gradeColor, lutOfSlot, lutUrlOfSlot
} from "../../../apps/showcase-bunker-zero/src/art/lut";
import { hueDeg, hueDistance } from "../../../apps/showcase-bunker-zero/src/art/look";

const LUTS = path.resolve("apps/showcase-bunker-zero/public/aura-assets/luts");
const MAIN = readFileSync(path.resolve("apps/showcase-bunker-zero/src/main.ts"), "utf8");
const hex = (c: readonly number[]) => `#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
const luma = (c: readonly number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;

describe("Bunker Zero per-floor LUTs (BZ-18)", () => {
  it("ships one valid 17^3 .cube per descent floor, byte-identical to the generator and pinned by sha256", () => {
    expect(BZ_LUT_SPECS.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const spec of BZ_LUT_SPECS) {
      const text = readFileSync(path.join(LUTS, spec.file), "utf8");
      expect(text, spec.file).toBe(cubeText(spec));
      expect(validateCubeLut(text).size, spec.file).toBe(BZ_LUT_SIZE);
      expect(createHash("sha256").update(text).digest("hex"), spec.file).toBe(BZ_LUT_SHA256[spec.file]);
      expect(text.length, spec.file).toBeLessThan(200_000);
    }
    expect(lutOfSlot(6)).toBeNull();
    expect(lutUrlOfSlot(6)).toBe("");
    expect(lutUrlOfSlot(2)).toBe("/aura-assets/luts/bz-f3-forge.cube");
  });

  it("keeps luminance within 6% and pulls neutral greys toward the floor tint", () => {
    for (const spec of BZ_LUT_SPECS) {
      for (const g of [0.15, 0.4, 0.75]) {
        const out = gradeColor([g, g, g], spec);
        expect(Math.abs(luma(out) - g), `${spec.file} ${g}`).toBeLessThan(0.06);
        expect(Math.max(...out) - Math.min(...out), `${spec.file} ${g}`).toBeGreaterThan(0.01);
      }
      expect(gradeColor([0, 0, 0], spec)).toEqual([0, 0, 0]);
    }
    // F3: the highlight tint is forge orange; a lit grey lands within 25 deg of it
    const f3 = BZ_LUT_SPECS[2]!;
    expect(hueDistance(hueDeg(hex(gradeColor([0.75, 0.75, 0.75], f3))), hueDeg(f3.highlights))).toBeLessThan(25);
  });

  it("swaps the LUT per floor through the post surface and offers ?lut=0 for the on/off A/B", () => {
    expect(MAIN).toContain('bootParams.get("lut") !== "0"');
    expect(MAIN).toMatch(/lut: lut \? lutUrlOfSlot\(slot\) : ""/);
  });
});

describe("Bunker Zero chromatic-aberration pulse (BZ-18)", () => {
  it("peaks on a heavy hit, decays to 0 within the pulse and stays off under reduced flash", () => {
    expect(caPulseLevel(0, false)).toBeCloseTo(BZ_CA_PULSE.peak);
    expect(caPulseLevel(BZ_CA_PULSE.seconds / 2, false)).toBeLessThan(BZ_CA_PULSE.peak);
    expect(caPulseLevel(BZ_CA_PULSE.seconds, false)).toBe(0);
    expect(caPulseLevel(-1, false)).toBe(0);
    expect(caPulseLevel(0, true)).toBe(0);
    expect(MAIN).toContain("effects.chromaticAberration({ intensity: 0 })");
    expect(MAIN).toContain("Number(a) >= BZ_CA_PULSE.minDamage");
  });
});
