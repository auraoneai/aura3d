import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "clock": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "clock": {
    type: "model",
    format: "glb",
    url: "/aura-assets/clock.885055db.glb",
    hash: "sha256-885055dbe343f2517d5a8aaefc5fb9b8b054bd25828a5cad3bb0e07c499bc9af",
    integrity: {
      "version": 1,
      "digest": "sha256-885055dbe343f2517d5a8aaefc5fb9b8b054bd25828a5cad3bb0e07c499bc9af"
    },
    bounds: [
      9,
      5.6,
      6.04
    ],
    sizeBytes: 83280,
    metadata: {
      "materials": [
        "clock_meshstandard_0",
        "clock_meshstandard_1",
        "clock_meshstandard_2",
        "clock_meshstandard_3",
        "clock_meshstandard_4",
        "clock_meshstandard_5",
        "clock_meshstandard_6",
        "clock_meshstandard_7",
        "clock_meshstandard_8",
        "clock_meshstandard_9"
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
        "nodeCount": 30,
        "meshCount": 29,
        "materialCount": 10,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "wall",
          "floor",
          "baseboard",
          "clock"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 30 nodes across 4 roots."
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
        "checkedAt": "2026-11-10T07:55:54.694Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/clock.glb",
      "outputPath": "public/aura-assets/clock.885055db.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -4.5,
          -0.2,
          -0.34
        ],
        "max": [
          4.5,
          5.4,
          5.7
        ],
        "size": [
          9,
          5.6,
          6.04
        ],
        "center": [
          0,
          2.6,
          2.68
        ],
        "maxDimension": 9,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "clock_meshstandard_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "clock_meshstandard_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "clock_meshstandard_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "clock_meshstandard_3",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "clock_meshstandard_4",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "clock_meshstandard_5",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "clock_meshstandard_6",
          "visible": true,
          "readable": true,
          "opacity": 0.14,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "clock_meshstandard_7",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "clock_meshstandard_8",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "clock_meshstandard_9",
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
        "wall",
        "floor",
        "baseboard",
        "clock",
        "clock__base",
        "clock__base_top",
        "clock__side_left",
        "clock__side_right",
        "clock__back_panel",
        "clock__rail_top",
        "clock__rail_bottom",
        "clock__glass",
        "clock__hood",
        "clock__cap",
        "clock__pediment",
        "clock__finial",
        "clock__face_rim",
        "clock__face",
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
        "clock__hour_mark_11",
        "clock__hour_mark_12"
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
