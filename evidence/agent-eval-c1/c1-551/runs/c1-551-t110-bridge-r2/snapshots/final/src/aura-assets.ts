import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "clockcase": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "clockcase": {
    type: "model",
    format: "glb",
    url: "/aura-assets/clockcase.1d3f1d41.glb",
    hash: "sha256-1d3f1d41ac419dfa34dc826a06217d24e6b7f37fc2dc85a9cde4614e5457a661",
    integrity: {
      "version": 1,
      "digest": "sha256-1d3f1d41ac419dfa34dc826a06217d24e6b7f37fc2dc85a9cde4614e5457a661"
    },
    bounds: [
      14,
      8,
      9
    ],
    sizeBytes: 112004,
    metadata: {
      "materials": [
        "clockcase_meshstandard_0",
        "clockcase_meshstandard_1",
        "clockcase_meshstandard_2",
        "clockcase_meshstandard_3",
        "clockcase_meshstandard_4",
        "clockcase_meshstandard_5",
        "clockcase_meshstandard_6",
        "clockcase_meshstandard_7",
        "clockcase_meshstandard_8",
        "clockcase_meshstandard_9"
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
        "nodeCount": 35,
        "meshCount": 32,
        "materialCount": 10,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "room",
          "clock"
        ],
        "maxDepth": 3,
        "messages": [
          "Detected 35 nodes across 2 roots."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/clockcase.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/clockcase.bridge.json"
        ],
        "checkedAt": "2026-11-10T07:55:26.163Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/clockcase.glb",
      "outputPath": "public/aura-assets/clockcase.1d3f1d41.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -7,
          -0.4,
          -1
        ],
        "max": [
          7,
          7.6,
          8
        ],
        "size": [
          14,
          8,
          9
        ],
        "center": [
          0,
          3.6,
          3.5
        ],
        "maxDimension": 14,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "clockcase_meshstandard_0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "clockcase_meshstandard_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "clockcase_meshstandard_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "clockcase_meshstandard_3",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "clockcase_meshstandard_4",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "clockcase_meshstandard_5",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "clockcase_meshstandard_6",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "clockcase_meshstandard_7",
          "visible": true,
          "readable": true,
          "opacity": 0.14,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "clockcase_meshstandard_8",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "clockcase_meshstandard_9",
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
        "room",
        "room__wall",
        "room__floor",
        "room__skirting",
        "clock",
        "clock__plinth",
        "clock__trunk_back",
        "clock__trunk_left",
        "clock__trunk_right",
        "clock__post_left",
        "clock__post_right",
        "clock__rail_top",
        "clock__rail_bottom",
        "clock__trim_bottom",
        "clock__glass",
        "clock__hood",
        "clock__hood_base",
        "clock__cornice",
        "clock__crown",
        "clock__dial",
        "clock__dial__dial_disc",
        "clock__dial__bezel",
        "clock__dial__hour_mark_0",
        "clock__dial__hour_mark_1",
        "clock__dial__hour_mark_2",
        "clock__dial__hour_mark_3",
        "clock__dial__hour_mark_4",
        "clock__dial__hour_mark_5",
        "clock__dial__hour_mark_6",
        "clock__dial__hour_mark_7",
        "clock__dial__hour_mark_8",
        "clock__dial__hour_mark_9",
        "clock__dial__hour_mark_10",
        "clock__dial__hour_mark_11",
        "clock__hood_plate"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/clockcase.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/clockcase.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
