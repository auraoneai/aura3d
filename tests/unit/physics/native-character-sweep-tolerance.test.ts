import { describe, expect, it } from "vitest";
import { Collider } from "../../../packages/physics/src/Collider.js";
import { RigidBody } from "../../../packages/physics/src/RigidBody.js";
import { Shape } from "../../../packages/physics/src/Shape.js";
import { nativeSweepCollider } from "../../../packages/physics/src/native/NativeQueries.js";

describe("native character sweep tangencies", () => {
  const shape = Shape.box(0.2, 0.6, 0.2);
  const rotation = [0, 0, 0, 1] as const;

  it("treats a box moving along a decimal-coordinate ledge as tangent", () => {
    const body = new RigidBody(1, { type: "static", position: [0.8, 0.15, 0] });
    const collider = new Collider(1, body.id, { shape: Shape.box(0.3, 0.15, 1) });
    expect(nativeSweepCollider(shape, [0.5, 0.91, 0], rotation, [0.5, 0, 0], collider, body, 0.01)).toBeUndefined();
  });

  it("still finds a later wall in the same mesh after tangent floor triangles", () => {
    const body = new RigidBody(1, { type: "static" });
    const collider = new Collider(1, body.id, { shape: Shape.mesh([
      [-3, 0.3, -3], [-3, 0.3, 3], [3, 0.3, -3], [3, 0.3, 3],
      [1.3, 0.3, -3], [1.3, 3, -3], [1.3, 0.3, 3], [1.3, 3, 3]
    ], [0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6]) });
    const hit = nativeSweepCollider(shape, [0.5, 0.91, 0], rotation, [1, 0, 0], collider, body, 0.01);
    expect(hit).toBeDefined();
    expect(hit!.fraction).toBeCloseTo(0.59, 6);
    expect(hit!.normal[0]).toBeCloseTo(-1, 6);
    expect(hit!.point[0]).toBeCloseTo(1.3, 6);
  });
});
