import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "product": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "product": {
    type: "model",
    format: "glb",
    url: "/aura-assets/product.c407dd81.glb",
    hash: "sha256-c407dd81c98ebd8767f1088fb4e12a77789a722110f1e3ed2eb3ae97322fdd2c",
    integrity: {
      "version": 1,
      "digest": "sha256-c407dd81c98ebd8767f1088fb4e12a77789a722110f1e3ed2eb3ae97322fdd2c"
    },
    bounds: [
      5,
      1.54,
      5
    ],
    sizeBytes: 137800,
    metadata: {
      "materials": [
        "paint",
        "glass",
        "chrome",
        "rubber",
        "rubber",
        "rubber",
        "rubber",
        "table"
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
        "meshCount": 8,
        "materialCount": 8,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "car",
          "turntable"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 9 nodes across 2 roots."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/product.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/product.bridge.json"
        ],
        "checkedAt": "2026-11-09T22:14:07.795Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/product.glb",
      "outputPath": "public/aura-assets/product.c407dd81.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -2.5,
          -0.12,
          -2.5
        ],
        "max": [
          2.5,
          1.42,
          2.5
        ],
        "size": [
          5,
          1.54,
          5
        ],
        "center": [
          0,
          0.65,
          0
        ],
        "maxDimension": 5,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "paint",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "glass",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "chrome",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "rubber",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "rubber",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "rubber",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "rubber",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "table",
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
        "car",
        "car__body",
        "car__cabin",
        "car__trim",
        "car__wheel0",
        "car__wheel1",
        "car__wheel2",
        "car__wheel3",
        "turntable"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/product.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/product.mjs (seed 7)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
