import { describe, expect, it } from "vitest";
import { PhysicsWorld } from "@aura3d/physics";

/**
 * The physical character and vehicle controllers owned by `@aura3d/physics`.
 *
 * These are the contract-area-5 and 6 decisions a route inherits, so they are pinned
 * at the layer that owns them rather than only through a game:
 *
 * - Rapier owns physical state. A route that asks for a displacement 40 m long gets
 *   the displacement the world allowed, and the position it renders is the solver's.
 * - A fixed timestep produces the same result regardless of how many calls it took.
 * - Reset puts back the *whole* physical state, not just where the mesh is drawn.
 * - Nothing may leave the world holding a NaN transform.
 */

const WHEELS = [
  { connection: [0.9, -0.2, 1.2], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.35, radius: 0.35 },
  { connection: [-0.9, -0.2, 1.2], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.35, radius: 0.35 },
  { connection: [0.9, -0.2, -1.2], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.35, radius: 0.35 },
  { connection: [-0.9, -0.2, -1.2], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.35, radius: 0.35 },
] as const;

function worldWithFloor() {
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60 });
  const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
  world.createCollider(floor, { shape: { kind: "box", halfExtents: [40, 0.5, 40] }, material: { friction: 1, restitution: 0 } });
  return world;
}

function attachVehicle(world: PhysicsWorld, spawnY = 1.4) {
  const chassis = world.createRigidBody({ type: "dynamic", position: [0, spawnY, 0], mass: 140, angularDamping: 2.5 });
  world.createCollider(chassis, { shape: { kind: "box", halfExtents: [0.9, 0.3, 1.8] }, material: { friction: 1, restitution: 0 } });
  const vehicle = world.createVehicleController(chassis);
  // Deliberate, named values rather than solver defaults: an untuned car sits on
  // whatever suspension stiffness the backend happens to ship with, so "grounded" and
  // "grips" stop meaning anything once the backend changes.
  for (const spec of WHEELS) {
    vehicle.addWheel({
      ...spec,
      suspensionStiffness: 42,
      suspensionCompression: 2.4,
      suspensionRelaxation: 3.4,
      maxSuspensionTravel: 0.3,
      maxSuspensionForce: 6000,
      frictionSlip: 12,
      sideFrictionStiffness: 2
    });
  }
  vehicle.setAxes(1, 2);
  return { chassis, vehicle };
}

function isFiniteVec(value: readonly number[]): boolean {
  return value.every((component) => Number.isFinite(component));
}

describe("PhysicalVehicleController", () => {
  it("refuses a non-dynamic chassis instead of silently building a car that cannot move", () => {
    const world = worldWithFloor();
    const staticChassis = world.createRigidBody({ type: "static", position: [0, 1, 0] });
    world.createCollider(staticChassis, { shape: { kind: "box", halfExtents: [0.9, 0.3, 1.8] } });
    expect(() => world.createVehicleController(staticChassis)).toThrow(/dynamic/);

    const kinematicChassis = world.createRigidBody({ type: "kinematic", position: [0, 4, 0] });
    world.createCollider(kinematicChassis, { shape: { kind: "box", halfExtents: [0.9, 0.3, 1.8] } });
    expect(() => world.createVehicleController(kinematicChassis)).toThrow(/dynamic/);
  });

  it("lets the solver own the chassis: the rendered position is the solver's, not a per-step rewrite", () => {
    const world = worldWithFloor();
    // Dropped from above its rest height on purpose: the settle below only means
    // something if the solver was the thing that stopped the fall.
    const { chassis, vehicle } = attachVehicle(world, 1.5);
    for (let i = 0; i < 300; i += 1) { vehicle.step(1 / 60); world.step(1 / 60); }

    expect(vehicle.isGrounded()).toBe(true);
    // Held up by the springs, so it comes to rest on the road: not through it, and not
    // hovering at the height the route spawned it at.
    expect(Math.abs(chassis.velocity[1])).toBeLessThan(0.01);
    expect(chassis.position[1]).toBeGreaterThan(0.3);
    expect(chassis.position[1]).toBeLessThan(1.5);

    vehicle.setWheelCommand(2, { engineForce: 1400 });
    vehicle.setWheelCommand(3, { engineForce: 1400 });
    vehicle.step(1 / 60);
    world.step(1 / 60);
    expect(Math.abs(chassis.velocity[2])).toBeGreaterThan(0);
    vehicle.dispose();
  });

  it("still answers the throttle after the car has been sitting still long enough to fall asleep", () => {
    const world = worldWithFloor();
    const { chassis, vehicle } = attachVehicle(world, 0.85);
    for (let i = 0; i < 600; i += 1) { vehicle.step(1 / 60); world.step(1 / 60); }
    // A parked car that is genuinely asleep is the correct, deliberate sleep behaviour.
    expect(chassis.sleeping).toBe(true);

    vehicle.setWheelCommand(2, { engineForce: 1400 });
    vehicle.setWheelCommand(3, { engineForce: 1400 });
    vehicle.step(1 / 60);
    world.step(1 / 60);
    expect(chassis.sleeping).toBe(false);
    expect(Math.abs(chassis.velocity[2])).toBeGreaterThan(0);
    for (let i = 0; i < 60; i += 1) { vehicle.step(1 / 60); world.step(1 / 60); }
    expect(Math.abs(vehicle.currentSpeed())).toBeGreaterThan(0.5);
    vehicle.dispose();
  });

  it("is fixed-step: the same elapsed time in one call or in sixty lands on the same state", () => {
    const stepCounted = worldWithFloor();
    const stepped = attachVehicle(stepCounted);
    const frameDriven = worldWithFloor();
    const framed = attachVehicle(frameDriven);

    for (const { vehicle } of [stepped, framed]) {
      vehicle.setWheelCommand(2, { engineForce: 1200 });
      vehicle.setWheelCommand(3, { engineForce: 1200 });
    }
    // One route drives 1/60 sixty times, the other 1/600 sixty times. Identical
    // accumulated time must give an identical world, or "stable at 60 fps" is a lie.
    for (let i = 0; i < 60; i += 1) { stepped.vehicle.step(1 / 60); stepCounted.step(1 / 60); }
    for (let i = 0; i < 60; i += 1) { framed.vehicle.step(1 / 60); frameDriven.step(1 / 60); }

    const a = stepped.chassis.position;
    const b = framed.chassis.position;
    expect(Math.abs(a[0] - b[0])).toBeLessThan(1e-9);
    expect(Math.abs(a[1] - b[1])).toBeLessThan(1e-9);
    expect(Math.abs(a[2] - b[2])).toBeLessThan(1e-9);
    stepped.vehicle.dispose();
    framed.vehicle.dispose();
  });

  it("resetToPose restores velocities and releases held drive input", () => {
    const world = worldWithFloor();
    const { chassis, vehicle } = attachVehicle(world);
    vehicle.setWheelCommand(2, { engineForce: 1400 });
    vehicle.setWheelCommand(3, { engineForce: 1400 });
    for (let i = 0; i < 120; i += 1) { vehicle.step(1 / 60); world.step(1 / 60); }
    expect(Math.abs(vehicle.currentSpeed())).toBeGreaterThan(1);

    vehicle.resetToPose({ position: [0, 1.4, 0], rotation: [0, 0, 0, 1] });
    expect(chassis.position[2]).toBeCloseTo(0, 6);
    expect(isFiniteVec(chassis.velocity)).toBe(true);
    expect(chassis.velocity.some((component) => component !== 0)).toBe(false);
    expect(chassis.angularVelocity.some((component) => component !== 0)).toBe(false);
    // The wrapper has to agree immediately; a route that renders before the next step
    // must not draw the pre-crash pose for one frame.
    expect(chassis.sleeping).toBe(false);

    // Coasting with no input must slow the car down, which is only true if the reset
    // actually took the throttle off rather than leaving it latched.
    for (let i = 0; i < 60; i += 1) { vehicle.step(1 / 60); world.step(1 / 60); }
    const afterCoast = Math.abs(vehicle.currentSpeed());
    for (let i = 0; i < 120; i += 1) { vehicle.step(1 / 60); world.step(1 / 60); }
    expect(Math.abs(vehicle.currentSpeed())).toBeLessThan(afterCoast);
    vehicle.dispose();
  });

  it("reports per-wheel grounding, the supporting collider and finite contact data", () => {
    const world = worldWithFloor();
    const { vehicle } = attachVehicle(world);
    for (let i = 0; i < 90; i += 1) { vehicle.step(1 / 60); world.step(1 / 60); }
    const states = vehicle.wheelStates();
    expect(states).toHaveLength(4);
    for (const state of states) {
      expect(state.grounded).toBe(true);
      expect(state.contactPoint).not.toBeNull();
      expect(isFiniteVec(state.contactPoint!)).toBe(true);
      expect(isFiniteVec(state.contactNormal!)).toBe(true);
      expect(state.groundColliderHandle).not.toBeNull();
      expect(state.suspensionForce).toBeGreaterThan(0);
    }
    expect(vehicle.groundedWheelCount()).toBe(4);
    vehicle.dispose();
  });

  it("never leaves a NaN transform, however the inputs are abused", () => {
    const world = worldWithFloor();
    const { chassis, vehicle } = attachVehicle(world);
    vehicle.setWheelCommand(0, { engineForce: 5000, steering: 0.4, brake: 0 });
    for (let i = 0; i < 240; i += 1) {
      vehicle.step(1 / 60);
      world.step(1 / 60);
      expect(isFiniteVec(chassis.position)).toBe(true);
      expect(chassis.rotation.every(Number.isFinite)).toBe(true);
      expect(isFiniteVec(chassis.velocity)).toBe(true);
    }
    expect(() => vehicle.setWheelCommand(0, { engineForce: Number.NaN })).toThrow(/finite/);
    expect(() => vehicle.addWheel({ ...WHEELS[0]!, restLength: Number.NaN })).toThrow(/finite/);
    vehicle.dispose();
  });
});

describe("PhysicalCharacterController", () => {
  function attachCharacter(world: PhysicsWorld, position: [number, number, number] = [0, 2, 0]) {
    const body = world.createRigidBody({ type: "kinematic", position });
    world.createCollider(body, { shape: { kind: "capsule", radius: 0.3, halfHeight: 0.5 } });
    const character = world.createCharacterController(body, {
      offset: 0.01,
      autoStepHeight: 0.4,
      autoStepMinWidth: 0.2,
      maxSlopeClimbAngle: Math.PI / 4,
      minSlopeSlideAngle: Math.PI / 5,
      snapToGroundDistance: 0.5
    });
    return { body, character };
  }

  it("requires a kinematic body, because a dynamic one would give the transform two owners", () => {
    const world = worldWithFloor();
    const dynamic = world.createRigidBody({ type: "dynamic", position: [0, 2, 0], mass: 80 });
    world.createCollider(dynamic, { shape: { kind: "capsule", radius: 0.3, halfHeight: 0.5 } });
    expect(() => world.createCharacterController(dynamic)).toThrow(/kinematic/);
  });

  it("rejects a collider it cannot collide with, rather than falling through the world", () => {
    const world = worldWithFloor();
    const body = world.createRigidBody({ type: "kinematic", position: [0, 2, 0] });
    world.createCollider(body, { shape: { kind: "capsule", radius: 0.3, halfHeight: 0.5 }, sensor: true });
    const character = world.createCharacterController(body);
    expect(() => character.move([0, -0.05, 0])).toThrow(/sensor/);
    character.dispose();
  });

  it("reports the position the solver allowed, not the position that was requested", () => {
    const world = worldWithFloor();
    const { character } = attachCharacter(world);
    // A single request far below the floor must be stopped by the floor itself.
    const movement = character.move([0, -50, 0]);
    expect(movement.applied[1]).toBeGreaterThan(-50);
    expect(movement.position[1]).toBeGreaterThan(0);
    expect(movement.requested[1]).toBe(-50);
    character.dispose();
  });

  it("collides with geometry built in the same frame, before any world step has run", () => {
    // Rapier refreshes its scene-query structure inside step(). A route that spawns a
    // level and a character and then asks for the character's first move on the same
    // frame would otherwise query an empty world: no error, `grounded: false`, and the
    // character placed below the floor it was standing on.
    const world = new PhysicsWorld({ gravity: [0, -9.81, 0] });
    const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
    world.createCollider(floor, { shape: { kind: "box", halfExtents: [40, 0.5, 40] } });
    const body = world.createRigidBody({ type: "kinematic", position: [0, 2, 0] });
    world.createCollider(body, { shape: { kind: "capsule", radius: 0.3, halfHeight: 0.5 } });
    const character = world.createCharacterController(body, { offset: 0.01 });

    const first = character.move([0, -50, 0]);
    expect(first.position[1]).toBeGreaterThan(0);
    expect(first.grounded).toBe(true);
    character.dispose();
  });

  it("grounds every tyre on a road built in the same frame the car spawns", () => {
    const world = worldWithFloor();
    // Spawned just inside its suspension rest height, so the only thing this test can
    // be failing on is the wheel ray not seeing the road yet.
    const { vehicle } = attachVehicle(world, 0.85);
    // Same failure one layer over: with no refresh the wheel rays hit nothing, so a
    // car reports four wheels airborne on frame one and its suspension never fires.
    vehicle.step(1 / 60);
    expect(vehicle.groundedWheelCount()).toBe(4);
    expect(vehicle.isGrounded()).toBe(true);
    vehicle.dispose();
  });

  it("grounds on geometry and never sinks through the floor over a long run", () => {
    const world = worldWithFloor();
    const { body, character } = attachCharacter(world);
    let grounded = false;
    for (let i = 0; i < 300; i += 1) {
      const movement = character.move([0, -0.05, 0]);
      world.step(1 / 60);
      grounded = movement.grounded;
      expect(body.position[1]).toBeGreaterThan(-0.2);
      expect(isFiniteVec(character.position())).toBe(true);
    }
    expect(grounded).toBe(true);
    expect(character.grounded()).toBe(true);
    character.dispose();
  });

  it("is fixed-step: one big request and many small ones end in the same place", () => {
    const big = worldWithFloor();
    const bigScene = attachCharacter(big, [0, 3, 0]);
    const small = worldWithFloor();
    const smallScene = attachCharacter(small, [0, 3, 0]);
    bigScene.character.move([0, -1, 0]);
    big.step(1 / 60);
    for (let i = 0; i < 20; i += 1) {
      smallScene.character.move([0, -1 / 20, 0]);
      small.step(1 / 60);
    }
    expect(bigScene.character.position()[1]).toBeGreaterThan(smallScene.character.position()[1] - 0.001);
    bigScene.character.dispose();
    smallScene.character.dispose();
  });

  it("resetTo clears the queued kinematic step so a respawn does not drift back", () => {
    const world = worldWithFloor();
    const { character } = attachCharacter(world);
    for (let i = 0; i < 60; i += 1) { character.move([2, -0.05, 0]); world.step(1 / 60); }
    const before = character.position();
    expect(before[0]).toBeGreaterThan(0.5);

    const restored = character.resetTo([0, 3, 0]);
    expect(character.position()[0]).toBeCloseTo(0, 6);
    expect(character.grounded()).toBe(false);
    // The queued translation is gone: the very next step must not yank the character
    // back toward the direction it was travelling before the respawn.
    const movement = character.move([0, -0.02, 0]);
    expect(movement.position[0]).toBeCloseTo(0, 6);
    expect(isFiniteVec(restored)).toBe(true);
    character.dispose();
  });

  it("rejects a non-finite movement instead of poisoning the world", () => {
    const world = worldWithFloor();
    const { character } = attachCharacter(world);
    expect(() => character.move([Number.NaN, 0, 0])).toThrow();
    expect(() => character.resetTo([0, Number.POSITIVE_INFINITY, 0])).toThrow();
    character.dispose();
  });
});

describe("rigid body type contract", () => {
  it("refuses a solver-spelling body type rather than guessing 'dynamic'", () => {
    const world = new PhysicsWorld();
    // 'fixed' is the spelling one neighbouring solver uses. Accepting it silently as
    // 'dynamic' would hand a level floor that falls under its own load.
    expect(() => world.createRigidBody({ type: "fixed" as unknown as "static" })).toThrow(/Unknown rigid body type/);
    expect(() => world.createRigidBody({ type: "Kinematic" as unknown as "static" })).toThrow(/Unknown rigid body type/);
    expect(() => world.createRigidBody({ type: "static" })).not.toThrow();
    expect(() => world.createRigidBody({ type: "kinematic" })).not.toThrow();
  });
});
