import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "prismBrick": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "prismCore": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "prismPaddle": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "prismPylon": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "prismBrick": {
    type: "model",
    format: "glb",
    url: "/aura-assets/prismBrick.1bbce861.glb",
    hash: "sha256-1bbce8610c29469f1613611dfc32851bec5b8103a7f6e4a8a1e49412a54dc2e8",
    bounds: [
      1.902,
      0.982,
      1.903
    ],
    sizeBytes: 773600,
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
        "sourcePath": "public/aura-assets/prismBrick.1bbce861.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated with Meshy text-to-3D (preview + refine) on a Meshy account held by AuraOne. Output rights are governed by the Meshy terms of service. This is generated content, not CC0 and not third-party catalog material.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-18T00:09:38.391Z",
        "evidence": [
          "aura-evidence/meshy/prismBrick.rights.3ded8fed26f3.json",
          "aura-evidence/meshy/prismBrick.metadata.a4aec8c5d123.json",
          "public/aura-assets/prismBrick.meshy-candidate.c2a5c2d6.png"
        ],
        "checkedAt": "2026-10-18T00:09:38.391Z"
      },
      "sourcePath": "public/aura-assets/prismBrick.1bbce861.glb",
      "outputPath": "public/aura-assets/prismBrick.1bbce861.glb",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.49,
          -0.952
        ],
        "max": [
          0.951,
          0.492,
          0.951
        ],
        "size": [
          1.902,
          0.982,
          1.903
        ],
        "center": [
          0,
          0.001,
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
      "thumbnailUrl": "/aura-assets/prismBrick.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/prismBrick.meshy-candidate.c2a5c2d6.png",
        "kind": "manual-inspection",
        "sha256": "sha256-c2a5c2d65530ef5f372283b399656b3152d977186154430f4c1ff739f4759f56",
        "checkedAt": "2026-10-18T00:21:52.277Z"
      }
    },
  },
  "prismCore": {
    type: "model",
    format: "glb",
    url: "/aura-assets/prismCore.bcc559d5.glb",
    hash: "sha256-bcc559d507978872a136d17133f1260fbb88fe65160655768551b1759f3f33bd",
    bounds: [
      1.83,
      1.843,
      1.898
    ],
    sizeBytes: 886160,
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
        "sourcePath": "public/aura-assets/prismCore.bcc559d5.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated with Meshy text-to-3D (preview + refine) on a Meshy account held by AuraOne. Output rights are governed by the Meshy terms of service. This is generated content, not CC0 and not third-party catalog material.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-18T00:09:43.439Z",
        "evidence": [
          "aura-evidence/meshy/prismCore.rights.3ded8fed26f3.json",
          "aura-evidence/meshy/prismCore.metadata.e273fecfcf1d.json",
          "public/aura-assets/prismCore.meshy-candidate.19597042.png"
        ],
        "checkedAt": "2026-10-18T00:09:43.439Z"
      },
      "sourcePath": "public/aura-assets/prismCore.bcc559d5.glb",
      "outputPath": "public/aura-assets/prismCore.bcc559d5.glb",
      "boundsMetadata": {
        "min": [
          -0.916,
          -0.922,
          -0.948
        ],
        "max": [
          0.915,
          0.921,
          0.95
        ],
        "size": [
          1.83,
          1.843,
          1.898
        ],
        "center": [
          0,
          -0.001,
          0.001
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
      "thumbnailUrl": "/aura-assets/prismCore.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/prismCore.meshy-candidate.19597042.png",
        "kind": "manual-inspection",
        "sha256": "sha256-19597042808edb789657d1f0c81f654385ae4e68d1c489b2af707bcbfd7bea0e",
        "checkedAt": "2026-10-18T00:21:50.893Z"
      }
    },
  },
  "prismPaddle": {
    type: "model",
    format: "glb",
    url: "/aura-assets/prismPaddle.ddcd50f5.glb",
    hash: "sha256-ddcd50f595fb3f101f8657b45960d4112917aed85dcd470c7abb51e176a3f14e",
    bounds: [
      1.903,
      0.393,
      1.886
    ],
    sizeBytes: 903680,
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
        "sourcePath": "public/aura-assets/prismPaddle.ddcd50f5.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated with Meshy text-to-3D (preview + refine) on a Meshy account held by AuraOne. Output rights are governed by the Meshy terms of service. This is generated content, not CC0 and not third-party catalog material.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-18T00:09:44.484Z",
        "evidence": [
          "aura-evidence/meshy/prismPaddle.rights.3ded8fed26f3.json",
          "aura-evidence/meshy/prismPaddle.metadata.2b9c7014fcf4.json",
          "public/aura-assets/prismPaddle.meshy-candidate.6fb31b78.png"
        ],
        "checkedAt": "2026-10-18T00:09:44.484Z"
      },
      "sourcePath": "public/aura-assets/prismPaddle.ddcd50f5.glb",
      "outputPath": "public/aura-assets/prismPaddle.ddcd50f5.glb",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.187,
          -0.944
        ],
        "max": [
          0.951,
          0.206,
          0.942
        ],
        "size": [
          1.903,
          0.393,
          1.886
        ],
        "center": [
          0,
          0.009,
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
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/prismPaddle.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/prismPaddle.meshy-candidate.6fb31b78.png",
        "kind": "manual-inspection",
        "sha256": "sha256-6fb31b782351f32a911c0a2ec527c2f34caecbe89d9bf3ac58711c1b0b8dc7fa",
        "checkedAt": "2026-10-18T00:21:49.345Z"
      }
    },
  },
  "prismPylon": {
    type: "model",
    format: "glb",
    url: "/aura-assets/prismPylon.70973618.glb",
    hash: "sha256-709736187f9f7c9397d680dc8c6c750761671eaffa28b2e54398a0766d3aeaf5",
    bounds: [
      0.59,
      1.902,
      0.51
    ],
    sizeBytes: 962024,
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
        "sourcePath": "public/aura-assets/prismPylon.70973618.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated with Meshy text-to-3D (preview + refine) on a Meshy account held by AuraOne. Output rights are governed by the Meshy terms of service. This is generated content, not CC0 and not third-party catalog material.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-18T00:09:18.993Z",
        "evidence": [
          "aura-evidence/meshy/prismPylon.rights.3ded8fed26f3.json",
          "aura-evidence/meshy/prismPylon.metadata.9395d25a87de.json",
          "public/aura-assets/prismPylon.meshy-candidate.c0e46afa.png"
        ],
        "checkedAt": "2026-10-18T00:09:18.993Z"
      },
      "sourcePath": "public/aura-assets/prismPylon.70973618.glb",
      "outputPath": "public/aura-assets/prismPylon.70973618.glb",
      "boundsMetadata": {
        "min": [
          -0.296,
          -0.952,
          -0.255
        ],
        "max": [
          0.294,
          0.95,
          0.255
        ],
        "size": [
          0.59,
          1.902,
          0.51
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
      "thumbnailUrl": "/aura-assets/prismPylon.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/prismPylon.meshy-candidate.c0e46afa.png",
        "kind": "manual-inspection",
        "sha256": "sha256-c0e46afa486bcfc5475adc434a78725b846f3c04ecac6485c06a483e2716c4da",
        "checkedAt": "2026-10-18T00:21:53.668Z"
      }
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
