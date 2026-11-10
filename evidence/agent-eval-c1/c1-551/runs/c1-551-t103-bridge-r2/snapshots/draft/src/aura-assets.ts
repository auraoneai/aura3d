import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "canyon": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "canyon": {
    type: "model",
    format: "glb",
    url: "/aura-assets/canyon.f4c1351a.glb",
    hash: "sha256-f4c1351a572851a789f48ff95333afb044503dd743acc0fcf5bdf9e5acd7d6d5",
    integrity: {
      "version": 1,
      "digest": "sha256-f4c1351a572851a789f48ff95333afb044503dd743acc0fcf5bdf9e5acd7d6d5"
    },
    bounds: [
      190,
      49.001,
      425
    ],
    sizeBytes: 6417172,
    metadata: {
      "materials": [
        "sandstone",
        "boulder",
        "deadwood"
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
        "nodeCount": 4,
        "meshCount": 3,
        "materialCount": 3,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "canyon"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 4 nodes across 1 root."
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
        "checkedAt": "2026-11-10T07:45:09.342Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/canyon.glb",
      "outputPath": "public/aura-assets/canyon.f4c1351a.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -95,
          -0.701,
          -25
        ],
        "max": [
          95,
          48.3,
          400
        ],
        "size": [
          190,
          49.001,
          425
        ],
        "center": [
          0,
          23.799,
          187.5
        ],
        "maxDimension": 425,
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
          "name": "boulder",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "deadwood",
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
        "canyon",
        "canyon__terrain",
        "canyon__boulders",
        "canyon__shrubs"
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
