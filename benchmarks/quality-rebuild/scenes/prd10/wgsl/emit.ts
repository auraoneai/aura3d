/**
 * PRD-10 T2.4 — writes the lane-10 terrain WGSL modules to disk so
 * `qr-prd10-wgsl.yml` can run naga over each file (naga exits non-zero on any
 * parse or validation error, which is the CI stand-in for WebGPU
 * `getCompilationInfo()` reporting 0 errors until #260 wires the WebGPU path).
 *
 * Run: `pnpm exec tsx benchmarks/quality-rebuild/scenes/prd10/wgsl/emit.ts <outDir>`
 *
 * Emitted:
 *   terrain-program.wgsl          — TERRAIN_WGSL, the full vertex + fragment program
 *   a3d_prd10_terrain_cdlod.wgsl  — the standalone CDLOD chunk twin
 *   a3d_prd10_terrain_splat.wgsl  — the standalone splat chunk twin
 *   prd10-underwater-distortion.wgsl — the C-13 underwater post pass twin
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { TERRAIN_WGSL } from "../../../../../packages/rendering/src/world/terrain/shaders/terrain.vert.glsl";
import { a3d_prd10_terrain_cdlod } from "../../../../../packages/rendering/src/world/terrain/shaders/terrainCdlod";
import { a3d_prd10_terrain_splat } from "../../../../../packages/rendering/src/world/terrain/shaders/terrainSplat";
import { UNDERWATER_DISTORTION_WGSL } from "../../../../../packages/rendering/src/world/water/UnderwaterState";

export const PRD10_WGSL_MODULES: Readonly<Record<string, string>> = {
  "terrain-program": TERRAIN_WGSL,
  [a3d_prd10_terrain_cdlod.name]: a3d_prd10_terrain_cdlod.wgsl ?? "",
  [a3d_prd10_terrain_splat.name]: a3d_prd10_terrain_splat.wgsl ?? "",
  "prd10-underwater-distortion": UNDERWATER_DISTORTION_WGSL
};

const outDir = process.argv[2] ?? path.join("benchmarks", "quality-rebuild", "scenes", "prd10", "wgsl", "out");
mkdirSync(outDir, { recursive: true });
let written = 0;
for (const [name, source] of Object.entries(PRD10_WGSL_MODULES)) {
  if (source.trim().length === 0) {
    console.error(`prd10 wgsl emit: module ${name} is empty`);
    process.exit(1);
  }
  writeFileSync(path.join(outDir, `${name}.wgsl`), source, "utf8");
  written += 1;
}
console.log(`prd10 wgsl emit: wrote ${written} module(s) to ${outDir}`);
