import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "car": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "stage": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "car": {
    type: "model",
    format: "glb",
    url: "/aura-assets/car.e06e7a78.glb",
    hash: "sha256-e06e7a78e325ab24f2b7ef4bb3bfdc2159f5232cdcd45a66f9e126188f4498d5",
    integrity: {
      "version": 1,
      "digest": "sha256-e06e7a78e325ab24f2b7ef4bb3bfdc2159f5232cdcd45a66f9e126188f4498d5"
    },
    bounds: [
      3.9,
      1.377,
      1.754
    ],
    sizeBytes: 1000200,
    metadata: {
      "materials": [
        "candy_paint",
        "cabin_glass",
        "chrome",
        "headlamp",
        "taillamp",
        "rubber"
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
      "humanoidStatus": "unknown",
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
        "nodeCount": 25,
        "meshCount": 20,
        "materialCount": 6,
        "textureCount": 2,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "car"
        ],
        "maxDepth": 3,
        "messages": [
          "Detected 25 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/car.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/car.bridge.json"
        ],
        "checkedAt": "2026-11-10T07:31:12.967Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/car.glb",
      "outputPath": "public/aura-assets/car.e06e7a78.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -1.95,
          0,
          -0.877
        ],
        "max": [
          1.95,
          1.377,
          0.877
        ],
        "size": [
          3.9,
          1.377,
          1.754
        ],
        "center": [
          0,
          0.689,
          0
        ],
        "maxDimension": 3.9,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "candy_paint",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "cabin_glass",
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
          "name": "headlamp",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "taillamp",
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
        "car__trim_left",
        "car__trim_right",
        "car__headlamp_left",
        "car__taillamp_left",
        "car__headlamp_right",
        "car__taillamp_right",
        "car__wheel_fl",
        "car__wheel_fl__tyre_fl",
        "car__wheel_fl__rim_fl",
        "car__wheel_fl__hub_fl",
        "car__wheel_fr",
        "car__wheel_fr__tyre_fr",
        "car__wheel_fr__rim_fr",
        "car__wheel_fr__hub_fr",
        "car__wheel_rl",
        "car__wheel_rl__tyre_rl",
        "car__wheel_rl__rim_rl",
        "car__wheel_rl__hub_rl",
        "car__wheel_rr",
        "car__wheel_rr__tyre_rr",
        "car__wheel_rr__rim_rr",
        "car__wheel_rr__hub_rr"
      ],
      "textures": [
        "image-0",
        "image-1"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/car.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/car.mjs (seed 1)"
    },
  },
  "stage": {
    type: "model",
    format: "glb",
    url: "/aura-assets/stage.5d76818e.glb",
    hash: "sha256-5d76818ee752a9e364683ea99108e6cf0951ff657b79964c15e80f7a027e4932",
    integrity: {
      "version": 1,
      "digest": "sha256-5d76818ee752a9e364683ea99108e6cf0951ff657b79964c15e80f7a027e4932"
    },
    bounds: [
      28,
      0.155,
      28
    ],
    sizeBytes: 261672,
    metadata: {
      "materials": [
        "showroom_floor",
        "bezel_chrome",
        "ring_light"
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
          "floor_bezel",
          "chrome_rim",
          "ring_light"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 3 nodes across 3 roots."
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
        "checkedAt": "2026-11-10T07:31:13.395Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/stage.glb",
      "outputPath": "public/aura-assets/stage.5d76818e.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -14,
          0,
          -14
        ],
        "max": [
          14,
          0.155,
          14
        ],
        "size": [
          28,
          0.155,
          28
        ],
        "center": [
          0,
          0.078,
          0
        ],
        "maxDimension": 28,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "showroom_floor",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "bezel_chrome",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "ring_light",
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
        "floor_bezel",
        "chrome_rim",
        "ring_light"
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
