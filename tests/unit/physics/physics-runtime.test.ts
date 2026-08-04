import { describe, expect, it } from "vitest";
import { PhysicsWorld, Shape } from "../../../packages/physics/src";
import {
  AURA_DYNAMIC_CAPABLE_SHAPES,
  AURA_STATIC_ONLY_SHAPES,
  assertShapeSupported,
  collisionMaskFor,
  contactRelativeSpeed,
  createBodyHandle,
  createCollisionLayers,
  layerMask,
  layersCollide,
  toAuraCollisionEvent,
  validateJointSpec
} from "../../../packages/engine/src/agent-api/PhysicsRuntime";

/**
 * These tests exist because the capability they cover was previously unreachable.
 *
 * `RigidBody` has had `applyForce`/`applyImpulse`/`wake` for a long time, and
 * `PhysicsWorld` has had `step()` returning collision events. The public agent API
 * exposed none of it, so no test proved a developer could push a body or hear about a
 * contact. Each test below fails if the public seam regresses back to declaration-only.
 */
describe("AuraBodyHandle", () => {
  it("applies an impulse that actually moves a dynamic body", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    const body = world.createRigidBody({ type: "dynamic", mass: 2, position: [0, 0, 0] });
    world.createCollider(body, { shape: Shape.sphere(0.5) });
    const handle = createBodyHandle(body, world, "crate");

    expect(handle.velocity()).toEqual([0, 0, 0]);
    handle.applyImpulse([4, 0, 0]);
    // Impulse / mass = 2 m/s along +x.
    expect(handle.velocity()[0]).toBeCloseTo(2, 6);

    world.step(1 / 60);
    expect(handle.position()[0]).toBeGreaterThan(0);
  });

  it("applies a continuous force, which accumulates over steps unlike an impulse", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    const body = world.createRigidBody({ type: "dynamic", mass: 1, position: [0, 0, 0] });
    world.createCollider(body, { shape: Shape.sphere(0.5) });
    const handle = createBodyHandle(body, world);

    handle.applyForce([10, 0, 0]);
    world.step(1 / 60);
    const afterOne = handle.velocity()[0];
    expect(afterOne).toBeGreaterThan(0);

    handle.applyForce([10, 0, 0]);
    world.step(1 / 60);
    // A force sustained across two steps produces more velocity than one step.
    expect(handle.velocity()[0]).toBeGreaterThan(afterOne);
  });

  it("applies torque and angular impulse", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    const body = world.createRigidBody({ type: "dynamic", mass: 1, position: [0, 0, 0] });
    world.createCollider(body, { shape: Shape.box(0.5, 0.5, 0.5) });
    const handle = createBodyHandle(body, world);

    handle.applyAngularImpulse([0, 1, 0]);
    expect(Math.abs(handle.angularVelocity()[1])).toBeGreaterThan(0);
  });

  it("teleport zeroes velocity while setPosition preserves it", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0] });
    const body = world.createRigidBody({ type: "dynamic", mass: 1, position: [0, 0, 0] });
    world.createCollider(body, { shape: Shape.sphere(0.5) });
    const handle = createBodyHandle(body, world);

    handle.setVelocity([5, 0, 0]);
    handle.setPosition([10, 0, 0]);
    expect(handle.velocity()[0]).toBeCloseTo(5, 6);

    handle.teleport([0, 0, 0]);
    expect(handle.velocity()).toEqual([0, 0, 0]);
    expect(handle.position()[0]).toBeCloseTo(0, 6);
  });

  it("wakes a sleeping body when an impulse arrives", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0], enableSleeping: true });
    const body = world.createRigidBody({ type: "dynamic", mass: 1, position: [0, 0, 0] });
    world.createCollider(body, { shape: Shape.sphere(0.5) });
    const handle = createBodyHandle(body, world);

    handle.sleep();
    expect(handle.sleeping()).toBe(true);
    handle.applyImpulse([1, 0, 0]);
    // A sleeping body that ignored impulses would look like a physics bug to a developer.
    expect(handle.sleeping()).toBe(false);
  });
});

describe("collision events on the public surface", () => {
  it("reports a begin contact between two bodies with usable contact data", () => {
    const world = new PhysicsWorld({ gravity: [0, -9.81, 0] });
    const ground = world.createRigidBody({ type: "static", position: [0, 0, 0] });
    world.createCollider(ground, { shape: Shape.box(5, 0.5, 5) });
    const falling = world.createRigidBody({ type: "dynamic", mass: 1, position: [0, 2, 0] });
    world.createCollider(falling, { shape: Shape.sphere(0.5) });

    const handles = new Map([
      [ground.id, createBodyHandle(ground, world, "ground")],
      [falling.id, createBodyHandle(falling, world, "ball")]
    ]);

    let observed: ReturnType<typeof toAuraCollisionEvent>;
    for (let step = 0; step < 240 && !observed; step += 1) {
      for (const event of world.step(1 / 60)) {
        if (event.type !== "begin") continue;
        observed = toAuraCollisionEvent(event, (id) => handles.get(id));
      }
    }

    expect(observed, "a falling ball must generate a begin contact with the ground").toBeTruthy();
    expect(new Set([observed!.nodeA, observed!.nodeB])).toEqual(new Set(["ground", "ball"]));
    expect(observed!.phase).toBe("begin");
    // The normal must be a real direction, not a zero vector.
    const n = observed!.normal;
    expect(Math.hypot(n[0], n[1], n[2])).toBeGreaterThan(0.5);
  });

  it("computes approach speed along the normal, which distinguishes a landing from a crash", () => {
    expect(contactRelativeSpeed([0, -10, 0], [0, 0, 0], [0, 1, 0])).toBeCloseTo(10, 6);
    // A resting contact has no approach speed.
    expect(contactRelativeSpeed([0, 0, 0], [0, 0, 0], [0, 1, 0])).toBeCloseTo(0, 6);
    // Motion perpendicular to the normal is not approach.
    expect(contactRelativeSpeed([5, 0, 0], [0, 0, 0], [0, 1, 0])).toBeCloseTo(0, 6);
  });
});

describe("collision layers", () => {
  const layers = createCollisionLayers({
    bullet: ["enemy", "wall"],
    enemy: ["bullet", "wall", "player"],
    player: ["enemy", "wall"],
    wall: ["bullet", "enemy", "player"]
  });

  it("lets bullets hit enemies but not each other", () => {
    expect(layersCollide(layers, "bullet", "enemy")).toBe(true);
    expect(layersCollide(layers, "bullet", "wall")).toBe(true);
    // The case that is impossible to express without layers.
    expect(layersCollide(layers, "bullet", "bullet")).toBe(false);
  });

  it("treats a one-sided declaration as symmetric", () => {
    const oneSided = createCollisionLayers({ a: ["b"], b: [] });
    expect(layersCollide(oneSided, "b", "a")).toBe(true);
  });

  it("builds distinct masks per layer", () => {
    expect(layerMask(layers, "bullet")).toBe(1);
    expect(layerMask(layers, "enemy")).toBe(2);
    const bulletMask = collisionMaskFor(layers, "bullet");
    // Bullet collides with enemy and wall, so those bits are set.
    expect(bulletMask & layerMask(layers, "enemy")).toBeGreaterThan(0);
    expect(bulletMask & layerMask(layers, "wall")).toBeGreaterThan(0);
  });

  it("rejects unknown and oversized layer declarations", () => {
    expect(() => createCollisionLayers({ a: ["missing"] })).toThrow(/unknown layer/i);
    expect(() => createCollisionLayers({})).toThrow(/at least one layer/i);
    expect(() => layerMask(layers, "nope")).toThrow(/Unknown collision layer/);
  });
});

describe("shape capability honesty", () => {
  it("refuses a dynamic trimesh instead of silently misbehaving", () => {
    // A concave triangle soup has no well-defined inertia tensor. Allowing it produces
    // a body that falls through thin geometry, which reads as an engine bug.
    expect(() => assertShapeSupported("trimesh", "dynamic")).toThrow(/cannot be dynamic/);
    expect(() => assertShapeSupported("heightfield", "dynamic")).toThrow(/cannot be dynamic/);
    expect(() => assertShapeSupported("plane", "dynamic")).toThrow(/cannot be dynamic/);
  });

  it("allows static trimesh and dynamic convex shapes", () => {
    expect(() => assertShapeSupported("trimesh", "static")).not.toThrow();
    for (const shape of AURA_DYNAMIC_CAPABLE_SHAPES) {
      expect(() => assertShapeSupported(shape, "dynamic")).not.toThrow();
    }
  });

  it("keeps the two shape lists disjoint", () => {
    for (const shape of AURA_STATIC_ONLY_SHAPES) {
      expect(AURA_DYNAMIC_CAPABLE_SHAPES).not.toContain(shape);
    }
  });
});

describe("joint specs", () => {
  it("requires a motor speed for a motorised hinge", () => {
    expect(() => validateJointSpec({ kind: "motorised-hinge", bodyA: 1, bodyB: 2 })).toThrow(/motorSpeed/);
    expect(() => validateJointSpec({ kind: "motorised-hinge", bodyA: 1, bodyB: 2, motorSpeed: 2 })).not.toThrow();
  });

  it("rejects nonsense spring parameters", () => {
    expect(() => validateJointSpec({ kind: "spring", bodyA: 1, bodyB: 2, stiffness: 0 })).toThrow(/stiffness/);
    expect(() => validateJointSpec({ kind: "spring", bodyA: 1, bodyB: 2, damping: -1 })).toThrow(/damping/);
  });

  it("only allows limits on hinge joints, and only ordered ones", () => {
    expect(() => validateJointSpec({ kind: "slider", bodyA: 1, bodyB: 2, limits: [0, 1] })).toThrow(/only supported on hinge/);
    expect(() => validateJointSpec({ kind: "hinge", bodyA: 1, bodyB: 2, limits: [1, 0] })).toThrow(/ordered/);
    expect(() => validateJointSpec({ kind: "hinge", bodyA: 1, bodyB: 2, limits: [0, 1] })).not.toThrow();
  });
});
