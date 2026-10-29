import { defineAuraAssets } from "@aura3d/engine";

/**
 * Iron Crown's stage props from the shared repo catalog (`src/aura-assets.ts`, 600+ entries, about 2.6 MB once bundled).
 * Only the entries the six stages use are kept here, copied verbatim (url, hash, bounds, metadata) except for the remote
 * provenance download links, so the game bundle no longer carries the whole shared catalog (audit row RH-06). The files
 * stay under the shared /aura-assets/ path. tests/unit/iron-crown/stage-assets.test.ts checks that every entry still
 * matches the shared catalog and that every `stageAssets.<id>` used in stages.ts is defined here.
 */
export const stageAssets = defineAuraAssets({
  "auraClashCornerBrazierPylonMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/auraClashCornerBrazierPylonMeshy.108d9df6.glb",
    hash: "sha256-7bfde4b91ba054299e093c29390777e40fd933a9cf97ddd86b0bfc05524422de",
    bounds: [
      0.99,
      1.903,
      0.991
    ],
    sizeBytes: 1207344,
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
        "sourcePath": "artifacts/meshy/aura-clash-corner-pylon-v1/model.glb",
        "license": "Meshy paid private generation terms",
        "licenseName": "Meshy paid private generation terms",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated through the authenticated paid Meshy API account with --max-credits 60 for candidate use (Aura Clash Arena lane boundary corner pylon) under the current Meshy terms; this does not certify release-ready geometry or broader commercial rights.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-14T20:41:04.404Z",
        "evidence": [
          "aura-evidence/meshy/auraClashCornerBrazierPylonMeshy.rights.b940ae66c925.json",
          "aura-evidence/meshy/auraClashCornerBrazierPylonMeshy.metadata.add1fddb77b6.json",
          "public/aura-assets/auraClashCornerBrazierPylonMeshy.meshy-candidate.5dba189c.png"
        ],
        "checkedAt": "2026-10-14T20:41:04.404Z"
      },
      "sourcePath": "artifacts/meshy/aura-clash-corner-pylon-v1/model.glb",
      "outputPath": "public/aura-assets/auraClashCornerBrazierPylonMeshy.108d9df6.glb",
      "license": "Meshy paid private generation terms",
      "boundsMetadata": {
        "min": [
          -0.495,
          -0.952,
          -0.496
        ],
        "max": [
          0.495,
          0.951,
          0.495
        ],
        "size": [
          0.99,
          1.903,
          0.991
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
      "thumbnailUrl": "/aura-assets/auraClashCornerBrazierPylonMeshy.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/auraClashCornerBrazierPylonMeshy.meshy-candidate.5dba189c.png",
        "kind": "manual-inspection",
        "sha256": "sha256-5dba189c41e4727649102bce244aa5ddf635aa6c7a4be0d4ef4ee96990bae9bc",
        "checkedAt": "2026-10-14T21:02:59.667Z"
      }
    },
  },
  "auraClashStageSpeakerTowerMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/auraClashStageSpeakerTowerMeshy.78813e2b.glb",
    hash: "sha256-8278084501f18c1d2dd998f179d160ad3b250718c0c6fd1afa08803a5440d22b",
    bounds: [
      1.901,
      1.371,
      1.9
    ],
    sizeBytes: 1803816,
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
        "sourcePath": "artifacts/meshy/aura-clash-speaker-tower-v1/model.glb",
        "license": "Meshy paid private generation terms",
        "licenseName": "Meshy paid private generation terms",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated through the authenticated paid Meshy API account with --max-credits 60 for candidate use (Aura Clash Arena grounded stage speaker and lighting tower) under the current Meshy terms; this does not certify release-ready geometry or broader commercial rights.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-14T20:43:49.167Z",
        "evidence": [
          "aura-evidence/meshy/auraClashStageSpeakerTowerMeshy.rights.fe9dc517b453.json",
          "aura-evidence/meshy/auraClashStageSpeakerTowerMeshy.metadata.30df4aa7d9b7.json",
          "public/aura-assets/auraClashStageSpeakerTowerMeshy.meshy-candidate.03d89fca.png"
        ],
        "checkedAt": "2026-10-14T20:43:49.167Z"
      },
      "sourcePath": "artifacts/meshy/aura-clash-speaker-tower-v1/model.glb",
      "outputPath": "public/aura-assets/auraClashStageSpeakerTowerMeshy.78813e2b.glb",
      "license": "Meshy paid private generation terms",
      "boundsMetadata": {
        "min": [
          -0.951,
          -0.692,
          -0.952
        ],
        "max": [
          0.951,
          0.679,
          0.948
        ],
        "size": [
          1.901,
          1.371,
          1.9
        ],
        "center": [
          0,
          -0.006,
          -0.002
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
      "thumbnailUrl": "/aura-assets/auraClashStageSpeakerTowerMeshy.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/auraClashStageSpeakerTowerMeshy.meshy-candidate.03d89fca.png",
        "kind": "manual-inspection",
        "sha256": "sha256-03d89fcab68fb21f8eb5845c85a21d44c117530b0f5ac1a4738059fd701b1cd2",
        "checkedAt": "2026-10-14T21:02:33.446Z"
      }
    },
  },
  "auroraFuelDepotTankMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/auroraFuelDepotTankMeshy.2c8aec52.glb",
    hash: "sha256-34ac7757254ddceb6bc2e78aae86a30a05519f7485de7e34393749bbb470ac5e",
    bounds: [
      1.903,
      1.369,
      0.86
    ],
    sizeBytes: 1457144,
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
        "sourcePath": "artifacts/meshy/aurora-fuel-depot-tank-v1/model.glb",
        "license": "Meshy paid private generation terms",
        "licenseName": "Meshy paid private generation terms",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated through the authenticated paid Meshy API account with --max-credits 60 for candidate use (Aurora Lander padside cryogenic fuel depot) under the current Meshy terms; this does not certify release-ready geometry or broader commercial rights.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-14T20:46:15.110Z",
        "evidence": [
          "aura-evidence/meshy/auroraFuelDepotTankMeshy.rights.22dc5b69488a.json",
          "aura-evidence/meshy/auroraFuelDepotTankMeshy.metadata.2386e1d62cb5.json",
          "public/aura-assets/auroraFuelDepotTankMeshy.meshy-candidate.c50bbccb.png"
        ],
        "checkedAt": "2026-10-14T20:46:15.110Z"
      },
      "sourcePath": "artifacts/meshy/aurora-fuel-depot-tank-v1/model.glb",
      "outputPath": "public/aura-assets/auroraFuelDepotTankMeshy.2c8aec52.glb",
      "license": "Meshy paid private generation terms",
      "boundsMetadata": {
        "min": [
          -0.953,
          -0.684,
          -0.431
        ],
        "max": [
          0.95,
          0.684,
          0.429
        ],
        "size": [
          1.903,
          1.369,
          0.86
        ],
        "center": [
          -0.002,
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
      "thumbnailUrl": "/aura-assets/auroraFuelDepotTankMeshy.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/auroraFuelDepotTankMeshy.meshy-candidate.c50bbccb.png",
        "kind": "manual-inspection",
        "sha256": "sha256-c50bbccb2c1b9dfb2e0ebe52a85af4d3544d1176d7bfe297fb8904ef48ac9200",
        "checkedAt": "2026-10-14T21:03:11.495Z"
      }
    },
  },
  "auroraPadBeacon": {
    type: "model",
    format: "glb",
    url: "/aura-assets/auroraPadBeacon.c94a5b6b.glb",
    hash: "sha256-c94a5b6b45fa0c3d52fa5c9b3e863aaa37c540e1d9fb57ec09c46956f4af14ef",
    bounds: [
      0.6,
      0.98,
      0.52
    ],
    sizeBytes: 7948,
    metadata: {
      "materials": [
        "base-material",
        "pylon-material",
        "lamp-material"
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
        "nodeCount": 3,
        "meshCount": 3,
        "materialCount": 3,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "base",
          "pylon",
          "lamp"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 3 nodes across 3 roots."
        ]
      },
      "provenance": {
        "sourcePath": "apps/showcase-aurora-lander/assets/models/auroraPadBeacon.glb",
        "sourcePage": "https://github.com/auraoneai/aura3d/blob/main/apps/showcase-aurora-lander/scripts/build-models.mjs",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Aura3D synthesis",
        "retrievedAt": "2026-08-23T18:00:57Z",
        "checkedAt": "2026-08-23T18:00:57Z"
      },
      "sourcePath": "apps/showcase-aurora-lander/assets/models/auroraPadBeacon.glb",
      "outputPath": "public/aura-assets/auroraPadBeacon.c94a5b6b.glb",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "boundsMetadata": {
        "min": [
          -0.3,
          0,
          -0.26
        ],
        "max": [
          0.3,
          0.98,
          0.26
        ],
        "size": [
          0.6,
          0.98,
          0.52
        ],
        "center": [
          0,
          0.49,
          0
        ],
        "maxDimension": 0.98,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "base-material",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "pylon-material",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "lamp-material",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        }
      ],
      "orientation": {
        "source": "manifest-override",
        "view": "hash-bound-readable-prop-view",
        "assetHash": "sha256-c94a5b6b45fa0c3d52fa5c9b3e863aaa37c540e1d9fb57ec09c46956f4af14ef",
        "generatedBy": "tests/browser/showcase-release-asset-probes.spec.ts root createAuraApp release probe",
        "checkedAt": "2026-08-23T18:02:05.938Z",
        "route": "tests/browser/showcase-release-asset-probe-harness?asset=auroraPadBeacon",
        "renderedProbe": {
          "url": "tests/reports/showcase-release-asset-probes/auroraPadBeacon.png",
          "sha256": "sha256-1b4cb4faa10178a636c554aec3ad001e9f4991d57f0f4bd38a6900b755859eb0",
          "assetHash": "sha256-c94a5b6b45fa0c3d52fa5c9b3e863aaa37c540e1d9fb57ec09c46956f4af14ef",
          "checkedAt": "2026-08-23T18:02:05.938Z",
          "route": "tests/browser/showcase-release-asset-probe-harness?asset=auroraPadBeacon"
        },
        "messages": [
          "The current hash-bound root production-runtime probe proves a readable prop view. No character, vehicle, or weapon forward-axis claim is made, and final route review remains independent."
        ]
      },
      "nodeNames": [
        "base",
        "pylon",
        "lamp"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/auroraPadBeacon.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "Original grounded polar pad beacon with readable base, pylon, and lamp silhouette; paired beacons visibly identify landing zones in current desktop and mobile artifacts.",
      "renderedProbe": {
        "url": "tests/reports/showcase-release-asset-probes/auroraPadBeacon.png",
        "kind": "browser-screenshot",
        "renderer": "createAuraApp @aura3d/engine showcase release asset probe",
        "route": "tests/browser/showcase-release-asset-probe-harness?asset=auroraPadBeacon",
        "sha256": "sha256-1b4cb4faa10178a636c554aec3ad001e9f4991d57f0f4bd38a6900b755859eb0",
        "assetHash": "sha256-c94a5b6b45fa0c3d52fa5c9b3e863aaa37c540e1d9fb57ec09c46956f4af14ef",
        "width": 752,
        "height": 600,
        "nonBlankPixels": 451200,
        "colorBuckets": 23,
        "checkedAt": "2026-08-23T18:02:05.938Z",
        "foregroundBounds": {
          "x": 258,
          "y": 155,
          "width": 239,
          "height": 445
        }
      }
    },
  },
  "billiardsClubChairMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/billiardsClubChairMeshy.29eb7163.glb",
    hash: "sha256-29eb71636fea4cfc852eeeaa2cfdfe26dd09657b971b414e024fb099be9a7760",
    bounds: [
      1.8959,
      1.6033,
      1.8944
    ],
    sizeBytes: 639700,
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
        "sourcePath": "artifacts/meshy/aura-clash-corner-pylon-v1/model.glb",
        "license": "Meshy paid private generation terms",
        "licenseName": "Meshy paid private generation terms",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated through the authenticated paid Meshy API account with --max-credits 60 for candidate use (Aura Clash Arena lane boundary corner pylon) under the current Meshy terms; this does not certify release-ready geometry or broader commercial rights.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-14T20:41:04.404Z",
        "evidence": [
          "aura-evidence/meshy/auraClashCornerBrazierPylonMeshy.rights.b940ae66c925.json",
          "aura-evidence/meshy/auraClashCornerBrazierPylonMeshy.metadata.add1fddb77b6.json",
          "public/aura-assets/auraClashCornerBrazierPylonMeshy.meshy-candidate.5dba189c.png"
        ],
        "checkedAt": "2026-10-14T20:41:04.404Z"
      },
      "sourcePath": "artifacts/meshy/turboHeroRaceCarMeshy/model.glb",
      "outputPath": "public/aura-assets/billiardsClubChairMeshy.29eb7163.glb",
      "license": "Meshy paid private generation terms",
      "boundsMetadata": {
        "min": [
          -0.9488,
          -0.8029,
          -0.948
        ],
        "max": [
          0.9471,
          0.8004,
          0.9464
        ],
        "size": [
          1.8959,
          1.6033,
          1.8944
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 1.8959,
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
          "Normalized +Z forward and grounded min-Y=0 for turboHeroRaceCarMeshy."
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
      "thumbnailUrl": "/aura-assets/billiardsClubChairMeshy.thumb.svg",
      "quality": "production",
      "role": "primaryVehicle",
      "renderedProbe": {
        "url": "/aura-assets/auraClashCornerBrazierPylonMeshy.meshy-candidate.5dba189c.png",
        "kind": "manual-inspection",
        "sha256": "sha256-5dba189c41e4727649102bce244aa5ddf635aa6c7a4be0d4ef4ee96990bae9bc",
        "checkedAt": "2026-10-14T21:02:59.667Z"
      }
    },
  },
  "bunkerBarrelMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bunkerBarrelMeshy.d1eec7e3.glb",
    hash: "sha256-9235ea2c824c4fed713ec57b119a81550e85cd5db09b008736f10703db3ef196",
    bounds: [
      1.207,
      1.903,
      1.206
    ],
    sizeBytes: 997844,
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
        "sourcePath": "artifacts/meshy/bunker-barrel/model.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:26:13.001Z",
        "evidence": [
          "aura-evidence/meshy/bunkerBarrelMeshy.rights.31c26fbae5b8.json",
          "aura-evidence/meshy/bunkerBarrelMeshy.metadata.67d43010d08d.json",
          "public/aura-assets/bunkerBarrelMeshy.meshy-candidate.fa18ae1e.png"
        ],
        "checkedAt": "2026-10-17T09:26:13.001Z"
      },
      "sourcePath": "artifacts/meshy/bunker-barrel/model.glb",
      "outputPath": "public/aura-assets/bunkerBarrelMeshy.d1eec7e3.glb",
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
      "thumbnailUrl": "/aura-assets/bunkerBarrelMeshy.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/bunkerBarrelMeshy.meshy-candidate.fa18ae1e.png",
        "kind": "manual-inspection",
        "sha256": "sha256-fa18ae1e069351123c32ead199cbc1888987deebdd7a5325a250fc713d8593f7",
        "checkedAt": "2026-10-17T10:24:42.669Z"
      }
    },
  },
  "bunkerCrateMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bunkerCrateMeshy.6699a89d.glb",
    hash: "sha256-bcc87cf2eafece1ba8682167efefd3a82d250792a1b64617b9db47efe7541722",
    bounds: [
      1.903,
      1.248,
      1.381
    ],
    sizeBytes: 1084372,
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
        "sourcePath": "artifacts/meshy/bunker-crate/model.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:28:49.456Z",
        "evidence": [
          "aura-evidence/meshy/bunkerCrateMeshy.rights.31c26fbae5b8.json",
          "aura-evidence/meshy/bunkerCrateMeshy.metadata.20130abb8d23.json",
          "public/aura-assets/bunkerCrateMeshy.meshy-candidate.a05b143d.png"
        ],
        "checkedAt": "2026-10-17T09:28:49.456Z"
      },
      "sourcePath": "artifacts/meshy/bunker-crate/model.glb",
      "outputPath": "public/aura-assets/bunkerCrateMeshy.6699a89d.glb",
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
      "thumbnailUrl": "/aura-assets/bunkerCrateMeshy.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/bunkerCrateMeshy.meshy-candidate.a05b143d.png",
        "kind": "manual-inspection",
        "sha256": "sha256-a05b143d32d5b34317831ef3ebb443d50b3f96e5dadd9bc453aa17f2142439c2",
        "checkedAt": "2026-10-17T10:24:43.318Z"
      }
    },
  },
  "clashDragonStatueMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/clashDragonStatueMeshy.fbf08315.glb",
    hash: "sha256-fbf0831582ce2001b993f4e51b22d9e88493585b3bdd25801b2d089e1d01a839",
    bounds: [
      0.6555,
      1.8973,
      1.0329
    ],
    sizeBytes: 794028,
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
        "sourcePath": "artifacts/meshy/aura-clash-corner-pylon-v1/model.glb",
        "license": "Meshy paid private generation terms",
        "licenseName": "Meshy paid private generation terms",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated through the authenticated paid Meshy API account with --max-credits 60 for candidate use (Aura Clash Arena lane boundary corner pylon) under the current Meshy terms; this does not certify release-ready geometry or broader commercial rights.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-14T20:41:04.404Z",
        "evidence": [
          "aura-evidence/meshy/auraClashCornerBrazierPylonMeshy.rights.b940ae66c925.json",
          "aura-evidence/meshy/auraClashCornerBrazierPylonMeshy.metadata.add1fddb77b6.json",
          "public/aura-assets/auraClashCornerBrazierPylonMeshy.meshy-candidate.5dba189c.png"
        ],
        "checkedAt": "2026-10-14T20:41:04.404Z"
      },
      "sourcePath": "artifacts/meshy/turboHeroRaceCarMeshy/model.glb",
      "outputPath": "public/aura-assets/clashDragonStatueMeshy.fbf08315.glb",
      "license": "Meshy paid private generation terms",
      "boundsMetadata": {
        "min": [
          -0.3288,
          -0.9494,
          -0.5182
        ],
        "max": [
          0.3267,
          0.9479,
          0.5147
        ],
        "size": [
          0.6555,
          1.8973,
          1.0329
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 1.8973,
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
          "Normalized +Z forward and grounded min-Y=0 for turboHeroRaceCarMeshy."
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
      "thumbnailUrl": "/aura-assets/clashDragonStatueMeshy.thumb.svg",
      "quality": "production",
      "role": "primaryVehicle",
      "renderedProbe": {
        "url": "/aura-assets/auraClashCornerBrazierPylonMeshy.meshy-candidate.5dba189c.png",
        "kind": "manual-inspection",
        "sha256": "sha256-5dba189c41e4727649102bce244aa5ddf635aa6c7a4be0d4ef4ee96990bae9bc",
        "checkedAt": "2026-10-14T21:02:59.667Z"
      }
    },
  },
  "courierDeliveryKioskMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/courierDeliveryKioskMeshy.71266ea6.glb",
    hash: "sha256-a7d0b7898d3e6b2b9ce013f5a351a01e248e8dc02096b1dd68587be8b6c901b4",
    bounds: [
      1.901,
      0.94,
      1.085
    ],
    sizeBytes: 1050448,
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
        "sourcePath": "artifacts/meshy/courier-delivery-kiosk-v1/model.glb",
        "license": "Meshy paid private generation terms",
        "licenseName": "Meshy paid private generation terms",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated through the authenticated paid Meshy API account with --max-credits 60 for candidate use (Courier Rush curbside parcel pickup and drop-off kiosk) under the current Meshy terms; this does not certify release-ready geometry or broader commercial rights.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-14T20:53:59.113Z",
        "evidence": [
          "aura-evidence/meshy/courierDeliveryKioskMeshy.rights.d566333308b5.json",
          "aura-evidence/meshy/courierDeliveryKioskMeshy.metadata.8a250e61a8be.json",
          "public/aura-assets/courierDeliveryKioskMeshy.meshy-candidate.8b28d7f0.png"
        ],
        "checkedAt": "2026-10-14T20:53:59.113Z"
      },
      "sourcePath": "artifacts/meshy/courier-delivery-kiosk-v1/model.glb",
      "outputPath": "public/aura-assets/courierDeliveryKioskMeshy.71266ea6.glb",
      "license": "Meshy paid private generation terms",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.47,
          -0.542
        ],
        "max": [
          0.949,
          0.47,
          0.542
        ],
        "size": [
          1.901,
          0.94,
          1.085
        ],
        "center": [
          -0.002,
          0,
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
      "thumbnailUrl": "/aura-assets/courierDeliveryKioskMeshy.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/courierDeliveryKioskMeshy.meshy-candidate.8b28d7f0.png",
        "kind": "manual-inspection",
        "sha256": "sha256-8b28d7f0a789aed93b6d913c1f853301918d3c2853e326c6a1a3b20ee27ec4a9",
        "checkedAt": "2026-10-14T21:03:14.988Z"
      }
    },
  },
  "courierNeonStorefrontMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/courierNeonStorefrontMeshy.efb0a37b.glb",
    hash: "sha256-efb0a37b75c80fea7ed6a7ccee46bce0a13b018047b8a9f554c6901c73105c17",
    bounds: [
      1.8416,
      1.8984,
      1.4554
    ],
    sizeBytes: 978772,
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
        "sourcePath": "artifacts/meshy/aura-clash-corner-pylon-v1/model.glb",
        "license": "Meshy paid private generation terms",
        "licenseName": "Meshy paid private generation terms",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated through the authenticated paid Meshy API account with --max-credits 60 for candidate use (Aura Clash Arena lane boundary corner pylon) under the current Meshy terms; this does not certify release-ready geometry or broader commercial rights.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-14T20:41:04.404Z",
        "evidence": [
          "aura-evidence/meshy/auraClashCornerBrazierPylonMeshy.rights.b940ae66c925.json",
          "aura-evidence/meshy/auraClashCornerBrazierPylonMeshy.metadata.add1fddb77b6.json",
          "public/aura-assets/auraClashCornerBrazierPylonMeshy.meshy-candidate.5dba189c.png"
        ],
        "checkedAt": "2026-10-14T20:41:04.404Z"
      },
      "sourcePath": "artifacts/meshy/turboHeroRaceCarMeshy/model.glb",
      "outputPath": "public/aura-assets/courierNeonStorefrontMeshy.efb0a37b.glb",
      "license": "Meshy paid private generation terms",
      "boundsMetadata": {
        "min": [
          -0.9188,
          -0.9508,
          -0.7286
        ],
        "max": [
          0.9228,
          0.9476,
          0.7268
        ],
        "size": [
          1.8416,
          1.8984,
          1.4554
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 1.8984,
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
          "Normalized +Z forward and grounded min-Y=0 for turboHeroRaceCarMeshy."
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
      "thumbnailUrl": "/aura-assets/courierNeonStorefrontMeshy.thumb.svg",
      "quality": "production",
      "role": "primaryVehicle",
      "renderedProbe": {
        "url": "/aura-assets/auraClashCornerBrazierPylonMeshy.meshy-candidate.5dba189c.png",
        "kind": "manual-inspection",
        "sha256": "sha256-5dba189c41e4727649102bce244aa5ddf635aa6c7a4be0d4ef4ee96990bae9bc",
        "checkedAt": "2026-10-14T21:02:59.667Z"
      }
    },
  },
  "galleryMarbleBustExhibitMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/galleryMarbleBustExhibitMeshy.a17a57de.glb",
    hash: "sha256-8e4ebfe34b6bac5451125c74d3d1c47675b9e24ed394fd319bce53b58db89814",
    bounds: [
      1.23,
      1.903,
      1.232
    ],
    sizeBytes: 792920,
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
        "sourcePath": "artifacts/meshy/gallery-marble-bust-exhibit-v1/model.glb",
        "license": "Meshy paid private generation terms",
        "licenseName": "Meshy paid private generation terms",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated through the authenticated paid Meshy API account with --max-credits 60 for candidate use (Gallery Shift museum rotunda centerpiece exhibit) under the current Meshy terms; this does not certify release-ready geometry or broader commercial rights.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-14T20:59:14.719Z",
        "evidence": [
          "aura-evidence/meshy/galleryMarbleBustExhibitMeshy.rights.400d965e31f3.json",
          "aura-evidence/meshy/galleryMarbleBustExhibitMeshy.metadata.9d022584f775.json",
          "public/aura-assets/galleryMarbleBustExhibitMeshy.meshy-candidate.f49d9adf.png"
        ],
        "checkedAt": "2026-10-14T20:59:14.719Z"
      },
      "sourcePath": "artifacts/meshy/gallery-marble-bust-exhibit-v1/model.glb",
      "outputPath": "public/aura-assets/galleryMarbleBustExhibitMeshy.a17a57de.glb",
      "license": "Meshy paid private generation terms",
      "boundsMetadata": {
        "min": [
          -0.615,
          -0.952,
          -0.617
        ],
        "max": [
          0.615,
          0.951,
          0.615
        ],
        "size": [
          1.23,
          1.903,
          1.232
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
      "thumbnailUrl": "/aura-assets/galleryMarbleBustExhibitMeshy.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/galleryMarbleBustExhibitMeshy.meshy-candidate.f49d9adf.png",
        "kind": "manual-inspection",
        "sha256": "sha256-f49d9adf473f6386883e8d580036d1e5138585839bbc2ec35b217c3306e827cd",
        "checkedAt": "2026-10-14T21:03:19.141Z"
      }
    },
  },
  "gullsiegeBarrelMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/gullsiegeBarrelMeshy.240ded9a.glb",
    hash: "sha256-9b79a25f31b700f5b948d30d37db7b2959a2776a0d8a12c03678623170ff3648",
    bounds: [
      1.903,
      1.549,
      1.902
    ],
    sizeBytes: 1197288,
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
        "sourcePath": "artifacts/meshy/gullsiege-barrel/model.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:37:36.367Z",
        "evidence": [
          "aura-evidence/meshy/gullsiegeBarrelMeshy.rights.31c26fbae5b8.json",
          "aura-evidence/meshy/gullsiegeBarrelMeshy.metadata.28619e71016f.json",
          "public/aura-assets/gullsiegeBarrelMeshy.meshy-candidate.2e691c7f.png"
        ],
        "checkedAt": "2026-10-17T09:37:36.367Z"
      },
      "sourcePath": "artifacts/meshy/gullsiege-barrel/model.glb",
      "outputPath": "public/aura-assets/gullsiegeBarrelMeshy.240ded9a.glb",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.775,
          -0.952
        ],
        "max": [
          0.951,
          0.774,
          0.951
        ],
        "size": [
          1.903,
          1.549,
          1.902
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
      "thumbnailUrl": "/aura-assets/gullsiegeBarrelMeshy.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/gullsiegeBarrelMeshy.meshy-candidate.2e691c7f.png",
        "kind": "manual-inspection",
        "sha256": "sha256-2e691c7fd40c0645d24c8686149bc00a95e24ffa0ff66affb29ad0dc49182595",
        "checkedAt": "2026-10-17T10:24:47.226Z"
      }
    },
  },
  "gullsiegeCrateMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/gullsiegeCrateMeshy.d802d835.glb",
    hash: "sha256-3795b3f2d607d9790c111f57d6f2eb4bfc0d7f138b41559c023846c604e8febc",
    bounds: [
      1.903,
      1.349,
      1.382
    ],
    sizeBytes: 1286228,
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
        "sourcePath": "artifacts/meshy/gullsiege-crate/model.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:34:25.671Z",
        "evidence": [
          "aura-evidence/meshy/gullsiegeCrateMeshy.rights.31c26fbae5b8.json",
          "aura-evidence/meshy/gullsiegeCrateMeshy.metadata.bcfe9414c400.json",
          "public/aura-assets/gullsiegeCrateMeshy.meshy-candidate.1053c2c4.png"
        ],
        "checkedAt": "2026-10-17T09:34:25.671Z"
      },
      "sourcePath": "artifacts/meshy/gullsiege-crate/model.glb",
      "outputPath": "public/aura-assets/gullsiegeCrateMeshy.d802d835.glb",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.675,
          -0.692
        ],
        "max": [
          0.951,
          0.674,
          0.691
        ],
        "size": [
          1.903,
          1.349,
          1.382
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
      "thumbnailUrl": "/aura-assets/gullsiegeCrateMeshy.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/gullsiegeCrateMeshy.meshy-candidate.1053c2c4.png",
        "kind": "manual-inspection",
        "sha256": "sha256-1053c2c46317c99707d0e4664140dfa379b54a0f8e24cb226eac17365a320a2a",
        "checkedAt": "2026-10-17T10:24:46.568Z"
      }
    },
  },
  "gullsiegeGatehouseMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/gullsiegeGatehouseMeshy.c54a43ad.glb",
    hash: "sha256-2bf39e109daa3dd935ba81d0e3f9483107c39057366681ed7ca0cb8ce1672d7e",
    bounds: [
      1.902,
      1.111,
      0.467
    ],
    sizeBytes: 1159048,
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
        "sourcePath": "artifacts/meshy/gullsiege-gatehouse/model.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:36:41.420Z",
        "evidence": [
          "aura-evidence/meshy/gullsiegeGatehouseMeshy.rights.31c26fbae5b8.json",
          "aura-evidence/meshy/gullsiegeGatehouseMeshy.metadata.7ed147c3a234.json",
          "public/aura-assets/gullsiegeGatehouseMeshy.meshy-candidate.1914261d.png"
        ],
        "checkedAt": "2026-10-17T09:36:41.420Z"
      },
      "sourcePath": "artifacts/meshy/gullsiege-gatehouse/model.glb",
      "outputPath": "public/aura-assets/gullsiegeGatehouseMeshy.c54a43ad.glb",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.556,
          -0.239
        ],
        "max": [
          0.951,
          0.555,
          0.228
        ],
        "size": [
          1.902,
          1.111,
          0.467
        ],
        "center": [
          -0.001,
          0,
          -0.005
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
      "thumbnailUrl": "/aura-assets/gullsiegeGatehouseMeshy.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/gullsiegeGatehouseMeshy.meshy-candidate.1914261d.png",
        "kind": "manual-inspection",
        "sha256": "sha256-1914261d98f17d5cc2a1cff5110b9757b851e6a0291e24ab1f45a9d3816fc41d",
        "checkedAt": "2026-10-17T10:24:48.529Z"
      }
    },
  },
  "gullsiegeWatchtowerMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/gullsiegeWatchtowerMeshy.546ee761.glb",
    hash: "sha256-c9af151e2d83350c4789bd5619202555c1dd2a13b896506a3b43d83b7128f8a6",
    bounds: [
      1.096,
      1.902,
      1.272
    ],
    sizeBytes: 1190360,
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
        "sourcePath": "artifacts/meshy/gullsiege-watchtower/model.glb",
        "licenseUrl": "https://www.meshy.ai/terms",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:32:57.102Z",
        "evidence": [
          "aura-evidence/meshy/gullsiegeWatchtowerMeshy.rights.31c26fbae5b8.json",
          "aura-evidence/meshy/gullsiegeWatchtowerMeshy.metadata.0d1b7c56eae6.json",
          "public/aura-assets/gullsiegeWatchtowerMeshy.meshy-candidate.36e21417.png"
        ],
        "checkedAt": "2026-10-17T09:32:57.102Z"
      },
      "sourcePath": "artifacts/meshy/gullsiege-watchtower/model.glb",
      "outputPath": "public/aura-assets/gullsiegeWatchtowerMeshy.546ee761.glb",
      "boundsMetadata": {
        "min": [
          -0.547,
          -0.952,
          -0.64
        ],
        "max": [
          0.549,
          0.951,
          0.632
        ],
        "size": [
          1.096,
          1.902,
          1.272
        ],
        "center": [
          0.001,
          -0.001,
          -0.004
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
      "thumbnailUrl": "/aura-assets/gullsiegeWatchtowerMeshy.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/gullsiegeWatchtowerMeshy.meshy-candidate.36e21417.png",
        "kind": "manual-inspection",
        "sha256": "sha256-36e214178fec8a04610cb70581ae17af8dd0dce63b8e128a16e75b14ca7a5970",
        "checkedAt": "2026-10-17T10:24:45.266Z"
      }
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
  "neonCyberPylonMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/neonCyberPylonMeshy.9b29d4fa.glb",
    hash: "sha256-1649e67f8d1053f41042af86f000c4d26a5609aab9e8719dd7e16e2407678155",
    bounds: [
      1.885,
      1.618,
      1.899
    ],
    sizeBytes: 1224972,
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
        "sourcePath": "artifacts/meshy/neon-cyber-pylon-v1/model.glb",
        "license": "Meshy paid private generation terms",
        "licenseName": "Meshy paid private generation terms",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated through the authenticated paid Meshy API account with --max-credits 60 for candidate use (Neon Swarm tactical arena cover barrier and energy pylon) under the current Meshy terms; this does not certify release-ready geometry or broader commercial rights.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-14T20:49:26.363Z",
        "evidence": [
          "aura-evidence/meshy/neonCyberPylonMeshy.rights.e5c16f574b51.json",
          "aura-evidence/meshy/neonCyberPylonMeshy.metadata.72b7bf5e1e5b.json",
          "public/aura-assets/neonCyberPylonMeshy.meshy-candidate.07b11917.png"
        ],
        "checkedAt": "2026-10-14T20:49:26.363Z"
      },
      "sourcePath": "artifacts/meshy/neon-cyber-pylon-v1/model.glb",
      "outputPath": "public/aura-assets/neonCyberPylonMeshy.9b29d4fa.glb",
      "license": "Meshy paid private generation terms",
      "boundsMetadata": {
        "min": [
          -0.947,
          -0.809,
          -0.95
        ],
        "max": [
          0.937,
          0.808,
          0.95
        ],
        "size": [
          1.885,
          1.618,
          1.899
        ],
        "center": [
          -0.005,
          0,
          0
        ],
        "maxDimension": 1.899,
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
      "thumbnailUrl": "/aura-assets/neonCyberPylonMeshy.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/neonCyberPylonMeshy.meshy-candidate.07b11917.png",
        "kind": "manual-inspection",
        "sha256": "sha256-07b119174e8720ed7b906373e60c527d77e11eaa4e597d2461df0cd173f85d8a",
        "checkedAt": "2026-10-14T20:50:36.601Z"
      }
    },
  },
  "neonStreetLampProp": {
    type: "model",
    format: "glb",
    url: "/aura-assets/neonStreetLampProp.1c0ed5ac.glb",
    hash: "sha256-1c0ed5ac46e535406f00a485c38d9fdbf1618a29b0a84647120cb76c6f8c4d8c",
    bounds: [
      1206.754,
      2835.063,
      1159.3
    ],
    sizeBytes: 15990000,
    metadata: {
      "materials": [
        "Top_metal",
        "Glass",
        "Material.028",
        "Material.025",
        "Material.022",
        "Material.024",
        "Material.027",
        "Material.023",
        "Material.026",
        "Material.002",
        "Material.004",
        "Material.003",
        "lampbase",
        "Lamppost_body",
        "fresh_palm.004"
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
        "nodeCount": 45,
        "meshCount": 27,
        "materialCount": 15,
        "textureCount": 9,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Sketchfab_model"
        ],
        "maxDepth": 5,
        "messages": [
          "Detected 45 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/neonStreetLampProp.1c0ed5ac.glb",
        "sourcePage": "https://sketchfab.com/3d-models/lamppost-street-light-cf3993d33aa64114a98bbe99ff3d2a83",
        "license": "CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)",
        "licenseName": "CC-BY-4.0",
        "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
        "licenseRaw": "CC-BY-4.0",
        "author": "Humphrorange (https://sketchfab.com/Humphrorange)",
        "sourceFamily": "objaverse",
        "attribution": "Humphrorange",
        "sha256": "sha256-1c0ed5ac46e535406f00a485c38d9fdbf1618a29b0a84647120cb76c6f8c4d8c",
        "retrievedAt": "2026-08-21T23:01:58.590Z",
        "resolveCandidate": {
          "catalogId": "objaverse:cf3993d33aa64114a98bbe99ff3d2a83",
          "query": "street lamp post light",
          "source": "objaverse",
          "sourceFamily": "objaverse",
          "scoreTotal": 1.98,
          "scoreBreakdown": {
            "semantic": 11.98,
            "sourceQuality": 14,
            "license": 13,
            "inspection": 0,
            "roleFit": 0
          },
          "reasons": [
            "semantic/source score 11.98",
            "download URL preserved",
            "author/attribution preserved",
            "verified CC-BY-4.0 license"
          ],
          "penalties": [
            "missing source page",
            "missing license URL/source evidence",
            "missing bounds/dimensions metadata",
            "missing material metadata for visual model role"
          ],
          "license": "CC-BY-4.0",
          "licenseName": "CC-BY-4.0",
          "licenseRaw": "CC-BY-4.0",
          "author": "Humphrorange",
          "attribution": "Humphrorange",
          "semanticScore": 0.7593624583806575,
          "postDownloadInspection": {
            "bounds": [
              1206.754,
              2835.063,
              1159.3
            ],
            "materialCount": 15,
            "textureCount": 9,
            "animationClipCount": 0,
            "skinCount": 0,
            "morphTargetCount": 0,
            "warnings": [
              "orientation metadata missing; facing direction cannot be validated until GLTF extras declare aura3d.orientation.forwardAxis"
            ]
          },
          "rawCatalogMetadata": {
            "id": "objaverse:cf3993d33aa64114a98bbe99ff3d2a83",
            "title": "Lamppost - Street Light",
            "source": "objaverse",
            "license": "CC-BY-4.0",
            "thumbnail": "https://media.sketchfab.com/models/cf3993d33aa64114a98bbe99ff3d2a83/thumbnails/888bf9706f4f4a4dbd42001a7a8cafa2/ca05637a86ce4f049a0d2be8d81bccc0.jpeg",
            "attribution": "Humphrorange",
            "score": 0.7593624583806575
          }
        },
        "checkedAt": "2026-08-21T23:01:58.590Z"
      },
      "sourcePath": "public/aura-assets/neonStreetLampProp.1c0ed5ac.glb",
      "outputPath": "public/aura-assets/neonStreetLampProp.1c0ed5ac.glb",
      "license": "CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)",
      "author": "Humphrorange (https://sketchfab.com/Humphrorange)",
      "boundsMetadata": {
        "min": [
          -597.419,
          20.722,
          -538.854
        ],
        "max": [
          609.335,
          2855.786,
          620.446
        ],
        "size": [
          1206.754,
          2835.063,
          1159.3
        ],
        "center": [
          5.958,
          1438.254,
          40.796
        ],
        "maxDimension": 2835.063,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "Top_metal",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Glass",
          "visible": true,
          "readable": true,
          "opacity": 0.026,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "Material.028",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Material.025",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Material.022",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Material.024",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Material.027",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Material.023",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Material.026",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Material.002",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Material.004",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Material.003",
          "visible": true,
          "readable": true,
          "opacity": 0.605,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "lampbase",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Lamppost_body",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "fresh_palm.004",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        }
      ],
      "orientation": {
        "source": "manifest-override",
        "view": "hash-bound-readable-prop-view",
        "assetHash": "sha256-1c0ed5ac46e535406f00a485c38d9fdbf1618a29b0a84647120cb76c6f8c4d8c",
        "generatedBy": "tests/browser/showcase-release-asset-probes.spec.ts root createAuraApp release probe",
        "checkedAt": "2026-08-23T18:56:20.075Z",
        "route": "tests/browser/showcase-release-asset-probe-harness?asset=neonStreetLampProp",
        "renderedProbe": {
          "url": "tests/reports/showcase-release-asset-probes/neonStreetLampProp.png",
          "sha256": "sha256-99d87043b12ed3575c80ab4859fac5b5f83499e2329d3a33ee2fe356782c2756",
          "assetHash": "sha256-1c0ed5ac46e535406f00a485c38d9fdbf1618a29b0a84647120cb76c6f8c4d8c",
          "checkedAt": "2026-08-23T18:56:20.075Z",
          "route": "tests/browser/showcase-release-asset-probe-harness?asset=neonStreetLampProp"
        },
        "messages": [
          "The current hash-bound root production-runtime probe proves a readable prop view. No character, vehicle, or weapon forward-axis claim is made, and final route review remains independent."
        ]
      },
      "nodeNames": [
        "Sketchfab_model",
        "8726c7fdbb474325b774df81182514bd.fbx",
        "RootNode",
        "lamppost head.005",
        "lamppost head.005_Top metal_0",
        "lamppost glass",
        "lamppost glass_Glass_0",
        "lamppost  glass",
        "lamppost  glass_Glass_0",
        "lamppost glass.002",
        "lamppost glass.002_Glass_0",
        "lamppost glass.001",
        "lamppost glass.001_Glass_0",
        "flowers.000",
        "flowers.000_Material.028_0",
        "flowers.000_Material.025_0",
        "flowers.000_Material.022_0",
        "flowers.000_Material.024_0",
        "flowers.000_Material.027_0",
        "flowers.000_Material.023_0",
        "flowers.000_Material.026_0",
        "Pavement",
        "Pavement_Material.002_0",
        "Pavement_Material.004_0",
        "Lamp",
        "Lamp_Material.003_0",
        "Lampbase",
        "Lampbase_lampbase _0",
        "Camera",
        "Object_29",
        "lamppost ",
        "lamppost _Lamppost body_0",
        "lamppost headframe",
        "lamppost headframe_Top metal_0",
        "Grass",
        "Grass_fresh palm.004_0",
        "Grass_fresh palm.004_0",
        "flowers.002",
        "flowers.002_Material.028_0",
        "flowers.002_Material.025_0",
        "flowers.002_Material.022_0",
        "flowers.002_Material.024_0",
        "flowers.002_Material.027_0",
        "flowers.002_Material.023_0",
        "flowers.002_Material.026_0"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2",
        "image-3",
        "image-4",
        "image-5",
        "image-6",
        "image-7",
        "image-8"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/neonStreetLampProp.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "suitabilityReason": "Typed textured street-lamp prop with route-normalized camera-fit placement through targetMaxDimension 4.2; its current hash-bound rendered foreground proves a readable post and luminaire arena landmark.",
      "renderedProbe": {
        "url": "tests/reports/showcase-release-asset-probes/neonStreetLampProp.png",
        "kind": "browser-screenshot",
        "renderer": "createAuraApp @aura3d/engine showcase release asset probe",
        "route": "tests/browser/showcase-release-asset-probe-harness?asset=neonStreetLampProp",
        "sha256": "sha256-99d87043b12ed3575c80ab4859fac5b5f83499e2329d3a33ee2fe356782c2756",
        "assetHash": "sha256-1c0ed5ac46e535406f00a485c38d9fdbf1618a29b0a84647120cb76c6f8c4d8c",
        "width": 752,
        "height": 600,
        "nonBlankPixels": 450899,
        "colorBuckets": 83,
        "checkedAt": "2026-08-23T18:56:20.075Z",
        "foregroundBounds": {
          "x": 260,
          "y": 149,
          "width": 221,
          "height": 451
        }
      }
    },
  },
  "patrolCoastalRadarTowerMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/patrolCoastalRadarTowerMeshy.7d37c6a6.glb",
    hash: "sha256-50b5e995e1990a5dbf781eca739d0ec4796007aede11019758de2bdaf1e48844",
    bounds: [
      1.104,
      1.903,
      1.105
    ],
    sizeBytes: 1537208,
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
        "sourcePath": "artifacts/meshy/patrol-coastal-radar-tower-v1/model.glb",
        "license": "Meshy paid private generation terms",
        "licenseName": "Meshy paid private generation terms",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated through the authenticated paid Meshy API account with --max-credits 60 for candidate use (Patrol Wing island peak coastal radar and control tower) under the current Meshy terms; this does not certify release-ready geometry or broader commercial rights.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-14T20:57:47.631Z",
        "evidence": [
          "aura-evidence/meshy/patrolCoastalRadarTowerMeshy.rights.813473c34b1a.json",
          "aura-evidence/meshy/patrolCoastalRadarTowerMeshy.metadata.b3f145ea1191.json",
          "public/aura-assets/patrolCoastalRadarTowerMeshy.meshy-candidate.aeef8038.png"
        ],
        "checkedAt": "2026-10-14T20:57:47.631Z"
      },
      "sourcePath": "artifacts/meshy/patrol-coastal-radar-tower-v1/model.glb",
      "outputPath": "public/aura-assets/patrolCoastalRadarTowerMeshy.7d37c6a6.glb",
      "license": "Meshy paid private generation terms",
      "boundsMetadata": {
        "min": [
          -0.553,
          -0.952,
          -0.552
        ],
        "max": [
          0.551,
          0.951,
          0.553
        ],
        "size": [
          1.104,
          1.903,
          1.105
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
      "thumbnailUrl": "/aura-assets/patrolCoastalRadarTowerMeshy.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/patrolCoastalRadarTowerMeshy.meshy-candidate.aeef8038.png",
        "kind": "manual-inspection",
        "sha256": "sha256-aeef80386a76de8d524016a9c4a74ca6e1fdd5db0bcea6ce3035b456a1d6b492",
        "checkedAt": "2026-10-14T21:03:20.804Z"
      }
    },
  },
  "patrolJetAircraftMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/patrolJetAircraftMeshy.360b0f51.glb",
    hash: "sha256-360b0f51b58b8f4b9cedfa45710b1096a761e1afc58cd5e38fa452526fcec7a0",
    bounds: [
      1.8985,
      0.6049,
      1.6945
    ],
    sizeBytes: 542160,
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
        "sourcePath": "artifacts/meshy/patrolJetAircraftMeshy/model.glb",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Aura3D Meshy 3D Pipeline",
        "sourceFamily": "aura3d-original",
        "attribution": "Aura3D Meshy 3D Pipeline",
        "retrievedAt": "2026-10-15T05:00:00.000Z",
        "checkedAt": "2026-10-15T05:00:00.000Z"
      },
      "sourcePath": "artifacts/meshy/patrolJetAircraftMeshy/model.glb",
      "outputPath": "public/aura-assets/patrolJetAircraftMeshy.360b0f51.glb",
      "license": "CC0-1.0",
      "author": "Aura3D Meshy 3D Pipeline",
      "boundsMetadata": {
        "min": [
          -0.9499,
          -0.3029,
          -0.8479
        ],
        "max": [
          0.9486,
          0.302,
          0.8466
        ],
        "size": [
          1.8985,
          0.6049,
          1.6945
        ],
        "center": [
          -0.0006,
          -0.0005,
          -0.0006
        ],
        "maxDimension": 1.8985,
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
      "thumbnailUrl": "/aura-assets/patrolJetAircraftMeshy.thumb.svg",
      "quality": "production",
      "role": "primaryVehicle",
      "suitabilityReason": "Bespoke Meshy 2K PBR 3D hero asset."
    },
  },
  "propBoulder": {
    type: "model",
    format: "glb",
    url: "/aura-assets/propBoulder.a623d331.glb",
    hash: "sha256-a623d3317455c7f0e86a71a42e6784036fef25077d642a60033828543e5ee40c",
    bounds: [
      207.751,
      33.154,
      229.798
    ],
    sizeBytes: 1186796,
    metadata: {
      "materials": [
        "Material.001"
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
        "nodeCount": 318,
        "meshCount": 158,
        "materialCount": 1,
        "textureCount": 1,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Sketchfab_model"
        ],
        "maxDepth": 4,
        "messages": [
          "Detected 318 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/propBoulder.a623d331.glb",
        "license": "CC-BY-4.0",
        "licenseName": "CC-BY-4.0",
        "licenseRaw": "CC-BY-4.0",
        "author": "Elbolillo",
        "sourceFamily": "objaverse",
        "attribution": "Elbolillo",
        "sha256": "sha256-a623d3317455c7f0e86a71a42e6784036fef25077d642a60033828543e5ee40c",
        "retrievedAt": "2026-08-02T08:31:41.785Z",
        "resolveCandidate": {
          "catalogId": "objaverse:2c88f234671c4aceb6a6449270b168b0",
          "query": "low poly rock boulder",
          "source": "objaverse",
          "sourceFamily": "objaverse",
          "scoreTotal": 2.17,
          "scoreBreakdown": {
            "semantic": 12.17,
            "sourceQuality": 14,
            "license": 13,
            "inspection": 0,
            "roleFit": 0
          },
          "reasons": [
            "semantic/source score 12.17",
            "download URL preserved",
            "author/attribution preserved",
            "verified CC-BY-4.0 license"
          ],
          "penalties": [
            "missing source page",
            "missing license URL/source evidence",
            "missing bounds/dimensions metadata",
            "missing material metadata for visual model role"
          ],
          "license": "CC-BY-4.0",
          "licenseName": "CC-BY-4.0",
          "licenseRaw": "CC-BY-4.0",
          "author": "Elbolillo",
          "attribution": "Elbolillo",
          "semanticScore": 0.8238416911569367,
          "postDownloadInspection": {
            "bounds": [
              207.751,
              33.154,
              229.798
            ],
            "materialCount": 1,
            "textureCount": 1,
            "animationClipCount": 0,
            "skinCount": 0,
            "morphTargetCount": 0,
            "warnings": [
              "orientation metadata missing; facing direction cannot be validated until GLTF extras declare aura3d.orientation.forwardAxis"
            ]
          },
          "rawCatalogMetadata": {
            "id": "objaverse:2c88f234671c4aceb6a6449270b168b0",
            "title": "Rock low poly",
            "source": "objaverse",
            "license": "CC-BY-4.0",
            "thumbnail": "https://media.sketchfab.com/models/2c88f234671c4aceb6a6449270b168b0/thumbnails/6dca0a6468bc4fd687e6a98d99534c2a/8a4de8ecad4e4a6c8999b46ac8d13915.jpeg",
            "attribution": "Elbolillo",
            "score": 0.8238416911569367
          }
        },
        "checkedAt": "2026-08-02T08:31:41.785Z"
      },
      "sourcePath": "public/aura-assets/propBoulder.a623d331.glb",
      "outputPath": "public/aura-assets/propBoulder.a623d331.glb",
      "license": "CC-BY-4.0",
      "author": "Elbolillo",
      "boundsMetadata": {
        "min": [
          -108.298,
          -3.672,
          -191.686
        ],
        "max": [
          99.453,
          29.483,
          38.112
        ],
        "size": [
          207.751,
          33.154,
          229.798
        ],
        "center": [
          -4.423,
          12.905,
          -76.787
        ],
        "maxDimension": 229.798,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "Material.001",
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
        "Sketchfab_model",
        "Collada visual scene group",
        "Cube",
        "Material_001-material",
        "Cube.001",
        "Material_001-material",
        "Cube.002",
        "Material_001-material",
        "Cube.003",
        "Material_001-material",
        "Cube.004",
        "Material_001-material",
        "Cube.005",
        "Material_001-material",
        "Cube.006",
        "Material_001-material",
        "Cube.007",
        "Material_001-material",
        "Cylinder",
        "Material_001-material",
        "Cylinder.001",
        "Material_001-material",
        "Cylinder.002",
        "Material_001-material",
        "Cylinder.003",
        "Material_001-material",
        "Cube.008",
        "Material_001-material",
        "Cube.009",
        "Material_001-material",
        "Cube.010",
        "Material_001-material",
        "Cube.011",
        "Material_001-material",
        "Cube.012",
        "Material_001-material",
        "Cube.013",
        "Material_001-material",
        "Cube.014",
        "Material_001-material",
        "Cylinder.007",
        "Material_001-material",
        "Cylinder.008",
        "Material_001-material",
        "Cube.015",
        "Material_001-material",
        "Cube.016",
        "Material_001-material",
        "Cube.017",
        "Material_001-material",
        "Cube.018",
        "Material_001-material",
        "Cube.019",
        "Material_001-material",
        "Cube.020",
        "Material_001-material",
        "Cube.021",
        "Material_001-material",
        "Cube.023",
        "Material_001-material",
        "Cube.024",
        "Material_001-material",
        "Cube.025",
        "Material_001-material",
        "Cube.026",
        "Material_001-material",
        "Cube.027",
        "Material_001-material",
        "Cube.028",
        "Material_001-material",
        "Cube.029",
        "Material_001-material",
        "Cube.030",
        "Material_001-material",
        "Cube.031",
        "Material_001-material",
        "Cube.032",
        "Material_001-material",
        "Cube.033",
        "Material_001-material",
        "Cube.034",
        "Material_001-material",
        "Cube.035",
        "Material_001-material",
        "Cube.036",
        "Material_001-material",
        "Cube.037",
        "Material_001-material",
        "Cube.038",
        "Material_001-material",
        "Cube.039",
        "Material_001-material",
        "Cube.040",
        "Material_001-material",
        "Cube.041",
        "Material_001-material",
        "Cube.042",
        "Material_001-material",
        "Cube.043",
        "Material_001-material",
        "Cube.044",
        "Material_001-material",
        "Cube.045",
        "Material_001-material",
        "Cube.046",
        "Material_001-material",
        "Cube.047",
        "Material_001-material",
        "Cube.048",
        "Material_001-material",
        "Cube.049",
        "Material_001-material",
        "Cube.050",
        "Material_001-material",
        "Cube.051",
        "Material_001-material",
        "Cube.052",
        "Material_001-material",
        "Cube.053",
        "Material_001-material",
        "Cube.054",
        "Material_001-material",
        "Cube.055",
        "Material_001-material",
        "Cube.056",
        "Material_001-material",
        "Cube.057",
        "Material_001-material",
        "Cube.058",
        "Material_001-material",
        "Cube.059",
        "Material_001-material",
        "Cube.060",
        "Material_001-material",
        "Cube.061",
        "Material_001-material",
        "Cube.062",
        "Material_001-material",
        "Cube.063",
        "Material_001-material",
        "Cube.064",
        "Material_001-material",
        "Cube.065",
        "Material_001-material",
        "Cube.066",
        "Material_001-material",
        "Cube.067",
        "Material_001-material",
        "Cube.068",
        "Material_001-material",
        "Cube.069",
        "Material_001-material",
        "Cube.070",
        "Material_001-material",
        "Cube.071",
        "Material_001-material",
        "Cube.072",
        "Material_001-material",
        "Cube.073",
        "Material_001-material",
        "Cube.074",
        "Material_001-material",
        "Cube.075",
        "Material_001-material",
        "Cube.076",
        "Material_001-material",
        "Cube.077",
        "Material_001-material",
        "Cube.078",
        "Material_001-material",
        "Cube.079",
        "Material_001-material",
        "Cube.080",
        "Material_001-material",
        "Cube.081",
        "Material_001-material",
        "Cube.082",
        "Material_001-material",
        "Cube.083",
        "Material_001-material",
        "Cube.084",
        "Material_001-material",
        "Cube.085",
        "Material_001-material",
        "Cube.022",
        "Material_001-material",
        "Cube.087",
        "Material_001-material",
        "Cube.088",
        "Material_001-material",
        "Cube.089",
        "Material_001-material",
        "Cube.090",
        "Material_001-material",
        "Cube.091",
        "Material_001-material",
        "Cube.092",
        "Material_001-material",
        "Cube.093",
        "Material_001-material",
        "Cube.094",
        "Material_001-material",
        "Cube.095",
        "Material_001-material",
        "Cube.096",
        "Material_001-material",
        "Cube.097",
        "Material_001-material",
        "Cube.098",
        "Material_001-material",
        "Cube.099",
        "Material_001-material",
        "Cube.100",
        "Material_001-material",
        "Cube.101",
        "Material_001-material",
        "Cube.102",
        "Material_001-material",
        "Cube.103",
        "Material_001-material",
        "Cube.104",
        "Material_001-material",
        "Cube.105",
        "Material_001-material",
        "Cube.106",
        "Material_001-material",
        "Cube.107",
        "Material_001-material",
        "Cube.108",
        "Material_001-material",
        "Cube.109",
        "Material_001-material",
        "Cube.110",
        "Material_001-material",
        "Cube.111",
        "Material_001-material",
        "Cube.112",
        "Material_001-material",
        "Cube.113",
        "Material_001-material",
        "Cube.114",
        "Material_001-material",
        "Cube.115",
        "Material_001-material",
        "Cube.116",
        "Material_001-material",
        "Cube.117",
        "Material_001-material",
        "Cube.118",
        "Material_001-material",
        "Cube.086",
        "Material_001-material",
        "Cube.119",
        "Material_001-material",
        "Cube.120",
        "Material_001-material",
        "Cube.121",
        "Material_001-material",
        "Cube.122",
        "Material_001-material",
        "Cube.123",
        "Material_001-material",
        "Cube.124",
        "Material_001-material",
        "Cube.125",
        "Material_001-material",
        "Cube.126",
        "Material_001-material",
        "Cube.127",
        "Material_001-material",
        "Cube.128",
        "Material_001-material",
        "Cube.129",
        "Material_001-material",
        "Cube.130",
        "Material_001-material",
        "Cube.131",
        "Material_001-material",
        "Cube.132",
        "Material_001-material",
        "Cube.133",
        "Material_001-material",
        "Cube.134",
        "Material_001-material",
        "Cube.135",
        "Material_001-material",
        "Cube.136",
        "Material_001-material",
        "Cube.137",
        "Material_001-material",
        "Cube.138",
        "Material_001-material",
        "Cube.139",
        "Material_001-material",
        "Cube.140",
        "Material_001-material",
        "Cube.141",
        "Material_001-material",
        "Cube.142",
        "Material_001-material",
        "Cube.143",
        "Material_001-material",
        "Cube.144",
        "Material_001-material",
        "Cube.145",
        "Material_001-material",
        "Cube.146",
        "Material_001-material",
        "Cube.147",
        "Material_001-material",
        "Cube.148",
        "Material_001-material",
        "Cube.149",
        "Material_001-material",
        "Cylinder.004",
        "Material_001-material",
        "Cylinder.005",
        "Material_001-material"
      ],
      "textures": [
        "image-0"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/propBoulder.thumb.svg",
      "quality": "candidate",
      "role": "unknown",
      "suitabilityReason": "Resolved catalog candidate; release validation and rendered-probe proof are still required."
    },
  },
  "propPineTree": {
    type: "model",
    format: "glb",
    url: "/aura-assets/propPineTree.12243e81.glb",
    hash: "sha256-12243e81994b69e464c5c7de8b1bf25fb46fc878a52d4c2bebedaebf9324e15a",
    bounds: [
      13.604,
      10.919,
      11.879
    ],
    sizeBytes: 4623136,
    metadata: {
      "materials": [
        "Material.011",
        "2237f4d60830642a24d65276e7abe1e6",
        "Material.027",
        "Material.001",
        "ROCK"
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
        "nodeCount": 42,
        "meshCount": 23,
        "materialCount": 5,
        "textureCount": 4,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Sketchfab_model"
        ],
        "maxDepth": 4,
        "messages": [
          "Detected 42 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/propPineTree.12243e81.glb",
        "license": "CC-BY-4.0",
        "licenseName": "CC-BY-4.0",
        "licenseRaw": "CC-BY-4.0",
        "author": "winwoods",
        "sourceFamily": "objaverse",
        "attribution": "winwoods",
        "sha256": "sha256-12243e81994b69e464c5c7de8b1bf25fb46fc878a52d4c2bebedaebf9324e15a",
        "retrievedAt": "2026-08-02T08:31:35.152Z",
        "resolveCandidate": {
          "catalogId": "objaverse:99fb6a37547840e3a295689df032ba28",
          "query": "low poly pine tree",
          "source": "objaverse",
          "sourceFamily": "objaverse",
          "scoreTotal": 3.38,
          "scoreBreakdown": {
            "semantic": 13.38,
            "sourceQuality": 14,
            "license": 13,
            "inspection": 0,
            "roleFit": 0
          },
          "reasons": [
            "semantic/source score 13.38",
            "download URL preserved",
            "author/attribution preserved",
            "verified CC-BY-4.0 license"
          ],
          "penalties": [
            "missing source page",
            "missing license URL/source evidence",
            "missing bounds/dimensions metadata",
            "missing material metadata for visual model role"
          ],
          "license": "CC-BY-4.0",
          "licenseName": "CC-BY-4.0",
          "licenseRaw": "CC-BY-4.0",
          "author": "winwoods",
          "attribution": "winwoods",
          "semanticScore": 0.8246166138244886,
          "postDownloadInspection": {
            "bounds": [
              13.604,
              10.919,
              11.879
            ],
            "materialCount": 5,
            "textureCount": 4,
            "animationClipCount": 0,
            "skinCount": 0,
            "morphTargetCount": 0,
            "warnings": [
              "orientation metadata missing; facing direction cannot be validated until GLTF extras declare aura3d.orientation.forwardAxis"
            ]
          },
          "rawCatalogMetadata": {
            "id": "objaverse:99fb6a37547840e3a295689df032ba28",
            "title": "Low Poly Pine Tree",
            "source": "objaverse",
            "license": "CC-BY-4.0",
            "thumbnail": "https://media.sketchfab.com/models/99fb6a37547840e3a295689df032ba28/thumbnails/37aa66cdd27a46d387ff09b24d7aa897/47e3a2fdacfb4aa5907e7fec1a0b7899.jpeg",
            "attribution": "winwoods",
            "score": 0.8246166138244886
          }
        },
        "checkedAt": "2026-08-02T08:31:35.152Z"
      },
      "sourcePath": "public/aura-assets/propPineTree.12243e81.glb",
      "outputPath": "public/aura-assets/propPineTree.12243e81.glb",
      "license": "CC-BY-4.0",
      "author": "winwoods",
      "boundsMetadata": {
        "min": [
          -7.035,
          -0.624,
          -8.453
        ],
        "max": [
          6.569,
          10.295,
          3.426
        ],
        "size": [
          13.604,
          10.919,
          11.879
        ],
        "center": [
          -0.233,
          4.835,
          -2.513
        ],
        "maxDimension": 13.604,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "Material.011",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "2237f4d60830642a24d65276e7abe1e6",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "alphaMode": "MASK",
          "reasons": []
        },
        {
          "name": "Material.027",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Material.001",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "ROCK",
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
        "Sketchfab_model",
        "Root",
        "Icosphere.013",
        "Icosphere.013_0",
        "Icosphere.012",
        "Icosphere.012_0",
        "Icosphere.011",
        "Icosphere.011_0",
        "Icosphere.010",
        "Icosphere.010_0",
        "Icosphere.000",
        "Icosphere.000_0",
        "Cylinder.009",
        "Cylinder.009_0",
        "Cylinder.009_1",
        "Cylinder.007",
        "Cylinder.007_0",
        "Cylinder.007_1",
        "Cylinder.005",
        "Cylinder.005_0",
        "Cylinder.005_1",
        "Cylinder.004",
        "Cylinder.004_0",
        "Cylinder.004_1",
        "Cylinder.003",
        "Cylinder.003_0",
        "Cylinder.003_1",
        "Cylinder.002",
        "Cylinder.002_0",
        "Cylinder.002_1",
        "Cylinder.001",
        "Cylinder.001_0",
        "Cylinder.001_1",
        "Plane",
        "Plane_0",
        "Sun",
        "Sun",
        "Icosphere.001",
        "Icosphere.001_0",
        "Cylinder.000",
        "Cylinder.000_0",
        "Cylinder.000_1"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2",
        "image-3"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/propPineTree.thumb.svg",
      "quality": "candidate",
      "role": "unknown",
      "suitabilityReason": "Resolved catalog candidate; release validation and rendered-probe proof are still required."
    },
  },
  "propRockA": {
    type: "model",
    format: "glb",
    url: "/aura-assets/propRockA.52dd1f0f.glb",
    hash: "sha256-52dd1f0f8d9fc9c65de6475522e43f8715eade7286fb5293aa6292fb959ae0e2",
    bounds: [
      0.255,
      0.148,
      0.281
    ],
    sizeBytes: 4156760,
    metadata: {
      "materials": [
        "07_-_Default"
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
        "nodeCount": 5,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Sketchfab_model"
        ],
        "maxDepth": 5,
        "messages": [
          "Detected 5 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/propRockA.52dd1f0f.glb",
        "license": "CC-BY-4.0",
        "licenseName": "CC-BY-4.0",
        "licenseRaw": "CC-BY-4.0",
        "author": "3dhdscan",
        "sourceFamily": "objaverse",
        "attribution": "3dhdscan",
        "sha256": "sha256-52dd1f0f8d9fc9c65de6475522e43f8715eade7286fb5293aa6292fb959ae0e2",
        "retrievedAt": "2026-08-02T08:33:35.785Z",
        "resolveCandidate": {
          "catalogId": "objaverse:519c813e95af46a59e010539cd02ac5f",
          "query": "granite rock formation",
          "source": "objaverse",
          "sourceFamily": "objaverse",
          "scoreTotal": 0.61,
          "scoreBreakdown": {
            "semantic": 10.61,
            "sourceQuality": 14,
            "license": 13,
            "inspection": 0,
            "roleFit": 0
          },
          "reasons": [
            "semantic/source score 10.61",
            "download URL preserved",
            "author/attribution preserved",
            "verified CC-BY-4.0 license"
          ],
          "penalties": [
            "missing source page",
            "missing license URL/source evidence",
            "missing bounds/dimensions metadata",
            "missing material metadata for visual model role"
          ],
          "license": "CC-BY-4.0",
          "licenseName": "CC-BY-4.0",
          "licenseRaw": "CC-BY-4.0",
          "author": "3dhdscan",
          "attribution": "3dhdscan",
          "semanticScore": 0.7898582005840453,
          "postDownloadInspection": {
            "bounds": [
              0.255,
              0.148,
              0.281
            ],
            "materialCount": 1,
            "textureCount": 3,
            "animationClipCount": 0,
            "skinCount": 0,
            "morphTargetCount": 0,
            "warnings": [
              "orientation metadata missing; facing direction cannot be validated until GLTF extras declare aura3d.orientation.forwardAxis"
            ]
          },
          "rawCatalogMetadata": {
            "id": "objaverse:519c813e95af46a59e010539cd02ac5f",
            "title": "Granite rock yellowish brown",
            "source": "objaverse",
            "license": "CC-BY-4.0",
            "thumbnail": "https://media.sketchfab.com/models/519c813e95af46a59e010539cd02ac5f/thumbnails/c4264885cfcb480ca114af1d8f0894fd/1024x576.jpeg",
            "attribution": "3dhdscan",
            "score": 0.7898582005840453
          }
        },
        "checkedAt": "2026-08-02T08:33:35.785Z"
      },
      "sourcePath": "public/aura-assets/propRockA.52dd1f0f.glb",
      "outputPath": "public/aura-assets/propRockA.52dd1f0f.glb",
      "license": "CC-BY-4.0",
      "author": "3dhdscan",
      "boundsMetadata": {
        "min": [
          -0.136,
          -0.002,
          -0.17
        ],
        "max": [
          0.119,
          0.146,
          0.111
        ],
        "size": [
          0.255,
          0.148,
          0.281
        ],
        "center": [
          -0.009,
          0.072,
          -0.03
        ],
        "maxDimension": 0.281,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "07_-_Default",
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
        "Sketchfab_model",
        "sutr_zula_midle1.FBX",
        "RootNode",
        "sutr_zula_midle1",
        "sutr_zula_midle1_07 - Default_0"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/propRockA.thumb.svg",
      "quality": "candidate",
      "role": "unknown",
      "suitabilityReason": "Resolved catalog candidate; release validation and rendered-probe proof are still required."
    },
  },
  "reactorFusionTurbineMeshy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/reactorFusionTurbineMeshy.820062e2.glb",
    hash: "sha256-820062e26b86eb45153ba0e7d21216ba75e2af6b301e814feaf3dea6b0a2d8db",
    bounds: [
      1.8973,
      1.5222,
      0.9128
    ],
    sizeBytes: 861748,
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
        "sourcePath": "artifacts/meshy/aura-clash-corner-pylon-v1/model.glb",
        "license": "Meshy paid private generation terms",
        "licenseName": "Meshy paid private generation terms",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated through the authenticated paid Meshy API account with --max-credits 60 for candidate use (Aura Clash Arena lane boundary corner pylon) under the current Meshy terms; this does not certify release-ready geometry or broader commercial rights.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-14T20:41:04.404Z",
        "evidence": [
          "aura-evidence/meshy/auraClashCornerBrazierPylonMeshy.rights.b940ae66c925.json",
          "aura-evidence/meshy/auraClashCornerBrazierPylonMeshy.metadata.add1fddb77b6.json",
          "public/aura-assets/auraClashCornerBrazierPylonMeshy.meshy-candidate.5dba189c.png"
        ],
        "checkedAt": "2026-10-14T20:41:04.404Z"
      },
      "sourcePath": "artifacts/meshy/turboHeroRaceCarMeshy/model.glb",
      "outputPath": "public/aura-assets/reactorFusionTurbineMeshy.820062e2.glb",
      "license": "Meshy paid private generation terms",
      "boundsMetadata": {
        "min": [
          -0.9495,
          -0.7618,
          -0.4555
        ],
        "max": [
          0.9478,
          0.7604,
          0.4573
        ],
        "size": [
          1.8973,
          1.5222,
          0.9128
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 1.8973,
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
          "Normalized +Z forward and grounded min-Y=0 for turboHeroRaceCarMeshy."
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
      "thumbnailUrl": "/aura-assets/reactorFusionTurbineMeshy.thumb.svg",
      "quality": "production",
      "role": "primaryVehicle",
      "renderedProbe": {
        "url": "/aura-assets/auraClashCornerBrazierPylonMeshy.meshy-candidate.5dba189c.png",
        "kind": "manual-inspection",
        "sha256": "sha256-5dba189c41e4727649102bce244aa5ddf635aa6c7a4be0d4ef4ee96990bae9bc",
        "checkedAt": "2026-10-14T21:02:59.667Z"
      }
    },
  },
  "showcaseModernBuildingOne": {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseModernBuildingOne.d3216bb2.glb",
    hash: "sha256-d3216bb2d6d73964a5e9ec6dc888ea0bbe68eeb2d20921902d67e7f2e4a1ab1d",
    bounds: [
      1231.446,
      1318.901,
      1372.78
    ],
    sizeBytes: 347940,
    metadata: {
      "materials": [
        "concret",
        "metal",
        "white",
        "dark",
        "brown",
        "brown2",
        "wall2",
        "black",
        "roof1",
        "L_sign",
        "mirror"
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
        "nodeCount": 175,
        "meshCount": 75,
        "materialCount": 11,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Sketchfab_model"
        ],
        "maxDepth": 7,
        "messages": [
          "Detected 175 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/showcaseModernBuildingOne.d3216bb2.glb",
        "license": "CC-BY-4.0",
        "licenseName": "CC-BY-4.0",
        "licenseRaw": "CC-BY-4.0",
        "author": "burunduk",
        "sourceFamily": "objaverse",
        "attribution": "burunduk",
        "sha256": "sha256-d3216bb2d6d73964a5e9ec6dc888ea0bbe68eeb2d20921902d67e7f2e4a1ab1d",
        "retrievedAt": "2026-06-25T09:08:38.610Z",
        "resolveCandidate": {
          "catalogId": "objaverse:b12b935b598a43e19957fb45e95ece6a",
          "query": "Modern building 01 standalone architecture",
          "source": "objaverse",
          "sourceFamily": "objaverse",
          "scoreTotal": 1.43,
          "scoreBreakdown": {
            "semantic": 11.43,
            "sourceQuality": 14,
            "license": 13,
            "inspection": 0,
            "roleFit": 0
          },
          "reasons": [
            "semantic/source score 11.43",
            "download URL preserved",
            "author/attribution preserved",
            "verified CC-BY-4.0 license"
          ],
          "penalties": [
            "missing source page",
            "missing license URL/source evidence",
            "missing bounds/dimensions metadata",
            "missing material metadata for visual model role"
          ],
          "license": "CC-BY-4.0",
          "licenseName": "CC-BY-4.0",
          "licenseRaw": "CC-BY-4.0",
          "author": "burunduk",
          "attribution": "burunduk",
          "semanticScore": 0.7531356996038788,
          "postDownloadInspection": {
            "bounds": [
              1231.446,
              1318.901,
              1372.78
            ],
            "materialCount": 11,
            "textureCount": 0,
            "animationClipCount": 0,
            "skinCount": 0,
            "morphTargetCount": 0,
            "warnings": [
              "no texture references detected",
              "orientation metadata missing; facing direction cannot be validated until GLTF extras declare aura3d.orientation.forwardAxis"
            ]
          },
          "rawCatalogMetadata": {
            "id": "objaverse:b12b935b598a43e19957fb45e95ece6a",
            "title": "Modern building 01",
            "source": "objaverse",
            "license": "CC-BY-4.0",
            "thumbnail": "https://media.sketchfab.com/models/b12b935b598a43e19957fb45e95ece6a/thumbnails/0e18f033c183422591ecdfe310f12cd0/922ff61e5fad40f292d95a6e3abe6fe0.jpeg",
            "attribution": "burunduk",
            "score": 0.7531356996038788
          }
        },
        "checkedAt": "2026-06-25T09:08:39.674Z"
      },
      "sourcePath": "public/aura-assets/showcaseModernBuildingOne.d3216bb2.glb",
      "outputPath": "public/aura-assets/showcaseModernBuildingOne.d3216bb2.glb",
      "license": "CC-BY-4.0",
      "author": "burunduk",
      "boundsMetadata": {
        "min": [
          -455.549,
          -600,
          -746.878
        ],
        "max": [
          775.896,
          718.901,
          625.902
        ],
        "size": [
          1231.446,
          1318.901,
          1372.78
        ],
        "center": [
          160.173,
          59.451,
          -60.488
        ],
        "maxDimension": 1372.78,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "concret",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "metal",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "white",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "dark",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "brown",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "brown2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "wall2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "black",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "roof1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "L_sign",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "mirror",
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
        "Sketchfab_model",
        "62fe5e8b068b4e20ac204baebc4da3f3.fbx",
        "RootNode",
        "Plane091",
        "Plane091_concret_0",
        "Group652",
        "Box15862",
        "Object_7",
        "Box15862_metal_0",
        "Box15861",
        "Object_10",
        "Box15861_white_0",
        "Box15861_dark_0",
        "Box15856",
        "Box15856_brown_0",
        "Box15855",
        "Box15855_brown_0",
        "Box15848",
        "Box15848_brown_0",
        "Box15847",
        "Box15847_brown_0",
        "Box15844",
        "Box15844_brown_0",
        "Box15842",
        "Box15842_brown_0",
        "Box15839",
        "Box15839_brown_0",
        "Box15831",
        "Box15831_brown_0",
        "Box15830",
        "Box15830_brown_0",
        "Box15825",
        "Box15825_brown2_0",
        "Box15824",
        "Box15824_wall2_0",
        "Group653",
        "Box14010",
        "Object_37",
        "Box14010_metal_0",
        "window_114",
        "Object_40",
        "window_114_brown_0",
        "window_113",
        "Object_43",
        "window_113_brown_0",
        "window_112",
        "Object_46",
        "window_112_brown_0",
        "window_111",
        "Object_49",
        "window_111_brown_0",
        "StraightStair011",
        "StraightStair011_brown2_0",
        "Object302",
        "Object_54",
        "Object302_brown2_0",
        "Line435",
        "Object_57",
        "Line435_metal_0",
        "Line434",
        "Object_60",
        "Line434_metal_0",
        "Line433",
        "Object_63",
        "Line433_metal_0",
        "Line432",
        "Object_66",
        "Line432_metal_0",
        "Group651",
        "Box15850",
        "Box15850_brown_0",
        "Box15851",
        "Box15851_brown_0",
        "Cylinder1704",
        "Cylinder1704_metal_0",
        "Cylinder1705",
        "Cylinder1705_metal_0",
        "Cylinder1706",
        "Cylinder1706_metal_0",
        "Cylinder1707",
        "Cylinder1707_metal_0",
        "Box15854",
        "Box15854_brown2_0",
        "Box15853",
        "Box15853_wall2_0",
        "Box15849",
        "Box15849_brown_0",
        "Box15846",
        "Box15846_brown_0",
        "Box15845",
        "Box15845_brown_0",
        "Box15843",
        "Box15843_brown_0",
        "Box15841",
        "Box15841_brown_0",
        "Box15840",
        "Box15840_brown_0",
        "Box15829",
        "Box15829_brown2_0",
        "Box15827",
        "Object_100",
        "Box15827_brown_0",
        "Box15863",
        "Box15863_white_0",
        "TextPlus004",
        "TextPlus004_black_0",
        "Box15865",
        "Object_107",
        "Box15865_white_0",
        "Box15865_dark_0",
        "Group654",
        "Object301",
        "Object_112",
        "Object301_roof1_0",
        "Object300",
        "Object_115",
        "Object300_roof1_0",
        "Cylinder1702",
        "Cylinder1702_brown_0",
        "Box15836",
        "Box15836_brown_0",
        "Box15835",
        "Box15835_brown_0",
        "Box15834",
        "Box15834_wall2_0",
        "Box15833",
        "Box15833_brown_0",
        "Box15832",
        "Box15832_brown_0",
        "Box15828",
        "Box15828_wall2_0",
        "Box15826",
        "Object_132",
        "Box15826_roof1_0",
        "Box15826_wall2_0",
        "Group655",
        "Object304",
        "Object_137",
        "Object304_metal_0",
        "Object303",
        "Object_140",
        "Object303_metal_0",
        "Cylinder1703",
        "Cylinder1703_dark_0",
        "Cylinder1703_metal_0",
        "Box15858",
        "Box15858_metal_0",
        "Box15857",
        "Box15857_metal_0",
        "Group656",
        "Object306",
        "Object_151",
        "Object306_metal_0",
        "Object305",
        "Object_154",
        "Object305_metal_0",
        "Cylinder1708",
        "Cylinder1708_dark_0",
        "Cylinder1708_metal_0",
        "Box15860",
        "Box15860_metal_0",
        "Box15859",
        "Box15859_metal_0",
        "street_light_003",
        "Object_164",
        "street_light_003_metal_0",
        "street_light_003_L_sign_0",
        "Object330",
        "Object330_mirror_0",
        "Object347",
        "Object347_brown_0",
        "Rectangle022",
        "Rectangle022_concret_0",
        "Cylinder1711",
        "Cylinder1711_metal_0"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/showcaseModernBuildingOne.thumb.svg",
      "quality": "candidate",
      "role": "unknown",
      "suitabilityReason": "Resolved catalog candidate; release validation and rendered-probe proof are still required."
    },
  },
  "showcaseModernOfficeBuilding": {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseModernOfficeBuilding.ef910dc7.glb",
    hash: "sha256-ef910dc7e24f61576121d9f5b9dc0aa736d34d412bd62284430f2af5f4150822",
    bounds: [
      688.414,
      516.542,
      88.168
    ],
    sizeBytes: 9826040,
    metadata: {
      "materials": [
        "Root",
        "poignet",
        "porte",
        "batiment",
        "pilier",
        "sol-environ",
        "rambarde",
        "sol-exterieur",
        "marches-escalier1",
        "porte-garage",
        "material",
        "Plastic",
        "Glass",
        "Marble",
        "rooftop",
        "facade-bois",
        "plancher-ss-sol",
        "mur-brique"
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
        "nodeCount": 390,
        "meshCount": 226,
        "materialCount": 18,
        "textureCount": 4,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Sketchfab_model"
        ],
        "maxDepth": 5,
        "messages": [
          "Detected 390 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/showcaseModernOfficeBuilding.ef910dc7.glb",
        "license": "CC-BY-4.0",
        "licenseName": "CC-BY-4.0",
        "licenseRaw": "CC-BY-4.0",
        "author": "Aurélien Martel",
        "sourceFamily": "objaverse",
        "attribution": "Aurélien Martel",
        "sha256": "sha256-ef910dc7e24f61576121d9f5b9dc0aa736d34d412bd62284430f2af5f4150822",
        "retrievedAt": "2026-06-25T09:05:12.174Z",
        "resolveCandidate": {
          "catalogId": "objaverse:28c251353946454bb57622cb512bca7e",
          "query": "detailed modern architecture building exterior",
          "source": "objaverse",
          "sourceFamily": "objaverse",
          "scoreTotal": 0.3,
          "scoreBreakdown": {
            "semantic": 10.3,
            "sourceQuality": 14,
            "license": 13,
            "inspection": 0,
            "roleFit": 0
          },
          "reasons": [
            "semantic/source score 10.3",
            "download URL preserved",
            "author/attribution preserved",
            "verified CC-BY-4.0 license"
          ],
          "penalties": [
            "missing source page",
            "missing license URL/source evidence",
            "missing bounds/dimensions metadata",
            "missing material metadata for visual model role"
          ],
          "license": "CC-BY-4.0",
          "licenseName": "CC-BY-4.0",
          "licenseRaw": "CC-BY-4.0",
          "author": "Aurélien Martel",
          "attribution": "Aurélien Martel",
          "semanticScore": 0.7594550784181253,
          "postDownloadInspection": {
            "bounds": [
              688.414,
              516.542,
              88.168
            ],
            "materialCount": 18,
            "textureCount": 4,
            "animationClipCount": 0,
            "skinCount": 0,
            "morphTargetCount": 0,
            "warnings": [
              "orientation metadata missing; facing direction cannot be validated until GLTF extras declare aura3d.orientation.forwardAxis"
            ]
          },
          "rawCatalogMetadata": {
            "id": "objaverse:28c251353946454bb57622cb512bca7e",
            "title": "Exterior Architecture",
            "source": "objaverse",
            "license": "CC-BY-4.0",
            "thumbnail": "https://media.sketchfab.com/models/28c251353946454bb57622cb512bca7e/thumbnails/08eba835698b4db09eb3d9a06931d716/50x50.jpeg",
            "attribution": "Aurélien Martel",
            "score": 0.7594550784181253
          }
        },
        "checkedAt": "2026-06-25T09:05:14.934Z"
      },
      "sourcePath": "public/aura-assets/showcaseModernOfficeBuilding.ef910dc7.glb",
      "outputPath": "public/aura-assets/showcaseModernOfficeBuilding.ef910dc7.glb",
      "license": "CC-BY-4.0",
      "author": "Aurélien Martel",
      "boundsMetadata": {
        "min": [
          -55.766,
          -59.437,
          -36.247
        ],
        "max": [
          632.648,
          457.105,
          51.921
        ],
        "size": [
          688.414,
          516.542,
          88.168
        ],
        "center": [
          288.441,
          198.834,
          7.837
        ],
        "maxDimension": 688.414,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "Root",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "poignet",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "porte",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "batiment",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "pilier",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "sol-environ",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "rambarde",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "sol-exterieur",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "marches-escalier1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "porte-garage",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "material",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Plastic",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Glass",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "Marble",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "rooftop",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "facade-bois",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "plancher-ss-sol",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "mur-brique",
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
        "Sketchfab_model",
        "Root",
        "batiment",
        "batiment_0",
        "plancher.002",
        "plancher.002_0",
        "plancher-ss-sol.001",
        "plancher-ss-sol.001_0",
        "cube-cuisine.003",
        "cube-cuisine.003_0",
        "batiment.004",
        "batiment.004_0",
        "cloison.005",
        "cloison.005_0",
        "batiment.006",
        "batiment.006_0",
        "batiment.006_1",
        "plancher.007",
        "Cube.008",
        "Cube.008_0",
        "cloison.009",
        "cloison.009_0",
        "plancher.010",
        "plancher.010_0",
        "plancher.010_1",
        "Window.001",
        "Window.001_0",
        "Window.001_1",
        "Window.001_2",
        "Window.003",
        "Window.003_0",
        "Window.003_1",
        "Window.003_2",
        "Window.000",
        "Window.000_0",
        "Window.000_1",
        "Window.000_2",
        "Window.004",
        "Window.004_0",
        "Window.004_1",
        "Window.004_2",
        "Window.002",
        "Window.002_0",
        "Window.002_1",
        "Window.002_2",
        "Window.005",
        "Window.005_0",
        "Window.005_1",
        "Window.005_2",
        "Window.006",
        "Window.006_0",
        "Window.006_1",
        "Window.006_2",
        "Window.007",
        "Window.007_0",
        "Window.007_1",
        "Window.007_2",
        "Window.008",
        "Window.008_0",
        "Window.008_1",
        "Window.008_2",
        "Window.009",
        "Window.009_0",
        "Window.009_1",
        "Window.009_2",
        "Window.010",
        "Window.010_0",
        "Window.010_1",
        "Window.010_2",
        "Window.011",
        "Window.011_0",
        "Window.011_1",
        "Window.011_2",
        "Window.012",
        "Window.012_0",
        "Window.012_1",
        "Window.012_2",
        "Window.013",
        "Window.013_0",
        "Window.013_1",
        "Window.013_2",
        "Window.014",
        "Window.014_0",
        "Window.014_1",
        "Window.014_2",
        "Window.015",
        "Window.015_0",
        "Window.015_1",
        "Window.015_2",
        "Window.016",
        "Window.016_0",
        "Window.016_1",
        "Window.016_2",
        "Window.017",
        "Window.017_0",
        "Window.017_1",
        "Window.017_2",
        "Window.018",
        "Window.018_0",
        "Window.018_1",
        "Window.018_2",
        "Window.019",
        "Window.019_0",
        "Window.019_1",
        "Window.019_2",
        "Window.020",
        "Window.020_0",
        "Window.020_1",
        "Window.020_2",
        "Window.020_3",
        "Window.022",
        "Window.022_0",
        "Window.022_1",
        "Window.022_2",
        "Window.022_3",
        "Window.023",
        "Window.023_0",
        "Window.023_1",
        "Window.023_2",
        "Window.023_3",
        "Window.024",
        "Window.024_0",
        "Window.024_1",
        "Window.024_2",
        "Window.024_3",
        "Window.025",
        "Window.025_0",
        "Window.025_1",
        "Window.025_2",
        "Window.026",
        "Window.026_0",
        "Window.026_1",
        "Window.026_2",
        "cadre-porte.011",
        "cadre-porte.011_0",
        "porte.012",
        "porte.012_0",
        "poignet",
        "poignet_0",
        "Window.027",
        "Window.027_0",
        "Window.027_1",
        "Window.027_2",
        "Window.028",
        "Window.028_0",
        "Window.028_1",
        "Window.028_2",
        "poignet-ext.004",
        "poignet-ext.004_0",
        "Window.029",
        "Window.029_0",
        "Window.029_1",
        "Window.029_2",
        "cadre-porte-garage.025",
        "cadre-porte-garage.025_0",
        "garage-rideau.026",
        "garage-rideau.026_0",
        "porte-garage",
        "porte-garage_0",
        "porte-garage.001",
        "porte-garage.001_0",
        "garage-rideau.027",
        "garage-rideau.027_0",
        "cadre-porte-garage",
        "cadre-porte-garage_0",
        "pieds-rambarde",
        "pieds-rambarde_0",
        "rambarde-main.001",
        "rambarde-main.001_0",
        "rambarde.002",
        "rambarde.002_0",
        "rambarde.003",
        "rambarde.003_0",
        "rambarde-main.004",
        "rambarde-main.004_0",
        "pieds-rambarde.005",
        "pieds-rambarde.005_0",
        "pieds-rambarde.006",
        "pieds-rambarde.006_0",
        "rambarde-main.007",
        "rambarde-main.007_0",
        "rambarde.008",
        "rambarde.008_0",
        "pieds-rambarde.009",
        "pieds-rambarde.009_0",
        "rambarde-main.010",
        "rambarde-main.010_0",
        "rambarde.011",
        "rambarde.011_0",
        "rambarde.012",
        "rambarde.012_0",
        "rambarde-main.013",
        "rambarde-main.013_0",
        "pieds-rambarde.014",
        "pieds-rambarde.014_0",
        "pieds-rambarde.015",
        "pieds-rambarde.015_0",
        "rambarde-main.016",
        "rambarde-main.016_0",
        "rambarde.017",
        "rambarde.017_0",
        "rambarde.018",
        "rambarde.018_0",
        "rambarde-main.019",
        "rambarde-main.019_0",
        "pieds-rambarde.020",
        "pieds-rambarde.020_0",
        "rambarde.021",
        "rambarde.021_0",
        "rambarde-main.022",
        "rambarde-main.022_0",
        "pieds-rambarde.023",
        "pieds-rambarde.023_0",
        "pieds-rambarde.024",
        "pieds-rambarde.024_0",
        "rambarde-main025",
        "rambarde-main025_0",
        "rambarde.026",
        "rambarde.026_0",
        "rambarde.027",
        "rambarde.027_0",
        "rambarde-main.028",
        "rambarde-main.028_0",
        "pieds-rambarde.029",
        "pieds-rambarde.029_0",
        "pieds-rambarde.030",
        "pieds-rambarde.030_0",
        "rambarde-main.031",
        "rambarde-main.031_0",
        "rambarde.032",
        "rambarde.032_0",
        "pieds-rambarde.033",
        "pieds-rambarde.033_0",
        "rambarde-main.034",
        "rambarde-main.034_0",
        "rambarde.035",
        "rambarde.035_0",
        "pieds-rambarde.036",
        "pieds-rambarde.036_0",
        "rambarde-main.037",
        "rambarde-main.037_0",
        "rambarde.038",
        "rambarde.038_0",
        "palier-ext",
        "palier-ext_0",
        "escalier.001",
        "escalier.001_0",
        "escalier.002",
        "escalier.002_0",
        "palier-ext.003",
        "palier-ext.003_0",
        "pieds-rambarde.039",
        "pieds-rambarde.039_0",
        "rambarde-main.040",
        "rambarde-main.040_0",
        "rambarde.041",
        "rambarde.041_0",
        "Window.021",
        "Window.021_0",
        "Window.021_1",
        "Window.021_2",
        "Window.021_3",
        "rambarde.042",
        "rambarde.042_0",
        "rambarde-main.043",
        "rambarde-main.043_0",
        "pieds-rambarde.044",
        "pieds-rambarde.044_0",
        "pieds-rambarde.045",
        "pieds-rambarde.045_0",
        "rambarde-main.046",
        "rambarde-main.046_0",
        "rambarde.047",
        "rambarde.047_0",
        "rambarde.048",
        "rambarde.048_0",
        "rambarde-main.049",
        "rambarde-main.049_0",
        "pieds-rambarde.050",
        "pieds-rambarde.050_0",
        "pieds-rambarde.051",
        "pieds-rambarde.051_0",
        "rambarde-main.052",
        "rambarde-main.052_0",
        "rambarde.053",
        "rambarde.053_0",
        "rambarde.054",
        "rambarde.054_0",
        "rambarde-main.055",
        "rambarde-main.055_0",
        "pieds-rambarde.056",
        "pieds-rambarde.056_0",
        "pieds-rambarde.057",
        "pieds-rambarde.057_0",
        "rambarde.058",
        "rambarde.058_0",
        "rambarde-main.059",
        "rambarde-main.059_0",
        "Sol-environnement.004",
        "Sol-environnement.004_0",
        "plancher.003",
        "plancher.003_0",
        "escalier.000",
        "escalier.000_0",
        "Plane",
        "Plane_0",
        "rambarde-main.000",
        "rambarde-main.000_0",
        "pieds-rambarde.001",
        "pieds-rambarde.001_0",
        "pieds-rambarde.002",
        "pieds-rambarde.002_0",
        "rambarde-main.002",
        "rambarde-main.002_0",
        "rambarde-main.003",
        "rambarde-main.003_0",
        "pieds-rambarde.003",
        "pieds-rambarde.003_0",
        "pieds-rambarde.004",
        "pieds-rambarde.004_0",
        "rambarde-main.005",
        "rambarde-main.005_0",
        "Plane.001",
        "Plane.001_0",
        "escalier.003",
        "escalier.003_0",
        "pieds-rambarde.007",
        "pieds-rambarde.007_0",
        "rambarde-main.006",
        "rambarde-main.006_0",
        "rambarde-main.008",
        "rambarde-main.008_0",
        "pieds-rambarde.008",
        "pieds-rambarde.008_0",
        "pieds-rambarde.010",
        "pieds-rambarde.010_0",
        "rambarde-main.009",
        "rambarde-main.009_0",
        "rambarde-main.011",
        "rambarde-main.011_0",
        "pieds-rambarde.011",
        "pieds-rambarde.011_0",
        "Cylinder",
        "Cylinder_0",
        "Cylinder.001",
        "Cylinder.001_0",
        "Cylinder.002",
        "Cylinder.002_0",
        "Sun",
        "Sun",
        "batiment.002",
        "batiment.002_0",
        "poignet.001",
        "poignet.001_0",
        "porte.000",
        "porte.000_0",
        "cadre-porte.000",
        "cadre-porte.000_0",
        "cadre-porte.001",
        "cadre-porte.001_0",
        "porte.001",
        "porte.001_0",
        "poignet.002",
        "poignet.002_0",
        "poignet.003",
        "poignet.003_0",
        "porte.002",
        "porte.002_0",
        "cadre-porte.002",
        "cadre-porte.002_0",
        "poignet.004",
        "poignet.004_0",
        "porte.003",
        "porte.003_0",
        "cadre-porte.003",
        "cadre-porte.003_0",
        "cadre-porte.004",
        "cadre-porte.004_0",
        "porte.004",
        "porte.004_0",
        "poignet.005",
        "poignet.005_0",
        "poignet.006",
        "poignet.006_0",
        "cadre-porte.005",
        "cadre-porte.005_0",
        "porte.005",
        "porte.005_0",
        "poignet.007",
        "poignet.007_0"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2",
        "image-3"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/showcaseModernOfficeBuilding.thumb.svg",
      "quality": "candidate",
      "role": "unknown",
      "suitabilityReason": "Resolved catalog candidate; release validation and rendered-probe proof are still required."
    },
  },
  "showcaseTeaHouse": {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseTeaHouse.65abbf0c.glb",
    hash: "sha256-65abbf0c4ad0d3804190451b3eb5b29168a10025b4591763af96fe76c3c460a1",
    bounds: [
      7.793,
      7.156,
      6.039
    ],
    sizeBytes: 6277664,
    metadata: {
      "materials": [
        "phong9",
        "phong58",
        "phong59",
        "phong21",
        "phong30",
        "lambert1",
        "phong22",
        "phong31",
        "phong43",
        "phong44",
        "phong2",
        "phong8",
        "phong17",
        "phong63",
        "phong64",
        "phong18",
        "phong62",
        "phong15",
        "phong14",
        "phong27",
        "phong45",
        "phong46",
        "phong19",
        "phong53",
        "phong54",
        "phong24",
        "phong55",
        "phong56",
        "phong13",
        "phong33",
        "phong34",
        "phong35",
        "phong36",
        "phong57",
        "phong28",
        "phong29",
        "phong20",
        "phong5",
        "phong49",
        "phong52",
        "phong7",
        "phong11",
        "phong10",
        "phong61",
        "phong12",
        "phong50",
        "phong51",
        "phong1",
        "phong40",
        "phong25",
        "phong26",
        "phong41",
        "phong42",
        "phong4",
        "phong3",
        "phong6",
        "phong16",
        "phong65",
        "phong32",
        "phong60"
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
      "provenance": {
        "sourcePath": "public/aura-assets/showcaseTeaHouse.65abbf0c.glb",
        "license": "CC-BY-4.0",
        "author": "Sultan_The2nd",
        "sourceFamily": "objaverse",
        "attribution": "Sultan_The2nd",
        "sha256": "sha256-65abbf0c4ad0d3804190451b3eb5b29168a10025b4591763af96fe76c3c460a1",
        "retrievedAt": "2026-06-18T00:11:06.026Z",
        "checkedAt": "2026-06-18T00:11:07.670Z",
        "licenseName": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
      },
      "sourcePath": "public/aura-assets/showcaseTeaHouse.65abbf0c.glb",
      "outputPath": "public/aura-assets/showcaseTeaHouse.65abbf0c.glb",
      "license": "CC-BY-4.0",
      "author": "Sultan_The2nd",
      "boundsMetadata": {
        "min": [
          -2.553,
          -2.197,
          -3.179
        ],
        "max": [
          5.24,
          4.959,
          2.86
        ],
        "size": [
          7.793,
          7.156,
          6.039
        ],
        "center": [
          1.344,
          1.381,
          -0.159
        ],
        "maxDimension": 7.793,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "phong9",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong58",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong59",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong21",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong30",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "lambert1",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong22",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong31",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong43",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong44",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong2",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong8",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong17",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong63",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong64",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong18",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong62",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong15",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong14",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong27",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong45",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong46",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong19",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong53",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong54",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong24",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong55",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong56",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong13",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong33",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong34",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong35",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong36",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong57",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong28",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong29",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong20",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong5",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong49",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong52",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong7",
          "visible": false,
          "readable": false,
          "opacity": 0,
          "alphaMode": "BLEND",
          "reasons": [
            "baseColorFactor alpha is 0"
          ]
        },
        {
          "name": "phong11",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong10",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong61",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong12",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong50",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong51",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong1",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong40",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong25",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong26",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong41",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong42",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong4",
          "visible": true,
          "readable": true,
          "opacity": 0.25,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "phong3",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong6",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong16",
          "visible": false,
          "readable": false,
          "opacity": 0,
          "alphaMode": "BLEND",
          "reasons": [
            "baseColorFactor alpha is 0"
          ]
        },
        {
          "name": "phong65",
          "visible": false,
          "readable": false,
          "opacity": 0,
          "alphaMode": "BLEND",
          "reasons": [
            "baseColorFactor alpha is 0"
          ]
        },
        {
          "name": "phong32",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "phong60",
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
        "Sketchfab_model",
        "root",
        "GLTF_SceneRootNode",
        "RootNode (gltf orientation matrix)_2131",
        "RootNode (model correction matrix)_2130",
        "1f92bd673cfa44f282f72c88ea188458.fbx_2129",
        "Node_3_2128",
        "RootNode_2127",
        "group8_13",
        "pCylinder127_7",
        "pCylinder127_phong9_0_6",
        "Object_11",
        "pCylinder128_9",
        "pCylinder128_phong9_0_8",
        "Object_14",
        "pasted__polySurface1449.001_21",
        "pasted__polySurface1449_phong58_0_18",
        "Object_17",
        "pasted__polySurface1449_phong59_0_19",
        "Object_19",
        "pasted__polySurface1449_phong9_0_20",
        "Object_21",
        "pCube100_23",
        "pCube100_phong21_0_22",
        "Object_24",
        "pCube101_25",
        "pCube101_phong21_0_24",
        "Object_27",
        "pCube102_27",
        "pCube102_phong30_0_26",
        "Object_30",
        "pCube103_29",
        "pCube103_phong21_0_28",
        "Object_33",
        "pCube104_31",
        "pCube104_phong21_0_30",
        "Object_36",
        "pCube105_33",
        "pCube105_phong30_0_32",
        "Object_39",
        "pCube106_35",
        "pCube106_phong21_0_34",
        "Object_42",
        "pCube107_37",
        "pCube107_phong21_0_36",
        "Object_45",
        "pCube108_39",
        "pCube108_phong30_0_38",
        "Object_48",
        "pCube109_41",
        "pCube109_phong30_0_40",
        "Object_51",
        "pCube110_43",
        "pCube110_phong21_0_42",
        "Object_54",
        "pCube111_45",
        "pCube111_phong21_0_44",
        "Object_57",
        "pCube112_47",
        "pCube112_phong21_0_46",
        "Object_60",
        "pCube113_49",
        "pCube113_phong30_0_48",
        "Object_63",
        "pCube114_51",
        "pCube114_phong21_0_50",
        "Object_66",
        "pCube115_53",
        "pCube115_phong21_0_52",
        "Object_69",
        "pCube116_55",
        "pCube116_phong21_0_54",
        "Object_72",
        "pCube117_57",
        "pCube117_phong30_0_56",
        "Object_75",
        "pCube118_59",
        "pCube118_phong21_0_58",
        "Object_78",
        "pCube119_61",
        "pCube119_phong21_0_60",
        "Object_81",
        "pCube120_63",
        "pCube120_phong30_0_62",
        "Object_84",
        "pCube121_65",
        "pCube121_phong21_0_64",
        "Object_87",
        "pCube122_67",
        "pCube122_phong30_0_66",
        "Object_90",
        "pCube123_69",
        "pCube123_phong21_0_68",
        "Object_93",
        "pCube124_71",
        "pCube124_phong21_0_70",
        "Object_96",
        "pCube125_73",
        "pCube125_phong21_0_72",
        "Object_99",
        "pCube126_75",
        "pCube126_phong21_0_74",
        "Object_102",
        "pCube127_77",
        "pCube127_phong21_0_76",
        "Object_105",
        "pCube128_79",
        "pCube128_phong30_0_78",
        "Object_108",
        "pCube129_81",
        "pCube129_phong30_0_80",
        "Object_111",
        "pCube130_83",
        "pCube130_phong21_0_82",
        "Object_114",
        "pCube131_85",
        "pCube131_phong30_0_84",
        "Object_117",
        "pCube132_87",
        "pCube132_phong21_0_86",
        "Object_120",
        "pCube133_89",
        "pCube133_phong21_0_88",
        "Object_123",
        "pCube134_91",
        "pCube134_phong21_0_90",
        "Object_126",
        "pCube135_93",
        "pCube135_phong30_0_92",
        "Object_129",
        "pCube136_95",
        "pCube136_phong30_0_94",
        "Object_132",
        "pCube137_97",
        "pCube137_phong21_0_96",
        "Object_135",
        "pCube138_99",
        "pCube138_phong21_0_98",
        "Object_138",
        "pCube139_101",
        "pCube139_phong30_0_100",
        "Object_141",
        "pCube140_103",
        "pCube140_phong21_0_102",
        "Object_144",
        "pCube141_105",
        "pCube141_phong21_0_104",
        "Object_147",
        "pCube142_107",
        "pCube142_phong21_0_106",
        "Object_150",
        "pCube143_109",
        "pCube143_phong30_0_108",
        "Object_153",
        "pCube144_111",
        "pCube144_phong21_0_110",
        "Object_156",
        "pCube145_113",
        "pCube145_phong30_0_112",
        "Object_159",
        "pCube146_115",
        "pCube146_phong30_0_114",
        "Object_162",
        "pCube147_117",
        "pCube147_phong21_0_116",
        "Object_165",
        "pCube148_119",
        "pCube148_phong21_0_118",
        "Object_168",
        "pCube149_121",
        "pCube149_phong21_0_120",
        "Object_171",
        "pCube150_123",
        "pCube150_phong21_0_122",
        "Object_174",
        "pCube151_125",
        "pCube151_phong21_0_124",
        "Object_177",
        "pCube152_127",
        "pCube152_phong21_0_126",
        "Object_180",
        "pCube153_129",
        "pCube153_phong21_0_128",
        "Object_183",
        "pCube154_131",
        "pCube154_phong30_0_130",
        "Object_186",
        "pCube155_133",
        "pCube155_phong21_0_132",
        "Object_189",
        "pCube156_135",
        "pCube156_phong30_0_134",
        "Object_192",
        "pCube157_137",
        "pCube157_phong30_0_136",
        "Object_195",
        "pCube158_139",
        "pCube158_phong21_0_138",
        "Object_198",
        "pCube159_141",
        "pCube159_phong30_0_140",
        "Object_201",
        "pCube160_143",
        "pCube160_phong30_0_142",
        "Object_204",
        "pCube161_145",
        "pCube161_phong21_0_144",
        "Object_207",
        "pCube162_147",
        "pCube162_phong21_0_146",
        "Object_210",
        "pCube163_149",
        "pCube163_phong30_0_148",
        "Object_213",
        "pCube164_151",
        "pCube164_phong30_0_150",
        "Object_216",
        "pCube165_153",
        "pCube165_phong30_0_152",
        "Object_219",
        "pCube166_155",
        "pCube166_phong30_0_154",
        "Object_222",
        "pCube167_157",
        "pCube167_phong21_0_156",
        "Object_225",
        "pCube168_159",
        "pCube168_phong21_0_158",
        "Object_228",
        "pCube169_161",
        "pCube169_phong30_0_160",
        "Object_231",
        "pCube17_163",
        "pCube17_lambert1_0_162",
        "Object_234",
        "pCube179_173",
        "pCube179_phong22_0_172",
        "Object_237",
        "pCube180_175",
        "pCube180_phong22_0_174",
        "Object_240",
        "pCube181_177",
        "pCube181_phong22_0_176",
        "Object_243",
        "pCube182_179",
        "pCube182_phong22_0_178",
        "Object_246",
        "pCube183_181",
        "pCube183_phong22_0_180",
        "Object_249",
        "pCube184_183",
        "pCube184_phong22_0_182",
        "Object_252",
        "pCube185_185",
        "pCube185_phong22_0_184",
        "Object_255",
        "pCube186_187",
        "pCube186_phong22_0_186",
        "Object_258",
        "pCube187_189",
        "pCube187_phong22_0_188",
        "Object_261",
        "pCube188_191",
        "pCube188_phong22_0_190",
        "Object_264",
        "pCube189_193",
        "pCube189_phong22_0_192",
        "Object_267",
        "pCube2_203",
        "pCube2_phong31_0_200",
        "Object_270",
        "pCube2_phong43_0_201",
        "Object_272",
        "pCube2_phong44_0_202",
        "Object_274",
        "pCube203_205",
        "pCube203_phong2_0_204",
        "Object_277",
        "pCube204_207",
        "pCube204_phong2_0_206",
        "Object_280",
        "pCube227_216",
        "pCube227_phong31_0_215",
        "Object_283",
        "pCube228_218",
        "pCube228_phong31_0_217",
        "Object_286",
        "pCube23_220",
        "pCube23_phong8_0_219",
        "Object_289",
        "pCube235_253",
        "polySurface1540_223",
        "polySurface1540_phong17_0_221",
        "Object_293",
        "polySurface1540_phong63_0_222",
        "Object_295",
        "polySurface1541_226",
        "polySurface1541_phong17_0_224",
        "Object_298",
        "polySurface1541_phong64_0_225",
        "Object_300",
        "polySurface1542_229",
        "polySurface1542_phong17_0_227",
        "Object_303",
        "polySurface1542_phong63_0_228",
        "Object_305",
        "polySurface1543_232",
        "polySurface1543_phong17_0_230",
        "Object_308",
        "polySurface1543_phong63_0_231",
        "Object_310",
        "polySurface1544_234",
        "polySurface1544_phong17_0_233",
        "Object_313",
        "polySurface1545_237",
        "polySurface1545_phong18_0_235",
        "Object_316",
        "polySurface1545_phong62_0_236",
        "Object_318",
        "polySurface1546_240",
        "polySurface1546_phong17_0_238",
        "Object_321",
        "polySurface1546_phong63_0_239",
        "Object_323",
        "polySurface1547_243",
        "polySurface1547_phong17_0_241",
        "Object_326",
        "polySurface1547_phong63_0_242",
        "Object_328",
        "polySurface1548_246",
        "polySurface1548_phong17_0_244",
        "Object_331",
        "polySurface1548_phong63_0_245",
        "Object_333",
        "polySurface1549_249",
        "polySurface1549_phong17_0_247",
        "Object_336",
        "polySurface1549_phong63_0_248",
        "Object_338",
        "polySurface1550_252",
        "polySurface1550_phong17_0_250",
        "Object_341",
        "polySurface1550_phong63_0_251",
        "Object_343",
        "pCube236_255",
        "pCube236_phong15_0_254",
        "Object_346",
        "pCube237_257",
        "pCube237_phong14_0_256",
        "Object_349",
        "pCube24_259",
        "pCube24_phong8_0_258",
        "Object_352",
        "pCube25_267",
        "pCube25_phong27_0_264",
        "Object_355",
        "pCube25_phong45_0_265",
        "Object_357",
        "pCube25_phong46_0_266",
        "Object_359",
        "pCube253_271",
        "pCube253_phong15_0_270",
        "Object_362",
        "pCube255_295",
        "polySurface1806_273",
        "polySurface1806_phong9_0_272",
        "Object_366",
        "pCube258_345",
        "pCube258_phong14_0_344",
        "Object_369",
        "pCube259_347",
        "pCube259_phong14_0_346",
        "Object_372",
        "pCube26_350",
        "pCube26_phong27_0_348",
        "Object_375",
        "pCube26_phong46_0_349",
        "Object_377",
        "pCube260_352",
        "pCube260_phong14_0_351",
        "Object_380",
        "pCube261_360",
        "polySurface1839_355",
        "polySurface1839_phong27_0_353",
        "Object_384",
        "polySurface1839_phong46_0_354",
        "Object_386",
        "polySurface1840_359",
        "polySurface1840_phong27_0_356",
        "Object_389",
        "polySurface1840_phong45_0_357",
        "Object_391",
        "polySurface1840_phong46_0_358",
        "Object_393",
        "pCube262_364",
        "pCube262_phong27_0_361",
        "Object_396",
        "pCube262_phong45_0_362",
        "Object_398",
        "pCube262_phong46_0_363",
        "Object_400",
        "pCube263_368",
        "pCube263_phong19_0_365",
        "Object_403",
        "pCube263_phong53_0_366",
        "Object_405",
        "pCube263_phong54_0_367",
        "Object_407",
        "pCube264_372",
        "pCube264_phong19_0_369",
        "Object_410",
        "pCube264_phong53_0_370",
        "Object_412",
        "pCube264_phong54_0_371",
        "Object_414",
        "pCube265_376",
        "pCube265_phong19_0_373",
        "Object_417",
        "pCube265_phong53_0_374",
        "Object_419",
        "pCube265_phong54_0_375",
        "Object_421",
        "pCube266_380",
        "pCube266_phong19_0_377",
        "Object_424",
        "pCube266_phong53_0_378",
        "Object_426",
        "pCube266_phong54_0_379",
        "Object_428",
        "pCube267_384",
        "pCube267_phong24_0_381",
        "Object_431",
        "pCube267_phong55_0_382",
        "Object_433",
        "pCube267_phong56_0_383",
        "Object_435",
        "pCube35_389",
        "pCube35_phong27_0_386",
        "Object_438",
        "pCube35_phong45_0_387",
        "Object_440",
        "pCube35_phong46_0_388",
        "Object_442",
        "pCube36_392",
        "pCube36_phong27_0_390",
        "Object_445",
        "pCube36_phong46_0_391",
        "Object_447",
        "pCube39_395",
        "pCube39_phong27_0_393",
        "Object_450",
        "pCube39_phong46_0_394",
        "Object_452",
        "pCube40_399",
        "pCube40_phong27_0_396",
        "Object_455",
        "pCube40_phong45_0_397",
        "Object_457",
        "pCube40_phong46_0_398",
        "Object_459",
        "pCube49_406",
        "pCube49_phong27_0_403",
        "Object_462",
        "pCube49_phong45_0_404",
        "Object_464",
        "pCube49_phong46_0_405",
        "Object_466",
        "pCube50_409",
        "pCube50_phong2_0_408",
        "Object_469",
        "pCube52_413",
        "pCube52_phong19_0_410",
        "Object_472",
        "pCube52_phong53_0_411",
        "Object_474",
        "pCube52_phong54_0_412",
        "Object_476",
        "pCube63_416",
        "pCube63_phong13_0_415",
        "Object_479",
        "pCube64_420",
        "pCube64_phong24_0_417",
        "Object_482",
        "pCube64_phong55_0_418",
        "Object_484",
        "pCube64_phong56_0_419",
        "Object_486",
        "pCube66_426",
        "pCube66_phong13_0_422",
        "Object_489",
        "pCube66_phong33_0_423",
        "Object_491",
        "pCube66_phong34_0_424",
        "Object_493",
        "pCube66_phong35_0_425",
        "Object_495",
        "pCube67_431",
        "pCube67_phong24_0_427",
        "Object_498",
        "pCube67_phong36_0_428",
        "Object_500",
        "pCube67_phong55_0_429",
        "Object_502",
        "pCube67_phong57_0_430",
        "Object_504",
        "pCube69_433",
        "pCube69_phong28_0_432",
        "Object_507",
        "pCube71_435",
        "pCube71_phong29_0_434",
        "Object_510",
        "pCube72_437",
        "pCube72_phong20_0_436",
        "Object_513",
        "pCube73_439",
        "pCube73_phong28_0_438",
        "Object_516",
        "pCube74_441",
        "pCube74_phong29_0_440",
        "Object_519",
        "pCube75_443",
        "pCube75_phong28_0_442",
        "Object_522",
        "pCube76_445",
        "pCube76_phong28_0_444",
        "Object_525",
        "pCube77_447",
        "pCube77_phong28_0_446",
        "Object_528",
        "pCube78_449",
        "pCube78_phong29_0_448",
        "Object_531",
        "pCube79_451",
        "pCube79_phong20_0_450",
        "Object_534",
        "pCube80_453",
        "pCube80_phong28_0_452",
        "Object_537",
        "pCube81_455",
        "pCube81_phong21_0_454",
        "Object_540",
        "pCube82_457",
        "pCube82_phong30_0_456",
        "Object_543",
        "pCube83_459",
        "pCube83_phong21_0_458",
        "Object_546",
        "pCube84_461",
        "pCube84_phong21_0_460",
        "Object_549",
        "pCube85_463",
        "pCube85_phong30_0_462",
        "Object_552",
        "pCube86_465",
        "pCube86_phong21_0_464",
        "Object_555",
        "pCube87_467",
        "pCube87_phong21_0_466",
        "Object_558",
        "pCube88_469",
        "pCube88_phong21_0_468",
        "Object_561",
        "pCube89_471",
        "pCube89_phong30_0_470",
        "Object_564",
        "pCube90_473",
        "pCube90_phong21_0_472",
        "Object_567",
        "pCube91_475",
        "pCube91_phong21_0_474",
        "Object_570",
        "pCube92_477",
        "pCube92_phong21_0_476",
        "Object_573",
        "pCube93_479",
        "pCube93_phong30_0_478",
        "Object_576",
        "pCube94_481",
        "pCube94_phong21_0_480",
        "Object_579",
        "pCube95_483",
        "pCube95_phong30_0_482",
        "Object_582",
        "pCube96_485",
        "pCube96_phong30_0_484",
        "Object_585",
        "pCube97_487",
        "pCube97_phong30_0_486",
        "Object_588",
        "pCube98_489",
        "pCube98_phong21_0_488",
        "Object_591",
        "pCube99_491",
        "pCube99_phong30_0_490",
        "Object_594",
        "pCylinder113_493",
        "pCylinder113_phong27_0_492",
        "Object_597",
        "pCylinder114_495",
        "pCylinder114_phong27_0_494",
        "Object_600",
        "pCylinder115_497",
        "pCylinder115_phong27_0_496",
        "Object_603",
        "pCylinder116_499",
        "pCylinder116_phong27_0_498",
        "Object_606",
        "pCylinder117_501",
        "pCylinder117_phong27_0_500",
        "Object_609",
        "pCylinder118_503",
        "pCylinder118_phong27_0_502",
        "Object_612",
        "pCylinder125_528",
        "polySurface1935_505",
        "polySurface1935_phong5_0_504",
        "Object_616",
        "polySurface1936_507",
        "polySurface1936_phong5_0_506",
        "Object_619",
        "polySurface1937_509",
        "polySurface1937_phong49_0_508",
        "Object_622",
        "polySurface1938_512",
        "polySurface1938_phong52_0_510",
        "Object_625",
        "polySurface1938_phong5_0_511",
        "Object_627",
        "polySurface1944_515",
        "polySurface1944_phong52_0_513",
        "Object_630",
        "polySurface1944_phong5_0_514",
        "Object_632",
        "polySurface1945_518",
        "polySurface1945_phong52_0_516",
        "Object_635",
        "polySurface1945_phong5_0_517",
        "Object_637",
        "polySurface1946_521",
        "polySurface1946_phong52_0_519",
        "Object_640",
        "polySurface1946_phong5_0_520",
        "Object_642",
        "polySurface1947_524",
        "polySurface1947_phong52_0_522",
        "Object_645",
        "polySurface1947_phong5_0_523",
        "Object_647",
        "polySurface1948_527",
        "polySurface1948_phong52_0_525",
        "Object_650",
        "polySurface1948_phong5_0_526",
        "Object_652",
        "pCylinder140_534",
        "pCylinder140_phong7_0_533",
        "Object_655",
        "pCylinder146_546",
        "polySurface1532_539",
        "polySurface1532_phong11_0_538",
        "Object_659",
        "polySurface1533_541",
        "polySurface1533_phong10_0_540",
        "Object_662",
        "polySurface1534_543",
        "polySurface1534_phong61_0_542",
        "Object_665",
        "polySurface1535_545",
        "polySurface1535_phong12_0_544",
        "Object_668",
        "pCylinder147_548",
        "pCylinder147_phong7_0_547",
        "Object_671",
        "pCylinder148_557",
        "polySurface1536_550",
        "polySurface1536_phong11_0_549",
        "Object_675",
        "polySurface1537_552",
        "polySurface1537_phong10_0_551",
        "Object_678",
        "polySurface1538_554",
        "polySurface1538_phong61_0_553",
        "Object_681",
        "polySurface1539_556",
        "polySurface1539_phong12_0_555",
        "Object_684",
        "pCylinder149_559",
        "pCylinder149_phong7_0_558",
        "Object_687",
        "pCylinder150_568",
        "polySurface1528_561",
        "polySurface1528_phong11_0_560",
        "Object_691",
        "polySurface1529_563",
        "polySurface1529_phong10_0_562",
        "Object_694",
        "polySurface1530_565",
        "polySurface1530_phong61_0_564",
        "Object_697",
        "polySurface1531_567",
        "polySurface1531_phong12_0_566",
        "Object_700",
        "pCylinder151_570",
        "pCylinder151_phong7_0_569",
        "Object_703",
        "pCylinder152_579",
        "polySurface1524_572",
        "polySurface1524_phong11_0_571",
        "Object_707",
        "polySurface1525_574",
        "polySurface1525_phong10_0_573",
        "Object_710",
        "polySurface1526_576",
        "polySurface1526_phong61_0_575",
        "Object_713",
        "polySurface1527_578",
        "polySurface1527_phong12_0_577",
        "Object_716",
        "pCylinder154_581",
        "pCylinder154_phong7_0_580",
        "Object_719",
        "pCylinder3_589",
        "pCylinder3_phong2_0_587",
        "Object_722",
        "pCylinder3_phong50_0_588",
        "Object_724",
        "pCylinder42_598",
        "pCylinder42_phong2_0_596",
        "Object_727",
        "pCylinder42_phong51_0_597",
        "Object_729",
        "pCylinder43_601",
        "pCylinder43_phong2_0_599",
        "Object_732",
        "pCylinder43_phong50_0_600",
        "Object_734",
        "pCylinder44_603",
        "pCylinder44_phong2_0_602",
        "Object_737",
        "pCylinder45_606",
        "pCylinder45_phong2_0_604",
        "Object_740",
        "pCylinder45_phong50_0_605",
        "Object_742",
        "pCylinder46_609",
        "pCylinder46_phong2_0_607",
        "Object_745",
        "pCylinder46_phong51_0_608",
        "Object_747",
        "pCylinder47_612",
        "pCylinder47_phong2_0_610",
        "Object_750",
        "pCylinder47_phong50_0_611",
        "Object_752",
        "pCylinder48_614",
        "pCylinder48_phong2_0_613",
        "Object_755",
        "pCylinder49_617",
        "pCylinder49_phong2_0_615",
        "Object_758",
        "pCylinder49_phong51_0_616",
        "Object_760",
        "pCylinder50_619",
        "pCylinder50_phong2_0_618",
        "Object_763",
        "pCylinder51_622",
        "pCylinder51_phong2_0_620",
        "Object_766",
        "pCylinder51_phong51_0_621",
        "Object_768",
        "pCylinder52_625",
        "pCylinder52_phong2_0_623",
        "Object_771",
        "pCylinder52_phong50_0_624",
        "Object_773",
        "polySurface1052_1186",
        "polySurface1551_633",
        "polySurface1551_phong1_0_631",
        "Object_777",
        "polySurface1551_phong40_0_632",
        "Object_779",
        "polySurface1552_636",
        "polySurface1552_phong1_0_634",
        "Object_782",
        "polySurface1552_phong40_0_635",
        "Object_784",
        "polySurface1553_639",
        "polySurface1553_phong1_0_637",
        "Object_787",
        "polySurface1553_phong40_0_638",
        "Object_789",
        "polySurface1554_642",
        "polySurface1554_phong1_0_640",
        "Object_792",
        "polySurface1554_phong40_0_641",
        "Object_794",
        "polySurface1555_645",
        "polySurface1555_phong1_0_643",
        "Object_797",
        "polySurface1555_phong40_0_644",
        "Object_799",
        "polySurface1556_648",
        "polySurface1556_phong1_0_646",
        "Object_802",
        "polySurface1556_phong40_0_647",
        "Object_804",
        "polySurface1557_650",
        "polySurface1557_phong25_0_649",
        "Object_807",
        "polySurface1558_653",
        "polySurface1558_phong1_0_651",
        "Object_810",
        "polySurface1558_phong40_0_652",
        "Object_812",
        "polySurface1559_655",
        "polySurface1559_phong1_0_654",
        "Object_815",
        "polySurface1560_657",
        "polySurface1560_phong1_0_656",
        "Object_818",
        "polySurface1561_659",
        "polySurface1561_phong1_0_658",
        "Object_821",
        "polySurface1562_661",
        "polySurface1562_phong1_0_660",
        "Object_824",
        "polySurface1563_664",
        "polySurface1563_phong1_0_662",
        "Object_827",
        "polySurface1563_phong40_0_663",
        "Object_829",
        "polySurface1564_666",
        "polySurface1564_phong25_0_665",
        "Object_832",
        "polySurface1565_668",
        "polySurface1565_phong26_0_667",
        "Object_835",
        "polySurface1566_670",
        "polySurface1566_phong25_0_669",
        "Object_838",
        "polySurface1567_672",
        "polySurface1567_phong26_0_671",
        "Object_841",
        "polySurface1568_674",
        "polySurface1568_phong25_0_673",
        "Object_844",
        "polySurface1569_676",
        "polySurface1569_phong1_0_675",
        "Object_847",
        "polySurface1570_678",
        "polySurface1570_phong26_0_677",
        "Object_850",
        "polySurface1571_680",
        "polySurface1571_phong25_0_679",
        "Object_853",
        "polySurface1572_682",
        "polySurface1572_phong1_0_681",
        "Object_856",
        "polySurface1573_684",
        "polySurface1573_phong26_0_683",
        "Object_859",
        "polySurface1574_686",
        "polySurface1574_phong1_0_685",
        "Object_862",
        "polySurface1575_688",
        "polySurface1575_phong1_0_687",
        "Object_865",
        "polySurface1576_690",
        "polySurface1576_phong1_0_689",
        "Object_868",
        "polySurface1577_693",
        "polySurface1577_phong1_0_691",
        "Object_871",
        "polySurface1577_phong40_0_692",
        "Object_873",
        "polySurface1578_695",
        "polySurface1578_phong1_0_694",
        "Object_876",
        "polySurface1579_697",
        "polySurface1579_phong1_0_696",
        "Object_879",
        "polySurface1580_699",
        "polySurface1580_phong1_0_698",
        "Object_882",
        "polySurface1581_701",
        "polySurface1581_phong25_0_700",
        "Object_885",
        "polySurface1582_703",
        "polySurface1582_phong26_0_702",
        "Object_888",
        "polySurface1583_705",
        "polySurface1583_phong1_0_704",
        "Object_891",
        "polySurface1584_707",
        "polySurface1584_phong25_0_706",
        "Object_894",
        "polySurface1585_709",
        "polySurface1585_phong1_0_708",
        "Object_897",
        "polySurface1586_711",
        "polySurface1586_phong1_0_710",
        "Object_900",
        "polySurface1587_713",
        "polySurface1587_phong1_0_712",
        "Object_903",
        "polySurface1588_715",
        "polySurface1588_phong26_0_714",
        "Object_906",
        "polySurface1589_717",
        "polySurface1589_phong25_0_716",
        "Object_909",
        "polySurface1590_719",
        "polySurface1590_phong1_0_718",
        "Object_912",
        "polySurface1591_721",
        "polySurface1591_phong1_0_720",
        "Object_915",
        "polySurface1592_723",
        "polySurface1592_phong1_0_722",
        "Object_918",
        "polySurface1593_725",
        "polySurface1593_phong1_0_724",
        "Object_921",
        "polySurface1594_727",
        "polySurface1594_phong1_0_726",
        "Object_924",
        "polySurface1595_729",
        "polySurface1595_phong1_0_728",
        "Object_927",
        "polySurface1596_731",
        "polySurface1596_phong25_0_730",
        "Object_930",
        "polySurface1597_733",
        "polySurface1597_phong25_0_732",
        "Object_933",
        "polySurface1598_735",
        "polySurface1598_phong1_0_734",
        "Object_936",
        "polySurface1599_738",
        "polySurface1599_phong1_0_736",
        "Object_939",
        "polySurface1599_phong40_0_737",
        "Object_941",
        "polySurface1600_740",
        "polySurface1600_phong25_0_739",
        "Object_944",
        "polySurface1601_742",
        "polySurface1601_phong1_0_741",
        "Object_947",
        "polySurface1602_744",
        "polySurface1602_phong1_0_743",
        "Object_950",
        "polySurface1603_746",
        "polySurface1603_phong1_0_745",
        "Object_953",
        "polySurface1604_748",
        "polySurface1604_phong1_0_747",
        "Object_956",
        "polySurface1605_751",
        "polySurface1605_phong1_0_749",
        "Object_959",
        "polySurface1605_phong40_0_750",
        "Object_961",
        "polySurface1606_754",
        "polySurface1606_phong1_0_752",
        "Object_964",
        "polySurface1606_phong40_0_753",
        "Object_966",
        "polySurface1607_756",
        "polySurface1607_phong1_0_755",
        "Object_969",
        "polySurface1608_758",
        "polySurface1608_phong1_0_757",
        "Object_972",
        "polySurface1609_760",
        "polySurface1609_phong1_0_759",
        "Object_975",
        "polySurface1610_762",
        "polySurface1610_phong1_0_761",
        "Object_978",
        "polySurface1611_764",
        "polySurface1611_phong1_0_763",
        "Object_981",
        "polySurface1612_767",
        "polySurface1612_phong1_0_765",
        "Object_984",
        "polySurface1612_phong40_0_766",
        "Object_986",
        "polySurface1613_769",
        "polySurface1613_phong25_0_768",
        "Object_989",
        "polySurface1614_773",
        "polySurface1614_phong25_0_770",
        "Object_992",
        "polySurface1614_phong41_0_771",
        "Object_994",
        "polySurface1614_phong42_0_772",
        "Object_996",
        "polySurface1615_775",
        "polySurface1615_phong25_0_774",
        "Object_999",
        "polySurface1616_778",
        "polySurface1616_phong25_0_776",
        "Object_1002",
        "polySurface1616_phong41_0_777",
        "Object_1004",
        "polySurface1617_781",
        "polySurface1617_phong1_0_779",
        "Object_1007",
        "polySurface1617_phong40_0_780",
        "Object_1009",
        "polySurface1618_784",
        "polySurface1618_phong1_0_782",
        "Object_1012",
        "polySurface1618_phong40_0_783",
        "Object_1014",
        "polySurface1619_787",
        "polySurface1619_phong25_0_785",
        "Object_1017",
        "polySurface1619_phong41_0_786",
        "Object_1019",
        "polySurface1620_790",
        "polySurface1620_phong25_0_788",
        "Object_1022",
        "polySurface1620_phong41_0_789",
        "Object_1024",
        "polySurface1621_793",
        "polySurface1621_phong25_0_791",
        "Object_1027",
        "polySurface1621_phong41_0_792",
        "Object_1029",
        "polySurface1622_796",
        "polySurface1622_phong25_0_794",
        "Object_1032",
        "polySurface1622_phong41_0_795",
        "Object_1034",
        "polySurface1623_799",
        "polySurface1623_phong25_0_797",
        "Object_1037",
        "polySurface1623_phong41_0_798",
        "Object_1039",
        "polySurface1624_802",
        "polySurface1624_phong1_0_800",
        "Object_1042",
        "polySurface1624_phong40_0_801",
        "Object_1044",
        "polySurface1625_805",
        "polySurface1625_phong25_0_803",
        "Object_1047",
        "polySurface1625_phong41_0_804",
        "Object_1049",
        "polySurface1626_808",
        "polySurface1626_phong25_0_806",
        "Object_1052",
        "polySurface1626_phong41_0_807",
        "Object_1054",
        "polySurface1627_811",
        "polySurface1627_phong25_0_809",
        "Object_1057",
        "polySurface1627_phong41_0_810",
        "Object_1059",
        "polySurface1628_814",
        "polySurface1628_phong1_0_812",
        "Object_1062",
        "polySurface1628_phong40_0_813",
        "Object_1064",
        "polySurface1629_816",
        "polySurface1629_phong1_0_815",
        "Object_1067",
        "polySurface1630_818",
        "polySurface1630_phong26_0_817",
        "Object_1070",
        "polySurface1631_820",
        "polySurface1631_phong1_0_819",
        "Object_1073",
        "polySurface1632_822",
        "polySurface1632_phong26_0_821",
        "Object_1076",
        "polySurface1633_824",
        "polySurface1633_phong25_0_823",
        "Object_1079",
        "polySurface1634_826",
        "polySurface1634_phong1_0_825",
        "Object_1082",
        "polySurface1635_828",
        "polySurface1635_phong26_0_827",
        "Object_1085",
        "polySurface1636_830",
        "polySurface1636_phong1_0_829",
        "Object_1088",
        "polySurface1637_832",
        "polySurface1637_phong26_0_831",
        "Object_1091",
        "polySurface1638_834",
        "polySurface1638_phong1_0_833",
        "Object_1094",
        "polySurface1639_836",
        "polySurface1639_phong25_0_835",
        "Object_1097",
        "polySurface1640_838",
        "polySurface1640_phong1_0_837",
        "Object_1100",
        "polySurface1641_840",
        "polySurface1641_phong26_0_839",
        "Object_1103",
        "polySurface1642_842",
        "polySurface1642_phong1_0_841",
        "Object_1106",
        "polySurface1643_844",
        "polySurface1643_phong1_0_843",
        "Object_1109",
        "polySurface1644_846",
        "polySurface1644_phong25_0_845",
        "Object_1112",
        "polySurface1645_848",
        "polySurface1645_phong1_0_847",
        "Object_1115",
        "polySurface1646_850",
        "polySurface1646_phong1_0_849",
        "Object_1118",
        "polySurface1647_852",
        "polySurface1647_phong26_0_851",
        "Object_1121",
        "polySurface1648_854",
        "polySurface1648_phong1_0_853",
        "Object_1124",
        "polySurface1649_856",
        "polySurface1649_phong26_0_855",
        "Object_1127",
        "polySurface1650_858",
        "polySurface1650_phong1_0_857",
        "Object_1130",
        "polySurface1651_860",
        "polySurface1651_phong1_0_859",
        "Object_1133",
        "polySurface1652_863",
        "polySurface1652_phong1_0_861",
        "Object_1136",
        "polySurface1652_phong40_0_862",
        "Object_1138",
        "polySurface1653_865",
        "polySurface1653_phong1_0_864",
        "Object_1141",
        "polySurface1654_867",
        "polySurface1654_phong25_0_866",
        "Object_1144",
        "polySurface1655_870",
        "polySurface1655_phong1_0_868",
        "Object_1147",
        "polySurface1655_phong40_0_869",
        "Object_1149",
        "polySurface1656_872",
        "polySurface1656_phong25_0_871",
        "Object_1152",
        "polySurface1657_875",
        "polySurface1657_phong1_0_873",
        "Object_1155",
        "polySurface1657_phong40_0_874",
        "Object_1157",
        "polySurface1658_878",
        "polySurface1658_phong1_0_876",
        "Object_1160",
        "polySurface1658_phong40_0_877",
        "Object_1162",
        "polySurface1659_881",
        "polySurface1659_phong25_0_879",
        "Object_1165",
        "polySurface1659_phong41_0_880",
        "Object_1167",
        "polySurface1660_884",
        "polySurface1660_phong25_0_882",
        "Object_1170",
        "polySurface1660_phong41_0_883",
        "Object_1172",
        "polySurface1661_887",
        "polySurface1661_phong25_0_885",
        "Object_1175",
        "polySurface1661_phong41_0_886",
        "Object_1177",
        "polySurface1662_890",
        "polySurface1662_phong1_0_888",
        "Object_1180",
        "polySurface1662_phong40_0_889",
        "Object_1182",
        "polySurface1663_893",
        "polySurface1663_phong1_0_891",
        "Object_1185",
        "polySurface1663_phong40_0_892",
        "Object_1187",
        "polySurface1664_896",
        "polySurface1664_phong1_0_894",
        "Object_1190",
        "polySurface1664_phong40_0_895",
        "Object_1192",
        "polySurface1665_899",
        "polySurface1665_phong1_0_897",
        "Object_1195",
        "polySurface1665_phong40_0_898",
        "Object_1197",
        "polySurface1666_902",
        "polySurface1666_phong1_0_900",
        "Object_1200",
        "polySurface1666_phong40_0_901",
        "Object_1202",
        "polySurface1667_905",
        "polySurface1667_phong1_0_903",
        "Object_1205",
        "polySurface1667_phong40_0_904",
        "Object_1207",
        "polySurface1668_908",
        "polySurface1668_phong1_0_906",
        "Object_1210",
        "polySurface1668_phong40_0_907",
        "Object_1212",
        "polySurface1669_911",
        "polySurface1669_phong1_0_909",
        "Object_1215",
        "polySurface1669_phong40_0_910",
        "Object_1217",
        "polySurface1670_913",
        "polySurface1670_phong1_0_912",
        "Object_1220",
        "polySurface1671_916",
        "polySurface1671_phong1_0_914",
        "Object_1223",
        "polySurface1671_phong40_0_915",
        "Object_1225",
        "polySurface1672_918",
        "polySurface1672_phong25_0_917",
        "Object_1228",
        "polySurface1673_920",
        "polySurface1673_phong1_0_919",
        "Object_1231",
        "polySurface1674_922",
        "polySurface1674_phong1_0_921",
        "Object_1234",
        "polySurface1675_924",
        "polySurface1675_phong25_0_923",
        "Object_1237",
        "polySurface1676_926",
        "polySurface1676_phong25_0_925",
        "Object_1240",
        "polySurface1677_928",
        "polySurface1677_phong1_0_927",
        "Object_1243",
        "polySurface1678_930",
        "polySurface1678_phong1_0_929",
        "Object_1246",
        "polySurface1679_932",
        "polySurface1679_phong1_0_931",
        "Object_1249",
        "polySurface1680_934",
        "polySurface1680_phong25_0_933",
        "Object_1252",
        "polySurface1681_936",
        "polySurface1681_phong25_0_935",
        "Object_1255",
        "polySurface1682_938",
        "polySurface1682_phong26_0_937",
        "Object_1258",
        "polySurface1683_940",
        "polySurface1683_phong26_0_939",
        "Object_1261",
        "polySurface1684_942",
        "polySurface1684_phong1_0_941",
        "Object_1264",
        "polySurface1685_944",
        "polySurface1685_phong1_0_943",
        "Object_1267",
        "polySurface1686_946",
        "polySurface1686_phong25_0_945",
        "Object_1270",
        "polySurface1687_948",
        "polySurface1687_phong1_0_947",
        "Object_1273",
        "polySurface1688_950",
        "polySurface1688_phong25_0_949",
        "Object_1276",
        "polySurface1689_952",
        "polySurface1689_phong26_0_951",
        "Object_1279",
        "polySurface1690_954",
        "polySurface1690_phong1_0_953",
        "Object_1282",
        "polySurface1691_956",
        "polySurface1691_phong1_0_955",
        "Object_1285",
        "polySurface1692_958",
        "polySurface1692_phong25_0_957",
        "Object_1288",
        "polySurface1693_960",
        "polySurface1693_phong1_0_959",
        "Object_1291",
        "polySurface1694_962",
        "polySurface1694_phong25_0_961",
        "Object_1294",
        "polySurface1695_964",
        "polySurface1695_phong26_0_963",
        "Object_1297",
        "polySurface1696_966",
        "polySurface1696_phong25_0_965",
        "Object_1300",
        "polySurface1697_968",
        "polySurface1697_phong1_0_967",
        "Object_1303",
        "polySurface1698_970",
        "polySurface1698_phong25_0_969",
        "Object_1306",
        "polySurface1699_972",
        "polySurface1699_phong1_0_971",
        "Object_1309",
        "polySurface1700_974",
        "polySurface1700_phong1_0_973",
        "Object_1312",
        "polySurface1701_976",
        "polySurface1701_phong26_0_975",
        "Object_1315",
        "polySurface1702_978",
        "polySurface1702_phong1_0_977",
        "Object_1318",
        "polySurface1703_980",
        "polySurface1703_phong1_0_979",
        "Object_1321",
        "polySurface1704_983",
        "polySurface1704_phong1_0_981",
        "Object_1324",
        "polySurface1704_phong40_0_982",
        "Object_1326",
        "polySurface1705_986",
        "polySurface1705_phong1_0_984",
        "Object_1329",
        "polySurface1705_phong40_0_985",
        "Object_1331",
        "polySurface1706_989",
        "polySurface1706_phong1_0_987",
        "Object_1334",
        "polySurface1706_phong40_0_988",
        "Object_1336",
        "polySurface1707_991",
        "polySurface1707_phong1_0_990",
        "Object_1339",
        "polySurface1708_993",
        "polySurface1708_phong25_0_992",
        "Object_1342",
        "polySurface1709_995",
        "polySurface1709_phong1_0_994",
        "Object_1345",
        "polySurface1710_997",
        "polySurface1710_phong1_0_996",
        "Object_1348",
        "polySurface1711_999",
        "polySurface1711_phong26_0_998",
        "Object_1351",
        "polySurface1712_1001",
        "polySurface1712_phong25_0_1000",
        "Object_1354",
        "polySurface1713_1003",
        "polySurface1713_phong1_0_1002",
        "Object_1357",
        "polySurface1714_1005",
        "polySurface1714_phong1_0_1004",
        "Object_1360",
        "polySurface1715_1007",
        "polySurface1715_phong1_0_1006",
        "Object_1363",
        "polySurface1716_1009",
        "polySurface1716_phong25_0_1008",
        "Object_1366",
        "polySurface1717_1011",
        "polySurface1717_phong26_0_1010",
        "Object_1369",
        "polySurface1718_1013",
        "polySurface1718_phong1_0_1012",
        "Object_1372",
        "polySurface1719_1015",
        "polySurface1719_phong1_0_1014",
        "Object_1375",
        "polySurface1720_1017",
        "polySurface1720_phong25_0_1016",
        "Object_1378",
        "polySurface1721_1019",
        "polySurface1721_phong25_0_1018",
        "Object_1381",
        "polySurface1722_1021",
        "polySurface1722_phong1_0_1020",
        "Object_1384",
        "polySurface1723_1023",
        "polySurface1723_phong1_0_1022",
        "Object_1387",
        "polySurface1724_1025",
        "polySurface1724_phong25_0_1024",
        "Object_1390",
        "polySurface1725_1027",
        "polySurface1725_phong1_0_1026",
        "Object_1393",
        "polySurface1726_1029",
        "polySurface1726_phong1_0_1028",
        "Object_1396",
        "polySurface1727_1031",
        "polySurface1727_phong26_0_1030",
        "Object_1399",
        "polySurface1728_1033",
        "polySurface1728_phong1_0_1032",
        "Object_1402",
        "polySurface1729_1035",
        "polySurface1729_phong25_0_1034",
        "Object_1405",
        "polySurface1730_1037",
        "polySurface1730_phong25_0_1036",
        "Object_1408",
        "polySurface1731_1039",
        "polySurface1731_phong26_0_1038",
        "Object_1411",
        "polySurface1732_1041",
        "polySurface1732_phong26_0_1040",
        "Object_1414",
        "polySurface1733_1043",
        "polySurface1733_phong1_0_1042",
        "Object_1417",
        "polySurface1734_1045",
        "polySurface1734_phong25_0_1044",
        "Object_1420",
        "polySurface1735_1047",
        "polySurface1735_phong1_0_1046",
        "Object_1423",
        "polySurface1736_1049",
        "polySurface1736_phong1_0_1048",
        "Object_1426",
        "polySurface1737_1051",
        "polySurface1737_phong26_0_1050",
        "Object_1429",
        "polySurface1738_1053",
        "polySurface1738_phong1_0_1052",
        "Object_1432",
        "polySurface1739_1055",
        "polySurface1739_phong1_0_1054",
        "Object_1435",
        "polySurface1740_1057",
        "polySurface1740_phong1_0_1056",
        "Object_1438",
        "polySurface1741_1059",
        "polySurface1741_phong25_0_1058",
        "Object_1441",
        "polySurface1742_1061",
        "polySurface1742_phong1_0_1060",
        "Object_1444",
        "polySurface1743_1063",
        "polySurface1743_phong1_0_1062",
        "Object_1447",
        "polySurface1744_1065",
        "polySurface1744_phong25_0_1064",
        "Object_1450",
        "polySurface1745_1067",
        "polySurface1745_phong1_0_1066",
        "Object_1453",
        "polySurface1746_1069",
        "polySurface1746_phong1_0_1068",
        "Object_1456",
        "polySurface1747_1071",
        "polySurface1747_phong1_0_1070",
        "Object_1459",
        "polySurface1748_1073",
        "polySurface1748_phong1_0_1072",
        "Object_1462",
        "polySurface1749_1075",
        "polySurface1749_phong1_0_1074",
        "Object_1465",
        "polySurface1750_1078",
        "polySurface1750_phong1_0_1076",
        "Object_1468",
        "polySurface1750_phong40_0_1077",
        "Object_1470",
        "polySurface1751_1081",
        "polySurface1751_phong1_0_1079",
        "Object_1473",
        "polySurface1751_phong40_0_1080",
        "Object_1475",
        "polySurface1752_1084",
        "polySurface1752_phong1_0_1082",
        "Object_1478",
        "polySurface1752_phong40_0_1083",
        "Object_1480",
        "polySurface1753_1087",
        "polySurface1753_phong1_0_1085",
        "Object_1483",
        "polySurface1753_phong40_0_1086",
        "Object_1485",
        "polySurface1754_1090",
        "polySurface1754_phong1_0_1088",
        "Object_1488",
        "polySurface1754_phong40_0_1089",
        "Object_1490",
        "polySurface1755_1093",
        "polySurface1755_phong1_0_1091",
        "Object_1493",
        "polySurface1755_phong40_0_1092",
        "Object_1495",
        "polySurface1756_1096",
        "polySurface1756_phong1_0_1094",
        "Object_1498",
        "polySurface1756_phong40_0_1095",
        "Object_1500",
        "polySurface1757_1099",
        "polySurface1757_phong1_0_1097",
        "Object_1503",
        "polySurface1757_phong40_0_1098",
        "Object_1505",
        "polySurface1758_1102",
        "polySurface1758_phong1_0_1100",
        "Object_1508",
        "polySurface1758_phong40_0_1101",
        "Object_1510",
        "polySurface1759_1105",
        "polySurface1759_phong1_0_1103",
        "Object_1513",
        "polySurface1759_phong40_0_1104",
        "Object_1515",
        "polySurface1760_1108",
        "polySurface1760_phong1_0_1106",
        "Object_1518",
        "polySurface1760_phong40_0_1107",
        "Object_1520",
        "polySurface1761_1110",
        "polySurface1761_phong1_0_1109",
        "Object_1523",
        "polySurface1762_1113",
        "polySurface1762_phong1_0_1111",
        "Object_1526",
        "polySurface1762_phong40_0_1112",
        "Object_1528",
        "polySurface1763_1115",
        "polySurface1763_phong25_0_1114",
        "Object_1531",
        "polySurface1764_1117",
        "polySurface1764_phong1_0_1116",
        "Object_1534",
        "polySurface1765_1120",
        "polySurface1765_phong1_0_1118",
        "Object_1537",
        "polySurface1765_phong40_0_1119",
        "Object_1539",
        "polySurface1766_1123",
        "polySurface1766_phong1_0_1121",
        "Object_1542",
        "polySurface1766_phong40_0_1122",
        "Object_1544",
        "polySurface1767_1125",
        "polySurface1767_phong1_0_1124",
        "Object_1547",
        "polySurface1768_1128",
        "polySurface1768_phong1_0_1126",
        "Object_1550",
        "polySurface1768_phong40_0_1127",
        "Object_1552",
        "polySurface1769_1130",
        "polySurface1769_phong1_0_1129",
        "Object_1555",
        "polySurface1770_1132",
        "polySurface1770_phong1_0_1131",
        "Object_1558",
        "polySurface1771_1134",
        "polySurface1771_phong25_0_1133",
        "Object_1561",
        "polySurface1772_1137",
        "polySurface1772_phong1_0_1135",
        "Object_1564",
        "polySurface1772_phong40_0_1136",
        "Object_1566",
        "polySurface1773_1139",
        "polySurface1773_phong25_0_1138",
        "Object_1569",
        "polySurface1774_1141",
        "polySurface1774_phong25_0_1140",
        "Object_1572",
        "polySurface1775_1143",
        "polySurface1775_phong1_0_1142",
        "Object_1575",
        "polySurface1776_1145",
        "polySurface1776_phong1_0_1144",
        "Object_1578",
        "polySurface1777_1147",
        "polySurface1777_phong26_0_1146",
        "Object_1581",
        "polySurface1778_1149",
        "polySurface1778_phong25_0_1148",
        "Object_1584",
        "polySurface1779_1151",
        "polySurface1779_phong25_0_1150",
        "Object_1587",
        "polySurface1780_1154",
        "polySurface1780_phong1_0_1152",
        "Object_1590",
        "polySurface1780_phong40_0_1153",
        "Object_1592",
        "polySurface1781_1156",
        "polySurface1781_phong1_0_1155",
        "Object_1595",
        "polySurface1782_1158",
        "polySurface1782_phong1_0_1157",
        "Object_1598",
        "polySurface1783_1161",
        "polySurface1783_phong1_0_1159",
        "Object_1601",
        "polySurface1783_phong40_0_1160",
        "Object_1603",
        "polySurface1784_1163",
        "polySurface1784_phong1_0_1162",
        "Object_1606",
        "polySurface1785_1165",
        "polySurface1785_phong1_0_1164",
        "Object_1609",
        "polySurface1786_1167",
        "polySurface1786_phong26_0_1166",
        "Object_1612",
        "polySurface1787_1169",
        "polySurface1787_phong1_0_1168",
        "Object_1615",
        "polySurface1788_1172",
        "polySurface1788_phong1_0_1170",
        "Object_1618",
        "polySurface1788_phong40_0_1171",
        "Object_1620",
        "polySurface1789_1175",
        "polySurface1789_phong1_0_1173",
        "Object_1623",
        "polySurface1789_phong40_0_1174",
        "Object_1625",
        "polySurface1790_1177",
        "polySurface1790_phong1_0_1176",
        "Object_1628",
        "polySurface1791_1179",
        "polySurface1791_phong25_0_1178",
        "Object_1631",
        "polySurface1792_1181",
        "polySurface1792_phong25_0_1180",
        "Object_1634",
        "polySurface1793_1183",
        "polySurface1793_phong25_0_1182",
        "Object_1637",
        "polySurface1794_1185",
        "polySurface1794_phong25_0_1184",
        "Object_1640",
        "polySurface1430_1240",
        "polySurface1485_1217",
        "polySurface1485_phong4_0_1214",
        "Object_1644",
        "polySurface1485_phong4_0.001_1215",
        "Object_1646",
        "polySurface1485_phong4_0.002_1216",
        "Object_1648",
        "polySurface1486_1221",
        "polySurface1486_phong3_0_1218",
        "Object_1651",
        "polySurface1486_phong3_0.001_1219",
        "Object_1653",
        "polySurface1486_phong3_0.002_1220",
        "Object_1655",
        "polySurface1487_1225",
        "polySurface1487_phong3_0_1222",
        "Object_1658",
        "polySurface1487_phong3_0.001_1223",
        "Object_1660",
        "polySurface1487_phong3_0.002_1224",
        "Object_1662",
        "polySurface1488_1228",
        "polySurface1488_phong1_0_1226",
        "Object_1665",
        "polySurface1488_phong40_0_1227",
        "Object_1667",
        "polySurface1489_1232",
        "polySurface1489_phong4_0_1229",
        "Object_1670",
        "polySurface1489_phong4_0.001_1230",
        "Object_1672",
        "polySurface1489_phong4_0.002_1231",
        "Object_1674",
        "polySurface1490_1236",
        "polySurface1490_phong3_0_1233",
        "Object_1677",
        "polySurface1490_phong3_0.001_1234",
        "Object_1679",
        "polySurface1490_phong3_0.002_1235",
        "Object_1681",
        "polySurface1491_1239",
        "polySurface1491_phong1_0_1237",
        "Object_1684",
        "polySurface1491_phong40_0_1238",
        "Object_1686",
        "polySurface1433_1252",
        "polySurface1502_1246",
        "polySurface1502_phong1_0_1244",
        "Object_1690",
        "polySurface1502_phong40_0_1245",
        "Object_1692",
        "polySurface1505_1251",
        "polySurface1505_phong1_0_1249",
        "Object_1695",
        "polySurface1505_phong40_0_1250",
        "Object_1697",
        "polySurface1434_1269",
        "polySurface1506_1254",
        "polySurface1506_phong4_0_1253",
        "Object_1701",
        "polySurface1507_1256",
        "polySurface1507_phong3_0_1255",
        "Object_1704",
        "polySurface1508_1258",
        "polySurface1508_phong3_0_1257",
        "Object_1707",
        "polySurface1509_1261",
        "polySurface1509_phong1_0_1259",
        "Object_1710",
        "polySurface1509_phong40_0_1260",
        "Object_1712",
        "polySurface1510_1263",
        "polySurface1510_phong4_0_1262",
        "Object_1715",
        "polySurface1511_1265",
        "polySurface1511_phong3_0_1264",
        "Object_1718",
        "polySurface1512_1268",
        "polySurface1512_phong1_0_1266",
        "Object_1721",
        "polySurface1512_phong40_0_1267",
        "Object_1723",
        "polySurface1435_1281",
        "polySurface1495_1275",
        "polySurface1495_phong1_0_1273",
        "Object_1727",
        "polySurface1495_phong40_0_1274",
        "Object_1729",
        "polySurface1498_1280",
        "polySurface1498_phong1_0_1278",
        "Object_1732",
        "polySurface1498_phong40_0_1279",
        "Object_1734",
        "polySurface1458_1308",
        "polySurface1513_1283",
        "polySurface1513_phong6_0_1282",
        "Object_1738",
        "polySurface1514_1285",
        "polySurface1514_phong6_0_1284",
        "Object_1741",
        "polySurface1515_1287",
        "polySurface1515_phong6_0_1286",
        "Object_1744",
        "polySurface1516_1289",
        "polySurface1516_phong6_0_1288",
        "Object_1747",
        "polySurface1517_1291",
        "polySurface1517_phong6_0_1290",
        "Object_1750",
        "polySurface1518_1293",
        "polySurface1518_phong6_0_1292",
        "Object_1753",
        "polySurface1519_1296",
        "polySurface1519_phong31_0_1294",
        "Object_1756",
        "polySurface1519_phong43_0_1295",
        "Object_1758",
        "polySurface1520_1299",
        "polySurface1520_phong31_0_1297",
        "Object_1761",
        "polySurface1520_phong43_0_1298",
        "Object_1763",
        "polySurface1521_1302",
        "polySurface1521_phong31_0_1300",
        "Object_1766",
        "polySurface1521_phong43_0_1301",
        "Object_1768",
        "polySurface1522_1305",
        "polySurface1522_phong31_0_1303",
        "Object_1771",
        "polySurface1522_phong43_0_1304",
        "Object_1773",
        "polySurface1523_1307",
        "polySurface1523_phong7_0_1306",
        "Object_1776",
        "polySurface1484_1311",
        "polySurface1484_phong16_0_1309",
        "Object_1779",
        "polySurface1484_phong65_0_1310",
        "Object_1781",
        "polySurface1842_1317",
        "polySurface1842_phong27_0_1314",
        "Object_1784",
        "polySurface1842_phong45_0_1315",
        "Object_1786",
        "polySurface1842_phong46_0_1316",
        "Object_1788",
        "polySurface1867_1321",
        "polySurface1867_phong27_0_1318",
        "Object_1791",
        "polySurface1867_phong45_0_1319",
        "Object_1793",
        "polySurface1867_phong46_0_1320",
        "Object_1795",
        "polySurface1934_1477",
        "polySurface1934_phong27_0_1474",
        "Object_1798",
        "polySurface1934_phong45_0_1475",
        "Object_1800",
        "polySurface1934_phong46_0_1476",
        "Object_1802",
        "polySurface1951_1483",
        "polySurface1951_phong32_0_1478",
        "Object_1805",
        "polySurface1951_phong58_0_1479",
        "Object_1807",
        "polySurface1951_phong59_0_1480",
        "Object_1809",
        "polySurface1951_phong60_0_1481",
        "Object_1811",
        "polySurface1951_phong9_0_1482",
        "Object_1813",
        "polySurface1954_1489",
        "polySurface1954_phong32_0_1484",
        "Object_1816",
        "polySurface1954_phong58_0_1485",
        "Object_1818",
        "polySurface1954_phong59_0_1486",
        "Object_1820",
        "polySurface1954_phong60_0_1487",
        "Object_1822",
        "polySurface1954_phong9_0_1488",
        "Object_1824",
        "polySurface1955_1495",
        "polySurface1955_phong32_0_1490",
        "Object_1827",
        "polySurface1955_phong58_0_1491",
        "Object_1829",
        "polySurface1955_phong59_0_1492",
        "Object_1831",
        "polySurface1955_phong60_0_1493",
        "Object_1833",
        "polySurface1955_phong9_0_1494",
        "Object_1835",
        "polySurface1956_1501",
        "polySurface1956_phong32_0_1496",
        "Object_1838",
        "polySurface1956_phong58_0_1497",
        "Object_1840",
        "polySurface1956_phong59_0_1498",
        "Object_1842",
        "polySurface1956_phong60_0_1499",
        "Object_1844",
        "polySurface1956_phong9_0_1500",
        "Object_1846"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/showcaseTeaHouse.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  }
});
