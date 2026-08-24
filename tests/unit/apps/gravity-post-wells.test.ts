/**
 * Gravity Post unit evidence — integrator determinism, capture/bounce rules,
 * assist logging. Pure module imports from the app source.
 */
import { describe, expect, it } from "vitest";
import { CONTRACTS, WELL_BODIES } from "../../../apps/showcase-gravity-post/src/contracts";
import {
  ASSIST_ZONE_FRACTION,
  BOUNCE_RESTITUTION,
  DOCK_SENSOR_RADIUS,
  CORRECTION_DELTA_SPEED,
  CORRECTION_FUEL_COST,
  PROPELLANT_CAPACITY,
  applyCorrection,
  createPodRuntime,
  evaluateCapture,
  launch,
  resetPodForContract,
  updateCoast
} from "../../../apps/showcase-gravity-post/src/pod";
import {
  PREDICTION_DIVERGENCE_TOLERANCE,
  PREDICTION_MAX_STEPS,
  measurePredictionDivergence
} from "../../../apps/showcase-gravity-post/src/prediction";
import { buildStations } from "../../../apps/showcase-gravity-post/src/stations";
import {
  FIXED_DT,
  SOLAR_ESCAPE_RADIUS,
  dockPointHash,
  integratePath,
  stepPod,
  wellAcceleration,
  type PodKinematic
} from "../../../apps/showcase-gravity-post/src/wells";

const contract = CONTRACTS[0]!;

describe("gravity post wells", () => {
  it("exposes six authored wells (sun + five planets) with bounded inverse-distance force", () => {
    expect(WELL_BODIES).toHaveLength(6);
    const point: readonly [number, number] = [1.2, -0.4];
    for (const body of WELL_BODIES) {
      // Zero outside the well radius.
      const far = wellAcceleration([body], { strengthScale: 1 }, [
        body.position[0] + body.wellRadius + 0.5,
        body.position[1]
      ]);
      expect(far[0]).toBe(0);
      expect(far[1]).toBe(0);
      // Positive magnitude inside, stronger closer (inverse-distance design).
      const near = wellAcceleration([body], { strengthScale: 1 }, [body.position[0] + 0.2, body.position[1]]);
      const mid = wellAcceleration([body], { strengthScale: 1 }, [body.position[0] + body.wellRadius * 0.8, body.position[1]]);
      expect(Math.hypot(near[0], near[1])).toBeGreaterThan(Math.hypot(mid[0], mid[1]));
      void point;
    }
  });

  it("integrates deterministically: same inputs produce identical dock-point hashes", () => {
    const runOnce = (): number => {
      const pod: PodKinematic = { position: [stationStart()[0], stationStart()[1]], velocity: [1.65, -0.85] };
      for (let step = 0; step < 600; step += 1) {
        stepPod(WELL_BODIES, contract.tuning, pod, [0, 0], FIXED_DT);
      }
      return dockPointHash(pod.position);
    };
    const first = runOnce();
    const second = runOnce();
    expect(first).toBe(second);

    const pathA = integratePath({
      bodies: WELL_BODIES,
      tuning: contract.tuning,
      start: stationStart(),
      velocity: [1.65, -0.85],
      steps: PREDICTION_MAX_STEPS
    });
    const pathB = integratePath({
      bodies: WELL_BODIES,
      tuning: contract.tuning,
      start: stationStart(),
      velocity: [1.65, -0.85],
      steps: PREDICTION_MAX_STEPS
    });
    expect(pathA.samples.length).toBe(pathB.samples.length);
    expect(dockPointHash(pathA.samples[pathA.samples.length - 1]!.position)).toBe(
      dockPointHash(pathB.samples[pathB.samples.length - 1]!.position)
    );
    expect(pathA.enteredWells).toEqual(pathB.enteredWells);
  });

  it("caps prediction sampling at the budget guard", () => {
    const path = integratePath({
      bodies: WELL_BODIES,
      tuning: contract.tuning,
      start: stationStart(),
      velocity: [0.4, 0.4],
      steps: PREDICTION_MAX_STEPS * 4
    });
    expect(path.samples.length).toBeLessThanOrEqual(PREDICTION_MAX_STEPS);
  });

  it("loses pods on planet strike and solar escape", () => {
    // Planet strike: aim straight at Cinder.
    const cinder = WELL_BODIES.find((body) => body.id === "cinder")!;
    const strikePod: PodKinematic = { position: [cinder.position[0] - 0.5, cinder.position[1]], velocity: [1.5, 0] };
    let struck = false;
    for (let step = 0; step < 400 && !struck; step += 1) {
      stepPod(WELL_BODIES, contract.tuning, strikePod, [0, 0], FIXED_DT);
      if (Math.hypot(strikePod.position[0] - cinder.position[0], strikePod.position[1] - cinder.position[1]) <= cinder.visualRadius) struck = true;
    }
    expect(struck).toBe(true);

    // Solar escape: fling outward past the escape radius.
    const escapePod: PodKinematic = { position: [SOLAR_ESCAPE_RADIUS - 0.3, 0], velocity: [3, 0] };
    stepPod(WELL_BODIES, contract.tuning, escapePod, [0, 0], 0.5);
    expect(Math.hypot(escapePod.position[0], escapePod.position[1])).toBeGreaterThanOrEqual(SOLAR_ESCAPE_RADIUS);
  });

  it("captures under the limit and bounces too-fast arrivals", () => {
    const slowPod = createPodRuntime(contract.originStationId, contract.tuning.strengthScale);
    slowPod.state = "coasting";
    const destination = contract.destinationStationId;
    const destinationSpec = buildStations().find((station) => station.id === destination)!;
    slowPod.kinematic.position = [destinationSpec.x + 0.3, destinationSpec.z];
    slowPod.kinematic.velocity = [0.5, 0]; // under captureLimit 2.1
    const captured = evaluateCapture(slowPod, contract, destination);
    expect(captured.docked).toBe(true);
    expect(captured.events.map((event) => event.type)).toContain("dock");
    expect(slowPod.state).toBe("docked");
    expect(captured.distanceToCore).toBeLessThanOrEqual(DOCK_SENSOR_RADIUS + 1e-9);

    const fastPod = createPodRuntime(contract.originStationId, contract.tuning.strengthScale);
    fastPod.state = "coasting";
    fastPod.kinematic.position = [destinationSpec.x - 0.3, destinationSpec.z];
    fastPod.kinematic.velocity = [3.4, 0]; // over captureLimit
    const bounced = evaluateCapture(fastPod, contract, destination);
    expect(bounced.docked).toBe(false);
    expect(bounced.events.map((event) => event.type)).toContain("too-fast");
    expect(fastPod.state).toBe("coasting");
    // Reflected, damped, and pushed back outside the sensor.
    expect(fastPod.kinematic.velocity[0]).toBeCloseTo(-3.4 * BOUNCE_RESTITUTION, 6);
    const pushDistance = Math.hypot(fastPod.kinematic.position[0] - destinationSpec.x, fastPod.kinematic.position[1] - destinationSpec.z);
    expect(pushDistance).toBeGreaterThanOrEqual(DOCK_SENSOR_RADIUS);
  });

  it("logs distinct-body assists once each while coasting through inner zones", () => {
    const assistContract = CONTRACTS[1]!;
    const assistPod = createPodRuntime(assistContract.originStationId, assistContract.tuning.strengthScale);
    assistPod.state = "coasting";
    const sol = WELL_BODIES.find((body) => body.id === "sol")!;
    // Start just inside Sol's assist zone moving tangentially.
    assistPod.kinematic.position = [sol.wellRadius * ASSIST_ZONE_FRACTION * 0.7, 0];
    assistPod.kinematic.velocity = [0, -1.2];
    const seen: string[] = [];
    for (let frame = 0; frame < 240; frame += 1) {
      const events = updateCoast({ pod: assistPod, contract: assistContract, bodies: WELL_BODIES, dt: FIXED_DT, warpActive: false });
      for (const event of events) if (event.type === "assist" && event.bodyId) seen.push(event.bodyId);
      if (assistPod.state !== "coasting") break;
    }
    const solAssists = seen.filter((id) => id === "sol").length;
    expect(solAssists).toBe(1);
    expect(assistPod.assists.has("sol")).toBe(true);
  });

  it("spends exactly one bounded correction token and strands a dry pod", () => {
    const correctionContract = CONTRACTS[1]!;
    const correctionPod = createPodRuntime(correctionContract.originStationId, correctionContract.tuning.strengthScale);
    resetPodForContract(correctionPod, correctionContract);
    expect(launch(correctionPod, [1, 0], 1.5).map((event) => event.type)).toContain("launch");
    const beforeSpeed = Math.hypot(...correctionPod.kinematic.velocity);
    const events = applyCorrection(correctionPod, 1);
    expect(events.map((event) => event.type)).toEqual(["correction"]);
    expect(Math.hypot(...correctionPod.kinematic.velocity)).toBeCloseTo(beforeSpeed + CORRECTION_DELTA_SPEED, 9);
    expect(correctionPod.propellant).toBe(PROPELLANT_CAPACITY - CORRECTION_FUEL_COST);
    expect(correctionPod.correctionTokensRemaining).toBe(0);
    expect(correctionPod.correctionsUsed).toBe(1);
    expect(applyCorrection(correctionPod, -1)).toEqual([]);

    correctionPod.propellant = 0;
    // Keep the hull in-bounds so the adrift clock (not solar escape) ends it.
    correctionPod.kinematic.velocity = [0.05, 0];
    let stranded = false;
    for (let second = 0; second < 20 && !stranded; second += 1) {
      updateCoast({ pod: correctionPod, contract: correctionContract, bodies: [], dt: 1, warpActive: false });
      stranded = correctionPod.state === "lost";
    }
    expect(stranded).toBe(true);
    expect(correctionPod.adriftSeconds).toBeGreaterThanOrEqual(18 - 1);
  });

  it("times out at the authored route limit and the prediction/live fixture stays bounded", () => {
    const timeoutPod = createPodRuntime(contract.originStationId, contract.tuning.strengthScale);
    expect(launch(timeoutPod, [1, 0], 0.2)).toHaveLength(1);
    const timeoutEvents = updateCoast({ pod: timeoutPod, contract, bodies: [], dt: contract.timeLimitSeconds, warpActive: false });
    expect(timeoutEvents.map((event) => event.type)).toContain("timeout");
    expect(timeoutPod.state).toBe("lost");

    const options = {
      bodies: WELL_BODIES,
      tuning: contract.tuning,
      start: stationStart(),
      velocity: [1.65, -0.85] as const,
      steps: PREDICTION_MAX_STEPS
    };
    const predicted = integratePath(options).samples;
    const live = integratePath(options).samples;
    const divergence = measurePredictionDivergence(predicted, live);
    expect(divergence.comparedSamples).toBeGreaterThan(100);
    expect(divergence.maxPositionError).toBe(0);
    expect(divergence.withinTolerance).toBe(true);
    expect(divergence.maxPositionError).toBeLessThanOrEqual(PREDICTION_DIVERGENCE_TOLERANCE);
  });
});

function stationStart(): readonly [number, number] {
  const stations = buildStations();
  const origin = stations.find((station) => station.id === contract.originStationId)!;
  return [origin.x, origin.z];
}
