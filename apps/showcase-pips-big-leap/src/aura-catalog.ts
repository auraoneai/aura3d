import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "pipsBrambleback": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsCheckpointFlag": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsGoldenAcorn": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsPip": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsSungate": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsSunseed": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "pipsBrambleback": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsBrambleback.6aaa3db3.glb",
    hash: "sha256-6aaa3db380dbc178045a7c39af698f997f0e87e588ece1e9e28836a47e9b87cb",
    bounds: [
      0.022,
      0.024,
      0.011
    ],
    sizeBytes: 2425048,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Attack",
        "Hit_Reaction",
        "Dead",
        "Quick_Walk",
        "Chest_Pound_Taunt"
      ],
      // NOTE(typegen skew): the current typegen emits animationClips as
      // {name,duration,channelCount} objects, but `AuraAssetMetadata` still
      // declares `readonly string[]`; kept in the declared shape here (full
      // clip records remain under `animationMetadata.clips`) until the shared
      // type is widened.
      "animationClips": [
        "Idle",
        "Attack",
        "Hit_Reaction",
        "Dead",
        "Quick_Walk",
        "Chest_Pound_Taunt"
      ],
      "animationMetadata": {
        "clipCount": 6,
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
            "name": "Attack",
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
            "duration": 2.8,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 2,
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
            "index": 3,
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
            "index": 4,
            "name": "Quick_Walk",
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
            "duration": 3,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 5,
            "name": "Chest_Pound_Taunt",
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
            "duration": 4.833333333333333,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 6 embedded animation clips."
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
        "animationClipCount": 6,
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
        "sourcePath": "public/aura-assets/pipsBrambleback.6aaa3db3.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:36:30.616Z",
        "evidence": [
          "aura-evidence/meshy/pipsBrambleback.rights.968cd708eaf2.json",
          "aura-evidence/meshy/pipsBrambleback.metadata.88da139d2fbd.json",
          "public/aura-assets/pipsBrambleback.meshy-candidate.3c4dff50.png"
        ],
        "checkedAt": "2026-10-17T09:36:30.616Z"
      },
      "sourcePath": "public/aura-assets/pipsBrambleback.6aaa3db3.glb",
      "outputPath": "public/aura-assets/pipsBrambleback.6aaa3db3.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.011,
          0,
          -0.006
        ],
        "max": [
          0.011,
          0.024,
          0.006
        ],
        "size": [
          0.022,
          0.024,
          0.011
        ],
        "center": [
          0,
          0.012,
          0
        ],
        "maxDimension": 0.024,
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
      "thumbnailUrl": "/aura-assets/pipsBrambleback.thumb.svg",
      "quality": "candidate",
      "role": "enemy",
      "renderedProbe": {
        "url": "/aura-assets/pipsBrambleback.meshy-candidate.3c4dff50.png",
        "kind": "manual-inspection",
        "sha256": "sha256-3c4dff501c0dfd8619b141ad3f1775abb32bc61ed79e4863b73197aac58660b7",
        "checkedAt": "2026-10-17T09:46:19.895Z"
      }
    },
  },
  "pipsCheckpointFlag": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsCheckpointFlag.9b30fdba.glb",
    hash: "sha256-9b30fdbaf5a20aa2b0f3694a913b6b24c177a9e901fbbfdc1b74c7c4ebcee60c",
    bounds: [
      0.527,
      1.899,
      0.362
    ],
    sizeBytes: 286560,
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
        "sourcePath": "public/aura-assets/pipsCheckpointFlag.9b30fdba.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:19:05.662Z",
        "evidence": [
          "aura-evidence/meshy/pipsCheckpointFlag.rights.968cd708eaf2.json",
          "aura-evidence/meshy/pipsCheckpointFlag.metadata.d0e37c495a77.json",
          "public/aura-assets/pipsCheckpointFlag.meshy-candidate.40c7021b.png"
        ],
        "checkedAt": "2026-10-17T09:19:05.662Z"
      },
      "sourcePath": "public/aura-assets/pipsCheckpointFlag.9b30fdba.glb",
      "outputPath": "public/aura-assets/pipsCheckpointFlag.9b30fdba.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.271,
          -0.951,
          -0.183
        ],
        "max": [
          0.256,
          0.948,
          0.179
        ],
        "size": [
          0.527,
          1.899,
          0.362
        ],
        "center": [
          -0.007,
          -0.002,
          -0.002
        ],
        "maxDimension": 1.899,
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
      "thumbnailUrl": "/aura-assets/pipsCheckpointFlag.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/pipsCheckpointFlag.meshy-candidate.40c7021b.png",
        "kind": "manual-inspection",
        "sha256": "sha256-40c7021b1ea747a157ebd2698b99924d2f5f54aa729516b24d899e9bf33e7203",
        "checkedAt": "2026-10-17T09:46:31.573Z"
      }
    },
  },
  "pipsGoldenAcorn": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsGoldenAcorn.a851976d.glb",
    hash: "sha256-a851976d617249f305b0fb0f03deb223b62494f4d6159e80d9970e4956454f6b",
    bounds: [
      1.001,
      1.895,
      1.002
    ],
    sizeBytes: 159468,
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
        "sourcePath": "public/aura-assets/pipsGoldenAcorn.a851976d.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:18:56.803Z",
        "evidence": [
          "aura-evidence/meshy/pipsGoldenAcorn.rights.968cd708eaf2.json",
          "aura-evidence/meshy/pipsGoldenAcorn.metadata.07e12feff11d.json",
          "public/aura-assets/pipsGoldenAcorn.meshy-candidate.27c4dd6c.png"
        ],
        "checkedAt": "2026-10-17T09:18:56.803Z"
      },
      "sourcePath": "public/aura-assets/pipsGoldenAcorn.a851976d.glb",
      "outputPath": "public/aura-assets/pipsGoldenAcorn.a851976d.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.504,
          -0.952,
          -0.504
        ],
        "max": [
          0.5,
          0.947,
          0.5
        ],
        "size": [
          1.005,
          1.899,
          1.005
        ],
        "center": [
          -0.002,
          -0.003,
          -0.002
        ],
        "maxDimension": 1.899,
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
      "thumbnailUrl": "/aura-assets/pipsGoldenAcorn.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/pipsGoldenAcorn.meshy-candidate.27c4dd6c.png",
        "kind": "manual-inspection",
        "sha256": "sha256-27c4dd6c7b4651bf50a7500d0811360190dead3a9628eac9a21fce47e71129cd",
        "checkedAt": "2026-10-17T09:46:31.369Z"
      }
    },
  },
  "pipsPip": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsPip.fcd4256f.glb",
    hash: "sha256-fcd4256f0224f438f30bc72957bedca97de7b4728535118bb3b8b344b8860bfd",
    bounds: [
      0.007,
      0.009,
      0.005
    ],
    sizeBytes: 2078616,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "RunFast",
        "Regular_Jump",
        "happy_jump_m",
        "Dead",
        "Victory_Cheer",
        "Quick_Walk"
      ],
      // NOTE(typegen skew): same as pipsBrambleback — objects → declared
      // `readonly string[]`; full clip records remain in `animationMetadata`.
      "animationClips": [
        "Idle",
        "RunFast",
        "Regular_Jump",
        "happy_jump_m",
        "Dead",
        "Victory_Cheer",
        "Quick_Walk"
      ],
      "animationMetadata": {
        "clipCount": 7,
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
            "name": "RunFast",
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
            "duration": 0.4666666666666667,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
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
          },
          {
            "index": 3,
            "name": "happy_jump_m",
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
            "duration": 9.833333333333334,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 4,
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
            "index": 5,
            "name": "Victory_Cheer",
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
            "duration": 9.333333333333334,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 6,
            "name": "Quick_Walk",
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
            "duration": 3,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 7 embedded animation clips."
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
        "animationClipCount": 7,
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
        "sourcePath": "public/aura-assets/pipsPip.fcd4256f.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:36:01.143Z",
        "evidence": [
          "aura-evidence/meshy/pipsPip.rights.968cd708eaf2.json",
          "aura-evidence/meshy/pipsPip.metadata.20932c2fe887.json",
          "public/aura-assets/pipsPip.meshy-candidate.b6be1123.png"
        ],
        "checkedAt": "2026-10-17T09:36:01.143Z"
      },
      "sourcePath": "public/aura-assets/pipsPip.fcd4256f.glb",
      "outputPath": "public/aura-assets/pipsPip.fcd4256f.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.003,
          0,
          -0.002
        ],
        "max": [
          0.003,
          0.009,
          0.002
        ],
        "size": [
          0.007,
          0.009,
          0.005
        ],
        "center": [
          0,
          0.004,
          0
        ],
        "maxDimension": 0.009,
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
      "thumbnailUrl": "/aura-assets/pipsPip.thumb.svg",
      "quality": "candidate",
      "role": "hero",
      "renderedProbe": {
        "url": "/aura-assets/pipsPip.meshy-candidate.b6be1123.png",
        "kind": "manual-inspection",
        "sha256": "sha256-b6be1123d3675eef2c3188ac411caca7e77e07bb4b78b642239f1a58456c0f41",
        "checkedAt": "2026-10-17T09:46:13.309Z"
      }
    },
  },
  "pipsSungate": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsSungate.2ec2202c.glb",
    hash: "sha256-2ec2202c361f5648851547f8c046531c6048424d00192416f791cb9a65fdf3d9",
    bounds: [
      1.267,
      1.898,
      0.409
    ],
    sizeBytes: 434388,
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
        "sourcePath": "public/aura-assets/pipsSungate.2ec2202c.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:20:21.088Z",
        "evidence": [
          "aura-evidence/meshy/pipsSungate.rights.968cd708eaf2.json",
          "aura-evidence/meshy/pipsSungate.metadata.6d4b9d2da9da.json",
          "public/aura-assets/pipsSungate.meshy-candidate.45e48287.png"
        ],
        "checkedAt": "2026-10-17T09:20:21.088Z"
      },
      "sourcePath": "public/aura-assets/pipsSungate.2ec2202c.glb",
      "outputPath": "public/aura-assets/pipsSungate.2ec2202c.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.636,
          -0.952,
          -0.207
        ],
        "max": [
          0.632,
          0.946,
          0.202
        ],
        "size": [
          1.268,
          1.897,
          0.409
        ],
        "center": [
          -0.002,
          -0.003,
          -0.003
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
      "thumbnailUrl": "/aura-assets/pipsSungate.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/pipsSungate.meshy-candidate.45e48287.png",
        "kind": "manual-inspection",
        "sha256": "sha256-45e48287513813a75447c230f10e4215fc4e4248d5c56b76d3a49a2c46216e55",
        "checkedAt": "2026-10-17T09:46:31.773Z"
      }
    },
  },
  "pipsSunseed": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsSunseed.b52c5a99.glb",
    hash: "sha256-b52c5a99b0c5596a0c35632a24274ca6f888b00d3269ed160b50824c42e8b20f",
    bounds: [
      1.898,
      0.904,
      0.837
    ],
    sizeBytes: 159684,
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
        "sourcePath": "public/aura-assets/pipsSunseed.b52c5a99.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:17:35.188Z",
        "evidence": [
          "aura-evidence/meshy/pipsSunseed.rights.968cd708eaf2.json",
          "aura-evidence/meshy/pipsSunseed.metadata.ae0fd21648ef.json",
          "public/aura-assets/pipsSunseed.meshy-candidate.938a7472.png"
        ],
        "checkedAt": "2026-10-17T09:17:35.188Z"
      },
      "sourcePath": "public/aura-assets/pipsSunseed.b52c5a99.glb",
      "outputPath": "public/aura-assets/pipsSunseed.b52c5a99.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.951,
          -0.452,
          -0.421
        ],
        "max": [
          0.947,
          0.454,
          0.418
        ],
        "size": [
          1.899,
          0.907,
          0.838
        ],
        "center": [
          -0.002,
          0.001,
          -0.001
        ],
        "maxDimension": 1.899,
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
      "thumbnailUrl": "/aura-assets/pipsSunseed.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/pipsSunseed.meshy-candidate.938a7472.png",
        "kind": "manual-inspection",
        "sha256": "sha256-938a74720d31b590bdec1fd2e2ea1f77b0334ce3841f9f0e99a5633e79734d71",
        "checkedAt": "2026-10-17T09:46:31.168Z"
      }
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
