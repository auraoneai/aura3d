import { describe, expect, it } from "vitest";
import { buildScenery, type ModelSink } from "../../../examples/ninja-runner-port/scenery";

/** GU47 phase 5 (sibling distinctness): the autumn verge is presentation only (bush tint; nothing moves). */
describe("ninja-runner-port phase 5 evening dressing", () => {
  const plain: ModelSink = {};
  const autumn: ModelSink = {};
  const before = buildScenery(plain, { paintedTrees: true });
  const after = buildScenery(autumn, { paintedTrees: true, autumnVerge: true });

  it("keeps every model placement where it was and only retints the bushes", () => {
    expect(Object.keys(autumn).sort()).toEqual(Object.keys(plain).sort());
    for (const id of Object.keys(plain)) {
      expect(autumn[id]!.map((p) => JSON.stringify({ ...p, tint: undefined })), id).toEqual(plain[id]!.map((p) => JSON.stringify({ ...p, tint: undefined })));
      if (id !== "bush") expect(autumn[id]!.map((p) => p.tint), id).toEqual(plain[id]!.map((p) => p.tint));
    }
    expect(autumn.bush!.length).toBeGreaterThan(0);
    expect(autumn.bush!.some((p) => p.tint === "#e2b48e")).toBe(true);
  });

  it("keeps every instanced layer's placement count", () => {
    expect(after.map((l) => l.placements.length)).toEqual(before.map((l) => l.placements.length));
  });
});
