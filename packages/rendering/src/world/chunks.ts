/**
 * PRD-10 §8.0 / 10-CHUNKS / T0-23: the 12 `a3d_prd10_*` C-02 ShaderChunks
 * and their explicit registration entry point, exported through the
 * `@aura3d/rendering/world` subpath so the engine lane imports a package
 * specifier instead of a cross-package relative path. `lanes/prd10.ts`
 * re-exports these and still registers on import.
 */
import { registerShaderChunk } from "../contracts/program.js";
import { a3d_prd10_wind, a3d_prd10_wind_deform } from "./vegetation/shaders/wind.js";
import { a3d_prd10_foliage } from "./vegetation/shaders/foliage.js";
import { a3d_prd10_impostor } from "./vegetation/shaders/impostor.js";
import { a3d_prd10_grass } from "./vegetation/shaders/grass.js";
import { a3d_prd10_terrain_cdlod } from "./terrain/shaders/terrainCdlod.js";
import { a3d_prd10_terrain_splat } from "./terrain/shaders/terrainSplat.js";
import { a3d_prd10_gerstner } from "./water/shaders/gerstner.js";
import { a3d_prd10_water } from "./water/shaders/water.js";
import { a3d_prd10_caustics, a3d_prd10_caustics_apply, a3d_prd10_caustics_pars } from "./water/shaders/caustics.js";
import { a3d_prd10_space_bake } from "./space/shaders/spaceBake.js";
import { a3d_prd10_planet } from "./space/shaders/planet.js";
import { a3d_prd10_world_light_fallback } from "./shared/shaders/worldLightFallback.js";

export const prd10ShaderChunks = [
  a3d_prd10_wind,
  a3d_prd10_terrain_splat,
  a3d_prd10_terrain_cdlod,
  a3d_prd10_foliage,
  a3d_prd10_impostor,
  a3d_prd10_grass,
  a3d_prd10_gerstner,
  a3d_prd10_water,
  a3d_prd10_caustics,
  a3d_prd10_space_bake,
  a3d_prd10_planet,
  a3d_prd10_world_light_fallback
] as const;

/**
 * #1143: generated-program (C-02, Path G) forms of the wind and caustics
 * chunks — pars/call split for `prd10.caustics`, C-18 `a3dDeform` entry for
 * `prd10.wind`. Kept apart from the 12 PRD-10 §8.0 chunks above.
 */
export const prd10GeneratedPathChunks = [a3d_prd10_wind_deform, a3d_prd10_caustics_pars, a3d_prd10_caustics_apply] as const;

let registered = false;
/**
 * FIX-chunks (10-CHUNKS): explicit entry point — `"sideEffects": false`
 * drops a module-level registration loop in chunked builds. The engine lane
 * calls `registerPrd10Chunks()` so registration is a real dependency edge.
 * Idempotent.
 */
export function registerPrd10Chunks(): void {
  if (registered) return;
  registered = true;
  for (const chunk of [...prd10ShaderChunks, ...prd10GeneratedPathChunks]) {
    registerShaderChunk(chunk);
  }
}
