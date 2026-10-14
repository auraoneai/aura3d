// apps/showcase-bank-shot/src/v2/scene/materials.ts — art-direction materials.
// §6.9.1: felt sheen 0.6, walnut clearcoat 0.8, ball clearcoat 1.0 r0.05,
// leather pockets. PRD 04 sheen/clearcoat is stubbed engine-side, so the
// authored specs carry the physical intent (physicalWarnings ride the spec
// until PRD 04 lands) — listed in direction.standIns[] (R-14-14).
import { material, type AuraMaterialSpec } from "@aura3d/engine";

/** Felt: deep green, fibre-rough, authored sheen intent (PRD 04 stand-in). */
export const FELT_MATERIAL: AuraMaterialSpec = material.physical({
  color: "#1f3a24",
  roughness: 0.92,
  metallic: 0,
  sheen: 0.6,
  sheenRoughness: 0.6
});

/** Walnut rails + furniture: warm brown, authored clearcoat 0.8. */
export const WALNUT_MATERIAL: AuraMaterialSpec = material.physical({
  color: "#5c3a21",
  roughness: 0.45,
  metallic: 0,
  clearcoat: 0.8,
  clearcoatRoughness: 0.25
});

/** Balls: glossy clearcoat shells under the lamp. */
export const BALL_MATERIAL: AuraMaterialSpec = material.physical({
  color: "#f0f0e8",
  roughness: 0.05,
  metallic: 0,
  clearcoat: 1.0,
  clearcoatRoughness: 0.05
});

/** Leather pocket bags: matte, near-black. */
export const LEATHER_MATERIAL: AuraMaterialSpec = material.pbr({
  color: "#151009",
  roughness: 0.85,
  metallic: 0
});

/** Cream aim guide: subtle, no emissive (§7.1 non-light emissive cap 0.1). */
export const AIM_LINE_MATERIAL: AuraMaterialSpec = material.pbr({
  color: "#caa25a",
  roughness: 0.8,
  metallic: 0,
  opacity: 0.55
});

/** Dark wood floor / wall accents. */
export const DARK_WOOD_MATERIAL: AuraMaterialSpec = material.pbr({
  color: "#2a1c12",
  roughness: 0.7,
  metallic: 0
});
