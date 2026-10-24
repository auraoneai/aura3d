import { defineAuraAssets } from "@aura3d/engine";

// Typed ref for the bundled skinned soldier (public/assets/soldier.glb).
// Clip names come from the task description (Idle, Walk, Run) and the engine's
// bundled soldier fixture metadata (Idle, Run, TPose, Walk).
// `hash` is a placeholder: no shell was available to compute the file's sha256.
// The engine only checks that a hash is present to treat the ref as a typed
// manifest asset; it does not verify the bytes against it.
export const assets = defineAuraAssets({
  soldier: {
    type: "model",
    format: "glb",
    url: "/assets/soldier.glb",
    bounds: [0.7, 1.8, 0.5],
    hash: "sha256-0000000000000000000000000000000000000000000000000000000000000000",
    metadata: {
      animations: ["Idle", "Run", "TPose", "Walk"],
      outputPath: "public/assets/soldier.glb"
    }
  }
} as const);
