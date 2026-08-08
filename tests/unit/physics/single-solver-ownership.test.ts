import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import { PhysicsWorld, Shape } from "../../../packages/physics/src/index.js";

/**
 * WS-4.3 — R12 single ownership for the physics solver, enforced in source and at runtime.
 *
 * `PhysicsWorld` used to contain two complete solvers behind one `step()`. That was not a
 * safety net; it was the defect generator. Every behaviour only one branch implemented
 * shipped as a silent divergence, and the unit suite stayed green throughout because the
 * tests pinned the branch that worked:
 *
 * - joints were solved on `aura-js` and were a **no-op** on the default `cannon-es` path
 *   (a `fixed` joint free-fell to y = -18.8 instead of hanging);
 * - `applyForce` accumulated on `aura-js` and was **dropped** on `cannon-es`;
 * - collider `material`, declared `inertia`, and three of the seven public `Shape` kinds
 *   were `aura-js`-only;
 * - `disableCannonBackend` could swap the whole world onto the second solver mid-scene,
 *   without throwing or warning, because one collider used an unsupported shape.
 *
 * WS-4.2 chose one production backend (`docs/architecture/physics-backend-decision.md`)
 * and WS-4.3 removed the other. These assertions are what stops it coming back: a future
 * "just add a fallback for X" has to fail here first.
 *
 * Deliberately both source-level and behavioural. A behavioural test alone cannot see a
 * second solver that is merely reachable, and a source gate alone does not prove the one
 * remaining solver actually runs.
 */

const WORLD_SOURCE = readFileSync(join(process.cwd(), "packages/physics/src/PhysicsWorld.ts"), "utf8");

describe("the physics solver has exactly one owner", () => {
  it("declares exactly one selectable backend", () => {
    const match = /^export type PhysicsBackend = ([^;]+);/m.exec(WORLD_SOURCE);
    expect(match, "PhysicsBackend union not found — was the type renamed?").not.toBeNull();
    const members = match![1]!.split("|").map((member) => member.trim()).filter(Boolean);
    expect(members).toEqual(['"cannon-es"']);
  });

  it("has no runtime path that downgrades the backend", () => {
    // `disableCannonBackend` was the mechanism. It is named in a comment recording the
    // removal, so this looks for a declaration or a call, not a mention.
    expect(WORLD_SOURCE).not.toMatch(/\bdisableCannonBackend\s*\(/);
    expect(WORLD_SOURCE).not.toMatch(/private\s+disableCannonBackend\b/);
  });

  it("does not carry a second integrator behind step()", () => {
    // The removed branch was the only caller of these three private methods and of
    // `RigidBody.integrate`. If any reappears in this file, a second solver is back.
    for (const symbol of ["resolveContact", "applyImpulsePair", "effectiveMaterial"]) {
      expect(WORLD_SOURCE, `${symbol} reappeared: a second contact resolver is back`).not.toMatch(
        new RegExp(`private\\s+${symbol}\\b`)
      );
    }
    expect(WORLD_SOURCE, "step() integrates bodies itself instead of delegating to the backend").not.toMatch(
      /\.integrate\(/
    );
  });

  it("still advertises no fallback in its public selection type", () => {
    // `PhysicsBackendSelection.fallback` / `.jsFallbackAvailable` described the second
    // solver to callers. A snapshot that can report a fallback implies one exists.
    expect(WORLD_SOURCE).not.toMatch(/\bjsFallbackAvailable\b/);
    expect(WORLD_SOURCE).not.toMatch(/readonly fallback\?:/);
  });

  it("runs the production backend whether or not the caller asks for it", () => {
    for (const descriptor of [{}, { backend: "auto" as const }, { backend: "cannon-es" as const }]) {
      const world = new PhysicsWorld(descriptor);
      const body = world.createRigidBody({ position: [0, 4, 0], mass: 1 });
      world.createCollider(body, { shape: Shape.sphere(0.5) });
      world.step(1 / 60);
      assert.equal(world.snapshot().backend.active, "cannon-es");
    }
  });

  it("rejects the removed backend by name instead of quietly running a different solver", () => {
    // Reachable from JavaScript and from anything compiled against 1.5.x, where this string
    // selected a real solver. Silence here is exactly the old failure mode.
    expect(() => new PhysicsWorld({ backend: "aura-js" as never })).toThrow(/removed in WS-4\.3/);
  });

  it("refuses an inexpressible collider at the call site rather than swapping solvers", () => {
    const world = new PhysicsWorld({ gravity: [0, -9.81, 0] });
    const body = world.createRigidBody({ type: "static", position: [0, 0, 0] });
    // `Shape.convexHull` validates the vertex count itself, so the degenerate case that
    // actually reaches the backend is enough vertices but too few faces: 4 vertices
    // described by a single triangle cannot close a polyhedron.
    const degenerate = Shape.convexHull(
      [[0.5, 0.5, 0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, -0.5], [0.5, -0.5, -0.5]],
      [0, 1, 2]
    );

    expect(() => world.createCollider(body, { shape: degenerate })).toThrow(
      /cannot be expressed on the production physics backend/
    );
    // And the world is still on the production backend, not degraded by the attempt.
    assert.equal(world.snapshot().backend.active, "cannon-es");
  });
});
