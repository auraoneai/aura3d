import { describe, expect, it } from "vitest";
import { PhysicsWorld } from "@aura3d/physics";
import { createCollisionLayers, createPhysicsRuntime } from "@aura3d/engine";
import { LOS_RADIUS, enemyLineOfSight } from "../../../examples/neon-corridor-strike/src/game/enemies";
import { layers } from "../../../examples/neon-corridor-strike/src/game/level";

/** Minimal hull: one blocking wall slab across the mid corridor. */
function buildRuntime(withWall: boolean) {
  const world = new PhysicsWorld({ gravity: [0, -24, 0], fixedDelta: 1 / 60, backend: "rapier" });
  const physics = createPhysicsRuntime(world, { layers });
  if (withWall) {
    physics.createBody({
      name: "wall-block",
      type: "static",
      shape: "box",
      position: [0, 1.4, 0],
      halfExtents: [0.15, 2, 3],
      layer: "wall"
    });
  }
  return physics;
}

describe("Neon Corridor Strike sphereCast line of sight (NC-A3)", () => {
  it("cast through the wall slab fails", () => {
    const physics = buildRuntime(true);
    const sees = enemyLineOfSight(
      physics,
      [-2, 1.35, 0],
      [2, 1.35, 0]
    );
    expect(sees).toBe(false);
  });

  it("open lane passes even with a wall elsewhere in the hull", () => {
    const physics = buildRuntime(true);
    // Same x-span but at z 5: far outside the slab z-range [-3, 3].
    const seesOpenLane = enemyLineOfSight(physics, [-2, 1.35, 5], [2, 1.35, 5]);
    expect(seesOpenLane).toBe(true);
    // And an identical cast in a wall-free hull passes too.
    const empty = buildRuntime(false);
    expect(enemyLineOfSight(empty, [-2, 1.35, 0], [2, 1.35, 0])).toBe(true);
  });

  it("uses a positive sweep radius and treats a degenerate segment as visible", () => {
    expect(LOS_RADIUS).toBeGreaterThan(0);
    const physics = buildRuntime(true);
    expect(enemyLineOfSight(physics, [1, 1.35, 0], [1, 1.35, 0])).toBe(true);
  });
});
