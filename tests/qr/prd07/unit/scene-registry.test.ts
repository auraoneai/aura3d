// PRD-07 P1-T15 — lane scene registrations: unique ids, `prd07-` owner
// prefix, both adapters present for every id, SceneSpec contract fields.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scenes } from "../../../../benchmarks/quality-rebuild/scenes/prd07/index";
import { ALL_SCENES } from "../../../../benchmarks/quality-rebuild/shared/registry";
import type { Prd07SceneSpec } from "../../../../benchmarks/quality-rebuild/scenes/prd07/specs";

const benchDir = join(dirname(fileURLToPath(import.meta.url)), "../../../../benchmarks/quality-rebuild");

describe("prd07 lane scene registrations (C-30)", () => {
  it("ids are unique and carry the prd07- prefix", () => {
    const ids = scenes.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("prd07-")).toBe(true);
    expect(ids).toContain("prd07-particles-fountain");
    expect(ids).toContain("prd07-flipbook");
    expect(ids).toContain("prd07-particles-stress");
  });

  it("entries flow into ALL_SCENES once", () => {
    const mine = ALL_SCENES.filter((entry) => entry.id.startsWith("prd07-"));
    expect(mine.length).toBe(scenes.length);
    expect(ALL_SCENES.length).toBe(new Set(ALL_SCENES.map((entry) => entry.id)).size);
  });

  it("both adapters exist for every registered id", () => {
    for (const entry of scenes) {
      expect(existsSync(join(benchDir, "aura3d/scenes/prd07", `${entry.id}.ts`)), `aura3d adapter ${entry.id}`).toBe(true);
      expect(existsSync(join(benchDir, "three/scenes/prd07", `${entry.id}.ts`)), `three adapter ${entry.id}`).toBe(true);
    }
  });

  it("specs carry the SceneSpec contract fields and prd07 ownership", () => {
    for (const entry of scenes) {
      const spec = entry.spec as Prd07SceneSpec;
      expect(spec.id).toBe(entry.id);
      expect(spec.owner).toBe("prd07");
      expect(spec.resolution.width).toBeGreaterThan(0);
      expect(spec.camera.fov).toBeGreaterThan(0);
      expect(spec.objects.length).toBeGreaterThan(0);
      expect(spec.settleFrames).toBeGreaterThanOrEqual(0);
      expect(spec.time).toBeGreaterThan(0);
    }
  });

  it("fountain replica pins seed 1414, 2000 sprites, additive", () => {
    const fountain = scenes.find((entry) => entry.id === "prd07-particles-fountain")!.spec as Prd07SceneSpec;
    const particles = fountain.objects.find((object) => object.kind === "particles")!;
    expect(particles).toMatchObject({ kind: "particles", count: 2000, seed: 1414, blending: "additive", size: 0.06, color: "#ff9a3c" });
  });
});
