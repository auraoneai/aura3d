import { describe, expect, it } from "vitest";
import { PhysicsWorld } from "@aura3d/physics";

const wheel = {
  connection: [0.5, -0.2, 0] as const,
  direction: [0, -2, 0] as const,
  axle: [3, 0, 0] as const,
  restLength: 0.4,
  radius: 0.3,
  suspensionStiffness: 40,
  frictionSlip: 5
};

function fixture() {
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0] });
  const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
  const floorCollider = world.createCollider(floor, { shape: { kind: "box", halfExtents: [10, 0.5, 10] } });
  const chassis = world.createRigidBody({ type: "dynamic", position: [0, 0.65, 0], mass: 10 });
  world.createCollider(chassis, { shape: { kind: "box", halfExtents: [0.4, 0.2, 0.5] } });
  const vehicle = world.createVehicleController(chassis);
  vehicle.addWheel(wheel);
  vehicle.setAxes(1, 2);
  return { world, floorCollider, chassis, vehicle };
}

describe("physical vehicle lifecycle and input contracts", () => {
  it("validates a complete wheel before it is registered", () => {
    const { world, vehicle } = fixture();
    try {
      expect(vehicle.wheelCount).toBe(1);
      expect(() => vehicle.addWheel({ ...wheel, suspensionStiffness: -1 })).toThrow(/suspensionStiffness/);
      expect(() => vehicle.addWheel({ ...wheel, direction: [0, 0, 0] })).toThrow(/direction/);
      expect(() => vehicle.addWheel({ ...wheel, axle: [0, 2, 0] })).toThrow(/parallel/);
      expect(() => vehicle.addWheel({ ...wheel, radius: Number.NaN })).toThrow(/radius/);
      expect(vehicle.wheelCount).toBe(1);
    } finally {
      world.dispose();
    }
  });

  it("rejects invalid controls and tuning without partially updating a wheel", () => {
    const { world, vehicle } = fixture();
    try {
      vehicle.setWheelCommand(0, { engineForce: 12, brake: 2, steering: 0.1 });
      expect(() => vehicle.setWheelCommand(0, { engineForce: 20, brake: -1 })).toThrow(/brake/);
      expect(vehicle.wheelState(0)).toMatchObject({ engineForce: 12, brake: 2, steering: expect.closeTo(0.1) });
      expect(() => vehicle.setWheelTuning(0, { frictionSlip: 3, maxSuspensionTravel: -1 })).toThrow(/maxSuspensionTravel/);
      expect(vehicle.wheelState(0).frictionSlip).toBeCloseTo(5);
      expect(() => vehicle.setAxes(1, 1)).toThrow(/differ/);
      expect(() => vehicle.step(0)).toThrow(/positive/);
      expect(() => vehicle.step(-1)).toThrow(/positive/);
      expect(() => vehicle.setWheelCommand(0, { engineForce: Infinity })).toThrow(/finite/);
    } finally {
      world.dispose();
    }
  });

  it("resets the entire pose and invalidates contacts until the next wheel update", () => {
    const { world, floorCollider, chassis, vehicle } = fixture();
    try {
      vehicle.step(1 / 60);
      expect(vehicle.isGrounded()).toBe(true);
      expect(vehicle.wheelState(0).groundColliderHandle).toBe(floorCollider.id);
      vehicle.resetToPose({
        position: [0, 0.65, 0],
        rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
        linearVelocity: [2, 3, 4],
        angularVelocity: [1, 2, 3]
      });
      vehicle.setWheelCommand(0, { engineForce: 50, brake: 2, steering: 0.2 });
      vehicle.resetToPose({ position: [0, 5, 0] });
      expect(vehicle.position()).toEqual([0, 5, 0]);
      expect(vehicle.rotation()).toEqual([0, 0, 0, 1]);
      expect(vehicle.linearVelocity()).toEqual([0, 0, 0]);
      expect(vehicle.angularVelocity()).toEqual([0, 0, 0]);
      expect(chassis.position).toEqual([0, 5, 0]);
      expect(vehicle.wheelState(0)).toMatchObject({
        grounded: false, contactPoint: null, contactNormal: null, groundColliderHandle: null,
        engineForce: 0, brake: 0, steering: 0, suspensionForce: 0, forwardImpulse: 0, sideImpulse: 0
      });
      expect(vehicle.isGrounded()).toBe(false);
      expect(vehicle.groundedWheelCount()).toBe(0);
      vehicle.step(1 / 60);
      expect(vehicle.isGrounded()).toBe(false);
    } finally {
      world.dispose();
    }
  });

  it("rejects a malformed reset without changing pose or commands", () => {
    const { world, vehicle } = fixture();
    try {
      vehicle.setWheelCommand(0, { engineForce: 50 });
      const before = vehicle.position();
      expect(() => vehicle.resetToPose({ position: [3, 5, 2], angularVelocity: [0, NaN, 0] })).toThrow(/angular velocity/);
      expect(vehicle.position()).toEqual(before);
      expect(vehicle.wheelState(0).engineForce).toBe(50);
      expect(() => vehicle.resetToPose({ position: [3, 5, 2], rotation: [0, 0, 0, 0] })).toThrow(/rotation/);
      expect(vehicle.position()).toEqual(before);
    } finally {
      world.dispose();
    }
  });

  it("invalidates controllers on disposal, chassis removal and world disposal", () => {
    const first = fixture();
    first.vehicle.dispose();
    first.vehicle.dispose();
    expect(() => first.vehicle.wheelState(0)).toThrow(/disposed/i);
    first.world.dispose();

    const second = fixture();
    second.world.removeRigidBody(second.chassis.id);
    expect(() => second.vehicle.step(1 / 60)).toThrow(/disposed/i);
    second.world.dispose();

    const third = fixture();
    third.world.dispose();
    expect(() => third.vehicle.position()).toThrow(/disposed/i);
    expect(() => third.vehicle.dispose()).not.toThrow();
  });
});
