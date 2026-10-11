import { describe, expect, it } from "vitest";
import { ACTIVE_SCENE_IDS, REGISTRY } from "../../../../benchmarks/quality-rebuild/shared/registry";
import { PRD03_SCENE_SPECS } from "../../../../benchmarks/quality-rebuild/scenes/prd03/specs";

// Regression: every prd03 spec lacked referenceProfile/masks/brokenControls, so the
// registry quarantined it (`missing-registry-fields`), `__QR_SCENES__` omitted it,
// and GPU `suite=promote promote_flag=post` captured 0 lane scenes (run 38165750934).
describe("prd03 lane scenes reach the capture harness", () => {
  const ids = Object.keys(PRD03_SCENE_SPECS);

  it("has lane scenes to check", () => {
    expect(ids.length).toBeGreaterThanOrEqual(11);
  });

  it.each(ids)("%s is active, not quarantined", (id) => {
    const entry = REGISTRY.find((candidate) => candidate.id === id);
    expect(entry?.quarantineReason).toBeUndefined();
    expect(entry?.status).toBe("active");
    expect(ACTIVE_SCENE_IDS).toContain(id);
  });
});
