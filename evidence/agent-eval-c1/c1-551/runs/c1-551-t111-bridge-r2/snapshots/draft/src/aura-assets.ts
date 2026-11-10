import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "cosmos": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "cosmos": {
    type: "model",
    format: "glb",
    url: "/aura-assets/cosmos.b9279605.glb",
    hash: "sha256-b9279605b9d79e85e43571cbb4f53c65724182020b6a9744919f9f29c7dab837",
    integrity: {
      "version": 1,
      "digest": "sha256-b9279605b9d79e85e43571cbb4f53c65724182020b6a9744919f9f29c7dab837"
    },
    bounds: [
      482.343,
      489.609,
      495.284
    ],
    sizeBytes: 257584,
    metadata: {
      "materials": [
        "cosmos_meshbasic_0",
        "cosmos_meshbasic_1",
        "cosmos_meshbasic_2",
        "cosmos_meshbasic_3",
        "cosmos_meshbasic_4",
        "cosmos_meshbasic_5",
        "cosmos_meshbasic_6",
        "cosmos_meshbasic_7",
        "cosmos_meshbasic_8"
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
        "nodeCount": 9,
        "meshCount": 9,
        "materialCount": 9,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "stars",
          "orbit0",
          "orbit1",
          "orbit2",
          "orbit3",
          "orbit4",
          "orbit5",
          "orbit6",
          "orbit7"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 9 nodes across 9 roots."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/cosmos.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/cosmos.bridge.json"
        ],
        "checkedAt": "2026-11-10T07:56:08.299Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/cosmos.glb",
      "outputPath": "public/aura-assets/cosmos.b9279605.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -247.763,
          -251.559,
          -249.9
        ],
        "max": [
          234.58,
          238.049,
          245.384
        ],
        "size": [
          482.343,
          489.609,
          495.284
        ],
        "center": [
          -6.591,
          -6.755,
          -2.258
        ],
        "maxDimension": 495.284,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "cosmos_meshbasic_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "cosmos_meshbasic_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "cosmos_meshbasic_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "cosmos_meshbasic_3",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "cosmos_meshbasic_4",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "cosmos_meshbasic_5",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "cosmos_meshbasic_6",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "cosmos_meshbasic_7",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "cosmos_meshbasic_8",
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
        "stars",
        "orbit0",
        "orbit1",
        "orbit2",
        "orbit3",
        "orbit4",
        "orbit5",
        "orbit6",
        "orbit7"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/cosmos.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/cosmos.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
