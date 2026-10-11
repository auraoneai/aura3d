// 07 CI-rerun (run 38086978485): every prd07 lane scene was quarantined
// `missing-adapter` because the adapters were named `prd07-<slug>.ts` while
// the C-30 registry resolves `{engine}/scenes/prd07/<slug>.ts`, so the
// capture job silently captured only the 4 base scenes. Lane scenes with both
// adapters must be active; Aura-only scenes stay quarantined until the
// registry admits Aura-only entries (lane 12) or a three adapter lands.

import { describe, expect, it } from "vitest";
import { REGISTRY } from "../../../../benchmarks/quality-rebuild/shared/registry";

const AURA_ONLY = new Set(["prd07-impact-library", "prd07-trails-beams", "prd07-fog-transition", "prd07-underwater"]);

describe("prd07 lane scenes in the bench registry", () => {
  const lane = REGISTRY.filter((entry) => entry.id.startsWith("prd07-"));

  it("registers all 17 lane scenes", () => {
    expect(lane.map((entry) => entry.id)).toHaveLength(17);
  });

  it("every scene with both adapters is active", () => {
    const inactive = lane.filter((entry) => !AURA_ONLY.has(entry.id) && entry.status !== "active");
    expect(inactive.map((entry) => `${entry.id}: ${entry.status} ${entry.quarantineReason ?? ""}`)).toEqual([]);
  });

  it("Aura-only scenes are quarantined only for the missing three adapter", () => {
    for (const entry of lane.filter((e) => AURA_ONLY.has(e.id))) {
      expect(entry.quarantineReason, entry.id).toBe("missing-adapter");
    }
  });
});
