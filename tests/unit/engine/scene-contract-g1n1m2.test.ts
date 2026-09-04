import { describe, expect, it } from "vitest";
import {
  describeProductionSpotShadow,
  describeTextureStreamingResidency,
  lights,
  mipChainBytesCoarseToFine,
  normalizeTextureBudgetBytes,
  resolveProductionShadowCasterIndex,
  text3D
} from "@aura3d/engine";

/** muse3jsparity-PRD G1/N1/M2 scene-contract bridge units (pure legs). */
describe("scene contract G1/N1/M2 pure bridge", () => {
  it("sizes mip chains coarse-to-fine in RGBA8 bytes", () => {
    expect(mipChainBytesCoarseToFine(1, 1)).toEqual([4]);
    expect(mipChainBytesCoarseToFine(4, 4)).toEqual([4, 16, 64]);
    const chain = mipChainBytesCoarseToFine(8, 4);
    expect(chain[0]).toBe(4);
    expect(chain[chain.length - 1]).toBe(8 * 4 * 4);
    expect(() => mipChainBytesCoarseToFine(0, 4)).toThrow();
  });

  it("normalizes the streaming budget with a 256 MiB default, fail-closed", () => {
    expect(normalizeTextureBudgetBytes(undefined)).toBe(256 * 1024 * 1024);
    expect(normalizeTextureBudgetBytes(1024)).toBe(1024);
    expect(() => normalizeTextureBudgetBytes(0)).toThrow();
    expect(() => normalizeTextureBudgetBytes(-8)).toThrow();
    expect(() => normalizeTextureBudgetBytes(Number.NaN)).toThrow();
  });

  it("funds near textures first and reports the over-budget tail", () => {
    const near = { id: "near", mipBytesCoarseToFine: [100, 400] as const, distanceMeters: 1 };
    const far = { id: "far", mipBytesCoarseToFine: [100, 400] as const, distanceMeters: 50 };
    const funded = describeTextureStreamingResidency([near, far], 1000);
    expect(funded.overBudget).toBe(false);
    expect(funded.usedBytes).toBe(1000);
    const starved = describeTextureStreamingResidency([near, far], 150);
    expect(starved.overBudget).toBe(true);
    expect(starved.overBudgetBytes).toBe(1000 - starved.usedBytes);
    // Coarsest-first: the near texture keeps its base level before far refines.
    const nearResident = starved.residents.find((resident) => resident.id === "near")!;
    expect(nearResident.residentLevels).toBeGreaterThanOrEqual(1);
  });

  it("gives an explicit shadow request the caster slot, keeps legacy order otherwise", () => {
    const directional = { shadowPriority: 3, shadowRequested: false, intensity: 2 };
    const spot = { shadowPriority: 2, shadowRequested: false, intensity: 30 };
    // Legacy: directional priority wins when nobody requests.
    expect(resolveProductionShadowCasterIndex([directional, spot])).toBe(0);
    // Requested: the spot wins despite lower base priority.
    expect(resolveProductionShadowCasterIndex([directional, { ...spot, shadowRequested: true }])).toBe(1);
    // Ties fall back to intensity.
    expect(resolveProductionShadowCasterIndex([
      { ...spot, shadowRequested: true, intensity: 1 },
      { ...spot, shadowRequested: true, intensity: 9 }
    ])).toBe(1);
    expect(resolveProductionShadowCasterIndex([])).toBe(-1);
  });

  it("gates spotPixelBacked on the device map signals, never intent alone", () => {
    const cone = { requested: true, casterIsSpot: true, angle: 0.5, penumbra: 0.35, range: 14 };
    const unbacked = describeProductionSpotShadow({ ...cone, mapRendered: false, mapSampled: false })!;
    expect(unbacked.spotPixelBacked).toBe(false);
    expect(unbacked.atlasResolution).toBeGreaterThan(0);
    const backed = describeProductionSpotShadow({ ...cone, mapRendered: true, mapSampled: true })!;
    expect(backed.spotPixelBacked).toBe(true);
    expect(backed.reason).toMatch(/rendered and sampled/);
    // No request, wrong caster, or missing cone: fail closed with a reason.
    expect(describeProductionSpotShadow({ ...cone, requested: false, mapRendered: true, mapSampled: true })!.spotPixelBacked).toBe(false);
    expect(describeProductionSpotShadow({ ...cone, casterIsSpot: false, mapRendered: true, mapSampled: true })!.spotPixelBacked).toBe(false);
    expect(describeProductionSpotShadow({ requested: true, casterIsSpot: true, mapRendered: true, mapSampled: true })!.spotPixelBacked).toBe(false);
    expect(() => describeProductionSpotShadow({ ...cone, angle: 0, mapRendered: true, mapSampled: true })).toThrow();
  });

  it("records SDF intent and spot shadow flags on root builders", () => {
    const sdf = text3D("AURA", { backend: "sdf", size: 0.8, sdfOcclusion: "hide" }).toJSON() as {
      text3D?: { backend?: string; sdfSize?: number; sdfOcclusion?: string; sdfQuadCount?: number };
    };
    expect(sdf.text3D?.backend).toBe("sdf");
    expect(sdf.text3D?.sdfSize).toBe(0.8);
    expect(sdf.text3D?.sdfOcclusion).toBe("hide");
    expect(sdf.text3D?.sdfQuadCount).toBeGreaterThan(0);
    const spot = lights.spot({ position: [0, 4, 0], shadow: true }).toJSON() as { shadow?: boolean };
    expect(spot.shadow).toBe(true);
  });
});
