import { describe, expect, it } from "vitest";
import {
  createPhysicsRuntime,
  validateJointSpec
} from "@aura3d/engine";
import { PhysicsWorld } from "@aura3d/physics";

/**
 * H1 root promotions: rigid-body + sensor + joint APIs reachable from root with
 * Rapier (the sole physical-simulation owner) behind every call.
 *
 * Every test imports the runtime from `@aura3d/engine` only — a promotion that
 * regresses to package-only is a failure of this section, not a passing suite.
 */
function runtime(world: PhysicsWorld = new PhysicsWorld({ gravity: [0, -9.81, 0], enableSleeping: false })) {
  return createPhysicsRuntime(world);
}

const TETRA_VERTICES = [
  [0.5, 0, 0],
  [-0.5, 0.3, 0],
  [0, 0, 0.5],
  [0, 0.8, -0.3]
] as const;
const TETRA_INDICES = [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3];

describe("H1 root rigid-body promotions", () => {
  it("creates a convexHull body from a root spec and steps it under gravity", () => {
    const physics = runtime();
    const rock = physics.createBody({
      name: "rock",
      shape: "convexHull",
      mass: 2,
      position: [0, 3, 0],
      vertices: TETRA_VERTICES.map((v) => [...v] as [number, number, number]),
      indices: [...TETRA_INDICES]
    });
    expect(rock.position()[1]).toBeCloseTo(3, 6);
    physics.step(1 / 60);
    expect(rock.position()[1]).toBeLessThan(3);
  });

  it("fails loudly when convexHull geometry is missing instead of substituting a box", () => {
    const physics = runtime();
    expect(() => physics.createBody({ shape: "convexHull", position: [0, 1, 0] })).toThrow(/vertices/);
  });

  it("accepts revolute/prismatic spellings and builds the same native joints", () => {
    const physics = runtime();
    const a = physics.createBody({ name: "a", shape: "box", position: [-1, 2, 0] });
    const b = physics.createBody({ name: "b", shape: "box", position: [1, 2, 0] });
    const hinge = physics.createJoint({ kind: "revolute", bodyA: a.id, bodyB: b.id, axis: [0, 0, 1] });
    expect(hinge.kind).toBe("revolute");
    const c = physics.createBody({ name: "c", shape: "box", position: [-1, 4, 0] });
    const d = physics.createBody({ name: "d", shape: "box", position: [1, 4, 0] });
    const slider = physics.createJoint({ kind: "prismatic", bodyA: c.id, bodyB: d.id, axis: [1, 0, 0] });
    expect(slider.kind).toBe("prismatic");
    physics.step(1 / 60);
    expect(physics.contacts().length).toBeGreaterThanOrEqual(0);
    hinge.remove();
    slider.remove();
  });

  it("allows limits on revolute joints and rejects them on sliders", () => {
    expect(() => validateJointSpec({ kind: "revolute", bodyA: 1, bodyB: 2, limits: [-0.5, 0.5] })).not.toThrow();
    expect(() => validateJointSpec({ kind: "slider", bodyA: 1, bodyB: 2, limits: [-1, 1] })).toThrow(/hinge/);
  });

  it("fires sensor trigger callbacks when a dynamic body enters a trigger volume", () => {
    const physics = runtime();
    physics.createBody({ name: "trigger", type: "static", shape: "box", halfExtents: [2, 2, 2], sensor: true, position: [0, 0, 0] });
    physics.createBody({ name: "ball", shape: "sphere", radius: 0.4, mass: 1, position: [0, 0.5, 0] });
    let entered = 0;
    physics.onTriggerEnter((event) => {
      if (event.sensor) entered += 1;
    });
    physics.step(1 / 60);
    expect(entered).toBeGreaterThan(0);
  });

  it("sleeps and wakes bodies from root", () => {
    const physics = runtime();
    const crate = physics.createBody({ shape: "box", mass: 1, position: [0, 1, 0] });
    crate.sleep();
    expect(crate.sleeping()).toBe(true);
    crate.applyImpulse([1, 0, 0]);
    expect(crate.sleeping()).toBe(false);
  });
});

describe("H1 CCD tunnel-guard + repeatability seed at root", () => {
  it("reports the CCD provider and seed through runtime.backend()", () => {
    const world = new PhysicsWorld({
      gravity: [0, -9.81, 0],
      seed: 1337,
      continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 64 }
    });
    const physics = createPhysicsRuntime(world);
    const backend = physics.backend();
    expect(backend.active).toBe("rapier");
    expect(backend.seed).toBe(1337);
    expect(backend.continuousCollision.provider).toBe("rapier-native-ccd+adaptive-substeps");
  });

  it("engages adaptive substeps for a fast small body (tunnel-guard proof)", () => {
    const world = new PhysicsWorld({
      gravity: [0, 0, 0],
      enableSleeping: false,
      continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 128 }
    });
    const physics = createPhysicsRuntime(world);
    const bullet = physics.createBody({ shape: "sphere", radius: 0.05, mass: 1, position: [0, 0, -5] });
    bullet.setVelocity([0, 0, 120]);
    physics.step(1 / 60);
    expect(physics.backend().continuousCollision.lastSubSteps).toBeGreaterThan(1);
  });

  it("reproduces identical snapshots for the same seed + descriptor + step sequence", () => {
    const run = (seed: number) => {
      const world = new PhysicsWorld({ gravity: [0, -9.81, 0], seed, enableSleeping: false });
      const physics = createPhysicsRuntime(world);
      physics.createBody({ shape: "box", mass: 1, position: [0.3, 2, -0.2] });
      physics.createBody({ shape: "sphere", radius: 0.4, mass: 2, position: [-0.5, 3, 0.4] });
      for (let step = 0; step < 20; step += 1) physics.step(1 / 60);
      return world.snapshot().bodies.map((body) => [...body.position, ...body.velocity]);
    };
    expect(run(42)).toEqual(run(42));
  });

  it("rejects a non-integer seed instead of silently ignoring it", () => {
    expect(() => new PhysicsWorld({ seed: 1.5 })).toThrow(/seed/);
    expect(() => new PhysicsWorld({ seed: Number.NaN })).toThrow(/seed/);
  });
});
