/**
 * GU47 wave 2 (NR-12/NR-13) evening set-pieces: a shrine gate in a forest clearing, a water wheel on the river bank at the
 * crossing and a pagoda over the rooftop run's lower town. Pure and deterministic; presentation only (no sim, collision or
 * input reads these). Placements are in the `ModelPlacement` form `world.ts` already instances. The GLB origins are the
 * model centres, so each position lifts the centre by half the scaled height from the wanted base.
 */
import { groundFrame, pathWidth } from "./course";
import { surfaceY } from "./meshes";
import type { ModelPlacement } from "./scenery";

export type SetPieceId = "shrineGate" | "waterWheel" | "pagoda";
/** Optimized model bounds (width, height, depth) and the height of the origin above the base (-min y), in model units. */
export const SET_PIECE_BOUNDS: Readonly<Record<SetPieceId, { readonly size: readonly [number, number, number]; readonly lift: number }>> = {
  shrineGate: { size: [1.896, 1.37, 0.452], lift: 0.686 },
  waterWheel: { size: [1.671, 1.89, 1.87], lift: 0.951 },
  pagoda: { size: [1.065, 1.903, 1.207], lift: 0.952 }
};
/** Wanted world height (m) of each piece. */
export const SET_PIECE_HEIGHT: Readonly<Record<SetPieceId, number>> = { shrineGate: 8.8, waterWheel: 8, pagoda: 36 };

const TOWN_FLOOR_Y = 3.2;
const at = (d: number, lat: number) => { const f = groundFrame(d, lat); return { x: f.x, y: surfaceY(d, lat), z: f.z, yaw: Math.atan2(f.dx, f.dz) }; };
const place = (id: SetPieceId, x: number, baseY: number, z: number, yaw: number): ModelPlacement => {
  const k = SET_PIECE_HEIGHT[id] / SET_PIECE_BOUNDS[id].size[1];
  return { position: [x, baseY + SET_PIECE_BOUNDS[id].lift * k, z], yaw, scale: [k, k, k] };
};

/** Centre of the forest clearing the shrine gate stands in (horizontal), used to thin the pines around it. */
export const SHRINE_DISTANCE = 1700;
const SHRINE_OUT = 11;
/** Where the shrine gate's centre stands (world x, z). */
export function shrineCentre(): { x: number; z: number } {
  const c = at(SHRINE_DISTANCE, pathWidth(SHRINE_DISTANCE) / 2 + SHRINE_OUT);
  return { x: c.x, z: c.z };
}

export function eveningSetPieces(): Record<SetPieceId, ModelPlacement[]> {
  // Shrine gate: forest clearing, front (+z) turned toward the path (for the +lateral side that is the path heading + 90 degrees).
  const gw = pathWidth(SHRINE_DISTANCE);
  const g = at(SHRINE_DISTANCE, gw / 2 + SHRINE_OUT);
  const gy = Math.min(surfaceY(SHRINE_DISTANCE, gw / 2 + SHRINE_OUT - 5), surfaceY(SHRINE_DISTANCE, gw / 2 + SHRINE_OUT + 5), g.y) - 0.15;

  // Water wheel: on the bank at the river crossing where the verge reaches the water (world y = -2.5), base just under it.
  const wd = 1320, ww = pathWidth(wd);
  let out = 20;
  while (out < 90 && surfaceY(wd, ww / 2 + out) > -1.4) out += 1;
  const w = at(wd, ww / 2 + out);

  // Pagoda: well behind the lower town's second house row (gap 22-36 m plus 12 m depth), on the town floor.
  const pd = 790, pw = pathWidth(pd);
  const p = at(pd, pw / 2 + 66);

  return {
    shrineGate: [place("shrineGate", g.x, gy, g.z, g.yaw + Math.PI / 2)],
    waterWheel: [place("waterWheel", w.x, -2.7, w.z, w.yaw)],
    pagoda: [place("pagoda", p.x, TOWN_FLOOR_Y - 0.4, p.z, p.yaw + Math.PI / 2)]
  };
}
