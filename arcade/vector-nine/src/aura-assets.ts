import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "vnBarrier": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "vnCargo": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "vnCoupe": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "vnCrane": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "vnGate": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "vnMast": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "vnTower": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "vnBarrier": {
    type: "model",
    format: "glb",
    url: "/aura-assets/vnBarrier.a6483a28.glb",
    hash: "sha256-a6483a2801cec706c13085f251a7ed32a48fb196cfda14bdd4e06795a0409968",
    bounds: [
      1.903,
      0.734,
      0.79
    ],
    sizeBytes: 784416,
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
        "sourcePath": "public/aura-assets/vnBarrier.a6483a28.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated with Meshy text-to-3D on an AuraOne-held account. Output rights governed by the Meshy terms of service. Generated content, not CC0, not third-party catalog material.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-18T01:12:29.755Z",
        "evidence": [
          "aura-evidence/meshy/vnBarrier.rights.7f1579e03390.json",
          "aura-evidence/meshy/vnBarrier.metadata.839239012437.json",
          "public/aura-assets/vnBarrier.meshy-candidate.8ae74b59.png"
        ],
        "checkedAt": "2026-10-18T01:12:29.755Z"
      },
      "sourcePath": "public/aura-assets/vnBarrier.a6483a28.glb",
      "outputPath": "public/aura-assets/vnBarrier.a6483a28.glb",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.368,
          -0.395
        ],
        "max": [
          0.951,
          0.367,
          0.394
        ],
        "size": [
          1.903,
          0.734,
          0.79
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
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/vnBarrier.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/vnBarrier.meshy-candidate.8ae74b59.png",
        "kind": "manual-inspection",
        "sha256": "sha256-8ae74b590f721d04b51efa849e2d9e83afa471a865d16369b832c7ca78e45e10",
        "checkedAt": "2026-10-18T08:08:17.733Z"
      }
    },
  },
  "vnCargo": {
    type: "model",
    format: "glb",
    url: "/aura-assets/vnCargo.8a392251.glb",
    hash: "sha256-8a392251da39ccaf77a8756834536ec71a5e1f8c721c44d29aab373ce12d6c51",
    bounds: [
      1.903,
      1.511,
      0.78
    ],
    sizeBytes: 1196164,
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
        "sourcePath": "public/aura-assets/vnCargo.8a392251.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated with Meshy text-to-3D on an AuraOne-held account. Output rights governed by the Meshy terms of service. Generated content, not CC0, not third-party catalog material.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-18T19:06:47.990Z",
        "evidence": [
          "aura-evidence/meshy/vnCargo.rights.7f1579e03390.json",
          "aura-evidence/meshy/vnCargo.metadata.e727a7676ef3.json",
          "public/aura-assets/vnCargo.meshy-candidate.9702d4a8.png"
        ],
        "checkedAt": "2026-10-18T19:06:47.990Z"
      },
      "sourcePath": "public/aura-assets/vnCargo.8a392251.glb",
      "outputPath": "public/aura-assets/vnCargo.8a392251.glb",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.755,
          -0.382
        ],
        "max": [
          0.951,
          0.756,
          0.398
        ],
        "size": [
          1.903,
          1.511,
          0.78
        ],
        "center": [
          -0.001,
          0,
          0.008
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
      "thumbnailUrl": "/aura-assets/vnCargo.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/vnCargo.meshy-candidate.9702d4a8.png",
        "kind": "manual-inspection",
        "sha256": "sha256-9702d4a80818dc4c41c2e72e0938b6b1e2b43405739a7821b1024bc639b13db9",
        "checkedAt": "2026-10-18T19:08:46.372Z"
      }
    },
  },
  "vnCoupe": {
    type: "model",
    format: "glb",
    url: "/aura-assets/vnCoupe.f32b0331.glb",
    hash: "sha256-f32b03315fef5518ae5dad12e5468f51af908e959d503fd95a09e723e027da3d",
    bounds: [
      0.909,
      0.535,
      1.901
    ],
    sizeBytes: 1187592,
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
        "sourcePath": "public/aura-assets/vnCoupe.f32b0331.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated with Meshy text-to-3D + remesh on an AuraOne-held account. Output rights governed by the Meshy terms of service. Generated content, not CC0, not third-party catalog material.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-18T08:18:38.885Z",
        "evidence": [
          "aura-evidence/meshy/vnCoupe.rights.213af96db75b.json",
          "aura-evidence/meshy/vnCoupe.metadata.7d332f739f55.json",
          "public/aura-assets/vnCoupe.meshy-candidate.15ec6616.png"
        ],
        "checkedAt": "2026-10-18T08:18:38.885Z"
      },
      "sourcePath": "public/aura-assets/vnCoupe.f32b0331.glb",
      "outputPath": "public/aura-assets/vnCoupe.f32b0331.glb",
      "boundsMetadata": {
        "min": [
          -0.455,
          -0.269,
          -0.951
        ],
        "max": [
          0.454,
          0.266,
          0.95
        ],
        "size": [
          0.909,
          0.535,
          1.901
        ],
        "center": [
          -0.001,
          -0.001,
          0
        ],
        "maxDimension": 1.901,
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
      "thumbnailUrl": "/aura-assets/vnCoupe.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/vnCoupe.meshy-candidate.15ec6616.png",
        "kind": "manual-inspection",
        "sha256": "sha256-15ec6616cffffd7afab790cf61a82027557cadc6ab31fbb01f5635640cc4f049",
        "checkedAt": "2026-10-18T08:22:17.821Z"
      }
    },
  },
  "vnCrane": {
    type: "model",
    format: "glb",
    url: "/aura-assets/vnCrane.4abd79a4.glb",
    hash: "sha256-4abd79a4b265e7562c71e9f0b7f3e62dec095e4f68623c93e6cd0fb308175597",
    bounds: [
      1.887,
      1.7,
      0.406
    ],
    sizeBytes: 866880,
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
        "sourcePath": "public/aura-assets/vnCrane.4abd79a4.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated with Meshy text-to-3D on an AuraOne-held account. Output rights governed by the Meshy terms of service. Generated content, not CC0, not third-party catalog material.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-18T19:05:40.715Z",
        "evidence": [
          "aura-evidence/meshy/vnCrane.rights.7f1579e03390.json",
          "aura-evidence/meshy/vnCrane.metadata.e3afe8739c2a.json",
          "public/aura-assets/vnCrane.meshy-candidate.8d4d3490.png"
        ],
        "checkedAt": "2026-10-18T19:05:40.715Z"
      },
      "sourcePath": "public/aura-assets/vnCrane.4abd79a4.glb",
      "outputPath": "public/aura-assets/vnCrane.4abd79a4.glb",
      "boundsMetadata": {
        "min": [
          -0.937,
          -0.862,
          -0.204
        ],
        "max": [
          0.95,
          0.837,
          0.202
        ],
        "size": [
          1.887,
          1.7,
          0.406
        ],
        "center": [
          0.006,
          -0.012,
          -0.001
        ],
        "maxDimension": 1.887,
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
      "thumbnailUrl": "/aura-assets/vnCrane.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/vnCrane.meshy-candidate.8d4d3490.png",
        "kind": "manual-inspection",
        "sha256": "sha256-8d4d34904c0445c0d531ab23cbe6434dc1c0ff144621e89862d6e6640ff94d38",
        "checkedAt": "2026-10-18T19:08:38.770Z"
      }
    },
  },
  "vnGate": {
    type: "model",
    format: "glb",
    url: "/aura-assets/vnGate.621f74cc.glb",
    hash: "sha256-621f74cc5155dae9c43f021e539eca219f888b5b22a81fcefaf99aedf22049ee",
    bounds: [
      1.896,
      1.903,
      0.546
    ],
    sizeBytes: 917388,
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
        "sourcePath": "public/aura-assets/vnGate.621f74cc.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated with Meshy text-to-3D on an AuraOne-held account. Output rights governed by the Meshy terms of service. Generated content, not CC0, not third-party catalog material.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-18T08:07:33.102Z",
        "evidence": [
          "aura-evidence/meshy/vnGate.rights.7f1579e03390.json",
          "aura-evidence/meshy/vnGate.metadata.784f044e190e.json",
          "public/aura-assets/vnGate.meshy-candidate.0bdc6e38.png"
        ],
        "checkedAt": "2026-10-18T08:07:33.102Z"
      },
      "sourcePath": "public/aura-assets/vnGate.621f74cc.glb",
      "outputPath": "public/aura-assets/vnGate.621f74cc.glb",
      "boundsMetadata": {
        "min": [
          -0.949,
          -0.952,
          -0.277
        ],
        "max": [
          0.948,
          0.951,
          0.269
        ],
        "size": [
          1.896,
          1.903,
          0.546
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
      "thumbnailUrl": "/aura-assets/vnGate.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/vnGate.meshy-candidate.0bdc6e38.png",
        "kind": "manual-inspection",
        "sha256": "sha256-0bdc6e3820570c8b61cae207dcdc4df4e8816a35e669714c3db896c0673ee4cb",
        "checkedAt": "2026-10-18T08:08:35.161Z"
      }
    },
  },
  "vnMast": {
    type: "model",
    format: "glb",
    url: "/aura-assets/vnMast.b06dac29.glb",
    hash: "sha256-b06dac2929947f21527917162b0e044981f2077561ba03655ab88819f5af1bb0",
    bounds: [
      0.339,
      1.903,
      0.339
    ],
    sizeBytes: 1006836,
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
        "sourcePath": "public/aura-assets/vnMast.b06dac29.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated with Meshy text-to-3D on an AuraOne-held account. Output rights governed by the Meshy terms of service. Generated content, not CC0, not third-party catalog material.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-18T01:12:11.587Z",
        "evidence": [
          "aura-evidence/meshy/vnMast.rights.7f1579e03390.json",
          "aura-evidence/meshy/vnMast.metadata.9adf7181860d.json",
          "public/aura-assets/vnMast.meshy-candidate.0b55e5bc.png"
        ],
        "checkedAt": "2026-10-18T01:12:11.587Z"
      },
      "sourcePath": "public/aura-assets/vnMast.b06dac29.glb",
      "outputPath": "public/aura-assets/vnMast.b06dac29.glb",
      "boundsMetadata": {
        "min": [
          -0.171,
          -0.952,
          -0.17
        ],
        "max": [
          0.168,
          0.951,
          0.169
        ],
        "size": [
          0.339,
          1.903,
          0.339
        ],
        "center": [
          -0.002,
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
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/vnMast.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/vnMast.meshy-candidate.0b55e5bc.png",
        "kind": "manual-inspection",
        "sha256": "sha256-0b55e5bcb3ad8fa4b1d344711c549eb4c5dfce52d1865bdbefca71f1d79f62a2",
        "checkedAt": "2026-10-18T08:08:17.933Z"
      }
    },
  },
  "vnTower": {
    type: "model",
    format: "glb",
    url: "/aura-assets/vnTower.eecb9b00.glb",
    hash: "sha256-eecb9b001d042ea134901ac890e208faaf74d4831dc7795fdb2c5c1f8a4212c9",
    bounds: [
      1.276,
      1.807,
      1.761
    ],
    sizeBytes: 1211504,
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
        "sourcePath": "public/aura-assets/vnTower.eecb9b00.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated with Meshy text-to-3D on an AuraOne-held account. Output rights governed by the Meshy terms of service. Generated content, not CC0, not third-party catalog material.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-18T01:12:49.875Z",
        "evidence": [
          "aura-evidence/meshy/vnTower.rights.7f1579e03390.json",
          "aura-evidence/meshy/vnTower.metadata.cd8b9fd05331.json",
          "public/aura-assets/vnTower.meshy-candidate.c835e3d1.png"
        ],
        "checkedAt": "2026-10-18T01:12:49.875Z"
      },
      "sourcePath": "public/aura-assets/vnTower.eecb9b00.glb",
      "outputPath": "public/aura-assets/vnTower.eecb9b00.glb",
      "boundsMetadata": {
        "min": [
          -0.638,
          -0.952,
          -0.882
        ],
        "max": [
          0.638,
          0.855,
          0.88
        ],
        "size": [
          1.276,
          1.807,
          1.761
        ],
        "center": [
          0,
          -0.049,
          -0.001
        ],
        "maxDimension": 1.807,
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
      "thumbnailUrl": "/aura-assets/vnTower.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/vnTower.meshy-candidate.c835e3d1.png",
        "kind": "manual-inspection",
        "sha256": "sha256-c835e3d1c489d22f8c6e43918b998461cf343d08a20616516626b4c4bdd78a5d",
        "checkedAt": "2026-10-18T08:08:18.139Z"
      }
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
