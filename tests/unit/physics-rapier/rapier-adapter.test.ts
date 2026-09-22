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
    const vehicle = world.createVehicleController(chassis).addWheel({
      connection: [1, 0, 1], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.3, radius: 0.4,
    });
    vehicle.update(1 / 60);
    world.step();
    vehicle.dispose();
    character.dispose();
    world.dispose();
    expect(world.disposed).toBe(true);
  });

  it("drives a four-wheel vehicle: wheels ground on the floor and engine force moves the chassis", async () => {
    const world = await createRapierPhysics({ moduleLoader, gravity: [0, -9.81, 0] });
    world.createBody({ type: "fixed", position: [0, -0.5, 0], shape: { kind: "box", halfExtents: [20, 0.5, 20] } });
    const chassis = world.createBody({
      type: "dynamic",
      position: [0, 1.2, 0],
      shape: { kind: "box", halfExtents: [0.9, 0.3, 1.8] },
      mass: 120,
      linearDamping: 0.05,
      angularDamping: 2.5,
    });

    const vehicle = world.createVehicleController(chassis);
    vehicle.upAxis = 1;
    vehicle.forwardAxis = 2;
    // Front-left, front-right, rear-left, rear-right.
    for (const [x, z] of [[0.9, 1.2], [-0.9, 1.2], [0.9, -1.2], [-0.9, -1.2]] as const) {
      vehicle.addWheel({
        connection: [x, -0.2, z],
        direction: [0, -1, 0],
        axle: [1, 0, 0],
        restLength: 0.35,
        radius: 0.35,
        suspensionStiffness: 42,
        suspensionCompression: 2.4,
        suspensionRelaxation: 3.4,
        frictionSlip: 12,
        maxSuspensionForce: 4000,
        maxSuspensionTravel: 0.25,
      });
    }
    expect(vehicle.wheelCount()).toBe(4);

    // Settle the suspension before judging motion.
    for (let i = 0; i < 40; i += 1) { vehicle.update(1 / 60); world.step(); }
    expect(vehicle.isGrounded()).toBe(true);
    expect(vehicle.groundedWheelCount()).toBeGreaterThan(0);
    const restingY = chassis.position()[1];

    // Rear wheels drive; front wheels steer.
    vehicle.setWheelCommand(2, { engineForce: 900 });
    vehicle.setWheelCommand(3, { engineForce: 900 });
    vehicle.setWheelCommand(0, { steering: 0 });
    vehicle.setWheelCommand(1, { steering: 0 });
    const startZ = chassis.position()[2];
    for (let i = 0; i < 90; i += 1) { vehicle.update(1 / 60); world.step(); }

    const moved = chassis.position()[2] - startZ;
    expect(Math.abs(moved)).toBeGreaterThan(0.25);
    // Rapier reports signed speed along the chassis forward axis, and the sign
    // depends on that axis convention rather than on the tyre model, so the
    // claim worth pinning is that the drivetrain produced real motion.
    expect(Math.abs(vehicle.currentVehicleSpeed())).toBeGreaterThan(0.5);
    // Suspension held the chassis up rather than letting it sink through the floor.
    expect(chassis.position()[1]).toBeGreaterThan(restingY - 0.5);

    const states = vehicle.wheelStates();
    expect(states).toHaveLength(4);
    expect(states.some((state) => state.isInContact && state.contactPoint !== null)).toBe(true);

    vehicle.dispose();
    world.dispose();
  });

  it("rejects invalid wheel configuration instead of silently producing a floating car", async () => {
    const world = await createRapierPhysics({ moduleLoader });
    const chassis = world.createBody({ position: [0, 2, 0], shape: { kind: "box", halfExtents: [1, 0.3, 2] } });
    const vehicle = world.createVehicleController(chassis);
    expect(() => vehicle.addWheel({ connection: [1, 0, 1], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0, radius: 0.4 })).toThrow();
    expect(() => vehicle.addWheel({ connection: [1, 0, 1], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.3, radius: -0.4 })).toThrow();
    expect(() => vehicle.wheelState(0)).toThrow();
    expect(() => { vehicle.upAxis = 7 as never; }).toThrow();
    vehicle.dispose();
    world.dispose();
  });

  it("computes grounded kinematic character movement against real colliders", async () => {
    const world = await createRapierPhysics({ moduleLoader });
    world.createBody({ type: "fixed", position: [0, -0.5, 0], shape: { kind: "box", halfExtents: [10, 0.5, 10] } });
    const body = world.createBody({ type: "kinematic-position", position: [0, 1, 0], shape: { kind: "capsule", halfHeight: 0.5, radius: 0.25 } });
    const character = world.createCharacterController(0.01).enableAutostep(0.4, 0.2).enableSnapToGround(0.2).setMaxSlopeClimbAngle(Math.PI / 4);
    world.step();
    const falling = character.move(body, [0, -1, 0]);
    expect(falling.applied[1]).toBeGreaterThan(-1);
    expect(falling.collisions).toBeGreaterThanOrEqual(1);
    world.step();
    const moving = character.move(body, [0.5, -0.05, 0]);
    world.step();
    expect(moving.applied[0]).toBeGreaterThan(0.45);
    expect(body.position()[0]).toBeGreaterThan(0.45);
    expect(moving.grounded).toBe(true);
    character.dispose();
    world.dispose();
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
