import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "studio": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "studio": {
    type: "model",
    format: "glb",
    url: "/aura-assets/studio.b65b6117.glb",
    hash: "sha256-b65b61175f7df07aa8264d203b83b49d44fc1b003cf2685de84d919dc03cfdce",
    integrity: {
      "version": 1,
      "digest": "sha256-b65b61175f7df07aa8264d203b83b49d44fc1b003cf2685de84d919dc03cfdce"
    },
    bounds: [
      28,
      9,
      18.5
    ],
    sizeBytes: 862024,
    metadata: {
      "materials": [
        "cyc",
        "glass",
        "metal",
        "fabric"
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
        "meshCount": 4,
        "materialCount": 4,
        "textureCount": 2,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "cyclorama",
          "glass",
          "metal",
          "fabric"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 4 nodes across 4 roots."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/studio.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/studio.bridge.json"
        ],
        "checkedAt": "2026-11-10T08:07:39.870Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/studio.glb",
      "outputPath": "public/aura-assets/studio.b65b6117.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -14,
          0,
          -6.5
        ],
        "max": [
          14,
          9,
          12
        ],
        "size": [
          28,
          9,
          18.5
        ],
        "center": [
          0,
          4.5,
          2.75
        ],
        "maxDimension": 28,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "cyc",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "glass",
          "visible": true,
          "readable": true,
          "opacity": 0.35,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "metal",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "fabric",
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
        "cyclorama",
        "glass",
        "metal",
        "fabric"
      ],
      "textures": [
        "image-0",
        "image-1"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/studio.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/studio.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
