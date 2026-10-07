// apps/showcase-deep-recovery/src/v2/scene/materials.ts — §6.9.14 palette.
// Turquoise shallows → dark wreck basin. Emissive materials stay OPAQUE:
// translucent emissive composites near-black on the water backdrop (same
// rule the aurora-lander aurora rays hit). Objective cyan #59d7ff is
// reserved for sonar markers + the buoy service ring per the direction.
import { material } from "@aura3d/engine";

export const WATER_BG = "#04141c";

export const BASIN_FLOOR = material.pbr({
  name: "abyssal sediment floor",
  color: "#0b1c22",
  roughness: 0.96,
  metallic: 0.02
});
export const MID_TERRACE = material.pbr({
  name: "mid trench terrace sediment",
  color: "#0f2c34",
  roughness: 0.94,
  metallic: 0.02
});
export const SHALLOW_SHELF = material.pbr({
  name: "shallow reef shelf sand",
  color: "#16454a",
  roughness: 0.9,
  metallic: 0.02
});
export const BAND_SHALLOW = material.emissive({
  name: "turquoise shallows water column band",
  color: "#0f6b74",
  emissive: "#0f6b74",
  emissiveIntensity: 0.22
});
export const BAND_TRENCH = material.emissive({
  name: "mid trench water column band",
  color: "#0a3542",
  emissive: "#0a3542",
  emissiveIntensity: 0.18
});
export const BAND_ABYSS = material.emissive({
  name: "abyssal water column band",
  color: "#03171f",
  emissive: "#03171f",
  emissiveIntensity: 0.3
});
export const SUB_HULL = material.pbr({
  name: "deep recovery sub teal hull",
  color: "#2ab0c0",
  emissive: "#1596a8",
  emissiveIntensity: 0.55,
  roughness: 0.3,
  metallic: 0.46,
  clearcoat: 0.2,
  clearcoatRoughness: 0.2
});
export const LAMP_VOLUME = material.emissive({
  name: "sub lamp water volume",
  color: "#713f12",
  emissive: "#fde68a",
  emissiveIntensity: 0.9
});
export const LAMP_BEAM = material.emissive({
  name: "warm searchlight beam wedge",
  color: "#78350f",
  emissive: "#fde68a",
  emissiveIntensity: 0.75
});
export const BREACH_BEACON = material.emissive({
  name: "breach warning beacon",
  color: "#7f1d1d",
  emissive: "#ef4444",
  emissiveIntensity: 2.4
});
export const GRAPPLE_LINE = material.emissive({
  name: "grapple tether cable",
  color: "#f59e0b",
  emissive: "#fbbf24",
  emissiveIntensity: 1.4
});
export const SONAR_MARKER = material.emissive({
  name: "sonar contact ring",
  color: "#075985",
  emissive: "#59d7ff",
  emissiveIntensity: 2.1
});
export const SONAR_PULSE = material.emissive({
  name: "sonar pulse wave",
  color: "#0c4a6e",
  emissive: "#38bdf8",
  emissiveIntensity: 1.5
});
export const SILT_MOTE = (index: number) => material.emissive({
  name: `bioluminescent silt ${index}`,
  color: index % 3 === 0 ? "#064e3b" : "#083344",
  emissive: index % 3 === 0 ? "#34d399" : "#22d3ee",
  emissiveIntensity: 0.9
});
export const MARINE_SNOW = material.emissive({
  name: "marine snow particle",
  color: "#274857",
  emissive: "#9fd8e8",
  emissiveIntensity: 0.35
});
export const BUOY_BEACON = material.emissive({
  name: "recovery buoy beacon",
  color: "#713f12",
  emissive: "#ffb454",
  emissiveIntensity: 2.0
});
export const BUOY_SERVICE_RING = material.emissive({
  name: "buoy service zone ring",
  color: "#075985",
  emissive: "#59d7ff",
  emissiveIntensity: 1.3
});
export const VENT_GLOW = material.emissive({
  name: "hydrothermal vent glow",
  color: "#064e3b",
  emissive: "#4fd8c8",
  emissiveIntensity: 1.2
});
export const VENT_ROCK = material.pbr({
  name: "hydrothermal chimney rock",
  color: "#101d24",
  roughness: 0.85,
  metallic: 0.15
});
export const CRYSTAL = material.emissive({
  name: "abyssal crystal cluster",
  color: "#134e4a",
  emissive: "#4fd8c8",
  emissiveIntensity: 1.6
});
export const CORAL_FAN = material.emissive({
  name: "shallow coral fan",
  color: "#155e63",
  emissive: "#38c8b4",
  emissiveIntensity: 0.5
});
export const REEF_SPIRE = material.pbr({
  name: "reef spire stone",
  color: "#12404a",
  roughness: 0.9,
  metallic: 0.05
});
export const SPAWN_RETURN_RING = material.emissive({
  name: "crate sonar reveal ring",
  color: "#7c2d12",
  emissive: "#fb923c",
  emissiveIntensity: 1.4
});
