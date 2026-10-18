import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "bsGate": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bsRoof": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bsTower": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "bsGate": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bsGate.321b8022.glb",
    hash: "sha256-321b80229fa0ab4feb88e7f6399e8eeea4f0e042b29e6ff9ebec868df681f5f2",
    bounds: [
      1.135,
      1.902,
      0.505
    ],
    sizeBytes: 1472344,
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
        "sourcePath": "public/aura-assets/bsGate.321b8022.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated with Meshy text-to-3D (preview + refine) on a Meshy account held by AuraOne. Output rights governed by the Meshy terms of service. Generated content, not CC0, not third-party catalog material.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-18T01:08:29.723Z",
        "evidence": [
          "aura-evidence/meshy/bsGate.rights.19b6d35dd7ee.json",
          "aura-evidence/meshy/bsGate.metadata.aa619e422656.json",
          "public/aura-assets/bsGate.meshy-candidate.d6db5a58.png"
        ],
        "checkedAt": "2026-10-18T01:08:29.723Z"
      },
      "sourcePath": "public/aura-assets/bsGate.321b8022.glb",
      "outputPath": "public/aura-assets/bsGate.321b8022.glb",
      "boundsMetadata": {
        "min": [
          -0.568,
          -0.952,
          -0.253
        ],
        "max": [
          0.567,
          0.95,
          0.252
        ],
        "size": [
          1.135,
          1.902,
          0.505
        ],
        "center": [
          -0.001,
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
      "thumbnailUrl": "/aura-assets/bsGate.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/bsGate.meshy-candidate.d6db5a58.png",
        "kind": "manual-inspection",
        "sha256": "sha256-d6db5a587fa90b9cbb402d7adfb0297e0720a2e52045e0be1df15237e437042c",
        "checkedAt": "2026-10-18T03:19:44.821Z"
      }
    },
  },
  "bsRoof": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bsRoof.26af4ba5.glb",
    hash: "sha256-26af4ba50cf10756db26871bd3f909ed998716d2a6e5b55189f234f15997ed16",
    bounds: [
      1.899,
      0.802,
      1.823
    ],
    sizeBytes: 1076632,
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
        "sourcePath": "public/aura-assets/bsRoof.26af4ba5.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated with Meshy text-to-3D (preview + refine) on a Meshy account held by AuraOne. Output rights governed by the Meshy terms of service. Generated content, not CC0, not third-party catalog material.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-18T01:08:18.064Z",
        "evidence": [
          "aura-evidence/meshy/bsRoof.rights.19b6d35dd7ee.json",
          "aura-evidence/meshy/bsRoof.metadata.be9b0a14ad7e.json",
          "public/aura-assets/bsRoof.meshy-candidate.9f8a3381.png"
        ],
        "checkedAt": "2026-10-18T01:08:18.064Z"
      },
      "sourcePath": "public/aura-assets/bsRoof.26af4ba5.glb",
      "outputPath": "public/aura-assets/bsRoof.26af4ba5.glb",
      "boundsMetadata": {
        "min": [
          -0.95,
          -0.402,
          -0.912
        ],
        "max": [
          0.949,
          0.4,
          0.912
        ],
        "size": [
          1.899,
          0.802,
          1.823
        ],
        "center": [
          0,
          -0.001,
          0
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
      "thumbnailUrl": "/aura-assets/bsRoof.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/bsRoof.meshy-candidate.9f8a3381.png",
        "kind": "manual-inspection",
        "sha256": "sha256-9f8a33815502dee3e7c3ac843eee10d756757700bea3af36e8abc020612a7eac",
        "checkedAt": "2026-10-18T03:20:11.124Z"
      }
    },
  },
  "bsTower": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bsTower.c9f7fad7.glb",
    hash: "sha256-c9f7fad76be7525043feb7ce544b13c8733741c0e4b886a6d52afe3f5d459da3",
    bounds: [
      0.334,
      1.901,
      0.335
    ],
    sizeBytes: 1376540,
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
        "sourcePath": "public/aura-assets/bsTower.c9f7fad7.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated with Meshy text-to-3D (preview + refine) on a Meshy account held by AuraOne. Output rights governed by the Meshy terms of service. Generated content, not CC0, not third-party catalog material.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-18T01:08:37.399Z",
        "evidence": [
          "aura-evidence/meshy/bsTower.rights.19b6d35dd7ee.json",
          "aura-evidence/meshy/bsTower.metadata.c5fc5f53b4a1.json",
          "public/aura-assets/bsTower.meshy-candidate.0f263aa8.png"
        ],
        "checkedAt": "2026-10-18T01:08:37.399Z"
      },
      "sourcePath": "public/aura-assets/bsTower.c9f7fad7.glb",
      "outputPath": "public/aura-assets/bsTower.c9f7fad7.glb",
      "boundsMetadata": {
        "min": [
          -0.168,
          -0.952,
          -0.167
        ],
        "max": [
          0.166,
          0.949,
          0.168
        ],
        "size": [
          0.334,
          1.901,
          0.335
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
      "thumbnailUrl": "/aura-assets/bsTower.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/bsTower.meshy-candidate.0f263aa8.png",
        "kind": "manual-inspection",
        "sha256": "sha256-0f263aa8f7406719f27ecea460620715fa6de3e48628e92ffd7967a3d789bccf",
        "checkedAt": "2026-10-18T03:20:27.927Z"
      }
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
