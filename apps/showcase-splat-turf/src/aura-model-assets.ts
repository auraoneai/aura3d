/**
 * Typed model manifest for the art-pass backdrop (Chroma Roll Meshy islands and balloons), emitted by
 * `aura3d assets typegen` from `aura.assets.json` (the font entry, which the CLI typegen cannot type, stays in
 * `aura-assets.ts`). Scenes use `model(assets.<key>)`; provenance in `public/aura-assets/PROVENANCE.md`.
 */
import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "balloon": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "easelIsland": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "islandTower": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "islandTree": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "paintPotIsland": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "paletteIsland": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "balloon": {
    type: "model",
    format: "glb",
    url: "/aura-assets/balloon.905a8cb9.glb",
    hash: "sha256-905a8cb98fd76f3e95466e65aa819924a8605d9a0f55ababd27d636c94d0d89a",
    integrity: {
      "version": 1,
      "digest": "sha256-905a8cb98fd76f3e95466e65aa819924a8605d9a0f55ababd27d636c94d0d89a"
    },
    bounds: [
      1.308,
      1.902,
      1.288
    ],
    sizeBytes: 1148824,
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
        "sourcePath": "public/aura-assets/balloon.905a8cb9.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-10-23 through the AuraOne Meshy account via Kiro Prism from an original text prompt (Chroma Roll / splat-rush-port set). Meshy plan terms at generation time; not CC0.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/balloon.rights.json"
        ],
        "checkedAt": "2026-11-08T02:43:41.060Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/balloon.905a8cb9.glb",
      "outputPath": "public/aura-assets/balloon.905a8cb9.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.654,
          -0.951,
          -0.644
        ],
        "max": [
          0.653,
          0.951,
          0.644
        ],
        "size": [
          1.308,
          1.902,
          1.288
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 1.902,
        "grounded": false
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
      "thumbnailUrl": "/aura-assets/balloon.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    },
  },
  "easelIsland": {
    type: "model",
    format: "glb",
    url: "/aura-assets/easelIsland.6f6d5f35.glb",
    hash: "sha256-6f6d5f35f6a8ae63b9f37eb0be69dbe43395c944b57aac1e61518d3d2f101287",
    integrity: {
      "version": 1,
      "digest": "sha256-6f6d5f35f6a8ae63b9f37eb0be69dbe43395c944b57aac1e61518d3d2f101287"
    },
    bounds: [
      1.898,
      1.505,
      1.015
    ],
    sizeBytes: 691356,
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
        "sourcePath": "public/aura-assets/easelIsland.6f6d5f35.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-10-23 through the AuraOne Meshy account via Kiro Prism from an original text prompt (Chroma Roll / splat-rush-port set). Meshy plan terms at generation time; not CC0.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/chroma-easel-island.rights.json"
        ],
        "checkedAt": "2026-11-08T02:44:06.212Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/easelIsland.6f6d5f35.glb",
      "outputPath": "public/aura-assets/easelIsland.6f6d5f35.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.948,
          -0.749,
          -0.507
        ],
        "max": [
          0.95,
          0.756,
          0.508
        ],
        "size": [
          1.898,
          1.505,
          1.015
        ],
        "center": [
          0.001,
          0.003,
          0.001
        ],
        "maxDimension": 1.898,
        "grounded": false
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
      "thumbnailUrl": "/aura-assets/easelIsland.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    },
  },
  "islandTower": {
    type: "model",
    format: "glb",
    url: "/aura-assets/islandTower.a38933a2.glb",
    hash: "sha256-a38933a2a9a471772dbe35c2c0db0f0fdf4788f7e3c62643b00e2bc0b7060f0d",
    integrity: {
      "version": 1,
      "digest": "sha256-a38933a2a9a471772dbe35c2c0db0f0fdf4788f7e3c62643b00e2bc0b7060f0d"
    },
    bounds: [
      1.454,
      1.902,
      1.454
    ],
    sizeBytes: 1156316,
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
        "sourcePath": "public/aura-assets/islandTower.a38933a2.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-10-23 through the AuraOne Meshy account via Kiro Prism from an original text prompt (Chroma Roll / splat-rush-port set). Meshy plan terms at generation time; not CC0.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/island-tower.rights.json"
        ],
        "checkedAt": "2026-11-08T02:43:33.976Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/islandTower.a38933a2.glb",
      "outputPath": "public/aura-assets/islandTower.a38933a2.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.728,
          -0.952,
          -0.728
        ],
        "max": [
          0.727,
          0.95,
          0.727
        ],
        "size": [
          1.454,
          1.902,
          1.454
        ],
        "center": [
          0,
          -0.001,
          -0.001
        ],
        "maxDimension": 1.902,
        "grounded": false
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
      "thumbnailUrl": "/aura-assets/islandTower.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    },
  },
  "islandTree": {
    type: "model",
    format: "glb",
    url: "/aura-assets/islandTree.8857f4dc.glb",
    hash: "sha256-8857f4dcb39bd2f3d8c24adaa53dc5512e3d7e41729169a12e8b6f6243eb3723",
    integrity: {
      "version": 1,
      "digest": "sha256-8857f4dcb39bd2f3d8c24adaa53dc5512e3d7e41729169a12e8b6f6243eb3723"
    },
    bounds: [
      1.588,
      1.894,
      1.578
    ],
    sizeBytes: 667468,
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
        "sourcePath": "public/aura-assets/islandTree.8857f4dc.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-10-23 through the AuraOne Meshy account via Kiro Prism from an original text prompt (Chroma Roll / splat-rush-port set). Meshy plan terms at generation time; not CC0.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/island-tree.rights.json"
        ],
        "checkedAt": "2026-11-08T02:43:07.042Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/islandTree.8857f4dc.glb",
      "outputPath": "public/aura-assets/islandTree.8857f4dc.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.801,
          -0.948,
          -0.789
        ],
        "max": [
          0.788,
          0.947,
          0.79
        ],
        "size": [
          1.588,
          1.894,
          1.578
        ],
        "center": [
          -0.007,
          -0.001,
          0.001
        ],
        "maxDimension": 1.894,
        "grounded": false
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
      "thumbnailUrl": "/aura-assets/islandTree.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    },
  },
  "paintPotIsland": {
    type: "model",
    format: "glb",
    url: "/aura-assets/paintPotIsland.e942c632.glb",
    hash: "sha256-e942c632cb7046cb72fb2c57bea8ffb58c5d7bbb1cdc2c4db65743e6671e7bd4",
    integrity: {
      "version": 1,
      "digest": "sha256-e942c632cb7046cb72fb2c57bea8ffb58c5d7bbb1cdc2c4db65743e6671e7bd4"
    },
    bounds: [
      1.646,
      1.337,
      1.889
    ],
    sizeBytes: 1698372,
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
        "sourcePath": "public/aura-assets/paintPotIsland.e942c632.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-10-23 through the AuraOne Meshy account via Kiro Prism from an original text prompt (Chroma Roll / splat-rush-port set). Meshy plan terms at generation time; not CC0.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/paint-pot-island.rights.json"
        ],
        "checkedAt": "2026-11-08T02:43:46.255Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/paintPotIsland.e942c632.glb",
      "outputPath": "public/aura-assets/paintPotIsland.e942c632.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.825,
          -0.657,
          -0.948
        ],
        "max": [
          0.821,
          0.68,
          0.941
        ],
        "size": [
          1.646,
          1.337,
          1.889
        ],
        "center": [
          -0.002,
          0.011,
          -0.004
        ],
        "maxDimension": 1.889,
        "grounded": false
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
      "thumbnailUrl": "/aura-assets/paintPotIsland.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    },
  },
  "paletteIsland": {
    type: "model",
    format: "glb",
    url: "/aura-assets/paletteIsland.bbbbb408.glb",
    hash: "sha256-bbbbb4084e86aa32998e0e805563fcfd6af6af6a00efffc483866a05084ce452",
    integrity: {
      "version": 1,
      "digest": "sha256-bbbbb4084e86aa32998e0e805563fcfd6af6af6a00efffc483866a05084ce452"
    },
    bounds: [
      1.648,
      1.902,
      1.666
    ],
    sizeBytes: 992640,
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
        "sourcePath": "public/aura-assets/paletteIsland.bbbbb408.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-10-23 through the AuraOne Meshy account via Kiro Prism from an original text prompt (Chroma Roll / splat-rush-port set). Meshy plan terms at generation time; not CC0.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/chroma-palette-island.rights.json"
        ],
        "checkedAt": "2026-11-08T02:43:54.035Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/paletteIsland.bbbbb408.glb",
      "outputPath": "public/aura-assets/paletteIsland.bbbbb408.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.825,
          -0.952,
          -0.833
        ],
        "max": [
          0.823,
          0.95,
          0.834
        ],
        "size": [
          1.648,
          1.902,
          1.666
        ],
        "center": [
          -0.001,
          -0.001,
          0
        ],
        "maxDimension": 1.902,
        "grounded": false
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
      "thumbnailUrl": "/aura-assets/paletteIsland.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
