import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "stage": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "stage": {
    type: "model",
    format: "glb",
    url: "/aura-assets/stage.03f69e42.glb",
    hash: "sha256-03f69e42f23325b3d7b959ad61763e5e71a36a8c259ada4ac507e2815041fa93",
    integrity: {
      "version": 1,
      "digest": "sha256-03f69e42f23325b3d7b959ad61763e5e71a36a8c259ada4ac507e2815041fa93"
    },
    bounds: [
      80,
      1,
      80
    ],
    sizeBytes: 23552,
    metadata: {
      "materials": [
        "stage_meshstandard_0",
        "stage_meshstandard_1"
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
        "nodeCount": 2,
        "meshCount": 2,
        "materialCount": 2,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "floor",
          "plinth"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 2 nodes across 2 roots."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/stage.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/stage.bridge.json"
        ],
        "checkedAt": "2026-11-10T07:51:02.092Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/stage.glb",
      "outputPath": "public/aura-assets/stage.03f69e42.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -40,
          -1.4,
          -40
        ],
        "max": [
          40,
          -0.4,
          40
        ],
        "size": [
          80,
          1,
          80
        ],
        "center": [
          0,
          -0.9,
          0
        ],
        "maxDimension": 80,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "stage_meshstandard_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "stage_meshstandard_1",
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
        "floor",
        "plinth"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/stage.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/stage.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
