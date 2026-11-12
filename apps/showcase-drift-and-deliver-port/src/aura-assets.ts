// Gridlock Courier route-local typed assets (WP-22 procedural multi-material overhaul):
// All vehicles, city traffic fleet, landmarks, shopfronts, street furniture & drop-off parcel kiosk
// are authored as multi-material procedural geometry in `examples/drift-and-deliver-port/art/proceduralModels.ts`.
import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = Record<string, never>;

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({} as const);

export type AuraGeneratedAssets = typeof assets;
