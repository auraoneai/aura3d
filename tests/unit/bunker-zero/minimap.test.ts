import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BLUEPRINT, blueprintEdges } from "../../../apps/showcase-bunker-zero/src/art/minimap";
import { FLOORS } from "../../../apps/showcase-bunker-zero/src/maps";

const MAIN = readFileSync(path.resolve("apps/showcase-bunker-zero/src/main.ts"), "utf8");

describe("Bunker Zero blueprint minimap (BZ-17)", () => {
  it("outlines a single open cell with four unit edges", () => {
    const grid = "####.####".split("");
    expect(blueprintEdges(grid, 3, 3).map((e) => e.join(",")).sort()).toEqual(["1,1,1,2", "1,1,2,1", "1,2,2,2", "2,1,2,2"]);
  });

  it("merges straight runs: a 1x3 corridor is 4 strokes", () => {
    const grid = ["#", "#", "#", "#", "#", ".", ".", ".", "#", "#", "#", "#", "#", "#", "#"];
    expect(blueprintEdges(grid, 5, 3)).toHaveLength(4);
  });

  it("draws every floor with edges only on the solid/open boundary and fewer strokes than cells", () => {
    for (const def of FLOORS) {
      const w = def.rows[0]!.length, h = def.rows.length;
      const edges = blueprintEdges(def.rows.join("").split(""), w, h);
      expect(edges.length, def.name).toBeGreaterThan(10);
      expect(edges.length, def.name).toBeLessThan(w * h);
      for (const [x0, z0, x1, z1] of edges) expect(x0 === x1 || z0 === z1).toBe(true);
    }
  });

  it("uses the blueprint palette with the lamp colour for the player and exit", () => {
    expect(BLUEPRINT.door).toBe("#e8b400");
    expect(MAIN).toContain("blueprintEdges(s.grid, s.w, s.h)");
    expect(MAIN).toMatch(/const lamp = lookOfSlot\(activeSlot\(\)\)\.lamp\.color/);
  });
});
