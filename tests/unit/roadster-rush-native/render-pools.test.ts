import { describe, expect, it } from "vitest";
import { RoadsterGame } from "../../../apps/showcase-roadster-rush/src/native/game";
import { Player } from "../../../apps/showcase-roadster-rush/src/native/player";
import { Traffic } from "../../../apps/showcase-roadster-rush/src/native/traffic";
import { FreewayWorld, GANTRY_COUNT, NO_GANTRY_Z } from "../../../apps/showcase-roadster-rush/src/native/world";
import {
  POOL_CAPACITY,
  POWERUP_KINDS,
  VEHICLE_TYPES,
  assignGroundSlots,
  assignPickupSlots,
  emptyGroundSlots,
  emptyPickupSlots,
  nearestAhead,
  DRAW_WINDOW,
  SHADOW_NEAR,
  NEAR_CAPACITY
} from "../../../apps/showcase-roadster-rush/src/render/pools";

/**
 * Audit RR-1, RR-2 and RR-4: the renderer must draw what the simulation holds. Replays seeded 90 s runs (kept alive with a
 * shield so the traffic reaches the dense 50-60 s mix), runs the renderer's slot assignment every step, and checks that every
 * vehicle, sky car, bolt and power-up up to 120 m ahead has a drawn slot of its own type. Gantries: the renderer draws one
 * gantry per collidable world slot, so the slot count must equal GANTRY_COUNT.
 */

const STEPS = 90 * 60;
const CHECK_AHEAD = 120;

function makeGame(seed: number): RoadsterGame {
  const game = new RoadsterGame({ player: new Player(), traffic: new Traffic(), world: new FreewayWorld(), params: new URLSearchParams(`seed=${seed}`), storage: null });
  game.boot();
  game.manual = true;
  game.start();
  return game;
}

describe("Apex Overdrive render pools cover the simulation", () => {
  for (const seed of [42, 7, 20261023]) {
    it(`seed ${seed}: every entity within ${CHECK_AHEAD} m ahead is drawn in its own pool for 90 s`, () => {
      const game = makeGame(seed);
      const ground = emptyGroundSlots<(typeof game.traffic.vehicles)[number]>();
      const picks = emptyPickupSlots<(typeof game.traffic.pickups)[number]>();
      const sky: (typeof game.traffic.skyCars)[number][] = [];
      const peak: Record<string, number> = {};
      const bump = (k: string, n: number): void => { peak[k] = Math.max(peak[k] ?? 0, n); };
      let missing = 0;
      let firstMiss = "";
      let maxDistance = 0;
      for (let step = 0; step < STEPS; step++) {
        if (step % 120 === 0) game.triggerAction("pickup", { kind: "shield" });
        if (step % 30 === 0) game.triggerAction(step % 60 === 0 ? "left" : "right");
        game.simStep(1 / 60);
        if (game.mode === "gameover") game.start();
        const pz = game.player.position.z;
        maxDistance = Math.max(maxDistance, game.distance);
        assignGroundSlots(game.traffic.vehicles, pz, ground);
        nearestAhead(game.traffic.skyCars, pz, DRAW_WINDOW.skyCars, POOL_CAPACITY.skyCar, sky);
        assignPickupSlots(game.traffic.pickups, pz, picks);

        // raw window counts (without capacity) give the measured peaks
        const raw: Record<string, number> = {};
        for (const v of game.traffic.vehicles) {
          const d = pz - v.z;
          if (d <= DRAW_WINDOW.vehicles.ahead && d >= -DRAW_WINDOW.vehicles.behind) raw[v.type] = (raw[v.type] ?? 0) + 1;
          if (d <= SHADOW_NEAR && d >= -DRAW_WINDOW.vehicles.behind) raw[`near:${v.type}`] = (raw[`near:${v.type}`] ?? 0) + 1;
        }
        for (const s of game.traffic.skyCars) {
          const d = pz - s.z;
          if (d <= DRAW_WINDOW.skyCars.ahead && d >= -DRAW_WINDOW.skyCars.behind) raw.skyCar = (raw.skyCar ?? 0) + 1;
        }
        for (const k of game.traffic.pickups) {
          const d = pz - k.z;
          if (d <= DRAW_WINDOW.pickups.ahead && d >= -DRAW_WINDOW.pickups.behind) raw[k.kind] = (raw[k.kind] ?? 0) + 1;
        }
        for (const [k, n] of Object.entries(raw)) bump(k, n);

        const miss = (what: string, z: number): void => {
          missing++;
          if (!firstMiss) firstMiss = `step ${step}: ${what} ${(pz - z).toFixed(1)} m ahead`;
        };
        for (const v of game.traffic.vehicles) {
          const d = pz - v.z;
          if (d < 0 || d > CHECK_AHEAD) continue;
          if (!ground[v.type as (typeof VEHICLE_TYPES)[number]]?.includes(v)) miss(v.type, v.z);
        }
        for (const s of game.traffic.skyCars) {
          const d = pz - s.z;
          if (d >= 0 && d <= CHECK_AHEAD && !sky.includes(s)) miss("skyCar", s.z);
        }
        for (const k of game.traffic.pickups) {
          const d = pz - k.z;
          if (d < 0 || d > CHECK_AHEAD) continue;
          const pool = k.kind === "bolt" ? picks.bolts : picks.powerups[k.kind as (typeof POWERUP_KINDS)[number]];
          if (!pool?.includes(k)) miss(k.kind, k.z);
        }
      }
      // eslint-disable-next-line no-console
      console.log(`RR_POOL_PEAKS seed=${seed} distance=${maxDistance.toFixed(0)} ${JSON.stringify(peak)}`);
      expect(maxDistance).toBeGreaterThan(3000);
      expect(firstMiss).toBe("");
      expect(missing).toBe(0);
      // the capacities hold the whole draw window, not just the first 120 m
      for (const t of VEHICLE_TYPES) expect(peak[t] ?? 0).toBeLessThanOrEqual(POOL_CAPACITY[t]);
      for (const t of VEHICLE_TYPES) expect(peak[`near:${t}`] ?? 0).toBeLessThanOrEqual(NEAR_CAPACITY[t]);
      expect(peak.skyCar ?? 0).toBeLessThanOrEqual(POOL_CAPACITY.skyCar);
      expect(peak.bolt ?? 0).toBeLessThanOrEqual(POOL_CAPACITY.bolt);
      for (const k of POWERUP_KINDS) expect(peak[k] ?? 0).toBeLessThanOrEqual(POOL_CAPACITY.powerup[k]);
    });
  }

  it("draws one gantry per collidable world slot and hides empty slots", () => {
    const world = new FreewayWorld();
    expect(world.gantries.length).toBe(GANTRY_COUNT);
    let empty = 0;
    for (let z = 0; z > -6000; z -= 10) {
      world.update(0, { z });
      for (const g of world.gantries) if (g.position.z === NO_GANTRY_Z) empty++;
    }
    expect(GANTRY_COUNT).toBe(5);
    expect(empty).toBeGreaterThan(0);
  });

  it("orders by distance ahead and drops the farthest when a pool overflows", () => {
    const items = [{ z: -200 }, { z: -5 }, { z: 6 }, { z: -100 }, { z: 20 }, { z: -300 }];
    const out = nearestAhead(items, 0, { ahead: 235, behind: 8 }, 3);
    expect(out.map((i) => i.z)).toEqual([6, -5, -100]);
  });

  it("never draws a heavy vehicle with a car pool", () => {
    const vehicles = Array.from({ length: 40 }, (_, i) => ({ type: "bus", z: -i * 5 }));
    const slots = assignGroundSlots(vehicles, 0);
    expect(slots.bus.length).toBe(POOL_CAPACITY.bus);
    for (const t of VEHICLE_TYPES) if (t !== "bus") expect(slots[t].length).toBe(0);
  });
});
