// Cumulus Dash route-local typed assets: all hero, creature, prop, landmark, cottage, and cloud-tower models
// are 100% sculpted multi-material @aura3d/engine procedural assemblies in
// examples/kid-goku-beyond-the-clouds-port/art/proceduralModels.ts (zero external GLB assets).
import { defineAuraAssets, type AuraAssetDefinition } from "@aura3d/engine";

const definitions = {} satisfies Record<string, AuraAssetDefinition>;

export const assets = defineAuraAssets(definitions);
