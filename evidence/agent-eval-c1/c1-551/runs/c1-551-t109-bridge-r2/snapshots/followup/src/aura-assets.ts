import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "carpaint": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "carpaint": {
    type: "model",
    format: "glb",
    url: "/aura-assets/carpaint.d34070af.glb",
    hash: "sha256-d34070afdcc038c5c4c55fee02306dc8ad15d97d8cfe31b4303f4b65bd7ddb9b",
    integrity: {
      "version": 1,
      "digest": "sha256-d34070afdcc038c5c4c55fee02306dc8ad15d97d8cfe31b4303f4b65bd7ddb9b"
    },
    bounds: [
      5.27,
      1.53,
      5.27
    ],
    sizeBytes: 1319496,
    metadata: {
      "materials": [
        "platform",
        "chrome",
        "ring_light",
        "candy_paint",
        "dark_glass",
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
        "nodeCount": 50,
        "meshCount": 44,
        "materialCount": 6,
        "textureCount": 1,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "turntable"
        ],
        "maxDepth": 4,
        "messages": [
          "Detected 50 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/carpaint.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/carpaint.bridge.json"
        ],
        "checkedAt": "2026-11-10T08:03:53.805Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/carpaint.glb",
      "outputPath": "public/aura-assets/carpaint.d34070af.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -2.635,
          -0.16,
          -2.635
        ],
        "max": [
          2.635,
          1.37,
          2.635
        ],
        "size": [
          5.27,
          1.53,
          5.27
        ],
        "center": [
          0,
          0.605,
          0
        ],
        "maxDimension": 5.27,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "platform",
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
          "name": "ring_light",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "candy_paint",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "dark_glass",
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
        "turntable",
        "turntable__platform",
        "turntable__edge_trim",
        "turntable__ring_light",
        "turntable__tick_0",
        "turntable__tick_1",
        "turntable__tick_2",
        "turntable__tick_3",
        "turntable__tick_4",
        "turntable__tick_5",
        "turntable__tick_6",
        "turntable__tick_7",
        "turntable__tick_8",
        "turntable__tick_9",
        "turntable__tick_10",
        "turntable__tick_11",
        "turntable__tick_12",
        "turntable__tick_13",
        "turntable__tick_14",
        "turntable__tick_15",
        "turntable__tick_16",
        "turntable__tick_17",
        "turntable__tick_18",
        "turntable__tick_19",
        "turntable__tick_20",
        "turntable__tick_21",
        "turntable__tick_22",
        "turntable__tick_23",
        "turntable__car",
        "turntable__car__body",
        "turntable__car__cabin_glass",
        "turntable__car__roof",
        "turntable__car__chrome_belt",
        "turntable__car__chrome_window_trim",
        "turntable__car__wheel_0",
        "turntable__car__wheel_0__tire_0",
        "turntable__car__wheel_0__hub_0",
        "turntable__car__wheel_0__rim_0",
        "turntable__car__wheel_1",
        "turntable__car__wheel_1__tire_1",
        "turntable__car__wheel_1__hub_1",
        "turntable__car__wheel_1__rim_1",
        "turntable__car__wheel_2",
        "turntable__car__wheel_2__tire_2",
        "turntable__car__wheel_2__hub_2",
        "turntable__car__wheel_2__rim_2",
        "turntable__car__wheel_3",
        "turntable__car__wheel_3__tire_3",
        "turntable__car__wheel_3__hub_3",
        "turntable__car__wheel_3__rim_3"
      ],
      "textures": [
        "image-0"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/carpaint.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/carpaint.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
