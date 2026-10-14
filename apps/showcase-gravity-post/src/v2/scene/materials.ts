// apps/showcase-gravity-post/src/v2/scene/materials.ts — T2.1 material table.
// Palette is the direction's: deep-space blues + #ffd166 courier accent with
// #59d7ff reserved for the objective (prediction path + dock window). Opaque
// emissive only — translucent emissive composites near-black on the space bg.
import { material } from "@aura3d/engine";

export const SPACE_BG = "#0a1626";

export const SUN_DISC = material.emissive({
  name: "sol disc",
  color: "#ffd9a0",
  emissive: "#fb923c",
  emissiveIntensity: 2.4
});
export const SUN_CORONA = material.emissive({
  name: "sol corona",
  color: "#fb923c",
  emissive: "#f59e0b",
  emissiveIntensity: 0.9
});
export const BODY_RIM = (emissive: string) =>
  material.emissive({
    name: "atmosphere rim " + emissive,
    color: emissive,
    emissive,
    emissiveIntensity: 0.55,
    opacity: 0.32
  });
export const ORBIT_GUIDE = material.emissive({
  name: "hairline orbit guide",
  color: "#274472",
  emissive: "#3d5f9e",
  emissiveIntensity: 0.5
});
export const STATION_PULSE = material.emissive({
  name: "dock window pulse",
  color: "#59d7ff",
  emissive: "#59d7ff",
  emissiveIntensity: 1.1
});
export const PREDICTION_BEAD = material.emissive({
  name: "prediction bead",
  color: "#59d7ff",
  emissive: "#22d3ee",
  emissiveIntensity: 1.0
});
export const ACTUAL_PATH_BEAD = material.emissive({
  name: "flown path bead",
  color: "#e8b04a",
  emissive: "#e8b04a",
  emissiveIntensity: 0.85
});
export const DOCK_SPARK = material.emissive({
  name: "dock spark",
  color: "#ffd166",
  emissive: "#ffd166",
  emissiveIntensity: 1.6
});
export const FLYBY_DRONE = material.emissive({
  name: "flyby drone",
  color: "#c4b5fd",
  emissive: "#8b5cf6",
  emissiveIntensity: 1.0
});
export const THRUST_CONE = material.emissive({
  name: "pod thrust cone",
  color: "#67e8f9",
  emissive: "#22d3ee",
  emissiveIntensity: 1.3
});
export const TRAIL_STREAK = material.emissive({
  name: "courier trail streak",
  color: "#93c5fd",
  emissive: "#60a5fa",
  emissiveIntensity: 0.7
});
export const DUST_CYAN = material.emissive({
  name: "orbital dust cyan",
  color: "#67e8f9",
  emissive: "#22d3ee",
  emissiveIntensity: 0.72
});
export const DUST_VIOLET = material.emissive({
  name: "orbital dust violet",
  color: "#c4b5fd",
  emissive: "#8b5cf6",
  emissiveIntensity: 0.62
});
export const DUST_AMBER = material.emissive({
  name: "orbital dust amber",
  color: "#fde68a",
  emissive: "#f59e0b",
  emissiveIntensity: 0.64
});
export const STAR_POINT = material.emissive({
  name: "far star shell point",
  color: "#cfe4ff",
  emissive: "#dbeafe",
  emissiveIntensity: 0.9
});
export const RUNWAY_PANEL = material.pbr({
  name: "freightway runway panel",
  color: "#16233f",
  roughness: 0.82,
  metallic: 0.12
});
export const RUNWAY_LAMP = material.emissive({
  name: "freightway lamp",
  color: "#ffd166",
  emissive: "#ffd166",
  emissiveIntensity: 1.2
});
export const HAZARD_STRIPE = material.emissive({
  name: "hazard zone marker",
  color: "#e11d48",
  emissive: "#e11d48",
  emissiveIntensity: 0.6
});
