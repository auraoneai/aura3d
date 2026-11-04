// Thermal Drift's own asset manifest: the 26 admitted `heatsink*` models, copied verbatim from the root catalog
// (src/aura-assets.ts, generated from aura.assets.json). Importing only these keeps the 2.6 MB shared catalog
// chunk out of this page (release audit RH-06). Regenerate when a heatsink entry changes in aura.assets.json.
import { defineAuraAssets, type AuraAssetDefinition, type AuraAssetRef } from "@aura3d/engine";

const definitions = {
  // GU47 WP-36 (thermalArchIron): Meshy retexture of heatsinkArch (same mesh proportions), admitted with
  // `aura3d assets import-meshy --prefix heatsink --name thermalArchIron` (rights row in aura-evidence/meshy).
  "heatsink_thermalArchIron": {
    type: "model",
    format: "glb",
    // Route-local (the shared root catalog is never written by an isolated Meshy import): lives in this app's
    // public/aura-assets and ships through copyRouteLocalAuraAssets. The URL stays root-relative: an absolute
    // `new URL(..., import.meta.url)` is a remote URL to the production bridge, and a model whose manifest path
    // is not public/aura-assets/ is then `unsafe-url`, which blocks the whole scene (RENDERER_MOUNT_FAILED).
    url: "/aura-assets/heatsink_thermalArchIron.7d727eff.glb",
    hash: "sha256-7d727eff8025a6e9e549187ad06a7b13420fc2103da26f39d26606a881c8a083",
    bounds: [
      2,
      1.913,
      0.375
    ],
    sizeBytes: 425876,
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
        "sourcePath": "artifacts/meshy/heatsink_thermalArchIron/model.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-30 through the AuraOne Meshy account via Kiro Prism retextured from an original text style prompt on the game's existing mesh (public/aura-assets/heatsinkArch.9a90ebd4.glb) (GU47 WP-36, heatsink/thermalArchIron). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-30T08:59:38.033Z",
        "evidence": [
          "aura-evidence/meshy/heatsink_thermalArchIron.rights.c18b34e24299.json",
          "aura-evidence/meshy/heatsink_thermalArchIron.metadata.0d5d5d44e14c.json",
          "wp36:artifacts/gu47-meshy/heatsink/thermalArchIron/opt/thumbnail.png"
        ],
        "checkedAt": "2026-10-30T08:59:38.033Z"
      },
      "sourcePath": "artifacts/meshy/heatsink_thermalArchIron/model.glb",
      "outputPath": "public/aura-assets/heatsink_thermalArchIron.7d727eff.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -1,
          -0.956,
          -0.187
        ],
        "max": [
          1,
          0.956,
          0.188
        ],
        "size": [
          2,
          1.913,
          0.375
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 2,
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
      "thumbnailUrl": "/aura-assets/heatsink_thermalArchIron.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/heatsink_thermalArchIron.meshy-candidate.20f2ed36.png",
        "kind": "manual-inspection",
        "sha256": "sha256-20f2ed36e70932f8d0b16cb1484f298d48e8eabe072f89ccf84f70199437b567",
        "checkedAt": "2026-10-31T22:04:19.188Z"
      }
    },
  },
  // GU47 wave 1 (thermalTowerLIron): Meshy retexture pass over heatsinkTowerL (HS-08). The pipeline's geometry hash changed, so this
  // is a new mesh with the same proportions, placed with the old prop's fit footprint; `import-meshy --prefix heatsink --name thermalTowerLIron`.
  "heatsink_thermalTowerLIron": {
    type: "model",
    format: "glb",
    // Route-local (the shared root catalog is never written by an isolated Meshy import): lives in this app's
    // public/aura-assets and ships through copyRouteLocalAuraAssets. The URL stays root-relative: an absolute
    // `new URL(..., import.meta.url)` is a remote URL to the production bridge, and a model whose manifest path
    // is not public/aura-assets/ is then `unsafe-url`, which blocks the whole scene (RENDERER_MOUNT_FAILED).
    url: "/aura-assets/heatsink_thermalTowerLIron.048d16d4.glb",
    hash: "sha256-048d16d4a4c8070e58f2100b503f7ecf33fb64892b8e206f00661906d66bd63c",
    bounds: [
      0.394,
      2,
      0.394
    ],
    sizeBytes: 554344,
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
        "sourcePath": "public/aura-assets/heatsink_thermalTowerLIron.048d16d4.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-01 through the AuraOne Meshy account via Kiro Prism retextured from an original text style prompt on the game's existing mesh (public/aura-assets/heatsinkTowerL.48cef1cc.glb) (GU47 WP-36, heatsink/thermalTowerLIron). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-01T21:40:47.605Z",
        "evidence": [
          "aura-evidence/meshy/heatsink_thermalTowerLIron.rights.e99c0dba14d5.json",
          "aura-evidence/meshy/heatsink_thermalTowerLIron.metadata.5c0614a7f578.json",
          "wp36:artifacts/gu47-meshy/heatsink/thermalTowerLIron/opt/thumbnail.png"
        ],
        "checkedAt": "2026-11-01T21:40:47.605Z"
      },
      "sourcePath": "public/aura-assets/heatsink_thermalTowerLIron.048d16d4.glb",
      "outputPath": "public/aura-assets/heatsink_thermalTowerLIron.048d16d4.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.197,
          -1,
          -0.197
        ],
        "max": [
          0.197,
          1,
          0.197
        ],
        "size": [
          0.394,
          2,
          0.394
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 2,
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
      "quality": "candidate",
      "role": "prop"
    },
  },
  // GU47 wave 1 (thermalTowerTIron): Meshy retexture pass over heatsinkTowerT (HS-08). The pipeline's geometry hash changed, so this
  // is a new mesh with the same proportions, placed with the old prop's fit footprint; `import-meshy --prefix heatsink --name thermalTowerTIron`.
  "heatsink_thermalTowerTIron": {
    type: "model",
    format: "glb",
    // Route-local (the shared root catalog is never written by an isolated Meshy import): lives in this app's
    // public/aura-assets and ships through copyRouteLocalAuraAssets. The URL stays root-relative: an absolute
    // `new URL(..., import.meta.url)` is a remote URL to the production bridge, and a model whose manifest path
    // is not public/aura-assets/ is then `unsafe-url`, which blocks the whole scene (RENDERER_MOUNT_FAILED).
    url: "/aura-assets/heatsink_thermalTowerTIron.c7800e77.glb",
    hash: "sha256-c7800e771d73377ec7b2a1bc915c5eaa7bfdad80bb7c86e78c3abb90b917d716",
    bounds: [
      0.575,
      2,
      0.218
    ],
    sizeBytes: 531004,
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
        "sourcePath": "public/aura-assets/heatsink_thermalTowerTIron.c7800e77.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-01 through the AuraOne Meshy account via Kiro Prism retextured from an original text style prompt on the game's existing mesh (public/aura-assets/heatsinkTowerT.3e5f0a0c.glb) (GU47 WP-36, heatsink/thermalTowerTIron). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-01T21:46:03.122Z",
        "evidence": [
          "aura-evidence/meshy/heatsink_thermalTowerTIron.rights.d322e18dfb9f.json",
          "aura-evidence/meshy/heatsink_thermalTowerTIron.metadata.8fa568855752.json",
          "wp36:artifacts/gu47-meshy/heatsink/thermalTowerTIron/opt/thumbnail.png"
        ],
        "checkedAt": "2026-11-01T21:46:03.122Z"
      },
      "sourcePath": "public/aura-assets/heatsink_thermalTowerTIron.c7800e77.glb",
      "outputPath": "public/aura-assets/heatsink_thermalTowerTIron.c7800e77.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.287,
          -1,
          -0.109
        ],
        "max": [
          0.287,
          1,
          0.109
        ],
        "size": [
          0.575,
          2,
          0.218
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 2,
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
      "quality": "candidate",
      "role": "prop"
    },
  },
  // GU47 wave 2 (thermalReactorRing): Meshy text-to-3d set piece (HS-09). Optimized GLB from the wave-2 pipeline, then decimated to 19994 triangles with
  // the coordinator decimate tool (gltf-transform weld + meshopt simplify, textures capped); admitted app-local, root-relative URL (route-local-model-url-unsafe trap).
  "heatsink_thermalReactorRing": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsink_thermalReactorRing.6bbdff56.glb",
    hash: "sha256-6bbdff56c902ad53601b4f76830415b2857db50a6c549cf3799104afd266dae0",
    bounds: [
      1.901,
      1.561,
      1.188
    ],
    sizeBytes: 1177964,
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
        "sourcePath": "public/aura-assets/heatsink_thermalReactorRing.6bbdff56.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, heatsink/thermalReactorRing). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:23:59.691Z",
        "evidence": [
          "aura-evidence/meshy/heatsink_thermalReactorRing.rights.4e12cfad6a1b.json",
          "aura-evidence/meshy/heatsink_thermalReactorRing.metadata.275adb88aeec.json",
          "wave2:artifacts/gu47-meshy/heatsink/thermalReactorRing/opt/thumbnail.png"
        ],
        "checkedAt": "2026-11-04T04:23:59.691Z"
      },
      "sourcePath": "public/aura-assets/heatsink_thermalReactorRing.6bbdff56.glb",
      "outputPath": "public/aura-assets/heatsink_thermalReactorRing.6bbdff56.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.951,
          -0.781,
          -0.594
        ],
        "max": [
          0.95,
          0.78,
          0.593
        ],
        "size": [
          1.901,
          1.561,
          1.188
        ],
        "center": [
          -0.001,
          0,
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
      "quality": "candidate",
      "role": "prop"
    },
  },
  // GU47 wave 2 (thermalLadleCrane): Meshy text-to-3d set piece (HS-09). Optimized GLB from the wave-2 pipeline, then decimated to 16198 triangles with
  // the coordinator decimate tool (gltf-transform weld + meshopt simplify, textures capped); admitted app-local, root-relative URL (route-local-model-url-unsafe trap).
  "heatsink_thermalLadleCrane": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsink_thermalLadleCrane.783973a2.glb",
    hash: "sha256-783973a24b62ff75d70700f7e9e16badff9abd24b4c58556b3abeb72495d57d4",
    bounds: [
      1.084,
      1.904,
      0.966
    ],
    sizeBytes: 1392716,
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
        "sourcePath": "public/aura-assets/heatsink_thermalLadleCrane.783973a2.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, heatsink/thermalLadleCrane). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:21:12.287Z",
        "evidence": [
          "aura-evidence/meshy/heatsink_thermalLadleCrane.rights.2c2f8df6d7e6.json",
          "aura-evidence/meshy/heatsink_thermalLadleCrane.metadata.001412584bb0.json",
          "wave2:artifacts/gu47-meshy/heatsink/thermalLadleCrane/opt/thumbnail.png"
        ],
        "checkedAt": "2026-11-04T04:21:12.287Z"
      },
      "sourcePath": "public/aura-assets/heatsink_thermalLadleCrane.783973a2.glb",
      "outputPath": "public/aura-assets/heatsink_thermalLadleCrane.783973a2.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.53,
          -0.952,
          -0.484
        ],
        "max": [
          0.554,
          0.951,
          0.482
        ],
        "size": [
          1.084,
          1.904,
          0.966
        ],
        "center": [
          0.012,
          0,
          -0.001
        ],
        "maxDimension": 1.904,
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
      "quality": "candidate",
      "role": "prop"
    },
  },
  // GU47 wave 2 (thermalCoolingTower): Meshy text-to-3d set piece (HS-09). Optimized GLB from the wave-2 pipeline, then decimated to 19968 triangles with
  // the coordinator decimate tool (gltf-transform weld + meshopt simplify, textures capped); admitted app-local, root-relative URL (route-local-model-url-unsafe trap).
  "heatsink_thermalCoolingTower": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsink_thermalCoolingTower.3c6a9a5b.glb",
    hash: "sha256-3c6a9a5b3c1bb91c2a911359f1f782593addc23cea57b7959c91ce048867c290",
    bounds: [
      1.901,
      1.487,
      1.22
    ],
    sizeBytes: 1267556,
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
        "sourcePath": "public/aura-assets/heatsink_thermalCoolingTower.3c6a9a5b.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, heatsink/thermalCoolingTower). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:20:55.751Z",
        "evidence": [
          "aura-evidence/meshy/heatsink_thermalCoolingTower.rights.9ac7a30adcb3.json",
          "aura-evidence/meshy/heatsink_thermalCoolingTower.metadata.d5a0670b0303.json",
          "wave2:artifacts/gu47-meshy/heatsink/thermalCoolingTower/opt/thumbnail.png"
        ],
        "checkedAt": "2026-11-04T04:20:55.751Z"
      },
      "sourcePath": "public/aura-assets/heatsink_thermalCoolingTower.3c6a9a5b.glb",
      "outputPath": "public/aura-assets/heatsink_thermalCoolingTower.3c6a9a5b.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.95,
          -0.744,
          -0.622
        ],
        "max": [
          0.951,
          0.743,
          0.598
        ],
        "size": [
          1.901,
          1.487,
          1.22
        ],
        "center": [
          0,
          0,
          -0.012
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
      "quality": "candidate",
      "role": "prop"
    },
  },
  // GU47 wave 2 (thermalSmokestacks): Meshy text-to-3d set piece (HS-09). Optimized GLB from the wave-2 pipeline, then decimated to 24712 triangles with
  // the coordinator decimate tool (gltf-transform weld + meshopt simplify, textures capped); admitted app-local, root-relative URL (route-local-model-url-unsafe trap).
  "heatsink_thermalSmokestacks": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsink_thermalSmokestacks.f7a75986.glb",
    hash: "sha256-f7a759861eb00b451c4e3b8b3df03f32bf68962274907900a669f32cf22c6c12",
    bounds: [
      1.858,
      1.601,
      0.659
    ],
    sizeBytes: 1293484,
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
        "sourcePath": "public/aura-assets/heatsink_thermalSmokestacks.f7a75986.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, heatsink/thermalSmokestacks). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:21:46.554Z",
        "evidence": [
          "aura-evidence/meshy/heatsink_thermalSmokestacks.rights.c072f5fddd45.json",
          "aura-evidence/meshy/heatsink_thermalSmokestacks.metadata.ee7b4da12d80.json",
          "wave2:artifacts/gu47-meshy/heatsink/thermalSmokestacks/opt/thumbnail.png"
        ],
        "checkedAt": "2026-11-04T04:21:46.554Z"
      },
      "sourcePath": "public/aura-assets/heatsink_thermalSmokestacks.f7a75986.glb",
      "outputPath": "public/aura-assets/heatsink_thermalSmokestacks.f7a75986.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.916,
          -0.806,
          -0.322
        ],
        "max": [
          0.942,
          0.795,
          0.337
        ],
        "size": [
          1.858,
          1.601,
          0.659
        ],
        "center": [
          0.013,
          -0.005,
          0.007
        ],
        "maxDimension": 1.858,
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
      "quality": "candidate",
      "role": "prop"
    },
  },
  // GU47 wave 2 (thermalWaterTower): Meshy text-to-3d set piece (HS-09). Optimized GLB from the wave-2 pipeline, then decimated to 20000 triangles with
  // the coordinator decimate tool (gltf-transform weld + meshopt simplify, textures capped); admitted app-local, root-relative URL (route-local-model-url-unsafe trap).
  "heatsink_thermalWaterTower": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsink_thermalWaterTower.2c76aeab.glb",
    hash: "sha256-2c76aeab607ea365a4f8613ef5028036c4d425aa50d24329fb30e3c111b0e5f6",
    bounds: [
      1.412,
      1.903,
      1.311
    ],
    sizeBytes: 1194988,
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
        "sourcePath": "public/aura-assets/heatsink_thermalWaterTower.2c76aeab.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, heatsink/thermalWaterTower). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:22:41.582Z",
        "evidence": [
          "aura-evidence/meshy/heatsink_thermalWaterTower.rights.ee8a7374141d.json",
          "aura-evidence/meshy/heatsink_thermalWaterTower.metadata.2f881ce25d1d.json",
          "wave2:artifacts/gu47-meshy/heatsink/thermalWaterTower/opt/thumbnail.png"
        ],
        "checkedAt": "2026-11-04T04:22:41.582Z"
      },
      "sourcePath": "public/aura-assets/heatsink_thermalWaterTower.2c76aeab.glb",
      "outputPath": "public/aura-assets/heatsink_thermalWaterTower.2c76aeab.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.707,
          -0.952,
          -0.656
        ],
        "max": [
          0.705,
          0.951,
          0.655
        ],
        "size": [
          1.412,
          1.903,
          1.311
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
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "quality": "candidate",
      "role": "prop"
    },
  },
  "heatsinkArch": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkArch.9a90ebd4.glb",
    hash: "sha256-9a90ebd4e8b1497419de91f0c1fddad5770abbd8107e5e13d685fd0e4577fc30",
    bounds: [
      32,
      30.6,
      6
    ],
    sizeBytes: 38716,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkArch.9a90ebd4.glb",
      "boundsMetadata": {
        "min": [
          -16,
          0,
          -3
        ],
        "max": [
          16,
          30.6,
          3
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkBarrierA": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkBarrierA.ac31de34.glb",
    hash: "sha256-ac31de343a01d6fa614d2c8a48a7168a71b4b2ee1edec9e31cdf327805502570",
    bounds: [
      0.98,
      1.1,
      4.36
    ],
    sizeBytes: 18436,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkBarrierA.ac31de34.glb",
      "boundsMetadata": {
        "min": [
          -0.49,
          0,
          -2.18
        ],
        "max": [
          0.49,
          1.1,
          2.18
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkBoostPad": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkBoostPad.e58b4f3c.glb",
    hash: "sha256-e58b4f3ccba2ddefe11ae011f2ae5c3b24ee7688c89b67466f1adb32e0058791",
    bounds: [
      6.2,
      0.24,
      8.2
    ],
    sizeBytes: 13148,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkBoostPad.e58b4f3c.glb",
      "boundsMetadata": {
        "min": [
          -3.1,
          0,
          -4.1
        ],
        "max": [
          3.1,
          0.24,
          4.1
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkCheckpointRing": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkCheckpointRing.67ee1db8.glb",
    hash: "sha256-67ee1db8b200fc46a3161fd816dcf8ce09daf7ebb4efff5674bccb3bc09894f3",
    bounds: [
      25.6,
      29.9176,
      3.935
    ],
    sizeBytes: 33632,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkCheckpointRing.67ee1db8.glb",
      "boundsMetadata": {
        "min": [
          -0.8,
          -14.9588,
          -1.9675
        ],
        "max": [
          24.8,
          14.9588,
          1.9675
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkCoolingCanister": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkCoolingCanister.0199c8d5.glb",
    hash: "sha256-0199c8d53995fac82ce635741325e3d4c4f2c62722cddc647d459ac724febf23",
    bounds: [
      1.12,
      1.67,
      1.08
    ],
    sizeBytes: 29888,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkCoolingCanister.0199c8d5.glb",
      "boundsMetadata": {
        "min": [
          -0.56,
          0,
          -0.54
        ],
        "max": [
          0.56,
          1.67,
          0.54
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkDroneBastion": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneBastion.6a09c499.glb",
    hash: "sha256-6a09c499be6dc1400ebc20c03909045eca7b24e8ec04807fa3ef628bfd444e6d",
    bounds: [
      6.82,
      3.78,
      5.03
    ],
    sizeBytes: 475156,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkDroneBastion.6a09c499.glb",
      "boundsMetadata": {
        "min": [
          -3.41,
          -1.89,
          -2.22
        ],
        "max": [
          3.41,
          1.89,
          2.81
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkDroneNighthawk": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneNighthawk.8113ba27.glb",
    hash: "sha256-8113ba2745e8838c72e10159c0c86c654de4b7b7abf64d1b2160bd51dd121f88",
    bounds: [
      6.04,
      2.53,
      5.72
    ],
    sizeBytes: 629432,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkDroneNighthawk.8113ba27.glb",
      "boundsMetadata": {
        "min": [
          -3.02,
          -1.025,
          -2.65
        ],
        "max": [
          3.02,
          1.505,
          3.07
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkDroneOrion": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneOrion.988f172d.glb",
    hash: "sha256-988f172d50d48550b53dc5152fd7ab7cb1fe6c353299d5068597dda6ad06b03f",
    bounds: [
      7.68,
      3.81,
      5.38
    ],
    sizeBytes: 526924,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkDroneOrion.988f172d.glb",
      "boundsMetadata": {
        "min": [
          -3.84,
          -1.31,
          -2.58
        ],
        "max": [
          3.84,
          2.5,
          2.8
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkDroneRazor": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneRazor.2f28a258.glb",
    hash: "sha256-2f28a2585d95d6119e183b5a943a830333e54d0d978b81cab81e34e081893eec",
    bounds: [
      6.92,
      2.7942,
      6.18
    ],
    sizeBytes: 415004,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkDroneRazor.2f28a258.glb",
      "boundsMetadata": {
        "min": [
          -3.46,
          -0.91,
          -2.77
        ],
        "max": [
          3.46,
          1.8842,
          3.41
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkDroneSpectre": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneSpectre.f66809c1.glb",
    hash: "sha256-f66809c1d473381853c3f627aef9421870f95efd36b133acf6b7b551098b3260",
    bounds: [
      6.7,
      3.0173,
      5.05
    ],
    sizeBytes: 613108,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkDroneSpectre.f66809c1.glb",
      "boundsMetadata": {
        "min": [
          -3.35,
          -1.5573,
          -2.65
        ],
        "max": [
          3.35,
          1.46,
          2.4
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkDroneVolt": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneVolt.f1825d10.glb",
    hash: "sha256-f1825d100a50359f27e61d3584d76c9a2658811544b24ed2ce7e6b05123dddb7",
    bounds: [
      6.46,
      3.0451,
      6.245
    ],
    sizeBytes: 555468,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkDroneVolt.f1825d10.glb",
      "boundsMetadata": {
        "min": [
          -3.23,
          -1.4851,
          -2.685
        ],
        "max": [
          3.23,
          1.56,
          3.56
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkDroneWraith": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneWraith.c0a00195.glb",
    hash: "sha256-c0a001954eab3ce403ccfbad17b2b63bc482bee2224aabe24aac2b001afa6644",
    bounds: [
      5.94,
      2.5395,
      5.98
    ],
    sizeBytes: 627376,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkDroneWraith.c0a00195.glb",
      "boundsMetadata": {
        "min": [
          -2.97,
          -1.025,
          -2.76
        ],
        "max": [
          2.97,
          1.5145,
          3.22
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkExplosiveBarrel": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkExplosiveBarrel.543538b2.glb",
    hash: "sha256-543538b232a58e99c5ec188077452015d95b9173a265d3b85cfabe867a106105",
    bounds: [
      1.38,
      2.04,
      1.3674
    ],
    sizeBytes: 25264,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkExplosiveBarrel.543538b2.glb",
      "boundsMetadata": {
        "min": [
          -0.69,
          0,
          -0.6837
        ],
        "max": [
          0.69,
          2.04,
          0.6837
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkGantryStart": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkGantryStart.7f73743e.glb",
    hash: "sha256-7f73743ed9df9f0a38c1fa92ccf9abf89f78bf94e14369202502f8d9edbd6e11",
    bounds: [
      30,
      21.4,
      5
    ],
    sizeBytes: 38224,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkGantryStart.7f73743e.glb",
      "boundsMetadata": {
        "min": [
          -15,
          0,
          -2.5
        ],
        "max": [
          15,
          21.4,
          2.5
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkHoloBillboard": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkHoloBillboard.d3d7edc7.glb",
    hash: "sha256-d3d7edc7b6babc4b3cec63539f7f38a06bdfa7e6549833bc17232671615baf26",
    bounds: [
      1.1932,
      9,
      13.2
    ],
    sizeBytes: 39476,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkHoloBillboard.d3d7edc7.glb",
      "boundsMetadata": {
        "min": [
          -0.5966,
          0,
          -6.6
        ],
        "max": [
          0.5966,
          9,
          6.6
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkLavaFall": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkLavaFall.71c51eb3.glb",
    hash: "sha256-71c51eb3dc99a1e72b65cf73559cd065510acf0f2e7e8cdf496dc2f0a55d981d",
    bounds: [
      6.5,
      16,
      10
    ],
    sizeBytes: 9760,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkLavaFall.71c51eb3.glb",
      "boundsMetadata": {
        "min": [
          -5,
          0,
          -5
        ],
        "max": [
          1.5,
          16,
          5
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkOverpass": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkOverpass.c6bb161f.glb",
    hash: "sha256-c6bb161fecdc3f00f006903a20433d1905804ce99277686cbcfe9a5ff867687b",
    bounds: [
      80,
      26.2,
      12.2
    ],
    sizeBytes: 26784,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkOverpass.c6bb161f.glb",
      "boundsMetadata": {
        "min": [
          -40,
          0,
          -6
        ],
        "max": [
          40,
          26.2,
          6.2
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkShieldPickup": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkShieldPickup.e3b41a15.glb",
    hash: "sha256-e3b41a1547dc05425a0543dcf1401c62455c852c8c70d5726fad533726842514",
    bounds: [
      1.2934,
      2.16,
      1.2934
    ],
    sizeBytes: 30156,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkShieldPickup.e3b41a15.glb",
      "boundsMetadata": {
        "min": [
          -0.6467,
          0,
          -0.6467
        ],
        "max": [
          0.6467,
          2.16,
          0.6467
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkStatue": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkStatue.7ac4ef8a.glb",
    hash: "sha256-7ac4ef8adf061f176b724eef9671e273b249a9f3940cc01b8856f7771c625e15",
    bounds: [
      5,
      18.772,
      5.175
    ],
    sizeBytes: 18240,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkStatue.7ac4ef8a.glb",
      "boundsMetadata": {
        "min": [
          -2.5,
          0,
          -2.675
        ],
        "max": [
          2.5,
          18.772,
          2.5
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkTowerL": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTowerL.48cef1cc.glb",
    hash: "sha256-48cef1cc6f54ab2e2f2d3a57c51279101b90b0364b4ae57fe7aba0bde6a6d1de",
    bounds: [
      40,
      202.8,
      40
    ],
    sizeBytes: 169752,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkTowerL.48cef1cc.glb",
      "boundsMetadata": {
        "min": [
          -20,
          0,
          -20
        ],
        "max": [
          20,
          202.8,
          20
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkTowerT": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTowerT.3e5f0a0c.glb",
    hash: "sha256-3e5f0a0cbf4bbef5e8b0f7cfdb028fd1f18c4044efc079f44f1a3d943cf9c452",
    bounds: [
      51,
      177.4632,
      19.3
    ],
    sizeBytes: 179916,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkTowerT.3e5f0a0c.glb",
      "boundsMetadata": {
        "min": [
          -25.5,
          0,
          -9.65
        ],
        "max": [
          25.5,
          177.4632,
          9.65
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkTowerX": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTowerX.69d0e56e.glb",
    hash: "sha256-69d0e56ed3fec36848c16ddfec4f3953d52a27fab19eefaa5995cb64639d816c",
    bounds: [
      29.8922,
      183.9244,
      20.1828
    ],
    sizeBytes: 165320,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkTowerX.69d0e56e.glb",
      "boundsMetadata": {
        "min": [
          -14.9461,
          0,
          -10.0914
        ],
        "max": [
          14.9461,
          183.9244,
          10.0914
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkTunnelFrame": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTunnelFrame.1678ba89.glb",
    hash: "sha256-1678ba89fa69338e7d78f9b398d88769ca9e09a6aceb069659d40ebe4013612f",
    bounds: [
      24.4,
      12.15,
      9.4
    ],
    sizeBytes: 27576,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkTunnelFrame.1678ba89.glb",
      "boundsMetadata": {
        "min": [
          -12.2,
          0,
          -8
        ],
        "max": [
          12.2,
          12.15,
          1.4
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkWaterEmitter": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkWaterEmitter.7721726f.glb",
    hash: "sha256-7721726f89ba22c4163eb50d6ecd2111007933fe19b87137c038f290b4ff9758",
    bounds: [
      2.4057,
      3.7011,
      3.2353
    ],
    sizeBytes: 23000,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkWaterEmitter.7721726f.glb",
      "boundsMetadata": {
        "min": [
          -1.1857,
          0,
          -1.875
        ],
        "max": [
          1.22,
          3.7011,
          1.3603
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkWeaponMine": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkWeaponMine.10baedc3.glb",
    hash: "sha256-10baedc3fe86fa6d3320931f5be8a8da682b8267534dcc1cfc272f20ec1f7234",
    bounds: [
      2.293,
      0.7502,
      2.293
    ],
    sizeBytes: 42516,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkWeaponMine.10baedc3.glb",
      "boundsMetadata": {
        "min": [
          -1.1465,
          -0.0352,
          -1.1465
        ],
        "max": [
          1.1465,
          0.715,
          1.1465
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  },
  "heatsinkWeaponShockwave": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkWeaponShockwave.816dd6ed.glb",
    hash: "sha256-816dd6ed1465d9f1e870ed919ccbf61cce77736e7a2394960ad015894fdb7f03",
    bounds: [
      1.2782,
      1.4782,
      1.25
    ],
    sizeBytes: 23880,
    metadata: {
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "morphTargets": [],
      "sourcePath": "public/aura-assets/heatsinkWeaponShockwave.816dd6ed.glb",
      "boundsMetadata": {
        "min": [
          -0.6282,
          -0.6282,
          -0.75
        ],
        "max": [
          0.65,
          0.85,
          0.5
        ]
      },
      "nodeNames": [],
      "dependencies": [],
      "quality": "approved",
      "role": "unknown"
    },
  }
} satisfies Record<string, AuraAssetDefinition>;

export const assets = defineAuraAssets(definitions);
export const HEATSINK_ASSET_KEYS = Object.keys(definitions) as readonly (keyof typeof definitions)[];

// GU47 WP-13 HS-03: the three circuit skies, from the E-A HDRI catalogue (1k copies served at /hdri/<id>_1k.hdr;
// licences in public/hdri/ATTRIBUTION.md; sha256 of the committed files). Kept apart from the 26 models so HEATSINK_ASSET_KEYS stays the model list.
const hdriDefinitions = {
  heatsinkHdriKloppenheim02: { type: "texture", format: "hdr", url: "/hdri/kloppenheim_02_1k.hdr", hash: "sha256-c122eb29c259d8c2ef0093c20130faa67ea216f5a1407c409ee4fc97cd5ba002", sizeBytes: 1744238 },
  heatsinkHdriIndustrialSunset: { type: "texture", format: "hdr", url: "/hdri/industrial_sunset_puresky_1k.hdr", hash: "sha256-988320101df317784b2a869b40b0e23519726bf8827def4ed8eef806df2601cd", sizeBytes: 1180675 },
  heatsinkHdriSpruitSunrise: { type: "texture", format: "hdr", url: "/hdri/spruit_sunrise_1k.hdr", hash: "sha256-3ac30651cde16d2a80521273ec917ba3feca172ea4b842335431201879f39593", sizeBytes: 1527279 }
} satisfies Record<string, AuraAssetDefinition>;

export const hdris = defineAuraAssets(hdriDefinitions);

// GU47 WP-13 HS-07: worn asphalt, ambientCG Asphalt033 (CC0) from the repo library, downsized to 512 px into this app
// (WebP, textures/asphalt033/provenance.json; 157 KB of the 1.5 MB set budget). `new URL(..., import.meta.url)` lets Vite
// fingerprint and ship the files with the route.
const textureDefinitions = {
  heatsinkAsphaltColor: { type: "texture", format: "webp", url: new URL("../textures/asphalt033/color-512.webp", import.meta.url).href, hash: "sha256-330c78ff0be2672746d6bd818ecff520424aa1b62f7d734d2251a00a2e3f3b53", sizeBytes: 11724 },
  heatsinkAsphaltNormal: { type: "texture", format: "webp", url: new URL("../textures/asphalt033/normal-gl-512.webp", import.meta.url).href, hash: "sha256-3f8bf69f92abb855dab0b862e261ffc362b4f4a1af456eeefde422158b272d0e", sizeBytes: 114358 },
  heatsinkAsphaltRoughness: { type: "texture", format: "webp", url: new URL("../textures/asphalt033/roughness-512.webp", import.meta.url).href, hash: "sha256-b19fc248b500b1d185b21b1a9bb2e76ce6a6e8a313976ebbf33a7051225526e1", sizeBytes: 31220 }
} satisfies Record<string, AuraAssetDefinition>;

export const textures = defineAuraAssets(textureDefinitions);

// GU47 WP-13 HS-12: the authored display LUT (src/lut.ts generates it; 132 KB of text, gzip about 40 KB).
const lutDefinitions = {
  heatsinkFoundryLut: { type: "lut", format: "cube", url: new URL("../textures/luts/td-foundry.cube", import.meta.url).href, hash: "sha256-8f423f10cd68cf396f5c54dc791a314d4d5cae3f570d71efead9d0faf8e094ee", sizeBytes: 132859 }
} satisfies Record<string, AuraAssetDefinition>;

export const luts = defineAuraAssets(lutDefinitions);
/** Mean of the asphalt roughness map (provenance.json): a material roughness factor of `target / mean` lands on `target`. */
export const ASPHALT_ROUGHNESS_MEAN = 0.745;
/** Circuit sky texture by catalogue id (src/look.ts `CircuitLook.hdri`). */
export const HDRI_BY_ID: Readonly<Record<"kloppenheim_02" | "industrial_sunset_puresky" | "spruit_sunrise", AuraAssetRef<"texture">>> = {
  kloppenheim_02: hdris.heatsinkHdriKloppenheim02,
  industrial_sunset_puresky: hdris.heatsinkHdriIndustrialSunset,
  spruit_sunrise: hdris.heatsinkHdriSpruitSunrise
};
