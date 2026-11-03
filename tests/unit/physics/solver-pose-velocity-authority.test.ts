import { describe, expect, it } from "vitest";
import { PhysicsWorld } from "@aura3d/physics";

/**
 * Regression guard for the shared-layer solver-ownership fix in
 * `syncRapierFromAura` (packages/physics/src/PhysicsWorld.ts).
 *
 * A refactor stopped copying the Aura body POSE back into the solver every step (gating
 * `setTranslation`/`setRotation` behind `poseOverridden`, the same switch that correctly
 * gates the velocity push). For a *free* body that write is the solver's own last output
 * (identity for the transform), but dropping it changed how the multi-substep contact
 * solver warmed the ball↔crate↔crate impact chain, so a Siege Golf drive no longer flung
 * the top crate into the pin: the ball stopped ~1 m short of an authored cup.
 *
 * The rule pinned here:
 * - VELOCITY is written to the solver only on an explicit request (`setVelocity` /
 *   `applyImpulse` / `setAngularVelocity` set `velocityOverridden`), so a solver-driven
 *   vehicle keeps authority over motion. An impulse that never reaches the solver is the
 *   failure mode.
 * - POSE is re-mirrored every step regardless of `poseOverridden`.
 *
 * The knock-down scene below is a port of the authored "Open Fairway" hole (felt, rails,
 * stacked shells, ceiling, 2-crate stack, pedestal, pin, cup sensor, ball) onto the public
 * physics surface, re-authored for this test (the shipped game is unchanged). In the
 * authored layout the struck crate stops flush against the static pedestal (front face
 * z -7.40) 0.15 m short of the pin face (z -7.55), so the old single-power pass was a
 * fluke: at most 1 of 9 nearby powers toppled the pin in any sub-step mode. Here the pin
 * stands 0.02 m proud of the pedestal edge (center z -7.43, centre of mass still 0.03 m
 * over the pedestal, so it stands on its own), which puts it in the crate path. The test
 * then checks the topple across forced sub-step counts and a band of drive powers.
 * See docs/project/status/retired-tests.md.
 */

/** Pin centre z: front face at -7.38, 0.02 m proud of the pedestal front face (-7.40). */
const PIN_Z = -7.43;
/** Drive powers around the canonical Open Fairway power 1.9. */
const DRIVE_POWERS = [1.84, 1.855, 1.87, 1.885, 1.9, 1.915, 1.93, 1.945, 1.96] as const;
/** Forced solver sub-step counts per public step (undefined = the adaptive planner). */
const SUB_STEP_MODES = [undefined, 4, 7, 8, 12] as const;

function openFairwayWorld(forcedSubSteps?: number) {
  const world = new PhysicsWorld({
    gravity: [0, -9.81, 0],
    fixedDelta: 1 / 60,
    solverIterations: 8,
    enableSleeping: true,
    sleepVelocityThreshold: 0.06,
    sleepDelay: 0.45,
    // A forced count uses the public planner: a vanishing motion threshold always asks for
    // more sub-steps than the cap, and "clamp" runs exactly the cap while anything moves.
    continuousCollision: forcedSubSteps === undefined
      ? { mode: "adaptive-substeps", maxSubSteps: 256, motionThreshold: 0.35 }
      : { mode: "adaptive-substeps", maxSubSteps: forcedSubSteps, motionThreshold: 1e-9, onSubstepLimit: "clamp" }
  });
  const stat = (pos: readonly number[], he: readonly number[], fr = 0.8, rest = 0.2, sensor = false) => {
    const b = world.createRigidBody({ type: "static", position: [...pos] as [number, number, number] });
    world.createCollider(b, { shape: { kind: "box", halfExtents: [...he] as [number, number, number] }, sensor, material: { friction: fr, restitution: rest } });
    return b;
  };
  stat([0, -0.1, -3.8], [4.3, 0.1, 10], 0.94, 0.08);
  stat([-3.6, 0.55, -3.8], [0.35, 0.55, 8.8], 0.8, 0.42);
  stat([3.6, 0.55, -3.8], [0.35, 0.55, 8.8], 0.8, 0.42);
  stat([0, 0.55, 5], [3.75, 0.55, 0.35], 0.8, 0.42);
  stat([0, 0.55, -12.6], [3.75, 0.55, 0.35], 0.8, 0.42);
  stat([-3.6, 2.6, -3.8], [0.35, 3, 8.8]);
  stat([3.6, 2.6, -3.8], [0.35, 3, 8.8]);
  stat([0, 2.6, 5], [3.75, 3, 0.35]);
  stat([0, 2.6, -12.6], [3.75, 3, 0.35]);
  stat([0, 6.5, -3.8], [4.1, 0.1, 8.8]);
  const crate = (y: number) => {
    const b = world.createRigidBody({ type: "dynamic", position: [0, y, -4.6], mass: 0.5, linearDamping: 0.05, angularDamping: 0.12 });
    world.createCollider(b, { shape: { kind: "box", halfExtents: [0.31, 0.31, 0.31] }, material: { friction: 0.66, restitution: 0.14 } });
    return b;
  };
  crate(0.31);
  crate(0.93);
  stat([0, 0.09, -7.6], [0.2, 0.09, 0.2]);
  const pin = world.createRigidBody({ type: "dynamic", position: [0, 0.73, PIN_Z], mass: 0.32, linearDamping: 0.04, angularDamping: 0.1 });
  world.createCollider(pin, { shape: { kind: "box", halfExtents: [0.24, 0.55, 0.05] }, material: { friction: 0.6, restitution: 0.14 } });
  stat([0, 0.16, -8.4], [0.697, 0.16, 0.697], 0.9, 0, true);
  const ball = world.createRigidBody({ type: "dynamic", position: [0, 0.18, 3.2], mass: 0.5, linearDamping: 0.12, angularDamping: 0.2 });
  world.createCollider(ball, { shape: { kind: "sphere", radius: 0.16 }, material: { friction: 0.22, restitution: 0.5 } });
  return { world, ball, pin };
}

describe("solver/velocity/pose ownership in syncRapierFromAura", () => {
  it("an impulse applied through the public wrapper reaches the solver", () => {
    const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60 });
    const body = world.createRigidBody({ type: "dynamic", position: [0, 0.5, 0], mass: 1 });
    world.createCollider(body, { shape: { kind: "sphere", radius: 0.2 }, material: { friction: 0.1, restitution: 0.1 } });
    const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
    world.createCollider(floor, { shape: { kind: "box", halfExtents: [10, 0.5, 10] }, material: { friction: 1, restitution: 0 } });
    for (let i = 0; i < 60; i += 1) world.step(1 / 60);
    expect(Math.abs(body.velocity[0])).toBeLessThan(0.05);
    body.applyImpulse([3, 0, 0]);
    for (let i = 0; i < 5; i += 1) world.step(1 / 60);
    expect(body.velocity[0]).toBeGreaterThan(0.5);
    expect(body.position[0]).toBeGreaterThan(0.1);
  });

  it("an angular impulse applied through the public wrapper reaches the solver", () => {
    const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60 });
    const body = world.createRigidBody({ type: "dynamic", position: [0, 4, 0], mass: 1, inertia: [0.05, 0.05, 0.05], angularDamping: 0 });
    world.createCollider(body, { shape: { kind: "box", halfExtents: [0.2, 0.2, 0.2] }, material: { friction: 0, restitution: 0 } });
    body.applyAngularImpulse([0, 4, 0]);
    world.step(1 / 60);
    expect(Math.abs(body.angularVelocity[1])).toBeGreaterThan(1);
  });

  it("the re-authored pin stands on its own when nothing hits it", () => {
    const { world, pin } = openFairwayWorld();
    for (let i = 0; i < 1200; i += 1) world.step(1 / 60);
    expect(pin.position[1]).toBeGreaterThan(0.7);
  });

  it("mirrors the solver pose every step so a drive topples the pin (not a ~1m shortfall)", () => {
    const misses: string[] = [];
    for (const forced of SUB_STEP_MODES) {
      for (const power of DRIVE_POWERS) {
        const { world, ball, pin } = openFairwayWorld(forced);
        for (let i = 0; i < 30; i += 1) world.step(1 / 60); // stacking transient
        expect(pin.position[1]).toBeGreaterThan(0.7);
        ball.wake();
        ball.setVelocity([0, 0, -(power * 0.32) / 0.045]);
        world.step(1 / 60);
        if (forced !== undefined) expect(world.snapshot().backend.continuousCollision.lastSubSteps).toBe(forced);
        for (let i = 1; i < 320; i += 1) world.step(1 / 60);
        // The top crate must carry enough momentum to knock the standing pin flat. A standing
        // pin (center ~0.73 high) is the gated-pose regression; the fix drives it onto the felt.
        if (!(pin.position[1] < 0.45)) misses.push(`subSteps=${forced ?? "adaptive"} power=${power} pinY=${pin.position[1].toFixed(3)}`);
      }
    }
    expect(misses).toEqual([]);
  }, 120_000);
});
