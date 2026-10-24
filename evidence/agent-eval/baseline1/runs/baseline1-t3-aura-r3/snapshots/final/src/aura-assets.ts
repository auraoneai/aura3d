import { defineAuraAssets } from "@aura3d/engine";

// Typed asset map for the files served from public/assets.
export const assets = defineAuraAssets({
  soldier: {
    type: "model",
    format: "glb",
    url: "/assets/soldier.glb",
    metadata: {
      animations: ["Idle", "Walk", "Run"],
      license: "bundled eval fixture"
    }
  }
});
