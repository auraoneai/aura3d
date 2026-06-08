import { AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID } from "./contract";

export const characterContractId = AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID;

export const characters = [
  {
    id: "miko",
    name: "Miko",
    palette: ["#7de2ff", "#f7ffe8"],
    primitiveFallback: "round robot with antenna",
    typedAssetKey: "miko",
    runtimeNodeId: "miko",
    primitiveMouthNodeId: "miko:mouth",
    performanceChannels: ["body", "facial", "gesture", "blocking", "gaze"],
    glbUpgrade: "After assets add, use model(assets.miko) and keep viseme blendshape metadata."
  },
  {
    id: "luma",
    name: "Luma",
    palette: ["#ffe18e", "#40ffbf"],
    primitiveFallback: "small moon-garden helper",
    typedAssetKey: "luma",
    runtimeNodeId: "luma",
    primitiveMouthNodeId: "luma:mouth",
    performanceChannels: ["body", "facial", "gesture", "blocking", "gaze"],
    glbUpgrade: "After assets add, use model(assets.luma) and keep viseme blendshape metadata."
  }
];
