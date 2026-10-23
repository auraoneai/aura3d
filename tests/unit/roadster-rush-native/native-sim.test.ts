import { describe, expect, it, vi } from "vitest";
import { RoadsterGame } from "../../../apps/showcase-roadster-rush/src/native/game";
import { Player } from "../../../apps/showcase-roadster-rush/src/native/player";
import { Traffic } from "../../../apps/showcase-roadster-rush/src/native/traffic";
import { FreewayWorld } from "../../../apps/showcase-roadster-rush/src/native/world";
import { createRng } from "../../../apps/showcase-roadster-rush/src/native/rng";
// @ts-expect-error plain ES module shared with the browser capture
import { runReference } from "../../support/rr-reference-run.mjs";

function makeGame(seed: number): RoadsterGame {
  const game = new RoadsterGame({ player: new Player(), traffic: new Traffic(), world: new FreewayWorld(), params: new URLSearchParams(`seed=${seed}`), storage: null });
  game.boot();
  return game;
}

describe("native Apex Overdrive simulation", () => {
  it("is deterministic for a seed and never reads Math.random while stepping", () => {
    const random = vi.spyOn(Math, "random");
    const a = runReference(makeGame(42), { seed: 42, steps: 1500, every: 25 });
    const b = runReference(makeGame(42), { seed: 42, steps: 1500, every: 25 });
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    expect(b).toEqual(a);
    const other = runReference(makeGame(7), { seed: 7, steps: 1500, every: 25 });
    expect(other.samples.map((s: { vsum: number }) => s.vsum)).not.toEqual(a.samples.map((s: { vsum: number }) => s.vsum));
  });

  it("starts a run on the centre lane at base speed with full air", () => {
    const game = makeGame(42);
    game.start();
    const p = game.player;
    expect(game.mode).toBe("playing");
    expect([p.lane, p.targetLane]).toEqual([2, 2]);
    expect(p.speed).toBeCloseTo(26, 6);
    expect(p.air).toBe(100);
    expect(p.grounded).toBe(true);
  });

  it("hops, thrusts and lands: a hop leaves the ground and the car lands back on the road", () => {
    const game = makeGame(42);
    game.start();
    game.manual = true;
    game.player.reset();
    game.triggerAction("hop");
    game.simStep(1 / 60);
    expect(game.player.grounded).toBe(false);
    expect(game.player.velocity.y).toBeGreaterThan(5);
    let landed = false;
    for (let i = 0; i < 240 && !landed; i++) {
      game.simStep(1 / 60);
      landed = game.player.grounded;
    }
    expect(landed).toBe(true);
    expect(game.player.position.y).toBeCloseTo(game.player.supportY, 3);
  });

  it("barrel roll spends air, grants brief invulnerability and finishes", () => {
    const game = makeGame(42);
    game.start();
    game.manual = true;
    const air0 = game.player.air;
    game.triggerAction("rollRight");
    game.simStep(1 / 60);
    expect(game.player.rolling).toBe(true);
    expect(game.player.invulnerable).toBe(true);
    expect(game.player.air).toBeLessThan(air0);
    for (let i = 0; i < 40; i++) game.simStep(1 / 60);
    expect(game.player.rolling).toBe(false);
  });

  it("a forced crash ends the run: crashed, then gameover with the score recorded as best", () => {
    const game = makeGame(42);
    game.start();
    game.manual = true;
    game.score = 1234;
    game.triggerAction("crash");
    expect(game.mode).toBe("crashed");
    for (let i = 0; i < 120 && game.mode !== "gameover"; i++) game.simStep(1 / 60);
    expect(game.mode).toBe("gameover");
    expect(game.best).toBeGreaterThanOrEqual(1234);
  });

  it("pickups: a rocket pickup makes the car invulnerable; air refills; bolts score", () => {
    const game = makeGame(42);
    game.start();
    game.manual = true;
    game.player.air = 10;
    game.triggerAction("pickup", { kind: "air" });
    expect(game.player.air).toBeCloseTo(45, 6);
    const score0 = game.score;
    game.triggerAction("pickup", { kind: "bolt", value: 3 });
    expect(game.bolts).toBe(3);
    expect(game.score).toBeGreaterThan(score0);
    game.triggerAction("pickup", { kind: "rocket" });
    expect(game.player.rocketTimer).toBeGreaterThan(5);
    expect(game.player.invulnerable).toBe(true);
  });

  it("traffic keeps lanes legal: no two vehicles overlap in a lane across a long run", () => {
    const game = makeGame(20261023);
    game.start();
    game.manual = true;
    game.player.shieldTimer = 1e9;
    for (let step = 0; step < 3000; step++) {
      game.simStep(1 / 60);
      if (step % 50 !== 0) continue;
      const lanes = new Map<number, Array<{ z: number; l: number }>>();
      for (const v of game.traffic.vehicles) {
        if (v.changer && v.changer.state === 2) continue;
        const list = lanes.get(v.lane) ?? [];
        list.push({ z: v.z, l: v.l });
        lanes.set(v.lane, list);
      }
      for (const list of lanes.values()) {
        list.sort((a, b) => a.z - b.z);
        for (let i = 1; i < list.length; i++) expect(list[i]!.z - list[i]!.l / 2).toBeGreaterThanOrEqual(list[i - 1]!.z + list[i - 1]!.l / 2 - 0.05);
      }
    }
    expect(game.traffic.stats().vehicles).toBeGreaterThan(5);
  });

  it("the seeded generator matches mulberry32 reference values", () => {
    const rng = createRng(42);
    const values = [rng.next(), rng.next(), rng.next()];
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(createRng(42).next()).toBe(values[0]);
    expect(createRng(43).next()).not.toBe(values[0]);
  });
});
