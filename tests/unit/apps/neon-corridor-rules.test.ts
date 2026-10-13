import { describe, expect, it } from "vitest";
import {
  EYE_HEIGHT,
  LOOK_SENS,
  MAG_SIZE,
  PITCH_LIMIT,
  applyLook,
  applyMove,
  createRun,
  resetRun,
  targetsAlive,
  tickRun,
  tryFire,
  type RunState
} from "../../../examples/neon-corridor-strike/src/rules";

// Headless fire-kill-win sim for the rebuilt Neon Corridor Strike. These
// replace the retired corridor-{los,props,pickups,hit-authority} suites,
// which imported the trashed src/game physics modules; the rebuilt game
// decides hits analytically in examples/neon-corridor-strike/src/rules.ts.

function aimAt(run: RunState, targetId: string): void {
  const target = run.targets.find((candidate) => candidate.id === targetId);
  if (!target) throw new Error(`unknown target ${targetId}`);
  const dx = target.center[0] - run.x;
  const dy = target.center[1] - EYE_HEIGHT;
  const dz = target.center[2] - run.z;
  run.yaw = Math.atan2(-dx, -dz);
  run.pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
}

function fireAndCool(run: RunState) {
  const result = tryFire(run);
  // 0.2 s clears the 0.18 s fire cooldown without finishing a 0.9 s reload.
  tickRun(run, 0.2);
  return result;
}

describe("neon corridor rules — look and move", () => {
  it("applies raw pointer pixels at full sensitivity (125 px = 0.3 rad)", () => {
    const run = createRun();
    applyLook(run, 125, 0);
    expect(Math.abs(run.yaw)).toBeCloseTo(125 * LOOK_SENS, 9);
    expect(Math.abs(run.yaw)).toBeGreaterThanOrEqual(0.3);
  });

  it("clamps pitch to the authored limit", () => {
    const run = createRun();
    applyLook(run, 0, -100_000);
    expect(run.pitch).toBe(PITCH_LIMIT);
    applyLook(run, 0, 100_000);
    expect(run.pitch).toBe(-PITCH_LIMIT);
  });

  it("moves forward down the corridor and clamps at the walls", () => {
    const run = createRun();
    applyMove(run, { forward: 1, strafe: 0, sprint: false }, 1);
    expect(run.z).toBeLessThan(9);
    for (let i = 0; i < 100; i += 1) applyMove(run, { forward: 0, strafe: 1, sprint: true }, 1);
    expect(run.x).toBe(2.2);
  });
});

describe("neon corridor rules — fire, kill, win, reset", () => {
  it("hits the dead-ahead sentry, then kills it on the second hit", () => {
    const run = createRun();
    const first = fireAndCool(run);
    expect(first.fired).toBe(true);
    expect(first.hitTargetId).toBe("sentry-0");
    expect(first.killedTargetId).toBeUndefined();
    expect(run.hits).toBe(1);
    expect(run.ammo).toBe(MAG_SIZE - 1);

    const second = fireAndCool(run);
    expect(second.killedTargetId).toBe("sentry-0");
    expect(run.kills).toBe(1);
    expect(targetsAlive(run)).toBe(4);
    expect(run.status).toBe("playing");
  });

  it("misses when aimed away, and respects the fire cooldown", () => {
    const run = createRun();
    run.yaw = Math.PI;
    const miss = tryFire(run);
    expect(miss.fired).toBe(true);
    expect(miss.hitTargetId).toBeUndefined();
    expect(run.hits).toBe(0);
    const blocked = tryFire(run);
    expect(blocked).toMatchObject({ fired: false, reason: "cooldown" });
    expect(run.shotsFired).toBe(1);
  });

  it("auto-reloads an empty magazine", () => {
    const run = createRun();
    run.yaw = Math.PI;
    for (let i = 0; i < MAG_SIZE; i += 1) fireAndCool(run);
    expect(run.ammo).toBe(0);
    expect(run.reloading).toBe(true);
    tickRun(run, 1);
    expect(run.reloading).toBe(false);
    expect(run.ammo).toBe(MAG_SIZE);
  });

  it("wins when every sentry is down, then reset restores the baseline", () => {
    const run = createRun();
    for (const target of [...run.targets]) {
      aimAt(run, target.id);
      fireAndCool(run);
      aimAt(run, target.id);
      fireAndCool(run);
    }
    expect(run.kills).toBe(5);
    expect(run.status).toBe("won");
    expect(tryFire(run)).toMatchObject({ fired: false, reason: "won" });

    resetRun(run);
    expect(run.resets).toBe(1);
    expect(run.status).toBe("playing");
    expect(run.ammo).toBe(MAG_SIZE);
    expect(run.shotsFired).toBe(0);
    expect(targetsAlive(run)).toBe(5);
    expect(run.x).toBe(0);
    expect(run.z).toBe(9);
  });
});
