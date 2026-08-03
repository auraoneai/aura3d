import { describe, expect, it } from "vitest";
import {
  checkSpatialInvariants,
  containsPoint,
  distanceOutsideBounds,
  distributeAroundBounds,
  distributeInRegion,
  placedBounds,
  placedBoundsFromAsset,
  resolveBoundsAnchor,
  resolveSemanticRegion,
  validateSpacing
} from "../../../packages/engine/src/agent-api/SpatialAnchoring";

/**
 * Regression cases for the floating-procedural-geometry defect class.
 *
 * Digital Twin Ops placed status markers, belt pulses, an alarm beacon and a
 * scanner sweep at literal world coordinates chosen against an asset whose bounds
 * the route never consulted. Boxes ended up beside the scene rather than attached
 * to the equipment they annotate. `CAR_SCENE_HEIGHT` was the same defect in one
 * constant.
 *
 * These tests hold the reusable replacement to the property that matters: helper
 * placement is derived from the subject's placed bounds, so it follows the asset
 * when the asset changes.
 */

describe("placedBounds", () => {
  it("grounds a subject on its floor and centres it horizontally", () => {
    const bounds = placedBounds({ position: [2, 0, -1], size: [1, 2, 3], floorY: 0 });
    expect(bounds.min).toEqual([1.5, 0, -2.5]);
    expect(bounds.max).toEqual([2.5, 2, 0.5]);
    expect(bounds.center).toEqual([2, 1, -1]);
    expect(bounds.floorY).toBe(0);
  });
});

describe("placedBoundsFromAsset", () => {
  const asset = {
    metadata: { boundsMetadata: { min: [-3.4, 0, -1.2], max: [3.4, 2.1, 1.2] } }
  };

  it("mirrors the safe renderer's normalize-then-scale placement", () => {
    const bounds = placedBoundsFromAsset(asset, { targetMaxDimension: 1.32, position: [0, 0, 0] });
    // Largest raw extent is 6.8 on X; normalizing to 1.32 gives a factor of 0.194.
    expect(bounds.size[0]).toBeCloseTo(1.32, 6);
    expect(bounds.size[1]).toBeCloseTo(2.1 * (1.32 / 6.8), 6);
    expect(bounds.min[1]).toBe(0);
  });

  it("rescales when the asset changes, so anchors move with it", () => {
    const small = placedBoundsFromAsset(asset, { targetMaxDimension: 1.32 });
    const swapped = placedBoundsFromAsset(
      { metadata: { boundsMetadata: { min: [-1, 0, -1], max: [1, 4, 1] } } },
      { targetMaxDimension: 1.32 }
    );
    // Different aspect ratio: the anchor grid must not stay frozen to the old asset.
    expect(swapped.size[1]).not.toBeCloseTo(small.size[1], 3);
  });
});

describe("resolveBoundsAnchor", () => {
  const bounds = placedBounds({ position: [0, 0, 0], size: [2, 1, 4], floorY: 0 });

  it("resolves each face to the correct side of the subject", () => {
    expect(resolveBoundsAnchor(bounds, "top").position[1]).toBeCloseTo(1, 6);
    expect(resolveBoundsAnchor(bounds, "bottom").position[1]).toBeCloseTo(0, 6);
    expect(resolveBoundsAnchor(bounds, "right").position[0]).toBeCloseTo(1, 6);
    expect(resolveBoundsAnchor(bounds, "left").position[0]).toBeCloseTo(-1, 6);
    // Documented convention: front is +Z, the face nearest a default camera.
    expect(resolveBoundsAnchor(bounds, "front").position[2]).toBeCloseTo(2, 6);
    expect(resolveBoundsAnchor(bounds, "rear").position[2]).toBeCloseTo(-2, 6);
  });

  it("pushes an anchor outside the subject when an offset is given", () => {
    const anchor = resolveBoundsAnchor(bounds, "right", { offset: 0.5 });
    expect(anchor.position[0]).toBeCloseTo(1.5, 6);
    expect(anchor.outsideBounds).toBe(true);
  });

  it("keeps floor anchors on the ground plane", () => {
    const anchor = resolveBoundsAnchor(bounds, "floor-front", { offset: 0.4 });
    expect(anchor.position[1]).toBeCloseTo(0, 6);
    expect(anchor.position[2]).toBeCloseTo(2.4, 6);
  });

  it("scales with the subject rather than staying a literal", () => {
    const large = placedBounds({ position: [0, 0, 0], size: [8, 4, 16], floorY: 0 });
    const small = resolveBoundsAnchor(bounds, "top", { offset: 0.2 }).position[1];
    const big = resolveBoundsAnchor(large, "top", { offset: 0.2 }).position[1];
    expect(big).toBeGreaterThan(small);
  });
});

describe("resolveSemanticRegion", () => {
  it("maps a normalized region onto the subject's world bounds", () => {
    const bounds = placedBounds({ position: [0, 0, 0], size: [2, 1, 1], floorY: 0 });
    const region = resolveSemanticRegion(bounds, { id: "assembly", u: 0.25, v: 0.5, w: 0.5, extent: [0.2, 0.4, 0.3] });
    expect(region.center).toEqual([-0.5, 0.5, 0]);
    expect(region.size).toEqual([0.4, 0.4, 0.3]);
  });

  it("follows the subject when the subject grows", () => {
    const region = { id: "assembly", u: 0.25, v: 0.5, w: 0.5 } as const;
    const a = resolveSemanticRegion(placedBounds({ position: [0, 0, 0], size: [2, 1, 1] }), region);
    const b = resolveSemanticRegion(placedBounds({ position: [0, 0, 0], size: [4, 2, 2] }), region);
    expect(b.center[0]).toBeCloseTo(a.center[0] * 2, 6);
    expect(b.center[1]).toBeCloseTo(a.center[1] * 2, 6);
  });

  it("clamps out-of-range normalized coordinates instead of leaving the subject", () => {
    const bounds = placedBounds({ position: [0, 0, 0], size: [2, 1, 1] });
    const region = resolveSemanticRegion(bounds, { id: "bad", u: 4, v: -2, w: 0.5 });
    expect(containsPoint(bounds, region.center)).toBe(true);
  });
});

describe("distributeInRegion", () => {
  const region = { min: [-0.5, 0.1, -0.1] as const, max: [0.5, 0.1, 0.1] as const };

  it("spreads items along the longer axis", () => {
    const placements = distributeInRegion(region, { count: 4 });
    const xs = placements.map((placement) => placement.position[0]);
    expect(xs[0]).toBeCloseTo(-0.5, 6);
    expect(xs[3]).toBeCloseTo(0.5, 6);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it("is deterministic for a given seed", () => {
    const a = distributeInRegion(region, { count: 6, jitter: 0.5, seed: 7 });
    const b = distributeInRegion(region, { count: 6, jitter: 0.5, seed: 7 });
    expect(a).toEqual(b);
    const c = distributeInRegion(region, { count: 6, jitter: 0.5, seed: 8 });
    expect(c).not.toEqual(a);
  });

  it("reports spacing violations rather than silently relocating items", () => {
    const tight = distributeInRegion({ min: [0, 0, 0], max: [0.05, 0, 0] }, { count: 6 });
    expect(validateSpacing(tight, 0.5).ok).toBe(false);
    const roomy = distributeInRegion({ min: [0, 0, 0], max: [10, 0, 0] }, { count: 3 });
    expect(validateSpacing(roomy, 0.5).ok).toBe(true);
  });

  it("returns nothing for a zero count", () => {
    expect(distributeInRegion(region, { count: 0 })).toHaveLength(0);
  });
});

describe("distributeAroundBounds", () => {
  it("clears the subject's own footprint", () => {
    const bounds = placedBounds({ position: [0, 0, 0], size: [2, 1, 2], floorY: 0 });
    const placements = distributeAroundBounds(bounds, { count: 6, radius: 0.5 });
    for (const placement of placements) {
      const distance = Math.hypot(placement.position[0], placement.position[2]);
      // Radius is measured from the subject's half-extent, so items stay outside it.
      expect(distance).toBeGreaterThanOrEqual(1.5 - 1e-6);
    }
  });

  it("spaces a full circle evenly", () => {
    const placements = distributeAroundBounds(placedBounds({ position: [0, 0, 0], size: [1, 1, 1] }), { count: 4, radius: 1 });
    const gaps = placements.map((placement) => placement.nearestNeighborDistance);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6);
  });
});

describe("checkSpatialInvariants", () => {
  const bounds = placedBounds({ position: [0, 0, 0], size: [1.3, 0.5, 0.7], floorY: 0 });

  it("fails an outside element that has floated away from the subject", () => {
    // The digital-twin defect: a marker at a literal coordinate unrelated to the
    // loaded asset's bounds.
    const report = checkSpatialInvariants(bounds, [
      { id: "alarm beacon", position: [-0.54, 0.64, -0.42], relation: "outside" },
      { id: "distant box", position: [12, 4, -9], relation: "outside" }
    ]);
    expect(report.passes).toBe(false);
    expect(report.checks.find((check) => check.id === "distant box")?.passes).toBe(false);
    expect(report.checks.find((check) => check.id === "alarm beacon")?.passes).toBe(true);
  });

  it("passes anchored helpers derived from the bounds", () => {
    const beside = resolveBoundsAnchor(bounds, "floor-right", { offset: 0.3 });
    const above = resolveBoundsAnchor(bounds, "top", { offset: 0.1 });
    const report = checkSpatialInvariants(bounds, [
      { id: "control station", position: beside.position, relation: "outside" },
      { id: "status marker", position: above.position, relation: "outside" },
      { id: "selection ring", position: bounds.center, relation: "inside" }
    ]);
    expect(report.passes).toBe(true);
  });

  it("checks surface elements against a bounds-derived tolerance", () => {
    const onSurface = resolveBoundsAnchor(bounds, "top");
    const report = checkSpatialInvariants(bounds, [
      { id: "sensor decal", position: onSurface.position, relation: "surface" },
      { id: "drifted decal", position: [onSurface.position[0], onSurface.position[1] + 1.4, onSurface.position[2]], relation: "surface" }
    ]);
    expect(report.checks.find((check) => check.id === "sensor decal")?.passes).toBe(true);
    expect(report.checks.find((check) => check.id === "drifted decal")?.passes).toBe(false);
  });
});

describe("distanceOutsideBounds", () => {
  it("is zero inside and positive outside", () => {
    const bounds = placedBounds({ position: [0, 0, 0], size: [2, 2, 2], floorY: 0 });
    expect(distanceOutsideBounds(bounds, [0, 1, 0])).toBe(0);
    expect(distanceOutsideBounds(bounds, [3, 1, 0])).toBeCloseTo(2, 6);
  });
});
