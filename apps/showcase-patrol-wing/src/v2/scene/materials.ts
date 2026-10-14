// apps/showcase-patrol-wing/src/v2/scene/materials.ts — §6.9.11 palette.
// Evening coastal patrol: sunset over the ocean — warm golden-hour key
// (#ffd0a0 family on a 3200K direction), teal dusk ocean/rock bases,
// reserved objective cyan/orange ONLY for rings/objective markers, no fill
// lights anywhere (the HDRI floor carries ambient).
import { material } from "@aura3d/engine";

/** Dusk-patrol sky backing: deep teal-navy so the warm key keeps the read. */
export const SKY_BG = "#101d2c";

export const ISLAND_TURF = material.pbr({
  name: "island turf",
  color: "#557a4d",
  roughness: 0.9,
  metallic: 0.01,
  emissive: "#1e4231",
  emissiveIntensity: 0.04
});
export const CLIFF_STRATA = material.pbr({
  name: "island coastal strata",
  color: "#39504b",
  roughness: 0.96,
  metallic: 0,
  emissive: "#142629",
  emissiveIntensity: 0.03
});
export const OCEAN = material.pbr({
  name: "ocean water",
  color: "#22566a",
  roughness: 0.2,
  metallic: 0.28,
  emissive: "#173d4d",
  emissiveIntensity: 0.12
});
/** Opaque lane glints — translucent emissive composites near-black (aurora lesson). */
export const OCEAN_LANE = material.emissive({
  name: "ocean lane glint",
  color: "#3d6a72",
  emissive: "#4d8b95",
  emissiveIntensity: 0.34,
  roughness: 0.4
});
export const CLOUD_BANK = material.pbr({
  name: "coastal cloud bank",
  color: "#dce5e4",
  roughness: 0.82,
  metallic: 0,
  emissive: "#4a5f6e",
  emissiveIntensity: 0.1
});
export const SUN_DISC = material.emissive({
  name: "setting sun disc",
  color: "#fb923c",
  emissive: "#fde047",
  emissiveIntensity: 1.9,
  roughness: 0.1
});
export const PAD_SLAB = material.pbr({
  name: "pad slab",
  color: "#5a5f66",
  roughness: 0.8
});
export const PAD_PILING = material.pbr({
  name: "pad piling",
  color: "#3a3f46",
  roughness: 0.85
});
export const RUNWAY_DECK = material.pbr({
  name: "runway basalt deck",
  color: "#293a49",
  roughness: 0.72,
  metallic: 0.28,
  emissive: "#0e1e2c",
  emissiveIntensity: 0.12
});
export const RUNWAY_UNDER = material.pbr({
  name: "runway understructure",
  color: "#172938",
  roughness: 0.86,
  metallic: 0.18
});
export const RUNWAY_EDGE = material.emissive({
  name: "runway edge guidance",
  color: "#28545e",
  emissive: "#25d2e7",
  emissiveIntensity: 0.72,
  roughness: 0.4
});
export const RUNWAY_STRIPE = material.emissive({
  name: "runway centreline",
  color: "#4a3a20",
  emissive: "#ff9f43",
  emissiveIntensity: 0.58,
  roughness: 0.4
});
export const PAD_RING = material.emissive({
  name: "pad ring glow",
  color: "#0e3f3a",
  emissive: "#7ef8ff",
  emissiveIntensity: 1.4,
  roughness: 0.3
});
export const TERRACE_LIP = material.pbr({
  name: "basalt terrace lips",
  color: "#344b50",
  roughness: 0.9,
  metallic: 0.12,
  emissive: "#102a30",
  emissiveIntensity: 0.08
});
export const TERRACE_EDGE = material.emissive({
  name: "terrace edge glint",
  color: "#39706f",
  emissive: "#2da6ab",
  emissiveIntensity: 0.42,
  roughness: 0.4
});
export const TOWER_STEEL = material.pbr({
  name: "tower steel",
  color: "#334155",
  roughness: 0.5,
  metallic: 0.8
});
export const TOWER_PLATFORM = material.pbr({
  name: "platform steel",
  color: "#64748b",
  roughness: 0.6,
  metallic: 0.7
});
export const PEAK_BEACON = material.emissive({
  name: "peak red beacon",
  color: "#7f1d1d",
  emissive: "#ef4444",
  emissiveIntensity: 1.6,
  roughness: 0.2
});
export const RUNWAY_POST = material.pbr({
  name: "runway post",
  color: "#1e293b",
  roughness: 0.7,
  metallic: 0.5
});
export const RUNWAY_LIGHT_GREEN = material.emissive({
  name: "runway light green",
  color: "#064e3b",
  emissive: "#10b981",
  emissiveIntensity: 1.3,
  roughness: 0.2
});
export const RUNWAY_LIGHT_AMBER = material.emissive({
  name: "runway light amber",
  color: "#78350f",
  emissive: "#f59e0b",
  emissiveIntensity: 1.3,
  roughness: 0.2
});
/** Ring glow: objective-reserved warm amber (accent #ffb454 family). */
export const RING_ACTIVE = material.emissive({
  name: "ring active glow",
  color: "#20323a",
  emissive: "#ffb14d",
  emissiveIntensity: 1.7,
  roughness: 0.35
});
export const RING_PASSED = material.emissive({
  name: "ring passed glow",
  color: "#12312a",
  emissive: "#39d7a8",
  emissiveIntensity: 1.4,
  roughness: 0.35
});
export const RING_QUEUED = material.emissive({
  name: "ring queued glow",
  color: "#1c2830",
  emissive: "#5c7a86",
  emissiveIntensity: 0.55,
  roughness: 0.35
});
/** Broad next-gate shaft: stays legible at island distance (RING_ACTIVE_COLOR). */
export const NEXT_RING_BEACON = material.emissive({
  name: "next-ring beacon glow",
  color: "#3a2a12",
  emissive: "#ffb14d",
  emissiveIntensity: 2.2,
  roughness: 0.4
});
export const MUZZLE_FLASH = material.emissive({
  name: "combat muzzle flash",
  color: "#ffd166",
  emissive: "#ff9f1c",
  emissiveIntensity: 3.4,
  roughness: 0.2
});
export const CANNON_TRACER = material.emissive({
  name: "combat cannon tracer",
  color: "#ffd166",
  emissive: "#ff9f1c",
  emissiveIntensity: 3.8,
  roughness: 0.2
});
export const ORB_GLOW = material.emissive({
  name: "drone orb glow",
  color: "#7a2d3d",
  emissive: "#ff5c7a",
  emissiveIntensity: 2.6,
  roughness: 0.2
});
export const ORB_TRAIL = material.emissive({
  name: "orb trail streak",
  color: "#4d2530",
  emissive: "#c9496a",
  emissiveIntensity: 1.5,
  roughness: 0.3
});
export const CONTRAIL = material.emissive({
  name: "wingtip contrail",
  color: "#5d6d76",
  emissive: "#a9c9d4",
  emissiveIntensity: 0.9,
  roughness: 0.5
});
export const ENGINE_GLOW = material.emissive({
  name: "engine heat glow",
  color: "#5c3a1e",
  emissive: "#ff9f43",
  emissiveIntensity: 1.1,
  roughness: 0.3
});
export const IMPACT_FLASH = material.emissive({
  name: "combat impact flash",
  color: "#ffcb69",
  emissive: "#ff9f1c",
  emissiveIntensity: 2.4,
  roughness: 0.2
});
export const GHOST_SHELL = material.pbr({
  name: "ghost shell",
  color: "#9fd8ff",
  roughness: 0.4,
  metallic: 0.1,
  emissive: "#35607a",
  emissiveIntensity: 0.5,
  opacity: 0.32
});
export const DRONE_TARGET_LOCK = material.emissive({
  name: "drone target lock",
  color: "#2d1a12",
  emissive: "#ffb14d",
  emissiveIntensity: 1.6,
  roughness: 0.3
});
