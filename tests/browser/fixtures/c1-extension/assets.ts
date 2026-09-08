import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "checker": AuraAssetDefinition & { readonly type: "texture"; readonly format: "png"; readonly url: string; readonly hash: string; };
  readonly "decoyA": AuraAssetDefinition & { readonly type: "texture"; readonly format: "png"; readonly url: string; readonly hash: string; };
  readonly "decoyB": AuraAssetDefinition & { readonly type: "texture"; readonly format: "png"; readonly url: string; readonly hash: string; };
  readonly "decoyG": AuraAssetDefinition & { readonly type: "texture"; readonly format: "png"; readonly url: string; readonly hash: string; };
  readonly "decoyR": AuraAssetDefinition & { readonly type: "texture"; readonly format: "png"; readonly url: string; readonly hash: string; };
  readonly "direction": AuraAssetDefinition & { readonly type: "texture"; readonly format: "png"; readonly url: string; readonly hash: string; };
  readonly "emissive": AuraAssetDefinition & { readonly type: "texture"; readonly format: "png"; readonly url: string; readonly hash: string; };
  readonly "normal": AuraAssetDefinition & { readonly type: "texture"; readonly format: "png"; readonly url: string; readonly hash: string; };
  readonly "occlusion": AuraAssetDefinition & { readonly type: "texture"; readonly format: "png"; readonly url: string; readonly hash: string; };
  readonly "rgba": AuraAssetDefinition & { readonly type: "texture"; readonly format: "png"; readonly url: string; readonly hash: string; };
  readonly "rough": AuraAssetDefinition & { readonly type: "texture"; readonly format: "png"; readonly url: string; readonly hash: string; };
  readonly "swapped": AuraAssetDefinition & { readonly type: "texture"; readonly format: "png"; readonly url: string; readonly hash: string; };
  readonly "white": AuraAssetDefinition & { readonly type: "texture"; readonly format: "png"; readonly url: string; readonly hash: string; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "checker": {
    type: "texture",
    format: "png",
    url: "/tests/browser/fixtures/c1-extension/generated/checker.99496e5e.png",
    hash: "sha256-99496e5e0a5e216a090443582731f579301640331a7a5b1b586bb5a6dccc57d6",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 210,
    metadata: {
      "materials": [],
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
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 0,
        "jointCount": 0,
        "skins": [],
        "messages": [
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "generated/checker.99496e5e.png",
        "sourceFamily": "repository-test-fixture",
        "retrievedAt": "2026-09-05T00:00:00.000Z",
        "evidence": [
          "Existing source: tests/browser/fixtures/c1-checker.png",
          "Registered by tools/root-textured-fixtures/index.ts; SHA256 derived from bytes"
        ],
        "checkedAt": "2026-09-05T00:00:00.000Z"
      },
      "sourcePath": "generated/checker.99496e5e.png",
      "outputPath": "generated/checker.99496e5e.png",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/tests/browser/fixtures/c1-extension/generated/checker.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "decoyA": {
    type: "texture",
    format: "png",
    url: "/tests/browser/fixtures/c1-extension/generated/decoyA.cdae97d9.png",
    hash: "sha256-cdae97d9c743c52ed4e7bba934a363bd3baf52d15cd038805304bb852b40badd",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 4188,
    metadata: {
      "materials": [],
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
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 0,
        "jointCount": 0,
        "skins": [],
        "messages": [
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "source/decoyA.png",
        "author": "Aura3D",
        "sourceFamily": "authored-analytical-fixture",
        "retrievedAt": "2026-09-05T00:00:00.000Z",
        "evidence": [
          "Producer: tools/root-textured-fixtures/index.ts",
          "Deterministic unpremultiplied RGBA channel vectors; no external content"
        ],
        "checkedAt": "2026-09-05T00:00:00.000Z"
      },
      "sourcePath": "source/decoyA.png",
      "outputPath": "generated/decoyA.cdae97d9.png",
      "author": "Aura3D",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/tests/browser/fixtures/c1-extension/generated/decoyA.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "Independent extension-map channel and UV test input"
    },
  },
  "decoyB": {
    type: "texture",
    format: "png",
    url: "/tests/browser/fixtures/c1-extension/generated/decoyB.1af961f4.png",
    hash: "sha256-1af961f401a7a44c592eb002e371eda5dd84c7d27ef7eb365584bc9f20fa267b",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 4176,
    metadata: {
      "materials": [],
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
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 0,
        "jointCount": 0,
        "skins": [],
        "messages": [
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "source/decoyB.png",
        "author": "Aura3D",
        "sourceFamily": "authored-analytical-fixture",
        "retrievedAt": "2026-09-05T00:00:00.000Z",
        "evidence": [
          "Producer: tools/root-textured-fixtures/index.ts",
          "Deterministic unpremultiplied RGBA channel vectors; no external content"
        ],
        "checkedAt": "2026-09-05T00:00:00.000Z"
      },
      "sourcePath": "source/decoyB.png",
      "outputPath": "generated/decoyB.1af961f4.png",
      "author": "Aura3D",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/tests/browser/fixtures/c1-extension/generated/decoyB.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "Independent extension-map channel and UV test input"
    },
  },
  "decoyG": {
    type: "texture",
    format: "png",
    url: "/tests/browser/fixtures/c1-extension/generated/decoyG.26e4c573.png",
    hash: "sha256-26e4c573854b7e8b862eee169f121421b6ebdd185d3afd4fccb27e0ec6ef7561",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 4180,
    metadata: {
      "materials": [],
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
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 0,
        "jointCount": 0,
        "skins": [],
        "messages": [
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "source/decoyG.png",
        "author": "Aura3D",
        "sourceFamily": "authored-analytical-fixture",
        "retrievedAt": "2026-09-05T00:00:00.000Z",
        "evidence": [
          "Producer: tools/root-textured-fixtures/index.ts",
          "Deterministic unpremultiplied RGBA channel vectors; no external content"
        ],
        "checkedAt": "2026-09-05T00:00:00.000Z"
      },
      "sourcePath": "source/decoyG.png",
      "outputPath": "generated/decoyG.26e4c573.png",
      "author": "Aura3D",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/tests/browser/fixtures/c1-extension/generated/decoyG.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "Independent extension-map channel and UV test input"
    },
  },
  "decoyR": {
    type: "texture",
    format: "png",
    url: "/tests/browser/fixtures/c1-extension/generated/decoyR.de43e426.png",
    hash: "sha256-de43e426e0db4aa2c961ad782cadd4cacea10bea21669ad07e16734c253f45a8",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 4182,
    metadata: {
      "materials": [],
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
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 0,
        "jointCount": 0,
        "skins": [],
        "messages": [
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "source/decoyR.png",
        "author": "Aura3D",
        "sourceFamily": "authored-analytical-fixture",
        "retrievedAt": "2026-09-05T00:00:00.000Z",
        "evidence": [
          "Producer: tools/root-textured-fixtures/index.ts",
          "Deterministic unpremultiplied RGBA channel vectors; no external content"
        ],
        "checkedAt": "2026-09-05T00:00:00.000Z"
      },
      "sourcePath": "source/decoyR.png",
      "outputPath": "generated/decoyR.de43e426.png",
      "author": "Aura3D",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/tests/browser/fixtures/c1-extension/generated/decoyR.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "Independent extension-map channel and UV test input"
    },
  },
  "direction": {
    type: "texture",
    format: "png",
    url: "/tests/browser/fixtures/c1-extension/generated/direction.e74472ff.png",
    hash: "sha256-e74472ffec6a1f64b076480e660f033a06de80c1d031cba1df7231294a199f4a",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 4180,
    metadata: {
      "materials": [],
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
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 0,
        "jointCount": 0,
        "skins": [],
        "messages": [
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "source/direction.png",
        "author": "Aura3D",
        "sourceFamily": "authored-analytical-fixture",
        "retrievedAt": "2026-09-05T00:00:00.000Z",
        "evidence": [
          "Producer: tools/root-textured-fixtures/index.ts",
          "Deterministic unpremultiplied RGBA channel vectors; no external content"
        ],
        "checkedAt": "2026-09-05T00:00:00.000Z"
      },
      "sourcePath": "source/direction.png",
      "outputPath": "generated/direction.e74472ff.png",
      "author": "Aura3D",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/tests/browser/fixtures/c1-extension/generated/direction.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "Independent extension-map channel and UV test input"
    },
  },
  "emissive": {
    type: "texture",
    format: "png",
    url: "/tests/browser/fixtures/c1-extension/generated/emissive.6b5ac8c0.png",
    hash: "sha256-6b5ac8c0255a3353b4c4705ecfa1b45ed3e1c7893a8fd79f7e6b451a3d1a6187",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 509,
    metadata: {
      "materials": [],
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
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 0,
        "jointCount": 0,
        "skins": [],
        "messages": [
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "generated/emissive.6b5ac8c0.png",
        "sourceFamily": "repository-test-fixture",
        "retrievedAt": "2026-09-05T00:00:00.000Z",
        "evidence": [
          "Existing source: tests/browser/fixtures/c1-emissive.png",
          "Registered by tools/root-textured-fixtures/index.ts; SHA256 derived from bytes"
        ],
        "checkedAt": "2026-09-05T00:00:00.000Z"
      },
      "sourcePath": "generated/emissive.6b5ac8c0.png",
      "outputPath": "generated/emissive.6b5ac8c0.png",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/tests/browser/fixtures/c1-extension/generated/emissive.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "normal": {
    type: "texture",
    format: "png",
    url: "/tests/browser/fixtures/c1-extension/generated/normal.2ac1b91f.png",
    hash: "sha256-2ac1b91fd6c3f9276c7a72ea2958206c6513c5a2dda2f2ba5866bb12da839053",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 358,
    metadata: {
      "materials": [],
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
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 0,
        "jointCount": 0,
        "skins": [],
        "messages": [
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "generated/normal.2ac1b91f.png",
        "sourceFamily": "repository-test-fixture",
        "retrievedAt": "2026-09-05T00:00:00.000Z",
        "evidence": [
          "Existing source: tests/browser/fixtures/c1-normal.png",
          "Registered by tools/root-textured-fixtures/index.ts; SHA256 derived from bytes"
        ],
        "checkedAt": "2026-09-05T00:00:00.000Z"
      },
      "sourcePath": "generated/normal.2ac1b91f.png",
      "outputPath": "generated/normal.2ac1b91f.png",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/tests/browser/fixtures/c1-extension/generated/normal.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "occlusion": {
    type: "texture",
    format: "png",
    url: "/tests/browser/fixtures/c1-extension/generated/occlusion.0bda7a40.png",
    hash: "sha256-0bda7a40f24063f3976d7a6617c757d408de36460deda9f00ae8cd599e8d6248",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 12194,
    metadata: {
      "materials": [],
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
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 0,
        "jointCount": 0,
        "skins": [],
        "messages": [
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "generated/occlusion.0bda7a40.png",
        "sourceFamily": "repository-test-fixture",
        "retrievedAt": "2026-09-05T00:00:00.000Z",
        "evidence": [
          "Existing source: tests/browser/fixtures/c1-occlusion.png",
          "Registered by tools/root-textured-fixtures/index.ts; SHA256 derived from bytes"
        ],
        "checkedAt": "2026-09-05T00:00:00.000Z"
      },
      "sourcePath": "generated/occlusion.0bda7a40.png",
      "outputPath": "generated/occlusion.0bda7a40.png",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/tests/browser/fixtures/c1-extension/generated/occlusion.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "rgba": {
    type: "texture",
    format: "png",
    url: "/tests/browser/fixtures/c1-extension/generated/rgba.3b557885.png",
    hash: "sha256-3b5578856890800a6fd83bbfc80d73c850a23f48e3595d71adb7427a3f17cd33",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 4163,
    metadata: {
      "materials": [],
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
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 0,
        "jointCount": 0,
        "skins": [],
        "messages": [
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "source/rgba.png",
        "author": "Aura3D",
        "sourceFamily": "authored-analytical-fixture",
        "retrievedAt": "2026-09-05T00:00:00.000Z",
        "evidence": [
          "Producer: tools/root-textured-fixtures/index.ts",
          "Deterministic unpremultiplied RGBA channel vectors; no external content"
        ],
        "checkedAt": "2026-09-05T00:00:00.000Z"
      },
      "sourcePath": "source/rgba.png",
      "outputPath": "generated/rgba.3b557885.png",
      "author": "Aura3D",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/tests/browser/fixtures/c1-extension/generated/rgba.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "Independent extension-map channel and UV test input"
    },
  },
  "rough": {
    type: "texture",
    format: "png",
    url: "/tests/browser/fixtures/c1-extension/generated/rough.c027b3ed.png",
    hash: "sha256-c027b3ed2eda3e0926712163e2741e11087c14222102c778220a95628fab1e21",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 393,
    metadata: {
      "materials": [],
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
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 0,
        "jointCount": 0,
        "skins": [],
        "messages": [
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "generated/rough.c027b3ed.png",
        "sourceFamily": "repository-test-fixture",
        "retrievedAt": "2026-09-05T00:00:00.000Z",
        "evidence": [
          "Existing source: tests/browser/fixtures/c1-rough.png",
          "Registered by tools/root-textured-fixtures/index.ts; SHA256 derived from bytes"
        ],
        "checkedAt": "2026-09-05T00:00:00.000Z"
      },
      "sourcePath": "generated/rough.c027b3ed.png",
      "outputPath": "generated/rough.c027b3ed.png",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/tests/browser/fixtures/c1-extension/generated/rough.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "swapped": {
    type: "texture",
    format: "png",
    url: "/tests/browser/fixtures/c1-extension/generated/swapped.8d47bba3.png",
    hash: "sha256-8d47bba3a5f3ee798b9e52caeccf1efb5372f80852205e80b60abe4c5893b142",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 4166,
    metadata: {
      "materials": [],
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
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 0,
        "jointCount": 0,
        "skins": [],
        "messages": [
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "source/swapped.png",
        "author": "Aura3D",
        "sourceFamily": "authored-analytical-fixture",
        "retrievedAt": "2026-09-05T00:00:00.000Z",
        "evidence": [
          "Producer: tools/root-textured-fixtures/index.ts",
          "Deterministic unpremultiplied RGBA channel vectors; no external content"
        ],
        "checkedAt": "2026-09-05T00:00:00.000Z"
      },
      "sourcePath": "source/swapped.png",
      "outputPath": "generated/swapped.8d47bba3.png",
      "author": "Aura3D",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/tests/browser/fixtures/c1-extension/generated/swapped.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "Independent extension-map channel and UV test input"
    },
  },
  "white": {
    type: "texture",
    format: "png",
    url: "/tests/browser/fixtures/c1-extension/generated/white.0ef49469.png",
    hash: "sha256-0ef494696c1d5792fde371da1ac80c500774fc1c2ced0dcef89ecbff584e405f",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 98,
    metadata: {
      "materials": [],
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
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "skeleton": {
        "skinCount": 0,
        "jointCount": 0,
        "skins": [],
        "messages": [
          "Skeleton detection is only available for GLB/glTF model assets."
        ]
      },
      "morphTargets": {
        "targetCount": 0,
        "targetNames": [],
        "meshes": [],
        "messages": [
          "Morph target detection is only available for GLB/glTF model assets."
        ]
      },
      "hierarchy": {
        "nodeCount": 0,
        "meshCount": 0,
        "materialCount": 0,
        "textureCount": 0,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [],
        "maxDepth": 0,
        "messages": [
          "Scene hierarchy inspection is only available for GLB/glTF model assets."
        ]
      },
      "provenance": {
        "sourcePath": "source/white.png",
        "author": "Aura3D",
        "sourceFamily": "authored-analytical-fixture",
        "retrievedAt": "2026-09-05T00:00:00.000Z",
        "evidence": [
          "Producer: tools/root-textured-fixtures/index.ts",
          "Deterministic unpremultiplied RGBA channel vectors; no external content"
        ],
        "checkedAt": "2026-09-05T00:00:00.000Z"
      },
      "sourcePath": "source/white.png",
      "outputPath": "generated/white.0ef49469.png",
      "author": "Aura3D",
      "materialMetadata": [],
      "orientation": {
        "source": "unknown",
        "messages": [
          "No orientation metadata detected; facing direction cannot be proven."
        ]
      },
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/tests/browser/fixtures/c1-extension/generated/white.thumb.svg",
      "quality": "ungraded",
      "role": "unknown",
      "suitabilityReason": "Independent extension-map channel and UV test input"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
