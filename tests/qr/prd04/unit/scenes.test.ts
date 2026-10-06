/**
 * prd04 scene registration (PRD-04 §13 P1-10): every registered prd04 scene
 * id is unique, carries the `prd04-` prefix and the C-30 lane fields, and has
 * a per-scene adapter module on both engines (aura3d/scenes/prd04/<id>.ts and
 * three/scenes/prd04/<id>.ts) plus an entry in each lane's adapters map file.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { prd04SceneSpecs, scenes } from "../../../../benchmarks/quality-rebuild/scenes/prd04/index";

const benchRoot = resolve(__dirname, "../../../../benchmarks/quality-rebuild");

describe("prd04 scene registration", () => {
  it("registers the lane scenes (ten phase-1 scenes + prd04-transmission from P4-4)", () => {
    expect(scenes).toHaveLength(11);
    expect(Object.keys(prd04SceneSpecs)).toHaveLength(11);
  });

  it("scene ids are unique and carry the prd04- prefix", () => {
    const ids = scenes.map((scene) => scene.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^prd04-/);
      expect(prd04SceneSpecs[id]).toBeDefined();
    }
  });

  it("every spec carries the C-30 lane fields", () => {
    for (const [id, spec] of Object.entries(prd04SceneSpecs)) {
      expect(spec.owner, id).toBe("prd04");
      expect(spec.referenceProfile, id).toBe("contract");
      expect(spec.masks, id).toContain("object-id");
      expect(spec.primaryCriterion, id).toBeTruthy();
      expect(spec.primaryRegion, id).toBe("subject");
      expect(spec.qrFlags, id).toContain("materials");
    }
  });

  it("prd04-tiled-ground declares its strip spec", () => {
    const spec = prd04SceneSpecs["prd04-tiled-ground"];
    expect(spec.strip).toEqual({ frames: 12, intervalMs: 50, orbitDegrees: 6 });
  });

  it("every scene has a per-scene adapter module on both engines", () => {
    for (const id of Object.keys(prd04SceneSpecs)) {
      const aura = resolve(benchRoot, "aura3d/scenes/prd04", `${id}.ts`);
      const three = resolve(benchRoot, "three/scenes/prd04", `${id}.ts`);
      expect(existsSync(aura), `aura3d adapter for ${id}`).toBe(true);
      expect(existsSync(three), `three adapter for ${id}`).toBe(true);
    }
  });
});
