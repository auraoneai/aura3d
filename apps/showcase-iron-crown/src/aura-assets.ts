import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "ironcrownKoScorch": AuraAssetDefinition & { readonly type: "texture"; readonly format: "webp"; readonly url: string; readonly hash: string; };
  readonly "ironcrownLutAirbaseHaze": AuraAssetDefinition & { readonly type: "lut"; readonly format: "cube"; readonly url: string; readonly hash: string; };
  readonly "ironcrownLutColosseumOchre": AuraAssetDefinition & { readonly type: "lut"; readonly format: "cube"; readonly url: string; readonly hash: string; };
  readonly "ironcrownLutDockDusk": AuraAssetDefinition & { readonly type: "lut"; readonly format: "cube"; readonly url: string; readonly hash: string; };
  readonly "ironcrownLutMonasteryFrost": AuraAssetDefinition & { readonly type: "lut"; readonly format: "cube"; readonly url: string; readonly hash: string; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "ironcrownKoScorch": {
    type: "texture",
    format: "webp",
    url: "/aura-assets/ironcrownKoScorch.57c0c330.webp",
    hash: "sha256-57c0c3300ffb16710673d7bdd8e8ce483c1f28c6c3ddf102ec431a484ad54692",
    sizeBytes: 38224,
    metadata: {
      "thumbnailUrl": "/aura-assets/ironcrownKoScorch.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    }
  },
  "ironcrownLutAirbaseHaze": {
    type: "lut",
    format: "cube",
    url: "/aura-assets/ironcrownLutAirbaseHaze.80f071ef.cube",
    hash: "sha256-80f071efe5c5c6f75bea5d469bb6393f348c1fcad830de4e2a383fc0a05b3376",
    sizeBytes: 103312,
    metadata: {
      "thumbnailUrl": "/aura-assets/ironcrownLutAirbaseHaze.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    }
  },
  "ironcrownLutColosseumOchre": {
    type: "lut",
    format: "cube",
    url: "/aura-assets/ironcrownLutColosseumOchre.cf791107.cube",
    hash: "sha256-cf791107c06f2d743c8676ecfca1c73ab6643b9e61f9883f35abd11e602aa6e",
    sizeBytes: 103315,
    metadata: {
      "thumbnailUrl": "/aura-assets/ironcrownLutColosseumOchre.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    }
  },
  "ironcrownLutDockDusk": {
    type: "lut",
    format: "cube",
    url: "/aura-assets/ironcrownLutDockDusk.a114c6bb.cube",
    hash: "sha256-a114c6bbdd1c5302f3522ca533ef8f3d7ef58ce3cf182c906b9ec9b2ecade357",
    sizeBytes: 103315,
    metadata: {
      "thumbnailUrl": "/aura-assets/ironcrownLutDockDusk.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    }
  },
  "ironcrownLutMonasteryFrost": {
    type: "lut",
    format: "cube",
    url: "/aura-assets/ironcrownLutMonasteryFrost.7bff466c.cube",
    hash: "sha256-7bff466c37411782948152d5467f7f2c07bd590ff341fc47ddcde5b3cef4c11a",
    sizeBytes: 103315,
    metadata: {
      "thumbnailUrl": "/aura-assets/ironcrownLutMonasteryFrost.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    }
  }
});
