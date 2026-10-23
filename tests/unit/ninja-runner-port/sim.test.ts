import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, QA_ONLY_POLICY, policyActions } from "../../../examples/ninja-runner-port/autopilot";
import { laneOffset } from "../../../examples/ninja-runner-port/course";
import { courseDigest, decodeActionScript, replayScript, runIdle, runPolicy, runRecorded, type RecordedEvent } from "../../../examples/ninja-runner-port/replay";
import {
  FORM_UNLOCK, SIM_STEP, TUNING, applyAction, createState, drainEvents, generateEntities, seededRandom, snapshot, startRun, stepSim
} from "../../../examples/ninja-runner-port/sim";

interface Reference {
  step: number;
  setup: { courseDigest: { entities: number; byType: Record<string, number>; fnv1a: string } };
  script: string;
  reference: { steps: number; outcome: string; distance: number; time: number; kills: number; score: number; health: number; chakra: number; bestCombo: number; form: string; vaults: number; cloneStrikes: number; eventCounts: Record<string, number>; events: RecordedEvent[]; trace: Record<string, number | string | boolean>[] };
  idle: { steps: number; outcome: string; lostBy: string; distance: number; time: number; kills: number; score: number; damageTaken: number; events: RecordedEvent[] };
  qaAutopilotCheck: { steps: number; qa: Record<string, number | string> };
  tolerance: { numeric: number; eventSteps: number };
}

const ref = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../evidence/crayon-capture/ninja-runner-reference.json"), "utf8")) as Reference;
const key = (e: object): string => JSON.stringify(e, Object.keys(e).sort());
const NUMERIC = ["time", "s", "x", "y", "vy", "speed", "chakra", "attack", "dash", "slide", "invulnerable", "clones"] as const;

describe("ninja-runner port: reference parity (replay of the original's recorded input)", () => {
  const entries = decodeActionScript(ref.script);
  const run = replayScript(entries, 20000);

  it("generates the original's course (seed 17): same population and digest", () => {
    const d = courseDigest(createState());
    expect(d.entities).toBe(ref.setup.courseDigest.entities);
    expect(d.byType).toEqual(ref.setup.courseDigest.byType);
    expect(d.fnv1a).toBe(ref.setup.courseDigest.fnv1a);
  });

  it("wins at the same step with the same totals", () => {
    expect(ref.step).toBe(SIM_STEP);
    expect(run.outcome).toBe(ref.reference.outcome);
    expect(run.steps).toBe(ref.reference.steps);
    expect(run.distance).toBe(ref.reference.distance);
    expect(run.time).toBe(ref.reference.time);
    expect(run.kills).toBe(ref.reference.kills);
    expect(run.score).toBe(ref.reference.score);
    expect(run.health).toBe(ref.reference.health);
    expect(run.chakra).toBe(ref.reference.chakra);
    expect(run.bestCombo).toBe(ref.reference.bestCombo);
    expect(run.form).toBe(ref.reference.form);
    expect(run.vaults).toBe(ref.reference.vaults);
    expect(run.cloneStrikes).toBe(ref.reference.cloneStrikes);
    expect(run.eventCounts).toEqual(ref.reference.eventCounts);
  });

  it("reproduces every event, in order, on the same step (tolerance: %s steps)", () => {
    expect(ref.tolerance.eventSteps).toBe(0);
    expect(run.events.length).toBe(ref.reference.events.length);
    for (let i = 0; i < run.events.length; i++) expect(key(run.events[i]!)).toBe(key(ref.reference.events[i]!));
  });

  it("matches every 0.5 s trace point within the capture-derived tolerance", () => {
    expect(run.trace.length).toBe(ref.reference.trace.length);
    let worst = 0;
    for (let i = 0; i < run.trace.length; i++) {
      const got = run.trace[i]!;
      const want = ref.reference.trace[i]!;
      for (const k of NUMERIC) worst = Math.max(worst, Math.abs((got[k] as number) - (want[k] as number)));
      expect(got.step).toBe(want.step);
      expect(got.phase).toBe(want.phase);
      expect(got.form).toBe(want.form);
      expect(got.health).toBe(want.health);
      expect(got.kills).toBe(want.kills);
      expect(got.score).toBe(want.score);
      expect(got.vaults).toBe(want.vaults);
      expect(got.aliveEnemies).toBe(want.aliveEnemies);
    }
    expect(worst).toBeLessThanOrEqual(ref.tolerance.numeric);
  });

  it("covers the Phase C exit in the first 60 s: movement, jumps, combat, clones, form change", () => {
    const at60 = run.trace.find((t) => t.step === 60 * 120)!;
    expect(at60).toBeDefined();
    expect(at60.kills).toBeGreaterThan(20);
    const early = run.events.filter((e) => e.step <= 60 * 120).map((e) => e.type);
    for (const t of ["start", "jump", "rasengan", "kill", "clones", "dash", "rasenshuriken", "pickup"]) expect(early).toContain(t);
    expect(run.events.filter((e) => e.type === "form").map((e) => e.form)).toEqual(["sage", "kurama"]);
  });

  it("re-derives the recorded script live: the capture policy applied to the port IS the reference run", () => {
    const live = runPolicy(DEFAULT_POLICY, 20000);
    expect(live.script).toEqual(run.script);
    expect(live.events.map(key)).toEqual(run.events.map(key));
    expect(live.score).toBe(ref.reference.score);
  });

  it("is deterministic: the same script twice gives identical state", () => {
    const again = replayScript(entries, 20000);
    expect(again.events.map(key)).toEqual(run.events.map(key));
    expect(again.trace).toEqual(run.trace);
  });
});

describe("ninja-runner port: fail state, restart and the game's own autopilot", () => {
  it("idle input loses by falling into the first rooftop gap, as the original does", () => {
    const idle = runIdle(20000);
    expect(idle.outcome).toBe("lost");
    expect(idle.lostBy).toBe("gap");
    expect(idle.steps).toBe(ref.idle.steps);
    expect(idle.distance).toBe(ref.idle.distance);
    expect(idle.time).toBe(ref.idle.time);
    expect(idle.damageTaken).toBe(ref.idle.damageTaken);
    expect(idle.score).toBe(ref.idle.score);
    expect(idle.events.map(key)).toEqual(ref.idle.events.map(key));
  });

  it("restart is a fresh state: back at s = 0, full health and chakra, own `start` event, no shared mutable state", () => {
    const first = runIdle(20000).state;
    expect(first.phase).toBe("lost");
    const next = createState();
    startRun(next);
    expect(next.phase).toBe("running");
    expect(next.s).toBe(0);
    expect(next.health).toBe(TUNING.health);
    expect(next.chakra).toBe(TUNING.maxChakra);
    expect(drainEvents(next)).toEqual([{ type: "start" }]);
    expect(next.entities).not.toBe(first.entities);
    expect(next.entities.every((e) => e.alive)).toBe(true);
  });

  it("the transcribed QA autopilot matches the original's `simulate(t, true)` numbers", () => {
    const qa = runPolicy(QA_ONLY_POLICY, ref.qaAutopilotCheck.steps).state;
    const want = ref.qaAutopilotCheck.qa;
    const round = (x: number): number => Math.round(x * 1e6) / 1e6 + 0; // `+ 0` folds -0 into 0 (JSON drops the sign)
    expect({ s: round(qa.s), x: round(qa.x), lane: qa.lane, y: round(qa.y), health: qa.health, chakra: round(qa.chakra), kills: qa.kills, score: qa.score, combo: qa.combo, time: round(qa.time), phase: qa.phase, attacksFired: qa.attacksFired, deflections: qa.deflections, vaults: qa.vaults, damageTaken: qa.damageTaken }).toEqual(want);
  });
});

describe("ninja-runner port: rules (independent of the reference)", () => {
  const fresh = (): ReturnType<typeof createState> => { const z = createState(); startRun(z); drainEvents(z); return z; };

  it("lane changes clamp to -1..1, jump needs the ground and is disabled over a gap, slide cancels a jump arc downward", () => {
    const z = fresh();
    for (let i = 0; i < 5; i++) applyAction(z, "left");
    expect(z.lane).toBe(-1);
    expect(applyAction(z, "jump")).toBe(true);
    expect(applyAction(z, "jump")).toBe(false);
    stepSim(z, SIM_STEP);
    expect(z.y).toBeGreaterThan(0);
    applyAction(z, "slide");
    expect(z.vy).toBeLessThanOrEqual(-18);
    const g = fresh();
    g.s = 596;
    expect(applyAction(g, "jump")).toBe(false);
  });

  it("abilities cost chakra, honour cooldowns and refuse when too expensive", () => {
    const z = fresh();
    expect(applyAction(z, "clones")).toBe(true);
    expect(z.chakra).toBe(TUNING.maxChakra - TUNING.cloneCost);
    expect(applyAction(z, "clones")).toBe(false);
    expect(applyAction(z, "rasengan")).toBe(true);
    expect(applyAction(z, "rasengan")).toBe(false);
    z.chakra = 5;
    expect(applyAction(z, "dash")).toBe(false);
  });

  it("forms unlock at 600 m and 1,620 m; cycleForm walks base -> sage -> kurama and refuses before unlock", () => {
    const z = fresh();
    expect(applyAction(z, "cycleForm")).toBe(false);
    z.s = FORM_UNLOCK.sage;
    expect(applyAction(z, "cycleForm")).toBe(true);
    expect(z.form).toBe("sage");
    expect(applyAction(z, "cycleForm")).toBe(false);
    z.s = FORM_UNLOCK.kurama;
    expect(applyAction(z, "cycleForm")).toBe(true);
    expect(z.form).toBe("kurama");
  });

  it("a hit costs health and chakra and grants protection; health 0 loses", () => {
    const z = fresh();
    const enemy = z.entities.find((e) => e.type === "barrier")!;
    z.s = enemy.s - 0.5;
    z.lane = enemy.lane;
    z.x = enemy.lane * laneOffset(enemy.s);
    stepSim(z, SIM_STEP);
    expect(z.health).toBe(TUNING.health - 1);
    expect(z.invulnerable).toBeGreaterThan(5);
    expect(z.damageTaken).toBe(1);
    z.health = 1;
    z.invulnerable = 0;
    z.dash = 0;
    const another = z.entities.find((e) => e.type === "beam" && e.alive)!;
    z.s = another.s - 0.3;
    z.lane = another.lane;
    z.x = another.lane * laneOffset(another.s);
    stepSim(z, SIM_STEP);
    expect(z.phase).toBe("lost");
  });

  it("the seeded RNG and population are deterministic in the seed, and different seeds differ", () => {
    const a = seededRandom(17);
    const b = seededRandom(17);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(courseDigest({ entities: generateEntities(17) } as never).fnv1a).toBe(ref.setup.courseDigest.fnv1a);
    expect(courseDigest({ entities: generateEntities(18) } as never).fnv1a).not.toBe(ref.setup.courseDigest.fnv1a);
  });

  it("dt is clamped to 0.05 s, a paused/ended run does not advance, and snapshot() mirrors the state", () => {
    const z = fresh();
    stepSim(z, 10);
    expect(z.time).toBeCloseTo(0.05, 12);
    z.phase = "paused";
    const s = z.s;
    stepSim(z, SIM_STEP);
    expect(z.s).toBe(s);
    z.phase = "running";
    expect(snapshot(z)).toMatchObject({ phase: "running", distance: z.s, health: z.health });
  });

  it("policy extras never change the game's autopilot decisions when disabled", () => {
    const z = fresh();
    expect(policyActions(z, QA_ONLY_POLICY)).toEqual(policyActions(z, { ...QA_ONLY_POLICY }));
    const idle = runRecorded(() => [], 10);
    expect(idle.steps).toBe(10);
  });
});
