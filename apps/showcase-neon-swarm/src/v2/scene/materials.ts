// apps/showcase-neon-swarm/src/v2/scene/materials.ts — shared material specs.
// The neon palette stays jewel-like: cyan for the hero pulse/muzzle line,
// reserved magenta (#ff8ae0) for pickups/doors, gold for the radial burst.
import { material, type AuraMaterialSpec } from "@aura3d/engine";

export const COURIER_ACCENT: AuraMaterialSpec = material.emissive({
  name: "courier visor accent",
  color: "#0b1c24",
  emissive: "#35e6ff",
  emissiveIntensity: 1.4
});

export const PULSE_RAY: AuraMaterialSpec = material.emissive({
  name: "pulse shot ray",
  color: "#0c2830",
  emissive: "#35e6ff",
  emissiveIntensity: 1.9,
  opacity: 0.72
});

export const PULSE_IMPACT: AuraMaterialSpec = material.emissive({
  name: "pulse impact ring",
  color: "#0c2830",
  emissive: "#7de8ff",
  emissiveIntensity: 1.7,
  opacity: 0.78
});

export const MUZZLE_FLASH: AuraMaterialSpec = material.emissive({
  name: "pulse muzzle flash",
  color: "#12303a",
  emissive: "#aef3ff",
  emissiveIntensity: 2.1,
  opacity: 0.85
});

export const BURST_RING: AuraMaterialSpec = material.emissive({
  name: "burst event ring",
  color: "#2c1c08",
  emissive: "#ffc857",
  emissiveIntensity: 1.9,
  opacity: 0.8
});

export const BURST_RADIUS: AuraMaterialSpec = material.emissive({
  name: "burst radius meter",
  color: "#1a1407",
  emissive: "#ffc857",
  emissiveIntensity: 0.55,
  opacity: 0.5
});

export const AIM_VECTOR: AuraMaterialSpec = material.emissive({
  name: "aim vector tick",
  color: "#0c2830",
  emissive: "#35e6ff",
  emissiveIntensity: 0.8,
  opacity: 0.6
});

export const PICKUP_GOLD: AuraMaterialSpec = material.emissive({
  name: "risk pickup gold",
  color: "#2c1c08",
  emissive: "#ffc857",
  emissiveIntensity: 1.6,
  opacity: 0.85
});

export const DOOR_GLOW: AuraMaterialSpec = material.emissive({
  name: "pickup door glow",
  color: "#241028",
  emissive: "#ff8ae0",
  emissiveIntensity: 1.15,
  opacity: 0.7
});

export const PRESSURE_CYAN: AuraMaterialSpec = material.emissive({
  name: "arena pressure rail cyan",
  color: "#143e49",
  emissive: "#35e6ff",
  emissiveIntensity: 0.32
});

export const PRESSURE_MAGENTA: AuraMaterialSpec = material.emissive({
  name: "arena pressure rail magenta",
  color: "#4b183d",
  emissive: "#ff4fd8",
  emissiveIntensity: 0.3
});
