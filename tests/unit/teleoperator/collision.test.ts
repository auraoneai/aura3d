import { describe, expect, it } from "vitest";
import {
  PLAYER_HALF_LENGTH,
  PLAYER_RADIUS,
  TRAFFIC_FOOTPRINTS,
  applyCollisionPenalty,
  createTrafficContacts,
  createTrafficRecovery,
  type PlayerBody,
  type TrafficBody
} from "../../../apps/showcase-teleoperator/src/collision";

const DT = 1 / 60;
const SPEEDS = [8, 16, 30];

interface Run {
  readonly events: number;
  readonly maxOverlap: number;
  readonly finalPlayer: PlayerBody;
  readonly finalCarZ: number;
  readonly approachSpeed: number;
}

function simulate(slot: number, player: PlayerBody, car: TrafficBody, steps: number): Run {
  const contacts = createTrafficContacts(10);
  const [length, width] = TRAFFIC_FOOTPRINTS[slot]!;
  const halfZ = length / 2 + (PLAYER_HALF_LENGTH - PLAYER_RADIUS) + PLAYER_RADIUS;
  const halfX = width / 2 + PLAYER_RADIUS;
  const cars = Array.from({ length: 10 }, (_, i) => (i === slot ? car : { laneX: 99, z: 9999, speed: 0, direction: 1 as const }));
  let events = 0;
  let maxOverlap = 0;
  let approachSpeed = 0;
  for (let i = 0; i < steps; i++) {
    // Integrate the way the game does, then resolve contact on the post-integration state.
    car.z += (car.direction === 1 ? -car.speed : car.speed) * DT;
    player.z -= player.speed * DT;
    player.x += player.lateral * DT;
    const hits = contacts.step(player, cars, DT);
    for (const h of hits) {
      events += 1;
      approachSpeed = Math.max(approachSpeed, h.impact.speed);
    }
    // Penetration depth into the expanded box (negative means outside).
    const dz = Math.abs(player.z - car.z);
    const dx = Math.abs(player.x - car.laneX);
    const overlap = Math.min(halfZ - dz, halfX - dx);
    maxOverlap = Math.max(maxOverlap, overlap);
  }
  return { events, maxOverlap, finalPlayer: player, finalCarZ: car.z, approachSpeed };
}

describe("player versus traffic", () => {
  for (const speed of SPEEDS) {
    it(`rear-end at ${speed} m/s: one impact, no pass-through, speed drops to the car's`, () => {
      const car: TrafficBody = { laneX: 3.4, z: -40, speed: 4, direction: 1 };
      const player: PlayerBody = { x: 3.4, z: 0, speed, lateral: 0 };
      const run = simulate(0, player, car, 600);
      expect(run.events).toBe(1);
      expect(run.maxOverlap).toBeLessThan(0.15);
      expect(run.finalPlayer.z).toBeGreaterThan(run.finalCarZ);
      expect(run.finalPlayer.speed).toBeLessThanOrEqual(4 + 0.6);
    });

    it(`head-on at ${speed} m/s against oncoming traffic: one impact, no pass-through`, () => {
      const car: TrafficBody = { laneX: -3.2, z: -80, speed: 13, direction: -1 };
      const player: PlayerBody = { x: -3.2, z: 0, speed, lateral: 0 };
      const run = simulate(1, player, car, 600);
      expect(run.events).toBe(1);
      expect(run.maxOverlap).toBeLessThan(0.15);
      expect(run.finalPlayer.z).toBeGreaterThan(run.finalCarZ - 0.2);
      expect(run.approachSpeed).toBeGreaterThan(speed);
    });

    it(`side swipe at ${speed / 4} m/s lateral: one impact, pushed back out, no pass-through`, () => {
      const lateral = speed / 4;
      const car: TrafficBody = { laneX: 7.4, z: -1, speed: 10, direction: 1 };
      const player: PlayerBody = { x: 3.4, z: 0, speed: 10, lateral };
      const run = simulate(2, player, car, 240);
      expect(run.events).toBe(1);
      expect(run.maxOverlap).toBeLessThan(0.15);
      expect(run.finalPlayer.x).toBeLessThan(car.laneX);
    });
  }

  it("is deterministic: the same drive gives the same result twice", () => {
    const make = () =>
      simulate(3, { x: 3.4, z: 0, speed: 20, lateral: 0 }, { laneX: 3.4, z: -30, speed: 6, direction: 1 }, 300);
    const a = make();
    const b = make();
    expect(b.events).toBe(a.events);
    expect(b.finalPlayer).toEqual(a.finalPlayer);
    expect(b.finalCarZ).toBe(a.finalCarZ);
  });

  it("resting contact behind a car at the same speed raises no extra events", () => {
    const car: TrafficBody = { laneX: 3.4, z: -6, speed: 10, direction: 1 };
    const player: PlayerBody = { x: 3.4, z: 0, speed: 12, lateral: 0 };
    const run = simulate(0, player, car, 900);
    expect(run.events).toBe(1);
  });

  it("does not touch a car in the next lane", () => {
    const car: TrafficBody = { laneX: 7.4, z: -2, speed: 10, direction: 1 };
    const player: PlayerBody = { x: 3.4, z: 0, speed: 10, lateral: 0 };
    expect(simulate(0, player, car, 300).events).toBe(0);
  });

  it("applies the comfort and street penalties", () => {
    const state = { comfortScore: 98, streetBounty: 4250, streetMultiplier: 3 };
    const comfort = applyCollisionPenalty(state, "comfort", 10);
    expect(state.comfortScore).toBe(98 - Math.round(2.5 + 12));
    expect(comfort.label).toContain("COMFORT");
    const street = applyCollisionPenalty(state, "street", 10);
    expect(state.streetMultiplier).toBe(2);
    expect(state.streetBounty).toBe(4250 - 400);
    expect(street.label).toContain("BOUNTY");
    applyCollisionPenalty(state, "street", 10);
    applyCollisionPenalty(state, "street", 10);
    expect(state.streetMultiplier).toBe(1);
    state.comfortScore = 1;
    applyCollisionPenalty(state, "comfort", 30);
    expect(state.comfortScore).toBe(0);
  });

  it("a struck car stops, holds, then ramps back to its cruise speed", () => {
    const cars: TrafficBody[] = [{ laneX: 3.4, z: -10, speed: 12, direction: 1 }];
    const recovery = createTrafficRecovery([12], { holdSec: 1, accel: 6 });
    cars[0]!.speed = 0;
    recovery.onHit(0, 5);
    recovery.update(cars, 5.5, 0.5);
    expect(cars[0]!.speed).toBe(0);
    recovery.update(cars, 6.01, 0.5);
    expect(cars[0]!.speed).toBeCloseTo(3, 5);
    for (let i = 0; i < 40; i++) recovery.update(cars, 7 + i * 0.1, 0.1);
    expect(cars[0]!.speed).toBe(12);
  });
});
