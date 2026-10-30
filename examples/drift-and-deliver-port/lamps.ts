/**
 * Gridlock Courier (GU47 WP-28 GC-L4): the sodium lamp pool. A fixed pool of point lights is moved onto the street
 * lamps nearest the car every `REPICK_SECONDS`; the pool fades in from sunset with the look table's `lamps` value.
 * C-35 caps the scene's practical lights at 6 (`defineArtDirection`), so the pool holds 5 points and the sixth
 * practical is the headlight spot; GC-L4 asked for 16 (see the lane report).
 */
export const SODIUM_POOL = 5;
export const REPICK_SECONDS = 0.5;
/** Lamp head height (the generated lamp is 5.6 m tall, GC-A2 fixes it at 5 m) and the pool light's reach. */
export const LAMP_HEAD_Y = 4.8;
export const SODIUM_RANGE = 16;
/** Sodium point intensity at full strength (`lamps` = 1). */
export const SODIUM_INTENSITY = 9;
export const SODIUM_COLOR = "#ffb347";
/** Headlight spot (GC-L5): low beam ahead of the car, sixth practical. */
export const HEADLIGHT = { color: "#fff1d6", intensity: 14, distance: 42, angleDeg: 32, penumbra: 0.45, ahead: 2.2, y: 0.75 } as const;

export interface LampPoint { readonly x: number; readonly z: number }

/**
 * Indices of the `n` lamps nearest (x, z), nearest first, among lamps within `maxDistance`. Biased ahead of the car
 * (`heading`, forward (sin h, cos h)) so the pools light the road the player drives into. Deterministic: ties keep
 * index order.
 */
export function nearestLamps(lamps: readonly LampPoint[], x: number, z: number, heading: number, n = SODIUM_POOL, maxDistance = 90): number[] {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const scored: { i: number; d: number }[] = [];
  for (let i = 0; i < lamps.length; i++) {
    const l = lamps[i]!;
    const dx = l.x - x;
    const dz = l.z - z;
    const d = Math.hypot(dx, dz);
    if (d > maxDistance) continue;
    const ahead = d > 1e-6 ? (dx * fx + dz * fz) / d : 1;
    scored.push({ i, d: d * (1.25 - 0.45 * ahead) });
  }
  scored.sort((a, b) => a.d - b.d || a.i - b.i);
  return scored.slice(0, n).map((s) => s.i);
}
