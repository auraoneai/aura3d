// Aura Links 3D synthesized audio assets (`scripts/build-sfx.mjs`) — 100% procedural 3D geometry (zero `.glb` files).
import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraLinksAssetDefinitions = {
  readonly "linksDriveStrikeSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "linksCupDropSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "linksFlagstickRattleSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "linksBirdieChimeSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "linksBogeyThudSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "linksMenuTickSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "linksCoastWindLoopSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
};

export const assets: AuraAssetMap<AuraLinksAssetDefinitions> = defineAuraAssets({
  "linksDriveStrikeSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/linksDriveStrikeSfx.2a73323c.wav",
    hash: "sha256-2a73323cc0a78f1c411a7df7ccc1f21c2374882451504290a2dd1147e07c0d5f"
  },
  "linksCupDropSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/linksCupDropSfx.106be901.wav",
    hash: "sha256-106be9019526f3f68bcd6c6b72e224ea2d95bfc3715082b3b4b1b4ac762d9462"
  },
  "linksFlagstickRattleSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/linksFlagstickRattleSfx.18e2730e.wav",
    hash: "sha256-18e2730e977dda6705e61f52b94ed545037c59e89cf5c45fd2dfbe9d45c6450c"
  },
  "linksBirdieChimeSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/linksBirdieChimeSfx.a5239014.wav",
    hash: "sha256-a5239014921336e9c6f14f389c3fa1c670a30fcbe21caae89d02c707f910e426"
  },
  "linksBogeyThudSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/linksBogeyThudSfx.6042e2b1.wav",
    hash: "sha256-6042e2b15846da4911ad21a7f18a53f9ce96658463a5b20470c6dc7d5c1fb2d0"
  },
  "linksMenuTickSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/linksMenuTickSfx.7d711e78.wav",
    hash: "sha256-7d711e7880b855e38a46a6dbf0c9ceacf33adff66d27d3ed9e0396e14bb23c23"
  },
  "linksCoastWindLoopSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/linksCoastWindLoopSfx.2fa04237.wav",
    hash: "sha256-2fa04237e22c28431ccd1831ee4682c2d4eede23e89bc05723c59a18bbfcceca"
  }
} as const);

export type AuraLinksAssets = typeof assets;
