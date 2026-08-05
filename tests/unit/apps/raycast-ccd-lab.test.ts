import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PhysicsWorld, Shape, timeOfImpact } from "@aura3d/physics";

/**
 * `examples/raycast-ccd-lab` exists to give `raycasting` and `continuous collision detection` a real
 * shipped consumer.
 *
 * Both were `parity-unproven` with the reason "no production consumer imports this capability", and
 * that was accurate: the queries were implemented and unit-tested, but nothing shipped used them, so
 * the parity claim had no product surface behind it.
 *
 * These tests reproduce the route's own scenarios against the same public API, so the example cannot
 * drift into demonstrating something that does not hold. A route that merely *mentions* the symbols
 * would satisfy the parity scanner while proving nothing.
 */
const MAIN = "examples/raycast-ccd-lab/main.ts";

/** The corridor the route builds: a shooter, a far wall, and two posts with a narrow gap. */
function buildCorridor() {
  const world = new PhysicsWorld({ gravity: [0, 0, 0], fixedDelta: 1 / 60 });
  const shooter = world.createRigidBody({ type: "dynamic", mass: 1, position: [0, 0.5, 0] });
  world.createCollider(shooter, { shape: Shape.sphere(0.2) });
  const farWall = world.createRigidBody({ type: "static", position: [0, 0.5, -6] });
  world.createCollider(farWall, { shape: Shape.box(2.4, 1.2, 0.2) });
  const leftPost = world.createRigidBody({ type: "static", position: [-0.42, 0.5, -3] });
  world.createCollider(leftPost, { shape: Shape.box(0.3, 1.2, 0.2) });
  const rightPost = world.createRigidBody({ type: "static", position: [0.42, 0.5, -3] });
  world.createCollider(rightPost, { shape: Shape.box(0.3, 1.2, 0.2) });
  return { world, shooter, farWall, leftPost, rightPost };
}

describe("raycast-ccd-lab example is a real consumer of the query APIs", () => {
  it("ships the files the parity scanner and dev server need", () => {
    expect(existsSync(MAIN)).toBe(true);
    expect(existsSync("examples/raycast-ccd-lab/index.html")).toBe(true);
    expect(existsSync("examples/raycast-ccd-lab/README.md")).toBe(true);
  });

  it("imports the capability symbols the parity report resolves consumers by", () => {
    const source = readFileSync(MAIN, "utf8");
    // These exact names are what `build-threejs-parity.mjs` greps for.
    for (const symbol of ["RaycastHit", "SphereCastHit", "timeOfImpact", "TimeOfImpactHit"]) {
      expect(source, `${symbol} must be imported, not merely mentioned`).toMatch(
        new RegExp(`\\b${symbol}\\b`)
      );
    }
    // And it must actually call the queries, not just reference the types.
    expect(source).toContain("world.raycast(");
    expect(source).toContain("world.sphereCast(");
    expect(source).toContain("timeOfImpact(");
  });

  it("an unfiltered cast from inside the shooter reports the shooter at distance 0", () => {
    /*
     * The self-hit defect, reproduced rather than assumed. I first wrote this test asserting the
     * opposite — that the cast would report the far wall — and it failed, which is how the example got
     * corrected. A character controller probing ahead really does detect its own capsule here.
     */
    const { world, shooter } = buildCorridor();
    const hit = world.raycast([0, 0.5, 0], [0, 0, -1], { maxDistance: 20 });
    expect(hit).toBeDefined();
    expect(hit?.bodyId).toBe(shooter.id);
    expect(hit?.distance).toBeCloseTo(0, 6);
  });

  it("ignoreBodies is load-bearing: excluding the shooter reveals the far wall", () => {
    // Not a cosmetic option. Without it the query above is unusable for any body-originated cast.
    const { world, shooter, farWall } = buildCorridor();
    const filtered = world.raycast([0, 0.5, 0], [0, 0, -1], { maxDistance: 20, ignoreBodies: [shooter.id] });
    expect(filtered?.bodyId).toBe(farWall.id);
    expect(filtered?.distance).toBeGreaterThan(5);
  });

  it("a spherecast catches a gap that a zero-radius ray threads", () => {
    /*
     * The reason `sphereCast` exists at all: a zero-radius ray slips between colliders a real
     * projectile would hit.
     *
     * `maxDistance` must clear the posts. They span z in [-3.2, -2.8], so from z = -1 the near face is
     * 1.8 units away — an earlier draft used 1.6 and both queries reported a miss, which looked like
     * the sphere fitting through and was really the cast stopping short. That is why this asserts a
     * positive hit distance rather than only "defined".
     */
    const { world } = buildCorridor();
    const ray = world.raycast([0, 0.5, -1], [0, 0, -1], { maxDistance: 3 });
    const sphere = world.sphereCast([0, 0.5, -1], 0.22, [0, 0, -1], { maxDistance: 3 });
    expect(ray, "a zero-radius ray should thread the gap").toBeUndefined();
    expect(sphere, "a 0.22-radius sweep should not fit through a 0.24-unit gap").toBeDefined();
    expect(sphere!.distance, "the hit must be at the posts, not at maxDistance").toBeLessThan(1.8);
    expect(sphere!.distance).toBeGreaterThan(1);
  });

  it("timeOfImpact reports the crossing a single discrete step would step over", () => {
    /*
     * The case CCD exists for. At 200 m/s a 1/60 s step advances 3.333 units; the wall face is well
     * inside that, so an unswept integrator moves the bullet from in front of the wall to behind it
     * with no contact generated at any sampled instant.
     */
    const bullet = Shape.sphere(0.06);
    const wall = Shape.box(2.4, 1.2, 0.2);
    const step = 1 / 60;
    const speed = 200;
    const startZ = -3.6;
    const distanceToWallFace = Math.abs(-6 - startZ) - 0.2 - 0.06;
    expect(speed * step, "the scenario must actually be a tunnelling case").toBeGreaterThan(distanceToWallFace);

    const hit = timeOfImpact(bullet, [0, 0.5, startZ], [0, 0, -speed], wall, [0, 0.5, -6], [0, 0, 0], step);
    expect(hit, "a sweep must find the crossing the discrete step misses").toBeDefined();
    expect(hit!.time).toBeGreaterThan(0);
    expect(hit!.time).toBeLessThan(step);
    // Impact time must match the geometry: distance to the face over speed.
    expect(hit!.time).toBeCloseTo(distanceToWallFace / speed, 3);
  });

  it("states its limits rather than implying query-performance parity", () => {
    const source = readFileSync(MAIN, "utf8");
    expect(source).toContain("not a claim of Rapier or PhysX query performance");
    // timeOfImpact sweeps AABBs, so a non-box claim would be an overclaim.
    expect(source).toMatch(/conservative for non-box shapes/);
  });
});
