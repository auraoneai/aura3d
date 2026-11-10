import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "spider": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "spider": {
    type: "model",
    format: "glb",
    url: "/aura-assets/spider.03088a8f.glb",
    hash: "sha256-03088a8f79b3655dd825c2901ac2d35ab1e39da877d641e695c0d017717a4c0c",
    integrity: {
      "version": 1,
      "digest": "sha256-03088a8f79b3655dd825c2901ac2d35ab1e39da877d641e695c0d017717a4c0c"
    },
    bounds: [
      28,
      1.339,
      28
    ],
    sizeBytes: 444756,
    metadata: {
      "materials": [
        "ground_mat",
        "body_mat",
        "joint_mat",
        "eye_mat",
        "leg_mat"
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
          "channelCount": 26
        }
      ],
      "animationMetadata": {
        "clipCount": 1,
        "clips": [
          {
            "index": 0,
            "name": "walk",
            "channelCount": 26,
            "samplerCount": 26,
            "targetPaths": [
              "rotation",
              "translation"
            ],
            "targetNodes": [
              "body__leg_l0_hip",
              "body__leg_l0_hip__leg_l0_shoulder",
              "body__leg_l0_hip__leg_l0_shoulder__leg_l0_knee",
              "body__leg_l1_hip",
              "body__leg_l1_hip__leg_l1_shoulder",
              "body__leg_l1_hip__leg_l1_shoulder__leg_l1_knee",
              "body__leg_l2_hip",
              "body__leg_l2_hip__leg_l2_shoulder",
              "body__leg_l2_hip__leg_l2_shoulder__leg_l2_knee",
              "body__leg_l3_hip",
              "body__leg_l3_hip__leg_l3_shoulder",
              "body__leg_l3_hip__leg_l3_shoulder__leg_l3_knee",
              "body__leg_r0_hip",
              "body__leg_r0_hip__leg_r0_shoulder",
              "body__leg_r0_hip__leg_r0_shoulder__leg_r0_knee",
              "body__leg_r1_hip",
              "body__leg_r1_hip__leg_r1_shoulder",
              "body__leg_r1_hip__leg_r1_shoulder__leg_r1_knee",
              "body__leg_r2_hip",
              "body__leg_r2_hip__leg_r2_shoulder",
              "body__leg_r2_hip__leg_r2_shoulder__leg_r2_knee",
              "body__leg_r3_hip",
              "body__leg_r3_hip__leg_r3_shoulder",
              "body__leg_r3_hip__leg_r3_shoulder__leg_r3_knee",
              "body"
            ],
            "duration": 2,
            "hasRootMotionCandidate": false,
            "frameRate": 19.999998211860817
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
          "body"
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
        "checkedAt": "2026-11-10T07:27:19.131Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/spider.glb",
      "outputPath": "public/aura-assets/spider.03088a8f.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -14,
          -0.019,
          -14
        ],
        "max": [
          14,
          1.32,
          14
        ],
        "size": [
          28,
          1.339,
          28
        ],
        "center": [
          0,
          0.65,
          0
        ],
        "maxDimension": 28,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "ground_mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "body_mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "joint_mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "eye_mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "leg_mat",
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
        "body",
        "body__thorax",
        "body__abdomen",
        "body__abdomen_mark",
        "body__eye_l",
        "body__eye_small_l",
        "body__fang_l",
        "body__eye_r",
        "body__eye_small_r",
        "body__fang_r",
        "body__leg_l0_hip",
        "body__leg_l0_hip__leg_l0_shoulder",
        "body__leg_l0_hip__leg_l0_shoulder__leg_l0_hipball",
        "body__leg_l0_hip__leg_l0_shoulder__leg_l0_upper",
        "body__leg_l0_hip__leg_l0_shoulder__leg_l0_knee",
        "body__leg_l0_hip__leg_l0_shoulder__leg_l0_knee__leg_l0_kneeball",
        "body__leg_l0_hip__leg_l0_shoulder__leg_l0_knee__leg_l0_lower",
        "body__leg_l0_hip__leg_l0_shoulder__leg_l0_knee__leg_l0_foot",
        "body__leg_l1_hip",
        "body__leg_l1_hip__leg_l1_shoulder",
        "body__leg_l1_hip__leg_l1_shoulder__leg_l1_hipball",
        "body__leg_l1_hip__leg_l1_shoulder__leg_l1_upper",
        "body__leg_l1_hip__leg_l1_shoulder__leg_l1_knee",
        "body__leg_l1_hip__leg_l1_shoulder__leg_l1_knee__leg_l1_kneeball",
        "body__leg_l1_hip__leg_l1_shoulder__leg_l1_knee__leg_l1_lower",
        "body__leg_l1_hip__leg_l1_shoulder__leg_l1_knee__leg_l1_foot",
        "body__leg_l2_hip",
        "body__leg_l2_hip__leg_l2_shoulder",
        "body__leg_l2_hip__leg_l2_shoulder__leg_l2_hipball",
        "body__leg_l2_hip__leg_l2_shoulder__leg_l2_upper",
        "body__leg_l2_hip__leg_l2_shoulder__leg_l2_knee",
        "body__leg_l2_hip__leg_l2_shoulder__leg_l2_knee__leg_l2_kneeball",
        "body__leg_l2_hip__leg_l2_shoulder__leg_l2_knee__leg_l2_lower",
        "body__leg_l2_hip__leg_l2_shoulder__leg_l2_knee__leg_l2_foot",
        "body__leg_l3_hip",
        "body__leg_l3_hip__leg_l3_shoulder",
        "body__leg_l3_hip__leg_l3_shoulder__leg_l3_hipball",
        "body__leg_l3_hip__leg_l3_shoulder__leg_l3_upper",
        "body__leg_l3_hip__leg_l3_shoulder__leg_l3_knee",
        "body__leg_l3_hip__leg_l3_shoulder__leg_l3_knee__leg_l3_kneeball",
        "body__leg_l3_hip__leg_l3_shoulder__leg_l3_knee__leg_l3_lower",
        "body__leg_l3_hip__leg_l3_shoulder__leg_l3_knee__leg_l3_foot",
        "body__leg_r0_hip",
        "body__leg_r0_hip__leg_r0_shoulder",
        "body__leg_r0_hip__leg_r0_shoulder__leg_r0_hipball",
        "body__leg_r0_hip__leg_r0_shoulder__leg_r0_upper",
        "body__leg_r0_hip__leg_r0_shoulder__leg_r0_knee",
        "body__leg_r0_hip__leg_r0_shoulder__leg_r0_knee__leg_r0_kneeball",
        "body__leg_r0_hip__leg_r0_shoulder__leg_r0_knee__leg_r0_lower",
        "body__leg_r0_hip__leg_r0_shoulder__leg_r0_knee__leg_r0_foot",
        "body__leg_r1_hip",
        "body__leg_r1_hip__leg_r1_shoulder",
        "body__leg_r1_hip__leg_r1_shoulder__leg_r1_hipball",
        "body__leg_r1_hip__leg_r1_shoulder__leg_r1_upper",
        "body__leg_r1_hip__leg_r1_shoulder__leg_r1_knee",
        "body__leg_r1_hip__leg_r1_shoulder__leg_r1_knee__leg_r1_kneeball",
        "body__leg_r1_hip__leg_r1_shoulder__leg_r1_knee__leg_r1_lower",
        "body__leg_r1_hip__leg_r1_shoulder__leg_r1_knee__leg_r1_foot",
        "body__leg_r2_hip",
        "body__leg_r2_hip__leg_r2_shoulder",
        "body__leg_r2_hip__leg_r2_shoulder__leg_r2_hipball",
        "body__leg_r2_hip__leg_r2_shoulder__leg_r2_upper",
        "body__leg_r2_hip__leg_r2_shoulder__leg_r2_knee",
        "body__leg_r2_hip__leg_r2_shoulder__leg_r2_knee__leg_r2_kneeball",
        "body__leg_r2_hip__leg_r2_shoulder__leg_r2_knee__leg_r2_lower",
        "body__leg_r2_hip__leg_r2_shoulder__leg_r2_knee__leg_r2_foot",
        "body__leg_r3_hip",
        "body__leg_r3_hip__leg_r3_shoulder",
        "body__leg_r3_hip__leg_r3_shoulder__leg_r3_hipball",
        "body__leg_r3_hip__leg_r3_shoulder__leg_r3_upper",
        "body__leg_r3_hip__leg_r3_shoulder__leg_r3_knee",
        "body__leg_r3_hip__leg_r3_shoulder__leg_r3_knee__leg_r3_kneeball",
        "body__leg_r3_hip__leg_r3_shoulder__leg_r3_knee__leg_r3_lower",
        "body__leg_r3_hip__leg_r3_shoulder__leg_r3_knee__leg_r3_foot"
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
