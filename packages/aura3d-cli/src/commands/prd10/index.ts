/**
 * C-39 lane command registrations — prd10 (CONTRACTS.md).
 *
 * T1.15 — `prd10-world-migrate` codemod (§10.1). Report mode is the default;
 * `--write` rewrites only the two mechanical patterns (`water.surface`,
 * `water.buoyancy`). Rows use the C-39 shape
 * `{ file, line, construct, mapping, target, note }`.
 */
import { registerCodemod } from "../../contracts/commands";

type CodemodRow = { readonly file: string; readonly line: number; readonly construct: string; readonly mapping: "exact" | "approximate" | "none"; readonly target?: string; readonly note?: string };

interface Pattern {
  readonly re: RegExp;
  readonly construct: string;
  readonly mapping: "exact" | "approximate" | "none";
  readonly target?: string;
  readonly note?: string;
  /** Applied to `code` when the runner chooses --write. */
  readonly rewrite?: { readonly find: RegExp; readonly replace: string };
}

const PATTERNS: readonly Pattern[] = [
  {
    re: /\bwater\.surface\s*\(/,
    construct: "water.surface",
    mapping: "approximate",
    target: "world.water",
    note: "preset maps to { kind: 'lake' | 'ocean', shape, height }; waves preset differs",
    rewrite: { find: /\bwater\.surface\s*\(/g, replace: "world.water(" }
  },
  {
    re: /\bwater\.buoyancy\s*\(/,
    construct: "water.buoyancy",
    mapping: "approximate",
    target: "app.world.water(id).heightAt",
    note: "pick the water body id; heightAt(x, z, t) returns the live surface height",
    rewrite: { find: /\bwater\.buoyancy\s*\(/g, replace: "app.world.water(/* water body id */).heightAt(" }
  },
  {
    re: /\bprefabs\.cityBlock\b|\bcity\.block\s*\(/,
    construct: "prefabs.cityBlock / city.block",
    mapping: "none",
    target: "world.street + world.kits.city",
    note: "layout differs — manual migration"
  },
  {
    re: /\benvironments\.studio\s*\(/,
    construct: "environments.studio",
    mapping: "approximate",
    target: 'world.biome("outdoor-day")',
    note: "when the route is an outdoor category (city-day, racing, golf)"
  },
  {
    re: /\blights\.ambient\s*\(/,
    construct: "lights.ambient",
    mapping: "none",
    note: "no environment node — a biome is recommended (the C-09 fix is PRD 02's)"
  },
  {
    re: /(?:water|ocean)[\w$]*\b[^;\n]*\bmaterial\.pbr\s*\(|material\.pbr\s*\([^)]*metal(?:lic|ness)/i,
    construct: "material.pbr metallic on water/ocean",
    mapping: "none",
    note: "water is a dielectric — drop metallic/metalness"
  },
  {
    re: /\b(?:generateTerrain|buildTerrain|createTerrain\w*)\s*\(/,
    construct: "route-local terrain builder",
    mapping: "none",
    target: "world.terrain",
    note: "route-local terrain construction — port to world.terrain (heightmap/procedural source)"
  }
];

registerCodemod({
  name: "prd10-world-migrate",
  owner: "prd10",
  description:
    "PRD-10 §10 migration report/rewrites: water.surface/buoyancy → world.water; " +
    "cityBlock/city.block → world.street+kits.city; environments.studio → world.biome; " +
    "ambient-without-env, metallic-water and route-local terrain builders (report-only).",
  transform(source, fileName) {
    const rows: CodemodRow[] = [];
    const lines = source.split("\n");
    for (const pattern of PATTERNS) {
      lines.forEach((line, i) => {
        pattern.re.lastIndex = 0;
        if (pattern.re.test(line)) {
          rows.push({
            file: fileName,
            line: i + 1,
            construct: pattern.construct,
            mapping: pattern.mapping,
            ...(pattern.target ? { target: pattern.target } : {}),
            ...(pattern.note ? { note: pattern.note } : {})
          });
        }
      });
    }
    let code = source;
    for (const pattern of PATTERNS) {
      if (pattern.rewrite) code = code.replace(pattern.rewrite.find, pattern.rewrite.replace);
    }
    return { code, rows };
  }
});

/**
 * T3.6 §9.6 — `aura3d assets bake-impostor` (C-39). Plan + manifest modes are
 * pure; `--execute` renders the atlas in a WebGL2 bake page on the remote
 * macos-14 runner (Playwright + ANGLE Metal, tools/impostor-bake/bake-page.mjs).
 */
import { registerCliCommand } from "../../contracts/commands";

registerCliCommand({
  name: "assets bake-impostor",
  owner: "prd10",
  summary: "Bake octahedral impostor atlases (albedo+alpha, normal+depth) for a model asset",
  usage: "aura3d assets bake-impostor --asset <id> [--views 8] [--size 256] [--out <dir>] [--execute]",
  async run(argv, io) {
    const { runImpostorBake } = await import("../../../../../tools/impostor-bake/index.js");
    return runImpostorBake(argv, io);
  }
});
