import { describe, expect, it } from "vitest";
import { PhysicsWorld, Shape } from "@aura3d/physics";

describe("physics world ownership and lifecycle", () => {
  it("rejects foreign bodies even when their numeric IDs match", () => {
    const left = new PhysicsWorld({ gravity: [0, 0, 0] });
    const right = new PhysicsWorld({ gravity: [0, 0, 0] });
    try {
      const a = left.createRigidBody();
      const b = left.createRigidBody();
      const foreign = right.createRigidBody();
      expect(foreign.id).toBe(a.id);
      expect(() => left.createCollider(foreign, { shape: Shape.sphere(1) })).toThrow(/another PhysicsWorld/);
      expect(() => left.createConstraint({ type: "fixed", bodyA: foreign, bodyB: b })).toThrow(/outside this PhysicsWorld/);
      expect(() => left.createVehicleController(foreign)).toThrow(/another PhysicsWorld/);
      expect(() => left.createCharacterController(foreign)).toThrow(/another PhysicsWorld/);
      expect(left.snapshot().stats).toMatchObject({ bodies: 2, colliders: 0, constraints: 0 });
      expect(left.getBody(a.id)).toBe(a);
    } finally { left.dispose(); right.dispose(); }
  });

  it("validates before allocation and owns a detached immutable shape", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    try {
      const dynamic = world.createRigidBody();
      const fixed = world.createRigidBody({ type: "static" });
      expect(() => world.createCollider(dynamic, { shape: Shape.plane() })).toThrow(/only on static/);
      expect(() => world.createCollider(dynamic, { shape: { kind: "sphere", radius: NaN } })).toThrow(/radius/);
      expect(() => world.createCollider(fixed, { shape: Shape.sphere(1), filter: { layer: 1 << 16 } })).toThrow(/16 bits/);
      expect(world.colliders()).toHaveLength(0);
      const extents: [number, number, number] = [1, 1, 1];
      const collider = world.createCollider(fixed, { shape: { kind: "box", halfExtents: extents } });
      extents[0] = 9;
      expect(collider.id).toBe(1);
      expect(collider.shape).toEqual({ kind: "box", halfExtents: [1, 1, 1] });
      expect(Object.isFrozen(collider.shape)).toBe(true);
      expect(Object.isFrozen(collider.filter)).toBe(true);
    } finally { world.dispose(); }
  });

  it("retains end events and retires joints before removing their body", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    const sensor = world.createRigidBody({ type: "static" });
    world.createCollider(sensor, { shape: Shape.sphere(2), sensor: true });
    const body = world.createRigidBody();
    world.createCollider(body, { shape: Shape.sphere(0.5) });
    world.createConstraint({ type: "fixed", bodyA: sensor, bodyB: body });
    expect(world.step().some((event) => event.type === "begin" && event.contact.sensor)).toBe(true);
    expect(() => world.removeRigidBody(body.id)).not.toThrow();
    expect(world.constraints()).toHaveLength(0);
    expect(world.drainEvents().some((event) => event.type === "end" && event.contact.sensor)).toBe(true);
    expect(world.snapshot().contacts).toHaveLength(0);
    world.dispose();
    expect(() => world.dispose()).not.toThrow();
    expect(() => world.step()).toThrow(/disposed/);
    expect(() => world.snapshot()).toThrow(/disposed/);
    expect(() => world.createRigidBody()).toThrow(/disposed/);
  });
});

describe("continuous collision and sensor stepping", () => {
  it("preserves pending forces when a CCD step is rejected", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0], continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 2 } });
    try {
      const body = world.createRigidBody({ velocity: [60, 0, 0] });
      world.createCollider(body, { shape: Shape.sphere(0.05) });
      body.applyForce([60, 0, 0]);
      expect(() => world.step(1 / 60)).toThrow(/above maxSubSteps/);
      expect(body.position).toEqual([0, 0, 0]);
      expect(body.pendingForce()).toEqual([60, 0, 0]);
      world.step(1 / 2400);
      expect(body.velocity[0]).toBeCloseTo(60.025, 3);
      expect(body.pendingForce()).toEqual([0, 0, 0]);
    } finally { world.dispose(); }
  });

  it("reports both transitions when a fast body crosses a sensor within one public step", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0], continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 64 } });
    try {
      const trigger = world.createRigidBody({ type: "static" });
      world.createCollider(trigger, { shape: Shape.box(0.1, 1, 1), sensor: true });
      const body = world.createRigidBody({ position: [-1, 0, 0], velocity: [120, 0, 0] });
      world.createCollider(body, { shape: Shape.sphere(0.1) });
      const events = world.step(1 / 60);
      expect(events.filter((event) => event.contact.sensor).map((event) => event.type)).toEqual(["begin", "end"]);
      expect(world.snapshot().contacts).toHaveLength(0);
      expect(body.position[0]).toBeGreaterThan(0.5);
      expect(body.previousPosition).toEqual([-1, 0, 0]);
    } finally { world.dispose(); }
  });

  it("reports overlapping static sensors and kinematic characters", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    try {
      const trigger = world.createRigidBody({ type: "static" });
      world.createCollider(trigger, { shape: Shape.box(1, 1, 1), sensor: true });
      const character = world.createRigidBody({ type: "kinematic" });
      world.createCollider(character, { shape: Shape.capsule(0.2, 0.4) });
      expect(world.step().some((event) => event.type === "begin" && event.contact.sensor)).toBe(true);
      character.setPosition([3, 0, 0]);
      expect(world.step().some((event) => event.type === "end" && event.contact.sensor)).toBe(true);
    } finally { world.dispose(); }
  });
});
