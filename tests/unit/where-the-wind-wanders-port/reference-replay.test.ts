import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LETTERS, VIRTUAL_STEP_MS, createState, expandScript, runScript, stepFrame, type ScriptSegment } from "../../../examples/where-the-wind-wanders-port/sim";

interface Reference {
  schema: string;
  game: string;
  vstepMs: number;
  sessions: number;
  repeatability: { allIdentical: boolean; spreads: { maxPositionDelta: number }[] };
  tolerance: { positionUnits: number };
  start: { x: number; z: number };
  cameraRight: { x: number; z: number };
  steps: number;
  script: ScriptSegment[];
  xs: number[];
  zs: number[];
  events: { step: number; kind: string; hud: string }[];
  lettersAtStep: number[];
  bellStep: number | null;
  finalHud: string;
}

const ref = JSON.parse(readFileSync("evidence/crayon-capture/where-the-wind-wanders-reference.json", "utf8")) as Reference;

describe("original capture (evidence/crayon-capture/where-the-wind-wanders-reference.json)", () => {
  it("is a multi-session, schema-versioned reference with a data-derived tolerance", () => {
    expect(ref.schema).toBe("a3d-crayon-capture/1");
    expect(ref.game).toBe("where-the-wind-wanders");
    expect(ref.sessions).toBeGreaterThanOrEqual(2);
    expect(ref.vstepMs).toBe(VIRTUAL_STEP_MS);
    expect(ref.tolerance.positionUnits).toBeGreaterThan(0);
    expect(ref.xs.length).toBe(ref.steps);
    expect(ref.zs.length).toBe(ref.steps);
  });

  it("starts at the port's start position and the calibrated camera right vector matches the analytic axis", async () => {
    const { AXIS_RIGHT, START } = await import("../../../examples/where-the-wind-wanders-port/sim");
    expect(ref.start.x).toBeCloseTo(START.x, 6);
    expect(ref.start.z).toBeCloseTo(START.z, 6);
    expect(ref.cameraRight.x).toBeCloseTo(AXIS_RIGHT.x, 3);
    expect(ref.cameraRight.z).toBeCloseTo(AXIS_RIGHT.z, 3);
  });

  it("replaying the recorded key script reproduces the original trajectory at every step", () => {
    const { xs, zs } = runScript(ref.script);
    expect(xs.length).toBe(ref.steps);
    let worst = 0;
    for (let i = 0; i < ref.steps; i++) worst = Math.max(worst, Math.hypot(xs[i]! - ref.xs[i]!, zs[i]! - ref.zs[i]!));
    expect(worst).toBeLessThanOrEqual(ref.tolerance.positionUnits);
  });

  it("the replay's final position matches the original's final position", () => {
    const { state } = runScript(ref.script);
    expect(Math.hypot(state.pos.x - ref.xs.at(-1)!, state.pos.z - ref.zs.at(-1)!)).toBeLessThanOrEqual(ref.tolerance.positionUnits);
  });

  it("each interaction discovers letters in the original's order and the bell completes the quest", () => {
    const s = createState();
    const discovered: number[] = [];
    let completeStep: number | null = null;
    expandScript(ref.script).forEach((frame, i) => {
      stepFrame(s, frame, VIRTUAL_STEP_MS);
      for (const m of s.messages) {
        if (m.startsWith("letter:")) discovered.push(LETTERS.findIndex((l) => l.id === m.slice(7)));
        if (m === "bell:complete") completeStep = i + 1;
      }
    });
    expect(discovered).toEqual([0, 1, 2]);
    expect(completeStep).not.toBeNull();
    expect(s.complete).toBe(true);
    // the original's HUD shows "N / 3 discovered" at each interaction
    const interactions = ref.events.filter((e) => e.kind === "E");
    expect(interactions.length).toBe(4);
    const counts = interactions.map((e) => Number(/(\d) \/ 3 discovered/.exec(e.hud)?.[1] ?? "-1"));
    expect(counts).toEqual([1, 2, 3, 3]);
    expect(ref.finalHud).toMatch(/3 \/ 3 discovered/);
  });

  it("the original's own sessions agree with each other to within the recorded tolerance", () => {
    for (const spread of ref.repeatability.spreads) expect(spread.maxPositionDelta).toBeLessThanOrEqual(ref.tolerance.positionUnits);
  });
});
