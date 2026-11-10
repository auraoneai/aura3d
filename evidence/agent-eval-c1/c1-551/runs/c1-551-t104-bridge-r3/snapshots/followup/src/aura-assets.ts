import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "stage": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "stage": {
    type: "model",
    format: "glb",
    url: "/aura-assets/stage.c653fa72.glb",
    hash: "sha256-c653fa729d521ddac37be0406aecaebf436b4b6236f455278ac60d0ed5c82ace",
    integrity: {
      "version": 1,
      "digest": "sha256-c653fa729d521ddac37be0406aecaebf436b4b6236f455278ac60d0ed5c82ace"
    },
    bounds: [
      27.996,
      70,
      24.55
    ],
    sizeBytes: 432480,
    metadata: {
      "materials": [
        "plinth",
        "pillar",
        "band"
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
        "nodeCount": 99,
        "meshCount": 92,
        "materialCount": 3,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "plinth",
          "pillar-0",
          "pillar-1",
          "pillar-2",
          "pillar-3",
          "pillar-4",
          "pillar-5",
          "pillar-6"
        ],
        "maxDepth": 2,
        "messages": [
          "Detected 99 nodes across 8 roots."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/stage.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/stage.bridge.json"
        ],
        "checkedAt": "2026-11-10T07:28:21.689Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/stage.glb",
      "outputPath": "public/aura-assets/stage.c653fa72.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -13.998,
          -1.2,
          -18.95
        ],
        "max": [
          13.998,
          68.8,
          5.6
        ],
        "size": [
          27.996,
          70,
          24.55
        ],
        "center": [
          0,
          33.8,
          -6.675
        ],
        "maxDimension": 70,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "plinth",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "pillar",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "band",
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
        "plinth",
        "pillar-0",
        "pillar-0__shaft-0",
        "pillar-0__band-0-0",
        "pillar-0__band-0-1",
        "pillar-0__band-0-2",
        "pillar-0__band-0-3",
        "pillar-0__band-0-4",
        "pillar-0__band-0-5",
        "pillar-0__band-0-6",
        "pillar-0__band-0-7",
        "pillar-0__band-0-8",
        "pillar-0__band-0-9",
        "pillar-0__band-0-10",
        "pillar-0__band-0-11",
        "pillar-1",
        "pillar-1__shaft-1",
        "pillar-1__band-1-0",
        "pillar-1__band-1-1",
        "pillar-1__band-1-2",
        "pillar-1__band-1-3",
        "pillar-1__band-1-4",
        "pillar-1__band-1-5",
        "pillar-1__band-1-6",
        "pillar-1__band-1-7",
        "pillar-1__band-1-8",
        "pillar-1__band-1-9",
        "pillar-1__band-1-10",
        "pillar-1__band-1-11",
        "pillar-2",
        "pillar-2__shaft-2",
        "pillar-2__band-2-0",
        "pillar-2__band-2-1",
        "pillar-2__band-2-2",
        "pillar-2__band-2-3",
        "pillar-2__band-2-4",
        "pillar-2__band-2-5",
        "pillar-2__band-2-6",
        "pillar-2__band-2-7",
        "pillar-2__band-2-8",
        "pillar-2__band-2-9",
        "pillar-2__band-2-10",
        "pillar-2__band-2-11",
        "pillar-3",
        "pillar-3__shaft-3",
        "pillar-3__band-3-0",
        "pillar-3__band-3-1",
        "pillar-3__band-3-2",
        "pillar-3__band-3-3",
        "pillar-3__band-3-4",
        "pillar-3__band-3-5",
        "pillar-3__band-3-6",
        "pillar-3__band-3-7",
        "pillar-3__band-3-8",
        "pillar-3__band-3-9",
        "pillar-3__band-3-10",
        "pillar-3__band-3-11",
        "pillar-4",
        "pillar-4__shaft-4",
        "pillar-4__band-4-0",
        "pillar-4__band-4-1",
        "pillar-4__band-4-2",
        "pillar-4__band-4-3",
        "pillar-4__band-4-4",
        "pillar-4__band-4-5",
        "pillar-4__band-4-6",
        "pillar-4__band-4-7",
        "pillar-4__band-4-8",
        "pillar-4__band-4-9",
        "pillar-4__band-4-10",
        "pillar-4__band-4-11",
        "pillar-5",
        "pillar-5__shaft-5",
        "pillar-5__band-5-0",
        "pillar-5__band-5-1",
        "pillar-5__band-5-2",
        "pillar-5__band-5-3",
        "pillar-5__band-5-4",
        "pillar-5__band-5-5",
        "pillar-5__band-5-6",
        "pillar-5__band-5-7",
        "pillar-5__band-5-8",
        "pillar-5__band-5-9",
        "pillar-5__band-5-10",
        "pillar-5__band-5-11",
        "pillar-6",
        "pillar-6__shaft-6",
        "pillar-6__band-6-0",
        "pillar-6__band-6-1",
        "pillar-6__band-6-2",
        "pillar-6__band-6-3",
        "pillar-6__band-6-4",
        "pillar-6__band-6-5",
        "pillar-6__band-6-6",
        "pillar-6__band-6-7",
        "pillar-6__band-6-8",
        "pillar-6__band-6-9",
        "pillar-6__band-6-10",
        "pillar-6__band-6-11"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/stage.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/stage.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
