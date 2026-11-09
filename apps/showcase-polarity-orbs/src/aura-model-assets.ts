/**
 * Typed model manifest for the Meshy backdrop dressing (Meshy-07: red-pole crystals and charge coil, blue-tinted
 * crystals and magnet), emitted like `aura3d assets typegen` from `aura.assets.json` (the font entry, which the CLI
 * typegen cannot type, stays in `aura-assets.ts`). Scenes use `model(assets.<key>)`; provenance in
 * `public/aura-assets/PROVENANCE.md`.
 */
import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "poCrystalBlue": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "poCrystalIsland": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "poCrystalIslandB": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "poCrystalRed": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "poMagnet": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "poChargeCoil": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "poCrystalBlue": {
    type: "model",
    format: "glb",
    url: "/aura-assets/poCrystalBlue.f51e02e5.glb",
    hash: "sha256-f51e02e5ff9734cd13d44a00896b2589b896197c3c7787ab6d25f720e52ead6d",
    integrity: {
      "version": 1,
      "digest": "sha256-f51e02e5ff9734cd13d44a00896b2589b896197c3c7787ab6d25f720e52ead6d"
    },
    bounds: [
      0.735,
      1.902,
      0.744
    ],
    sizeBytes: 393108,
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
        "sourcePath": "public/aura-assets/poCrystalBlue.f51e02e5.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-11-09 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, polarity-orbs/poCrystalBlue). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/po-crystal-blue.rights.json"
        ],
        "checkedAt": "2026-11-09T14:23:44.732Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/poCrystalBlue.f51e02e5.glb",
      "outputPath": "public/aura-assets/poCrystalBlue.f51e02e5.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.368,
          -0.952,
          -0.372
        ],
        "max": [
          0.367,
          0.95,
          0.372
        ],
        "size": [
          0.735,
          1.902,
          0.744
        ],
        "center": [
          0,
          -0.001,
          0
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
      "thumbnailUrl": "/aura-assets/poCrystalBlue.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    }
  },
  "poCrystalIsland": {
    type: "model",
    format: "glb",
    url: "/aura-assets/poCrystalIsland.22a698c8.glb",
    hash: "sha256-22a698c8d0cc856dad30e497c25907040ccc65c0f9b0f755299cf269a3ac5860",
    integrity: {
      "version": 1,
      "digest": "sha256-22a698c8d0cc856dad30e497c25907040ccc65c0f9b0f755299cf269a3ac5860"
    },
    bounds: [
      1.898,
      1.251,
      1.201
    ],
    sizeBytes: 382192,
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
        "sourcePath": "public/aura-assets/poCrystalIsland.22a698c8.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-11-09 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, polarity-orbs/poCrystalIsland). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/po-crystal-island.rights.json"
        ],
        "checkedAt": "2026-11-09T14:23:46.549Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/poCrystalIsland.22a698c8.glb",
      "outputPath": "public/aura-assets/poCrystalIsland.22a698c8.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.949,
          -0.628,
          -0.599
        ],
        "max": [
          0.949,
          0.623,
          0.602
        ],
        "size": [
          1.898,
          1.251,
          1.201
        ],
        "center": [
          0,
          -0.003,
          0.002
        ],
        "maxDimension": 1.898,
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
      "thumbnailUrl": "/aura-assets/poCrystalIsland.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    }
  },
  "poCrystalIslandB": {
    type: "model",
    format: "glb",
    url: "/aura-assets/poCrystalIslandB.ba529b43.glb",
    hash: "sha256-ba529b43121bc298eaf19ca8f021d4cf492babb9960621c620c917c1f28ed25e",
    integrity: {
      "version": 1,
      "digest": "sha256-ba529b43121bc298eaf19ca8f021d4cf492babb9960621c620c917c1f28ed25e"
    },
    bounds: [
      1.867,
      0.92,
      1.119
    ],
    sizeBytes: 454120,
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
        "sourcePath": "public/aura-assets/poCrystalIslandB.ba529b43.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-11-09 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, polarity-orbs/poCrystalIslandB). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/po-crystal-island-b.rights.json"
        ],
        "checkedAt": "2026-11-09T14:23:42.360Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/poCrystalIslandB.ba529b43.glb",
      "outputPath": "public/aura-assets/poCrystalIslandB.ba529b43.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.918,
          -0.461,
          -0.559
        ],
        "max": [
          0.949,
          0.46,
          0.56
        ],
        "size": [
          1.867,
          0.92,
          1.119
        ],
        "center": [
          0.016,
          0,
          0
        ],
        "maxDimension": 1.867,
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
      "thumbnailUrl": "/aura-assets/poCrystalIslandB.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    }
  },
  "poCrystalRed": {
    type: "model",
    format: "glb",
    url: "/aura-assets/poCrystalRed.f0c5b5fe.glb",
    hash: "sha256-f0c5b5feaa0d694a6b6935c0ed558188ac0a497738b71f50708d884462d0559e",
    integrity: {
      "version": 1,
      "digest": "sha256-f0c5b5feaa0d694a6b6935c0ed558188ac0a497738b71f50708d884462d0559e"
    },
    bounds: [
      1.143,
      1.903,
      1.142
    ],
    sizeBytes: 522452,
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
        "sourcePath": "public/aura-assets/poCrystalRed.f0c5b5fe.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-11-09 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, polarity-orbs/poCrystalRed). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/po-crystal-red.rights.json"
        ],
        "checkedAt": "2026-11-09T14:23:40.469Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/poCrystalRed.f0c5b5fe.glb",
      "outputPath": "public/aura-assets/poCrystalRed.f0c5b5fe.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.567,
          -0.952,
          -0.577
        ],
        "max": [
          0.576,
          0.951,
          0.565
        ],
        "size": [
          1.143,
          1.903,
          1.142
        ],
        "center": [
          0.005,
          -0.001,
          -0.006
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
      "thumbnailUrl": "/aura-assets/poCrystalRed.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    }
  },
  "poMagnet": {
    type: "model",
    format: "glb",
    url: "/aura-assets/poMagnet.fc2c4e1a.glb",
    hash: "sha256-fc2c4e1ae9c3e87b2fe38bc1a86c92db98ae1b11d7b58d4ceee11e78b481614e",
    integrity: {
      "version": 1,
      "digest": "sha256-fc2c4e1ae9c3e87b2fe38bc1a86c92db98ae1b11d7b58d4ceee11e78b481614e"
    },
    bounds: [
      1.304,
      1.903,
      0.676
    ],
    sizeBytes: 344476,
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
        "sourcePath": "public/aura-assets/poMagnet.fc2c4e1a.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-11-09 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, polarity-orbs/poMagnet). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/po-magnet.rights.json"
        ],
        "checkedAt": "2026-11-09T14:23:48.108Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/poMagnet.fc2c4e1a.glb",
      "outputPath": "public/aura-assets/poMagnet.fc2c4e1a.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.652,
          -0.952,
          -0.338
        ],
        "max": [
          0.652,
          0.951,
          0.338
        ],
        "size": [
          1.304,
          1.903,
          0.676
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
      "thumbnailUrl": "/aura-assets/poMagnet.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    }
  },
  "poChargeCoil": {
    type: "model",
    format: "glb",
    url: "/aura-assets/poChargeCoil.48974808.glb",
    hash: "sha256-48974808ae9728315517c2ed1f827a69dc463d7fb864123ccf03b5af33c9ba63",
    integrity: {
      "version": 1,
      "digest": "sha256-48974808ae9728315517c2ed1f827a69dc463d7fb864123ccf03b5af33c9ba63"
    },
    bounds: [
      1.368,
      1.903,
      1.368
    ],
    sizeBytes: 394236,
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
        "sourcePath": "public/aura-assets/poChargeCoil.48974808.glb",
        "licenseName": "Meshy generated asset (AuraOne account plan terms)",
        "licenseRaw": "Generated 2026-11-09 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, polarity-orbs charge-coil row). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "author": "AuraOne (Meshy)",
        "evidence": [
          "public/aura-assets/provenance/po-charge-coil.rights.json"
        ],
        "checkedAt": "2026-11-09T14:23:25.806Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/poChargeCoil.48974808.glb",
      "outputPath": "public/aura-assets/poChargeCoil.48974808.glb",
      "author": "AuraOne (Meshy)",
      "boundsMetadata": {
        "min": [
          -0.684,
          -0.952,
          -0.684
        ],
        "max": [
          0.684,
          0.951,
          0.684
        ],
        "size": [
          1.368,
          1.903,
          1.368
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
      "thumbnailUrl": "/aura-assets/poChargeCoil.thumb.svg",
      "quality": "candidate",
      "role": "backdrop"
    }
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
