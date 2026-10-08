/**
 * PRD-06 §13 perf-tier lane scenes (S12): `prd06-perf-tier-{low,medium,high,
 * ultra}` carry the stated tier loads — hero(es) with foot IK + springs plus
 * the NPC count, looping animation on every actor, one directional shadow
 * light, no post — and register on all three C-30 indices (shared spec +
 * aura3d adapter + three adapter) as active entries.
 */
import { describe, expect, it } from "vitest";
import {
  prd06PerfTierHigh,
  prd06PerfTierLow,
  prd06PerfTierMedium,
  prd06PerfTierUltra,
  type PerfTierSpec
} from "../../../../benchmarks/quality-rebuild/scenes/prd06/perf-tier";
import { scenes as sharedScenes } from "../../../../benchmarks/quality-rebuild/scenes/prd06/index";
import { scenes as auraScenes } from "../../../../benchmarks/quality-rebuild/aura3d/scenes/prd06/index";
import { scenes as threeScenes } from "../../../../benchmarks/quality-rebuild/three/scenes/prd06/index";
import { rampStairsHeightAt } from "../../../../benchmarks/quality-rebuild/shared/terrain";

const SPECS: readonly PerfTierSpec[] = [prd06PerfTierLow, prd06PerfTierMedium, prd06PerfTierHigh, prd06PerfTierUltra];
const EXPECTED = {
  "prd06-perf-tier-low": { heroes: 1, npcs: 4, cpuAnimMs: 1.0, gpuMs: 1.0, memoryMB: 12 },
  "prd06-perf-tier-medium": { heroes: 1, npcs: 8, cpuAnimMs: 1.5, gpuMs: 1.8, memoryMB: 32 },
  "prd06-perf-tier-high": { heroes: 2, npcs: 16, cpuAnimMs: 2.5, gpuMs: 3.0, memoryMB: 64 },
  "prd06-perf-tier-ultra": { heroes: 2, npcs: 32, cpuAnimMs: 4.0, gpuMs: 5.0, memoryMB: 128 }
} as const;

describe("prd06-perf-tier-* lane specs (§13)", () => {
  it("register on all three C-30 lane indices, non-reference", () => {
    for (const spec of SPECS) {
      for (const index of [sharedScenes, auraScenes, threeScenes]) {
        const entry = index.find((scene) => scene.id === spec.id);
        expect(entry, `${spec.id} registered`).toBeDefined();
        expect(entry!.spec).toBe(spec);
        expect(entry!.admittedAsReference).toBe(false);
      }
    }
  });

  it("carries the §13 stated load: hero + NPC counts, budgets, one shadow light, no post", () => {
    for (const spec of SPECS) {
      const expected = EXPECTED[spec.id as keyof typeof EXPECTED];
      expect(spec.perfTier.heroes).toBe(expected.heroes);
      expect(spec.perfTier.npcs).toBe(expected.npcs);
      expect(spec.perfTier.budgets.cpuAnimMs).toBe(expected.cpuAnimMs);
      expect(spec.perfTier.budgets.gpuSkinMorphShadowMs).toBe(expected.gpuMs);
      expect(spec.perfTier.budgets.memoryMB).toBe(expected.memoryMB);
      expect(spec.perfTier.budgets.bundleDeltaKb).toBe(8);

      const models = spec.objects.filter((o) => o.kind === "model");
      expect(models.length).toBe(expected.heroes + expected.npcs);
      // Every actor loops a clip — the mixer cost is what the tier measures.
      for (const model of models) {
        expect(model.animation?.loop).toBe(true);
        expect(model.castShadow).toBe(true);
      }
      const heroes = models.filter((o) => o.animation?.footIk !== undefined);
      const npcs = models.filter((o) => o.animation?.footIk === undefined);
      expect(heroes.length).toBe(expected.heroes);
      expect(npcs.length).toBe(expected.npcs);
      // Heroes: sprint + foot IK + spring chains; NPCs: looping walk.
      for (const hero of heroes) {
        expect(hero.animation?.clip).toBe(spec.perfTier.heroClip);
        expect(hero.animation?.springChains?.length).toBe(spec.perfTier.springChainsPerHero);
        expect(hero.animation?.runtimeId).toBe(`${spec.id}-hero-${heroes.indexOf(hero)}`);
      }
      for (const npc of npcs) expect(npc.animation?.clip).toBe(spec.perfTier.npcClip);

      // One directional shadow light, no environment/bloom/fog/csm.
      expect(spec.lights.length).toBe(1);
      const sun = spec.lights[0]!;
      expect(sun.kind).toBe("directional");
      if (sun.kind !== "directional") throw new Error(`unreachable: ${spec.id} sun is ${sun.kind}`);
      expect(sun.castShadow).toBe(true);
      expect(spec.environment).toBeUndefined();
      expect(spec.bloom).toBeUndefined();
      expect(spec.fog).toBeUndefined();
      expect(spec.csm).toBeUndefined();
      expect(spec.terrain?.kind).toBe("flat");
      expect(spec.owner).toBe("prd06");
      expect(spec.qrFlags).toContain("animation");
    }
  });

  it("documents its deltas from the §13 load column", () => {
    for (const spec of SPECS) {
      expect(spec.perfTier.approximations.length).toBeGreaterThan(0);
      expect(spec.perfTier.approximations.join(" ")).toContain("auraClashPlayerRig");
      expect(spec.perfTier.featureNotes.length).toBeGreaterThan(0);
    }
  });

  it("flat terrain is y=0 everywhere (foot-IK ground)", () => {
    for (const spec of SPECS) {
      const terrain = spec.terrain!;
      for (const [x, z] of [[-10, -10], [0, 0], [7.5, 3], [50, 20]] as const) {
        expect(rampStairsHeightAt(terrain, x, z)).toEqual({ height: 0, normal: [0, 1, 0] });
      }
    }
  });
});
