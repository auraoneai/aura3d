import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "city-block": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "stylized-car": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "tree-grove": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "city-block": {
    type: "model",
    format: "glb",
    url: "/aura-assets/city-block.8f9f5c55.glb",
    hash: "sha256-8f9f5c55e491f558d191139c8270ee8cd1d58d2f938f0dacf0f1a3035b59d8dd",
    integrity: {
      "version": 1,
      "digest": "sha256-8f9f5c55e491f558d191139c8270ee8cd1d58d2f938f0dacf0f1a3035b59d8dd"
    },
    bounds: [
      20.8,
      7.367,
      16.2
    ],
    sizeBytes: 77048,
    metadata: {
      "materials": [
        "asphalt",
        "pavement",
        "facade_0_0",
        "facade_0_0",
        "roof",
        "facade_0_0",
        "facade_0_0",
        "facade_0_1",
        "facade_0_1",
        "facade_0_1",
        "facade_0_1",
        "facade_0_2",
        "facade_0_2",
        "facade_0_2",
        "facade_0_2",
        "facade_1_0",
        "facade_1_0",
        "facade_1_0",
        "facade_1_0",
        "facade_1_1",
        "facade_1_1",
        "facade_1_1",
        "facade_1_1",
        "facade_1_2",
        "facade_1_2",
        "facade_1_2",
        "facade_1_2",
        "facade_2_0",
        "facade_2_0",
        "facade_2_0",
        "facade_2_0",
        "facade_2_1",
        "facade_2_1",
        "facade_2_1",
        "facade_2_1",
        "facade_2_2",
        "facade_2_2",
        "facade_2_2",
        "facade_2_2",
        "facade_3_0",
        "facade_3_0",
        "facade_3_0",
        "facade_3_0",
        "facade_3_1",
        "facade_3_1",
        "facade_3_1",
        "facade_3_1",
        "facade_3_2",
        "facade_3_2",
        "facade_3_2",
        "facade_3_2",
        "lamp_post"
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
        "nodeCount": 40,
        "meshCount": 27,
        "materialCount": 52,
        "textureCount": 5,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "street",
          "blocks",
          "lamps",
          "sign"
        ],
        "maxDepth": 3,
        "messages": [
          "Detected 40 nodes across 4 roots."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/city-block.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/city-block.bridge.json"
        ],
        "checkedAt": "2026-11-08T12:37:15.934Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/city-block.glb",
      "outputPath": "public/aura-assets/city-block.8f9f5c55.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -10.4,
          -0.8,
          -8
        ],
        "max": [
          10.4,
          6.567,
          8.2
        ],
        "size": [
          20.8,
          7.367,
          16.2
        ],
        "center": [
          0,
          2.883,
          0.1
        ],
        "maxDimension": 20.8,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "asphalt",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "pavement",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_0_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_0_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "roof",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_0_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_0_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_0_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_0_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_0_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_0_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_0_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_0_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_0_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_0_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_1_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_1_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_1_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_1_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_1_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_1_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_1_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_1_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_1_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_1_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_1_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_1_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_2_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_2_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_2_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_2_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_2_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_2_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_2_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_2_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_2_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_2_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_2_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_2_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_3_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_3_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_3_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_3_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_3_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_3_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_3_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_3_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_3_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_3_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_3_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade_3_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "lamp_post",
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
        "street",
        "blocks",
        "lot_0_0",
        "lot_0_0__mesh",
        "lot_0_0__tower",
        "lot_0_1",
        "lot_0_1__mesh",
        "lot_0_1__tower",
        "lot_0_2",
        "lot_0_2__mesh",
        "lot_0_2__tower",
        "lot_1_0",
        "lot_1_0__mesh",
        "lot_1_0__tower",
        "lot_1_1",
        "lot_1_1__mesh",
        "lot_1_1__tower",
        "lot_1_2",
        "lot_1_2__mesh",
        "lot_1_2__tower",
        "lot_2_0",
        "lot_2_0__mesh",
        "lot_2_0__tower",
        "lot_2_1",
        "lot_2_1__mesh",
        "lot_2_1__tower",
        "lot_2_2",
        "lot_2_2__mesh",
        "lot_2_2__tower",
        "lot_3_0",
        "lot_3_0__mesh",
        "lot_3_0__tower",
        "lot_3_1",
        "lot_3_1__mesh",
        "lot_3_1__tower",
        "lot_3_2",
        "lot_3_2__mesh",
        "lot_3_2__tower",
        "lamps",
        "sign"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2",
        "image-3",
        "image-4"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/city-block.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/city-block.mjs (seed 1)"
    },
  },
  "stylized-car": {
    type: "model",
    format: "glb",
    url: "/aura-assets/stylized-car.ea5fb0ac.glb",
    hash: "sha256-ea5fb0acbcaf9d739885f82c08a779f528816f51cf3f00177222a09cd9b5b617",
    integrity: {
      "version": 1,
      "digest": "sha256-ea5fb0acbcaf9d739885f82c08a779f528816f51cf3f00177222a09cd9b5b617"
    },
    bounds: [
      9,
      1.525,
      9
    ],
    sizeBytes: 65772,
    metadata: {
      "materials": [
        "paint",
        "glass",
        "headlamp",
        "taillamp",
        "chrome",
        "rubber",
        "turntable"
      ],
      "animations": [
        "wheel_spin"
      ],
      "animationClips": [
        "wheel_spin"
      ],
      "animationClipDetails": [
        {
          "name": "wheel_spin",
          "duration": 1,
          "channelCount": 4
        }
      ],
      "animationMetadata": {
        "clipCount": 1,
        "clips": [
          {
            "index": 0,
            "name": "wheel_spin",
            "channelCount": 4,
            "samplerCount": 4,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "car__wheel_fr",
              "car__wheel_fl",
              "car__wheel_rr",
              "car__wheel_rl"
            ],
            "duration": 1,
            "hasRootMotionCandidate": false,
            "frameRate": 2
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
        "nodeCount": 22,
        "meshCount": 17,
        "materialCount": 7,
        "textureCount": 0,
        "animationClipCount": 1,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "car",
          "turntable"
        ],
        "maxDepth": 3,
        "messages": [
          "Detected 22 nodes across 2 roots."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/stylized-car.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/stylized-car.bridge.json"
        ],
        "checkedAt": "2026-11-08T12:47:15.173Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/stylized-car.glb",
      "outputPath": "public/aura-assets/stylized-car.ea5fb0ac.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -4.5,
          -0.1,
          -4.5
        ],
        "max": [
          4.5,
          1.425,
          4.5
        ],
        "size": [
          9,
          1.525,
          9
        ],
        "center": [
          0,
          0.663,
          0
        ],
        "maxDimension": 9,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "paint",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "glass",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "headlamp",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "taillamp",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "chrome",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "rubber",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "turntable",
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
        "car",
        "car__body",
        "car__cabin",
        "car__windows",
        "car__headlamp_l",
        "car__taillamp_l",
        "car__headlamp_r",
        "car__taillamp_r",
        "car__bumper",
        "car__wheel_fr",
        "car__wheel_fr__tyre",
        "car__wheel_fr__hub",
        "car__wheel_fl",
        "car__wheel_fl__tyre",
        "car__wheel_fl__hub",
        "car__wheel_rr",
        "car__wheel_rr__tyre",
        "car__wheel_rr__hub",
        "car__wheel_rl",
        "car__wheel_rl__tyre",
        "car__wheel_rl__hub",
        "turntable"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/stylized-car.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/stylized-car.mjs (seed 1)"
    },
  },
  "tree-grove": {
    type: "model",
    format: "glb",
    url: "/aura-assets/tree-grove.ee99a719.glb",
    hash: "sha256-ee99a7195151195441917402c05278e3a6ce3477b50fd8b83ed64b1b6ff08217",
    integrity: {
      "version": 1,
      "digest": "sha256-ee99a7195151195441917402c05278e3a6ce3477b50fd8b83ed64b1b6ff08217"
    },
    bounds: [
      17.6,
      4.94,
      17.6
    ],
    sizeBytes: 201088,
    metadata: {
      "materials": [
        "meadow",
        "bark",
        "leaves_2",
        "leaves_0",
        "leaves_1",
        "rock"
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
        "nodeCount": 81,
        "meshCount": 65,
        "materialCount": 6,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "ground",
          "grove",
          "spare_tree"
        ],
        "maxDepth": 3,
        "messages": [
          "Detected 81 nodes across 3 roots."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/tree-grove.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/tree-grove.bridge.json"
        ],
        "checkedAt": "2026-11-08T12:36:07.491Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/tree-grove.glb",
      "outputPath": "public/aura-assets/tree-grove.ee99a719.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -8.8,
          -0.601,
          -8.8
        ],
        "max": [
          8.8,
          4.339,
          8.8
        ],
        "size": [
          17.6,
          4.94,
          17.6
        ],
        "center": [
          0,
          1.869,
          0
        ],
        "maxDimension": 17.6,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "meadow",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "bark",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "leaves_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "leaves_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "leaves_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "rock",
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
        "grove",
        "grove__tree_0",
        "grove__tree_0__trunk",
        "grove__tree_0__crown_0",
        "grove__tree_0__crown_1",
        "grove__tree_0__crown_2",
        "grove__tree_1",
        "grove__tree_1__trunk",
        "grove__tree_1__crown_0",
        "grove__tree_1__crown_1",
        "grove__tree_1__crown_2",
        "grove__tree_2",
        "grove__tree_2__trunk",
        "grove__tree_2__crown_0",
        "grove__tree_2__crown_1",
        "grove__tree_2__crown_2",
        "grove__tree_3",
        "grove__tree_3__trunk",
        "grove__tree_3__crown_0",
        "grove__tree_3__crown_1",
        "grove__tree_4",
        "grove__tree_4__trunk",
        "grove__tree_4__crown_0",
        "grove__tree_4__crown_1",
        "grove__tree_4__crown_2",
        "grove__tree_5",
        "grove__tree_5__trunk",
        "grove__tree_5__crown_0",
        "grove__tree_5__crown_1",
        "grove__tree_5__crown_2",
        "grove__tree_6",
        "grove__tree_6__trunk",
        "grove__tree_6__crown_0",
        "grove__tree_6__crown_1",
        "grove__tree_6__crown_2",
        "grove__tree_7",
        "grove__tree_7__trunk",
        "grove__tree_7__crown_0",
        "grove__tree_7__crown_1",
        "grove__tree_8",
        "grove__tree_8__trunk",
        "grove__tree_8__crown_0",
        "grove__tree_8__crown_1",
        "grove__tree_9",
        "grove__tree_9__trunk",
        "grove__tree_9__crown_0",
        "grove__tree_9__crown_1",
        "grove__tree_9__crown_2",
        "grove__tree_10",
        "grove__tree_10__trunk",
        "grove__tree_10__crown_0",
        "grove__tree_10__crown_1",
        "grove__tree_10__crown_2",
        "grove__tree_11",
        "grove__tree_11__trunk",
        "grove__tree_11__crown_0",
        "grove__tree_11__crown_1",
        "grove__tree_11__crown_2",
        "grove__tree_12",
        "grove__tree_12__trunk",
        "grove__tree_12__crown_0",
        "grove__tree_12__crown_1",
        "grove__tree_13",
        "grove__tree_13__trunk",
        "grove__tree_13__crown_0",
        "grove__tree_13__crown_1",
        "grove__rock_0",
        "grove__rock_1",
        "grove__rock_2",
        "grove__rock_3",
        "grove__rock_4",
        "grove__rock_5",
        "grove__rock_6",
        "grove__rock_7",
        "grove__rock_8",
        "spare_tree",
        "spare_tree__trunk",
        "spare_tree__crown_0",
        "spare_tree__crown_1",
        "spare_tree__crown_2"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/tree-grove.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/tree-grove.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
