import { describe, expect, it } from "vitest";
import { game } from "../../../packages/engine/src";

describe("game.kinematicBody", () => {
  it("moves, jumps, clamps, snaps, and reports AABB bounds deterministically", () => {
    const body = game.kinematicBody({
      id: "runner",
      position: [0, 0, 0],
      size: [1, 2, 0.5],
      gravity: -12,
      friction: 0,
      bounds: { minX: -1, maxX: 1, minZ: -0.25, maxZ: 0.25 }
    });

    expect(body.snapshot()).toMatchObject({
      kind: "aura-game-kinematic-body",
      id: "runner",
      position: [0, 0, 0],
      velocity: [0, 0, 0],
      grounded: true,
      facing: 1
    });

    body.move(1, 4);
    let snapshot = body.update(0.25);

    expect(snapshot.position).toEqual([1, 0, 0]);
    expect(snapshot.velocity).toEqual([4, 0, 0]);
    expect(snapshot.facing).toBe(1);

    body.move(-1, 2);
    snapshot = body.update(0.25);

    expect(snapshot.position).toEqual([0.5, 0, 0]);
    expect(snapshot.velocity).toEqual([-2, 0, 0]);
    expect(snapshot.facing).toBe(-1);

    expect(body.jump(6)).toBe(true);
    snapshot = body.update(0.25);

    expect(snapshot.grounded).toBe(false);
    expect(snapshot.position[1]).toBeCloseTo(0.75);
    expect(snapshot.velocity[1]).toBeCloseTo(3);
    expect(body.jump()).toBe(false);

    body.applyKnockback([2, 1, 0]);
    expect(body.facing).toBe(-1);

    body.snapToGround();
    expect(body.grounded).toBe(true);
    expect(body.velocity[1]).toBeGreaterThanOrEqual(0);

    expect(body.bounds()).toEqual({
      center: [0, 0, 0],
      size: [1, 2, 0.5],
      min: [-0.5, -1, -0.25],
      max: [0.5, 1, 0.25]
    });
  });
});
