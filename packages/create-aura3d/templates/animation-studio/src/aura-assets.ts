import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "luma": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "miko": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "moonGarden": AuraAssetDefinition & { readonly type: "model"; readonly format: "gltf"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "luma": {
    type: "model",
    format: "glb",
    url: "/aura-assets/luma2.catalog.glb",
    hash: "sha256-911c60a074f6d89d0eaeefc1f1eecf4188873880b62aa11b3d02ec2c18a4e036",
    bounds: [
      0.99,
      1.95,
      0.333
    ],
    sizeBytes: 1980724,
    metadata: {
      "materials": [
        "luma_body_mat",
        "luma_dark_mat",
        "luma_glow_mat",
        "luma_skin_mat",
        "luma_accent_mat"
      ],
      "animations": [
        "Idle",
        "Wave",
        "Walk",
        "Talk"
      ],
      "animationClips": [
        "Idle",
        "Wave",
        "Walk",
        "Talk"
      ],
      "animationMetadata": {
        "clipCount": 4,
        "clips": [
          {
            "index": 0,
            "name": "Idle",
            "channelCount": 2,
            "samplerCount": 2,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "spine",
              "head"
            ]
          },
          {
            "index": 1,
            "name": "Wave",
            "channelCount": 3,
            "samplerCount": 3,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "rightUpperArm",
              "spine",
              "rightLowerArm"
            ]
          },
          {
            "index": 2,
            "name": "Walk",
            "channelCount": 5,
            "samplerCount": 5,
            "targetPaths": [
              "rotation",
              "translation"
            ],
            "targetNodes": [
              "leftUpperLeg",
              "rightUpperLeg",
              "leftUpperArm",
              "rightUpperArm",
              "hips"
            ]
          },
          {
            "index": 3,
            "name": "Talk",
            "channelCount": 4,
            "samplerCount": 4,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "head",
              "spine",
              "leftLowerArm",
              "rightLowerArm"
            ]
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
        "jointCount": 21,
        "skins": [
          {
            "index": 0,
            "name": "luma_skin",
            "jointCount": 21,
            "joints": [
              "hips",
              "spine",
              "chest",
              "neck",
              "head",
              "leftShoulder",
              "leftUpperArm",
              "leftLowerArm",
              "leftHand",
              "rightShoulder",
              "rightUpperArm",
              "rightLowerArm",
              "rightHand",
              "leftUpperLeg",
              "leftLowerLeg",
              "leftFoot",
              "leftToes",
              "rightUpperLeg",
              "rightLowerLeg",
              "rightFoot",
              "rightToes"
            ],
            "skeleton": "hips"
          }
        ],
        "messages": [
          "Detected 1 skin with 21 unique joints."
        ]
      },
      "morphTargets": {
        "targetCount": 1,
        "targetNames": [
          "mouthOpen"
        ],
        "meshes": [
          {
            "index": 0,
            "name": "luma_body",
            "targetNames": [
              "mouthOpen"
            ]
          }
        ],
        "messages": [
          "Detected 1 morph target."
        ]
      },
      "provenance": {
        "license": "CC0-1.0",
        "author": "Aura3D",
        "sourceFamily": "Aura3D authored cast (build-characters.ts, CC0 procedural mascot)",
        "sourcePath": "public/aura-assets/luma2.catalog.glb",
        "sourceUrl": "https://aura3d.auraone.ai/aura-assets/luma2.catalog.glb",
        "attribution": "Aura3D-authored procedural rigged mascot \"Luma\" (CC0). Skinned 21-joint rig; embedded clips Idle, Wave, Walk, Talk. Lip-sync is driven by the facial mouth blendshape morph target (mouthOpen).",
        "evidence": [
          "animation-character",
          "rigged",
          "animated",
          "mouth blendshape morph",
          "facial morph target",
          "authored",
          "cc0"
        ],
        "sha256": "sha256-911c60a074f6d89d0eaeefc1f1eecf4188873880b62aa11b3d02ec2c18a4e036",
        "retrievedAt": "2026-06-07"
      },
      "sourcePath": "public/aura-assets/luma2.catalog.glb",
      "outputPath": "public/aura-assets/luma2.catalog.glb",
      "license": "CC0-1.0",
      "author": "Aura3D",
      "boundsMetadata": {
        "min": [
          -0.495,
          -0.065,
          -0.162
        ],
        "max": [
          0.495,
          1.885,
          0.171
        ],
        "size": [
          0.99,
          1.95,
          0.333
        ],
        "center": [
          0,
          0.91,
          0.004
        ],
        "maxDimension": 1.95,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "luma_body_mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "luma_dark_mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "luma_glow_mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "luma_skin_mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "luma_accent_mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        }
      ],
      "nodeNames": [
        "luma_mesh",
        "hips",
        "spine",
        "chest",
        "neck",
        "head",
        "leftShoulder",
        "leftUpperArm",
        "leftLowerArm",
        "leftHand",
        "rightShoulder",
        "rightUpperArm",
        "rightLowerArm",
        "rightHand",
        "leftUpperLeg",
        "leftLowerLeg",
        "leftFoot",
        "leftToes",
        "rightUpperLeg",
        "rightLowerLeg",
        "rightFoot",
        "rightToes"
      ],
      "textures": [
        "luma_atlas"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/luma.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "miko": {
    type: "model",
    format: "glb",
    url: "/aura-assets/miko.catalog.glb",
    hash: "sha256-fcdc2b7502031e556259dfe942fdfbd7abe41963433f2046ed2522d27bce9d65",
    bounds: [
      1.015,
      1.95,
      0.369
    ],
    sizeBytes: 1997240,
    metadata: {
      "materials": [
        "miko_body_mat",
        "miko_dark_mat",
        "miko_glow_mat",
        "miko_skin_mat",
        "miko_accent_mat"
      ],
      "animations": [
        "Idle",
        "Wave",
        "Walk",
        "Talk"
      ],
      "animationClips": [
        "Idle",
        "Wave",
        "Walk",
        "Talk"
      ],
      "animationMetadata": {
        "clipCount": 4,
        "clips": [
          {
            "index": 0,
            "name": "Idle",
            "channelCount": 2,
            "samplerCount": 2,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "spine",
              "head"
            ]
          },
          {
            "index": 1,
            "name": "Wave",
            "channelCount": 3,
            "samplerCount": 3,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "rightUpperArm",
              "spine",
              "rightLowerArm"
            ]
          },
          {
            "index": 2,
            "name": "Walk",
            "channelCount": 5,
            "samplerCount": 5,
            "targetPaths": [
              "rotation",
              "translation"
            ],
            "targetNodes": [
              "leftUpperLeg",
              "rightUpperLeg",
              "leftUpperArm",
              "rightUpperArm",
              "hips"
            ]
          },
          {
            "index": 3,
            "name": "Talk",
            "channelCount": 4,
            "samplerCount": 4,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "head",
              "spine",
              "leftLowerArm",
              "rightLowerArm"
            ]
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
        "jointCount": 21,
        "skins": [
          {
            "index": 0,
            "name": "miko_skin",
            "jointCount": 21,
            "joints": [
              "hips",
              "spine",
              "chest",
              "neck",
              "head",
              "leftShoulder",
              "leftUpperArm",
              "leftLowerArm",
              "leftHand",
              "rightShoulder",
              "rightUpperArm",
              "rightLowerArm",
              "rightHand",
              "leftUpperLeg",
              "leftLowerLeg",
              "leftFoot",
              "leftToes",
              "rightUpperLeg",
              "rightLowerLeg",
              "rightFoot",
              "rightToes"
            ],
            "skeleton": "hips"
          }
        ],
        "messages": [
          "Detected 1 skin with 21 unique joints."
        ]
      },
      "morphTargets": {
        "targetCount": 1,
        "targetNames": [
          "mouthOpen"
        ],
        "meshes": [
          {
            "index": 0,
            "name": "miko_body",
            "targetNames": [
              "mouthOpen"
            ]
          }
        ],
        "messages": [
          "Detected 1 morph target."
        ]
      },
      "provenance": {
        "license": "CC0-1.0",
        "author": "Aura3D",
        "sourceFamily": "Aura3D authored cast (build-characters.ts, CC0 procedural mascot)",
        "sourcePath": "public/aura-assets/miko.catalog.glb",
        "sourceUrl": "https://aura3d.auraone.ai/aura-assets/miko.catalog.glb",
        "attribution": "Aura3D-authored procedural rigged mascot \"Miko\" (CC0). Skinned 21-joint rig; embedded clips Idle, Wave, Walk, Talk. Lip-sync is driven by the facial mouth blendshape morph target (mouthOpen).",
        "evidence": [
          "animation-character",
          "rigged",
          "animated",
          "mouth blendshape morph",
          "facial morph target",
          "authored",
          "cc0"
        ],
        "sha256": "sha256-fcdc2b7502031e556259dfe942fdfbd7abe41963433f2046ed2522d27bce9d65",
        "retrievedAt": "2026-06-07"
      },
      "sourcePath": "public/aura-assets/miko.catalog.glb",
      "outputPath": "public/aura-assets/miko.catalog.glb",
      "license": "CC0-1.0",
      "author": "Aura3D",
      "boundsMetadata": {
        "min": [
          -0.508,
          -0.06,
          -0.175
        ],
        "max": [
          0.508,
          1.89,
          0.194
        ],
        "size": [
          1.015,
          1.95,
          0.369
        ],
        "center": [
          0,
          0.915,
          0.01
        ],
        "maxDimension": 1.95,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "miko_body_mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "miko_dark_mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "miko_glow_mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "miko_skin_mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "miko_accent_mat",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        }
      ],
      "nodeNames": [
        "miko_mesh",
        "hips",
        "spine",
        "chest",
        "neck",
        "head",
        "leftShoulder",
        "leftUpperArm",
        "leftLowerArm",
        "leftHand",
        "rightShoulder",
        "rightUpperArm",
        "rightLowerArm",
        "rightHand",
        "leftUpperLeg",
        "leftLowerLeg",
        "leftFoot",
        "leftToes",
        "rightUpperLeg",
        "rightLowerLeg",
        "rightFoot",
        "rightToes"
      ],
      "textures": [
        "miko_atlas"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/miko.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "moonGarden": {
    type: "model",
    format: "gltf",
    url: "/aura-assets/moonGarden.gltf",
    hash: "sha256-b7b50e37cc4319df21fa2a598aab9e055d54eeb3f5511a3b3f0d4f6c5101c456",
    bounds: [
      3.2,
      0.6,
      1.2
    ],
    sizeBytes: 3746,
    metadata: {
      "materials": [
        "soft blue moon path",
        "warm glow stone",
        "distant teal skyline"
      ],
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "provenance": {
        "license": "MIT",
        "author": "Aura3D",
        "sourceFamily": "Aura3D curated starter pack",
        "sourcePath": "public/aura-assets/moonGarden.gltf",
        "sourceUrl": "https://aura3d.auraone.ai/aura-assets/moonGarden.gltf",
        "attribution": "Bundled Aura3D Moon Garden starter set for local animation-studio validation.",
        "evidence": [
          "animation-set",
          "moon garden",
          "walkable set",
          "framing ready"
        ],
        "sha256": "sha256-b7b50e37cc4319df21fa2a598aab9e055d54eeb3f5511a3b3f0d4f6c5101c456"
      },
      "sourcePath": "public/aura-assets/moonGarden.gltf",
      "outputPath": "public/aura-assets/moonGarden.gltf",
      "license": "MIT",
      "author": "Aura3D",
      "boundsMetadata": {
        "min": [
          -1.6,
          0,
          -0.6
        ],
        "max": [
          1.6,
          0.6,
          0.6
        ],
        "size": [
          3.2,
          0.6,
          1.2
        ],
        "center": [
          0,
          0.3,
          0
        ],
        "maxDimension": 3.2,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "soft blue moon path",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "alphaMode": "OPAQUE",
          "reasons": []
        },
        {
          "name": "warm glow stone",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "alphaMode": "OPAQUE",
          "reasons": []
        },
        {
          "name": "distant teal skyline",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "alphaMode": "OPAQUE",
          "reasons": []
        }
      ],
      "nodeNames": [
        "moon garden floor anchor",
        "moon garden glow stone anchor",
        "moon garden skyline anchor"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/moonGarden.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
