/**
 * PRD-10 10-CI: every prd10 benchmark scene is `active` in the C-30 registry.
 * A quarantined scene is silently absent from `window.__QR_SCENES__`, so a
 * capture "passes" with zero rows (GitLab pipeline 2934965097, run 38098928759).
 */
import { describe, expect, it } from "vitest";
import { ACTIVE_SCENE_IDS, REGISTRY } from "../../../../benchmarks/quality-rebuild/shared/registry";
import { scenes } from "../../../../benchmarks/quality-rebuild/scenes/prd10/index";

describe("prd10 benchmark scenes are capturable (10-CI)", () => {
  it("registers all 9 prd10 scenes", () => {
    expect(scenes).toHaveLength(9);
  });

  it("no prd10 scene is quarantined", () => {
    const prd10 = REGISTRY.filter((entry) => entry.id.startsWith("prd10-"));
    const bad = prd10.filter((entry) => entry.status !== "active").map((entry) => `${entry.id}: ${entry.quarantineReason ?? entry.status}`);
    expect(bad).toEqual([]);
    for (const { id } of scenes) expect(ACTIVE_SCENE_IDS).toContain(id);
  });
});
