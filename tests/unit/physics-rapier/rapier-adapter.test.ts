import * as CompatRapier from "@dimforge/rapier3d-compat";
import { describe, expect, it } from "vitest";
import { createRapierPhysics, type RapierModule } from "@aura3d/physics-rapier";

const moduleLoader = async (): Promise<RapierModule> => CompatRapier as unknown as RapierModule;

describe("optional Rapier physical adapter", () => {
  it("constructs, steps, queries, mutates, and disposes rigid bodies", async () => {
    const world = await createRapierPhysics({ moduleLoader });
    world.createBody({ type: "fixed", position: [0, -0.5, 0], shape: { kind: "box", halfExtents: [10, 0.5, 10] } });
    const ball = world.createBody({ position: [0, 4, 0], ccd: true, shape: { kind: "sphere", radius: 0.5 } });
    ball.applyForce([0, 1, 0]).applyImpulse([0.5, 0, 0]);
    for (let index = 0; index < 120; index += 1) world.step();
    expect(ball.position()[1]).toBeGreaterThan(0.45);
    expect(ball.position()[1]).toBeLessThan(0.7);
    const hit = world.raycast([ball.position()[0], 5, 0], [0, -1, 0], 10);
    expect(hit?.timeOfImpact).toBeGreaterThanOrEqual(0);
    expect(world.bodies()).toHaveLength(2);
    ball.remove();
    expect(world.bodies()).toHaveLength(1);
    world.dispose();
    expect(world.disposed).toBe(true);
    expect(() => world.step()).toThrow(/disposed/);
  });

  it("uses native CCD for a fast body", async () => {
    const world = await createRapierPhysics({ gravity: [0, 0, 0], moduleLoader });
    world.createBody({ type: "fixed", shape: { kind: "box", halfExtents: [5, 0.05, 5] } });
    const bullet = world.createBody({ position: [0, 6, 0], linearVelocity: [0, -400, 0], ccd: true, shape: { kind: "sphere", radius: 0.1 } });
    for (let index = 0; index < 60; index += 1) world.step();
    expect(bullet.position()[1]).toBeGreaterThan(0);
    world.dispose();
  });

  it("constructs and removes native joints, character controllers, and vehicle controllers", async () => {
    const world = await createRapierPhysics({ moduleLoader });
    const anchor = world.createBody({ type: "fixed", position: [0, 4, 0], shape: { kind: "sphere", radius: 0.2 } });
    const chassis = world.createBody({ position: [0, 3, 0], shape: { kind: "box", halfExtents: [1, 0.25, 2] } });
    expect(world.createFixedJoint(anchor, chassis)).toBeTruthy();
    const character = world.createCharacterController().enableAutostep(0.5, 0.2).enableSnapToGround(0.2).setMaxSlopeClimbAngle(Math.PI / 4);
    const vehicle = world.createVehicleController(chassis).addWheel([1, 0, 1], [0, -1, 0], [1, 0, 0], 0.3, 0.4);
    vehicle.update(1 / 60);
    world.step();
    vehicle.dispose();
    character.dispose();
    world.dispose();
    expect(world.disposed).toBe(true);
  });

  it("can repeatedly mount and dispose without retaining adapter state", async () => {
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const world = await createRapierPhysics({ moduleLoader });
      world.createBody({ shape: { kind: "capsule", halfHeight: 0.5, radius: 0.25 } });
      world.step();
      world.dispose();
      expect(world.disposed).toBe(true);
      expect(world.bodies()).toEqual([]);
    }
  });
});
