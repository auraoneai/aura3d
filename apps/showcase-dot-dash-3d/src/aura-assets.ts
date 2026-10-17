import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "byte": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "fruitApple": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "fruitCherry": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "fruitMelon": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "fruitOrange": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "fruitStar": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "fruitStrawberry": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "specterBlitz": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "specterDim": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "specterFlick": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "specterSly": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "byte": {
    type: "model",
    format: "glb",
    url: "/aura-assets/byte.63802e1c.glb",
    hash: "sha256-63802e1c7eb1ac356401625c93e065d528cb889270b51cea40df5ce133de2d3c",
    bounds: [
      1.558,
      1.903,
      1.55
    ],
    sizeBytes: 4689872,
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
        "textureCount": 0,
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
        "sourcePath": "public/aura-assets/byte.63802e1c.glb",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T05:33:32.480Z",
        "evidence": [
          "aura-evidence/meshy/byte.rights.7fcc7bfad170.json",
          "aura-evidence/meshy/byte.metadata.9d2634ff76ad.json",
          "public/aura-assets/byte.meshy-candidate.4cc6e7f2.png"
        ],
        "checkedAt": "2026-10-17T05:33:32.480Z"
      },
      "sourcePath": "public/aura-assets/byte.63802e1c.glb",
      "outputPath": "public/aura-assets/byte.63802e1c.glb",
      "boundsMetadata": {
        "min": [
          -0.78,
          -0.952,
          -0.776
        ],
        "max": [
          0.778,
          0.951,
          0.775
        ],
        "size": [
          1.558,
          1.903,
          1.55
        ],
        "center": [
          -0.001,
          0,
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
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [
        "node-0"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/byte.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/byte.meshy-candidate.4cc6e7f2.png",
        "kind": "manual-inspection",
        "sha256": "sha256-4cc6e7f2ea7f3e8ddfd10cbaee354f236dcffc8f6b4730748d6966782bec1d44",
        "checkedAt": "2026-10-17T06:06:39.747Z"
      }
    },
  },
  "fruitApple": {
    type: "model",
    format: "glb",
    url: "/aura-assets/fruitApple.6165a8f8.glb",
    hash: "sha256-6165a8f8edd491c9b290d91315167222a9443d1301d47d495341922290938c60",
    bounds: [
      1.547,
      1.902,
      1.544
    ],
    sizeBytes: 2182780,
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
        "textureCount": 0,
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
        "sourcePath": "public/aura-assets/fruitApple.6165a8f8.glb",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T05:36:37.675Z",
        "evidence": [
          "aura-evidence/meshy/fruitApple.rights.7fcc7bfad170.json",
          "aura-evidence/meshy/fruitApple.metadata.da36acf68940.json",
          "public/aura-assets/fruitApple.meshy-candidate.97e1cba7.png"
        ],
        "checkedAt": "2026-10-17T05:36:37.675Z"
      },
      "sourcePath": "public/aura-assets/fruitApple.6165a8f8.glb",
      "outputPath": "public/aura-assets/fruitApple.6165a8f8.glb",
      "boundsMetadata": {
        "min": [
          -0.768,
          -0.952,
          -0.772
        ],
        "max": [
          0.778,
          0.95,
          0.771
        ],
        "size": [
          1.547,
          1.902,
          1.544
        ],
        "center": [
          0.005,
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
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/fruitApple.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/fruitApple.meshy-candidate.97e1cba7.png",
        "kind": "manual-inspection",
        "sha256": "sha256-97e1cba7042ef6a1a3eb7fb08a8cf9b27d7b6018d1bdac56425463ea789c0b53",
        "checkedAt": "2026-10-17T06:06:43.150Z"
      }
    },
  },
  "fruitCherry": {
    type: "model",
    format: "glb",
    url: "/aura-assets/fruitCherry.10c08ac5.glb",
    hash: "sha256-10c08ac5cce48cb9f0899d7bbd7f9e88cb463d330160f875710a57822d427d1a",
    bounds: [
      1.903,
      1.034,
      0.392
    ],
    sizeBytes: 3872860,
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
        "textureCount": 0,
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
        "sourcePath": "public/aura-assets/fruitCherry.10c08ac5.glb",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T05:34:55.334Z",
        "evidence": [
          "aura-evidence/meshy/fruitCherry.rights.7fcc7bfad170.json",
          "aura-evidence/meshy/fruitCherry.metadata.aee6423976b4.json",
          "public/aura-assets/fruitCherry.meshy-candidate.a195d8f7.png"
        ],
        "checkedAt": "2026-10-17T05:34:55.334Z"
      },
      "sourcePath": "public/aura-assets/fruitCherry.10c08ac5.glb",
      "outputPath": "public/aura-assets/fruitCherry.10c08ac5.glb",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.52,
          -0.198
        ],
        "max": [
          0.951,
          0.514,
          0.194
        ],
        "size": [
          1.903,
          1.034,
          0.392
        ],
        "center": [
          0,
          -0.003,
          -0.002
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
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/fruitCherry.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/fruitCherry.meshy-candidate.a195d8f7.png",
        "kind": "manual-inspection",
        "sha256": "sha256-a195d8f793e382dd7ee030737058be5b5d5b1f82a5e8cfc64cbbc7d2ef31e2fb",
        "checkedAt": "2026-10-17T06:06:41.754Z"
      }
    },
  },
  "fruitMelon": {
    type: "model",
    format: "glb",
    url: "/aura-assets/fruitMelon.2db52adb.glb",
    hash: "sha256-2db52adbfede68bd7268b83ed814dad693e41c1b7be170d4cc200262ba46f66a",
    bounds: [
      1.903,
      1.066,
      1.031
    ],
    sizeBytes: 4337840,
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
        "textureCount": 0,
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
        "sourcePath": "public/aura-assets/fruitMelon.2db52adb.glb",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T06:01:52.106Z",
        "evidence": [
          "aura-evidence/meshy/fruitMelon.rights.7fcc7bfad170.json",
          "aura-evidence/meshy/fruitMelon.metadata.868f01f276b3.json",
          "public/aura-assets/fruitMelon.meshy-candidate.3cfcacf6.png"
        ],
        "checkedAt": "2026-10-17T06:01:52.106Z"
      },
      "sourcePath": "public/aura-assets/fruitMelon.2db52adb.glb",
      "outputPath": "public/aura-assets/fruitMelon.2db52adb.glb",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.534,
          -0.516
        ],
        "max": [
          0.951,
          0.532,
          0.515
        ],
        "size": [
          1.903,
          1.066,
          1.031
        ],
        "center": [
          0,
          -0.001,
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
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [
        "node-0"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/fruitMelon.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/fruitMelon.meshy-candidate.3cfcacf6.png",
        "kind": "manual-inspection",
        "sha256": "sha256-3cfcacf6cbe2a4e8416b8e6b617a7eb9555320c39bc6b97f698ef7650ac9625f",
        "checkedAt": "2026-10-17T06:18:05.333Z"
      }
    },
  },
  "fruitOrange": {
    type: "model",
    format: "glb",
    url: "/aura-assets/fruitOrange.4a7e9512.glb",
    hash: "sha256-4a7e9512c207c569ade7f05484bbf305f2b5cbfe16df980e99f6baf61893c6b5",
    bounds: [
      1.903,
      1.584,
      1.456
    ],
    sizeBytes: 2471740,
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
        "textureCount": 0,
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
        "sourcePath": "public/aura-assets/fruitOrange.4a7e9512.glb",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T05:36:32.630Z",
        "evidence": [
          "aura-evidence/meshy/fruitOrange.rights.7fcc7bfad170.json",
          "aura-evidence/meshy/fruitOrange.metadata.200436c8e4af.json",
          "public/aura-assets/fruitOrange.meshy-candidate.7eb0ea89.png"
        ],
        "checkedAt": "2026-10-17T05:36:32.630Z"
      },
      "sourcePath": "public/aura-assets/fruitOrange.4a7e9512.glb",
      "outputPath": "public/aura-assets/fruitOrange.4a7e9512.glb",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.792,
          -0.729
        ],
        "max": [
          0.951,
          0.792,
          0.728
        ],
        "size": [
          1.903,
          1.584,
          1.456
        ],
        "center": [
          0,
          0,
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
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [
        "node-0"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/fruitOrange.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/fruitOrange.meshy-candidate.7eb0ea89.png",
        "kind": "manual-inspection",
        "sha256": "sha256-7eb0ea89ae730016b6d4a4c5e0e6c8615be63e8adba08af9840ee9b952b122c1",
        "checkedAt": "2026-10-17T06:06:42.691Z"
      }
    },
  },
  "fruitStar": {
    type: "model",
    format: "glb",
    url: "/aura-assets/fruitStar.35545099.glb",
    hash: "sha256-35545099a877f2af3a1c1b0338ceb665421a82086ecec9792d16cffd4ab9eae9",
    bounds: [
      1.903,
      1.775,
      0.181
    ],
    sizeBytes: 964492,
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
        "textureCount": 0,
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
        "sourcePath": "public/aura-assets/fruitStar.35545099.glb",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T06:01:52.156Z",
        "evidence": [
          "aura-evidence/meshy/fruitStar.rights.7fcc7bfad170.json",
          "aura-evidence/meshy/fruitStar.metadata.c3576bb702e9.json",
          "public/aura-assets/fruitStar.meshy-candidate.8316c2f8.png"
        ],
        "checkedAt": "2026-10-17T06:01:52.156Z"
      },
      "sourcePath": "public/aura-assets/fruitStar.35545099.glb",
      "outputPath": "public/aura-assets/fruitStar.35545099.glb",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.888,
          -0.091
        ],
        "max": [
          0.951,
          0.887,
          0.09
        ],
        "size": [
          1.903,
          1.775,
          0.181
        ],
        "center": [
          -0.001,
          0,
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
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [
        "node-0"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/fruitStar.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/fruitStar.meshy-candidate.8316c2f8.png",
        "kind": "manual-inspection",
        "sha256": "sha256-8316c2f8460dae39ca2a351fa4474254e71820bc845981ffda1b457ae1dfdadc",
        "checkedAt": "2026-10-17T06:18:05.716Z"
      }
    },
  },
  "fruitStrawberry": {
    type: "model",
    format: "glb",
    url: "/aura-assets/fruitStrawberry.52b0a567.glb",
    hash: "sha256-52b0a567a40c1799b8bc1a73e3a90338a0f1fd42dc6827fbd8ea029de21392fb",
    bounds: [
      1.369,
      1.903,
      1.37
    ],
    sizeBytes: 9459108,
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
        "textureCount": 0,
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
        "sourcePath": "public/aura-assets/fruitStrawberry.52b0a567.glb",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T05:36:36.763Z",
        "evidence": [
          "aura-evidence/meshy/fruitStrawberry.rights.7fcc7bfad170.json",
          "aura-evidence/meshy/fruitStrawberry.metadata.3aed81b832ef.json",
          "public/aura-assets/fruitStrawberry.meshy-candidate.1beb2247.png"
        ],
        "checkedAt": "2026-10-17T05:36:36.763Z"
      },
      "sourcePath": "public/aura-assets/fruitStrawberry.52b0a567.glb",
      "outputPath": "public/aura-assets/fruitStrawberry.52b0a567.glb",
      "boundsMetadata": {
        "min": [
          -0.685,
          -0.952,
          -0.686
        ],
        "max": [
          0.684,
          0.951,
          0.685
        ],
        "size": [
          1.369,
          1.903,
          1.37
        ],
        "center": [
          -0.001,
          -0.001,
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
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [
        "node-0"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/fruitStrawberry.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/fruitStrawberry.meshy-candidate.1beb2247.png",
        "kind": "manual-inspection",
        "sha256": "sha256-1beb22473cd77395b78eaa93419e699979957868afbb7e37593ad2ae62c7cb86",
        "checkedAt": "2026-10-17T06:06:42.183Z"
      }
    },
  },
  "specterBlitz": {
    type: "model",
    format: "glb",
    url: "/aura-assets/specterBlitz.dd57c639.glb",
    hash: "sha256-dd57c63913fc957667a1ab59efd584361311ea1c244fd75c236a93c6f59823d4",
    bounds: [
      1.212,
      1.903,
      0.99
    ],
    sizeBytes: 2932736,
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
        "textureCount": 0,
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
        "sourcePath": "public/aura-assets/specterBlitz.dd57c639.glb",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T05:33:24.582Z",
        "evidence": [
          "aura-evidence/meshy/specterBlitz.rights.7fcc7bfad170.json",
          "aura-evidence/meshy/specterBlitz.metadata.68908299d95f.json",
          "public/aura-assets/specterBlitz.meshy-candidate.00c6be53.png"
        ],
        "checkedAt": "2026-10-17T05:33:24.582Z"
      },
      "sourcePath": "public/aura-assets/specterBlitz.dd57c639.glb",
      "outputPath": "public/aura-assets/specterBlitz.dd57c639.glb",
      "boundsMetadata": {
        "min": [
          -0.607,
          -0.952,
          -0.496
        ],
        "max": [
          0.605,
          0.951,
          0.494
        ],
        "size": [
          1.212,
          1.903,
          0.99
        ],
        "center": [
          -0.001,
          0,
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
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [
        "node-0"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/specterBlitz.thumb.svg",
      "quality": "candidate",
      "role": "enemy",
      "renderedProbe": {
        "url": "/aura-assets/specterBlitz.meshy-candidate.00c6be53.png",
        "kind": "manual-inspection",
        "sha256": "sha256-00c6be5308b7c19c751e0b69097be9127e38caf3e0fa31d4e2002aebcd1d05bc",
        "checkedAt": "2026-10-17T06:06:40.130Z"
      }
    },
  },
  "specterDim": {
    type: "model",
    format: "glb",
    url: "/aura-assets/specterDim.90b329ae.glb",
    hash: "sha256-90b329ae13e902a3efbcdc428d52476370f9dc9fe5a918e42a16a26385c87ca9",
    bounds: [
      1.146,
      1.903,
      1.285
    ],
    sizeBytes: 5068016,
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
        "textureCount": 0,
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
        "sourcePath": "public/aura-assets/specterDim.90b329ae.glb",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T05:35:01.983Z",
        "evidence": [
          "aura-evidence/meshy/specterDim.rights.7fcc7bfad170.json",
          "aura-evidence/meshy/specterDim.metadata.e2f4ea11de36.json",
          "public/aura-assets/specterDim.meshy-candidate.11c88489.png"
        ],
        "checkedAt": "2026-10-17T05:35:01.983Z"
      },
      "sourcePath": "public/aura-assets/specterDim.90b329ae.glb",
      "outputPath": "public/aura-assets/specterDim.90b329ae.glb",
      "boundsMetadata": {
        "min": [
          -0.572,
          -0.952,
          -0.644
        ],
        "max": [
          0.574,
          0.951,
          0.642
        ],
        "size": [
          1.146,
          1.903,
          1.285
        ],
        "center": [
          0.001,
          0,
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
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [
        "node-0"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/specterDim.thumb.svg",
      "quality": "candidate",
      "role": "enemy",
      "renderedProbe": {
        "url": "/aura-assets/specterDim.meshy-candidate.11c88489.png",
        "kind": "manual-inspection",
        "sha256": "sha256-11c88489d37017ef13ee04a84293665287886d38fc55c98f43c52695c07a44ce",
        "checkedAt": "2026-10-17T06:06:41.327Z"
      }
    },
  },
  "specterFlick": {
    type: "model",
    format: "glb",
    url: "/aura-assets/specterFlick.9adb69d0.glb",
    hash: "sha256-9adb69d0fe56d349d763ef6373e516d2b2ec02fa68ed2cb20594f702e258e4c9",
    bounds: [
      1.891,
      1.438,
      1.438
    ],
    sizeBytes: 4940336,
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
        "textureCount": 0,
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
        "sourcePath": "public/aura-assets/specterFlick.9adb69d0.glb",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T05:35:12.662Z",
        "evidence": [
          "aura-evidence/meshy/specterFlick.rights.7fcc7bfad170.json",
          "aura-evidence/meshy/specterFlick.metadata.a31adf8b9c5b.json",
          "public/aura-assets/specterFlick.meshy-candidate.cac4a3b8.png"
        ],
        "checkedAt": "2026-10-17T05:35:12.662Z"
      },
      "sourcePath": "public/aura-assets/specterFlick.9adb69d0.glb",
      "outputPath": "public/aura-assets/specterFlick.9adb69d0.glb",
      "boundsMetadata": {
        "min": [
          -0.94,
          -0.719,
          -0.72
        ],
        "max": [
          0.951,
          0.719,
          0.719
        ],
        "size": [
          1.891,
          1.438,
          1.438
        ],
        "center": [
          0.006,
          0,
          0
        ],
        "maxDimension": 1.891,
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
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/specterFlick.thumb.svg",
      "quality": "candidate",
      "role": "enemy",
      "renderedProbe": {
        "url": "/aura-assets/specterFlick.meshy-candidate.cac4a3b8.png",
        "kind": "manual-inspection",
        "sha256": "sha256-cac4a3b80ba85ca0bca8971c8eb547580a8faf3c359e5d9de65c99f2c2aca7c4",
        "checkedAt": "2026-10-17T06:06:40.921Z"
      }
    },
  },
  "specterSly": {
    type: "model",
    format: "glb",
    url: "/aura-assets/specterSly.169fa2a6.glb",
    hash: "sha256-169fa2a64cc3483b43133a1db9697bde58cbcde0b99c2754b1c6e61df10ae8ad",
    bounds: [
      1.007,
      1.472,
      0.989
    ],
    sizeBytes: 2130752,
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
        "textureCount": 0,
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
        "sourcePath": "public/aura-assets/specterSly.169fa2a6.glb",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T05:33:28.854Z",
        "evidence": [
          "aura-evidence/meshy/specterSly.rights.7fcc7bfad170.json",
          "aura-evidence/meshy/specterSly.metadata.f2f1fc827d46.json",
          "public/aura-assets/specterSly.meshy-candidate.ca57cdc9.png"
        ],
        "checkedAt": "2026-10-17T05:33:28.854Z"
      },
      "sourcePath": "public/aura-assets/specterSly.169fa2a6.glb",
      "outputPath": "public/aura-assets/specterSly.169fa2a6.glb",
      "boundsMetadata": {
        "min": [
          -0.504,
          -0.733,
          -0.495
        ],
        "max": [
          0.503,
          0.739,
          0.494
        ],
        "size": [
          1.007,
          1.472,
          0.989
        ],
        "center": [
          0,
          0.003,
          -0.001
        ],
        "maxDimension": 1.472,
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
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/specterSly.thumb.svg",
      "quality": "candidate",
      "role": "enemy",
      "renderedProbe": {
        "url": "/aura-assets/specterSly.meshy-candidate.ca57cdc9.png",
        "kind": "manual-inspection",
        "sha256": "sha256-ca57cdc9cfc28a45c88ef96d740c43314cab66c2c12c01d48e5063f190c07f55",
        "checkedAt": "2026-10-17T06:06:40.515Z"
      }
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
