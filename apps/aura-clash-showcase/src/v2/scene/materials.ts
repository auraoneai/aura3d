// apps/aura-clash-showcase/src/v2/scene/materials.ts — authored materials (T2.2).
// §6.9.3: rain-soaked rooftop — the deck is a dark clearcoat slab (SSR wet
// stand-in R-14-14), neon sign props are emissive practicals (§6.9.3 wants
// HDR emissive 4–8 on signs; these ARE light-representing nodes so the ≤0.1
// non-light-material cap does not apply). No baseColor/MR/emissive fighter
// overrides (§6.9.3 deletes collectFighterFlashMaterials); team identity is
// the rim/practical lighting, not tints.
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
  emissiveIntensity: 5.2,
  roughness: 0.3
});

export const NEON_CYAN_MATERIAL: AuraMaterialSpec = material.emissive({
  color: "#06232b",
  emissive: "#39d6ff",
  emissiveIntensity: 4.4,
  roughness: 0.3
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
