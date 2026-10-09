import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "carModel": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "trackModel": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "uiClickKenney": AuraAssetDefinition & { readonly type: "audio"; readonly format: "ogg"; readonly url: string; readonly hash: string; };
  readonly "uiConfirmKenney": AuraAssetDefinition & { readonly type: "audio"; readonly format: "ogg"; readonly url: string; readonly hash: string; };
  readonly "uiErrorKenney": AuraAssetDefinition & { readonly type: "audio"; readonly format: "ogg"; readonly url: string; readonly hash: string; };
  readonly "uiSelectKenney": AuraAssetDefinition & { readonly type: "audio"; readonly format: "ogg"; readonly url: string; readonly hash: string; };
  readonly "uiSwitchKenney": AuraAssetDefinition & { readonly type: "audio"; readonly format: "ogg"; readonly url: string; readonly hash: string; };
  readonly "uiToggleKenney": AuraAssetDefinition & { readonly type: "audio"; readonly format: "ogg"; readonly url: string; readonly hash: string; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "carModel": {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseCleanSportsCar.1c69283f.glb",
    hash: "sha256-1c69283fa2b3fb96b3dc3418f2d0dede842e6984f1776a8ca00b099836fc9c14",
    bounds: [
      3.455,
      3.428,
      2.206
    ],
    sizeBytes: 357064,
    metadata: {
      "materials": [
        "Material.001",
        "Material.002",
        "Material.003",
        "Material.004"
      ],
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "sourcePath": "public/aura-assets/showcaseCleanSportsCar.1c69283f.glb",
      "outputPath": "public/aura-assets/showcaseCleanSportsCar.1c69283f.glb",
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/showcaseCleanSportsCar.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "trackModel": {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseReadableKartCircuit.5cbb912e.glb",
    hash: "sha256-5cbb912e511e5e82363c347210096d59dd3007db12c363fd0c9f07919f5ebbd0",
    bounds: [
      24.651,
      24.647,
      2.073
    ],
    sizeBytes: 1641744,
    metadata: {
      "materials": [
        "LINEAS",
        "gris",
        "verde",
        "rojo",
        "azul",
        "amarillo"
      ],
      "animations": [],
      "animationClips": [],
      "animationMetadata": {
        "clipCount": 0,
        "clips": []
      },
      "humanoid": false,
      "humanoidStatus": "unknown",
      "humanoidConfidence": "low",
      "sourcePath": "public/aura-assets/showcaseReadableKartCircuit.5cbb912e.glb",
      "outputPath": "public/aura-assets/showcaseReadableKartCircuit.5cbb912e.glb",
      "nodeNames": [],
      "textures": [],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/showcaseReadableKartCircuit.thumb.svg",
      "quality": "ungraded",
      "role": "unknown"
    },
  },
  "uiClickKenney": {
    type: "audio",
    format: "ogg",
    url: "/aura-assets/uiClickKenney.ccfb7fa0.ogg",
    hash: "sha256-ccfb7fa0cccdd9faec0eb16033c732b1e308d139d80f799161495d58f7adcdb9",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 4876,
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
        "sourcePath": "public/aura-assets/uiClickKenney.ccfb7fa0.ogg",
        "sourcePage": "https://kenney.nl/assets/interface-sounds",
        "downloadUrl": "https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip",
        "sourceUrl": "https://kenney.nl/assets/interface-sounds",
        "license": "CC0-1.0",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Kenney",
        "retrievedAt": "2026-10-09",
        "checkedAt": "2026-10-09"
      },
      "sourcePath": "public/aura-assets/uiClickKenney.ccfb7fa0.ogg",
      "outputPath": "public/aura-assets/uiClickKenney.ccfb7fa0.ogg",
      "license": "CC0-1.0",
      "author": "Kenney",
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
      "thumbnailUrl": "/aura-assets/uiClickKenney.thumb.svg",
      "quality": "release",
      "role": "prop"
    },
  },
  "uiConfirmKenney": {
    type: "audio",
    format: "ogg",
    url: "/aura-assets/uiConfirmKenney.06356470.ogg",
    hash: "sha256-063564703b6094d70718a3e787a55cc9141611e4ecd6b6637f8828f79b4a8c3a",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 8968,
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
        "sourcePath": "public/aura-assets/uiConfirmKenney.06356470.ogg",
        "sourcePage": "https://kenney.nl/assets/interface-sounds",
        "downloadUrl": "https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip",
        "sourceUrl": "https://kenney.nl/assets/interface-sounds",
        "license": "CC0-1.0",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Kenney",
        "retrievedAt": "2026-10-09",
        "checkedAt": "2026-10-09"
      },
      "sourcePath": "public/aura-assets/uiConfirmKenney.06356470.ogg",
      "outputPath": "public/aura-assets/uiConfirmKenney.06356470.ogg",
      "license": "CC0-1.0",
      "author": "Kenney",
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
      "thumbnailUrl": "/aura-assets/uiConfirmKenney.thumb.svg",
      "quality": "release",
      "role": "prop"
    },
  },
  "uiErrorKenney": {
    type: "audio",
    format: "ogg",
    url: "/aura-assets/uiErrorKenney.46e67425.ogg",
    hash: "sha256-46e67425d16339772e8d328fb36a49426c9467418686e11beeb71ff84b0f6433",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 7373,
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
        "sourcePath": "public/aura-assets/uiErrorKenney.46e67425.ogg",
        "sourcePage": "https://kenney.nl/assets/interface-sounds",
        "downloadUrl": "https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip",
        "sourceUrl": "https://kenney.nl/assets/interface-sounds",
        "license": "CC0-1.0",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Kenney",
        "retrievedAt": "2026-10-09",
        "checkedAt": "2026-10-09"
      },
      "sourcePath": "public/aura-assets/uiErrorKenney.46e67425.ogg",
      "outputPath": "public/aura-assets/uiErrorKenney.46e67425.ogg",
      "license": "CC0-1.0",
      "author": "Kenney",
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
      "thumbnailUrl": "/aura-assets/uiErrorKenney.thumb.svg",
      "quality": "release",
      "role": "prop"
    },
  },
  "uiSelectKenney": {
    type: "audio",
    format: "ogg",
    url: "/aura-assets/uiSelectKenney.aec0c31e.ogg",
    hash: "sha256-aec0c31ea934a35936ae0d2ab8fac8123c93aa5647f935853a58dbaf90278b7a",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 5468,
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
        "sourcePath": "public/aura-assets/uiSelectKenney.aec0c31e.ogg",
        "sourcePage": "https://kenney.nl/assets/interface-sounds",
        "downloadUrl": "https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip",
        "sourceUrl": "https://kenney.nl/assets/interface-sounds",
        "license": "CC0-1.0",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Kenney",
        "retrievedAt": "2026-10-09",
        "checkedAt": "2026-10-09"
      },
      "sourcePath": "public/aura-assets/uiSelectKenney.aec0c31e.ogg",
      "outputPath": "public/aura-assets/uiSelectKenney.aec0c31e.ogg",
      "license": "CC0-1.0",
      "author": "Kenney",
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
      "thumbnailUrl": "/aura-assets/uiSelectKenney.thumb.svg",
      "quality": "release",
      "role": "prop"
    },
  },
  "uiSwitchKenney": {
    type: "audio",
    format: "ogg",
    url: "/aura-assets/uiSwitchKenney.3b74efad.ogg",
    hash: "sha256-3b74efad87f1e69dbd1d05c5ad952ab90859b5a3d11da6ec5bd79b4f03b42afa",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 6753,
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
        "sourcePath": "public/aura-assets/uiSwitchKenney.3b74efad.ogg",
        "sourcePage": "https://kenney.nl/assets/interface-sounds",
        "downloadUrl": "https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip",
        "sourceUrl": "https://kenney.nl/assets/interface-sounds",
        "license": "CC0-1.0",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Kenney",
        "retrievedAt": "2026-10-09",
        "checkedAt": "2026-10-09"
      },
      "sourcePath": "public/aura-assets/uiSwitchKenney.3b74efad.ogg",
      "outputPath": "public/aura-assets/uiSwitchKenney.3b74efad.ogg",
      "license": "CC0-1.0",
      "author": "Kenney",
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
      "thumbnailUrl": "/aura-assets/uiSwitchKenney.thumb.svg",
      "quality": "release",
      "role": "prop"
    },
  },
  "uiToggleKenney": {
    type: "audio",
    format: "ogg",
    url: "/aura-assets/uiToggleKenney.ca1d2dde.ogg",
    hash: "sha256-ca1d2dde5f0b286abac4f070e23edab8f30927c8a533665cdf2ac6492a415e49",
    bounds: [
      0,
      0,
      0
    ],
    sizeBytes: 7369,
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
        "sourcePath": "public/aura-assets/uiToggleKenney.ca1d2dde.ogg",
        "sourcePage": "https://kenney.nl/assets/interface-sounds",
        "downloadUrl": "https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip",
        "sourceUrl": "https://kenney.nl/assets/interface-sounds",
        "license": "CC0-1.0",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "author": "Kenney",
        "retrievedAt": "2026-10-09",
        "checkedAt": "2026-10-09"
      },
      "sourcePath": "public/aura-assets/uiToggleKenney.ca1d2dde.ogg",
      "outputPath": "public/aura-assets/uiToggleKenney.ca1d2dde.ogg",
      "license": "CC0-1.0",
      "author": "Kenney",
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
      "thumbnailUrl": "/aura-assets/uiToggleKenney.thumb.svg",
      "quality": "release",
      "role": "prop"
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
