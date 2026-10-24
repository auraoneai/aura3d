import { describe, expect, it } from "vitest";
import { countLoc, editsToGreen, median, spread, stripComments, summarize } from "../../../tools/agent-eval/lib/metrics.mjs";
import { buildPlan, mulberry32, parseArgs, resolveTasks } from "../../../tools/agent-eval/run.mjs";

describe("agent-eval metrics", () => {
  it("counts non-blank, non-comment lines", () => {
    const src = ["// header", "import a from 'a';", "", "/* block", "comment */", "const url = 'http://x';", "  ", "run();"].join("\n");
    expect(countLoc(src)).toBe(3);
    expect(stripComments("a // c\nb")).toBe("a \nb");
  });

  it("computes edits to green from the event order", () => {
    const t = (pass: boolean) => ({ type: "typecheck", pass });
    const w = { type: "write" };
    expect(editsToGreen([w, t(true)])).toEqual({ typechecked: true, firstTryTypecheck: true, editsToGreen: 0 });
    expect(editsToGreen([w, t(false), w, w, t(true)])).toEqual({ typechecked: true, firstTryTypecheck: false, editsToGreen: 2 });
    expect(editsToGreen([w, t(true), w]).editsToGreen).toBeNull();
    expect(editsToGreen([w, t(false), w, t(false)]).editsToGreen).toBeNull();
    expect(editsToGreen([w, w])).toEqual({ typechecked: false, firstTryTypecheck: null, editsToGreen: null });
    expect(editsToGreen([t(false), w, t(true), w, t(true)]).editsToGreen).toBe(2);
  });

  it("summarises numbers and booleans without dropping missing values silently", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(spread([4, 9, 1])).toEqual({ min: 1, max: 9 });
    expect(summarize([true, false, true, null as never])).toMatchObject({ n: 4, trueCount: 2, boolN: 3, missing: 1 });
  });

  it("builds the same seeded plan every time, covering every task, arm and run once", () => {
    const args = { arms: ["aura", "three"], tasks: [1, 2], runs: 3, seed: 7, batch: "b" };
    const one = buildPlan(args);
    expect(one.map((p: { runId: string }) => p.runId)).toEqual(buildPlan(args).map((p: { runId: string }) => p.runId));
    expect(new Set(one.map((p: { runId: string }) => p.runId)).size).toBe(12);
    expect(one.map((p: { runId: string }) => p.runId)).not.toEqual(buildPlan({ ...args, seed: 8 }).map((p: { runId: string }) => p.runId));
    expect(mulberry32(1)()).toBe(mulberry32(1)());
  });

  it("parses the runner command line", () => {
    expect(parseArgs(["--arm", "aura", "--task", "3", "--runs", "5", "--batch", "x"])).toMatchObject({ arm: "aura", task: "3", runs: 5, batch: "x" });
    expect(resolveTasks("1,3,9")).toEqual([1, 3]);
    expect(resolveTasks("all")).toHaveLength(7);
    expect(() => parseArgs(["--nope"])).toThrow();
  });
});
