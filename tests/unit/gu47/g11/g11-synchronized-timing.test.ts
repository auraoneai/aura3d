import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  classifyG11ReadyMutation, classifyG11Timing, isG11ReadySnapshotValid, type G11TimingObservation
} from "./g11-synchronized-timing";

const onTime: G11TimingObservation = {
  nominalMs: 25_000, earlyWindowMs: 5_000,
  readyTimeOriginMs: 1_700_000_000_000, captureTimeOriginMs: 1_700_000_000_000,
  observerInstalledMs: 0, lastNotReadyMs: 1_000, readyObservedMs: 1_020,
  beforeStartMs: 21_020, beforeEndMs: 21_030,
  screenshotStartMs: 21_031, screenshotEndMs: 24_000, afterStartMs: 24_001, afterEndMs: 24_500
};

describe("G11 body-ready mutation classification", () => {
  const origin = 1_700_000_000_000;
  const initial = () => ({
    currentValue: null as string | null, sameBody: true, bodyConnected: true,
    readyTransitions: 0, changesAfterReady: 0, bodyReplacements: 0, timeOriginMs: origin
  });
  const apply = (state: ReturnType<typeof initial>, oldValue: string | null, newValue: string | null): void => {
    const result = classifyG11ReadyMutation(oldValue, newValue, state.readyTransitions > 0, state.sameBody);
    if (result.invalidates) state.changesAfterReady += 1;
    if (result.becameReady) state.readyTransitions += 1;
    state.currentValue = newValue;
  };

  it("keeps the first ready transition valid after redundant true-to-true writes", () => {
    const state = initial();
    apply(state, null, "true");
    apply(state, "true", "true");
    apply(state, "true", "true");
    expect(state).toMatchObject({ currentValue: "true", readyTransitions: 1, changesAfterReady: 0 });
    expect(isG11ReadySnapshotValid(state, origin)).toBe(true);
    expect(classifyG11Timing(onTime).readyUncertaintyMs).toBe(20);
  });

  it.each(["false", "error"])("invalidates a real true-to-%s-to-true sequence", (value) => {
    const state = initial();
    apply(state, null, "true");
    apply(state, "true", value);
    apply(state, value, "true");
    expect(state).toMatchObject({ currentValue: "true", readyTransitions: 2, changesAfterReady: 2 });
    expect(isG11ReadySnapshotValid(state, origin)).toBe(false);
  });

  it("rejects a replaced, disconnected, or temporarily removed and reinserted ready body", () => {
    const state = initial();
    apply(state, null, "true");
    expect(isG11ReadySnapshotValid({ ...state, sameBody: false }, origin)).toBe(false);
    expect(isG11ReadySnapshotValid({ ...state, bodyConnected: false }, origin)).toBe(false);
    expect(isG11ReadySnapshotValid({ ...state, bodyReplacements: 1 }, origin)).toBe(false);
    expect(classifyG11ReadyMutation("error", "true", true, false).becameReady).toBe(false);
    expect(isG11ReadySnapshotValid(state, origin + 1)).toBe(false);
  });
});

describe("G11 synchronized timing bounds", () => {
  it("accepts the entire bracket within the 25s window for every possible ready time", () => {
    const result = classifyG11Timing(onTime);
    expect(result.status).toBe("within-window");
    expect(result.readyUncertaintyMs).toBe(20);
    expect(result.beforeStartAgeMs).toEqual([20_000, 20_020]);
    expect(result.screenshotEndAgeMs).toEqual([22_980, 23_000]);
    expect(result.afterEndAgeMs).toEqual([23_480, 23_500]);
  });

  it("uses the distinct 55–60s window for the second nominal milestone", () => {
    const result = classifyG11Timing({
      ...onTime, nominalMs: 60_000, beforeStartMs: 56_020, beforeEndMs: 56_030,
      screenshotStartMs: 56_031, screenshotEndMs: 59_000, afterStartMs: 59_001, afterEndMs: 60_000
    });
    expect(result.status).toBe("within-window");
    expect(result.targetWindowMs).toEqual([55_000, 60_000]);
  });

  it("does not relabel a 198s observation as a 25s capture", () => {
    const result = classifyG11Timing({
      ...onTime, beforeStartMs: 199_020, beforeEndMs: 199_030,
      screenshotStartMs: 199_031, screenshotEndMs: 200_000, afterStartMs: 200_001, afterEndMs: 200_050
    });
    expect(result.status).toBe("late");
    expect(result.beforeStartAgeMs).toEqual([198_000, 198_020]);
    expect(result.reasons.join(" ")).toContain("after the deadline");
  });

  it("marks the whole bracket late even when the screenshot started on time", () => {
    const result = classifyG11Timing({ ...onTime, screenshotEndMs: 26_050, afterStartMs: 26_051, afterEndMs: 26_060 });
    expect(result.status).toBe("late");
    expect(result.screenshotStartAgeMs?.[0]).toBe(20_011);
    expect(result.screenshotEndAgeMs?.[0]).toBe(25_030);
  });

  it("rejects a sample definitely too early", () => {
    const result = classifyG11Timing({
      ...onTime, beforeStartMs: 19_000, beforeEndMs: 19_001,
      screenshotStartMs: 19_002, screenshotEndMs: 20_000, afterStartMs: 20_001, afterEndMs: 20_002
    });
    expect(result.status).toBe("early");
  });

  it("cannot prove the deadline when observer delivery leaves a crossing uncertainty", () => {
    const result = classifyG11Timing({ ...onTime, lastNotReadyMs: 0, afterStartMs: 25_000, afterEndMs: 25_500 });
    expect(result.status).toBe("not-proven");
    expect(result.readyUncertaintyMs).toBe(1_020);
    expect(result.afterEndAgeMs).toEqual([24_480, 25_500]);
  });

  it("accepts inclusive boundaries only with zero ready uncertainty", () => {
    const result = classifyG11Timing({
      ...onTime, lastNotReadyMs: 1_020, afterStartMs: 26_019, afterEndMs: 26_020,
      screenshotEndMs: 26_018
    });
    expect(result.status).toBe("within-window");
    expect(result.afterEndAgeMs).toEqual([25_000, 25_000]);
  });

  it.each([
    ["missing ready transition", { readyObservedMs: null }],
    ["missing completion", { screenshotEndMs: null }],
    ["invalid number", { beforeEndMs: Number.NaN }],
    ["changed timeOrigin", { captureTimeOriginMs: 1_700_000_000_001 }],
    ["reversed diagnostic bracket", { afterStartMs: 23_999 }],
    ["negative ready timestamp", { lastNotReadyMs: -1 }],
    ["invalid target window", { earlyWindowMs: 26_000 }]
  ])("does not prove %s", (_label, change) => {
    expect(classifyG11Timing({ ...onTime, ...change }).status).toBe("not-proven");
  });

  it.each([
    ["classifyG11Timing", "tests/unit/gu47/g11/g11-synchronized-timing.ts"],
    ["classifyG11ReadyMutation", "tests/unit/gu47/g11/g11-synchronized-timing.ts"],
    ["isG11ReadySnapshotValid", "tests/unit/gu47/g11/g11-synchronized-timing.ts"],
    ["checkG11TextureRows", "tests/unit/gu47/g11/g11-synchronized-texture-check.ts"]
  ])("keeps the self-contained ACR spec's %s identical to the unit-tested helper", (name, helperPath) => {
    const declaration = (path: string): string => {
      const file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const findFunction = (node: ts.Node): ts.FunctionDeclaration | undefined => {
        if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node;
        return ts.forEachChild(node, findFunction);
      };
      const fn = findFunction(file);
      if (!fn) throw new Error(`Missing ${name} in ${path}`);
      return fn.getText(file).replace(/^export\s+/, "").split("\n").map((line) => line.trim()).join("\n");
    };
    expect(declaration("tests/browser/gu47/g11-synchronized-readiness.spec.ts")).toBe(declaration(helperPath));
  });
});
