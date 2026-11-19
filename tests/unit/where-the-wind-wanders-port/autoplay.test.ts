/**
 * Autoplay (`?autoplay=1` / `?autopilot=1`, key O): the computer walks the real sim to every letter and the bell through
 * the normal input path, against the live scene colliders, then the session shows the result, plays the voyage and
 * restarts — looping forever. Normal play and the reference replays are untouched (the pilot only produces FrameInputs).
 */
import { describe, expect, it } from "vitest";
import { createAutopilot, createAutoplaySession, type AutoplayPhase } from "../../../examples/where-the-wind-wanders-port/autopilot";
import { buildSceneColliders } from "../../../examples/where-the-wind-wanders-port/colliders";
import { buildScenery } from "../../../examples/where-the-wind-wanders-port/scenery";
import { RAILS, VIRTUAL_STEP_MS, createState, stepFrame, type WindState } from "../../../examples/where-the-wind-wanders-port/sim";

const live = buildSceneColliders(buildScenery(4242, { bell: true, cottage: true, trees: true, stones: true, shrubs: true }), { modelSet: true, stones: true, idol: true });
const dt = VIRTUAL_STEP_MS / 1000;

describe("Bellkeeper autoplay", () => {
  it.each([["live scene colliders", live.rails], ["original rails", RAILS]] as const)("walks to all three letters and rings the bell (%s), never stalling 5 s", { timeout: 120_000 }, (_n, rails) => {
    const s = createState();
    const pilot = createAutopilot();
    let still = 0, worstStill = 0, f = 0;
    const firsts: number[] = [];
    for (; f < 150 / dt && !s.complete; f++) {
      const before = { ...s.pos };
      stepFrame(s, pilot.next(s, dt), VIRTUAL_STEP_MS, rails);
      const moved = Math.hypot(s.pos.x - before.x, s.pos.z - before.z) > 1e-4;
      still = moved || s.messages.length ? 0 : still + dt;
      worstStill = Math.max(worstStill, still);
      if (s.found.length > firsts.length) firsts.push(f * dt);
    }
    expect(s.found).toEqual([0, 1, 2]);
    expect(s.complete).toBe(true);
    expect(f * dt).toBeLessThan(90);
    expect(worstStill).toBeLessThan(5);
    expect(firsts[0]!).toBeGreaterThan(0);
  });

  it("after the bell: ~3 s of results, the voyage, then a restart; the next walk completes too (loops)", { timeout: 120_000 }, () => {
    let s: WindState = createState();
    const pilot = createAutopilot();
    const session = createAutoplaySession({ resultsSeconds: 3, voyageSeconds: 9 });
    const phases: AutoplayPhase[] = [];
    let restarts = 0;
    for (let f = 0; f < 260 / dt && restarts < 2; f++) {
      stepFrame(s, s.complete ? { keys: "", act: null } : pilot.next(s, dt), VIRTUAL_STEP_MS, live.rails);
      const p = session.tick(s, dt);
      if (phases.at(-1) !== p) phases.push(p);
      if (p === "restart") { restarts++; s = createState(); pilot.reset(); }
    }
    expect(restarts).toBe(2);
    expect(phases.slice(0, 5)).toEqual(["walk", "results", "voyage", "restart", "walk"]);
  });
});
