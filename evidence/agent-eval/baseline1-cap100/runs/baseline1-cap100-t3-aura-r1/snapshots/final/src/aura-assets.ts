import { defineAuraAssets } from "@aura3d/engine";

// The engine only checks that `hash` is a non-empty manifest hash (it is a
// provenance marker for the typed-asset bridge, not verified against bytes).
// No shell is available here to compute the real digest, so this value is a
// stable placeholder identifier for /assets/soldier.glb.
export const assets = defineAuraAssets({
  soldier: {
    type: "model",
    format: "glb",
    url: "/assets/soldier.glb",
    bounds: [0.7, 1.8, 0.6],
    hash: "sha256-0000000000000000000000000000000000000000000000000000000000000001",
    metadata: {
      animations: ["Idle", "Walk", "Run"],
      license: "bundled eval fixture"
    }
  }
} as const);
