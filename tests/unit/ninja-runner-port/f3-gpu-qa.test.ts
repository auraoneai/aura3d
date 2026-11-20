/**
 * F3 real-GPU QA fixes: the evening river reads as water (deep teal lake look, not sky-salmon slabs), no backdrop hill
 * is dropped onto the winding course (the dark-green "sky triangle" at the river crossing), and the ember shell is a
 * faint rim that no longer hides the hero.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clearOfCourse, buildScenery, type ModelSink } from "../../../examples/ninja-runner-port/scenery";
import { PROP_MANIFEST } from "../../../examples/ninja-runner-port/assets/props/manifest";

const world = readFileSync("examples/ninja-runner-port/world.ts", "utf8");
const num = (name: string): number => Number(world.match(new RegExp(`export const ${name} = ([0-9.]+);`))![1]);

describe("Shadowstep F3 GPU QA", () => {
  it("the evening river always carries most of the teal lake look", () => {
    expect(num("EVENING_RIVER_LAKE")).toBeGreaterThanOrEqual(0.8);
    expect(world).toContain('river.setUniform?.("waterLake", EVENING_RIVER_LAKE');
  });

  it("every backdrop hill and peak stays clear of the whole course", () => {
    const sink: ModelSink = {};
    buildScenery(sink, { paintedTrees: true });
    const ridges = sink.ridge ?? [];
    expect(ridges.length).toBeGreaterThan(60);
    const m = PROP_MANIFEST.ridge!.size;
    for (const p of ridges) {
      const halfPlan = Math.max(m[0] * p.scale[0], m[2] * p.scale[2]) / 2;
      expect(clearOfCourse(p.position[0], p.position[2], Math.min(halfPlan, 60))).toBe(true);
    }
  });

  it("the ember shell is faint", () => {
    expect(num("EMBER_AURA_STRENGTH")).toBeLessThanOrEqual(0.5);
  });
});
