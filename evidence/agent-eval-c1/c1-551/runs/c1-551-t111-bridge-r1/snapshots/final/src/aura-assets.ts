import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "backdrop": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "backdrop": {
    type: "model",
    format: "glb",
    url: "/aura-assets/backdrop.6a59d7da.glb",
    hash: "sha256-6a59d7da43123be2f867c15d00a9eeb2d55e71e974c86895acd3245d563c8ef7",
    integrity: {
      "version": 1,
      "digest": "sha256-6a59d7da43123be2f867c15d00a9eeb2d55e71e974c86895acd3245d563c8ef7"
    },
    bounds: [
      553.076,
      563.18,
      549.927
    ],
    sizeBytes: 521356,
    metadata: {
      "materials": [
        "stars_white_mat",
        "stars_blue_mat",
        "stars_warm_mat"
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
        "nodeCount": 3,
        "meshCount": 3,
        "materialCount": 3,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "stars_white",
          "stars_blue",
          "stars_warm"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 3 nodes across 3 roots."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/backdrop.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/backdrop.bridge.json"
        ],
        "checkedAt": "2026-11-10T07:48:13.824Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/backdrop.glb",
      "outputPath": "public/aura-assets/backdrop.6a59d7da.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -277.303,
          -284.455,
          -270.614
        ],
        "max": [
          275.773,
          278.725,
          279.313
        ],
        "size": [
          553.076,
          563.18,
          549.927
        ],
        "center": [
          -0.765,
          -2.865,
          4.349
        ],
        "maxDimension": 563.18,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "stars_white_mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "stars_blue_mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "stars_warm_mat",
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
        "stars_white",
        "stars_blue",
        "stars_warm"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/backdrop.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/backdrop.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
