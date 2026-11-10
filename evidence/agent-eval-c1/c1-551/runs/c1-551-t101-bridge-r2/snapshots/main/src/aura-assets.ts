import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "spider": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "spider": {
    type: "model",
    format: "glb",
    url: "/aura-assets/spider.b190696e.glb",
    hash: "sha256-b190696ef704da91993e528039f4505e0acd0a384e780f12b8c910d1b7404819",
    integrity: {
      "version": 1,
      "digest": "sha256-b190696ef704da91993e528039f4505e0acd0a384e780f12b8c910d1b7404819"
    },
    bounds: [
      3.375,
      1.333,
      2.68
    ],
    sizeBytes: 201072,
    metadata: {
      "materials": [
        "spider_meshstandard_0",
        "spider_meshstandard_1",
        "spider_meshstandard_2",
        "spider_meshstandard_3",
        "spider_meshstandard_4"
      ],
      "animations": [
        "spider_walk"
      ],
      "animationClips": [
        "spider_walk"
      ],
      "animationClipDetails": [
        {
          "name": "spider_walk",
          "duration": 2,
          "channelCount": 26
        }
      ],
      "animationMetadata": {
        "clipCount": 1,
        "clips": [
          {
            "index": 0,
            "name": "spider_walk",
            "channelCount": 26,
            "samplerCount": 26,
            "targetPaths": [
              "rotation",
              "translation"
            ],
            "targetNodes": [
              "body__hip_R0",
              "body__hip_R0__femur_R0",
              "body__hip_R0__femur_R0__knee_R0",
              "body__hip_L0",
              "body__hip_L0__femur_L0",
              "body__hip_L0__femur_L0__knee_L0",
              "body__hip_R1",
              "body__hip_R1__femur_R1",
              "body__hip_R1__femur_R1__knee_R1",
              "body__hip_L1",
              "body__hip_L1__femur_L1",
              "body__hip_L1__femur_L1__knee_L1",
              "body__hip_R2",
              "body__hip_R2__femur_R2",
              "body__hip_R2__femur_R2__knee_R2",
              "body__hip_L2",
              "body__hip_L2__femur_L2",
              "body__hip_L2__femur_L2__knee_L2",
              "body__hip_R3",
              "body__hip_R3__femur_R3",
              "body__hip_R3__femur_R3__knee_R3",
              "body__hip_L3",
              "body__hip_L3__femur_L3",
              "body__hip_L3__femur_L3__knee_L3",
              "body"
            ],
            "duration": 2,
            "hasRootMotionCandidate": false,
            "frameRate": 24.000005722047263
          }
        ],
        "messages": [
          "Detected 1 embedded animation clip."
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
        "nodeCount": 64,
        "meshCount": 11,
        "materialCount": 5,
        "textureCount": 0,
        "animationClipCount": 1,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "body"
        ],
        "maxDepth": 5,
        "messages": [
          "Detected 64 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/spider.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/spider.bridge.json"
        ],
        "checkedAt": "2026-11-10T07:26:50.787Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/spider.glb",
      "outputPath": "public/aura-assets/spider.b190696e.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -0.675,
          0.353,
          -1.75
        ],
        "max": [
          2.7,
          1.685,
          0.93
        ],
        "size": [
          3.375,
          1.333,
          2.68
        ],
        "center": [
          1.013,
          1.019,
          -0.41
        ],
        "maxDimension": 3.375,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "spider_meshstandard_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "spider_meshstandard_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "spider_meshstandard_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "spider_meshstandard_3",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "spider_meshstandard_4",
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
        "body",
        "body__thorax",
        "body__abdomen",
        "body__mark",
        "body__eye_l",
        "body__eye_r",
        "body__eye_l2",
        "body__eye_r2",
        "body__hip_R0",
        "body__hip_R0__hipball_R0",
        "body__hip_R0__femur_R0",
        "body__hip_R0__femur_R0__femurseg_R0",
        "body__hip_R0__femur_R0__knee_R0",
        "body__hip_R0__femur_R0__knee_R0__kneeball_R0",
        "body__hip_R0__femur_R0__knee_R0__tibiaseg_R0",
        "body__hip_L0",
        "body__hip_L0__hipball_L0",
        "body__hip_L0__femur_L0",
        "body__hip_L0__femur_L0__femurseg_L0",
        "body__hip_L0__femur_L0__knee_L0",
        "body__hip_L0__femur_L0__knee_L0__kneeball_L0",
        "body__hip_L0__femur_L0__knee_L0__tibiaseg_L0",
        "body__hip_R1",
        "body__hip_R1__hipball_R1",
        "body__hip_R1__femur_R1",
        "body__hip_R1__femur_R1__femurseg_R1",
        "body__hip_R1__femur_R1__knee_R1",
        "body__hip_R1__femur_R1__knee_R1__kneeball_R1",
        "body__hip_R1__femur_R1__knee_R1__tibiaseg_R1",
        "body__hip_L1",
        "body__hip_L1__hipball_L1",
        "body__hip_L1__femur_L1",
        "body__hip_L1__femur_L1__femurseg_L1",
        "body__hip_L1__femur_L1__knee_L1",
        "body__hip_L1__femur_L1__knee_L1__kneeball_L1",
        "body__hip_L1__femur_L1__knee_L1__tibiaseg_L1",
        "body__hip_R2",
        "body__hip_R2__hipball_R2",
        "body__hip_R2__femur_R2",
        "body__hip_R2__femur_R2__femurseg_R2",
        "body__hip_R2__femur_R2__knee_R2",
        "body__hip_R2__femur_R2__knee_R2__kneeball_R2",
        "body__hip_R2__femur_R2__knee_R2__tibiaseg_R2",
        "body__hip_L2",
        "body__hip_L2__hipball_L2",
        "body__hip_L2__femur_L2",
        "body__hip_L2__femur_L2__femurseg_L2",
        "body__hip_L2__femur_L2__knee_L2",
        "body__hip_L2__femur_L2__knee_L2__kneeball_L2",
        "body__hip_L2__femur_L2__knee_L2__tibiaseg_L2",
        "body__hip_R3",
        "body__hip_R3__hipball_R3",
        "body__hip_R3__femur_R3",
        "body__hip_R3__femur_R3__femurseg_R3",
        "body__hip_R3__femur_R3__knee_R3",
        "body__hip_R3__femur_R3__knee_R3__kneeball_R3",
        "body__hip_R3__femur_R3__knee_R3__tibiaseg_R3",
        "body__hip_L3",
        "body__hip_L3__hipball_L3",
        "body__hip_L3__femur_L3",
        "body__hip_L3__femur_L3__femurseg_L3",
        "body__hip_L3__femur_L3__knee_L3",
        "body__hip_L3__femur_L3__knee_L3__kneeball_L3",
        "body__hip_L3__femur_L3__knee_L3__tibiaseg_L3"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/spider.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/spider.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
