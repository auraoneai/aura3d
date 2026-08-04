import { describe, expect, it } from "vitest";
import {
  createCollisionLayers,
  createPhysicsRuntime,
  AURA_SPEC_CONSTRUCTIBLE_SHAPES
} from "@aura3d/engine";
import { PhysicsWorld } from "@aura3d/physics";

/**
 * The reachability contract.
 *
 * WS-1 exists because `PhysicsWorld` was a real engine that no developer could reach.
 * `PhysicsRuntime.ts` then declared `AuraPhysicsRuntime` and `AuraBodyRegistry` as
 * interfaces — and shipped no implementation, so no value ever satisfied them and
 * `grep -rn AuraPhysicsRuntime` matched only the declaration file. The unit tests that
 * "proved WS-1" exercised pure helpers (`createCollisionLayers`, `validateJointSpec`)
 * through a deep `packages/physics/src` import, which is precisely the deep import the
 * public surface is supposed to make unnecessary.
 *
 * Every test in this file imports from `@aura3d/engine` only. If the runtime regresses to
 * declaration-only, these fail at import time rather than passing on helpers.
 */
describe("public physics runtime reachability", () => {
  function runtime(options: Parameters<typeof createPhysicsRuntime>[1] = {}) {
    const world = new PhysicsWorld({ gravity: [0, -9.81, 0], enableSleeping: false });
    return createPhysicsRuntime(world, options);
  }

  it("a developer can create a body and push it, in a handful of lines", () => {
    const physics = runtime();
    const crate = physics.createBody({ name: "crate", shape: "box", mass: 1, position: [0, 0, 0] });

    crate.applyImpulse([5, 0, 0]);
    expect(crate.velocity()[0]).toBeCloseTo(5, 6);

    physics.step(1 / 60);
    expect(crate.position()[0]).toBeGreaterThan(0);
  });

  it("applyForce accumulates over a step rather than being a no-op", () => {
    const physics = runtime();
    const crate = physics.createBody({ shape: "box", mass: 2, position: [0, 0, 0] });
    const before = crate.velocity()[0];
    crate.applyForce([20, 0, 0]);
    physics.step(1 / 60);
    expect(crate.velocity()[0]).toBeGreaterThan(before);
  });

  it("resolves a scene-declared body by name through the registry", () => {
    const physics = runtime();
    physics.createBody({ name: "player", shape: "capsule", mass: 1 });
    expect(physics.bodies.has("player")).toBe(true);
    expect(physics.bodies.require("player").nodeName).toBe("player");
    expect(() => physics.bodies.require("missing")).toThrow(/No physics body "missing"/);
  });

  it("reports collisions with contact data a game can act on", () => {
    const physics = runtime();
    physics.createBody({ name: "floor", type: "static", shape: "box", position: [0, -0.5, 0], halfExtents: [4, 0.5, 4] });
    physics.createBody({ name: "faller", shape: "sphere", radius: 0.25, mass: 1, position: [0, 1.2, 0] });

    const seen: string[] = [];
    physics.onCollision((event) => {
      seen.push(`${event.nodeA ?? "?"}/${event.nodeB ?? "?"}`);
      expect(Number.isFinite(event.relativeSpeed)).toBe(true);
      expect(event.normal.length).toBe(3);
    });

    for (let step = 0; step < 180 && seen.length === 0; step += 1) physics.step(1 / 60);
    expect(seen.length).toBeGreaterThan(0);
  });

  it("onCollisionWith filters to one named node", () => {
    const physics = runtime();
    physics.createBody({ name: "floor", type: "static", shape: "box", position: [0, -0.5, 0], halfExtents: [4, 0.5, 4] });
    physics.createBody({ name: "ball", shape: "sphere", radius: 0.25, mass: 1, position: [0, 1, 0] });

    let ballHits = 0;
    let ghostHits = 0;
    physics.onCollisionWith("ball", () => { ballHits += 1; });
    physics.onCollisionWith("nothing-by-this-name", () => { ghostHits += 1; });

    for (let step = 0; step < 180; step += 1) physics.step(1 / 60);
    expect(ballHits).toBeGreaterThan(0);
    expect(ghostHits).toBe(0);
  });

  it("raycasts the world and reports what was hit", () => {
    const physics = runtime();
    physics.createBody({ name: "wall", type: "static", shape: "box", position: [0, 0, -3], halfExtents: [2, 2, 0.2] });

    const hit = physics.queries.raycast([0, 0, 0], [0, 0, -1], { maxDistance: 10 });
    expect(hit).toBeDefined();
    expect(hit?.nodeName).toBe("wall");
    expect(hit?.distance).toBeGreaterThan(0);

    expect(physics.queries.raycast([0, 0, 0], [0, 0, 1], { maxDistance: 10 })).toBeUndefined();
  });

  it("overlapSphere finds nearby bodies and respects the ignore list", () => {
    const physics = runtime();
    const a = physics.createBody({ name: "a", shape: "box", mass: 1, position: [0, 0, 0] });
    physics.createBody({ name: "b", shape: "box", mass: 1, position: [0.4, 0, 0] });
    physics.createBody({ name: "far", shape: "box", mass: 1, position: [9, 0, 0] });

    const names = physics.queries.overlapSphere([0, 0, 0], 1).map((body) => body.nodeName);
    expect(names).toContain("a");
    expect(names).toContain("b");
    expect(names).not.toContain("far");

    const excluded = physics.queries
      .overlapSphere([0, 0, 0], 1, { ignore: [a.id] })
      .map((body) => body.nodeName);
    expect(excluded).not.toContain("a");
  });

  it("sensor overlaps arrive as trigger events, and enter does not re-fire every frame", () => {
    const physics = runtime();
    physics.createBody({
      name: "pickup",
      type: "static",
      shape: "box",
      sensor: true,
      position: [0, 0, 0],
      halfExtents: [0.5, 0.5, 0.5]
    });
    physics.createBody({ name: "player", shape: "sphere", radius: 0.2, mass: 1, position: [0, 1.4, 0] });

    let enters = 0;
    physics.onTriggerEnter(() => { enters += 1; });
    for (let step = 0; step < 240; step += 1) physics.step(1 / 60);

    expect(enters).toBe(1);
  });

  it("collision layers stop masked pairs from generating contacts", () => {
    // The canonical requirement: bullets hit enemies but not each other.
    const layers = createCollisionLayers({
      bullet: ["enemy"],
      enemy: ["bullet"]
    });
    const physics = runtime({ layers });

    physics.createBody({ name: "bullet-a", shape: "sphere", radius: 0.25, mass: 0.1, position: [0, 0, 0], layer: "bullet" });
    physics.createBody({ name: "bullet-b", shape: "sphere", radius: 0.25, mass: 0.1, position: [0.2, 0, 0], layer: "bullet" });

    let bulletOnBullet = 0;
    physics.onCollision((event) => {
      if (event.nodeA?.startsWith("bullet") && event.nodeB?.startsWith("bullet")) bulletOnBullet += 1;
    });
    for (let step = 0; step < 60; step += 1) physics.step(1 / 60);
    expect(bulletOnBullet).toBe(0);

    // Same overlap across allowed layers does produce contacts, so the masking above is a
    // real filter and not simply a simulation that never touches.
    const permissive = runtime({ layers });
    permissive.createBody({ name: "bullet", shape: "sphere", radius: 0.25, mass: 0.1, position: [0, 0, 0], layer: "bullet" });
    permissive.createBody({ name: "enemy", shape: "sphere", radius: 0.25, mass: 1, position: [0.2, 0, 0], layer: "enemy" });
    let crossLayer = 0;
    permissive.onCollision(() => { crossLayer += 1; });
    for (let step = 0; step < 60; step += 1) permissive.step(1 / 60);
    expect(crossLayer).toBeGreaterThan(0);
  });

  it("gravity is readable and settable at runtime", () => {
    const physics = runtime();
    expect(physics.gravity()[1]).toBeCloseTo(-9.81, 5);
    physics.setGravity([0, -1.6, 0]);
    expect(physics.gravity()[1]).toBeCloseTo(-1.6, 5);
  });

  it("removeBody takes a body out of the simulation", () => {
    const physics = runtime();
    physics.createBody({ name: "temp", shape: "box", mass: 1 });
    expect(physics.bodies.has("temp")).toBe(true);
    physics.removeBody("temp");
    expect(physics.bodies.has("temp")).toBe(false);
  });

  it("refuses a shape it cannot build from a spec instead of substituting a box", () => {
    const physics = runtime();
    // Dynamic is the default, so a dynamic mesh is rejected on the inertia-tensor rule
    // first. Both messages name the fix rather than failing silently.
    expect(() => physics.createBody({ shape: "mesh" })).toThrow(/cannot be dynamic/);
    // Static clears that rule and then hits the missing-geometry rule.
    expect(() => physics.createBody({ shape: "mesh", type: "static" })).toThrow(/needs geometry/);
    expect(() => physics.createBody({ shape: "heightfield", type: "static" })).toThrow(/needs geometry/);
    for (const shape of AURA_SPEC_CONSTRUCTIBLE_SHAPES) {
      const type = shape === "plane" ? "static" : "dynamic";
      expect(() => physics.createBody({ shape, type })).not.toThrow();
    }
  });

  it("rejects a layered body when no layers were declared, with an actionable message", () => {
    const physics = runtime();
    expect(() => physics.createBody({ shape: "box", layer: "enemy" })).toThrow(/createCollisionLayers/);
  });
});
