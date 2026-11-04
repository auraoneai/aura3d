// Headless regression (moved from apps/showcase-slingshot-siege/tests so the root unit gate runs it): every level boots, fires, and settles through the real
// Rapier-backed SiegeSim (no renderer). Run: pnpm exec vitest run tests/unit/slingshot-siege
import { describe, expect, it } from "vitest";
import { SiegeSim } from "../../../apps/showcase-slingshot-siege/src/game/sim";
import { LEVELS } from "../../../apps/showcase-slingshot-siege/src/game/levels";

// Rapier updates are synchronous; yield regularly so the vitest worker RPC (`onTaskUpdate`) is not starved
// on the 2 vCPU ACR task (this file ran ~121 s inside one blocked tick).
const yieldToLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function pump(sim: SiegeSim, frames: number): Promise<void> {
  for (let i = 0; i < frames; i += 1) {
    sim.update(1 / 60);
    if (i % 60 === 59) await yieldToLoop();
  }
}

// Same launch the evidence hook uses — verified to reach the level-1 tower.
const ORIGIN: [number, number, number] = [-7.4, 1.8, 0];
const VELOCITY: [number, number, number] = [9.5, 7.5, 0];

describe("slingshot-siege sim", () => {
  it("all 30 levels boot and idle-settle", async () => {
    for (const level of LEVELS) {
      const sim = new SiegeSim({ level, seed: 1337 + level.id });
      await pump(sim, 30);
      await yieldToLoop();
      expect(sim.pieceList().length).toBeGreaterThan(0);
      expect(sim.gullList().length).toBeGreaterThan(0);
      expect(sim.totalBodyCount()).toBeGreaterThan(10);
    }
  }, 120_000);

  it("a lobbed shot damages the level-1 tower and squashes a gull", async () => {
    const level = LEVELS[0]!;
    const sim = new SiegeSim({ level, seed: 42 });
    const ok = sim.launch("stone", ORIGIN, VELOCITY);
    expect(ok).toBe(true);
    await pump(sim, 60 * 14);
    const kinds = sim.drainEvents().map((e) => e.kind);
    expect(sim.gullsAlive()).toBeLessThan(sim.gullList().length);
    expect(kinds).toContain("shot-settled");
  }, 30_000);

  it("squashed gull records a squash position and hides after the tween", async () => {
    const level = LEVELS[0]!;
    const sim = new SiegeSim({ level, seed: 42 });
    sim.launch("stone", ORIGIN, VELOCITY);
    await pump(sim, 60 * 14);
    const dead = sim.gullList().filter((g) => !g.alive);
    expect(dead.length).toBeGreaterThan(0);
    for (const g of dead) {
      expect(g.squashAt[1]).toBeGreaterThan(-10); // not the graveyard
      expect(g.squashAge).toBeGreaterThan(1.05); // tween completed
    }
  }, 30_000);

  it("ember ability breaks fragile pieces in the blast core", async () => {
    const level = LEVELS[0]!;
    const sim = new SiegeSim({ level, seed: 42 });
    sim.launch("ember", ORIGIN, VELOCITY);
    await pump(sim, 90);
    const used = sim.ability();
    expect(used).toBe(true);
    await pump(sim, 60 * 10);
    expect(sim.piecesAlive()).toBeLessThan(sim.pieceList().length);
  }, 30_000);
});
