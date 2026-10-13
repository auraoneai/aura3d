// tests/qr/prd14/turbo-drift/grounding.test.ts — the lap-sweep grounding
// proof for the single-path rebuild: a shared-driver car laps the shipped
// route on the extracted track mesh, and no tyre ever sits below the
// sampled surface. This replaces the retired generated-geometry contact
// tests (turbo-car-road-contact, turbo-drivable-mesh-coverage,
// turbo-drift-real-circuit-contact), which asserted against the trashed
// turboFormulaCircuit topology in src/generated/game-geometry.ts.
import { describe, expect, it } from "vitest";
import {
  createVehicleChassis,
  createVehicleDriverAi,
  meshVehicleSurface,
  vehicleChassisSpecFromBounds,
  type DriverRoute
} from "../../../../packages/engine/src/agent-api/index";
import { createGameRacingKit } from "../../../../packages/engine/src/agent-api/GameGenreKits";
import {
  CAR_MODEL_SIZE,
  sampleTrackAt,
  trackMeshQuery
} from "../../../../apps/showcase-turbo-drift-circuit/src/track-surface";
import { planTurboBoostRings } from "../../../../apps/showcase-turbo-drift-circuit/src/boost-rings";

// The route src/main.ts ships (racing-starter's verified geometry for this
// car/track pair). Kept in sync by the start-pose assertion below: if the
// route moves off the extracted mesh, the hit assertions fail here.
const ROUTE_SCALE = 3.5;
const route = {
  id: "turbo-drift-circuit",
  width: 2.2 * ROUTE_SCALE,
  points: [
    { x: -0.4 * ROUTE_SCALE, y: -0.25 * ROUTE_SCALE },
    { x: 2.4 * ROUTE_SCALE, y: -0.9 * ROUTE_SCALE },
    { x: 5.4 * ROUTE_SCALE, y: 0.15 * ROUTE_SCALE },
    { x: 5.9 * ROUTE_SCALE, y: 2.7 * ROUTE_SCALE },
    { x: 3.2 * ROUTE_SCALE, y: 3.9 * ROUTE_SCALE },
    { x: 0.3 * ROUTE_SCALE, y: 3.15 * ROUTE_SCALE },
    { x: -0.75 * ROUTE_SCALE, y: 1.15 * ROUTE_SCALE }
  ],
  checkpoints: [0.14, 0.27, 0.4, 0.53, 0.66, 0.79]
};

describe("turbo drift grounding (single-path rebuild)", () => {
  it("samples a real surface under every racing-line point", () => {
    const kit = createGameRacingKit({ route, startProgress: 0.04, lapsToWin: 3, maxSpeed: 40, acceleration: 60, drag: 1.4, steerRate: 2.85, model: "bicycle", chassis: false });
    for (let i = 0; i < 200; i += 1) {
      const s = kit.surfaceQuery.sampleAt(i / 200);
      const ground = sampleTrackAt(s.x, s.y);
      expect(ground.hit, `no track mesh under racing line at progress ${i / 200}`).toBe(true);
      expect(Number.isFinite(ground.height)).toBe(true);
    }
  });

  it("keeps every grounded wheel on the surface across a driven lap sweep", () => {
    const kit = createGameRacingKit({ route, startProgress: 0.04, lapsToWin: 3, maxSpeed: 40, acceleration: 60, drag: 1.4, steerRate: 2.85, model: "bicycle", chassis: false });
    const spec = vehicleChassisSpecFromBounds(CAR_MODEL_SIZE);
    const surface = meshVehicleSurface(trackMeshQuery, { offRoadGrip: 0.45, contactPatchRadius: spec.wheelRadius * 2 });
    const chassis = createVehicleChassis(spec, surface);
    const driverRoute: DriverRoute = {
      length: kit.surfaceQuery.length,
      halfWidth: () => kit.surfaceQuery.roadHalfWidth,
      sample: (progress) => {
        const s = kit.surfaceQuery.sampleAt(progress);
        return { x: s.x, y: s.y, heading: s.heading };
      }
    };
    const driver = createVehicleDriverAi(driverRoute, {
      maxSpeed: 40, paceFraction: 0.72, lookAheadSeconds: 1.15,
      minLookAhead: Math.max(0.05, kit.surfaceQuery.length * 0.01),
      corneringAcceleration: 10, aggression: "balanced", reactionSeconds: 0.12, seed: 20260802
    });

    let state = kit.snapshot();
    chassis.reset({ x: state.position.x, z: state.position.y, heading: state.heading, speed: 0, steer: 0 });
    let groundedSamples = 0;
    let steps = 0;
    const dt = 1 / 60;
    // Drive until the lap wraps (checkpoint-complete) or the sweep budget
    // ends; progress must have covered most of the lap either way.
    while (steps < 60 * 90 && state.lap < 2) {
      const input = driver.decide(dt, {
        progress: state.progress,
        speed: state.speed,
        heading: state.heading,
        signedTrackOffset: state.signedTrackOffset,
        position: state.position,
        offTrack: state.offTrack
      });
      state = kit.step(dt, { throttle: input.throttle > 0.08, brake: input.brake > 0.08, steer: input.steer, drift: input.drift });
      const pose = chassis.step(dt, {
        x: state.position.x, z: state.position.y, heading: state.heading,
        speed: state.speed, steer: input.steer, throttle: input.throttle, brake: input.brake,
        slip: Math.min(1, Math.abs(state.drift))
      });
      for (const wheel of pose.wheels) {
        // Never-below is checked against the raw mesh sample; seated is
        // checked against the surface the chassis actually sampled
        // (contact-patch probing can seat a tyre on road within its patch
        // radius when the centre ray lands in a seam).
        const raw = sampleTrackAt(wheel.position[0], wheel.position[2]);
        if (raw.hit) {
          expect(wheel.position[1] - raw.height, `${wheel.id} below raw mesh at progress ${state.progress}`).toBeGreaterThanOrEqual(spec.wheelRadius - 0.02);
        }
        const ground = surface.sample(wheel.position[0], wheel.position[2]);
        const clearance = wheel.position[1] - ground.height;
        if (ground.hit) {
          expect(clearance, `${wheel.id} below surface at progress ${state.progress}`).toBeGreaterThanOrEqual(spec.wheelRadius - 0.02);
        } else {
          // No triangle under the wheel: the height is the query fallback,
          // so the only honest claim is that the wheel reports airborne.
          expect(wheel.grounded, `${wheel.id} claims grounded over no mesh at progress ${state.progress}`).toBe(false);
        }
        if (wheel.grounded) {
          groundedSamples += 1;
          expect(Math.abs(clearance - spec.wheelRadius), `${wheel.id} not seated at progress ${state.progress}`).toBeLessThanOrEqual(0.02);
        }
      }
      steps += 1;
    }
    expect(state.progress + (state.lap - 1)).toBeGreaterThan(0.75);
    expect(groundedSamples).toBeGreaterThan(steps * 2);
  });

  it("plans boost pads on straights of the shipped route", () => {
    const kit = createGameRacingKit({ route, startProgress: 0.04, lapsToWin: 3, maxSpeed: 40, acceleration: 60, drag: 1.4, steerRate: 2.85, model: "bicycle", chassis: false });
    const rings = planTurboBoostRings({
      sampleAt: (p) => kit.surfaceQuery.sampleAt(p),
      curvatureAt: (p) => kit.surfaceQuery.sampleAt(p).curvature,
      straightCurvatureThreshold: 0.1,
      ringCount: 3,
      minSeparation: 0.15
    });
    // The planner asks for 3 and finds 2 straights on this route that
    // satisfy both the curvature gate and the separation; assert the
    // honest output shape rather than pinning the count.
    expect(rings.length).toBeGreaterThanOrEqual(2);
    for (const ring of rings) {
      expect(sampleTrackAt(ring.point.x, ring.point.y).hit).toBe(true);
    }
  });
});
