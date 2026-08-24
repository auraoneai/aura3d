import { describe, expect, it } from "vitest";
import { createArenaLayout, playRect, spawnPointOnEdge } from "../../../apps/showcase-neon-swarm/src/arena";
import { RISK_PICKUPS, riskPickupForWave, senseRiskPickup } from "../../../apps/showcase-neon-swarm/src/pickups";
import {
  createSeededRandom,
  isEliteWave,
  scheduleChecksum,
  waveSpawnSchedule,
  waveSpec
} from "../../../apps/showcase-neon-swarm/src/waves";
import { ELITE_POOL_CAPACITY, GRUNT_POOL_CAPACITY, createSwarmSimulation } from "../../../apps/showcase-neon-swarm/src/swarm";
import { createPlayerUpgrades } from "../../../apps/showcase-neon-swarm/src/player";
import {
  FINALE_SURVIVAL_SECONDS,
  MAX_CAMPAIGN_WAVES,
  arenaInsetForWave,
  campaignStage,
  outcomeHash,
  stateAfterWaveClear,
  upgradedPlayer
} from "../../../apps/showcase-neon-swarm/src/run";

const ARENA = createArenaLayout();

describe("Neon Swarm wave tables", () => {
  it("uses the finite teach/add/compress/elite/finale campaign table", () => {
    expect(MAX_CAMPAIGN_WAVES).toBe(5);
    expect(waveSpec(1).droneCount).toBe(36);
    expect(waveSpec(1).spawnWindowSeconds).toBe(8);
    expect(waveSpec(3).droneCount).toBe(168);
    expect(waveSpec(5).droneCount).toBe(320);
    expect(waveSpec(5).spawnWindowSeconds).toBe(20);
    expect(waveSpec(1).eliteCount).toBe(0);
    expect(FINALE_SURVIVAL_SECONDS).toBeGreaterThan(waveSpec(5).spawnWindowSeconds);
  });

  it("introduces elites in wave two and makes wave four the elite-pressure beat", () => {
    expect(isEliteWave(2)).toBe(true);
    expect(isEliteWave(3)).toBe(true);
    expect(isEliteWave(1)).toBe(false);
    expect(waveSpec(2).eliteCount).toBe(8);
    expect(waveSpec(4).eliteCount).toBe(40);
    expect(waveSpec(5).speedMultiplier).toBeGreaterThan(waveSpec(4).speedMultiplier);
  });

  it("replays an identical wave for the same seed", () => {
    const a = waveSpawnSchedule(waveSpec(2), 20260821);
    const b = waveSpawnSchedule(waveSpec(2), 20260821);
    expect(a).toEqual(b);
    expect(scheduleChecksum(a)).toBe(scheduleChecksum(b));
    // Every PRNG consumer is seeded: edges and slide parameters come from mulberry32.
    const randomA = createSeededRandom(20260821);
    const randomB = createSeededRandom(20260821);
    expect(Array.from({ length: 16 }, randomA)).toEqual(Array.from({ length: 16 }, randomB));
  });

  it("produces seed-dependent schedules with valid events", () => {
    const schedule = waveSpawnSchedule(waveSpec(3), 7);
    expect(schedule).toHaveLength(waveSpec(3).droneCount);
    expect(scheduleChecksum(schedule)).not.toBe(scheduleChecksum(waveSpawnSchedule(waveSpec(3), 8)));
    for (const [index, event] of schedule.entries()) {
      expect(event.index).toBe(index);
      expect(event.atSeconds).toBeGreaterThanOrEqual(0);
      expect(event.atSeconds).toBeLessThanOrEqual(waveSpec(3).spawnWindowSeconds + 1e-9);
      expect(["north", "south", "east", "west"]).toContain(event.edge);
      expect(event.t).toBeGreaterThanOrEqual(0);
      expect(event.t).toBeLessThanOrEqual(1);
      expect(["grunt", "elite"]).toContain(event.archetype);
    }
    expect(schedule.filter((event) => event.archetype === "elite")).toHaveLength(waveSpec(3).eliteCount);
  });

  it("keeps every seeded edge spawn outside the opening safety radius", () => {
    const player = { x: 0, z: 3 };
    for (let wave = 1; wave <= MAX_CAMPAIGN_WAVES; wave += 1) {
      for (const event of waveSpawnSchedule(waveSpec(wave), 20260821)) {
        const point = spawnPointOnEdge(event.edge, event.t);
        expect(Math.hypot(point.x - player.x, point.z - player.z)).toBeGreaterThan(11);
      }
    }
  });
});

describe("Neon Swarm finite run contract", () => {
  it("names all five beats and compresses only the pressure half", () => {
    expect(Array.from({ length: 5 }, (_, index) => campaignStage(index + 1))).toEqual([
      "opening", "upgrade", "compression", "elite", "finale"
    ]);
    expect(arenaInsetForWave(1)).toBe(0);
    expect(arenaInsetForWave(2)).toBe(0);
    expect(arenaInsetForWave(3)).toBeGreaterThan(0);
    expect(arenaInsetForWave(5)).toBeGreaterThan(arenaInsetForWave(3));
    expect(stateAfterWaveClear(4)).toBe("intermission");
    expect(stateAfterWaveClear(5)).toBe("complete");
  });

  it("applies upgrade math immutably and clamps repeated cooldown choices", () => {
    const base = createPlayerUpgrades();
    const fire = upgradedPlayer(base, "fire-rate");
    let dash = base;
    for (let index = 0; index < 8; index += 1) {
      dash = upgradedPlayer(dash, "dash-cooldown");
    }
    const shield = upgradedPlayer(base, "shield");
    expect(base).toEqual({ fireRateMultiplier: 1, dashCooldownMultiplier: 1, shieldCharges: 0 });
    expect(fire.fireRateMultiplier).toBeCloseTo(0.74, 8);
    expect(dash.dashCooldownMultiplier).toBe(0.35);
    expect(shield.shieldCharges).toBe(1);
  });

  it("places one deterministic risky collectible inside every compressed playfield", () => {
    expect(RISK_PICKUPS).toHaveLength(MAX_CAMPAIGN_WAVES);
    const rect = playRect(ARENA.bounds);
    for (let wave = 1; wave <= MAX_CAMPAIGN_WAVES; wave += 1) {
      const pickup = riskPickupForWave(wave);
      const inset = arenaInsetForWave(wave);
      expect(pickup.x).toBeGreaterThan(rect.minX + inset);
      expect(pickup.x).toBeLessThan(rect.maxX - inset);
      expect(pickup.z).toBeGreaterThan(rect.minZ + inset);
      expect(pickup.z).toBeLessThan(rect.maxZ - inset);
      expect(senseRiskPickup(pickup, pickup)).toBe(true);
      expect(senseRiskPickup({ x: pickup.x + 2, z: pickup.z }, pickup)).toBe(false);
    }
  });

  it("produces the same terminal outcome hash for the same seed and gameplay truth", () => {
    const input = {
      seed: 20260821,
      state: "complete" as const,
      wave: 5,
      score: 184200,
      kills: 517,
      maxCombo: 43,
      hp: 2,
      upgrades: { fireRateMultiplier: 0.74, dashCooldownMultiplier: 0.7, shieldCharges: 2 },
      waveChecksums: [11, 22, 33, 44, 55]
    };
    expect(outcomeHash(input)).toBe(outcomeHash({ ...input, upgrades: { ...input.upgrades } }));
    expect(outcomeHash(input)).not.toBe(outcomeHash({ ...input, seed: input.seed + 1 }));
    expect(outcomeHash(input)).not.toBe(outcomeHash({ ...input, score: input.score + 100 }));
  });
});

describe("Neon Swarm steering", () => {
  function snapshot(sim: ReturnType<typeof createSwarmSimulation>) {
    const rows: string[] = [];
    sim.forEachAlive((drone) => rows.push(drone.archetype + ":" + drone.slot + ":" + drone.x.toFixed(4) + ":" + drone.z.toFixed(4)));
    return rows.sort().join("|");
  }

  it("steers identically for identical seeded spawns", () => {
    const simA = createSwarmSimulation();
    const simB = createSwarmSimulation();
    const schedule = waveSpawnSchedule(waveSpec(2), 20260821);
    for (const event of schedule.slice(0, 24)) {
      const point = spawnPointOnEdge(event.edge, event.t);
      const request = { x: point.x, z: point.z, archetype: event.archetype, speedMultiplier: waveSpec(2).speedMultiplier };
      simA.spawn(request);
      simB.spawn(request);
    }
    for (let frame = 0; frame < 240; frame += 1) {
      const player = { x: Math.sin(frame / 30) * 4, z: Math.cos(frame / 24) * 3 };
      simA.step(1 / 60, player, ARENA.obstacles);
      simB.step(1 / 60, player, ARENA.obstacles);
    }
    expect(snapshot(simA)).toBe(snapshot(simB));
    expect(simA.aliveCount()).toBe(24);
  });

  it("keeps drones inside the arena bounds while seeking the courier", () => {
    const sim = createSwarmSimulation();
    const rect = {
      minX: ARENA.bounds.minX - 0.01,
      maxX: ARENA.bounds.maxX + 0.01,
      minZ: ARENA.bounds.minZ - 0.01,
      maxZ: ARENA.bounds.maxZ + 0.01
    };
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    sim.spawn({ x: -25, z: -16, archetype: "grunt", speedMultiplier: 1 });
    sim.spawn({ x: 25, z: 16, archetype: "grunt", speedMultiplier: 1 });
    for (let frame = 0; frame < 60 * 30; frame += 1) {
      sim.step(1 / 60, { x: 0, z: 0 }, ARENA.obstacles);
      sim.forEachAlive((drone) => {
        minX = Math.min(minX, drone.x);
        maxX = Math.max(maxX, drone.x);
        minZ = Math.min(minZ, drone.z);
        maxZ = Math.max(maxZ, drone.z);
      });
    }
    expect(minX).toBeGreaterThan(rect.minX);
    expect(maxX).toBeLessThan(rect.maxX);
    expect(minZ).toBeGreaterThan(rect.minZ);
    expect(maxZ).toBeLessThan(rect.maxZ);
    // Drones closed distance toward the courier from opposite corners.
    let nearest = Infinity;
    sim.forEachAlive((drone) => {
      nearest = Math.min(nearest, Math.hypot(drone.x, drone.z));
    });
    expect(nearest).toBeLessThan(8);
  });

  it("fires pulse damage inside the cone and spares drones behind the player", () => {
    const sim = createSwarmSimulation();
    sim.spawn({ x: 2, z: 0, archetype: "grunt", speedMultiplier: 1 });      // ahead
    sim.spawn({ x: -2, z: 0, archetype: "grunt", speedMultiplier: 1 });     // behind
    sim.spawn({ x: 0, z: 8, archetype: "grunt", speedMultiplier: 1 });      // far away
    const result = sim.firePulse({ x: 0, z: 0 }, 1, 0, 99);
    expect(result.hits).toBe(1);
    expect(result.kills).toBe(1);
    expect(sim.aliveCount()).toBe(2);
    const survivors: number[] = [];
    sim.forEachAlive((drone) => survivors.push(drone.hp));
    expect(survivors).toHaveLength(2);
  });

  it("runs elite telegraph before the speed burst", () => {
    const sim = createSwarmSimulation();
    expect(sim.spawn({ x: 10, z: 10, archetype: "elite", speedMultiplier: 1 })).toBe(true);
    let sawTelegraph = false;
    let sawBurstAfterTelegraph = false;
    // One full burst cycle is 5.5s; step 9s of fixed frames.
    for (let frame = 0; frame < 60 * 9; frame += 1) {
      sim.step(1 / 60, { x: 0, z: 0 }, []);
      const probe = sim.eliteTimerProbe();
      if (probe.some((row) => row.telegraphing)) sawTelegraph = true;
      else if (sawTelegraph && probe.some((row) => row.bursting)) sawBurstAfterTelegraph = true;
    }
    expect(sawTelegraph).toBe(true);
    expect(sawBurstAfterTelegraph).toBe(true);
  });

  it("counts a bounded graze annulus and resolves a radial burst from simulation truth", () => {
    const sim = createSwarmSimulation();
    sim.spawn({ x: 1.5, z: 0, archetype: "grunt", speedMultiplier: 1 });
    sim.spawn({ x: 2.2, z: 0, archetype: "elite", speedMultiplier: 1 });
    sim.spawn({ x: 6, z: 0, archetype: "grunt", speedMultiplier: 1 });
    expect(sim.countWithin({ x: 0, z: 0 }, 1, 2.5)).toBe(2);
    const killed: string[] = [];
    const result = sim.radialBurst({ x: 0, z: 0 }, 4.25, 99, {
      onDroneKilled: (drone) => killed.push(drone.archetype + ":" + drone.slot)
    });
    expect(result).toEqual({ hits: 2, kills: 2 });
    expect(killed).toHaveLength(2);
    expect(sim.aliveCount()).toBe(1);
  });

  it("exposes pool capacities that exceed the 300-drone evidence bar", () => {
    expect(GRUNT_POOL_CAPACITY).toBeGreaterThanOrEqual(300);
    expect(ELITE_POOL_CAPACITY).toBeGreaterThanOrEqual(48);
    const sim = createSwarmSimulation();
    let spawned = 0;
    outer: for (let edgeIndex = 0; edgeIndex < 4; edgeIndex += 1) {
      for (let i = 0; i < 80; i += 1) {
        const point = spawnPointOnEdge(ARENA.spawnEdges[edgeIndex]!.id, i / 80);
        if (sim.spawn({ x: point.x, z: point.z, archetype: i % 12 === 0 ? "elite" : "grunt", speedMultiplier: 1 })) {
          spawned += 1;
          if (spawned >= 310) break outer;
        }
      }
    }
    expect(spawned).toBe(310);
    expect(sim.aliveCount()).toBe(310);
    expect(sim.aliveGruntCount() + sim.aliveEliteCount()).toBe(310);
    sim.reset();
    expect(sim.aliveCount()).toBe(0);
  });
});
