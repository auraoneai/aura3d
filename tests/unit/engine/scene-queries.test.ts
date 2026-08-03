import { describe, expect, it } from "vitest";
import {
  groundProbe,
  raycastPhysicsWorld,
  raycastSceneTargets,
  raycastSceneTargetsAll,
  sceneQueryTargets,
  sphereCastPhysicsWorld,
  sphereCastSceneTargets,
  type PhysicsQueryWorld,
  type SceneQueryTarget
} from "../../../packages/engine/src/agent-api/SceneQueries";
import { placedBounds } from "../../../packages/engine/src/agent-api/SpatialAnchoring";
import { primitives, material } from "../../../packages/engine/src";

/**
 * Phase 8 gap closure: scene queries reachable from the public API.
 *
 * The physics audit classified raycasts and shape casts as `unused` -- implemented in
 * `@aura3d/physics`, covered by its own suites, and unreachable from the public agent API.
 * A route asking "what is under this point" therefore had to reach into package internals
 * or answer it with a frozen constant, which is the defect class this remediation removed
 * everywhere else.
 */

/**
 * A unit box occupying y in [-1, 0], so its top face is exactly y = 0.
 *
 * `placedBounds` grounds a subject on `floorY` and extends upward by its height, so the
 * floor must be -1 for the top to be 0. Getting this wrong in a first draft produced
 * "expected 0.5 to be close to 0" -- the fixture was describing a different box, not the
 * query returning a wrong answer.
 */
const BOX_AT_ORIGIN: SceneQueryTarget = {
  nodeName: "box",
  bounds: placedBounds({ position: [0, -1, 0], size: [1, 1, 1], floorY: -1 })
};

describe("sceneQueryTargets", () => {
  it("reduces primitive nodes to placed bounds centred on their position", () => {
    const targets = sceneQueryTargets([
      primitives.box({ name: "platform", material: material.pbr({ color: "#888888" }) })
        .position(2, 1, -3).scale([4, 0.5, 2]).toJSON()
    ]);
    expect(targets).toHaveLength(1);
    const bounds = targets[0]!.bounds;
    expect(targets[0]!.nodeName).toBe("platform");
    // A primitive is centred on its position, so its top is half a height above it.
    expect(bounds.max[1]).toBeCloseTo(1.25, 6);
    expect(bounds.min[1]).toBeCloseTo(0.75, 6);
    expect(bounds.size).toEqual([4, 0.5, 2]);
  });

  it("skips nodes with no position rather than placing them at the origin", () => {
    expect(sceneQueryTargets([primitives.box({ name: "unplaced" }).toJSON()])).toHaveLength(0);
  });

  it("ignores lights, labels and interactions", () => {
    const targets = sceneQueryTargets([
      primitives.box({ name: "solid" }).position(0, 0, 0).toJSON(),
      { kind: "light", light: "ambient", intensity: 1 } as never,
      { kind: "label", label: "hud", text: "hi" } as never
    ]);
    expect(targets.map((target) => target.nodeName)).toEqual(["solid"]);
  });
});

describe("raycastSceneTargets", () => {
  it("hits a box from above and reports the top face", () => {
    const hit = raycastSceneTargets([BOX_AT_ORIGIN], { origin: [0, 5, 0], direction: [0, -1, 0] });
    expect(hit).toBeDefined();
    expect(hit!.point[1]).toBeCloseTo(0, 6);
    expect(hit!.normal).toEqual([0, 1, 0]);
    expect(hit!.distance).toBeCloseTo(5, 6);
    expect(hit!.nodeName).toBe("box");
  });

  it("hits a box from the side and reports the side face", () => {
    const hit = raycastSceneTargets([BOX_AT_ORIGIN], { origin: [-5, -0.5, 0], direction: [1, 0, 0] });
    expect(hit!.normal).toEqual([-1, 0, 0]);
    expect(hit!.point[0]).toBeCloseTo(-0.5, 6);
  });

  it("misses when the ray passes beside the box", () => {
    expect(raycastSceneTargets([BOX_AT_ORIGIN], { origin: [3, 5, 0], direction: [0, -1, 0] })).toBeUndefined();
  });

  it("respects maxDistance", () => {
    expect(raycastSceneTargets([BOX_AT_ORIGIN], { origin: [0, 5, 0], direction: [0, -1, 0], maxDistance: 2 })).toBeUndefined();
    expect(raycastSceneTargets([BOX_AT_ORIGIN], { origin: [0, 5, 0], direction: [0, -1, 0], maxDistance: 6 })).toBeDefined();
  });

  it("normalizes the direction, so an unnormalized vector still reports true distance", () => {
    const hit = raycastSceneTargets([BOX_AT_ORIGIN], { origin: [0, 5, 0], direction: [0, -10, 0] });
    expect(hit!.distance).toBeCloseTo(5, 6);
  });

  it("returns undefined for a zero-length direction instead of dividing by zero", () => {
    expect(raycastSceneTargets([BOX_AT_ORIGIN], { origin: [0, 5, 0], direction: [0, 0, 0] })).toBeUndefined();
  });

  it("orders multiple hits nearest first", () => {
    // Explicit floors: `near` occupies y in [1, 2], `far` in [-3, -2].
    const near: SceneQueryTarget = { nodeName: "near", bounds: placedBounds({ position: [0, 1, 0], size: [1, 1, 1], floorY: 1 }) };
    const far: SceneQueryTarget = { nodeName: "far", bounds: placedBounds({ position: [0, -3, 0], size: [1, 1, 1], floorY: -3 }) };
    const hits = raycastSceneTargetsAll([far, near], { origin: [0, 9, 0], direction: [0, -1, 0] });
    expect(hits.map((hit) => hit.nodeName)).toEqual(["near", "far"]);
  });
});

describe("groundProbe", () => {
  it("reports the surface height under a point", () => {
    const targets = sceneQueryTargets([
      primitives.box({ name: "ground" }).position(0, 0, 0).scale([10, 0.4, 10]).toJSON()
    ]);
    const probe = groundProbe(targets, 2, -3);
    expect(probe).toBeDefined();
    expect(probe!.height).toBeCloseTo(0.2, 6);
    expect(probe!.nodeName).toBe("ground");
  });

  it("returns undefined over a gap rather than substituting zero", () => {
    // A route that treated a missing ground as y=0 is exactly how a character ends up
    // standing on nothing, so the absence must be reportable.
    const targets = sceneQueryTargets([
      primitives.box({ name: "ledge" }).position(0, 0, 0).scale([2, 0.4, 2]).toJSON()
    ]);
    expect(groundProbe(targets, 50, 0)).toBeUndefined();
  });

  it("finds the highest surface when platforms overlap", () => {
    const targets = sceneQueryTargets([
      primitives.box({ name: "low" }).position(0, 0, 0).scale([4, 0.4, 4]).toJSON(),
      primitives.box({ name: "high" }).position(0, 2, 0).scale([4, 0.4, 4]).toJSON()
    ]);
    const probe = groundProbe(targets, 0, 0);
    expect(probe!.nodeName).toBe("high");
    expect(probe!.height).toBeCloseTo(2.2, 6);
  });
});

describe("sphereCastSceneTargets", () => {
  it("detects contact a ray would miss, because the sphere has width", () => {
    // A ray 0.9 units to the side of a 1-unit box misses it; a 0.5-radius sphere does not.
    const ray = { origin: [0.9, 5, 0] as const, direction: [0, -1, 0] as const };
    expect(raycastSceneTargets([BOX_AT_ORIGIN], ray)).toBeUndefined();
    expect(sphereCastSceneTargets([BOX_AT_ORIGIN], ray, 0.5)).toBeDefined();
  });

  it("reports contact one radius before the surface", () => {
    const hit = sphereCastSceneTargets([BOX_AT_ORIGIN], { origin: [0, 5, 0], direction: [0, -1, 0] }, 0.25);
    // The box top is y=0, so a 0.25-radius sphere contacts at y=0.25.
    expect(hit!.point[1]).toBeCloseTo(0.25, 6);
  });

  it("behaves as a raycast at zero radius", () => {
    const ray = { origin: [0, 5, 0] as const, direction: [0, -1, 0] as const };
    expect(sphereCastSceneTargets([BOX_AT_ORIGIN], ray, 0)).toEqual(raycastSceneTargets([BOX_AT_ORIGIN], ray));
  });
});

describe("physics world adapters", () => {
  /** Fake world with the structural query surface, so no physics import is needed. */
  const world: PhysicsQueryWorld = {
    raycast: (origin, direction) => direction[1]! < 0
      ? { point: [origin[0], 0, origin[2]], normal: [0, 1, 0], distance: origin[1]!, colliderId: 7, bodyId: 3 }
      : undefined,
    sphereCast: (origin, radius) => ({ point: [origin[0], radius, origin[2]], normal: [0, 1, 0], distance: origin[1]! - radius })
  };

  it("makes PhysicsWorld.raycast reachable without importing @aura3d/physics", () => {
    const hit = raycastPhysicsWorld(world, { origin: [1, 4, 2], direction: [0, -1, 0] });
    expect(hit).toBeDefined();
    expect(hit!.distance).toBe(4);
    expect(hit!.normal).toEqual([0, 1, 0]);
    // A physics hit identifies a collider rather than a scene node name.
    expect(hit!.nodeName).toBe("collider-7");
  });

  it("returns the same hit shape as the pure path, so call sites do not change", () => {
    const physicsHit = raycastPhysicsWorld(world, { origin: [0, 5, 0], direction: [0, -1, 0] })!;
    const sceneHit = raycastSceneTargets([BOX_AT_ORIGIN], { origin: [0, 5, 0], direction: [0, -1, 0] })!;
    expect(Object.keys(physicsHit).sort()).toEqual(Object.keys(sceneHit).sort());
  });

  it("reports a miss as undefined", () => {
    expect(raycastPhysicsWorld(world, { origin: [0, 5, 0], direction: [0, 1, 0] })).toBeUndefined();
  });

  it("adapts sphere casts and reports absence when a world has none", () => {
    expect(sphereCastPhysicsWorld(world, { origin: [0, 5, 0], direction: [0, -1, 0] }, 0.5)).toBeDefined();
    const noCast: PhysicsQueryWorld = { raycast: world.raycast };
    expect(sphereCastPhysicsWorld(noCast, { origin: [0, 5, 0], direction: [0, -1, 0] }, 0.5)).toBeUndefined();
  });
});
