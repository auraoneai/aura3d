import { describe, expect, it } from "vitest";
import { bestLine, coachLine, createHudWriter, loadResults, nitroLabel, saveResults } from "../../../examples/roadster-hours-port/hud";
import { DEFAULT_BINDINGS, rebind } from "../../../examples/roadster-hours-port/input";
import { SIM_STEP, createRun, defaultCareer, stepRun, type Run } from "../../../examples/roadster-hours-port/sim";

const career = () => ({ ...defaultCareer(), unlocked: 2 });
function running(): Run {
  const c = career();
  const run = createRun(0, c);
  for (let i = 0; i < 330; i++) stepRun(run, { throttle: 1 }, SIM_STEP, c);
  return run;
}

describe("Saltwind Highway coach line (audit C5)", () => {
  it("shows the act hint early in the run, rewritten for touch and for rebound keys", () => {
    const run = running();
    expect(coachLine(run)).toBe(run.level.acts[0]!.hint);
    expect(coachLine(run, true)).not.toMatch(/\bW\b|A \/ D/);
    expect(coachLine(run, false, rebind(rebind(DEFAULT_BINDINGS, "up", "KeyI"), "left", "KeyJ"))).toMatch(/^I to accelerate · J \/ D to steer/);
  });
  it("puts the nitro window first: PERFECT NITRO is discoverable", () => {
    const run = running();
    run.nitro = 1; run.nitroWindow = true;
    expect(coachLine(run)).toBe("Perfect nitro · tap Shift again");
    expect(coachLine(run, true)).toBe("Perfect nitro · tap Nitro again");
    expect(nitroLabel(run)).toBe("Tap now");
  });
  it("teaches SHOCKWAVE when the tank is full", () => {
    const run = running();
    run.time = 20; run.s = run.level.acts[0]!.s + 200; run.thrust = run.capacity;
    // Away from ramps, gaps and jump lines: find a stretch with no other hint.
    for (let s = 200; s < run.level.length; s += 10) {
      run.s = s;
      const line = coachLine(run);
      if (line.startsWith("Nitro full")) { expect(line).toBe("Nitro full · double-tap Shift for a shockwave"); return; }
    }
    throw new Error("no stretch shows the shockwave hint");
  });
  it("stays quiet while overheated, after a missed relay and outside a run", () => {
    const run = running();
    run.overheated = true;
    expect(coachLine(run)).toBe("");
    run.overheated = false; run.gateMiss = true;
    expect(coachLine(run)).toBe("");
    run.gateMiss = false; run.phase = "paused";
    expect(coachLine(run)).toBe("");
  });
  it("labels nitro levels", () => {
    expect(nitroLabel({ nitro: 0, nitroWindow: false })).toBe("");
    expect(nitroLabel({ nitro: 1, nitroWindow: false })).toBe("Nitro");
    expect(nitroLabel({ nitro: 2, nitroWindow: false })).toBe("Perfect");
    expect(nitroLabel({ nitro: 3, nitroWindow: false })).toBe("Shockwave");
  });
});

describe("Saltwind Highway best times (audit C13)", () => {
  it("round-trips results through storage and ignores broken rows", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    saveResults({ results: { sunbreak: { time: 59.65, score: 21000, medal: "silver", cells: 3 } } }, storage);
    expect(loadResults(storage)).toEqual({ sunbreak: { time: 59.65, score: 21000, medal: "silver", cells: 3 } });
    mem.set("saltwind-highway:results", JSON.stringify({ a: { time: "x" }, b: null }));
    expect(loadResults(storage)).toEqual({});
    expect(loadResults(null)).toEqual({});
  });
  it("describes the time against the previous best", () => {
    expect(bestLine(50, undefined)).toBe("First finish on this route");
    expect(bestLine(48.5, { time: 50, score: 0, medal: "silver", cells: 0 })).toBe("New best · -1.50 s on 0:50.00");
    expect(bestLine(51.25, { time: 50, score: 0, medal: "silver", cells: 0 })).toBe("Best 0:50.00 · +1.25 s");
  });
});

describe("Saltwind Highway HUD writes only changes (audit C14)", () => {
  it("writes text and styles once per change", () => {
    let writes = 0;
    const el = { textContent: "" as string | null, style: { setProperty: () => { writes++; } } };
    const proxy = new Proxy(el, { set(t, k, v) { if (k === "textContent") writes++; (t as Record<string | symbol, unknown>)[k] = v; return true; } });
    const hud = createHudWriter(() => proxy);
    hud.text("a", "1"); hud.text("a", "1"); hud.text("a", "2");
    hud.style("a", "width", "5%"); hud.style("a", "width", "5%");
    expect(writes).toBe(3);
  });
});
