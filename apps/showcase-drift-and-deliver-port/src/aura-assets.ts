// Gridlock Courier route-local typed assets (GU47 wave 1, GC-M3): the WP-36 Meshy traffic retextures, admitted with
// `aura3d assets import-meshy --profile vehicle` and typed with `assets add`; root-relative /aura-assets/ URLs served from
// apps/showcase-drift-and-deliver-port/public/aura-assets.
import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "gridlock_gridlockHatchPastel": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "gridlock_gridlockSedanPastel": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "gridlock_gridlockHatchPastel": {
    type: "model",
    format: "glb",
    url: "/aura-assets/gridlock_gridlockHatchPastel.15d7dca9.glb",
    hash: "sha256-15d7dca98e8d9f60f1292174c5eb8f57ff13ce83ce0526327d2cf257e3037087",
    bounds: [
      1.012,
      0.943,
      1.902
    ],
    sizeBytes: 963680,
    metadata: {
      "materials": [
        "material-0"
      ],
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": [],
        "messages": [
          "No embedded animation clips detected."
        ]
      },
      "humanoid": false,
      "humanoidStatus": "non-humanoid",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 0,
        "jointCount": 0,
        "skins": [],
        "messages": [
          "No skin/skeleton metadata detected."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "No morph target metadata detected."
        ]
      },
      "hierarchy": {
        "nodeCount": 1,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "node-0"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/gridlock_gridlockHatchPastel.15d7dca9.glb",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-01 through the AuraOne Meshy account via Kiro Prism retextured from an original text style prompt on the game's existing mesh (examples/drift-and-deliver-port/assets/models/hatch.glb) (GU47 WP-36, drift-and-deliver-port/gridlockHatchPastel). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "evidence": [
          "GU47 WP-36 drift-and-deliver-port/gridlockHatchPastel Meshy retexture of examples/drift-and-deliver-port/assets/models/hatch.glb; rescaled to the port car convention (+z, lowest point at the old y, old length) and textures to 1024 px jpeg"
        ],
        "checkedAt": "2026-11-02T22:53:11.362Z"
      },
      "sourcePath": "public/aura-assets/gridlock_gridlockHatchPastel.15d7dca9.glb",
      "outputPath": "public/aura-assets/gridlock_gridlockHatchPastel.15d7dca9.glb",
      "boundsMetadata": {
        "min": [
          -0.506,
          -0.003,
          -0.951
        ],
        "max": [
          0.506,
          0.94,
          0.952
        ],
        "size": [
          1.012,
          0.943,
          1.902
        ],
        "center": [
          0,
          0.468,
          0
        ],
        "maxDimension": 1.902,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "material-0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        }
      ],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [
        "node-0"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/gridlock_gridlockHatchPastel.thumb.svg",
      "quality": "candidate",
      "role": "vehicle"
    },
  },
  "gridlock_gridlockSedanPastel": {
    type: "model",
    format: "glb",
    url: "/aura-assets/gridlock_gridlockSedanPastel.94d3d031.glb",
    hash: "sha256-94d3d03102c876dbbb7a02fce7e29f207cbb512efdc59c89b0fc03f41ba87d4f",
    bounds: [
      0.918,
      0.638,
      1.903
    ],
    sizeBytes: 876416,
    metadata: {
      "materials": [
        "material-0"
      ],
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": [],
        "messages": [
          "No embedded animation clips detected."
        ]
      },
      "humanoid": false,
      "humanoidStatus": "non-humanoid",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 0,
        "jointCount": 0,
        "skins": [],
        "messages": [
          "No skin/skeleton metadata detected."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "No morph target metadata detected."
        ]
      },
      "hierarchy": {
        "nodeCount": 1,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "node-0"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/gridlock_gridlockSedanPastel.94d3d031.glb",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-01 through the AuraOne Meshy account via Kiro Prism retextured from an original text style prompt on the game's existing mesh (examples/drift-and-deliver-port/assets/models/sedan.glb) (GU47 WP-36, drift-and-deliver-port/gridlockSedanPastel). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "evidence": [
          "GU47 WP-36 drift-and-deliver-port/gridlockSedanPastel Meshy retexture of examples/drift-and-deliver-port/assets/models/sedan.glb; rescaled to the port car convention (+z, lowest point at the old y, old length) and textures to 1024 px jpeg"
        ],
        "checkedAt": "2026-11-02T22:53:13.772Z"
      },
      "sourcePath": "public/aura-assets/gridlock_gridlockSedanPastel.94d3d031.glb",
      "outputPath": "public/aura-assets/gridlock_gridlockSedanPastel.94d3d031.glb",
      "boundsMetadata": {
        "min": [
          -0.459,
          0.001,
          -0.951
        ],
        "max": [
          0.459,
          0.64,
          0.952
        ],
        "size": [
          0.918,
          0.638,
          1.903
        ],
        "center": [
          0,
          0.321,
          0.001
        ],
        "maxDimension": 1.903,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "material-0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        }
      ],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [
        "node-0"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/gridlock_gridlockSedanPastel.thumb.svg",
      "quality": "candidate",
      "role": "vehicle"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
