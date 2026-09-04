import { describe, expect, it } from "vitest";
import { createBeamDescriptor, resolveBillboardCorners, resolveFlipbookUv } from "../../../packages/rendering/src/SpriteFlipbook";
import { createTerrainHeightfieldFixture } from "../../../packages/rendering/src/TerrainHeightfield";
import {
  auditRenderOrder,
  createTerrainTileGrid,
  enforceFrameBudget,
  planScatterInstances,
  queryTerrainHeight,
  resolveTerrainSlopeBlend,
  scatterWindOffset,
} from "../../../packages/rendering/src/TerrainTiles";

/**
 * D2 terrain/scatter/budget + D4 billboards/flipbooks/beams
 * (muse3jsparity-PRD). Smart-city route adoption + browser pixel proof are
 * recorded as blocked (no root bridge edits in this phase, no Playwright
 * browsers in this environment).
 */

describe("D2 tiled terrain with LOD morph + holes", () => {
  it("assigns nearer tiles lower LODs with morph in [0, 1]", () => {
    const plans = createTerrainTileGrid({ tileCountX: 4, tileCountZ: 4, cameraX: 16, cameraZ: 16 });
    expect(plans).toHaveLength(16);
    for (const plan of plans) {
      expect(plan.morphFactor).toBeGreaterThanOrEqual(0);
      expect(plan.morphFactor).toBeLessThanOrEqual(1);
      expect(plan.resolution).toBeGreaterThanOrEqual(5);
    }
    const lods = new Set(plans.map((plan) => plan.key.lod));
    expect(lods.size).toBeGreaterThan(1);
  });

  it("counts hole cells through the hole mask", () => {
    const plans = createTerrainTileGrid({
      tileCountX: 1,
      tileCountZ: 1,
      holeMask: () => true,
    });
    expect(plans[0]!.hasHoles).toBe(true);
    expect(plans[0]!.holeCellCount).toBe((plans[0]!.resolution - 1) ** 2);
    const solid = createTerrainTileGrid({ tileCountX: 1, tileCountZ: 1 });
    expect(solid[0]!.hasHoles).toBe(false);
  });

  it("blends rock on steeps, grass on flats, snow above the snowline", () => {
    const flat = resolveTerrainSlopeBlend(5, 10, 100);
    expect(flat.grass).toBeGreaterThan(flat.rock);
    const steep = resolveTerrainSlopeBlend(60, 10, 100);
    expect(steep.rock).toBeGreaterThan(steep.grass);
    const snowy = resolveTerrainSlopeBlend(5, 150, 100);
    expect(snowy.snow).toBeGreaterThan(0);
    const weights = flat.rock + flat.grass + flat.sand + flat.snow;
    expect(weights).toBeCloseTo(1, 3);
    expect(() => resolveTerrainSlopeBlend(120, 10, 100)).toThrow(RangeError);
  });

  it("queries collision height shared with physics", () => {
    const fixture = createTerrainHeightfieldFixture({ seed: 7 });
    const height = queryTerrainHeight(fixture, 4, 4, 8, 8);
    expect(Number.isFinite(height)).toBe(true);
    expect(height).toBeGreaterThanOrEqual(fixture.minHeight);
    expect(height).toBeLessThanOrEqual(fixture.maxHeight);
  });
});

describe("D2 scatter plan + frame budget", () => {
  it("holds the 50k-instance scene at budget with wind + culling", () => {
    const plan = planScatterInstances({ instanceBudget: 50000, densityMapMean: 0.6 });
    expect(plan.admittedInstances).toBeLessThanOrEqual(50000);
    expect(plan.withinBudget).toBe(true);
    expect(plan.meshInstances + plan.impostorInstances).toBe(plan.admittedInstances);
    expect(plan.shadowCasters).toBeLessThanOrEqual(plan.meshInstances);
    expect(plan.windStrength).toBeGreaterThan(0);
  });

  it("sheds real candidate counts through candidateInstances", () => {
    const plan = planScatterInstances({ instanceBudget: 50000, densityMapMean: 0.6, candidateInstances: 60000 });
    expect(plan.admittedInstances).toBe(50000);
    expect(plan.culledInstances).toBe(10000);
    expect(plan.withinBudget).toBe(true);
    const under = planScatterInstances({ instanceBudget: 50000, densityMapMean: 0.6, candidateInstances: 40000 });
    expect(under.admittedInstances).toBe(40000);
    expect(under.culledInstances).toBe(0);
    expect(() => planScatterInstances({ instanceBudget: 50000, densityMapMean: 0.6, candidateInstances: 0 })).toThrow(RangeError);
  });

  it("sways scatter instances with time-varying wind offsets", () => {
    const still = scatterWindOffset(1, 2, 0, 0.35, 1);
    const later = scatterWindOffset(1, 2, 1.2, 0.35, 1);
    expect(Number.isFinite(still.x) && Number.isFinite(still.z)).toBe(true);
    expect(Math.hypot(later.x - still.x, later.z - still.z)).toBeGreaterThan(0);
    const calm = scatterWindOffset(1, 2, 1.2, 0, 1);
    expect(calm).toEqual({ x: 0, z: 0 });
    const stiff = scatterWindOffset(1, 2, 1.2, 0.35, 0.45);
    expect(Math.hypot(stiff.x, stiff.z)).toBeLessThan(Math.hypot(later.x, later.z));
    // Amplitude scales display sway without changing the gust field shape.
    const amplified = scatterWindOffset(1, 2, 1.2, 0.35, 1, 3);
    expect(amplified.x).toBeCloseTo(later.x * 3, 4);
    expect(amplified.z).toBeCloseTo(later.z * 3, 4);
    expect(() => scatterWindOffset(1, 2, -1, 0.35)).toThrow(RangeError);
    expect(() => scatterWindOffset(1, 2, 1, 2)).toThrow(RangeError);
    expect(() => scatterWindOffset(1, 2, 1, 0.35, 1, -1)).toThrow(RangeError);
  });

  it("degrades LOD bias before dropping frames", () => {
    const ok = enforceFrameBudget({ draws: 200, triangles: 500000, textures: 40, maxDraws: 500, maxTriangles: 2000000, maxTextures: 64 });
    expect(ok.overBudget).toBe(false);
    expect(ok.lodBias).toBe(0);
    const over = enforceFrameBudget({ draws: 2000, triangles: 8000000, textures: 200, maxDraws: 500, maxTriangles: 2000000, maxTextures: 64 });
    expect(over.overBudget).toBe(true);
    expect(over.lodBias).toBeGreaterThan(0);
    expect(over.lodBias).toBeLessThanOrEqual(1);
    expect(over.shedDraws).toBeGreaterThan(0);
  });

  it("closes or bounds every render-order + layers rule", () => {
    const audit = auditRenderOrder();
    expect(audit.map((entry) => entry.rule)).toEqual(
      expect.arrayContaining(["opaque-sorting", "transparent-sorting", "render-order-override", "layer-masking", "frustum-culling"])
    );
    for (const entry of audit) {
      expect(["none", "bounded"]).toContain(entry.delta);
      expect(entry.auraBehavior.length).toBeGreaterThan(0);
      expect(entry.threeR185Behavior.length).toBeGreaterThan(0);
    }
    const bounded = audit.filter((entry) => entry.delta === "bounded");
    expect(bounded.map((entry) => entry.rule).sort()).toEqual(["layer-masking", "render-order-override"]);
  });
});

describe("D4 billboards", () => {
  it("faces the camera with distance attenuation (spherical)", () => {
    const corners = resolveBillboardCorners({
      center: [0, 1, 0],
      size: [2, 2],
      cameraPosition: [0, 1, 5],
      attenuation: 1,
    });
    // Distance 5, attenuation 1 -> scale 0.2 -> half-size 0.2.
    expect(corners.attenuatedSize[0]).toBeCloseTo(0.4, 5);
    expect(corners.topLeft[0]).toBeCloseTo(-0.2, 5);
    expect(corners.topLeft[1]).toBeCloseTo(1.2, 5);
    expect(corners.topLeft[2]).toBeCloseTo(0, 5);
  });

  it("locks the Y axis in axis-locked mode", () => {
    const corners = resolveBillboardCorners({
      mode: "axis-locked-y",
      center: [0, 1, 0],
      size: [2, 2],
      cameraPosition: [3, 5, 4],
      attenuation: 0,
    });
    // No attenuation -> full size; vertical edge stays vertical.
    expect(corners.topLeft[1] - corners.bottomLeft[1]).toBeCloseTo(2, 5);
    expect(corners.topLeft[0]).toBeCloseTo(corners.bottomLeft[0], 5);
  });

  it("rejects degenerate inputs", () => {
    expect(() =>
      resolveBillboardCorners({ center: [0, 0, 0], size: [1, 1], cameraPosition: [0, 0, 0] })
    ).toThrow(RangeError);
  });
});

describe("D4 flipbook + beams", () => {
  it("tiles UVs across the sheet with GL v-flip", () => {
    const first = resolveFlipbookUv(0, 4, 4);
    expect(first.uvRect).toEqual([0, 0.75, 0.25, 1]);
    const last = resolveFlipbookUv(15, 4, 4);
    expect(last.uvRect).toEqual([0.75, 0, 1, 0.25]);
    const mid = resolveFlipbookUv(5, 4, 4);
    expect(mid.uvRect).toEqual([0.25, 0.5, 0.5, 0.75]);
    expect(() => resolveFlipbookUv(16, 4, 4)).toThrow(RangeError);
  });

  it("builds additive beams with measured length", () => {
    const beam = createBeamDescriptor({ from: [0, 0, 0], to: [0, 0, 10] });
    expect(beam.length).toBeCloseTo(10, 5);
    expect(beam.additive).toBe(true);
    expect(beam.segmentCount).toBe(8);
    expect(() => createBeamDescriptor({ from: [1, 1, 1], to: [1, 1, 1] })).toThrow(RangeError);
  });
});
