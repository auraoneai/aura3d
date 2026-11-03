import { describe, expect, test } from "vitest";
import { model, physics, primitives, scene } from "../../../packages/engine/src/agent-api/index";
import type { AuraAssetRef } from "../../../packages/engine/src/agent-api/nodes/types";

/**
 * S5-WP26-03: a `collider: "bounds"` model collides with its scaled asset
 * bounds, and a model without bounds fails instead of guessing a unit box.
 */
const crate = {
  kind: "aura-asset-ref", id: "crate", type: "model", format: "glb", url: "/crate.glb",
  metadata: { boundsMetadata: { min: [-1, 0, -1], max: [1, 1, 1] } }
} as unknown as AuraAssetRef<"model">;

function worldWith(scale: number) {
  const source = scene()
    .add(model(crate, { name: "crate", scaleMode: "world", scale, collider: "bounds" }))
    .add(primitives.sphere({ name: "ball", size: 0.4 }).position(1.5, 5, 0).physics({ type: "dynamic", mass: 1 }));
  return physics.worldFromScene(source, { gravity: [0, -9.81, 0], enableSleeping: false });
}

describe("model bounds colliders", () => {
  test("a ray and a falling body meet the scaled bounds, not the unscaled asset box", () => {
    const scaled = worldWith(2);
    const unscaled = worldWith(1);
    try {
      // Scale 2: x in [-2, 2], top at y 2. Scale 1: x in [-1, 1], so x -1.5 misses.
      // (Rays use x -1.5 so they cannot meet the ball dropped at x 1.5.)
      const hit = physics.raycast(scaled, [-1.5, 10, 0], [0, -1, 0]);
      expect(hit?.point[1]).toBeCloseTo(2, 3);
      expect(hit?.normal[1]).toBeCloseTo(1, 3);
      expect(physics.raycast(unscaled, [-1.5, 10, 0], [0, -1, 0])).toBeUndefined();
      const sideHit = physics.raycast(scaled, [-10, 1.9, 0], [1, 0, 0]);
      expect(sideHit?.point[0]).toBeCloseTo(-2, 3);

      for (let step = 0; step < 240; step += 1) { physics.step(scaled, 1 / 60); physics.step(unscaled, 1 / 60); }
      const ballOf = (world: ReturnType<typeof worldWith>) => world.snapshot().snapshot.bodies.find((body) => body.type === "dynamic")!;
      // Ball radius 0.2 rests on the scaled top (y 2), but falls past the unscaled crate's side.
      expect(ballOf(scaled).position[1]).toBeGreaterThan(2.1);
      expect(ballOf(scaled).position[1]).toBeLessThan(2.3);
      expect(ballOf(unscaled).position[1]).toBeLessThan(0);
    } finally {
      scaled.dispose();
      unscaled.dispose();
    }
  });

  test("a bounds collider on a model without asset bounds fails with a coded error", () => {
    const unbounded = { kind: "aura-asset-ref", id: "mystery", type: "model", format: "glb", url: "/mystery.glb" } as unknown as AuraAssetRef<"model">;
    const source = scene().add(model(unbounded, { name: "mystery", collider: "bounds" }));
    expect(() => physics.worldFromScene(source)).toThrow(/MODEL_COLLIDER_MISSING_BOUNDS: model 'mystery'/);
  });
});
