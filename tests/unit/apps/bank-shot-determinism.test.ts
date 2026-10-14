import { describe, expect, it } from "vitest";
import {
  BALL_RADIUS,
  PLAY_HALF_X,
  PLAY_HALF_Z,
  RACK_ROWS,
  SPIN_NUDGE,
  STRIKE_MAX_SPEED,
  createTableSimulation,
  rackSpotFor,
  type TableSimulation
} from "../../../apps/showcase-bank-shot/src/table";

/**
 * PRD definition-of-done pins for Bank Shot determinism (BS-04/13):
 * - identical (seed, shot) scripts reproduce hash-identical layouts (FNV-1a
 *   pose hash, same algorithm as the sibling showcase routes);
 * - a full-power break scatters the rack (>= 10 of 15 balls move > 0.05 m);
 * - resetRack() rebuilds a hash-identical rack;
 * - pocket gaps pass balls (nothing ever rests wedged or out of bounds);
 * - pocket sensors fire exactly once per entry;
 * - authored spin measurably changes the shot and stays bounded.
 */

function runScript(power: number, angle: number, spin: number, frames: number): TableSimulation {
  const sim = createTableSimulation();
  sim.strike(power, angle, spin);
  for (let index = 0; index < frames; index += 1) {
    sim.stepFixed(1);
    sim.consumeSensorEvents();
    sim.consumeImpacts();
    sim.consumePotEvents();
  }
  return sim;
}

describe("bank shot table construction", () => {
  it("builds on the rapier backend with 16 live balls and six pocket sensors", () => {
    const sim = createTableSimulation();
    expect(sim.backend).toBe("rapier");
    expect(sim.liveBallCount()).toBe(16);
    expect(sim.pottedList()).toHaveLength(0);
    expect(sim.pocketIds).toHaveLength(6);
    // The 8-ball racks in the middle of the third row.
    expect(RACK_ROWS[2]![1]).toBe(8);
    expect(rackSpotFor(8)[0]).toBeGreaterThan(rackSpotFor(1)[0]);
    // Every ball has a distinct start spot.
    const spots = new Set<string>();
    for (let number = 0; number <= 15; number += 1) {
      const [x, z] = rackSpotFor(number);
      spots.add(`${x.toFixed(4)},${z.toFixed(4)}`);
    }
    expect(spots.size).toBe(16);
  });
});

describe("bank shot determinism", () => {
  it("identical (seed, shot) scripts reproduce identical pose hashes", { timeout: 60_000 }, () => {
    const runA = runScript(1, 0, 0.4, 600);
    const runB = runScript(1, 0, 0.4, 600);
    expect(runA.poseHash()).toBe(runB.poseHash());
    // A different shot is a different layout: the hash discriminates.
    const runC = runScript(0.7, 0.35, 0, 600);
    expect(runC.poseHash()).not.toBe(runA.poseHash());
  });

  it("a full-power break scatters the rack: at least 10 of 15 balls move > 0.05 m", { timeout: 120_000 }, () => {
    const sim = runScript(1, 0, 0, 4000);
    let moved = 0;
    for (const info of sim.ballInfos()) {
      if (info.number === 0) continue;
      const [spotX, spotZ] = rackSpotFor(info.number);
      if (Math.hypot(info.x - spotX, info.z - spotZ) > 0.05) moved += 1;
    }
    expect(moved).toBeGreaterThanOrEqual(10);
  });

  it("the break settles: every live ball comes to rest inside the playfield", { timeout: 120_000 }, () => {
    const sim = runScript(1, 0, 0, 4000);
    expect(sim.allAtRest(0.05)).toBe(true);
    for (const info of sim.ballInfos()) {
      if (!info.live) continue;
      expect(Math.abs(info.x)).toBeLessThanOrEqual(PLAY_HALF_X + 0.08);
      expect(Math.abs(info.z)).toBeLessThanOrEqual(PLAY_HALF_Z + 0.08);
    }
  });

  it("resetRack rebuilds a hash-identical rack from a scattered table", { timeout: 120_000 }, () => {
    const fresh = createTableSimulation();
    const freshHash = fresh.poseHash();
    const sim = runScript(1, 0.2, 0, 900);
    expect(sim.poseHash()).not.toBe(freshHash);
    sim.resetRack();
    expect(sim.poseHash()).toBe(freshHash);
    expect(sim.liveBallCount()).toBe(16);
    expect(sim.pottedList()).toHaveLength(0);
    expect(sim.cueAtRest()).toBe(true);
  });

  it("authored spin measurably changes the shot and the nudge stays bounded", { timeout: 60_000 }, () => {
    const plain = runScript(1, 0, 0, 600);
    const spun = runScript(1, 0, 1, 600);
    // The authored nudge (bounded at SPIN_NUDGE m/s) diverges the layout.
    expect(spun.poseHash()).not.toBe(plain.poseHash());
    expect(SPIN_NUDGE).toBeLessThanOrEqual(0.6);
    // The strike law clamps: an absurd power still strikes at max speed.
    const sim = createTableSimulation();
    expect(sim.strike(99, 0, 0)).toBe(true);
    const cue = sim.debugBallBody(0)!;
    expect(Math.hypot(cue.velocity[0], cue.velocity[1], cue.velocity[2])).toBeCloseTo(STRIKE_MAX_SPEED, 3);
  });
});

describe("bank shot pockets", () => {
  it("corner and side pocket gaps pass balls: scripted pots resolve, nothing wedges", () => {
    const sim = createTableSimulation();
    const corner = sim.debugBallBody(1)!;
    corner.wake();
    corner.setPosition([1.02, BALL_RADIUS, 0.42]);
    corner.setVelocity([2.2, 0, 2.2]);
    const side = sim.debugBallBody(2)!;
    side.wake();
    side.setPosition([0, BALL_RADIUS, 0.3]);
    side.setVelocity([0, 0, 2.2]);
    const pots: string[] = [];
    for (let index = 0; index < 300; index += 1) {
      sim.stepFixed(1);
      for (const pot of sim.consumePotEvents()) pots.push(`${pot.ball}@${pot.pocket}`);
      sim.consumeSensorEvents();
      sim.consumeImpacts();
    }
    expect(pots).toContain("1@corner-south-east");
    expect(pots).toContain("2@side-south");
    // Recovery rule: no live ball rests outside the playfield or below the felt.
    for (const info of sim.ballInfos()) {
      if (!info.live) continue;
      expect(Math.abs(info.x)).toBeLessThanOrEqual(PLAY_HALF_X + 0.08);
      expect(Math.abs(info.z)).toBeLessThanOrEqual(PLAY_HALF_Z + 0.08);
    }
  });

  it("pocket sensors fire exactly once per entry across a full break", { timeout: 120_000 }, () => {
    const sim = createTableSimulation();
    sim.strike(1, 0, 0);
    const sensorPairs: string[] = [];
    for (let index = 0; index < 4000; index += 1) {
      sim.stepFixed(1);
      for (const sensor of sim.consumeSensorEvents()) sensorPairs.push(`${sensor.pocket}:${sensor.ball}`);
      sim.consumeImpacts();
      sim.consumePotEvents();
    }
    expect(sensorPairs.length).toBeGreaterThan(0);
    const unique = new Set(sensorPairs);
    // Once-per-entry arming: no pocket/ball pair may repeat.
    expect(unique.size).toBe(sensorPairs.length);
    // Every sensor entry corresponds to a potted ball (the capture rule fires).
    expect(sim.pottedList().length).toBeGreaterThan(0);
  });
});
