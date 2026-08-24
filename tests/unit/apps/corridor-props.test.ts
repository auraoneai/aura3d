import { describe, expect, it } from "vitest";
import { PhysicsWorld } from "@aura3d/physics";
import { createCollisionLayers, createPhysicsRuntime } from "@aura3d/engine";
import { layers } from "../../../examples/neon-corridor-strike/src/game/level";
import {
  LAMPS,
  PROPS,
  WALK_PATH_RECTS,
  applyLampSupport,
  createPropWorld,
  lampBulbRest,
  propPlacementViolations,
  resetPropEvidence,
  scatterPropsAt
} from "../../../examples/neon-corridor-strike/src/game/props";

const DT = 1 / 60;

function snapshotPoses(physics: ReturnType<typeof createPhysicsRuntime>): { props: [string, number[]][]; lamps: [string, number[]][] } {
  const props: [string, number[]][] = [];
  const lamps: [string, number[]][] = [];
  for (const prop of PROPS) {
    const body = physics.bodies.get("prop-" + prop.id);
    if (!body) throw new Error("missing prop body " + prop.id);
    props.push([prop.id, [...body.position()]] as [string, number[]]);
  }
  for (const lamp of LAMPS) {
    const body = physics.bodies.get(lamp.id);
    if (!body) throw new Error("missing lamp body " + lamp.id);
    lamps.push([lamp.id, [...body.position()]] as [string, number[]]);
  }
  return { props, lamps };
}

/** Mirrors the authored corridor hull floor exactly. */
function buildRuntime() {
  const world = new PhysicsWorld({ gravity: [0, -24, 0], fixedDelta: DT, backend: "rapier" });
  const physics = createPhysicsRuntime(world, { layers });
  physics.createBody({
    name: "floor",
    type: "static",
    shape: "box",
    position: [0, -0.15, 0],
    halfExtents: [6, 0.2, 12],
    layer: "wall"
  });
  return physics;
}

describe("Neon Corridor Strike debris placement law", () => {
  it("places every authored prop and lamp clear of walk path, lanes, pickups, and exit corridor", () => {
    const result = propPlacementViolations();
    expect(result.violations).toEqual([]);
  });

  it("the checker itself rejects placements inside every protected zone", () => {
    const cases = [
      { x: 0, z: -8.4, label: "exit-corridor probe" },
      { x: 1.9, z: 7.4, label: "pickup-center probe" },
      { x: 0, z: 9, label: "spawn-zone probe" },
      ...WALK_PATH_RECTS.map((rect) => ({ x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2, label: "walk-path probe" }))
    ];
    const result = propPlacementViolations(cases);
    expect(result.violations.length).toBeGreaterThanOrEqual(cases.length);
    expect(result.violations.some((v) => v.includes("exit-sensor corridor"))).toBe(true);
    expect(result.violations.some((v) => v.includes("walk path"))).toBe(true);
  });
});

describe("Neon Corridor Strike deterministic settle (production Rapier)", () => {
  it("props and spring lamps settle identically across two fresh worlds", () => {
    const run = () => {
      const physics = buildRuntime();
      createPropWorld(physics);
      for (let i = 0; i < 240; i += 1) {
        applyLampSupport(physics);
        physics.step(DT);
      }
      return snapshotPoses(physics);
    };
    resetPropEvidence();
    const first = run();
    resetPropEvidence();
    const second = run();
    const round = (frames: ReturnType<typeof snapshotPoses>) => ({
      props: frames.props.map(([id, p]) => [id, p.map((v) => Number(v.toFixed(6)))]),
      lamps: frames.lamps.map(([id, p]) => [id, p.map((v) => Number(v.toFixed(6)))])
    });
    expect(round(second)).toEqual(round(first));

    // Settled: props stay on the deck, bulbs hang in their upper-wall band.
    const physicsA = buildRuntime();
    createPropWorld(physicsA);
    for (let i = 0; i < 240; i += 1) {
      applyLampSupport(physicsA);
      physicsA.step(DT);
    }
    for (const prop of PROPS) {
      const body = physicsA.bodies.require("prop-" + prop.id);
      expect(body.position()[1]).toBeGreaterThan(0);
      expect(Math.hypot(...body.velocity())).toBeLessThan(0.2);
    }
    for (const lamp of LAMPS) {
      const rest = lampBulbRest(lamp);
      const body = physicsA.bodies.require(lamp.id);
      // Spring equilibrium sits near (never far under) the authored hang point.
      expect(body.position()[1]).toBeGreaterThan(rest[1] - 0.25);
      expect(body.position()[1]).toBeLessThan(lamp.anchor[1]);
      expect(body.position()[0]).toBeCloseTo(rest[0], 1);
      expect(body.velocity()[1]).toBeLessThan(0.2);
    }
  });

  it("a confirmed impact sways the nearby lamp deterministically and settles back", () => {
    const impactPoint: readonly [number, number, number] = [-1.5, 1.5, 3.2];
    const run = () => {
      const physics = buildRuntime();
      createPropWorld(physics);
      for (let i = 0; i < 240; i += 1) {
        applyLampSupport(physics);
        physics.step(DT);
      }
      const baseline = [...(physics.bodies.require(LAMPS[0]!.id).position())];
      const nudged = scatterPropsAt(physics, impactPoint);
      expect(nudged).toBeGreaterThan(0);
      let peakSwing = 0;
      for (let i = 0; i < 360; i += 1) {
        applyLampSupport(physics);
        physics.step(DT);
        const at = physics.bodies.require(LAMPS[0]!.id).position();
        peakSwing = Math.max(peakSwing, Math.hypot(at[0] - baseline[0], at[1] - baseline[1], at[2] - baseline[2]));
      }
      const after = physics.bodies.require(LAMPS[0]!.id);
      return { baseline, peakSwing, endPosition: [...after.position()], endSpeed: Math.hypot(...after.velocity()) };
    };
    resetPropEvidence();
    const first = run();
    resetPropEvidence();
    const second = run();
    const round = (r: ReturnType<typeof run>) => ({
      baseline: r.baseline.map((v) => Number(v.toFixed(6))),
      peakSwing: Number(r.peakSwing.toFixed(4)),
      endPosition: r.endPosition.map((v) => Number(v.toFixed(6))),
      endSpeed: Number(r.endSpeed.toFixed(4))
    });
    // The shot visibly sways the bulb off its settled pose. The public
    // spring's force clamp caps stable amplitude around ~5cm — asserted here
    // so a future engine change that lifts the clamp shows up as drift.
    expect(first.peakSwing).toBeGreaterThan(0.02);
    // ...identically in both runs, and it settles back onto the baseline.
    expect(round(second)).toEqual(round(first));
    expect(first.endSpeed).toBeLessThan(0.2);
    const drift = Math.hypot(first.endPosition[0] - first.baseline[0], first.endPosition[1] - first.baseline[1], first.endPosition[2] - first.baseline[2]);
    expect(drift).toBeLessThan(0.08);
  });
});
