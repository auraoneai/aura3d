import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "canyon": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "canyon": {
    type: "model",
    format: "glb",
    url: "/aura-assets/canyon.5778997c.glb",
    hash: "sha256-5778997c079391c97e195fc8aed87b485e7c4b4a9c648537b92f453f5ffd027f",
    integrity: {
      "version": 1,
      "digest": "sha256-5778997c079391c97e195fc8aed87b485e7c4b4a9c648537b92f453f5ffd027f"
    },
    bounds: [
      165.528,
      45.723,
      580
    ],
    sizeBytes: 2678520,
    metadata: {
      "materials": [
        "sandstone",
        "boulder_rock_1",
        "dead_wood",
        "boulder_rock_2",
        "boulder_rock_0"
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
        "nodeCount": 129,
        "meshCount": 7,
        "materialCount": 5,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "terrain",
          "props"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 129 nodes across 2 roots."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/canyon.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/canyon.bridge.json"
        ],
        "checkedAt": "2026-11-10T08:07:43.400Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/canyon.glb",
      "outputPath": "public/aura-assets/canyon.5778997c.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -84.677,
          -1.272,
          -540
        ],
        "max": [
          80.85,
          44.451,
          40
        ],
        "size": [
          165.528,
          45.723,
          580
        ],
        "center": [
          -1.913,
          21.59,
          -250
        ],
        "maxDimension": 580,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "sandstone",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "boulder_rock_1",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "dead_wood",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "boulder_rock_2",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "boulder_rock_0",
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
        "terrain",
        "props",
        "props__boulder_0",
        "props__boulder_1",
        "props__boulder_2",
        "props__shrub_3",
        "props__shrub_4",
        "props__shrub_5",
        "props__boulder_6",
        "props__boulder_7",
        "props__boulder_8",
        "props__boulder_9",
        "props__boulder_10",
        "props__boulder_11",
        "props__boulder_12",
        "props__boulder_13",
        "props__boulder_14",
        "props__boulder_15",
        "props__boulder_16",
        "props__boulder_17",
        "props__boulder_18",
        "props__boulder_19",
        "props__boulder_20",
        "props__boulder_21",
        "props__boulder_22",
        "props__boulder_23",
        "props__boulder_24",
        "props__boulder_25",
        "props__boulder_26",
        "props__boulder_27",
        "props__boulder_28",
        "props__boulder_29",
        "props__boulder_30",
        "props__boulder_31",
        "props__shrub_32",
        "props__shrub_33",
        "props__shrub_34",
        "props__shrub_35",
        "props__shrub_36",
        "props__shrub_37",
        "props__shrub_38",
        "props__shrub_39",
        "props__shrub_40",
        "props__shrub_41",
        "props__shrub_42",
        "props__shrub_43",
        "props__shrub_44",
        "props__shrub_45",
        "props__shrub_46",
        "props__shrub_47",
        "props__shrub_48",
        "props__shrub_49",
        "props__shrub_50",
        "props__shrub_51",
        "props__shrub_52",
        "props__shrub_53",
        "props__shrub_54",
        "props__shrub_55",
        "props__shrub_56",
        "props__shrub_57",
        "props__shrub_58",
        "props__shrub_59",
        "props__shrub_60",
        "props__shrub_61",
        "props__boulder_62",
        "props__boulder_63",
        "props__boulder_64",
        "props__boulder_65",
        "props__boulder_66",
        "props__boulder_67",
        "props__boulder_68",
        "props__boulder_69",
        "props__boulder_70",
        "props__boulder_71",
        "props__boulder_72",
        "props__boulder_73",
        "props__boulder_74",
        "props__boulder_75",
        "props__boulder_76",
        "props__boulder_77",
        "props__boulder_78",
        "props__boulder_79",
        "props__boulder_80",
        "props__boulder_81",
        "props__boulder_82",
        "props__boulder_83",
        "props__boulder_84",
        "props__boulder_85",
        "props__boulder_86",
        "props__boulder_87",
        "props__shrub_88",
        "props__shrub_89",
        "props__shrub_90",
        "props__shrub_91",
        "props__shrub_92",
        "props__shrub_93",
        "props__shrub_94",
        "props__shrub_95",
        "props__shrub_96",
        "props__shrub_97",
        "props__shrub_98",
        "props__shrub_99",
        "props__shrub_100",
        "props__shrub_101",
        "props__shrub_102",
        "props__shrub_103",
        "props__shrub_104",
        "props__shrub_105",
        "props__shrub_106",
        "props__shrub_107",
        "props__shrub_108",
        "props__shrub_109",
        "props__shrub_110",
        "props__shrub_111",
        "props__shrub_112",
        "props__shrub_113",
        "props__shrub_114",
        "props__shrub_115",
        "props__shrub_116",
        "props__shrub_117",
        "props__boulder_118",
        "props__boulder_119",
        "props__boulder_120",
        "props__boulder_121",
        "props__shrub_122",
        "props__shrub_123",
        "props__shrub_124",
        "props__shrub_125",
        "props__shrub_126"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/canyon.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/canyon.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
