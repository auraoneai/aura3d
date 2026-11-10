import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "spider": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "spider": {
    type: "model",
    format: "glb",
    url: "/aura-assets/spider.4560beb3.glb",
    hash: "sha256-4560beb340aff56760e46b37136bb70a58f44c1572902ee6013b7d15cea0810b",
    integrity: {
      "version": 1,
      "digest": "sha256-4560beb340aff56760e46b37136bb70a58f44c1572902ee6013b7d15cea0810b"
    },
    bounds: [
      120,
      1.457,
      120
    ],
    sizeBytes: 457176,
    metadata: {
      "materials": [
        "spider_meshstandard_0",
        "spider_meshstandard_1",
        "spider_meshstandard_2",
        "spider_meshstandard_3",
        "spider_meshstandard_4"
      ],
      "animations": [
        "walk"
      ],
      "animationClips": [
        "walk"
      ],
      "animationClipDetails": [
        {
          "name": "walk",
          "duration": 2,
          "channelCount": 25
        }
      ],
      "animationMetadata": {
        "clipCount": 1,
        "clips": [
          {
            "index": 0,
            "name": "walk",
            "channelCount": 25,
            "samplerCount": 25,
            "targetPaths": [
              "rotation",
              "translation"
            ],
            "targetNodes": [
              "spider_body__yaw_r1",
              "spider_body__yaw_r1__lift_r1",
              "spider_body__yaw_r1__lift_r1__knee_r1",
              "spider_body__yaw_r2",
              "spider_body__yaw_r2__lift_r2",
              "spider_body__yaw_r2__lift_r2__knee_r2",
              "spider_body__yaw_r3",
              "spider_body__yaw_r3__lift_r3",
              "spider_body__yaw_r3__lift_r3__knee_r3",
              "spider_body__yaw_r4",
              "spider_body__yaw_r4__lift_r4",
              "spider_body__yaw_r4__lift_r4__knee_r4",
              "spider_body__yaw_l1",
              "spider_body__yaw_l1__lift_l1",
              "spider_body__yaw_l1__lift_l1__knee_l1",
              "spider_body__yaw_l2",
              "spider_body__yaw_l2__lift_l2",
              "spider_body__yaw_l2__lift_l2__knee_l2",
              "spider_body__yaw_l3",
              "spider_body__yaw_l3__lift_l3",
              "spider_body__yaw_l3__lift_l3__knee_l3",
              "spider_body__yaw_l4",
              "spider_body__yaw_l4__lift_l4",
              "spider_body__yaw_l4__lift_l4__knee_l4",
              "spider_body"
            ],
            "duration": 2,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
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
        "nodeCount": 75,
        "meshCount": 50,
        "materialCount": 5,
        "textureCount": 0,
        "animationClipCount": 1,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "ground",
          "spider_body"
        ],
        "maxDepth": 5,
        "messages": [
          "Detected 75 nodes across 2 roots."
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
        "checkedAt": "2026-11-10T07:44:26.604Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/spider.glb",
      "outputPath": "public/aura-assets/spider.4560beb3.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -60,
          0,
          -60
        ],
        "max": [
          60,
          1.457,
          60
        ],
        "size": [
          120,
          1.457,
          120
        ],
        "center": [
          0,
          0.728,
          0
        ],
        "maxDimension": 120,
        "grounded": true
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
        "ground",
        "spider_body",
        "spider_body__abdomen",
        "spider_body__thorax",
        "spider_body__head",
        "spider_body__eye_r",
        "spider_body__eye2_r",
        "spider_body__fang_r",
        "spider_body__eye_l",
        "spider_body__eye2_l",
        "spider_body__fang_l",
        "spider_body__yaw_r1",
        "spider_body__yaw_r1__lift_r1",
        "spider_body__yaw_r1__lift_r1__hip_r1",
        "spider_body__yaw_r1__lift_r1__upper_r1",
        "spider_body__yaw_r1__lift_r1__knee_r1",
        "spider_body__yaw_r1__lift_r1__knee_r1__kneeball_r1",
        "spider_body__yaw_r1__lift_r1__knee_r1__lower_r1",
        "spider_body__yaw_r1__lift_r1__knee_r1__foot_r1",
        "spider_body__yaw_r2",
        "spider_body__yaw_r2__lift_r2",
        "spider_body__yaw_r2__lift_r2__hip_r2",
        "spider_body__yaw_r2__lift_r2__upper_r2",
        "spider_body__yaw_r2__lift_r2__knee_r2",
        "spider_body__yaw_r2__lift_r2__knee_r2__kneeball_r2",
        "spider_body__yaw_r2__lift_r2__knee_r2__lower_r2",
        "spider_body__yaw_r2__lift_r2__knee_r2__foot_r2",
        "spider_body__yaw_r3",
        "spider_body__yaw_r3__lift_r3",
        "spider_body__yaw_r3__lift_r3__hip_r3",
        "spider_body__yaw_r3__lift_r3__upper_r3",
        "spider_body__yaw_r3__lift_r3__knee_r3",
        "spider_body__yaw_r3__lift_r3__knee_r3__kneeball_r3",
        "spider_body__yaw_r3__lift_r3__knee_r3__lower_r3",
        "spider_body__yaw_r3__lift_r3__knee_r3__foot_r3",
        "spider_body__yaw_r4",
        "spider_body__yaw_r4__lift_r4",
        "spider_body__yaw_r4__lift_r4__hip_r4",
        "spider_body__yaw_r4__lift_r4__upper_r4",
        "spider_body__yaw_r4__lift_r4__knee_r4",
        "spider_body__yaw_r4__lift_r4__knee_r4__kneeball_r4",
        "spider_body__yaw_r4__lift_r4__knee_r4__lower_r4",
        "spider_body__yaw_r4__lift_r4__knee_r4__foot_r4",
        "spider_body__yaw_l1",
        "spider_body__yaw_l1__lift_l1",
        "spider_body__yaw_l1__lift_l1__hip_l1",
        "spider_body__yaw_l1__lift_l1__upper_l1",
        "spider_body__yaw_l1__lift_l1__knee_l1",
        "spider_body__yaw_l1__lift_l1__knee_l1__kneeball_l1",
        "spider_body__yaw_l1__lift_l1__knee_l1__lower_l1",
        "spider_body__yaw_l1__lift_l1__knee_l1__foot_l1",
        "spider_body__yaw_l2",
        "spider_body__yaw_l2__lift_l2",
        "spider_body__yaw_l2__lift_l2__hip_l2",
        "spider_body__yaw_l2__lift_l2__upper_l2",
        "spider_body__yaw_l2__lift_l2__knee_l2",
        "spider_body__yaw_l2__lift_l2__knee_l2__kneeball_l2",
        "spider_body__yaw_l2__lift_l2__knee_l2__lower_l2",
        "spider_body__yaw_l2__lift_l2__knee_l2__foot_l2",
        "spider_body__yaw_l3",
        "spider_body__yaw_l3__lift_l3",
        "spider_body__yaw_l3__lift_l3__hip_l3",
        "spider_body__yaw_l3__lift_l3__upper_l3",
        "spider_body__yaw_l3__lift_l3__knee_l3",
        "spider_body__yaw_l3__lift_l3__knee_l3__kneeball_l3",
        "spider_body__yaw_l3__lift_l3__knee_l3__lower_l3",
        "spider_body__yaw_l3__lift_l3__knee_l3__foot_l3",
        "spider_body__yaw_l4",
        "spider_body__yaw_l4__lift_l4",
        "spider_body__yaw_l4__lift_l4__hip_l4",
        "spider_body__yaw_l4__lift_l4__upper_l4",
        "spider_body__yaw_l4__lift_l4__knee_l4",
        "spider_body__yaw_l4__lift_l4__knee_l4__kneeball_l4",
        "spider_body__yaw_l4__lift_l4__knee_l4__lower_l4",
        "spider_body__yaw_l4__lift_l4__knee_l4__foot_l4"
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
