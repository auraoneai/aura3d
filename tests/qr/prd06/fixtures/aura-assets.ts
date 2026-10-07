import { defineAuraAssets } from "@aura3d/engine";

/**
 * PRD-06 T0.16 fixture — the typed assets module the C-40 skill snippet
 * compiles against. `assets.hero.metadata.animations` is the clip-name source
 * of truth (`["Idle", "Walk", "Run"]`), matching what
 * `aura3d assets inspect`/`aura3d animation inspect-clips` reports for a real
 * hero GLB.
 */
export const assets = defineAuraAssets({
  hero: {
    type: "model",
    format: "glb",
    url: "/aura-assets/hero.glb",
    bounds: [1.8, 0.5, 1.0],
    hash: "sha256-prd06-skill-snippet-fixture",
    metadata: {
      materials: ["heroBody", "heroHair"],
      animations: ["Idle", "Walk", "Run"],
      textures: []
    }
  }
} as const);
