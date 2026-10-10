/**
 * Lane prd10 barrel (CONTRACTS.md §3.8, PRD-10 §8.0): registers every
 * `a3d_prd10_*` C-02 ShaderChunk — GLSL ES 3.00 body + hand-written WGSL twin.
 * Chunk bodies live under `world/** /shaders/`.
 */
import { registerShaderChunk } from "../contracts/program.js";
import { a3d_prd10_wind } from "../world/vegetation/shaders/wind.js";
import { a3d_prd10_foliage } from "../world/vegetation/shaders/foliage.js";
import { a3d_prd10_impostor } from "../world/vegetation/shaders/impostor.js";
import { a3d_prd10_grass } from "../world/vegetation/shaders/grass.js";
import { a3d_prd10_terrain_cdlod } from "../world/terrain/shaders/terrainCdlod.js";
import { a3d_prd10_terrain_splat } from "../world/terrain/shaders/terrainSplat.js";
import { a3d_prd10_gerstner } from "../world/water/shaders/gerstner.js";
import { a3d_prd10_water } from "../world/water/shaders/water.js";
import { a3d_prd10_caustics } from "../world/water/shaders/caustics.js";
import { a3d_prd10_space_bake } from "../world/space/shaders/spaceBake.js";
import { a3d_prd10_planet } from "../world/space/shaders/planet.js";
import { a3d_prd10_world_light_fallback } from "../world/shared/shaders/worldLightFallback.js";

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

let registered = false;
/**
 * FIX-chunks (10-CHUNKS): explicit entry point — `"sideEffects": false`
 * drops this module's registration loop in chunked builds. The engine lane
 * calls `registerPrd10Chunks()` so registration is a real dependency edge.
 */
export function registerPrd10Chunks(): void {
  if (registered) return;
  registered = true;
  for (const chunk of prd10ShaderChunks) {
    registerShaderChunk(chunk);
  }
}
registerPrd10Chunks();
