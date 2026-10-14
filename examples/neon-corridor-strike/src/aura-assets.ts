import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "ammoCrate": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "arena": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "corridorAlarmSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "corridorAmbientDrone": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "corridorDryFireSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "corridorFireSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "corridorHitSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "corridorHurtSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "corridorKillSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "corridorLoseSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "corridorPickupSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "corridorReloadDoneSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "corridorReloadStartSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "corridorWardenMeshyV1": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "corridorWarnSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "corridorWinSfx": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };
  readonly "impA": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "impB": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "medkit": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "neonArena": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "neonContainmentPulseRifle": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "neonContainmentWardenA": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "neonContainmentWardenB": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "neonCorridorContainmentWorld": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pulseRifle": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "ammoCrate": {
    type: "model",
    format: "glb",
    url: "/examples/neon-corridor-strike/public/aura-assets/ammoCrate.94562738.glb",
    hash: "sha256-945627385565fcfb5182fad294b66e1beaf23dcf0a42d9503f64ab2c8f5c339a",
    bounds: [
      2,
      0.833,
      0.856
    ],
    sizeBytes: 2960804,
    metadata: {
      "materials": [
        "checker_material_2048x2048"
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
        "nodeCount": 28,
        "meshCount": 13,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Sketchfab_model"
        ],
        "maxDepth": 4,
        "messages": [
          "Detected 28 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/ammoCrate.94562738.glb",
        "sourcePage": "https://sketchfab.com/3d-models/old-ammo-crate-320d935472354cc79590bc35ade9d855",
        "downloadUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-101/320d935472354cc79590bc35ade9d855.glb",
        "sourceUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-101/320d935472354cc79590bc35ade9d855.glb",
        "license": "CC-BY-4.0",
        "licenseName": "Creative Commons Attribution 4.0 International",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "licenseRaw": "CC-BY-4.0",
        "author": "Geoffroy.Sainte.Catherine",
        "sourceFamily": "sketchfab-via-objaverse",
        "attribution": "Geoffroy.Sainte.Catherine",
        "sha256": "sha256-945627385565fcfb5182fad294b66e1beaf23dcf0a42d9503f64ab2c8f5c339a",
        "retrievedAt": "2026-08-17T02:25:39.670Z",
        "resolveCandidate": {
          "catalogId": "objaverse:320d935472354cc79590bc35ade9d855",
          "query": "ammo crate game prop",
          "source": "objaverse",
          "sourceFamily": "objaverse",
          "scoreTotal": 0.86,
          "scoreBreakdown": {
            "semantic": 10.86,
            "sourceQuality": 14,
            "license": 13,
            "inspection": 0,
            "roleFit": 0
          },
          "reasons": [
            "semantic/source score 10.86",
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
          "downloadUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-101/320d935472354cc79590bc35ade9d855.glb",
          "license": "CC-BY-4.0",
          "licenseName": "CC-BY-4.0",
          "licenseRaw": "CC-BY-4.0",
          "author": "Geoffroy.Sainte.Catherine",
          "attribution": "Geoffroy.Sainte.Catherine",
          "semanticScore": 0.8131617334403828,
          "postDownloadInspection": {
            "bounds": [
              2,
              0.833,
              0.856
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
            "id": "objaverse:320d935472354cc79590bc35ade9d855",
            "title": "Old Ammo Crate",
            "source": "objaverse",
            "url": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-101/320d935472354cc79590bc35ade9d855.glb",
            "license": "CC-BY-4.0",
            "thumbnail": "https://media.sketchfab.com/models/320d935472354cc79590bc35ade9d855/thumbnails/db94382e569642ddb3dd8380bc1f2e2c/9212e577481042fea23af0fe3fee051d.jpeg",
            "attribution": "Geoffroy.Sainte.Catherine",
            "score": 0.8131617334403828
          }
        },
        "checkedAt": "2026-08-17T02:25:39.670Z"
      },
      "sourcePath": "public/aura-assets/ammoCrate.94562738.glb",
      "outputPath": "public/aura-assets/ammoCrate.94562738.glb",
      "license": "CC-BY-4.0",
      "author": "Geoffroy.Sainte.Catherine",
      "boundsMetadata": {
        "min": [
          -1,
          -0.417,
          -0.428
        ],
        "max": [
          1,
          0.417,
          0.428
        ],
        "size": [
          2,
          0.833,
          0.856
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
          "name": "checker_material_2048x2048",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        }
      ],
      "orientation": {
        "source": "manifest-override",
        "view": "hash-bound-readable-prop-view",
        "assetHash": "sha256-945627385565fcfb5182fad294b66e1beaf23dcf0a42d9503f64ab2c8f5c339a",
        "generatedBy": "tests/browser/neon-corridor-release-asset-probes.spec.ts",
        "checkedAt": "2026-08-30T16:12:35.865Z",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=ammoCrate",
        "renderedProbe": {
          "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/ammoCrate.png",
          "sha256": "sha256-bf493cb2c1c1f1c28d165ef748d7a84c2e6e6c4703ad0198a3e807531e1e556c",
          "assetHash": "sha256-945627385565fcfb5182fad294b66e1beaf23dcf0a42d9503f64ab2c8f5c339a",
          "checkedAt": "2026-08-30T16:12:35.865Z",
          "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=ammoCrate"
        },
        "messages": [
          "The current hash-bound isolated root probe proves a readable static prop/environment presentation; no forward-axis or gameplay behavior is inferred."
        ]
      },
      "nodeNames": [
        "Sketchfab_model",
        "Collada visual scene group",
        "lock_b_03_low",
        "defaultMaterial",
        "lock_b_02_low",
        "defaultMaterial",
        "lock_b_01_low",
        "defaultMaterial",
        "lock_a_03_low",
        "defaultMaterial",
        "lock_a_02_low",
        "defaultMaterial",
        "lock_a_01_low",
        "defaultMaterial",
        "Rope_Handle_a_low",
        "defaultMaterial",
        "Rope_Handle_b_low",
        "defaultMaterial",
        "Hinges_low",
        "defaultMaterial",
        "Crate_Door_Support_low",
        "defaultMaterial",
        "Handle_b_low",
        "defaultMaterial",
        "Handle_a_low",
        "defaultMaterial",
        "Crate_low",
        "defaultMaterial"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/ammoCrate.thumb.svg",
      "quality": "release",
      "role": "prop",
      "suitabilityReason": "Textured CC-BY ammo crate used as a readable pickup and non-colliding corridor set-dressing prop; gameplay collection and collision remain route-local.",
      "renderedProbe": {
        "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/ammoCrate.png",
        "kind": "browser-screenshot",
        "renderer": "createAuraApp @aura3d/engine production-runtime",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=ammoCrate",
        "sha256": "sha256-bf493cb2c1c1f1c28d165ef748d7a84c2e6e6c4703ad0198a3e807531e1e556c",
        "assetHash": "sha256-945627385565fcfb5182fad294b66e1beaf23dcf0a42d9503f64ab2c8f5c339a",
        "width": 800,
        "height": 600,
        "nonBlankPixels": 479991,
        "colorBuckets": 33,
        "checkedAt": "2026-08-30T16:12:35.865Z",
        "foregroundBounds": {
          "x": 123,
          "y": 131,
          "width": 601,
          "height": 378
        }
      }
    },
  },
  "arena": {
    type: "model",
    format: "glb",
    url: "/examples/neon-corridor-strike/public/aura-assets/arena.4fc319ea.glb",
    hash: "sha256-4fc319ea864a8b498b246faddd6e74534683a02d7e8da66ac187634dd4e7cc4b",
    bounds: [
      20.046,
      20.018,
      66.301
    ],
    sizeBytes: 5855964,
    metadata: {
      "materials": [
        "METAL",
        "Twall",
        "TUNNEL-METAL",
        "R_Light",
        "Y_Light",
        "material_0",
        "GLASS-glass4.1-1.001",
        "Material.002",
        "Material.003"
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
        "nodeCount": 75,
        "meshCount": 27,
        "materialCount": 9,
        "textureCount": 1,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Sketchfab_model"
        ],
        "maxDepth": 6,
        "messages": [
          "Detected 75 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/arena.4fc319ea.glb",
        "sourcePage": "https://sketchfab.com/3d-models/sci-fi-spaceship-corridor-7733bbe1ddd146fd8657272f8247a6bf",
        "downloadUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-018/7733bbe1ddd146fd8657272f8247a6bf.glb",
        "sourceUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-018/7733bbe1ddd146fd8657272f8247a6bf.glb",
        "license": "CC-BY-4.0",
        "licenseName": "Creative Commons Attribution 4.0 International",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "licenseRaw": "CC-BY-4.0",
        "author": "J4747",
        "sourceFamily": "sketchfab-via-objaverse",
        "attribution": "J4747",
        "sha256": "sha256-4fc319ea864a8b498b246faddd6e74534683a02d7e8da66ac187634dd4e7cc4b",
        "retrievedAt": "2026-08-17T02:25:01.724Z",
        "resolveCandidate": {
          "catalogId": "objaverse:7733bbe1ddd146fd8657272f8247a6bf",
          "query": "dark sci-fi corridor interior industrial",
          "source": "objaverse",
          "sourceFamily": "objaverse",
          "scoreTotal": 1.58,
          "scoreBreakdown": {
            "semantic": 11.58,
            "sourceQuality": 14,
            "license": 13,
            "inspection": 0,
            "roleFit": 0
          },
          "reasons": [
            "semantic/source score 11.58",
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
          "downloadUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-018/7733bbe1ddd146fd8657272f8247a6bf.glb",
          "license": "CC-BY-4.0",
          "licenseName": "CC-BY-4.0",
          "licenseRaw": "CC-BY-4.0",
          "author": "J4747",
          "attribution": "J4747",
          "semanticScore": 0.7672116008236358,
          "postDownloadInspection": {
            "bounds": [
              20.046,
              20.018,
              66.301
            ],
            "materialCount": 9,
            "textureCount": 1,
            "animationClipCount": 0,
            "skinCount": 0,
            "morphTargetCount": 0,
            "warnings": [
              "orientation metadata missing; facing direction cannot be validated until GLTF extras declare aura3d.orientation.forwardAxis"
            ]
          },
          "rawCatalogMetadata": {
            "id": "objaverse:7733bbe1ddd146fd8657272f8247a6bf",
            "title": "Sci-fi Spaceship Corridor",
            "source": "objaverse",
            "url": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-018/7733bbe1ddd146fd8657272f8247a6bf.glb",
            "license": "CC-BY-4.0",
            "thumbnail": "https://media.sketchfab.com/models/7733bbe1ddd146fd8657272f8247a6bf/thumbnails/86408d6cfbec45878c5ed274da1d51ab/259635aa07dd48938db9ca3ba8f5d427.jpeg",
            "attribution": "J4747",
            "score": 0.7672116008236358
          }
        },
        "checkedAt": "2026-08-17T02:25:01.724Z"
      },
      "sourcePath": "public/aura-assets/arena.4fc319ea.glb",
      "outputPath": "public/aura-assets/arena.4fc319ea.glb",
      "license": "CC-BY-4.0",
      "author": "J4747",
      "boundsMetadata": {
        "min": [
          -10.023,
          -10,
          -39.998
        ],
        "max": [
          10.023,
          10.018,
          26.303
        ],
        "size": [
          20.046,
          20.018,
          66.301
        ],
        "center": [
          0,
          0.009,
          -6.847
        ],
        "maxDimension": 66.301,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "METAL",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Twall",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "TUNNEL-METAL",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "R_Light",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Y_Light",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "material_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "GLASS-glass4.1-1.001",
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
          "name": "Material.003",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        }
      ],
      "orientation": {
        "source": "manifest-override",
        "view": "hash-bound-readable-prop-view",
        "assetHash": "sha256-4fc319ea864a8b498b246faddd6e74534683a02d7e8da66ac187634dd4e7cc4b",
        "generatedBy": "tests/browser/neon-corridor-release-asset-probes.spec.ts",
        "checkedAt": "2026-08-30T16:12:43.308Z",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=arena",
        "renderedProbe": {
          "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/arena.png",
          "sha256": "sha256-9eb90f6ea093a673fa9640d6c49bd5168efe3faa43ffafe58a0f49afa3aea668",
          "assetHash": "sha256-4fc319ea864a8b498b246faddd6e74534683a02d7e8da66ac187634dd4e7cc4b",
          "checkedAt": "2026-08-30T16:12:43.308Z",
          "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=arena"
        },
        "messages": [
          "The current hash-bound isolated root probe proves a readable static prop/environment presentation; no forward-axis or gameplay behavior is inferred."
        ]
      },
      "nodeNames": [
        "Sketchfab_model",
        "a191a033da614e668172b513f06f5653.fbx",
        "RootNode",
        "Light",
        "Object_4",
        "Object_5",
        "Camera",
        "Object_7",
        "Ring Circle",
        "Ring Circle_METAL_0",
        "TWall",
        "TWall_Twall_0",
        "Area",
        "Object_13",
        "Object_14",
        "Area.001",
        "Object_16",
        "Object_17",
        "Area.002",
        "Object_19",
        "Object_20",
        "Area.003",
        "Object_22",
        "Object_23",
        "Area.004",
        "Object_25",
        "Object_26",
        "Camera.001",
        "Object_28",
        "Wall Part",
        "Wall Part_METAL_0",
        "Floor",
        "Floor_METAL_0",
        "Floor_METAL_0",
        "Floor Edge",
        "Floor Edge_METAL_0",
        "Pipe",
        "Pipe_METAL_0",
        "Door Part",
        "Door Part_TUNNEL-METAL_0",
        "Panel",
        "Panel_TUNNEL-METAL_0",
        "Warning Light",
        "Warning Light_R Light_0",
        "Warning Light_Y Light_0",
        "Side Light",
        "Side Light_Emission_0",
        "Small Ball Light",
        "Small Ball Light_Y Light_0",
        "Small Ball Light_R Light_0",
        "Side Ball Light",
        "Side Ball Light_R Light_0",
        "Light Box",
        "Light Box_METAL_0",
        "Exit Light",
        "Exit Light_Y Light_0",
        "Screen.001",
        "Screen.001_GLASS-glass4.1-1.001_0",
        "Screen",
        "Screen_Material.002_0",
        "Side Light.001",
        "Side Light.001_METAL_0",
        "Side Light.001_Emission_0",
        "Light Box.001",
        "Light Box.001_TUNNEL-METAL_0",
        "Air Win",
        "Air Win_METAL_0",
        "Top Light",
        "Top Light_Emission_0",
        "Door",
        "Door_TUNNEL-METAL_0",
        "DoorWall ",
        "DoorWall _Twall_0",
        "Edge",
        "Edge_Material.003_0"
      ],
      "textures": [
        "image-0"
      ],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/arena.thumb.svg",
      "quality": "release",
      "role": "environment",
      "suitabilityReason": "Textured CC-BY science-fiction corridor environment used as the distant authored deck backdrop; route-local primitives, physics, enemies, and exit state remain authoritative.",
      "renderedProbe": {
        "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/arena.png",
        "kind": "browser-screenshot",
        "renderer": "createAuraApp @aura3d/engine production-runtime",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=arena",
        "sha256": "sha256-9eb90f6ea093a673fa9640d6c49bd5168efe3faa43ffafe58a0f49afa3aea668",
        "assetHash": "sha256-4fc319ea864a8b498b246faddd6e74534683a02d7e8da66ac187634dd4e7cc4b",
        "width": 800,
        "height": 600,
        "nonBlankPixels": 459893,
        "colorBuckets": 22,
        "checkedAt": "2026-08-30T16:12:43.308Z",
        "foregroundBounds": {
          "x": 110,
          "y": 163,
          "width": 490,
          "height": 289
        }
      }
    },
  },
  "corridorAlarmSfx": {
    type: "audio",
    format: "wav",
    url: "/examples/neon-corridor-strike/public/aura-assets/corridorAlarmSfx.e1f2e902.wav",
    hash: "sha256-e1f2e902e4f312014e2a11594b368e2642c6085716599b0bda5488d1ee079e18",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 26504,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "assets/alarm.wav",
        "sourcePage": "examples/neon-corridor-strike/scripts/build-sfx.mjs",
        "license": "CC0-1.0",
        "author": "Aura3D synthesis",
        "checkedAt": "2026-08-17T12:56:43.345Z"
      },
      "sourcePath": "assets/alarm.wav",
      "outputPath": "public/aura-assets/corridorAlarmSfx.e1f2e902.wav",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/corridorAlarmSfx.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "corridorAmbientDrone": {
    type: "audio",
    format: "wav",
    url: "/examples/neon-corridor-strike/public/aura-assets/corridorAmbientDrone.9a522d34.wav",
    hash: "sha256-9a522d3415cc3fb05dbc1b04de50eef2d6c8c2e07c96347f37058a13a86514f1",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 264644,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "assets/ambientDrone.wav",
        "sourcePage": "examples/neon-corridor-strike/scripts/build-sfx.mjs",
        "license": "CC0-1.0",
        "author": "Aura3D synthesis",
        "checkedAt": "2026-08-21T23:08:46.590Z"
      },
      "sourcePath": "assets/ambientDrone.wav",
      "outputPath": "public/aura-assets/corridorAmbientDrone.9a522d34.wav",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/corridorAmbientDrone.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "corridorDryFireSfx": {
    type: "audio",
    format: "wav",
    url: "/examples/neon-corridor-strike/public/aura-assets/corridorDryFireSfx.37d50fa4.wav",
    hash: "sha256-37d50fa4c4892e66dc040ef0e5fab8e0230f63fa6ca4a847047924c719559b69",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 4012,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "assets/dryFire.wav",
        "sourcePage": "examples/neon-corridor-strike/scripts/build-sfx.mjs",
        "license": "CC0-1.0",
        "author": "Aura3D synthesis",
        "checkedAt": "2026-08-17T12:56:42.720Z"
      },
      "sourcePath": "assets/dryFire.wav",
      "outputPath": "public/aura-assets/corridorDryFireSfx.37d50fa4.wav",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/corridorDryFireSfx.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "corridorFireSfx": {
    type: "audio",
    format: "wav",
    url: "/examples/neon-corridor-strike/public/aura-assets/corridorFireSfx.2aa7223b.wav",
    hash: "sha256-2aa7223b4ba3b4c40ca92e6c54c7f1c35274be568713c71a2f57a6d346f66875",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 9746,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "assets/fire.wav",
        "sourcePage": "examples/neon-corridor-strike/scripts/build-sfx.mjs",
        "license": "CC0-1.0",
        "author": "Aura3D synthesis",
        "checkedAt": "2026-08-17T12:56:41.672Z"
      },
      "sourcePath": "assets/fire.wav",
      "outputPath": "public/aura-assets/corridorFireSfx.2aa7223b.wav",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/corridorFireSfx.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "corridorHitSfx": {
    type: "audio",
    format: "wav",
    url: "/examples/neon-corridor-strike/public/aura-assets/corridorHitSfx.3b73140e.wav",
    hash: "sha256-3b73140e76078a7758ad76e32eaac694cc5c3ca96a3cc8b9c70b2ad1b0221c6e",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 7100,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "assets/hit.wav",
        "sourcePage": "examples/neon-corridor-strike/scripts/build-sfx.mjs",
        "license": "CC0-1.0",
        "author": "Aura3D synthesis",
        "checkedAt": "2026-08-17T12:56:41.886Z"
      },
      "sourcePath": "assets/hit.wav",
      "outputPath": "public/aura-assets/corridorHitSfx.3b73140e.wav",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/corridorHitSfx.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "corridorHurtSfx": {
    type: "audio",
    format: "wav",
    url: "/examples/neon-corridor-strike/public/aura-assets/corridorHurtSfx.bff55878.wav",
    hash: "sha256-bff558788dfb7c52d3fe2ce97dad32ba0d5ea77fd734b3beca24351704cf9917",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 13274,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "assets/hurt.wav",
        "sourcePage": "examples/neon-corridor-strike/scripts/build-sfx.mjs",
        "license": "CC0-1.0",
        "author": "Aura3D synthesis",
        "checkedAt": "2026-08-17T12:56:42.929Z"
      },
      "sourcePath": "assets/hurt.wav",
      "outputPath": "public/aura-assets/corridorHurtSfx.bff55878.wav",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/corridorHurtSfx.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "corridorKillSfx": {
    type: "audio",
    format: "wav",
    url: "/examples/neon-corridor-strike/public/aura-assets/corridorKillSfx.b95734da.wav",
    hash: "sha256-b95734da029a178b2042f87eb612d5f62918de15a7ed6013a4d4ed63a8acc397",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 22094,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "assets/kill.wav",
        "sourcePage": "examples/neon-corridor-strike/scripts/build-sfx.mjs",
        "license": "CC0-1.0",
        "author": "Aura3D synthesis",
        "checkedAt": "2026-08-17T12:56:42.094Z"
      },
      "sourcePath": "assets/kill.wav",
      "outputPath": "public/aura-assets/corridorKillSfx.b95734da.wav",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/corridorKillSfx.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "corridorLoseSfx": {
    type: "audio",
    format: "wav",
    url: "/examples/neon-corridor-strike/public/aura-assets/corridorLoseSfx.0606a2cf.wav",
    hash: "sha256-0606a2cf8be21db43a90a2ed4cfb95ec10769cdd0cfb2c6f0c8b02ef0586048f",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 35324,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "assets/lose.wav",
        "sourcePage": "examples/neon-corridor-strike/scripts/build-sfx.mjs",
        "license": "CC0-1.0",
        "author": "Aura3D synthesis",
        "checkedAt": "2026-08-17T12:56:43.767Z"
      },
      "sourcePath": "assets/lose.wav",
      "outputPath": "public/aura-assets/corridorLoseSfx.0606a2cf.wav",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/corridorLoseSfx.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "corridorPickupSfx": {
    type: "audio",
    format: "wav",
    url: "/examples/neon-corridor-strike/public/aura-assets/corridorPickupSfx.af6af77a.wav",
    hash: "sha256-af6af77a53ddcfe2da3792ef41c17a080de0faed0af7989bebab768978a091d6",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 15038,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "assets/pickup.wav",
        "sourcePage": "examples/neon-corridor-strike/scripts/build-sfx.mjs",
        "license": "CC0-1.0",
        "author": "Aura3D synthesis",
        "checkedAt": "2026-08-17T12:56:43.136Z"
      },
      "sourcePath": "assets/pickup.wav",
      "outputPath": "public/aura-assets/corridorPickupSfx.af6af77a.wav",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/corridorPickupSfx.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "corridorReloadDoneSfx": {
    type: "audio",
    format: "wav",
    url: "/examples/neon-corridor-strike/public/aura-assets/corridorReloadDoneSfx.7b334b63.wav",
    hash: "sha256-7b334b6367164eb45fc7b1a895aad47584ab579d67b30716a082c42a3d2a7118",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 10628,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "assets/reloadDone.wav",
        "sourcePage": "examples/neon-corridor-strike/scripts/build-sfx.mjs",
        "license": "CC0-1.0",
        "author": "Aura3D synthesis",
        "checkedAt": "2026-08-17T12:56:42.510Z"
      },
      "sourcePath": "assets/reloadDone.wav",
      "outputPath": "public/aura-assets/corridorReloadDoneSfx.7b334b63.wav",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/corridorReloadDoneSfx.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "corridorReloadStartSfx": {
    type: "audio",
    format: "wav",
    url: "/examples/neon-corridor-strike/public/aura-assets/corridorReloadStartSfx.68fb4ecc.wav",
    hash: "sha256-68fb4ecc3058f0945cd0140cc8c94c91c3cf8add746090ed223228b77a431fd7",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 9746,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "assets/reloadStart.wav",
        "sourcePage": "examples/neon-corridor-strike/scripts/build-sfx.mjs",
        "license": "CC0-1.0",
        "author": "Aura3D synthesis",
        "checkedAt": "2026-08-17T12:56:42.301Z"
      },
      "sourcePath": "assets/reloadStart.wav",
      "outputPath": "public/aura-assets/corridorReloadStartSfx.68fb4ecc.wav",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/corridorReloadStartSfx.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "corridorWardenMeshyV1": {
    type: "model",
    format: "glb",
    url: "/examples/neon-corridor-strike/public/aura-assets/corridorWardenMeshyV1.53557aeb.glb",
    hash: "sha256-53557aeb64825a1982182fdc19d7d8acbddf09171318645a828b4577663bfc77",
    bounds: [
      1.28,
      1.904,
      0.729
    ],
    sizeBytes: 10828272,
    metadata: {
      "materials": [
        "material"
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
          "mesh_node"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/corridorWardenMeshyV1.53557aeb.glb",
        "license": "Meshy paid private generation terms",
        "licenseName": "Meshy paid private generation terms",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated through the authenticated paid Meshy API account for candidate use as the Neon Corridor warden in the current Meshy terms; this does not certify release-ready geometry or broader commercial rights.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-09-04T14:06:33.854Z",
        "evidence": [
          "aura-evidence/meshy/corridorWardenMeshyV1.rights.c3191f650b37.json",
          "aura-evidence/meshy/corridorWardenMeshyV1.metadata.8e1640353879.json",
          "public/aura-assets/corridorWardenMeshyV1.meshy-candidate.0da064c7.png"
        ],
        "checkedAt": "2026-09-04T14:06:33.854Z"
      },
      "sourcePath": "public/aura-assets/corridorWardenMeshyV1.53557aeb.glb",
      "outputPath": "public/aura-assets/corridorWardenMeshyV1.53557aeb.glb",
      "license": "Meshy paid private generation terms",
      "boundsMetadata": {
        "min": [
          -0.64,
          -0.953,
          -0.366
        ],
        "max": [
          0.639,
          0.951,
          0.363
        ],
        "size": [
          1.28,
          1.904,
          0.729
        ],
        "center": [
          -0.001,
          -0.001,
          -0.001
        ],
        "maxDimension": 1.904,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "material",
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
        "mesh_node"
      ],
      "textures": [
        "normal",
        "base_color",
        "metallic_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/corridorWardenMeshyV1.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/examples/neon-corridor-strike/public/aura-assets/corridorWardenMeshyV1.meshy-candidate.0da064c7.png",
        "kind": "manual-inspection",
        "sha256": "sha256-0da064c739fdd6fb51ca728d6937cd53ce404ba7ac07b6a0fb253e0c29dbe8f6",
        "checkedAt": "2026-09-04T14:20:59.417Z"
      }
    },
  },
  "corridorWarnSfx": {
    type: "audio",
    format: "wav",
    url: "/examples/neon-corridor-strike/public/aura-assets/corridorWarnSfx.03f4cc46.wav",
    hash: "sha256-03f4cc46ee7fc8fee5f5938373ab3b9c53f5e64168e80c181fc04de221f1a468",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 5336,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "assets/warn.wav",
        "sourcePage": "examples/neon-corridor-strike/scripts/build-sfx.mjs",
        "license": "CC0-1.0",
        "author": "Aura3D synthesis",
        "checkedAt": "2026-08-17T12:56:43.981Z"
      },
      "sourcePath": "assets/warn.wav",
      "outputPath": "public/aura-assets/corridorWarnSfx.03f4cc46.wav",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/corridorWarnSfx.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "corridorWinSfx": {
    type: "audio",
    format: "wav",
    url: "/examples/neon-corridor-strike/public/aura-assets/corridorWinSfx.a2c01dc5.wav",
    hash: "sha256-a2c01dc5e3ec0f5f8fe23ac479f3921b864105935a8cf48f508237f5b9f3a8a2",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 39734,
    metadata: {
      "materials": [],
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
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "assets/win.wav",
        "sourcePage": "examples/neon-corridor-strike/scripts/build-sfx.mjs",
        "license": "CC0-1.0",
        "author": "Aura3D synthesis",
        "checkedAt": "2026-08-17T12:56:43.555Z"
      },
      "sourcePath": "assets/win.wav",
      "outputPath": "public/aura-assets/corridorWinSfx.a2c01dc5.wav",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/corridorWinSfx.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "impA": {
    type: "model",
    format: "glb",
    url: "/examples/neon-corridor-strike/public/aura-assets/impA.8283c44f.glb",
    hash: "sha256-8283c44fa3bc599535357be8b5259fce36b51bcb7531febef1310afeb1f24723",
    bounds: [
      35.089,
      22.216,
      44.685
    ],
    sizeBytes: 834864,
    metadata: {
      "materials": [
        "Material.001",
        "Material.003",
        "Material.004",
        "Material.005",
        "Material.007",
        "Material.006"
      ],
      "animations": [
        "ArmatureAction"
      ],
      "animationClips": [
        "ArmatureAction"
      ],
      "animationMetadata": {
        "clipCount": 1,
        "clips": [
          {
            "index": 0,
            "name": "ArmatureAction",
            "channelCount": 38,
            "samplerCount": 38,
            "targetPaths": [
              "rotation",
              "scale",
              "translation"
            ],
            "targetNodes": [
              "Chest_12",
              "Neck_1",
              "Head_0",
              "Shoulder 1_6",
              "Upper arm 1_5",
              "Lower arm 1_4",
              "Hand 1_3",
              "finger 1_2",
              "Shoulder 2_11",
              "Upper arm 2_10",
              "Lower arm 2_9",
              "hand 2_8",
              "finger 2_7"
            ]
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
        "skinCount": 1,
        "jointCount": 23,
        "skins": [
          {
            "index": 0,
            "name": "skin-0",
            "jointCount": 23,
            "joints": [
              "GLTF_created_0_rootJoint",
              "ROOT_21",
              "BackBone_20",
              "Mid back_13",
              "Chest_12",
              "Neck_1",
              "Head_0",
              "Shoulder 1_6",
              "Upper arm 1_5",
              "Lower arm 1_4",
              "Hand 1_3",
              "finger 1_2",
              "Shoulder 2_11",
              "Upper arm 2_10",
              "Lower arm 2_9",
              "hand 2_8",
              "finger 2_7",
              "upper leg 1_16",
              "lower leg 1_15",
              "foot 1_14",
              "upper leg 2_19",
              "lower leg 2_18",
              "foot 2_17"
            ],
            "skeleton": "GLTF_created_0_rootJoint"
          }
        ],
        "messages": [
          "Detected 1 skin with 23 unique joints."
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
        "nodeCount": 112,
        "meshCount": 42,
        "materialCount": 6,
        "textureCount": 1,
        "animationClipCount": 1,
        "skinCount": 1,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Sketchfab_model"
        ],
        "maxDepth": 15,
        "messages": [
          "Detected 112 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/impA.8283c44f.glb",
        "sourcePage": "https://sketchfab.com/3d-models/horror-creature-3cc51bb456034f5e9da1f8ba1d3534d1",
        "downloadUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-088/3cc51bb456034f5e9da1f8ba1d3534d1.glb",
        "sourceUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-088/3cc51bb456034f5e9da1f8ba1d3534d1.glb",
        "license": "CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)",
        "licenseName": "CC-BY-4.0",
        "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
        "licenseRaw": "CC-BY-4.0",
        "author": "Emi De Vogelaere (https://sketchfab.com/EmiDeVogelaere)",
        "sourceFamily": "sketchfab-via-objaverse",
        "attribution": "Emi De Vogelaere",
        "sha256": "sha256-8283c44fa3bc599535357be8b5259fce36b51bcb7531febef1310afeb1f24723",
        "retrievedAt": "2026-08-17T02:25:30.837Z",
        "resolveCandidate": {
          "catalogId": "objaverse:3cc51bb456034f5e9da1f8ba1d3534d1",
          "query": "horror demon creature game enemy",
          "source": "objaverse",
          "sourceFamily": "objaverse",
          "scoreTotal": 0,
          "scoreBreakdown": {
            "semantic": 10.04,
            "sourceQuality": 14,
            "license": 13,
            "inspection": 0,
            "roleFit": 0
          },
          "reasons": [
            "semantic/source score 10.04",
            "download URL preserved",
            "author/attribution preserved",
            "verified CC-BY-4.0 license"
          ],
          "penalties": [
            "missing source page",
            "missing license URL/source evidence",
            "missing bounds/dimensions metadata",
            "missing material metadata for visual model role",
            "missing texture metadata for visual model role"
          ],
          "downloadUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-088/3cc51bb456034f5e9da1f8ba1d3534d1.glb",
          "license": "CC-BY-4.0",
          "licenseName": "CC-BY-4.0",
          "licenseRaw": "CC-BY-4.0",
          "author": "Emi De Vogelaere",
          "attribution": "Emi De Vogelaere",
          "semanticScore": 0.7345870211144752,
          "postDownloadInspection": {
            "bounds": [
              35.089,
              22.216,
              44.685
            ],
            "materialCount": 6,
            "textureCount": 1,
            "animationClipCount": 1,
            "skinCount": 1,
            "morphTargetCount": 0,
            "warnings": [
              "orientation metadata missing; facing direction cannot be validated until GLTF extras declare aura3d.orientation.forwardAxis"
            ]
          },
          "rawCatalogMetadata": {
            "id": "objaverse:3cc51bb456034f5e9da1f8ba1d3534d1",
            "title": "Horror Creature",
            "source": "objaverse",
            "url": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-088/3cc51bb456034f5e9da1f8ba1d3534d1.glb",
            "license": "CC-BY-4.0",
            "thumbnail": "https://media.sketchfab.com/models/3cc51bb456034f5e9da1f8ba1d3534d1/thumbnails/9101d18440fa4c90ad8d35dc72fc2894/cf8c961aae3e40cbb67cc18819286021.jpeg",
            "attribution": "Emi De Vogelaere",
            "score": 0.7345870211144752
          }
        },
        "checkedAt": "2026-08-17T02:25:30.837Z"
      },
      "sourcePath": "public/aura-assets/impA.8283c44f.glb",
      "outputPath": "public/aura-assets/impA.8283c44f.glb",
      "license": "CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)",
      "author": "Emi De Vogelaere (https://sketchfab.com/EmiDeVogelaere)",
      "boundsMetadata": {
        "min": [
          -19.851,
          -3.498,
          -32.596
        ],
        "max": [
          15.238,
          18.718,
          12.089
        ],
        "size": [
          35.089,
          22.216,
          44.685
        ],
        "center": [
          -2.307,
          7.61,
          -10.253
        ],
        "maxDimension": 44.685,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "Material.001",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Material.003",
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
          "name": "Material.005",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Material.007",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Material.006",
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
        "view": "hash-bound-route-facing-view",
        "assetHash": "sha256-8283c44fa3bc599535357be8b5259fce36b51bcb7531febef1310afeb1f24723",
        "generatedBy": "tests/browser/neon-corridor-release-asset-probes.spec.ts",
        "checkedAt": "2026-08-30T16:12:50.148Z",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=impA",
        "renderedProbe": {
          "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/impA.png",
          "sha256": "sha256-433536f7238ebbf2db6ffd8fb1c75eba00150a44114582df35e25221a743c2ca",
          "assetHash": "sha256-8283c44fa3bc599535357be8b5259fce36b51bcb7531febef1310afeb1f24723",
          "checkedAt": "2026-08-30T16:12:50.148Z",
          "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=impA"
        },
        "messages": [
          "The current hash-bound isolated root probe was reviewed +Y-up with the authored route-facing direction along +Z. It proves only static presentation; movement, aiming, hits, and damage remain route-local."
        ]
      },
      "nodeNames": [
        "Sketchfab_model",
        "root",
        "GLTF_SceneRootNode",
        "Armature_59",
        "GLTF_created_0",
        "GLTF_created_0_rootJoint",
        "Sphere.000_22",
        "Object_7",
        "Sphere.001_23",
        "Object_9",
        "Sphere.002_24",
        "Object_11",
        "Sphere.003_25",
        "Object_13",
        "Sphere.004_26",
        "Object_15",
        "Sphere.005_27",
        "Object_17",
        "Sphere.006_28",
        "Object_19",
        "Sphere.007_29",
        "Object_21",
        "Sphere.008_30",
        "Object_23",
        "Sphere.009_31",
        "Object_25",
        "Sphere.010_32",
        "Object_27",
        "Sphere.011_33",
        "Object_29",
        "Sphere.012_34",
        "Object_31",
        "Sphere.013_35",
        "Object_33",
        "Sphere.014_36",
        "Object_35",
        "Sphere.015_37",
        "Object_37",
        "Sphere.016_38",
        "Object_39",
        "Sphere.017_39",
        "Object_41",
        "Sphere.018_40",
        "Object_43",
        "Sphere.019_41",
        "Object_45",
        "Sphere.020_42",
        "Object_47",
        "Sphere.021_43",
        "Object_49",
        "Sphere.022_44",
        "Object_51",
        "Sphere.023_45",
        "Object_53",
        "Sphere.024_46",
        "Object_55",
        "Sphere.025_47",
        "Object_57",
        "Sphere.026_48",
        "Object_59",
        "Sphere.027_49",
        "Object_61",
        "Sphere.029_50",
        "Object_63",
        "Sphere.030_51",
        "Object_65",
        "Sphere.031_52",
        "Object_67",
        "Sphere.032_53",
        "Object_69",
        "Sphere.033_54",
        "Object_71",
        "Sphere.034_55",
        "Object_73",
        "Sphere.035_56",
        "Object_75",
        "Sphere.036_57",
        "Object_77",
        "Sphere.037_58",
        "Object_79",
        "ROOT_21",
        "BackBone_20",
        "Mid back_13",
        "Chest_12",
        "Neck_1",
        "Head_0",
        "Shoulder 1_6",
        "Upper arm 1_5",
        "Lower arm 1_4",
        "Hand 1_3",
        "finger 1_2",
        "Shoulder 2_11",
        "Upper arm 2_10",
        "Lower arm 2_9",
        "hand 2_8",
        "finger 2_7",
        "upper leg 1_16",
        "lower leg 1_15",
        "foot 1_14",
        "upper leg 2_19",
        "lower leg 2_18",
        "foot 2_17",
        "Plane.002_60",
        "Object_103",
        "Cube.006_61",
        "Object_105",
        "Cube.000_62",
        "Object_107",
        "Cube.001_63",
        "Object_109",
        "Cube.003_64",
        "Object_111"
      ],
      "textures": [
        "image-0"
      ],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/impA.thumb.svg",
      "quality": "release",
      "role": "character",
      "suitabilityReason": "Textured CC-BY hostile character visual with hash-bound isolated proof and route-normalized camera-fit placement to 1.72 metres; movement, hitscan, health, reactions, and damage remain route-local.",
      "renderedProbe": {
        "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/impA.png",
        "kind": "browser-screenshot",
        "renderer": "createAuraApp @aura3d/engine production-runtime",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=impA",
        "sha256": "sha256-433536f7238ebbf2db6ffd8fb1c75eba00150a44114582df35e25221a743c2ca",
        "assetHash": "sha256-8283c44fa3bc599535357be8b5259fce36b51bcb7531febef1310afeb1f24723",
        "width": 800,
        "height": 600,
        "nonBlankPixels": 480000,
        "colorBuckets": 31,
        "checkedAt": "2026-08-30T16:12:50.148Z",
        "foregroundBounds": {
          "x": 114,
          "y": 226,
          "width": 485,
          "height": 238
        }
      }
    },
  },
  "impB": {
    type: "model",
    format: "glb",
    url: "/examples/neon-corridor-strike/public/aura-assets/impB.cf055563.glb",
    hash: "sha256-cf05556377a7b8f686c52444adec62d24b73c392cccb51f9ca2ba916c1019a83",
    bounds: [
      79.144,
      131.48,
      83.403
    ],
    sizeBytes: 4314340,
    metadata: {
      "materials": [
        "default"
      ],
      "animations": [
        "Take 001"
      ],
      "animationClips": [
        "Take 001"
      ],
      "animationMetadata": {
        "clipCount": 1,
        "clips": [
          {
            "index": 0,
            "name": "Take 001",
            "channelCount": 315,
            "samplerCount": 315,
            "targetPaths": [
              "translation",
              "scale",
              "rotation"
            ],
            "targetNodes": [
              "Bip001 HeadNub_06",
              "Bip001 JawNub_08",
              "Bip001 Jaw_07",
              "Bip001 Ear RNub_04",
              "Bip001 Ear R_03",
              "Bip001 Ear LNub_02",
              "Bip001 Ear L_01",
              "Bip001 Head_05",
              "Bip001 Neck4_057",
              "Bip001 Neck3_056",
              "Bip001 Neck2_055",
              "Bip001 Neck1_054",
              "Bip001 L Finger0Nub_014",
              "Bip001 L Finger02_013",
              "Bip001 L Finger01_012",
              "Bip001 L Finger0_011",
              "Bip001 L Finger1Nub_018",
              "Bip001 L Finger12_017",
              "Bip001 L Finger11_016",
              "Bip001 L Finger1_015",
              "Bip001 L Finger2Nub_022",
              "Bip001 L Finger22_021",
              "Bip001 L Finger21_020",
              "Bip001 L Finger2_019",
              "Bip001 L Finger3Nub_026",
              "Bip001 L Finger32_025",
              "Bip001 L Finger31_024",
              "Bip001 L Finger3_023",
              "Bip001 L Finger4Nub_030",
              "Bip001 L Finger42_029",
              "Bip001 L Finger41_028",
              "Bip001 L Finger4_027",
              "Bip001 L Hand_036",
              "Bip001 L Forearm_035",
              "Bip001 L ForeTwist2_034",
              "Bip001 L ForeTwist1_033",
              "Bip001 L ForeTwist_032",
              "Bip001 L UpperArm_046",
              "Bip001 LUpArmTwist2_052",
              "Bip001 LUpArmTwist1_051",
              "Bip001 LUpArmTwist_050",
              "Bip001 L Clavicle_010",
              "Bip001 R Finger0Nub_064",
              "Bip001 R Finger02_063",
              "Bip001 R Finger01_062",
              "Bip001 R Finger0_061",
              "Bip001 R Finger1Nub_068",
              "Bip001 R Finger12_067",
              "Bip001 R Finger11_066",
              "Bip001 R Finger1_065",
              "Bip001 R Finger2Nub_072",
              "Bip001 R Finger22_071",
              "Bip001 R Finger21_070",
              "Bip001 R Finger2_069",
              "Bip001 R Finger3Nub_076",
              "Bip001 R Finger32_075",
              "Bip001 R Finger31_074",
              "Bip001 R Finger3_073",
              "Bip001 R Finger4Nub_080",
              "Bip001 R Finger42_079",
              "Bip001 R Finger41_078",
              "Bip001 R Finger4_077",
              "Bip001 R Hand_086",
              "Bip001 R Forearm_085",
              "Bip001 R ForeTwist2_084",
              "Bip001 R ForeTwist1_083",
              "Bip001 R ForeTwist_082",
              "Bip001 R UpperArm_096",
              "Bip001 RUpArmTwist2_0102",
              "Bip001 RUpArmTwist1_0101",
              "Bip001 RUpArmTwist_0100",
              "Bip001 R Clavicle_060",
              "Bip001 Neck_053",
              "Bip001 Spine2_0105",
              "Bip001 Spine1_0104",
              "Bip001 L Toe0Nub_039",
              "Bip001 L Toe0_038",
              "Bip001 L Toe1Nub_041",
              "Bip001 L Toe1_040",
              "Bip001 L Toe2Nub_043",
              "Bip001 L Toe2_042",
              "Bip001 L Toe3Nub_045",
              "Bip001 L Toe3_044",
              "Bip001 L Foot_031",
              "Bip001 L Calf_09",
              "Bip001 L Thigh_037",
              "Bip001 R Toe0Nub_089",
              "Bip001 R Toe0_088",
              "Bip001 R Toe1Nub_091",
              "Bip001 R Toe1_090",
              "Bip001 R Toe2Nub_093",
              "Bip001 R Toe2_092",
              "Bip001 R Toe3Nub_095",
              "Bip001 R Toe3_094",
              "Bip001 R Foot_081",
              "Bip001 R Calf_059",
              "Bip001 R Thigh_087",
              "Bip001 RThighTwist2_099",
              "Bip001 RThighTwist1_098",
              "Bip001 RThighTwist_097",
              "Bip001 LThighTwist2_049",
              "Bip001 LThighTwist1_048",
              "Bip001 LThighTwist_047",
              "Bip001 Spine_0103",
              "Bip001 Pelvis_058",
              "Bip001_00"
            ]
          }
        ],
        "messages": [
          "Detected 1 embedded animation clip."
        ]
      },
      "humanoid": true,
      "humanoidStatus": "humanoid",
      "humanoidConfidence": "high",
      "skeleton": {
        "skinCount": 1,
        "jointCount": 107,
        "skins": [
          {
            "index": 0,
            "name": "skin-0",
            "jointCount": 107,
            "joints": [
              "_rootJoint",
              "Bip001_00",
              "Bip001 Pelvis_058",
              "Bip001 Spine_0103",
              "Bip001 Spine1_0104",
              "Bip001 Spine2_0105",
              "Bip001 Neck_053",
              "Bip001 Neck1_054",
              "Bip001 Neck2_055",
              "Bip001 Neck3_056",
              "Bip001 Neck4_057",
              "Bip001 Head_05",
              "Bip001 HeadNub_06",
              "Bip001 Jaw_07",
              "Bip001 JawNub_08",
              "Bip001 Ear R_03",
              "Bip001 Ear RNub_04",
              "Bip001 Ear L_01",
              "Bip001 Ear LNub_02",
              "Bip001 L Clavicle_010",
              "Bip001 L UpperArm_046",
              "Bip001 L Forearm_035",
              "Bip001 L Hand_036",
              "Bip001 L Finger0_011",
              "Bip001 L Finger01_012",
              "Bip001 L Finger02_013",
              "Bip001 L Finger0Nub_014",
              "Bip001 L Finger1_015",
              "Bip001 L Finger11_016",
              "Bip001 L Finger12_017",
              "Bip001 L Finger1Nub_018",
              "Bip001 L Finger2_019",
              "Bip001 L Finger21_020",
              "Bip001 L Finger22_021",
              "Bip001 L Finger2Nub_022",
              "Bip001 L Finger3_023",
              "Bip001 L Finger31_024",
              "Bip001 L Finger32_025",
              "Bip001 L Finger3Nub_026",
              "Bip001 L Finger4_027",
              "Bip001 L Finger41_028",
              "Bip001 L Finger42_029",
              "Bip001 L Finger4Nub_030",
              "Bip001 L ForeTwist_032",
              "Bip001 L ForeTwist1_033",
              "Bip001 L ForeTwist2_034",
              "Bip001 LUpArmTwist_050",
              "Bip001 LUpArmTwist1_051",
              "Bip001 LUpArmTwist2_052",
              "Bip001 R Clavicle_060",
              "Bip001 R UpperArm_096",
              "Bip001 R Forearm_085",
              "Bip001 R Hand_086",
              "Bip001 R Finger0_061",
              "Bip001 R Finger01_062",
              "Bip001 R Finger02_063",
              "Bip001 R Finger0Nub_064",
              "Bip001 R Finger1_065",
              "Bip001 R Finger11_066",
              "Bip001 R Finger12_067",
              "Bip001 R Finger1Nub_068",
              "Bip001 R Finger2_069",
              "Bip001 R Finger21_070",
              "Bip001 R Finger22_071",
              "Bip001 R Finger2Nub_072",
              "Bip001 R Finger3_073",
              "Bip001 R Finger31_074",
              "Bip001 R Finger32_075",
              "Bip001 R Finger3Nub_076",
              "Bip001 R Finger4_077",
              "Bip001 R Finger41_078",
              "Bip001 R Finger42_079",
              "Bip001 R Finger4Nub_080",
              "Bip001 R ForeTwist_082",
              "Bip001 R ForeTwist1_083",
              "Bip001 R ForeTwist2_084",
              "Bip001 RUpArmTwist_0100",
              "Bip001 RUpArmTwist1_0101",
              "Bip001 RUpArmTwist2_0102",
              "Bip001 L Thigh_037",
              "Bip001 L Calf_09",
              "Bip001 L Foot_031",
              "Bip001 L Toe0_038",
              "Bip001 L Toe0Nub_039",
              "Bip001 L Toe1_040",
              "Bip001 L Toe1Nub_041",
              "Bip001 L Toe2_042",
              "Bip001 L Toe2Nub_043",
              "Bip001 L Toe3_044",
              "Bip001 L Toe3Nub_045",
              "Bip001 R Thigh_087",
              "Bip001 R Calf_059",
              "Bip001 R Foot_081",
              "Bip001 R Toe0_088",
              "Bip001 R Toe0Nub_089",
              "Bip001 R Toe1_090",
              "Bip001 R Toe1Nub_091",
              "Bip001 R Toe2_092",
              "Bip001 R Toe2Nub_093",
              "Bip001 R Toe3_094",
              "Bip001 R Toe3Nub_095",
              "Bip001 RThighTwist_097",
              "Bip001 RThighTwist1_098",
              "Bip001 RThighTwist2_099",
              "Bip001 LThighTwist_047",
              "Bip001 LThighTwist1_048",
              "Bip001 LThighTwist2_049"
            ],
            "skeleton": "_rootJoint"
          }
        ],
        "messages": [
          "Detected 1 skin with 107 unique joints."
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
        "nodeCount": 115,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 2,
        "animationClipCount": 1,
        "skinCount": 1,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Sketchfab_model"
        ],
        "maxDepth": 20,
        "messages": [
          "Detected 115 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/impB.cf055563.glb",
        "sourcePage": "https://sketchfab.com/3d-models/pig-demon-bba636efaee04b3ea988b2ae4487cfc1",
        "downloadUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-040/bba636efaee04b3ea988b2ae4487cfc1.glb",
        "sourceUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-040/bba636efaee04b3ea988b2ae4487cfc1.glb",
        "license": "CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)",
        "licenseName": "CC-BY-4.0",
        "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
        "licenseRaw": "CC-BY-4.0",
        "author": "Lexington Dath (https://sketchfab.com/Lexinator117)",
        "sourceFamily": "sketchfab-via-objaverse",
        "attribution": "Lexington Dath",
        "sha256": "sha256-cf05556377a7b8f686c52444adec62d24b73c392cccb51f9ca2ba916c1019a83",
        "retrievedAt": "2026-08-17T02:25:33.108Z",
        "resolveCandidate": {
          "catalogId": "objaverse:bba636efaee04b3ea988b2ae4487cfc1",
          "query": "horror demon creature game enemy",
          "source": "objaverse",
          "sourceFamily": "objaverse",
          "scoreTotal": 0,
          "scoreBreakdown": {
            "semantic": 9.42,
            "sourceQuality": 14,
            "license": 13,
            "inspection": 0,
            "roleFit": 0
          },
          "reasons": [
            "semantic/source score 9.42",
            "download URL preserved",
            "author/attribution preserved",
            "verified CC-BY-4.0 license"
          ],
          "penalties": [
            "missing source page",
            "missing license URL/source evidence",
            "missing bounds/dimensions metadata",
            "missing material metadata for visual model role",
            "missing texture metadata for visual model role"
          ],
          "downloadUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-040/bba636efaee04b3ea988b2ae4487cfc1.glb",
          "license": "CC-BY-4.0",
          "licenseName": "CC-BY-4.0",
          "licenseRaw": "CC-BY-4.0",
          "author": "Lexington Dath",
          "attribution": "Lexington Dath",
          "semanticScore": 0.7899905437107086,
          "postDownloadInspection": {
            "bounds": [
              79.144,
              131.48,
              83.403
            ],
            "materialCount": 1,
            "textureCount": 2,
            "animationClipCount": 1,
            "skinCount": 1,
            "morphTargetCount": 0,
            "warnings": [
              "orientation metadata missing; facing direction cannot be validated until GLTF extras declare aura3d.orientation.forwardAxis"
            ]
          },
          "rawCatalogMetadata": {
            "id": "objaverse:bba636efaee04b3ea988b2ae4487cfc1",
            "title": "Pig Demon",
            "source": "objaverse",
            "url": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-040/bba636efaee04b3ea988b2ae4487cfc1.glb",
            "license": "CC-BY-4.0",
            "thumbnail": "https://media.sketchfab.com/models/bba636efaee04b3ea988b2ae4487cfc1/thumbnails/5f4a2deb59ba481998452aacef10e9d1/1024x576.jpeg",
            "attribution": "Lexington Dath",
            "score": 0.7899905437107086
          }
        },
        "checkedAt": "2026-08-17T02:25:33.108Z"
      },
      "sourcePath": "public/aura-assets/impB.cf055563.glb",
      "outputPath": "public/aura-assets/impB.cf055563.glb",
      "license": "CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)",
      "author": "Lexington Dath (https://sketchfab.com/Lexinator117)",
      "boundsMetadata": {
        "min": [
          -61.845,
          -0.375,
          -41.708
        ],
        "max": [
          17.298,
          131.105,
          41.694
        ],
        "size": [
          79.144,
          131.48,
          83.403
        ],
        "center": [
          -22.274,
          65.365,
          -0.007
        ],
        "maxDimension": 131.48,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "default",
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
        "view": "hash-bound-route-facing-view",
        "assetHash": "sha256-cf05556377a7b8f686c52444adec62d24b73c392cccb51f9ca2ba916c1019a83",
        "generatedBy": "tests/browser/neon-corridor-release-asset-probes.spec.ts",
        "checkedAt": "2026-08-30T16:12:56.338Z",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=impB",
        "renderedProbe": {
          "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/impB.png",
          "sha256": "sha256-a166f09e799450905d9cf5ae5f4ee7862d363a339a5d7bf1474e4bf59dc68024",
          "assetHash": "sha256-cf05556377a7b8f686c52444adec62d24b73c392cccb51f9ca2ba916c1019a83",
          "checkedAt": "2026-08-30T16:12:56.338Z",
          "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=impB"
        },
        "messages": [
          "The current hash-bound isolated root probe was reviewed +Y-up with the authored route-facing direction along +Z. It proves only static presentation; movement, aiming, hits, and damage remain route-local."
        ]
      },
      "nodeNames": [
        "Sketchfab_model",
        "885ce494737446d8873aa781b67ea84e.fbx",
        "Object_2",
        "RootNode",
        "Object_4",
        "_rootJoint",
        "Object_6",
        "Object_7",
        "Bip001_00",
        "Bip001 Pelvis_058",
        "Bip001 Spine_0103",
        "Bip001 Spine1_0104",
        "Bip001 Spine2_0105",
        "Bip001 Neck_053",
        "Bip001 Neck1_054",
        "Bip001 Neck2_055",
        "Bip001 Neck3_056",
        "Bip001 Neck4_057",
        "Bip001 Head_05",
        "Bip001 HeadNub_06",
        "Bip001 Jaw_07",
        "Bip001 JawNub_08",
        "Bip001 Ear R_03",
        "Bip001 Ear RNub_04",
        "Bip001 Ear L_01",
        "Bip001 Ear LNub_02",
        "Bip001 L Clavicle_010",
        "Bip001 L UpperArm_046",
        "Bip001 L Forearm_035",
        "Bip001 L Hand_036",
        "Bip001 L Finger0_011",
        "Bip001 L Finger01_012",
        "Bip001 L Finger02_013",
        "Bip001 L Finger0Nub_014",
        "Bip001 L Finger1_015",
        "Bip001 L Finger11_016",
        "Bip001 L Finger12_017",
        "Bip001 L Finger1Nub_018",
        "Bip001 L Finger2_019",
        "Bip001 L Finger21_020",
        "Bip001 L Finger22_021",
        "Bip001 L Finger2Nub_022",
        "Bip001 L Finger3_023",
        "Bip001 L Finger31_024",
        "Bip001 L Finger32_025",
        "Bip001 L Finger3Nub_026",
        "Bip001 L Finger4_027",
        "Bip001 L Finger41_028",
        "Bip001 L Finger42_029",
        "Bip001 L Finger4Nub_030",
        "Bip001 L ForeTwist_032",
        "Bip001 L ForeTwist1_033",
        "Bip001 L ForeTwist2_034",
        "Bip001 LUpArmTwist_050",
        "Bip001 LUpArmTwist1_051",
        "Bip001 LUpArmTwist2_052",
        "Bip001 R Clavicle_060",
        "Bip001 R UpperArm_096",
        "Bip001 R Forearm_085",
        "Bip001 R Hand_086",
        "Bip001 R Finger0_061",
        "Bip001 R Finger01_062",
        "Bip001 R Finger02_063",
        "Bip001 R Finger0Nub_064",
        "Bip001 R Finger1_065",
        "Bip001 R Finger11_066",
        "Bip001 R Finger12_067",
        "Bip001 R Finger1Nub_068",
        "Bip001 R Finger2_069",
        "Bip001 R Finger21_070",
        "Bip001 R Finger22_071",
        "Bip001 R Finger2Nub_072",
        "Bip001 R Finger3_073",
        "Bip001 R Finger31_074",
        "Bip001 R Finger32_075",
        "Bip001 R Finger3Nub_076",
        "Bip001 R Finger4_077",
        "Bip001 R Finger41_078",
        "Bip001 R Finger42_079",
        "Bip001 R Finger4Nub_080",
        "Bip001 R ForeTwist_082",
        "Bip001 R ForeTwist1_083",
        "Bip001 R ForeTwist2_084",
        "Bip001 RUpArmTwist_0100",
        "Bip001 RUpArmTwist1_0101",
        "Bip001 RUpArmTwist2_0102",
        "Bip001 L Thigh_037",
        "Bip001 L Calf_09",
        "Bip001 L Foot_031",
        "Bip001 L Toe0_038",
        "Bip001 L Toe0Nub_039",
        "Bip001 L Toe1_040",
        "Bip001 L Toe1Nub_041",
        "Bip001 L Toe2_042",
        "Bip001 L Toe2Nub_043",
        "Bip001 L Toe3_044",
        "Bip001 L Toe3Nub_045",
        "Bip001 R Thigh_087",
        "Bip001 R Calf_059",
        "Bip001 R Foot_081",
        "Bip001 R Toe0_088",
        "Bip001 R Toe0Nub_089",
        "Bip001 R Toe1_090",
        "Bip001 R Toe1Nub_091",
        "Bip001 R Toe2_092",
        "Bip001 R Toe2Nub_093",
        "Bip001 R Toe3_094",
        "Bip001 R Toe3Nub_095",
        "Bip001 RThighTwist_097",
        "Bip001 RThighTwist1_098",
        "Bip001 RThighTwist2_099",
        "Bip001 LThighTwist_047",
        "Bip001 LThighTwist1_048",
        "Bip001 LThighTwist2_049",
        "Low Poly"
      ],
      "textures": [
        "image-0",
        "image-1"
      ],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/impB.thumb.svg",
      "quality": "release",
      "role": "character",
      "suitabilityReason": "Textured CC-BY hostile character visual with hash-bound isolated proof and route-normalized camera-fit placement to 1.92 metres; movement, hitscan, health, reactions, and damage remain route-local.",
      "renderedProbe": {
        "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/impB.png",
        "kind": "browser-screenshot",
        "renderer": "createAuraApp @aura3d/engine production-runtime",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=impB",
        "sha256": "sha256-a166f09e799450905d9cf5ae5f4ee7862d363a339a5d7bf1474e4bf59dc68024",
        "assetHash": "sha256-cf05556377a7b8f686c52444adec62d24b73c392cccb51f9ca2ba916c1019a83",
        "width": 800,
        "height": 600,
        "nonBlankPixels": 480000,
        "colorBuckets": 54,
        "checkedAt": "2026-08-30T16:12:56.338Z",
        "foregroundBounds": {
          "x": 241,
          "y": 147,
          "width": 295,
          "height": 453
        }
      }
    },
  },
  "medkit": {
    type: "model",
    format: "glb",
    url: "/examples/neon-corridor-strike/public/aura-assets/medkit.1f82742f.glb",
    hash: "sha256-1f82742fb4bc79b46884a991d4fdeb6f1a0a9a39f7982c1a006da2f9f8da3076",
    bounds: [
      1.876,
      1.207,
      0.76
    ],
    sizeBytes: 2309260,
    metadata: {
      "materials": [
        "Chair_base",
        "Chair_mechanics",
        "Chair_bedding",
        "Syringe"
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
        "nodeCount": 9,
        "meshCount": 4,
        "materialCount": 4,
        "textureCount": 8,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Sketchfab_model"
        ],
        "maxDepth": 5,
        "messages": [
          "Detected 9 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/medkit.1f82742f.glb",
        "sourcePage": "https://sketchfab.com/3d-models/game-prop-mental-asylum-gurney-43736bb6a0b64fe8a824542bdbace6bc",
        "downloadUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-005/43736bb6a0b64fe8a824542bdbace6bc.glb",
        "sourceUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-005/43736bb6a0b64fe8a824542bdbace6bc.glb",
        "license": "CC-BY-4.0",
        "licenseName": "Creative Commons Attribution 4.0 International",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "licenseRaw": "CC-BY-4.0",
        "author": "Ellie",
        "sourceFamily": "sketchfab-via-objaverse",
        "attribution": "Ellie",
        "sha256": "sha256-1f82742fb4bc79b46884a991d4fdeb6f1a0a9a39f7982c1a006da2f9f8da3076",
        "retrievedAt": "2026-08-17T02:25:42.017Z",
        "resolveCandidate": {
          "catalogId": "objaverse:43736bb6a0b64fe8a824542bdbace6bc",
          "query": "health pickup game prop",
          "source": "objaverse",
          "sourceFamily": "objaverse",
          "scoreTotal": 0.19,
          "scoreBreakdown": {
            "semantic": 10.19,
            "sourceQuality": 14,
            "license": 13,
            "inspection": 0,
            "roleFit": 0
          },
          "reasons": [
            "semantic/source score 10.19",
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
          "downloadUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-005/43736bb6a0b64fe8a824542bdbace6bc.glb",
          "license": "CC-BY-4.0",
          "licenseName": "CC-BY-4.0",
          "licenseRaw": "CC-BY-4.0",
          "author": "Ellie",
          "attribution": "Ellie",
          "semanticScore": 0.7487586728752733,
          "postDownloadInspection": {
            "bounds": [
              1.876,
              1.207,
              0.76
            ],
            "materialCount": 4,
            "textureCount": 8,
            "animationClipCount": 0,
            "skinCount": 0,
            "morphTargetCount": 0,
            "warnings": [
              "orientation metadata missing; facing direction cannot be validated until GLTF extras declare aura3d.orientation.forwardAxis"
            ]
          },
          "rawCatalogMetadata": {
            "id": "objaverse:43736bb6a0b64fe8a824542bdbace6bc",
            "title": "Game Prop: Mental Asylum Gurney",
            "source": "objaverse",
            "url": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-005/43736bb6a0b64fe8a824542bdbace6bc.glb",
            "license": "CC-BY-4.0",
            "thumbnail": "https://media.sketchfab.com/models/43736bb6a0b64fe8a824542bdbace6bc/thumbnails/f83d8f30644a46e3aa7e4aaa55a2e599/1024x576.jpeg",
            "attribution": "Ellie",
            "score": 0.7487586728752733
          }
        },
        "checkedAt": "2026-08-17T02:25:42.017Z"
      },
      "sourcePath": "public/aura-assets/medkit.1f82742f.glb",
      "outputPath": "public/aura-assets/medkit.1f82742f.glb",
      "license": "CC-BY-4.0",
      "author": "Ellie",
      "boundsMetadata": {
        "min": [
          7.037,
          -0.057,
          1.238
        ],
        "max": [
          8.913,
          1.15,
          1.998
        ],
        "size": [
          1.876,
          1.207,
          0.76
        ],
        "center": [
          7.975,
          0.546,
          1.618
        ],
        "maxDimension": 1.876,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Chair_base",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Chair_mechanics",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Chair_bedding",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Syringe",
          "visible": true,
          "readable": true,
          "opacity": 0.334,
          "alphaMode": "BLEND",
          "reasons": []
        }
      ],
      "orientation": {
        "source": "manifest-override",
        "view": "hash-bound-readable-prop-view",
        "assetHash": "sha256-1f82742fb4bc79b46884a991d4fdeb6f1a0a9a39f7982c1a006da2f9f8da3076",
        "generatedBy": "tests/browser/neon-corridor-release-asset-probes.spec.ts",
        "checkedAt": "2026-08-30T16:13:05.051Z",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=medkit",
        "renderedProbe": {
          "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/medkit.png",
          "sha256": "sha256-ce5c383f42d76f8b0f96034a0babf1cec44eabeffd5530268f5aa6cedd5fe59a",
          "assetHash": "sha256-1f82742fb4bc79b46884a991d4fdeb6f1a0a9a39f7982c1a006da2f9f8da3076",
          "checkedAt": "2026-08-30T16:13:05.051Z",
          "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=medkit"
        },
        "messages": [
          "The current hash-bound isolated root probe proves a readable static prop/environment presentation; no forward-axis or gameplay behavior is inferred."
        ]
      },
      "nodeNames": [
        "Sketchfab_model",
        "3fe2003a632f49f19be4a10d9d723c32.fbx",
        "RootNode",
        "polySurface40",
        "polySurface40_Chair_base_0",
        "polySurface40_Chair_mechanics_0",
        "polySurface40_Chair_bedding_0",
        "pCylinder34",
        "pCylinder34_Syringe_0"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2",
        "image-3",
        "image-4",
        "image-5",
        "image-6",
        "image-7"
      ],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/medkit.thumb.svg",
      "quality": "release",
      "role": "prop",
      "suitabilityReason": "Textured CC-BY gurney-shaped health pickup prop retained for its readable medical silhouette; collection, healing, and reset behavior remain route-local.",
      "renderedProbe": {
        "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/medkit.png",
        "kind": "browser-screenshot",
        "renderer": "createAuraApp @aura3d/engine production-runtime",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=medkit",
        "sha256": "sha256-ce5c383f42d76f8b0f96034a0babf1cec44eabeffd5530268f5aa6cedd5fe59a",
        "assetHash": "sha256-1f82742fb4bc79b46884a991d4fdeb6f1a0a9a39f7982c1a006da2f9f8da3076",
        "width": 800,
        "height": 600,
        "nonBlankPixels": 477035,
        "colorBuckets": 26,
        "checkedAt": "2026-08-30T16:13:05.051Z",
        "foregroundBounds": {
          "x": 199,
          "y": 184,
          "width": 485,
          "height": 340
        }
      }
    },
  },
  "neonArena": {
    type: "model",
    format: "glb",
    url: "/examples/neon-corridor-strike/public/aura-assets/neonArena.7327d83f.glb",
    hash: "sha256-7327d83f8c49650515e6f23ef4a2e8a857415001e37a469dcf5407adaa96dd15",
    bounds: [
      1.904,
      1.169,
      0.244
    ],
    sizeBytes: 33052244,
    metadata: {
      "materials": [
        "material"
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
          "mesh_node"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/neonArena.7327d83f.glb",
        "license": "Meshy paid private generation terms",
        "licenseName": "Meshy paid private generation terms",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated through the authenticated paid Meshy API account with --max-credits 60 for candidate use in the Neon Corridor Strike arena lane under the current Meshy terms; this does not certify release-ready geometry or broader commercial rights.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-09-03T07:45:43.073Z",
        "evidence": [
          "aura-evidence/meshy/neonArena.rights.9cd065c2f367.json",
          "aura-evidence/meshy/neonArena.metadata.59e1573ccbd5.json",
          "public/aura-assets/neonArena.meshy-candidate.ec181805.png"
        ],
        "checkedAt": "2026-09-03T07:45:43.073Z"
      },
      "sourcePath": "public/aura-assets/neonArena.7327d83f.glb",
      "outputPath": "public/aura-assets/neonArena.7327d83f.glb",
      "license": "Meshy paid private generation terms",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.577,
          -0.122
        ],
        "max": [
          0.952,
          0.592,
          0.121
        ],
        "size": [
          1.904,
          1.169,
          0.244
        ],
        "center": [
          0,
          0.007,
          -0.001
        ],
        "maxDimension": 1.904,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "material",
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
        "mesh_node"
      ],
      "textures": [
        "normal",
        "base_color",
        "metallic_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/neonArena.thumb.svg",
      "quality": "candidate",
      "role": "environment",
      "renderedProbe": {
        "url": "/examples/neon-corridor-strike/public/aura-assets/neonArena.meshy-candidate.ec181805.png",
        "kind": "manual-inspection",
        "sha256": "sha256-ec18180570967458bc3f4187e371f0571adb79f4e651d35bcb6f393e57dce11d",
        "checkedAt": "2026-09-03T08:08:20.627Z"
      }
    },
  },
  "neonContainmentPulseRifle": {
    type: "model",
    format: "glb",
    url: "/examples/neon-corridor-strike/public/aura-assets/neonContainmentPulseRifle.1d79b688.glb",
    hash: "sha256-1d79b68867c1ac25f156af6556a5714175a019784a9c13a17cd74b67b736d5d8",
    bounds: [
      0.545,
      0.782,
      1.917
    ],
    sizeBytes: 117672,
    metadata: {
      "materials": [
        "Rifle bronze",
        "Rifle charcoal",
        "Rifle charged bore",
        "Rifle cobalt",
        "Rifle steel"
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
        "meshCount": 5,
        "materialCount": 5,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Containment Pulse Rifle — Rifle bronze",
          "Containment Pulse Rifle — Rifle charcoal",
          "Containment Pulse Rifle — Rifle charged bore",
          "Containment Pulse Rifle — Rifle cobalt",
          "Containment Pulse Rifle — Rifle steel"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 5 nodes across 5 roots."
        ]
      },
      "provenance": {
        "sourcePath": "assets/models/neonContainmentPulseRifle.glb",
        "sourcePage": "https://github.com/auraoneai/aura3d/blob/main/examples/neon-corridor-strike/scripts/build-model-family-blender.py",
        "downloadUrl": "https://raw.githubusercontent.com/auraoneai/aura3d/main/examples/neon-corridor-strike/assets/models/neonContainmentPulseRifle.glb",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Aura3D synthesis",
        "sourceFamily": "aura3d-original",
        "attribution": "Aura3D synthesis — original CC0 Neon Corridor containment model family",
        "retrievedAt": "2026-08-31T03:00:00.000Z",
        "evidence": [
          "Authored through the committed Blender 5.2 hard-surface builder; applied bevel geometry, material-separated merged meshes, metre scale, and final hash are reproducible. The rigid assets intentionally contain no clips or skins.",
          "Deterministically generated from committed model-family source; geometry, metre scale, +Y-up/+Z-forward orientation, materials, and hash are reproducible."
        ],
        "checkedAt": "2026-08-31T03:00:00.000Z"
      },
      "sourcePath": "assets/models/neonContainmentPulseRifle.glb",
      "outputPath": "public/aura-assets/neonContainmentPulseRifle.1d79b688.glb",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "boundsMetadata": {
        "min": [
          -0.272,
          -0.552,
          -0.957
        ],
        "max": [
          0.272,
          0.23,
          0.96
        ],
        "size": [
          0.545,
          0.782,
          1.917
        ],
        "center": [
          0,
          -0.161,
          0.001
        ],
        "maxDimension": 1.917,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "Rifle bronze",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Rifle charcoal",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Rifle charged bore",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Rifle cobalt",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Rifle steel",
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
        "view": "hash-bound-route-facing-view",
        "assetHash": "sha256-1d79b68867c1ac25f156af6556a5714175a019784a9c13a17cd74b67b736d5d8",
        "generatedBy": "tests/browser/neon-corridor-release-asset-probes.spec.ts",
        "checkedAt": "2026-08-31T23:37:28.626Z",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=neonContainmentPulseRifle",
        "renderedProbe": {
          "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/neonContainmentPulseRifle.png",
          "sha256": "sha256-a3ab67352ffd8ced91b736cefedeeb8b7bb08436a55ca89cb4237bf587a2f4dd",
          "assetHash": "sha256-1d79b68867c1ac25f156af6556a5714175a019784a9c13a17cd74b67b736d5d8",
          "checkedAt": "2026-08-31T23:37:28.626Z",
          "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=neonContainmentPulseRifle"
        },
        "messages": [
          "The current hash-bound isolated root probe was reviewed +Y-up with the authored route-facing direction along +Z. It proves only static presentation; movement, aiming, hits, and damage remain route-local."
        ]
      },
      "nodeNames": [
        "Containment Pulse Rifle — Rifle bronze",
        "Containment Pulse Rifle — Rifle charcoal",
        "Containment Pulse Rifle — Rifle charged bore",
        "Containment Pulse Rifle — Rifle cobalt",
        "Containment Pulse Rifle — Rifle steel"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/neonContainmentPulseRifle.thumb.svg",
      "quality": "release",
      "role": "weapon",
      "suitabilityReason": "Original CC0 Blender-authored hard-surface containment pulse weapon with beveled charcoal receiver, machined rail, bronze heat ribs, cobalt capacitors, grip, stock, and charged bore. Its intentionally untextured stylized solid materials preserve a readable held silhouette and +Y-up/+Z-forward orientation; route-local hitscan and effects remain gameplay authority.",
      "renderedProbe": {
        "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/neonContainmentPulseRifle.png",
        "kind": "browser-screenshot",
        "renderer": "createAuraApp @aura3d/engine production-runtime",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=neonContainmentPulseRifle",
        "sha256": "sha256-a3ab67352ffd8ced91b736cefedeeb8b7bb08436a55ca89cb4237bf587a2f4dd",
        "assetHash": "sha256-1d79b68867c1ac25f156af6556a5714175a019784a9c13a17cd74b67b736d5d8",
        "width": 800,
        "height": 600,
        "nonBlankPixels": 480000,
        "colorBuckets": 63,
        "checkedAt": "2026-08-31T23:37:28.626Z",
        "foregroundBounds": {
          "x": 92,
          "y": 238,
          "width": 559,
          "height": 234
        }
      }
    },
  },
  "neonContainmentWardenA": {
    type: "model",
    format: "glb",
    url: "/examples/neon-corridor-strike/public/aura-assets/neonContainmentWardenA.4b73f726.glb",
    hash: "sha256-4b73f726b1a1b72dc111c045b81955e29941cc2b14fdf1d8ee0cf3627acf12e0",
    bounds: [
      1.828,
      2.335,
      1.015
    ],
    sizeBytes: 203908,
    metadata: {
      "materials": [
        "Warden A graphite",
        "Warden A hazard ceramic",
        "Warden A mechanics",
        "Warden A optic",
        "Warden A steel"
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
        "meshCount": 5,
        "materialCount": 5,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Containment Warden A — Warden A graphite",
          "Containment Warden A — Warden A hazard ceramic",
          "Containment Warden A — Warden A mechanics",
          "Containment Warden A — Warden A optic",
          "Containment Warden A — Warden A steel"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 5 nodes across 5 roots."
        ]
      },
      "provenance": {
        "sourcePath": "assets/models/neonContainmentWardenA.glb",
        "sourcePage": "https://github.com/auraoneai/aura3d/blob/main/examples/neon-corridor-strike/scripts/build-model-family-blender.py",
        "downloadUrl": "https://raw.githubusercontent.com/auraoneai/aura3d/main/examples/neon-corridor-strike/assets/models/neonContainmentWardenA.glb",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Aura3D synthesis",
        "sourceFamily": "aura3d-original",
        "attribution": "Aura3D synthesis — original CC0 Neon Corridor containment model family",
        "retrievedAt": "2026-08-31T03:00:00.000Z",
        "evidence": [
          "Authored through the committed Blender 5.2 hard-surface builder; applied bevel geometry, material-separated merged meshes, metre scale, and final hash are reproducible. The rigid assets intentionally contain no clips or skins.",
          "Deterministically generated from committed model-family source; geometry, metre scale, +Y-up/+Z-forward orientation, materials, and hash are reproducible."
        ],
        "checkedAt": "2026-08-31T03:00:00.000Z"
      },
      "sourcePath": "assets/models/neonContainmentWardenA.glb",
      "outputPath": "public/aura-assets/neonContainmentWardenA.4b73f726.glb",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "boundsMetadata": {
        "min": [
          -0.914,
          -0.055,
          -0.46
        ],
        "max": [
          0.914,
          2.28,
          0.555
        ],
        "size": [
          1.828,
          2.335,
          1.015
        ],
        "center": [
          0,
          1.113,
          0.047
        ],
        "maxDimension": 2.335,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Warden A graphite",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Warden A hazard ceramic",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Warden A mechanics",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Warden A optic",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Warden A steel",
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
        "view": "hash-bound-route-facing-view",
        "assetHash": "sha256-4b73f726b1a1b72dc111c045b81955e29941cc2b14fdf1d8ee0cf3627acf12e0",
        "generatedBy": "tests/browser/neon-corridor-release-asset-probes.spec.ts",
        "checkedAt": "2026-08-31T23:37:05.269Z",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=neonContainmentWardenA",
        "renderedProbe": {
          "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/neonContainmentWardenA.png",
          "sha256": "sha256-c441be39a77c574c0127a8d29670c7ed47a698047016752c0edcbe506b90098b",
          "assetHash": "sha256-4b73f726b1a1b72dc111c045b81955e29941cc2b14fdf1d8ee0cf3627acf12e0",
          "checkedAt": "2026-08-31T23:37:05.269Z",
          "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=neonContainmentWardenA"
        },
        "messages": [
          "The current hash-bound isolated root probe was reviewed +Y-up with the authored route-facing direction along +Z. It proves only static presentation; movement, aiming, hits, and damage remain route-local."
        ]
      },
      "nodeNames": [
        "Containment Warden A — Warden A graphite",
        "Containment Warden A — Warden A hazard ceramic",
        "Containment Warden A — Warden A mechanics",
        "Containment Warden A — Warden A optic",
        "Containment Warden A — Warden A steel"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/neonContainmentWardenA.thumb.svg",
      "quality": "release",
      "role": "character",
      "suitabilityReason": "Original CC0 Blender-authored rigid breacher character with readable +Y-up/+Z-forward orientation, beveled biped armor, helmet and slit visor, layered chest glacis, articulated-looking arm and leg assemblies, grounded feet, and exposed joints. Intentionally untextured stylized solid materials separate its armor and joints at route scale. This entry is rigid presentation geometry only; route-local enemy movement, damage, and reactions remain authoritative.",
      "renderedProbe": {
        "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/neonContainmentWardenA.png",
        "kind": "browser-screenshot",
        "renderer": "createAuraApp @aura3d/engine production-runtime",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=neonContainmentWardenA",
        "sha256": "sha256-c441be39a77c574c0127a8d29670c7ed47a698047016752c0edcbe506b90098b",
        "assetHash": "sha256-4b73f726b1a1b72dc111c045b81955e29941cc2b14fdf1d8ee0cf3627acf12e0",
        "width": 800,
        "height": 600,
        "nonBlankPixels": 480000,
        "colorBuckets": 74,
        "checkedAt": "2026-08-31T23:37:05.269Z",
        "foregroundBounds": {
          "x": 207,
          "y": 152,
          "width": 387,
          "height": 448
        }
      }
    },
  },
  "neonContainmentWardenB": {
    type: "model",
    format: "glb",
    url: "/examples/neon-corridor-strike/public/aura-assets/neonContainmentWardenB.033bb8d4.glb",
    hash: "sha256-033bb8d46c958983428d361ee58d910e88f1fa94f80d6188ab14cc2905cdefb9",
    bounds: [
      3.992,
      3.411,
      1.776
    ],
    sizeBytes: 141184,
    metadata: {
      "materials": [
        "Warden B steel edges",
        "Warden B threat plates",
        "Warden B tri-eye",
        "Warden B turbine",
        "Warden B wing armor"
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
        "meshCount": 5,
        "materialCount": 5,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Containment Warden B — Warden B steel edges",
          "Containment Warden B — Warden B threat plates",
          "Containment Warden B — Warden B tri-eye",
          "Containment Warden B — Warden B turbine",
          "Containment Warden B — Warden B wing armor"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 5 nodes across 5 roots."
        ]
      },
      "provenance": {
        "sourcePath": "assets/models/neonContainmentWardenB.glb",
        "sourcePage": "https://github.com/auraoneai/aura3d/blob/main/examples/neon-corridor-strike/scripts/build-model-family-blender.py",
        "downloadUrl": "https://raw.githubusercontent.com/auraoneai/aura3d/main/examples/neon-corridor-strike/assets/models/neonContainmentWardenB.glb",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Aura3D synthesis",
        "sourceFamily": "aura3d-original",
        "attribution": "Aura3D synthesis — original CC0 Neon Corridor containment model family",
        "retrievedAt": "2026-08-31T03:00:00.000Z",
        "evidence": [
          "Authored through the committed Blender 5.2 hard-surface builder; applied bevel geometry, material-separated merged meshes, metre scale, and final hash are reproducible. The rigid assets intentionally contain no clips or skins.",
          "Deterministically generated from committed model-family source; geometry, metre scale, +Y-up/+Z-forward orientation, materials, and hash are reproducible."
        ],
        "checkedAt": "2026-08-31T03:00:00.000Z"
      },
      "sourcePath": "assets/models/neonContainmentWardenB.glb",
      "outputPath": "public/aura-assets/neonContainmentWardenB.033bb8d4.glb",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "boundsMetadata": {
        "min": [
          -2.02,
          -0.765,
          -0.792
        ],
        "max": [
          1.972,
          2.645,
          0.984
        ],
        "size": [
          3.992,
          3.411,
          1.776
        ],
        "center": [
          -0.024,
          0.94,
          0.096
        ],
        "maxDimension": 3.992,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "Warden B steel edges",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Warden B threat plates",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Warden B tri-eye",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Warden B turbine",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Warden B wing armor",
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
        "view": "hash-bound-route-facing-view",
        "assetHash": "sha256-033bb8d46c958983428d361ee58d910e88f1fa94f80d6188ab14cc2905cdefb9",
        "generatedBy": "tests/browser/neon-corridor-release-asset-probes.spec.ts",
        "checkedAt": "2026-08-31T23:37:18.485Z",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=neonContainmentWardenB",
        "renderedProbe": {
          "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/neonContainmentWardenB.png",
          "sha256": "sha256-2639b8a80b458b481d746784aee66fba13b2ef818cfec534548d2962da0c4ea5",
          "assetHash": "sha256-033bb8d46c958983428d361ee58d910e88f1fa94f80d6188ab14cc2905cdefb9",
          "checkedAt": "2026-08-31T23:37:18.485Z",
          "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=neonContainmentWardenB"
        },
        "messages": [
          "The current hash-bound isolated root probe was reviewed +Y-up with the authored route-facing direction along +Z. It proves only static presentation; movement, aiming, hits, and damage remain route-local."
        ]
      },
      "nodeNames": [
        "Containment Warden B — Warden B steel edges",
        "Containment Warden B — Warden B threat plates",
        "Containment Warden B — Warden B tri-eye",
        "Containment Warden B — Warden B turbine",
        "Containment Warden B — Warden B wing armor"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/neonContainmentWardenB.thumb.svg",
      "quality": "release",
      "role": "character",
      "suitabilityReason": "Original CC0 Blender-authored rigid elite manta character with readable +Y-up/+Z-forward orientation, broad swept wings, forked steel tips, central and wing turbines, dorsal command fin, three optics, talons, and grounded claws. Intentionally untextured stylized solid materials separate its armor, turbines, and threat plates at route scale. This entry is rigid presentation geometry only; route-local enemy movement, damage, and reactions remain authoritative.",
      "renderedProbe": {
        "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/neonContainmentWardenB.png",
        "kind": "browser-screenshot",
        "renderer": "createAuraApp @aura3d/engine production-runtime",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=neonContainmentWardenB",
        "sha256": "sha256-2639b8a80b458b481d746784aee66fba13b2ef818cfec534548d2962da0c4ea5",
        "assetHash": "sha256-033bb8d46c958983428d361ee58d910e88f1fa94f80d6188ab14cc2905cdefb9",
        "width": 800,
        "height": 600,
        "nonBlankPixels": 480000,
        "colorBuckets": 99,
        "checkedAt": "2026-08-31T23:37:18.485Z",
        "foregroundBounds": {
          "x": 203,
          "y": 271,
          "width": 419,
          "height": 286
        }
      }
    },
  },
  "neonCorridorContainmentWorld": {
    type: "model",
    format: "glb",
    url: "/examples/neon-corridor-strike/public/aura-assets/neonCorridorContainmentWorld.eb9e4da7.glb",
    hash: "sha256-eb9e4da78bfc689d867995b3a676899ecf89a98fb42ff1d304e579885702cffd",
    bounds: [
      6.18,
      2.87,
      22.2
    ],
    sizeBytes: 1300360,
    metadata: {
      "materials": [
        "NC aged bronze",
        "NC amber hazard light",
        "NC blue steel shell",
        "NC cyan containment light",
        "NC deck gunmetal",
        "NC service machinery",
        "NC teal panels"
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
        "nodeCount": 7,
        "meshCount": 7,
        "materialCount": 7,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Containment Corridor — NC aged bronze",
          "Containment Corridor — NC amber hazard light",
          "Containment Corridor — NC blue steel shell",
          "Containment Corridor — NC cyan containment light",
          "Containment Corridor — NC deck gunmetal",
          "Containment Corridor — NC service machinery",
          "Containment Corridor — NC teal panels"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 7 nodes across 7 roots."
        ]
      },
      "provenance": {
        "sourcePath": "assets/models/neonCorridorContainmentWorld.glb",
        "sourcePage": "https://github.com/auraoneai/aura3d/blob/main/examples/neon-corridor-strike/scripts/build-model-family-blender.py",
        "downloadUrl": "https://raw.githubusercontent.com/auraoneai/aura3d/main/examples/neon-corridor-strike/assets/models/neonCorridorContainmentWorld.glb",
        "license": "CC0-1.0",
        "licenseName": "CC0 1.0 Universal",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Aura3D synthesis",
        "sourceFamily": "aura3d-original",
        "attribution": "Aura3D synthesis — original CC0 Neon Corridor containment model family",
        "retrievedAt": "2026-08-31T03:00:00.000Z",
        "evidence": [
          "Authored through the committed Blender 5.2 hard-surface builder; applied bevel geometry, material-separated merged meshes, metre scale, and final hash are reproducible. The rigid assets intentionally contain no clips or skins.",
          "Deterministically generated from committed model-family source; geometry, metre scale, +Y-up/+Z-forward orientation, materials, and hash are reproducible."
        ],
        "checkedAt": "2026-08-31T03:00:00.000Z"
      },
      "sourcePath": "assets/models/neonCorridorContainmentWorld.glb",
      "outputPath": "public/aura-assets/neonCorridorContainmentWorld.eb9e4da7.glb",
      "license": "CC0-1.0",
      "author": "Aura3D synthesis",
      "boundsMetadata": {
        "min": [
          -3.09,
          -0.21,
          -12.1
        ],
        "max": [
          3.09,
          2.66,
          10.1
        ],
        "size": [
          6.18,
          2.87,
          22.2
        ],
        "center": [
          0,
          1.225,
          -1
        ],
        "maxDimension": 22.2,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "NC aged bronze",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "NC amber hazard light",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "NC blue steel shell",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "NC cyan containment light",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "NC deck gunmetal",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "NC service machinery",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "NC teal panels",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        }
      ],
      "orientation": {
        "source": "manifest-override",
        "view": "hash-bound-readable-prop-view",
        "assetHash": "sha256-eb9e4da78bfc689d867995b3a676899ecf89a98fb42ff1d304e579885702cffd",
        "generatedBy": "tests/browser/neon-corridor-release-asset-probes.spec.ts",
        "checkedAt": "2026-08-31T23:36:57.873Z",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=neonCorridorContainmentWorld",
        "renderedProbe": {
          "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/neonCorridorContainmentWorld.png",
          "sha256": "sha256-dd69ce3ffb8ec81b1674ea7ac839db3d17d754b3515088b78279efa1edb6fd61",
          "assetHash": "sha256-eb9e4da78bfc689d867995b3a676899ecf89a98fb42ff1d304e579885702cffd",
          "checkedAt": "2026-08-31T23:36:57.873Z",
          "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=neonCorridorContainmentWorld"
        },
        "messages": [
          "The current hash-bound isolated root probe proves a readable static prop/environment presentation; no forward-axis or gameplay behavior is inferred."
        ]
      },
      "nodeNames": [
        "Containment Corridor — NC aged bronze",
        "Containment Corridor — NC amber hazard light",
        "Containment Corridor — NC blue steel shell",
        "Containment Corridor — NC cyan containment light",
        "Containment Corridor — NC deck gunmetal",
        "Containment Corridor — NC service machinery",
        "Containment Corridor — NC teal panels"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/neonCorridorContainmentWorld.thumb.svg",
      "quality": "release",
      "role": "world",
      "suitabilityReason": "Continuous 22 metre original CC0 Blender-authored containment world with beveled blue-steel shell, connected bronze structure and conduits, layered recessed bays, installed machinery and combat anchors, ceiling frames, and a modeled exit bulkhead. Its intentionally untextured stylized solid-material separation keeps the route-scale footprint readable; collision, triggers, hitscan, and movement stay route-local.",
      "renderedProbe": {
        "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/neonCorridorContainmentWorld.png",
        "kind": "browser-screenshot",
        "renderer": "createAuraApp @aura3d/engine production-runtime",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=neonCorridorContainmentWorld",
        "sha256": "sha256-dd69ce3ffb8ec81b1674ea7ac839db3d17d754b3515088b78279efa1edb6fd61",
        "assetHash": "sha256-eb9e4da78bfc689d867995b3a676899ecf89a98fb42ff1d304e579885702cffd",
        "width": 800,
        "height": 600,
        "nonBlankPixels": 480000,
        "colorBuckets": 54,
        "checkedAt": "2026-08-31T23:36:57.873Z",
        "foregroundBounds": {
          "x": 101,
          "y": 172,
          "width": 500,
          "height": 226
        }
      }
    },
  },
  "pulseRifle": {
    type: "model",
    format: "glb",
    url: "/examples/neon-corridor-strike/public/aura-assets/pulseRifle.51157ad6.glb",
    hash: "sha256-51157ad6e001d8a53c14c76b731634b6db58c2410492277aef2fb379bb74fe00",
    bounds: [
      1.637,
      3.588,
      14.312
    ],
    sizeBytes: 9047868,
    metadata: {
      "materials": [
        "HandleFabric",
        "DirtyMetal2",
        "OrangeParts",
        "Metal2",
        "MainPlasticPart",
        "OrangePartsTextured",
        "DarkerPlastic",
        "Screen2",
        "DirtyMetal",
        "Screen",
        "DarkerPlasticInside",
        "Emitter",
        "GreenCable",
        "BlueCable2"
      ],
      "animations": [
        "Action",
        "Empty.001Action"
      ],
      "animationClips": [
        "Action",
        "Empty.001Action"
      ],
      "animationMetadata": {
        "clipCount": 2,
        "clips": [
          {
            "index": 0,
            "name": "Action",
            "channelCount": 1,
            "samplerCount": 1,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "Empty.001_23"
            ]
          },
          {
            "index": 1,
            "name": "Empty.001Action",
            "channelCount": 1,
            "samplerCount": 1,
            "targetPaths": [
              "rotation"
            ],
            "targetNodes": [
              "Empty.001_23"
            ]
          }
        ],
        "messages": [
          "Detected 2 embedded animation clips."
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
        "nodeCount": 52,
        "meshCount": 25,
        "materialCount": 14,
        "textureCount": 17,
        "animationClipCount": 2,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Sketchfab_model"
        ],
        "maxDepth": 5,
        "messages": [
          "Detected 52 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pulseRifle.51157ad6.glb",
        "sourcePage": "https://sketchfab.com/3d-models/sci-fi-weapon-gameready-gun-rifle-eca46c628f49410081eb73391c62b4ca",
        "downloadUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-131/eca46c628f49410081eb73391c62b4ca.glb",
        "sourceUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-131/eca46c628f49410081eb73391c62b4ca.glb",
        "license": "CC-BY-4.0",
        "licenseName": "Creative Commons Attribution 4.0 International",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "licenseRaw": "CC-BY-4.0",
        "author": "gbarzu",
        "sourceFamily": "sketchfab-via-objaverse",
        "attribution": "gbarzu",
        "sha256": "sha256-51157ad6e001d8a53c14c76b731634b6db58c2410492277aef2fb379bb74fe00",
        "retrievedAt": "2026-08-17T02:25:36.704Z",
        "resolveCandidate": {
          "catalogId": "objaverse:eca46c628f49410081eb73391c62b4ca",
          "query": "fps sci-fi gun weapon game ready",
          "source": "objaverse",
          "sourceFamily": "objaverse",
          "scoreTotal": 0,
          "scoreBreakdown": {
            "semantic": 14.89,
            "sourceQuality": 14,
            "license": 13,
            "inspection": 0,
            "roleFit": 0
          },
          "reasons": [
            "semantic/source score 14.89",
            "download URL preserved",
            "author/attribution preserved",
            "verified CC-BY-4.0 license"
          ],
          "penalties": [
            "missing source page",
            "missing license URL/source evidence",
            "missing bounds/dimensions metadata",
            "missing material metadata for visual model role",
            "missing texture metadata for visual model role"
          ],
          "downloadUrl": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-131/eca46c628f49410081eb73391c62b4ca.glb",
          "license": "CC-BY-4.0",
          "licenseName": "CC-BY-4.0",
          "licenseRaw": "CC-BY-4.0",
          "author": "gbarzu",
          "attribution": "gbarzu",
          "semanticScore": 0.80859049463464,
          "postDownloadInspection": {
            "bounds": [
              1.637,
              3.588,
              14.312
            ],
            "materialCount": 14,
            "textureCount": 17,
            "animationClipCount": 2,
            "skinCount": 0,
            "morphTargetCount": 0,
            "warnings": [
              "orientation metadata missing; facing direction cannot be validated until GLTF extras declare aura3d.orientation.forwardAxis"
            ]
          },
          "rawCatalogMetadata": {
            "id": "objaverse:eca46c628f49410081eb73391c62b4ca",
            "title": "Sci Fi Weapon. Gameready Gun / Rifle.",
            "source": "objaverse",
            "url": "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-131/eca46c628f49410081eb73391c62b4ca.glb",
            "license": "CC-BY-4.0",
            "thumbnail": "https://media.sketchfab.com/models/eca46c628f49410081eb73391c62b4ca/thumbnails/b8e64557ab534c33982118b50995c00d/5926ce2934a74f4f8c6df9a027948db2.jpeg",
            "attribution": "gbarzu",
            "score": 0.80859049463464
          }
        },
        "checkedAt": "2026-08-17T02:25:36.704Z"
      },
      "sourcePath": "public/aura-assets/pulseRifle.51157ad6.glb",
      "outputPath": "public/aura-assets/pulseRifle.51157ad6.glb",
      "license": "CC-BY-4.0",
      "author": "gbarzu",
      "boundsMetadata": {
        "min": [
          -0.836,
          -2.26,
          -6.269
        ],
        "max": [
          0.801,
          1.329,
          8.043
        ],
        "size": [
          1.637,
          3.588,
          14.312
        ],
        "center": [
          -0.017,
          -0.465,
          0.887
        ],
        "maxDimension": 14.312,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "HandleFabric",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "DirtyMetal2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "OrangeParts",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Metal2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "MainPlasticPart",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "OrangePartsTextured",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "DarkerPlastic",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Screen2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "DirtyMetal",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Screen",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "DarkerPlasticInside",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "Emitter",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "GreenCable",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "BlueCable2",
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
        "view": "hash-bound-route-facing-view",
        "assetHash": "sha256-51157ad6e001d8a53c14c76b731634b6db58c2410492277aef2fb379bb74fe00",
        "generatedBy": "tests/browser/neon-corridor-release-asset-probes.spec.ts",
        "checkedAt": "2026-08-30T16:13:11.073Z",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=pulseRifle",
        "renderedProbe": {
          "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/pulseRifle.png",
          "sha256": "sha256-759e3d3e12eaf234348df5c6168271b51c514e7c37e65f1e4b9914cd82c27cce",
          "assetHash": "sha256-51157ad6e001d8a53c14c76b731634b6db58c2410492277aef2fb379bb74fe00",
          "checkedAt": "2026-08-30T16:13:11.073Z",
          "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=pulseRifle"
        },
        "messages": [
          "The current hash-bound isolated root probe was reviewed +Y-up with the authored route-facing direction along +Z. It proves only static presentation; movement, aiming, hits, and damage remain route-local."
        ]
      },
      "nodeNames": [
        "Sketchfab_model",
        "root",
        "GLTF_SceneRootNode",
        "Cylinder.004_0",
        "Object_4",
        "Cylinder.009_1",
        "Object_6",
        "Object_7",
        "Cube.006_2",
        "Object_9",
        "Cylinder.014_3",
        "Object_11",
        "Cylinder.021_4",
        "Object_13",
        "Cube.019_5",
        "Object_15",
        "Cube.020_6",
        "Object_17",
        "Object_18",
        "Cube.024_7",
        "Object_20",
        "Cube.028_8",
        "Object_22",
        "Cube.031_9",
        "Object_24",
        "Cube.033_10",
        "Object_26",
        "Cylinder.025_12",
        "Object_28",
        "Cube.038_14",
        "Object_30",
        "Cylinder_15",
        "Object_32",
        "Cylinder.006_16",
        "Object_34",
        "Cylinder.012_17",
        "Object_36",
        "Cylinder.015_18",
        "Object_38",
        "Cube.013_19",
        "Object_40",
        "Cube.027_20",
        "Object_42",
        "Cube.036_21",
        "Object_44",
        "Cylinder.019_22",
        "Object_46",
        "Empty.001_23",
        "BezierCurve.002_24",
        "Object_49",
        "BezierCurve.003_25",
        "Object_51"
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
        "image-8",
        "image-9",
        "image-10",
        "image-11",
        "image-12",
        "image-13",
        "image-14",
        "image-15",
        "image-16"
      ],
      "dependencies": [],
      "thumbnailUrl": "/examples/neon-corridor-strike/public/aura-assets/pulseRifle.thumb.svg",
      "quality": "release",
      "role": "weapon",
      "suitabilityReason": "Textured CC-BY science-fiction rifle used as the readable first-person viewmodel with a hash-bound isolated orientation probe; aim, recoil, firing, hitscan, reload, and ammo remain route-local.",
      "renderedProbe": {
        "url": "../../tests/reports/neon-corridor-strike/release-asset-probes/pulseRifle.png",
        "kind": "browser-screenshot",
        "renderer": "createAuraApp @aura3d/engine production-runtime",
        "route": "tests/browser/neon-corridor-release-asset-probe-harness?asset=pulseRifle",
        "sha256": "sha256-759e3d3e12eaf234348df5c6168271b51c514e7c37e65f1e4b9914cd82c27cce",
        "assetHash": "sha256-51157ad6e001d8a53c14c76b731634b6db58c2410492277aef2fb379bb74fe00",
        "width": 800,
        "height": 600,
        "nonBlankPixels": 479979,
        "colorBuckets": 56,
        "checkedAt": "2026-08-30T16:13:11.073Z",
        "foregroundBounds": {
          "x": 75,
          "y": 267,
          "width": 584,
          "height": 144
        }
      }
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
