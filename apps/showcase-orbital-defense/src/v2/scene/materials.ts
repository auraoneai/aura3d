// apps/showcase-orbital-defense/src/v2/scene/materials.ts — authored materials (T2.2).
// §6.9.4: planet day/night terminator + atmosphere rim are PRD 04
// material.planet stand-ins (direction.standIns[] R-14-14) — the day side is
// a deep ocean pbr, the atmosphere a thin additive-leaning rim shell, night
// side reads dark under the single sun key. The opaque 1.13× emissive shell
// that hid the planet is deleted (never recreated).
import { material, type AuraMaterialSpec } from "@aura3d/engine";

export const PLANET_DAY_MATERIAL: AuraMaterialSpec = material.physical({
  color: "#16365e",
  roughness: 0.62,
  metallic: 0.05,
  clearcoat: 0.35,
  clearcoatRoughness: 0.4,
  envMapIntensity: 1.1
});

export const ATMOSPHERE_MATERIAL: AuraMaterialSpec = material.emissive({
  color: "#0d1b2e",
  emissive: "#7cf4ff",
  emissiveIntensity: 0.85,
  opacity: 0.16,
  roughness: 0.4
});

export const NIGHT_LIGHTS_MATERIAL: AuraMaterialSpec = material.emissive({
  color: "#1a1206",
  emissive: "#ffc46b",
  emissiveIntensity: 2.4,
  roughness: 0.8
});

export const STATION_MATERIAL: AuraMaterialSpec = material.pbr({
  color: "#9aa8b8",
  roughness: 0.38,
  metallic: 0.85
});

export const STATION_PANEL_MATERIAL: AuraMaterialSpec = material.pbr({
  color: "#16294a",
  roughness: 0.5,
  metallic: 0.4
});

export const DRONE_MATERIAL: AuraMaterialSpec = material.pbr({
  color: "#2a2f38",
  roughness: 0.45,
  metallic: 0.7
});

export const DRONE_HOT_MATERIAL: AuraMaterialSpec = material.emissive({
  color: "#1a0a08",
  emissive: "#ff5a3c",
  emissiveIntensity: 2.0,
  roughness: 0.5
});

export const BOLT_MATERIAL: AuraMaterialSpec = material.emissive({
  color: "#06232b",
  emissive: "#7cf4ff",
  emissiveIntensity: 3.2,
  roughness: 0.3
});

export const SHIELD_MATERIAL: AuraMaterialSpec = material.emissive({
  color: "#06232b",
  emissive: "#7cf4ff",
  emissiveIntensity: 0.7,
  opacity: 0.2,
  roughness: 0.3
});

export const ORBIT_PATH_MATERIAL: AuraMaterialSpec = material.emissive({
  color: "#0a1220",
  emissive: "#3d5a80",
  emissiveIntensity: 0.4,
  opacity: 0.32,
  roughness: 0.6
});

export const ASTEROID_MATERIAL: AuraMaterialSpec = material.pbr({
  color: "#3a3f4a",
  roughness: 0.92,
  metallic: 0.05
});

export const STAR_MATERIAL: AuraMaterialSpec = material.emissive({
  color: "#0b1020",
  emissive: "#dbeafe",
  emissiveIntensity: 1.9,
  roughness: 0.9
});
