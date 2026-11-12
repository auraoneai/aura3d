import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "../../..");

/**
 * Frozen 29-game procedural model module manifest from
 * `docs/prds/29-games-procedural-multi-material-overhaul-prd.md` Section 4 + reference `Slingshot Siege`.
 */
export const PROCEDURAL_MODEL_MODULES: readonly { readonly wp: string; readonly slug: string; readonly relPath: string }[] = [
  { wp: "REF", slug: "slingshot-siege", relPath: "apps/showcase-slingshot-siege/src/art/proceduralModels.ts" },
  { wp: "WP-01", slug: "top-tennis", relPath: "examples/aura-slam/art/proceduralModels.ts" },
  { wp: "WP-02", slug: "roadster-rush", relPath: "apps/showcase-roadster-rush/src/art/proceduralModels.ts" },
  { wp: "WP-03", slug: "heatsink", relPath: "apps/showcase-heatsink/src/art/proceduralModels.ts" },
  { wp: "WP-04", slug: "teleoperator", relPath: "apps/showcase-teleoperator/src/art/proceduralModels.ts" },
  { wp: "WP-05", slug: "iron-crown", relPath: "apps/showcase-iron-crown/src/art/proceduralModels.ts" },
  { wp: "WP-06", slug: "pips-big-leap", relPath: "apps/showcase-pips-big-leap/src/art/proceduralModels.ts" },
  { wp: "WP-07", slug: "aura-hoops-3d", relPath: "apps/showcase-aura-hoops-3d/src/art/proceduralModels.ts" },
  { wp: "WP-08", slug: "aura-diamond-3d", relPath: "apps/showcase-aura-diamond-3d/src/art/proceduralModels.ts" },
  { wp: "WP-09", slug: "aura-fc-3d", relPath: "apps/showcase-aura-fc-3d/src/art/proceduralModels.ts" },
  { wp: "WP-10", slug: "aura-links-3d", relPath: "apps/showcase-aura-links-3d/src/art/proceduralModels.ts" },
  { wp: "WP-11", slug: "bunker-zero", relPath: "apps/showcase-bunker-zero/src/art/proceduralModels.ts" },
  { wp: "WP-12", slug: "dot-dash-3d", relPath: "apps/showcase-dot-dash-3d/src/art/proceduralModels.ts" },
  { wp: "WP-13", slug: "cross-hop", relPath: "apps/showcase-cross-hop/src/art/proceduralModels.ts" },
  { wp: "WP-14", slug: "shape-shift-sprint", relPath: "apps/showcase-shape-shift-sprint/src/art/proceduralModels.ts" },
  { wp: "WP-15", slug: "number-surge", relPath: "apps/showcase-number-surge/src/art/proceduralModels.ts" },
  { wp: "WP-16", slug: "splat-turf", relPath: "apps/showcase-splat-turf/src/art/proceduralModels.ts" },
  { wp: "WP-17", slug: "polarity-orbs", relPath: "apps/showcase-polarity-orbs/src/art/proceduralModels.ts" },
  { wp: "WP-18", slug: "beat-hopper", relPath: "apps/showcase-beat-hopper/src/art/proceduralModels.ts" },
  { wp: "WP-19", slug: "craterline-gp", relPath: "examples/strange-orbit-port/art/proceduralModels.ts" },
  { wp: "WP-20", slug: "splat-rush-port", relPath: "examples/splat-rush-port/art/proceduralModels.ts" },
  { wp: "WP-21", slug: "serpentine-sky-run-port", relPath: "examples/saiyan-snake-way-port/art/proceduralModels.ts" },
  { wp: "WP-22", slug: "drift-and-deliver-port", relPath: "examples/drift-and-deliver-port/art/proceduralModels.ts" },
  { wp: "WP-23", slug: "heatsink-port", relPath: "examples/heatsink-port/art/proceduralModels.ts" },
  { wp: "WP-24", slug: "ninja-runner-port", relPath: "examples/ninja-runner-port/art/proceduralModels.ts" },
  { wp: "WP-25", slug: "last-train-port", relPath: "examples/last-train-port/art/proceduralModels.ts" },
  { wp: "WP-26", slug: "roadster-hours-port", relPath: "examples/roadster-hours-port/art/proceduralModels.ts" },
  { wp: "WP-27", slug: "where-the-wind-wanders-port", relPath: "examples/where-the-wind-wanders-port/art/proceduralModels.ts" },
  { wp: "WP-28", slug: "silt-and-signal-port", relPath: "examples/silt-and-signal-port/art/proceduralModels.ts" },
  { wp: "WP-29", slug: "cloud-runner-port", relPath: "examples/kid-goku-beyond-the-clouds-port/art/proceduralModels.ts" }
];

const CURVED_SCULPTING_BUILDERS = [
  "loftSectionsMesh",
  "latheMesh",
  "tubeSweepMesh",
  "extrudePolygonMesh",
  "extrudeStarPolygonMesh",
  "icosphereFacetMesh",
  "wheelAssemblySlots",
  "latticeTrussMesh",
  "archwayVoussoirSlots",
  "layeredCanopyMesh",
  "coniferBoughTierMesh",
  "stratifiedCliffMesh"
] as const;

describe("WP-00 automated Anti-Lego procedural craft gate", () => {
  it("keeps apps/showcase-port-shared/proceduralKernel.ts free of three.js imports", () => {
    const kernelSrc = readFileSync(resolve(REPO_ROOT, "apps/showcase-port-shared/proceduralKernel.ts"), "utf8");
    expect(kernelSrc).not.toMatch(/from\s+["']three(?:\/[^"']*)?["']/);
    expect(kernelSrc).not.toMatch(/import\s*\(\s*["']three(?:\/[^"']*)?["']\s*\)/);
  });

  it("enforces >=350 lines, curved/lofted/lathed/swept sculpting, >=4 physical material presets, and zero three.js imports on every authored proceduralModels.ts", () => {
    const present = PROCEDURAL_MODEL_MODULES.filter((entry) => existsSync(resolve(REPO_ROOT, entry.relPath)));
    expect(present.length).toBeGreaterThanOrEqual(1);

    for (const entry of present) {
      const absPath = resolve(REPO_ROOT, entry.relPath);
      const src = readFileSync(absPath, "utf8");
      const lines = src.split(/\r?\n/).length;

      expect(lines, `${entry.wp} (${entry.relPath}) must be >= 350 lines of sculpted procedural geometry`).toBeGreaterThanOrEqual(350);

      // Zero three.js imports / bridges
      expect(src, `${entry.wp} (${entry.relPath}) must not import three`).not.toMatch(/from\s+["']three(?:\/[^"']*)?["']/);
      expect(src, `${entry.wp} (${entry.relPath}) must not dynamic-import three`).not.toMatch(/import\s*\(\s*["']three(?:\/[^"']*)?["']\s*\)/);
      expect(src, `${entry.wp} (${entry.relPath}) must not reference THREE.*`).not.toMatch(/\bTHREE\./);

      // Must call genuine curved/lofted/lathed/swept/compound builders — never bevelBoxMesh alone
      const usedCurvedBuilders = CURVED_SCULPTING_BUILDERS.filter((fn) => new RegExp(`\\b${fn}\\s*\\(`).test(src));
      expect(
        usedCurvedBuilders.length,
        `${entry.wp} (${entry.relPath}) must use >= 2 curved/lofted/lathed/swept sculpting builders (found: ${usedCurvedBuilders.join(", ") || "none"})`
      ).toBeGreaterThanOrEqual(2);

      // Must author >= 4 distinct @aura3d/engine material.* preset calls (or >= 3 distinct factories across >= 4 material definitions)
      const materialFactoryMatches = [...src.matchAll(/\bmaterial\.([a-zA-Z0-9_]+)\s*\(/g)].map((m) => m[1]!);
      const distinctFactories = new Set(materialFactoryMatches.filter((m) => m !== "proceduralTextures"));
      expect(
        materialFactoryMatches.length,
        `${entry.wp} (${entry.relPath}) must define >= 4 physical material.* lobes`
      ).toBeGreaterThanOrEqual(4);
      expect(
        distinctFactories.size,
        `${entry.wp} (${entry.relPath}) must use >= 3 distinct material.* factory presets (found: ${[...distinctFactories].join(", ")})`
      ).toBeGreaterThanOrEqual(3);

      // Must assemble real multi-material or grouped geometry specs
      expect(
        /\b(?:assembleMultiMaterialNode|multiMaterial|buildGroupedGeometrySpec)\b/.test(src),
        `${entry.wp} (${entry.relPath}) must assemble multi-material geometry`
      ).toBe(true);
    }

    expect(
      present.map((p) => p.wp),
      "All 30 games (REF + WP-01..WP-29) must have authored proceduralModels.ts modules"
    ).toEqual(PROCEDURAL_MODEL_MODULES.map((p) => p.wp));
  });
});
