import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "dotdashCourierPod": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "dotdashCourierPod": {
    type: "model",
    format: "glb",
    url: "/aura-assets/dotdashCourierPod.8238f297.glb",
    hash: "sha256-8238f2977089aaa8586887e424b939047f942100ba587cbb9c40e0f60b0db903",
    bounds: [
      1.327,
      1.902,
      0.758
    ],
    sizeBytes: 1530004,
    metadata: {
      "materials": [
        "material-0"
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
          "node-0"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/dotdashCourierPod.8238f297.glb",
        "license": "LicenseRef-Meshy-Generated",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-30 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, dot-dash-3d/dotdashCourierPod, task 01a18c0b-0637-7752-8b7b-b16088c69507). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "author": "Meshy AI (AuraOne account)",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-30T09:02:38Z",
        "evidence": [
          "aura-evidence/meshy/dotdashCourierPod.rights.json",
          "aura-evidence/meshy/dotdashCourierPod.meta.json"
        ],
        "checkedAt": "2026-10-30T09:02:38Z"
      },
      "sourcePath": "public/aura-assets/dotdashCourierPod.8238f297.glb",
      "outputPath": "public/aura-assets/dotdashCourierPod.8238f297.glb",
      "license": "LicenseRef-Meshy-Generated",
      "author": "Meshy AI (AuraOne account)",
      "boundsMetadata": {
        "min": [
          -0.664,
          -0.951,
          -0.38
        ],
        "max": [
          0.664,
          0.951,
          0.378
        ],
        "size": [
          1.327,
          1.902,
          0.758
        ],
        "center": [
          0,
          0,
          -0.001
        ],
        "maxDimension": 1.902,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "material-0",
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
        "node-0"
      ],
      "textures": [
        "image-0",
        "image-1",
        "image-2"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/dotdashCourierPod.thumb.svg",
      "quality": "candidate",
      "role": "hero",
      "suitabilityReason": "Glint Courier courier pod (DD47-A1), presentation only"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
