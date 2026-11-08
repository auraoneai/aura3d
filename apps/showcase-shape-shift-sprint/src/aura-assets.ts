/**
 * Typed manifest for the admitted font asset (mirrors aura.assets.json and the CLI typegen shape).
 *
 * Fonts are document/CSS assets, not engine-loadable asset types (`AuraAssetType` has no "font"),
 * so this manifest is a plain typed table instead of `defineAuraAssets`: the boot code loads the
 * face through `FontFace` from the same-origin copy and nothing here is ever fetched as a model.
 */
export const assets = {
  gtWalsheimBold: {
    type: "font",
    format: "woff2",
    url: "/aura-assets/GT-Walsheim-Bold.woff2",
    hash: "sha256-d5ab0311ce5ef91c83710164c5674dda2796ebb703a7a6441f0d77c9b2779a1e",
    sizeBytes: 41492,
    metadata: {
      license: "GT Walsheim Bold, AuraOne licensed font library (see public/aura-assets/PROVENANCE.md)"
    }
  }
} as const;

export type AuraAssets = typeof assets;
export type AuraAssetId = keyof AuraAssets;
