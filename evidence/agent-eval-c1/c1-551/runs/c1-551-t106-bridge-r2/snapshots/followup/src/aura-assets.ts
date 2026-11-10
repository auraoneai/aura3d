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
    url: "/aura-assets/fabric.4806e612.glb",
    hash: "sha256-4806e612a2ae58225fbba57635bdf5635df23f6eec6577435b1bd5dc4ae83dd1",
    integrity: {
      "version": 1,
      "digest": "sha256-4806e612a2ae58225fbba57635bdf5635df23f6eec6577435b1bd5dc4ae83dd1"
    },
    bounds: [
      1.24,
      1.24,
      1.24
    ],
    sizeBytes: 342776,
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
        "textureCount": 2,
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
        "checkedAt": "2026-11-10T07:54:23.138Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/fabric.glb",
      "outputPath": "public/aura-assets/fabric.4806e612.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -0.62,
          -0.62,
          -0.62
        ],
        "max": [
          0.62,
          0.62,
          0.62
        ],
        "size": [
          1.24,
          1.24,
          1.24
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 1.24,
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
        "image-0",
        "image-1"
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
    url: "/aura-assets/glass.ac7f6ac1.glb",
    hash: "sha256-ac7f6ac19c11ffc2db6797875b8506b7299b33364e296ac5e96c80692d34aaab",
    integrity: {
      "version": 1,
      "digest": "sha256-ac7f6ac19c11ffc2db6797875b8506b7299b33364e296ac5e96c80692d34aaab"
    },
    bounds: [
      1.24,
      1.24,
      1.24
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
        "checkedAt": "2026-11-10T07:54:22.337Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/glass.glb",
      "outputPath": "public/aura-assets/glass.ac7f6ac1.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -0.62,
          -0.62,
          -0.62
        ],
        "max": [
          0.62,
          0.62,
          0.62
        ],
        "size": [
          1.24,
          1.24,
          1.24
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 1.24,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "glass",
          "visible": true,
          "readable": true,
          "opacity": 0.4,
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
    url: "/aura-assets/metal.f50844eb.glb",
    hash: "sha256-f50844eb06771f6bf87bb613fdd0d0e7a4be9474b8258364c4344fef973b71a9",
    integrity: {
      "version": 1,
      "digest": "sha256-f50844eb06771f6bf87bb613fdd0d0e7a4be9474b8258364c4344fef973b71a9"
    },
    bounds: [
      1.24,
      1.24,
      1.24
    ],
    sizeBytes: 285888,
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
        "checkedAt": "2026-11-10T07:54:22.729Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/metal.glb",
      "outputPath": "public/aura-assets/metal.f50844eb.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -0.62,
          -0.62,
          -0.62
        ],
        "max": [
          0.62,
          0.62,
          0.62
        ],
        "size": [
          1.24,
          1.24,
          1.24
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 1.24,
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
    url: "/aura-assets/studio.e6087a3e.glb",
    hash: "sha256-e6087a3ea3ac27bd77041a10570f8a52ae477834eab868436753bcbef6f2002e",
    integrity: {
      "version": 1,
      "digest": "sha256-e6087a3ea3ac27bd77041a10570f8a52ae477834eab868436753bcbef6f2002e"
    },
    bounds: [
      28,
      7.4,
      14
    ],
    sizeBytes: 4116,
    metadata: {
      "materials": [
        "floor"
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
          "floor"
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
        "checkedAt": "2026-11-10T07:54:21.958Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/studio.glb",
      "outputPath": "public/aura-assets/studio.e6087a3e.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -14,
          0,
          -5
        ],
        "max": [
          14,
          7.4,
          9
        ],
        "size": [
          28,
          7.4,
          14
        ],
        "center": [
          0,
          3.7,
          2
        ],
        "maxDimension": 28,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "floor",
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
        "floor"
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
