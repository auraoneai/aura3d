import { defineAuraAssets } from "@aura3d/engine";
import { AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID } from "./contract";

export const assetContractId = AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID;

export const cartoonStudioRequiredAssetKeys = ["miko", "luma", "moonGarden"] as const;

export const cartoonStudioOptionalAudioAssetKeys = [
  "mikoDialogueStem",
  "lumaDialogueStem",
  "moonGardenMusic",
  "moonGardenChimeSfx"
] as const;

export const assets = defineAuraAssets({
  miko: {
    type: "model",
    format: "glb",
    url: "/aura-assets/miko.047f5e5f.glb",
    bounds: [0.066, 0.026, 0.017],
    hash: "sha256-047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319",
    metadata: {
      contractId: assetContractId,
      role: "cartoon-character",
      license: "CC0",
      source: "Aura3D bundled humanoid starter fixture",
      animationClips: [
        "Dance",
        "Death",
        "Idle",
        "Jump",
        "No",
        "Punch",
        "Running",
        "Sitting",
        "Standing",
        "ThumbsUp",
        "Walking",
        "WalkJump",
        "Wave",
        "Yes"
      ],
      mouthReadiness: "facial-morph-targets"
    }
  },
  luma: {
    type: "model",
    format: "glb",
    url: "/aura-assets/luma.humanoid-fixture.glb",
    bounds: [1.1, 1.8, 0.8],
    hash: "sha256-dfb230fc1f942f259dd00281a1186953ad602fc5d69067ce63e24b2aa439736b",
    metadata: {
      contractId: assetContractId,
      role: "cartoon-character",
      license: "CC0",
      source: "Aura3D bundled humanoid starter fixture",
      animationClips: ["Idle", "Run", "TPose", "Walk"],
      // The luma GLB has no facial blendshapes, so the route drives a primitive
      // mouth-card fallback (PRD Path A) for its lip-sync. This is the honest,
      // accurate readiness — not "no-mouth-rig".
      mouthReadiness: "primitive-mouth-card"
    }
  },
  moonGarden: {
    type: "model",
    format: "gltf",
    url: "/aura-assets/moonGarden.gltf",
    bounds: [3.2, 0.6, 1.2],
    hash: "sha256-85a288d6d434cc5c56ac154c3e996c2ad7612791622fc20a339fb647a6d426bd",
    metadata: {
      contractId: assetContractId,
      role: "cartoon-set",
      license: "MIT",
      source: "Aura3D cartoon-studio local generated starter set anchor",
      walkable: true,
      framingReady: true
    }
  }
} as const);
