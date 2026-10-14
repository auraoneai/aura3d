// apps/showcase-turbo-drift-circuit/src/v2/scene/materials.ts — T2.2 authored
// material specs (PRD 04 stand-in, direction.standIns[] R-14-14).
// §6.9.2: car paint clearcoat 1.0 + flake normal; tyre rubber; asphalt
// roughness 0.6–0.85; tinted glass. Emissive stays ≤ 0.1 on non-light materials.
import { material } from "@aura3d/engine";
import type { AuraMaterialSpec } from "@aura3d/engine";

/** Golden-hour car paint; clearcoat/flake ride as spec values (R-14-14). */
export const CAR_PAINT_MATERIAL: AuraMaterialSpec = material.physical({
  name: "turbo car paint",
  color: "#c2341f",
  roughness: 0.32,
  metallic: 0.1,
  clearcoat: 1.0,
  clearcoatRoughness: 0.08
});

export const OPPONENT_PAINT_MATERIAL: AuraMaterialSpec = material.physical({
  name: "turbo rival paint",
  color: "#1f4fc2",
  roughness: 0.34,
  metallic: 0.1,
  clearcoat: 1.0,
  clearcoatRoughness: 0.08
});

export const TYRE_MATERIAL: AuraMaterialSpec = material.physical({
  name: "turbo tyre rubber",
  color: "#16171a",
  roughness: 0.94,
  metallic: 0
});

export const ASPHALT_MATERIAL: AuraMaterialSpec = material.physical({
  name: "turbo asphalt",
  color: "#2e2d2b",
  roughness: 0.75,
  metallic: 0
});

/** Grass/dirt outfield under and around the circuit shell. */
export const TERRAIN_MATERIAL: AuraMaterialSpec = material.pbr({
  name: "turbo outfield terrain",
  color: "#4d5738",
  roughness: 0.95,
  metallic: 0
});

/** Distant mountain impostor band (beyond fog; backdrop → castShadow: false). */
export const MOUNTAIN_MATERIAL: AuraMaterialSpec = material.pbr({
  name: "turbo distant mountain",
  color: "#5a4a52",
  roughness: 1,
  metallic: 0
});
