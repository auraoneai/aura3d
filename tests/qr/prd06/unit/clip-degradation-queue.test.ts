// 06-Q061 (PRD-16 §4.6, #415): the clip-apply degradation queue is bounded.
// A missing clip reported every frame for 10k frames must not grow the queue:
// identical reports dedupe into one entry with an occurrence count, distinct
// reports cap at 64 entries plus one dropped-count sentinel.

import { afterEach, describe, expect, it } from "vitest";
import {
  pushClipApplyDegradation,
  takeClipApplyDegradations
} from "../../../../packages/engine/src/agent-api/compiler/animation";

const CAP = 64;

afterEach(() => {
  takeClipApplyDegradations();
});

describe("06-Q061 clip-apply degradation queue bound", () => {
  it("dedupes a missing clip reported on 10k frames into one entry", () => {
    for (let frame = 0; frame < 10_000; frame++) {
      pushClipApplyDegradation({
        code: "clip-apply-failed",
        nodeId: "hero",
        message: 'clip "Run" did not resolve on actor "hero" (available: Idle)',
        cause: new Error(`frame ${frame}`)
      });
    }
    const drained = takeClipApplyDegradations();
    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({ code: "clip-apply-failed", nodeId: "hero" });
    expect(drained[0]!.message).toContain("(x10000 occurrences)");
    // Only the first occurrence keeps its Error.
    expect((drained[0]!.cause as Error).message).toBe("frame 0");
    expect(takeClipApplyDegradations()).toHaveLength(0);
  });

  it("caps 10k distinct reports at 64 entries plus one dropped-count sentinel", () => {
    for (let frame = 0; frame < 10_000; frame++) {
      pushClipApplyDegradation({ code: "clip-apply-failed", nodeId: `npc-${frame}`, message: `clip "Walk" missing on npc-${frame}` });
    }
    const drained = takeClipApplyDegradations();
    expect(drained).toHaveLength(CAP + 1);
    expect(drained.slice(0, CAP).every((entry) => entry.code === "clip-apply-failed")).toBe(true);
    expect(drained[CAP]).toMatchObject({ code: "capability-degraded" });
    expect(drained[CAP]!.message).toContain(`${10_000 - CAP} clip degradation report(s) dropped`);
  });

  it("starts a fresh count after each drain", () => {
    const entry = { code: "clip-apply-failed" as const, nodeId: "hero", message: "clip miss" };
    pushClipApplyDegradation(entry);
    pushClipApplyDegradation(entry);
    expect(takeClipApplyDegradations()[0]!.message).toBe("clip miss (x2 occurrences)");
    pushClipApplyDegradation(entry);
    expect(takeClipApplyDegradations()).toEqual([entry]);
  });
});
