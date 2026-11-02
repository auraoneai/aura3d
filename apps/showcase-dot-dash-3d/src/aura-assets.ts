import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "dotdashCourierPod": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "dotdashSentryBeetle": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "dotdashSentrySpider": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "dotdashCourierPod": {
    type: "model",
    format: "glb",
    url: "/aura-assets/dotdashCourierPod.ba46ab62.glb",
    hash: "sha256-ba46ab6233165c24c31a0c8e07edbfbfe48d0a5c29bf20f75256b1b957baea9d",
    bounds: [
      1.323,
      1.901,
      0.757
    ],
    sizeBytes: 1027696,
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
        "sourcePath": "public/aura-assets/dotdashCourierPod.ba46ab62.glb",
        "license": "LicenseRef-Meshy-Generated",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-30 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, dot-dash-3d/dotdashCourierPod, task 01a18c0b-0637-7752-8b7b-b16088c69507). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed. Simplified 27550 -> 10468 triangles (meshoptimizer, PRD D7 hero budget 2k-12k); textures unchanged.",
        "author": "Meshy AI (AuraOne account)",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-30T09:02:38Z",
        "evidence": [
          "aura-evidence/meshy/dotdashCourierPod.rights.json",
          "aura-evidence/meshy/dotdashCourierPod.meta.json"
        ],
        "checkedAt": "2026-10-30T09:02:38Z"
      },
      "sourcePath": "public/aura-assets/dotdashCourierPod.ba46ab62.glb",
      "outputPath": "public/aura-assets/dotdashCourierPod.ba46ab62.glb",
      "license": "LicenseRef-Meshy-Generated",
      "author": "Meshy AI (AuraOne account)",
      "boundsMetadata": {
        "min": [
          -0.66,
          -0.951,
          -0.38
        ],
        "max": [
          0.664,
          0.95,
          0.378
        ],
        "size": [
          1.323,
          1.901,
          0.757
        ],
        "center": [
          0.002,
          0,
          -0.001
        ],
        "maxDimension": 1.901,
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
  "dotdashSentryBeetle": {
    type: "model",
    format: "glb",
    url: "/aura-assets/dotdashSentryBeetle.8184c8ca.glb",
    hash: "sha256-8184c8caba58d800a4c1fb0ba38fc174bfcb6f98451247860f3193d97628432a",
    bounds: [
      1.61,
      1.459,
      1.899
    ],
    sizeBytes: 863404,
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
        "sourcePath": "public/aura-assets/dotdashSentryBeetle.8184c8ca.glb",
        "license": "LicenseRef-Meshy-Generated",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-01 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, dot-dash-3d/dotdashSentryBeetle, task 01a19910-dfa1-7200-81d1-1f33382daa77). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed. Simplified 17574 -> 7600 triangles (meshoptimizer, error 2% of extent; art direction enemy budget 2k-8k, PRD D7); textures unchanged.",
        "author": "Meshy AI (AuraOne account)",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-01T21:43:54Z",
        "evidence": [
          "aura-evidence/meshy/dotdashSentryBeetle.rights.json",
          "aura-evidence/meshy/dotdashSentryBeetle.meta.json"
        ],
        "checkedAt": "2026-11-01T21:43:54Z"
      },
      "sourcePath": "public/aura-assets/dotdashSentryBeetle.8184c8ca.glb",
      "outputPath": "public/aura-assets/dotdashSentryBeetle.8184c8ca.glb",
      "license": "LicenseRef-Meshy-Generated",
      "author": "Meshy AI (AuraOne account)",
      "boundsMetadata": {
        "min": [
          -0.808,
          -0.73,
          -0.95
        ],
        "max": [
          0.802,
          0.729,
          0.95
        ],
        "size": [
          1.61,
          1.459,
          1.899
        ],
        "center": [
          -0.003,
          0,
          0
        ],
        "maxDimension": 1.899,
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
      "quality": "candidate",
      "role": "enemy",
      "suitabilityReason": "Glint Courier sentry body, Hunter (blitz), DD47-A2, presentation only"
    },
  },
  "dotdashSentrySpider": {
    type: "model",
    format: "glb",
    url: "/aura-assets/dotdashSentrySpider.91029615.glb",
    hash: "sha256-91029615ee437c5752801a6fa0ee8450128220832692acbb33e9dcebc5ec539b",
    bounds: [
      1.887,
      1.229,
      1.523
    ],
    sizeBytes: 989164,
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
        "sourcePath": "public/aura-assets/dotdashSentrySpider.91029615.glb",
        "license": "LicenseRef-Meshy-Generated",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-01 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, dot-dash-3d/dotdashSentrySpider, task 01a19917-d78b-713c-8150-215311aa7195). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed. Simplified 25396 -> 7600 triangles (meshoptimizer, error 2% of extent; art direction enemy budget 2k-8k, PRD D7); textures unchanged.",
        "author": "Meshy AI (AuraOne account)",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-01T21:51:45Z",
        "evidence": [
          "aura-evidence/meshy/dotdashSentrySpider.rights.json",
          "aura-evidence/meshy/dotdashSentrySpider.meta.json"
        ],
        "checkedAt": "2026-11-01T21:51:45Z"
      },
      "sourcePath": "public/aura-assets/dotdashSentrySpider.91029615.glb",
      "outputPath": "public/aura-assets/dotdashSentrySpider.91029615.glb",
      "license": "LicenseRef-Meshy-Generated",
      "author": "Meshy AI (AuraOne account)",
      "boundsMetadata": {
        "min": [
          -0.948,
          -0.618,
          -0.75
        ],
        "max": [
          0.939,
          0.611,
          0.773
        ],
        "size": [
          1.887,
          1.229,
          1.523
        ],
        "center": [
          -0.005,
          -0.003,
          0.011
        ],
        "maxDimension": 1.887,
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
      "quality": "candidate",
      "role": "enemy",
      "suitabilityReason": "Glint Courier sentry body, Skittish (dim), DD47-A2, presentation only"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
