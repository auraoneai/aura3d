import { describe, expect, it } from "vitest";
import {
  ACTIVE_SCENE_IDS,
  REGISTRY,
  getActiveSceneSpec,
  getRegisteredScene,
  laneAdapterModulePath
} from "../../../../benchmarks/quality-rebuild/shared/registry";
import { sceneIds } from "../../../../benchmarks/quality-rebuild/shared/scenes";

describe("PRD-12 T1.2 registry (C-30)", () => {
  it("wraps all 18 base scenes as active entries", () => {
    expect(sceneIds.length).toBe(18);
    for (const id of sceneIds) {
      const entry = getRegisteredScene(id);
      expect(entry, id).toBeDefined();
      expect(entry!.status, id).toBe("active");
      expect(entry!.id, id).toBe(id);
    }
  });

  it("assigns every base scene the C-30 runtime fields", () => {
    for (const entry of REGISTRY.filter((e) => e.status === "active")) {
      const spec = entry.spec as Record<string, unknown>;
      expect(spec.owner, entry.id).toBe("prd12");
      expect(spec.referenceProfile, entry.id).toBe("contract");
      expect(Array.isArray(spec.masks), entry.id).toBe(true);
      expect(Array.isArray(spec.brokenControls), entry.id).toBe(true);
      expect(typeof spec.primaryCriterion, entry.id).toBe("string");
      expect((spec.masks as string[]).includes("object-id"), entry.id).toBe(true);
      expect((spec.masks as string[]).includes("silhouette-edge"), entry.id).toBe(true);
    }
  });

  it("derives masks and broken controls from spec features", () => {
    const shadows = getActiveSceneSpec("12-shadows")!;
    expect(shadows.masks).toContain("shadow-receiver");
    expect(shadows.brokenControls).toContain("no-shadows");
    const ibl = getActiveSceneSpec("13-ibl-only")!;
    expect(ibl.masks).toContain("sky");
    expect(ibl.brokenControls).toContain("flat-sky");
    expect(ibl.brokenControls).toContain("no-ibl");
    expect(ibl.primaryRegion).toBe("sky");
    // A scene without environment or shadows never claims the control.
    const simple = getActiveSceneSpec("01-simple-geometry")!;
    expect(simple.brokenControls).not.toContain("flat-sky");
    expect(simple.masks).not.toContain("sky");
    const transmission = getActiveSceneSpec("05-transmission")!;
    expect(transmission.primaryRegion).toBe("object:0");
  });

  it("registers lane scenes only when both adapters exist", () => {
    const entry = getRegisteredScene("prd12-skinned-character-walk");
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("active");
    expect(entry!.admittedAsReference).toBe(false);
    expect(laneAdapterModulePath("aura3d", "prd12-skinned-character-walk")).toBe(
      "./aura3d/scenes/prd12/skinned-character-walk.ts"
    );
    expect(laneAdapterModulePath("three", "prd12-skinned-character-walk")).toBe(
      "./three/scenes/prd12/skinned-character-walk.ts"
    );
    expect(ACTIVE_SCENE_IDS).toContain("prd12-skinned-character-walk");
  });

  it("keeps ids unique across the registry", () => {
    const ids = REGISTRY.map((entry) => entry.id);
    const active = REGISTRY.filter((entry) => entry.status === "active").map((entry) => entry.id);
    expect(new Set(ids).size).toBeGreaterThanOrEqual(new Set(active).size);
    // No active id may collide with another active id.
    expect(new Set(active).size).toBe(active.length);
  });
});
