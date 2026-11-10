import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "showroom": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "showroom": {
    type: "model",
    format: "glb",
    url: "/aura-assets/showroom.d02f3b87.glb",
    hash: "sha256-d02f3b87486647a3c561ddd9b83a7407a4136a058b4add8381958856187a01eb",
    integrity: {
      "version": 1,
      "digest": "sha256-d02f3b87486647a3c561ddd9b83a7407a4136a058b4add8381958856187a01eb"
    },
    bounds: [
      7.29,
      2.8,
      7.29
    ],
    sizeBytes: 1515824,
    metadata: {
      "materials": [
        "paint",
        "glass",
        "chrome",
        "rubber",
        "rim",
        "floor",
        "platformEdge",
        "ringLight"
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
        "nodeCount": 51,
        "meshCount": 48,
        "materialCount": 8,
        "textureCount": 1,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "turntable"
        ],
        "maxDepth": 3,
        "messages": [
          "Detected 51 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/showroom.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/showroom.bridge.json"
        ],
        "checkedAt": "2026-11-10T07:28:39.211Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/showroom.glb",
      "outputPath": "public/aura-assets/showroom.d02f3b87.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -3.645,
          -1.4,
          -3.645
        ],
        "max": [
          3.645,
          1.4,
          3.645
        ],
        "size": [
          7.29,
          2.8,
          7.29
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 7.29,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "paint",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "glass",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "chrome",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "rubber",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "rim",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "floor",
          "visible": true,
          "readable": true,
          "opacity": 0.8,
          "alphaMode": "BLEND",
          "reasons": []
        },
        {
          "name": "platformEdge",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        },
        {
          "name": "ringLight",
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
        "turntable",
        "turntable__car",
        "turntable__car__body",
        "turntable__car__cabin",
        "turntable__car__glass",
        "turntable__car__beltTrim",
        "turntable__car__bumperFront",
        "turntable__car__bumperRear",
        "turntable__car__tire_fr",
        "turntable__car__hub_fr",
        "turntable__car__rimRing_fr",
        "turntable__car__cap_fr",
        "turntable__car__tire_fl",
        "turntable__car__hub_fl",
        "turntable__car__rimRing_fl",
        "turntable__car__cap_fl",
        "turntable__car__tire_rr",
        "turntable__car__hub_rr",
        "turntable__car__rimRing_rr",
        "turntable__car__cap_rr",
        "turntable__car__tire_rl",
        "turntable__car__hub_rl",
        "turntable__car__rimRing_rl",
        "turntable__car__cap_rl",
        "turntable__reflection",
        "turntable__reflection__mirror_body",
        "turntable__reflection__mirror_cabin",
        "turntable__reflection__mirror_glass",
        "turntable__reflection__mirror_beltTrim",
        "turntable__reflection__mirror_bumperFront",
        "turntable__reflection__mirror_bumperRear",
        "turntable__reflection__mirror_tire_fr",
        "turntable__reflection__mirror_hub_fr",
        "turntable__reflection__mirror_rimRing_fr",
        "turntable__reflection__mirror_cap_fr",
        "turntable__reflection__mirror_tire_fl",
        "turntable__reflection__mirror_hub_fl",
        "turntable__reflection__mirror_rimRing_fl",
        "turntable__reflection__mirror_cap_fl",
        "turntable__reflection__mirror_tire_rr",
        "turntable__reflection__mirror_hub_rr",
        "turntable__reflection__mirror_rimRing_rr",
        "turntable__reflection__mirror_cap_rr",
        "turntable__reflection__mirror_tire_rl",
        "turntable__reflection__mirror_hub_rl",
        "turntable__reflection__mirror_rimRing_rl",
        "turntable__reflection__mirror_cap_rl",
        "turntable__floorDisc",
        "turntable__platformWall",
        "turntable__platformLip",
        "turntable__ringLight"
      ],
      "textures": [
        "image-0"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/showroom.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/showroom.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
