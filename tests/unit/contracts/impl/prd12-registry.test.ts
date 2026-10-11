import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
      // Base scenes (NN-*) and prd12-ref-* are lane 12's; lane scenes registered
      // later (e.g. prd05-optimized-*) keep their own lane as owner.
      const laneOwner = /^(prd\d\d)-/.exec(entry.id)?.[1] ?? "prd12";
      expect(spec.owner, entry.id).toBe(laneOwner);
      // Base scenes run the contract profile; prd12-ref-* run showcase (§9.3).
      expect(spec.referenceProfile, entry.id).toBe(entry.id.startsWith("prd12-ref-") ? "showcase" : "contract");
      expect(Array.isArray(spec.masks), entry.id).toBe(true);
      expect(Array.isArray(spec.brokenControls), entry.id).toBe(true);
      expect(typeof spec.primaryCriterion, entry.id).toBe("string");
      // Derived base masks apply to lane-12 scenes; other lanes' scenes only
      // owe the C-30 field shapes above (registry.ts validateEntry).
      if (laneOwner === "prd12") {
        expect((spec.masks as string[]).includes("object-id"), entry.id).toBe(true);
        expect((spec.masks as string[]).includes("silhouette-edge"), entry.id).toBe(true);
      }
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

  // T0-14 = REG-1: every lane adapter must load the spec registered under its
  // own id. prd12-ref-06 failed every run while its adapter's id and the
  // registry id disagreed.
  it("each active lane entry's adapters load exactly their own registry id", async () => {
    const benchRoot = resolve(__dirname, "../../../../benchmarks/quality-rebuild");
    const laneEntries = REGISTRY.filter((e) => e.status === "active" && /^prd\d\d-/.test(e.id));
    expect(laneEntries.length).toBeGreaterThan(0);
    for (const entry of laneEntries) {
      for (const engine of ["aura3d", "three"] as const) {
        const rel = laneAdapterModulePath(engine, entry.id);
        expect(rel, `${entry.id} ${engine} adapter path`).toBeDefined();
        const source = readFileSync(resolve(benchRoot, rel!), "utf8");
        const ids = [...source.matchAll(/["'](prd\d\d-[a-z0-9-]+)["']/g)].map((m) => m[1]!);
        const foreign = ids.filter((id) => id !== entry.id && REGISTRY.some((r) => r.id === id));
        expect(foreign, `${entry.id} ${engine} adapter loads another entry's spec`).toEqual([]);
        if (ids.includes(entry.id)) continue;
        // Adapters that import a spec object directly: the imported spec's id
        // must equal the registry id.
        const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"(\.[^"]+\/scenes\/[^"]+)"/g)];
        const specIds: string[] = [];
        for (const [, names, from] of imports) {
          const mod = (await import(resolve(dirname(resolve(benchRoot, rel!)), `${from}.ts`))) as Record<string, unknown>;
          for (const name of names!.split(",").map((n) => n.trim().split(/\s+as\s+/)[0]!)) {
            const id = (mod[name] as { id?: unknown } | undefined)?.id;
            if (typeof id === "string") specIds.push(id);
          }
        }
        expect(specIds, `${entry.id} ${engine} adapter must load the spec registered as ${entry.id}`).toEqual([entry.id]);
      }
    }
  });
});
