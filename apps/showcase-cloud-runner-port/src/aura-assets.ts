// Cumulus Dash route-local typed assets (WP-29): static generated set-piece GLBs (storm towers and cottage)
// have been replaced with sculpted multi-material procedural assemblies in
// examples/kid-goku-beyond-the-clouds-port/art/proceduralModels.ts.
// Only the rigged runner character (MESHY.hero, skins=1) remains mounted.
import { defineAuraAssets, type AuraAssetDefinition } from "@aura3d/engine";

const definitions = {} satisfies Record<string, AuraAssetDefinition>;

export const assets = defineAuraAssets(definitions);
