import { describe, expect, it } from "vitest";
import { createPhysicsRuntime, type AuraJointKind } from "@aura3d/engine";
import { PhysicsWorld } from "@aura3d/physics";

/**
 * WS-1.6: six joint types, each proven to do something.
 *
 * These tests also cover the defect that made the whole joint feature fictional.
 *
 * Defect class: **engine**. `PhysicsWorld.step()` used to have two branches. The removed
 * `aura-js` branch called `constraint.solve()` inside its substep loop. The `cannon-es`
 * branch — the default, selected whenever `backend` was not explicitly `"aura-js"` — never
 * called it at all. So on the backend every real consumer actually used, joints were a
 * silent no-op: a body on a `fixed` joint free-fell to y = -18.78 over two seconds instead
 * of hanging at y = 1. `joints / constraints` was listed as "unproven, 0 consumers", and
 * the reason it had no consumers is that it did not work.
 *
 * WS-4.3 removed the second solver, so there is no longer a branch on which a joint can
 * pass while the shipped path ignores it. Every case below runs on the one production
 * backend, which is the same code a route runs.
 */
function runtimeFor(gravity: readonly [number, number, number] = [0, -9.81, 0]) {
  const world = new PhysicsWorld({ backend: "rapier", gravity: [...gravity], enableSleeping: false, solverIterations: 8 });
  return createPhysicsRuntime(world);
}

describe("joints on the production backend", () => {
  it("a fixed joint holds a hanging body against gravity", () => {
    const physics = runtimeFor();
    physics.createBody({ name: "anchor", type: "static", shape: "box", position: [0, 2, 0], halfExtents: [0.1, 0.1, 0.1] });
    const hanging = physics.createBody({ name: "load", shape: "box", mass: 1, position: [0, 1, 0], halfExtents: [0.1, 0.1, 0.1] });

    physics.createJoint({ kind: "fixed", bodyA: "anchor", bodyB: "load" });
    for (let step = 0; step < 120; step += 1) physics.step(1 / 60);

    // Without the stepCannon fix this reads about -18.8.
    expect(hanging.position()[1]).toBeGreaterThan(0.5);
  });

  it("a ball-socket joint holds position while leaving rotation free", () => {
    const physics = runtimeFor();
    physics.createBody({ name: "anchor", type: "static", shape: "box", position: [0, 2, 0], halfExtents: [0.1, 0.1, 0.1] });
    const pendulum = physics.createBody({ name: "bob", shape: "sphere", radius: 0.15, mass: 1, position: [0, 1.4, 0] });

    physics.createJoint({ kind: "ball-socket", bodyA: "anchor", bodyB: "bob", anchor: [0, 2, 0] });
    for (let step = 0; step < 180; step += 1) physics.step(1 / 60);

    // Held near the anchor rather than falling away from it.
    const distance = Math.hypot(
      pendulum.position()[0] - 0,
      pendulum.position()[1] - 2,
      pendulum.position()[2] - 0
    );
    expect(distance).toBeLessThan(1.2);
    expect(pendulum.position()[1]).toBeGreaterThan(0.5);
  });

  it("a slider joint permits motion along its axis and resists motion across it", () => {
    const physics = runtimeFor([0, 0, 0]);
    physics.createBody({ name: "rail", type: "static", shape: "box", position: [0, 0, 0], halfExtents: [0.1, 0.1, 0.1] });
    const block = physics.createBody({ name: "block", shape: "box", mass: 1, position: [0.5, 0, 0], halfExtents: [0.1, 0.1, 0.1] });

    physics.createJoint({ kind: "slider", bodyA: "rail", bodyB: "block", axis: [1, 0, 0], anchor: [0, 0, 0] });

    block.applyImpulse([2, 0, 0]);
    for (let step = 0; step < 60; step += 1) physics.step(1 / 60);
    const alongAxis = block.position()[0];

    block.applyImpulse([0, 3, 0]);
    for (let step = 0; step < 60; step += 1) physics.step(1 / 60);
    const acrossAxis = Math.abs(block.position()[1]);

    expect(alongAxis).toBeGreaterThan(0.5);
    expect(acrossAxis).toBeLessThan(Math.abs(alongAxis));
  });

  it("a spring joint returns a displaced body toward its rest length", () => {
    const physics = runtimeFor([0, 0, 0]);
    physics.createBody({ name: "mount", type: "static", shape: "box", position: [0, 0, 0], halfExtents: [0.1, 0.1, 0.1] });
    const platform = physics.createBody({ name: "platform", shape: "box", mass: 1, position: [0, 1, 0], halfExtents: [0.2, 0.05, 0.2] });

    physics.createJoint({
      kind: "spring",
      bodyA: "mount",
      bodyB: "platform",
      anchor: [0, 0, 0],
      restLength: 1,
      stiffness: 0.5,
      damping: 0.3
    });

    // Pull it well past rest, then let the spring work.
    platform.setPosition([0, 2.2, 0]);
    const displaced = Math.abs(platform.position()[1] - 1);
    for (let step = 0; step < 240; step += 1) physics.step(1 / 60);
    const settled = Math.abs(platform.position()[1] - 1);

    expect(settled).toBeLessThan(displaced);
  });

  it("a motorised hinge drives rotation and honours setMotorSpeed", () => {
    const physics = runtimeFor([0, 0, 0]);
    physics.createBody({ name: "frame", type: "static", shape: "box", position: [0, 0, 0], halfExtents: [0.1, 0.1, 0.1] });
    const door = physics.createBody({ name: "door", shape: "box", mass: 1, position: [0.4, 0, 0], halfExtents: [0.4, 0.6, 0.05] });

    const joint = physics.createJoint({
      kind: "motorised-hinge",
      bodyA: "frame",
      bodyB: "door",
      axis: [0, 1, 0],
      anchor: [0, 0, 0],
      motorSpeed: 2,
      maxMotorTorque: 8
    });

    for (let step = 0; step < 30; step += 1) physics.step(1 / 60);
    const driven = door.angularVelocity()[1];
    expect(Math.abs(driven)).toBeGreaterThan(0.2);

    joint.setMotorSpeed(0);
    for (let step = 0; step < 60; step += 1) physics.step(1 / 60);
    expect(Math.abs(door.angularVelocity()[1])).toBeLessThan(Math.abs(driven));
  });

  it("a hinge joint keeps its anchors together under load", () => {
    const physics = runtimeFor();
    physics.createBody({ name: "post", type: "static", shape: "box", position: [0, 2, 0], halfExtents: [0.1, 0.1, 0.1] });
    const arm = physics.createBody({ name: "arm", shape: "box", mass: 3, position: [0.5, 2, 0], halfExtents: [0.5, 0.05, 0.1] });

    physics.createJoint({ kind: "hinge", bodyA: "post", bodyB: "arm", axis: [0, 0, 1], anchor: [0, 2, 0] });
    for (let step = 0; step < 240; step += 1) physics.step(1 / 60);

    // A heavy arm under gravity for four seconds: the joint must not drift apart.
    const separation = Math.hypot(arm.position()[0] - 0, arm.position()[1] - 2, arm.position()[2] - 0);
    expect(Number.isFinite(separation)).toBe(true);
    expect(separation).toBeLessThan(1.5);
  });

  it("a slider is prismatic: rotation does not leak into off-axis translation", () => {
    /*
     * Regression for a defect the resting-body tests could not see.
     *
     * The anchor is carried on each body's local frame, so an unconstrained spin swings the
     * anchor, the positional solve reads the swing as off-axis error, and it translates the
     * body to cancel it. Measured before the fix, on a block given one along-axis impulse:
     * 0.478 off-axis in z and 0.780 in y — it left the rail entirely. At rest it held fine.
     */
    const physics = runtimeFor();
    physics.createBody({ name: "rail", type: "static", shape: "box", position: [1.2, 0.42, -1.1], halfExtents: [0.07, 0.07, 0.07] });
    const block = physics.createBody({ name: "block", shape: "box", mass: 1.6, position: [2.2, 0.42, -1.1], halfExtents: [0.15, 0.15, 0.15], linearDamping: 0.5 });
    physics.createJoint({ kind: "slider", bodyA: "rail", bodyB: "block", anchor: [1.2, 0.42, -1.1], axis: [1, 0, 0] });

    for (let step = 0; step < 60; step += 1) physics.step(1 / 60);
    block.applyImpulse([-2.2, 0, 0]);
    for (let step = 0; step < 180; step += 1) physics.step(1 / 60);

    const at = block.position();
    // It must travel along its axis...
    expect(Math.abs(at[0] - 2.2)).toBeGreaterThan(0.1);
    // ...and stay on it. Both were violated by an order of magnitude before the fix.
    expect(Math.abs(at[2] + 1.1)).toBeLessThan(0.06);
    expect(Math.abs(at[1] - 0.42)).toBeLessThan(0.06);
  });

  it("setEnabled(false) releases the joint", () => {
    const physics = runtimeFor();
    physics.createBody({ name: "anchor", type: "static", shape: "box", position: [0, 2, 0], halfExtents: [0.1, 0.1, 0.1] });
    const load = physics.createBody({ name: "load", shape: "box", mass: 1, position: [0, 1, 0], halfExtents: [0.1, 0.1, 0.1] });
    const joint = physics.createJoint({ kind: "fixed", bodyA: "anchor", bodyB: "load" });

    for (let step = 0; step < 60; step += 1) physics.step(1 / 60);
    const held = load.position()[1];
    joint.setEnabled(false);
    for (let step = 0; step < 120; step += 1) physics.step(1 / 60);

    expect(load.position()[1]).toBeLessThan(held - 0.5);
  });
});

describe("joint API surface", () => {
  it("exposes all six declared kinds and each one constructs", () => {
    const kinds: readonly AuraJointKind[] = ["fixed", "hinge", "slider", "ball-socket", "spring", "motorised-hinge"];
    expect(kinds.length).toBe(6);
    for (const kind of kinds) {
      const physics = runtimeFor([0, 0, 0]);
      physics.createBody({ name: "a", type: "static", shape: "box", position: [0, 0, 0], halfExtents: [0.1, 0.1, 0.1] });
      physics.createBody({ name: "b", shape: "box", mass: 1, position: [0.5, 0, 0], halfExtents: [0.1, 0.1, 0.1] });
      const joint = physics.createJoint(
        kind === "motorised-hinge"
          ? { kind, bodyA: "a", bodyB: "b", motorSpeed: 1 }
          : { kind, bodyA: "a", bodyB: "b" }
      );
      expect(joint.kind).toBe(kind);
    }
  });

  it("rejects setMotorSpeed on a joint that has no motor", () => {
    const physics = runtimeFor([0, 0, 0]);
    physics.createBody({ name: "a", type: "static", shape: "box", halfExtents: [0.1, 0.1, 0.1] });
    physics.createBody({ name: "b", shape: "box", mass: 1, position: [0.5, 0, 0], halfExtents: [0.1, 0.1, 0.1] });
    const joint = physics.createJoint({ kind: "hinge", bodyA: "a", bodyB: "b" });
    expect(() => joint.setMotorSpeed(2)).toThrow(/only valid on a motorised-hinge/);
  });

  it("names the missing body instead of failing obscurely", () => {
    const physics = runtimeFor();
    physics.createBody({ name: "a", shape: "box", mass: 1 });
    expect(() => physics.createJoint({ kind: "fixed", bodyA: "a", bodyB: "ghost" })).toThrow(/two existing bodies/);
  });
});
