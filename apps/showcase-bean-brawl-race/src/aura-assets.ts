import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "blueBean": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bouncePad": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "finishArch": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "heroBean": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "obstacleCourse": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "rivalBean": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "rotatingSweeper": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "spinningTurntable": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "swingingPendulum": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "winnerCrown": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "yellowBean": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets = defineAuraAssets({
  "blueBean": {
    type: "model",
    format: "glb",
    url: "/aura-assets/blueBean.f2c1edc8.glb",
    hash: "sha256-f2c1edc8220ff5f84b1a4e2fbfec925d1e73689ff53d523a60e3d9ee460e1674",
    bounds: [
      1.039,
      1.2,
      0.73
    ],
    sizeBytes: 1925772,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Walk",
        "Run",
        "Jump",
        "Fall",
        "Celebrate"
      ],
      "animationClips": [
        {
          "name": "Idle",
          "duration": 4.0333333015441895,
          "channelCount": 66
        },
        {
          "name": "Walk",
          "duration": 1.066666603088379,
          "channelCount": 66
        },
        {
          "name": "Run",
          "duration": 0.6666666865348816,
          "channelCount": 66
        },
        {
          "name": "Jump",
          "duration": 1.8999998569488525,
          "channelCount": 66
        },
        {
          "name": "Fall",
          "duration": 2.299999952316284,
          "channelCount": 66
        },
        {
          "name": "Celebrate",
          "duration": 9.366666793823242,
          "channelCount": 66
        }
      ],
      "animationMetadata": {
        "clipCount": 6,
        "clips": [
          {
            "index": 0,
            "name": "Idle",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 4.0333333015441895,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 1,
            "name": "Walk",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 1.066666603088379,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Run",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 0.6666666865348816,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Jump",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 1.8999998569488525,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 4,
            "name": "Fall",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 2.299999952316284,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 5,
            "name": "Celebrate",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 9.366666793823242,
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
        "textureCount": 3,
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
        "sourcePath": "artifacts/meshy/bean-blue/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:25:34.505Z",
        "evidence": [
          "aura-evidence/meshy/blueBean.rights.8f8012b08333.json",
          "aura-evidence/meshy/blueBean.metadata.c6fd2fbb95ca.json",
          "public/aura-assets/blueBean.meshy-candidate.8ea7f1b8.png"
        ],
        "checkedAt": "2026-10-16T01:25:34.505Z"
      },
      "sourcePath": "artifacts/meshy/bean-blue/model.glb",
      "outputPath": "public/aura-assets/blueBean.f2c1edc8.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.52,
          0,
          -0.365
        ],
        "max": [
          0.52,
          1.2,
          0.365
        ],
        "size": [
          1.039,
          1.2,
          0.73
        ],
        "center": [
          0,
          0.6,
          0
        ],
        "maxDimension": 1.2,
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
        "normal",
        "texture_0",
        "texture_0_metallic_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/blueBean.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/blueBean.meshy-candidate.8ea7f1b8.png",
        "kind": "manual-inspection",
        "sha256": "sha256-8ea7f1b8ef4c25d2a90b5d25ea2ffa386109439fc033b79dda331666875b1eac",
        "checkedAt": "2026-10-16T02:03:09.138Z"
      }
    },
  },
  "bouncePad": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bouncePad.4f83a6af.glb",
    hash: "sha256-4f83a6af6b74919d6a4e0f53c047d4d6600b38ff17d436b63837b8dd69558064",
    bounds: [
      1.898,
      0.396,
      1.9
    ],
    sizeBytes: 964308,
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
        "sourcePath": "artifacts/meshy/bean-bounce-pad/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:28:38.983Z",
        "evidence": [
          "aura-evidence/meshy/bouncePad.rights.8f8012b08333.json",
          "aura-evidence/meshy/bouncePad.metadata.4ec85aa11c91.json",
          "public/aura-assets/bouncePad.meshy-candidate.6f5792f4.png"
        ],
        "checkedAt": "2026-10-16T01:28:38.983Z"
      },
      "sourcePath": "artifacts/meshy/bean-bounce-pad/model.glb",
      "outputPath": "public/aura-assets/bouncePad.4f83a6af.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.949,
          -0.198,
          -0.951
        ],
        "max": [
          0.949,
          0.198,
          0.949
        ],
        "size": [
          1.898,
          0.396,
          1.9
        ],
        "center": [
          0,
          0,
          -0.001
        ],
        "maxDimension": 1.9,
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
      "thumbnailUrl": "/aura-assets/bouncePad.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/bouncePad.meshy-candidate.6f5792f4.png",
        "kind": "manual-inspection",
        "sha256": "sha256-6f5792f426cebe77a6150f1bb70db967646be868bfdc972f91e90dfa8a8e1abb",
        "checkedAt": "2026-10-16T02:03:09.168Z"
      }
    },
  },
  "finishArch": {
    type: "model",
    format: "glb",
    url: "/aura-assets/finishArch.37d9c60b.glb",
    hash: "sha256-37d9c60ba731a63954208bbc207d8c2dbdffba89ee8a118dcf518f52d72c3b06",
    bounds: [
      1.902,
      0.795,
      0.639
    ],
    sizeBytes: 736616,
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
        "sourcePath": "artifacts/meshy/bean-finish-arch/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:03:53.330Z",
        "evidence": [
          "aura-evidence/meshy/finishArch.rights.8f8012b08333.json",
          "aura-evidence/meshy/finishArch.metadata.9de926f83a17.json",
          "public/aura-assets/finishArch.meshy-candidate.fd04a01b.png"
        ],
        "checkedAt": "2026-10-16T01:03:53.330Z"
      },
      "sourcePath": "artifacts/meshy/bean-finish-arch/model.glb",
      "outputPath": "public/aura-assets/finishArch.37d9c60b.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.398,
          -0.32
        ],
        "max": [
          0.951,
          0.397,
          0.319
        ],
        "size": [
          1.902,
          0.795,
          0.639
        ],
        "center": [
          -0.001,
          0,
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
      "thumbnailUrl": "/aura-assets/finishArch.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/finishArch.meshy-candidate.fd04a01b.png",
        "kind": "manual-inspection",
        "sha256": "sha256-fd04a01ba2fbb811131acf9d38a724b21874fae8af649c0db0da60fc55cff671",
        "checkedAt": "2026-10-16T02:03:09.180Z"
      }
    },
  },
  "heroBean": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heroBean.11d1ed86.glb",
    hash: "sha256-11d1ed867e4e7a1c5cf5e91a4972e34fcad0478300bce7990703c561c76c7d0f",
    bounds: [
      0.998,
      1.2,
      0.642
    ],
    sizeBytes: 1868076,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Walk",
        "Run",
        "Jump",
        "Fall",
        "Celebrate"
      ],
      "animationClips": [
        {
          "name": "Idle",
          "duration": 4.0333333015441895,
          "channelCount": 66
        },
        {
          "name": "Walk",
          "duration": 1.066666603088379,
          "channelCount": 66
        },
        {
          "name": "Run",
          "duration": 0.6666666865348816,
          "channelCount": 66
        },
        {
          "name": "Jump",
          "duration": 1.8999998569488525,
          "channelCount": 66
        },
        {
          "name": "Fall",
          "duration": 2.299999952316284,
          "channelCount": 66
        },
        {
          "name": "Celebrate",
          "duration": 9.366666793823242,
          "channelCount": 66
        }
      ],
      "animationMetadata": {
        "clipCount": 6,
        "clips": [
          {
            "index": 0,
            "name": "Idle",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 4.0333333015441895,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 1,
            "name": "Walk",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 1.066666603088379,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Run",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 0.6666666865348816,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Jump",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 1.8999998569488525,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 4,
            "name": "Fall",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 2.299999952316284,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 5,
            "name": "Celebrate",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 9.366666793823242,
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
        "textureCount": 3,
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
        "sourcePath": "artifacts/meshy/bean-hero/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T00:45:31.748Z",
        "evidence": [
          "aura-evidence/meshy/heroBean.rights.8f8012b08333.json",
          "aura-evidence/meshy/heroBean.metadata.39438c8971ca.json",
          "public/aura-assets/heroBean.meshy-candidate.960f7e4f.png"
        ],
        "checkedAt": "2026-10-16T00:45:31.748Z"
      },
      "sourcePath": "artifacts/meshy/bean-hero/model.glb",
      "outputPath": "public/aura-assets/heroBean.11d1ed86.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.499,
          0,
          -0.321
        ],
        "max": [
          0.499,
          1.2,
          0.321
        ],
        "size": [
          0.998,
          1.2,
          0.642
        ],
        "center": [
          0,
          0.6,
          0
        ],
        "maxDimension": 1.2,
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
        "normal",
        "texture_0",
        "texture_0_metallic_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/heroBean.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/heroBean.meshy-candidate.960f7e4f.png",
        "kind": "manual-inspection",
        "sha256": "sha256-960f7e4ff590b43c8eefde82058238a1010c3c8676183257a77686cff9fc3cc5",
        "checkedAt": "2026-10-16T02:03:09.115Z"
      }
    },
  },
  "obstacleCourse": {
    type: "model",
    format: "glb",
    url: "/aura-assets/obstacleCourse.b5892753.glb",
    hash: "sha256-b5892753d2f15ec169cd31ac5a71394d5d28145ad329ea5523458e040ad382dc",
    bounds: [
      1.895,
      1.135,
      1.763
    ],
    sizeBytes: 4782292,
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
        "sourcePath": "artifacts/meshy/bean-course/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:24:45.765Z",
        "evidence": [
          "aura-evidence/meshy/obstacleCourse.rights.8f8012b08333.json",
          "aura-evidence/meshy/obstacleCourse.metadata.2c76cbfcf5b0.json",
          "public/aura-assets/obstacleCourse.meshy-candidate.ba8fefc9.png"
        ],
        "checkedAt": "2026-10-16T01:24:45.765Z"
      },
      "sourcePath": "artifacts/meshy/bean-course/model.glb",
      "outputPath": "public/aura-assets/obstacleCourse.b5892753.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.951,
          -0.575,
          -0.882
        ],
        "max": [
          0.944,
          0.561,
          0.881
        ],
        "size": [
          1.895,
          1.135,
          1.763
        ],
        "center": [
          -0.004,
          -0.007,
          0
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
      "thumbnailUrl": "/aura-assets/obstacleCourse.thumb.svg",
      "quality": "candidate",
      "role": "world",
      "renderedProbe": {
        "url": "/aura-assets/obstacleCourse.meshy-candidate.ba8fefc9.png",
        "kind": "manual-inspection",
        "sha256": "sha256-ba8fefc92f393761b91bfb2ae8ee2ed8ccd4f8c8bcaab4fd7120770308ba5d61",
        "checkedAt": "2026-10-16T02:03:09.157Z"
      }
    },
  },
  "rivalBean": {
    type: "model",
    format: "glb",
    url: "/aura-assets/rivalBean.08df3e23.glb",
    hash: "sha256-08df3e23fac30844a8b1f7b867a5f404b766ca57a493bb0baf2ef4c64ba2bcaf",
    bounds: [
      0.728,
      1.2,
      0.759
    ],
    sizeBytes: 1773044,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Walk",
        "Run",
        "Jump",
        "Fall",
        "Celebrate"
      ],
      "animationClips": [
        {
          "name": "Idle",
          "duration": 4.0333333015441895,
          "channelCount": 66
        },
        {
          "name": "Walk",
          "duration": 1.066666603088379,
          "channelCount": 66
        },
        {
          "name": "Run",
          "duration": 0.6666666865348816,
          "channelCount": 66
        },
        {
          "name": "Jump",
          "duration": 1.8999998569488525,
          "channelCount": 66
        },
        {
          "name": "Fall",
          "duration": 2.299999952316284,
          "channelCount": 66
        },
        {
          "name": "Celebrate",
          "duration": 9.366666793823242,
          "channelCount": 66
        }
      ],
      "animationMetadata": {
        "clipCount": 6,
        "clips": [
          {
            "index": 0,
            "name": "Idle",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 4.0333333015441895,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 1,
            "name": "Walk",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 1.066666603088379,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Run",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 0.6666666865348816,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Jump",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 1.8999998569488525,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 4,
            "name": "Fall",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 2.299999952316284,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 5,
            "name": "Celebrate",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 9.366666793823242,
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
        "textureCount": 3,
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
        "sourcePath": "artifacts/meshy/bean-rival/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:23:42.438Z",
        "evidence": [
          "aura-evidence/meshy/rivalBean.rights.8f8012b08333.json",
          "aura-evidence/meshy/rivalBean.metadata.a7f1a62ac55d.json",
          "public/aura-assets/rivalBean.meshy-candidate.6cdedd2f.png"
        ],
        "checkedAt": "2026-10-16T01:23:42.438Z"
      },
      "sourcePath": "artifacts/meshy/bean-rival/model.glb",
      "outputPath": "public/aura-assets/rivalBean.08df3e23.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.364,
          0,
          -0.379
        ],
        "max": [
          0.364,
          1.2,
          0.379
        ],
        "size": [
          0.728,
          1.2,
          0.759
        ],
        "center": [
          0,
          0.6,
          0
        ],
        "maxDimension": 1.2,
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
        "normal",
        "texture_0",
        "texture_0_metallic_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/rivalBean.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/rivalBean.meshy-candidate.6cdedd2f.png",
        "kind": "manual-inspection",
        "sha256": "sha256-6cdedd2fa5cb75c58d44eb5472cc302de374b175fa683cee6f96be94256603eb",
        "checkedAt": "2026-10-16T02:03:09.128Z"
      }
    },
  },
  "rotatingSweeper": {
    type: "model",
    format: "glb",
    url: "/aura-assets/rotatingSweeper.3e9b9b85.glb",
    hash: "sha256-3e9b9b853968447b381bc063f9c9978e3613b299b8184895fef0a87f8943c397",
    bounds: [
      1.903,
      1.086,
      1.902
    ],
    sizeBytes: 1036908,
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
        "sourcePath": "artifacts/meshy/bean-sweeper/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:26:49.201Z",
        "evidence": [
          "aura-evidence/meshy/rotatingSweeper.rights.8f8012b08333.json",
          "aura-evidence/meshy/rotatingSweeper.metadata.722229619af7.json",
          "public/aura-assets/rotatingSweeper.meshy-candidate.47663f2f.png"
        ],
        "checkedAt": "2026-10-16T01:26:49.201Z"
      },
      "sourcePath": "artifacts/meshy/bean-sweeper/model.glb",
      "outputPath": "public/aura-assets/rotatingSweeper.3e9b9b85.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.554,
          -0.952
        ],
        "max": [
          0.951,
          0.532,
          0.951
        ],
        "size": [
          1.903,
          1.086,
          1.902
        ],
        "center": [
          -0.001,
          -0.011,
          0
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
      "thumbnailUrl": "/aura-assets/rotatingSweeper.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/rotatingSweeper.meshy-candidate.47663f2f.png",
        "kind": "manual-inspection",
        "sha256": "sha256-47663f2fbb210409e70aa61148c522fbf42ab8b6c71287e9d88be9b30d0da293",
        "checkedAt": "2026-10-16T02:03:09.165Z"
      }
    },
  },
  "spinningTurntable": {
    type: "model",
    format: "glb",
    url: "/aura-assets/spinningTurntable.de875e59.glb",
    hash: "sha256-de875e592aafff40ec4cfda2d4ae2292ff5a481ce8a9b8d5f154d859cad57874",
    bounds: [
      1.903,
      0.281,
      1.903
    ],
    sizeBytes: 756204,
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
        "sourcePath": "artifacts/meshy/bean-turntable/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:05:52.454Z",
        "evidence": [
          "aura-evidence/meshy/spinningTurntable.rights.8f8012b08333.json",
          "aura-evidence/meshy/spinningTurntable.metadata.c3f115f7cade.json",
          "public/aura-assets/spinningTurntable.meshy-candidate.57f8ba1a.png"
        ],
        "checkedAt": "2026-10-16T01:05:52.454Z"
      },
      "sourcePath": "artifacts/meshy/bean-turntable/model.glb",
      "outputPath": "public/aura-assets/spinningTurntable.de875e59.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.133,
          -0.952
        ],
        "max": [
          0.951,
          0.148,
          0.951
        ],
        "size": [
          1.903,
          0.281,
          1.903
        ],
        "center": [
          -0.001,
          0.007,
          -0.001
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
      "thumbnailUrl": "/aura-assets/spinningTurntable.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/spinningTurntable.meshy-candidate.57f8ba1a.png",
        "kind": "manual-inspection",
        "sha256": "sha256-57f8ba1a090e5e5d4996883b2a00e0c0c23c9ed449c09d03db97cfcd20008706",
        "checkedAt": "2026-10-16T02:03:09.184Z"
      }
    },
  },
  "swingingPendulum": {
    type: "model",
    format: "glb",
    url: "/aura-assets/swingingPendulum.4a128bef.glb",
    hash: "sha256-4a128bef65f6200e22dad6b45c1a72d08902c25d7ba46dffa6e0861ce950741f",
    bounds: [
      1.903,
      1.79,
      0.486
    ],
    sizeBytes: 1045256,
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
        "sourcePath": "artifacts/meshy/bean-pendulum/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:02:14.828Z",
        "evidence": [
          "aura-evidence/meshy/swingingPendulum.rights.8f8012b08333.json",
          "aura-evidence/meshy/swingingPendulum.metadata.46e1b1f79b16.json",
          "public/aura-assets/swingingPendulum.meshy-candidate.42d7dc2d.png"
        ],
        "checkedAt": "2026-10-16T01:02:14.828Z"
      },
      "sourcePath": "artifacts/meshy/bean-pendulum/model.glb",
      "outputPath": "public/aura-assets/swingingPendulum.4a128bef.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.89,
          -0.243
        ],
        "max": [
          0.951,
          0.9,
          0.242
        ],
        "size": [
          1.903,
          1.79,
          0.486
        ],
        "center": [
          0,
          0.005,
          0
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
      "thumbnailUrl": "/aura-assets/swingingPendulum.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/swingingPendulum.meshy-candidate.42d7dc2d.png",
        "kind": "manual-inspection",
        "sha256": "sha256-42d7dc2df56af82fb77e560b470798b6b6e856c4666dfc32619a000f109cd2ff",
        "checkedAt": "2026-10-16T02:03:09.175Z"
      }
    },
  },
  "winnerCrown": {
    type: "model",
    format: "glb",
    url: "/aura-assets/winnerCrown.1bacb982.glb",
    hash: "sha256-1bacb982c4f5e18d70a9ba0a11762e3882851595220eed71c978aacb326e23d2",
    bounds: [
      1.894,
      0.865,
      1.899
    ],
    sizeBytes: 849032,
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
        "sourcePath": "artifacts/meshy/bean-crown/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T00:40:05.931Z",
        "evidence": [
          "aura-evidence/meshy/winnerCrown.rights.8f8012b08333.json",
          "aura-evidence/meshy/winnerCrown.metadata.2ec435c216f3.json",
          "public/aura-assets/winnerCrown.meshy-candidate.781170ac.png"
        ],
        "checkedAt": "2026-10-16T00:40:05.931Z"
      },
      "sourcePath": "artifacts/meshy/bean-crown/model.glb",
      "outputPath": "public/aura-assets/winnerCrown.1bacb982.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.947,
          -0.433,
          -0.952
        ],
        "max": [
          0.946,
          0.432,
          0.948
        ],
        "size": [
          1.894,
          0.865,
          1.899
        ],
        "center": [
          -0.001,
          0,
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
          "reasons": []
        }
      ],
      "orientation": {
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
      "thumbnailUrl": "/aura-assets/winnerCrown.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/winnerCrown.meshy-candidate.781170ac.png",
        "kind": "manual-inspection",
        "sha256": "sha256-781170acbb2e4987705f556397856e8c90d0fa2933785b6d98892de92b1d6d79",
        "checkedAt": "2026-10-16T02:03:09.171Z"
      }
    },
  },
  "yellowBean": {
    type: "model",
    format: "glb",
    url: "/aura-assets/yellowBean.ee109f19.glb",
    hash: "sha256-ee109f19804611ef84d1ca1c6fdbf253ae01a96fd1c3ebb10c0843040d8522aa",
    bounds: [
      1.228,
      1.2,
      0.635
    ],
    sizeBytes: 1969276,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Walk",
        "Run",
        "Jump",
        "Fall",
        "Celebrate"
      ],
      "animationClips": [
        {
          "name": "Idle",
          "duration": 4.0333333015441895,
          "channelCount": 66
        },
        {
          "name": "Walk",
          "duration": 1.066666603088379,
          "channelCount": 66
        },
        {
          "name": "Run",
          "duration": 0.6666666865348816,
          "channelCount": 66
        },
        {
          "name": "Jump",
          "duration": 1.8999998569488525,
          "channelCount": 66
        },
        {
          "name": "Fall",
          "duration": 2.299999952316284,
          "channelCount": 66
        },
        {
          "name": "Celebrate",
          "duration": 9.366666793823242,
          "channelCount": 66
        }
      ],
      "animationMetadata": {
        "clipCount": 6,
        "clips": [
          {
            "index": 0,
            "name": "Idle",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 4.0333333015441895,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 1,
            "name": "Walk",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 1.066666603088379,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Run",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 0.6666666865348816,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Jump",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 1.8999998569488525,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 4,
            "name": "Fall",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 2.299999952316284,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 5,
            "name": "Celebrate",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
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
              "Hips"
            ],
            "duration": 9.366666793823242,
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
        "textureCount": 3,
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
        "sourcePath": "artifacts/meshy/bean-yellow/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:27:17.021Z",
        "evidence": [
          "aura-evidence/meshy/yellowBean.rights.8f8012b08333.json",
          "aura-evidence/meshy/yellowBean.metadata.e16eea365c6e.json",
          "public/aura-assets/yellowBean.meshy-candidate.8168c751.png"
        ],
        "checkedAt": "2026-10-16T01:27:17.021Z"
      },
      "sourcePath": "artifacts/meshy/bean-yellow/model.glb",
      "outputPath": "public/aura-assets/yellowBean.ee109f19.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.614,
          0,
          -0.317
        ],
        "max": [
          0.614,
          1.2,
          0.317
        ],
        "size": [
          1.228,
          1.2,
          0.635
        ],
        "center": [
          0,
          0.6,
          0
        ],
        "maxDimension": 1.228,
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
        "normal",
        "texture_0",
        "texture_0_metallic_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/yellowBean.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/yellowBean.meshy-candidate.8168c751.png",
        "kind": "manual-inspection",
        "sha256": "sha256-8168c751fd32f2f0369a16c2af4a76c4c79eb1198ede81ca3ac2355ad984195a",
        "checkedAt": "2026-10-16T02:03:09.149Z"
      }
    },
  },
} as const as never) as unknown as AuraAssetMap<AuraGeneratedAssetDefinitions>;

export type AuraGeneratedAssets = typeof assets;
