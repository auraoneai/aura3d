import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
} as const);

export type AuraGeneratedAssets = typeof assets;
