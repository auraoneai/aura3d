import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "astroFrog": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "axolotl": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bun": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "chick": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "coin": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "ducky": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "goldenHop": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "hawk": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "hop": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "knightToad": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "mushroomKid": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "rescuePod": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "roboFrog": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "toastCat": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "trafficBoxtruck": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "trafficHatch": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "trafficPickup": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "trafficSedan": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "trafficSkyCar": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "trafficSuv": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "trafficTaxi": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "trafficVan": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "trainCar": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "tramCar": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "turtle": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "astroFrog": {
    type: "model",
    format: "glb",
    url: "/aura-assets/astroFrog.ec48bf42.glb",
    hash: "sha256-ec48bf42b29214a1c91b219c1d751f1bfc8127f91d44b3953c0594ade9edab79",
    bounds: [
      0.003,
      0.004,
      0.002
    ],
    sizeBytes: 3835804,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Regular_Jump",
        "Walking_Woman",
        "Counterstrike"
      ],
      "animationClips": [
        {
          "name": "Idle",
          "duration": 4,
          "channelCount": 72
        },
        {
          "name": "Regular_Jump",
          "duration": 1.8333333730697632,
          "channelCount": 72
        },
        {
          "name": "Walking_Woman",
          "duration": 0.9666666388511658,
          "channelCount": 72
        },
        {
          "name": "Counterstrike",
          "duration": 6.5,
          "channelCount": 72
        }
      ],
      "animationMetadata": {
        "clipCount": 4,
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
            "duration": 1.8333333730697632,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walking_Woman",
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
            "duration": 0.9666666388511658,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Counterstrike",
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
            "duration": 6.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 4 embedded animation clips."
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
        "animationClipCount": 4,
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
        "sourcePath": "public/aura-assets/astroFrog.ec48bf42.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API (text-to-3d preview/refine/remesh/rigging/animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "evidence": [
          "aura-evidence/meshy/astroFrog.rights.4faa6aacf17a.json",
          "aura-evidence/meshy/astroFrog.metadata.c501d5342d18.json",
          "public/aura-assets/astroFrog.meshy-candidate.0d318b38.png"
        ],
        "checkedAt": "2026-10-17T06:36:29.083Z"
      },
      "sourcePath": "public/aura-assets/astroFrog.ec48bf42.glb",
      "outputPath": "public/aura-assets/astroFrog.ec48bf42.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.001,
          0,
          -0.001
        ],
        "max": [
          0.001,
          0.004,
          0.001
        ],
        "size": [
          0.003,
          0.004,
          0.002
        ],
        "center": [
          0,
          0.002,
          0
        ],
        "maxDimension": 0.004,
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
      "thumbnailUrl": "/aura-assets/astroFrog.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/astroFrog.meshy-candidate.0d318b38.png",
        "kind": "manual-inspection",
        "sha256": "sha256-0d318b3832b091922368a2faada21744d254a2a722488f67e98cedfce546f096",
        "checkedAt": "2026-10-17T06:36:29.076Z"
      }
    },
  },
  "axolotl": {
    type: "model",
    format: "glb",
    url: "/aura-assets/axolotl.fd2c4e4d.glb",
    hash: "sha256-fd2c4e4d026fe82f96705ba15c68f455ffdb04eb6d68bc3a23044e6e7ab0c9ab",
    bounds: [
      0.004,
      0.004,
      0.005
    ],
    sizeBytes: 3437072,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Regular_Jump",
        "Walking_Woman",
        "Counterstrike"
      ],
      "animationClips": [
        {
          "name": "Idle",
          "duration": 4,
          "channelCount": 72
        },
        {
          "name": "Regular_Jump",
          "duration": 1.8333333730697632,
          "channelCount": 72
        },
        {
          "name": "Walking_Woman",
          "duration": 0.9666666388511658,
          "channelCount": 72
        },
        {
          "name": "Counterstrike",
          "duration": 6.5,
          "channelCount": 72
        }
      ],
      "animationMetadata": {
        "clipCount": 4,
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
            "duration": 1.8333333730697632,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walking_Woman",
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
            "duration": 0.9666666388511658,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Counterstrike",
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
            "duration": 6.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 4 embedded animation clips."
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
        "animationClipCount": 4,
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
        "sourcePath": "public/aura-assets/axolotl.fd2c4e4d.glb",
        "sourceFamily": "meshy",
        "evidence": [
          "aura-evidence/meshy/axolotl.rights.7fcc7bfad170.json",
          "aura-evidence/meshy/axolotl.metadata.7a4407068c2b.json",
          "public/aura-assets/axolotl.meshy-candidate.2c6eff4e.png"
        ],
        "checkedAt": "2026-10-17T06:36:28.636Z"
      },
      "sourcePath": "public/aura-assets/axolotl.fd2c4e4d.glb",
      "outputPath": "public/aura-assets/axolotl.fd2c4e4d.glb",
      "boundsMetadata": {
        "min": [
          -0.002,
          0,
          -0.003
        ],
        "max": [
          0.002,
          0.004,
          0.003
        ],
        "size": [
          0.004,
          0.004,
          0.005
        ],
        "center": [
          0,
          0.002,
          0
        ],
        "maxDimension": 0.005,
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
      "thumbnailUrl": "/aura-assets/axolotl.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/axolotl.meshy-candidate.2c6eff4e.png",
        "kind": "manual-inspection",
        "sha256": "sha256-2c6eff4e396d5d3004bc7949bbe3d2e967d8f588ae378910af7de70d3ee18f83",
        "checkedAt": "2026-10-17T06:36:28.629Z"
      }
    },
  },
  "bun": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bun.5c4a9b98.glb",
    hash: "sha256-5c4a9b9876672f84aaa3cda2e01bd543cdca2f0cb241b525d09682fcd2453b51",
    bounds: [
      0.002,
      0.004,
      0.002
    ],
    sizeBytes: 2592484,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Regular_Jump",
        "Walking_Woman",
        "Counterstrike"
      ],
      "animationClips": [
        {
          "name": "Idle",
          "duration": 4,
          "channelCount": 72
        },
        {
          "name": "Regular_Jump",
          "duration": 1.8333333730697632,
          "channelCount": 72
        },
        {
          "name": "Walking_Woman",
          "duration": 0.9666666388511658,
          "channelCount": 72
        },
        {
          "name": "Counterstrike",
          "duration": 6.5,
          "channelCount": 72
        }
      ],
      "animationMetadata": {
        "clipCount": 4,
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
            "duration": 1.8333333730697632,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walking_Woman",
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
            "duration": 0.9666666388511658,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Counterstrike",
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
            "duration": 6.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 4 embedded animation clips."
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
        "animationClipCount": 4,
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
        "sourcePath": "public/aura-assets/bun.5c4a9b98.glb",
        "sourceFamily": "meshy",
        "evidence": [
          "aura-evidence/meshy/bun.rights.7fcc7bfad170.json",
          "aura-evidence/meshy/bun.metadata.902a6a05938c.json",
          "public/aura-assets/bun.meshy-candidate.d93dfedd.png"
        ],
        "checkedAt": "2026-10-17T06:36:28.859Z"
      },
      "sourcePath": "public/aura-assets/bun.5c4a9b98.glb",
      "outputPath": "public/aura-assets/bun.5c4a9b98.glb",
      "boundsMetadata": {
        "min": [
          -0.001,
          0,
          -0.001
        ],
        "max": [
          0.001,
          0.004,
          0.001
        ],
        "size": [
          0.002,
          0.004,
          0.002
        ],
        "center": [
          0,
          0.002,
          0
        ],
        "maxDimension": 0.004,
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
      "thumbnailUrl": "/aura-assets/bun.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/bun.meshy-candidate.d93dfedd.png",
        "kind": "manual-inspection",
        "sha256": "sha256-d93dfedd64564ada8a931443c70fbfc4e5315fe08468b63236a3e1f0407e1f48",
        "checkedAt": "2026-10-17T06:36:28.853Z"
      }
    },
  },
  "chick": {
    type: "model",
    format: "glb",
    url: "/aura-assets/chick.84e1009f.glb",
    hash: "sha256-84e1009f14007a2f063bfd8b5810ce076cf5db5284be7aaeda55968c51426aa6",
    bounds: [
      0.003,
      0.004,
      0.003
    ],
    sizeBytes: 3058444,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Regular_Jump",
        "Walking_Woman",
        "Counterstrike"
      ],
      "animationClips": [
        {
          "name": "Idle",
          "duration": 4,
          "channelCount": 72
        },
        {
          "name": "Regular_Jump",
          "duration": 1.8333333730697632,
          "channelCount": 72
        },
        {
          "name": "Walking_Woman",
          "duration": 0.9666666388511658,
          "channelCount": 72
        },
        {
          "name": "Counterstrike",
          "duration": 6.5,
          "channelCount": 72
        }
      ],
      "animationMetadata": {
        "clipCount": 4,
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
            "duration": 1.8333333730697632,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walking_Woman",
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
            "duration": 0.9666666388511658,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Counterstrike",
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
            "duration": 6.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 4 embedded animation clips."
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
        "animationClipCount": 4,
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
        "sourcePath": "public/aura-assets/chick.84e1009f.glb",
        "sourceFamily": "meshy",
        "evidence": [
          "aura-evidence/meshy/chick.rights.7fcc7bfad170.json",
          "aura-evidence/meshy/chick.metadata.cf80c6028036.json",
          "public/aura-assets/chick.meshy-candidate.fb459e19.png"
        ],
        "checkedAt": "2026-10-17T06:36:28.409Z"
      },
      "sourcePath": "public/aura-assets/chick.84e1009f.glb",
      "outputPath": "public/aura-assets/chick.84e1009f.glb",
      "boundsMetadata": {
        "min": [
          -0.001,
          0,
          -0.001
        ],
        "max": [
          0.001,
          0.004,
          0.001
        ],
        "size": [
          0.003,
          0.004,
          0.003
        ],
        "center": [
          0,
          0.002,
          0
        ],
        "maxDimension": 0.004,
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
      "thumbnailUrl": "/aura-assets/chick.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/chick.meshy-candidate.fb459e19.png",
        "kind": "manual-inspection",
        "sha256": "sha256-fb459e19776e5d9c75ee82699595754dc96b5e4b67e8629aa251fef0064bfeb0",
        "checkedAt": "2026-10-17T06:36:28.403Z"
      }
    },
  },
  "coin": {
    type: "model",
    format: "glb",
    url: "/aura-assets/coin.3b34ed99.glb",
    hash: "sha256-3b34ed998c88400b1ee7513c34a905a0754b67e6f39d3c02eaa59d834062cbe4",
    bounds: [
      1.903,
      0.705,
      0.081
    ],
    sizeBytes: 5870180,
    metadata: {
      "materials": [
        "BakedMaterial"
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
          "output_unwrapped"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/coin.3b34ed99.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API (text-to-3d preview/refine/remesh) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "evidence": [
          "aura-evidence/meshy/coin.rights.71f43c13a3b1.json",
          "aura-evidence/meshy/coin.metadata.0156ebbaa34b.json",
          "public/aura-assets/coin.meshy-candidate.3e6ef7a0.png"
        ],
        "checkedAt": "2026-10-17T06:36:31.257Z"
      },
      "sourcePath": "public/aura-assets/coin.3b34ed99.glb",
      "outputPath": "public/aura-assets/coin.3b34ed99.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.353,
          -0.044
        ],
        "max": [
          0.951,
          0.352,
          0.037
        ],
        "size": [
          1.903,
          0.705,
          0.081
        ],
        "center": [
          -0.001,
          0,
          -0.004
        ],
        "maxDimension": 1.903,
        "grounded": false
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
        "output_unwrapped"
      ],
      "textures": [
        "normal",
        "texture_0",
        "texture_0_metallic_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/coin.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/coin.meshy-candidate.3e6ef7a0.png",
        "kind": "manual-inspection",
        "sha256": "sha256-3e6ef7a0b479cfd9aff2d8cd99a4423ffb76e2eeba8dac11845c0b23f73c85a2",
        "checkedAt": "2026-10-17T06:36:31.250Z"
      }
    },
  },
  "ducky": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ducky.0074c679.glb",
    hash: "sha256-0074c6794f5ab9f1a9b01d362444c7b012acddf1522b2776b6c02515a729be60",
    bounds: [
      0.003,
      0.004,
      0.004
    ],
    sizeBytes: 4683388,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Regular_Jump",
        "Walking_Woman",
        "Counterstrike"
      ],
      "animationClips": [
        {
          "name": "Idle",
          "duration": 4,
          "channelCount": 72
        },
        {
          "name": "Regular_Jump",
          "duration": 1.8333333730697632,
          "channelCount": 72
        },
        {
          "name": "Walking_Woman",
          "duration": 0.9666666388511658,
          "channelCount": 72
        },
        {
          "name": "Counterstrike",
          "duration": 6.5,
          "channelCount": 72
        }
      ],
      "animationMetadata": {
        "clipCount": 4,
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
            "duration": 1.8333333730697632,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walking_Woman",
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
            "duration": 0.9666666388511658,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Counterstrike",
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
            "duration": 6.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 4 embedded animation clips."
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
        "animationClipCount": 4,
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
        "sourcePath": "public/aura-assets/ducky.0074c679.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API (text-to-3d preview/refine/remesh/rigging/animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project.",
        "sourceFamily": "meshy",
        "evidence": [
          "aura-evidence/meshy/ducky.rights.86dbb414904a.json",
          "aura-evidence/meshy/ducky.metadata.562b6b97e6aa.json",
          "public/aura-assets/ducky.meshy-candidate.af47ca7c.png"
        ],
        "checkedAt": "2026-10-17T06:36:29.307Z"
      },
      "sourcePath": "public/aura-assets/ducky.0074c679.glb",
      "outputPath": "public/aura-assets/ducky.0074c679.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.001,
          0,
          -0.002
        ],
        "max": [
          0.001,
          0.004,
          0.002
        ],
        "size": [
          0.003,
          0.004,
          0.004
        ],
        "center": [
          0,
          0.002,
          0
        ],
        "maxDimension": 0.004,
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
      "thumbnailUrl": "/aura-assets/ducky.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/ducky.meshy-candidate.af47ca7c.png",
        "kind": "manual-inspection",
        "sha256": "sha256-af47ca7cfcba55aa3fdd12dd75a877e6ede429c5e7100cbec230bdff80cc4d53",
        "checkedAt": "2026-10-17T06:36:29.299Z"
      }
    },
  },
  "goldenHop": {
    type: "model",
    format: "glb",
    url: "/aura-assets/goldenHop.40b72888.glb",
    hash: "sha256-40b7288848ff0dc9ac5103c562cc7585da6a93735656280a0279f2fdcd49409f",
    bounds: [
      0.004,
      0.004,
      0.002
    ],
    sizeBytes: 3242748,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Regular_Jump",
        "Walking_Woman",
        "Counterstrike"
      ],
      "animationClips": [
        {
          "name": "Idle",
          "duration": 4,
          "channelCount": 72
        },
        {
          "name": "Regular_Jump",
          "duration": 1.8333333730697632,
          "channelCount": 72
        },
        {
          "name": "Walking_Woman",
          "duration": 0.9666666388511658,
          "channelCount": 72
        },
        {
          "name": "Counterstrike",
          "duration": 6.5,
          "channelCount": 72
        }
      ],
      "animationMetadata": {
        "clipCount": 4,
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
            "duration": 1.8333333730697632,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walking_Woman",
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
            "duration": 0.9666666388511658,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Counterstrike",
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
            "duration": 6.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 4 embedded animation clips."
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
        "animationClipCount": 4,
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
        "sourcePath": "public/aura-assets/goldenHop.40b72888.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API (text-to-3d preview/refine/remesh/rigging/animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project.",
        "sourceFamily": "meshy",
        "evidence": [
          "aura-evidence/meshy/goldenHop.rights.86dbb414904a.json",
          "aura-evidence/meshy/goldenHop.metadata.2cc32e5f19ff.json",
          "public/aura-assets/goldenHop.meshy-candidate.a69d5eaf.png"
        ],
        "checkedAt": "2026-10-17T06:36:29.529Z"
      },
      "sourcePath": "public/aura-assets/goldenHop.40b72888.glb",
      "outputPath": "public/aura-assets/goldenHop.40b72888.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.002,
          0,
          -0.001
        ],
        "max": [
          0.002,
          0.004,
          0.001
        ],
        "size": [
          0.004,
          0.004,
          0.002
        ],
        "center": [
          0,
          0.002,
          0
        ],
        "maxDimension": 0.004,
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
      "thumbnailUrl": "/aura-assets/goldenHop.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/goldenHop.meshy-candidate.a69d5eaf.png",
        "kind": "manual-inspection",
        "sha256": "sha256-a69d5eaf5156395c7dcb4604b37204f1783f63f42df15c06f3925873fa4e4626",
        "checkedAt": "2026-10-17T06:36:29.523Z"
      }
    },
  },
  "hawk": {
    type: "model",
    format: "glb",
    url: "/aura-assets/hawk.a7627a48.glb",
    hash: "sha256-a7627a48b377f979688fe5ea3ad648f427924c3ccec5aee19f65fbd974ef0ec9",
    bounds: [
      1.895,
      0.878,
      0.965
    ],
    sizeBytes: 5077724,
    metadata: {
      "materials": [
        "BakedMaterial"
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
          "output_unwrapped"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/hawk.a7627a48.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API (text-to-3d preview/refine/remesh) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "evidence": [
          "aura-evidence/meshy/hawk.rights.71f43c13a3b1.json",
          "aura-evidence/meshy/hawk.metadata.166d1fb42d0a.json",
          "public/aura-assets/hawk.meshy-candidate.a89f5bb7.png"
        ],
        "checkedAt": "2026-10-17T06:36:30.826Z"
      },
      "sourcePath": "public/aura-assets/hawk.a7627a48.glb",
      "outputPath": "public/aura-assets/hawk.a7627a48.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.948,
          -0.444,
          -0.487
        ],
        "max": [
          0.947,
          0.435,
          0.478
        ],
        "size": [
          1.895,
          0.878,
          0.965
        ],
        "center": [
          -0.001,
          -0.004,
          -0.004
        ],
        "maxDimension": 1.895,
        "grounded": false
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
        "output_unwrapped"
      ],
      "textures": [
        "normal",
        "texture_0",
        "texture_0_metallic_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/hawk.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/hawk.meshy-candidate.a89f5bb7.png",
        "kind": "manual-inspection",
        "sha256": "sha256-a89f5bb7babe45cd75baa8ad8153462ce07f01beca09b97f9113316d9a2fccb1",
        "checkedAt": "2026-10-17T06:36:30.820Z"
      }
    },
  },
  "hop": {
    type: "model",
    format: "glb",
    url: "/aura-assets/hop.ddf2502e.glb",
    hash: "sha256-ddf2502e6ea7c39c465dcbc183fec39c69e13c310c077617d754794f5a08623c",
    bounds: [
      0.004,
      0.004,
      0.002
    ],
    sizeBytes: 2676384,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Regular_Jump",
        "Walking_Woman",
        "Counterstrike"
      ],
      "animationClips": [
        {
          "name": "Idle",
          "duration": 4,
          "channelCount": 72
        },
        {
          "name": "Regular_Jump",
          "duration": 1.8333333730697632,
          "channelCount": 72
        },
        {
          "name": "Walking_Woman",
          "duration": 0.9666666388511658,
          "channelCount": 72
        },
        {
          "name": "Counterstrike",
          "duration": 6.5,
          "channelCount": 72
        }
      ],
      "animationMetadata": {
        "clipCount": 4,
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
            "duration": 1.8333333730697632,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walking_Woman",
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
            "duration": 0.9666666388511658,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Counterstrike",
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
            "duration": 6.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 4 embedded animation clips."
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
        "animationClipCount": 4,
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
        "sourcePath": "public/aura-assets/hop.ddf2502e.glb",
        "sourceFamily": "meshy",
        "evidence": [
          "aura-evidence/meshy/hop.rights.7fcc7bfad170.json",
          "aura-evidence/meshy/hop.metadata.844e251b9826.json",
          "public/aura-assets/hop.meshy-candidate.1e7d0615.png"
        ],
        "checkedAt": "2026-10-17T06:36:28.185Z"
      },
      "sourcePath": "public/aura-assets/hop.ddf2502e.glb",
      "outputPath": "public/aura-assets/hop.ddf2502e.glb",
      "boundsMetadata": {
        "min": [
          -0.002,
          0,
          -0.001
        ],
        "max": [
          0.002,
          0.004,
          0.001
        ],
        "size": [
          0.004,
          0.004,
          0.002
        ],
        "center": [
          0,
          0.002,
          0
        ],
        "maxDimension": 0.004,
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
      "thumbnailUrl": "/aura-assets/hop.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/hop.meshy-candidate.1e7d0615.png",
        "kind": "manual-inspection",
        "sha256": "sha256-1e7d061524c73ea2aeaadab79f2d3c33d188890d445b223c9c5dcaf6da9a998c",
        "checkedAt": "2026-10-17T06:36:28.179Z"
      }
    },
  },
  "knightToad": {
    type: "model",
    format: "glb",
    url: "/aura-assets/knightToad.f2a2377a.glb",
    hash: "sha256-f2a2377a91a27e93afb652e49055bcbafdd03a87b3a6d106d0286e13f5efddba",
    bounds: [
      0.003,
      0.004,
      0.002
    ],
    sizeBytes: 4406640,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Regular_Jump",
        "Walking_Woman",
        "Counterstrike"
      ],
      "animationClips": [
        {
          "name": "Idle",
          "duration": 4,
          "channelCount": 72
        },
        {
          "name": "Regular_Jump",
          "duration": 1.8333333730697632,
          "channelCount": 72
        },
        {
          "name": "Walking_Woman",
          "duration": 0.9666666388511658,
          "channelCount": 72
        },
        {
          "name": "Counterstrike",
          "duration": 6.5,
          "channelCount": 72
        }
      ],
      "animationMetadata": {
        "clipCount": 4,
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
            "duration": 1.8333333730697632,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walking_Woman",
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
            "duration": 0.9666666388511658,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Counterstrike",
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
            "duration": 6.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 4 embedded animation clips."
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
        "animationClipCount": 4,
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
        "sourcePath": "public/aura-assets/knightToad.f2a2377a.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API (text-to-3d preview/refine/remesh/rigging/animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project.",
        "sourceFamily": "meshy",
        "evidence": [
          "aura-evidence/meshy/knightToad.rights.86dbb414904a.json",
          "aura-evidence/meshy/knightToad.metadata.dd0361116f8c.json",
          "public/aura-assets/knightToad.meshy-candidate.a3ea01ec.png"
        ],
        "checkedAt": "2026-10-17T06:36:29.746Z"
      },
      "sourcePath": "public/aura-assets/knightToad.f2a2377a.glb",
      "outputPath": "public/aura-assets/knightToad.f2a2377a.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.002,
          0,
          -0.001
        ],
        "max": [
          0.002,
          0.004,
          0.001
        ],
        "size": [
          0.003,
          0.004,
          0.002
        ],
        "center": [
          0,
          0.002,
          0
        ],
        "maxDimension": 0.004,
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
      "thumbnailUrl": "/aura-assets/knightToad.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/knightToad.meshy-candidate.a3ea01ec.png",
        "kind": "manual-inspection",
        "sha256": "sha256-a3ea01ec0e425669083336dabcbe27bea3ad69d1caff60730b631da4feb710f7",
        "checkedAt": "2026-10-17T06:36:29.739Z"
      }
    },
  },
  "mushroomKid": {
    type: "model",
    format: "glb",
    url: "/aura-assets/mushroomKid.a8308e07.glb",
    hash: "sha256-a8308e075c3ffac55b1658a79b2bdf69a4798756c902c569bd52dc14bb8d9e0e",
    bounds: [
      0.004,
      0.004,
      0.003
    ],
    sizeBytes: 3418088,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Regular_Jump",
        "Walking_Woman",
        "Counterstrike"
      ],
      "animationClips": [
        {
          "name": "Idle",
          "duration": 4,
          "channelCount": 72
        },
        {
          "name": "Regular_Jump",
          "duration": 1.8333333730697632,
          "channelCount": 72
        },
        {
          "name": "Walking_Woman",
          "duration": 0.9666666388511658,
          "channelCount": 72
        },
        {
          "name": "Counterstrike",
          "duration": 6.5,
          "channelCount": 72
        }
      ],
      "animationMetadata": {
        "clipCount": 4,
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
            "duration": 1.8333333730697632,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walking_Woman",
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
            "duration": 0.9666666388511658,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Counterstrike",
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
            "duration": 6.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 4 embedded animation clips."
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
        "animationClipCount": 4,
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
        "sourcePath": "public/aura-assets/mushroomKid.a8308e07.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API (text-to-3d preview/refine/remesh/rigging/animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project.",
        "sourceFamily": "meshy",
        "evidence": [
          "aura-evidence/meshy/mushroomKid.rights.86dbb414904a.json",
          "aura-evidence/meshy/mushroomKid.metadata.927fb5c61179.json",
          "public/aura-assets/mushroomKid.meshy-candidate.162cd6dd.png"
        ],
        "checkedAt": "2026-10-17T06:36:29.964Z"
      },
      "sourcePath": "public/aura-assets/mushroomKid.a8308e07.glb",
      "outputPath": "public/aura-assets/mushroomKid.a8308e07.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.002,
          0,
          -0.001
        ],
        "max": [
          0.002,
          0.004,
          0.001
        ],
        "size": [
          0.004,
          0.004,
          0.003
        ],
        "center": [
          0,
          0.002,
          0
        ],
        "maxDimension": 0.004,
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
      "thumbnailUrl": "/aura-assets/mushroomKid.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/mushroomKid.meshy-candidate.162cd6dd.png",
        "kind": "manual-inspection",
        "sha256": "sha256-162cd6ddc7a9ddf31e15fd2f13a3e0a1a9b6bccc3c51770cd98f66078e34e5e1",
        "checkedAt": "2026-10-17T06:36:29.958Z"
      }
    },
  },
  "rescuePod": {
    type: "model",
    format: "glb",
    url: "/aura-assets/rescuePod.93ce632d.glb",
    hash: "sha256-93ce632de025e8fb8300a66b7b61f48107867957432f779f399c901110125230",
    bounds: [
      1.748,
      1.902,
      1.53
    ],
    sizeBytes: 5085104,
    metadata: {
      "materials": [
        "BakedMaterial"
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
          "output_unwrapped"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/rescuePod.93ce632d.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API (text-to-3d preview/refine/remesh) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "evidence": [
          "aura-evidence/meshy/rescuePod.rights.71f43c13a3b1.json",
          "aura-evidence/meshy/rescuePod.metadata.4ae6190dc7f9.json",
          "public/aura-assets/rescuePod.meshy-candidate.744b4492.png"
        ],
        "checkedAt": "2026-10-17T06:36:31.041Z"
      },
      "sourcePath": "public/aura-assets/rescuePod.93ce632d.glb",
      "outputPath": "public/aura-assets/rescuePod.93ce632d.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.876,
          -0.952,
          -0.765
        ],
        "max": [
          0.872,
          0.95,
          0.764
        ],
        "size": [
          1.748,
          1.902,
          1.53
        ],
        "center": [
          -0.002,
          -0.001,
          0
        ],
        "maxDimension": 1.902,
        "grounded": false
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
        "output_unwrapped"
      ],
      "textures": [
        "normal",
        "texture_0",
        "texture_0_metallic_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/rescuePod.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/rescuePod.meshy-candidate.744b4492.png",
        "kind": "manual-inspection",
        "sha256": "sha256-744b44922b734b467128594fd0fb8c90d9bb203a24c74bbf736e183bb5fd0b77",
        "checkedAt": "2026-10-17T06:36:31.035Z"
      }
    },
  },
  "roboFrog": {
    type: "model",
    format: "glb",
    url: "/aura-assets/roboFrog.e3e5e439.glb",
    hash: "sha256-e3e5e439bdcaf2c7ce739dc49b365fca640a544ce3285213ac694604c81a3ea9",
    bounds: [
      0.005,
      0.004,
      0.002
    ],
    sizeBytes: 3666372,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Regular_Jump",
        "Walking_Woman",
        "Counterstrike"
      ],
      "animationClips": [
        {
          "name": "Idle",
          "duration": 4,
          "channelCount": 72
        },
        {
          "name": "Regular_Jump",
          "duration": 1.8333333730697632,
          "channelCount": 72
        },
        {
          "name": "Walking_Woman",
          "duration": 0.9666666388511658,
          "channelCount": 72
        },
        {
          "name": "Counterstrike",
          "duration": 6.5,
          "channelCount": 72
        }
      ],
      "animationMetadata": {
        "clipCount": 4,
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
            "duration": 1.8333333730697632,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walking_Woman",
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
            "duration": 0.9666666388511658,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Counterstrike",
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
            "duration": 6.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 4 embedded animation clips."
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
        "animationClipCount": 4,
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
        "sourcePath": "public/aura-assets/roboFrog.e3e5e439.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API (text-to-3d preview/refine/remesh/rigging/animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project.",
        "sourceFamily": "meshy",
        "evidence": [
          "aura-evidence/meshy/roboFrog.rights.86dbb414904a.json",
          "aura-evidence/meshy/roboFrog.metadata.6b472c4b1c33.json",
          "public/aura-assets/roboFrog.meshy-candidate.1d3bb395.png"
        ],
        "checkedAt": "2026-10-17T06:36:30.182Z"
      },
      "sourcePath": "public/aura-assets/roboFrog.e3e5e439.glb",
      "outputPath": "public/aura-assets/roboFrog.e3e5e439.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.002,
          0,
          -0.001
        ],
        "max": [
          0.002,
          0.004,
          0.001
        ],
        "size": [
          0.005,
          0.004,
          0.002
        ],
        "center": [
          0,
          0.002,
          0
        ],
        "maxDimension": 0.005,
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
      "thumbnailUrl": "/aura-assets/roboFrog.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/roboFrog.meshy-candidate.1d3bb395.png",
        "kind": "manual-inspection",
        "sha256": "sha256-1d3bb39538c56fc55769fc1ceea71aa38d330ae06b34705834c251a105ddceb4",
        "checkedAt": "2026-10-17T06:36:30.175Z"
      }
    },
  },
  "toastCat": {
    type: "model",
    format: "glb",
    url: "/aura-assets/toastCat.381ff671.glb",
    hash: "sha256-381ff671dc753344167b7a31d4234d58746b532c57be3525691ac54842dd2480",
    bounds: [
      0.004,
      0.004,
      0.002
    ],
    sizeBytes: 3636964,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Regular_Jump",
        "Walking_Woman",
        "Counterstrike"
      ],
      "animationClips": [
        {
          "name": "Idle",
          "duration": 4,
          "channelCount": 72
        },
        {
          "name": "Regular_Jump",
          "duration": 1.8333333730697632,
          "channelCount": 72
        },
        {
          "name": "Walking_Woman",
          "duration": 0.9666666388511658,
          "channelCount": 72
        },
        {
          "name": "Counterstrike",
          "duration": 6.5,
          "channelCount": 72
        }
      ],
      "animationMetadata": {
        "clipCount": 4,
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
            "duration": 1.8333333730697632,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walking_Woman",
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
            "duration": 0.9666666388511658,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Counterstrike",
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
            "duration": 6.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 4 embedded animation clips."
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
        "animationClipCount": 4,
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
        "sourcePath": "public/aura-assets/toastCat.381ff671.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API (text-to-3d preview/refine/remesh/rigging/animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project.",
        "sourceFamily": "meshy",
        "evidence": [
          "aura-evidence/meshy/toastCat.rights.86dbb414904a.json",
          "aura-evidence/meshy/toastCat.metadata.69e0381d65fe.json",
          "public/aura-assets/toastCat.meshy-candidate.8e5e60ae.png"
        ],
        "checkedAt": "2026-10-17T06:36:30.396Z"
      },
      "sourcePath": "public/aura-assets/toastCat.381ff671.glb",
      "outputPath": "public/aura-assets/toastCat.381ff671.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.002,
          0,
          -0.001
        ],
        "max": [
          0.002,
          0.004,
          0.001
        ],
        "size": [
          0.004,
          0.004,
          0.002
        ],
        "center": [
          0,
          0.002,
          0
        ],
        "maxDimension": 0.004,
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
      "thumbnailUrl": "/aura-assets/toastCat.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/toastCat.meshy-candidate.8e5e60ae.png",
        "kind": "manual-inspection",
        "sha256": "sha256-8e5e60aedfe2841bb832815c233e6efbeb15639fa98e5274857d32c175036ada",
        "checkedAt": "2026-10-17T06:36:30.390Z"
      }
    },
  },
  "trafficBoxtruck": {
    type: "model",
    format: "glb",
    url: "/aura-assets/trafficBoxtruck.beb356f9.glb",
    hash: "sha256-beb356f929dac3de89d8d71a04a1106d0cab8ff14c337a139a4c65661316cedb",
    bounds: [
      2.43,
      3,
      8.14
    ],
    sizeBytes: 664780,
    metadata: {
      "materials": [
        "Paint",
        "Trim",
        "Glass",
        "Headlight",
        "Brake",
        "Tire",
        "Rim",
        "Sign",
        "Cargo"
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
        "meshCount": 9,
        "materialCount": 9,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "boxtruck"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 9 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/trafficBoxtruck.beb356f9.glb",
        "sourcePage": "https://github.com/auraoneai/aura3d",
        "license": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "author": "Aura3D Roadster Rush Studio",
        "retrievedAt": "2026-10-17T00:00:00Z",
        "checkedAt": "2026-10-17T00:00:00Z"
      },
      "sourcePath": "public/aura-assets/trafficBoxtruck.beb356f9.glb",
      "outputPath": "public/aura-assets/trafficBoxtruck.beb356f9.glb",
      "license": "CC-BY-4.0",
      "author": "Aura3D Roadster Rush Studio",
      "boundsMetadata": {
        "min": [
          -1.215,
          0,
          -4.02
        ],
        "max": [
          1.215,
          3,
          4.12
        ],
        "size": [
          2.43,
          3,
          8.14
        ],
        "center": [
          0,
          1.5,
          0.05
        ],
        "maxDimension": 8.14,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Paint",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Trim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Glass",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Headlight",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Brake",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Tire",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Rim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Sign",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Cargo",
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
        "sedan",
        "hatch",
        "suv",
        "taxi",
        "van",
        "pickup",
        "boxtruck",
        "bus",
        "carrier"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/trafficBoxtruck.thumb.svg",
      "quality": "candidate",
      "role": "vehicle"
    },
  },
  "trafficHatch": {
    type: "model",
    format: "glb",
    url: "/aura-assets/trafficHatch.30c773f5.glb",
    hash: "sha256-30c773f5e074468d052897d63a238c776405205b5d0cbf13c4d1a07d2c5157ac",
    bounds: [
      1.82,
      1.47,
      4.04
    ],
    sizeBytes: 664780,
    metadata: {
      "materials": [
        "Paint",
        "Trim",
        "Glass",
        "Headlight",
        "Brake",
        "Tire",
        "Rim",
        "Sign",
        "Cargo"
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
        "meshCount": 9,
        "materialCount": 9,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "hatch"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 9 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/trafficHatch.30c773f5.glb",
        "sourcePage": "https://github.com/auraoneai/aura3d",
        "license": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "author": "Aura3D Roadster Rush Studio",
        "retrievedAt": "2026-10-17T00:00:00Z",
        "checkedAt": "2026-10-17T00:00:00Z"
      },
      "sourcePath": "public/aura-assets/trafficHatch.30c773f5.glb",
      "outputPath": "public/aura-assets/trafficHatch.30c773f5.glb",
      "license": "CC-BY-4.0",
      "author": "Aura3D Roadster Rush Studio",
      "boundsMetadata": {
        "min": [
          -0.91,
          0,
          -2.02
        ],
        "max": [
          0.91,
          1.47,
          2.02
        ],
        "size": [
          1.82,
          1.47,
          4.04
        ],
        "center": [
          0,
          0.735,
          0
        ],
        "maxDimension": 4.04,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Paint",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Trim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Glass",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Headlight",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Brake",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Tire",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Rim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Sign",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Cargo",
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
        "sedan",
        "hatch",
        "suv",
        "taxi",
        "van",
        "pickup",
        "boxtruck",
        "bus",
        "carrier"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/trafficHatch.thumb.svg",
      "quality": "candidate",
      "role": "vehicle"
    },
  },
  "trafficPickup": {
    type: "model",
    format: "glb",
    url: "/aura-assets/trafficPickup.c74e3aef.glb",
    hash: "sha256-c74e3aef84613f658e4c340461d6b6a4b7e85a7152eb84761d63ff8439a49a99",
    bounds: [
      2.02,
      1.77,
      5.58
    ],
    sizeBytes: 664780,
    metadata: {
      "materials": [
        "Paint",
        "Trim",
        "Glass",
        "Headlight",
        "Brake",
        "Tire",
        "Rim",
        "Sign",
        "Cargo"
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
        "meshCount": 9,
        "materialCount": 9,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "pickup"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 9 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/trafficPickup.c74e3aef.glb",
        "sourcePage": "https://github.com/auraoneai/aura3d",
        "license": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "author": "Aura3D Roadster Rush Studio",
        "retrievedAt": "2026-10-17T00:00:00Z",
        "checkedAt": "2026-10-17T00:00:00Z"
      },
      "sourcePath": "public/aura-assets/trafficPickup.c74e3aef.glb",
      "outputPath": "public/aura-assets/trafficPickup.c74e3aef.glb",
      "license": "CC-BY-4.0",
      "author": "Aura3D Roadster Rush Studio",
      "boundsMetadata": {
        "min": [
          -1.01,
          0,
          -2.79
        ],
        "max": [
          1.01,
          1.77,
          2.79
        ],
        "size": [
          2.02,
          1.77,
          5.58
        ],
        "center": [
          0,
          0.885,
          0
        ],
        "maxDimension": 5.58,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Paint",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Trim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Glass",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Headlight",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Brake",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Tire",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Rim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Sign",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Cargo",
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
        "sedan",
        "hatch",
        "suv",
        "taxi",
        "van",
        "pickup",
        "boxtruck",
        "bus",
        "carrier"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/trafficPickup.thumb.svg",
      "quality": "candidate",
      "role": "vehicle"
    },
  },
  "trafficSedan": {
    type: "model",
    format: "glb",
    url: "/aura-assets/trafficSedan.1844d9ab.glb",
    hash: "sha256-1844d9abc80de9e94cb0851a585ea65aa441b1eeccc6066e58ca9950fadee254",
    bounds: [
      1.9,
      1.43,
      4.64
    ],
    sizeBytes: 664780,
    metadata: {
      "materials": [
        "Paint",
        "Trim",
        "Glass",
        "Headlight",
        "Brake",
        "Tire",
        "Rim",
        "Sign",
        "Cargo"
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
        "meshCount": 9,
        "materialCount": 9,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "sedan"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 9 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/trafficSedan.1844d9ab.glb",
        "sourcePage": "https://github.com/auraoneai/aura3d",
        "license": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "author": "Aura3D Roadster Rush Studio",
        "retrievedAt": "2026-10-17T00:00:00Z",
        "checkedAt": "2026-10-17T00:00:00Z"
      },
      "sourcePath": "public/aura-assets/trafficSedan.1844d9ab.glb",
      "outputPath": "public/aura-assets/trafficSedan.1844d9ab.glb",
      "license": "CC-BY-4.0",
      "author": "Aura3D Roadster Rush Studio",
      "boundsMetadata": {
        "min": [
          -0.95,
          0,
          -2.32
        ],
        "max": [
          0.95,
          1.43,
          2.32
        ],
        "size": [
          1.9,
          1.43,
          4.64
        ],
        "center": [
          0,
          0.715,
          0
        ],
        "maxDimension": 4.64,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Paint",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Trim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Glass",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Headlight",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Brake",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Tire",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Rim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Sign",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Cargo",
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
        "sedan",
        "hatch",
        "suv",
        "taxi",
        "van",
        "pickup",
        "boxtruck",
        "bus",
        "carrier"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/trafficSedan.thumb.svg",
      "quality": "candidate",
      "role": "vehicle"
    },
  },
  "trafficSkyCar": {
    type: "model",
    format: "glb",
    url: "/aura-assets/trafficSkyCar.b60183ea.glb",
    hash: "sha256-b60183eae657d723efa31ffd8e0fad85962cf1b06c1d99b78250d369db406ce7",
    bounds: [
      2.232,
      1.266,
      4.297
    ],
    sizeBytes: 2260276,
    metadata: {
      "materials": [
        "tripo_material_a3d89100-53b6-4e1c-afd6-ac07352b5506"
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
          "tripo_node_a3d89100-53b6-4e1c-afd6-ac07352b5506"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/trafficSkyCar.b60183ea.glb",
        "sourcePage": "https://github.com/auraoneai/aura3d",
        "license": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "author": "Aura3D Roadster Rush Studio",
        "retrievedAt": "2026-10-17T00:00:00Z",
        "checkedAt": "2026-10-17T00:00:00Z"
      },
      "sourcePath": "public/aura-assets/trafficSkyCar.b60183ea.glb",
      "outputPath": "public/aura-assets/trafficSkyCar.b60183ea.glb",
      "license": "CC-BY-4.0",
      "author": "Aura3D Roadster Rush Studio",
      "boundsMetadata": {
        "min": [
          -1.116,
          0,
          -2.149
        ],
        "max": [
          1.116,
          1.266,
          2.149
        ],
        "size": [
          2.232,
          1.266,
          4.297
        ],
        "center": [
          0,
          0.633,
          0
        ],
        "maxDimension": 4.297,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "tripo_material_a3d89100-53b6-4e1c-afd6-ac07352b5506",
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
        "tripo_node_a3d89100-53b6-4e1c-afd6-ac07352b5506"
      ],
      "textures": [
        "futuristic+car+3d+model_normal",
        "futuristic+car+3d+model_basecolor",
        "futuristic+car+3d+model_rm"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/trafficSkyCar.thumb.svg",
      "quality": "candidate",
      "role": "vehicle"
    },
  },
  "trafficSuv": {
    type: "model",
    format: "glb",
    url: "/aura-assets/trafficSuv.65f82584.glb",
    hash: "sha256-65f825848d2bcd830ef6c79e23d75a193df2dbd3f7523f080ff53b8129499244",
    bounds: [
      2,
      1.82,
      4.94
    ],
    sizeBytes: 664780,
    metadata: {
      "materials": [
        "Paint",
        "Trim",
        "Glass",
        "Headlight",
        "Brake",
        "Tire",
        "Rim",
        "Sign",
        "Cargo"
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
        "meshCount": 9,
        "materialCount": 9,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "suv"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 9 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/trafficSuv.65f82584.glb",
        "sourcePage": "https://github.com/auraoneai/aura3d",
        "license": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "author": "Aura3D Roadster Rush Studio",
        "retrievedAt": "2026-10-17T00:00:00Z",
        "checkedAt": "2026-10-17T00:00:00Z"
      },
      "sourcePath": "public/aura-assets/trafficSuv.65f82584.glb",
      "outputPath": "public/aura-assets/trafficSuv.65f82584.glb",
      "license": "CC-BY-4.0",
      "author": "Aura3D Roadster Rush Studio",
      "boundsMetadata": {
        "min": [
          -1,
          0,
          -2.47
        ],
        "max": [
          1,
          1.82,
          2.47
        ],
        "size": [
          2,
          1.82,
          4.94
        ],
        "center": [
          0,
          0.91,
          0
        ],
        "maxDimension": 4.94,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Paint",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Trim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Glass",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Headlight",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Brake",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Tire",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Rim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Sign",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Cargo",
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
        "sedan",
        "hatch",
        "suv",
        "taxi",
        "van",
        "pickup",
        "boxtruck",
        "bus",
        "carrier"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/trafficSuv.thumb.svg",
      "quality": "candidate",
      "role": "vehicle"
    },
  },
  "trafficTaxi": {
    type: "model",
    format: "glb",
    url: "/aura-assets/trafficTaxi.5ca742f7.glb",
    hash: "sha256-5ca742f77a4c93e505f59369c06c5cb448ba82b7f2ece97a704d14e23fe7d45b",
    bounds: [
      1.92,
      1.63,
      4.74
    ],
    sizeBytes: 664780,
    metadata: {
      "materials": [
        "Paint",
        "Trim",
        "Glass",
        "Headlight",
        "Brake",
        "Tire",
        "Rim",
        "Sign",
        "Cargo"
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
        "meshCount": 9,
        "materialCount": 9,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "taxi"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 9 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/trafficTaxi.5ca742f7.glb",
        "sourcePage": "https://github.com/auraoneai/aura3d",
        "license": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "author": "Aura3D Roadster Rush Studio",
        "retrievedAt": "2026-10-17T00:00:00Z",
        "checkedAt": "2026-10-17T00:00:00Z"
      },
      "sourcePath": "public/aura-assets/trafficTaxi.5ca742f7.glb",
      "outputPath": "public/aura-assets/trafficTaxi.5ca742f7.glb",
      "license": "CC-BY-4.0",
      "author": "Aura3D Roadster Rush Studio",
      "boundsMetadata": {
        "min": [
          -0.96,
          0,
          -2.37
        ],
        "max": [
          0.96,
          1.63,
          2.37
        ],
        "size": [
          1.92,
          1.63,
          4.74
        ],
        "center": [
          0,
          0.815,
          0
        ],
        "maxDimension": 4.74,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Paint",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Trim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Glass",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Headlight",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Brake",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Tire",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Rim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Sign",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Cargo",
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
        "sedan",
        "hatch",
        "suv",
        "taxi",
        "van",
        "pickup",
        "boxtruck",
        "bus",
        "carrier"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/trafficTaxi.thumb.svg",
      "quality": "candidate",
      "role": "vehicle"
    },
  },
  "trafficVan": {
    type: "model",
    format: "glb",
    url: "/aura-assets/trafficVan.ef6cd5a7.glb",
    hash: "sha256-ef6cd5a792602fd8b7d6841b0b28066687e87c011c8c914c4f136cc09edc3395",
    bounds: [
      2.06,
      2.2,
      5.34
    ],
    sizeBytes: 664780,
    metadata: {
      "materials": [
        "Paint",
        "Trim",
        "Glass",
        "Headlight",
        "Brake",
        "Tire",
        "Rim",
        "Sign",
        "Cargo"
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
        "meshCount": 9,
        "materialCount": 9,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "van"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 9 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/trafficVan.ef6cd5a7.glb",
        "sourcePage": "https://github.com/auraoneai/aura3d",
        "license": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "author": "Aura3D Roadster Rush Studio",
        "retrievedAt": "2026-10-17T00:00:00Z",
        "checkedAt": "2026-10-17T00:00:00Z"
      },
      "sourcePath": "public/aura-assets/trafficVan.ef6cd5a7.glb",
      "outputPath": "public/aura-assets/trafficVan.ef6cd5a7.glb",
      "license": "CC-BY-4.0",
      "author": "Aura3D Roadster Rush Studio",
      "boundsMetadata": {
        "min": [
          -1.03,
          0,
          -2.66
        ],
        "max": [
          1.03,
          2.2,
          2.68
        ],
        "size": [
          2.06,
          2.2,
          5.34
        ],
        "center": [
          0,
          1.1,
          0.01
        ],
        "maxDimension": 5.34,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Paint",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Trim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Glass",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Headlight",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Brake",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Tire",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Rim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Sign",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Cargo",
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
        "sedan",
        "hatch",
        "suv",
        "taxi",
        "van",
        "pickup",
        "boxtruck",
        "bus",
        "carrier"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/trafficVan.thumb.svg",
      "quality": "candidate",
      "role": "vehicle"
    },
  },
  "trainCar": {
    type: "model",
    format: "glb",
    url: "/aura-assets/trainCar.73ce0880.glb",
    hash: "sha256-73ce0880680c5b12a4e3855bc26e8a1cd939d78c1ec6244a5e71e2360bcd04a3",
    bounds: [
      2.61,
      2.98,
      16.12
    ],
    sizeBytes: 664780,
    metadata: {
      "materials": [
        "Paint",
        "Trim",
        "Glass",
        "Headlight",
        "Brake",
        "Tire",
        "Rim",
        "Sign",
        "Cargo"
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
        "meshCount": 9,
        "materialCount": 9,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "carrier"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 9 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/trainCar.73ce0880.glb",
        "sourcePage": "https://github.com/auraoneai/aura3d",
        "license": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "author": "Aura3D Roadster Rush Studio",
        "retrievedAt": "2026-10-17T00:00:00Z",
        "checkedAt": "2026-10-17T00:00:00Z"
      },
      "sourcePath": "public/aura-assets/trainCar.73ce0880.glb",
      "outputPath": "public/aura-assets/trainCar.73ce0880.glb",
      "license": "CC-BY-4.0",
      "author": "Aura3D Roadster Rush Studio",
      "boundsMetadata": {
        "min": [
          -1.305,
          0,
          -8
        ],
        "max": [
          1.305,
          2.98,
          8.12
        ],
        "size": [
          2.61,
          2.98,
          16.12
        ],
        "center": [
          0,
          1.49,
          0.06
        ],
        "maxDimension": 16.12,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Paint",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Trim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Glass",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Headlight",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Brake",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Tire",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Rim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Sign",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Cargo",
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
        "sedan",
        "hatch",
        "suv",
        "taxi",
        "van",
        "pickup",
        "boxtruck",
        "bus",
        "carrier"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/trainCar.thumb.svg",
      "quality": "candidate",
      "role": "vehicle"
    },
  },
  "tramCar": {
    type: "model",
    format: "glb",
    url: "/aura-assets/tramCar.1618d848.glb",
    hash: "sha256-1618d848bbe68977143b2dab6012fa02f25b169fcd14fe0e4c528503eb1f6168",
    bounds: [
      2.6,
      3.16,
      12.22
    ],
    sizeBytes: 664780,
    metadata: {
      "materials": [
        "Paint",
        "Trim",
        "Glass",
        "Headlight",
        "Brake",
        "Tire",
        "Rim",
        "Sign",
        "Cargo"
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
        "meshCount": 9,
        "materialCount": 9,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "bus"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 9 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/tramCar.1618d848.glb",
        "sourcePage": "https://github.com/auraoneai/aura3d",
        "license": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "author": "Aura3D Roadster Rush Studio",
        "retrievedAt": "2026-10-17T00:00:00Z",
        "checkedAt": "2026-10-17T00:00:00Z"
      },
      "sourcePath": "public/aura-assets/tramCar.1618d848.glb",
      "outputPath": "public/aura-assets/tramCar.1618d848.glb",
      "license": "CC-BY-4.0",
      "author": "Aura3D Roadster Rush Studio",
      "boundsMetadata": {
        "min": [
          -1.3,
          0,
          -6.11
        ],
        "max": [
          1.3,
          3.16,
          6.11
        ],
        "size": [
          2.6,
          3.16,
          12.22
        ],
        "center": [
          0,
          1.58,
          0
        ],
        "maxDimension": 12.22,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Paint",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Trim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Glass",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Headlight",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Brake",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Tire",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Rim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Sign",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Cargo",
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
        "sedan",
        "hatch",
        "suv",
        "taxi",
        "van",
        "pickup",
        "boxtruck",
        "bus",
        "carrier"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/tramCar.thumb.svg",
      "quality": "candidate",
      "role": "vehicle"
    },
  },
  "turtle": {
    type: "model",
    format: "glb",
    url: "/aura-assets/turtle.db61a7bb.glb",
    hash: "sha256-db61a7bb64ba715c4f85670dc6e7d902d42a5e21e61f4d08870c54f35682bc2f",
    bounds: [
      0.004,
      0.004,
      0.005
    ],
    sizeBytes: 3367284,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Regular_Jump",
        "Walking_Woman",
        "Counterstrike"
      ],
      "animationClips": [
        {
          "name": "Idle",
          "duration": 4,
          "channelCount": 72
        },
        {
          "name": "Regular_Jump",
          "duration": 1.8333333730697632,
          "channelCount": 72
        },
        {
          "name": "Walking_Woman",
          "duration": 0.9666666388511658,
          "channelCount": 72
        },
        {
          "name": "Counterstrike",
          "duration": 6.5,
          "channelCount": 72
        }
      ],
      "animationMetadata": {
        "clipCount": 4,
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
            "duration": 1.8333333730697632,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Walking_Woman",
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
            "duration": 0.9666666388511658,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Counterstrike",
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
            "duration": 6.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 4 embedded animation clips."
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
        "animationClipCount": 4,
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
        "sourcePath": "public/aura-assets/turtle.db61a7bb.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API (text-to-3d preview/refine/remesh/rigging/animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project.",
        "sourceFamily": "meshy",
        "evidence": [
          "aura-evidence/meshy/turtle.rights.86dbb414904a.json",
          "aura-evidence/meshy/turtle.metadata.d5aea1374bbb.json",
          "public/aura-assets/turtle.meshy-candidate.80f313ed.png"
        ],
        "checkedAt": "2026-10-17T06:36:30.612Z"
      },
      "sourcePath": "public/aura-assets/turtle.db61a7bb.glb",
      "outputPath": "public/aura-assets/turtle.db61a7bb.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.002,
          0,
          -0.003
        ],
        "max": [
          0.002,
          0.004,
          0.003
        ],
        "size": [
          0.004,
          0.004,
          0.005
        ],
        "center": [
          0,
          0.002,
          0
        ],
        "maxDimension": 0.005,
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
      "thumbnailUrl": "/aura-assets/turtle.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/turtle.meshy-candidate.80f313ed.png",
        "kind": "manual-inspection",
        "sha256": "sha256-80f313edeae426738fcd868775768eaf71cc8fd851a22531b98da8d481baac51",
        "checkedAt": "2026-10-17T06:36:30.606Z"
      }
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
