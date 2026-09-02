import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly "arenaRelic": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  "arenaRelic": {
    type: "model",
    format: "glb",
    url: "/aura-assets/arenaRelic.0b04ec2f.glb",
    hash: "sha256-0b04ec2f66f20109d8d7e3c385f61fa80459938201210a79f44f513f327c7381",
    bounds: [
      1.135,
      1.903,
      1.135
    ],
    sizeBytes: 3486768,
    metadata: {
      "materials": [
        "material"
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
          "mesh_node"
        ],
        "maxDepth": 1,
        "messages": [
          "Detected 1 node across 1 root."
        ]
      },
      "provenance": {
        "sourcePath": "public/aura-assets/arenaRelic.0b04ec2f.glb",
        "license": "Meshy paid private generation terms",
        "licenseName": "Meshy paid private generation terms",
        "licenseUrl": "https://www.meshy.ai/terms",
        "licenseRaw": "Generated through the authenticated paid Meshy API account and approved on 2026-09-02 for candidate use in the Aura3D 2.0.4 prototype route under the current Meshy terms; this does not certify release-ready geometry or broader commercial rights.",
        "sourceFamily": "meshy",
        "retrievedAt": "2026-09-02T20:56:05.561Z",
        "evidence": [
          "aura-evidence/meshy/arenaRelic.rights.0593a5c6ff7f.json",
          "aura-evidence/meshy/arenaRelic.metadata.942dba3748f0.json",
          "public/aura-assets/arenaRelic.meshy-candidate.d6fd36e0.png"
        ],
        "checkedAt": "2026-09-02T20:56:05.561Z"
      },
      "sourcePath": "public/aura-assets/arenaRelic.0b04ec2f.glb",
      "outputPath": "public/aura-assets/arenaRelic.0b04ec2f.glb",
      "license": "Meshy paid private generation terms",
      "boundsMetadata": {
        "min": [
          -0.568,
          -0.952,
          -0.568
        ],
        "max": [
          0.567,
          0.951,
          0.567
        ],
        "size": [
          1.135,
          1.903,
          1.135
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
          "name": "material",
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
        "mesh_node"
      ],
      "textures": [
        "base_color",
        "metallic_roughness",
        "normal"
      ],
      "dependencies": [],
      "thumbnailUrl": "/aura-assets/arenaRelic.thumb.svg",
      "quality": "candidate",
      "role": "prop",
      "renderedProbe": {
        "url": "/aura-assets/arenaRelic.meshy-candidate.d6fd36e0.png",
        "kind": "manual-inspection",
        "sha256": "sha256-d6fd36e0b56ced387de6ba8a41c57e18c5d0bc6518e519dc84f9901a80878e76",
        "checkedAt": "2026-09-02T22:13:44.999Z"
      }
    },
  },
} as const);

export type AuraGeneratedAssets = typeof assets;
