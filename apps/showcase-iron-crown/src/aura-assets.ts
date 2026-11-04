import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "ironcrownBoulder": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownBrazierPylon": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownCrown": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownJinx": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownKenji": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownKoScorch": AuraAssetDefinition & { readonly type: "texture"; readonly format: "webp"; readonly url: string; readonly hash: string; };
  readonly "ironcrownLutAirbaseHaze": AuraAssetDefinition & { readonly type: "lut"; readonly format: "cube"; readonly url: string; readonly hash: string; };
  readonly "ironcrownLutColosseumOchre": AuraAssetDefinition & { readonly type: "lut"; readonly format: "cube"; readonly url: string; readonly hash: string; };
  readonly "ironcrownLutDockDusk": AuraAssetDefinition & { readonly type: "lut"; readonly format: "cube"; readonly url: string; readonly hash: string; };
  readonly "ironcrownLutMonasteryFrost": AuraAssetDefinition & { readonly type: "lut"; readonly format: "cube"; readonly url: string; readonly hash: string; };
  readonly "ironcrownSeraph": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownSovereign": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownVolt": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownAirbaseAmmoCrates": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownAirbaseDrum": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownAirbaseFuelTank": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownColosseumBust": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownDockBarrel": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownDockCrate": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownDockVendorCart": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownKingStatue": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownMonasteryLion": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownRooftopAircon": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownRooftopPowerBox": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownSearchlight": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownStreetLamp": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownThrone": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownHarbourCrane": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownFishingBoat": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownHangarPlane": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownTempleGate": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownShrine": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownTowerA": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownTowerB": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownBackdropRidge": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownSkylineBlockA": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ironcrownSkylineBlockB": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "ironcrownBoulder": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownBoulder.fd2890fc.glb",
    hash: "sha256-fd2890fcca732eba2ce1df6a624013f20112963ee0ab89ea9ce4ea9a44c34d0b",
    bounds: [
      0.015,
      0.02,
      0.007
    ],
    sizeBytes: 2413244,
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
        "Regular_Jump",
        "Combat_Stance",
        "CrouchLookAroundBow",
        "Over_Shoulder_Throw",
        "Victory_Fist_Pump"
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
      "Regular_Jump",
      "Combat_Stance",
      "CrouchLookAroundBow",
      "Over_Shoulder_Throw",
      "Victory_Fist_Pump"
    ],
      "animationMetadata": {
        "clipCount": 14,
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
          },
          {
            "index": 10,
            "name": "Combat_Stance",
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
            "duration": 1.6999999284744263,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 11,
            "name": "CrouchLookAroundBow",
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
            "duration": 5.866666793823242,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 12,
            "name": "Over_Shoulder_Throw",
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
            "duration": 2.5,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 13,
            "name": "Victory_Fist_Pump",
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
            "duration": 1.5333333015441895,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          }
        ],
        "messages": [
          "Detected 14 embedded animation clips."
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
        "sourcePath": "public/aura-assets/ironcrownBoulder.fd2890fc.glb",
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
          "public/aura-assets/ironcrownBoulder.meshy-candidate.d5eb65ae.png",
          "aura-evidence/meshy/ironcrownBoulder.ic12-clips.json"
        ],
        "checkedAt": "2026-10-17T09:34:55.132Z"
      },
      "sourcePath": "public/aura-assets/ironcrownBoulder.fd2890fc.glb",
      "outputPath": "public/aura-assets/ironcrownBoulder.fd2890fc.glb",
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
  "ironcrownBrazierPylon": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownBrazierPylon.9d1932bd.glb",
    hash: "sha256-9d1932bd5fea048f381eb7a9f242b7d9338587eca954d958a7afe16eaf654ebf",
    bounds: [
      0.826,
      1.904,
      0.832
    ],
    sizeBytes: 1601664,
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
        "textureCount": 3,
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
        "sourcePath": "public/aura-assets/ironcrownBrazierPylon.9d1932bd.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-30 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, iron-crown/crownBrazierPylon). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-30T08:57:28.080Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownBrazierPylon.rights.c83bd5271fff.json",
          "aura-evidence/meshy/ironcrownBrazierPylon.metadata.7e50315f7b89.json",
          "public/aura-assets/ironcrownBrazierPylon.meshy-candidate.ce9a16f1.png"
        ],
        "checkedAt": "2026-10-30T08:57:28.080Z"
      },
      "sourcePath": "public/aura-assets/ironcrownBrazierPylon.9d1932bd.glb",
      "outputPath": "public/aura-assets/ironcrownBrazierPylon.9d1932bd.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.414,
          -0.952,
          -0.417
        ],
        "max": [
          0.413,
          0.951,
          0.415
        ],
        "size": [
          0.826,
          1.904,
          0.832
        ],
        "center": [
          -0.001,
          -0.001,
          -0.001
        ],
        "maxDimension": 1.904,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "material-0",
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
        "node-0"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownBrazierPylon.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/ironcrownBrazierPylon.meshy-candidate.ce9a16f1.png",
        "kind": "manual-inspection",
        "sha256": "sha256-ce9a16f11fdff87f60efdce9cd803bf21df4ea5da8aad677f95d74820c8575e9",
        "checkedAt": "2026-10-31T21:49:51.490Z"
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
    url: "/aura-assets/ironcrownJinx.fdd67a19.glb",
    hash: "sha256-fdd67a19e35221c86f9bc3a36de496eb893d0dc1f6ac0c1d5f9f489cc7387926",
    bounds: [
      0.008,
      0.017,
      0.008
    ],
    sizeBytes: 2453944,
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
        "Regular_Jump",
        "Combat_Stance",
        "CrouchLookAroundBow",
        "Over_Shoulder_Throw",
        "Victory_Fist_Pump"
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
      "Regular_Jump",
      "Combat_Stance",
      "CrouchLookAroundBow",
      "Over_Shoulder_Throw",
      "Victory_Fist_Pump"
    ],
      "animationMetadata": {
        "clipCount": 14,
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
          },
          {
            "index": 10,
            "name": "Combat_Stance",
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
            "duration": 1.7000000476837158,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 11,
            "name": "CrouchLookAroundBow",
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
            "duration": 5.866666793823242,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 12,
            "name": "Over_Shoulder_Throw",
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
            "duration": 2.5,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 13,
            "name": "Victory_Fist_Pump",
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
            "duration": 1.5666667222976685,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          }
        ],
        "messages": [
          "Detected 14 embedded animation clips."
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
        "sourcePath": "public/aura-assets/ironcrownJinx.fdd67a19.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:36:34.890Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownJinx.rights.968cd708eaf2.json",
          "aura-evidence/meshy/ironcrownJinx.metadata.cc203f47c932.json",
          "public/aura-assets/ironcrownJinx.meshy-candidate.fdeff851.png",
          "aura-evidence/meshy/ironcrownJinx.ic12-clips.json"
        ],
        "checkedAt": "2026-10-17T09:36:34.890Z"
      },
      "sourcePath": "public/aura-assets/ironcrownJinx.fdd67a19.glb",
      "outputPath": "public/aura-assets/ironcrownJinx.fdd67a19.glb",
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
    url: "/aura-assets/ironcrownKenji.a4163647.glb",
    hash: "sha256-a4163647a1f7b92fd3a3241322a81e66264cd9a6a45cf63944f6b11e9495f72e",
    bounds: [
      0.012,
      0.018,
      0.008
    ],
    sizeBytes: 3975084,
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
        "Regular_Jump",
        "Combat_Stance",
        "CrouchLookAroundBow",
        "Over_Shoulder_Throw",
        "Victory_Fist_Pump"
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
      "Regular_Jump",
      "Combat_Stance",
      "CrouchLookAroundBow",
      "Over_Shoulder_Throw",
      "Victory_Fist_Pump"
    ],
      "animationMetadata": {
        "clipCount": 14,
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
          },
          {
            "index": 10,
            "name": "Combat_Stance",
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
            "duration": 1.6999999284744263,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 11,
            "name": "CrouchLookAroundBow",
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
            "duration": 5.866666793823242,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 12,
            "name": "Over_Shoulder_Throw",
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
            "duration": 2.5,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 13,
            "name": "Victory_Fist_Pump",
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
            "duration": 1.5333333015441895,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          }
        ],
        "messages": [
          "Detected 14 embedded animation clips."
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
        "sourcePath": "public/aura-assets/ironcrownKenji.a4163647.glb",
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
          "aura-evidence/restyle/ironcrownKenji.restyle.json",
          "aura-evidence/meshy/ironcrownKenji.ic12-clips.json"
        ],
        "checkedAt": "2026-10-17T09:34:31.036Z"
      },
      "sourcePath": "public/aura-assets/ironcrownKenji.a4163647.glb",
      "outputPath": "public/aura-assets/ironcrownKenji.a4163647.glb",
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
  "ironcrownKoScorch": {
    type: "texture",
    format: "webp",
    url: "/aura-assets/ironcrownKoScorch.57c0c330.webp",
    hash: "sha256-57c0c3300ffb16710673d7bdd8e8ce483c1f28c6c3ddf102ec431a484ad54692",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 38224,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownKoScorch.57c0c330.webp",
        "checkedAt": "2026-10-30T14:18:08.489Z"
      },
      "sourcePath": "public/aura-assets/ironcrownKoScorch.57c0c330.webp",
      "outputPath": "public/aura-assets/ironcrownKoScorch.57c0c330.webp",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownKoScorch.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "ironcrownLutAirbaseHaze": {
    type: "lut",
    format: "cube",
    url: "/aura-assets/ironcrownLutAirbaseHaze.80f071ef.cube",
    hash: "sha256-80f071efe5c5c6f75bea5d469bb6393f348c1fcad830de4e2a383fc0a05b3376",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 103312,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownLutAirbaseHaze.80f071ef.cube",
        "checkedAt": "2026-10-30T13:51:55.610Z"
      },
      "sourcePath": "public/aura-assets/ironcrownLutAirbaseHaze.80f071ef.cube",
      "outputPath": "public/aura-assets/ironcrownLutAirbaseHaze.80f071ef.cube",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownLutAirbaseHaze.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "ironcrownLutColosseumOchre": {
    type: "lut",
    format: "cube",
    url: "/aura-assets/ironcrownLutColosseumOchre.cf791107.cube",
    hash: "sha256-cf791107c06f2d743c8676ecfca1c73ab6643b9e61f9883f335abd11e602aa6e",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 103306,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownLutColosseumOchre.cf791107.cube",
        "checkedAt": "2026-10-30T13:51:56.596Z"
      },
      "sourcePath": "public/aura-assets/ironcrownLutColosseumOchre.cf791107.cube",
      "outputPath": "public/aura-assets/ironcrownLutColosseumOchre.cf791107.cube",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownLutColosseumOchre.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "ironcrownLutDockDusk": {
    type: "lut",
    format: "cube",
    url: "/aura-assets/ironcrownLutDockDusk.a114c6bb.cube",
    hash: "sha256-a114c6bbdd1c5302f3522ca533ef8f3d7ef58ce3cf182c906b9ec9b2ecade357",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 103315,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownLutDockDusk.a114c6bb.cube",
        "checkedAt": "2026-10-30T13:51:57.631Z"
      },
      "sourcePath": "public/aura-assets/ironcrownLutDockDusk.a114c6bb.cube",
      "outputPath": "public/aura-assets/ironcrownLutDockDusk.a114c6bb.cube",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownLutDockDusk.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "ironcrownLutMonasteryFrost": {
    type: "lut",
    format: "cube",
    url: "/aura-assets/ironcrownLutMonasteryFrost.7bff466c.cube",
    hash: "sha256-7bff466c37411782948152d5467f7f2c07bd590ff341fc47ddcde5b3cef4c11a",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 103315,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownLutMonasteryFrost.7bff466c.cube",
        "checkedAt": "2026-10-30T13:51:58.673Z"
      },
      "sourcePath": "public/aura-assets/ironcrownLutMonasteryFrost.7bff466c.cube",
      "outputPath": "public/aura-assets/ironcrownLutMonasteryFrost.7bff466c.cube",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownLutMonasteryFrost.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "ironcrownSeraph": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownSeraph.73a08da7.glb",
    hash: "sha256-73a08da7a3decda8b2f02663b58f20b8f74de9afe69c98bf335a06d01c59e587",
    bounds: [
      0.011,
      0.019,
      0.007
    ],
    sizeBytes: 2804164,
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
        "Regular_Jump",
        "Combat_Stance",
        "CrouchLookAroundBow",
        "Over_Shoulder_Throw",
        "Victory_Fist_Pump"
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
      "Regular_Jump",
      "Combat_Stance",
      "CrouchLookAroundBow",
      "Over_Shoulder_Throw",
      "Victory_Fist_Pump"
    ],
      "animationMetadata": {
        "clipCount": 14,
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
          },
          {
            "index": 10,
            "name": "Combat_Stance",
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
            "duration": 1.6999999284744263,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 11,
            "name": "CrouchLookAroundBow",
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
            "duration": 5.866666793823242,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 12,
            "name": "Over_Shoulder_Throw",
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
            "duration": 2.5,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 13,
            "name": "Victory_Fist_Pump",
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
            "duration": 1.5333333015441895,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          }
        ],
        "messages": [
          "Detected 14 embedded animation clips."
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
        "sourcePath": "public/aura-assets/ironcrownSeraph.73a08da7.glb",
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
          "public/aura-assets/ironcrownSeraph.meshy-candidate.51b3e26d.png",
          "aura-evidence/meshy/ironcrownSeraph.ic12-clips.json"
        ],
        "checkedAt": "2026-10-17T09:35:27.051Z"
      },
      "sourcePath": "public/aura-assets/ironcrownSeraph.73a08da7.glb",
      "outputPath": "public/aura-assets/ironcrownSeraph.73a08da7.glb",
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
    url: "/aura-assets/ironcrownSovereign.94776d6b.glb",
    hash: "sha256-94776d6b820a1f9332381776074edf327dad37ab9d48f95321fa4915aea938e4",
    bounds: [
      0.019,
      0.02,
      0.016
    ],
    sizeBytes: 3379388,
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
        "Regular_Jump",
        "Combat_Stance",
        "CrouchLookAroundBow",
        "Over_Shoulder_Throw",
        "Victory_Fist_Pump"
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
      "Regular_Jump",
      "Combat_Stance",
      "CrouchLookAroundBow",
      "Over_Shoulder_Throw",
      "Victory_Fist_Pump"
    ],
      "animationMetadata": {
        "clipCount": 14,
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
          },
          {
            "index": 10,
            "name": "Combat_Stance",
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
            "duration": 1.6999999284744263,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 11,
            "name": "CrouchLookAroundBow",
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
            "duration": 5.866666793823242,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 12,
            "name": "Over_Shoulder_Throw",
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
            "duration": 2.5,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 13,
            "name": "Victory_Fist_Pump",
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
            "duration": 1.5333333015441895,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          }
        ],
        "messages": [
          "Detected 14 embedded animation clips."
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
        "sourcePath": "public/aura-assets/ironcrownSovereign.94776d6b.glb",
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
          "public/aura-assets/ironcrownSovereign.meshy-candidate.3931a35c.png",
          "aura-evidence/meshy/ironcrownSovereign.ic12-clips.json"
        ],
        "checkedAt": "2026-10-17T09:35:44.853Z"
      },
      "sourcePath": "public/aura-assets/ironcrownSovereign.94776d6b.glb",
      "outputPath": "public/aura-assets/ironcrownSovereign.94776d6b.glb",
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
    url: "/aura-assets/ironcrownVolt.aef7dd38.glb",
    hash: "sha256-aef7dd38c8aad13eb962e2df860f29906ec4c06abad496c6c7ecf915cb340a40",
    bounds: [
      0.009,
      0.018,
      0.004
    ],
    sizeBytes: 3862816,
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
        "Regular_Jump",
        "Combat_Stance",
        "CrouchLookAroundBow",
        "Over_Shoulder_Throw",
        "Victory_Fist_Pump"
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
      "Regular_Jump",
      "Combat_Stance",
      "CrouchLookAroundBow",
      "Over_Shoulder_Throw",
      "Victory_Fist_Pump"
    ],
      "animationMetadata": {
        "clipCount": 14,
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
          },
          {
            "index": 10,
            "name": "Combat_Stance",
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
            "duration": 1.6999999284744263,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 11,
            "name": "CrouchLookAroundBow",
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
            "duration": 5.866666793823242,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 12,
            "name": "Over_Shoulder_Throw",
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
            "duration": 2.5,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 13,
            "name": "Victory_Fist_Pump",
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
            "duration": 1.5333333015441895,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          }
        ],
        "messages": [
          "Detected 14 embedded animation clips."
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
        "sourcePath": "public/aura-assets/ironcrownVolt.aef7dd38.glb",
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
          "aura-evidence/restyle/ironcrownVolt.restyle.json",
          "aura-evidence/meshy/ironcrownVolt.ic12-clips.json"
        ],
        "checkedAt": "2026-10-17T09:35:10.995Z"
      },
      "sourcePath": "public/aura-assets/ironcrownVolt.aef7dd38.glb",
      "outputPath": "public/aura-assets/ironcrownVolt.aef7dd38.glb",
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
  "ironcrownAirbaseAmmoCrates": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownAirbaseAmmoCrates.e53786b8.glb",
    hash: "sha256-e53786b8501529adb75e1071b8d3ccc2a90d0c16472f2e59c0fb9b5a718707e1",
    bounds: [
      1.815,
      0.301,
      0.979
    ],
    sizeBytes: 2490988,
    metadata: {
      "materials": [
        "military_crate_m_01"
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
        "nodeCount": 11,
        "meshCount": 5,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "root"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 11 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownAirbaseAmmoCrates.e53786b8.glb",
        "sourcePage": "https://polyhaven.com/a/old_military_crate",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/old_military_crate/old_military_crate_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Jack Mava",
        "sourceFamily": "poly-haven",
        "attribution": "Jack Mava / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T16:33:00Z",
        "evidence": [
          "source-id poly-haven:old_military_crate; Poly Haven 1k glTF packed to GLB with gltf-transform, scene root recentred and grounded (no vertex edits)"
        ],
        "checkedAt": "2026-11-01T16:33:00Z"
      },
      "sourcePath": "public/aura-assets/ironcrownAirbaseAmmoCrates.e53786b8.glb",
      "outputPath": "public/aura-assets/ironcrownAirbaseAmmoCrates.e53786b8.glb",
      "license": "CC0-1.0",
      "author": "Jack Mava",
      "boundsMetadata": {
        "min": [
          -0.908,
          0,
          -0.491
        ],
        "max": [
          0.908,
          0.301,
          0.488
        ],
        "size": [
          1.815,
          0.301,
          0.979
        ],
        "center": [
          0,
          0.15,
          -0.002
        ],
        "maxDimension": 1.815,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "military_crate_m_01",
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
        "old_military_crate_lid_a",
        "old_military_crate_loop_a",
        "old_military_crate_latch_a",
        "old_military_crate_cloth_a",
        "old_military_crate_a",
        "old_military_crate_lid_b",
        "old_military_crate_loop_b",
        "old_military_crate_latch_b",
        "old_military_crate_cloth_b",
        "old_military_crate_b",
        "root"
      ],
      "textures": [
        "old_military_crate_nor_gl",
        "old_military_crate_diff",
        "old_military_crate_metal-old_military_crate_rough"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownAirbaseAmmoCrates.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "Iron Crown stage dressing (GU47 phase 9 owned CC0 prop)"
    },
  },
  "ironcrownAirbaseDrum": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownAirbaseDrum.77c5ff71.glb",
    hash: "sha256-77c5ff71afb44947c16b6490497a76ae074be7f2d3b57636054f73fa9292e958",
    bounds: [
      0.563,
      0.88,
      0.563
    ],
    sizeBytes: 692116,
    metadata: {
      "materials": [
        "Barrel_01"
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
        "nodeCount": 2,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "root"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 2 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownAirbaseDrum.77c5ff71.glb",
        "sourcePage": "https://polyhaven.com/a/Barrel_01",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/Barrel_01/Barrel_01_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Jorge Camacho",
        "sourceFamily": "poly-haven",
        "attribution": "Jorge Camacho / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T16:33:00Z",
        "evidence": [
          "source-id poly-haven:Barrel_01; Poly Haven 1k glTF packed to GLB with gltf-transform, scene root recentred and grounded (no vertex edits)"
        ],
        "checkedAt": "2026-11-01T16:33:00Z"
      },
      "sourcePath": "public/aura-assets/ironcrownAirbaseDrum.77c5ff71.glb",
      "outputPath": "public/aura-assets/ironcrownAirbaseDrum.77c5ff71.glb",
      "license": "CC0-1.0",
      "author": "Jorge Camacho",
      "boundsMetadata": {
        "min": [
          -0.282,
          0,
          -0.282
        ],
        "max": [
          0.282,
          0.88,
          0.282
        ],
        "size": [
          0.563,
          0.88,
          0.563
        ],
        "center": [
          0,
          0.44,
          0
        ],
        "maxDimension": 0.88,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Barrel_01",
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
        "Barrel_01",
        "root"
      ],
      "textures": [
        "Barrel_01_explosive_nor_gl",
        "Barrel_01_explosive_diff",
        "Barrel_01_explosive_metallic-Barrel_01_explosive_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownAirbaseDrum.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "Iron Crown stage dressing (GU47 phase 9 owned CC0 prop)"
    },
  },
  "ironcrownAirbaseFuelTank": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownAirbaseFuelTank.0077f0d5.glb",
    hash: "sha256-0077f0d5b8739ce58dc72b1ca860e2411499b962ed07aeca4ad799d47be67e8d",
    bounds: [
      0.41,
      0.642,
      0.409
    ],
    sizeBytes: 2779540,
    metadata: {
      "materials": [
        "small_lpg_tank"
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
        "nodeCount": 2,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "root"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 2 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownAirbaseFuelTank.0077f0d5.glb",
        "sourcePage": "https://polyhaven.com/a/small_lpg_tank",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/small_lpg_tank/small_lpg_tank_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Ulan Cabanilla",
        "sourceFamily": "poly-haven",
        "attribution": "Ulan Cabanilla / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T16:33:00Z",
        "evidence": [
          "source-id poly-haven:small_lpg_tank; Poly Haven 1k glTF packed to GLB with gltf-transform, scene root recentred and grounded (no vertex edits)"
        ],
        "checkedAt": "2026-11-01T16:33:00Z"
      },
      "sourcePath": "public/aura-assets/ironcrownAirbaseFuelTank.0077f0d5.glb",
      "outputPath": "public/aura-assets/ironcrownAirbaseFuelTank.0077f0d5.glb",
      "license": "CC0-1.0",
      "author": "Ulan Cabanilla",
      "boundsMetadata": {
        "min": [
          -0.205,
          0,
          -0.205
        ],
        "max": [
          0.205,
          0.642,
          0.205
        ],
        "size": [
          0.41,
          0.642,
          0.409
        ],
        "center": [
          0,
          0.321,
          0
        ],
        "maxDimension": 0.642,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "small_lpg_tank",
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
        "small_lpg_tank",
        "root"
      ],
      "textures": [
        "small_lpg_tank_nor_gl",
        "small_lpg_tank_diff",
        "small_lpg_tank_metal-small_lpg_tank_rough"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownAirbaseFuelTank.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "Iron Crown stage dressing (GU47 phase 9 owned CC0 prop)"
    },
  },
  "ironcrownColosseumBust": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownColosseumBust.fdd51a04.glb",
    hash: "sha256-fdd51a04f89cbfe5ec49d80224802ae8f236dd061eeca689d866cdff84120a7a",
    bounds: [
      0.272,
      0.515,
      0.3
    ],
    sizeBytes: 897404,
    metadata: {
      "materials": [
        "marble_bust_01"
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
        "nodeCount": 2,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "root"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 2 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownColosseumBust.fdd51a04.glb",
        "sourcePage": "https://polyhaven.com/a/marble_bust_01",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/marble_bust_01/marble_bust_01_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Rico Cilliers",
        "sourceFamily": "poly-haven",
        "attribution": "Rico Cilliers / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T16:33:00Z",
        "evidence": [
          "source-id poly-haven:marble_bust_01; Poly Haven 1k glTF packed to GLB with gltf-transform, scene root recentred and grounded (no vertex edits)"
        ],
        "checkedAt": "2026-11-01T16:33:00Z"
      },
      "sourcePath": "public/aura-assets/ironcrownColosseumBust.fdd51a04.glb",
      "outputPath": "public/aura-assets/ironcrownColosseumBust.fdd51a04.glb",
      "license": "CC0-1.0",
      "author": "Rico Cilliers",
      "boundsMetadata": {
        "min": [
          -0.136,
          0,
          -0.15
        ],
        "max": [
          0.136,
          0.515,
          0.15
        ],
        "size": [
          0.272,
          0.515,
          0.3
        ],
        "center": [
          0,
          0.257,
          0
        ],
        "maxDimension": 0.515,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "marble_bust_01",
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
        "marble_bust_01",
        "root"
      ],
      "textures": [
        "marble_bust_01_nor_gl",
        "marble_bust_01_diff",
        "marble_bust_01_arm"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownColosseumBust.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "Iron Crown stage dressing (GU47 phase 9 owned CC0 prop)"
    },
  },
  "ironcrownDockBarrel": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownDockBarrel.207728bc.glb",
    hash: "sha256-207728bcc0202a0a5c6251b46e1dc56214ba05d08901be191675dd9a39866791",
    bounds: [
      0.742,
      0.871,
      0.756
    ],
    sizeBytes: 922036,
    metadata: {
      "materials": [
        "wine_barrel_01"
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
        "nodeCount": 5,
        "meshCount": 4,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "root"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 5 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownDockBarrel.207728bc.glb",
        "sourcePage": "https://polyhaven.com/a/wine_barrel_01",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/wine_barrel_01/wine_barrel_01_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "James Ray Cock",
        "sourceFamily": "poly-haven",
        "attribution": "James Ray Cock / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T16:33:00Z",
        "evidence": [
          "source-id poly-haven:wine_barrel_01; Poly Haven 1k glTF packed to GLB with gltf-transform, scene root recentred and grounded (no vertex edits)"
        ],
        "checkedAt": "2026-11-01T16:33:00Z"
      },
      "sourcePath": "public/aura-assets/ironcrownDockBarrel.207728bc.glb",
      "outputPath": "public/aura-assets/ironcrownDockBarrel.207728bc.glb",
      "license": "CC0-1.0",
      "author": "James Ray Cock",
      "boundsMetadata": {
        "min": [
          -0.371,
          0,
          -0.378
        ],
        "max": [
          0.371,
          0.871,
          0.378
        ],
        "size": [
          0.742,
          0.871,
          0.756
        ],
        "center": [
          0,
          0.436,
          0
        ],
        "maxDimension": 0.871,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "wine_barrel_01",
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
        "wine_barrel_01_Lid",
        "wine_barrel_01_bung",
        "wine_barrel_01",
        "wine_barrel_01_base",
        "root"
      ],
      "textures": [
        "wine_barrel_01_nor_gl",
        "wine_barrel_01_diff",
        "wine_barrel_01_metal-wine_barrel_01_rough"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownDockBarrel.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "Iron Crown stage dressing (GU47 phase 9 owned CC0 prop)"
    },
  },
  "ironcrownDockCrate": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownDockCrate.ff5a2622.glb",
    hash: "sha256-ff5a26225c7cf3360f8660b7fc64d50b990fea9a3b54614c648923a29b015bb7",
    bounds: [
      0.825,
      0.35,
      0.409
    ],
    sizeBytes: 2274752,
    metadata: {
      "materials": [
        "wooden_crate_01"
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
        "meshCount": 3,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "root"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 4 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownDockCrate.ff5a2622.glb",
        "sourcePage": "https://polyhaven.com/a/wooden_crate_01",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/wooden_crate_01/wooden_crate_01_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "James Ray Cock",
        "sourceFamily": "poly-haven",
        "attribution": "James Ray Cock / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T16:33:00Z",
        "evidence": [
          "source-id poly-haven:wooden_crate_01; Poly Haven 1k glTF packed to GLB with gltf-transform, scene root recentred and grounded (no vertex edits)"
        ],
        "checkedAt": "2026-11-01T16:33:00Z"
      },
      "sourcePath": "public/aura-assets/ironcrownDockCrate.ff5a2622.glb",
      "outputPath": "public/aura-assets/ironcrownDockCrate.ff5a2622.glb",
      "license": "CC0-1.0",
      "author": "James Ray Cock",
      "boundsMetadata": {
        "min": [
          -0.413,
          0,
          -0.204
        ],
        "max": [
          0.413,
          0.35,
          0.204
        ],
        "size": [
          0.825,
          0.35,
          0.409
        ],
        "center": [
          0,
          0.175,
          0
        ],
        "maxDimension": 0.825,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "wooden_crate_01",
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
        "wooden_crate_01_lid",
        "wooden_crate_01",
        "wooden_crate_01_latch",
        "root"
      ],
      "textures": [
        "wooden_crate_01_nor_gl",
        "wooden_crate_01_diff",
        "wooden_crate_01_metal-wooden_crate_01_rough"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownDockCrate.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "Iron Crown stage dressing (GU47 phase 9 owned CC0 prop)"
    },
  },
  "ironcrownDockVendorCart": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownDockVendorCart.5e1f2fc7.glb",
    hash: "sha256-5e1f2fc724aa3c9b3d5655c25fe6149cda696401b569feda25440e6af0647c79",
    bounds: [
      2.168,
      1.718,
      1.073
    ],
    sizeBytes: 1833088,
    metadata: {
      "materials": [
        "CoffeeCart_01_cart",
        "CoffeeCart_01_props",
        "CoffeeCart_01_mugs"
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
        "meshCount": 3,
        "materialCount": 3,
        "textureCount": 6,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "root"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 4 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownDockVendorCart.5e1f2fc7.glb",
        "sourcePage": "https://polyhaven.com/a/CoffeeCart_01",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/CoffeeCart_01/CoffeeCart_01_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Joe Seabuhr",
        "sourceFamily": "poly-haven",
        "attribution": "Joe Seabuhr / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T16:33:00Z",
        "evidence": [
          "source-id poly-haven:CoffeeCart_01; Poly Haven 1k glTF packed to GLB with gltf-transform, scene root recentred and grounded (no vertex edits)"
        ],
        "checkedAt": "2026-11-01T16:33:00Z"
      },
      "sourcePath": "public/aura-assets/ironcrownDockVendorCart.5e1f2fc7.glb",
      "outputPath": "public/aura-assets/ironcrownDockVendorCart.5e1f2fc7.glb",
      "license": "CC0-1.0",
      "author": "Joe Seabuhr",
      "boundsMetadata": {
        "min": [
          -1.084,
          0,
          -0.537
        ],
        "max": [
          1.084,
          1.718,
          0.537
        ],
        "size": [
          2.168,
          1.718,
          1.073
        ],
        "center": [
          0,
          0.859,
          0
        ],
        "maxDimension": 2.168,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "CoffeeCart_01_cart",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "CoffeeCart_01_props",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "CoffeeCart_01_mugs",
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
        "CoffeeCart_01_cart",
        "CoffeeCart_01_props",
        "CoffeeCart_01_mugs",
        "root"
      ],
      "textures": [
        "CoffeeCart_01_cart_nor_gl",
        "CoffeeCart_01_cart_diff",
        "CoffeeCart_01_cart_metallic-CoffeeCart_01_cart_roughness",
        "CoffeeCart_01_props_nor_gl",
        "CoffeeCart_01_props_diff",
        "CoffeeCart_01_props_metallic-CoffeeCart_01_props_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownDockVendorCart.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "Iron Crown stage dressing (GU47 phase 9 owned CC0 prop)"
    },
  },
  "ironcrownKingStatue": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownKingStatue.f4badc3d.glb",
    hash: "sha256-f4badc3de1e241740ee0a6c153d1f1e5229032c15b33618a850905e59e780193",
    bounds: [
      1.477,
      1.74,
      1.564
    ],
    sizeBytes: 3977668,
    metadata: {
      "materials": [
        "gothic_statue"
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
        "nodeCount": 2,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "root"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 2 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownKingStatue.f4badc3d.glb",
        "sourcePage": "https://polyhaven.com/a/gothic_statue",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/gothic_statue/gothic_statue_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Benny Weimer",
        "sourceFamily": "poly-haven",
        "attribution": "Benny Weimer / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T16:33:00Z",
        "evidence": [
          "source-id poly-haven:gothic_statue; Poly Haven 1k glTF packed to GLB with gltf-transform, scene root recentred and grounded (no vertex edits)"
        ],
        "checkedAt": "2026-11-01T16:33:00Z"
      },
      "sourcePath": "public/aura-assets/ironcrownKingStatue.f4badc3d.glb",
      "outputPath": "public/aura-assets/ironcrownKingStatue.f4badc3d.glb",
      "license": "CC0-1.0",
      "author": "Benny Weimer",
      "boundsMetadata": {
        "min": [
          -0.739,
          0,
          -0.782
        ],
        "max": [
          0.739,
          1.74,
          0.782
        ],
        "size": [
          1.477,
          1.74,
          1.564
        ],
        "center": [
          0,
          0.87,
          0
        ],
        "maxDimension": 1.74,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "gothic_statue",
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
        "gothic_statue",
        "root"
      ],
      "textures": [
        "gothic_statue_nor_gl",
        "gothic_statue_diff",
        "gothic_statue_rough"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownKingStatue.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "Iron Crown stage dressing (GU47 phase 9 owned CC0 prop)"
    },
  },
  "ironcrownMonasteryLion": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownMonasteryLion.6a805396.glb",
    hash: "sha256-6a8053968fc31193bac5d04a7ea2a46a613739f07507fa6c5ce40ae21c54fe29",
    bounds: [
      0.321,
      0.436,
      0.207
    ],
    sizeBytes: 3199528,
    metadata: {
      "materials": [
        "lion_head"
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
        "nodeCount": 2,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "root"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 2 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownMonasteryLion.6a805396.glb",
        "sourcePage": "https://polyhaven.com/a/lion_head",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/lion_head/lion_head_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Tina",
        "sourceFamily": "poly-haven",
        "attribution": "Tina / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T16:33:00Z",
        "evidence": [
          "source-id poly-haven:lion_head; Poly Haven 1k glTF packed to GLB with gltf-transform, scene root recentred and grounded (no vertex edits)"
        ],
        "checkedAt": "2026-11-01T16:33:00Z"
      },
      "sourcePath": "public/aura-assets/ironcrownMonasteryLion.6a805396.glb",
      "outputPath": "public/aura-assets/ironcrownMonasteryLion.6a805396.glb",
      "license": "CC0-1.0",
      "author": "Tina",
      "boundsMetadata": {
        "min": [
          -0.16,
          0,
          -0.103
        ],
        "max": [
          0.16,
          0.436,
          0.103
        ],
        "size": [
          0.321,
          0.436,
          0.207
        ],
        "center": [
          0,
          0.218,
          0
        ],
        "maxDimension": 0.436,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "lion_head",
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
        "lion_head",
        "root"
      ],
      "textures": [
        "lion_head_nor_gl",
        "lion_head_diff",
        "lion_head_metal-lion_head_rough"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownMonasteryLion.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "Iron Crown stage dressing (GU47 phase 9 owned CC0 prop)"
    },
  },
  "ironcrownRooftopAircon": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownRooftopAircon.298c7fe9.glb",
    hash: "sha256-298c7fe9c8182d46a7a1bea1b80611ad66885305e8401fc9adeee0a7bebf4be7",
    bounds: [
      0.8,
      0.928,
      0.374
    ],
    sizeBytes: 4052820,
    metadata: {
      "materials": [
        "exterior_aircon_unit_rusted_01",
        "exterior_aircon_unit_rusted_02"
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
        "nodeCount": 2,
        "meshCount": 1,
        "materialCount": 2,
        "textureCount": 6,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "root"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 2 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownRooftopAircon.298c7fe9.glb",
        "sourcePage": "https://polyhaven.com/a/exterior_aircon_unit",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/exterior_aircon_unit/exterior_aircon_unit_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Monsta3D",
        "sourceFamily": "poly-haven",
        "attribution": "Monsta3D / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T16:33:00Z",
        "evidence": [
          "source-id poly-haven:exterior_aircon_unit; Poly Haven 1k glTF packed to GLB with gltf-transform, scene root recentred and grounded (no vertex edits)"
        ],
        "checkedAt": "2026-11-01T16:33:00Z"
      },
      "sourcePath": "public/aura-assets/ironcrownRooftopAircon.298c7fe9.glb",
      "outputPath": "public/aura-assets/ironcrownRooftopAircon.298c7fe9.glb",
      "license": "CC0-1.0",
      "author": "Monsta3D",
      "boundsMetadata": {
        "min": [
          -0.4,
          0,
          -0.187
        ],
        "max": [
          0.4,
          0.928,
          0.187
        ],
        "size": [
          0.8,
          0.928,
          0.374
        ],
        "center": [
          0,
          0.464,
          0
        ],
        "maxDimension": 0.928,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "exterior_aircon_unit_rusted_01",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "exterior_aircon_unit_rusted_02",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "alphaMode": "BLEND",
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
        "exterior_aircon_unit_rusted",
        "root"
      ],
      "textures": [
        "exterior_aircon_unit_rusted_01_nor_gl",
        "exterior_aircon_unit_rusted_01_diff",
        "exterior_aircon_unit_rusted_01_metal-exterior_aircon_unit_rusted_01_rough",
        "exterior_aircon_unit_rusted_02_nor_gl",
        "exterior_aircon_unit_rusted_02_diff-exterior_aircon_unit_rusted_02_opacity",
        "exterior_aircon_unit_rusted_02_metal-exterior_aircon_unit_rusted_02_rough"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownRooftopAircon.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "Iron Crown stage dressing (GU47 phase 9 owned CC0 prop)"
    },
  },
  "ironcrownRooftopPowerBox": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownRooftopPowerBox.a8b0e922.glb",
    hash: "sha256-a8b0e922b1697eb956d8d272f119c639661b521c80a6f6755486f188882cc22d",
    bounds: [
      0.92,
      1.12,
      0.432
    ],
    sizeBytes: 2028304,
    metadata: {
      "materials": [
        "utility_box_02"
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
        "nodeCount": 2,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "root"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 2 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownRooftopPowerBox.a8b0e922.glb",
        "sourcePage": "https://polyhaven.com/a/utility_box_02",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/utility_box_02/utility_box_02_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "James Ray Cock",
        "sourceFamily": "poly-haven",
        "attribution": "James Ray Cock / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T16:33:00Z",
        "evidence": [
          "source-id poly-haven:utility_box_02; Poly Haven 1k glTF packed to GLB with gltf-transform, scene root recentred and grounded (no vertex edits)"
        ],
        "checkedAt": "2026-11-01T16:33:00Z"
      },
      "sourcePath": "public/aura-assets/ironcrownRooftopPowerBox.a8b0e922.glb",
      "outputPath": "public/aura-assets/ironcrownRooftopPowerBox.a8b0e922.glb",
      "license": "CC0-1.0",
      "author": "James Ray Cock",
      "boundsMetadata": {
        "min": [
          -0.46,
          0,
          -0.216
        ],
        "max": [
          0.46,
          1.12,
          0.216
        ],
        "size": [
          0.92,
          1.12,
          0.432
        ],
        "center": [
          0,
          0.56,
          0
        ],
        "maxDimension": 1.12,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "utility_box_02",
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
        "utility_box_02",
        "root"
      ],
      "textures": [
        "utility_box_02_nor_gl",
        "utility_box_02_diff",
        "utility_box_02_metal-utility_box_02_rough"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownRooftopPowerBox.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "Iron Crown stage dressing (GU47 phase 9 owned CC0 prop)"
    },
  },
  "ironcrownSearchlight": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownSearchlight.ea4b109a.glb",
    hash: "sha256-ea4b109ab2cd153335ec9d524b8ece35dc8c2c1bcaa25ac254b1080dc9473d67",
    bounds: [
      0.165,
      0.185,
      0.253
    ],
    sizeBytes: 2232432,
    metadata: {
      "materials": [
        "portable_searchlight",
        "portable_searchlight_glass"
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
        "nodeCount": 2,
        "meshCount": 1,
        "materialCount": 2,
        "textureCount": 4,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "root"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 2 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownSearchlight.ea4b109a.glb",
        "sourcePage": "https://polyhaven.com/a/portable_searchlight",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/portable_searchlight/portable_searchlight_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Elijah Cragg",
        "sourceFamily": "poly-haven",
        "attribution": "Elijah Cragg / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T16:33:00Z",
        "evidence": [
          "source-id poly-haven:portable_searchlight; Poly Haven 1k glTF packed to GLB with gltf-transform, scene root recentred and grounded (no vertex edits)"
        ],
        "checkedAt": "2026-11-01T16:33:00Z"
      },
      "sourcePath": "public/aura-assets/ironcrownSearchlight.ea4b109a.glb",
      "outputPath": "public/aura-assets/ironcrownSearchlight.ea4b109a.glb",
      "license": "CC0-1.0",
      "author": "Elijah Cragg",
      "boundsMetadata": {
        "min": [
          -0.083,
          0,
          -0.127
        ],
        "max": [
          0.083,
          0.185,
          0.127
        ],
        "size": [
          0.165,
          0.185,
          0.253
        ],
        "center": [
          0,
          0.093,
          0
        ],
        "maxDimension": 0.253,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "portable_searchlight",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "portable_searchlight_glass",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "alphaMode": "BLEND",
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
        "portable_searchlight",
        "root"
      ],
      "textures": [
        "portable_searchlight_nor_gl",
        "portable_searchlight_diff",
        "portable_searchlight_metal-portable_searchlight_rough",
        "portable_searchlight_diff-portable_searchlight_alpha"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownSearchlight.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "suitabilityReason": "Iron Crown stage dressing (GU47 phase 9 owned CC0 prop)"
    },
  },
  "ironcrownStreetLamp": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownStreetLamp.2a726309.glb",
    hash: "sha256-2a7263097ecc45c96db15972fe41b30645e343d110bbc6175476db8cae1c8ee7",
    bounds: [
      0.704,
      3.871,
      0.386
    ],
    sizeBytes: 2471248,
    metadata: {
      "materials": [
        "street_lamp_01",
        "street_lamp_01_glass",
        "street_lamp_01_bulb"
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
        "nodeCount": 2,
        "meshCount": 1,
        "materialCount": 3,
        "textureCount": 4,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "root"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 2 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownStreetLamp.2a726309.glb",
        "sourcePage": "https://polyhaven.com/a/street_lamp_01",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/street_lamp_01/street_lamp_01_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Josh Dean",
        "sourceFamily": "poly-haven",
        "attribution": "Josh Dean / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T16:33:00Z",
        "evidence": [
          "source-id poly-haven:street_lamp_01; Poly Haven 1k glTF packed to GLB with gltf-transform, scene root recentred and grounded (no vertex edits)"
        ],
        "checkedAt": "2026-11-01T16:33:00Z"
      },
      "sourcePath": "public/aura-assets/ironcrownStreetLamp.2a726309.glb",
      "outputPath": "public/aura-assets/ironcrownStreetLamp.2a726309.glb",
      "license": "CC0-1.0",
      "author": "Josh Dean",
      "boundsMetadata": {
        "min": [
          -0.352,
          0,
          -0.193
        ],
        "max": [
          0.352,
          3.871,
          0.193
        ],
        "size": [
          0.704,
          3.871,
          0.386
        ],
        "center": [
          0,
          1.935,
          0
        ],
        "maxDimension": 3.871,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "street_lamp_01",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "street_lamp_01_glass",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "street_lamp_01_bulb",
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
        "street_lamp_01",
        "root"
      ],
      "textures": [
        "street_lamp_01_nor_gl",
        "street_lamp_01_diff",
        "street_lamp_01_metal-street_lamp_01_rough",
        "street_lamp_01_diff-street_lamp_01_opacity"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownStreetLamp.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "suitabilityReason": "Iron Crown stage dressing (GU47 phase 9 owned CC0 prop)"
    },
  },
  "ironcrownThrone": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownThrone.6ad7cf26.glb",
    hash: "sha256-6ad7cf260cda8ea0719be417bf1ed94cfecec32497622a73f679d037ebab2387",
    bounds: [
      0.581,
      1.034,
      0.604
    ],
    sizeBytes: 2357820,
    metadata: {
      "materials": [
        "gallinera_chair"
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
        "nodeCount": 2,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "root"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 2 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ironcrownThrone.6ad7cf26.glb",
        "sourcePage": "https://polyhaven.com/a/gallinera_chair",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/gallinera_chair/gallinera_chair_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Ulan Cabanilla",
        "sourceFamily": "poly-haven",
        "attribution": "Ulan Cabanilla / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T16:33:00Z",
        "evidence": [
          "source-id poly-haven:gallinera_chair; Poly Haven 1k glTF packed to GLB with gltf-transform, scene root recentred and grounded (no vertex edits)",
          "source-id poly-haven:gallinera_chair; 1k glTF packed to GLB, root recentred and grounded (no geometry edit)"
        ],
        "checkedAt": "2026-11-01T16:33:00Z"
      },
      "sourcePath": "public/aura-assets/ironcrownThrone.6ad7cf26.glb",
      "outputPath": "public/aura-assets/ironcrownThrone.6ad7cf26.glb",
      "license": "CC0-1.0",
      "author": "Ulan Cabanilla",
      "boundsMetadata": {
        "min": [
          -0.29,
          0,
          -0.302
        ],
        "max": [
          0.29,
          1.034,
          0.302
        ],
        "size": [
          0.581,
          1.034,
          0.604
        ],
        "center": [
          0,
          0.517,
          0
        ],
        "maxDimension": 1.034,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "gallinera_chair",
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
        "gallinera_chair",
        "root"
      ],
      "textures": [
        "gallinera_chair_nor_gl",
        "gallinera_chair_diff",
        "gallinera_chair_rough"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ironcrownThrone.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "Iron Crown stage dressing (GU47 phase 9 owned CC0 prop)"
    },
  },
  "ironcrownHarbourCrane": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownHarbourCrane.a1df0ffb.glb",
    hash: "sha256-a1df0ffbf48343be5bc673c92d1ae45cd03dcdfd6acb040324223696e52d9904",
    bounds: [
      1.9,
      1.762,
      0.985
    ],
    sizeBytes: 1373316,
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
        "textureCount": 3,
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
        "sourcePath": "public/aura-assets/ironcrownHarbourCrane.a1df0ffb.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, iron-crown/crownHarbourCrane). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:36:59.329Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownHarbourCrane.rights.79dbc591c5f7.json",
          "aura-evidence/meshy/ironcrownHarbourCrane.metadata.f153c45a865b.json"
        ],
        "checkedAt": "2026-11-04T04:36:59.329Z"
      },
      "sourcePath": "public/aura-assets/ironcrownHarbourCrane.a1df0ffb.glb",
      "outputPath": "public/aura-assets/ironcrownHarbourCrane.a1df0ffb.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.95,
          -0.881,
          -0.493
        ],
        "max": [
          0.95,
          0.881,
          0.492
        ],
        "size": [
          1.9,
          1.762,
          0.985
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 1.9,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "material-0",
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
        "node-0"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "quality": "candidate",
      "role": "backdrop",
      "suitabilityReason": "Iron Crown venue dressing (GU47 wave 2, WP-36 crownHarbourCrane; Meshy, 19992 tris after decimation, single material)"
    }
  },
  "ironcrownFishingBoat": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownFishingBoat.a5de94eb.glb",
    hash: "sha256-a5de94ebbbce06b92ec9c1188025d431a1bc705513d6d14a47b6da6260bed494",
    bounds: [
      1.902,
      1.133,
      0.994
    ],
    sizeBytes: 1406588,
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
        "textureCount": 3,
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
        "sourcePath": "public/aura-assets/ironcrownFishingBoat.a5de94eb.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, iron-crown/crownFishingBoat). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:37:30.891Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownFishingBoat.rights.de2b4f9799ce.json",
          "aura-evidence/meshy/ironcrownFishingBoat.metadata.434dd81b8829.json"
        ],
        "checkedAt": "2026-11-04T04:37:30.891Z"
      },
      "sourcePath": "public/aura-assets/ironcrownFishingBoat.a5de94eb.glb",
      "outputPath": "public/aura-assets/ironcrownFishingBoat.a5de94eb.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.951,
          -0.567,
          -0.497
        ],
        "max": [
          0.951,
          0.566,
          0.497
        ],
        "size": [
          1.902,
          1.133,
          0.994
        ],
        "center": [
          0,
          -0.001,
          0
        ],
        "maxDimension": 1.902,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "material-0",
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
        "node-0"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "quality": "candidate",
      "role": "backdrop",
      "suitabilityReason": "Iron Crown venue dressing (GU47 wave 2, WP-36 crownFishingBoat; Meshy, 19990 tris after decimation, single material)"
    }
  },
  "ironcrownHangarPlane": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownHangarPlane.67b27a5b.glb",
    hash: "sha256-67b27a5b987964d7682b06632a0dba7ae97f21ec2e05c9648df32e6678af4782",
    bounds: [
      1.897,
      0.793,
      1.893
    ],
    sizeBytes: 1205508,
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
        "textureCount": 3,
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
        "sourcePath": "public/aura-assets/ironcrownHangarPlane.67b27a5b.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, iron-crown/crownHangarPlane). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:37:19.660Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownHangarPlane.rights.7072b693a23a.json",
          "aura-evidence/meshy/ironcrownHangarPlane.metadata.903db577b4e5.json"
        ],
        "checkedAt": "2026-11-04T04:37:19.660Z"
      },
      "sourcePath": "public/aura-assets/ironcrownHangarPlane.67b27a5b.glb",
      "outputPath": "public/aura-assets/ironcrownHangarPlane.67b27a5b.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.948,
          -0.397,
          -0.942
        ],
        "max": [
          0.949,
          0.396,
          0.951
        ],
        "size": [
          1.897,
          0.793,
          1.893
        ],
        "center": [
          0,
          -0.001,
          0.004
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
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "quality": "candidate",
      "role": "world",
      "suitabilityReason": "Iron Crown venue dressing (GU47 wave 2, WP-36 crownHangarPlane; Meshy, 20000 tris after decimation, single material)"
    }
  },
  "ironcrownTempleGate": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownTempleGate.cce415ee.glb",
    hash: "sha256-cce415ee8bb403e16bbf04c749aec5b8a1dc3392acaa167ae8f9ba11fea8d75b",
    bounds: [
      1.902,
      1.419,
      0.712
    ],
    sizeBytes: 1218164,
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
        "textureCount": 3,
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
        "sourcePath": "public/aura-assets/ironcrownTempleGate.cce415ee.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, iron-crown/crownTempleGate). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:38:14.603Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownTempleGate.rights.b271572aa785.json",
          "aura-evidence/meshy/ironcrownTempleGate.metadata.62408dd7a4e3.json"
        ],
        "checkedAt": "2026-11-04T04:38:14.603Z"
      },
      "sourcePath": "public/aura-assets/ironcrownTempleGate.cce415ee.glb",
      "outputPath": "public/aura-assets/ironcrownTempleGate.cce415ee.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.951,
          -0.71,
          -0.357
        ],
        "max": [
          0.951,
          0.708,
          0.356
        ],
        "size": [
          1.902,
          1.419,
          0.712
        ],
        "center": [
          0,
          -0.001,
          0
        ],
        "maxDimension": 1.902,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "material-0",
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
        "node-0"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "quality": "candidate",
      "role": "world",
      "suitabilityReason": "Iron Crown venue dressing (GU47 wave 2, WP-36 crownTempleGate; Meshy, 19998 tris after decimation, single material)"
    }
  },
  "ironcrownShrine": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownShrine.acf9a24b.glb",
    hash: "sha256-acf9a24bd335601cd50c2673c4ffd8784d50baffb98ac5492edbd0d25332d197",
    bounds: [
      1.803,
      1.437,
      1.895
    ],
    sizeBytes: 1668188,
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
        "textureCount": 3,
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
        "sourcePath": "public/aura-assets/ironcrownShrine.acf9a24b.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, iron-crown/crownShrine). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:39:09.769Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownShrine.rights.3bf260c2668d.json",
          "aura-evidence/meshy/ironcrownShrine.metadata.a3b18e59dc97.json"
        ],
        "checkedAt": "2026-11-04T04:39:09.769Z"
      },
      "sourcePath": "public/aura-assets/ironcrownShrine.acf9a24b.glb",
      "outputPath": "public/aura-assets/ironcrownShrine.acf9a24b.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.903,
          -0.718,
          -0.947
        ],
        "max": [
          0.9,
          0.719,
          0.948
        ],
        "size": [
          1.803,
          1.437,
          1.895
        ],
        "center": [
          -0.001,
          0.001,
          0.001
        ],
        "maxDimension": 1.895,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "material-0",
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
        "node-0"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "quality": "candidate",
      "role": "world",
      "suitabilityReason": "Iron Crown venue dressing (GU47 wave 2, WP-36 crownShrine; Meshy, 29998 tris after decimation, single material)"
    }
  },
  "ironcrownTowerA": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownTowerA.8ef07f30.glb",
    hash: "sha256-8ef07f30620a61a339b7559287b49f6cf4e8665d4d1aa4c7066c4d8c9470f6ce",
    bounds: [
      0.582,
      1.903,
      0.662
    ],
    sizeBytes: 1268620,
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
        "textureCount": 3,
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
        "sourcePath": "public/aura-assets/ironcrownTowerA.8ef07f30.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, iron-crown/crownTowerA). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:38:16.720Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownTowerA.rights.257fa97e4f0e.json",
          "aura-evidence/meshy/ironcrownTowerA.metadata.a07dcfab03d1.json"
        ],
        "checkedAt": "2026-11-04T04:38:16.720Z"
      },
      "sourcePath": "public/aura-assets/ironcrownTowerA.8ef07f30.glb",
      "outputPath": "public/aura-assets/ironcrownTowerA.8ef07f30.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.291,
          -0.952,
          -0.32
        ],
        "max": [
          0.29,
          0.951,
          0.341
        ],
        "size": [
          0.582,
          1.903,
          0.662
        ],
        "center": [
          0,
          -0.001,
          0.011
        ],
        "maxDimension": 1.903,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "material-0",
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
        "node-0"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "quality": "candidate",
      "role": "world",
      "suitabilityReason": "Iron Crown venue dressing (GU47 wave 2, WP-36 crownTowerA; Meshy, 11538 tris after decimation, single material)"
    }
  },
  "ironcrownTowerB": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownTowerB.28e407db.glb",
    hash: "sha256-28e407db7b1e2a5011f1771bc572dc1504bbfeaad1b1e889d6538ca49c33a57f",
    bounds: [
      0.595,
      1.877,
      0.642
    ],
    sizeBytes: 1215644,
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
        "textureCount": 3,
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
        "sourcePath": "public/aura-assets/ironcrownTowerB.28e407db.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, iron-crown/crownTowerB). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:38:53.733Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownTowerB.rights.3c5c44ef2daa.json",
          "aura-evidence/meshy/ironcrownTowerB.metadata.d53bb0363a2b.json"
        ],
        "checkedAt": "2026-11-04T04:38:53.733Z"
      },
      "sourcePath": "public/aura-assets/ironcrownTowerB.28e407db.glb",
      "outputPath": "public/aura-assets/ironcrownTowerB.28e407db.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.29,
          -0.951,
          -0.318
        ],
        "max": [
          0.305,
          0.926,
          0.324
        ],
        "size": [
          0.595,
          1.877,
          0.642
        ],
        "center": [
          0.007,
          -0.013,
          0.003
        ],
        "maxDimension": 1.877,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "material-0",
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
        "node-0"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "quality": "candidate",
      "role": "world",
      "suitabilityReason": "Iron Crown venue dressing (GU47 wave 2, WP-36 crownTowerB; Meshy, 13380 tris after decimation, single material)"
    }
  },
  "ironcrownBackdropRidge": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownBackdropRidge.309261ea.glb",
    hash: "sha256-309261ea874cb8167f562507dcf61eb6011a5ddcb5bbd35c72092c275623ba61",
    bounds: [
      1.9,
      1.144,
      1.839
    ],
    sizeBytes: 569484,
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
        "textureCount": 3,
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
        "sourcePath": "public/aura-assets/ironcrownBackdropRidge.309261ea.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, iron-crown/crownBackdropRidge). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:38:35.299Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownBackdropRidge.rights.c0e204a2ba52.json",
          "aura-evidence/meshy/ironcrownBackdropRidge.metadata.1527924cf73a.json"
        ],
        "checkedAt": "2026-11-04T04:38:35.299Z"
      },
      "sourcePath": "public/aura-assets/ironcrownBackdropRidge.309261ea.glb",
      "outputPath": "public/aura-assets/ironcrownBackdropRidge.309261ea.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.951,
          -0.573,
          -0.919
        ],
        "max": [
          0.949,
          0.571,
          0.92
        ],
        "size": [
          1.9,
          1.144,
          1.839
        ],
        "center": [
          -0.001,
          -0.001,
          0.001
        ],
        "maxDimension": 1.9,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "material-0",
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
        "node-0"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "quality": "candidate",
      "role": "backdrop",
      "suitabilityReason": "Iron Crown venue dressing (GU47 wave 2, WP-36 crownBackdropRidge; Meshy, 8000 tris after decimation, single material)"
    }
  },
  "ironcrownSkylineBlockA": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownSkylineBlockA.a6caaae7.glb",
    hash: "sha256-a6caaae771bea0f008f4ddaf00bc8fe8102a4c391260481ded5ce1dbba6a770e",
    bounds: [
      1.407,
      1.872,
      1.073
    ],
    sizeBytes: 671620,
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
        "textureCount": 3,
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
        "sourcePath": "public/aura-assets/ironcrownSkylineBlockA.a6caaae7.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, iron-crown/crownSkylineBlockA). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:40:42.672Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownSkylineBlockA.rights.ba7f78d3d7f2.json",
          "aura-evidence/meshy/ironcrownSkylineBlockA.metadata.26ed49427b96.json"
        ],
        "checkedAt": "2026-11-04T04:40:42.672Z"
      },
      "sourcePath": "public/aura-assets/ironcrownSkylineBlockA.a6caaae7.glb",
      "outputPath": "public/aura-assets/ironcrownSkylineBlockA.a6caaae7.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.686,
          -0.952,
          -0.535
        ],
        "max": [
          0.721,
          0.92,
          0.538
        ],
        "size": [
          1.407,
          1.872,
          1.073
        ],
        "center": [
          0.018,
          -0.016,
          0.001
        ],
        "maxDimension": 1.872,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "material-0",
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
        "node-0"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "quality": "candidate",
      "role": "backdrop",
      "suitabilityReason": "Iron Crown venue dressing (GU47 wave 2, WP-36 crownSkylineBlockA; Meshy, 7261 tris after decimation, single material)"
    }
  },
  "ironcrownSkylineBlockB": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ironcrownSkylineBlockB.6be577e0.glb",
    hash: "sha256-6be577e07983f8e03735bd369543840d7c3e1947c29477115aa5c86347ba1cee",
    bounds: [
      1.801,
      1.106,
      1.897
    ],
    sizeBytes: 1534148,
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
        "textureCount": 3,
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
        "sourcePath": "public/aura-assets/ironcrownSkylineBlockB.6be577e0.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, iron-crown/crownSkylineBlockB). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:40:34.801Z",
        "evidence": [
          "aura-evidence/meshy/ironcrownSkylineBlockB.rights.62187ac43be8.json",
          "aura-evidence/meshy/ironcrownSkylineBlockB.metadata.0759c0489118.json"
        ],
        "checkedAt": "2026-11-04T04:40:34.801Z"
      },
      "sourcePath": "public/aura-assets/ironcrownSkylineBlockB.6be577e0.glb",
      "outputPath": "public/aura-assets/ironcrownSkylineBlockB.6be577e0.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.904,
          -0.554,
          -0.95
        ],
        "max": [
          0.897,
          0.552,
          0.947
        ],
        "size": [
          1.801,
          1.106,
          1.897
        ],
        "center": [
          -0.003,
          -0.001,
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
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "quality": "candidate",
      "role": "backdrop",
      "suitabilityReason": "Iron Crown venue dressing (GU47 wave 2, WP-36 crownSkylineBlockB; Meshy, 21242 tris after decimation, single material)"
    }
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
