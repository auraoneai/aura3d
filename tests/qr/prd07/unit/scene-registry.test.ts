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
    expect(ids).toContain("prd07-impact-library");
    expect(ids).toContain("prd07-trails-beams");
  });

  it("entries flow into ALL_SCENES once", () => {
    const mine = ALL_SCENES.filter((entry) => entry.id.startsWith("prd07-"));
    expect(mine.length).toBe(scenes.length);
    expect(ALL_SCENES.length).toBe(new Set(ALL_SCENES.map((entry) => entry.id)).size);
  });

  it("both adapters exist for parity ids; Aura-only ids carry admittedAsReference:false", () => {
    for (const entry of scenes) {
      const spec = entry.spec as Prd07SceneSpec;
      const auraAdapter = join(benchDir, "aura3d/scenes/prd07", `${entry.id}.ts`);
      const threeAdapter = join(benchDir, "three/scenes/prd07", `${entry.id}.ts`);
      expect(existsSync(auraAdapter), `aura3d adapter ${entry.id}`).toBe(true);
      if (spec.admittedAsReference === false) {
        expect(existsSync(threeAdapter), `three adapter ${entry.id} must not exist (Aura-only)`).toBe(false);
      } else {
        expect(existsSync(threeAdapter), `three adapter ${entry.id}`).toBe(true);
      }
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

  it("impact-library sheet covers all 14 kinds at the four S3 ages, Aura-only", () => {
    const sheet = scenes.find((entry) => entry.id === "prd07-impact-library")!.spec as Prd07SceneSpec;
    expect(sheet.admittedAsReference).toBe(false);
    const burst = sheet.objects.find((object) => object.kind === "burstSheet")!;
    expect(burst.kind).toBe("burstSheet");
    const kinds = (burst as { kinds: readonly string[] }).kinds;
    const ages = (burst as { ages: readonly number[] }).ages;
    expect(kinds).toHaveLength(14);
    expect(ages).toEqual([0.03, 0.08, 0.2, 0.5]);
    expect(sheet.time).toBeGreaterThanOrEqual(Math.max(...ages) + 0.01);
  });

  it("trails-beams carries every S11 element kind", () => {
    const scene = scenes.find((entry) => entry.id === "prd07-trails-beams")!.spec as Prd07SceneSpec;
    const kinds = new Set(scene.objects.map((object) => object.kind));
    for (const required of ["trail", "beam", "lightCone", "auroraRibbon", "meshParticles"]) {
      expect(kinds.has(required as never), required).toBe(true);
    }
    const trails = scene.objects.filter((object) => object.kind === "trail");
    expect(trails.length).toBeGreaterThanOrEqual(3); // dash ribbon + twin contrails
  });

  it("fountain replica pins seed 1414, 2000 sprites, additive", () => {
    const fountain = scenes.find((entry) => entry.id === "prd07-particles-fountain")!.spec as Prd07SceneSpec;
    const particles = fountain.objects.find((object) => object.kind === "particles")!;
    expect(particles).toMatchObject({ kind: "particles", count: 2000, seed: 1414, blending: "additive", size: 0.06, color: "#ff9a3c" });
  });

  it("P3-T7 sky scenes carry vfx.sky flags + sky/fog spec fields", () => {
    const tod = scenes.find((entry) => entry.id === "prd07-sky-timeofday")!.spec as Prd07SceneSpec;
    expect(tod.dayNight?.hour).toBe(19);
    expect(tod.qrFlags).toContain("vfx.sky");
    const outdoor = scenes.find((entry) => entry.id === "prd07-outdoor-sky")!.spec as Prd07SceneSpec;
    expect(outdoor.skyPreetham?.elevationDeg).toBeGreaterThan(0);
    expect(outdoor.fog?.mode).toBe("exp2");
    expect(outdoor.fog?.density).toBeGreaterThan(0);
    expect(outdoor.qrFlags).toContain("vfx.sky");
    // Both are parity ids — three adapters exist (admittedAsReference default).
    expect(tod.admittedAsReference).not.toBe(false);
    expect(outdoor.admittedAsReference).not.toBe(false);
  });
});
