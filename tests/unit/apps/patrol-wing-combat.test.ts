import { describe, expect, it } from "vitest";
import { createDroneSwarm, CANNON_DAMAGE, DRONE_HEALTH } from "../../../apps/showcase-patrol-wing/src/drones";
import {
  dronesPerWave,
  droneSpeed,
  interceptSpawns,
  RingTracker,
  waveSpawns,
  WAVE_TRIGGERS,
  WAVES_PER_PATROL
} from "../../../apps/showcase-patrol-wing/src/patrol";
import { Cannon } from "../../../apps/showcase-patrol-wing/src/weapons";
import { FLIGHT_DT } from "../../../apps/showcase-patrol-wing/src/flight";

/**
 * PRD definition-of-done pins for Patrol Wing combat (PW-13):
 * - misses reduce nothing; hits reduce drone health through game.combatWorld;
 * - three cannon hits destroy a drone and kills are counted;
 * - a knockout mid-wave does not lock out surviving drones (round-lock rebuild);
 * - return fire emits deterministic orb events from seeded pursuit;
 * - wave progression scales with the patrol index.
 */

const PLAYER: readonly [number, number, number] = [0, 0, 0];

function stepSwarm(swarm: ReturnType<typeof createDroneSwarm>["swarm"], steps: number, player = PLAYER, speed = 9): void {
  for (let index = 0; index < steps; index += 1) swarm.update(FLIGHT_DT, player, speed);
}

describe("patrol wing combat world wiring", () => {
  it("a miss reduces nothing; the attack whiffs", () => {
    const { swarm } = createDroneSwarm();
    swarm.spawnWave([
      { id: "d-far", variant: "A", position: [40, 10, 40], seed: 11 }
    ]);
    stepSwarm(swarm, 1);
    // Fire with the hitbox far from the drone (player at origin, drone 50 m out).
    swarm.beginCannonAttack([0, 0, 0]);
    let hit = false;
    for (let index = 0; index < 6; index += 1) {
      for (const event of swarm.update(FLIGHT_DT, PLAYER, 0)) {
        if (event.type === "cannon-hit") hit = true;
      }
    }
    const snapshot = swarm.snapshot();
    expect(hit).toBe(false);
    expect(swarm.downCount).toBe(0);
    expect(snapshot.liveCount).toBe(1);
  });

  it("cannon hits reduce drone health through combatWorld and three hits kill", () => {
    const { swarm } = createDroneSwarm();
    swarm.spawnWave([
      { id: "d-near", variant: "B", position: [5, 0, 0], seed: 23 }
    ]);
    // Let pursuit settle the drone near the player, then hold fire bursts with
    // the hitbox sitting on the nose (offset toward the drone).
    const cannon = new Cannon();
    let kills = 0;
    let hits = 0;
    for (let burst = 0; burst < 40 && kills === 0; burst += 1) {
      swarm.update(FLIGHT_DT, PLAYER, 9);
      if (cannon.tryFire(true, FLIGHT_DT)) {
        swarm.beginCannonAttack([4.5, 0, 0]);
      }
      for (const event of swarm.update(FLIGHT_DT, PLAYER, 9)) {
        if (event.type === "cannon-hit") {
          hits += 1;
          cannon.registerHit();
        } else if (event.type === "drone-down") {
          kills += 1;
        }
      }
    }
    expect(hits).toBeGreaterThanOrEqual(3);
    expect(kills).toBe(1);
    expect(swarm.downCount).toBe(1);
    expect(swarm.allCleared).toBe(true);
    expect(cannon.shotsHit).toBeGreaterThanOrEqual(3);
    // Three damage-34 hits exceed the 100 hp drone health budget.
    expect(CANNON_DAMAGE * 3).toBeGreaterThanOrEqual(DRONE_HEALTH);
  });

  it("a knockout mid-wave does not lock out surviving drones", () => {
    const { swarm } = createDroneSwarm();
    swarm.spawnWave([
      { id: "d-a", variant: "A", position: [5, 0, 0], seed: 31 },
      { id: "d-b", variant: "B", position: [-8, 0, 0], seed: 37 }
    ]);
    // Damage drone A to near-death via direct attacks; B must stay attackable
    // after A's knockout forces the combat-world rebuild.
    let kills = 0;
    let bHits = 0;
    const cannon = new Cannon();
    for (let round = 0; round < 80 && kills < 2; round += 1) {
      swarm.update(FLIGHT_DT, PLAYER, 9);
      if (cannon.tryFire(true, FLIGHT_DT)) swarm.beginCannonAttack([4.5, 0, 0]);
      for (const event of swarm.update(FLIGHT_DT, PLAYER, 9)) {
        if (event.type === "drone-down") kills += 1;
        if (event.type === "cannon-hit") {
          cannon.registerHit();
          // Track hits landing after the first kill: the world still resolves.
          if (kills >= 1) bHits += 1;
        }
      }
    }
    expect(kills).toBe(2);
    expect(bHits).toBeGreaterThanOrEqual(3);
    expect(swarm.downCount).toBe(2);
  });

  it("return fire emits deterministic orb events from seeded pursuit", () => {
    function collectOrbFrames(): number[] {
      const { swarm } = createDroneSwarm();
      swarm.spawnWave([
        { id: "d-1", variant: "A", position: [12, 6, 4], seed: 101 }
      ]);
      const frames: number[] = [];
      for (let index = 0; index < 600; index += 1) {
        for (const event of swarm.update(FLIGHT_DT, PLAYER, 9)) {
          if (event.type === "orb-fired") frames.push(index);
        }
      }
      return frames;
    }
    const first = collectOrbFrames();
    const second = collectOrbFrames();
    expect(first.length).toBeGreaterThan(3); // cooldown-gated stream, not a one-shot
    expect(first).toEqual(second); // deterministic seeds -> identical frames
  });

  it("wave schedule and escalation match the patrol config", () => {
    expect(WAVE_TRIGGERS).toHaveLength(WAVES_PER_PATROL);
    expect(waveSpawns(1, 0)).toHaveLength(dronesPerWave(1));
    expect(waveSpawns(2, 1)).toHaveLength(dronesPerWave(2));
    expect(dronesPerWave(1)).toBe(3);
    expect(dronesPerWave(3)).toBe(5);
    expect(droneSpeed(2)).toBeGreaterThan(droneSpeed(1));
    expect(waveSpawns(1, 0).every((spawn) => spawn.id.startsWith("drone-p1-w0-"))).toBe(true);
    const intercept = interceptSpawns(1, 0, [3, 9, -4], [1, 0.1, 0]);
    expect(intercept).toHaveLength(3);
    expect(intercept[0]!.position[0]).toBeGreaterThan(8);
    expect(Math.hypot(intercept[0]!.position[0] - 3, intercept[0]!.position[2] + 4)).toBeLessThan(7);
    expect(intercept[1]!.position[2]).not.toBe(intercept[2]!.position[2]);
  });

  it("wave triggers advance with ring progress", () => {
    const rings = new RingTracker();
    expect(WAVE_TRIGGERS[0]!).toBe(1);
    rings.registerEntry(0);
    expect(rings.passedCount).toBeGreaterThanOrEqual(WAVE_TRIGGERS[0]!);
    rings.registerEntry(1);
    rings.registerEntry(2);
    expect(rings.passedCount).toBeGreaterThanOrEqual(WAVE_TRIGGERS[1]!);
    for (let index = 3; index < 6; index += 1) rings.registerEntry(index);
    expect(rings.passedCount).toBeGreaterThanOrEqual(WAVE_TRIGGERS[2]!);
    expect(rings.complete).toBe(true);
  });
});
