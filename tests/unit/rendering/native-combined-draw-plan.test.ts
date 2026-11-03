import { describe, expect, it } from "vitest";
import {
  MAX_COMBINED_DRAW_MEMBERS,
  MAX_COMBINED_DRAW_PLAN_ITEMS,
  planCombinedDrawRuns,
  type CombinedDrawPlanEntry
} from "../../../packages/rendering/src/batching/CombinedDrawPlanner";

const candidate = (compatibilityKey: object, firstIndex: number, indexCount = 3, indexType: "uint16" | "uint32" = "uint16"): CombinedDrawPlanEntry =>
  ({ compatibilityKey, firstIndex, indexCount, indexType });

describe("combined indexed draw ordering plan", () => {
  it("keeps compatible members contiguous and treats other draws as barriers", () => {
    const a = {}, b = {};
    const entries = [candidate(a, 12), candidate(a, 3, 6), null,
      candidate(a, 9), candidate(b, 6), candidate(b, 0, 12), candidate(a, 15), candidate(a, 18)];
    const runs = planCombinedDrawRuns(entries);
    expect(runs.map((run) => run.members.map((member) => member.itemIndex))).toEqual([[0, 1], [4, 5], [6, 7]]);
    expect(runs[0]!.members.map((member) => [member.firstIndex, member.indexCount])).toEqual([[12, 3], [3, 6]]);
    (entries[0] as { firstIndex: number }).firstIndex = 99;
    expect(runs[0]!.members[0]!.firstIndex).toBe(12);
    expect(runs.flatMap((run) => run.members.map((member) => member.itemIndex))).not.toContain(3);
    expect(Object.isFrozen(runs)).toBe(true);
    expect(Object.isFrozen(runs[0]!.members)).toBe(true);
  });

  it("splits bounded runs and restarts per-run row numbering in the submitted order", () => {
    const key = {};
    // This is an already-sorted/cull-filtered list. Draw-data rows must be
    // rebuilt in this order, not by any original producer slot number.
    const entries = [30, 6, 18, 24, 0, 12, 36].map((first) => candidate(key, first));
    const runs = planCombinedDrawRuns(entries, 3);
    expect(runs.map((run) => run.members.map((member, drawId) => [drawId, member.firstIndex])))
      .toEqual([[[0, 30], [1, 6], [2, 18]], [[0, 24], [1, 0], [2, 12]]]);
    // The trailing singleton remains an ordinary draw.
    expect(runs.flatMap((run) => run.members.map((member) => member.itemIndex))).not.toContain(6);
  });

  it("does not merge across differing index types or invalid ranges", () => {
    const key = {};
    const entries = [candidate(key, 0), candidate(key, 3), candidate(key, 6, 3, "uint32"),
      candidate(key, 9, 3, "uint32"), candidate(key, -1), candidate(key, 12),
      candidate(key, 0x40000000), candidate(key, 15), candidate(key, 18), candidate(key, 21, 0)];
    const runs = planCombinedDrawRuns(entries);
    expect(runs.map((run) => [run.indexType, run.members.map((member) => member.itemIndex)]))
      .toEqual([["uint16", [0, 1]], ["uint32", [2, 3]], ["uint16", [7, 8]]]);
    expect(planCombinedDrawRuns([candidate(key, 0, 3.5), candidate(key, 3)])).toEqual([]);
    expect(planCombinedDrawRuns([candidate(key, NaN), candidate(key, 3)])).toEqual([]);
  });

  it("bounds run size and work per planning call", () => {
    const key = {};
    const entries = Array.from({ length: MAX_COMBINED_DRAW_MEMBERS + 1 }, (_, index) => candidate(key, index * 3));
    const runs = planCombinedDrawRuns(entries);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.members).toHaveLength(MAX_COMBINED_DRAW_MEMBERS);
    expect(planCombinedDrawRuns(entries, 1)).toEqual([]);
    expect(() => planCombinedDrawRuns(entries, 0)).toThrow(RangeError);
    expect(() => planCombinedDrawRuns(entries, MAX_COMBINED_DRAW_MEMBERS + 1)).toThrow(RangeError);
    expect(() => planCombinedDrawRuns(Array.from({ length: MAX_COMBINED_DRAW_PLAN_ITEMS + 1 }, () => null))).toThrow(RangeError);
  });
});
