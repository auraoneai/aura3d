import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetMap } from "@aura3d/engine";

export type CritterAssetId =
  | "hop"
  | "chick"
  | "turtle"
  | "bun"
  | "axolotl"
  | "ducky"
  | "roboFrog"
  | "toastCat"
  | "mushroomKid"
  | "knightToad"
  | "astroFrog"
  | "goldenHop";

export const CRITTER_ASSET_IDS: readonly CritterAssetId[] = [
  "hop",
  "chick",
  "turtle",
  "bun",
  "axolotl",
  "ducky",
  "roboFrog",
  "toastCat",
  "mushroomKid",
  "knightToad",
  "astroFrog",
  "goldenHop"
] as const;

type AuraGeneratedAssetDefinitions = Record<string, never>;

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({});
