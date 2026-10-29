import { describe, expect, test } from "vitest";
import { physics, primitives, resolveNodePhysicsShape, scene } from "../../../packages/engine/src/agent-api/index";

/**
 * anim-phys-04: a cylinder or capsule primitive wider than it is tall got a capsule clamped
 * to a sphere of half its height ([2, 0.5, 2] gave radius 0.25 against a visible radius 1.0).
 * Short, wide bodies now get a box with the visible radius and height; tall ones keep the capsule.
 */
const shapeOf = (node: ReturnType<typeof primitives.cylinder>) => {
  const json = node.physics({ type: "dynamic", mass: 1 }).toJSON() as Parameters<typeof resolveNodePhysicsShape>[0];
  return resolveNodePhysicsShape(json, json.physics!);
};

describe("derived colliders for short, wide cylinders and capsules", () => {
  test("a [2, 0.5, 2] cylinder gets a box spanning its visible radius and height", () => {
    expect(shapeOf(primitives.cylinder({ name: "disc", size: [2, 0.5, 2] }))).toEqual({ kind: "box", halfExtents: [1, 0.25, 1] });
  });

  test("a squat capsule gets a box, a square one a sphere, a tall one keeps the capsule", () => {
    expect(shapeOf(primitives.capsule({ name: "squat", size: [1.2, 0.6, 1.2] }))).toEqual({ kind: "box", halfExtents: [0.6, 0.3, 0.6] });
    expect(shapeOf(primitives.capsule({ name: "square", size: [1, 1, 1] }))).toEqual({ kind: "sphere", radius: 0.5 });
    expect(shapeOf(primitives.capsule({ name: "tall", size: [0.5, 1.6, 0.5] }))).toMatchObject({ kind: "capsule", radius: 0.25 });
    expect(shapeOf(primitives.cylinder({ name: "post", size: [0.6, 1.0, 0.6] }))).toMatchObject({ kind: "capsule", radius: 0.3 });
  });

  test("a ball dropped near the rim of a wide disc lands on the disc, not through it", () => {
    const source = scene()
      .add(primitives.plane({ name: "ground" }).physics({ type: "static", shape: "plane" }))
      .add(primitives.cylinder({ name: "disc", size: [2, 0.5, 2] }).position(0, 0.25, 0).physics({ type: "static" }))
      .add(primitives.sphere({ name: "ball", size: 0.3 }).position(0.8, 2, 0).physics({ type: "dynamic", mass: 1 }));
    const world = physics.worldFromScene(source, { gravity: [0, -9.81, 0], enableSleeping: false });
    for (let step = 0; step < 240; step += 1) physics.step(world, 1 / 60);
    const ball = world.snapshot().snapshot.bodies.find((body) => body.type === "dynamic")!;
    // Disc top is at y 0.5; the ball (radius 0.15) rests on it at about 0.65 (was the ground, 0.15).
    expect(ball.position[1]).toBeGreaterThan(0.6);
    expect(ball.position[1]).toBeLessThan(0.7);
  });
});
