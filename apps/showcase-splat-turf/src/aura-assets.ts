/**
 * Typed asset manifest (CLI typegen output shape) for the licensed HUD font.
 * The engine's AuraAssetType union has no "font" member (fonts load via CSS @font-face,
 * not the engine asset pipeline), so this manifest is locally typed with the same
 * id/type/format/url/hash fields the CLI emits.
 */
export interface FontAssetDefinition {
  readonly type: "font";
  readonly format: "woff2";
  readonly url: string;
  readonly hash: string;
  readonly sizeBytes: number;
}

export const assets = {
  gtWalsheimBold: {
    type: "font",
    format: "woff2",
    url: "/aura-assets/GT-Walsheim-Bold.woff2",
    hash: "sha256-d5ab0311ce5ef91c83710164c5674dda2796ebb703a7a6441f0d77c9b2779a1e",
    sizeBytes: 41492
  }
} as const satisfies Record<string, FontAssetDefinition>;

export type SplatTurfAssets = typeof assets;