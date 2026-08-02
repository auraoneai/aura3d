import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { game } from "../../../packages/engine/src/agent-api";
import { gameGeometryContract } from "../../../apps/showcase-turbo-drift-circuit/src/generated/game-geometry";

/**
 * Regression coverage for defect 35.
 *
 * The racing route contract carries a single width for a whole lap. Taking the *first*
 * sampled width made the entire circuit as narrow as whichever corner happened to be
 * sampled first (0.388 against a real median of 0.439 and a max of 1.207), and the route
 * became undrivable: at the certified pace the car crossed the full road width in about
 * 0.09 s, left the road within 1.6 s of plain throttle, and off-track drag then cancelled
 * its own acceleration. The mounted browser proof measured a speed gain of 0.387 where it
 * requires more than 0.5.
 *
 * These checks assert drivability from the shipped contract, so a future asset swap or
 * width change cannot quietly reintroduce it.
 */
describe("Turbo Drift Circuit route is actually drivable", () => {
  const routeGeometry = gameGeometryContract.route;

  it("keeps the route wide enough that the car cannot cross it within one frame", () => {
    const route = buildRoute();
    const maxSpeed = route.assetBinding.speedModel.certifiedSpeed * PACE_MULTIPLIER;
    const framesToCrossRoad = routeGeometry.width / (maxSpeed / 60);
    // A car that traverses the full road width in a couple of frames cannot be steered.
    expect(framesToCrossRoad).toBeGreaterThan(4);
  });

  it("gains real speed through the mounted proof's key sequence", () => {
    // Mirrors tests/browser/showcase-library.spec.ts: W 700ms, W+D 420ms,
    // W+D+Space 520ms, then all keys released for 380ms before sampling.
    const racing = buildRacingState();
    const before = racing.snapshot().speed;
    let snapshot = racing.snapshot();
    const advance = (milliseconds: number, input: Parameters<typeof racing.step>[1]): void => {
      for (let frame = 0; frame < Math.round((milliseconds / 1000) * 60); frame += 1) {
        snapshot = racing.step(1 / 60, input);
      }
    };
    advance(700, { throttle: true });
    advance(420, { throttle: true, steer: 1 });
    advance(520, { throttle: true, steer: 1, drift: true });
    advance(380, { throttle: false, steer: 0 });

    expect(snapshot.speed - before).toBeGreaterThan(0.5);
  });

  it("stays on the road long enough for the mounted proof to sample real speed", () => {
    // Blind throttle *should* eventually run wide at a corner -- that is a circuit, not a
    // corridor. What matters is that the car survives the proof's ~1.6 s throttle phase,
    // because the earlier 0.388 width put it off-road at frame 96 and off-track drag then
    // cancelled its own acceleration.
    const racing = buildRacingState();
    let snapshot = racing.snapshot();
    let firstOffTrackFrame = -1;
    for (let frame = 0; frame < 120; frame += 1) {
      snapshot = racing.step(1 / 60, { throttle: true });
      if (snapshot.offTrack && firstOffTrackFrame < 0) firstOffTrackFrame = frame;
    }
    expect(firstOffTrackFrame === -1 || firstOffTrackFrame > 100).toBe(true);
  });

  it("recovers to the racing line under the route's own steering correction", () => {
    // A route that cannot be corrected back onto the line is not drivable regardless of
    // how wide it is (this is the failure mode of defects 26 and 33b).
    const racing = buildRacingState();
    const gain = 2 / (routeGeometry.width / 2);
    let snapshot = racing.snapshot();
    let offTrackFrames = 0;
    for (let frame = 0; frame < 1800; frame += 1) {
      const steer = Math.max(-1, Math.min(1, -snapshot.signedTrackOffset * gain));
      const drift = Math.abs(steer) > 0.6 && snapshot.speed > racing.maxSpeed * 0.5;
      snapshot = racing.step(1 / 60, { throttle: true, brake: false, drift, steer });
      if (snapshot.offTrack) offTrackFrames += 1;
    }
    // Well under a third of a 30-second run off the road.
    expect(offTrackFrames).toBeLessThan(540);
    expect(snapshot.lap).toBeGreaterThan(1);
  });

  it("derives steer authority sufficient for the circuit's tightest corner", () => {
    const route = buildRoute();
    const maxSpeed = route.assetBinding.speedModel.certifiedSpeed * PACE_MULTIPLIER;
    const radius = tightestCornerRadius();
    // The kit yaws at steer * steerRate * (0.28 + |v|/maxSpeed); at full speed that
    // factor is 1.28, so following `radius` needs steerRate >= v / (radius * 1.28).
    const required = maxSpeed / (radius * 1.28);
    expect(CERTIFIED_STEER_RATE).toBeGreaterThan(required * 0.7);
  });
});

const PACE_MULTIPLIER = 4;

function tightestCornerRadius(): number {
  const points = gameGeometryContract.route.points;
  let tightest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]!;
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    let turn = Math.atan2(next.y - current.y, next.x - current.x)
      - Math.atan2(current.y - previous.y, current.x - previous.x);
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    if (Math.abs(turn) < 1e-6) continue;
    const radius = ((incoming + outgoing) / 2) / Math.abs(turn);
    if (radius < tightest) tightest = radius;
  }
  return Number.isFinite(tightest) ? tightest : 1;
}

const CERTIFIED_STEER_RATE = (() => {
  const source = readFileSync("apps/showcase-turbo-drift-circuit/src/main.ts", "utf8");
  // The route derives its steer rate; recompute it the same way so this stays in step.
  const certified = gameGeometryContract.speedModel.gameUnitsPerSecond;
  const maxSpeed = certified * PACE_MULTIPLIER;
  expect(source).toContain("const certifiedSteerRate");
  return Math.max(2.7, (maxSpeed / (tightestCornerRadius() * 1.28)) * 0.75);
})();

function buildRoute() {
  const routeGeometry = gameGeometryContract.route;
  return game.assetBoundRacingRoute({
    vehicleAsset: "showcaseTexturedSportsCar",
    trackAsset: "showcaseTsukubaCircuit",
    authoredLapSeconds: gameGeometryContract.authoredSeconds,
    minLapSeconds: 30,
    minCheckpoints: 6,
    topology: gameGeometryContract.topology,
    route: {
      id: routeGeometry.id,
      width: routeGeometry.width,
      points: routeGeometry.points,
      checkpoints: routeGeometry.checkpoints
    }
  });
}

function buildRacingState() {
  const route = buildRoute();
  const maxSpeed = route.assetBinding.speedModel.certifiedSpeed * PACE_MULTIPLIER;
  return game.racing({
    route,
    startProgress: 0,
    checkpointRadius: 0.1,
    lapsToWin: 4,
    paceMultiplier: PACE_MULTIPLIER,
    acceleration: Number((maxSpeed * 4.1).toFixed(3)),
    drag: 0.28,
    steerRate: CERTIFIED_STEER_RATE
  });
}
