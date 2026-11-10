import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "ruin": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "ruin": {
    type: "model",
    format: "glb",
    url: "/aura-assets/ruin.ca0c5713.glb",
    hash: "sha256-ca0c5713400e52d88984957299d47de44a2ba6e1b49d1b76d4602aa7df3babfc",
    integrity: {
      "version": 1,
      "digest": "sha256-ca0c5713400e52d88984957299d47de44a2ba6e1b49d1b76d4602aa7df3babfc"
    },
    bounds: [
      52,
      7.223,
      52
    ],
    sizeBytes: 310976,
    metadata: {
      "materials": [
        "stone_dark",
        "stone",
        "moss",
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
        "nodeCount": 67,
        "meshCount": 61,
        "materialCount": 4,
        "textureCount": 1,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "ground",
          "platform_low",
          "platform_high",
          "moss_0",
          "moss_1",
          "moss_2",
          "moss_3",
          "moss_4",
          "moss_5",
          "moss_6",
          "portal_frame",
          "plinth",
          "support_l",
          "support_r",
          "pillar_a",
          "pillar_b",
          "pillar_c",
          "pillar_d",
          "pillar_e",
          "rubble_0",
          "rubble_1",
          "rubble_2",
          "rubble_3",
          "rubble_4",
          "rubble_5",
          "rubble_6",
          "rubble_7",
          "fallen_drum_a",
          "fallen_drum_b",
          "step_1",
          "step_2"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 67 nodes across 31 roots."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/ruin.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/ruin.bridge.json"
        ],
        "checkedAt": "2026-11-10T07:38:40.751Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/ruin.glb",
      "outputPath": "public/aura-assets/ruin.ca0c5713.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -26,
          -0.443,
          -26
        ],
        "max": [
          26,
          6.78,
          26
        ],
        "size": [
          52,
          7.223,
          52
        ],
        "center": [
          0,
          3.169,
          0
        ],
        "maxDimension": 52,
        "grounded": false
      },
      "materialMetadata": [
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
          "name": "moss",
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
        "platform_low",
        "platform_high",
        "moss_0",
        "moss_1",
        "moss_2",
        "moss_3",
        "moss_4",
        "moss_5",
        "moss_6",
        "portal_frame",
        "portal_frame__inner_band",
        "portal_frame__block_0",
        "portal_frame__block_1",
        "portal_frame__block_2",
        "portal_frame__block_3",
        "portal_frame__block_4",
        "portal_frame__block_5",
        "portal_frame__block_6",
        "portal_frame__block_7",
        "portal_frame__block_8",
        "portal_frame__block_9",
        "portal_frame__block_10",
        "portal_frame__block_11",
        "portal_frame__block_12",
        "portal_frame__block_13",
        "portal_frame__block_14",
        "portal_frame__block_15",
        "portal_frame__outer_band",
        "portal_frame__outer_band_back",
        "plinth",
        "support_l",
        "support_r",
        "pillar_a",
        "pillar_a__pillar_a_base",
        "pillar_a__pillar_a_shaft",
        "pillar_a__pillar_a_ring",
        "pillar_a__pillar_a_cap",
        "pillar_b",
        "pillar_b__pillar_b_base",
        "pillar_b__pillar_b_shaft",
        "pillar_b__pillar_b_ring",
        "pillar_c",
        "pillar_c__pillar_c_base",
        "pillar_c__pillar_c_shaft",
        "pillar_c__pillar_c_ring",
        "pillar_d",
        "pillar_d__pillar_d_base",
        "pillar_d__pillar_d_shaft",
        "pillar_d__pillar_d_ring",
        "pillar_d__pillar_d_cap",
        "pillar_e",
        "pillar_e__pillar_e_base",
        "pillar_e__pillar_e_shaft",
        "pillar_e__pillar_e_ring",
        "rubble_0",
        "rubble_1",
        "rubble_2",
        "rubble_3",
        "rubble_4",
        "rubble_5",
        "rubble_6",
        "rubble_7",
        "fallen_drum_a",
        "fallen_drum_b",
        "step_1",
        "step_2"
      ],
      "textures": [
        "image-0"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/ruin.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/ruin.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
