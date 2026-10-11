import { describe, expect, it } from "vitest";

import {
  sceneKitPerformanceBudgets,
  sceneKitWorldBudgetEvidence
} from "../../../../packages/engine/src/agent-api/devtools/sceneKitBudgets";

/** #262 (Q-11-3): cityBlock budget evidence comes from diagnostics().world, not a static claim. */

describe("#262 sceneKitBudgets world evidence", () => {
  it("cityBlock no longer claims instancing/impostors it does not measure", () => {
    expect(sceneKitPerformanceBudgets.cityBlock.evidence).not.toMatch(/instanced or impostored/);
    expect(sceneKitPerformanceBudgets.cityBlock.evidence).toMatch(/diagnostics\(\)\.world/);
  });

  it("formats one measured line per scatter family", () => {
    const lines = sceneKitWorldBudgetEvidence({
      scatter: [
        { name: "street-trees", lod0: 12, lod1: 30, impostor: 58, culled: 100, shadowCasters: null, draws: 3, checksum: "a1b2" },
        { name: "props", lod0: 40, lod1: 0, impostor: 0, culled: 5, shadowCasters: 40, draws: 1, checksum: "c3d4" }
      ]
    });
    expect(lines).toEqual([
      "street-trees: lod0 12, lod1 30, impostor 58, culled 100, draws 3, checksum a1b2",
      "props: lod0 40, lod1 0, impostor 0, culled 5, draws 1, checksum c3d4"
    ]);
  });

  it("reports nothing when world diagnostics are absent", () => {
    expect(sceneKitWorldBudgetEvidence(null)).toEqual([]);
    expect(sceneKitWorldBudgetEvidence(undefined)).toEqual([]);
    expect(sceneKitWorldBudgetEvidence({ scatter: [] })).toEqual([]);
  });
});
