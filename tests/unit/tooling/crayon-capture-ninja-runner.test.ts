import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLICY,
  NINJA_TOLERANCE_FLOOR,
  QA_ONLY_POLICY,
  SWEEP_POLICIES,
  compareRuns,
  decodeActionScript,
  encodeActionScript,
  pageRunnerSource,
  parseMarkerBlocks,
  scriptActionCount,
  summarizeVariance,
  toleranceFrom,
  validateReport,
  type RunSummary
} from "../../../tools/crayon-capture/ninja-runner-lib";

const referencePath = path.resolve(__dirname, "../../../evidence/crayon-capture/ninja-runner-reference.json");

const run = (patch: Partial<RunSummary> = {}): RunSummary => ({
  outcome: "won", steps: 100, endPhase: "won", lostBy: null, distance: 10, time: 1, kills: 2, score: 5, health: 5, chakra: 100, bestCombo: 2, form: "base",
  vaults: 0, deflections: 0, interrupts: 0, damageTaken: 0, attacksFired: 0, cloneStrikes: 0, eventCounts: { kill: 2 },
  events: [{ step: 3, type: "kill", entity: 1 }], trace: [{ step: 0, time: 0, s: 0, x: 0, lane: 0, y: 0, vy: 0, speed: 18, health: 5, chakra: 300, kills: 0, score: 0, combo: 0, form: "base", phase: "running", attack: 0, dash: 0, slide: 0, invulnerable: 0, clones: 0, cloneStrikes: 0, shurikens: 0, deflections: 0, damageTaken: 0, falling: false, vaults: 0, projectiles: 0, aliveEnemies: 0 }],
  script: [{ step: 4, actions: ["jump"] }], ...patch
});

describe("ninja-runner capture: action script codec", () => {
  it("round-trips a sparse, order-preserving script", () => {
    const entries = [{ step: 0, actions: ["jump", "rasengan"] as const }, { step: 12, actions: ["left"] as const }, { step: 900, actions: ["cycleForm", "clones"] as const }];
    const text = encodeActionScript(entries);
    expect(text).toBe("0:jump+rasengan;12:left;900:cycleForm+clones");
    expect(decodeActionScript(text)).toEqual(entries);
    expect(scriptActionCount(entries)).toBe(5);
  });

  it("rejects malformed entries and unknown actions; empty text is an empty script", () => {
    expect(decodeActionScript("")).toEqual([]);
    expect(() => decodeActionScript("x:jump")).toThrow(/bad script entry/);
    expect(() => decodeActionScript("3:fly")).toThrow(/unknown action/);
  });
});

describe("ninja-runner capture: run comparison and tolerance", () => {
  it("identical runs are identical; any differing event, script entry or number is reported", () => {
    expect(compareRuns(run(), run()).identical).toBe(true);
    expect(compareRuns(run(), run({ events: [{ step: 4, type: "kill", entity: 1 }] })).eventsEqual).toBe(false);
    expect(compareRuns(run(), run({ script: [] })).scriptEqual).toBe(false);
    const moved = run();
    moved.trace[0] = { ...moved.trace[0]!, s: 0.25 };
    const c = compareRuns(run(), moved);
    expect(c.identical).toBe(false);
    expect(c.maxTraceDelta).toBe(0.25);
  });

  it("derives the tolerance from the observed variance, with a floor when every repeat was exact", () => {
    const exact = summarizeVariance([compareRuns(run(), run()), compareRuns(run(), run())]);
    expect(exact.allIdentical).toBe(true);
    expect(toleranceFrom(exact)).toMatchObject({ numeric: NINJA_TOLERANCE_FLOOR, eventSteps: 0 });
    const moved = run();
    moved.trace[0] = { ...moved.trace[0]!, s: 0.5 };
    const loose = toleranceFrom(summarizeVariance([compareRuns(run(), moved)]));
    expect(loose.numeric).toBeCloseTo(0.75, 12);
    expect(loose.eventSteps).toBe(1);
  });
});

describe("ninja-runner capture: policy and page runner", () => {
  it("the sweep starts with the richest policy and ends with the game's own autopilot", () => {
    expect(SWEEP_POLICIES[0]).toEqual(DEFAULT_POLICY);
    expect(SWEEP_POLICIES[SWEEP_POLICIES.length - 1]).toEqual(QA_ONLY_POLICY);
    expect(QA_ONLY_POLICY.useForm || QA_ONLY_POLICY.useKurama || QA_ONLY_POLICY.useClones || QA_ONLY_POLICY.useShuriken || QA_ONLY_POLICY.useDash).toBe(false);
  });

  it("the page runner source is a self-contained async IIFE that only touches the game's own hooks", () => {
    const src = pageRunnerSource({ mode: "policy", params: DEFAULT_POLICY, maxSteps: 10 });
    expect(src.startsWith("(async function")).toBe(true);
    expect(() => new Function(`return ${src}`)).not.toThrow();
    for (const hook of ["__konoha", "simulate", "restart", "action"]) expect(src).toContain(hook);
    expect(src).not.toMatch(/\beval\s*\(/);
  });

  it("parses marker blocks from `az acr run` logs (CRLF) and skips truncated blocks", () => {
    const log = ["noise", "@@CRAYON_CAPTURE_BEGIN:1", JSON.stringify({ a: 1 }), "@@CRAYON_CAPTURE_END:1", "@@CRAYON_CAPTURE_BEGIN:2", "{\"truncated\":", "@@CRAYON_CAPTURE_END:2", ""].join("\r\n");
    expect(parseMarkerBlocks(log)).toEqual([{ a: 1 }]);
  });
});

describe("ninja-runner capture: the recorded reference", () => {
  const report = JSON.parse(fs.readFileSync(referencePath, "utf8")) as ReturnType<typeof JSON.parse>;

  it("validates (>= 60 s of sim, combat, an idle loss, a restart, >= 2 independent sessions)", () => {
    expect(validateReport(report)).toEqual([]);
  });

  it("is a winning full-course run whose script parses and exercises every ability", () => {
    expect(report.reference.outcome).toBe("won");
    expect(report.reference.distance).toBe(2640);
    const types = Object.keys(report.reference.eventCounts);
    for (const t of ["start", "jump", "rasengan", "kill", "clones", "cloneStrike", "dash", "rasenshuriken", "windImpact", "unlock", "form", "gapClear", "won"]) expect(types).toContain(t);
    expect(report.reference.eventCounts.form).toBeGreaterThanOrEqual(2);
    expect(decodeActionScript(report.script).length).toBe(report.reference.script.length);
  });

  it("was bit-identical across every independent session, replay and idle repeat, so the tolerance is the floor", () => {
    expect(report.sessions.length).toBeGreaterThanOrEqual(4);
    expect(report.sessions.every((s: { replayIdentical: boolean; resultEqualsReference: boolean; scriptEqualsReference: boolean; idleIdentical: boolean }) => s.replayIdentical && s.resultEqualsReference && s.scriptEqualsReference && s.idleIdentical)).toBe(true);
    expect(report.variance.repeat.allIdentical).toBe(true);
    expect(report.tolerance.numeric).toBe(NINJA_TOLERANCE_FLOOR);
  });

  it("transcribed the game's own QA autopilot exactly, and restart returns a fresh running state", () => {
    expect(report.qaAutopilotCheck.equal).toBe(true);
    expect(report.restart).toMatchObject({ restarted: true, phaseAfterRestart: "running", sAfterRestart: 0, eventsAfterRestart: ["start"] });
  });

  it("the idle (no input) run loses by falling into the first gap", () => {
    expect(report.idle.outcome).toBe("lost");
    expect(report.idle.lostBy).toBe("gap");
    expect(report.idle.distance).toBeGreaterThan(594);
    expect(report.idle.distance).toBeLessThan(620);
  });
});
