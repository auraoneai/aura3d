import { defineAuraAssets } from "@aura3d/engine";

/**
 * Logical procedural asset keys for Grid Dispatch (`src/art/proceduralModels.ts`).
 *
 * Every vehicle, San Francisco landmark, street-front facade, and kerbside commuter
 * is built 100% procedurally with `@aura3d/engine` (`geometry.define`, `geometry.multiMaterial`,
 * `group`, and `material.*` presets) — zero external binary 3D model files are loaded.
 */
export type GridAssetKey =
  | "gridCruiser"
  | "gridRivalCruiser"
  | "gridCoupe"
  | "gridTruck"
  | "gridGt"
  | "gridInterceptor"
  | "gridCablecar"
  | "gridSedan"
  | "gridHatch"
  | "gridTaxi"
  | "gridVan"
  | "gridPickup"
  | "gridBoxTruck"
  | "gridBldgVictorian"
  | "gridPyramidTower"
  | "gridGlassTower"
  | "gridBridgeTower"
  | "gridBridgeDeck"
  | "gridPassenger"
  | "gridBldgNew1"
  | "gridBldgNew2"
  | "gridBldgMidrise"
  | "gridBldgGlassTower"
  | "gridBldgArtDeco";

export const assets = defineAuraAssets({});

/** Root `aura.assets.json` mapping: empty now that 100% of 3D geometry is procedural `@aura3d/engine`. */
export const CATALOG_IDS: Readonly<Record<string, string | null>> = {};
