import type { assets } from "./aura-assets";
import { AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID } from "./contract";

/** Authored starter requirements live outside the CLI-generated asset map. */
export const assetContractId = AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID;

export const animationStudioRequiredAssetKeys = [
  "miko",
  "luma",
  "moonGarden"
] as const satisfies readonly (keyof typeof assets)[];

/** Optional audio slots describe the episode contract, not installed assets. */
export const animationStudioOptionalAudioAssetKeys = [
  "mikoDialogueStem",
  "lumaDialogueStem",
  "moonGardenMusic",
  "moonGardenChimeSfx"
] as const;
