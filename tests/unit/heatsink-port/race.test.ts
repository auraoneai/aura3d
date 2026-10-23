import { describe, expect, it } from "vitest";
import { FRAME, Race } from "../../../examples/heatsink-port/race";
import { IDLE, type Input } from "../../../examples/heatsink-port/vehicle";

const GO: Input = { ...IDLE, throttle: 1 };
const run = (race: Race, steps: number, input: Input): void => { for (let i = 0; i < steps; i++) race.frame(FRAME, input); };

describe("race flow", () => {
  it("counts down 3.2 s then starts the race clock", () => {
    const race = new Race();
    expect(race.state).toBe("countdown");
    run(race, 190, GO);
    expect(race.state).toBe("countdown");
    expect(race.raceTime).toBe(0);
    run(race, 4, GO);
    expect(race.state).toBe("race");
  });

  it("does not let the player move during the countdown", () => {
    const race = new Race();
    const s0 = race.player.s;
    run(race, 100, GO);
    expect(race.player.s).toBe(s0);
    expect(race.player.v).toBe(0);
  });

  it("is deterministic: identical inputs give identical states", () => {
    const a = new Race(), b = new Race();
    for (let i = 0; i < 1500; i++) {
      const input: Input = { ...GO, steer: Math.sin(i / 40) * 0.5, afterburner: i % 300 > 200 };
      a.frame(FRAME, input);
      b.frame(FRAME, input);
    }
    expect(a.player.s).toBe(b.player.s);
    expect(a.player.v).toBe(b.player.v);
    expect(a.player.x).toBe(b.player.x);
    expect(a.raceTime).toBe(b.raceTime);
  });

  it("accelerates down the track under throttle and respects the speed cap", () => {
    const race = new Race();
    run(race, 193 + 600, GO);
    expect(race.player.v).toBeGreaterThan(40);
    expect(race.player.v).toBeLessThan(260);
    expect(race.player.dist).toBeGreaterThan(300);
  });

  it("slows time after a crash and records the crash event", () => {
    const race = new Race();
    run(race, 193, GO);
    let crashed = false;
    for (let i = 0; i < 3000 && !crashed; i++) {
      race.frame(FRAME, { ...GO, steer: 1 });
      crashed = race.events.some((e) => e.type === "crash");
    }
    expect(crashed).toBe(true);
    expect(race.slowT).toBeGreaterThan(0);
    race.frame(FRAME, IDLE);
    expect(race.timeScale).toBe(0.3);
  });

  it("startRace resets clocks, pickups and barrels", () => {
    const race = new Race();
    run(race, 400, GO);
    race.pickups[0]!.respawn = 9;
    race.barrels[0]!.alive = false;
    race.startRace();
    expect(race.raceTime).toBe(0);
    expect(race.state).toBe("countdown");
    expect(race.pickups[0]!.respawn).toBe(0);
    expect(race.barrels[0]!.alive).toBe(true);
  });
});
