import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "clock": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "clock": {
    type: "model",
    format: "glb",
    url: "/aura-assets/clock.ff629880.glb",
    hash: "sha256-ff6298804c2ececaa84e82a636bcdb512cc44a30380b69b8d2ce03255c8cf6bc",
    integrity: {
      "version": 1,
      "digest": "sha256-ff6298804c2ececaa84e82a636bcdb512cc44a30380b69b8d2ce03255c8cf6bc"
    },
    bounds: [
      10,
      6,
      8
    ],
    sizeBytes: 103736,
    metadata: {
      "materials": [
        "floor",
        "wall",
        "dark_wood",
        "wood",
        "interior",
        "glass",
        "brass",
        "face",
        "ink"
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
        "nodeCount": 32,
        "meshCount": 31,
        "materialCount": 9,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "floor_plane",
          "wall_plane",
          "skirting",
          "clock"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 32 nodes across 4 roots."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/clock.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/clock.bridge.json"
        ],
        "checkedAt": "2026-11-10T07:35:11.992Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/clock.glb",
      "outputPath": "public/aura-assets/clock.ff629880.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -5,
          0,
          -2.5
        ],
        "max": [
          5,
          6,
          5.5
        ],
        "size": [
          10,
          6,
          8
        ],
        "center": [
          0,
          3,
          1.5
        ],
        "maxDimension": 10,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "floor",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "wall",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "dark_wood",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "wood",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "interior",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "glass",
          "visible": true,
          "readable": true,
          "opacity": 0.14,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "brass",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "face",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "ink",
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
        "floor_plane",
        "wall_plane",
        "skirting",
        "clock",
        "clock__plinth",
        "clock__plinth_cap",
        "clock__trunk_back",
        "clock__trunk_side_l",
        "clock__trunk_side_r",
        "clock__rail_bottom",
        "clock__rail_top",
        "clock__glass_pane",
        "clock__trim_bottom",
        "clock__trim_top",
        "clock__hood",
        "clock__hood_cornice",
        "clock__hood_crown",
        "clock__finial",
        "clock__bezel",
        "clock__dial",
        "clock__hour_mark_12",
        "clock__hour_mark_1",
        "clock__hour_mark_2",
        "clock__hour_mark_3",
        "clock__hour_mark_4",
        "clock__hour_mark_5",
        "clock__hour_mark_6",
        "clock__hour_mark_7",
        "clock__hour_mark_8",
        "clock__hour_mark_9",
        "clock__hour_mark_10",
        "clock__hour_mark_11"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/clock.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/clock.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
