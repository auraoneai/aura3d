/**
 * Idol grounding (render layer only): every static Idol model that stands on the terrain (roadside trees, pines and
 * shoulder rocks, the hermit cottage, the shrine-gate pillars) is seated on the LOWEST terrain under its footprint and
 * sunk 0.15-0.2 m, so no side of its base floats over a slope. The procedural scatter sampled the ground only at the
 * centre (and the cottage / gate stood at road level), which left the Idol models' wider bases hanging over falling
 * ground. Footprints are the GLBs' base-slice radii (measured on the normalised models, scaled per placement); the
 * terrain is `groundHeight` along the course frame, the same surface `buildGround` lofts.
 */
import type { Chapter } from "../chapter";
import { at, frameAt, type V3 } from "../course";
import { CORRIDOR_HALF, REACH_HEIGHT, ROAD_HALF, groundHeight } from "../terrain";

/** Base-slice radius of each Idol model (model units; trees and rocks are unit models scaled per instance). */
export const IDOL_FOOTPRINT = { round: 0.122, pine: 0.289, rock: 0.51, cottage: 3.33, pillar: 1.68 } as const;
/** How far each model is pushed into the lowest footprint point. */
export const IDOL_SINK = { tree: 0.15, rock: 0.2, building: 0.15 } as const;
/** Along-course jitter the scatter adds to tree positions (the footprint is widened by it). */
const JITTER = 0.45;

/** World points of the terrain under a footprint: centre plus 8 rim points (course s / lateral offsets). */
export function footprintPoints(ch: Chapter, s: number, lat: number, radius: number): V3[] {
  const out: V3[] = [at(s, lat, groundHeight(ch, s, lat))];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, ds = Math.cos(a) * radius, dl = Math.sin(a) * radius;
    out.push(at(s + ds, lat + dl, groundHeight(ch, s + ds, lat + dl)));
  }
  return out;
}
export const footprintFloor = (ch: Chapter, s: number, lat: number, radius: number): number =>
  Math.min(...footprintPoints(ch, s, lat, radius).map((p) => p[1]));

/** A scatter placement (terrain.ts `Placement`); `s` / `lat` locate its foot on the course. */
export interface ScatterPlacement { readonly pos: V3; readonly scale: number; readonly yaw: number; readonly pitch?: number; readonly roll?: number; readonly s?: number; readonly lat?: number }

/** Course distance of a placement's actual position (the scatter jitters trees up to 0.45 m along the course). */
export function placementS(p: ScatterPlacement): number {
  const s0 = p.s ?? 0, lat = p.lat ?? 0;
  let best = s0, bd = Infinity;
  for (let k = -24; k <= 24; k++) {
    const sk = s0 + (k / 24) * JITTER, q = at(sk, lat, 0), d = Math.hypot(q[0] - p.pos[0], q[2] - p.pos[2]);
    if (d < bd) { bd = d; best = sk; }
  }
  return best;
}

/**
 * Widest radius of each roadside Idol model per tenth of its height (per metre of instance scale), measured on the
 * admitted GLBs (assets/idol/cdCanopyTree / cdBonsaiPine / cdShoulderRock POSITION accessors after their root scale).
 * The canopy and pine crowns spread ~4.5x wider than their trunk footprint.
 */
export const IDOL_BANDS = {
  round: [0.11, 0.08, 0.25, 0.47, 0.56, 0.53, 0.5, 0.51, 0.43, 0.34],
  pine: [0.29, 0.27, 0.21, 0.52, 0.49, 0.48, 0.56, 0.52, 0.51, 0.39],
  rock: [0.51, 0.51, 0.54, 0.54, 0.49, 0.48, 0.49, 0.49, 0.46, 0.34]
} as const;

/**
 * Pass-through audit: whether a roadside model (base world Y `baseY`, `scale` m tall) at course `s`, lateral `lat` keeps
 * every height band that the kid can reach (terrain.ts CORRIDOR_HALF / REACH_HEIGHT above the road) out of the corridor.
 * The scatter's crowns used to overhang the lanes at 2.6-6.5 m, where every jump and Glider ride flew through the leaves.
 */
export function clearOfCorridor(kind: keyof typeof IDOL_BANDS, s: number, lat: number, baseY: number, scale: number): boolean {
  const roadY = frameAt(s).point[1];
  return IDOL_BANDS[kind].every((r, q) => {
    const h0 = baseY - roadY + (scale * q) / 10, h1 = h0 + scale / 10;
    return h1 < 0.08 || h0 > REACH_HEIGHT || Math.abs(lat) - r * scale >= CORRIDOR_HALF;
  });
}

/** Most the ground may fall away under one footprint (m): more means the model hangs over a wall edge or cliff. */
export const MAX_FOOTPRINT_DROP = 1.0;
const NUDGES: readonly (readonly [number, number])[] = [
  [0, 0], ...[1, 2, 3, 4, 6].flatMap((d) => [[0, d], [0, -d], [d, 0], [-d, 0], [d, d], [-d, -d], [d, -d], [-d, d]] as [number, number][]),
  // crowns that overhang the lanes step further out from the road
  ...[8, 10, 12].flatMap((d) => [[0, d], [2, d], [-2, d], [4, d], [-4, d]] as [number, number][])
];

/**
 * Roadside placements with their base on the lowest terrain under the scaled footprint (minus the sink). A footprint
 * that spans a wall edge (ground falling more than MAX_FOOTPRINT_DROP across it) is nudged to the nearest spot within
 * 6 m (course / lateral) where it fits, never onto the road, and a crown that would overhang the runner corridor steps up
 * to 12 m further out; with no such spot the model is left out.
 */
export function groundRoadside(ch: Chapter, list: readonly ScatterPlacement[], kind: "round" | "pine" | "rock"): ScatterPlacement[] {
  const sink = kind === "rock" ? IDOL_SINK.rock : IDOL_SINK.tree;
  const out: ScatterPlacement[] = [];
  for (const p of list) {
    if (p.s === undefined || p.lat === undefined) { out.push(p); continue; }
    const r = IDOL_FOOTPRINT[kind] * p.scale, s0 = placementS(p), side = p.lat >= 0 ? 1 : -1;
    for (const [ds, dl] of NUDGES) {
      const s = s0 + ds, lat = p.lat + side * dl;
      if (Math.abs(lat) - ROAD_HALF < r + 0.4) continue;
      const ys = footprintPoints(ch, s, lat, r).map((q) => q[1]);
      const floor = Math.min(...ys);
      if (Math.max(...ys) - floor > MAX_FOOTPRINT_DROP) continue;
      if (!clearOfCorridor(kind, s, lat, floor - sink, p.scale)) continue;
      // always stand exactly on the course point the footprint was sampled at (re-deriving it from the jittered scatter
      // position far off the road could land up to 0.45 m away, over a different, lower patch of ground)
      const xz = at(s, lat, 0);
      out.push({ ...p, s, lat, pos: [xz[0], floor - sink, xz[2]] as V3 });
      break;
    }
  }
  return out;
}

/** Hermit cottage: base Y for the cottage at course `s`, lateral `lat`. */
export const groundCottageY = (ch: Chapter, s: number, lat: number): number => footprintFloor(ch, s, lat, IDOL_FOOTPRINT.cottage) - IDOL_SINK.building;

/** Shrine-gate pillars at lateral +/-`pillarX`: each pillar's base Y (index 0 stands at +pillarX, i.e. local -X). */
export function groundPillarsY(ch: Chapter, s: number, pillarX: number): [number, number] {
  return [footprintFloor(ch, s, pillarX, IDOL_FOOTPRINT.pillar) - IDOL_SINK.building, footprintFloor(ch, s, -pillarX, IDOL_FOOTPRINT.pillar) - IDOL_SINK.building];
}
