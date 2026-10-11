/**
 * PRD-10 world adapters: with `world` resolved on, the outdoor prd10 bench
 * scenes drop their primitive stand-ins and add real world.* nodes; with it
 * off the spec is untouched and no world node is added.
 */
import { describe, expect, it } from "vitest";
import { getPrd10Scene } from "../../../../benchmarks/quality-rebuild/scenes/prd10/index";
import { PRD10_WORLD_SCENE_IDS, prd10SpecFor, prd10WorldNodes, worldOn } from "../../../../benchmarks/quality-rebuild/aura3d/scenes/prd10/world";

describe("prd10 world adapters", () => {
  it("resolves the world flag from capture flag lists", () => {
    expect(worldOn(["none"])).toBe(false);
    expect(worldOn(undefined)).toBe(false);
    expect(worldOn(["world"])).toBe(true);
    expect(worldOn(["all"])).toBe(true);
    expect(worldOn(["core", "lighting", "world", "tiers"])).toBe(true);
    expect(worldOn(["all", "-world"])).toBe(false);
  });

  it("world off: spec unchanged, no world nodes", () => {
    for (const id of PRD10_WORLD_SCENE_IDS) {
      const spec = getPrd10Scene(id);
      expect(prd10SpecFor(spec, false)).toBe(spec);
      expect(prd10WorldNodes(id, false)).toEqual([]);
    }
  });

  it("world on: stand-ins removed and terrain (plus grass/water) added", () => {
    for (const id of PRD10_WORLD_SCENE_IDS) {
      const spec = getPrd10Scene(id);
      const swapped = prd10SpecFor(spec, true);
      expect(swapped.objects.length, id).toBeLessThan(spec.objects.length);
      const kinds = prd10WorldNodes(id, true).map((node) => (node as unknown as { kind: string }).kind);
      expect(kinds, id).toContain("terrain");
    }
    const kindsOf = (id: string) => prd10WorldNodes(id, true).map((n) => (n as unknown as { kind: string }).kind);
    expect(kindsOf("prd10-meadow-grass")).toContain("grass");
    expect(kindsOf("prd10-coast-water")).toContain("water");
  });

  it("scenes without a world build yet keep their stand-ins", () => {
    const spec = getPrd10Scene("prd10-space-orbit");
    expect(prd10SpecFor(spec, true)).toBe(spec);
    expect(prd10WorldNodes("prd10-space-orbit", true)).toEqual([]);
  });
});
