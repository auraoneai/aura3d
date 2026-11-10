import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "canyon": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "canyon": {
    type: "model",
    format: "glb",
    url: "/aura-assets/canyon.a73b3f06.glb",
    hash: "sha256-a73b3f06977bee12d699cdf99af041de5295498b4cedaf28d5c2fc7a8763eaf0",
    integrity: {
      "version": 1,
      "digest": "sha256-a73b3f06977bee12d699cdf99af041de5295498b4cedaf28d5c2fc7a8763eaf0"
    },
    bounds: [
      180,
      49.234,
      760
    ],
    sizeBytes: 13418836,
    metadata: {
      "materials": [
        "sandstone",
        "boulderStone",
        "deadWood"
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
          "terrain",
          "boulders",
          "shrubs"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 3 nodes across 3 roots."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/canyon.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/canyon.bridge.json"
        ],
        "checkedAt": "2026-11-10T08:09:53.049Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/canyon.glb",
      "outputPath": "public/aura-assets/canyon.a73b3f06.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -90,
          -2.102,
          -740
        ],
        "max": [
          90,
          47.132,
          20
        ],
        "size": [
          180,
          49.234,
          760
        ],
        "center": [
          0,
          22.515,
          -360
        ],
        "maxDimension": 760,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "sandstone",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "boulderStone",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "deadWood",
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
        "terrain",
        "boulders",
        "shrubs"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/canyon.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/canyon.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
