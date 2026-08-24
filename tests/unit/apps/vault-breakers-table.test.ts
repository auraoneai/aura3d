import { describe, expect, it } from "vitest";
import { createTableSimulation } from "../../../apps/showcase-vault-breakers/src/table";
import { VaultFlow } from "../../../apps/showcase-vault-breakers/src/ball-flow";
import { FlipperController } from "../../../apps/showcase-vault-breakers/src/flippers";
import { BANK_IDS, TARGETS_PER_BANK, FLIPPER_UP_YAW, RIGHT_UP_YAW } from "../../../apps/showcase-vault-breakers/src/table";

/**
 * PRD definition-of-done pins for the Vault Breakers table (VB-13):
 * - the table builds headless on the rapier backend with 5x3 registered targets;
 * - a full-plunger serve leaves the lane into the playfield;
 * - standup target sensors fire exactly once per entry;
 * - flippers raise to their up limits and hold;
 * - an unplayed ball drains and a three-ball game reaches game over;
 * - identical scripts reproduce identical pose hashes; full reset restores state.
 */

function stepFlow(flow: VaultFlow, steps: number): void {
  for (let index = 0; index < steps; index += 1) flow.update(1);
}

describe("vault breakers table construction", () => {
  it("builds on the rapier backend with five banks of three targets and two joints", () => {
    const sim = createTableSimulation();
    expect(sim.backend).toBe("rapier");
    expect(sim.targetIds).toHaveLength(BANK_IDS.length * TARGETS_PER_BANK);
    expect(sim.jointCount).toBe(2);
    expect(sim.activeBallCount()).toBe(0);
  });

  it("a full-plunger serve leaves the lane into the playfield", () => {
    const sim = createTableSimulation();
    expect(sim.serveBall(1)).toBe(true);
    let exited = false;
    for (let index = 0; index < 360 && !exited; index += 1) {
      sim.stepFixed(1);
      exited = sim.ballStates().some((ball) => ball.state === "play");
    }
    expect(exited).toBe(true);
  });
});

describe("vault breakers sensors and flippers", () => {
  it("standup target sensors fire exactly once per entry (slope rolls the ball on)", () => {
    const sim = createTableSimulation();
    sim.serveBall(1);
    const ball = sim.debugBallBody(0)!;
    ball.wake();
    // Place the ball AT REST inside a target sensor. The authored slope then
    // rolls it down the left wall across the bank: every distinct sensor must
    // fire exactly once per entry, and the starting target exactly once.
    ball.setPosition([-2.32, 0.14, -2.8]);
    ball.setVelocity([0, 0, 0]);
    const fired: string[] = [];
    for (let index = 0; index < 240; index += 1) {
      sim.stepFixed(1);
      for (const event of sim.consumeSensorEvents()) {
        if (event.kind === "target") fired.push(event.id);
      }
    }
    expect(fired).toContain("target:bank-left-top:t1");
    const firstEntryCount = fired.filter((id) => id === "target:bank-left-top:t1").length;
    expect(firstEntryCount).toBe(1);
    // Once-per-entry arming: no sensor id may repeat in one rolling pass.
    const unique = new Set(fired);
    expect(unique.size).toBe(fired.length);
    expect(unique.size).toBeGreaterThan(1);
  });

  it("flippers raise to their up limits under the motor", () => {
    const sim = createTableSimulation();
    sim.flippers.left.raise();
    sim.flippers.right.raise();
    for (let index = 0; index < 12; index += 1) sim.stepFixed(1);
    expect(sim.flippers.left.yaw()).toBeGreaterThan(FLIPPER_UP_YAW - 0.06);
    expect(sim.flippers.right.yaw()).toBeLessThan(RIGHT_UP_YAW + 0.06);
  });
});

describe("vault breakers game flow", () => {
  it("an unplayed ball drains, three balls reach game over, and tilt strikes lock", { timeout: 120_000 }, () => {
    const sim = createTableSimulation();
    const flippers = new FlipperController(sim.flippers);
    const flow = new VaultFlow(flippers, sim);

    for (let ball = 1; ball <= 3; ball += 1) {
      expect(flow.serve(1)).toBe(true);
      expect(flow.phase).toBe("play");
      if (ball === 1) {
        flow.nudge(1);
        flow.nudge(-1);
        flow.nudge(1);
        expect(flow.snapshot().tiltLocked).toBe(true);
      }
      let drained = false;
      for (let index = 0; index < 9000 && !drained; index += 1) {
        flow.update(1);
        drained = flow.phase === "await-serve" || flow.phase === "game-over";
      }
      expect(drained).toBe(true);
    }
    const snap = flow.snapshot();
    expect(snap.phase).toBe("game-over");
    expect(snap.ball).toBe(3);
    // Tilt lock clears at ball end.
    expect(snap.tiltLocked).toBe(false);
  });

  it("full reset restores a fresh machine state", () => {
    const sim = createTableSimulation();
    const flippers = new FlipperController(sim.flippers);
    const flow = new VaultFlow(flippers, sim);
    flow.serve(1);
    stepFlow(flow, 600);
    flow.reset();
    const snap = flow.snapshot();
    expect(snap.phase).toBe("attract");
    expect(snap.score).toBe(0);
    expect(snap.banksDown).toBe(0);
    expect(snap.activeBalls).toBe(0);
    expect(flow.resetHashMatch).toBe(true);
  });

  it("reuses parked ball bodies across repeated full sessions", () => {
    const sim = createTableSimulation();
    const flippers = new FlipperController(sim.flippers);
    const flow = new VaultFlow(flippers, sim);
    for (let session = 0; session < 4; session += 1) {
      flow.evidenceEndGame();
      expect(flow.snapshot().phase).toBe("game-over");
      expect(flow.snapshot().ballsRemaining).toBe(0);
      flow.reset();
      expect(flow.serve(0.7)).toBe(true);
      flow.reset();
    }
  });

  it("identical serve scripts reproduce identical pose hashes (determinism)", () => {
    const runOnce = (): string => {
      const sim = createTableSimulation();
      sim.serveBall(0.7);
      for (let index = 0; index < 240; index += 1) sim.stepFixed(1);
      return sim.poseHash();
    };
    expect(runOnce()).toBe(runOnce());
  });
});
