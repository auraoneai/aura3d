import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FLOORS, KILL_HOUSE } from "../../../apps/showcase-bunker-zero/src/maps";
import { captureLoadout, createSim, defaultLoadout, type Loadout, type Sim } from "../../../apps/showcase-bunker-zero/src/sim";
import { autopilotInput, createAutopilot } from "../../../apps/showcase-bunker-zero/src/autopilot";
import {
  AUTOPLAY_RESULTS_HOLD, AUTOPLAY_TOGGLE_KEY, DEFAULT_BINDINGS, PENDING_DEATH, autoplayRequested, floorOutcome, pendingAfter, type PendingKind
} from "../../../apps/showcase-bunker-zero/src/flow";

// Owner addendum 2 (2026-11-18): `?autoplay=1` plays hands-free and loops forever. This driver mirrors main.ts's
// checkOutcome / tickPending / runPending / showResults with the real sim and the real autopilot (no renderer).
const MAIN = readFileSync(path.resolve("apps/showcase-bunker-zero/src/main.ts"), "utf8");
const DT = 1 / 60;

function autoRun(startFloor: number) {
  let floorIdx = startFloor;
  let mode: "descent" | "killhouse" = "descent";
  let entry: Loadout = defaultLoadout();
  const mk = () => createSim(mode === "killhouse" ? KILL_HOUSE : FLOORS[floorIdx]!, {
    ox: 0, mode, seed: 1337 + floorIdx * 97 + (mode === "killhouse" ? 7 : 0), loadout: entry
  });
  let sim: Sim = mk();
  let pilot = createAutopilot();
  let pending: { kind: PendingKind; t: number } | null = null;
  let outcomeHandled = false, campaignDone = false;
  const log = { cleared: 0, deaths: 0, results: 0, newRuns: 0, maxScore: 0, maxStill: 0, floorsSeen: new Set<number>([startFloor]) };
  let stillT = 0, lastX = sim.state.player.x, lastZ = sim.state.player.z, lastProgress = "";
  const start = (idx: number, loadout?: Loadout, newRun = false) => {
    floorIdx = idx; mode = "descent"; pending = null; outcomeHandled = false; campaignDone = false;
    entry = loadout ?? (newRun ? defaultLoadout() : entry);
    sim = mk(); pilot = createAutopilot();
    log.floorsSeen.add(idx);
    lastX = sim.state.player.x; lastZ = sim.state.player.z; stillT = 0;
  };
  const step = () => {
    if (!campaignDone) sim.tick(DT, autopilotInput(pilot, sim, DT));
    log.maxScore = Math.max(log.maxScore, sim.state.score);
    // checkOutcome
    if (sim.state.finished && !outcomeHandled) {
      outcomeHandled = true;
      const outcome = floorOutcome(sim, floorIdx);
      if (outcome === "floor-cleared" || outcome === "campaign-complete") log.cleared++;
      pending = pendingAfter(outcome);
    } else if (!sim.state.player.alive && !sim.state.finished && !pending) {
      log.deaths++;
      pending = { ...PENDING_DEATH };
    }
    // tickPending → runPending
    if (pending && (pending.t -= DT) <= 0) {
      const job = pending.kind;
      pending = null;
      if (job === "retry") start(floorIdx, entry);
      else if (job === "next") start(floorIdx + 1, captureLoadout(sim));
      else if (job === "to-descent") { start(0, undefined, true); log.newRuns++; }
      else if (job === "results") { campaignDone = true; log.results++; pending = { kind: "to-descent", t: AUTOPLAY_RESULTS_HOLD }; }
    }
    // stuck watch: while a floor is in play, the pilot moves or makes progress (kills, score, pickups) at least every 5 s
    const s = sim.state;
    const progress = `${s.kills}|${s.score}|${s.pickups.filter((k) => k.taken).length}|${s.player.hp}`;
    const moved = Math.hypot(s.player.x - lastX, s.player.z - lastZ) > 0.25;
    if (campaignDone || pending || moved || progress !== lastProgress) { stillT = 0; lastX = s.player.x; lastZ = s.player.z; lastProgress = progress; }
    else stillT += DT;
    log.maxStill = Math.max(log.maxStill, stillT);
  };
  return { step, log, get floorIdx() { return floorIdx; }, get campaignDone() { return campaignDone; } };
}

describe("bunker zero ?autoplay=1", () => {
  it("boots the pilot from ?autoplay=1, the ?autopilot=1 alias and ?demo; O toggles it without clashing with a binding", () => {
    expect(autoplayRequested(new URLSearchParams("autoplay=1"))).toBe(true);
    expect(autoplayRequested(new URLSearchParams("autopilot=1"))).toBe(true);
    expect(autoplayRequested(new URLSearchParams("demo"))).toBe(true);
    expect(autoplayRequested(new URLSearchParams("autoplay=0"))).toBe(false);
    expect(autoplayRequested(new URLSearchParams(""))).toBe(false);
    expect(Object.values(DEFAULT_BINDINGS).flat()).not.toContain(AUTOPLAY_TOGGLE_KEY);
    expect(MAIN).toContain("let autoPilot = autoplayRequested(bootParams) || DEMO;");
    // the intro card is skipped under the pilot, and the results panel hands back to a fresh run
    expect(MAIN).toMatch(/if \(!DEMO && !autoPilot && !BOOT_FLOOR && store\.get\("bz-intro-seen"\) !== "1"\)/);
    expect(MAIN).toMatch(/if \(autoPilot \|\| DEMO\) pending = \{ kind: "to-descent", t: AUTOPLAY_RESULTS_HOLD, age: 0 \};/);
    expect(MAIN).toContain("pending = { ...pendingAfter(outcome), age: 0 };");
  });

  it("plays from floor 1 for 5 simulated minutes: clears floors, scores, never stands still 5 s", () => {
    const run = autoRun(0);
    for (let i = 0; i < 300 * 60; i++) run.step();
    expect(run.log.cleared).toBeGreaterThanOrEqual(1);
    expect(run.log.maxScore).toBeGreaterThan(0);
    expect(run.log.floorsSeen.size).toBeGreaterThanOrEqual(2);
    expect(run.log.maxStill).toBeLessThan(5);
  });

  it("after the last floor it shows results ~3 s, then starts a new run from floor 1 and keeps playing", () => {
    const run = autoRun(FLOORS.length - 1);
    let resultsAt = -1, restartAt = -1;
    for (let i = 0; i < 900 * 60 && restartAt < 0; i++) {
      run.step();
      if (resultsAt < 0 && run.campaignDone) resultsAt = i;
      if (resultsAt >= 0 && run.log.newRuns > 0) restartAt = i;
    }
    expect(run.log.results).toBe(1);
    expect(restartAt).toBeGreaterThan(resultsAt);
    expect((restartAt - resultsAt) * DT).toBeCloseTo(AUTOPLAY_RESULTS_HOLD, 1);
    expect(run.floorIdx).toBe(0);
    for (let i = 0; i < 60 * 60; i++) run.step();
    expect(run.campaignDone).toBe(false);
    expect(run.log.maxStill).toBeLessThan(5);
  });
});
