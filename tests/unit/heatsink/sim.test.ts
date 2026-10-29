/**
 * Thermal Drift (`heatsink`) simulation: the audit rows that live in the sim (docs/audits/sections/game-03-heatsink.md).
 */
import { describe, expect, it } from "vitest";
import { CIRCUITS, SCENERY_ANCHORS, TOTAL_LAPS, WALL_LIMIT } from "../../../apps/showcase-heatsink/src/data";
import {
  autopilot,
  createRace,
  DRAWN_RIVALS,
  ghostDelta,
  RESPAWN_PENALTY,
  RESPAWN_SECONDS,
  STEP,
  stepRace,
  type Action,
  type RaceState,
  type SimEvent,
  type SimInput
} from "../../../apps/showcase-heatsink/src/sim";

const idle: SimInput = { steer: 0, pitch: 0, boost: false, fire: false };

function run(state: RaceState, seconds: number, drive: (s: RaceState) => { input: SimInput; actions?: readonly Action[] } = () => ({ input: idle }), onEvent?: (e: SimEvent, s: RaceState) => void): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps && state.phase !== "results"; i += 1) {
    const d = drive(state);
    stepRace(state, d.input, d.actions ?? []);
    if (onEvent) for (const e of state.events) onEvent(e, state);
  }
}
const auto = (s: RaceState) => autopilot(s);
const toRacing = (s: RaceState) => run(s, 3.05);

describe("heatsink sim: boot values and countdown (C15, C23)", () => {
  it("starts with zero takedowns, no stored best lap, no held item, and a 3-2-1-GO countdown", () => {
    const s = createRace({ circuit: "grand", mode: "race", drone: "orion" });
    expect(s.takedowns).toBe(0);
    expect(s.bestLap).toBeNull();
    expect(s.player.item).toBeNull();
    expect(s.phase).toBe("countdown");
    const seen: string[] = [];
    run(s, 3.2, undefined, (e) => { if (e.type === "countdown") seen.push(String(e.value)); if (e.type === "go") seen.push("GO"); });
    expect(seen).toEqual(["3", "2", "1", "GO"]);
    expect(s.phase).toBe("racing");
  });
  it("does not move anyone before GO", () => {
    const s = createRace({ circuit: "grand", mode: "race", drone: "orion" });
    const before = [s.player.progress, ...s.rivals.map((r) => r.progress)];
    run(s, 2.9, () => ({ input: { steer: 1, pitch: 1, boost: true, fire: true } }));
    expect([s.player.progress, ...s.rivals.map((r) => r.progress)]).toEqual(before);
  });
});

describe("heatsink sim: the race finishes (C1)", () => {
  it("ends after lap 3 with results instead of wrapping the lap counter", () => {
    const s = createRace({ circuit: "grand", mode: "race", drone: "orion", seed: 7 });
    const laps: number[] = [];
    run(s, 400, auto, (e) => { if (e.type === "lap") laps.push(e.lap); });
    expect(laps).toEqual([1, 2, 3]);
    expect(s.phase).toBe("results");
    expect(s.result).not.toBeNull();
    expect(s.result!.outcome).toBe("finished");
    expect(s.result!.lapTimes).toHaveLength(TOTAL_LAPS);
    expect(s.result!.position).toBeGreaterThanOrEqual(1);
    expect(s.result!.position).toBeLessThanOrEqual(12);
    expect(s.result!.bestLap).toBe(Math.min(...s.result!.lapTimes));
    // The sim is frozen on the results screen.
    const frozen = s.player.progress;
    stepRace(s, idle);
    expect(s.player.progress).toBe(frozen);
  });
  it("finishes on every circuit and drone the menus offer", () => {
    for (const circuit of ["grand", "dustfall", "vesper"] as const) {
      const s = createRace({ circuit, mode: "race", drone: circuit === "grand" ? "bastion" : "volt", seed: 3 });
      run(s, 400, auto);
      expect(s.phase, circuit).toBe("results");
    }
  });
});

describe("heatsink sim: the player can be damaged and lose (C2)", () => {
  it("rivals in range fire missiles at the player, and the INCOMING warning shows", () => {
    const s = createRace({ circuit: "grand", mode: "race", drone: "volt", seed: 11 });
    toRacing(s);
    let incoming = 0;
    run(s, 15, undefined, (e) => { if (e.type === "incoming") incoming++; });
    expect(incoming).toBeGreaterThan(0);
  });
  it("a missile that is not evaded drains the shield, then the hull (scaled by armour)", () => {
    const s = createRace({ circuit: "grand", mode: "race", drone: "volt", seed: 11 });
    toRacing(s);
    s.player.shield = 10;
    s.incoming.active = true; s.incoming.from = 0; s.incoming.eta = STEP / 2; s.incoming.total = 1.5;
    const sources: string[] = [];
    run(s, STEP, undefined, (e) => { if (e.type === "damage") sources.push(e.source); });
    expect(sources).toEqual(["missile"]);
    expect(s.player.shield).toBe(0);
    // 30 damage, 10 absorbed, 20 x (1.25 - 3 x 0.06) for the light VOLT frame.
    expect(s.player.hull).toBeCloseTo(100 - 20 * 1.07, 1);
  });
  it("a barrel roll during the warning evades the missile", () => {
    const s = createRace({ circuit: "grand", mode: "race", drone: "orion", seed: 11 });
    toRacing(s);
    let evaded = 0, hits = 0;
    run(s, 90, (st) => ({ input: idle, actions: st.incoming.active && st.incoming.eta < 0.5 ? ["roll"] : [] }), (e) => { if (e.type === "evaded") evaded++; if (e.type === "damage" && e.source === "missile") hits++; });
    expect(evaded).toBeGreaterThan(0);
    expect(hits).toBe(0);
  });
  it("hull 0 destroys the drone; it respawns after a delay with a position penalty", () => {
    const s = createRace({ circuit: "grand", mode: "race", drone: "orion", seed: 1 });
    toRacing(s);
    run(s, 5);
    s.player.shield = 0;
    s.player.hull = 1;
    s.incoming.active = true; s.incoming.from = 0; s.incoming.eta = STEP / 2; s.incoming.total = 1;
    const events: string[] = [];
    run(s, STEP, undefined, (e) => events.push(e.type));
    expect(events).toContain("destroyed");
    const downAt = s.player.progress;
    run(s, RESPAWN_SECONDS + 0.1, undefined, (e) => events.push(e.type));
    expect(events).toContain("respawn");
    expect(s.player.hull).toBe(100);
    // Set back RESPAWN_PENALTY metres, then 0.1 s of flight after the respawn.
    expect(s.player.progress).toBeGreaterThan(downAt - RESPAWN_PENALTY);
    expect(s.player.progress).toBeLessThan(downAt - RESPAWN_PENALTY + 5);
  });
  it("scraping the wall costs speed and heat, and fires one event per contact", () => {
    const make = () => { const s = createRace({ circuit: "grand", mode: "trial", drone: "orion", seed: 1 }); toRacing(s); run(s, 4); return s; };
    const wall = make(), centre = make();
    let scrapes = 0;
    run(wall, 1.5, () => ({ input: { ...idle, steer: 1 } }), (e) => { if (e.type === "scrape") scrapes++; });
    run(centre, 1.5, () => ({ input: idle }));
    expect(wall.player.x).toBeCloseTo(WALL_LIMIT, 5);
    expect(scrapes).toBe(1);
    expect(wall.player.speedKmh).toBeLessThan(centre.player.speedKmh);
    expect(wall.player.heat).toBeGreaterThan(centre.player.heat);
  });
});

describe("heatsink sim: real race position (C3)", () => {
  it("ranks by progress over the whole field, from P1 to P12", () => {
    const s = createRace({ circuit: "grand", mode: "race", drone: "orion" });
    toRacing(s);
    for (const r of s.rivals) r.progress = s.player.progress + 50;
    run(s, STEP);
    expect(s.position).toBe(12);
    for (const r of s.rivals) r.progress = s.player.progress - 50;
    run(s, STEP);
    expect(s.position).toBe(1);
    s.rivals.forEach((r, i) => { r.progress = s.player.progress + (i < 6 ? 40 : -40); });
    run(s, STEP);
    expect(s.position).toBe(7);
  });
  it("never teleports rivals: progress only grows", () => {
    const s = createRace({ circuit: "dustfall", mode: "race", drone: "orion", seed: 5 });
    let last = s.rivals.map((r) => r.progress);
    let worst = 0;
    run(s, 120, auto, () => undefined);
    // Re-run step by step to watch every step.
    const t = createRace({ circuit: "dustfall", mode: "race", drone: "orion", seed: 5 });
    last = t.rivals.map((r) => r.progress);
    for (let i = 0; i < 60 * 120 && t.phase !== "results"; i++) {
      const a = autopilot(t);
      stepRace(t, a.input, a.actions);
      t.rivals.forEach((r, k) => { worst = Math.min(worst, r.progress - last[k]!); last[k] = r.progress; });
    }
    expect(worst).toBeGreaterThanOrEqual(0);
  });
  it("time trial has no rivals and a field of one", () => {
    const s = createRace({ circuit: "grand", mode: "trial", drone: "orion" });
    expect(s.rivals).toHaveLength(0);
    toRacing(s);
    expect(s.field).toBe(1);
    expect(s.position).toBe(1);
  });
});

describe("heatsink sim: mine and ghost (C9)", () => {
  it("a rival crossing a dropped mine is hit", () => {
    const s = createRace({ circuit: "grand", mode: "race", drone: "orion", seed: 2 });
    toRacing(s);
    run(s, 3, auto);
    s.player.mineCooldown = 0;
    const r = s.rivals[0]!;
    r.progress = s.player.progress - 12; r.x = s.player.x; r.speedKmh = 700; r.respawn = 0;
    for (const o of s.rivals) if (o !== r) o.progress = s.player.progress + 400;
    const hull = r.hull;
    let hit = false;
    run(s, STEP, () => ({ input: idle, actions: ["mine"] }));
    run(s, 1.5, () => ({ input: idle }), (e) => { if (e.type === "takedown" && e.by === "mine") hit = true; });
    expect(s.mine.active).toBe(false);
    expect(hit || r.hull < hull).toBe(true);
  });
  it("records a best-lap trace and diffs the next run against it", () => {
    const first = createRace({ circuit: "vesper", mode: "trial", drone: "spectre", seed: 9 });
    run(first, 400, auto);
    expect(first.ghost).not.toBeNull();
    expect(first.ghost!.samples.length).toBeGreaterThan(CIRCUITS.vesper.length / 10 - 2);
    const again = createRace({ circuit: "vesper", mode: "trial", drone: "spectre", seed: 9, ghost: first.ghost, bestLap: first.bestLap });
    const deltas: number[] = [];
    for (let i = 0; i < 60 * 60 && again.phase !== "results"; i++) {
      const a = autopilot(again);
      stepRace(again, a.input, a.actions);
      if (again.lapsDone === 1) { const d = ghostDelta(again); if (d !== null) deltas.push(d); }
    }
    expect(deltas.length).toBeGreaterThan(100);
    // Same pilot, same seed: the delta stays within a second of the ghost (it is not a sine wave any more).
    expect(Math.max(...deltas.map(Math.abs))).toBeLessThan(1.5);
  });
});

describe("heatsink sim: elimination (C10)", () => {
  it("eliminates the last-placed racer, not the first in the array", () => {
    const s = createRace({ circuit: "grand", mode: "elim", drone: "orion" });
    toRacing(s);
    s.rivals.forEach((r, i) => { r.progress = s.player.progress + 100 + i; });
    s.rivals[7]!.progress = s.player.progress - 0.5 + 100; // still ahead of the player
    s.player.progress -= 0; // player behind everyone -> player is last
    s.elimTimer = STEP / 2;
    const out: string[] = [];
    run(s, STEP, undefined, (e) => { if (e.type === "eliminated") out.push(e.name); });
    expect(out).toEqual(["YOU"]);
    expect(s.phase).toBe("results");
    expect(s.result!.outcome).toBe("eliminated");
  });
  it("eliminates the last rival when the player is ahead, and the player wins when one is left", () => {
    const s = createRace({ circuit: "grand", mode: "elim", drone: "orion" });
    toRacing(s);
    s.rivals.forEach((r, i) => { r.progress = s.player.progress - 10 - i * 5; });
    const lastName = s.rivals[10]!.name;
    s.elimTimer = STEP / 2;
    const out: string[] = [];
    run(s, STEP, undefined, (e) => { if (e.type === "eliminated") out.push(e.name); });
    expect(out).toEqual([lastName]);
    for (const r of s.rivals) r.eliminated = r.index !== 0;
    s.rivals[0]!.progress = s.player.progress - 30;
    s.elimTimer = STEP / 2;
    run(s, STEP);
    expect(s.result?.outcome).toBe("won");
  });
  it("starts every mode with a fresh elimination state", () => {
    const s = createRace({ circuit: "grand", mode: "race", drone: "orion" });
    expect(s.rivals.every((r) => !r.eliminated)).toBe(true);
    expect(s.elimTimer).toBe(20);
  });
});

describe("heatsink sim: pickups once per pass (C14)", () => {
  it("a boost pad applies once per copy no matter how many steps the drone spends on it", () => {
    const s = createRace({ circuit: "grand", mode: "trial", drone: "orion" });
    toRacing(s);
    const pad = SCENERY_ANCHORS.find((a) => a.kind === "boost")!;
    let boosts = 0;
    run(s, 40, (st) => ({ input: { ...idle, steer: Math.max(-1, Math.min(1, (pad.lateralX - st.player.x) * 0.5)) } }), (e) => { if (e.type === "pickup" && e.kind === "boost") boosts++; });
    const copies = Math.floor((s.player.progress - pad.s) / pad.period) + 1;
    expect(boosts).toBeGreaterThan(0);
    expect(boosts).toBeLessThanOrEqual(copies);
  });
});

describe("heatsink sim: weapons touch drawn rivals only (C17)", () => {
  it("draws at most six rivals, nearest first, and the shockwave spares the undrawn ones", () => {
    const s = createRace({ circuit: "grand", mode: "race", drone: "orion" });
    toRacing(s);
    run(s, 2, auto);
    s.rivals.forEach((r, i) => { r.progress = s.player.progress + 2 + i * 2; r.x = s.player.x; r.respawn = 0; r.hull = 100; });
    s.player.shockCooldown = 0;
    run(s, STEP, () => ({ input: idle, actions: ["shock"] }));
    expect(s.drawn.length).toBeLessThanOrEqual(DRAWN_RIVALS);
    const hit = s.rivals.filter((r) => r.hull < 100 || r.respawn > 0).map((r) => r.index);
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.length).toBeLessThanOrEqual(DRAWN_RIVALS);
    for (const r of s.rivals.slice(DRAWN_RIVALS)) expect(r.hull, r.name).toBe(100);
  });
});

describe("heatsink sim: determinism", () => {
  it("replays exactly from the seed and the inputs", () => {
    const a = createRace({ circuit: "dustfall", mode: "race", drone: "razor", seed: 42 });
    const b = createRace({ circuit: "dustfall", mode: "race", drone: "razor", seed: 42 });
    run(a, 60, auto);
    run(b, 60, auto);
    expect(JSON.stringify({ p: a.player, r: a.rivals, t: a.takedowns })).toBe(JSON.stringify({ p: b.player, r: b.rivals, t: b.takedowns }));
  });
});
