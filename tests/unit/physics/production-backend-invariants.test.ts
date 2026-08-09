import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import {
  CharacterController,
  PhysicsWorld,
  Shape,
  sampleArcadeVehicleTelemetry
} from "../../../packages/physics/src/index.js";

/**
 * WS-4.3 — the nine production-backend invariants.
 *
 * The PRD is explicit that "all 217 physics tests pass" is necessary and **insufficient**:
 * those tests were written around the old solver's semantics, and the WS-4.3 classification
 * run measured that all 114 backend-pinned rows were `contract` — none of them *characterize
 * the backend*. So the existing suite proves the public API keeps its promises; it does not
 * prove the solver underneath is sound.
 *
 * These nine do. Each is a physical property a developer would notice breaking, written
 * fresh against the one production backend, phrased as a property rather than a pinned
 * number so a future backend swap is judged on physics instead of on digits.
 *
 * Why each is here rather than assumed:
 *
 * - **joints** shipped as a silent no-op on the default backend through 1.5.x. That class
 *   must be *impossible*, so the invariant asserts the joint does work rather than that the
 *   code path exists.
 * - **tunnelling** and **character grounding** are the two the decision file records
 *   cannon-es failing or not providing natively. They are Aura3D's implementation
 *   obligations, not "the backend handles it".
 * - **determinism** is advertised on `PhysicsSnapshot.backend.deterministic`. A flag is a
 *   claim; two identical runs agreeing is evidence.
 *
 * R1: every case constructs a `PhysicsWorld` through the public package entry and reads
 * public state. No private field, no internal import, no mock.
 */

const FIXED_DELTA = 1 / 60;

/** Ground plane plus the world it lives in, the starting point for most invariants. */
function groundedWorld(
  options: {
    readonly friction?: number;
    readonly solverIterations?: number;
    /** Omit `solverIterations` entirely, so the case exercises the shipped default. */
    readonly useDefaultSolverIterations?: boolean;
  } = {}
) {
  const world = new PhysicsWorld({
    gravity: [0, -9.81, 0],
    fixedDelta: FIXED_DELTA,
    ...(options.useDefaultSolverIterations === true ? {} : { solverIterations: options.solverIterations ?? 8 })
  });
  const ground = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(ground, {
    shape: Shape.box(20, 0.5, 20),
    material: { friction: options.friction ?? 0.8, restitution: 0 }
  });
  return { world, ground };
}

describe("production backend invariant 1 — stacked-body stability", () => {
  it("holds a six-box stack in place instead of drifting or exploding", () => {
    /*
     * The failure this catches is the classic one: a stack that looks fine for a few frames and
     * then jitters apart, or sinks into the floor. Both are solver failures a route notices
     * immediately, and neither shows up in a two-step test.
     *
     * **Deliberately does not pass `solverIterations`.** The defect this invariant found was the
     * *default* being 1 against cannon's own 10 — and the first version of this test passed
     * `solverIterations: 8`, so reverting the fix left it green. A test for a default has to use
     * the default; pinning the value tested a configuration no route uses. Verified by reverting:
     * with the default at 1 this case fails, with 10 it passes.
     */
    const { world } = groundedWorld({ friction: 0.9, useDefaultSolverIterations: true });
    const half = 0.2;
    const boxes = [];
    for (let index = 0; index < 6; index += 1) {
      const body = world.createRigidBody({
        position: [0, 0.5 + half + index * half * 2, 0],
        mass: 1,
        friction: 0.9,
        linearDamping: 0.02
      });
      world.createCollider(body, { shape: Shape.box(half, half, half), material: { friction: 0.9, restitution: 0 } });
      boxes.push(body);
    }
    const restingHeights = boxes.map((box) => box.position[1]);

    for (let step = 0; step < 240; step += 1) world.step(FIXED_DELTA);

    /*
     * The bound is the box's own width, because that is what "the stack is still a stack"
     * means physically: a box that has slid less than one width is still overlapping — still
     * supported by — the one beneath it. A tighter number would be a tuning threshold dressed
     * up as an invariant, and it would fail for reasons that are not defects (a taller stack,
     * a different friction, more solver iterations all move it).
     *
     * The collapse this catches is unambiguous and does not need a tuned number: before the
     * `solverIterations` default was corrected from 1 to cannon's own 10, all six boxes ended
     * flat on the ground at y = 0.70, having slid up to 3.4 units — 8 widths.
     */
    const boxWidth = half * 2;
    for (const [index, box] of boxes.entries()) {
      const drift = Math.hypot(box.position[0], box.position[2]);
      assert.ok(
        drift < boxWidth,
        `box ${index} slid ${drift.toFixed(3)} horizontally, more than its own ${boxWidth} width: it is no longer supported`
      );
      const settle = box.position[1] - restingHeights[index]!;
      assert.ok(
        settle > -half && settle < half,
        `box ${index} moved ${settle.toFixed(3)} vertically: sank through the box below or was ejected`
      );
      assert.ok(Number.isFinite(box.position[1]), `box ${index} left the simulation entirely`);
    }
    // The layer structure survived: still six distinct levels in the original order, which a
    // collapsed stack cannot satisfy however its drift is measured.
    for (let index = 1; index < boxes.length; index += 1) {
      assert.ok(
        boxes[index]!.position[1] > boxes[index - 1]!.position[1] + half,
        `boxes ${index - 1} and ${index} are no longer distinct layers: the stack collapsed`
      );
    }
    // And the stack is at rest, not vibrating in place.
    const energy = world.snapshot().stats.kineticEnergy;
    assert.ok(energy < 0.5, `stack never settled: residual kinetic energy ${energy.toFixed(3)}`);
  });
});

describe("production backend invariant 2 — joint behaviour", () => {
  it("holds a body against gravity, which the 1.5.x silent no-op did not", () => {
    // The regression case, stated as physics. Before WS-4.3 the default backend never
    // called `constraint.solve()`, so this body reached about y = -18.8.
    const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: FIXED_DELTA, enableSleeping: false, solverIterations: 8 });
    const anchor = world.createRigidBody({ type: "static", position: [0, 2, 0] });
    world.createCollider(anchor, { shape: Shape.box(0.1, 0.1, 0.1) });
    const hanging = world.createRigidBody({ position: [0, 1, 0], mass: 1 });
    world.createCollider(hanging, { shape: Shape.box(0.1, 0.1, 0.1) });
    world.createConstraint({ type: "fixed", bodyA: anchor, bodyB: hanging });

    for (let step = 0; step < 240; step += 1) world.step(FIXED_DELTA);

    assert.ok(
      hanging.position[1] > 0.5,
      `joint did not hold: body fell to y=${hanging.position[1].toFixed(3)} (free fall reaches about -18.8)`
    );
  });

  it("makes the no-op class structurally impossible, not merely fixed", () => {
    // A joint that holds *because a test happens to exercise it* is the state 1.5.x was in.
    // The property that makes the class impossible is that the world reports the constraint
    // and that removing gravity's effect on the body is observable through public state at
    // any solver iteration count — including 1, where a weak solver would give up.
    for (const solverIterations of [1, 4, 16]) {
      const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: FIXED_DELTA, enableSleeping: false, solverIterations });
      const anchor = world.createRigidBody({ type: "static", position: [0, 2, 0] });
      world.createCollider(anchor, { shape: Shape.box(0.1, 0.1, 0.1) });
      const hanging = world.createRigidBody({ position: [0, 1, 0], mass: 1 });
      world.createCollider(hanging, { shape: Shape.box(0.1, 0.1, 0.1) });
      world.createConstraint({ type: "fixed", bodyA: anchor, bodyB: hanging });

      for (let step = 0; step < 120; step += 1) world.step(FIXED_DELTA);

      assert.equal(world.snapshot().stats.constraints, 1);
      assert.ok(
        hanging.position[1] > -2,
        `joints were a no-op at solverIterations=${solverIterations}: y=${hanging.position[1].toFixed(3)}`
      );
    }
  });
});

describe("production backend invariant 3 — tunnelling and CCD at high velocity", () => {
  it("stops a fast mover at a thin wall instead of passing through it", () => {
    // The decision file records raw cannon-es tunnelling this fixture to y/x far past the
    // wall (measured -392 on the vertical variant). The guarantee is Aura3D's
    // adaptive-substep wrapper, which is why this invariant belongs to us.
    const world = new PhysicsWorld({
      gravity: [0, 0, 0],
      fixedDelta: FIXED_DELTA,
      solverIterations: 8,
      enableSleeping: false,
      continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 256, motionThreshold: 0.5 }
    });
    const wall = world.createRigidBody({ type: "static", position: [0, 0, 0] });
    world.createCollider(wall, { shape: Shape.box(0.05, 2, 2) });
    const bullet = world.createRigidBody({ position: [-2, 0, 0], velocity: [240, 0, 0], mass: 1 });
    world.createCollider(bullet, { shape: Shape.box(0.05, 0.05, 0.05) });

    world.step(FIXED_DELTA);

    const ccd = world.snapshot().backend.continuousCollision;
    assert.equal(ccd.active, true);
    assert.equal(ccd.provider, "aura3d-adaptive-substep-wrapper");
    assert.ok(ccd.lastSubSteps > 1, "CCD did not subdivide the step for a 240 m/s body");
    assert.ok(bullet.position[0] < 0, `bullet tunnelled to x=${bullet.position[0].toFixed(3)} past the wall at x=0`);
    assert.ok(bullet.velocity[0] <= 0, `no impact response: vx=${bullet.velocity[0].toFixed(3)}`);
  });

  it("scales protection with speed rather than assuming a fixed substep count", () => {
    // A fixed substep count is protection only up to whatever speed it was tuned for. The
    // invariant is that faster bodies get more subdivision, so the guarantee survives a
    // route that moves something faster than the author of the wrapper imagined.
    const subStepsAt = (speed: number): number => {
      const world = new PhysicsWorld({
        gravity: [0, 0, 0],
        fixedDelta: FIXED_DELTA,
        enableSleeping: false,
        continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 512, motionThreshold: 0.5 }
      });
      const wall = world.createRigidBody({ type: "static", position: [0, 0, 0] });
      world.createCollider(wall, { shape: Shape.box(0.05, 2, 2) });
      const body = world.createRigidBody({ position: [-40, 0, 0], velocity: [speed, 0, 0], mass: 1 });
      world.createCollider(body, { shape: Shape.box(0.05, 0.05, 0.05) });
      world.step(FIXED_DELTA);
      return world.snapshot().backend.continuousCollision.lastSubSteps;
    };
    assert.ok(subStepsAt(400) > subStepsAt(50), "substep count did not grow with body speed");
  });
});

describe("production backend invariant 4 — sleeping and waking", () => {
  it("puts a settled body to sleep and wakes it on impact", () => {
    // Sleeping is a performance feature that becomes a correctness bug when a body will not
    // wake: the route shows a box that ignores something landing on it.
    const world = new PhysicsWorld({
      gravity: [0, -9.81, 0],
      fixedDelta: FIXED_DELTA,
      solverIterations: 8,
      enableSleeping: true,
      sleepVelocityThreshold: 0.05,
      sleepDelay: 0.3
    });
    const ground = world.createRigidBody({ type: "static", position: [0, 0, 0] });
    world.createCollider(ground, { shape: Shape.box(20, 0.5, 20), material: { friction: 0.9, restitution: 0 } });
    const resting = world.createRigidBody({ position: [0, 0.7, 0], mass: 1, friction: 0.9 });
    world.createCollider(resting, { shape: Shape.box(0.2, 0.2, 0.2), material: { friction: 0.9, restitution: 0 } });

    for (let step = 0; step < 300; step += 1) world.step(FIXED_DELTA);
    assert.equal(resting.sleeping, true, "a body at rest on the floor never went to sleep");
    assert.ok(world.snapshot().stats.sleepingBodies >= 1);

    // A hard impulse is an unambiguous wake signal.
    resting.applyImpulse([0, 6, 0]);
    world.step(FIXED_DELTA);
    assert.equal(resting.sleeping, false, "an impulse did not wake a sleeping body");
    assert.ok(resting.position[1] > 0.7, "the woken body did not actually move");
  });
});

describe("production backend invariant 5 — deterministic repeatability", () => {
  /** One non-trivial scene: contacts, rotation, a joint, and a fast body. */
  const runScene = (): readonly (readonly number[])[] => {
    const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: FIXED_DELTA, solverIterations: 6 });
    const ground = world.createRigidBody({ type: "static", position: [0, 0, 0] });
    world.createCollider(ground, { shape: Shape.box(20, 0.5, 20), material: { friction: 0.7, restitution: 0.1 } });
    for (let index = 0; index < 5; index += 1) {
      const body = world.createRigidBody({
        position: [index * 0.13 - 0.26, 1.2 + index * 0.45, index * -0.11],
        mass: 1 + index * 0.2,
        angularVelocity: [0.3 * index, 0.2, -0.4 * index],
        friction: 0.7
      });
      world.createCollider(body, { shape: Shape.box(0.19, 0.19, 0.19), material: { friction: 0.7, restitution: 0.1 } });
    }
    const anchor = world.createRigidBody({ type: "static", position: [2, 2, 0] });
    world.createCollider(anchor, { shape: Shape.box(0.1, 0.1, 0.1) });
    const swinging = world.createRigidBody({ position: [2, 1.2, 0], mass: 1 });
    world.createCollider(swinging, { shape: Shape.sphere(0.15) });
    world.createConstraint({ type: "fixed", bodyA: anchor, bodyB: swinging });

    for (let step = 0; step < 180; step += 1) world.step(FIXED_DELTA);
    return world.snapshot().bodies.map((body) => [...body.position, ...body.rotation, ...body.velocity]);
  };

  it("produces bit-identical results across runs", () => {
    // Not "close enough": identical. Anything less breaks replay, which the PRD keeps as a
    // differentiator, and makes a flaky route test indistinguishable from a real defect.
    assert.deepEqual(runScene(), runScene());
  });

  it("produces bit-identical results across interleaved sessions", () => {
    // Two worlds alive at once. Catches state that leaks through module scope — a shared
    // scratch vector, an id counter feeding into iteration order — which a sequential
    // comparison cannot see.
    const worlds = [0, 1].map(() => {
      const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: FIXED_DELTA, solverIterations: 6 });
      const ground = world.createRigidBody({ type: "static", position: [0, 0, 0] });
      world.createCollider(ground, { shape: Shape.box(10, 0.5, 10), material: { friction: 0.7, restitution: 0.2 } });
      const body = world.createRigidBody({ position: [0.07, 2, -0.03], mass: 1, angularVelocity: [0.5, 0.1, -0.3], friction: 0.7 });
      world.createCollider(body, { shape: Shape.box(0.2, 0.2, 0.2), material: { friction: 0.7, restitution: 0.2 } });
      return world;
    });
    for (let step = 0; step < 150; step += 1) {
      for (const world of worlds) world.step(FIXED_DELTA);
    }
    const [first, second] = worlds.map((world) => world.snapshot().bodies.map((body) => [...body.position, ...body.rotation]));
    assert.deepEqual(first, second);
  });
});

describe("production backend invariant 6 — character grounding", () => {
  it("reports grounded on a floor and not grounded in the air", () => {
    // cannon-es ships no character controller, so this is entirely ours and therefore
    // entirely our obligation to prove. `grounded` is what coyote time, footstep audio and
    // any state machine keyed on the floor all read.
    const { world } = groundedWorld();
    const character = new CharacterController(world, { position: [0, 1.2, 0] });

    for (let step = 0; step < 120; step += 1) {
      world.step(FIXED_DELTA);
      character.step(FIXED_DELTA);
    }
    const landed = character.step(FIXED_DELTA);
    assert.equal(landed.grounded, true, "character never registered the floor it is standing on");
    assert.ok(Math.abs(landed.groundNormal[1] - 1) < 0.1, "flat floor did not report an up normal");
    assert.ok(landed.slopeAngle < 0.05, `flat floor reported a slope of ${landed.slopeAngle.toFixed(3)} rad`);

    character.teleport([0, 6, 0]);
    world.step(FIXED_DELTA);
    assert.equal(character.step(FIXED_DELTA).grounded, false, "character reported grounded while airborne");
  });

  it("jumps to a height the jump speed can actually reach", () => {
    // The skyline-runner symptom was a jump that barely left the floor. Stated as physics:
    // a jump must approach its ballistic ceiling, v^2/2g, not a small fraction of it.
    const { world } = groundedWorld();
    const jumpSpeed = 5;
    const character = new CharacterController(world, { position: [0, 1.2, 0], jumpSpeed });
    for (let step = 0; step < 90; step += 1) {
      world.step(FIXED_DELTA);
      character.step(FIXED_DELTA);
    }
    const floorHeight = character.body.position[1];

    character.jump();
    let peak = floorHeight;
    for (let step = 0; step < 90; step += 1) {
      world.step(FIXED_DELTA);
      character.step(FIXED_DELTA);
      peak = Math.max(peak, character.body.position[1]);
    }

    const rise = peak - floorHeight;
    const ballisticCeiling = (jumpSpeed * jumpSpeed) / (2 * 9.81);
    assert.ok(
      rise > ballisticCeiling * 0.5,
      `jump reached ${rise.toFixed(3)} of a possible ${ballisticCeiling.toFixed(3)}: a jump this weak is unusable`
    );
    assert.ok(rise <= ballisticCeiling * 1.2, `jump exceeded its own ballistic ceiling: ${rise.toFixed(3)}`);
  });
});

describe("production backend invariant 7 — slope and step movement", () => {
  it("walks up a step no taller than maxStepHeight without jumping", () => {
    // A capsule sees a kerb as a vertical wall and stops dead. Level geometry is full of
    // them, so without step-up a character sticks on scenery a player expects to stride over.
    const { world } = groundedWorld();
    const stepHeight = 0.18;
    // Ledge spans x = 2 .. 6, so there is somewhere to stand once the step is climbed. A
    // short ledge lets the character walk straight off the far side and read as "did not climb".
    const ledge = world.createRigidBody({ type: "static", position: [4, 0.5 + stepHeight / 2, 0] });
    world.createCollider(ledge, { shape: Shape.box(2, stepHeight / 2, 2), material: { friction: 0.9, restitution: 0 } });

    const character = new CharacterController(world, { position: [0, 1.2, 0], maxStepHeight: 0.25, maxSpeed: 3 });
    for (let step = 0; step < 60; step += 1) {
      world.step(FIXED_DELTA);
      character.step(FIXED_DELTA);
    }
    const startBase = character.body.position[1] - character.halfHeight - character.radius;

    character.setMoveInput({ x: 1 });
    let steppedUpOnce = false;
    let groundedFrames = 0;
    let frames = 0;
    for (let step = 0; step < 150; step += 1) {
      world.step(FIXED_DELTA);
      const state = character.step(FIXED_DELTA);
      frames += 1;
      if (state.steppedUp > 0) steppedUpOnce = true;
      if (state.grounded) groundedFrames += 1;
      if (character.body.position[0] > 3.4) break;
    }

    assert.ok(steppedUpOnce, "character never reported a step-up");
    assert.ok(
      character.body.position[0] > 3,
      `character stalled before or on the step edge: x=${character.body.position[0].toFixed(3)}`
    );
    const endBase = character.body.position[1] - character.halfHeight - character.radius;
    assert.ok(
      endBase > startBase + stepHeight * 0.7,
      `character did not end up on the ledge: base went ${startBase.toFixed(3)} -> ${endBase.toFixed(3)} for a ${stepHeight} step`
    );
    // Step-up must not cost grounding. Stated as a fraction of the frames actually walked,
    // because the loop stops as soon as the ledge is reached: the defect this replaced
    // oscillated up/down every frame and `grounded` flickered false for roughly half of them,
    // where the fixed version stays grounded throughout.
    assert.ok(
      groundedFrames >= frames * 0.95,
      `grounded flickered during the climb: ${groundedFrames} of ${frames} frames grounded`
    );
  });

  it("distinguishes a walkable slope from a wall using maxSlopeAngleRadians", () => {
    // The property that makes slope handling meaningful: the same code must accept a ramp
    // and reject a cliff, decided by the declared limit rather than by luck of geometry.
    const walkable = slopeRun(Math.PI / 8, 180);
    assert.equal(walkable.onSteepSlope, false, "a gentle ramp was rejected as too steep");
    assert.equal(walkable.grounded, true, "a walkable ramp did not register as ground");
    // 22.5 degrees is 0.3927 rad. The angle must be measured, not reported as flat.
    assert.ok(
      Math.abs(walkable.slopeAngle - Math.PI / 8) < 0.05,
      `ramp reported ${walkable.slopeAngle.toFixed(4)} rad for a ${(Math.PI / 8).toFixed(4)} rad slope`
    );

    /*
     * The steep case is sampled early, on purpose.
     *
     * A near-vertical face is by definition one a character slides off. Measured on an
     * 81.8-degree plane: the classification is correct for frames 0-9 and by frame 10 the
     * capsule has slid clear of the probe's reach and is in open air, where `onSteepSlope` is
     * correctly false. Sampling late would assert nothing; the moment that matters is while
     * contact still exists.
     */
    const tooSteep = slopeRun(Math.PI / 2.2, 5);
    assert.equal(tooSteep.grounded, false, "a near-vertical face was accepted as walkable ground");
    assert.equal(tooSteep.onSteepSlope, true, "a near-vertical face was not classified as a steep slope");
    // `steep` must still report the real face normal rather than world up, or a caller has
    // nothing to slide along.
    assert.ok(
      tooSteep.groundNormal[1] < Math.cos(Math.PI / 4),
      `steep face reported a walkable normal: ${tooSteep.groundNormal.map((n) => n.toFixed(3)).join(",")}`
    );
    assert.ok(tooSteep.groundNormal[0] < -0.5, "steep face normal did not point away from the slope");
  });

  function slopeRun(angle: number, frames: number) {
    const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: FIXED_DELTA, solverIterations: 8 });
    // A tilted plane is the cleanest slope: infinite, exact normal, no edge to catch on.
    const normal: [number, number, number] = [-Math.sin(angle), Math.cos(angle), 0];
    const ramp = world.createRigidBody({ type: "static", position: [0, 0, 0] });
    world.createCollider(ramp, { shape: Shape.plane(normal, 0), material: { friction: 0.95, restitution: 0 } });
    const character = new CharacterController(world, {
      position: [0, 1.5, 0],
      maxSlopeAngleRadians: Math.PI / 4,
      maxSpeed: 2
    });
    let state = character.step(FIXED_DELTA);
    for (let step = 0; step < frames; step += 1) {
      world.step(FIXED_DELTA);
      state = character.step(FIXED_DELTA);
    }
    return state;
  }
});

describe("production backend invariant 8 — vehicle suspension", () => {
  it("compresses under load and returns, rather than reporting a constant", () => {
    // The turbo-drift symptom was wheels sunk into the road. A suspension that reports the
    // same four numbers in every state is indistinguishable from no suspension at all, so
    // the invariant is that it *responds* to load — and stays inside its travel while doing so.
    const straight = sampleArcadeVehicleTelemetry({ elapsedSeconds: 4, throttle: 1, steer: 0 });
    const cornering = sampleArcadeVehicleTelemetry({ elapsedSeconds: 4, throttle: 1, steer: 1 });
    const drifting = sampleArcadeVehicleTelemetry({ elapsedSeconds: 4, throttle: 1, steer: 1, handbrake: true });

    for (const [label, sample] of [["straight", straight], ["cornering", cornering], ["drifting", drifting]] as const) {
      for (const [corner, compression] of sample.suspensionCompression.entries()) {
        assert.ok(
          Number.isFinite(compression) && compression >= 0 && compression <= 1,
          `${label} corner ${corner} left its travel: ${compression}`
        );
      }
    }

    // Cornering loads the outside corners differently from straight running, and a drift
    // differently again. Identical numbers across those states mean a constant, not a spring.
    const differs = (a: readonly number[], b: readonly number[]) =>
      a.some((value, corner) => Math.abs(value - b[corner]!) > 1e-4);
    assert.ok(
      differs(straight.suspensionCompression, cornering.suspensionCompression),
      "suspension was identical straight and cornering: it is not responding to lateral load"
    );
    assert.ok(
      differs(cornering.suspensionCompression, drifting.suspensionCompression),
      "suspension was identical cornering and drifting: it is not responding to slip"
    );
    // Left and right must not move together under steering, or it is a ride-height offset
    // rather than per-corner load transfer.
    const [frontLeft, frontRight] = cornering.suspensionCompression;
    assert.ok(
      Math.abs(frontLeft - frontRight) > 1e-4,
      `both front corners compressed equally while cornering (${frontLeft} vs ${frontRight}): no load transfer`
    );
  });

  it("keeps a contact-driven vehicle body on top of the road, not sunk into it", () => {
    // Stated where the defect was visible: the chassis must rest above the surface.
    const { world } = groundedWorld({ friction: 0.9 });
    const chassis = world.createRigidBody({ position: [0, 1.4, 0], mass: 900, friction: 0.9, linearDamping: 0.05 });
    world.createCollider(chassis, { shape: Shape.box(0.9, 0.35, 2), material: { friction: 0.9, restitution: 0 } });

    for (let step = 0; step < 300; step += 1) world.step(FIXED_DELTA);

    // Ground top surface is y = 0.5; a 0.35 half-height chassis rests at about y = 0.85.
    assert.ok(
      chassis.position[1] > 0.5,
      `chassis sank into the road: y=${chassis.position[1].toFixed(3)} with the surface at 0.5`
    );
    assert.ok(chassis.position[1] < 1.4, "chassis never settled onto the road at all");
  });
});

describe("production backend invariant 9 — initialization and disposal", () => {
  it("constructs, steps and tears down repeatedly without leaking state between worlds", () => {
    // The browser-lifecycle invariant. A route mounts, unmounts and remounts; the second
    // mount must behave like the first. Anything cached in module scope shows up here.
    const finalHeights: number[] = [];
    for (let session = 0; session < 5; session += 1) {
      const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: FIXED_DELTA, solverIterations: 6 });
      const ground = world.createRigidBody({ type: "static", position: [0, 0, 0] });
      const groundCollider = world.createCollider(ground, { shape: Shape.box(10, 0.5, 10), material: { friction: 0.8, restitution: 0 } });
      const body = world.createRigidBody({ position: [0, 3, 0], mass: 1, friction: 0.8 });
      const bodyCollider = world.createCollider(body, { shape: Shape.box(0.2, 0.2, 0.2), material: { friction: 0.8, restitution: 0 } });

      for (let step = 0; step < 120; step += 1) world.step(FIXED_DELTA);
      finalHeights.push(body.position[1]);

      // Teardown through the public API, in the order a route unmount would.
      world.removeCollider(bodyCollider.id);
      world.removeRigidBody(body.id);
      world.removeCollider(groundCollider.id);
      world.removeRigidBody(ground.id);
      const emptied = world.snapshot();
      assert.equal(emptied.stats.bodies, 0, `session ${session} leaked bodies after teardown`);
      assert.equal(emptied.stats.colliders, 0, `session ${session} leaked colliders after teardown`);
      // An emptied world must still step rather than throw: unmount ordering is not
      // guaranteed, so a final frame can arrive after teardown.
      world.step(FIXED_DELTA);
    }
    // Every session fell to the same place. A drifting value means state survived a world.
    for (const height of finalHeights) {
      expect(height).toBeCloseTo(finalHeights[0]!, 12);
    }
  });

  it("removes a body mid-simulation without disturbing the bodies around it", () => {
    // Routes despawn things while the world runs. Removal must not perturb neighbours.
    const { world } = groundedWorld({ friction: 0.9 });
    const keep = world.createRigidBody({ position: [-0.6, 0.7, 0], mass: 1, friction: 0.9 });
    world.createCollider(keep, { shape: Shape.box(0.2, 0.2, 0.2), material: { friction: 0.9, restitution: 0 } });
    const doomed = world.createRigidBody({ position: [0.6, 0.7, 0], mass: 1, friction: 0.9 });
    world.createCollider(doomed, { shape: Shape.box(0.2, 0.2, 0.2), material: { friction: 0.9, restitution: 0 } });

    for (let step = 0; step < 120; step += 1) world.step(FIXED_DELTA);
    const before = [...keep.position];

    world.removeRigidBody(doomed.id);
    for (let step = 0; step < 60; step += 1) world.step(FIXED_DELTA);

    assert.equal(world.snapshot().stats.bodies, 2, "removal did not take the body out of the world");
    for (const axis of [0, 1, 2]) {
      assert.ok(
        Math.abs(keep.position[axis]! - before[axis]!) < 0.05,
        `removing a neighbour moved the surviving body on axis ${axis}`
      );
    }
  });
});
