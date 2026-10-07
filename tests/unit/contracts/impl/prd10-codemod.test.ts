import { describe, expect, it } from "vitest";
import { codemodFor } from "../../../../packages/aura3d-cli/src/contracts/commands";
import "../../../../packages/aura3d-cli/src/commands/prd10/index";

/**
 * PRD-10 T1.15 — `prd10-world-migrate` reports every §10 pattern and rewrites
 * the two mechanical ones (`water.surface`, `water.buoyancy`) in `code`.
 * Fixtures inline (the PRD path `tests/qr/prd10/` is owner-15 territory).
 */

const fixture = `import { water } from "@aura3d/engine";

const pond = water.surface({ preset: "calm" });
water.buoyancy(pond, box);
prefabs.cityBlock(4, 3);
city.block({ size: 8 });
environments.studio("productHero");
lights.ambient({ intensity: 0.4 });
const oceanMat = material.pbr({ color: "#336", metallic: 0.8 });
function generateTerrain() { return null; }
`;

const mod = codemodFor("prd10-world-migrate");

describe("prd10-world-migrate codemod", () => {
  it("is registered", () => {
    expect(mod).toBeDefined();
    expect(mod?.owner).toBe("prd10");
  });

  it("reports a row per §10 pattern with file/line", () => {
    const { rows } = mod!.transform(fixture, "route.ts");
    const constructs = rows.map((r) => r.construct);
    for (const expected of [
      "water.surface",
      "water.buoyancy",
      "prefabs.cityBlock / city.block",
      "environments.studio",
      "lights.ambient",
      "material.pbr metallic on water/ocean",
      "route-local terrain builder"
    ]) {
      expect(constructs, `missing ${expected}`).toContain(expected);
    }
    expect(rows.every((r) => r.file === "route.ts" && r.line > 0)).toBe(true);
    // city.block appears once (line 6); both cityBlock + city.block produce rows.
    expect(rows.filter((r) => r.construct === "prefabs.cityBlock / city.block")).toHaveLength(2);
  });

  it("rewrites only the two mechanical patterns in code", () => {
    const { code } = mod!.transform(fixture, "route.ts");
    expect(code).toContain("world.water({ preset: \"calm\" })");
    expect(code).toContain("app.world.water(/* water body id */).heightAt(pond, box)");
    expect(code).toContain("prefabs.cityBlock(4, 3)"); // report-only
    expect(code).toContain("city.block({ size: 8 })"); // report-only
    expect(code).toContain("generateTerrain"); // report-only
  });

  it("clean sources produce no rows", () => {
    const { rows, code } = mod!.transform("const a = world.water({ kind: 'lake' });\n", "ok.ts");
    expect(rows).toHaveLength(0);
    expect(code).toContain("world.water");
  });
});
