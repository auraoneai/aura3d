/**
 * Typed model manifest for the Meshy backdrop dressing (toy castle island, toy block tower), emitted like
 * `aura3d assets typegen` from `aura.assets.json` (the font entry, which the CLI typegen cannot type, stays in
 * `aura-assets.ts`). Scenes use `model(assets.<key>)`; provenance in `public/aura-assets/PROVENANCE.md`.
 */
import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "toyCastleIsland": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "toyBlockTower": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "toyCastleIsland": {
    type: "model",
    format: "glb",
    url: "/aura-assets/toyCastleIsland.df8dcbc8.glb",
    hash: "sha256-df8dcbc80ded256382a934a394e85b12675951f73c7604e1f9b724bc21a36a61",
    integrity: {
      "version": 1,
      "digest": "sha256-df8dcbc80ded256382a934a394e85b12675951f73c7604e1f9b724bc21a36a61"
    },
    bounds: [
      1.583,
      1.899,
      1.603
    ],
    sizeBytes: 871728,
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
        "sourcePath": "public/aura-assets/toyCastleIsland.df8dcbc8.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-11-09 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, shape-shift-sprint/sssFloatingIsland). Meshy plan terms at generation time; not CC0.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/toyCastleIsland.rights.json"
        ],
        "checkedAt": "2026-11-09T14:30:00.000Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/toyCastleIsland.df8dcbc8.glb",
      "outputPath": "public/aura-assets/toyCastleIsland.df8dcbc8.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.796,
          -0.951,
          -0.801
        ],
        "max": [
          0.787,
          0.949,
          0.802
        ],
        "size": [
          1.583,
          1.899,
          1.603
        ],
        "center": [
          -0.005,
          -0.001,
          0.0
        ],
        "maxDimension": 1.899,
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
      "thumbnailUrl": "/aura-assets/toyCastleIsland.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    },
  },
  "toyBlockTower": {
    type: "model",
    format: "glb",
    url: "/aura-assets/toyBlockTower.7f6db496.glb",
    hash: "sha256-7f6db4963426a7b9d4a2ac54ee232fb306a094fa75e0945a9cf60c31a433e3d6",
    integrity: {
      "version": 1,
      "digest": "sha256-7f6db4963426a7b9d4a2ac54ee232fb306a094fa75e0945a9cf60c31a433e3d6"
    },
    bounds: [
      0.626,
      1.903,
      0.635
    ],
    sizeBytes: 750972,
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
        "sourcePath": "public/aura-assets/toyBlockTower.7f6db496.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-11-09 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, shape-shift-sprint/sssToyBlockTowerB). Meshy plan terms at generation time; not CC0.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/toyBlockTower.rights.json"
        ],
        "checkedAt": "2026-11-09T14:30:00.000Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/toyBlockTower.7f6db496.glb",
      "outputPath": "public/aura-assets/toyBlockTower.7f6db496.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.314,
          -0.952,
          -0.318
        ],
        "max": [
          0.313,
          0.95,
          0.317
        ],
        "size": [
          0.626,
          1.903,
          0.635
        ],
        "center": [
          -0.0,
          -0.001,
          -0.0
        ],
        "maxDimension": 1.903,
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
      "thumbnailUrl": "/aura-assets/toyBlockTower.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
