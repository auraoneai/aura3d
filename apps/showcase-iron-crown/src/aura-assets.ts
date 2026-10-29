import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "ironcrownBoulder": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownCrown": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownJinx": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownKenji": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownSeraph": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownSovereign": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownVolt": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "ironcrownBoulder": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownBoulder.96f0aa08.glb",
    hash: "sha256-96f0aa08c72dc3eee3dd768f72c19acf59286267c52f799faa7c24f3b5096f2b",
    bounds: [
      0.015,
      0.02,
      0.007
    ],
    sizeBytes: 2018704,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Walk_Fight_Forward",
        "Walk_Fight_Back",
        "Left_Jab_from_Guard",
        "Right_Uppercut_from_Guard",
        "Triple_Combo_Attack",
        "Block1",
        "Hit_Reaction",
        "Dead",
        "Regular_Jump"
      ],
      "animationClips": [
      "Idle",
      "Walk_Fight_Forward",
      "Walk_Fight_Back",
      "Left_Jab_from_Guard",
      "Right_Uppercut_from_Guard",
      "Triple_Combo_Attack",
      "Block1",
      "Hit_Reaction",
      "Dead",
      "Regular_Jump"
    ],
      "animationMetadata": {
        "clipCount": 10,
        "clips": [
          {
            "index": 0,
            "name": "Idle",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 4,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 1,
            "name": "Walk_Fight_Forward",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.6666666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walk_Fight_Back",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.6666666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Left_Jab_from_Guard",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.7,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 4,
            "name": "Right_Uppercut_from_Guard",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 5,
            "name": "Triple_Combo_Attack",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 4.333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 6,
            "name": "Block1",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 3.466666666666667,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 7,
            "name": "Hit_Reaction",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.6333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 8,
            "name": "Dead",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 2.966666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 9,
            "name": "Regular_Jump",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.8333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          }
        ],
        "messages": [
          "Detected 10 embedded animation clips."
        ]
      },
      "humanoid": true,
      "humanoidStatus": "humanoid",
      "humanoidConfidence": "high",
      "skeleton": {
        "skinCount": 1,
        "jointCount": 24,
        "skins": [
          {
            "index": 0,
            "name": "Armature",
            "jointCount": 24,
            "joints": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ]
          }
        ],
        "messages": [
          "Detected 1 skin with 24 unique joints."
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
        "nodeCount": 26,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 1,
        "animationClipCount": 10,
        "skinCount": 1,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Armature"
        ],
        "maxDepth": 9,
        "messages": [
          "Detected 26 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownBoulder.96f0aa08.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:34:55.132Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownBoulder.rights.968cd708eaf2.json",
          "aura-evidence/meshy/ironcrownBoulder.metadata.53a33b921576.json",
          "aura-evidence/restyle/ironcrownBoulder.flatface.json",
          "public/aura-assets/ironcrownBoulder.meshy-candidate.d5eb65ae.png"
        ],
        "checkedAt": "2026-10-17T09:34:55.132Z"
      },
      "sourcePath": "public/aura-assets/ironcrownBoulder.96f0aa08.glb",
      "outputPath": "public/aura-assets/ironcrownBoulder.96f0aa08.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.007,
          0,
          -0.003
        ],
        "max": [
          0.007,
          0.02,
          0.003
        ],
        "size": [
          0.015,
          0.02,
          0.007
        ],
        "center": [
          0,
          0.01,
          0
        ],
        "maxDimension": 0.02,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "BakedMaterial",
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
        "head_end",
        "headfront",
        "Head",
        "neck",
        "LeftHand",
        "LeftForeArm",
        "LeftArm",
        "LeftShoulder",
        "RightHand",
        "RightForeArm",
        "RightArm",
        "RightShoulder",
        "Spine",
        "Spine01",
        "Spine02",
        "LeftToeBase",
        "LeftFoot",
        "LeftLeg",
        "LeftUpLeg",
        "RightToeBase",
        "RightFoot",
        "RightLeg",
        "RightUpLeg",
        "Hips",
        "char1",
        "Armature"
      ],
      "textures": [
        "BakedMaterial_baseColor"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownBoulder.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/ironcrownBoulder.meshy-candidate.d5eb65ae.png",
        "kind": "manual-inspection",
        "sha256": "sha256-d5eb65ae02b6230012407e8a25d0dd1c3b4d4ca46f5a6fe1fa1418a576a78087",
        "checkedAt": "2026-10-17T09:38:56.950Z"
      }
    },
  },
  "ironcrownCrown": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownCrown.e44eaa1e.glb",
    hash: "sha256-e44eaa1ee71c642e06a48d4600e92268d139b669ab3f11bd8c596e440eebb631",
    bounds: [
      1.896,
      1.882,
      1.897
    ],
    sizeBytes: 17940548,
    metadata: {
      "materials": [
        "material-0"
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
        "nodeCount": 1,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 1,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "node-0"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownCrown.e44eaa1e.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:20:39.885Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownCrown.rights.968cd708eaf2.json",
          "aura-evidence/meshy/ironcrownCrown.metadata.ac86dc68c34f.json",
          "public/aura-assets/ironcrownCrown.meshy-candidate.54e34b09.png"
        ],
        "checkedAt": "2026-10-17T09:20:39.885Z"
      },
      "sourcePath": "public/aura-assets/ironcrownCrown.e44eaa1e.glb",
      "outputPath": "public/aura-assets/ironcrownCrown.e44eaa1e.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.95,
          -0.952,
          -0.95
        ],
        "max": [
          0.946,
          0.93,
          0.947
        ],
        "size": [
          1.896,
          1.882,
          1.897
        ],
        "center": [
          -0.002,
          -0.011,
          -0.002
        ],
        "maxDimension": 1.897,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "material-0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "alphaMode": "OPAQUE",
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
        "node-0"
      ],
      "textures": [
        "image-0"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownCrown.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "renderedProbe": {
        "url": "/aura-assets/ironcrownCrown.meshy-candidate.54e34b09.png",
        "kind": "manual-inspection",
        "sha256": "sha256-54e34b095bc327c380598425709529635bd7c4e9da370caf51e0ee4a3e4c1aac",
        "checkedAt": "2026-10-17T09:38:59.195Z"
      }
    },
  },
  "ironcrownJinx": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownJinx.729361f1.glb",
    hash: "sha256-729361f1ee3a8f1a665713538d24484961fcc8fbc86786fd3c827e26cfaece38",
    bounds: [
      0.008,
      0.017,
      0.008
    ],
    sizeBytes: 2058444,
    metadata: {
      "materials": [
        "Material_1"
      ],
      "animations": [
        "Idle",
        "Walk_Fight_Forward",
        "Walk_Fight_Back",
        "Left_Jab_from_Guard",
        "Right_Uppercut_from_Guard",
        "Triple_Combo_Attack",
        "Block1",
        "Hit_Reaction",
        "Dead",
        "Regular_Jump"
      ],
      "animationClips": [
      "Idle",
      "Walk_Fight_Forward",
      "Walk_Fight_Back",
      "Left_Jab_from_Guard",
      "Right_Uppercut_from_Guard",
      "Triple_Combo_Attack",
      "Block1",
      "Hit_Reaction",
      "Dead",
      "Regular_Jump"
    ],
      "animationMetadata": {
        "clipCount": 10,
        "clips": [
          {
            "index": 0,
            "name": "Idle",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase",
              "Spine02",
              "Spine01",
              "Spine",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "neck",
              "Head",
              "head_end",
              "headfront"
            ],
            "duration": 4,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 1,
            "name": "Walk_Fight_Forward",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase",
              "Spine02",
              "Spine01",
              "Spine",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "neck",
              "Head",
              "head_end",
              "headfront"
            ],
            "duration": 1.7333333333333334,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walk_Fight_Back",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase",
              "Spine02",
              "Spine01",
              "Spine",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "neck",
              "Head",
              "head_end",
              "headfront"
            ],
            "duration": 1.7333333333333334,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Left_Jab_from_Guard",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase",
              "Spine02",
              "Spine01",
              "Spine",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "neck",
              "Head",
              "head_end",
              "headfront"
            ],
            "duration": 1.7666666666666666,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 4,
            "name": "Right_Uppercut_from_Guard",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase",
              "Spine02",
              "Spine01",
              "Spine",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "neck",
              "Head",
              "head_end",
              "headfront"
            ],
            "duration": 1.0333333333333334,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 5,
            "name": "Triple_Combo_Attack",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase",
              "Spine02",
              "Spine01",
              "Spine",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "neck",
              "Head",
              "head_end",
              "headfront"
            ],
            "duration": 4.333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 6,
            "name": "Block1",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase",
              "Spine02",
              "Spine01",
              "Spine",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "neck",
              "Head",
              "head_end",
              "headfront"
            ],
            "duration": 3.466666666666667,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 7,
            "name": "Hit_Reaction",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase",
              "Spine02",
              "Spine01",
              "Spine",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "neck",
              "Head",
              "head_end",
              "headfront"
            ],
            "duration": 1.6333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 8,
            "name": "Dead",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase",
              "Spine02",
              "Spine01",
              "Spine",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "neck",
              "Head",
              "head_end",
              "headfront"
            ],
            "duration": 2.966666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 9,
            "name": "Regular_Jump",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase",
              "Spine02",
              "Spine01",
              "Spine",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "neck",
              "Head",
              "head_end",
              "headfront"
            ],
            "duration": 1.9,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          }
        ],
        "messages": [
          "Detected 10 embedded animation clips."
        ]
      },
      "humanoid": true,
      "humanoidStatus": "humanoid",
      "humanoidConfidence": "high",
      "skeleton": {
        "skinCount": 1,
        "jointCount": 24,
        "skins": [
          {
            "index": 0,
            "name": "Armature",
            "jointCount": 24,
            "joints": [
              "Hips",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase",
              "Spine02",
              "Spine01",
              "Spine",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "neck",
              "Head",
              "head_end",
              "headfront"
            ]
          }
        ],
        "messages": [
          "Detected 1 skin with 24 unique joints."
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
        "nodeCount": 26,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 1,
        "animationClipCount": 10,
        "skinCount": 1,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Armature"
        ],
        "maxDepth": 9,
        "messages": [
          "Detected 26 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownJinx.729361f1.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:36:34.890Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownJinx.rights.968cd708eaf2.json",
          "aura-evidence/meshy/ironcrownJinx.metadata.cc203f47c932.json",
          "public/aura-assets/ironcrownJinx.meshy-candidate.fdeff851.png"
        ],
        "checkedAt": "2026-10-17T09:36:34.890Z"
      },
      "sourcePath": "public/aura-assets/ironcrownJinx.729361f1.glb",
      "outputPath": "public/aura-assets/ironcrownJinx.729361f1.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.004,
          0,
          -0.004
        ],
        "max": [
          0.004,
          0.017,
          0.004
        ],
        "size": [
          0.008,
          0.017,
          0.008
        ],
        "center": [
          0,
          0.008,
          0
        ],
        "maxDimension": 0.017,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Material_1",
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
        "LeftToeBase",
        "LeftFoot",
        "LeftLeg",
        "LeftUpLeg",
        "RightToeBase",
        "RightFoot",
        "RightLeg",
        "RightUpLeg",
        "LeftHand",
        "LeftForeArm",
        "LeftArm",
        "LeftShoulder",
        "RightHand",
        "RightForeArm",
        "RightArm",
        "RightShoulder",
        "head_end",
        "headfront",
        "Head",
        "neck",
        "Spine",
        "Spine01",
        "Spine02",
        "Hips",
        "char1",
        "Armature"
      ],
      "textures": [
        "texture_0"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownJinx.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/ironcrownJinx.meshy-candidate.fdeff851.png",
        "kind": "manual-inspection",
        "sha256": "sha256-fdeff851c1ca400415d3063c96d094d316eacbbf93e3c3809b4f324406c53897",
        "checkedAt": "2026-10-17T09:38:57.369Z"
      }
    },
  },
  "ironcrownKenji": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownKenji.bd4d2025.glb",
    hash: "sha256-bd4d20251ef6a81d9ee8c3e683733748c40fa112503aee49b409945c75c553d4",
    bounds: [
      0.012,
      0.018,
      0.008
    ],
    sizeBytes: 3580244,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Walk_Fight_Forward",
        "Walk_Fight_Back",
        "Left_Jab_from_Guard",
        "Right_Uppercut_from_Guard",
        "Triple_Combo_Attack",
        "Block1",
        "Hit_Reaction",
        "Dead",
        "Regular_Jump"
      ],
      "animationClips": [
      "Idle",
      "Walk_Fight_Forward",
      "Walk_Fight_Back",
      "Left_Jab_from_Guard",
      "Right_Uppercut_from_Guard",
      "Triple_Combo_Attack",
      "Block1",
      "Hit_Reaction",
      "Dead",
      "Regular_Jump"
    ],
      "animationMetadata": {
        "clipCount": 10,
        "clips": [
          {
            "index": 0,
            "name": "Idle",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 4,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 1,
            "name": "Walk_Fight_Forward",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.6666666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walk_Fight_Back",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.6666666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Left_Jab_from_Guard",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.7,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 4,
            "name": "Right_Uppercut_from_Guard",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 5,
            "name": "Triple_Combo_Attack",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 4.333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 6,
            "name": "Block1",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 3.466666666666667,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 7,
            "name": "Hit_Reaction",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.6333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 8,
            "name": "Dead",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 2.966666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 9,
            "name": "Regular_Jump",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.8333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          }
        ],
        "messages": [
          "Detected 10 embedded animation clips."
        ]
      },
      "humanoid": true,
      "humanoidStatus": "humanoid",
      "humanoidConfidence": "high",
      "skeleton": {
        "skinCount": 1,
        "jointCount": 24,
        "skins": [
          {
            "index": 0,
            "name": "Armature",
            "jointCount": 24,
            "joints": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ]
          }
        ],
        "messages": [
          "Detected 1 skin with 24 unique joints."
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
        "nodeCount": 26,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 1,
        "animationClipCount": 10,
        "skinCount": 1,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Armature"
        ],
        "maxDepth": 9,
        "messages": [
          "Detected 26 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownKenji.bd4d2025.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:34:31.036Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownKenji.rights.968cd708eaf2.json",
          "aura-evidence/meshy/ironcrownKenji.metadata.ad60daad72c2.json",
          "public/aura-assets/ironcrownKenji.meshy-candidate.5df2e356.png",
          "aura-evidence/restyle/ironcrownKenji.restyle.json"
        ],
        "checkedAt": "2026-10-17T09:34:31.036Z"
      },
      "sourcePath": "public/aura-assets/ironcrownKenji.bd4d2025.glb",
      "outputPath": "public/aura-assets/ironcrownKenji.bd4d2025.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.006,
          0,
          -0.004
        ],
        "max": [
          0.006,
          0.018,
          0.004
        ],
        "size": [
          0.012,
          0.018,
          0.008
        ],
        "center": [
          0,
          0.009,
          0
        ],
        "maxDimension": 0.018,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "BakedMaterial",
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
        "head_end",
        "headfront",
        "Head",
        "neck",
        "LeftHand",
        "LeftForeArm",
        "LeftArm",
        "LeftShoulder",
        "RightHand",
        "RightForeArm",
        "RightArm",
        "RightShoulder",
        "Spine",
        "Spine01",
        "Spine02",
        "LeftToeBase",
        "LeftFoot",
        "LeftLeg",
        "LeftUpLeg",
        "RightToeBase",
        "RightFoot",
        "RightLeg",
        "RightUpLeg",
        "Hips",
        "char1",
        "Armature"
      ],
      "textures": [
        "BakedMaterial_baseColor"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownKenji.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/ironcrownKenji.meshy-candidate.5df2e356.png",
        "kind": "manual-inspection",
        "sha256": "sha256-5df2e35621017ca68572f5e7027bacaa7f54698d4386ee038e887ebf1d30e80e",
        "checkedAt": "2026-10-17T09:38:56.543Z"
      }
    },
  },
  "ironcrownSeraph": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownSeraph.c6feb949.glb",
    hash: "sha256-c6feb949c69be12dee9796e1af6775475a1bbb00c9ce4e2988af169e6960e261",
    bounds: [
      0.011,
      0.019,
      0.007
    ],
    sizeBytes: 2409624,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Walk_Fight_Forward",
        "Walk_Fight_Back",
        "Left_Jab_from_Guard",
        "Right_Uppercut_from_Guard",
        "Triple_Combo_Attack",
        "Block1",
        "Hit_Reaction",
        "Dead",
        "Regular_Jump"
      ],
      "animationClips": [
      "Idle",
      "Walk_Fight_Forward",
      "Walk_Fight_Back",
      "Left_Jab_from_Guard",
      "Right_Uppercut_from_Guard",
      "Triple_Combo_Attack",
      "Block1",
      "Hit_Reaction",
      "Dead",
      "Regular_Jump"
    ],
      "animationMetadata": {
        "clipCount": 10,
        "clips": [
          {
            "index": 0,
            "name": "Idle",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 4,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 1,
            "name": "Walk_Fight_Forward",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.6666666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walk_Fight_Back",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.6666666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Left_Jab_from_Guard",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.7,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 4,
            "name": "Right_Uppercut_from_Guard",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 5,
            "name": "Triple_Combo_Attack",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 4.333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 6,
            "name": "Block1",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 3.466666666666667,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 7,
            "name": "Hit_Reaction",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.6333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 8,
            "name": "Dead",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 2.966666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 9,
            "name": "Regular_Jump",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.8333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          }
        ],
        "messages": [
          "Detected 10 embedded animation clips."
        ]
      },
      "humanoid": true,
      "humanoidStatus": "humanoid",
      "humanoidConfidence": "high",
      "skeleton": {
        "skinCount": 1,
        "jointCount": 24,
        "skins": [
          {
            "index": 0,
            "name": "Armature",
            "jointCount": 24,
            "joints": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ]
          }
        ],
        "messages": [
          "Detected 1 skin with 24 unique joints."
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
        "nodeCount": 26,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 1,
        "animationClipCount": 10,
        "skinCount": 1,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Armature"
        ],
        "maxDepth": 9,
        "messages": [
          "Detected 26 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownSeraph.c6feb949.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:35:27.051Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownSeraph.rights.968cd708eaf2.json",
          "aura-evidence/meshy/ironcrownSeraph.metadata.a345b576c622.json",
          "aura-evidence/restyle/ironcrownSeraph.flatface.json",
          "public/aura-assets/ironcrownSeraph.meshy-candidate.51b3e26d.png"
        ],
        "checkedAt": "2026-10-17T09:35:27.051Z"
      },
      "sourcePath": "public/aura-assets/ironcrownSeraph.c6feb949.glb",
      "outputPath": "public/aura-assets/ironcrownSeraph.c6feb949.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.005,
          0,
          -0.003
        ],
        "max": [
          0.005,
          0.019,
          0.003
        ],
        "size": [
          0.011,
          0.019,
          0.007
        ],
        "center": [
          0,
          0.009,
          0
        ],
        "maxDimension": 0.019,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "BakedMaterial",
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
        "head_end",
        "headfront",
        "Head",
        "neck",
        "LeftHand",
        "LeftForeArm",
        "LeftArm",
        "LeftShoulder",
        "RightHand",
        "RightForeArm",
        "RightArm",
        "RightShoulder",
        "Spine",
        "Spine01",
        "Spine02",
        "LeftToeBase",
        "LeftFoot",
        "LeftLeg",
        "LeftUpLeg",
        "RightToeBase",
        "RightFoot",
        "RightLeg",
        "RightUpLeg",
        "Hips",
        "char1",
        "Armature"
      ],
      "textures": [
        "BakedMaterial_baseColor"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownSeraph.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/ironcrownSeraph.meshy-candidate.51b3e26d.png",
        "kind": "manual-inspection",
        "sha256": "sha256-51b3e26d654e7578fbead3797bcd5b312430166ea8aded9be1ddf2da62a92c72",
        "checkedAt": "2026-10-17T09:38:57.159Z"
      }
    },
  },
  "ironcrownSovereign": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownSovereign.3f0c20b1.glb",
    hash: "sha256-3f0c20b11bfee92e999b65aa10cafc18abd864a348349667fbc39d11e8ae8fdd",
    bounds: [
      0.019,
      0.02,
      0.016
    ],
    sizeBytes: 2984852,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Walk_Fight_Forward",
        "Walk_Fight_Back",
        "Left_Jab_from_Guard",
        "Right_Uppercut_from_Guard",
        "Triple_Combo_Attack",
        "Block1",
        "Hit_Reaction",
        "Dead",
        "Regular_Jump"
      ],
      "animationClips": [
      "Idle",
      "Walk_Fight_Forward",
      "Walk_Fight_Back",
      "Left_Jab_from_Guard",
      "Right_Uppercut_from_Guard",
      "Triple_Combo_Attack",
      "Block1",
      "Hit_Reaction",
      "Dead",
      "Regular_Jump"
    ],
      "animationMetadata": {
        "clipCount": 10,
        "clips": [
          {
            "index": 0,
            "name": "Idle",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 4,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 1,
            "name": "Walk_Fight_Forward",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.6666666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walk_Fight_Back",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.6666666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Left_Jab_from_Guard",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.7,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 4,
            "name": "Right_Uppercut_from_Guard",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 5,
            "name": "Triple_Combo_Attack",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 4.333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 6,
            "name": "Block1",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 3.466666666666667,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 7,
            "name": "Hit_Reaction",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.6333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 8,
            "name": "Dead",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 2.966666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 9,
            "name": "Regular_Jump",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.8333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          }
        ],
        "messages": [
          "Detected 10 embedded animation clips."
        ]
      },
      "humanoid": true,
      "humanoidStatus": "humanoid",
      "humanoidConfidence": "high",
      "skeleton": {
        "skinCount": 1,
        "jointCount": 24,
        "skins": [
          {
            "index": 0,
            "name": "Armature",
            "jointCount": 24,
            "joints": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ]
          }
        ],
        "messages": [
          "Detected 1 skin with 24 unique joints."
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
        "nodeCount": 26,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 1,
        "animationClipCount": 10,
        "skinCount": 1,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Armature"
        ],
        "maxDepth": 9,
        "messages": [
          "Detected 26 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownSovereign.3f0c20b1.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:35:44.853Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownSovereign.rights.968cd708eaf2.json",
          "aura-evidence/meshy/ironcrownSovereign.metadata.34d990cc2ffb.json",
          "aura-evidence/restyle/ironcrownSovereign.flatface.json",
          "public/aura-assets/ironcrownSovereign.meshy-candidate.3931a35c.png"
        ],
        "checkedAt": "2026-10-17T09:35:44.853Z"
      },
      "sourcePath": "public/aura-assets/ironcrownSovereign.3f0c20b1.glb",
      "outputPath": "public/aura-assets/ironcrownSovereign.3f0c20b1.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.01,
          0,
          -0.008
        ],
        "max": [
          0.01,
          0.02,
          0.008
        ],
        "size": [
          0.019,
          0.02,
          0.016
        ],
        "center": [
          0,
          0.01,
          0
        ],
        "maxDimension": 0.02,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "BakedMaterial",
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
        "head_end",
        "headfront",
        "Head",
        "neck",
        "LeftHand",
        "LeftForeArm",
        "LeftArm",
        "LeftShoulder",
        "RightHand",
        "RightForeArm",
        "RightArm",
        "RightShoulder",
        "Spine",
        "Spine01",
        "Spine02",
        "LeftToeBase",
        "LeftFoot",
        "LeftLeg",
        "LeftUpLeg",
        "RightToeBase",
        "RightFoot",
        "RightLeg",
        "RightUpLeg",
        "Hips",
        "char1",
        "Armature"
      ],
      "textures": [
        "BakedMaterial_baseColor"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownSovereign.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/ironcrownSovereign.meshy-candidate.3931a35c.png",
        "kind": "manual-inspection",
        "sha256": "sha256-3931a35ce2fa243311cab7d70c7d5a0da67cd75ccb745adf70b60549cf9b65e1",
        "checkedAt": "2026-10-17T09:38:57.575Z"
      }
    },
  },
  "ironcrownVolt": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownVolt.3318e498.glb",
    hash: "sha256-3318e49815ab0feda3d604ad978318fa4182a8289e91e13b24125153f1b0ad86",
    bounds: [
      0.009,
      0.018,
      0.004
    ],
    sizeBytes: 3467976,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Walk_Fight_Forward",
        "Walk_Fight_Back",
        "Left_Jab_from_Guard",
        "Right_Uppercut_from_Guard",
        "Triple_Combo_Attack",
        "Block1",
        "Hit_Reaction",
        "Dead",
        "Regular_Jump"
      ],
      "animationClips": [
      "Idle",
      "Walk_Fight_Forward",
      "Walk_Fight_Back",
      "Left_Jab_from_Guard",
      "Right_Uppercut_from_Guard",
      "Triple_Combo_Attack",
      "Block1",
      "Hit_Reaction",
      "Dead",
      "Regular_Jump"
    ],
      "animationMetadata": {
        "clipCount": 10,
        "clips": [
          {
            "index": 0,
            "name": "Idle",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 4,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 1,
            "name": "Walk_Fight_Forward",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.6666666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walk_Fight_Back",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.6666666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Left_Jab_from_Guard",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.7,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 4,
            "name": "Right_Uppercut_from_Guard",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 5,
            "name": "Triple_Combo_Attack",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 4.333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 6,
            "name": "Block1",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 3.466666666666667,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 7,
            "name": "Hit_Reaction",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.6333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 8,
            "name": "Dead",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 2.966666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 9,
            "name": "Regular_Jump",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.8333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          }
        ],
        "messages": [
          "Detected 10 embedded animation clips."
        ]
      },
      "humanoid": true,
      "humanoidStatus": "humanoid",
      "humanoidConfidence": "high",
      "skeleton": {
        "skinCount": 1,
        "jointCount": 24,
        "skins": [
          {
            "index": 0,
            "name": "Armature",
            "jointCount": 24,
            "joints": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ]
          }
        ],
        "messages": [
          "Detected 1 skin with 24 unique joints."
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
        "nodeCount": 26,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 1,
        "animationClipCount": 10,
        "skinCount": 1,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Armature"
        ],
        "maxDepth": 9,
        "messages": [
          "Detected 26 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownVolt.3318e498.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:35:10.995Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownVolt.rights.968cd708eaf2.json",
          "aura-evidence/meshy/ironcrownVolt.metadata.293efdbc1f68.json",
          "public/aura-assets/ironcrownVolt.meshy-candidate.d97a012a.png",
          "aura-evidence/restyle/ironcrownVolt.restyle.json"
        ],
        "checkedAt": "2026-10-17T09:35:10.995Z"
      },
      "sourcePath": "public/aura-assets/ironcrownVolt.3318e498.glb",
      "outputPath": "public/aura-assets/ironcrownVolt.3318e498.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.005,
          0,
          -0.002
        ],
        "max": [
          0.005,
          0.018,
          0.002
        ],
        "size": [
          0.009,
          0.018,
          0.004
        ],
        "center": [
          0,
          0.009,
          0
        ],
        "maxDimension": 0.018,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "BakedMaterial",
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
        "head_end",
        "headfront",
        "Head",
        "neck",
        "LeftHand",
        "LeftForeArm",
        "LeftArm",
        "LeftShoulder",
        "RightHand",
        "RightForeArm",
        "RightArm",
        "RightShoulder",
        "Spine",
        "Spine01",
        "Spine02",
        "LeftToeBase",
        "LeftFoot",
        "LeftLeg",
        "LeftUpLeg",
        "RightToeBase",
        "RightFoot",
        "RightLeg",
        "RightUpLeg",
        "Hips",
        "char1",
        "Armature"
      ],
      "textures": [
        "BakedMaterial_baseColor"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownVolt.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/ironcrownVolt.meshy-candidate.d97a012a.png",
        "kind": "manual-inspection",
        "sha256": "sha256-d97a012a4c99affb565a7c84cba5e0215cbb71a4cf96d1a22745609b0034e897",
        "checkedAt": "2026-10-17T09:38:56.741Z"
      }
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
