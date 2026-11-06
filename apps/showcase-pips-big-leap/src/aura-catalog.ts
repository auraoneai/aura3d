import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "leapBaseCanopy": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "leapBaseGarden": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "leapBaseMeadow": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "leapBaseMillpond": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "leapBeetle": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "leapBeetleAnim": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "leapHedgehog": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean }; };
  readonly "pipsBrambleback": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsCheckpointFlag": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsGoldenAcorn": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsPip": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsSungate": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "pipsSunseed": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "leapBaseCanopy": {
    type: "model",
    format: "glb",
    url: "/aura-assets/leapBaseCanopy.1ac50631.glb",
    hash: "sha256-1ac506313a8854fd254ea65ea4338a87442aaa73b8768c3d7b9c31269f9ed327",
    integrity: {
      "version": 1,
      "digest": "sha256-1ac506313a8854fd254ea65ea4338a87442aaa73b8768c3d7b9c31269f9ed327"
    },
    bounds: [
      1.722,
      0.695,
      1.903
    ],
    sizeBytes: 1192020,
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
        "sourcePath": "public/aura-assets/leapBaseCanopy.1ac50631.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, pips-big-leap/leapBaseCanopy). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:39:55.921Z",
        "evidence": [
          "aura-evidence/meshy/leapBaseCanopy.rights.209061eeb72d.json",
          "aura-evidence/meshy/leapBaseCanopy.metadata.6cf10074989b.json",
          "public/aura-assets/leapBaseCanopy.meshy-candidate.8677baf0.png"
        ],
        "checkedAt": "2026-11-04T04:39:55.921Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/leapBaseCanopy.1ac50631.glb",
      "outputPath": "public/aura-assets/leapBaseCanopy.1ac50631.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.86,
          -0.348,
          -0.952
        ],
        "max": [
          0.862,
          0.347,
          0.951
        ],
        "size": [
          1.722,
          0.695,
          1.903
        ],
        "center": [
          0.001,
          -0.001,
          -0.001
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
      "thumbnailUrl": "/aura-assets/leapBaseCanopy.thumb.svg",
      "quality": "candidate",
      "role": "environment",
      "renderedProbe": {
        "url": "/aura-assets/leapBaseCanopy.meshy-candidate.8677baf0.png",
        "kind": "manual-inspection",
        "sha256": "sha256-8677baf0b874a825285a22c75c376e09bc60d684710e5d3756e392ee4ba65546",
        "checkedAt": "2026-11-04T05:05:18.958Z"
      }
    },
  },
  "leapBaseGarden": {
    type: "model",
    format: "glb",
    url: "/aura-assets/leapBaseGarden.2e280ae8.glb",
    hash: "sha256-2e280ae8942a74ee0e5513ccefa902c985fcbe6ef71c8a4179eadf8373354717",
    integrity: {
      "version": 1,
      "digest": "sha256-2e280ae8942a74ee0e5513ccefa902c985fcbe6ef71c8a4179eadf8373354717"
    },
    bounds: [
      1.898,
      0.669,
      1.618
    ],
    sizeBytes: 2300356,
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
        "sourcePath": "public/aura-assets/leapBaseGarden.2e280ae8.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, pips-big-leap/leapBaseGarden). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:43:13.153Z",
        "evidence": [
          "aura-evidence/meshy/leapBaseGarden.rights.6af9f8899a38.json",
          "aura-evidence/meshy/leapBaseGarden.metadata.a6f284322822.json",
          "public/aura-assets/leapBaseGarden.meshy-candidate.d9649bad.png"
        ],
        "checkedAt": "2026-11-04T04:43:13.153Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/leapBaseGarden.2e280ae8.glb",
      "outputPath": "public/aura-assets/leapBaseGarden.2e280ae8.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.944,
          -0.34,
          -0.812
        ],
        "max": [
          0.954,
          0.33,
          0.806
        ],
        "size": [
          1.898,
          0.669,
          1.618
        ],
        "center": [
          0.005,
          -0.005,
          -0.003
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
      "thumbnailUrl": "/aura-assets/leapBaseGarden.thumb.svg",
      "quality": "candidate",
      "role": "environment",
      "renderedProbe": {
        "url": "/aura-assets/leapBaseGarden.meshy-candidate.d9649bad.png",
        "kind": "manual-inspection",
        "sha256": "sha256-d9649bad662fe510bdb342b2197f34b2a9a2f0d4555aaafdbd168da9ca816a7d",
        "checkedAt": "2026-11-04T05:05:15.067Z"
      }
    },
  },
  "leapBaseMeadow": {
    type: "model",
    format: "glb",
    url: "/aura-assets/leapBaseMeadow.db3308e9.glb",
    hash: "sha256-db3308e915f0fc7bad7439049d6799eec493a4cfe60f991727329cb558004ac9",
    integrity: {
      "version": 1,
      "digest": "sha256-db3308e915f0fc7bad7439049d6799eec493a4cfe60f991727329cb558004ac9"
    },
    bounds: [
      1.884,
      0.495,
      1.897
    ],
    sizeBytes: 1496952,
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
        "sourcePath": "public/aura-assets/leapBaseMeadow.db3308e9.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, pips-big-leap/leapBaseMeadow). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:42:04.327Z",
        "evidence": [
          "aura-evidence/meshy/leapBaseMeadow.rights.aceb5d3cd0b3.json",
          "aura-evidence/meshy/leapBaseMeadow.metadata.2d2ae239c4b3.json",
          "public/aura-assets/leapBaseMeadow.meshy-candidate.3da6f3ea.png"
        ],
        "checkedAt": "2026-11-04T04:42:04.327Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/leapBaseMeadow.db3308e9.glb",
      "outputPath": "public/aura-assets/leapBaseMeadow.db3308e9.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.947,
          -0.245,
          -0.952
        ],
        "max": [
          0.937,
          0.25,
          0.945
        ],
        "size": [
          1.884,
          0.495,
          1.897
        ],
        "center": [
          -0.005,
          0.003,
          -0.003
        ],
        "maxDimension": 1.897,
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
      "thumbnailUrl": "/aura-assets/leapBaseMeadow.thumb.svg",
      "quality": "candidate",
      "role": "environment",
      "renderedProbe": {
        "url": "/aura-assets/leapBaseMeadow.meshy-candidate.3da6f3ea.png",
        "kind": "manual-inspection",
        "sha256": "sha256-3da6f3ea49b4b0d315bc3df21a53248f887ffde3239a6ff629620893676dba4e",
        "checkedAt": "2026-11-04T05:05:25.508Z"
      }
    },
  },
  "leapBaseMillpond": {
    type: "model",
    format: "glb",
    url: "/aura-assets/leapBaseMillpond.975e0e54.glb",
    hash: "sha256-975e0e54dae17f9bc4f5434cc147d46c4a885ca8eb69891d6c3e12be2925914c",
    integrity: {
      "version": 1,
      "digest": "sha256-975e0e54dae17f9bc4f5434cc147d46c4a885ca8eb69891d6c3e12be2925914c"
    },
    bounds: [
      1.89,
      1.139,
      1.902
    ],
    sizeBytes: 1182868,
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
        "sourcePath": "public/aura-assets/leapBaseMillpond.975e0e54.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, pips-big-leap/leapBaseMillpond). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:40:13.503Z",
        "evidence": [
          "aura-evidence/meshy/leapBaseMillpond.rights.e94169b0f1fa.json",
          "aura-evidence/meshy/leapBaseMillpond.metadata.d64c5d6ce201.json",
          "public/aura-assets/leapBaseMillpond.meshy-candidate.3ae16cab.png"
        ],
        "checkedAt": "2026-11-04T04:40:13.503Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/leapBaseMillpond.975e0e54.glb",
      "outputPath": "public/aura-assets/leapBaseMillpond.975e0e54.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.949,
          -0.569,
          -0.952
        ],
        "max": [
          0.941,
          0.57,
          0.951
        ],
        "size": [
          1.89,
          1.139,
          1.902
        ],
        "center": [
          -0.004,
          0.001,
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
      "thumbnailUrl": "/aura-assets/leapBaseMillpond.thumb.svg",
      "quality": "candidate",
      "role": "environment",
      "renderedProbe": {
        "url": "/aura-assets/leapBaseMillpond.meshy-candidate.3ae16cab.png",
        "kind": "manual-inspection",
        "sha256": "sha256-3ae16caba849167c889324426f939fcaf8fe1574a59d28e90db165b426cf9926",
        "checkedAt": "2026-11-04T05:05:20.145Z"
      }
    },
  },
  "leapBeetle": {
    type: "model",
    format: "glb",
    url: "/aura-assets/leapBeetle.dec49842.glb",
    hash: "sha256-dec498424adac49e471eb8c924b0ad0ac2cc3cda1dbeae3c80da82687d2a53f5",
    integrity: {
      "version": 1,
      "digest": "sha256-dec498424adac49e471eb8c924b0ad0ac2cc3cda1dbeae3c80da82687d2a53f5"
    },
    bounds: [
      1.377,
      1.903,
      0.589
    ],
    sizeBytes: 1380760,
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
        "sourcePath": "public/aura-assets/leapBeetle.dec49842.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, pips-big-leap/leapBeetle). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:18:37.381Z",
        "evidence": [
          "aura-evidence/meshy/leapBeetle.rights.873641dd6e46.json",
          "aura-evidence/meshy/leapBeetle.metadata.205ff20318b7.json",
          "public/aura-assets/leapBeetle.meshy-candidate.0c82a572.png"
        ],
        "checkedAt": "2026-11-04T04:18:37.381Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/leapBeetle.dec49842.glb",
      "outputPath": "public/aura-assets/leapBeetle.dec49842.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.689,
          -0.952,
          -0.295
        ],
        "max": [
          0.688,
          0.951,
          0.294
        ],
        "size": [
          1.377,
          1.903,
          0.589
        ],
        "center": [
          0,
          -0.001,
          -0.001
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
      "thumbnailUrl": "/aura-assets/leapBeetle.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/leapBeetle.meshy-candidate.0c82a572.png",
        "kind": "manual-inspection",
        "sha256": "sha256-0c82a572b576d3d75e961c3197f6fdd68d868c8f4492f709271828ed8963b8a0",
        "checkedAt": "2026-11-04T05:05:27.413Z"
      }
    },
  },
  "leapBeetleAnim": {
    type: "model",
    format: "glb",
    url: "/aura-assets/leapBeetleAnim.2cf51094.glb",
    hash: "sha256-2cf510941bb8fac8dd69e65d445df4b2a45babf392c431a0c65752e5b5ac56c6",
    bounds: [
      0.007,
      0.01,
      0.002
    ],
    sizeBytes: 2530192,
    metadata: {
      "materials": [
        "Material_0"
      ],
      "animations": [
        "idle",
        "wave",
        "cheer"
      ],
      "animationMetadata": {
        "clipCount": 3,
        "clips": [
          {
            "index": 0,
            "name": "idle",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Head",
              "neck",
              "LeftHand",
              "LeftForeArm",
              "LeftArm",
              "LeftShoulder",
              "RightHand",
              "RightForeArm",
              "RightArm",
              "RightShoulder",
              "Spine",
              "Spine01",
              "Spine02",
              "LeftToeBase",
              "LeftFoot",
              "LeftLeg",
              "LeftUpLeg",
              "RightToeBase",
              "RightFoot",
              "RightLeg",
              "RightUpLeg",
              "Hips"
            ],
            "duration": 1.899999976158142,
            "hasRootMotionCandidate": false,
            "frameRate": 29.999974966070084
          },
          {
            "index": 1,
            "name": "wave",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Head",
              "neck",
              "LeftHand",
              "LeftForeArm",
              "LeftArm",
              "LeftShoulder",
              "RightHand",
              "RightForeArm",
              "RightArm",
              "RightShoulder",
              "Spine",
              "Spine01",
              "Spine02",
              "LeftToeBase",
              "LeftFoot",
              "LeftLeg",
              "LeftUpLeg",
              "RightToeBase",
              "RightFoot",
              "RightLeg",
              "RightUpLeg",
              "Hips"
            ],
            "duration": 4.133333206176758,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00001519919212
          },
          {
            "index": 2,
            "name": "cheer",
            "channelCount": 66,
            "samplerCount": 66,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Head",
              "neck",
              "LeftHand",
              "LeftForeArm",
              "LeftArm",
              "LeftShoulder",
              "RightHand",
              "RightForeArm",
              "RightArm",
              "RightShoulder",
              "Spine",
              "Spine01",
              "Spine02",
              "LeftToeBase",
              "LeftFoot",
              "LeftLeg",
              "LeftUpLeg",
              "RightToeBase",
              "RightFoot",
              "RightLeg",
              "RightUpLeg",
              "Hips"
            ],
            "duration": 9.033333778381348,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 3 embedded animation clips."
        ]
      },
      "humanoid": true,
      "humanoidStatus": "humanoid",
      "humanoidConfidence": "high",
      "skeleton": {
        "skinCount": 1,
        "jointCount": 24,
        "skins": [
          {
            "index": 0,
            "name": "Armature",
            "jointCount": 24,
            "joints": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ]
          }
        ],
        "messages": [
          "Detected 1 skin with 24 unique joints."
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
        "nodeCount": 26,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 3,
        "skinCount": 1,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Armature"
        ],
        "maxDepth": 9,
        "messages": [
          "Detected 26 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/leapBeetleAnim.2cf51094.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-06 through the AuraOne Meshy account via Kiro Prism rigged/animated by Meshy from a Meshy-generated or game-owned mesh (GU47 WP-36, pips-big-leap/leapBeetleAnimR2). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-06T05:37:49.725Z",
        "evidence": [
          "aura-evidence/meshy/leapBeetleAnim.rights.64ae6e25ce1c.json",
          "aura-evidence/meshy/leapBeetleAnim.metadata.091ba5caf27d.json",
          "public/aura-assets/leapBeetleAnim.meshy-candidate.cb870a08.png"
        ],
        "checkedAt": "2026-11-06T05:37:49.725Z"
      },
      "sourcePath": "public/aura-assets/leapBeetleAnim.2cf51094.glb",
      "outputPath": "public/aura-assets/leapBeetleAnim.2cf51094.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.004,
          0,
          -0.001
        ],
        "max": [
          0.004,
          0.01,
          0.001
        ],
        "size": [
          0.007,
          0.01,
          0.002
        ],
        "center": [
          0,
          0.005,
          0
        ],
        "maxDimension": 0.01,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "Material_0",
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
        "head_end",
        "headfront",
        "Head",
        "neck",
        "LeftHand",
        "LeftForeArm",
        "LeftArm",
        "LeftShoulder",
        "RightHand",
        "RightForeArm",
        "RightArm",
        "RightShoulder",
        "Spine",
        "Spine01",
        "Spine02",
        "LeftToeBase",
        "LeftFoot",
        "LeftLeg",
        "LeftUpLeg",
        "RightToeBase",
        "RightFoot",
        "RightLeg",
        "RightUpLeg",
        "Hips",
        "char1",
        "Armature"
      ],
      "textures": [
        "Image_2",
        "Image_0",
        "Image_1"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/leapBeetleAnim.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/leapBeetleAnim.meshy-candidate.cb870a08.png",
        "kind": "manual-inspection",
        "sha256": "sha256-cb870a089b47ccf797c010313a1b03611dfd3ed439ce8746c46c93e2d32a00c1",
        "checkedAt": "2026-11-06T06:03:50.234Z"
      }
    },
  },
  "leapHedgehog": {
    type: "model",
    format: "glb",
    url: "/aura-assets/leapHedgehog.1fe9217f.glb",
    hash: "sha256-1fe9217fe8160eca0888b1eda62f18ce2a6bad1e234374df3b3c74fbf85e532b",
    integrity: {
      "version": 1,
      "digest": "sha256-1fe9217fe8160eca0888b1eda62f18ce2a6bad1e234374df3b3c74fbf85e532b"
    },
    bounds: [
      1.825,
      1.902,
      1.71
    ],
    sizeBytes: 1652060,
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
        "sourcePath": "public/aura-assets/leapHedgehog.1fe9217f.glb",
        "license": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseName": "Meshy generated asset (paid API, plan terms at generation time)",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-11-04 through the AuraOne Meshy account via Kiro Prism from an original text prompt (GU47 WP-36, pips-big-leap/leapHedgehog). Ownership and commercial-use terms are those of the account's Meshy plan at generation time. Not CC0; no exclusivity claimed.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-11-04T04:20:53.336Z",
        "evidence": [
          "aura-evidence/meshy/leapHedgehog.rights.6ba992133737.json",
          "aura-evidence/meshy/leapHedgehog.metadata.d64eead11ace.json",
          "public/aura-assets/leapHedgehog.meshy-candidate.5c257172.png"
        ],
        "checkedAt": "2026-11-04T04:20:53.336Z"
      },
      "modelInspection": {
        "version": 1,
        "status": "metadata-only"
      },
      "sourcePath": "public/aura-assets/leapHedgehog.1fe9217f.glb",
      "outputPath": "public/aura-assets/leapHedgehog.1fe9217f.glb",
      "license": "Meshy generated asset (paid API, plan terms at generation time)",
      "boundsMetadata": {
        "min": [
          -0.916,
          -0.952,
          -0.854
        ],
        "max": [
          0.91,
          0.95,
          0.856
        ],
        "size": [
          1.825,
          1.902,
          1.71
        ],
        "center": [
          -0.003,
          -0.001,
          0.001
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
      "thumbnailUrl": "/aura-assets/leapHedgehog.thumb.svg",
      "quality": "candidate",
      "role": "character",
      "renderedProbe": {
        "url": "/aura-assets/leapHedgehog.meshy-candidate.5c257172.png",
        "kind": "manual-inspection",
        "sha256": "sha256-5c2571726b9031e81b30830637738f1dc3fbefea8c593afe43459153faf6875f",
        "checkedAt": "2026-11-04T05:05:26.551Z"
      }
    },
  },
  "pipsBrambleback": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsBrambleback.6aaa3db3.glb",
    hash: "sha256-6aaa3db380dbc178045a7c39af698f997f0e87e588ece1e9e28836a47e9b87cb",
    bounds: [
      0.022,
      0.024,
      0.011
    ],
    sizeBytes: 2425048,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "Attack",
        "Hit_Reaction",
        "Dead",
        "Quick_Walk",
        "Chest_Pound_Taunt"
      ],
      // NOTE(typegen skew): the current typegen emits animationClips as
      // {name,duration,channelCount} objects, but `AuraAssetMetadata` still
      // declares `readonly string[]`; kept in the declared shape here (full
      // clip records remain under `animationMetadata.clips`) until the shared
      // type is widened.
      "animationClips": [
        "Idle",
        "Attack",
        "Hit_Reaction",
        "Dead",
        "Quick_Walk",
        "Chest_Pound_Taunt"
      ],
      "animationMetadata": {
        "clipCount": 6,
        "clips": [
          {
            "index": 0,
            "name": "Idle",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 4,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 1,
            "name": "Attack",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 2.8,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 2,
            "name": "Hit_Reaction",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.6333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "Dead",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 2.966666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 4,
            "name": "Quick_Walk",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 3,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 5,
            "name": "Chest_Pound_Taunt",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 4.833333333333333,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 6 embedded animation clips."
        ]
      },
      "humanoid": true,
      "humanoidStatus": "humanoid",
      "humanoidConfidence": "high",
      "skeleton": {
        "skinCount": 1,
        "jointCount": 24,
        "skins": [
          {
            "index": 0,
            "name": "Armature",
            "jointCount": 24,
            "joints": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ]
          }
        ],
        "messages": [
          "Detected 1 skin with 24 unique joints."
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
        "nodeCount": 26,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 1,
        "animationClipCount": 6,
        "skinCount": 1,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Armature"
        ],
        "maxDepth": 9,
        "messages": [
          "Detected 26 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pipsBrambleback.6aaa3db3.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:36:30.616Z",
        "evidence": [
          "aura-evidence/meshy/pipsBrambleback.rights.968cd708eaf2.json",
          "aura-evidence/meshy/pipsBrambleback.metadata.88da139d2fbd.json",
          "public/aura-assets/pipsBrambleback.meshy-candidate.3c4dff50.png"
        ],
        "checkedAt": "2026-10-17T09:36:30.616Z"
      },
      "sourcePath": "public/aura-assets/pipsBrambleback.6aaa3db3.glb",
      "outputPath": "public/aura-assets/pipsBrambleback.6aaa3db3.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.011,
          0,
          -0.006
        ],
        "max": [
          0.011,
          0.024,
          0.006
        ],
        "size": [
          0.022,
          0.024,
          0.011
        ],
        "center": [
          0,
          0.012,
          0
        ],
        "maxDimension": 0.024,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "BakedMaterial",
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
        "head_end",
        "headfront",
        "Head",
        "neck",
        "LeftHand",
        "LeftForeArm",
        "LeftArm",
        "LeftShoulder",
        "RightHand",
        "RightForeArm",
        "RightArm",
        "RightShoulder",
        "Spine",
        "Spine01",
        "Spine02",
        "LeftToeBase",
        "LeftFoot",
        "LeftLeg",
        "LeftUpLeg",
        "RightToeBase",
        "RightFoot",
        "RightLeg",
        "RightUpLeg",
        "Hips",
        "char1",
        "Armature"
      ],
      "textures": [
        "BakedMaterial_baseColor"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsBrambleback.thumb.svg",
      "quality": "candidate",
      "role": "enemy",
      "renderedProbe": {
        "url": "/aura-assets/pipsBrambleback.meshy-candidate.3c4dff50.png",
        "kind": "manual-inspection",
        "sha256": "sha256-3c4dff501c0dfd8619b141ad3f1775abb32bc61ed79e4863b73197aac58660b7",
        "checkedAt": "2026-10-17T09:46:19.895Z"
      }
    },
  },
  "pipsCheckpointFlag": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsCheckpointFlag.9b30fdba.glb",
    hash: "sha256-9b30fdbaf5a20aa2b0f3694a913b6b24c177a9e901fbbfdc1b74c7c4ebcee60c",
    bounds: [
      0.527,
      1.899,
      0.362
    ],
    sizeBytes: 286560,
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
        "textureCount": 1,
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
        "sourcePath": "public/aura-assets/pipsCheckpointFlag.9b30fdba.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:19:05.662Z",
        "evidence": [
          "aura-evidence/meshy/pipsCheckpointFlag.rights.968cd708eaf2.json",
          "aura-evidence/meshy/pipsCheckpointFlag.metadata.d0e37c495a77.json",
          "public/aura-assets/pipsCheckpointFlag.meshy-candidate.40c7021b.png"
        ],
        "checkedAt": "2026-10-17T09:19:05.662Z"
      },
      "sourcePath": "public/aura-assets/pipsCheckpointFlag.9b30fdba.glb",
      "outputPath": "public/aura-assets/pipsCheckpointFlag.9b30fdba.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.271,
          -0.951,
          -0.183
        ],
        "max": [
          0.256,
          0.948,
          0.179
        ],
        "size": [
          0.527,
          1.899,
          0.362
        ],
        "center": [
          -0.007,
          -0.002,
          -0.002
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
          "alphaMode": "OPAQUE",
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
        "image-0"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsCheckpointFlag.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/pipsCheckpointFlag.meshy-candidate.40c7021b.png",
        "kind": "manual-inspection",
        "sha256": "sha256-40c7021b1ea747a157ebd2698b99924d2f5f54aa729516b24d899e9bf33e7203",
        "checkedAt": "2026-10-17T09:46:31.573Z"
      }
    },
  },
  "pipsGoldenAcorn": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsGoldenAcorn.a851976d.glb",
    hash: "sha256-a851976d617249f305b0fb0f03deb223b62494f4d6159e80d9970e4956454f6b",
    bounds: [
      1.001,
      1.895,
      1.002
    ],
    sizeBytes: 159468,
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
        "textureCount": 1,
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
        "sourcePath": "public/aura-assets/pipsGoldenAcorn.a851976d.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:18:56.803Z",
        "evidence": [
          "aura-evidence/meshy/pipsGoldenAcorn.rights.968cd708eaf2.json",
          "aura-evidence/meshy/pipsGoldenAcorn.metadata.07e12feff11d.json",
          "public/aura-assets/pipsGoldenAcorn.meshy-candidate.27c4dd6c.png"
        ],
        "checkedAt": "2026-10-17T09:18:56.803Z"
      },
      "sourcePath": "public/aura-assets/pipsGoldenAcorn.a851976d.glb",
      "outputPath": "public/aura-assets/pipsGoldenAcorn.a851976d.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.504,
          -0.952,
          -0.504
        ],
        "max": [
          0.5,
          0.947,
          0.5
        ],
        "size": [
          1.005,
          1.899,
          1.005
        ],
        "center": [
          -0.002,
          -0.003,
          -0.002
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
          "alphaMode": "OPAQUE",
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
        "image-0"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsGoldenAcorn.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/pipsGoldenAcorn.meshy-candidate.27c4dd6c.png",
        "kind": "manual-inspection",
        "sha256": "sha256-27c4dd6c7b4651bf50a7500d0811360190dead3a9628eac9a21fce47e71129cd",
        "checkedAt": "2026-10-17T09:46:31.369Z"
      }
    },
  },
  "pipsPip": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsPip.fcd4256f.glb",
    hash: "sha256-fcd4256f0224f438f30bc72957bedca97de7b4728535118bb3b8b344b8860bfd",
    bounds: [
      0.007,
      0.009,
      0.005
    ],
    sizeBytes: 2078616,
    metadata: {
      "materials": [
        "BakedMaterial"
      ],
      "animations": [
        "Idle",
        "RunFast",
        "Regular_Jump",
        "happy_jump_m",
        "Dead",
        "Victory_Cheer",
        "Quick_Walk"
      ],
      // NOTE(typegen skew): same as pipsBrambleback — objects → declared
      // `readonly string[]`; full clip records remain in `animationMetadata`.
      "animationClips": [
        "Idle",
        "RunFast",
        "Regular_Jump",
        "happy_jump_m",
        "Dead",
        "Victory_Cheer",
        "Quick_Walk"
      ],
      "animationMetadata": {
        "clipCount": 7,
        "clips": [
          {
            "index": 0,
            "name": "Idle",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 4,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 1,
            "name": "RunFast",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 0.4666666666666667,
            "hasRootMotionCandidate": false,
            "frameRate": 30.00000178813945
          },
          {
            "index": 2,
            "name": "Regular_Jump",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 1.8333333333333333,
            "hasRootMotionCandidate": true,
            "frameRate": 30.00000178813945
          },
          {
            "index": 3,
            "name": "happy_jump_m",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 9.833333333333334,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 4,
            "name": "Dead",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 2.966666666666667,
            "hasRootMotionCandidate": true,
            "frameRate": 30.000028610256777
          },
          {
            "index": 5,
            "name": "Victory_Cheer",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 9.333333333333334,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          },
          {
            "index": 6,
            "name": "Quick_Walk",
            "channelCount": 72,
            "samplerCount": 72,
            "targetPaths": [
              "translation",
              "rotation",
              "scale"
            ],
            "targetNodes": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ],
            "duration": 3,
            "hasRootMotionCandidate": false,
            "frameRate": 30.000028610256777
          }
        ],
        "messages": [
          "Detected 7 embedded animation clips."
        ]
      },
      "humanoid": true,
      "humanoidStatus": "humanoid",
      "humanoidConfidence": "high",
      "skeleton": {
        "skinCount": 1,
        "jointCount": 24,
        "skins": [
          {
            "index": 0,
            "name": "Armature",
            "jointCount": 24,
            "joints": [
              "Hips",
              "Spine02",
              "Spine01",
              "Spine",
              "neck",
              "Head",
              "head_end",
              "headfront",
              "LeftShoulder",
              "LeftArm",
              "LeftForeArm",
              "LeftHand",
              "RightShoulder",
              "RightArm",
              "RightForeArm",
              "RightHand",
              "LeftUpLeg",
              "LeftLeg",
              "LeftFoot",
              "LeftToeBase",
              "RightUpLeg",
              "RightLeg",
              "RightFoot",
              "RightToeBase"
            ]
          }
        ],
        "messages": [
          "Detected 1 skin with 24 unique joints."
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
        "nodeCount": 26,
        "meshCount": 1,
        "materialCount": 1,
        "textureCount": 1,
        "animationClipCount": 7,
        "skinCount": 1,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "Armature"
        ],
        "maxDepth": 9,
        "messages": [
          "Detected 26 nodes across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/pipsPip.fcd4256f.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:36:01.143Z",
        "evidence": [
          "aura-evidence/meshy/pipsPip.rights.968cd708eaf2.json",
          "aura-evidence/meshy/pipsPip.metadata.20932c2fe887.json",
          "public/aura-assets/pipsPip.meshy-candidate.b6be1123.png"
        ],
        "checkedAt": "2026-10-17T09:36:01.143Z"
      },
      "sourcePath": "public/aura-assets/pipsPip.fcd4256f.glb",
      "outputPath": "public/aura-assets/pipsPip.fcd4256f.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.003,
          0,
          -0.002
        ],
        "max": [
          0.003,
          0.009,
          0.002
        ],
        "size": [
          0.007,
          0.009,
          0.005
        ],
        "center": [
          0,
          0.004,
          0
        ],
        "maxDimension": 0.009,
        "grounded": true
      },
      "materialMetadata": [
        {
          "name": "BakedMaterial",
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
        "head_end",
        "headfront",
        "Head",
        "neck",
        "LeftHand",
        "LeftForeArm",
        "LeftArm",
        "LeftShoulder",
        "RightHand",
        "RightForeArm",
        "RightArm",
        "RightShoulder",
        "Spine",
        "Spine01",
        "Spine02",
        "LeftToeBase",
        "LeftFoot",
        "LeftLeg",
        "LeftUpLeg",
        "RightToeBase",
        "RightFoot",
        "RightLeg",
        "RightUpLeg",
        "Hips",
        "char1",
        "Armature"
      ],
      "textures": [
        "BakedMaterial_baseColor"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsPip.thumb.svg",
      "quality": "candidate",
      "role": "hero",
      "renderedProbe": {
        "url": "/aura-assets/pipsPip.meshy-candidate.b6be1123.png",
        "kind": "manual-inspection",
        "sha256": "sha256-b6be1123d3675eef2c3188ac411caca7e77e07bb4b78b642239f1a58456c0f41",
        "checkedAt": "2026-10-17T09:46:13.309Z"
      }
    },
  },
  "pipsSungate": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsSungate.2ec2202c.glb",
    hash: "sha256-2ec2202c361f5648851547f8c046531c6048424d00192416f791cb9a65fdf3d9",
    bounds: [
      1.267,
      1.898,
      0.409
    ],
    sizeBytes: 434388,
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
        "textureCount": 1,
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
        "sourcePath": "public/aura-assets/pipsSungate.2ec2202c.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:20:21.088Z",
        "evidence": [
          "aura-evidence/meshy/pipsSungate.rights.968cd708eaf2.json",
          "aura-evidence/meshy/pipsSungate.metadata.6d4b9d2da9da.json",
          "public/aura-assets/pipsSungate.meshy-candidate.45e48287.png"
        ],
        "checkedAt": "2026-10-17T09:20:21.088Z"
      },
      "sourcePath": "public/aura-assets/pipsSungate.2ec2202c.glb",
      "outputPath": "public/aura-assets/pipsSungate.2ec2202c.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.636,
          -0.952,
          -0.207
        ],
        "max": [
          0.632,
          0.946,
          0.202
        ],
        "size": [
          1.268,
          1.897,
          0.409
        ],
        "center": [
          -0.002,
          -0.003,
          -0.003
        ],
        "maxDimension": 1.897,
        "grounded": false
      },
      "materialMetadata": [
        {
          "name": "material-0",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "alphaMode": "OPAQUE",
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
        "image-0"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsSungate.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/pipsSungate.meshy-candidate.45e48287.png",
        "kind": "manual-inspection",
        "sha256": "sha256-45e48287513813a75447c230f10e4215fc4e4248d5c56b76d3a49a2c46216e55",
        "checkedAt": "2026-10-17T09:46:31.773Z"
      }
    },
  },
  "pipsSunseed": {
    type: "model",
    format: "glb",
    url: "/aura-assets/pipsSunseed.b52c5a99.glb",
    hash: "sha256-b52c5a99b0c5596a0c35632a24274ca6f888b00d3269ed160b50824c42e8b20f",
    bounds: [
      1.898,
      0.904,
      0.837
    ],
    sizeBytes: 159684,
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
        "textureCount": 1,
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
        "sourcePath": "public/aura-assets/pipsSunseed.b52c5a99.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated via the Meshy API under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-17T09:17:35.188Z",
        "evidence": [
          "aura-evidence/meshy/pipsSunseed.rights.968cd708eaf2.json",
          "aura-evidence/meshy/pipsSunseed.metadata.ae0fd21648ef.json",
          "public/aura-assets/pipsSunseed.meshy-candidate.938a7472.png"
        ],
        "checkedAt": "2026-10-17T09:17:35.188Z"
      },
      "sourcePath": "public/aura-assets/pipsSunseed.b52c5a99.glb",
      "outputPath": "public/aura-assets/pipsSunseed.b52c5a99.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.951,
          -0.452,
          -0.421
        ],
        "max": [
          0.947,
          0.454,
          0.418
        ],
        "size": [
          1.899,
          0.907,
          0.838
        ],
        "center": [
          -0.002,
          0.001,
          -0.001
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
          "alphaMode": "OPAQUE",
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
        "image-0"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/pipsSunseed.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/pipsSunseed.meshy-candidate.938a7472.png",
        "kind": "manual-inspection",
        "sha256": "sha256-938a74720d31b590bdec1fd2e2ea1f77b0334ce3841f9f0e99a5633e79734d71",
        "checkedAt": "2026-10-17T09:46:31.168Z"
      }
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
