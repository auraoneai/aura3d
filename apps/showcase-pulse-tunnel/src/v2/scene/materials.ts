// apps/showcase-pulse-tunnel/src/v2/scene/materials.ts — §6.9.9 palette.
// Direction primary: deep violet/inky tunnel; accent #ff4fd8 reserved for
// collisions/beat; reservedObjective #3ff2ff for lane guides + shield.
import { material } from "@aura3d/engine";

export const TUNNEL_BG = "#0a0714";

export const LANE_GUIDE = material.emissive({
  color: "#3ff2ff", emissive: "#3ff2ff", emissiveIntensity: 0.55, opacity: 0.5
});

// §14.4 conveyor hoops — the alternating cyan/magenta of the prefab's
// filtered tube rings, one emissive material per instanced tone pool.
export const CONVEYOR_CYAN = material.emissive({
  color: "#38bdf8", emissive: "#38bdf8", emissiveIntensity: 0.95
});
export const CONVEYOR_MAGENTA = material.emissive({
  color: "#ff5bd7", emissive: "#ff5bd7", emissiveIntensity: 0.9
});

export const GATE_WALL = material.emissive({
  color: "#ff4fd8", emissive: "#ff4fd8", emissiveIntensity: 1.15
});
export const GATE_LOW = material.emissive({
  color: "#ffb454", emissive: "#ff9a3d", emissiveIntensity: 1.05
});
export const GATE_HIGH = material.emissive({
  color: "#8b5cf6", emissive: "#a78bfa", emissiveIntensity: 1.05
});
export const GATE_PYLON = material.emissive({
  color: "#22d3ee", emissive: "#67e8f9", emissiveIntensity: 1.1
});
export const GATE_MATERIALS = {
  wall: GATE_WALL, low: GATE_LOW, high: GATE_HIGH, pylon: GATE_PYLON
} as const;

export const CRAFT_ACCENT = material.emissive({
  color: "#3ff2ff", emissive: "#3ff2ff", emissiveIntensity: 1.3
});
export const SHIELD_PLANE = material.emissive({
  color: "#3ff2ff", emissive: "#67e8f9", emissiveIntensity: 0.8, opacity: 0.55
});
export const GRAZE_FLASH = material.emissive({
  color: "#ffd166", emissive: "#ffd166", emissiveIntensity: 1.4
});
export const BEAT_RING = material.emissive({
  color: "#ff4fd8", emissive: "#ff4fd8", emissiveIntensity: 0.9, opacity: 0.6
});
export const HULL_DARK = material.pbr({
  color: "#190f33", roughness: 0.45, metallic: 0.55
});
