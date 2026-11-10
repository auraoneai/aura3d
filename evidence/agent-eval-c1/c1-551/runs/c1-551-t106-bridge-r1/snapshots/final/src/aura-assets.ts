import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "fabric": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "glass": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "metal": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "studio": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "fabric": {
    type: "model",
    format: "glb",
    url: "/aura-assets/fabric.407217f7.glb",
    hash: "sha256-407217f7adedb32dd8462499cc3f6d02b80b5f514e6d6778f1ca4d023f538edb",
    integrity: {
      "version": 1,
      "digest": "sha256-407217f7adedb32dd8462499cc3f6d02b80b5f514e6d6778f1ca4d023f538edb"
    },
    bounds: [
      1.6,
      1.6,
      1.6
    ],
    sizeBytes: 300112,
    metadata: {
      "materials": [
        "fabric"
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
        "textureCount": 1,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "fabric"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/fabric.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/fabric.bridge.json"
        ],
        "checkedAt": "2026-11-10T08:08:52.939Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/fabric.glb",
      "outputPath": "public/aura-assets/fabric.407217f7.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -0.8,
          -0.8,
          -0.8
        ],
        "max": [
          0.8,
          0.8,
          0.8
        ],
        "size": [
          1.6,
          1.6,
          1.6
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 1.6,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "fabric",
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
        "fabric"
      ],
      "textures": [
        "image-0"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/fabric.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/studio.mjs (seed 1)"
    },
  },
  "glass": {
    type: "model",
    format: "glb",
    url: "/aura-assets/glass.6710ad58.glb",
    hash: "sha256-6710ad585ed5dbb1fa7add97b7bb5679981441395609eac00a65788ad750c9ae",
    integrity: {
      "version": 1,
      "digest": "sha256-6710ad585ed5dbb1fa7add97b7bb5679981441395609eac00a65788ad750c9ae"
    },
    bounds: [
      1.6,
      1.6,
      1.6
    ],
    sizeBytes: 275868,
    metadata: {
      "materials": [
        "glass"
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
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "glass"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/glass.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/glass.bridge.json"
        ],
        "checkedAt": "2026-11-10T08:08:52.055Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/glass.glb",
      "outputPath": "public/aura-assets/glass.6710ad58.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -0.8,
          -0.8,
          -0.8
        ],
        "max": [
          0.8,
          0.8,
          0.8
        ],
        "size": [
          1.6,
          1.6,
          1.6
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 1.6,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "glass",
          "visible": true,
          "readable": true,
          "opacity": 0.35,
          "alphaMode": "BLEND",
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
        "glass"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/glass.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/studio.mjs (seed 1)"
    },
  },
  "metal": {
    type: "model",
    format: "glb",
    url: "/aura-assets/metal.33d95067.glb",
    hash: "sha256-33d95067a5c0698ffce6923fd1824d711ebb79a876bd6dc4a6feae9921bb3c66",
    integrity: {
      "version": 1,
      "digest": "sha256-33d95067a5c0698ffce6923fd1824d711ebb79a876bd6dc4a6feae9921bb3c66"
    },
    bounds: [
      1.6,
      1.6,
      1.6
    ],
    sizeBytes: 284320,
    metadata: {
      "materials": [
        "metal"
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
        "textureCount": 1,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "metal"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/metal.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/metal.bridge.json"
        ],
        "checkedAt": "2026-11-10T08:08:52.512Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/metal.glb",
      "outputPath": "public/aura-assets/metal.33d95067.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -0.8,
          -0.8,
          -0.8
        ],
        "max": [
          0.8,
          0.8,
          0.8
        ],
        "size": [
          1.6,
          1.6,
          1.6
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 1.6,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "metal",
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
        "metal"
      ],
      "textures": [
        "image-0"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/metal.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/studio.mjs (seed 1)"
    },
  },
  "studio": {
    type: "model",
    format: "glb",
    url: "/aura-assets/studio.95c0c32f.glb",
    hash: "sha256-95c0c32f3b2a50bf6850c39daa232239bb0fdbe913e66f5a90d4ea724d8706f8",
    integrity: {
      "version": 1,
      "digest": "sha256-95c0c32f3b2a50bf6850c39daa232239bb0fdbe913e66f5a90d4ea724d8706f8"
    },
    bounds: [
      28,
      9,
      18.5
    ],
    sizeBytes: 9980,
    metadata: {
      "materials": [
        "cyc"
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
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "cyclorama"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": ".aura3d/three-bridge/studio.glb",
        "license": "LicenseRef-project-generated",
        "author": "aura3d import-three",
        "sourceFamily": "three-bridge",
        "evidence": [
          "src/three-bridge/studio.bridge.json"
        ],
        "checkedAt": "2026-11-10T08:08:51.633Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/studio.glb",
      "outputPath": "public/aura-assets/studio.95c0c32f.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -14,
          0,
          -6.5
        ],
        "max": [
          14,
          9,
          12
        ],
        "size": [
          28,
          9,
          18.5
        ],
        "center": [
          0,
          4.5,
          2.75
        ],
        "maxDimension": 28,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "cyc",
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
        "cyclorama"
      ],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/studio.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "procedural three.js recipe recipes/studio.mjs (seed 1)"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
