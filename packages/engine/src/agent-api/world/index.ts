/**
 * PRD-10 world agent API barrel + the `world` namespace (§7.1): `world.terrain`
 * in Phase 2; water/scatter/grass/street/biome land in later phases.
 */
export * from "./types.js";
export * from "./wind.js";
export * from "./biomes.js";
export * from "./queries.js";
export * from "./terrain.js";
export * from "./runtime.js";

import { worldTerrain } from "./terrain.js";

/** §7.1 `world.*` builder namespace. */
export const world = {
  terrain: worldTerrain
} as const;
