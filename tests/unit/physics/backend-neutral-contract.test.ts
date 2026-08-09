import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as physics from "../../../packages/physics/src/index.js";

/**
 * WS-4.1 — the backend-neutral public contract, enforced.
 *
 * The PRD's proof for this workstream is `git grep -n "cannon-es"
 * packages/physics/src/index.ts` returning empty. That is necessary and nowhere near
 * sufficient: the barrel is `export *`, so a `CannonBody` in any re-exported module's
 * public signature reaches callers without the string ever appearing in `index.ts`.
 *
 * Backend neutrality is what makes a future solver swap a bounded change. WS-4.2 chose one
 * backend on measured evidence and wrote dated triggers for reopening the decision
 * (`docs/architecture/physics-backend-decision.md`), so the swap is a live possibility, not
 * a hypothetical. It stays bounded only while the solver is invisible from outside.
 *
 * So this asserts the property rather than the grep: exactly one file in the package may
 * import the typed Rapier adapter, and no backend handle may appear in an exported declaration.
 */

const PHYSICS_SRC = join(process.cwd(), "packages/physics/src");

function sourceFiles(): readonly string[] {
  return readdirSync(PHYSICS_SRC).filter((entry) => entry.endsWith(".ts"));
}

function read(file: string): string {
  return readFileSync(join(PHYSICS_SRC, file), "utf8");
}

/**
 * The single file allowed to import the solver.
 *
 * One entry, by design. The adapter being importable from exactly one file keeps the public
 * contract independent from its physical-simulation provider.
 */
const SOLVER_IMPORT_OWNER = "PhysicsWorld.ts";

describe("the public physics contract does not name its backend", () => {
  it("keeps the barrel itself free of the backend", () => {
    // The PRD's stated proof, retained as the floor rather than the ceiling.
    expect(read("index.ts")).not.toContain("physics-rapier");
  });

  it("imports the solver in exactly one file", () => {
    const importers = sourceFiles().filter((file) => /^\s*import[\s\S]*?from\s+"@aura3d\/physics-rapier"/m.test(read(file)));
    expect(importers).toEqual([SOLVER_IMPORT_OWNER]);
  });

  it("exposes no backend type in any exported declaration", () => {
    const leaks: string[] = [];
    for (const file of sourceFiles()) {
      const source = read(file);
      for (const [index, line] of source.split("\n").entries()) {
        // Exported declarations only. A `Cannon*` symbol inside a private field, a
        // module-local bridge function or a comment is an implementation detail; one in an
        // `export`ed signature is reachable by a caller and is the actual violation.
        if (!/^\s*export\s/.test(line)) continue;
        const match = /\bRapier(?:Body|Collider|Joint|Physics)\w*/.exec(line);
        if (match) leaks.push(`${file}:${index + 1} exports ${match[0]}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("covers all seven contract areas from the public surface", () => {
    // The seven areas WS-4.1 enumerates. A missing symbol is a hole in the contract, and
    // this reads the built surface rather than the barrel text so a broken re-export fails.
    const required: Readonly<Record<string, readonly string[]>> = {
      bodies: ["RigidBody"],
      colliders: ["Collider", "Shape"],
      joints: ["Constraint"],
      // Value exports only: this reads the runtime surface, so a type-only symbol such as
      // the `MeshBVH` interface is represented by its constructor, `buildMeshBVH`.
      "raycast/shapecast": ["raycastCollider", "sphereCastCollider", "timeOfImpact", "buildMeshBVH", "raycastMesh", "createMeshSurfaceQuery"],
      "authored-unit character movement": ["ArcadeCharacterController", "createFightingCharacterController"],
      vehicle: ["samplePacejkaTireForces", "sampleRacingAiDriver"],
      "deterministic stepping": ["PhysicsWorld", "PhysicsStepper"]
    };
    const surface = new Set(Object.keys(physics));
    const missing: string[] = [];
    for (const [area, symbols] of Object.entries(required)) {
      for (const symbol of symbols) {
        if (!surface.has(symbol)) missing.push(`${area}: ${symbol}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("declares deterministic stepping as a public property of the world", () => {
    const world = new physics.PhysicsWorld({ fixedDelta: 1 / 60 });
    expect(world.snapshot().backend.deterministic).toBe(true);

    // And it is a real promise, not a flag: two identical runs agree exactly.
    const run = () => {
      const scratch = new physics.PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60 });
      const floor = scratch.createRigidBody({ type: "static", position: [0, -1, 0] });
      scratch.createCollider(floor, { shape: physics.Shape.box(5, 0.5, 5) });
      const body = scratch.createRigidBody({ position: [0.1, 3, -0.2], mass: 1, angularVelocity: [0.3, 0, 0.7] });
      scratch.createCollider(body, { shape: physics.Shape.box(0.4, 0.4, 0.4) });
      for (let step = 0; step < 120; step += 1) scratch.step(1 / 60);
      return scratch.snapshot().bodies.map((entry) => [...entry.position, ...entry.rotation]);
    };
    expect(run()).toEqual(run());
  });
});
