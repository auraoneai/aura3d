/**
 * Gridlock Courier (GU47 WP-28 GC-V3): festoon bulbs strung across the harbour-front streets, one instanced draw.
 *
 * Each string hangs between the two lamps that face each other across an east-west street (`SIDEWALK_MID` either
 * side of the street line), sagging 0.7 m in the middle; the strings nearest the harbour come first, up to
 * `FESTOON.bulbs` bulbs. The bulbs light from sunset with `PhaseRow.festoon` (quantised `setMaterial`, no per-frame
 * matrix writes). Static geometry, no colliders (they hang above the traffic).
 */
import { LAMP_HEAD_Y } from "./lamps";

export const FESTOON = { bulbs: 600, perString: 15, sag: 0.7, size: 0.16, color: "#ffd59a", step: 0.1 } as const;

export interface Bulb { readonly x: number; readonly y: number; readonly z: number }

/**
 * Bulb positions from the lamp placements: pairs of lamps with the same x on opposite sides of an east-west street
 * (z apart by `2 * sidewalk`), harbour side (largest z) first.
 */
export function festoonBulbs(lamps: readonly { x: number; z: number; yaw: number }[], sidewalk: number, max: number = FESTOON.bulbs): Bulb[] {
  // east-west street lamps face along z (yaw 0 or pi); key them by (x, street line)
  const south = new Map<string, { x: number; z: number }>();
  for (const l of lamps) {
    if (Math.abs(Math.sin(l.yaw)) > 0.5) continue;
    if (l.yaw === 0) south.set(`${l.x.toFixed(2)}|${(l.z + sidewalk).toFixed(2)}`, l);
  }
  const pairs: { a: { x: number; z: number }; b: { x: number; z: number } }[] = [];
  for (const l of lamps) {
    if (Math.abs(Math.sin(l.yaw)) > 0.5 || l.yaw === 0) continue;
    const a = south.get(`${l.x.toFixed(2)}|${(l.z - sidewalk).toFixed(2)}`);
    if (a) pairs.push({ a, b: l });
  }
  pairs.sort((p, q) => q.b.z - p.b.z || p.a.x - q.a.x);
  const out: Bulb[] = [];
  const n = FESTOON.perString;
  for (const { a, b } of pairs) {
    if (out.length + n > max) break;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const sag = FESTOON.sag * 4 * t * (1 - t);
      out.push({ x: a.x + (b.x - a.x) * t, y: LAMP_HEAD_Y + 0.2 - sag, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

/** Quantised bulb emissive for a festoon strength 0..1 (0.25 dim glass by day, up to 2.6 lit). */
export function festoonIntensity(strength: number): number {
  const s = Math.max(0, Math.min(1, strength));
  return Math.round((0.25 + 2.35 * s) / FESTOON.step) * FESTOON.step;
}
