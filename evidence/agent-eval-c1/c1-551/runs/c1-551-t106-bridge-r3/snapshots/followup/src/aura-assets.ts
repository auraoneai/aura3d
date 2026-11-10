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
    url: "/aura-assets/fabric.d57c37ee.glb",
    hash: "sha256-d57c37ee852c3a5602bed0d7e2af2199f774f6f4f47bf520702fc706bae03f41",
    integrity: {
      "version": 1,
      "digest": "sha256-d57c37ee852c3a5602bed0d7e2af2199f774f6f4f47bf520702fc706bae03f41"
    },
    bounds: [
      1.6,
      1.6,
      1.6
    ],
    sizeBytes: 2200560,
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
        "checkedAt": "2026-11-10T07:42:05.957Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/fabric.glb",
      "outputPath": "public/aura-assets/fabric.d57c37ee.glb",
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
    url: "/aura-assets/glass.fef647eb.glb",
    hash: "sha256-fef647eb67166b051b85a28803ac10ce3550bcd71d53112eb932321777764b11",
    integrity: {
      "version": 1,
      "digest": "sha256-fef647eb67166b051b85a28803ac10ce3550bcd71d53112eb932321777764b11"
    },
    bounds: [
      1.6,
      1.6,
      1.6
    ],
    sizeBytes: 275728,
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
        "checkedAt": "2026-11-10T07:42:00.884Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/glass.glb",
      "outputPath": "public/aura-assets/glass.fef647eb.glb",
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
          "opacity": 0.22,
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
    url: "/aura-assets/metal.a43cef30.glb",
    hash: "sha256-a43cef30de29fdfa71dce4de45e6cb3bbb028c69fd717974ebd9680ae5845f91",
    integrity: {
      "version": 1,
      "digest": "sha256-a43cef30de29fdfa71dce4de45e6cb3bbb028c69fd717974ebd9680ae5845f91"
    },
    bounds: [
      1.6,
      1.6,
      1.6
    ],
    sizeBytes: 275840,
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
        "textureCount": 0,
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
        "checkedAt": "2026-11-10T07:42:01.554Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/metal.glb",
      "outputPath": "public/aura-assets/metal.a43cef30.glb",
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
      "textures": [],
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
    url: "/aura-assets/studio.e9f0e8c2.glb",
    hash: "sha256-e9f0e8c2caeb9be5db2fda5668dbd541e65769a1f279bac467ceb8affee97dab",
    integrity: {
      "version": 1,
      "digest": "sha256-e9f0e8c2caeb9be5db2fda5668dbd541e65769a1f279bac467ceb8affee97dab"
    },
    bounds: [
      40,
      10.2,
      14.2
    ],
    sizeBytes: 3256,
    metadata: {
      "materials": [
        "cyclorama"
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
        "checkedAt": "2026-11-10T07:42:00.078Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": ".aura3d/three-bridge/studio.glb",
      "outputPath": "public/aura-assets/studio.e9f0e8c2.glb",
      "license": "LicenseRef-project-generated",
      "author": "aura3d import-three",
      "boundsMetadata": {
        "min": [
          -20,
          0,
          -5.2
        ],
        "max": [
          20,
          10.2,
          9
        ],
        "size": [
          40,
          10.2,
          14.2
        ],
        "center": [
          0,
          5.1,
          1.9
        ],
        "maxDimension": 40,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "cyclorama",
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
