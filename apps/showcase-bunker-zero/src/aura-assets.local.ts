import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "bzGunnerMeshy": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzGuardMeshy": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzHoundMeshy": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzWardenMeshy": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzMedicalBox": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzBulkheadLamp": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzMachete": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzShutterDoor": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "bzGunnerMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bzGunnerMeshy.f8ff70f5.glb",
    hash: "sha256-f8ff70f584952d4d8433432a6d5614c51ee77cef66628b2609dfbb16f612a586",
    bounds: [
      1.07,
      1.892,
      1.201
    ],
    sizeBytes: 1526904,
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
        "sourcePath": "public/aura-assets/bzGunnerMeshy.f8ff70f5.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:21:55.725Z",
        "evidence": [
          "aura-evidence/meshy/bunkerGunnerMeshy.rights.31c26fbae5b8.json",
          "aura-evidence/meshy/bunkerGunnerMeshy.metadata.64c6aec52425.json",
          "aura-evidence/lift/bzGunnerMeshy.lift.json"
        ],
        "checkedAt": "2026-10-17T09:21:55.725Z",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner Meshy subscription from original text prompts; this file is a derived copy (base-colour texture lifted), see aura-evidence/lift. Not CC0; no exclusivity claimed.",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription"
      },
      "sourcePath": "public/aura-assets/bzGunnerMeshy.f8ff70f5.glb",
      "outputPath": "public/aura-assets/bzGunnerMeshy.f8ff70f5.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.534,
          -0.951,
          -0.595
        ],
        "max": [
          0.539,
          0.95,
          0.606
        ],
        "size": [
          1.072,
          1.901,
          1.202
        ],
        "center": [
          0.003,
          -0.001,
          0.006
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
      "thumbnailUrl": "/aura-assets/bzGunnerMeshy.thumb.svg",
      "quality": "candidate",
      "role": "enemy"
    },
  },
  "bzGuardMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bzGuardMeshy.010bba7b.glb",
    hash: "sha256-010bba7b120564edc2c53486712460c25bda57fbe4a67459b910d57bfe47e5f3",
    bounds: [
      1.012,
      1.9,
      0.813
    ],
    sizeBytes: 1550788,
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
        "sourcePath": "public/aura-assets/bzGuardMeshy.010bba7b.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:16:02.769Z",
        "evidence": [
          "aura-evidence/meshy/bunkerGuardMeshy.rights.31c26fbae5b8.json",
          "aura-evidence/meshy/bunkerGuardMeshy.metadata.853d2faa4c2d.json",
          "aura-evidence/lift/bzGuardMeshy.lift.json"
        ],
        "checkedAt": "2026-10-17T09:16:02.769Z",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner Meshy subscription from original text prompts; this file is a derived copy (base-colour texture lifted), see aura-evidence/lift. Not CC0; no exclusivity claimed.",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription"
      },
      "sourcePath": "public/aura-assets/bzGuardMeshy.010bba7b.glb",
      "outputPath": "public/aura-assets/bzGuardMeshy.010bba7b.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.508,
          -0.952,
          -0.407
        ],
        "max": [
          0.509,
          0.951,
          0.406
        ],
        "size": [
          1.017,
          1.903,
          0.814
        ],
        "center": [
          0,
          0,
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
      "thumbnailUrl": "/aura-assets/bzGuardMeshy.thumb.svg",
      "quality": "candidate",
      "role": "enemy"
    },
  },
  "bzHoundMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bzHoundMeshy.d7ae61c7.glb",
    hash: "sha256-d7ae61c7d38610ed5936935e85771326dbd3a682317c7de243de5afabc62bf5a",
    bounds: [
      0.616,
      1.116,
      1.903
    ],
    sizeBytes: 1536100,
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
        "sourcePath": "public/aura-assets/bzHoundMeshy.d7ae61c7.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:15:35.894Z",
        "evidence": [
          "aura-evidence/meshy/bunkerHoundMeshy.rights.31c26fbae5b8.json",
          "aura-evidence/meshy/bunkerHoundMeshy.metadata.3936eb9253a0.json",
          "aura-evidence/lift/bzHoundMeshy.lift.json"
        ],
        "checkedAt": "2026-10-17T09:15:35.894Z",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner Meshy subscription from original text prompts; this file is a derived copy (base-colour texture lifted), see aura-evidence/lift. Not CC0; no exclusivity claimed.",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription"
      },
      "sourcePath": "public/aura-assets/bzHoundMeshy.d7ae61c7.glb",
      "outputPath": "public/aura-assets/bzHoundMeshy.d7ae61c7.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.308,
          -0.56,
          -0.952
        ],
        "max": [
          0.308,
          0.556,
          0.952
        ],
        "size": [
          0.616,
          1.116,
          1.904
        ],
        "center": [
          0,
          -0.002,
          0
        ],
        "maxDimension": 1.904,
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
      "thumbnailUrl": "/aura-assets/bzHoundMeshy.thumb.svg",
      "quality": "candidate",
      "role": "enemy"
    },
  },
  "bzWardenMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bzWardenMeshy.2020cd5c.glb",
    hash: "sha256-2020cd5cd799faebd44cf473020b15d456b8dcc5265c3e044cf240554a4bff0a",
    bounds: [
      1.007,
      1.902,
      0.588
    ],
    sizeBytes: 1515048,
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
        "sourcePath": "public/aura-assets/bzWardenMeshy.2020cd5c.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:23:06.781Z",
        "evidence": [
          "aura-evidence/meshy/bunkerWardenMeshy.rights.31c26fbae5b8.json",
          "aura-evidence/meshy/bunkerWardenMeshy.metadata.71e651391338.json",
          "aura-evidence/lift/bzWardenMeshy.lift.json"
        ],
        "checkedAt": "2026-10-17T09:23:06.781Z",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner Meshy subscription from original text prompts; this file is a derived copy (base-colour texture lifted), see aura-evidence/lift. Not CC0; no exclusivity claimed.",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription"
      },
      "sourcePath": "public/aura-assets/bzWardenMeshy.2020cd5c.glb",
      "outputPath": "public/aura-assets/bzWardenMeshy.2020cd5c.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.504,
          -0.952,
          -0.283
        ],
        "max": [
          0.506,
          0.951,
          0.307
        ],
        "size": [
          1.01,
          1.903,
          0.59
        ],
        "center": [
          0.001,
          0,
          0.012
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
      "thumbnailUrl": "/aura-assets/bzWardenMeshy.thumb.svg",
      "quality": "candidate",
      "role": "enemy"
    },
  },
  "bzMedicalBox": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bzMedicalBox.2ab52c74.glb",
    hash: "sha256-2ab52c7478b67893b6f9c04924a876f7ac131f10238019b13783118bb0439b4a",
    bounds: [
      0.525,
      0.098,
      0.35
    ],
    sizeBytes: 339728,
    metadata: {
      "materials": [
        "medical_box"
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
        "nodeCount": 6,
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
          "Detected 6 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/bzMedicalBox.2ab52c74.glb",
        "sourcePage": "https://polyhaven.com/a/medical_box",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/medical_box/medical_box_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Ulan Cabanilla",
        "sourceFamily": "poly-haven",
        "attribution": "Ulan Cabanilla / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T17:00:00Z",
        "evidence": [
          "aura-evidence/cc0/bzMedicalBox.source.json"
        ],
        "checkedAt": "2026-11-01T17:00:00Z"
      },
      "sourcePath": "public/aura-assets/bzMedicalBox.2ab52c74.glb",
      "outputPath": "public/aura-assets/bzMedicalBox.2ab52c74.glb",
      "license": "CC0-1.0",
      "author": "Ulan Cabanilla",
      "boundsMetadata": {
        "min": [
          -0.263,
          0,
          -0.175
        ],
        "max": [
          0.263,
          0.098,
          0.175
        ],
        "size": [
          0.525,
          0.098,
          0.35
        ],
        "center": [
          0,
          0.049,
          0
        ],
        "maxDimension": 0.525,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "medical_box",
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
        "medical_box_latch",
        "medical_box_latch_rings",
        "medical_box_lid",
        "medical_box",
        "medical_box_handle",
        "root"
      ],
      "textures": [
        "medical_box_nor_gl",
        "medical_box_diff",
        "medical_box_metal-medical_box_rough"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/bzMedicalBox.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "Bunker Zero owned CC0 prop (GU47 phase 9, D2; source-id poly-haven:medical_box)"
    },
  },
  "bzBulkheadLamp": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bzBulkheadLamp.c4f57213.glb",
    hash: "sha256-c4f57213766a8c188450b1c41c8b80cec40fa9e92c85c1ee25415161ff8190a7",
    bounds: [
      0.273,
      0.43,
      0.14
    ],
    sizeBytes: 504496,
    metadata: {
      "materials": [
        "industrial_wall_lamp",
        "industrial_wall_lamp_glass"
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
        "textureCount": 7,
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
        "sourcePath": "public/aura-assets/bzBulkheadLamp.c4f57213.glb",
        "sourcePage": "https://polyhaven.com/a/industrial_wall_lamp",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/industrial_wall_lamp/industrial_wall_lamp_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Kuutti Siitonen",
        "sourceFamily": "poly-haven",
        "attribution": "Kuutti Siitonen / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T17:00:00Z",
        "evidence": [
          "aura-evidence/cc0/bzBulkheadLamp.source.json"
        ],
        "checkedAt": "2026-11-01T17:00:00Z"
      },
      "sourcePath": "public/aura-assets/bzBulkheadLamp.c4f57213.glb",
      "outputPath": "public/aura-assets/bzBulkheadLamp.c4f57213.glb",
      "license": "CC0-1.0",
      "author": "Kuutti Siitonen",
      "boundsMetadata": {
        "min": [
          -0.137,
          0,
          -0.07
        ],
        "max": [
          0.137,
          0.43,
          0.07
        ],
        "size": [
          0.273,
          0.43,
          0.14
        ],
        "center": [
          0,
          0.215,
          0
        ],
        "maxDimension": 0.43,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "industrial_wall_lamp",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "industrial_wall_lamp_glass",
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
        "industrial_wall_lamp",
        "root"
      ],
      "textures": [
        "industrial_wall_lamp_emissive",
        "industrial_wall_lamp_nor_gl",
        "industrial_wall_lamp_diff",
        "industrial_wall_lamp_rough",
        "industrial_wall_lamp_glass_nor_gl",
        "industrial_wall_lamp_glass_diff-industrial_wall_lamp_glass_alpha",
        "industrial_wall_lamp_glass_rough"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/bzBulkheadLamp.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "Bunker Zero owned CC0 prop (GU47 phase 9, D2; source-id poly-haven:industrial_wall_lamp)"
    },
  },
  "bzMachete": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bzMachete.c4385985.glb",
    hash: "sha256-c43859856d933e6109ba29a0c96f144bc2cb4e53f96c22ab807acc6101fa4cea",
    bounds: [
      0.044,
      0.061,
      0.755
    ],
    sizeBytes: 2423644,
    metadata: {
      "materials": [
        "machete"
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
        "sourcePath": "public/aura-assets/bzMachete.c4385985.glb",
        "sourcePage": "https://polyhaven.com/a/machete",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/machete/machete_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Ulan Cabanilla",
        "sourceFamily": "poly-haven",
        "attribution": "Ulan Cabanilla / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T17:00:00Z",
        "evidence": [
          "aura-evidence/cc0/bzMachete.source.json"
        ],
        "checkedAt": "2026-11-01T17:00:00Z"
      },
      "sourcePath": "public/aura-assets/bzMachete.c4385985.glb",
      "outputPath": "public/aura-assets/bzMachete.c4385985.glb",
      "license": "CC0-1.0",
      "author": "Ulan Cabanilla",
      "boundsMetadata": {
        "min": [
          -0.022,
          0,
          -0.377
        ],
        "max": [
          0.022,
          0.061,
          0.377
        ],
        "size": [
          0.044,
          0.061,
          0.755
        ],
        "center": [
          0,
          0.031,
          0
        ],
        "maxDimension": 0.755,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "machete",
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
        "machete",
        "root"
      ],
      "textures": [
        "machete_nor_gl",
        "machete_diff",
        "machete_metal-machete_rough"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/bzMachete.thumb.svg",
      "quality": "candidate",
      "role": "weapon",
      "suitabilityReason": "Bunker Zero owned CC0 prop (GU47 phase 9, D2; source-id poly-haven:machete)"
    },
  },
  "bzShutterDoor": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bzShutterDoor.be065ed4.glb",
    hash: "sha256-be065ed4c0314cf26835d6671aa1bf35a65a945b4fcac65e6db5278b61ab5df5",
    bounds: [
      1.08,
      2.4,
      0.3
    ],
    sizeBytes: 194716,
    metadata: {
      "materials": [
        "rollershutter_door"
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
        "sourcePath": "public/aura-assets/bzShutterDoor.be065ed4.glb",
        "sourcePage": "https://polyhaven.com/a/rollershutter_door",
        "downloadUrl": "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/rollershutter_door/rollershutter_door_1k.gltf",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "MP",
        "sourceFamily": "poly-haven",
        "attribution": "MP / Poly Haven (CC0)",
        "retrievedAt": "2026-11-01T17:00:00Z",
        "evidence": [
          "aura-evidence/cc0/bzShutterDoor.source.json"
        ],
        "checkedAt": "2026-11-01T17:00:00Z"
      },
      "sourcePath": "public/aura-assets/bzShutterDoor.be065ed4.glb",
      "outputPath": "public/aura-assets/bzShutterDoor.be065ed4.glb",
      "license": "CC0-1.0",
      "author": "MP",
      "boundsMetadata": {
        "min": [
          -0.54,
          0,
          -0.15
        ],
        "max": [
          0.54,
          2.4,
          0.15
        ],
        "size": [
          1.08,
          2.4,
          0.3
        ],
        "center": [
          0,
          1.2,
          0
        ],
        "maxDimension": 2.4,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "rollershutter_door",
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
        "rollershutter_door",
        "root"
      ],
      "textures": [
        "rollershutter_door_nor_gl",
        "rollershutter_door_diff",
        "rollershutter_door_metal-rollershutter_door_rough"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/bzShutterDoor.thumb.svg",
      "quality": "candidate",
      "role": "world",
      "suitabilityReason": "Bunker Zero owned CC0 prop (GU47 phase 9, D2; source-id poly-haven:rollershutter_door)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
