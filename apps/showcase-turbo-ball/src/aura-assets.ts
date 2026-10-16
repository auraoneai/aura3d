import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "boostPad": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "floodlightTower": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "greenCar": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "heroCar": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "purpleCar": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "refereeDrone": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "rivalCar": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "soccerBall": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "stadiumArena": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "trophyCup": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "boostPad": {
    type: "model",
    format: "glb",
    url: "/aura-assets/boostPad.9045e081.glb",
    hash: "sha256-9045e0815f2ff84e2a13efd514d24f7fc6ae2e6370c5bd2abd3daf9cc12c0775",
    bounds: [
      1.903,
      0.303,
      1.896
    ],
    sizeBytes: 953904,
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
        "sourcePath": "artifacts/meshy/turboball-boost-pad/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:22:53.835Z",
        "evidence": [
          "aura-evidence/meshy/boostPad.rights.8f8012b08333.json",
          "aura-evidence/meshy/boostPad.metadata.234b3c2cfbfd.json",
          "public/aura-assets/boostPad.meshy-candidate.e05040c9.png"
        ],
        "checkedAt": "2026-10-16T01:22:53.835Z"
      },
      "sourcePath": "artifacts/meshy/turboball-boost-pad/model.glb",
      "outputPath": "public/aura-assets/boostPad.9045e081.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.152,
          -0.948
        ],
        "max": [
          0.951,
          0.152,
          0.947
        ],
        "size": [
          1.903,
          0.303,
          1.896
        ],
        "center": [
          0,
          0,
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
      "thumbnailUrl": "/aura-assets/boostPad.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/boostPad.meshy-candidate.e05040c9.png",
        "kind": "manual-inspection",
        "sha256": "sha256-e05040c9a5df1ac8213670d3090d3ebad17b6b3ebf187f5c80842550e5fb945a",
        "checkedAt": "2026-10-16T02:03:07.905Z"
      }
    },
  },
  "floodlightTower": {
    type: "model",
    format: "glb",
    url: "/aura-assets/floodlightTower.bfbd3320.glb",
    hash: "sha256-bfbd3320a8637a82af3e4efadaf15bb2702fd6222ae172266849a85d2f67034d",
    bounds: [
      0.774,
      1.903,
      0.618
    ],
    sizeBytes: 1868112,
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
        "sourcePath": "artifacts/meshy/turboball-floodlight/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:29:58.706Z",
        "evidence": [
          "aura-evidence/meshy/floodlightTower.rights.8f8012b08333.json",
          "aura-evidence/meshy/floodlightTower.metadata.de9c7bf6aade.json",
          "public/aura-assets/floodlightTower.meshy-candidate.9c37ab85.png"
        ],
        "checkedAt": "2026-10-16T01:29:58.706Z"
      },
      "sourcePath": "artifacts/meshy/turboball-floodlight/model.glb",
      "outputPath": "public/aura-assets/floodlightTower.bfbd3320.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.383,
          -0.952,
          -0.311
        ],
        "max": [
          0.391,
          0.951,
          0.307
        ],
        "size": [
          0.774,
          1.903,
          0.618
        ],
        "center": [
          0.004,
          0,
          -0.002
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
      "thumbnailUrl": "/aura-assets/floodlightTower.thumb.svg",
      "quality": "candidate",
      "role": "set-dressing",
      "renderedProbe": {
        "url": "/aura-assets/floodlightTower.meshy-candidate.9c37ab85.png",
        "kind": "manual-inspection",
        "sha256": "sha256-9c37ab852fc8309a21407d684054f82a18dd51b9ebd6c212e4f1d6f8e5bacc63",
        "checkedAt": "2026-10-16T02:03:07.918Z"
      }
    },
  },
  "greenCar": {
    type: "model",
    format: "glb",
    url: "/aura-assets/greenCar.f9f128cb.glb",
    hash: "sha256-f9f128cbdbe82943d4d3df704a5b30ee6e0cbeabb70f4733154e733d9de07086",
    bounds: [
      1.906,
      0.587,
      0.968
    ],
    sizeBytes: 4372592,
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
        "sourcePath": "artifacts/meshy/turboball-car-green/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:13:57.191Z",
        "evidence": [
          "aura-evidence/meshy/greenCar.rights.8f8012b08333.json",
          "aura-evidence/meshy/greenCar.metadata.b7314786c324.json",
          "public/aura-assets/greenCar.meshy-candidate.30f93f1e.png"
        ],
        "checkedAt": "2026-10-16T01:13:57.191Z"
      },
      "sourcePath": "artifacts/meshy/turboball-car-green/model.glb",
      "outputPath": "public/aura-assets/greenCar.f9f128cb.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.294,
          -0.484
        ],
        "max": [
          0.954,
          0.293,
          0.484
        ],
        "size": [
          1.906,
          0.587,
          0.968
        ],
        "center": [
          0.001,
          0,
          0
        ],
        "maxDimension": 1.906,
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
      "thumbnailUrl": "/aura-assets/greenCar.thumb.svg",
      "quality": "candidate",
      "role": "vehicle",
      "renderedProbe": {
        "url": "/aura-assets/greenCar.meshy-candidate.30f93f1e.png",
        "kind": "manual-inspection",
        "sha256": "sha256-30f93f1e53d94e7ca0ece4c48ff0b3676ac9cd0e457ddd68c64475ec253a063f",
        "checkedAt": "2026-10-16T02:03:07.884Z"
      }
    },
  },
  "heroCar": {
    type: "model",
    format: "glb",
    url: "/aura-assets/heroCar.504dd96b.glb",
    hash: "sha256-504dd96be58c6b6973c9c3eac930afb78ead8af062a546b1f559bd447e6bf04d",
    bounds: [
      1.903,
      0.554,
      0.882
    ],
    sizeBytes: 4123596,
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
        "sourcePath": "artifacts/meshy/turboball-hero-car/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T00:42:22.185Z",
        "evidence": [
          "aura-evidence/meshy/heroCar.rights.8f8012b08333.json",
          "aura-evidence/meshy/heroCar.metadata.9d271c3d9adc.json",
          "public/aura-assets/heroCar.meshy-candidate.63412477.png"
        ],
        "checkedAt": "2026-10-16T00:42:22.185Z"
      },
      "sourcePath": "artifacts/meshy/turboball-hero-car/model.glb",
      "outputPath": "public/aura-assets/heroCar.504dd96b.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.278,
          -0.441
        ],
        "max": [
          0.951,
          0.276,
          0.441
        ],
        "size": [
          1.903,
          0.554,
          0.882
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
      "thumbnailUrl": "/aura-assets/heroCar.thumb.svg",
      "quality": "candidate",
      "role": "vehicle",
      "renderedProbe": {
        "url": "/aura-assets/heroCar.meshy-candidate.63412477.png",
        "kind": "manual-inspection",
        "sha256": "sha256-63412477af77ef165656f519291bd0294c98564e4f7f88ffc3c882663d99d52a",
        "checkedAt": "2026-10-16T02:03:06.971Z"
      }
    },
  },
  "purpleCar": {
    type: "model",
    format: "glb",
    url: "/aura-assets/purpleCar.f9c92fbf.glb",
    hash: "sha256-f9c92fbf16fc50af6665dad15210921e4b78e08c60ff4bfa480f929418081630",
    bounds: [
      1.901,
      0.682,
      1.066
    ],
    sizeBytes: 5037364,
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
        "sourcePath": "artifacts/meshy/turboball-car-purple/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:11:09.047Z",
        "evidence": [
          "aura-evidence/meshy/purpleCar.rights.8f8012b08333.json",
          "aura-evidence/meshy/purpleCar.metadata.522d2fcceb05.json",
          "public/aura-assets/purpleCar.meshy-candidate.696f1999.png"
        ],
        "checkedAt": "2026-10-16T01:11:09.047Z"
      },
      "sourcePath": "artifacts/meshy/turboball-car-purple/model.glb",
      "outputPath": "public/aura-assets/purpleCar.f9c92fbf.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.952,
          -0.342,
          -0.533
        ],
        "max": [
          0.95,
          0.34,
          0.533
        ],
        "size": [
          1.901,
          0.682,
          1.066
        ],
        "center": [
          -0.001,
          -0.001,
          0
        ],
        "maxDimension": 1.901,
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
      "thumbnailUrl": "/aura-assets/purpleCar.thumb.svg",
      "quality": "candidate",
      "role": "vehicle",
      "renderedProbe": {
        "url": "/aura-assets/purpleCar.meshy-candidate.696f1999.png",
        "kind": "manual-inspection",
        "sha256": "sha256-696f199911b9d8da2d03fdbf449e4f422ed89dadd21bbb6955c600ddd038256a",
        "checkedAt": "2026-10-16T02:03:07.608Z"
      }
    },
  },
  "refereeDrone": {
    type: "model",
    format: "glb",
    url: "/aura-assets/refereeDrone.498e189a.glb",
    hash: "sha256-498e189a8fe107abe2f647548ef4ccb354edc02eb5bc406e949c4f5522fe8199",
    bounds: [
      1.866,
      0.606,
      1.905
    ],
    sizeBytes: 1564652,
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
        "sourcePath": "artifacts/meshy/turboball-drone/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:27:15.690Z",
        "evidence": [
          "aura-evidence/meshy/refereeDrone.rights.8f8012b08333.json",
          "aura-evidence/meshy/refereeDrone.metadata.33eb48564af7.json",
          "public/aura-assets/refereeDrone.meshy-candidate.9f44690f.png"
        ],
        "checkedAt": "2026-10-16T01:27:15.690Z"
      },
      "sourcePath": "artifacts/meshy/turboball-drone/model.glb",
      "outputPath": "public/aura-assets/refereeDrone.498e189a.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.931,
          -0.309,
          -0.954
        ],
        "max": [
          0.935,
          0.297,
          0.951
        ],
        "size": [
          1.866,
          0.606,
          1.905
        ],
        "center": [
          0.002,
          -0.006,
          -0.001
        ],
        "maxDimension": 1.905,
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
      "thumbnailUrl": "/aura-assets/refereeDrone.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/refereeDrone.meshy-candidate.9f44690f.png",
        "kind": "manual-inspection",
        "sha256": "sha256-9f44690fc8205a7941534e17a6c663b91123f90dbf00e4b1fe3ae90c8c25a407",
        "checkedAt": "2026-10-16T02:03:07.913Z"
      }
    },
  },
  "rivalCar": {
    type: "model",
    format: "glb",
    url: "/aura-assets/rivalCar.ccd67629.glb",
    hash: "sha256-ccd676293ee36711f86107e2050148492901c4f18dbffe739925261de1f12a89",
    bounds: [
      1.903,
      0.668,
      1.233
    ],
    sizeBytes: 4434224,
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
        "sourcePath": "artifacts/meshy/turboball-rival-car/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:07:58.139Z",
        "evidence": [
          "aura-evidence/meshy/rivalCar.rights.8f8012b08333.json",
          "aura-evidence/meshy/rivalCar.metadata.1e7cd06f9b84.json",
          "public/aura-assets/rivalCar.meshy-candidate.be51b103.png"
        ],
        "checkedAt": "2026-10-16T01:07:58.139Z"
      },
      "sourcePath": "artifacts/meshy/turboball-rival-car/model.glb",
      "outputPath": "public/aura-assets/rivalCar.ccd67629.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.953,
          -0.34,
          -0.617
        ],
        "max": [
          0.951,
          0.328,
          0.616
        ],
        "size": [
          1.903,
          0.668,
          1.233
        ],
        "center": [
          -0.001,
          -0.006,
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
      "thumbnailUrl": "/aura-assets/rivalCar.thumb.svg",
      "quality": "candidate",
      "role": "vehicle",
      "renderedProbe": {
        "url": "/aura-assets/rivalCar.meshy-candidate.be51b103.png",
        "kind": "manual-inspection",
        "sha256": "sha256-be51b10305cc21ba0c0c33962486baab1ead9876f85e1ce46db1422ccdd2fb36",
        "checkedAt": "2026-10-16T02:03:07.224Z"
      }
    },
  },
  "soccerBall": {
    type: "model",
    format: "glb",
    url: "/aura-assets/soccerBall.25c7b4d8.glb",
    hash: "sha256-25c7b4d826f338391bf5fa2ba1c33734a9b0c65cea194ac389b40eca9aafa3b0",
    bounds: [
      1.889,
      1.895,
      1.901
    ],
    sizeBytes: 1653788,
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
        "sourcePath": "artifacts/meshy/turboball-ball/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:20:44.130Z",
        "evidence": [
          "aura-evidence/meshy/soccerBall.rights.8f8012b08333.json",
          "aura-evidence/meshy/soccerBall.metadata.6239d8586db6.json",
          "public/aura-assets/soccerBall.meshy-candidate.14a5407d.png"
        ],
        "checkedAt": "2026-10-16T01:20:44.130Z"
      },
      "sourcePath": "artifacts/meshy/turboball-ball/model.glb",
      "outputPath": "public/aura-assets/soccerBall.25c7b4d8.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.945,
          -0.947,
          -0.952
        ],
        "max": [
          0.944,
          0.947,
          0.95
        ],
        "size": [
          1.889,
          1.895,
          1.901
        ],
        "center": [
          -0.001,
          0,
          -0.001
        ],
        "maxDimension": 1.901,
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
      "thumbnailUrl": "/aura-assets/soccerBall.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/soccerBall.meshy-candidate.14a5407d.png",
        "kind": "manual-inspection",
        "sha256": "sha256-14a5407d9ede015d47ed7dc73e82f1725168d65a83b77b1a6c6211dd3ebed37b",
        "checkedAt": "2026-10-16T02:03:07.901Z"
      }
    },
  },
  "stadiumArena": {
    type: "model",
    format: "glb",
    url: "/aura-assets/stadiumArena.40b48b71.glb",
    hash: "sha256-40b48b717ef3b6a6f1d5af13859ea237afd38a0c2ba8dac26401c2e2f8f20620",
    bounds: [
      1.851,
      0.404,
      1.902
    ],
    sizeBytes: 5653920,
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
        "sourcePath": "artifacts/meshy/turboball-stadium-v2/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:18:21.097Z",
        "evidence": [
          "aura-evidence/meshy/stadiumArena.rights.8f8012b08333.json",
          "aura-evidence/meshy/stadiumArena.metadata.ce046589b6c8.json",
          "public/aura-assets/stadiumArena.meshy-candidate.67b1e0d7.png"
        ],
        "checkedAt": "2026-10-16T01:18:21.097Z"
      },
      "sourcePath": "artifacts/meshy/turboball-stadium-v2/model.glb",
      "outputPath": "public/aura-assets/stadiumArena.40b48b71.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.925,
          -0.206,
          -0.952
        ],
        "max": [
          0.925,
          0.199,
          0.95
        ],
        "size": [
          1.851,
          0.404,
          1.902
        ],
        "center": [
          0,
          -0.003,
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
        "output_unwrapped"
      ],
      "textures": [
        "normal",
        "texture_0",
        "texture_0_metallic_roughness"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/stadiumArena.thumb.svg",
      "quality": "candidate",
      "role": "world",
      "renderedProbe": {
        "url": "/aura-assets/stadiumArena.meshy-candidate.67b1e0d7.png",
        "kind": "manual-inspection",
        "sha256": "sha256-67b1e0d720f4c913dbcff556a04253d84c5b0741bae7586c1e23fd8955c78f02",
        "checkedAt": "2026-10-16T02:03:07.893Z"
      }
    },
  },
  "trophyCup": {
    type: "model",
    format: "glb",
    url: "/aura-assets/trophyCup.0185047a.glb",
    hash: "sha256-0185047adb17f016ff4b99c757f138f6962e174afda13971b2776b807bee7d93",
    bounds: [
      1.493,
      1.902,
      0.915
    ],
    sizeBytes: 1210612,
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
        "sourcePath": "artifacts/meshy/turboball-trophy/model.glb",
        "license": "Meshy AI generated asset - project owner subscription",
        "licenseName": "Meshy AI generated asset - project owner subscription",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated 2026-10-15 via the Meshy API (text-to-3D, remesh, rigging, animation) under the Aura3D project owner's Meshy subscription, from original text prompts authored for this project. No third-party brand, product, or likeness was requested. Use governed by the owner's Meshy plan terms.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-10-16T01:24:59.497Z",
        "evidence": [
          "aura-evidence/meshy/trophyCup.rights.8f8012b08333.json",
          "aura-evidence/meshy/trophyCup.metadata.db68adb62b83.json",
          "public/aura-assets/trophyCup.meshy-candidate.405ed744.png"
        ],
        "checkedAt": "2026-10-16T01:24:59.497Z"
      },
      "sourcePath": "artifacts/meshy/turboball-trophy/model.glb",
      "outputPath": "public/aura-assets/trophyCup.0185047a.glb",
      "license": "Meshy AI generated asset - project owner subscription",
      "boundsMetadata": {
        "min": [
          -0.747,
          -0.952,
          -0.458
        ],
        "max": [
          0.746,
          0.95,
          0.457
        ],
        "size": [
          1.493,
          1.902,
          0.915
        ],
        "center": [
          -0.001,
          -0.001,
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
      "thumbnailUrl": "/aura-assets/trophyCup.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/trophyCup.meshy-candidate.405ed744.png",
        "kind": "manual-inspection",
        "sha256": "sha256-405ed744e411111a077d14b8712c58f6522c357bbbbaac248d15d50a1cddaea8",
        "checkedAt": "2026-10-16T02:03:07.909Z"
      }
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
