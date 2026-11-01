import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "bzPistol": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzGunnerMeshy": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzGuardMeshy": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzHoundMeshy": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzWardenMeshy": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzArmorMeshy": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzCrateMeshy": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzBarrelMeshy": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzMgViewmodel": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzBlastDoor": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzMedicalBox": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzBulkheadLamp": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzMachete": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "bzShutterDoor": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "bzPistol": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bzPistol.ee15a8b3.glb",
    hash: "sha256-ee15a8b3f4c0bc953f9e39b2b456095559f86145d965af4ad3cd7db938115ab5",
    bounds: [
      1.902,
      1.062,
      0.3
    ],
    sizeBytes: 819040,
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
        "sourcePath": "artifacts/meshy/bzPistol/model.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-25 through the AuraOne Meshy account via Kiro Prism from an original text prompt. Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-25T01:48:39.867Z",
        "evidence": [
          "aura-evidence/meshy/bzPistol.rights.a7b9239ece31.json",
          "aura-evidence/meshy/bzPistol.metadata.30184558f678.json",
          "public/aura-assets/bzPistol.meshy-candidate.913f494a.png"
        ],
        "checkedAt": "2026-10-25T01:48:39.867Z"
      },
      "sourcePath": "artifacts/meshy/bzPistol/model.glb",
      "outputPath": "public/aura-assets/bzPistol.ee15a8b3.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.532,
          -0.15
        ],
        "max": [
          0.95,
          0.53,
          0.15
        ],
        "size": [
          1.902,
          1.062,
          0.3
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
      "thumbnailUrl": "/aura-assets/bzPistol.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/bzPistol.meshy-candidate.913f494a.png",
        "kind": "manual-inspection",
        "sha256": "sha256-913f494a3d52649f602e30b61d60f647b3cbcc3cad456a51adec9d2dc943a185",
        "checkedAt": "2026-10-25T01:50:43.639Z"
      }
    },
  },
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
  "bzArmorMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bzArmorMeshy.3e740414.glb",
    hash: "sha256-3e7404142117daf60fdfa24f575c461b615af05e88937be9a03bc710a155c9ce",
    bounds: [
      1.833,
      1.902,
      1.481
    ],
    sizeBytes: 1023652,
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
        "sourcePath": "public/aura-assets/bzArmorMeshy.3e740414.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:20:53.385Z",
        "evidence": [
          "aura-evidence/meshy/bunkerArmorMeshy.rights.31c26fbae5b8.json",
          "aura-evidence/meshy/bunkerArmorMeshy.metadata.53912c9154a4.json",
          "aura-evidence/lift/bzArmorMeshy.lift.json"
        ],
        "checkedAt": "2026-10-17T09:20:53.385Z",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner Meshy subscription from original text prompts; this file is a derived copy (base-colour texture lifted), see aura-evidence/lift. Not CC0; no exclusivity claimed.",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription"
      },
      "sourcePath": "public/aura-assets/bzArmorMeshy.3e740414.glb",
      "outputPath": "public/aura-assets/bzArmorMeshy.3e740414.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.918,
          -0.952,
          -0.736
        ],
        "max": [
          0.916,
          0.951,
          0.745
        ],
        "size": [
          1.833,
          1.902,
          1.481
        ],
        "center": [
          -0.001,
          0,
          0.005
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
      "thumbnailUrl": "/aura-assets/bzArmorMeshy.thumb.svg",
      "quality": "candidate",
      "role": "prop"
    },
  },
  "bzCrateMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bzCrateMeshy.a9944634.glb",
    hash: "sha256-a994463402cde2c5efc8837ce19cecaea29e635c7c701f24b94634e5856a0052",
    bounds: [
      1.903,
      1.248,
      1.381
    ],
    sizeBytes: 1118212,
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
        "sourcePath": "public/aura-assets/bzCrateMeshy.a9944634.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:28:49.456Z",
        "evidence": [
          "aura-evidence/meshy/bunkerCrateMeshy.rights.31c26fbae5b8.json",
          "aura-evidence/meshy/bunkerCrateMeshy.metadata.20130abb8d23.json",
          "aura-evidence/lift/bzCrateMeshy.lift.json"
        ],
        "checkedAt": "2026-10-17T09:28:49.456Z",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner Meshy subscription from original text prompts; this file is a derived copy (base-colour texture lifted), see aura-evidence/lift. Not CC0; no exclusivity claimed.",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription"
      },
      "sourcePath": "public/aura-assets/bzCrateMeshy.a9944634.glb",
      "outputPath": "public/aura-assets/bzCrateMeshy.a9944634.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.625,
          -0.692
        ],
        "max": [
          0.951,
          0.623,
          0.69
        ],
        "size": [
          1.903,
          1.248,
          1.381
        ],
        "center": [
          0,
          -0.001,
          -0.001
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
      "thumbnailUrl": "/aura-assets/bzCrateMeshy.thumb.svg",
      "quality": "candidate",
      "role": "prop"
    },
  },
  "bzBarrelMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bzBarrelMeshy.d98d6f78.glb",
    hash: "sha256-d98d6f7813d008181b9155655653fdc2c21bd7430f6680432b87017b6c71313d",
    bounds: [
      1.207,
      1.903,
      1.206
    ],
    sizeBytes: 1026412,
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
        "sourcePath": "public/aura-assets/bzBarrelMeshy.d98d6f78.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:26:13.001Z",
        "evidence": [
          "aura-evidence/meshy/bunkerBarrelMeshy.rights.31c26fbae5b8.json",
          "aura-evidence/meshy/bunkerBarrelMeshy.metadata.67d43010d08d.json",
          "aura-evidence/lift/bzBarrelMeshy.lift.json"
        ],
        "checkedAt": "2026-10-17T09:26:13.001Z",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner Meshy subscription from original text prompts; this file is a derived copy (base-colour texture lifted), see aura-evidence/lift. Not CC0; no exclusivity claimed.",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription"
      },
      "sourcePath": "public/aura-assets/bzBarrelMeshy.d98d6f78.glb",
      "outputPath": "public/aura-assets/bzBarrelMeshy.d98d6f78.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.604,
          -0.952,
          -0.604
        ],
        "max": [
          0.603,
          0.951,
          0.602
        ],
        "size": [
          1.207,
          1.903,
          1.206
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
      "thumbnailUrl": "/aura-assets/bzBarrelMeshy.thumb.svg",
      "quality": "candidate",
      "role": "prop"
    },
  },
  "bzBlastDoor": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bzBlastDoor.5649d3f7.glb",
    hash: "sha256-5649d3f779f0fa245cc9b3cd1b1eabd84fdf5a383ca09c48b427b2f76056e301",
    bounds: [
      1.901,
      1.902,
      0.721
    ],
    sizeBytes: 1333108,
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
        "sourcePath": "public/aura-assets/bzBlastDoor.5649d3f7.glb",
        "license": "Meshy-generated",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "author": "Aura3D Meshy pipeline (GU47 WP-36)",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-30T08:57:10.012Z",
        "evidence": [
          "aura-evidence/meshy/bzBlastDoor.rights.json",
          "aura-evidence/meshy/bzBlastDoor.metadata.json"
        ],
        "checkedAt": "2026-10-30T08:57:10.012Z"
      },
      "sourcePath": "public/aura-assets/bzBlastDoor.5649d3f7.glb",
      "outputPath": "public/aura-assets/bzBlastDoor.5649d3f7.glb",
      "license": "Meshy-generated",
      "author": "Aura3D Meshy pipeline (GU47 WP-36)",
      "boundsMetadata": {
        "min": [
          -0.951,
          -0.951,
          -0.372
        ],
        "max": [
          0.95,
          0.951,
          0.349
        ],
        "size": [
          1.901,
          1.902,
          0.721
        ],
        "center": [
          -0.001,
          0,
          -0.011
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
      "thumbnailUrl": "/aura-assets/bzBlastDoor.thumb.svg",
      "quality": "candidate",
      "role": "environment",
      "suitabilityReason": "bunker blast door (WP-36 bzBlastDoor, BZ-12)"
    },
  },
  "bzMgViewmodel": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bzMgViewmodel.24108259.glb",
    hash: "sha256-24108259f777a2ae302444ddb3ee112f00793cfbc5651bfd1a04608988eb2c1d",
    bounds: [
      1.8983,
      0.7926,
      0.2006
    ],
    sizeBytes: 807352,
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
        "messages": []
      },
      "provenance": {
        "sourcePath": "artifacts/meshy/corridorPulseRifleMeshy/model.glb",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Aura3D Meshy 3D Pipeline",
        "sourceFamily": "aura3d-original",
        "attribution": "Aura3D Meshy 3D Pipeline",
        "retrievedAt": "2026-10-15T05:00:00.000Z",
        "checkedAt": "2026-10-15T05:00:00.000Z"
      },
      "sourcePath": "artifacts/meshy/corridorPulseRifleMeshy/model.glb",
      "outputPath": "public/aura-assets/bzMgViewmodel.24108259.glb",
      "license": "CC0-1.0",
      "author": "Aura3D Meshy 3D Pipeline",
      "boundsMetadata": {
        "min": [
          -0.9495,
          -0.3973,
          -0.1006
        ],
        "max": [
          0.9488,
          0.3953,
          0.1
        ],
        "size": [
          1.8983,
          0.7926,
          0.2006
        ],
        "center": [
          -0.0004,
          -0.001,
          -0.0003
        ],
        "maxDimension": 1.8983,
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
        "source": "manifest-override",
        "forwardAxis": "+Z",
        "upAxis": "+Y",
        "messages": [
          "Normalized +Z forward."
        ]
      },
      "nodeNames": [
        "output_unwrapped"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/corridorPulseRifleMeshy.thumb.svg",
      "quality": "production",
      "role": "primaryVehicle",
      "suitabilityReason": "Bespoke Meshy 2K PBR 3D hero asset."
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
