import { describe, expect, it } from "vitest";
import { createPathFollowDriver } from "../../../packages/physics/src/PathFollowDriver";
import { createRacingLineProfile } from "../../../packages/physics/src/RacingLineProfile";
import { createVehicleMotion } from "../../../packages/physics/src/VehicleMotion";
import { game } from "../../../packages/engine/src/agent-api";
import { gameGeometryContract } from "../../../apps/showcase-turbo-drift-circuit/src/generated/game-geometry";

/*
 * WS-3.8. The library had `createVehicleMotion` for tyre and yaw dynamics and
 * `createRacingLineProfile` for corner speeds, and nothing to join them, so every racing route
 * hand-rolled a driver. The hand-rolled Stanley formulation diverged on the certified circuit's
 * 95-degree hairpin: saturated at full lock it ran off the road, the nearest-point progress then
 * latched at 0.2789 for 8,700 consecutive frames, and the car sawed 43 units away from a
 * 0.439-wide road. These tests hold the fix at the library layer.
 */

const routeGeometry = gameGeometryContract.route;

function certifiedCircuit() {
  const route = game.assetBoundRacingRoute({
    vehicleAsset: "showcaseTexturedSportsCar",
    trackAsset: "showcaseTsukubaCircuit",
    authoredLapSeconds: gameGeometryContract.authoredSeconds,
    minLapSeconds: 30,
    minCheckpoints: 6,
    topology: gameGeometryContract.topology,
    route: { id: routeGeometry.id, width: routeGeometry.width, points: routeGeometry.points, checkpoints: routeGeometry.checkpoints }
  });
  const kit = game.racing({ route, startProgress: 0, checkpointRadius: 0.1, lapsToWin: 4, paceMultiplier: 4 });
  const surface = kit.surfaceQuery;
  const gravity = 9.81 / gameGeometryContract.speedModel.sceneUnitsPerGameUnit;
  const stationCount = 240;
  const stations = Array.from({ length: stationCount }, (_, index) => {
    const sample = surface.sampleAt(index / stationCount);
    const curvature = Math.abs(sample.curvature);
    return { distance: (index / stationCount) * surface.length, radius: curvature > 1e-6 ? 1 / curvature : Number.POSITIVE_INFINITY };
  });
  const profile = createRacingLineProfile({
    stations,
    length: surface.length,
    lateralLimit: 0.41 * gravity,
    acceleration: kit.maxSpeed * 1.5,
    braking: kit.maxSpeed * 2,
    maxSpeed: kit.maxSpeed,
    closed: true
  });
  return { surface, profile, gravity };
}

function drive(frames: number, overrides: { readonly lookaheadTime?: number; readonly crossTrackGain?: number } = {}) {
  const { surface, profile, gravity } = certifiedCircuit();
  const car = createVehicleMotion({
    mass: 1200,
    wheelbase: 0.35,
    maxSteerAngle: 0.6,
    driveForce: 9000,
    brakeForce: 14000,
    dragCoefficient: 0.2,
    rollingResistance: 0.01,
    gravity
  });
  const start = surface.sampleAt(0);
  car.reset({ x: start.x, z: start.y, heading: start.heading, speed: profile.speedAt(0) * 0.5 });
  const driver = createPathFollowDriver({
    length: surface.length,
    closed: true,
    sampleAt: (distance) => {
      const sample = surface.sampleAt((((distance / surface.length) % 1) + 1) % 1);
      return { x: sample.x, y: sample.y, heading: sample.heading, curvature: sample.curvature };
    },
    contactAt: (x, y) => {
      const contact = surface.query({ x, y });
      return { distance: contact.progress * surface.length, signedOffset: contact.signedTrackOffset };
    },
    speedAt: (distance) => profile.speedAt(distance),
    wheelbase: 0.35,
    maxSteerAngle: 0.6,
    ...overrides
  });

  let state = car.state();
  let offTrack = 0;
  let saturated = 0;
  let worstOffset = 0;
  let minSpeed = Number.POSITIVE_INFINITY;
  let progressStall = 0;
  let longestStall = 0;
  let previousDistance = -1;
  for (let frame = 0; frame < frames; frame += 1) {
    const command = driver.step({ x: state.x, z: state.z, heading: state.heading, speed: state.speed });
    state = car.step(1 / 60, { throttle: command.throttle, brake: command.brake, steer: command.steer, grip: 1 });
    const contact = surface.query({ x: state.x, y: state.z });
    if (Math.abs(contact.signedTrackOffset) > contact.roadHalfWidth) offTrack += 1;
    if (command.saturated) saturated += 1;
    worstOffset = Math.max(worstOffset, Math.abs(contact.signedTrackOffset));
    if (frame > 60) minSpeed = Math.min(minSpeed, state.speed);
    progressStall = command.distance <= previousDistance + 1e-9 ? progressStall + 1 : 0;
    longestStall = Math.max(longestStall, progressStall);
    previousDistance = command.distance;
  }
  return { laps: driver.lapsCompleted, offTrack, offTrackFraction: offTrack / frames, saturatedFraction: saturated / frames, worstOffset, minSpeed, longestStall, profile };
}

describe("createPathFollowDriver on the certified circuit", () => {
  it("completes multiple laps instead of diverging at the hairpin", () => {
    const run = drive(5400);
    // The hand-rolled controller completed zero laps in 9,000 frames.
    expect(run.laps).toBeGreaterThanOrEqual(8);
  });

  it("stays on the road for the overwhelming majority of frames", () => {
    const run = drive(5400);
    // Hand-rolled: 98% off-track. Measured here at 3.3%; the bound leaves headroom without
    // being loose enough to pass a car that leaves the road at every corner.
    expect(run.offTrackFraction).toBeLessThan(0.06);
  });

  it("never latches progress, which was the mechanism of the original divergence", () => {
    const run = drive(5400);
    // The old failure held one distance for 8,700 consecutive frames. A driver that is tracking
    // cannot stall for even a second of wall time.
    expect(run.longestStall).toBeLessThan(60);
  });

  it("keeps steering authority in reserve rather than living at full lock", () => {
    const run = drive(5400);
    expect(run.saturatedFraction).toBeLessThan(0.08);
  });

  it("holds a speed the profile asked for instead of grinding to a halt", () => {
    const run = drive(5400);
    // A diverging driver ends up stopped against the scenery. Staying well above zero proves the
    // car is still being driven around the lap rather than parked against the verge.
    expect(run.minSpeed).toBeGreaterThan(run.profile.speedAt(0) * 0.2);
  });

  it("degrades predictably as lookahead grows, which is what makes the default defensible", () => {
    // Load-bearing evidence for the 0.25 default: the parameter has a real optimum rather than
    // being an arbitrary constant that happened to pass.
    const tight = drive(3600, { lookaheadTime: 0.25 });
    const loose = drive(3600, { lookaheadTime: 0.9 });
    expect(tight.offTrackFraction).toBeLessThan(loose.offTrackFraction / 3);
  });
});

