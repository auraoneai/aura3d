import { Color, ColorManagement, SRGBColorSpace } from "three";
import { describe, expect, it } from "vitest";
import {
  PBR_REFERENCE_MIN_ROUGHNESS,
  pbrDistributionGgx,
  pbrGeometrySmithGgxCorrelated,
  pbrLinearToSrgbChannel,
} from "../../../packages/rendering/src/PbrReference";

/**
 * Q1 deviation evidence (muse3jsparity-PRD).
 *
 * Q1.1: exact sRGB OETF vs three r185 ColorManagement (external oracle).
 * Q1.2: roughness-floor audit vs three's D_GGX/V_GGX_SmithCorrelated
 *       (quoted from the installed r185 sources): adopt-or-justify.
 * Q1.3 unit side + Q1.5 transmission diagnostic are covered by the existing
 * suites (cited, not re-asserted); browser proofs are blocked (no
 * Playwright browsers in this environment).
 */

// three r185 lights_physical_pars_fragment.glsl.js, quoted verbatim:
//   float a2 = pow2( alpha );
//   float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
//   return RECIPROCAL_PI * a2 / pow2( denom );
// with alpha = roughness^2 (Disney reparameterization), no floor.
function threeDistributionGgx(alpha: number, dotNH: number): number {
  const a2 = alpha * alpha;
  const denom = dotNH * dotNH * (a2 - 1) + 1;
  return a2 / (Math.PI * denom * denom);
}

// three r185 V_GGX_SmithCorrelated, quoted verbatim:
//   float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
//   float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
//   return 0.5 / max( gv + gl, EPSILON );
function threeSmithCorrelated(alpha: number, dotNL: number, dotNV: number): number {
  const a2 = alpha * alpha;
  const gv = dotNL * Math.sqrt(a2 + (1 - a2) * dotNV * dotNV);
  const gl = dotNV * Math.sqrt(a2 + (1 - a2) * dotNL * dotNL);
  return 0.5 / Math.max(gv + gl, 1e-6);
}

describe("Q1.1 exact sRGB OETF vs three r185", () => {
  it("matches the exact sRGB spec across a 0-255 sweep (three agrees to its own precision)", () => {
    // Independent oracle: the sRGB spec transfer function, implemented
    // inline (not copied from the mirror under test).
    const specOetf = (c: number): number =>
      c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    ColorManagement.enabled = true;
    let maxSpecDelta = 0;
    let maxThreeDelta = 0;
    for (let step = 0; step <= 255; step += 1) {
      const linear = step / 255;
      const ours = pbrLinearToSrgbChannel(linear);
      maxSpecDelta = Math.max(maxSpecDelta, Math.abs(ours - specOetf(linear)));
      const three = ColorManagement.workingToColorSpace(new Color(linear, linear, linear), SRGBColorSpace).r;
      maxThreeDelta = Math.max(maxThreeDelta, Math.abs(ours - three));
    }
    expect(maxSpecDelta).toBeLessThan(1e-12);
    // three r185 evaluates Math.pow(c, 0.41666) — a truncated 1/2.4 — so it
    // trails the exact spec by up to ~4e-6. Our 1/2.4 (float64) is the more
    // exact of the two; the bound below pins three-agreement to three's own
    // precision, not ours.
    expect(maxThreeDelta).toBeLessThan(1e-5);
    // Gamma-2.2 lifts deep shadows measurably: at the linear-segment
    // boundary the exact OETF returns 0.04045 while gamma-2.2 gives ~0.073.
    const gamma22 = Math.pow(0.0031308, 1 / 2.2);
    expect(Math.abs(pbrLinearToSrgbChannel(0.0031308) - gamma22)).toBeGreaterThan(0.02);
  });

  it("applies the exact OETF in all five output programs", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const library = readFileSync(join(here, "..", "..", "..", "packages", "rendering", "src", "ShaderLibrary.ts"), "utf8");
    const core = readFileSync(join(here, "..", "..", "..", "packages", "rendering", "src", "ShaderLibraryCore.ts"), "utf8");
    const combined = `${library}\n${core}`;
    // Six encode sites (5 ShaderLibrary programs + ShaderLibraryCore).
    expect(combined.match(/a3d\w*PbrEncodeOutput\(vec3 linearColor\)/g)!.length).toBeGreaterThanOrEqual(6);
    expect(combined).not.toContain("1.0 / 2.2");
    expect(combined).not.toContain("1/2.2");
    expect(combined.match(/1\.055 \* pow\(clamped, vec3\(1\.0 \/ 2\.4\)\)/g)!.length).toBeGreaterThanOrEqual(6);
  });
});

describe("Q1.2 roughness-floor audit vs three r185", () => {
  it("matches three's GGX exactly wherever floor and epsilon guards do not bind", () => {
    // Off-peak angles never touch the EPSILON denominator guard, so the
    // floor is the only possible delta — and it binds only below 0.045.
    for (const roughness of [0.045, 0.06, 0.1, 0.25, 0.5, 0.8, 1]) {
      for (const nDotH of [0.2, 0.5, 0.9]) {
        const alpha = roughness * roughness;
        expect(pbrDistributionGgx(nDotH, roughness)).toBeCloseTo(threeDistributionGgx(alpha, nDotH), 10);
      }
    }
    // At the mirror peak the EPSILON guard binds for small roughness on our
    // side (same guard exists in the GLSL); above r = 0.2 it does not.
    for (const roughness of [0.25, 0.5, 1]) {
      const alpha = roughness * roughness;
      expect(pbrDistributionGgx(1, roughness)).toBeCloseTo(threeDistributionGgx(alpha, 1), 8);
    }
    for (const roughness of [0.045, 0.1, 0.5, 1]) {
      const alpha = roughness * roughness;
      expect(pbrGeometrySmithGgxCorrelated(0.7, 0.6, roughness)).toBeCloseTo(
        threeSmithCorrelated(alpha, 0.6, 0.7),
        8
      );
    }
  });

  it("justifies keeping the 0.045 floor: three's form is singular at roughness 0", () => {
    expect(PBR_REFERENCE_MIN_ROUGHNESS).toBe(0.045);
    // Ours stays finite at the mirror singularity (roughness 0, nDotH 1):
    // the floor holds alpha at 0.045^2 and the EPSILON denominator guard
    // (shared with the GLSL) caps the peak.
    expect(Number.isFinite(pbrDistributionGgx(1, 0))).toBe(true);
    // Three's unfloored form divides by zero there: denom = 1*(0-1)+1 = 0.
    const threeAtZero = threeDistributionGgx(0, 1);
    expect(Number.isFinite(threeAtZero)).toBe(false);
    // Decision (recorded): KEEP the floor. It binds only roughness < 0.045
    // (a 4.5%-of-range highlight-narrowing band), provably matches three
    // everywhere else, and avoids the mirror singularity three accepts.
  });
});
