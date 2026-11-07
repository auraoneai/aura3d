/** Typed manifest for the admitted font asset (CLI typegen output shape; see aura.assets.json). */
import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "gtWalsheimBold": AuraAssetDefinition & { readonly type: "font"; readonly format: "woff2"; readonly url: string; readonly hash: string; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "gtWalsheimBold": {
    type: "font",
    format: "woff2",
    url: "/aura-assets/GT-Walsheim-Bold.woff2",
    hash: "sha256-d5ab0311ce5ef91c83710164c5674dda2796ebb703a7a6441f0d77c9b2779a1e",
    sizeBytes: 41492,
    metadata: {
      "license": "GT Walsheim Bold, AuraOne licensed font library (see public/aura-assets/PROVENANCE.md)"
    }
  }
});