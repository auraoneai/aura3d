/**
 * Typed model manifest for the meshy07 roadside dressing (dice, neon 7, synthwave palms), emitted by
 * `aura3d assets typegen` from `aura.assets.json` (the font entry, which the CLI typegen cannot type, stays in
 * `aura-assets.ts`). Scenes use `model(assets.<key>)`; provenance in `public/aura-assets/PROVENANCE.md`.
 */
import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "nsFloatingDice": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "nsNeonPalm": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "nsNumeralSeven": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "nsPinkPalm": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "nsFloatingDice": {
    type: "model",
    format: "glb",
    url: "/aura-assets/nsFloatingDice.1d7f7051.glb",
    hash: "sha256-1d7f705103d9328ea8f336b5f8884603ffde9cd67a3a74c548d2b3c42cac85db",
    integrity: {
      "version": 1,
      "digest": "sha256-1d7f705103d9328ea8f336b5f8884603ffde9cd67a3a74c548d2b3c42cac85db"
    },
    bounds: [
      1.903,
      0.78,
      1.114
    ],
    sizeBytes: 1186836,
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
        "sourcePath": "public/aura-assets/nsFloatingDice.1d7f7051.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-11-09 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 meshy07, number-surge/nsFloatingDice). Meshy plan terms at generation time; not CC0.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/nsFloatingDice.rights.json"
        ],
        "checkedAt": "2026-11-09T14:22:49.163Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/nsFloatingDice.1d7f7051.glb",
      "outputPath": "public/aura-assets/nsFloatingDice.1d7f7051.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.391,
          -0.556
        ],
        "max": [
          0.951,
          0.389,
          0.558
        ],
        "size": [
          1.903,
          0.78,
          1.114
        ],
        "center": [
          0,
          -0.001,
          0.001
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
      "thumbnailUrl": "/aura-assets/nsFloatingDice.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    },
  },
  "nsNeonPalm": {
    type: "model",
    format: "glb",
    url: "/aura-assets/nsNeonPalm.dafb5a98.glb",
    hash: "sha256-dafb5a98c95a0905034bf8bae9a126da754eb151e97e529aaa255489d90eb9f1",
    integrity: {
      "version": 1,
      "digest": "sha256-dafb5a98c95a0905034bf8bae9a126da754eb151e97e529aaa255489d90eb9f1"
    },
    bounds: [
      0.978,
      1.902,
      0.934
    ],
    sizeBytes: 1231732,
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
        "sourcePath": "public/aura-assets/nsNeonPalm.dafb5a98.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-11-09 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 meshy07, number-surge/nsNeonPalm). Meshy plan terms at generation time; not CC0.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/nsNeonPalm.rights.json"
        ],
        "checkedAt": "2026-11-09T14:23:02.966Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/nsNeonPalm.dafb5a98.glb",
      "outputPath": "public/aura-assets/nsNeonPalm.dafb5a98.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.493,
          -0.952,
          -0.465
        ],
        "max": [
          0.485,
          0.95,
          0.469
        ],
        "size": [
          0.978,
          1.902,
          0.934
        ],
        "center": [
          -0.004,
          -0.001,
          0.002
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
      "thumbnailUrl": "/aura-assets/nsNeonPalm.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    },
  },
  "nsNumeralSeven": {
    type: "model",
    format: "glb",
    url: "/aura-assets/nsNumeralSeven.bf86a377.glb",
    hash: "sha256-bf86a3773fd9e014d457e674000e3156b36267a25107f76a0877e2b4e9e40587",
    integrity: {
      "version": 1,
      "digest": "sha256-bf86a3773fd9e014d457e674000e3156b36267a25107f76a0877e2b4e9e40587"
    },
    bounds: [
      1.064,
      1.903,
      1.063
    ],
    sizeBytes: 957440,
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
        "sourcePath": "public/aura-assets/nsNumeralSeven.bf86a377.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-11-09 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 meshy07, number-surge/nsNumeralSeven). Meshy plan terms at generation time; not CC0.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/nsNumeralSeven.rights.json"
        ],
        "checkedAt": "2026-11-09T14:23:02.326Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/nsNumeralSeven.bf86a377.glb",
      "outputPath": "public/aura-assets/nsNumeralSeven.bf86a377.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.532,
          -0.952,
          -0.532
        ],
        "max": [
          0.532,
          0.951,
          0.531
        ],
        "size": [
          1.064,
          1.903,
          1.063
        ],
        "center": [
          0,
          -0.001,
          0
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
      "thumbnailUrl": "/aura-assets/nsNumeralSeven.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    },
  },
  "nsPinkPalm": {
    type: "model",
    format: "glb",
    url: "/aura-assets/nsPinkPalm.bf0a8ea1.glb",
    hash: "sha256-bf0a8ea17cbc33be71b0c7bd2da7d4bbbb461f4193e4447f599ffa45bcf2d1a8",
    integrity: {
      "version": 1,
      "digest": "sha256-bf0a8ea17cbc33be71b0c7bd2da7d4bbbb461f4193e4447f599ffa45bcf2d1a8"
    },
    bounds: [
      1.207,
      1.904,
      1.222
    ],
    sizeBytes: 1374684,
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
        "sourcePath": "public/aura-assets/nsPinkPalm.bf0a8ea1.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-11-09 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 meshy07, number-surge/nsPinkPalm). Meshy plan terms at generation time; not CC0.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/nsPinkPalm.rights.json"
        ],
        "checkedAt": "2026-11-09T14:23:03.693Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/nsPinkPalm.bf0a8ea1.glb",
      "outputPath": "public/aura-assets/nsPinkPalm.bf0a8ea1.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.604,
          -0.952,
          -0.612
        ],
        "max": [
          0.603,
          0.952,
          0.61
        ],
        "size": [
          1.207,
          1.904,
          1.222
        ],
        "center": [
          -0.001,
          0,
          -0.001
        ],
        "maxDimension": 1.904,
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
      "thumbnailUrl": "/aura-assets/nsPinkPalm.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
