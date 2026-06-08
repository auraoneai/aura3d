import { defineAuraAssets } from "@aura3d/engine";
import { AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID } from "./contract";

export const assetContractId = AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID;

export const assets = defineAuraAssets({
  /*
   * Add character GLBs with the Aura3D CLI, then keep these generated keys:
   *
   * npx @aura3d/cli@latest assets add ./assets/miko.glb --name miko
   * npx @aura3d/cli@latest assets add ./assets/luma.glb --name luma
   * npx @aura3d/cli@latest assets validate-animation
   */
});
