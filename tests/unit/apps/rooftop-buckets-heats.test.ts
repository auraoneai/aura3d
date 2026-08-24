import { describe, expect, it } from "vitest";
import { COURT_SPOTS, HOOP_BASE_POSITION } from "../../../apps/showcase-rooftop-buckets/src/court";
import { initialHoopState, testHoopCollision, updateHoop } from "../../../apps/showcase-rooftop-buckets/src/rim";
import { calculateLaunchVelocity, createBallAtSpot, predictFirstFlight, stepBall } from "../../../apps/showcase-rooftop-buckets/src/shot";

describe("Rooftop Buckets - five heat presentation and flight contract", () => {
  it("maps all five named heats to distinct hoop modes", () => {
    expect([1, 2, 3, 4, 5].map((heat) => initialHoopState(heat).mode))
      .toEqual(["open", "spots", "pressure", "fire", "gold"]);
  });

  it("keeps non-pressure heats fixed at the regulation hoop position", () => {
    for (const heat of [1, 2, 4, 5]) {
      const hoop = updateHoop(initialHoopState(heat), heat, 2.5, 2.8);
      expect(hoop.x).toBe(HOOP_BASE_POSITION.x);
      expect(hoop.defenderActive).toBe(false);
      expect(hoop.defenderTelegraph).toBe("inactive");
      expect(hoop.contestAimOffset).toBe(0);
    }
  });

  it("publishes deterministic windup, contest, and recovery defender telegraphs", () => {
    const base = initialHoopState(3);
    const windup = updateHoop(base, 3, 0.2, 2.8);
    const contest = updateHoop(base, 3, 0.85, 2.8);
    const recover = updateHoop(base, 3, 1.3, 2.8);
    expect(windup.defenderTelegraph).toBe("windup");
    expect(contest.defenderTelegraph).toBe("contest");
    expect(contest.defenderY).toBeGreaterThan(1.5);
    expect(recover.defenderTelegraph).toBe("recover");
    expect(updateHoop(base, 3, 0.85, 2.8)).toEqual(contest);
  });

  it("applies the visible contest offset before launch and never rewrites a result", () => {
    const spot = COURT_SPOTS[2]!;
    const open = initialHoopState(1);
    const pressure = updateHoop(initialHoopState(3), 3, 0.85, spot.x);
    const openVelocity = calculateLaunchVelocity(spot, spot.sweetPower, 0, open);
    const pressureVelocity = calculateLaunchVelocity(spot, spot.sweetPower, 0, pressure);
    expect(pressure.contestAimOffset).not.toBe(0);
    expect(pressureVelocity.vx).not.toBe(openVelocity.vx);
  });

  it("uses deterministic defender rebound without random outcome rewriting", () => {
    const hoop = updateHoop(initialHoopState(3), 3, 0.85, 0);
    const args = [
      { x: hoop.defenderX + 0.1, y: hoop.defenderY, z: hoop.defenderZ },
      { x: hoop.defenderX + 0.1, y: hoop.defenderY, z: hoop.defenderZ + 0.1 },
      { vx: 0.4, vy: -0.2, vz: -4 },
      hoop
    ] as const;
    expect(testHoopCollision(...args)).toEqual(testHoopCollision(...args));
    expect(testHoopCollision(...args).hitDefender).toBe(true);
  });

  it("requires an armed above-rim entry before a downward center crossing scores", () => {
    const hoop = initialHoopState(1);
    const now = { x: hoop.x, y: hoop.y - 0.01, z: hoop.z };
    const before = { x: hoop.x, y: hoop.y + 0.01, z: hoop.z };
    const velocity = { vx: 0, vy: -2, vz: 0 };
    expect(testHoopCollision(now, before, velocity, hoop, 0.12, false).scored).toBe(false);
    expect(testHoopCollision(now, before, velocity, hoop, 0.12, true).scored).toBe(true);
  });

  it("pins prediction to the exact actual no-contact integrator", () => {
    const spot = COURT_SPOTS[1]!;
    const hoop = initialHoopState(1);
    const predicted = predictFirstFlight(spot, spot.sweetPower, 0, hoop, 36, 1);
    const velocity = calculateLaunchVelocity(spot, spot.sweetPower, 0, hoop);
    let actual = { ...createBallAtSpot(spot), ...velocity, inFlight: true, settled: false };
    for (let frame = 1; frame <= 36; frame += 1) {
      actual = stepBall(actual, hoop, 1 / 60).ball;
      const point = predicted[frame]!;
      expect(Math.hypot(actual.x - point.x, actual.y - point.y, actual.z - point.z)).toBeLessThan(1e-9);
    }
  });
});
