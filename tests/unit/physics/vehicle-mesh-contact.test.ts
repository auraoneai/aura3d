import { describe, expect, it } from "vitest";
import { createMeshSurfaceQuery } from "../../../packages/physics/src";
import {
  createVehicleChassis,
  flatVehicleSurface,
  meshVehicleSurface
} from "../../../packages/engine/src/agent-api/VehicleChassis";

/** Grid mesh with a height function, wound so triangles face up. */
function grid(size: number, divisions: number, height: (x: number, z: number) => number) {
  const positions: number[] = [];
  const indices: number[] = [];
  const step = size / divisions;
  for (let iz = 0; iz <= divisions; iz += 1) {
    for (let ix = 0; ix <= divisions; ix += 1) {
      const x = -size / 2 + ix * step;
      const z = -size / 2 + iz * step;
      positions.push(x, height(x, z), z);
    }
  }
  const stride = divisions + 1;
  for (let iz = 0; iz < divisions; iz += 1) {
    for (let ix = 0; ix < divisions; ix += 1) {
      const a = iz * stride + ix;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

const SPEC = {
  wheelbase: 2.4,
  trackWidth: 1.5,
  wheelRadius: 0.3,
  rideHeight: 0.35,
  suspensionTravel: 0.12,
  maxPitch: 0.6,
  maxRoll: 0.6
} as const;

describe("vehicle contact against a real mesh", () => {
  it("gives four wheels four different heights on a banked corner", () => {
    /*
     * The defect this replaces: an analytic surface returned one height for the whole
     * car, so the outer wheels solved against a surface that was not under them.
     */
    // Curved, not a plane: on a flat ramp two wheels legitimately share a height, so a
    // plane would make "four distinct heights" a statement about the test mesh rather
    // than about per-wheel sampling.
    /*
     * A saddle surface, so no two contact points share a height by symmetry. A flat ramp
     * would make "four distinct heights" a property of the test mesh rather than of
     * per-wheel sampling, and a wheel that lifts gets clamped to its hanging height, which
     * can also collapse two values.
     */
    const banked = grid(20, 40, (x, z) => x * 0.03 + z * 0.02 + x * z * 0.004);
    const query = createMeshSurfaceQuery(banked);
    const chassis = createVehicleChassis(SPEC, meshVehicleSurface(query));
    const pose = chassis.reset({ x: 0.7, z: 0.5, heading: 0.4, speed: 0, steer: 0, slip: 0 });

    expect(pose.grounded, "all four wheels reachable on a gentle surface").toBe(true);
    const heights = pose.wheels.map((wheel) => wheel.position[1]);
    expect(new Set(heights.map((h) => h.toFixed(5))).size, "four distinct wheel heights").toBe(4);
    // And the spread is real, not floating noise.
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.005);
  });

  it("follows a banked surface in roll instead of staying level", () => {
    /*
     * Regression guard for a bug found while building this: `maxRoll` is correctly capped
     * by suspension travel, but that cap was applied to the *total* attitude, including
     * the part imposed by the road. A car lying on a 10-degree bank costs no suspension
     * travel at all — all four springs sit at rest — yet the chassis reported only 4.59
     * degrees of roll and looked like it was floating through the banking.
     */
    const tan10 = Math.tan((10 * Math.PI) / 180);
    // heading 0 faces +X, so the roll axis is Z.
    const bankAcrossZ = { sample: (_x: number, z: number) => ({ height: z * tan10, normal: [0, 1, 0] as const, grip: 1, hit: true }) };
    const chassis = createVehicleChassis(SPEC, meshVehicleSurface(bankAcrossZ));
    const pose = chassis.reset({ x: 0, z: 0, heading: 0, speed: 0, steer: 0, slip: 0 });

    const rollDegrees = (pose.rotation[2] * 180) / Math.PI;
    // asin(tan(10 deg)) = 10.156 deg: the geometric answer for a linear ramp.
    expect(Math.abs(rollDegrees)).toBeGreaterThan(9.5);
    expect(Math.abs(rollDegrees)).toBeLessThan(10.5);
  });

  it("follows a longitudinal slope in pitch", () => {
    const tan10 = Math.tan((10 * Math.PI) / 180);
    const slopeAlongX = { sample: (x: number) => ({ height: x * tan10, normal: [0, 1, 0] as const, grip: 1, hit: true }) };
    const chassis = createVehicleChassis(SPEC, meshVehicleSurface(slopeAlongX));
    const pose = chassis.reset({ x: 0, z: 0, heading: 0, speed: 0, steer: 0, slip: 0 });

    const pitchDegrees = Math.abs((pose.rotation[0] * 180) / Math.PI);
    expect(pitchDegrees).toBeGreaterThan(9.5);
    expect(pitchDegrees).toBeLessThan(10.5);
  });

  it("keeps every tyre out of the mesh across a scripted lap", () => {
    /*
     * The user-visible defect, as a test: drive a full circle over an undulating mesh and
     * assert no contact patch is ever below the surface under it. Sub-millimetre
     * tolerance, because a visible sink is far larger than that.
     */
    /*
     * Circuit-scale undulation, deliberately gentle.
     *
     * My first version of this test used sin(x*0.25)*0.35 + cos(z*0.2)*0.25, which puts a
     * 0.099-unit height spread under the four contact points. A car with 0.12 units of
     * total travel can only absorb 0.06, so it genuinely lifts a wheel — the test was
     * asserting 360/360 grounded over terrain that physically unloads a tyre. That is a
     * rally stage, not a race circuit. The amplitude here keeps the spread inside the
     * suspension's budget, so "stays grounded" is a claim about contact resolution rather
     * than about the terrain being flat.
     */
    const track = grid(40, 60, (x, z) => Math.sin(x * 0.12) * 0.06 + Math.cos(z * 0.1) * 0.04);
    const query = createMeshSurfaceQuery(track);
    const chassis = createVehicleChassis(SPEC, meshVehicleSurface(query));

    let worstPenetration = 0;
    let groundedSteps = 0;
    const steps = 360;
    /*
     * Ignore the first few steps: springs start at rest and take ~5 frames at 60 Hz to
     * settle onto the surface, during which a corner can legitimately be unloaded. The
     * assertion is about steady-state contact, not about the initial transient. Measured,
     * not guessed — the ungrounded steps were exactly indices 0 through 4.
     */
    const settleSteps = 8;
    for (let step = 0; step < steps; step += 1) {
      const heading = (step / steps) * Math.PI * 2;
      const radius = 8;
      const x = Math.cos(heading) * radius;
      const z = Math.sin(heading) * radius;
      const pose = chassis.step(1 / 60, { x, z, heading: heading + Math.PI / 2, speed: 18, steer: 0.2, slip: 0 });
      for (const wheel of pose.wheels) {
        const contactY = wheel.position[1] - SPEC.wheelRadius;
        const surfaceY = query.sampleHeight(wheel.position[0], wheel.position[2]);
        worstPenetration = Math.max(worstPenetration, surfaceY - contactY);
      }
      if (step >= settleSteps && pose.grounded) groundedSteps += 1;
    }

    expect(worstPenetration, "max tyre penetration below the surface, in world units").toBeLessThan(0.001);
    expect(groundedSteps, "the car stays grounded on a drivable surface after settling").toBe(steps - settleSteps);
  });

  it("drops grip off the drivable mesh instead of reporting full grip over a void", () => {
    const island = grid(4, 8, () => 0);
    const query = createMeshSurfaceQuery(island);
    const surface = meshVehicleSurface(query, { offRoadGrip: 0.2 });

    expect(surface.sample(0, 0).grip).toBe(1);
    // Far outside the mesh there is no triangle at all.
    expect(surface.sample(50, 50).grip).toBe(0.2);
  });

  it("still supports a flat surface for prototypes", () => {
    const chassis = createVehicleChassis(SPEC, flatVehicleSurface(0, 1));
    const pose = chassis.reset({ x: 0, z: 0, heading: 0, speed: 0, steer: 0, slip: 0 });
    expect(pose.grounded).toBe(true);
    for (const wheel of pose.wheels) expect(wheel.position[1]).toBeCloseTo(SPEC.wheelRadius, 6);
  });
});
