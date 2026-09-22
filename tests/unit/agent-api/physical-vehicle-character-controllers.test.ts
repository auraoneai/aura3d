import { describe, expect, it } from "vitest";
import { physics } from "@aura3d/engine";

/**
 * The public vehicle and character controller surface.
 *
 * Aura3D could already build a Rapier vehicle — but only through the optional
 * `@aura3d/physics-rapier` adapter, and its wheel handle exposed `addWheel` and
 * `update` with no way to apply throttle, brake, steering, or read a contact. A
 * game route therefore had no public path to physical vehicle or character motion,
 * which is why every driving/platforming route hand-rolled kinematic tracing and
 * the visible world drifted from the collision world.
 *
 * These tests pin the capability at the layer a game actually calls, and in
 * particular that `reset()` re-attaches controllers. A controller left bound to a
 * discarded chassis does not throw — it just silently stops moving the car, which
 * is the worst possible failure for a restart path.
 */

const FOUR_WHEELS = [
  { connection: [0.9, -0.2, 1.2], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.35, radius: 0.35 },
  { connection: [-0.9, -0.2, 1.2], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.35, radius: 0.35 },
  { connection: [0.9, -0.2, -1.2], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.35, radius: 0.35 },
  { connection: [-0.9, -0.2, -1.2], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.35, radius: 0.35 },
] as const;

function buildWorld() {
  const world = physics.world({ gravity: [0, -9.81, 0] });
  world.createBody({ type: "static", position: [0, -0.5, 0], shape: { kind: "box", halfExtents: [30, 0.5, 30] } });
  return world;
}

function attachVehicle(world: ReturnType<typeof physics.world>) {
  const chassis = world.createBody({
    type: "dynamic",
    position: [0, 1.2, 0],
    shape: { kind: "box", halfExtents: [0.9, 0.3, 1.8] },
    mass: 120,
    angularDamping: 2.5,
  });
  const vehicle = world.createVehicleController(chassis, FOUR_WHEELS.map((spec) => ({
    ...spec,
    suspensionStiffness: 42,
    suspensionCompression: 2.4,
    suspensionRelaxation: 3.4,
    frictionSlip: 12,
  })));
  vehicle.setAxes(1, 2);
  return { chassis, vehicle };
}

describe("public physical vehicle and character controllers", () => {
  it("drives a chassis with real suspension and reports grounding and contact", () => {
    const world = buildWorld();
    const { chassis, vehicle } = attachVehicle(world);
    expect(vehicle.wheelCount).toBe(4);

    for (let i = 0; i < 40; i += 1) { vehicle.step(1 / 60); world.step(1 / 60); }
    expect(vehicle.isGrounded()).toBe(true);
    expect(vehicle.groundedWheelCount()).toBeGreaterThan(0);

    const start = chassis.snapshot().position;
    vehicle.setWheelCommand(2, { engineForce: 900 });
    vehicle.setWheelCommand(3, { engineForce: 900 });
    for (let i = 0; i < 90; i += 1) { vehicle.step(1 / 60); world.step(1 / 60); }

    const travelled = Math.hypot(chassis.snapshot().position[0] - start[0], chassis.snapshot().position[2] - start[2]);
    expect(travelled).toBeGreaterThan(0.25);
    expect(Math.abs(vehicle.currentSpeed())).toBeGreaterThan(0.5);
    expect(vehicle.wheelStates().some((state) => state.grounded && state.contactPoint !== null)).toBe(true);

    vehicle.dispose();
  });

  it("keeps a held controller working across reset()", () => {
    const world = buildWorld();
    const { vehicle } = attachVehicle(world);

    for (let i = 0; i < 30; i += 1) { vehicle.step(1 / 60); world.step(1 / 60); }
    world.reset();

    // reset() rebuilds bodies, so a held RigidBody wrapper goes stale by design.
    // What must survive is the controller the game holds: same object, re-attached
    // to the fresh chassis by id, still able to ground and drive.
    expect(vehicle.wheelCount).toBe(4);
    for (let i = 0; i < 40; i += 1) { vehicle.step(1 / 60); world.step(1 / 60); }
    expect(vehicle.isGrounded()).toBe(true);

    vehicle.setWheelCommand(2, { engineForce: 900 });
    vehicle.setWheelCommand(3, { engineForce: 900 });
    for (let i = 0; i < 90; i += 1) { vehicle.step(1 / 60); world.step(1 / 60); }
    expect(Math.abs(vehicle.currentSpeed())).toBeGreaterThan(0.5);

    vehicle.dispose();
  });

  it("grounds a character on real geometry and stops it sinking through the floor", () => {
    const world = buildWorld();
    const body = world.createBody({
      type: "kinematic",
      position: [0, 2, 0],
      shape: { kind: "capsule", radius: 0.3, halfHeight: 0.5 },
    });
    const character = world.createCharacterController(body, {
      offset: 0.01,
      autoStepHeight: 0.4,
      autoStepMinWidth: 0.2,
      maxSlopeClimbAngle: Math.PI / 4,
      snapToGroundDistance: 0.5,
    });

    let grounded = false;
    for (let i = 0; i < 240 && !grounded; i += 1) {
      const movement = character.move([0, -0.05, 0]);
      world.step(1 / 60);
      grounded = movement.grounded;
      // The reported position is the authority; it must never fall below the floor.
      expect(movement.position[1]).toBeGreaterThan(-0.2);
    }
    expect(grounded).toBe(true);
    expect(character.grounded()).toBe(true);

    character.dispose();
  });

  it("exposes the controller types through the engine barrel without naming a solver", async () => {
    const source = await import("@aura3d/engine").then((m) => Object.keys(m.physics));
    expect(source).toContain("world");
    const world = physics.world();
    expect(typeof world.createVehicleController).toBe("function");
    expect(typeof world.createCharacterController).toBe("function");
  });
});
