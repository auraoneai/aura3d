import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "boostCanister": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "canyonCactus": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "canyonTrack": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "checkpointArch": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "desertMesa": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "heroKart": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "itemCrate": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "oilBarrel": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "purpleKart": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "rivalKart": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "tireStack": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "yellowKart": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "boostCanister": {
    type: "model",
    format: "glb",
    url: "/aura-assets/boostCanister.1233b9c7.glb",
    hash: "sha256-1233b9c7bf93b2d0cd0be9aface8fef5d0fad9a2e3f602b1fbf3f23c634b02f1",
    bounds: [
      1.606,
      1.902,
      1.427
    ],
    sizeBytes: 633484,
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
        "sourcePath": "artifacts/meshy/kart-boost-canister/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:04:11.020Z",
        "evidence": [
          "aura-evidence/meshy/boostCanister.rights.8f8012b08333.json",
          "aura-evidence/meshy/boostCanister.metadata.fcd20d0d1502.json",
          "public/aura-assets/boostCanister.meshy-candidate.3c9f46f1.png"
        ],
        "checkedAt": "2026-10-16T01:04:11.020Z"
      },
      "sourcePath": "artifacts/meshy/kart-boost-canister/model.glb",
      "outputPath": "public/aura-assets/boostCanister.1233b9c7.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.803,
          -0.952,
          -0.713
        ],
        "max": [
          0.803,
          0.95,
          0.713
        ],
        "size": [
          1.606,
          1.902,
          1.427
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
      "thumbnailUrl": "/aura-assets/boostCanister.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/boostCanister.meshy-candidate.3c9f46f1.png",
        "kind": "manual-inspection",
        "sha256": "sha256-3c9f46f13d41556fb356182d20351c39b5d5849747898ec7402462c9932f9ee2",
        "checkedAt": "2026-10-16T02:03:09.098Z"
      }
    },
  },
  "canyonCactus": {
    type: "model",
    format: "glb",
    url: "/aura-assets/canyonCactus.a55c8972.glb",
    hash: "sha256-a55c897281ddcb409c63391b9cf5c1c779cb0a5b23fe0575081aedc43cac836f",
    bounds: [
      0.839,
      1.905,
      0.226
    ],
    sizeBytes: 679512,
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
        "sourcePath": "artifacts/meshy/kart-cactus/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:02:12.510Z",
        "evidence": [
          "aura-evidence/meshy/canyonCactus.rights.8f8012b08333.json",
          "aura-evidence/meshy/canyonCactus.metadata.97572335a5fc.json",
          "public/aura-assets/canyonCactus.meshy-candidate.caa0bab2.png"
        ],
        "checkedAt": "2026-10-16T01:02:12.510Z"
      },
      "sourcePath": "artifacts/meshy/kart-cactus/model.glb",
      "outputPath": "public/aura-assets/canyonCactus.a55c8972.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.42,
          -0.952,
          -0.112
        ],
        "max": [
          0.419,
          0.953,
          0.114
        ],
        "size": [
          0.839,
          1.905,
          0.226
        ],
        "center": [
          0,
          0,
          0.001
        ],
        "maxDimension": 1.905,
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
      "thumbnailUrl": "/aura-assets/canyonCactus.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "renderedProbe": {
        "url": "/aura-assets/canyonCactus.meshy-candidate.caa0bab2.png",
        "kind": "manual-inspection",
        "sha256": "sha256-caa0bab25ee9d5bfd5a1f24180aae5e3a8068175b55778485d57aaffe93474a4",
        "checkedAt": "2026-10-16T02:03:09.095Z"
      }
    },
  },
  "canyonTrack": {
    type: "model",
    format: "glb",
    url: "/aura-assets/canyonTrack.0a2d9555.glb",
    hash: "sha256-0a2d95554241646560483cc3e9009034b4dad64502b3170bbfb25ecf43ac2de8",
    bounds: [
      1.903,
      0.525,
      1.457
    ],
    sizeBytes: 4437620,
    metadata: {
      "materials": [
        "BakedMaterial"
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
          "output_unwrapped"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "artifacts/meshy/kart-track-v2/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:27:01.045Z",
        "evidence": [
          "aura-evidence/meshy/canyonTrack.rights.8f8012b08333.json",
          "aura-evidence/meshy/canyonTrack.metadata.8581cd6e9ca5.json",
          "public/aura-assets/canyonTrack.meshy-candidate.834a636d.png"
        ],
        "checkedAt": "2026-10-16T01:27:01.045Z"
      },
      "sourcePath": "artifacts/meshy/kart-track-v2/model.glb",
      "outputPath": "public/aura-assets/canyonTrack.0a2d9555.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.264,
          -0.728
        ],
        "max": [
          0.951,
          0.262,
          0.729
        ],
        "size": [
          1.903,
          0.525,
          1.457
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
          "name": "BakedMaterial",
          "visible": true,
          "readable": true,
          "opacity": 1,
          "reasons": []
        }
      ],
      "orientation": {
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
        ]
      },
      "nodeNames": [
        "output_unwrapped"
      ],
      "textures": [
        "normal",
        "texture_0",
        "texture_0_metallic_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/canyonTrack.thumb.svg",
      "quality": "candidate",
      "role": "track",
      "renderedProbe": {
        "url": "/aura-assets/canyonTrack.meshy-candidate.834a636d.png",
        "kind": "manual-inspection",
        "sha256": "sha256-834a636d13242e788e51e60a2f8ca70ba20028f679562053d6e17c154a4204ec",
        "checkedAt": "2026-10-16T02:03:09.074Z"
      }
    },
  },
  "checkpointArch": {
    type: "model",
    format: "glb",
    url: "/aura-assets/checkpointArch.f7fee2d6.glb",
    hash: "sha256-f7fee2d66276eed2f01506a3a28878809291c54d186c2b4e6edfc671c9e8d9a5",
    bounds: [
      1.903,
      1.472,
      0.518
    ],
    sizeBytes: 991336,
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
        "sourcePath": "artifacts/meshy/kart-arch/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T00:34:51.222Z",
        "evidence": [
          "aura-evidence/meshy/checkpointArch.rights.8f8012b08333.json",
          "aura-evidence/meshy/checkpointArch.metadata.147b4e0f32c8.json",
          "public/aura-assets/checkpointArch.meshy-candidate.d40366a4.png"
        ],
        "checkedAt": "2026-10-16T00:34:51.222Z"
      },
      "sourcePath": "artifacts/meshy/kart-arch/model.glb",
      "outputPath": "public/aura-assets/checkpointArch.f7fee2d6.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.737,
          -0.259
        ],
        "max": [
          0.951,
          0.735,
          0.258
        ],
        "size": [
          1.903,
          1.472,
          0.518
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
      "thumbnailUrl": "/aura-assets/checkpointArch.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/checkpointArch.meshy-candidate.d40366a4.png",
        "kind": "manual-inspection",
        "sha256": "sha256-d40366a454c894d3ed813889a4417838e7754a7d8f71fb2a563bb07205ea6beb",
        "checkedAt": "2026-10-16T02:03:09.085Z"
      }
    },
  },
  "desertMesa": {
    type: "model",
    format: "glb",
    url: "/aura-assets/desertMesa.b1f0299c.glb",
    hash: "sha256-b1f0299c1e447f805f58afe79d0b916e4406cb5ce098efdecd3226c495a74476",
    bounds: [
      1.711,
      1.031,
      1.9
    ],
    sizeBytes: 807252,
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
        "sourcePath": "artifacts/meshy/kart-mesa/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:00:06.652Z",
        "evidence": [
          "aura-evidence/meshy/desertMesa.rights.8f8012b08333.json",
          "aura-evidence/meshy/desertMesa.metadata.fff4129469d8.json",
          "public/aura-assets/desertMesa.meshy-candidate.c30883eb.png"
        ],
        "checkedAt": "2026-10-16T01:00:06.652Z"
      },
      "sourcePath": "artifacts/meshy/kart-mesa/model.glb",
      "outputPath": "public/aura-assets/desertMesa.b1f0299c.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.865,
          -0.517,
          -0.95
        ],
        "max": [
          0.846,
          0.515,
          0.95
        ],
        "size": [
          1.711,
          1.031,
          1.9
        ],
        "center": [
          -0.009,
          -0.001,
          0
        ],
        "maxDimension": 1.9,
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
      "thumbnailUrl": "/aura-assets/desertMesa.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "renderedProbe": {
        "url": "/aura-assets/desertMesa.meshy-candidate.c30883eb.png",
        "kind": "manual-inspection",
        "sha256": "sha256-c30883ebe8be838133efd92d1fd0951e28d5e942cd065aac862183d7162b00ab",
        "checkedAt": "2026-10-16T02:03:09.092Z"
      }
    },
  },
  "heroKart": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heroKart.07989857.glb",
    hash: "sha256-07989857aa040c207f65e44fd26eff65b469c493a9fc27e075fdea4d680e0445",
    bounds: [
      1.902,
      0.916,
      1.006
    ],
    sizeBytes: 5766292,
    metadata: {
      "materials": [
        "BakedMaterial"
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
        "nodeCount": 5,
        "meshCount": 5,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "chassis_body",
          "wheel_fl",
          "wheel_fr",
          "wheel_rl",
          "wheel_rr"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 5 nodes across 5 roots."
        ]
      },
      "provenance": {
        "sourcePath": "artifacts/meshy/kart-hero/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:13:36.197Z",
        "evidence": [
          "aura-evidence/meshy/heroKart.rights.8f8012b08333.json",
          "aura-evidence/meshy/heroKart.metadata.868704e0cce8.json",
          "public/aura-assets/heroKart.meshy-candidate.f7242b74.png"
        ],
        "checkedAt": "2026-10-16T01:13:36.197Z"
      },
      "sourcePath": "artifacts/meshy/kart-hero/model.glb",
      "outputPath": "public/aura-assets/heroKart.07989857.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.459,
          -0.504
        ],
        "max": [
          0.95,
          0.457,
          0.502
        ],
        "size": [
          1.902,
          0.916,
          1.006
        ],
        "center": [
          -0.001,
          -0.001,
          -0.001
        ],
        "maxDimension": 1.902,
        "grounded": false
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
        ]
      },
      "nodeNames": [
        "chassis_body",
        "wheel_fl",
        "wheel_fr",
        "wheel_rl",
        "wheel_rr"
      ],
      "textures": [
        "normal",
        "texture_0",
        "texture_0_metallic_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/heroKart.thumb.svg",
      "quality": "candidate",
      "role": "vehicle",
      "renderedProbe": {
        "url": "/aura-assets/heroKart.meshy-candidate.f7242b74.png",
        "kind": "manual-inspection",
        "sha256": "sha256-f7242b74cf0a94e22545d8e5a8d3dabfd8fa10f1d7cfdd12917743137b4e98b8",
        "checkedAt": "2026-10-16T02:03:08.196Z"
      }
    },
  },
  "itemCrate": {
    type: "model",
    format: "glb",
    url: "/aura-assets/itemCrate.136eff30.glb",
    hash: "sha256-136eff302614d7e4623471a529d338b9220818033fe7420b94b16f929833d873",
    bounds: [
      1.902,
      1.277,
      1.902
    ],
    sizeBytes: 1087240,
    metadata: {
      "materials": [
        "BakedMaterial"
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
          "output_unwrapped"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "artifacts/meshy/kart-item-crate/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:29:07.939Z",
        "evidence": [
          "aura-evidence/meshy/itemCrate.rights.8f8012b08333.json",
          "aura-evidence/meshy/itemCrate.metadata.e5771215b5da.json",
          "public/aura-assets/itemCrate.meshy-candidate.30fdc3c2.png"
        ],
        "checkedAt": "2026-10-16T01:29:07.939Z"
      },
      "sourcePath": "artifacts/meshy/kart-item-crate/model.glb",
      "outputPath": "public/aura-assets/itemCrate.136eff30.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.951,
          -0.64,
          -0.951
        ],
        "max": [
          0.951,
          0.637,
          0.951
        ],
        "size": [
          1.902,
          1.277,
          1.902
        ],
        "center": [
          0,
          -0.002,
          0
        ],
        "maxDimension": 1.902,
        "grounded": false
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
        ]
      },
      "nodeNames": [
        "output_unwrapped"
      ],
      "textures": [
        "normal",
        "texture_0",
        "texture_0_metallic_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/itemCrate.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/itemCrate.meshy-candidate.30fdc3c2.png",
        "kind": "manual-inspection",
        "sha256": "sha256-30fdc3c2047e5aee09367eee1f6bb5f0a294ae6aa334d46e5893da733690e48b",
        "checkedAt": "2026-10-16T02:03:09.082Z"
      }
    },
  },
  "oilBarrel": {
    type: "model",
    format: "glb",
    url: "/aura-assets/oilBarrel.1ed0450a.glb",
    hash: "sha256-1ed0450a0173ee43cf6c910b80de53ddc9e718531c0f8007cd12a6b89ca6bf73",
    bounds: [
      1.606,
      1.903,
      1.604
    ],
    sizeBytes: 1172048,
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
        "sourcePath": "artifacts/meshy/kart-oil-barrel/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:06:49.474Z",
        "evidence": [
          "aura-evidence/meshy/oilBarrel.rights.8f8012b08333.json",
          "aura-evidence/meshy/oilBarrel.metadata.8d06e0d16951.json",
          "public/aura-assets/oilBarrel.meshy-candidate.49f4bd42.png"
        ],
        "checkedAt": "2026-10-16T01:06:49.474Z"
      },
      "sourcePath": "artifacts/meshy/kart-oil-barrel/model.glb",
      "outputPath": "public/aura-assets/oilBarrel.1ed0450a.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.802,
          -0.952,
          -0.804
        ],
        "max": [
          0.804,
          0.951,
          0.801
        ],
        "size": [
          1.606,
          1.903,
          1.604
        ],
        "center": [
          0.001,
          0,
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
      "thumbnailUrl": "/aura-assets/oilBarrel.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/oilBarrel.meshy-candidate.49f4bd42.png",
        "kind": "manual-inspection",
        "sha256": "sha256-49f4bd42f71fb0daafccf1a4c935cb9976ef7c99f201f5b03a7d16b6c8754483",
        "checkedAt": "2026-10-16T02:03:09.101Z"
      }
    },
  },
  "purpleKart": {
    type: "model",
    format: "glb",
    url: "/aura-assets/purpleKart.2ae51dd4.glb",
    hash: "sha256-2ae51dd42a378a1f7815a6313ab8e9011898d2934a78b055ff5cf6a06dd087dc",
    bounds: [
      1.904,
      1.368,
      1.272
    ],
    sizeBytes: 5473156,
    metadata: {
      "materials": [
        "BakedMaterial"
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
        "nodeCount": 5,
        "meshCount": 5,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "chassis_body",
          "wheel_fl",
          "wheel_fr",
          "wheel_rl",
          "wheel_rr"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 5 nodes across 5 roots."
        ]
      },
      "provenance": {
        "sourcePath": "artifacts/meshy/kart-purple/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:20:39.928Z",
        "evidence": [
          "aura-evidence/meshy/purpleKart.rights.8f8012b08333.json",
          "aura-evidence/meshy/purpleKart.metadata.abe65bf445a5.json",
          "public/aura-assets/purpleKart.meshy-candidate.59cad0e1.png"
        ],
        "checkedAt": "2026-10-16T01:20:39.928Z"
      },
      "sourcePath": "artifacts/meshy/kart-purple/model.glb",
      "outputPath": "public/aura-assets/purpleKart.2ae51dd4.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.684,
          -0.635
        ],
        "max": [
          0.952,
          0.684,
          0.636
        ],
        "size": [
          1.904,
          1.368,
          1.272
        ],
        "center": [
          0,
          0,
          0
        ],
        "maxDimension": 1.904,
        "grounded": false
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
        ]
      },
      "nodeNames": [
        "chassis_body",
        "wheel_fl",
        "wheel_fr",
        "wheel_rl",
        "wheel_rr"
      ],
      "textures": [
        "normal",
        "texture_0",
        "texture_0_metallic_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/purpleKart.thumb.svg",
      "quality": "candidate",
      "role": "vehicle",
      "renderedProbe": {
        "url": "/aura-assets/purpleKart.meshy-candidate.59cad0e1.png",
        "kind": "manual-inspection",
        "sha256": "sha256-59cad0e12288acb1603606925f40c9e9097ed590012dac326cf0f3bc2b01775e",
        "checkedAt": "2026-10-16T02:03:08.764Z"
      }
    },
  },
  "rivalKart": {
    type: "model",
    format: "glb",
    url: "/aura-assets/rivalKart.5d7073be.glb",
    hash: "sha256-5d7073be0f106273bdd1b85a667ad1005426fa7f4616b15a341af4a4854607ec",
    bounds: [
      1.902,
      1.324,
      1.379
    ],
    sizeBytes: 5820860,
    metadata: {
      "materials": [
        "BakedMaterial"
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
        "nodeCount": 5,
        "meshCount": 5,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "chassis_body",
          "wheel_fl",
          "wheel_fr",
          "wheel_rl",
          "wheel_rr"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 5 nodes across 5 roots."
        ]
      },
      "provenance": {
        "sourcePath": "artifacts/meshy/kart-rival/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:17:06.845Z",
        "evidence": [
          "aura-evidence/meshy/rivalKart.rights.8f8012b08333.json",
          "aura-evidence/meshy/rivalKart.metadata.0c1e2da3b9f2.json",
          "public/aura-assets/rivalKart.meshy-candidate.02597850.png"
        ],
        "checkedAt": "2026-10-16T01:17:06.845Z"
      },
      "sourcePath": "artifacts/meshy/kart-rival/model.glb",
      "outputPath": "public/aura-assets/rivalKart.5d7073be.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.95,
          -0.664,
          -0.69
        ],
        "max": [
          0.951,
          0.66,
          0.689
        ],
        "size": [
          1.902,
          1.324,
          1.379
        ],
        "center": [
          0,
          -0.002,
          0
        ],
        "maxDimension": 1.902,
        "grounded": false
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
        ]
      },
      "nodeNames": [
        "chassis_body",
        "wheel_fl",
        "wheel_fr",
        "wheel_rl",
        "wheel_rr"
      ],
      "textures": [
        "normal",
        "texture_0",
        "texture_0_metallic_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/rivalKart.thumb.svg",
      "quality": "candidate",
      "role": "vehicle",
      "renderedProbe": {
        "url": "/aura-assets/rivalKart.meshy-candidate.02597850.png",
        "kind": "manual-inspection",
        "sha256": "sha256-025978506a96de3cce46d905e389a7f6b2c8ede016624a5c9b0c267dd83db582",
        "checkedAt": "2026-10-16T02:03:08.499Z"
      }
    },
  },
  "tireStack": {
    type: "model",
    format: "glb",
    url: "/aura-assets/tireStack.94256266.glb",
    hash: "sha256-94256266da82f01c80add27599b3911aa14d4d82e0ef522bd4b0d5c6e81e0bbb",
    bounds: [
      1.893,
      1.903,
      1.894
    ],
    sizeBytes: 1292364,
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
        "sourcePath": "artifacts/meshy/kart-tire-stack/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T00:40:01.401Z",
        "evidence": [
          "aura-evidence/meshy/tireStack.rights.8f8012b08333.json",
          "aura-evidence/meshy/tireStack.metadata.be68fe39fa4e.json",
          "public/aura-assets/tireStack.meshy-candidate.a78deae5.png"
        ],
        "checkedAt": "2026-10-16T00:40:01.401Z"
      },
      "sourcePath": "artifacts/meshy/kart-tire-stack/model.glb",
      "outputPath": "public/aura-assets/tireStack.94256266.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.946,
          -0.952,
          -0.947
        ],
        "max": [
          0.947,
          0.951,
          0.946
        ],
        "size": [
          1.893,
          1.903,
          1.894
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
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
      "thumbnailUrl": "/aura-assets/tireStack.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/tireStack.meshy-candidate.a78deae5.png",
        "kind": "manual-inspection",
        "sha256": "sha256-a78deae52376bb51454f79db034c78f20aa69a24dbc8a1bfd237d9de1840fb9d",
        "checkedAt": "2026-10-16T02:03:09.088Z"
      }
    },
  },
  "yellowKart": {
    type: "model",
    format: "glb",
    url: "/aura-assets/yellowKart.3e9e9fe6.glb",
    hash: "sha256-3e9e9fe64e5ff3547196fbd10bc87ce3d80d668a977b4e33b09e32732040a285",
    bounds: [
      1.9,
      1.329,
      1.276
    ],
    sizeBytes: 5419168,
    metadata: {
      "materials": [
        "BakedMaterial"
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
        "nodeCount": 5,
        "meshCount": 5,
        "materialCount": 1,
        "textureCount": 3,
        "animationClipCount": 0,
        "skinCount": 0,
        "morphTargetCount": 0,
        "rootNodeNames": [
          "chassis_body",
          "wheel_fl",
          "wheel_fr",
          "wheel_rl",
          "wheel_rr"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 5 nodes across 5 roots."
        ]
      },
      "provenance": {
        "sourcePath": "artifacts/meshy/kart-yellow/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:24:02.855Z",
        "evidence": [
          "aura-evidence/meshy/yellowKart.rights.8f8012b08333.json",
          "aura-evidence/meshy/yellowKart.metadata.a5625218acb8.json",
          "public/aura-assets/yellowKart.meshy-candidate.060c54eb.png"
        ],
        "checkedAt": "2026-10-16T01:24:02.855Z"
      },
      "sourcePath": "artifacts/meshy/kart-yellow/model.glb",
      "outputPath": "public/aura-assets/yellowKart.3e9e9fe6.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.95,
          -0.666,
          -0.639
        ],
        "max": [
          0.95,
          0.663,
          0.638
        ],
        "size": [
          1.9,
          1.329,
          1.276
        ],
        "center": [
          0,
          -0.002,
          -0.001
        ],
        "maxDimension": 1.9,
        "grounded": false
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
        "source": "gltf-extras",
        "forwardAxis": "+z",
        "upAxis": "+y",
        "messages": [
          "Orientation metadata detected with forwardAxis=+z and upAxis=+y."
        ]
      },
      "nodeNames": [
        "chassis_body",
        "wheel_fl",
        "wheel_fr",
        "wheel_rl",
        "wheel_rr"
      ],
      "textures": [
        "normal",
        "texture_0",
        "texture_0_metallic_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/yellowKart.thumb.svg",
      "quality": "candidate",
      "role": "vehicle",
      "renderedProbe": {
        "url": "/aura-assets/yellowKart.meshy-candidate.060c54eb.png",
        "kind": "manual-inspection",
        "sha256": "sha256-060c54ebbf6db6188e7e868986dded247a0a65be36c30c9b76cbbbfd52a54368",
        "checkedAt": "2026-10-16T02:03:09.060Z"
      }
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
