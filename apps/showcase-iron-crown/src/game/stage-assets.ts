import { defineAuraAssets } from "@aura3d/engine";

/**
 * Iron Crown's stage props from the shared repo catalog (`src/aura-assets.ts`, 600+ entries, about 2.6 MB once bundled).
 * Only the entries the six stages use are kept here, copied verbatim (url, hash, bounds, metadata) except for the remote
 * provenance download links, so the game bundle no longer carries the whole shared catalog (audit row RH-06). The files
 * stay under the shared /aura-assets/ path. tests/unit/iron-crown/stage-assets.test.ts checks that every entry still
 * matches the shared catalog and that every `stageAssets.<id>` used in stages.ts is defined here.
 */
export const stageAssets = defineAuraAssets({
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
});
