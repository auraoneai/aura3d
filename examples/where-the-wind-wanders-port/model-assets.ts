/**
 * Procedural multi-material `@aura3d/engine` model registry for `The Bellkeeper's Walk`.
 *
 * Zero external `.glb` files are used: every sanctuary character, structure, tree, and prop
 * (`bell`, `belltower`, `boat`, `cottage`, `kite`, `hero`, `letter`, `oak`, `pine`, `shrub`,
 * `stones`, `wisp`) is sculpted procedurally in `art/proceduralModels.ts`.
 */
import { defineModelAssets } from "@aura3d/engine";

const LICENSE = "100% procedural @aura3d/engine multi-material assemblies authored in art/proceduralModels.ts";

export const MODEL_ASSETS = defineModelAssets({}, { license: LICENSE, queryParam: null }).refs;

export const PROCEDURAL_MODEL_KEYS = [
  "bell",
  "belltower",
  "boat",
  "cottage",
  "kite",
  "hero",
  "letter",
  "oak",
  "pine",
  "shrub",
  "stones",
  "wisp"
] as const;

export type ModelKey = (typeof PROCEDURAL_MODEL_KEYS)[number];

const PROCEDURAL_KEY_SET: ReadonlySet<string> = new Set<string>(PROCEDURAL_MODEL_KEYS);

export const hasModel = (key: string): key is ModelKey => PROCEDURAL_KEY_SET.has(key);
