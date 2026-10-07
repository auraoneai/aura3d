// apps/showcase-blockfall-reactor/src/v2/scene/materials.ts — §6.9.16 palette.
// Arcade-night room: deep navy/violet bases from the direction palette so the
// jewel tetrominoes (reactor-scene's exported pieceMaterials) and the reserved
// objective cyan stay the brightest reads. Plate/accent materials cover the
// catalog cabinet's baked "GAME OVER / RESTART?" marquee without hiding the
// typed body — a thin physical fascia, not a DOM overlay (PRD §6.9.16 assets).
import { material } from "@aura3d/engine";

/** Backing behind the union scene: enclosed room, no sky. */
export const ROOM_BG = "#08070f";

export const LIVE_PLATE = material.pbr({
  name: "v2 live-session marquee plate",
  color: "#071927",
  emissive: "#082c3a",
  emissiveIntensity: 0.42,
  roughness: 0.32,
  metallic: 0.58
});
export const LIVE_PLATE_ACCENT = material.neon({
  name: "v2 live-session marquee accent",
  color: "#48d9e5",
  emissive: "#48d9e5",
  emissiveIntensity: 0.94,
  roughness: 0.18
});
/** Neon trim ring lighting the cabinet fascia from the room's accent band. */
export const TRIM_NEON = material.neon({
  name: "v2 arcade trim ring",
  color: "#ff5ed8",
  emissive: "#ff5ed8",
  emissiveIntensity: 1.05,
  roughness: 0.18
});
