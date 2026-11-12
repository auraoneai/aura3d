import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = Record<string, never>;

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({} as const);

export type AuraGeneratedAssets = typeof assets;
