/**
 * GU47 WP-21 BZ-07: the F6 set piece. A 3x3-cell hatch is cut out of the silo ceiling over the Iron Warden's arena: the
 * ceiling becomes one instanced draw of four slabs around the opening, an olive steel collar lines the shaft, a dark
 * night backdrop closes it above, and the moon key (lightRig.ts BZ_MOON, the strongest directional) falls through it.
 * The shaft is the engine's volumetric fog (S4 god rays, Medium tier and up) aimed at the hatch, enabled on F6 only.
 * Presentation only: the sim's grid, collision and the Warden are untouched (PRD D8).
 */
import { CELL } from "../maps";
import { BZ_HATCH_CELLS } from "./look";
import { BZ_MOON } from "./lightRig";

type Inst = { position: [number, number, number]; scale: [number, number, number] };

/** Ceiling thickness and centre offset above the wall top (main.ts's sealed ceiling: 0.24 thick at wallH + 0.14). */
export const CEIL_THICK = 0.24;
export const CEIL_LIFT = 0.14;
/** Depth of the steel collar above the ceiling and the backdrop height above the opening. */
export const HATCH_COLLAR = { depth: 2.4, thickness: 0.3, color: "#3f4428" } as const;
export const HATCH_BACKDROP = { color: "#0a1226", emissive: "#14224a", emissiveIntensity: 0.35 } as const;

/** Hatch opening in world metres (x0..x1, z0..z1). */
export function hatchRect(): { x0: number; x1: number; z0: number; z1: number } {
  const { min, max } = BZ_HATCH_CELLS;
  return { x0: min[0] * CELL, x1: (max[0] + 1) * CELL, z0: min[1] * CELL, z1: (max[1] + 1) * CELL };
}

/** The four ceiling slabs around the opening of a `w` x `h` cell floor (one instanced box, unit size). */
export function hatchCeiling(w: number, h: number, wallH: number): Inst[] {
  const W = w * CELL, D = h * CELL, y = wallH + CEIL_LIFT;
  const { x0, x1, z0, z1 } = hatchRect();
  const slab = (ax: number, bx: number, az: number, bz: number): Inst => ({
    position: [(ax + bx) / 2, y, (az + bz) / 2], scale: [bx - ax, CEIL_THICK, bz - az]
  });
  return [slab(0, W, 0, z0), slab(0, W, z1, D), slab(0, x0, z0, z1), slab(x1, W, z0, z1)].filter((s) => s.scale[0] > 0 && s.scale[2] > 0);
}

/** The steel collar: four walls lining the shaft from the ceiling up to the backdrop. */
export function hatchCollar(wallH: number): Inst[] {
  const { x0, x1, z0, z1 } = hatchRect();
  const t = HATCH_COLLAR.thickness, d = HATCH_COLLAR.depth, y = wallH + d / 2;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = x1 - x0 + 2 * t, sz = z1 - z0;
  return [
    { position: [cx, y, z0 - t / 2], scale: [sx, d, t] },
    { position: [cx, y, z1 + t / 2], scale: [sx, d, t] },
    { position: [x0 - t / 2, y, cz], scale: [t, d, sz] },
    { position: [x1 + t / 2, y, cz], scale: [t, d, sz] }
  ];
}

/** The night backdrop slab closing the shaft above the collar. */
export function hatchBackdrop(wallH: number): Inst {
  const { x0, x1, z0, z1 } = hatchRect();
  const m = HATCH_COLLAR.thickness * 2;
  return { position: [(x0 + x1) / 2, wallH + HATCH_COLLAR.depth + 0.1, (z0 + z1) / 2], scale: [x1 - x0 + m * 2, 0.2, z1 - z0 + m * 2] };
}

/**
 * The volumetric shaft (E-C `effects.volumetricFog`) in the moon's colour. No `lightPosition`: that field is a UV anchor
 * for the A5 inscatter pass, and S4 places its light far along the strongest directional, the moon aimed down through
 * the hatch, so the shaft streams from the moon. `godRayDensity` sets the S4 march density; the shaft is static, so
 * reduced motion and reduced flash leave it alone. main.ts disables it off F6 with
 * `post.setEffectEnabled("volumetricFog", false)`.
 */
export function hatchShaftSpec(fogDensity: number) {
  return {
    name: "f5 hatch moon inscatter",
    // with the live-fog runtime bound the forward fog reads app.atmosphere, not this node; phase 2 checks F1-F5 haze hue
    color: BZ_MOON.color, density: fogDensity,
    intensity: 0.6, godRayDensity: 0.55
  };
}

/** Floors whose S4 shaft is on (slot 5, floor 6 only). */
export const shaftOnSlot = (slot: number): boolean => slot === 5;
