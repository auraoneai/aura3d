import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  /*
   * Add your own fighter GLBs with the Aura3D CLI, then keep these generated
   * keys so src/main.ts can switch from source placeholders to typed models:
   *
   * npx @aura3d/cli@latest assets add ./assets/player-fighter.glb --name playerFighter
   * npx @aura3d/cli@latest assets add ./assets/rival-fighter.glb --name rivalFighter
   */
});
