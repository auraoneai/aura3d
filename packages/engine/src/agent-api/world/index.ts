/**
 * PRD-10 world agent API barrel + the `world` namespace (§7.1): terrain,
 * water, scatter/grass, splines/extrusion, kits, placement, room and street.
 */
export * from "./types.js";
export * from "./wind.js";
export * from "./biomes.js";
export * from "./queries.js";
export * from "./terrain.js";
export * from "./water.js";
export * from "./scatter.js";
export * from "./spline.js";
export * from "./kits.js";
export * from "./placement.js";
export * from "./room.js";
export * from "./street.js";
export * from "./runtime.js";

import { worldTerrain } from "./terrain.js";
import { worldWater } from "./water.js";
import { worldScatter, worldGrass } from "./scatter.js";
import { worldSpline, worldExtrude } from "./spline.js";
import { worldKits } from "./kits.js";
import { worldPlaceAlong, worldPlaceGrid, worldPlacePoisson } from "./placement.js";
import { worldRoom } from "./room.js";
import { worldStreet } from "./street.js";
import { worldBiome, worldBiomes, worldTimeOfDay, worldWind } from "./timeOfDay.js";
import { setWorldBuilderFlags } from "./flags.js";

export { setWorldBuilderFlags, worldBuilderFlags, type AuraWorldBuilderFlagSource } from "./flags.js";

/**
 * §7.1 `world.*` builder namespace. GU47 E-G (WP-7): exported from the
 * `@aura3d/engine` root. `world.scatter` / `world.grass` accept a heightfield
 * sampler `heightAt: (x, z) => y`; `world.useAppFlags(qualityRebuild)` makes
 * builder-time flag reads (`water.surface`, `environments.outdoor`, ...) use
 * the app's `qualityRebuild.flags` — call it before building the scene.
 */
export const world = {
  terrain: worldTerrain,
  water: worldWater,
  scatter: worldScatter,
  grass: worldGrass,
  spline: worldSpline,
  extrude: worldExtrude,
  kits: worldKits,
  placeAlong: worldPlaceAlong,
  placeGrid: worldPlaceGrid,
  placePoisson: worldPlacePoisson,
  room: worldRoom,
  street: worldStreet,
  biome: worldBiome,
  biomes: worldBiomes,
  timeOfDay: worldTimeOfDay,
  wind: worldWind,
  useAppFlags: setWorldBuilderFlags
} as const;
