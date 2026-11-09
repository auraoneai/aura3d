/**
 * Typed model manifest for the Meshy stage dressing (speaker stacks, DJ turntable), emitted by `aura3d assets typegen`
 * from `aura.assets.json` (the font entry, which the CLI typegen cannot type, stays in `aura-assets.ts`).
 * Scenes use `model(assets.<key>)`; provenance in `public/aura-assets/provenance/`.
 */
import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "bhSpeakerStack": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "bhSpeakerStackB": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "bhTurntable": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "bhSpeakerStack": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bhSpeakerStack.c6feff47.glb",
    hash: "sha256-c6feff475b34d4d5e7e04a4c9e196a7fe20b52a40407c34b4a7fa3bc1d32eda3",
    integrity: {
      "version": 1,
      "digest": "sha256-c6feff475b34d4d5e7e04a4c9e196a7fe20b52a40407c34b4a7fa3bc1d32eda3"
    },
    bounds: [
      0.623,
      1.903,
      0.676
    ],
    sizeBytes: 789824,
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
        "sourcePath": "public/aura-assets/bhSpeakerStack.c6feff47.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-11-09 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 meshy07, beat-hopper/bhSpeakerStack). Meshy plan terms at generation time; not CC0.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/bhSpeakerStack.rights.json"
        ],
        "checkedAt": "2026-11-09T14:24:35.322Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/bhSpeakerStack.c6feff47.glb",
      "outputPath": "public/aura-assets/bhSpeakerStack.c6feff47.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.312,
          -0.952,
          -0.339
        ],
        "max": [
          0.311,
          0.951,
          0.336
        ],
        "size": [
          0.623,
          1.903,
          0.676
        ],
        "center": [
          0,
          -0.001,
          -0.002
        ],
        "maxDimension": 1.903,
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
      "thumbnailUrl": "/aura-assets/bhSpeakerStack.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing"
    },
  },
  "bhSpeakerStackB": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bhSpeakerStackB.fcbfbbce.glb",
    hash: "sha256-fcbfbbce84d748543f62ece7fc784290b02a70b4a009ae0c60f07dc8c35d4245",
    integrity: {
      "version": 1,
      "digest": "sha256-fcbfbbce84d748543f62ece7fc784290b02a70b4a009ae0c60f07dc8c35d4245"
    },
    bounds: [
      0.439,
      1.903,
      0.597
    ],
    sizeBytes: 919316,
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
        "sourcePath": "public/aura-assets/bhSpeakerStackB.fcbfbbce.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-11-09 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 meshy07, beat-hopper/bhSpeakerStackB). Meshy plan terms at generation time; not CC0.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/bhSpeakerStackB.rights.json"
        ],
        "checkedAt": "2026-11-09T14:24:35.969Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/bhSpeakerStackB.fcbfbbce.glb",
      "outputPath": "public/aura-assets/bhSpeakerStackB.fcbfbbce.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.219,
          -0.952,
          -0.285
        ],
        "max": [
          0.219,
          0.951,
          0.312
        ],
        "size": [
          0.439,
          1.903,
          0.597
        ],
        "center": [
          0,
          0,
          0.014
        ],
        "maxDimension": 1.903,
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
      "thumbnailUrl": "/aura-assets/bhSpeakerStackB.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing"
    },
  },
  "bhTurntable": {
    type: "model",
    format: "glb",
    url: "/aura-assets/bhTurntable.691cc740.glb",
    hash: "sha256-691cc7405d077724ae1c2f31647f83a8a95348a11f3a099007ef29006c9f100d",
    integrity: {
      "version": 1,
      "digest": "sha256-691cc7405d077724ae1c2f31647f83a8a95348a11f3a099007ef29006c9f100d"
    },
    bounds: [
      1.903,
      0.694,
      1.389
    ],
    sizeBytes: 883248,
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
        "sourcePath": "public/aura-assets/bhTurntable.691cc740.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-11-09 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 meshy07, beat-hopper/bhTurntable). Meshy plan terms at generation time; not CC0.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/bhTurntable.rights.json"
        ],
        "checkedAt": "2026-11-09T14:24:36.658Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/bhTurntable.691cc740.glb",
      "outputPath": "public/aura-assets/bhTurntable.691cc740.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.344,
          -0.703
        ],
        "max": [
          0.951,
          0.349,
          0.686
        ],
        "size": [
          1.903,
          0.694,
          1.389
        ],
        "center": [
          -0.001,
          0.002,
          -0.008
        ],
        "maxDimension": 1.903,
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
      "thumbnailUrl": "/aura-assets/bhTurntable.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
