import assert from "node:assert/strict";
import { test } from "vitest";
import { PhysicsWorld, Shape } from "../../../packages/physics/src/index.js";

/**
 * WS-4.3 — retired from characterization to contract.
 *
 * The previous version pinned `backend: "aura-js"` and asserted `vx === 3` exactly, plus
 * bit-exact invariance across `solverIterations`. Both were artifacts of the removed
 * fallback's single-pass arithmetic, not physical laws: an iterative solver is *supposed*
 * to remove more tangential velocity when given more iterations. Retaining those numbers
 * would have constrained the production backend to reproduce a deleted integrator.
 *
 * What is genuinely backend-neutral, and is what this file now asserts:
 *
 *   1. Friction is bounded by the accumulated normal impulse, not by how deeply the
 *      shapes happen to overlap on the frame contact is discovered. Penetration depth is
 *      a numerical artifact of discrete stepping; making grip depend on it means a body
 *      that lands harder grips differently for non-physical reasons.
 *   2. More solver iterations converge — they do not diverge, and do not grow the
 *      friction impulse without bound.
 *   3. Friction opposes motion; it can bring a body to rest but can never drive it
 *      backwards. This is the invariant that a badly clamped tangential impulse breaks.
 *
 * These held on the fallback and hold on the production backend, which is what makes them
 * the contract rather than a description of one implementation.
 */
function slideAfterContact(penetration: number, solverIterations: number, steps = 1): number {
  const world = new PhysicsWorld({
    gravity: [0, 0, 0],
    solverIterations,
    enableSleeping: false
  });
  const floorTop = -0.25;
  const box = world.createRigidBody({
    position: [0, floorTop + 0.5 - penetration, 0],
    velocity: [4, -2, 0]
  });
  world.createCollider(box, {
    shape: Shape.box(0.5, 0.5, 0.5),
    material: { friction: 0.5, restitution: 0 }
  });
  const floor = world.createRigidBody({ type: "static", position: [0, -0.75, 0] });
  world.createCollider(floor, {
    shape: Shape.box(10, 0.5, 10),
    material: { friction: 0.5, restitution: 0 }
  });

  for (let i = 0; i < steps; i += 1) world.step(1 / 60);
  return box.velocity[0];
}

test("declared friction acts even when the world declares no gravity", () => {
  // Regression: cannon-es bounds a contact's friction impulse by
  // `mu * reducedMass * |frictionGravity ?? gravity|`. With `frictionGravity` unset a
  // `gravity: [0, 0, 0]` world silently discarded *every* declared material friction, so
  // this whole file measured 4 -> 4. Zero-g is a supported public configuration.
  const slid = slideAfterContact(0.2, 1);
  assert.ok(slid < 4 - 1e-6, `friction did not act at all: vx stayed ${slid}`);
  assert.ok(slid >= 0, `friction reversed motion: vx=${slid}`);
});

test("Coulomb friction is bounded by accumulated normal impulse, not penetration depth", () => {
  const shallowContact = slideAfterContact(0.01, 1);
  const deepContact = slideAfterContact(0.45, 1);

  // Depth-independence on the discovery step is the physical claim. Tolerance is relative
  // to the shared value rather than bit-exact, because the production backend derives the
  // normal impulse from a solved constraint rather than a closed form.
  assert.ok(
    Math.abs(deepContact - shallowContact) <= Math.max(1e-6, Math.abs(shallowContact) * 0.02),
    `45x deeper penetration changed friction: shallow=${shallowContact} deep=${deepContact}`
  );
});

test("accumulated Coulomb friction converges with solver iteration count", () => {
  const series = [1, 2, 4, 8, 16, 32, 64, 128].map((iterations) =>
    slideAfterContact(0.2, iterations, 5)
  );

  for (const value of series) {
    assert.ok(Number.isFinite(value), `non-finite tangential velocity: ${value}`);
    assert.ok(value >= 0, `friction reversed motion: vx=${value}`);
  }

  // Monotone non-increasing: extra iterations remove more tangential velocity, never add.
  for (let i = 1; i < series.length; i += 1) {
    assert.ok(
      series[i]! <= series[i - 1]! + 1e-9,
      `iteration ${i} increased slide: ${series[i - 1]} -> ${series[i]}`
    );
  }

  // And it converges rather than drifting: the last doublings must barely move.
  const tail = Math.abs(series[series.length - 1]! - series[series.length - 2]!);
  assert.ok(tail < 0.01, `friction had not converged by 128 iterations, tail delta ${tail}`);
});

test("friction cannot reverse motion at any iteration count or duration", () => {
  for (const iterations of [1, 8, 64, 256]) {
    for (const steps of [1, 10, 60, 240]) {
      const value = slideAfterContact(0.2, iterations, steps);
      assert.ok(
        value >= -1e-9,
        `friction drove the body backwards at iterations=${iterations} steps=${steps}: vx=${value}`
      );
    }
  }
});
