import { AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID } from "./contract";

export const setContractId = AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID;

export const sets = [
  {
    id: "moon-garden",
    name: "Moon Garden",
    layers: ["foreground flowers", "midground robot path", "background planet skyline"],
    primitiveFallbackProps: ["glow-broom", "glow-stones", "moon-lilies"],
    optionalTypedAssetKeys: ["glowBroom", "glowStones", "moonLilies"],
    safety: "soft colors, readable captions, reduced flash by default"
  }
];
