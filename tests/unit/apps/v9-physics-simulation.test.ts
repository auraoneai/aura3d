import { describe, expect, it } from "vitest";
import { createPhysicsPlaygroundSimulation } from "../../../apps/v9-advanced-examples-gallery/src/physicsSimulation";

describe("v9 physics playground simulation", () => {
  it("advances gallery objects through the real PhysicsWorld contact path", () => {
    const simulation = createPhysicsPlaygroundSimulation();
    const initial = simulation.advance({
      time: 0,
      gravityScale: 1,
      conveyorSpeed: 1.2,
      pusherEnabled: true,
      spawnToken: 1
    });

    let frame = initial;
    for (let step = 1; step <= 150; step += 1) {
      frame = simulation.advance({
        time: step / 60,
        gravityScale: 1,
        conveyorSpeed: 1.2,
        pusherEnabled: true,
        spawnToken: 1
      });
    }

    expect(frame.stats.steps).toBeGreaterThan(0);
    expect(frame.stats.bodies).toBeGreaterThanOrEqual(60);
    expect(frame.stats.colliders).toBe(frame.stats.bodies);
    expect(frame.stats.broadphasePairs).toBeGreaterThan(0);
    expect(frame.stats.contacts).toBeGreaterThan(0);
    expect(frame.activeBodies).toBeGreaterThan(0);
    expect(frame.velocityVectors.length).toBeGreaterThan(10);
    expect(frame.bodies.some((body, index) => distance(body.position, initial.bodies[index]?.position ?? body.position) > 0.25)).toBe(true);
  });

  it("resets deterministically when the spawn token changes", () => {
    const simulation = createPhysicsPlaygroundSimulation();
    const before = simulation.advance({
      time: 0,
      gravityScale: 1,
      conveyorSpeed: 1,
      pusherEnabled: false,
      spawnToken: 2
    });

    for (let step = 1; step <= 30; step += 1) {
      simulation.advance({
        time: step / 60,
        gravityScale: 1,
        conveyorSpeed: 1,
        pusherEnabled: false,
        spawnToken: 2
      });
    }

    const after = simulation.advance({
      time: 1,
      gravityScale: 1,
      conveyorSpeed: 1,
      pusherEnabled: false,
      spawnToken: 3
    });

    expect(after.stats.steps).toBe(0);
    expect(after.bodies).toHaveLength(before.bodies.length);
    expect(distance(after.bodies[0]!.position, before.bodies[0]!.position)).toBeGreaterThan(0.01);
  });
});

function distance(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}
