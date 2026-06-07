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
    url: "/aura-assets/miko.authored.glb",
    bounds: [0.66, 1.47, 0.43],
    hash: "sha256-15d37c49f79d3f0e7d70f199e058935605802dcb61434cc458684e512486f705",
    metadata: {
      contractId: assetContractId,
      role: "cartoon-character",
      license: "CC0",
      source: "Aura3D-authored procedural cartoon robot (scripts/build-characters.ts)",
      animationClips: ["Idle", "Wave", "Walk"],
      // Authored GLB ships ONE real face blendshape, `mouthOpen`, driven by viseme
      // mouthOpenness for real geometric lip-sync (no primitive mouth-card).
      mouthReadiness: "facial-morph-targets"
    }
  },
  luma: {
    type: "model",
    format: "glb",
    url: "/aura-assets/luma.authored.glb",
    bounds: [0.62, 1.94, 0.34],
    hash: "sha256-ccfcb4accdf58127337bd0b8f9ae10a160b6365b3a92f85b777476c524c92989",
    metadata: {
      contractId: assetContractId,
      role: "cartoon-character",
      license: "CC0",
      source: "Aura3D-authored procedural cartoon robot (scripts/build-characters.ts)",
      animationClips: ["Idle", "Wave", "Walk"],
      // Authored GLB ships the same real `mouthOpen` face blendshape as miko.
      mouthReadiness: "facial-morph-targets"
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
