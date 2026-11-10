import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "portal": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "portal": {
    type: "model",
    format: "glb",
    url: "/aura-assets/portal.bcd42a43.glb",
    hash: "sha256-bcd42a43a3e6d8e271adfa5ca1a47192bed1365c751a870edc0219b4e4e67e23",
    integrity: {
      "version": 1,
      "digest": "sha256-bcd42a43a3e6d8e271adfa5ca1a47192bed1365c751a870edc0219b4e4e67e23"
    },
    bounds: [
      80,
      6.433,
      80
    ],
    sizeBytes: 463272,
    metadata: {
      "materials": [
        "ground",
        "platform",
        "rune_violet",
        "rune_cyan",
        "stone",
        "stone_dark",
        "stone_moss",
        "runic_metal"
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
        "nodeCount": 131,
        "meshCount": 124,
        "materialCount": 8,
        "textureCount": 1,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "ground",
          "platform_base",
          "platform_top",
          "platform_ring_outer",
          "platform_ring_inner",
          "platform_tick_0",
          "platform_tick_1",
          "platform_tick_2",
          "platform_tick_3",
          "platform_tick_4",
          "platform_tick_5",
          "platform_tick_6",
          "platform_tick_7",
          "platform_tick_8",
          "platform_tick_9",
          "platform_tick_10",
          "platform_tick_11",
          "platform_tick_12",
          "platform_tick_13",
          "platform_tick_14",
          "platform_tick_15",
          "platform_tick_16",
          "platform_tick_17",
          "platform_tick_18",
          "platform_tick_19",
          "platform_tick_20",
          "platform_tick_21",
          "platform_tick_22",
          "platform_tick_23",
          "step_1",
          "step_2",
          "ring",
          "ring_footing",
          "pillar_0",
          "pillar_1",
          "pillar_2",
          "pillar_3",
          "pillar_4",
          "pillar_5",
          "fallen_0",
          "fallen_1",
          "fallen_2",
          "rubble_0",
          "rubble_1",
          "rubble_2",
          "rubble_3",
          "rubble_4",
          "rubble_5",
          "rubble_6",
          "rubble_7",
          "rubble_8",
          "rubble_9",
          "rubble_10",
          "rubble_11",
          "rubble_12",
          "rubble_13",
          "rubble_14",
          "rubble_15",
          "rubble_16",
          "rubble_17",
          "rubble_18",
          "rubble_19",
          "rubble_20",
          "rubble_21",
          "rubble_22",
          "rubble_23",
          "rubble_24",
          "rubble_25",
          "wall_0",
          "wall_1",
          "wall_2",
          "wall_3",
          "wall_4",
          "wall_5"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 131 nodes across 74 roots."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/portal.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/portal.bridge.json"
        ],
        "checkedAt": "2026-11-10T07:36:01.763Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/portal.glb",
      "outputPath": "public/aura-assets/portal.bcd42a43.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -40,
          -0.433,
          -40
        ],
        "max": [
          40,
          6,
          40
        ],
        "size": [
          80,
          6.433,
          80
        ],
        "center": [
          0,
          2.784,
          0
        ],
        "maxDimension": 80,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "ground",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "platform",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "rune_violet",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "rune_cyan",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "stone",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "stone_dark",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "stone_moss",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "runic_metal",
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
        "ground",
        "platform_base",
        "platform_top",
        "platform_ring_outer",
        "platform_ring_inner",
        "platform_tick_0",
        "platform_tick_1",
        "platform_tick_2",
        "platform_tick_3",
        "platform_tick_4",
        "platform_tick_5",
        "platform_tick_6",
        "platform_tick_7",
        "platform_tick_8",
        "platform_tick_9",
        "platform_tick_10",
        "platform_tick_11",
        "platform_tick_12",
        "platform_tick_13",
        "platform_tick_14",
        "platform_tick_15",
        "platform_tick_16",
        "platform_tick_17",
        "platform_tick_18",
        "platform_tick_19",
        "platform_tick_20",
        "platform_tick_21",
        "platform_tick_22",
        "platform_tick_23",
        "step_1",
        "step_2",
        "ring",
        "ring__ring_block_0",
        "ring__ring_rune_0",
        "ring__ring_block_1",
        "ring__ring_rune_1",
        "ring__ring_block_2",
        "ring__ring_rune_2",
        "ring__ring_block_3",
        "ring__ring_rune_3",
        "ring__ring_block_4",
        "ring__ring_rune_4",
        "ring__ring_block_5",
        "ring__ring_rune_5",
        "ring__ring_block_6",
        "ring__ring_rune_6",
        "ring__ring_block_7",
        "ring__ring_rune_7",
        "ring__ring_block_8",
        "ring__ring_rune_8",
        "ring__ring_block_9",
        "ring__ring_rune_9",
        "ring__ring_block_10",
        "ring__ring_rune_10",
        "ring__ring_block_11",
        "ring__ring_rune_11",
        "ring__ring_block_12",
        "ring__ring_rune_12",
        "ring__ring_block_13",
        "ring__ring_rune_13",
        "ring__ring_block_14",
        "ring__ring_rune_14",
        "ring__ring_block_15",
        "ring__ring_rune_15",
        "ring__ring_block_16",
        "ring__ring_rune_16",
        "ring__ring_block_17",
        "ring__ring_rune_17",
        "ring__ring_lip",
        "ring__ring_edge",
        "ring__keystone",
        "ring_footing",
        "pillar_0",
        "pillar_0__pillar_0_base",
        "pillar_0__pillar_0_shaft",
        "pillar_0__pillar_0_cap",
        "pillar_1",
        "pillar_1__pillar_1_base",
        "pillar_1__pillar_1_shaft",
        "pillar_1__pillar_1_chunk",
        "pillar_2",
        "pillar_2__pillar_2_base",
        "pillar_2__pillar_2_shaft",
        "pillar_2__pillar_2_chunk",
        "pillar_3",
        "pillar_3__pillar_3_base",
        "pillar_3__pillar_3_shaft",
        "pillar_3__pillar_3_cap",
        "pillar_4",
        "pillar_4__pillar_4_base",
        "pillar_4__pillar_4_shaft",
        "pillar_4__pillar_4_chunk",
        "pillar_5",
        "pillar_5__pillar_5_base",
        "pillar_5__pillar_5_shaft",
        "pillar_5__pillar_5_cap",
        "fallen_0",
        "fallen_1",
        "fallen_2",
        "rubble_0",
        "rubble_1",
        "rubble_2",
        "rubble_3",
        "rubble_4",
        "rubble_5",
        "rubble_6",
        "rubble_7",
        "rubble_8",
        "rubble_9",
        "rubble_10",
        "rubble_11",
        "rubble_12",
        "rubble_13",
        "rubble_14",
        "rubble_15",
        "rubble_16",
        "rubble_17",
        "rubble_18",
        "rubble_19",
        "rubble_20",
        "rubble_21",
        "rubble_22",
        "rubble_23",
        "rubble_24",
        "rubble_25",
        "wall_0",
        "wall_1",
        "wall_2",
        "wall_3",
        "wall_4",
        "wall_5"
      ],
      "textures": [
        "image-0"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/portal.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/portal.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
