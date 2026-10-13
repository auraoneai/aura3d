// apps/aura-clash-showcase/src/v2/scene/materials.ts — authored materials (T2.2).
// §6.9.3: rain-soaked rooftop — the deck is a dark clearcoat slab (SSR wet
// stand-in R-14-14), neon sign props are emissive practicals (light-
// representing nodes, so the ≤0.1 non-light-material cap does not apply).
// No baseColor/MR/emissive fighter overrides (§6.9.3 deletes
// collectFighterFlashMaterials); team identity is the rim/practical
// lighting, not tints.
// Emissive levels (lane run 38414884637 blown-white-bar defect): at 5.2/4.4
// the sign boxes clipped to featureless white under the arena-fight post
// (ACES + bloom threshold 1.2, emissiveStrengthRange [1.5, 6]) — pixels at
// every viewport show a white vertical bar with no hue. 1.9/1.7 sits at the
// low end of the post range: just over the bloom threshold for a gentle
// neon glow while magenta/cyan hue survives tonemapping.
import { material, type AuraMaterialSpec } from "@aura3d/engine";

export const ROOFTOP_DECK_MATERIAL: AuraMaterialSpec = material.physical({
  color: "#15181d",
  roughness: 0.34,
  metallic: 0.05,
  clearcoat: 0.9,
  clearcoatRoughness: 0.12,
  envMapIntensity: 1.3
});

export const ROOFTOP_TRIM_MATERIAL: AuraMaterialSpec = material.pbr({
  color: "#1d2b3a",
  roughness: 0.6,
  metallic: 0.15
});

export const NEON_PINK_MATERIAL: AuraMaterialSpec = material.emissive({
  color: "#2a0a1c",
  emissive: "#ff2d78",
  emissiveIntensity: 1.9,
  roughness: 0.3,
  practical: true
});

export const NEON_CYAN_MATERIAL: AuraMaterialSpec = material.emissive({
  color: "#06232b",
  emissive: "#39d6ff",
  emissiveIntensity: 1.7,
  roughness: 0.3,
  practical: true
});

// Hit flash: a light-representing node (the ≤0.1 non-light cap does not
// apply, §6.9.3); toggled 80 ms per landed hit via its runtime handle.
export const HIT_FLASH_MATERIAL: AuraMaterialSpec = material.emissive({
  color: "#1a1206",
  emissive: "#fff3d0",
  emissiveIntensity: 6.4,
  roughness: 0.2,
  practical: true
});

export const SKYLINE_MATERIAL: AuraMaterialSpec = material.pbr({
  color: "#0b1020",
  roughness: 0.85,
  metallic: 0
});

export const FOG_CARD_MATERIAL: AuraMaterialSpec = material.pbr({
  color: "#0a1620",
  roughness: 1,
  metallic: 0
});
