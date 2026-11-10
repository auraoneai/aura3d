import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "studio": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "studio": {
    type: "model",
    format: "glb",
    url: "/aura-assets/studio.d1a7aaaf.glb",
    hash: "sha256-d1a7aaaf7aa7508a4bcd6e723511119ea8952475106cdd81e095d1c10322d713",
    integrity: {
      "version": 1,
      "digest": "sha256-d1a7aaaf7aa7508a4bcd6e723511119ea8952475106cdd81e095d1c10322d713"
    },
    bounds: [
      40,
      10.2,
      14.2
    ],
    sizeBytes: 2204528,
    metadata: {
      "materials": [
        "cyclorama",
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
        "checkedAt": "2026-11-10T07:40:38.407Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/studio.glb",
      "outputPath": "public/aura-assets/studio.d1a7aaaf.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -20,
          0,
          -5.2
        ],
        "max": [
          20,
          10.2,
          9
        ],
        "size": [
          40,
          10.2,
          14.2
        ],
        "center": [
          0,
          5.1,
          1.9
        ],
        "maxDimension": 40,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "cyclorama",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "glass",
          "visible": true,
          "readable": true,
          "opacity": 0.22,
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
