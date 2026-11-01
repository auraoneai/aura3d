import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "pipsArch": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsBarrel": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsBee": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsBouncer": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsBrambleback": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsCheckpointFlag": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsColumn": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsCrate": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsCrystal": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsEmberPot": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsGoldenAcorn": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsHeart": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsLantern": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsPip": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsSidekick": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsStar": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsSungate": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsSunseed": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsTileMossDisc": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsWindmill": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsWindTurbine": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "pipsArch": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsArch.bb31ec8a.glb",
    hash: "sha256-bb31ec8a044791260ade60161993815ede6dd4400881ab2f1173007fa1352078",
    bounds: [
      4.244,
      3.544,
      0.386
    ],
    sizeBytes: 318724,
    metadata: {
      "materials": [
        "Atlas_01_Mat",
        "Atlas_01_Trans_Mat"
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
        "materialCount": 2,
        "textureCount": 2,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Arc"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pipsArch.bb31ec8a.glb",
        "sourcePage": "https://github.com/ToxSam/cc0-models-Polygonal-Mind/tree/main/projects/crystal-crossroads",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Polygonal Mind",
        "sourceFamily": "os3a",
        "retrievedAt": "2026-11-01T16:40:00Z",
        "evidence": [
          "catalog source id os3a:crystal-crossroads-001 (cc0-claims pips-big-leap); black inverted-hull outline primitive removed with gltf-transform, arch geometry unchanged"
        ],
        "checkedAt": "2026-11-01T16:40:00Z"
      },
      "sourcePath": "public/aura-assets/pipsArch.bb31ec8a.glb",
      "outputPath": "public/aura-assets/pipsArch.bb31ec8a.glb",
      "license": "CC0-1.0",
      "author": "Polygonal Mind",
      "boundsMetadata": {
        "min": [
          -2.121,
          0,
          -0.194
        ],
        "max": [
          2.122,
          3.544,
          0.193
        ],
        "size": [
          4.244,
          3.544,
          0.386
        ],
        "center": [
          0.001,
          1.772,
          0
        ],
        "maxDimension": 4.244,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Atlas_01_Mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "Atlas_01_Trans_Mat",
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
        "Arc"
      ],
      "textures": [
        "Atlas_01_Albedo",
        "Atlas_01_Trans"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsArch.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "suitabilityReason": "stone and crystal arch decor"
    },
  },
  "pipsBarrel": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsBarrel.5499094c.glb",
    hash: "sha256-5499094ca43eb9a7dc6078ecc4567e089b87c81fca5f6703b9e35b27fca3d41b",
    bounds: [
      0.518,
      0.476,
      0.518
    ],
    sizeBytes: 24980,
    metadata: {
      "materials": [
        "colormap"
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
          "barrel"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pipsBarrel.5499094c.glb",
        "sourcePage": "https://github.com/gchahal1982/aura3d-cc0-assets/tree/main/kenney/platformer-kit",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "kenney",
        "sourceFamily": "kenney",
        "retrievedAt": "2026-11-01T16:40:00Z",
        "evidence": [
          "catalog source id kenney:platformer-kit:barrel (cc0-claims pips-big-leap); external textures embedded with gltf-transform, geometry unchanged"
        ],
        "checkedAt": "2026-11-01T16:40:00Z"
      },
      "sourcePath": "public/aura-assets/pipsBarrel.5499094c.glb",
      "outputPath": "public/aura-assets/pipsBarrel.5499094c.glb",
      "license": "CC0-1.0",
      "author": "kenney",
      "boundsMetadata": {
        "min": [
          -0.259,
          0,
          -0.259
        ],
        "max": [
          0.259,
          0.476,
          0.259
        ],
        "size": [
          0.518,
          0.476,
          0.518
        ],
        "center": [
          0,
          0.238,
          0
        ],
        "maxDimension": 0.518,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "colormap",
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
        "barrel"
      ],
      "textures": [
        "colormap"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsBarrel.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "suitabilityReason": "barrel decor"
    },
  },
  "pipsBee": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsBee.06fd8133.glb",
    hash: "sha256-06fd81336939fc39467c4c71f5e95d2b7943ee044adb1c6d09903c269ab2b1f7",
    bounds: [
      2.867,
      1.871,
      1.473
    ],
    sizeBytes: 182556,
    metadata: {
      "materials": [
        "Main",
        "Main_2",
        "Wings",
        "Teeth",
        "Tongue",
        "Eyes"
      ],
      "animations": [
        "Bite_Front",
        "Death",
        "Flying",
        "HitRecieve"
      ],
      // NOTE(typegen skew): the current typegen emits animationClips as {name,duration,channelCount}
      // objects, but `AuraAssetMetadata` declares `readonly string[]`; kept in the declared shape
      // (full clip records remain under `animationMetadata.clips`).
      "animationClips": [
        "Bite_Front",
        "Death",
        "Flying",
        "HitRecieve"
      ],
      "animationMetadata": {
        "clipCount": 4,
        "clips": [
          {
            "index": 0,
            "name": "Bite_Front",
            "channelCount": 18,
            "samplerCount": 18,
            "targetPaths": [
              "translation",
              "rotation"
            ],
            "targetNodes": [
              "Body",
              "Mouth",
              "Head",
              "Head2",
              "Head3",
              "Wing1.L",
              "Wing2.L",
              "Wing1.R",
              "Wing2.R"
            ],
            "duration": 1.125,
            "hasRootMotionCandidate": false,
            "frameRate": 23.999997138977392
          },
          {
            "index": 1,
            "name": "Death",
            "channelCount": 18,
            "samplerCount": 18,
            "targetPaths": [
              "translation",
              "rotation"
            ],
            "targetNodes": [
              "Body",
              "Mouth",
              "Head",
              "Head2",
              "Head3",
              "Wing1.L",
              "Wing2.L",
              "Wing1.R",
              "Wing2.R"
            ],
            "duration": 0.7916666865348816,
            "hasRootMotionCandidate": false,
            "frameRate": 23.999997138977392
          },
          {
            "index": 2,
            "name": "Flying",
            "channelCount": 16,
            "samplerCount": 16,
            "targetPaths": [
              "translation",
              "rotation"
            ],
            "targetNodes": [
              "Body",
              "Head",
              "Head2",
              "Head3",
              "Wing1.L",
              "Wing2.L",
              "Wing1.R",
              "Wing2.R"
            ],
            "duration": 1.125,
            "hasRootMotionCandidate": false,
            "frameRate": 23.999997138977392
          },
          {
            "index": 3,
            "name": "HitRecieve",
            "channelCount": 14,
            "samplerCount": 14,
            "targetPaths": [
              "translation",
              "rotation"
            ],
            "targetNodes": [
              "Body",
              "Head",
              "Head2",
              "Head3",
              "Wing2.L",
              "Wing1.R",
              "Wing2.R"
            ],
            "duration": 0.625,
            "hasRootMotionCandidate": false,
            "frameRate": 23.999999284744284
          }
        ],
        "messages": [
          "Detected 4 embedded animation clips."
        ]
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 1,
        "jointCount": 9,
        "skins": [
          {
            "index": 0,
            "name": "MonsterArmature",
            "jointCount": 9,
            "joints": [
              "Body",
              "Mouth",
              "Head",
              "Head2",
              "Head3",
              "Wing1.L",
              "Wing2.L",
              "Wing1.R",
              "Wing2.R"
            ]
          }
        ],
        "messages": [
          "Detected 1 skin with 9 unique joints."
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
        "meshCount": 1,
        "materialCount": 6,
        "textureCount": 0,
        "animationClipCount": 4,
        "skinCount": 1,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "MonsterArmature"
        ],
        "maxDepth": 4,
        "messages": [
          "Detected 11 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pipsBee.06fd8133.glb",
        "sourcePage": "https://github.com/gchahal1982/aura3d-cc0-assets/tree/main/quaternius/ultimate-platformer-pack",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "quaternius",
        "sourceFamily": "quaternius",
        "retrievedAt": "2026-11-01T16:40:00Z",
        "evidence": [
          "catalog source id quaternius:ultimate-platformer-pack:Bee (cc0-claims pips-big-leap); external textures embedded with gltf-transform, geometry unchanged"
        ],
        "checkedAt": "2026-11-01T16:40:00Z"
      },
      "sourcePath": "public/aura-assets/pipsBee.06fd8133.glb",
      "outputPath": "public/aura-assets/pipsBee.06fd8133.glb",
      "license": "CC0-1.0",
      "author": "quaternius",
      "boundsMetadata": {
        "min": [
          -1.434,
          0.006,
          -0.674
        ],
        "max": [
          1.434,
          1.877,
          0.799
        ],
        "size": [
          2.867,
          1.871,
          1.473
        ],
        "center": [
          0,
          0.942,
          0.062
        ],
        "maxDimension": 2.867,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Main",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Main_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Wings",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Teeth",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Tongue",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Eyes",
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
        "Mouth",
        "Body",
        "Head3",
        "Head2",
        "Wing2.L",
        "Wing1.L",
        "Wing2.R",
        "Wing1.R",
        "Head",
        "Bee",
        "MonsterArmature"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsBee.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "suitabilityReason": "flying felt-garden bee decor (replaces the hawk drone)"
    },
  },
  "pipsBouncer": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsBouncer.c5ecdc43.glb",
    hash: "sha256-c5ecdc43c96e7c2e85d8cadab470677874e6388cb1692b48f4589ab8aebfbbda",
    bounds: [
      2.208,
      1.936,
      2.208
    ],
    sizeBytes: 31400,
    metadata: {
      "materials": [
        "Metal",
        "Red"
      ],
      "animations": [
        "Bouncer_Bounce",
        "Bouncer_Idle"
      ],
      // NOTE(typegen skew): the current typegen emits animationClips as {name,duration,channelCount}
      // objects, but `AuraAssetMetadata` declares `readonly string[]`; kept in the declared shape
      // (full clip records remain under `animationMetadata.clips`).
      "animationClips": [
        "Bouncer_Bounce",
        "Bouncer_Idle"
      ],
      "animationMetadata": {
        "clipCount": 2,
        "clips": [
          {
            "index": 0,
            "name": "Bouncer_Bounce",
            "channelCount": 2,
            "samplerCount": 2,
            "targetPaths": [
              "translation",
              "rotation"
            ],
            "targetNodes": [
              "Top"
            ],
            "duration": 0.9583333134651184,
            "hasRootMotionCandidate": false,
            "frameRate": 23.999999284744284
          },
          {
            "index": 1,
            "name": "Bouncer_Idle",
            "channelCount": 2,
            "samplerCount": 2,
            "targetPaths": [
              "translation",
              "rotation"
            ],
            "targetNodes": [
              "Top"
            ],
            "duration": 1.25,
            "hasRootMotionCandidate": false,
            "frameRate": 23.999999284744284
          }
        ],
        "messages": [
          "Detected 2 embedded animation clips."
        ]
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 1,
        "jointCount": 2,
        "skins": [
          {
            "index": 0,
            "name": "BouncerArmature",
            "jointCount": 2,
            "joints": [
              "Root",
              "Top"
            ]
          }
        ],
        "messages": [
          "Detected 1 skin with 2 unique joints."
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
        "meshCount": 1,
        "materialCount": 2,
        "textureCount": 0,
        "animationClipCount": 2,
        "skinCount": 1,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "BouncerArmature"
        ],
        "maxDepth": 3,
        "messages": [
          "Detected 4 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pipsBouncer.c5ecdc43.glb",
        "sourcePage": "https://github.com/gchahal1982/aura3d-cc0-assets/tree/main/quaternius/ultimate-platformer-pack",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "quaternius",
        "sourceFamily": "quaternius",
        "retrievedAt": "2026-11-01T16:40:00Z",
        "evidence": [
          "catalog source id quaternius:ultimate-platformer-pack:Bouncer (cc0-claims pips-big-leap); external textures embedded with gltf-transform, geometry unchanged"
        ],
        "checkedAt": "2026-11-01T16:40:00Z"
      },
      "sourcePath": "public/aura-assets/pipsBouncer.c5ecdc43.glb",
      "outputPath": "public/aura-assets/pipsBouncer.c5ecdc43.glb",
      "license": "CC0-1.0",
      "author": "quaternius",
      "boundsMetadata": {
        "min": [
          -1.104,
          -0.003,
          -1.104
        ],
        "max": [
          1.104,
          1.932,
          1.104
        ],
        "size": [
          2.208,
          1.936,
          2.208
        ],
        "center": [
          0,
          0.965,
          0
        ],
        "maxDimension": 2.208,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Metal",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Red",
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
        "Top",
        "Root",
        "Bouncer",
        "BouncerArmature"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsBouncer.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "spring bouncer pad"
    },
  },
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
      // NOTE(typegen skew): the current typegen emits animationClips as {name,duration,channelCount}
      // objects, but `AuraAssetMetadata` declares `readonly string[]`; kept in the declared shape
      // (full clip records remain under `animationMetadata.clips`).
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
          -0.008,
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
  "pipsColumn": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsColumn.cd8f72cf.glb",
    hash: "sha256-cd8f72cf5ac7323f040847d5f5b6491bb247411725395dae063ab93a2c078a95",
    bounds: [
      1.017,
      3.508,
      1.017
    ],
    sizeBytes: 341488,
    metadata: {
      "materials": [
        "Atlas_01_Mat",
        "Atlas_01_Trans_Mat"
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
        "materialCount": 2,
        "textureCount": 2,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Column_Regular"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pipsColumn.cd8f72cf.glb",
        "sourcePage": "https://github.com/ToxSam/cc0-models-Polygonal-Mind/tree/main/projects/crystal-crossroads",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Polygonal Mind",
        "sourceFamily": "os3a",
        "retrievedAt": "2026-11-01T19:15:00Z",
        "evidence": [
          "catalog source id os3a:crystal-crossroads-002 (cc0-claims pips-big-leap); black inverted-hull outline primitive removed with gltf-transform, column geometry unchanged"
        ],
        "checkedAt": "2026-11-01T19:15:00Z"
      },
      "sourcePath": "public/aura-assets/pipsColumn.cd8f72cf.glb",
      "outputPath": "public/aura-assets/pipsColumn.cd8f72cf.glb",
      "license": "CC0-1.0",
      "author": "Polygonal Mind",
      "boundsMetadata": {
        "min": [
          -0.512,
          0,
          -0.509
        ],
        "max": [
          0.506,
          3.508,
          0.509
        ],
        "size": [
          1.017,
          3.508,
          1.017
        ],
        "center": [
          -0.003,
          1.754,
          0
        ],
        "maxDimension": 3.508,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Atlas_01_Mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "Atlas_01_Trans_Mat",
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
        "Column_Regular"
      ],
      "textures": [
        "Atlas_01_Albedo",
        "Atlas_01_Trans"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsColumn.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "suitabilityReason": "stone column decor (w4, w5)"
    },
  },
  "pipsCrate": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsCrate.6f618c17.glb",
    hash: "sha256-6f618c17e8f856fc70a5b60c36b782efeda06b4fc1f7ce8ff6337e97c15f243e",
    bounds: [
      0.5,
      0.5,
      0.5
    ],
    sizeBytes: 25120,
    metadata: {
      "materials": [
        "colormap"
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
          "crate"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pipsCrate.6f618c17.glb",
        "sourcePage": "https://github.com/gchahal1982/aura3d-cc0-assets/tree/main/kenney/platformer-kit",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "kenney",
        "sourceFamily": "kenney",
        "retrievedAt": "2026-11-01T16:40:00Z",
        "evidence": [
          "catalog source id kenney:platformer-kit:crate (cc0-claims pips-big-leap); external textures embedded with gltf-transform, geometry unchanged"
        ],
        "checkedAt": "2026-11-01T16:40:00Z"
      },
      "sourcePath": "public/aura-assets/pipsCrate.6f618c17.glb",
      "outputPath": "public/aura-assets/pipsCrate.6f618c17.glb",
      "license": "CC0-1.0",
      "author": "kenney",
      "boundsMetadata": {
        "min": [
          -0.25,
          0,
          -0.25
        ],
        "max": [
          0.25,
          0.5,
          0.25
        ],
        "size": [
          0.5,
          0.5,
          0.5
        ],
        "center": [
          0,
          0.25,
          0
        ],
        "maxDimension": 0.5,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "colormap",
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
        "crate"
      ],
      "textures": [
        "colormap"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsCrate.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "suitabilityReason": "crate decor"
    },
  },
  "pipsCrystal": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsCrystal.2b66b33c.glb",
    hash: "sha256-2b66b33c77e007a5c790381ed2cd1e96fa8de754cd5472e4650a81945c796cf1",
    bounds: [
      1.055,
      4.723,
      1.684
    ],
    sizeBytes: 123428,
    metadata: {
      "materials": [
        "Atlas_01_Mat"
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
          "Crystal_Small_01"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pipsCrystal.2b66b33c.glb",
        "sourcePage": "https://github.com/ToxSam/cc0-models-Polygonal-Mind/tree/main/projects/crystal-crossroads",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Polygonal Mind",
        "sourceFamily": "os3a",
        "retrievedAt": "2026-11-01T16:40:00Z",
        "evidence": [
          "catalog source id os3a:crystal-crossroads-007 (cc0-claims pips-big-leap); black inverted-hull outline primitive removed with gltf-transform, crystal geometry unchanged"
        ],
        "checkedAt": "2026-11-01T16:40:00Z"
      },
      "sourcePath": "public/aura-assets/pipsCrystal.2b66b33c.glb",
      "outputPath": "public/aura-assets/pipsCrystal.2b66b33c.glb",
      "license": "CC0-1.0",
      "author": "Polygonal Mind",
      "boundsMetadata": {
        "min": [
          -0.528,
          -0.012,
          -0.842
        ],
        "max": [
          0.528,
          4.711,
          0.842
        ],
        "size": [
          1.055,
          4.723,
          1.684
        ],
        "center": [
          0,
          2.35,
          0
        ],
        "maxDimension": 4.723,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Atlas_01_Mat",
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
        "Crystal_Small_01"
      ],
      "textures": [
        "Atlas_01_Albedo"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsCrystal.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "suitabilityReason": "crystal shard decor and hazard dressing"
    },
  },
  "pipsEmberPot": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsEmberPot.a54ea058.glb",
    hash: "sha256-a54ea058ae2c2ba50d5f533b4c4c8d26dd1c8ace72d37d4c0f6b7156621f4848",
    bounds: [
      0.6,
      0.431,
      0.406
    ],
    sizeBytes: 37072,
    metadata: {
      "materials": [
        "colormap"
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
          "pot"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pipsEmberPot.a54ea058.glb",
        "sourcePage": "https://github.com/gchahal1982/aura3d-cc0-assets/tree/main/kenney/mini-dungeon",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "kenney",
        "sourceFamily": "kenney",
        "retrievedAt": "2026-11-01T16:40:00Z",
        "evidence": [
          "catalog source id kenney:mini-dungeon:pot (cc0-claims pips-big-leap); external colormap embedded with gltf-transform, geometry unchanged"
        ],
        "checkedAt": "2026-11-01T16:40:00Z"
      },
      "sourcePath": "public/aura-assets/pipsEmberPot.a54ea058.glb",
      "outputPath": "public/aura-assets/pipsEmberPot.a54ea058.glb",
      "license": "CC0-1.0",
      "author": "kenney",
      "boundsMetadata": {
        "min": [
          -0.3,
          0,
          -0.203
        ],
        "max": [
          0.3,
          0.431,
          0.203
        ],
        "size": [
          0.6,
          0.431,
          0.406
        ],
        "center": [
          0,
          0.215,
          0
        ],
        "maxDimension": 0.6,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "colormap",
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
        "pot"
      ],
      "textures": [
        "colormap"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsEmberPot.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "suitabilityReason": "clay ember pot: lava vents and lava hazard dressing"
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
          -0.503,
          -0.949,
          -0.504
        ],
        "max": [
          0.498,
          0.946,
          0.498
        ],
        "size": [
          1.001,
          1.895,
          1.002
        ],
        "center": [
          -0.003,
          -0.002,
          -0.003
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
  "pipsHeart": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsHeart.367cbe56.glb",
    hash: "sha256-367cbe562e7bdceb3a53a7445fae27c878c2c3b09d6604ae234454e890d50ec7",
    bounds: [
      1.48,
      1.242,
      0.754
    ],
    sizeBytes: 11348,
    metadata: {
      "materials": [
        "Red"
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
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Heart"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pipsHeart.367cbe56.glb",
        "sourcePage": "https://github.com/gchahal1982/aura3d-cc0-assets/tree/main/quaternius/ultimate-platformer-pack",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "quaternius",
        "sourceFamily": "quaternius",
        "retrievedAt": "2026-11-01T16:40:00Z",
        "evidence": [
          "catalog source id quaternius:ultimate-platformer-pack:Heart (cc0-claims pips-big-leap); external textures embedded with gltf-transform, geometry unchanged"
        ],
        "checkedAt": "2026-11-01T16:40:00Z"
      },
      "sourcePath": "public/aura-assets/pipsHeart.367cbe56.glb",
      "outputPath": "public/aura-assets/pipsHeart.367cbe56.glb",
      "license": "CC0-1.0",
      "author": "quaternius",
      "boundsMetadata": {
        "min": [
          -0.74,
          -0.57,
          -0.377
        ],
        "max": [
          0.74,
          0.672,
          0.377
        ],
        "size": [
          1.48,
          1.242,
          0.754
        ],
        "center": [
          0,
          0.051,
          0
        ],
        "maxDimension": 1.48,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "Red",
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
        "Heart"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsHeart.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "heart pickup and gate lock"
    },
  },
  "pipsLantern": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsLantern.6e5c4795.glb",
    hash: "sha256-6e5c47955293a13f46c4a63e532f840ad0456427e7d8065b44073be88f90366d",
    bounds: [
      0.216,
      1.556,
      0.224
    ],
    sizeBytes: 25880,
    metadata: {
      "materials": [
        "colormap"
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
          "lantern"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pipsLantern.6e5c4795.glb",
        "sourcePage": "https://github.com/gchahal1982/aura3d-cc0-assets/tree/main/kenney/fantasy-town-kit",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "kenney",
        "sourceFamily": "kenney",
        "retrievedAt": "2026-11-01T16:40:00Z",
        "evidence": [
          "catalog source id kenney:fantasy-town-kit:lantern (cc0-claims pips-big-leap); external textures embedded with gltf-transform, geometry unchanged"
        ],
        "checkedAt": "2026-11-01T16:40:00Z"
      },
      "sourcePath": "public/aura-assets/pipsLantern.6e5c4795.glb",
      "outputPath": "public/aura-assets/pipsLantern.6e5c4795.glb",
      "license": "CC0-1.0",
      "author": "kenney",
      "boundsMetadata": {
        "min": [
          -0.108,
          0,
          -0.112
        ],
        "max": [
          0.108,
          1.556,
          0.112
        ],
        "size": [
          0.216,
          1.556,
          0.224
        ],
        "center": [
          0,
          0.778,
          0
        ],
        "maxDimension": 1.556,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "colormap",
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
        "lantern"
      ],
      "textures": [
        "colormap"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsLantern.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "suitabilityReason": "lantern post decor"
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
      // NOTE(typegen skew): the current typegen emits animationClips as {name,duration,channelCount}
      // objects, but `AuraAssetMetadata` declares `readonly string[]`; kept in the declared shape
      // (full clip records remain under `animationMetadata.clips`).
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
  "pipsSidekick": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsSidekick.dfb775ec.glb",
    hash: "sha256-dfb775ec22bda6992341a238af18861f796df9c9b693508c158db0f8db932d5a",
    bounds: [
      1.6,
      2.7,
      0.8
    ],
    sizeBytes: 103192,
    metadata: {
      "materials": [
        "texture-e"
      ],
      "animations": [
        "static",
        "idle",
        "walk",
        "sprint",
        "sit",
        "drive",
        "die",
        "pick-up",
        "emote-yes",
        "emote-no",
        "holding-right",
        "holding-left",
        "holding-both",
        "holding-right-shoot",
        "holding-left-shoot",
        "holding-both-shoot",
        "attack-melee-right",
        "attack-melee-left",
        "attack-kick-right",
        "attack-kick-left",
        "interact-right",
        "interact-left",
        "wheelchair-sit",
        "wheelchair-move-forward",
        "wheelchair-move-back",
        "wheelchair-move-left",
        "wheelchair-move-right"
      ],
      // NOTE(typegen skew): the current typegen emits animationClips as {name,duration,channelCount}
      // objects, but `AuraAssetMetadata` declares `readonly string[]`; kept in the declared shape
      // (full clip records remain under `animationMetadata.clips`).
      "animationClips": [
        "static",
        "idle",
        "walk",
        "sprint",
        "sit",
        "drive",
        "die",
        "pick-up",
        "emote-yes",
        "emote-no",
        "holding-right",
        "holding-left",
        "holding-both",
        "holding-right-shoot",
        "holding-left-shoot",
        "holding-both-shoot",
        "attack-melee-right",
        "attack-melee-left",
        "attack-kick-right",
        "attack-kick-left",
        "interact-right",
        "interact-left",
        "wheelchair-sit",
        "wheelchair-move-forward",
        "wheelchair-move-back",
        "wheelchair-move-left",
        "wheelchair-move-right"
      ],
      "animationMetadata": {
        "clipCount": 27,
        "clips": [
          {
            "index": 0,
            "name": "static",
            "channelCount": 21,
            "samplerCount": 21,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "root",
              "leg-left",
              "leg-right",
              "torso",
              "arm-left",
              "arm-right",
              "head"
            ],
            "duration": 0.10000000149011612,
            "hasRootMotionCandidate": false,
            "frameRate": 9.99999985098839
          },
          {
            "index": 1,
            "name": "idle",
            "channelCount": 4,
            "samplerCount": 4,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "torso",
              "arm-left",
              "arm-right",
              "head"
            ],
            "duration": 1.3333333730697632,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "walk",
            "channelCount": 6,
            "samplerCount": 6,
            "targetPaths": [
              "translation",
              "rotation"
            ],
            "targetNodes": [
              "root",
              "leg-left",
              "leg-right",
              "arm-left",
              "arm-right",
              "head"
            ],
            "duration": 0.6666666865348816,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "sprint",
            "channelCount": 7,
            "samplerCount": 7,
            "targetPaths": [
              "translation",
              "rotation"
            ],
            "targetNodes": [
              "root",
              "leg-left",
              "leg-right",
              "torso",
              "head",
              "arm-right",
              "arm-left"
            ],
            "duration": 0.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 4,
            "name": "sit",
            "channelCount": 3,
            "samplerCount": 3,
            "targetPaths": [
              "translation",
              "rotation"
            ],
            "targetNodes": [
              "root",
              "leg-left",
              "leg-right"
            ],
            "duration": 0.1666666716337204,
            "hasRootMotionCandidate": false,
            "frameRate": 5.999999821186071
          },
          {
            "index": 5,
            "name": "drive",
            "channelCount": 5,
            "samplerCount": 5,
            "targetPaths": [
              "translation",
              "rotation"
            ],
            "targetNodes": [
              "root",
              "leg-left",
              "leg-right",
              "arm-left",
              "arm-right"
            ],
            "duration": 0.1666666716337204,
            "hasRootMotionCandidate": false,
            "frameRate": 5.999999821186071
          },
          {
            "index": 6,
            "name": "die",
            "channelCount": 8,
            "samplerCount": 8,
            "targetPaths": [
              "translation",
              "rotation"
            ],
            "targetNodes": [
              "root",
              "leg-left",
              "leg-right",
              "torso",
              "arm-left",
              "arm-right",
              "head"
            ],
            "duration": 0.3333333432674408,
            "hasRootMotionCandidate": false,
            "frameRate": 29.999998435378156
          },
          {
            "index": 7,
            "name": "pick-up",
            "channelCount": 4,
            "samplerCount": 4,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "torso",
              "arm-left",
              "arm-right",
              "head"
            ],
            "duration": 0.3333333432674408,
            "hasRootMotionCandidate": false,
            "frameRate": 29.999998435378156
          },
          {
            "index": 8,
            "name": "emote-yes",
            "channelCount": 4,
            "samplerCount": 4,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "head",
              "torso",
              "arm-right",
              "arm-left"
            ],
            "duration": 0.6666666865348816,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 9,
            "name": "emote-no",
            "channelCount": 4,
            "samplerCount": 4,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "torso",
              "arm-right",
              "arm-left",
              "head"
            ],
            "duration": 0.6666666865348816,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 10,
            "name": "holding-right",
            "channelCount": 1,
            "samplerCount": 1,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "arm-right"
            ],
            "duration": 0.1666666716337204,
            "hasRootMotionCandidate": false,
            "frameRate": 5.999999821186071
          },
          {
            "index": 11,
            "name": "holding-left",
            "channelCount": 1,
            "samplerCount": 1,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "arm-left"
            ],
            "duration": 0.1666666716337204,
            "hasRootMotionCandidate": false,
            "frameRate": 5.999999821186071
          },
          {
            "index": 12,
            "name": "holding-both",
            "channelCount": 2,
            "samplerCount": 2,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "arm-left",
              "arm-right"
            ],
            "duration": 0.1666666716337204,
            "hasRootMotionCandidate": false,
            "frameRate": 5.999999821186071
          },
          {
            "index": 13,
            "name": "holding-right-shoot",
            "channelCount": 3,
            "samplerCount": 3,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "torso",
              "arm-right",
              "head"
            ],
            "duration": 0.20000000298023224,
            "hasRootMotionCandidate": false,
            "frameRate": 29.999998435378156
          },
          {
            "index": 14,
            "name": "holding-left-shoot",
            "channelCount": 3,
            "samplerCount": 3,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "torso",
              "head",
              "arm-left"
            ],
            "duration": 0.20000000298023224,
            "hasRootMotionCandidate": false,
            "frameRate": 29.999998435378156
          },
          {
            "index": 15,
            "name": "holding-both-shoot",
            "channelCount": 4,
            "samplerCount": 4,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "torso",
              "arm-right",
              "head",
              "arm-left"
            ],
            "duration": 0.20000000298023224,
            "hasRootMotionCandidate": false,
            "frameRate": 29.999998435378156
          },
          {
            "index": 16,
            "name": "attack-melee-right",
            "channelCount": 7,
            "samplerCount": 7,
            "targetPaths": [
              "translation",
              "rotation"
            ],
            "targetNodes": [
              "root",
              "leg-right",
              "torso",
              "leg-left",
              "arm-left",
              "arm-right",
              "head"
            ],
            "duration": 0.4166666567325592,
            "hasRootMotionCandidate": false,
            "frameRate": 31.20000185966503
          },
          {
            "index": 17,
            "name": "attack-melee-left",
            "channelCount": 7,
            "samplerCount": 7,
            "targetPaths": [
              "translation",
              "rotation"
            ],
            "targetNodes": [
              "root",
              "torso",
              "head",
              "arm-left",
              "arm-right",
              "leg-left",
              "leg-right"
            ],
            "duration": 0.4166666567325592,
            "hasRootMotionCandidate": false,
            "frameRate": 31.20000185966503
          },
          {
            "index": 18,
            "name": "attack-kick-right",
            "channelCount": 7,
            "samplerCount": 7,
            "targetPaths": [
              "rotation",
              "translation"
            ],
            "targetNodes": [
              "torso",
              "leg-right",
              "arm-left",
              "arm-right",
              "root",
              "leg-left",
              "head"
            ],
            "duration": 0.5833333134651184,
            "hasRootMotionCandidate": false,
            "frameRate": 30.857147061095517
          },
          {
            "index": 19,
            "name": "attack-kick-left",
            "channelCount": 7,
            "samplerCount": 7,
            "targetPaths": [
              "rotation",
              "translation"
            ],
            "targetNodes": [
              "torso",
              "root",
              "head",
              "arm-left",
              "arm-right",
              "leg-left",
              "leg-right"
            ],
            "duration": 0.5833333134651184,
            "hasRootMotionCandidate": false,
            "frameRate": 30.857147061095517
          },
          {
            "index": 20,
            "name": "interact-right",
            "channelCount": 4,
            "samplerCount": 4,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "torso",
              "head",
              "arm-left",
              "arm-right"
            ],
            "duration": 0.6666666865348816,
            "hasRootMotionCandidate": false,
            "frameRate": 29.999998435378156
          },
          {
            "index": 21,
            "name": "interact-left",
            "channelCount": 4,
            "samplerCount": 4,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "torso",
              "head",
              "arm-left",
              "arm-right"
            ],
            "duration": 0.6666666865348816,
            "hasRootMotionCandidate": false,
            "frameRate": 29.999998435378156
          },
          {
            "index": 22,
            "name": "wheelchair-sit",
            "channelCount": 4,
            "samplerCount": 4,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "leg-left",
              "leg-right",
              "arm-left",
              "arm-right"
            ],
            "duration": 0.1666666716337204,
            "hasRootMotionCandidate": false,
            "frameRate": 5.999999821186071
          },
          {
            "index": 23,
            "name": "wheelchair-move-forward",
            "channelCount": 6,
            "samplerCount": 6,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "leg-left",
              "leg-right",
              "torso",
              "head",
              "arm-left",
              "arm-right"
            ],
            "duration": 0.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 24,
            "name": "wheelchair-move-back",
            "channelCount": 6,
            "samplerCount": 6,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "leg-left",
              "leg-right",
              "torso",
              "arm-left",
              "arm-right",
              "head"
            ],
            "duration": 0.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 25,
            "name": "wheelchair-move-left",
            "channelCount": 6,
            "samplerCount": 6,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "leg-left",
              "leg-right",
              "torso",
              "arm-right",
              "arm-left",
              "head"
            ],
            "duration": 0.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 26,
            "name": "wheelchair-move-right",
            "channelCount": 6,
            "samplerCount": 6,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "leg-left",
              "leg-right",
              "torso",
              "arm-left",
              "arm-right",
              "head"
            ],
            "duration": 0.5,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          }
        ],
        "messages": [
          "Detected 27 embedded animation clips."
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
        "nodeCount": 8,
        "meshCount": 6,
        "materialCount": 1,
        "textureCount": 1,
        "animationClipCount": 27,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "character-e"
        ],
        "maxDepth": 4,
        "messages": [
          "Detected 8 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pipsSidekick.dfb775ec.glb",
        "sourcePage": "https://github.com/gchahal1982/aura3d-cc0-assets/tree/main/kenney/blocky-characters",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "kenney",
        "sourceFamily": "kenney",
        "retrievedAt": "2026-11-01T16:40:00Z",
        "evidence": [
          "catalog source id kenney:blocky-characters:character-e (cc0-claims pips-big-leap); external textures embedded with gltf-transform, geometry unchanged"
        ],
        "checkedAt": "2026-11-01T16:40:00Z"
      },
      "sourcePath": "public/aura-assets/pipsSidekick.dfb775ec.glb",
      "outputPath": "public/aura-assets/pipsSidekick.dfb775ec.glb",
      "license": "CC0-1.0",
      "author": "kenney",
      "boundsMetadata": {
        "min": [
          -0.8,
          0,
          -0.4
        ],
        "max": [
          0.8,
          2.7,
          0.4
        ],
        "size": [
          1.6,
          2.7,
          0.8
        ],
        "center": [
          0,
          1.35,
          0
        ],
        "maxDimension": 2.7,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "texture-e",
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
        "character-e",
        "root",
        "leg-left",
        "leg-right",
        "torso",
        "arm-left",
        "arm-right",
        "head"
      ],
      "textures": [
        "texture-e"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsSidekick.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "suitabilityReason": "sidekick NPC (original look)"
    },
  },
  "pipsStar": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsStar.60bd72b9.glb",
    hash: "sha256-60bd72b90b919b77afd75895c81f7d65f9411a3d71d26fc703ec756dfd10d08e",
    bounds: [
      1.511,
      1.438,
      0.688
    ],
    sizeBytes: 11084,
    metadata: {
      "materials": [
        "Gold"
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
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Star"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pipsStar.60bd72b9.glb",
        "sourcePage": "https://github.com/gchahal1982/aura3d-cc0-assets/tree/main/quaternius/ultimate-platformer-pack",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "quaternius",
        "sourceFamily": "quaternius",
        "retrievedAt": "2026-11-01T16:40:00Z",
        "evidence": [
          "catalog source id quaternius:ultimate-platformer-pack:Star (cc0-claims pips-big-leap); external textures embedded with gltf-transform, geometry unchanged"
        ],
        "checkedAt": "2026-11-01T16:40:00Z"
      },
      "sourcePath": "public/aura-assets/pipsStar.60bd72b9.glb",
      "outputPath": "public/aura-assets/pipsStar.60bd72b9.glb",
      "license": "CC0-1.0",
      "author": "quaternius",
      "boundsMetadata": {
        "min": [
          -0.755,
          -0.644,
          -0.344
        ],
        "max": [
          0.755,
          0.794,
          0.344
        ],
        "size": [
          1.511,
          1.438,
          0.688
        ],
        "center": [
          0,
          0.075,
          0
        ],
        "maxDimension": 1.511,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "Gold",
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
        "Star"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsStar.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "suitabilityReason": "star decor"
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
          -0.635,
          -0.952,
          -0.207
        ],
        "max": [
          0.632,
          0.946,
          0.202
        ],
        "size": [
          1.267,
          1.898,
          0.409
        ],
        "center": [
          -0.002,
          -0.003,
          -0.002
        ],
        "maxDimension": 1.898,
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
          -0.45,
          -0.42
        ],
        "max": [
          0.947,
          0.454,
          0.417
        ],
        "size": [
          1.898,
          0.904,
          0.837
        ],
        "center": [
          -0.002,
          0.002,
          -0.002
        ],
        "maxDimension": 1.898,
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
  "pipsTileMossDisc": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsTileMossDisc.ead348fe.glb",
    hash: "sha256-ead348fe89d29896dc0ac6d4ae26c03c2116e5068873000a45f98c549e1728f6",
    bounds: [
      1.901,
      0.323,
      1.894
    ],
    sizeBytes: 1093324,
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
        "sourcePath": "public/aura-assets/pipsTileMossDisc.ead348fe.glb",
        "sourcePage": "artifacts/gu47-meshy/pips-big-leap/leapTileMossDisc",
        "license": "LicenseRef-Meshy-Generated",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "author": "AuraOne (Meshy text-to-3d)",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-30T09:01:00.220Z",
        "evidence": [
          "GU47 WP-36 row leapTileMossDisc, Meshy refine task 01a18c09-53a3-7294-bcac-b3f8de55a680, optimised opt/model.glb"
        ],
        "checkedAt": "2026-10-30T09:01:00.220Z"
      },
      "sourcePath": "public/aura-assets/pipsTileMossDisc.ead348fe.glb",
      "outputPath": "public/aura-assets/pipsTileMossDisc.ead348fe.glb",
      "license": "LicenseRef-Meshy-Generated",
      "author": "AuraOne (Meshy text-to-3d)",
      "boundsMetadata": {
        "min": [
          -0.951,
          -0.161,
          -0.948
        ],
        "max": [
          0.951,
          0.162,
          0.946
        ],
        "size": [
          1.901,
          0.323,
          1.894
        ],
        "center": [
          0,
          0,
          -0.001
        ],
        "maxDimension": 1.901,
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
      "thumbnailUrl": "/aura-assets/pipsTileMossDisc.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "moss-felt clay disc tile: spring base and checkpoint pad"
    },
  },
  "pipsWindmill": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsWindmill.057181dd.glb",
    hash: "sha256-057181dde02f04234fc1481be0ff8df84a614caeaba36d87faa789b34802489a",
    bounds: [
      0.471,
      3.113,
      3.113
    ],
    sizeBytes: 81952,
    metadata: {
      "materials": [
        "colormap"
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
          "windmill"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pipsWindmill.057181dd.glb",
        "sourcePage": "https://github.com/gchahal1982/aura3d-cc0-assets/tree/main/kenney/fantasy-town-kit",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "kenney",
        "sourceFamily": "kenney",
        "retrievedAt": "2026-11-01T16:40:00Z",
        "evidence": [
          "catalog source id kenney:fantasy-town-kit:windmill (cc0-claims pips-big-leap); external textures embedded with gltf-transform, geometry unchanged"
        ],
        "checkedAt": "2026-11-01T16:40:00Z"
      },
      "sourcePath": "public/aura-assets/pipsWindmill.057181dd.glb",
      "outputPath": "public/aura-assets/pipsWindmill.057181dd.glb",
      "license": "CC0-1.0",
      "author": "kenney",
      "boundsMetadata": {
        "min": [
          -0.235,
          -1.557,
          -1.557
        ],
        "max": [
          0.235,
          1.557,
          1.557
        ],
        "size": [
          0.471,
          3.113,
          3.113
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 3.113,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "colormap",
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
        "windmill"
      ],
      "textures": [
        "colormap"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsWindmill.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "suitabilityReason": "windmill decor"
    },
  },
  "pipsWindTurbine": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsWindTurbine.6d108da5.glb",
    hash: "sha256-6d108da5e70069f8173a78c1f66989b4b767ffcb1ce3d1711a4a086b3e7fb10b",
    bounds: [
      0.605,
      2.314,
      1.127
    ],
    sizeBytes: 57396,
    metadata: {
      "materials": [
        "colormap"
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
        "meshCount": 2,
        "materialCount": 1,
        "textureCount": 1,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "windmill"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 2 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pipsWindTurbine.6d108da5.glb",
        "sourcePage": "https://github.com/gchahal1982/aura3d-cc0-assets/tree/main/kenney/city-kit-industrial",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "kenney",
        "sourceFamily": "kenney",
        "retrievedAt": "2026-11-01T16:40:00Z",
        "evidence": [
          "catalog source id kenney:city-kit-industrial:windmill (cc0-claims pips-big-leap); external textures embedded with gltf-transform, geometry unchanged"
        ],
        "checkedAt": "2026-11-01T16:40:00Z"
      },
      "sourcePath": "public/aura-assets/pipsWindTurbine.6d108da5.glb",
      "outputPath": "public/aura-assets/pipsWindTurbine.6d108da5.glb",
      "license": "CC0-1.0",
      "author": "kenney",
      "boundsMetadata": {
        "min": [
          -0.315,
          0,
          -0.567
        ],
        "max": [
          0.289,
          2.314,
          0.56
        ],
        "size": [
          0.605,
          2.314,
          1.127
        ],
        "center": [
          -0.013,
          1.157,
          -0.003
        ],
        "maxDimension": 2.314,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "colormap",
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
        "windmill",
        "blades"
      ],
      "textures": [
        "colormap"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsWindTurbine.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "suitabilityReason": "updraft fan decor"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
