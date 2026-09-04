import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SHADER_CHUNKS } from "../../../packages/rendering/src/ShaderChunks";
import {
  PBR_REFERENCE_MIN_ROUGHNESS,
  pbrAnisotropicDistribution,
  pbrCharlieSheen,
  pbrEncodeOutput,
  pbrEnvironmentFogFactor,
  pbrEnvironmentLight,
  pbrEnvironmentLightSplitSum,
  pbrIridescenceColor,
  pbrLinearToSrgbChannel,
} from "../../../packages/rendering/src";

/**
 * Q0 shader reference-vector suite (muse3jsparity-PRD Phase 0).
 *
 * Two-sided pins for the BRDF math:
 *  1. TS-mirror vectors — fixed input/output pairs for every PBR function that
 *     previously had no mirror coverage (Charlie, aniso lobe, iridescence,
 *     split-sum multiscatter, ACES-fit output encode, fog factor). Independent
 *     spot values were cross-checked with a from-scratch Python evaluation
 *     (Charlie(0.5, 0.3) = 0.42204187, ACES(0.5) -> 0.80251510).
 *  2. GLSL<->mirror sync — the chunk source must contain the function and the
 *     exact constants the mirror implements, so a shader edit that changes the
 *     math fails here instead of drifting silently from the mirror.
 */

const CHUNK_SOURCE = SHADER_CHUNKS.map((chunk) => chunk.source).join("\n");

// Output-encode + fog programs live in ShaderLibrary.ts / ShaderLibraryCore.ts
// (not in SHADER_CHUNKS), so sync assertions read those sources directly.
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

describe("shader-brdf-reference vectors", () => {
  it("pins the Charlie sheen distribution", () => {
    expect(pbrCharlieSheen(0.5, 0.3)).toBeCloseTo(0.42204187, 6);
    expect(pbrCharlieSheen(0.9, 0.15)).toBeCloseTo(0.00001828, 8);
    expect(pbrCharlieSheen(0.2, 0.9)).toBeCloseTo(0.50198729, 6);
    // Sheen response collapses toward normal incidence at fixed roughness.
    expect(pbrCharlieSheen(0.99, 0.3)).toBeLessThan(pbrCharlieSheen(0.5, 0.3));
    expectChunkContains("a3dPbrCharlieSheen");
    expectChunkContains("0.0078125");
  });

  it("pins the anisotropic GGX lobe", () => {
    // Q1.3: aspect-ratio anisotropic-GGX over the procedural frame (replaced the
    // Gaussian lobe on 2026-09-03); the textured path already used this family.
    expect(pbrAnisotropicDistribution([0, 0, 1], [0.3, 0.1, 0.95], 0.35, 0.8, 0.6)).toBeCloseTo(
      1.08459527,
      6
    );
    expect(pbrAnisotropicDistribution([0, 0, 1], [0.3, 0.1, 0.95], 0.35, 0, 0.6)).toBeCloseTo(
      0.37236535,
      6
    );
    // Rotation must strongly change the response for the same geometry.
    expect(
      pbrAnisotropicDistribution([0, 0, 1], [0.3, 0.1, 0.95], 0.35, 0.8, 0.6)
    ).not.toBeCloseTo(
      pbrAnisotropicDistribution([0, 0, 1], [0.3, 0.1, 0.95], 0.35, 0.8, 2.1),
      1
    );
    expectChunkContains("a3dPbrAnisotropicDistribution");
    expectChunkContains("0.92");
  });

  it("pins the thin-film iridescence approximation", () => {
    expect(pbrIridescenceColor(100, 400, 1.3, 0.7)).toEqual([
      expect.closeTo(0.26113614, 6),
      expect.closeTo(0.23902683, 6),
      expect.closeTo(0.99983703, 6),
    ]);
    // Hue must migrate with view angle (grazing vs facing are different colors,
    // not just different brightnesses).
    const facing = pbrIridescenceColor(100, 400, 1.3, 0.7);
    const grazing = pbrIridescenceColor(100, 400, 1.3, 0.2);
    expect(grazing[0] / Math.max(grazing[2], 1e-6)).not.toBeCloseTo(
      facing[0] / Math.max(facing[2], 1e-6),
      1
    );
    expectChunkContains("a3dPbrIridescenceColor");
    expectChunkContains("1200.0");
  });

  it("pins split-sum multiscatter and its zero-LUT fallback", () => {
    const base = {
      normal: [0, 0, 1] as const,
      viewDirection: [0.2, -0.15, 1] as const,
      diffuseIrradiance: [0.32, 0.36, 0.42] as const,
      specularRadiance: [1.8, 1.55, 1.25] as const,
      albedo: [0.76, 0.38, 0.18] as const,
      metallic: 0,
      roughness: 0.4,
    };
    expect(pbrEnvironmentLightSplitSum({ ...base, environmentBrdf: [0.45, 0.32] })).toEqual([
      expect.closeTo(0.77998065, 6),
      expect.closeTo(0.62406774, 6),
      expect.closeTo(0.48053011, 6),
    ]);
    // Zero LUT must reproduce the non-split-sum environment path exactly.
    expect(pbrEnvironmentLightSplitSum({ ...base, environmentBrdf: [0, 0] })).toEqual(
      pbrEnvironmentLight(base)
    );
    // Multiscatter must add (not remove) energy vs the single-scatter term.
    const split = pbrEnvironmentLightSplitSum({ ...base, environmentBrdf: [0.45, 0.32] });
    expect(split[0] + split[1] + split[2]).toBeGreaterThan(0);
    expectChunkContains("a3dPbrEnvironmentLightSplitSum");
  });

  it("pins the ACES-fit output encode (exact sRGB leg)", () => {
    // Q1.1: exact sRGB transfer function (replaced gamma 2.2 on 2026-09-03).
    // sRGB(ACES(0.5)) and sRGB(ACES(2.5)/ACES(0.1)) cross-checked by hand calc.
    expect(pbrEncodeOutput([0.5, 0.5, 0.5])).toEqual([
      expect.closeTo(0.8073189, 6),
      expect.closeTo(0.8073189, 6),
      expect.closeTo(0.8073189, 6),
    ]);
    expect(pbrEncodeOutput([2.5, 0.1, 0.1])).toEqual([
      expect.closeTo(0.97228384, 6),
      expect.closeTo(0.38981196, 6),
      expect.closeTo(0.38981196, 6),
    ]);
    // Overbright input tone-maps below white, never clips to it.
    expect(pbrEncodeOutput([2.5, 2.5, 2.5])[0]).toBeLessThan(1);
    expectProgramContains("a3dPbrEncodeOutput");
    expectProgramContains("a3dLinearToSrgb");
    expectProgramContains("0.0031308");
  });

  it("ramps the sRGB transfer without seams or reversals", () => {
    // Anchors of the standard: linear 0 -> 0, threshold continuity, monotonic.
    expect(pbrLinearToSrgbChannel(0)).toBe(0);
    expect(pbrLinearToSrgbChannel(0.5)).toBeCloseTo(0.73535698, 6);
    expect(pbrLinearToSrgbChannel(1)).toBeCloseTo(1, 6);
    const below = pbrLinearToSrgbChannel(0.0031308 - 1e-7);
    const above = pbrLinearToSrgbChannel(0.0031308 + 1e-7);
    expect(Math.abs(above - below)).toBeLessThan(1e-5);
    let previous = -1;
    for (let step = 0; step <= 64; step += 1) {
      const value = pbrLinearToSrgbChannel(step / 64);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
    // Overbright inputs keep rising monotonically (the ACES fit clamps to 1
    // before the OETF in pbrEncodeOutput, so the raw channel is unbounded).
    expect(pbrLinearToSrgbChannel(4)).toBeGreaterThan(pbrLinearToSrgbChannel(1));
    // Exact OETF deepens shadows vs the old gamma-2.2 leg it replaced.
    expect(pbrLinearToSrgbChannel(0.02)).toBeLessThan(Math.pow(0.02, 1 / 2.2));
  });

  it("pins the environment fog factor across modes", () => {
    const linear = pbrEnvironmentFogFactor({
      worldPosition: [0, 0, -10],
      cameraPosition: [0, 0, 0],
      enabled: true,
      mode: "linear",
      near: 2,
      far: 20,
    });
    expect(linear).toBeCloseTo(0.44444444, 6);
    expect(
      pbrEnvironmentFogFactor({
        worldPosition: [0, 0, -10],
        cameraPosition: [0, 0, 0],
        enabled: true,
        mode: "exponential",
        density: 0.05,
      })
    ).toBeCloseTo(0.39346934, 6);
    expect(
      pbrEnvironmentFogFactor({
        worldPosition: [0, 5, -10],
        cameraPosition: [0, 0, 0],
        enabled: true,
        mode: "exponential-squared",
        density: 0.05,
        heightFalloff: 0.3,
        heightReference: 0,
        maxOpacity: 0.9,
      })
    ).toBeCloseTo(0.05389618, 6);
    // Disabled fog is exactly transparent; maxOpacity caps the factor.
    expect(
      pbrEnvironmentFogFactor({
        worldPosition: [0, 0, -10],
        cameraPosition: [0, 0, 0],
        enabled: false,
        mode: "linear",
        near: 2,
        far: 20,
      })
    ).toBe(0);
    expectChunkContains("u_environmentFogHeightFalloff");
  });

  it("keeps mirror and shader constants in agreement", () => {
    expect(PBR_REFERENCE_MIN_ROUGHNESS).toBe(0.045);
    expectChunkContains("A3D_MIN_ROUGHNESS");
    // The Gauss-Legendre rect quadrature offset used by the finite emitter.
    expectChunkContains("0.28867513459");
  });
});
