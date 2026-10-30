/**
 * GU47 DG-W1: seeded dressing scatter for the inked look (presentation only; the sim never sees it).
 *
 * Column drums and broken ruins along the chapter's ring route, on both sides, 45-150 m off the route line, never within
 * 40 m of a ring and never inside a wall footprint. Deterministic per chapter (mulberry32 seeded by the chapter), so the
 * same chapter always dresses the same way. Two instanced nodes (+2 draws) from assets the game already owns; WP-36's
 * reeds, pots, cloth lines, scrub and bones (5 props) drop into `DRESSING_KINDS` later.
 */
import { CHAPTERS } from "./chapters-data";
import type { Terrain, Wall } from "./terrain";

export const DRESSING_RING_CLEARANCE = 40;
export const DRESSING_ROUTE_OFFSET: readonly [number, number] = [45, 150];

export type DressingKind = "drum" | "ruin";
export interface DressingPlacement { readonly kind: DressingKind; readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly scale: number }

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded dressing for a chapter: about `perSegment` pieces per route segment, at most `max`. */
export function dressingFor(chapter: number, terrain: Pick<Terrain, "heightAt">, walls: readonly Wall[], max = 96, perSegment = 4): DressingPlacement[] {
  const rng = mulberry32(0x5117 + chapter * 7919);
  const rings = CHAPTERS[chapter]!.objectives.flatMap((o) => o.points);
  const out: DressingPlacement[] = [];
  const insideWall = (x: number, z: number): boolean => walls.some((w) => Math.abs(x - w.x) < w.halfX + 4 && Math.abs(z - w.z) < w.halfZ + 4);
  const nearRing = (x: number, z: number): boolean => rings.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < DRESSING_RING_CLEARANCE ** 2);
  for (let i = 0; i + 1 < rings.length && out.length < max; i++) {
    const a = rings[i]!, b = rings[i + 1]!;
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (len < 1) continue;
    const nx = -dz / len, nz = dx / len;
    for (let k = 0; k < perSegment && out.length < max; k++) {
      const t = rng(), side = rng() < 0.5 ? -1 : 1;
      const off = DRESSING_ROUTE_OFFSET[0] + rng() * (DRESSING_ROUTE_OFFSET[1] - DRESSING_ROUTE_OFFSET[0]);
      const x = a.x + dx * t + nx * off * side, z = a.z + dz * t + nz * off * side;
      if (nearRing(x, z) || insideWall(x, z)) continue;
      const kind: DressingKind = rng() < 0.55 ? "drum" : "ruin";
      out.push({ kind, x, y: Math.max(0, terrain.heightAt(x, z)), z, yaw: rng() * Math.PI * 2, scale: kind === "drum" ? 3 + rng() * 4 : 5 + rng() * 9 });
    }
  }
  return out;
}
