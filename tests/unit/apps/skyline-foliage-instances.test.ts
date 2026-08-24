/**
 * SR-A2/SR-A3 view/state parity unit contract for the instanced foliage pools,
 * the consolidated shard sparkles, and the LOD backdrop bands.
 *
 * "View/state parity" here means: the planned state that main.ts renders is
 * deterministic, covers every act, stays inside its declared depth discipline,
 * and every tint is derived from the existing act palettes rather than new
 * colors. Node ids are shared helpers, so what the tests see is exactly what
 * main.ts mounts.
 */
import { describe, expect, it } from "vitest";
import {
  planSkylineFoliage,
  planSkylineShardSparkles,
  skylineFoliageNodeId,
  skylineFoliageTint,
  skylineSparkleNodeId,
  skylineSparkleTint
} from "../../../apps/showcase-skyline-runner/src/foliage";
import {
  SKYLINE_BACKDROP_CLOSE_TRIANGLES,
  SKYLINE_BACKDROP_DISTANT_TRIANGLES,
  SKYLINE_BACKDROP_MAX_NORMALIZED_SILHOUETTE_DELTA,
  SKYLINE_BACKDROP_NEAR_LOD_MAX_DISTANCE,
  createSkylineBackdropCloseGeometry,
  planSkylineBackdropChunks,
  skylineBackdropChunkId,
  skylineBackdropLodSpec
} from "../../../apps/showcase-skyline-runner/src/backdrop";
import {
  SKYLINE_DISTRICT_ANCHORS,
  createSkylineLevel
} from "../../../apps/showcase-skyline-runner/src/level";
import { SKYLINE_SECTION_COUNT } from "../../../apps/showcase-skyline-runner/src/level-layout";
import { selectAuraRootLodLevel } from "@aura3d/engine";

const HEX = /^#[0-9a-f]{6}$/i;

describe("Skyline instanced foliage plans are deterministic and act-tinted", () => {
  const platforms = createSkylineLevel().platforms ?? [];
  const first = planSkylineFoliage({ platforms });

  it("plans six instances per district with a fixed seed", () => {
    expect(first.length).toBe(6 * SKYLINE_SECTION_COUNT);
    expect(skylineFoliageNodeId(0)).toBe("skyline-foliage-pool-act-0");
    expect(skylineSparkleNodeId(4)).toBe("skyline-sparkle-halo-pool-act-4");
  });

  it("re-plans byte-identically (retained evidence must reproduce)", () => {
    const second = planSkylineFoliage({ platforms });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("keeps every frond on a certified platform top inside its own district", () => {
    for (const placement of first) {
      const owner = platforms.find((platform) =>
        placement.x >= platform.x && placement.x <= platform.x + platform.width);
      expect(owner, placement.id + " has no certified surface under it").toBeDefined();
      expect(placement.y).toBeCloseTo(owner!.y + owner!.height + 0.02, 6);
      expect(placement.depthBias).toBeGreaterThanOrEqual(0);
      expect(placement.depthBias).toBeLessThan(1);
      expect(placement.tint).toBeGreaterThanOrEqual(0);
      expect(placement.tint).toBeLessThanOrEqual(1);
    }
  });

  it("covers all five acts and tints only from the existing palettes", () => {
    const acts = new Set(first.map((placement) => placement.act));
    expect(acts).toEqual(new Set([0, 1, 2, 3, 4]));
    for (let act = 0; act <= 4; act += 1) {
      expect(skylineFoliageTint(act, 0.5)).toMatch(HEX);
      expect(skylineSparkleTint(act, 0.5)).toMatch(HEX);
    }
    // Distinct acts produce distinct tints (palette-driven, not one shared hue).
    expect(skylineFoliageTint(0, 0.5)).not.toBe(skylineFoliageTint(4, 0.5));
    expect(skylineSparkleTint(1, 0.5)).not.toBe(skylineSparkleTint(4, 0.5));
  });
});

describe("Skyline shard sparkle consolidation", () => {
  const level = createSkylineLevel();
  const shards = (level.collectibles ?? []).filter(
    (collectible) => !String(collectible.id).includes("ember-charge")
  );
  const sparkles = planSkylineShardSparkles(shards.map((shard) => ({
    id: String(shard.id),
    x: shard.x,
    y: shard.y
  })));

  it("gives every sky-shard exactly one instanced halo, grouped per act", () => {
    expect(sparkles.length).toBe(shards.length);
    expect(new Set(sparkles.map((sparkle) => sparkle.id)).size).toBe(sparkles.length);
    const acts = new Set(sparkles.map((sparkle) => sparkle.act));
    expect(acts).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it("places halos at their shard positions with bounded scale/tint", () => {
    const byId = new Map(sparkles.map((sparkle) => [sparkle.id, sparkle]));
    for (const shard of shards) {
      const sparkle = byId.get("skyline-sparkle-" + shard.id);
      expect(sparkle).toBeDefined();
      expect(sparkle!.x).toBeCloseTo(shard.x, 9);
      expect(sparkle!.y).toBeCloseTo(shard.y, 9);
      expect(sparkle!.scale).toBeGreaterThan(0.5);
      expect(sparkle!.scale).toBeLessThan(1.5);
    }
  });
});

describe("Skyline LOD backdrop bands", () => {
  const chunks = planSkylineBackdropChunks(SKYLINE_DISTRICT_ANCHORS);

  it("builds two bands x ten districts with positive silhouettes", () => {
    expect(chunks.length).toBe(20);
    expect(chunks.filter((chunk) => chunk.band === "far").length).toBe(SKYLINE_SECTION_COUNT);
    expect(chunks.filter((chunk) => chunk.band === "near").length).toBe(SKYLINE_SECTION_COUNT);
    for (const chunk of chunks) {
      expect(chunk.height).toBeGreaterThan(0.8);
      expect(chunk.width).toBeGreaterThan(10);
    }
    // The far range towers over the near range everywhere: the receding-city read.
    for (let section = 0; section < SKYLINE_SECTION_COUNT; section += 1) {
      const far = chunks.find((chunk) => chunk.band === "far" && chunk.section === section)!;
      const near = chunks.find((chunk) => chunk.band === "near" && chunk.section === section)!;
      expect(far.height).toBeGreaterThan(near.height);
    }
  });

  it("is deterministic down to the chunk ids", () => {
    expect(JSON.stringify(planSkylineBackdropChunks(SKYLINE_DISTRICT_ANCHORS)))
      .toBe(JSON.stringify(chunks));
    expect(chunks.map((chunk) => chunk.id)).toEqual(
      chunks.map((chunk) => skylineBackdropChunkId(chunk.band, chunk.section))
    );
  });

  it("every chunk carries a 52-to-12 triangle LOD reduction held across hysteresis", () => {
    const closeGeometry = createSkylineBackdropCloseGeometry();
    expect(closeGeometry.indices.length / 3).toBe(SKYLINE_BACKDROP_CLOSE_TRIANGLES);
    expect(SKYLINE_BACKDROP_DISTANT_TRIANGLES).toBe(12);
    expect(closeGeometry.bounds).toEqual({ min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] });
    for (const chunk of chunks) {
      const spec = skylineBackdropLodSpec(chunk);
      expect(spec.levels.length).toBe(2);
      expect(spec.hysteresis).toBeGreaterThan(0);
      expect(spec.levels[0]!.maxDistance).toBe(SKYLINE_BACKDROP_NEAR_LOD_MAX_DISTANCE);
      expect(spec.levels[1]!.maxDistance).toBeUndefined();
      expect(spec.levels[0]!.geometry!.indices.length / 3).toBe(SKYLINE_BACKDROP_CLOSE_TRIANGLES);
      expect(spec.levels[0]!.primitive).toBeUndefined();
      expect(spec.levels[1]!.primitive).toBe("box");
      expect(spec.levels[1]!.material).toBeDefined();
      expect(spec.levels[1]!.material).toEqual(spec.levels[0]!.material);
      expect(spec.triangleCounts).toEqual([52, 12]);
      expect(spec.distantTriangleReductionRatio).toBeCloseTo(0.76923, 4);
      expect(spec.maximumNormalizedSilhouetteDelta).toBe(SKYLINE_BACKDROP_MAX_NORMALIZED_SILHOUETTE_DELTA);
    }
  });

  it("holds both travel directions inside the 0.4-unit no-flicker band", () => {
    const levels = skylineBackdropLodSpec(chunks[0]!).levels;
    expect(selectAuraRootLodLevel(31.89, levels, 0, 0.4)).toEqual({ levelIndex: 0, reason: "hysteresis-hold" });
    expect(selectAuraRootLodLevel(31.91, levels, 0, 0.4)).toEqual({ levelIndex: 1, reason: "farther-threshold" });
    expect(selectAuraRootLodLevel(31.11, levels, 1, 0.4)).toEqual({ levelIndex: 1, reason: "hysteresis-hold" });
    expect(selectAuraRootLodLevel(31.09, levels, 1, 0.4)).toEqual({ levelIndex: 0, reason: "nearer-threshold" });
  });
});
