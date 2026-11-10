import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "ruins": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "ruins": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ruins.a92e9320.glb",
    hash: "sha256-a92e93205f804b39d25e3c337afcfb189c8239f4c87dc5b49490638800054d26",
    integrity: {
      "version": 1,
      "digest": "sha256-a92e93205f804b39d25e3c337afcfb189c8239f4c87dc5b49490638800054d26"
    },
    bounds: [
      120,
      6.891,
      120
    ],
    sizeBytes: 452088,
    metadata: {
      "materials": [
        "ground",
        "stone_dark",
        "stone",
        "rune_metal",
        "rune_glow",
        "moss"
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
        "nodeCount": 115,
        "meshCount": 107,
        "materialCount": 6,
        "textureCount": 2,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "ground",
          "step_outer",
          "platform",
          "dais_inlay",
          "portal_ring",
          "pedestal",
          "buttress_l",
          "buttress_r",
          "pillar_0",
          "pillar_1",
          "fallen_drum_1",
          "pillar_2",
          "fallen_drum_2",
          "pillar_3",
          "pillar_4",
          "fallen_drum_4",
          "pillar_5",
          "fallen_drum_5",
          "fallen_lintel",
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
          "rubble_25"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 115 nodes across 45 roots."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/ruins.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/ruins.bridge.json"
        ],
        "checkedAt": "2026-11-10T07:56:20.158Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/ruins.glb",
      "outputPath": "public/aura-assets/ruins.a92e9320.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -60,
          -0.546,
          -60
        ],
        "max": [
          60,
          6.345,
          60
        ],
        "size": [
          120,
          6.891,
          120
        ],
        "center": [
          0,
          2.9,
          0
        ],
        "maxDimension": 120,
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
          "name": "stone_dark",
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
          "name": "rune_metal",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "rune_glow",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "moss",
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
        "step_outer",
        "platform",
        "dais_inlay",
        "portal_ring",
        "portal_ring__ring_block_0",
        "portal_ring__rune_0",
        "portal_ring__ring_block_1",
        "portal_ring__rune_1",
        "portal_ring__ring_block_2",
        "portal_ring__rune_2",
        "portal_ring__ring_block_3",
        "portal_ring__rune_3",
        "portal_ring__ring_block_4",
        "portal_ring__rune_4",
        "portal_ring__ring_block_5",
        "portal_ring__rune_5",
        "portal_ring__ring_block_6",
        "portal_ring__rune_6",
        "portal_ring__ring_block_7",
        "portal_ring__rune_7",
        "portal_ring__ring_block_8",
        "portal_ring__rune_8",
        "portal_ring__moss_8",
        "portal_ring__ring_block_9",
        "portal_ring__rune_9",
        "portal_ring__ring_block_10",
        "portal_ring__rune_10",
        "portal_ring__moss_10",
        "portal_ring__ring_block_11",
        "portal_ring__rune_11",
        "portal_ring__ring_block_12",
        "portal_ring__rune_12",
        "portal_ring__moss_12",
        "portal_ring__ring_block_13",
        "portal_ring__rune_13",
        "portal_ring__inner_lip",
        "portal_ring__outer_collar",
        "portal_ring__outer_collar_back",
        "pedestal",
        "buttress_l",
        "buttress_r",
        "pillar_0",
        "pillar_0__plinth",
        "pillar_0__shaft",
        "pillar_0__band_0",
        "pillar_0__band_1",
        "pillar_0__band_2",
        "pillar_0__capital",
        "pillar_1",
        "pillar_1__plinth",
        "pillar_1__shaft",
        "pillar_1__band_0",
        "pillar_1__band_1",
        "pillar_1__band_2",
        "pillar_1__chip",
        "fallen_drum_1",
        "pillar_2",
        "pillar_2__plinth",
        "pillar_2__shaft",
        "pillar_2__band_0",
        "pillar_2__band_1",
        "pillar_2__band_2",
        "pillar_2__chip",
        "fallen_drum_2",
        "pillar_3",
        "pillar_3__plinth",
        "pillar_3__shaft",
        "pillar_3__band_0",
        "pillar_3__band_1",
        "pillar_3__band_2",
        "pillar_3__capital",
        "pillar_4",
        "pillar_4__plinth",
        "pillar_4__shaft",
        "pillar_4__band_0",
        "pillar_4__band_1",
        "pillar_4__band_2",
        "pillar_4__chip",
        "fallen_drum_4",
        "pillar_5",
        "pillar_5__plinth",
        "pillar_5__shaft",
        "pillar_5__band_0",
        "pillar_5__band_1",
        "pillar_5__band_2",
        "pillar_5__chip",
        "fallen_drum_5",
        "fallen_lintel",
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
        "rubble_25"
      ],
      "textures": [
        "image-0",
        "image-1"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ruins.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/ruins.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
