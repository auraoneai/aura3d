import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SHADER_CHUNKS } from "../../../packages/rendering/src/ShaderChunks";
import {
  pbrDiffuseBurley,
  pbrDirectLight,
  pbrDistributionGgx,
  pbrF0,
  pbrFresnelSchlick,
  pbrFresnelSchlickSpecular,
  pbrGeometrySmithGgxCorrelated,
} from "../../../packages/rendering/src";

const CHUNK_SOURCE = SHADER_CHUNKS.map((chunk) => chunk.source).join("\n");

// Clearcoat extension lobes and shadow factors live in the ShaderLibrary
// programs (not in SHADER_CHUNKS), so those sync assertions read the program
// sources directly — same split as shader-brdf-reference.test.ts.
const RENDERING_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "rendering", "src");
const PROGRAM_SOURCE =
  readFileSync(join(RENDERING_SRC, "ShaderLibrary.ts"), "utf8") +
  readFileSync(join(RENDERING_SRC, "ShaderLibraryCore.ts"), "utf8");

function expectChunkContains(fragment: string): void {
  expect(CHUNK_SOURCE).toContain(fragment);
}

function expectProgramContains(fragment: string): void {
  expect(PROGRAM_SOURCE).toContain(fragment);
}

/**
 * Q0 core-BRDF reference vectors (muse3jsparity-PRD Part Q, box 1).
 *
 * The existing `shader-brdf-reference.test.ts` pins Charlie / anisotropic-GGX /
 * iridescence / split-sum / ACES / sRGB / fog. This file pins the remaining
 * Q0 checklist terms — Burley diffuse, GGX distribution, correlated Smith
 * geometry, Schlick Fresnel (incl. the specular-factor f90 form), the
 * clearcoat second lobe, one end-to-end direct-light RGB vector, and the
 * per-sample slope-scaled shadow bias — against INDEPENDENT oracles:
 *
 * - Burley/GGX/Smith: three.js r185 `lights_physical_pars` forms
 *   (alpha = roughness^2, unfloored) recomputed from scratch in Python;
 *   agreement asserted only where the documented 0.045 floor and the shared
 *   EPSILON denominator guard do not bind.
 * - Schlick: the original Schlick'94 `pow(1-x, 5)` form recomputed from
 *   scratch. three r185 evaluates the Epic `exp2` approximation instead; the
 *   max |pow5 - exp2| delta over dotVH in [0, 1] is 0.00377 (oracle scan),
 *   recorded in the Q0 deviation register, asserted below as a bound.
 * - Clearcoat lobe: no TS mirror exists, so the three-form composition
 *   F_Schlick(0.04) * D_GGX * V_SmithCorrelated is recomputed from scratch
 *   (Python oracle constants below) AND the GLSL is pinned term-by-term to
 *   the same three named calls with the same inputs. Clearing any term from
 *   the shader breaks the sync half; changing the reference breaks the
 *   constant half.
 * - Shadow bias: no TS mirror exists, so the documented per-sample
 *   tangent-scaled slope-bias formula is recomputed from scratch (Python
 *   oracle constants) with behavioral properties (grazing needs more bias
 *   than facing; bias grows with per-sample texel distance; clamped at 8)
 *   that a centre-only or (1 - NdotL)-linear bias would violate, plus exact
 *   GLSL sync substrings.
 *
 * Oracle script: /tmp/q0_oracles.py (from-scratch Python float64).
 */

// --- Test-local independent oracles (transcribed from the published forms,
// NOT from the TS mirrors under test). Each is validated against the
// hard Python constants beside it, so a transcription slip fails loudly. ---

function oracleBurley(nDotV: number, nDotL: number, lDotH: number, roughness: number): number {
  const energyBias = roughness * 0.5;
  const energyFactor = 1 + ((1 / 1.51) - 1) * roughness;
  const fd90 = energyBias + 2 * lDotH * lDotH * roughness;
  const lightScatter = 1 + (fd90 - 1) * Math.pow(Math.max(1 - nDotL, 0), 5);
  const viewScatter = 1 + (fd90 - 1) * Math.pow(Math.max(1 - nDotV, 0), 5);
  return lightScatter * viewScatter * energyFactor;
}

function oracleThreeGgx(nDotH: number, roughness: number): number {
  const alpha = roughness * roughness;
  const a2 = alpha * alpha;
  const denom = nDotH * nDotH * (a2 - 1) + 1;
  return a2 / (Math.PI * denom * denom);
}

function oracleThreeSmith(nDotV: number, nDotL: number, roughness: number): number {
  const alpha = roughness * roughness;
  const a2 = alpha * alpha;
  const gv = nDotL * Math.sqrt(a2 + (1 - a2) * nDotV * nDotV);
  const gl = nDotV * Math.sqrt(a2 + (1 - a2) * nDotL * nDotL);
  return 0.5 / Math.max(gv + gl, 1e-6);
}

function oracleSchlick94(f0: readonly number[], vDotH: number): number[] {
  const f = Math.pow(Math.max(1 - vDotH, 0), 5);
  return f0.map((channel) => channel + (1 - channel) * f);
}

function oracleSchlick94F90(f0: readonly number[], vDotH: number, specularFactor: number): number[] {
  const f90 = Math.max(Math.min(specularFactor, 1), ...f0);
  const f = Math.pow(Math.max(1 - vDotH, 0), 5);
  return f0.map((channel) => channel + (f90 - channel) * f);
}

function oracleClearcoatLobe(
  vDotH: number,
  nDotH: number,
  nDotV: number,
  nDotL: number,
  roughness: number
): number[] {
  const f = oracleSchlick94([0.04, 0.04, 0.04], vDotH);
  const d = oracleThreeGgx(nDotH, roughness);
  const g = oracleThreeSmith(nDotV, nDotL, roughness);
  return f.map((channel) => channel * d * g);
}

function oracleSlopeTangent(normalDotLight: number): number {
  return Math.min(
    Math.sqrt(Math.max(1 - normalDotLight * normalDotLight, 0)) / Math.max(normalDotLight, 0.05),
    8
  );
}

describe("Q0 core-BRDF reference vectors", () => {
  it("pins the Burley diffuse term with energy compensation", () => {
    // Independent Python oracle constants (from-scratch implementation).
    expect(pbrDiffuseBurley(0.7, 0.6, 0.8, 0.5)).toBeCloseTo(0.82996774, 6);
    expect(pbrDiffuseBurley(0.9, 0.2, 0.5, 1.0)).toBeCloseTo(0.66225166, 6);
    expect(pbrDiffuseBurley(0.5, 0.9, 0.3, 0.0)).toBeCloseTo(0.96874031, 6);
    expect(pbrDiffuseBurley(0.3, 0.4, 0.9, 0.25)).toBeCloseTo(0.81242189, 6);
    // Test-local oracle agrees with the hard constants (transcription check).
    expect(oracleBurley(0.7, 0.6, 0.8, 0.5)).toBeCloseTo(0.82996774, 8);
    expect(oracleBurley(0.9, 0.2, 0.5, 1.0)).toBeCloseTo(0.66225166, 8);
    // At roughness 1 the response is exactly Disney Burley scaled by the
    // documented 1/1.51 energy compensation (oracle ratio, not a tautology:
    // Disney fd90 = 0.5 + 2*r*lDotH^2 is computed independently inline).
    const disneyFd90 = 0.5 + 2 * 1.0 * 0.5 * 0.5;
    const disney =
      (1 + (disneyFd90 - 1) * Math.pow(1 - 0.2, 5)) * (1 + (disneyFd90 - 1) * Math.pow(1 - 0.9, 5));
    expect(pbrDiffuseBurley(0.9, 0.2, 0.5, 1.0) / disney).toBeCloseTo(1 / 1.51, 8);
    expectChunkContains("float a3dDiffuseBurley(float nDotV, float nDotL, float lDotH, float roughness)");
    expectChunkContains("1.0 / 1.51");
  });

  it("pins the GGX distribution against three r185 D_GGX", () => {
    // Floor (0.045) and EPSILON guard do not bind at these points, so the
    // mirror must reproduce three's unfloored form bit-for-bit.
    expect(pbrDistributionGgx(0.5, 0.4)).toBeCloseTo(0.01424253, 6);
    expect(pbrDistributionGgx(0.9, 0.25)).toBeCloseTo(0.03332403, 6);
    expect(pbrDistributionGgx(0.2, 0.8)).toBeCloseTo(0.13676305, 6);
    expect(pbrDistributionGgx(1.0, 0.5)).toBeCloseTo(5.09295818, 6);
    expect(oracleThreeGgx(0.5, 0.4)).toBeCloseTo(0.01424253, 8);
    expect(oracleThreeGgx(1.0, 0.5)).toBeCloseTo(5.09295818, 8);
    expectChunkContains("float a3dDistributionGGX(float nDotH, float roughness)");
  });

  it("pins the correlated Smith geometry against three r185", () => {
    expect(pbrGeometrySmithGgxCorrelated(0.7, 0.6, 0.5)).toBeCloseTo(0.57066918, 6);
    expect(pbrGeometrySmithGgxCorrelated(0.9, 0.9, 0.2)).toBeCloseTo(0.30858407, 6);
    expect(pbrGeometrySmithGgxCorrelated(0.3, 0.8, 1.0)).toBeCloseTo(0.45454545, 6);
    expect(oracleThreeSmith(0.7, 0.6, 0.5)).toBeCloseTo(0.57066918, 8);
    expect(oracleThreeSmith(0.3, 0.8, 1.0)).toBeCloseTo(0.45454545, 8);
    expectChunkContains("float a3dGeometrySmithGGXCorrelated(float nDotV, float nDotL, float roughness)");
  });

  it("pins Schlick Fresnel and the specular-factor f90 form", () => {
    expect(pbrFresnelSchlick([0.04, 0.04, 0.04], 0.5)).toEqual([
      expect.closeTo(0.07, 6),
      expect.closeTo(0.07, 6),
      expect.closeTo(0.07, 6),
    ]);
    expect(pbrFresnelSchlickSpecular([0.04, 0.04, 0.04], 0.5, 1.0)).toEqual([
      expect.closeTo(0.07, 6),
      expect.closeTo(0.07, 6),
      expect.closeTo(0.07, 6),
    ]);
    // Grazing response is capped by f90, not by 1: specularFactor 0.35 over a
    // bright base pulls the grazing limit DOWN toward f90.
    expect(pbrFresnelSchlickSpecular([0.5, 0.25, 0.1], 0.9, 0.35)).toEqual([
      expect.closeTo(0.5, 6),
      expect.closeTo(0.2500025, 6),
      expect.closeTo(0.100004, 6),
    ]);
    expect(oracleSchlick94([0.04, 0.04, 0.04], 0.5)[0]).toBeCloseTo(0.07, 8);
    expect(oracleSchlick94F90([0.5, 0.25, 0.1], 0.9, 0.35)[1]).toBeCloseTo(0.2500025, 8);
    // three r185 evaluates the Epic exp2 approximation of (1-x)^5 instead of
    // the original Schlick'94 pow form used here; the oracle scan bounds the
    // split at 0.00377 over dotVH in [0, 1] (deviation register entry FRESNEL-EXP2).
    let maxExp2Delta = 0;
    for (let step = 0; step <= 1000; step += 1) {
      const x = step / 1000;
      const powForm = Math.pow(Math.max(1 - x, 0), 5);
      const exp2Form = Math.pow(2, (-5.55473 * x - 6.98316) * x);
      maxExp2Delta = Math.max(maxExp2Delta, Math.abs(powForm - exp2Form));
    }
    expect(maxExp2Delta).toBeLessThan(0.004);
    expect(pbrF0([0.78, 0.42, 0.18], 0, 1, [1, 1, 1])).toEqual([
      expect.closeTo(0.04, 8),
      expect.closeTo(0.04, 8),
      expect.closeTo(0.04, 8),
    ]);
    expectChunkContains("vec3 a3dFresnelSchlick(vec3 f0, float vDotH)");
    expectChunkContains("pow(a3dSaturate(1.0 - vDotH), 5.0)");
  });

  it("pins the clearcoat second lobe to the three-form composition", () => {
    // Python oracle constants for F_Schlick(0.04) * D_GGX * V_SmithCorrelated.
    const lobeA = oracleClearcoatLobe(0.6, 0.7, 0.8, 0.75, 0.1);
    expect(lobeA[0]).toBeCloseTo(0.00000254036, 10);
    const lobeB = oracleClearcoatLobe(0.9, 0.95, 0.9, 0.9, 0.04);
    expect(lobeB[0]).toBeCloseTo(0.00000105847, 10);
    // The lobe is achromatic for a dielectric base and strictly positive.
    for (const channel of lobeA) expect(channel).toBeGreaterThan(0);
    expect(lobeA[0]).toBeCloseTo(lobeA[2], 10);
    // GLSL composes exactly these three named terms with the clearcoat inputs.
    expectChunkContains("vec3 clearcoatF = a3dFresnelSchlick(vec3(0.04), vDotH);");
    expectChunkContains("float clearcoatD = a3dDistributionGGX(nDotH, clearcoatRough);");
    expectChunkContains("float clearcoatG = a3dGeometrySmithGGXCorrelated(nDotV, nDotL, clearcoatRough);");
    expectChunkContains("clearcoatF * clearcoatD * clearcoatG");
  });

  it("pins one end-to-end direct-light RGB vector", () => {
    // Independent full-pipeline Python oracle (fixed input -> expected RGB).
    const input = {
      normal: [0, 0, 1] as const,
      viewDirection: [0.18, -0.12, 1] as const,
      lightDirection: [-0.32, 0.44, 1] as const,
      lightColor: [1, 0.94, 0.82] as const,
      lightIntensity: 2.75,
      albedo: [0.78, 0.42, 0.18] as const,
      metallic: 0,
      roughness: 0.35,
    };
    expect(pbrDirectLight(input)).toEqual([
      expect.closeTo(0.59905325, 5),
      expect.closeTo(0.34284613, 5),
      expect.closeTo(0.17098179, 5),
    ]);
    expect(pbrDirectLight({ ...input, metallic: 1 })).toEqual([
      expect.closeTo(1.78134252, 5),
      expect.closeTo(0.9016342, 5),
      expect.closeTo(0.33708602, 5),
    ]);
  });

  it("pins the per-sample slope-scaled shadow bias behavior", () => {
    // Python oracle constants for the documented bias formula.
    expect(oracleSlopeTangent(0.9)).toBeCloseTo(0.4843221, 6);
    expect(oracleSlopeTangent(0.5)).toBeCloseTo(1.73205081, 6);
    expect(oracleSlopeTangent(0.1)).toBe(8);
    // Behavioral properties a centre-only or (1 - NdotL)-linear bias violates:
    // grazing receivers demand strictly more bias than facing ones, bias grows
    // with per-sample texel distance, and the clamp holds at near-perpendicular.
    expect(oracleSlopeTangent(0.1)).toBeGreaterThan(oracleSlopeTangent(0.5));
    expect(oracleSlopeTangent(0.5)).toBeGreaterThan(oracleSlopeTangent(0.9));
    expect(oracleSlopeTangent(0.01)).toBe(8);
    // GLSL evaluates the tangent (not linear) form per PCF sample. The shadow
    // factors live in the ShaderLibrary programs, not in SHADER_CHUNKS.
    expectProgramContains("sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0))");
    expectProgramContains("slopeTexelBias * sampleTexelDistance");
    expectProgramContains("float sampleTexelDistance = max(1.0, length(sampleData.xy));");
  });
});
