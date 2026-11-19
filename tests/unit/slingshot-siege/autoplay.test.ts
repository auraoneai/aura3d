// Autoplay (`?autoplay=1`): the route's autopilot drives the real Rapier-backed SiegeSim hands-free (harness:
// ./autoplay-harness.ts runs the same flow main.ts runs). Real-GPU audit 2026-11-19: the old open-loop aim failed
// level 1 with 3 shots and a raider left and moved on anyway. The autopilot now searches every shot against the live
// sim (./autopilot.ts `AimPlanner`), clears levels the normal way, holds the result card ~3 s, then Next (or Try Again
// once on a fail). The campaign sweep (every level within its shot budget) is split over autoplay-campaign-*.test.ts.
import { describe, expect, it } from "vitest";
import { LEVELS } from "../../../apps/showcase-slingshot-siege/src/game/levels";
import { SiegeSim } from "../../../apps/showcase-slingshot-siege/src/game/sim";
import { DECOR_COLLIDERS } from "../../../apps/showcase-slingshot-siege/src/game/decorLayout";
import { FLY_CAP_S, RESULT_HOLD_S, RETRIES, AimPlanner, planShot } from "../../../apps/showcase-slingshot-siege/src/game/autopilot";
import { runAutoplay } from "./autoplay-harness";

describe("slingshot-siege autoplay", () => {
  it("clears level 1, holds the result card ~3 s, advances, clears level 2 and loops, never idling 5 s", async () => {
    const run = await runAutoplay([LEVELS[0]!, LEVELS[1]!], { seconds: 60 });
    console.log("autoplay 60 s over levels 1-2:", JSON.stringify(run));
    expect(run.results.length).toBeGreaterThanOrEqual(2);
    expect(run.results[0]).toMatchObject({ level: 0, won: true });
    expect(run.results[0]!.shots).toBeLessThanOrEqual(LEVELS[0]!.ammo.length);
    expect(run.results[1]).toMatchObject({ level: 1, won: true });
    // The card stays up RESULT_HOLD_S (one frame of slack) before Next.
    for (const r of run.results.filter((x) => x.heldS >= 0)) {
      expect(r.heldS).toBeGreaterThanOrEqual(RESULT_HOLD_S);
      expect(r.heldS).toBeLessThan(RESULT_HOLD_S + 0.1);
    }
    expect(run.retries).toBe(0);
    expect(run.gullsSquashed).toBeGreaterThanOrEqual(3);
    expect(run.wrapped).toBe(true);
    expect(run.longestIdle).toBeLessThan(5);
  }, 1_800_000);

  it("the aim search is time-sliced and deterministic", () => {
    const sim = new SiegeSim({ level: LEVELS[0]!, seed: 7, decor: DECOR_COLLIDERS });
    const sliced = new AimPlanner(sim, "pebble");
    let calls = 0;
    while (!sliced.step(0)) calls += 1;
    expect(calls).toBeGreaterThan(3);
    const whole = planShot(sim, "pebble");
    expect(sliced.best()).toEqual(whole);
    expect(whole.kills).toBeGreaterThanOrEqual(1);
  });

  it("result card holds about 3 s, a failed level is retried once, and a shot is abandoned before it can stall", () => {
    expect(RESULT_HOLD_S).toBeGreaterThanOrEqual(2.5);
    expect(RESULT_HOLD_S).toBeLessThanOrEqual(3.5);
    expect(RETRIES).toBe(1);
    expect(FLY_CAP_S).toBeLessThan(10);
  });
});
