import { describe, expect, it } from "vitest";
import { DUSK_CEDARS, buildScenery, type ModelSink } from "../../../examples/ninja-runner-port/scenery";

/** GU47 phase 5 (sibling distinctness): evening cedars and autumn verges are presentation only. */
describe("ninja-runner-port phase 5 evening dressing", () => {
  const plain: ModelSink = {};
  const dusk: ModelSink = {};
  const before = buildScenery(plain, { paintedTrees: true });
  const after = buildScenery(dusk, { paintedTrees: true, autumnVerge: true });
  const baseline: ModelSink = {};
  buildScenery(baseline);

  it("draws the forest conifers as painted cedars instead of the shared pine model", () => {
    expect(baseline.pine?.length ?? 0).toBeGreaterThan(0);
    expect(dusk.pine?.length ?? 0).toBe(0);
    const cones = after.find((l) => l.id === "cones")?.placements.length ?? 0;
    const baseCones = buildScenery({}).find((l) => l.id === "cones")?.placements.length ?? 0;
    expect(cones - baseCones).toBe(3 * baseline.pine!.length);
    expect(DUSK_CEDARS).toHaveLength(4);
  });

  it("keeps every other model placement where it was (same random draws)", () => {
    for (const id of Object.keys(baseline)) {
      if (id === "pine" || id === "oak") continue;
      expect(dusk[id]?.length ?? 0, id).toBe(baseline[id]!.length);
      expect(dusk[id]!.map((p) => JSON.stringify({ ...p, tint: undefined })), id).toEqual(baseline[id]!.map((p) => JSON.stringify({ ...p, tint: undefined })));
    }
  });

  it("only the bush tint differs with autumnVerge", () => {
    expect(before.map((l) => l.placements.length)).toEqual(after.map((l) => l.placements.length));
  });
});
